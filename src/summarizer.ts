// ============================================================================
// DeskSentinel — AI Summarizer
// ============================================================================
// Uses local LLM (Ollama / LM Studio / OpenAI-compatible) to generate
// structured file summaries. Falls back to heuristic rules when AI is
// unavailable. Includes India-specific keyword detection.
// ============================================================================

import * as path from "path";
import {
    ScannedFile,
    FileSummary,
    DeskSentinelConfig,
    Logger,
    sanitizeFileName,
    formatBytes,
} from "./utils.js";

const logger = new Logger("Summarizer");

// ---------------------------------------------------------------------------
// India-Specific Keyword Maps
// ---------------------------------------------------------------------------

const UPI_KEYWORDS = [
    "upi", "phonepe", "gpay", "google_pay", "paytm", "bhim",
    "₹", "rs", "inr", "rupee", "rupees",
    "zomato", "swiggy", "amazon", "flipkart", "myntra", "bigbasket",
    "ola", "uber", "rapido", "dunzo",
    "payment", "transaction", "receipt", "invoice",
];

const COLLEGE_SUBJECTS: Record<string, string[]> = {
    OS: ["operating_system", "os", "process", "scheduling", "deadlock", "semaphore"],
    DS: ["data_structure", "ds", "linked_list", "stack", "queue", "tree", "graph", "sorting"],
    DBMS: ["dbms", "database", "sql", "normalization", "er_diagram", "relational"],
    CN: ["computer_network", "cn", "tcp", "udp", "osi", "routing", "protocol", "network"],
    AI: ["artificial_intelligence", "ai", "search", "heuristic", "neural"],
    ML: ["machine_learning", "ml", "regression", "classification", "clustering", "model"],
    SE: ["software_engineering", "se", "sdlc", "agile", "uml", "requirement"],
    TOC: ["theory_of_computation", "toc", "automata", "grammar", "turing", "finite_automaton"],
    DAA: ["design_and_analysis", "daa", "algorithm", "complexity", "dynamic_programming", "greedy"],
};

// ---------------------------------------------------------------------------
// Local LLM HTTP Call
// ---------------------------------------------------------------------------

/**
 * Call a local OpenAI-compatible LLM endpoint to summarize a file.
 * Works with Ollama, LM Studio, or any compatible local server.
 */
async function callLocalLLM(
    file: ScannedFile,
    config: DeskSentinelConfig
): Promise<FileSummary | null> {
    const prompt = `You are a file organization assistant. Analyze this file and respond ONLY with a JSON object (no markdown, no explanation).

File information:
- Filename: ${file.name}
- Extension: ${file.extension}
- Size: ${formatBytes(file.size)}
- Last modified: ${file.modifiedAt.toISOString().slice(0, 10)}

Respond with this exact JSON format:
{
  "description": "Brief one-line description of what this file likely contains",
  "category": "One of: College_Assignments, UPI_Transactions, Projects_Code, Screenshots_Memes, Documents_Misc, Archives_Zips, Media, Other",
  "subCategory": "Optional subcategory (e.g., subject code like OS, DS, DBMS for college files)",
  "suggestedName": "A clean, descriptive filename without the extension"
}`;

    try {
        const response = await fetch(config.aiBackend.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: config.aiBackend.model,
                messages: [
                    {
                        role: "system",
                        content:
                            "You are a precise file organization AI. Always respond with valid JSON only. No markdown formatting.",
                    },
                    { role: "user", content: prompt },
                ],
                temperature: 0.3,
                max_tokens: 300,
            }),
            signal: AbortSignal.timeout(15000), // 15s timeout
        });

        if (!response.ok) {
            logger.warn(
                `LLM returned ${response.status} for ${file.name}`
            );
            return null;
        }

        const data = (await response.json()) as any;
        const content = data.choices?.[0]?.message?.content?.trim();

        if (!content) {
            logger.warn(`Empty LLM response for ${file.name}`);
            return null;
        }

        // Parse LLM JSON response (handle potential markdown wrapping)
        const jsonStr = content
            .replace(/```json\s*/g, "")
            .replace(/```\s*/g, "")
            .trim();
        const parsed = JSON.parse(jsonStr);

        return {
            description: parsed.description || file.name,
            category: parsed.category || "Other",
            subCategory: parsed.subCategory || undefined,
            suggestedName: sanitizeFileName(parsed.suggestedName || file.name),
            confidence: "ai",
        };
    } catch (err) {
        logger.debug(`LLM call failed for ${file.name}: ${err}`);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Heuristic Fallback Summarizer
// ---------------------------------------------------------------------------

/**
 * When AI is unavailable, use filename + extension heuristics to categorize.
 * Includes India-specific keyword detection for UPI and college subjects.
 */
function heuristicSummarize(file: ScannedFile): FileSummary {
    const nameLower = file.name.toLowerCase().replace(/[_\-.\s]+/g, "_");
    const ext = file.extension.toLowerCase();

    // --- Check for UPI/payment keywords ---
    for (const keyword of UPI_KEYWORDS) {
        if (nameLower.includes(keyword)) {
            return {
                description: `Payment/transaction related file: ${file.name}`,
                category: "UPI_Transactions",
                suggestedName: sanitizeFileName(file.name.replace(ext, "")),
                confidence: "heuristic",
            };
        }
    }

    // --- Check for college subject keywords ---
    for (const [subject, keywords] of Object.entries(COLLEGE_SUBJECTS)) {
        for (const keyword of keywords) {
            if (nameLower.includes(keyword)) {
                return {
                    description: `College assignment/notes related to ${subject}`,
                    category: "College_Assignments",
                    subCategory: subject,
                    suggestedName: sanitizeFileName(file.name.replace(ext, "")),
                    confidence: "heuristic",
                };
            }
        }
    }

    // --- Categorize by file extension ---
    const extensionCategories: Record<string, { category: string; description: string }> = {
        // Code files
        ".ts": { category: "Projects_Code", description: "TypeScript source code" },
        ".js": { category: "Projects_Code", description: "JavaScript source code" },
        ".py": { category: "Projects_Code", description: "Python source code" },
        ".java": { category: "Projects_Code", description: "Java source code" },
        ".cpp": { category: "Projects_Code", description: "C++ source code" },
        ".c": { category: "Projects_Code", description: "C source code" },
        ".go": { category: "Projects_Code", description: "Go source code" },
        ".rs": { category: "Projects_Code", description: "Rust source code" },
        ".html": { category: "Projects_Code", description: "HTML file" },
        ".css": { category: "Projects_Code", description: "CSS stylesheet" },
        ".json": { category: "Projects_Code", description: "JSON data file" },
        ".xml": { category: "Projects_Code", description: "XML file" },
        ".yaml": { category: "Projects_Code", description: "YAML config file" },
        ".yml": { category: "Projects_Code", description: "YAML config file" },
        ".sh": { category: "Projects_Code", description: "Shell script" },
        ".bat": { category: "Projects_Code", description: "Windows batch script" },
        ".ps1": { category: "Projects_Code", description: "PowerShell script" },

        // Images / Screenshots
        ".png": { category: "Screenshots_Memes", description: "PNG image" },
        ".jpg": { category: "Screenshots_Memes", description: "JPEG image" },
        ".jpeg": { category: "Screenshots_Memes", description: "JPEG image" },
        ".gif": { category: "Screenshots_Memes", description: "GIF image" },
        ".webp": { category: "Screenshots_Memes", description: "WebP image" },
        ".bmp": { category: "Screenshots_Memes", description: "Bitmap image" },
        ".svg": { category: "Screenshots_Memes", description: "SVG vector image" },
        ".ico": { category: "Screenshots_Memes", description: "Icon file" },

        // Documents
        ".pdf": { category: "Documents_Misc", description: "PDF document" },
        ".doc": { category: "Documents_Misc", description: "Word document" },
        ".docx": { category: "Documents_Misc", description: "Word document" },
        ".txt": { category: "Documents_Misc", description: "Text file" },
        ".md": { category: "Documents_Misc", description: "Markdown document" },
        ".ppt": { category: "Documents_Misc", description: "PowerPoint presentation" },
        ".pptx": { category: "Documents_Misc", description: "PowerPoint presentation" },
        ".xls": { category: "Documents_Misc", description: "Excel spreadsheet" },
        ".xlsx": { category: "Documents_Misc", description: "Excel spreadsheet" },
        ".csv": { category: "Documents_Misc", description: "CSV data file" },
        ".rtf": { category: "Documents_Misc", description: "Rich text document" },
        ".odt": { category: "Documents_Misc", description: "OpenDocument text" },

        // Archives
        ".zip": { category: "Archives_Zips", description: "ZIP archive" },
        ".rar": { category: "Archives_Zips", description: "RAR archive" },
        ".7z": { category: "Archives_Zips", description: "7-Zip archive" },
        ".tar": { category: "Archives_Zips", description: "TAR archive" },
        ".gz": { category: "Archives_Zips", description: "GZip archive" },
        ".bz2": { category: "Archives_Zips", description: "BZip2 archive" },

        // Media
        ".mp4": { category: "Media", description: "MP4 video" },
        ".mp3": { category: "Media", description: "MP3 audio" },
        ".avi": { category: "Media", description: "AVI video" },
        ".mkv": { category: "Media", description: "MKV video" },
        ".mov": { category: "Media", description: "QuickTime video" },
        ".wav": { category: "Media", description: "WAV audio" },
        ".flac": { category: "Media", description: "FLAC audio" },
        ".ogg": { category: "Media", description: "OGG audio" },
        ".aac": { category: "Media", description: "AAC audio" },
        ".wmv": { category: "Media", description: "WMV video" },
        ".webm": { category: "Media", description: "WebM video" },

        // Executables / installers
        ".exe": { category: "Other", description: "Windows executable" },
        ".msi": { category: "Other", description: "Windows installer" },
        ".dmg": { category: "Other", description: "macOS disk image" },
        ".deb": { category: "Other", description: "Debian package" },
        ".apk": { category: "Other", description: "Android package" },
    };

    const match = extensionCategories[ext];
    if (match) {
        return {
            description: `${match.description}: ${file.name}`,
            category: match.category,
            suggestedName: sanitizeFileName(file.name.replace(ext, "")),
            confidence: "heuristic",
        };
    }

    // Default fallback
    return {
        description: `Uncategorized file: ${file.name}`,
        category: "Other",
        suggestedName: sanitizeFileName(file.name.replace(ext, "")),
        confidence: "heuristic",
    };
}

// ---------------------------------------------------------------------------
// Main Summarization Entry Point
// ---------------------------------------------------------------------------

/**
 * Summarize all scanned files using local AI with heuristic fallback.
 * Returns a Map of file path → FileSummary.
 */
export async function summarizeFiles(
    files: ScannedFile[],
    config: DeskSentinelConfig,
    errors: string[]
): Promise<Map<string, FileSummary>> {
    logger.divider("🤖 AI SUMMARIZATION");

    const summaries = new Map<string, FileSummary>();
    let aiSuccessCount = 0;
    let heuristicCount = 0;
    let errorCount = 0;

    // Try AI first, then fall back to heuristics
    let aiAvailable = true;

    // Quick health check for AI backend
    try {
        const healthCheck = await fetch(config.aiBackend.endpoint.replace("/v1/chat/completions", "/v1/models"), {
            signal: AbortSignal.timeout(3000),
        });
        if (!healthCheck.ok) {
            aiAvailable = false;
            logger.warn("AI backend not responding — using heuristic mode for all files");
        } else {
            logger.info(`AI backend connected: ${config.aiBackend.provider} (${config.aiBackend.model})`);
        }
    } catch {
        aiAvailable = false;
        logger.warn("AI backend unreachable — using heuristic mode for all files");
    }

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const progress = `[${i + 1}/${files.length}]`;

        try {
            let summary: FileSummary | null = null;

            // Attempt AI summarization if available
            if (aiAvailable) {
                summary = await callLocalLLM(file, config);
                if (summary) {
                    aiSuccessCount++;
                    logger.debug(`${progress} AI: ${file.name} → ${summary.category}`);
                }
            }

            // Fall back to heuristics
            if (!summary) {
                summary = heuristicSummarize(file);
                heuristicCount++;
                logger.debug(`${progress} Heuristic: ${file.name} → ${summary.category}`);
            }

            summaries.set(file.path, summary);
        } catch (err) {
            errorCount++;
            const msg = `Failed to summarize ${file.name}: ${err}`;
            logger.error(msg);
            errors.push(msg);

            // Still add a basic heuristic summary
            summaries.set(file.path, heuristicSummarize(file));
        }

        // Log progress every 25 files
        if ((i + 1) % 25 === 0) {
            logger.info(`Progress: ${i + 1}/${files.length} files summarized`);
        }
    }

    logger.divider();
    logger.success(`Summarization complete:`);
    logger.info(`  AI summaries: ${aiSuccessCount}`);
    logger.info(`  Heuristic summaries: ${heuristicCount}`);
    if (errorCount > 0) logger.warn(`  Errors: ${errorCount}`);

    return summaries;
}
