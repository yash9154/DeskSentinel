// ============================================================================
// DeskSentinel — Web Dashboard Server
// ============================================================================
// Express server providing API endpoints for the dashboard UI.
// Serves the static dashboard and exposes scan/cleanup/config endpoints.
// ============================================================================

import * as fs from "fs";
import * as path from "path";
import * as http from "http";

import {
    Logger,
    DeskSentinelConfig,
    CleanupResult,
    loadConfig,
    expandHome,
} from "./utils.js";
import { scanAllFolders } from "./scanner.js";
import { summarizeFiles } from "./summarizer.js";
import { organizeFiles } from "./organizer.js";
import { renameFiles } from "./renamer.js";
import { findDuplicates, moveDuplicates } from "./duplicates.js";
import { generateReport } from "./reporter.js";
import { handleCalendar } from "./calendar.js";

const logger = new Logger("Dashboard");
const PORT = 3847;

console.log("Starting DeskSentinel Dashboard Server...");
process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
    process.exit(1);
});
process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    process.exit(1);
});

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentConfig: DeskSentinelConfig = loadConfig();
let lastResult: CleanupResult | null = null;
let isRunning = false;
let runProgress: { step: string; percent: number } = { step: "idle", percent: 0 };

// ---------------------------------------------------------------------------
// Run Cleanup (reusable from both CLI and dashboard)
// ---------------------------------------------------------------------------

async function runCleanup(dryRun: boolean): Promise<CleanupResult> {
    isRunning = true;
    runProgress = { step: "Initializing...", percent: 0 };

    const result: CleanupResult = {
        scannedCount: 0,
        movedCount: 0,
        renamedCount: 0,
        duplicatesFound: 0,
        errorsCount: 0,
        changes: [],
        duplicateGroups: [],
        errors: [],
        startTime: new Date(),
        targetFolders: currentConfig.targetFolders.map(expandHome),
        dryRun,
    };

    try {
        // Step 1: Scan
        runProgress = { step: "Scanning folders...", percent: 10 };
        const files = await scanAllFolders(currentConfig.targetFolders, result.errors);
        result.scannedCount = files.length;

        if (files.length === 0) {
            result.endTime = new Date();
            isRunning = false;
            runProgress = { step: "No files found", percent: 100 };
            lastResult = result;
            return result;
        }

        // Step 2: Summarize
        runProgress = { step: "AI Summarizing files...", percent: 25 };
        const summaries = await summarizeFiles(files, currentConfig, result.errors);

        // Step 3: Duplicates
        runProgress = { step: "Detecting duplicates...", percent: 50 };
        const duplicateGroups = await findDuplicates(files, result.errors);
        result.duplicateGroups = duplicateGroups;
        result.duplicatesFound = duplicateGroups.reduce((sum, g) => sum + g.duplicates.length, 0);

        const duplicatePaths = new Set<string>();
        for (const group of duplicateGroups) {
            for (const dupe of group.duplicates) {
                duplicatePaths.add(dupe.path);
            }
        }
        const filesToOrganize = files.filter((f) => !duplicatePaths.has(f.path));

        // Step 4: Rename
        runProgress = { step: "Renaming files...", percent: 65 };
        const renameChanges = await renameFiles(filesToOrganize, summaries, dryRun, result.errors);
        result.changes.push(...renameChanges);
        result.renamedCount = renameChanges.filter((c) => c.action === "renamed").length;

        // Step 5: Organize
        runProgress = { step: "Organizing files...", percent: 75 };
        const basePath = expandHome(currentConfig.targetFolders[0]);
        const organizeChanges = await organizeFiles(filesToOrganize, summaries, basePath, dryRun, result.errors);
        result.changes.push(...organizeChanges);
        result.movedCount = organizeChanges.filter((c) => c.action === "moved" || c.action === "moved+renamed").length;

        // Step 6: Move duplicates
        runProgress = { step: "Moving duplicates...", percent: 85 };
        const dupeChanges = await moveDuplicates(duplicateGroups, basePath, currentConfig.duplicateFolder, dryRun, result.errors);
        result.changes.push(...dupeChanges);

        // Step 7: Report
        runProgress = { step: "Generating report...", percent: 92 };
        result.endTime = new Date();
        result.errorsCount = result.errors.length;
        await generateReport(result, basePath);

        // Step 8: Calendar
        runProgress = { step: "Scheduling reminders...", percent: 97 };
        await handleCalendar(result.duplicatesFound, currentConfig.enableCalendar, dryRun);

        runProgress = { step: "Complete!", percent: 100 };
    } catch (err) {
        result.errors.push(`Fatal: ${err}`);
        result.endTime = new Date();
        result.errorsCount = result.errors.length;
        runProgress = { step: `Error: ${err}`, percent: 100 };
    }

    lastResult = result;
    isRunning = false;
    return result;
}

// ---------------------------------------------------------------------------
// Serve Static Dashboard
// ---------------------------------------------------------------------------

function getMimeType(ext: string): string {
    const types: Record<string, string> = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".json": "application/json",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
    };
    return types[ext] || "text/plain";
}

function serveStatic(res: http.ServerResponse, filePath: string): void {
    if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": getMimeType(ext) });
    fs.createReadStream(filePath).pipe(res);
}

function sendJson(res: http.ServerResponse, data: any, status = 200): void {
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url || "/", `http://localhost:${PORT}`);
    const pathname = parsedUrl.pathname || "/";
    const method = req.method || "GET";

    // CORS preflight
    if (method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        });
        res.end();
        return;
    }

    // --- API Routes ---
    if (pathname === "/api/config" && method === "GET") {
        sendJson(res, currentConfig);
        return;
    }

    if (pathname === "/api/config" && method === "PUT") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
            try {
                const newConfig = JSON.parse(body);
                currentConfig = { ...currentConfig, ...newConfig };
                // Save to disk
                fs.writeFileSync(
                    path.join(process.cwd(), "desksentinel.config.json"),
                    JSON.stringify(currentConfig, null, 2)
                );
                sendJson(res, { success: true, config: currentConfig });
            } catch (err) {
                sendJson(res, { error: `Invalid config: ${err}` }, 400);
            }
        });
        return;
    }

    if (pathname === "/api/status" && method === "GET") {
        sendJson(res, {
            isRunning,
            progress: runProgress,
            hasLastResult: !!lastResult,
        });
        return;
    }

    if (pathname === "/api/run" && method === "POST") {
        if (isRunning) {
            sendJson(res, { error: "A cleanup is already running" }, 409);
            return;
        }

        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
            const opts = body ? JSON.parse(body) : {};
            const dryRun = opts.dryRun !== undefined ? opts.dryRun : currentConfig.dryRun;

            // Run asynchronously
            runCleanup(dryRun).catch((err) => {
                logger.error(`Cleanup failed: ${err}`);
            });

            sendJson(res, { started: true, dryRun });
        });
        return;
    }

    if (pathname === "/api/result" && method === "GET") {
        if (!lastResult) {
            sendJson(res, { error: "No results yet" }, 404);
            return;
        }

        // Build category breakdown from changes
        const categoryBreakdown: Record<string, number> = {};
        for (const change of lastResult.changes) {
            if (change.reason && change.reason.startsWith("Category:")) {
                const cat = change.reason.replace("Category: ", "").split("/")[0];
                categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;
            }
        }

        // Build extension breakdown from changes
        const extBreakdown: Record<string, number> = {};
        for (const change of lastResult.changes) {
            const ext = path.extname(change.originalName).toLowerCase() || "(none)";
            extBreakdown[ext] = (extBreakdown[ext] || 0) + 1;
        }

        sendJson(res, {
            ...lastResult,
            categoryBreakdown,
            extBreakdown,
            duration: lastResult.endTime
                ? Math.round((lastResult.endTime.getTime() - lastResult.startTime.getTime()) / 1000)
                : 0,
        });
        return;
    }

    if (pathname === "/api/folders/validate" && method === "POST") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
            try {
                const { folders } = JSON.parse(body);
                const results = (folders as string[]).map((f: string) => {
                    const expanded = expandHome(f);
                    return {
                        path: f,
                        expanded,
                        exists: fs.existsSync(expanded),
                        isDirectory: fs.existsSync(expanded) && fs.statSync(expanded).isDirectory(),
                    };
                });
                sendJson(res, results);
            } catch (err) {
                sendJson(res, { error: `${err}` }, 400);
            }
        });
        return;
    }

    // --- Static Files ---
    const dashboardDir = path.join(process.cwd(), "dashboard");

    if (pathname === "/" || pathname === "/index.html") {
        serveStatic(res, path.join(dashboardDir, "index.html"));
        return;
    }

    // Serve other static files
    const staticPath = path.join(dashboardDir, pathname);
    if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
        serveStatic(res, staticPath);
        return;
    }

    // Fallback to dashboard
    serveStatic(res, path.join(dashboardDir, "index.html"));
});

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
    logger.divider("🛡️ DeskSentinel Dashboard");
    logger.success(`Dashboard running at http://localhost:${PORT}`);
    logger.info("Press Ctrl+C to stop");
    logger.divider();
});
