// ============================================================================
// DeskSentinel — Smart File Renamer
// ============================================================================
// Renames files using AI-suggested names while preserving extensions and
// avoiding name collisions. Integrates with Accomplish file.rename() API.
// ============================================================================

import * as path from "path";
import {
    ScannedFile,
    FileSummary,
    FileChange,
    Logger,
    safeFileName,
    sanitizeFileName,
} from "./utils.js";
import { fileRename } from "./accomplish.js";

const logger = new Logger("Renamer");

// ---------------------------------------------------------------------------
// Smart Rename Logic
// ---------------------------------------------------------------------------

/**
 * Build an intelligent filename from the AI summary.
 * Incorporates category, description, date, and relevant metadata.
 */
function buildSmartName(file: ScannedFile, summary: FileSummary): string {
    const ext = file.extension;
    let baseName = summary.suggestedName;

    // If AI didn't suggest a meaningful name, try to improve the original
    if (!baseName || baseName === file.name.replace(ext, "")) {
        baseName = improveOriginalName(file, summary);
    }

    // Sanitize the name
    baseName = sanitizeFileName(baseName);

    // If the name is too short, add category prefix
    if (baseName.length < 3) {
        baseName = `${summary.category}_${baseName}`;
    }

    return baseName + ext;
}

/**
 * Attempt to improve a generic filename using metadata.
 * Examples:
 *   IMG_20260216_1432.jpg → Screenshot_Feb16_2026.jpg
 *   download.pdf → Document_Feb16_2026.pdf
 *   notes.txt → Notes_Feb16_2026.txt
 */
function improveOriginalName(file: ScannedFile, summary: FileSummary): string {
    const original = file.name.replace(file.extension, "");

    // Check if it's a generic camera/screenshot filename
    const cameraPattern = /^(IMG|DSC|DCIM|Screenshot|Screen[\s_]?Shot|photo|image)[\s_\-]*/i;
    const downloadPattern = /^(download|file|document|untitled|new[\s_]?file)[\s_\-]*/i;
    const datePattern = /(\d{4})[\-_]?(\d{2})[\-_]?(\d{2})/;

    const dateMatch = original.match(datePattern);
    const dateStr = dateMatch
        ? `_${getMonthShort(parseInt(dateMatch[2]))}${dateMatch[3]}_${dateMatch[1]}`
        : `_${getMonthShort(file.modifiedAt.getMonth() + 1)}${String(file.modifiedAt.getDate()).padStart(2, "0")}`;

    if (cameraPattern.test(original)) {
        const prefix = summary.category === "Screenshots_Memes" ? "Screenshot" : "Image";
        return `${prefix}${dateStr}`;
    }

    if (downloadPattern.test(original)) {
        return `${summary.category}${dateStr}`;
    }

    // For other files, keep original name but clean it up
    return sanitizeFileName(original);
}

/** Get 3-letter month abbreviation from month number (1-based) */
function getMonthShort(month: number): string {
    const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    return months[(month - 1) % 12];
}

// ---------------------------------------------------------------------------
// Rename Files
// ---------------------------------------------------------------------------

/**
 * Rename files using AI-suggested names.
 * Preserves extensions, avoids collisions, supports dry-run.
 *
 * @param files - Files to rename
 * @param summaries - AI summaries with suggested names
 * @param dryRun - If true, log without renaming
 * @param errors - Error accumulator
 * @returns Array of rename changes
 */
export async function renameFiles(
    files: ScannedFile[],
    summaries: Map<string, FileSummary>,
    dryRun: boolean,
    errors: string[]
): Promise<FileChange[]> {
    logger.divider("✏️  SMART RENAMING");

    const changes: FileChange[] = [];
    const renamedCount = { actual: 0, planned: 0 };
    const existingNamesPerDir = new Map<string, Set<string>>();

    for (const file of files) {
        const summary = summaries.get(file.path);
        if (!summary) continue;

        // Build smart name
        const smartName = buildSmartName(file, summary);

        // Skip if name unchanged
        if (smartName === file.name) {
            continue;
        }

        // Track existing names in the file's directory for collision avoidance
        const dir = path.dirname(file.path);
        if (!existingNamesPerDir.has(dir)) {
            existingNamesPerDir.set(dir, new Set<string>());
        }
        const dirNames = existingNamesPerDir.get(dir)!;

        // Generate collision-safe name
        const safeName = safeFileName(smartName, dirNames);
        const newPath = path.join(dir, safeName);

        const change: FileChange = {
            originalPath: file.path,
            originalName: file.name,
            newPath,
            newName: safeName,
            action: "renamed",
            reason: `AI suggestion (${summary.confidence})`,
        };

        if (dryRun) {
            logger.info(`[DRY-RUN] Rename: ${file.name} → ${safeName}`);
            renamedCount.planned++;
        } else {
            try {
                await fileRename(file.path, safeName);
                renamedCount.actual++;
                logger.success(`Renamed: ${file.name} → ${safeName}`);

                // Update the file object path for downstream operations
                file.path = newPath;
                file.name = safeName;
            } catch (err) {
                const msg = `Failed to rename ${file.name}: ${err}`;
                logger.error(msg);
                errors.push(msg);
                change.action = "skipped";
                change.reason = `Error: ${err}`;
            }
        }

        dirNames.add(safeName);
        changes.push(change);
    }

    logger.divider();
    if (dryRun) {
        logger.info(`[DRY-RUN] Would rename ${renamedCount.planned} files`);
    } else {
        logger.success(`Renamed ${renamedCount.actual} files`);
    }

    return changes;
}
