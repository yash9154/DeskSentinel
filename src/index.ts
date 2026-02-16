// ============================================================================
// DeskSentinel — Main Entry Point
// ============================================================================
// Orchestrates the complete DeskSentinel cleanup workflow:
// 1. Load config → 2. Scan folders → 3. AI Summarize → 4. Detect duplicates
// 5. Organize files → 6. Rename files → 7. Move duplicates
// 8. Generate report → 9. Schedule calendar reminders
//
// Supports: --dry-run, --undo, --config <path>
// ============================================================================

import * as fs from "fs";
import * as path from "path";
import {
    CleanupResult,
    Logger,
    DeskSentinelConfig,
    loadConfig,
    expandHome,
    formatBytes,
    todayDateString,
} from "./utils.js";
import { scanAllFolders } from "./scanner.js";
import { summarizeFiles } from "./summarizer.js";
import { organizeFiles } from "./organizer.js";
import { renameFiles } from "./renamer.js";
import { findDuplicates, moveDuplicates } from "./duplicates.js";
import { generateReport, parseReportForUndo } from "./reporter.js";
import { handleCalendar } from "./calendar.js";
import { fileMove } from "./accomplish.js";

const logger = new Logger("DeskSentinel");

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------

interface CLIArgs {
    dryRun: boolean;
    undo: boolean;
    configPath?: string;
}

function parseArgs(): CLIArgs {
    const args = process.argv.slice(2);
    const result: CLIArgs = { dryRun: false, undo: false };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case "--dry-run":
            case "-d":
                result.dryRun = true;
                break;
            case "--undo":
            case "-u":
                result.undo = true;
                break;
            case "--config":
            case "-c":
                result.configPath = args[++i];
                break;
            case "--help":
            case "-h":
                printHelp();
                process.exit(0);
        }
    }

    return result;
}

function printHelp(): void {
    console.log(`
🛡️  DeskSentinel — AI Guardian for Desktop & Downloads
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Usage:
  npx tsx src/index.ts [options]

Options:
  --dry-run, -d    Preview changes without applying them
  --undo, -u       Revert the last cleanup using the report log
  --config, -c     Path to config file (default: desksentinel.config.json)
  --help, -h       Show this help message

Examples:
  npx tsx src/index.ts --dry-run          # Preview cleanup
  npx tsx src/index.ts                    # Run live cleanup
  npx tsx src/index.ts --undo             # Undo last cleanup
  npx tsx src/index.ts --config my.json   # Use custom config
`);
}

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

function printBanner(config: DeskSentinelConfig, dryRun: boolean): void {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🛡️  DeskSentinel v1.0.0                                ║
║   AI Guardian for Desktop & Downloads                    ║
║                                                          ║
║   Mode: ${dryRun ? "🔍 DRY RUN (preview only)" : "✅ LIVE RUN (applying changes)"}          ║
║   AI: ${config.aiBackend.provider} (${config.aiBackend.model})${" ".repeat(Math.max(0, 28 - config.aiBackend.provider.length - config.aiBackend.model.length))}║
║   Targets: ${config.targetFolders.length} folder(s)                              ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
`);
}

// ---------------------------------------------------------------------------
// Undo Last Cleanup
// ---------------------------------------------------------------------------

async function undoLastCleanup(config: DeskSentinelConfig): Promise<void> {
    logger.divider("↩️  UNDO LAST CLEANUP");

    // Find the most recent report
    for (const folder of config.targetFolders) {
        const resolved = expandHome(folder);
        if (!fs.existsSync(resolved)) continue;

        const files = fs.readdirSync(resolved);
        const reports = files
            .filter((f) => f.startsWith("DeskSentinel_Report_") && f.endsWith(".md"))
            .sort()
            .reverse();

        if (reports.length === 0) continue;

        const reportPath = path.join(resolved, reports[0]);
        logger.info(`Found report: ${reportPath}`);

        const content = fs.readFileSync(reportPath, "utf-8");
        const undoData = parseReportForUndo(content);

        if (!undoData) {
            logger.error("Could not parse undo data from report");
            return;
        }

        logger.info(`Reverting ${undoData.length} changes...`);

        let revertedCount = 0;
        for (const change of undoData) {
            if (change.action === "skipped") continue;

            try {
                if (fs.existsSync(change.newPath)) {
                    // Ensure original directory exists
                    const origDir = path.dirname(change.originalPath);
                    if (!fs.existsSync(origDir)) {
                        fs.mkdirSync(origDir, { recursive: true });
                    }

                    await fileMove(change.newPath, change.originalPath);
                    revertedCount++;
                    logger.success(`Reverted: ${path.basename(change.newPath)} → ${change.originalPath}`);
                } else {
                    logger.warn(`File not found at new location: ${change.newPath}`);
                }
            } catch (err) {
                logger.error(`Failed to revert ${change.newPath}: ${err}`);
            }
        }

        logger.success(`Reverted ${revertedCount} out of ${undoData.length} changes`);
        return;
    }

    logger.error("No DeskSentinel report found to undo");
}

// ---------------------------------------------------------------------------
// Main Workflow
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
    const cliArgs = parseArgs();
    const config = loadConfig(cliArgs.configPath);

    // CLI --dry-run overrides config
    const dryRun = cliArgs.dryRun || config.dryRun;

    // Handle undo mode
    if (cliArgs.undo) {
        await undoLastCleanup(config);
        return;
    }

    printBanner(config, dryRun);

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
        targetFolders: config.targetFolders.map(expandHome),
        dryRun,
    };

    try {
        // -----------------------------------------------------------------------
        // Step 1: Scan all target folders
        // -----------------------------------------------------------------------
        const files = await scanAllFolders(config.targetFolders, result.errors);
        result.scannedCount = files.length;

        if (files.length === 0) {
            logger.warn("No files found to organize. Exiting.");
            return;
        }

        // -----------------------------------------------------------------------
        // Step 2: AI Summarization
        // -----------------------------------------------------------------------
        const summaries = await summarizeFiles(files, config, result.errors);

        // -----------------------------------------------------------------------
        // Step 3: Detect Duplicates (before organizing, so we work with originals)
        // -----------------------------------------------------------------------
        const duplicateGroups = await findDuplicates(files, result.errors);
        result.duplicateGroups = duplicateGroups;
        result.duplicatesFound = duplicateGroups.reduce(
            (sum, g) => sum + g.duplicates.length,
            0
        );

        // Create a set of duplicate file paths (to exclude from organizing)
        const duplicatePaths = new Set<string>();
        for (const group of duplicateGroups) {
            for (const dupe of group.duplicates) {
                duplicatePaths.add(dupe.path);
            }
        }

        // Filter out duplicates from the files to organize
        const filesToOrganize = files.filter((f) => !duplicatePaths.has(f.path));

        // -----------------------------------------------------------------------
        // Step 4: Smart Renaming
        // -----------------------------------------------------------------------
        const renameChanges = await renameFiles(
            filesToOrganize,
            summaries,
            dryRun,
            result.errors
        );
        result.changes.push(...renameChanges);
        result.renamedCount = renameChanges.filter(
            (c) => c.action === "renamed"
        ).length;

        // -----------------------------------------------------------------------
        // Step 5: Organize files into categorized folders
        // -----------------------------------------------------------------------
        // Use the first target folder as the organization base
        const basePath = expandHome(config.targetFolders[0]);
        const organizeChanges = await organizeFiles(
            filesToOrganize,
            summaries,
            basePath,
            dryRun,
            result.errors
        );
        result.changes.push(...organizeChanges);
        result.movedCount = organizeChanges.filter(
            (c) => c.action === "moved" || c.action === "moved+renamed"
        ).length;

        // -----------------------------------------------------------------------
        // Step 6: Move duplicates to review folder
        // -----------------------------------------------------------------------
        const dupeChanges = await moveDuplicates(
            duplicateGroups,
            basePath,
            config.duplicateFolder,
            dryRun,
            result.errors
        );
        result.changes.push(...dupeChanges);

        // -----------------------------------------------------------------------
        // Step 7: Generate cleanup report
        // -----------------------------------------------------------------------
        result.endTime = new Date();
        result.errorsCount = result.errors.length;

        const reportPath = await generateReport(result, basePath);

        // -----------------------------------------------------------------------
        // Step 8: Schedule calendar reminders
        // -----------------------------------------------------------------------
        await handleCalendar(
            result.duplicatesFound,
            config.enableCalendar,
            dryRun
        );

        // -----------------------------------------------------------------------
        // Final Summary
        // -----------------------------------------------------------------------
        printFinalSummary(result, reportPath);
    } catch (err) {
        logger.error(`Fatal error: ${err}`);
        result.errors.push(`Fatal: ${err}`);
        result.endTime = new Date();
        result.errorsCount = result.errors.length;

        // Try to generate a report even on error
        try {
            const basePath = expandHome(config.targetFolders[0]);
            await generateReport(result, basePath);
        } catch {
            logger.error("Could not generate error report");
        }

        process.exit(1);
    }
}

// ---------------------------------------------------------------------------
// Final Summary
// ---------------------------------------------------------------------------

function printFinalSummary(result: CleanupResult, reportPath: string): void {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║                  🛡️  CLEANUP COMPLETE                    ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║   📂 Files Scanned:    ${String(result.scannedCount).padEnd(6)}                          ║
║   📁 Files Moved:      ${String(result.movedCount).padEnd(6)}                          ║
║   ✏️  Files Renamed:    ${String(result.renamedCount).padEnd(6)}                          ║
║   🔄 Duplicates Found: ${String(result.duplicatesFound).padEnd(6)}                          ║
║   ⚠️  Errors:           ${String(result.errorsCount).padEnd(6)}                          ║
║                                                          ║
║   📊 Report: ${truncatePath(reportPath, 42).padEnd(43)}║
║                                                          ║
║   Mode: ${result.dryRun ? "🔍 DRY RUN — run without --dry-run to apply" : "✅ CHANGES APPLIED SUCCESSFULLY           "}  ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
`);
}

function truncatePath(p: string, maxLen: number): string {
    if (p.length <= maxLen) return p;
    return "..." + p.slice(p.length - maxLen + 3);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err) => {
    logger.error(`Unhandled error: ${err}`);
    process.exit(1);
});
