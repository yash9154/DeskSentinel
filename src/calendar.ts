// ============================================================================
// DeskSentinel — Calendar Integration
// ============================================================================
// Schedules cleanup reminders using Accomplish calendar API.
// Creates recurring weekly events and one-time duplicate review reminders.
// ============================================================================

import { Logger } from "./utils.js";
import { calendarAddEvent, CalendarEvent } from "./accomplish.js";

const logger = new Logger("Calendar");

// ---------------------------------------------------------------------------
// Schedule Weekly Cleanup
// ---------------------------------------------------------------------------

/**
 * Schedule a recurring weekly cleanup reminder.
 * Event: "Weekly DeskSentinel Cleanup" every Sunday at 8 PM.
 *
 * Accomplish Integration Point:
 * Uses calendar.addEvent() to create a recurring event in the user's calendar.
 */
export async function scheduleWeeklyCleanup(): Promise<void> {
    logger.divider("📅 CALENDAR INTEGRATION");

    // Calculate next Sunday at 8 PM
    const now = new Date();
    const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + daysUntilSunday);
    nextSunday.setHours(20, 0, 0, 0);

    const event: CalendarEvent = {
        title: "🛡️ Weekly DeskSentinel Cleanup",
        description:
            "Time to run DeskSentinel and clean up your Desktop & Downloads!\n\n" +
            "Run: npm run dev\n" +
            "Or: npx tsx src/index.ts\n\n" +
            "Keep your workspace clean and organized! 🧹",
        startTime: nextSunday,
        recurrence: "weekly",
    };

    try {
        await calendarAddEvent(event);
        logger.success(
            `Scheduled weekly cleanup: Sundays at 8:00 PM (next: ${nextSunday.toLocaleDateString("en-IN")})`
        );
    } catch (err) {
        logger.warn(`Failed to schedule weekly cleanup: ${err}`);
    }
}

// ---------------------------------------------------------------------------
// Schedule Duplicate Review
// ---------------------------------------------------------------------------

/**
 * Schedule a one-time reminder to review detected duplicates.
 * Only created if duplicates > 0.
 *
 * Accomplish Integration Point:
 * Uses calendar.addEvent() to create a one-time reminder event.
 */
export async function scheduleDuplicateReview(
    duplicateCount: number
): Promise<void> {
    if (duplicateCount <= 0) {
        logger.info("No duplicates found — skipping review reminder");
        return;
    }

    // Schedule for tomorrow at 10 AM
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    const event: CalendarEvent = {
        title: "🔍 Review DeskSentinel Duplicates",
        description:
            `DeskSentinel found ${duplicateCount} duplicate file(s) during cleanup.\n\n` +
            `Check the "Duplicates_To_Review" folder and decide which to keep.\n\n` +
            `Remember: DeskSentinel never deletes files automatically — your data is safe! 🔒`,
        startTime: tomorrow,
        recurrence: "none",
    };

    try {
        await calendarAddEvent(event);
        logger.success(
            `Scheduled duplicate review reminder for ${tomorrow.toLocaleDateString("en-IN")} at 10:00 AM`
        );
    } catch (err) {
        logger.warn(`Failed to schedule duplicate review: ${err}`);
    }
}

// ---------------------------------------------------------------------------
// Main Calendar Handler
// ---------------------------------------------------------------------------

/**
 * Handle all calendar scheduling based on cleanup results.
 *
 * @param duplicateCount - Number of duplicates found
 * @param enableCalendar - Whether calendar integration is enabled
 * @param dryRun - If true, skip calendar actions
 */
export async function handleCalendar(
    duplicateCount: number,
    enableCalendar: boolean,
    dryRun: boolean
): Promise<void> {
    if (!enableCalendar) {
        logger.info("Calendar integration disabled in config");
        return;
    }

    if (dryRun) {
        logger.info("[DRY-RUN] Would schedule weekly cleanup reminder (Sundays 8 PM)");
        if (duplicateCount > 0) {
            logger.info(
                `[DRY-RUN] Would schedule duplicate review reminder (${duplicateCount} duplicates)`
            );
        }
        return;
    }

    await scheduleWeeklyCleanup();
    await scheduleDuplicateReview(duplicateCount);
}
