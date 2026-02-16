// ============================================================================
// DeskSentinel — Intelligent File Organizer
// ============================================================================
// Categorizes files into smart folder structures based on AI summaries.
// Creates folders dynamically and moves files. Supports dry-run mode.
// Integrates with Accomplish file.move() API via adapter layer.
// ============================================================================

import * as fs from "fs";
import * as path from "path";
import {
    ScannedFile,
    FileSummary,
    FileChange,
    Logger,
    safeFileName,
} from "./utils.js";
import { fileMove } from "./accomplish.js";

const logger = new Logger("Organizer");

// ---------------------------------------------------------------------------
// Category → Folder Path Mapping
// ---------------------------------------------------------------------------

/**
 * Determine the target folder path for a file based on its summary.
 * Creates hierarchical folder structures (e.g., College_Assignments/OS/).
 */
function getCategoryFolder(summary: FileSummary): string {
    const { category, subCategory } = summary;

    // Build folder path with optional subcategory
    if (subCategory) {
        return path.join(category, subCategory);
    }

    return category;
}

// ---------------------------------------------------------------------------
// Organize Files
// ---------------------------------------------------------------------------

/**
 * Organize files into categorized folders based on their AI summaries.
 * Creates target directories and moves files. Supports dry-run mode.
 *
 * @param files - Scanned files to organize
 * @param summaries - AI-generated summaries for each file
 * @param basePath - Root folder where organized subfolders will be created
 * @param dryRun - If true, log changes without actually moving files
 * @param errors - Error accumulator array
 * @returns Array of file changes applied (or planned in dry-run)
 */
export async function organizeFiles(
    files: ScannedFile[],
    summaries: Map<string, FileSummary>,
    basePath: string,
    dryRun: boolean,
    errors: string[]
): Promise<FileChange[]> {
    logger.divider("📁 FILE ORGANIZATION");

    const changes: FileChange[] = [];
    const existingNamesInFolders = new Map<string, Set<string>>();
    let movedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
        const summary = summaries.get(file.path);
        if (!summary) {
            logger.warn(`No summary for ${file.name}, skipping organization`);
            skippedCount++;
            continue;
        }

        // Determine target folder
        const categoryFolder = getCategoryFolder(summary);
        const targetDir = path.join(basePath, categoryFolder);

        // Track existing names per folder for collision avoidance
        if (!existingNamesInFolders.has(targetDir)) {
            const existing = new Set<string>();
            if (fs.existsSync(targetDir)) {
                try {
                    const entries = fs.readdirSync(targetDir);
                    entries.forEach((e) => existing.add(e));
                } catch {
                    // Directory might be inaccessible
                }
            }
            existingNamesInFolders.set(targetDir, existing);
        }

        const folderNames = existingNamesInFolders.get(targetDir)!;

        // Generate safe filename (use suggested name from AI + original extension)
        const suggestedBase = summary.suggestedName || file.name.replace(file.extension, "");
        const targetName = safeFileName(suggestedBase + file.extension, folderNames);
        const targetPath = path.join(targetDir, targetName);

        // Skip if file is already in the correct location
        if (path.resolve(file.path) === path.resolve(targetPath)) {
            logger.debug(`Already organized: ${file.name}`);
            skippedCount++;
            continue;
        }

        // Determine action type
        const nameChanged = targetName !== file.name;
        const dirChanged = path.dirname(file.path) !== targetDir;
        let action: FileChange["action"] = "skipped";

        if (dirChanged && nameChanged) action = "moved+renamed";
        else if (dirChanged) action = "moved";
        else if (nameChanged) action = "renamed";

        if (action === "skipped") {
            skippedCount++;
            continue;
        }

        const change: FileChange = {
            originalPath: file.path,
            originalName: file.name,
            newPath: targetPath,
            newName: targetName,
            action,
            reason: `Category: ${summary.category}${summary.subCategory ? "/" + summary.subCategory : ""}`,
        };

        if (dryRun) {
            logger.info(
                `[DRY-RUN] ${action}: ${file.name} → ${categoryFolder}/${targetName}`
            );
        } else {
            try {
                // Create target directory if needed
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                    logger.info(`Created folder: ${categoryFolder}`);
                }

                // Move file via Accomplish adapter
                await fileMove(file.path, targetPath);
                movedCount++;
                logger.success(`${action}: ${file.name} → ${categoryFolder}/${targetName}`);
            } catch (err) {
                const msg = `Failed to ${action} ${file.name}: ${err}`;
                logger.error(msg);
                errors.push(msg);
                change.action = "skipped";
                change.reason = `Error: ${err}`;
            }
        }

        // Track the name so future files avoid collisions
        folderNames.add(targetName);
        changes.push(change);
    }

    logger.divider();
    if (dryRun) {
        logger.info(`[DRY-RUN] Would organize ${changes.length} files`);
    } else {
        logger.success(`Organized ${movedCount} files`);
    }
    if (skippedCount > 0) {
        logger.info(`Skipped ${skippedCount} files (already organized or no changes)`);
    }

    return changes;
}
