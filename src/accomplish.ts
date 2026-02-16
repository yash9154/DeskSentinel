// ============================================================================
// DeskSentinel — Accomplish API Adapter Layer
// ============================================================================
// This module provides a thin abstraction over Accomplish AI desktop app APIs.
// If exact Accomplish SDK APIs differ at runtime, only this file needs updating.
// When running standalone (without Accomplish), all operations fall back to
// native Node.js fs operations.
// ============================================================================

import * as fs from "fs";
import * as path from "path";
import { Logger } from "./utils.js";

const logger = new Logger("Accomplish");

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export interface AccomplishFile {
    path: string;
    name: string;
    extension: string;
    size: number;
    modifiedAt: Date;
}

export interface CalendarEvent {
    title: string;
    description: string;
    startTime: Date;
    recurrence?: "daily" | "weekly" | "monthly" | "none";
}

// ---------------------------------------------------------------------------
// Accomplish API Detection
// ---------------------------------------------------------------------------

/** Check if running inside the Accomplish runtime */
function isAccomplishAvailable(): boolean {
    // In a real Accomplish environment, the SDK would be globally available.
    // For standalone use, we fall back to Node.js fs.
    return typeof (globalThis as any).accomplish !== "undefined";
}

// ---------------------------------------------------------------------------
// folder.scan() — Scan a directory for files
// ---------------------------------------------------------------------------

/**
 * Accomplish adapter: folder.scan()
 * Scans a directory recursively and returns file metadata.
 * Falls back to Node.js fs.readdirSync when Accomplish is unavailable.
 */
export async function folderScan(dirPath: string): Promise<AccomplishFile[]> {
    if (isAccomplishAvailable()) {
        try {
            const accomplish = (globalThis as any).accomplish;
            return await accomplish.folder.scan(dirPath);
        } catch (err) {
            logger.warn(`Accomplish folder.scan failed, falling back to fs: ${err}`);
        }
    }

    // Fallback: native Node.js recursive scan
    const results: AccomplishFile[] = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        try {
            if (entry.isDirectory()) {
                const nested = await folderScan(fullPath);
                results.push(...nested);
            } else if (entry.isFile()) {
                const stats = fs.statSync(fullPath);
                results.push({
                    path: fullPath,
                    name: entry.name,
                    extension: path.extname(entry.name).toLowerCase(),
                    size: stats.size,
                    modifiedAt: stats.mtime,
                });
            }
        } catch (err) {
            logger.warn(`Skipping inaccessible: ${fullPath} — ${err}`);
        }
    }

    return results;
}

// ---------------------------------------------------------------------------
// file.move() — Move a file to a new location
// ---------------------------------------------------------------------------

/**
 * Accomplish adapter: file.move()
 * Moves a file from source to destination. Creates destination directory if needed.
 */
export async function fileMove(
    sourcePath: string,
    destPath: string
): Promise<void> {
    if (isAccomplishAvailable()) {
        try {
            const accomplish = (globalThis as any).accomplish;
            await accomplish.file.move(sourcePath, destPath);
            return;
        } catch (err) {
            logger.warn(`Accomplish file.move failed, falling back to fs: ${err}`);
        }
    }

    // Fallback: native Node.js
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }
    fs.renameSync(sourcePath, destPath);
}

// ---------------------------------------------------------------------------
// file.rename() — Rename a file in place
// ---------------------------------------------------------------------------

/**
 * Accomplish adapter: file.rename()
 * Renames a file while keeping it in the same directory.
 */
export async function fileRename(
    filePath: string,
    newName: string
): Promise<string> {
    const dir = path.dirname(filePath);
    const newPath = path.join(dir, newName);

    if (isAccomplishAvailable()) {
        try {
            const accomplish = (globalThis as any).accomplish;
            await accomplish.file.rename(filePath, newName);
            return newPath;
        } catch (err) {
            logger.warn(`Accomplish file.rename failed, falling back to fs: ${err}`);
        }
    }

    // Fallback: native Node.js
    fs.renameSync(filePath, newPath);
    return newPath;
}

// ---------------------------------------------------------------------------
// document.generate() — Write content to a file
// ---------------------------------------------------------------------------

/**
 * Accomplish adapter: document.generate()
 * Generates a document (e.g., Markdown report) at the specified path.
 */
export async function documentGenerate(
    filePath: string,
    content: string
): Promise<void> {
    if (isAccomplishAvailable()) {
        try {
            const accomplish = (globalThis as any).accomplish;
            await accomplish.document.generate(filePath, content);
            return;
        } catch (err) {
            logger.warn(
                `Accomplish document.generate failed, falling back to fs: ${err}`
            );
        }
    }

    // Fallback: native Node.js
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// calendar.addEvent() — Add a calendar event
// ---------------------------------------------------------------------------

/**
 * Accomplish adapter: calendar.addEvent()
 * Adds an event to the user's calendar via Accomplish.
 * When Accomplish is unavailable, logs the event details.
 */
export async function calendarAddEvent(event: CalendarEvent): Promise<void> {
    if (isAccomplishAvailable()) {
        try {
            const accomplish = (globalThis as any).accomplish;
            await accomplish.calendar.addEvent(event);
            logger.info(`Calendar event created: "${event.title}"`);
            return;
        } catch (err) {
            logger.warn(
                `Accomplish calendar.addEvent failed: ${err}`
            );
        }
    }

    // Fallback: log the event (no native calendar API)
    logger.info(
        `[Calendar Stub] Event: "${event.title}" | ${event.startTime.toISOString()} | Recurrence: ${event.recurrence || "none"}`
    );
    logger.info(
        `  → In production, this integrates with Accomplish calendar.addEvent()`
    );
}

// ---------------------------------------------------------------------------
// ai.summarize() — Summarize content using AI
// ---------------------------------------------------------------------------

/**
 * Accomplish adapter: ai.summarize()
 * Uses Accomplish's built-in AI to summarize content.
 * Falls back to local LLM HTTP call (handled by summarizer.ts).
 */
export async function aiSummarize(
    content: string,
    _systemPrompt?: string
): Promise<string | null> {
    if (isAccomplishAvailable()) {
        try {
            const accomplish = (globalThis as any).accomplish;
            return await accomplish.ai.summarize(content);
        } catch (err) {
            logger.warn(
                `Accomplish ai.summarize failed, will use local LLM: ${err}`
            );
        }
    }

    // Return null to signal that the caller should use local LLM
    return null;
}
