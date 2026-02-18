# 🛡️ DeskSentinel — AI Guardian for Desktop & Downloads

> **An Accomplish AI custom skill that uses local AI to scan, understand, rename, organize, and deduplicate messy folders — 100% privately, 100% locally.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Hackathon](https://img.shields.io/badge/Hackathon-WeMakeDevs_Week3-purple.svg)](https://wemakedevs.org)

---

## 🎯 What is DeskSentinel?

DeskSentinel is an intelligent file organization skill for the **Accomplish AI desktop app**. It acts as an AI guardian for your Desktop, Downloads, and any folder you choose — turning chaos into clean, categorized, properly named files.

### The Problem
Every student, freelancer, and developer knows the pain:
- Downloads folder with 500+ files named `download(47).pdf`
- Desktop covered with `IMG_20260216_1432.jpg` screenshots
- UPI payment receipts mixed with college assignments
- Duplicate files wasting gigabytes of space

### The Solution
DeskSentinel uses a **local AI** (Ollama/LM Studio) to:
1. **Scan** your messy folders recursively
2. **Understand** each file using AI summarization
3. **Rename** files with meaningful names (`IMG_20260216_1432.jpg` → `UPI_Payment_Zomato_Feb16_320rs.jpg`)
4. **Organize** into smart category folders
5. **Detect** and segregate duplicates
6. **Generate** a detailed Markdown cleanup report
7. **Schedule** weekly cleanup reminders via Accomplish calendar

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| 🤖 **AI-Powered Summaries** | Local LLM understands file content from filename/metadata |
| 📁 **Smart Categorization** | Auto-creates: `College_Assignments/OS/`, `UPI_Transactions/`, `Projects_Code/`, etc. |
| ✏️ **Intelligent Renaming** | Transforms generic names into descriptive ones |
| 🔄 **Duplicate Detection** | SHA-256 hashing finds exact duplicates |
| 📊 **Markdown Reports** | Detailed cleanup stats with undo data |
| 📅 **Calendar Integration** | Weekly reminders via Accomplish calendar API |
| 🔍 **Dry-Run Mode** | Preview all changes before applying |
| ↩️ **Undo Support** | Revert any cleanup using the report log |
| 🖥️ **Web Dashboard** | Premium dark-mode UI for real-time monitoring & config |
| 🇮🇳 **India-Specific Rules** | Detects UPI, PhonePe, GPay, Zomato, college subjects |
| 🔒 **Privacy-First** | 100% local — no cloud, no data leaves your machine |

---

## 🇮🇳 Why It's Useful for Indian Students & Freelancers

- **College Life**: Auto-detects OS, DS, DBMS, CN, AI, ML assignments and organizes them by subject
- **UPI Receipts**: Recognizes PhonePe, GPay, Paytm, Zomato, Swiggy screenshots and files them properly
- **Freelance Work**: Keeps project code, invoices, and client docs separated and named clearly
- **Privacy**: No data sent to any cloud — perfect for sensitive documents like Aadhaar, PAN, or bank statements

---

## 🔒 Privacy-First: Local AI Explained

DeskSentinel uses a **local AI backend** that runs entirely on your machine:

| Component | Details |
|-----------|---------|
| **LLM Engine** | Ollama or LM Studio (your choice) |
| **Model** | llama3, mistral, or any OpenAI-compatible local model |
| **Endpoint** | `http://localhost:11434` (never leaves your network) |
| **Fallback** | If AI is unavailable, smart heuristic rules take over |
| **Data Flow** | Files are never uploaded — only filenames are sent to the local LLM |

---

## 🚀 Setup Instructions

### Prerequisites

1. **Node.js 18+** — [Download](https://nodejs.org)
2. **Accomplish AI Desktop App** — [Download](https://accomplish.ai)
3. **Ollama** (recommended) — [Download](https://ollama.com)

### Step 1: Install Ollama & Pull a Model

```bash
# Install Ollama (visit https://ollama.com for your OS)
# Then pull a model:
ollama pull llama3
# or
ollama pull mistral
```

### Step 2: Clone & Install DeskSentinel

```bash
git clone https://github.com/yourusername/desksentinel-accomplish.git
cd desksentinel-accomplish
npm install
```

### Step 3: Configure

Edit `desksentinel.config.json`:

```json
{
  "targetFolders": ["~/Desktop", "~/Downloads"],
  "dryRun": true,
  "enableCalendar": true,
  "aiBackend": {
    "provider": "ollama",
    "endpoint": "http://localhost:11434/v1/chat/completions",
    "model": "llama3"
  }
}
```

### Step 4: Run DeskSentinel

```bash
# Start the Web Dashboard (Recommended):
npm run dashboard
# Opens http://localhost:3847

# CLI Options:
# Preview changes first (safe — nothing moves):
npm run dry-run

# Apply changes:
npm run dev

# Undo last cleanup:
npm run undo
```

### Step 5: Register as Accomplish Skill

Load DeskSentinel as a custom skill in Accomplish's skill manager. The skill will appear in your Accomplish dashboard for one-click execution.

---

## 📂 Project Structure

```
desksentinel-accomplish/
├── src/
│   ├── index.ts          # Main orchestrator (CLI + workflow)
│   ├── accomplish.ts     # Accomplish API adapter layer
│   ├── scanner.ts        # Recursive folder scanner
│   ├── summarizer.ts     # AI summarization + heuristic fallback
│   ├── organizer.ts      # Smart file categorization
│   ├── renamer.ts        # Intelligent file renaming
│   ├── duplicates.ts     # SHA-256 duplicate detection
│   ├── reporter.ts       # Markdown report generator
│   ├── calendar.ts       # Calendar reminder scheduling
│   ├── server.ts         # Dashboard API server
│   └── utils.ts          # Shared utilities & types
├── dashboard/
│   └── index.html        # Web Dashboard UI
├── docs/
│   └── README.md         # This file
├── package.json
├── tsconfig.json
├── desksentinel.config.json
└── LICENSE (MIT)
```

---

## 🎬 Demo Instructions

1. Launch the dashboard: `npm run dashboard` → open **http://localhost:3847**
2. Configure target folders and toggle **Dry Run** mode ON
3. Click **Run Dry-Run** to preview all changes
4. Review the **Changes** and **Duplicates** tabs
5. Click **Run Live** to apply
6. Show the organized folder structure in File Explorer
7. Show the generated `DeskSentinel_Report_*.md`

---

## 🏆 Hackathon Submission Details

| Field | Details |
|-------|---------|
| **Hackathon** | Automate Me If You Can (WeMakeDevs, Week 3) |
| **Category** | Accomplish AI Custom Skill |
| **Theme** | Desktop Automation & Local AI |
| **Team** | Solo |
| **Tech** | TypeScript, Ollama, Accomplish SDK, Node.js |

---

## 📚 Learning Journey

Building DeskSentinel taught me:

1. **Accomplish SDK Integration** — How to build custom skills that plug into a desktop AI assistant
2. **Local LLM APIs** — Using Ollama's OpenAI-compatible endpoint for local inference
3. **Privacy-First Design** — Building useful AI tools that never need internet
4. **File System Safety** — Handling locked files, name collisions, and undo support
5. **India-Specific UX** — Optimizing for Indian students' real-world file management pain points

---

## 🔮 Future Improvements

- [ ] **OCR Integration** — Read text from images/PDFs for deeper categorization
- [ ] **Scheduled Auto-Runs** — Automatic background cleanup via Accomplish scheduler
- [ ] **Cloud Backup** — Optional encrypted backup before organizing
- [ ] **Multi-Language Support** — Hindi/Marathi filename detection
- [ ] **Notion/Google Drive Sync** — Organize cloud-synced folders
- [ ] **Custom Category Training** — Let users teach DeskSentinel new categories

- [ ] **File Content Analysis** — Read file contents (not just names) for better AI summaries

---

## 📄 License

MIT License — see [LICENSE](../LICENSE) for details.

---

<p align="center">
  Built with ❤️ for the <strong>WeMakeDevs Hackathon</strong><br/>
  🛡️ DeskSentinel — Your AI Guardian for Desktop & Downloads
</p>
