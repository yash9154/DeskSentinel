# 🎬 DeskSentinel — Demo Script (3 Minutes)

## Overview
This script covers a 3-minute live demo showcasing DeskSentinel organizing a messy folder from chaos to clean.

---

## ⏱️ Segment 1: The Problem (0:00 – 0:45)

### Talking Points
> "Let me show you what most of our desktops and downloads look like..."

### Actions
1. **Open a messy test folder** with 30-40 files:
   - `IMG_20260216_1432.jpg`
   - `IMG_20260216_1433.jpg` (duplicate)
   - `download(47).pdf`
   - `notes.pdf`
   - `os_lecture5_notes.pdf`
   - `PhonePe_UPI_Receipt_Feb16.jpg`
   - `Screenshot_2026-02-16_123456.png`
   - `server.js`
   - `todo.txt`
   - `project_final_v2.zip`
   - `project_final_v2(1).zip` (duplicate)
   - ...more mixed files

2. **Highlight pain points:**
   - "These generic names tell us nothing"
   - "There are duplicates wasting space"
   - "Everything is mixed together — code, receipts, assignments"

---

## ⏱️ Segment 2: DeskSentinel in Action (0:45 – 2:15)

### Talking Points
> "Now let's run DeskSentinel and watch the magic happen..."

### Actions

1. **Launch the Dashboard** (10 seconds):
   ```bash
   npm run dashboard
   ```
   - Show the terminal: "Starting DeskSentinel Dashboard..."
   - Open `http://localhost:3847`
   - Point out the **Premium Dark Mode UI** and real-time stats.

2. **Configure & Scan** (20 seconds):
   - In Dashboard > **Config** tab:
     - Show target folders: `~/Downloads`
     - Toggle **Dry Run Mode** ON
   - Click **Run Dry-Run** button
   - Watch the progress bar fill up
   - Show the **"Files Scanned"** and **"Duplicates Found"** stats populating in real-time.

3. **Review Changes** (30 seconds):
   - Go to **Changes** tab
   - Scroll through the list:
     - "See how it plans to rename `IMG_...` to `UPI_Payment...`?"
   - Go to **Duplicates** tab
     - "It identified 533 duplicates by hash, not just name."

4. **Run Live** (20 seconds):
   - Click **Run Live** button
   - Watch the "Files Moved" and "Renamed" counters go up.
   - "And just like that, 1,600 files are organized locally."

5. **Show the organized folder** (20 seconds):
   - Open the folder in File Explorer / Finder
   - Show the clean structure:
     ```
     📂 College_Assignments/
       📂 OS/
         📄 OS_Lecture5_Notes_Feb10.pdf
     📂 UPI_Transactions/
         📄 UPI_Payment_Zomato_Feb16_320rs.jpg
     📂 Projects_Code/
         📄 server.js
     📂 Screenshots_Memes/
         📄 Screenshot_Feb16_2026.png
     📂 Duplicates_To_Review/
         📄 project_final_v2(1).zip
     ```

---

## ⏱️ Segment 3: Report & Calendar (2:15 – 2:45)

### Talking Points
> "Every run generates a detailed report..."

### Actions

1. **Open the Markdown report** (15 seconds):
   - Show `DeskSentinel_Report_2026-02-16.md`
   - Highlight:
     - Summary stats table
     - Changes table (old → new)
     - Duplicate groups
     - Undo instructions

2. **Show calendar integration** (15 seconds):
   - Show the Accomplish calendar event:
     - "Weekly DeskSentinel Cleanup — Sundays 8 PM"
     - "Review DeskSentinel Duplicates" (one-time)
   - "Accomplish keeps me on track automatically"

---

## ⏱️ Segment 4: Wrap-Up (2:45 – 3:00)

### Talking Points
> "Let me quickly recap what makes DeskSentinel special..."

### Key Points (rapid-fire)
1. ✅ **100% Local** — Privacy-first, no cloud dependency
2. ✅ **AI-Powered** — Understands files, not just extensions
3. ✅ **India-Specific** — Detects UPI, PhonePe, college subjects
4. ✅ **Safe** — Dry-run mode, undo support, never deletes
5. ✅ **Accomplish-Native** — Full skill integration with calendar

> "DeskSentinel — because your files deserve better than `download(47).pdf`."

---

## 🎥 Recording Tips

- Use a clean, well-lit screen recording setup
- Zoom into terminal and file explorer for readability
- Use a dark terminal theme for visual appeal
- Pre-populate the test folder with realistic Indian student files
- Keep energy high and pacing tight — 3 minutes goes fast!
