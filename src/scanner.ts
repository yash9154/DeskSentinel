// ============================================================================
// DeskSentinel — Folder Scanner
// ============================================================================
// Recursively scans target folders, collecting file metadata while safely
// skipping hidden/system files and handling locked/unreadable files.
// Integrates with Accomplish folder.scan() API via adapter layer.
// ============================================================================

import * as fs from "fs";
import * as path from "path";
import {
    ScannedFile,
    Logger,
    isHiddenOrSystem,
    expandHome,
    formatBytes,
} from "./utils.js";
import { folderScan } from "./accomplish.js";

const logger = new Logger("Scanner");

// ---------------------------------------------------------------------------
// Core Scanner
// ---------------------------------------------------------------------------

/**
 * Scan a single folder recursively for all files.
 * Skips hidden/system files and gracefully handles errors.
 */
export async function scanFolder(
    folderPath: string,
    errors: string[]
): Promise<ScannedFile[]> {
    const resolved = expandHome(folderPath);

    if (!fs.existsSync(resolved)) {
        const msg = `Folder does not exist: ${resolved}`;
        logger.error(msg);
        errors.push(msg);
        return [];
    }

    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
        const msg = `Path is not a directory: ${resolved}`;
        logger.error(msg);
        errors.push(msg);
        return [];
    }

    logger.info(`Scanning: ${resolved}`);

    try {
        // Use Accomplish adapter (falls back to native fs)
        const allFiles = await folderScan(resolved);

        // Filter out hidden/system files
        const filtered = allFiles.filter((file) => {
            if (isHiddenOrSystem(file.path)) {
                logger.debug(`Skipping hidden/system: ${file.name}`);
                return false;
            }
            return true;
        });

        logger.success(
            `Found ${filtered.length} files in ${resolved} (${allFiles.length - filtered.length} hidden/system skipped)`
        );

        return filtered;
    } catch (err) {
        const msg = `Error scanning ${resolved}: ${err}`;
        logger.error(msg);
        errors.push(msg);
        return [];
    }
}

// ---------------------------------------------------------------------------
// Multi-Folder Scanner
// ---------------------------------------------------------------------------

/**
 * Scan multiple target folders and merge results.
 * Deduplicates files that may appear due to nested folder selections.
 */
export async function scanAllFolders(
    folderPaths: string[],
    errors: string[]
): Promise<ScannedFile[]> {
    logger.divider("📂 FOLDER SCANNING");

    const allFiles: ScannedFile[] = [];
    const seenPaths = new Set<string>();

    for (const folder of folderPaths) {
        const files = await scanFolder(folder, errors);
        for (const file of files) {
            const normalizedPath = path.resolve(file.path);
            if (!seenPaths.has(normalizedPath)) {
                seenPaths.add(normalizedPath);
                allFiles.push(file);
            }
        }
    }

    // Log summary stats
    const totalSize = allFiles.reduce((sum, f) => sum + f.size, 0);
    logger.divider();
    logger.info(`Total files found: ${allFiles.length}`);
    logger.info(`Total size: ${formatBytes(totalSize)}`);

    // Log file type breakdown
    const extCounts = new Map<string, number>();
    for (const file of allFiles) {
        const ext = file.extension || "(no extension)";
        extCounts.set(ext, (extCounts.get(ext) || 0) + 1);
    }

    const sorted = [...extCounts.entries()].sort((a, b) => b[1] - a[1]);
    logger.info("File types:");
    for (const [ext, count] of sorted.slice(0, 10)) {
        logger.info(`  ${ext}: ${count}`);
    }
    if (sorted.length > 10) {
        logger.info(`  ... and ${sorted.length - 10} more types`);
    }

    return allFiles;
}
