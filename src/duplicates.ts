// ============================================================================
// DeskSentinel — Duplicate File Detector
// ============================================================================
// Detects duplicate files using file size + SHA-256 hashing.
// Moves duplicates to a review folder — never deletes automatically.
// Integrates with Accomplish file.move() API via adapter layer.
// ============================================================================

import * as fs from "fs";
import * as path from "path";
import {
    ScannedFile,
    DuplicateGroup,
    FileChange,
    Logger,
    computeFileHash,
    formatBytes,
} from "./utils.js";
import { fileMove } from "./accomplish.js";

const logger = new Logger("Duplicates");

// ---------------------------------------------------------------------------
// Find Duplicates
// ---------------------------------------------------------------------------

/**
 * Detect duplicate files using a two-pass approach:
 * 1. Group files by size (fast pre-filter)
 * 2. Within same-size groups, compare SHA-256 hashes
 *
 * Returns duplicate groups with the first occurrence marked as "keep".
 */
export async function findDuplicates(
    files: ScannedFile[],
    errors: string[]
): Promise<DuplicateGroup[]> {
    logger.divider("🔍 DUPLICATE DETECTION");

    // Pass 1: Group by file size
    const sizeGroups = new Map<number, ScannedFile[]>();
    for (const file of files) {
        const group = sizeGroups.get(file.size);
        if (group) {
            group.push(file);
        } else {
            sizeGroups.set(file.size, [file]);
        }
    }

    // Filter to only groups with potential duplicates (same size)
    const potentialDupes = [...sizeGroups.values()].filter(
        (group) => group.length > 1
    );

    logger.info(
        `Found ${potentialDupes.length} size groups with potential duplicates`
    );

    // Pass 2: Hash files within each size group
    const duplicateGroups: DuplicateGroup[] = [];

    for (const sizeGroup of potentialDupes) {
        const hashGroups = new Map<string, ScannedFile[]>();

        for (const file of sizeGroup) {
            try {
                // Verify file still exists before hashing
                if (!fs.existsSync(file.path)) {
                    logger.warn(`File no longer exists: ${file.path}`);
                    continue;
                }

                const hash = await computeFileHash(file.path);

                const group = hashGroups.get(hash);
                if (group) {
                    group.push(file);
                } else {
                    hashGroups.set(hash, [file]);
                }
            } catch (err) {
                const msg = `Failed to hash ${file.name}: ${err}`;
                logger.warn(msg);
                errors.push(msg);
            }
        }

        // Identify actual duplicates (same hash, multiple files)
        for (const [hash, hashGroup] of hashGroups) {
            if (hashGroup.length > 1) {
                // Sort by modification date — keep the oldest (first occurrence)
                hashGroup.sort(
                    (a, b) => a.modifiedAt.getTime() - b.modifiedAt.getTime()
                );

                duplicateGroups.push({
                    hash,
                    size: hashGroup[0].size,
                    files: hashGroup,
                    keepFile: hashGroup[0],
                    duplicates: hashGroup.slice(1),
                });
            }
        }
    }

    // Log results
    const totalDuplicates = duplicateGroups.reduce(
        (sum, g) => sum + g.duplicates.length,
        0
    );
    const savedSpace = duplicateGroups.reduce(
        (sum, g) => sum + g.size * g.duplicates.length,
        0
    );

    logger.divider();
    if (duplicateGroups.length > 0) {
        logger.success(
            `Found ${totalDuplicates} duplicate files in ${duplicateGroups.length} groups`
        );
        logger.info(`Potential space savings: ${formatBytes(savedSpace)}`);

        // Log each group
        for (const group of duplicateGroups) {
            logger.info(`\n  Hash: ${group.hash.slice(0, 12)}... (${formatBytes(group.size)})`);
            logger.info(`    Keep: ${group.keepFile.name}`);
            for (const dupe of group.duplicates) {
                logger.info(`    Duplicate: ${dupe.name}`);
            }
        }
    } else {
        logger.success("No duplicates found");
    }

    return duplicateGroups;
}

// ---------------------------------------------------------------------------
// Move Duplicates to Review Folder
// ---------------------------------------------------------------------------

/**
 * Move duplicate files to a review folder.
 * NEVER deletes files — only moves for manual review.
 * Keeps the first occurrence in its original/organized location.
 *
 * @param duplicateGroups - Detected duplicate groups
 * @param basePath - Root folder path
 * @param duplicateFolderName - Name of the review folder
 * @param dryRun - If true, log without moving
 * @param errors - Error accumulator
 * @returns Array of file changes
 */
export async function moveDuplicates(
    duplicateGroups: DuplicateGroup[],
    basePath: string,
    duplicateFolderName: string,
    dryRun: boolean,
    errors: string[]
): Promise<FileChange[]> {
    if (duplicateGroups.length === 0) return [];

    logger.divider("📦 MOVING DUPLICATES TO REVIEW");

    const changes: FileChange[] = [];
    const dupeDir = path.join(basePath, duplicateFolderName);
    const existingNames = new Set<string>();
    let movedCount = 0;

    for (const group of duplicateGroups) {
        for (const dupe of group.duplicates) {
            // Generate safe name in duplicates folder
            let targetName = dupe.name;
            let counter = 1;
            while (existingNames.has(targetName)) {
                const ext = path.extname(dupe.name);
                const base = path.basename(dupe.name, ext);
                targetName = `${base}_(${counter})${ext}`;
                counter++;
            }

            const targetPath = path.join(dupeDir, targetName);

            const change: FileChange = {
                originalPath: dupe.path,
                originalName: dupe.name,
                newPath: targetPath,
                newName: targetName,
                action: "duplicate",
                reason: `Duplicate of ${group.keepFile.name} (hash: ${group.hash.slice(0, 8)}...)`,
            };

            if (dryRun) {
                logger.info(`[DRY-RUN] Move duplicate: ${dupe.name} → ${duplicateFolderName}/`);
            } else {
                try {
                    // Verify file still exists before moving
                    if (!fs.existsSync(dupe.path)) {
                        logger.warn(`Duplicate file no longer exists: ${dupe.path}`);
                        change.action = "skipped";
                        change.reason = "File no longer exists";
                        changes.push(change);
                        continue;
                    }

                    await fileMove(dupe.path, targetPath);
                    movedCount++;
                    logger.success(`Moved duplicate: ${dupe.name} → ${duplicateFolderName}/`);
                } catch (err) {
                    const msg = `Failed to move duplicate ${dupe.name}: ${err}`;
                    logger.error(msg);
                    errors.push(msg);
                    change.action = "skipped";
                    change.reason = `Error: ${err}`;
                }
            }

            existingNames.add(targetName);
            changes.push(change);
        }
    }

    logger.divider();
    if (dryRun) {
        const planned = changes.filter((c) => c.action === "duplicate").length;
        logger.info(`[DRY-RUN] Would move ${planned} duplicates to ${duplicateFolderName}/`);
    } else {
        logger.success(`Moved ${movedCount} duplicates to ${duplicateFolderName}/`);
    }

    return changes;
}
