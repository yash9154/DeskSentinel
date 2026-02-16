// ============================================================================
// DeskSentinel — Markdown Report Generator
// ============================================================================
// Generates a comprehensive cleanup report in Markdown format.
// Includes stats, change tables, duplicate lists, and error sections.
// Integrates with Accomplish document.generate() API via adapter layer.
// ============================================================================

import * as path from "path";
import { CleanupResult, Logger, todayDateString, formatBytes, formatDate } from "./utils.js";
import { documentGenerate } from "./accomplish.js";

const logger = new Logger("Reporter");

// ---------------------------------------------------------------------------
// Report Generation
// ---------------------------------------------------------------------------

/**
 * Generate a comprehensive Markdown cleanup report.
 * Saved as DeskSentinel_Report_YYYY-MM-DD.md in the target folder.
 *
 * @param result - Complete cleanup results
 * @param basePath - Root folder to save the report in
 * @returns Path to the generated report file
 */
export async function generateReport(
    result: CleanupResult,
    basePath: string
): Promise<string> {
    logger.divider("📊 GENERATING REPORT");

    const reportName = `DeskSentinel_Report_${todayDateString()}.md`;
    const reportPath = path.join(basePath, reportName);

    const duration = result.endTime
        ? Math.round(
            (result.endTime.getTime() - result.startTime.getTime()) / 1000
        )
        : 0;

    // Build report content
    const sections: string[] = [];

    // --- Header ---
    sections.push(`# 🛡️ DeskSentinel Cleanup Report`);
    sections.push("");
    sections.push(`**Date:** ${formatDate(result.startTime)}`);
    sections.push(`**Mode:** ${result.dryRun ? "🔍 DRY RUN (no changes applied)" : "✅ LIVE RUN"}`);
    sections.push(`**Duration:** ${duration}s`);
    sections.push(`**Target Folders:** ${result.targetFolders.join(", ")}`);
    sections.push("");

    // --- Summary Stats ---
    sections.push("## 📈 Summary Statistics");
    sections.push("");
    sections.push("| Metric | Count |");
    sections.push("|--------|-------|");
    sections.push(`| Files Scanned | ${result.scannedCount} |`);
    sections.push(`| Files Moved | ${result.movedCount} |`);
    sections.push(`| Files Renamed | ${result.renamedCount} |`);
    sections.push(`| Duplicates Found | ${result.duplicatesFound} |`);
    sections.push(`| Errors | ${result.errorsCount} |`);
    sections.push("");

    // --- Changes Table ---
    const appliedChanges = result.changes.filter(
        (c) => c.action !== "skipped" && c.action !== "duplicate"
    );

    if (appliedChanges.length > 0) {
        sections.push("## 📋 File Changes");
        sections.push("");
        sections.push("| # | Action | Original Name | New Name | Reason |");
        sections.push("|---|--------|--------------|----------|--------|");

        appliedChanges.forEach((change, i) => {
            const originalShort = truncate(change.originalName, 40);
            const newShort = truncate(change.newName, 40);
            const reason = change.reason || "-";
            sections.push(
                `| ${i + 1} | ${change.action} | \`${originalShort}\` | \`${newShort}\` | ${reason} |`
            );
        });
        sections.push("");
    }

    // --- Duplicates Section ---
    if (result.duplicateGroups.length > 0) {
        sections.push("## 🔄 Duplicates Found");
        sections.push("");
        sections.push(
            `Found **${result.duplicatesFound}** duplicate files in **${result.duplicateGroups.length}** groups.`
        );
        sections.push(
            "Duplicates have been moved to `Duplicates_To_Review/` for manual review."
        );
        sections.push("");

        for (const group of result.duplicateGroups) {
            sections.push(
                `### Group: ${group.hash.slice(0, 12)}... (${formatBytes(group.size)})`
            );
            sections.push(`- **Kept:** \`${group.keepFile.name}\``);
            for (const dupe of group.duplicates) {
                sections.push(`- **Duplicate:** \`${dupe.name}\``);
            }
            sections.push("");
        }
    }

    // --- Errors Section ---
    if (result.errors.length > 0) {
        sections.push("## ⚠️ Errors & Warnings");
        sections.push("");
        for (const err of result.errors) {
            sections.push(`- ${err}`);
        }
        sections.push("");
    }

    // --- Undo Instructions ---
    sections.push("## ↩️ Undo Instructions");
    sections.push("");
    if (result.dryRun) {
        sections.push(
            "This was a **dry run** — no changes were applied. No undo needed."
        );
    } else {
        sections.push("To undo this cleanup, run:");
        sections.push("```bash");
        sections.push("npm run undo");
        sections.push("# or");
        sections.push("npx tsx src/index.ts --undo");
        sections.push("```");
        sections.push(
            "This will read this report and revert all file moves/renames."
        );
    }
    sections.push("");

    // --- Footer ---
    sections.push("---");
    sections.push(
        `*Generated by DeskSentinel v1.0.0 | Privacy-first local AI file organizer*`
    );

    // --- Undo Data (hidden in HTML comment for machine parsing) ---
    sections.push("");
    sections.push("<!-- DESKSENTINEL_UNDO_DATA");
    sections.push(JSON.stringify(result.changes, null, 2));
    sections.push("DESKSENTINEL_UNDO_DATA -->");

    const reportContent = sections.join("\n");

    // Write report via Accomplish adapter
    await documentGenerate(reportPath, reportContent);
    logger.success(`Report saved: ${reportPath}`);

    return reportPath;
}

// ---------------------------------------------------------------------------
// Undo Support
// ---------------------------------------------------------------------------

/**
 * Parse a DeskSentinel report to extract undo data.
 * Returns the list of file changes that can be reverted.
 */
export function parseReportForUndo(
    reportContent: string
): { originalPath: string; newPath: string; action: string }[] | null {
    const match = reportContent.match(
        /<!-- DESKSENTINEL_UNDO_DATA\n([\s\S]*?)\nDESKSENTINEL_UNDO_DATA -->/
    );

    if (!match) {
        logger.error("No undo data found in report");
        return null;
    }

    try {
        return JSON.parse(match[1]);
    } catch (err) {
        logger.error(`Failed to parse undo data: ${err}`);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 3) + "...";
}
