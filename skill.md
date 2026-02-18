# 🛡️ DeskSentinel — AI Guardian for Desktop & Downloads

## Description
DeskSentinel is an intelligent file organization skill that scans, understands, renames, organizes, and deduplicates messy folders — 100% privately, 100% locally.

## What This Skill Does
- **Scans** your Desktop, Downloads, or any folder recursively
- **Understands** each file using AI summarization (or smart heuristic fallback)
- **Renames** files with meaningful names (e.g., `IMG_20260216.jpg` → `UPI_Payment_Zomato_Feb16.jpg`)
- **Organizes** into smart category folders (College_Assignments, UPI_Transactions, Projects_Code, etc.)
- **Detects** duplicate files using SHA-256 hashing
- **Generates** a detailed Markdown cleanup report
- **Schedules** weekly cleanup reminders via Accomplish calendar

## When to Use
Use this skill when the user wants to:
- Clean up their Desktop or Downloads folder
- Organize messy files by category
- Find and remove duplicate files
- Rename files with meaningful names
- Get a summary of what's in a folder

## Example Prompts
- "Clean up my Downloads folder"
- "Organize my Desktop"
- "Find duplicates in my files"
- "Rename all the generic files in Downloads"
- "Scan my Desktop and tell me what's there"
- "Do a dry-run cleanup of my Downloads"

## How to Run

### Web Dashboard (Recommended)
```bash
npm run dashboard
```
Opens a premium dark-mode dashboard at `http://localhost:3847` with real-time progress, config editor, and interactive charts.

### CLI Mode
```bash
# Preview changes (safe — nothing moves):
npm run dry-run

# Apply changes:
npm run dev

# Undo last cleanup:
npm run undo
```

## Configuration
Edit `desksentinel.config.json` to customize:
- **targetFolders**: Which folders to scan (e.g., `~/Desktop`, `~/Downloads`)
- **dryRun**: Preview mode (true/false)
- **aiBackend**: AI provider settings (Ollama, LM Studio, or any OpenAI-compatible endpoint)
- **enableCalendar**: Schedule cleanup reminders via Accomplish calendar

## Requirements
- Node.js 18+
- `npm install` (one-time setup)
- Optional: Ollama or LM Studio for AI-powered summaries (falls back to heuristic rules automatically)

## Privacy
100% local — no data ever leaves your machine. Only filenames are analyzed (never file contents). Works fully offline.
