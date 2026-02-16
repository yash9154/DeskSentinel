// ============================================================================
// DeskSentinel — Shared Utilities
// ============================================================================
// Provides logging, hashing, filename safety, and helper functions used
// across all DeskSentinel modules.
// ============================================================================

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as os from "os";

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export interface DeskSentinelConfig {
    targetFolders: string[];
    dryRun: boolean;
    enableCalendar: boolean;
    aiBackend: {
        provider: "ollama" | "lmstudio" | "openai-compatible-local";
        endpoint: string;
        model: string;
    };
    language: string;
    duplicateFolder: string;
    reportFolder: string;
    categories: Record<string, string[]>;
}

export interface ScannedFile {
    path: string;
    name: string;
    extension: string;
    size: number;
    modifiedAt: Date;
}

export interface FileSummary {
    description: string;
    category: string;
    subCategory?: string;
    suggestedName: string;
    confidence: "ai" | "heuristic";
}

export interface FileChange {
    originalPath: string;
    originalName: string;
    newPath: string;
    newName: string;
    action: "moved" | "renamed" | "moved+renamed" | "duplicate" | "skipped";
    reason?: string;
}

export interface DuplicateGroup {
    hash: string;
    size: number;
    files: ScannedFile[];
    keepFile: ScannedFile;
    duplicates: ScannedFile[];
}

export interface CleanupResult {
    scannedCount: number;
    movedCount: number;
    renamedCount: number;
    duplicatesFound: number;
    errorsCount: number;
    changes: FileChange[];
    duplicateGroups: DuplicateGroup[];
    errors: string[];
    startTime: Date;
    endTime?: Date;
    targetFolders: string[];
    dryRun: boolean;
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export class Logger {
    private context: string;

    constructor(context: string) {
        this.context = context;
    }

    private timestamp(): string {
        return new Date().toISOString().slice(11, 19);
    }

    info(msg: string): void {
        console.log(`[${this.timestamp()}] ℹ️  ${this.context}: ${msg}`);
    }

    success(msg: string): void {
        console.log(`[${this.timestamp()}] ✅ ${this.context}: ${msg}`);
    }

    warn(msg: string): void {
        console.warn(`[${this.timestamp()}] ⚠️  ${this.context}: ${msg}`);
    }

    error(msg: string): void {
        console.error(`[${this.timestamp()}] ❌ ${this.context}: ${msg}`);
    }

    debug(msg: string): void {
        if (process.env.DESKSENTINEL_DEBUG === "true") {
            console.log(`[${this.timestamp()}] 🔍 ${this.context}: ${msg}`);
        }
    }

    divider(label?: string): void {
        const line = "─".repeat(60);
        if (label) {
            console.log(`\n${line}\n  ${label}\n${line}`);
        } else {
            console.log(line);
        }
    }
}

// ---------------------------------------------------------------------------
// File Hashing (SHA-256)
// ---------------------------------------------------------------------------

/**
 * Computes the SHA-256 hash of a file for duplicate detection.
 * Reads file in chunks to handle large files efficiently.
 */
export function computeFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha256");
        const stream = fs.createReadStream(filePath);
        stream.on("data", (chunk) => hash.update(chunk));
        stream.on("end", () => resolve(hash.digest("hex")));
        stream.on("error", (err) => reject(err));
    });
}

// ---------------------------------------------------------------------------
// Safe Filename Generation
// ---------------------------------------------------------------------------

/**
 * Generates a collision-safe filename by appending (1), (2), etc.
 * Always preserves the original file extension.
 */
export function safeFileName(
    desiredName: string,
    existingNames: Set<string>
): string {
    if (!existingNames.has(desiredName)) {
        return desiredName;
    }

    const ext = path.extname(desiredName);
    const base = path.basename(desiredName, ext);
    let counter = 1;

    while (existingNames.has(`${base}_(${counter})${ext}`)) {
        counter++;
    }

    return `${base}_(${counter})${ext}`;
}

// ---------------------------------------------------------------------------
// Hidden / System File Detection
// ---------------------------------------------------------------------------

/** Check if a file or directory should be skipped (hidden or system). */
export function isHiddenOrSystem(filePath: string): boolean {
    const baseName = path.basename(filePath);

    // Unix-style hidden files (dot-prefix)
    if (baseName.startsWith(".")) return true;

    // Common system files/directories to skip
    const systemNames = new Set([
        "Thumbs.db",
        "desktop.ini",
        ".DS_Store",
        "$RECYCLE.BIN",
        "System Volume Information",
        "node_modules",
        "__pycache__",
        ".git",
        ".svn",
    ]);

    if (systemNames.has(baseName)) return true;

    return false;
}

// ---------------------------------------------------------------------------
// Path Helpers
// ---------------------------------------------------------------------------

/** Expand ~ to user home directory */
export function expandHome(inputPath: string): string {
    if (inputPath.startsWith("~")) {
        return path.join(os.homedir(), inputPath.slice(1));
    }
    return inputPath;
}

/** Get a human-readable file size string */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/** Get the file extension without the dot, lowercased */
export function getExtension(fileName: string): string {
    return path.extname(fileName).toLowerCase().replace(".", "");
}

/** Sanitize a filename: remove special characters, collapse spaces */
export function sanitizeFileName(name: string): string {
    return name
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") // Remove invalid chars
        .replace(/\s+/g, "_") // Collapse whitespace
        .replace(/_+/g, "_") // Collapse multiple underscores
        .replace(/^_|_$/g, "") // Trim leading/trailing underscores
        .slice(0, 200); // Limit length
}

// ---------------------------------------------------------------------------
// Config Loader
// ---------------------------------------------------------------------------

/** Load configuration from desksentinel.config.json */
export function loadConfig(configPath?: string): DeskSentinelConfig {
    const logger = new Logger("Config");
    const defaultPath = path.join(process.cwd(), "desksentinel.config.json");
    const resolvedPath = configPath || defaultPath;

    const defaultConfig: DeskSentinelConfig = {
        targetFolders: ["~/Desktop", "~/Downloads"],
        dryRun: true,
        enableCalendar: true,
        aiBackend: {
            provider: "ollama",
            endpoint: "http://localhost:11434/v1/chat/completions",
            model: "llama3",
        },
        language: "en",
        duplicateFolder: "Duplicates_To_Review",
        reportFolder: ".",
        categories: {},
    };

    if (!fs.existsSync(resolvedPath)) {
        logger.warn(
            `Config not found at ${resolvedPath}, using defaults (dry-run enabled)`
        );
        return defaultConfig;
    }

    try {
        const raw = fs.readFileSync(resolvedPath, "utf-8");
        const parsed = JSON.parse(raw);
        const merged = { ...defaultConfig, ...parsed };
        logger.info(`Loaded config from ${resolvedPath}`);
        return merged;
    } catch (err) {
        logger.error(`Failed to parse config: ${err}`);
        logger.warn("Falling back to default config (dry-run enabled)");
        return defaultConfig;
    }
}

// ---------------------------------------------------------------------------
// Date Helpers
// ---------------------------------------------------------------------------

/** Get today's date as YYYY-MM-DD */
export function todayDateString(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Format a Date to a human-readable string */
export function formatDate(date: Date): string {
    return date.toLocaleString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}
