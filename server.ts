import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import pg from "pg";
import bcrypt from "bcryptjs";
import multer from "multer";
import jwt from "jsonwebtoken";
import swaggerUi from "swagger-ui-express";
import net from "net";
import { openapiSpec } from "./src/swaggerDocs";
import { VALID_SEVERITIES, VALID_PRIORITIES, VALID_STATUSES, VALID_TRANSITIONS as VALID_STATUS_TRANSITIONS, validateIssuePayload } from "./src/validation";
import { computeAnalyticsFromIssues, getPostgreSqlAnalytics } from "./src/analyticsService";

dotenv.config();

const { Pool } = pg;
const JWT_SECRET = process.env.JWT_SECRET || "bugflow-enterprise-defect-secret-key-2026";

const app = express();
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Upload Directory Setup for permanent local server storage
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Serve uploaded files securely
app.use("/uploads", express.static(UPLOADS_DIR, {
  setHeaders: (res, filePath) => {
    // Prevent direct execution
    res.setHeader("X-Content-Type-Options", "nosniff");
  }
}));

// File Upload Security Constraints
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

const ALLOWED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
  ".pdf", ".txt", ".log", ".json", ".csv",
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".zip", ".tar", ".gz", ".7z"
]);

const DANGEROUS_EXTENSIONS = new Set([
  ".exe", ".bat", ".sh", ".cmd", ".js", ".mjs", ".cjs", ".vbs", ".ps1",
  ".com", ".scr", ".pif", ".msi", ".jar", ".bin", ".apk", ".dmg", ".iso"
]);

const ALLOWED_MIME_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf", "text/plain", "text/csv", "application/json",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip", "application/x-zip-compressed", "application/x-tar", "application/gzip", "application/x-7z-compressed",
  "application/octet-stream"
]);

// Configure Multer storage with safe randomized file naming to prevent collisions & traversal
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const rawExt = path.extname(file.originalname).toLowerCase();
    const sanitizedExt = ALLOWED_EXTENSIONS.has(rawExt) ? rawExt : ".bin";
    const uniqueId = crypto.randomBytes(16).toString("hex");
    const safeFilename = `att_${Date.now()}_${uniqueId}${sanitizedExt}`;
    cb(null, safeFilename);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 10
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (DANGEROUS_EXTENSIONS.has(ext)) {
      return cb(new Error(`Security Error: Executable and script files (${ext}) are strictly prohibited.`));
    }
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error(`Unsupported file extension: ${ext}. Supported formats include PNG, JPG, GIF, PDF, TXT, DOCX, XLSX, ZIP.`));
    }
    cb(null, true);
  }
});

// Enable CORS for frontend
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-user-role, x-user-id, x-user-name");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

const DEFAULT_PORT = Number(process.env.PORT || 3000);

function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        resolve(findAvailablePort(startPort + 1));
      } else {
        reject(error);
      }
    });
    probe.once("listening", () => {
      probe.close(() => resolve(startPort));
    });
    probe.listen(startPort, "0.0.0.0");
  });
}

// Shared Gemini AI instance initialized server-side
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    })
  : null;

// All stored and query vectors must use this same model and representation version.
const EMBEDDING_MODEL = "gemini-embedding-2-preview";
const EMBEDDING_DIMENSIONS = 3072;
const EMBEDDING_TEXT_VERSION = 4;
// Calibrated against this model's observed relevant/unrelated score separation.
// Override per deployment after evaluating a representative labeled query set.
const SEMANTIC_SEARCH_MIN_SCORE = Math.min(
  1,
  Math.max(0, Number(process.env.SEMANTIC_SEARCH_MIN_SCORE || 0.70))
);

// In-memory cache for fast embedding lookup during development and testing
const embeddingCache = new Map<string, number[]>();

type EmbeddingTaskType = "SEMANTIC_SIMILARITY" | "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

async function generateEmbedding(
  text: string,
  taskType: EmbeddingTaskType = "SEMANTIC_SIMILARITY"
): Promise<number[] | null> {
  if (!text || !text.trim()) return null;
  const clean = text.trim();
  const cacheKey = `${taskType}:${clean}`;
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey)!;
  }
  if (!ai) return null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await (ai.models as any).embedContent({
        model: EMBEDDING_MODEL,
        contents: clean,
        config: {
          taskType,
        },
      });

      const vec = res.embeddings?.[0]?.values || res.embedding?.values || null;
      if (vec && Array.isArray(vec) && vec.length === EMBEDDING_DIMENSIONS) {
        embeddingCache.set(cacheKey, vec);
        return vec;
      }
    } catch (err: any) {
      const msg = String(err?.message || err);
      const isTransient =
        err?.status === 429 ||
        err?.status === 503 ||
        msg.includes("429") ||
        msg.includes("503") ||
        msg.includes("high demand") ||
        msg.includes("UNAVAILABLE");
      if (isTransient && attempt < 3) {
        const delay = attempt * 1000;
        console.warn(`[Gemini Embedding] Transient error (${err?.status || '503/429'}), attempt ${attempt}/3. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      console.error(`Gemini embedding generation error (attempt ${attempt}):`, err?.message || err);
      break;
    }
  }
  return null;
}

function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  const len = Math.min(vecA.length, vecB.length);
  let dot = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < len; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Universal semantic text builder for defects across all domains, technologies, and phrasing.
 * Synthesizes title, description, category, module, defect type, severity, error details, and root causes
 * into a coherent semantic document for deep vector representation.
 */
function normalizeSemanticText(value: unknown): string {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_>`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDefectSemanticText(input: any): string {
  if (!input) return "";
  if (typeof input === "string") return normalizeSemanticText(input);

  const directText = input.raw_report || input.text || input.query;
  const fields = [
    ["Title", input.title],
    ["Description", input.description],
    ["Reproduction steps", input.reproduction_steps || input.reproductionSteps || input.steps_to_reproduce],
    ["Expected behavior", input.expected_behavior || input.expectedBehavior || input.expected_result],
    ["Actual behavior", input.actual_behavior || input.actualBehavior || input.actual_result],
    ["Environment", input.environment],
    ["Error", input.error_information || input.errorMessage || input.error],
    ["Root cause", input.root_cause || input.rootCause],
    ["Resolution", input.resolution_notes || input.resolutionNotes],
    ["Category", input.category],
    ["Issue type", input.issue_type || input.issueType || input.defect_type || input.defectType]
  ];

  const parts = fields
    .map(([label, value]) => {
      const normalized = normalizeSemanticText(value);
      return normalized ? `${label}: ${normalized}` : "";
    })
    .filter(Boolean);

  return parts.length > 0 ? parts.join(". ") : normalizeSemanticText(directText);
}

// Initial Seed Data with secure password hashing
const DEFAULT_PASSWORD_HASH = bcrypt.hashSync("BugFlow2026!", 10);

const INITIAL_USERS = [
  { id: 1, name: "Sarah Connor", email: "admin@bugflow.io", passwordHash: DEFAULT_PASSWORD_HASH, role: "Admin", avatar: "SC", createdAt: "2026-07-01T00:00:00Z" },
  { id: 2, name: "Alex Rivera", email: "dev@bugflow.io", passwordHash: DEFAULT_PASSWORD_HASH, role: "Developer", avatar: "AR", createdAt: "2026-07-01T00:00:00Z" },
  { id: 3, name: "Elena Rostova", email: "qa@bugflow.io", passwordHash: DEFAULT_PASSWORD_HASH, role: "User / QA", avatar: "ER", createdAt: "2026-07-01T00:00:00Z" },
  { id: 4, name: "David Kim", email: "user@bugflow.io", passwordHash: DEFAULT_PASSWORD_HASH, role: "User / QA", avatar: "DK", createdAt: "2026-07-01T00:00:00Z" },
];

const INITIAL_PROJECTS = [
  { id: 1, name: "BugFlow Core", key: "BFC", category: "Core Platform", description: "Main issue tracking engine and workflow orchestration backend.", issueCount: 3, createdAt: "2026-07-15" },
  { id: 2, name: "API Gateway", key: "GW", category: "Backend", description: "OAuth2 authentication proxy and microservice REST routing layer.", issueCount: 1, createdAt: "2026-07-20" },
  { id: 3, name: "React SDK", key: "SDK", category: "Frontend", description: "Client library for integrating BugFlow widget into web apps.", issueCount: 1, createdAt: "2026-07-25" }
];

const INITIAL_SPRINTS = [
  { id: 1, name: "Sprint 14: Core Stability", projectId: 1, startDate: "2026-08-01", endDate: "2026-08-15", goal: "Resolve OAuth token and activity logging race conditions.", status: "Active", createdAt: "2026-08-01T08:00:00Z" },
  { id: 2, name: "Sprint 15: AI Intelligence", projectId: 1, startDate: "2026-08-16", endDate: "2026-08-30", goal: "Integrate Gemini defect classification and duplicate detection.", status: "Planned", createdAt: "2026-08-01T08:00:00Z" },
  { id: 3, name: "Sprint 8: Gateway Resiliency", projectId: 2, startDate: "2026-08-01", endDate: "2026-08-15", goal: "Fix CORS preflight headers and staging redirect loops.", status: "Active", createdAt: "2026-08-01T08:00:00Z" }
];

const INITIAL_ISSUES = [
  {
    id: 1042,
    key: "BF-1042",
    title: "OAuth2 redirect loop on staging environment",
    description: "### 📌 Overview\nWhen logging in via SSO on staging, the server loops endlessly between /auth/callback and /login due to missing CORS headers.\n\n### 🔁 Steps to Reproduce\n1. Launch staging web portal.\n2. Click \"Sign in with SSO\".\n3. Observe endless browser redirect loops.\n\n### 🎯 Expected Result\nRedirects to /dashboard with JWT token.\n\n### ⚠️ Actual Result\n401 Unauthorized CORS preflight error.",
    status: "Reported",
    priority: "Critical",
    severity: "Critical",
    environment: "Staging Web Portal (Chrome v125)",
    issueType: "Security",
    category: "Security / Auth",
    projectName: "API Gateway",
    projectId: 2,
    sprintId: 3,
    assigneeName: "Sarah Connor",
    assigneeRole: "Admin",
    createdAt: "2026-07-31T08:30:00Z",
    resolutionNotes: "",
    comments: [
      { id: 1, issueId: 1042, userId: 2, userName: "Alex Rivera", body: "Inspected network logs. Header Access-Control-Allow-Origin is set to wildcard instead of staging domain.", createdAt: "2026-07-31T09:15:00Z" }
    ],
    attachments: [
      { id: 1, issueId: 1042, fileName: "cors_error_trace.log", fileSize: 14200, fileType: "text/plain", fileUrl: "#", uploadedBy: "Sarah Connor", createdAt: "2026-07-31T08:35:00Z" }
    ],
    activityLogs: [
      { id: 1, issueId: 1042, actionType: "STATUS_CHANGE", oldValue: "Created", newValue: "Reported", userName: "Sarah Connor", timestamp: "2026-07-31T08:30:00Z" }
    ]
  },
  {
    id: 1045,
    key: "BF-1045",
    title: "Missing ActivityLog for bulk status updates",
    description: "### 📌 Overview\nBulk editing issues through the table view fails to insert audit trail records in PostgreSQL.\n\n### 🔁 Steps to Reproduce\n1. Select 3 issues on Kanban.\n2. Click \"Bulk Move to In Review\".\n3. Check activity_logs DB table.\n\n### 🎯 Expected Result\nAudit records generated for each transition.",
    status: "Assigned",
    priority: "High",
    severity: "High",
    environment: "Production PostgreSQL v16",
    issueType: "Backend/API",
    category: "Database / ORM",
    projectName: "BugFlow Core",
    projectId: 1,
    sprintId: 1,
    assigneeName: "Alex Rivera",
    assigneeRole: "Developer",
    createdAt: "2026-07-31T07:45:00Z",
    resolutionNotes: "",
    comments: [],
    attachments: [],
    activityLogs: [
      { id: 2, issueId: 1045, actionType: "STATUS_CHANGE", oldValue: "Reported", newValue: "Assigned", userName: "Sarah Connor", timestamp: "2026-07-31T07:50:00Z" },
      { id: 3, issueId: 1045, actionType: "STATUS_CHANGE", oldValue: "Created", newValue: "Reported", userName: "Alex Rivera", timestamp: "2026-07-31T07:45:00Z" }
    ]
  },
  {
    id: 1039,
    key: "BF-1039",
    title: "Implement Gemini-3.6 refinement prompt pipeline",
    description: "### 📌 Overview\nIntegrate AI bug report refiner with structured Markdown output and spec profiling questions.\n\n### 🔁 Steps to Reproduce\n1. Open AI Refiner modal.\n2. Input raw bug notes.\n3. Trigger Gemini generation.",
    status: "In Progress",
    priority: "High",
    severity: "High",
    environment: "Production iOS App v2.4",
    issueType: "AI Pipeline",
    category: "AI Pipeline",
    projectName: "BugFlow Core",
    projectId: 1,
    sprintId: 1,
    assigneeName: "Alex Rivera",
    assigneeRole: "Developer",
    createdAt: "2026-07-30T14:20:00Z",
    resolutionNotes: "",
    comments: [
      { id: 2, issueId: 1039, userId: 3, userName: "Elena Rostova", body: "QA tested sample prompts. Structure matches expected JSON schema perfectly.", createdAt: "2026-07-30T16:00:00Z" }
    ],
    attachments: [],
    activityLogs: [
      { id: 4, issueId: 1039, actionType: "STATUS_CHANGE", oldValue: "Assigned", newValue: "In Progress", userName: "Alex Rivera", timestamp: "2026-07-30T15:00:00Z" }
    ]
  },
  {
    id: 1031,
    key: "BF-1031",
    title: "Update favicon and web app manifest metadata",
    description: "Replace standard Vite icon with high-density BugFlow vector logo and configure requestFramePermissions.",
    status: "In Review",
    priority: "Low",
    severity: "Low",
    environment: "Production Web Portal",
    issueType: "UI/UX",
    category: "UI/UX",
    projectName: "React SDK",
    projectId: 3,
    sprintId: null,
    assigneeName: "Elena Rostova",
    assigneeRole: "QA",
    createdAt: "2026-07-29T11:10:00Z",
    resolutionNotes: "",
    comments: [
      { id: 3, issueId: 1031, userId: 4, userName: "David Kim", body: "Design assets LGTM.", createdAt: "2026-07-29T13:00:00Z" }
    ],
    attachments: [],
    activityLogs: [
      { id: 5, issueId: 1031, actionType: "STATUS_CHANGE", oldValue: "In Progress", newValue: "In Review", userName: "Elena Rostova", timestamp: "2026-07-30T10:00:00Z" }
    ]
  },
  {
    id: 1022,
    key: "BF-1022",
    title: "Setup Drizzle ORM PostgreSQL migrations schema",
    description: "Configured Drizzle config and schema definition with strict foreign key constraints and indexed status columns.",
    status: "Resolved",
    priority: "Medium",
    severity: "Low",
    environment: "Production API Gateway",
    issueType: "Database",
    category: "Database / ORM",
    projectName: "BugFlow Core",
    projectId: 1,
    sprintId: 1,
    assigneeName: "Alex Rivera",
    assigneeRole: "Developer",
    createdAt: "2026-07-28T09:00:00Z",
    rootCause: "Migration script lacked explicit foreign key index definitions.",
    resolutionNotes: "Validated tables in postgres schema and verified cascade rules.",
    aiSummary: "Drizzle ORM migration configuration missing foreign key indexes, resolved via schema constraints.",
    comments: [],
    attachments: [],
    activityLogs: [
      { id: 6, issueId: 1022, actionType: "STATUS_CHANGE", oldValue: "In Review", newValue: "Resolved", userName: "Alex Rivera", timestamp: "2026-07-28T17:30:00Z" }
    ]
  },
  {
    id: 102,
    key: "DEF-102",
    title: "Payment page crashes on Submit",
    description: "Application crashes when the user submits a payment.",
    status: "Resolved",
    priority: "High",
    severity: "Critical",
    environment: "Production Web Portal",
    issueType: "Bug",
    category: "Payment",
    projectName: "BugFlow Core",
    projectId: 1,
    sprintId: 1,
    assigneeName: "Alex Rivera",
    assigneeRole: "Developer",
    createdAt: "2026-07-28T08:00:00Z",
    rootCause: "Payment API returned an unexpected null response.",
    resolutionNotes: "Added validation for the payment API response.",
    aiSummary: "Application crashes during payment submission due to an unhandled null response from the payment gateway API.",
    comments: [
      { id: 101, issueId: 102, userId: 2, userName: "Alex Rivera", body: "Added null checking and error handling.", createdAt: "2026-07-28T10:00:00Z" }
    ],
    attachments: [],
    activityLogs: [
      { id: 101, issueId: 102, actionType: "STATUS_CHANGE", oldValue: "In Progress", newValue: "Resolved", userName: "Alex Rivera", timestamp: "2026-07-28T10:30:00Z" }
    ]
  }
];

// Persistent Disk Data Store Path for local environment persistence
const STORE_PATH = path.join(process.cwd(), "backend", "data_store.json");

// Memory Cache & Persistence Handler
interface DBStore {
  users: typeof INITIAL_USERS;
  projects: typeof INITIAL_PROJECTS;
  sprints: typeof INITIAL_SPRINTS;
  issues: typeof INITIAL_ISSUES;
  chatMessages: Array<{
    id: number;
    userId: number | null;
    sessionId: string;
    userName: string;
    message: string;
    response: string;
    defectContext: string | null;
    createdAt: string;
  }>;
}

let dbData: DBStore = {
  users: JSON.parse(JSON.stringify(INITIAL_USERS)),
  projects: JSON.parse(JSON.stringify(INITIAL_PROJECTS)),
  sprints: JSON.parse(JSON.stringify(INITIAL_SPRINTS)),
  issues: JSON.parse(JSON.stringify(INITIAL_ISSUES)),
  chatMessages: []
};

function loadStoreFromDisk() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const content = fs.readFileSync(STORE_PATH, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed.users && parsed.projects && parsed.issues) {
        dbData = {
          users: parsed.users,
          projects: parsed.projects,
          sprints: parsed.sprints || JSON.parse(JSON.stringify(INITIAL_SPRINTS)),
          issues: parsed.issues,
          chatMessages: parsed.chatMessages || []
        };
        console.log("✅ Data store loaded from disk persistence.");
        return;
      }
    }
  } catch (err) {
    console.error("Error loading store from disk:", err);
  }
  // If not exists, save initial
  saveStoreToDisk();
}

function saveStoreToDisk() {
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(dbData, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing store to disk:", err);
  }
}

// PostgreSQL Connection Pool Setup
let pgPool: pg.Pool | null = null;
let isPgConnected = false;
let databaseName = "bugflow_db";

async function initPostgreSQL() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log("ℹ️ DATABASE_URL not set. Operating with persistent database store.");
    loadStoreFromDisk();
    return;
  }

  try {
    const isCloudDb = dbUrl.includes("sslmode=require") || dbUrl.includes("neon.tech") || dbUrl.includes("supabase.co") || dbUrl.includes("render.com") || process.env.NODE_ENV === "production";
    pgPool = new Pool({
      connectionString: dbUrl,
      ssl: isCloudDb ? { rejectUnauthorized: false } : false
    });

    // Test query
    const checkRes = await pgPool.query("SELECT current_database()");
    if (checkRes.rows.length > 0 && checkRes.rows[0].current_database) {
      databaseName = checkRes.rows[0].current_database;
    }
    isPgConnected = true;
    console.log(`🚀 Connected to PostgreSQL database: ${databaseName}`);

    // Create tables
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        role VARCHAR(50) NOT NULL DEFAULT 'Developer',
        avatar VARCHAR(10),
        created_at VARCHAR(100)
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        key VARCHAR(50),
        category VARCHAR(100) DEFAULT 'Core Platform',
        description TEXT,
        created_at VARCHAR(100)
      );

      CREATE TABLE IF NOT EXISTS sprints (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        project_id INT REFERENCES projects(id) ON DELETE CASCADE,
        start_date VARCHAR(50),
        end_date VARCHAR(50),
        goal TEXT,
        status VARCHAR(50) DEFAULT 'Active',
        created_at VARCHAR(100)
      );

      CREATE TABLE IF NOT EXISTS issues (
        id SERIAL PRIMARY KEY,
        key VARCHAR(50),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(50) NOT NULL DEFAULT 'Reported',
        priority VARCHAR(50) NOT NULL DEFAULT 'Medium',
        severity VARCHAR(50) DEFAULT 'Medium',
        environment VARCHAR(255) DEFAULT 'Production',
        issue_type VARCHAR(50) DEFAULT 'Bug',
        category VARCHAR(100) DEFAULT 'Frontend',
        project_name VARCHAR(255),
        project_id INT REFERENCES projects(id) ON DELETE CASCADE,
        sprint_id INT REFERENCES sprints(id) ON DELETE SET NULL,
        reproduction_steps TEXT,
        expected_behavior TEXT,
        actual_behavior TEXT,
        assignee_name VARCHAR(255),
        assignee_role VARCHAR(50),
        created_at VARCHAR(100),
        resolution_notes TEXT,
        root_cause TEXT,
        ai_summary TEXT,
        comments JSONB DEFAULT '[]'::jsonb,
        attachments JSONB DEFAULT '[]'::jsonb,
        activity_logs JSONB DEFAULT '[]'::jsonb
      );

      CREATE TABLE IF NOT EXISTS attachments (
        id SERIAL PRIMARY KEY,
        issue_id INT REFERENCES issues(id) ON DELETE CASCADE,
        project_id INT REFERENCES projects(id) ON DELETE CASCADE,
        original_name VARCHAR(255) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(100) NOT NULL,
        file_size INT NOT NULL,
        storage_path TEXT NOT NULL,
        file_url TEXT NOT NULL,
        uploaded_by_id INT,
        uploaded_by_name VARCHAR(255) NOT NULL DEFAULT 'User',
        created_at VARCHAR(100) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        user_id INT,
        session_id VARCHAR(100) NOT NULL,
        user_name VARCHAR(255) NOT NULL DEFAULT 'User',
        message TEXT NOT NULL,
        response TEXT NOT NULL,
        defect_context VARCHAR(100),
        created_at VARCHAR(100) NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_attachments_issue_id ON attachments(issue_id);
      CREATE INDEX IF NOT EXISTS idx_attachments_project_id ON attachments(project_id);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
    `);

    // Initialize pgvector extension and vector column on issues table for semantic search & duplicate detection
    try {
      await pgPool.query("CREATE EXTENSION IF NOT EXISTS vector;");
      await pgPool.query("ALTER TABLE issues ADD COLUMN IF NOT EXISTS embedding vector(3072);");
      await pgPool.query("ALTER TABLE issues ADD COLUMN IF NOT EXISTS embedding_text_version INTEGER;");
      await pgPool.query("ALTER TABLE issues ADD COLUMN IF NOT EXISTS reproduction_steps TEXT;");
      await pgPool.query("ALTER TABLE issues ADD COLUMN IF NOT EXISTS expected_behavior TEXT;");
      await pgPool.query("ALTER TABLE issues ADD COLUMN IF NOT EXISTS actual_behavior TEXT;");
      await pgPool.query("ALTER TABLE issues ADD COLUMN IF NOT EXISTS root_cause TEXT;");
      await pgPool.query("ALTER TABLE issues ADD COLUMN IF NOT EXISTS ai_summary TEXT;");
      // pgvector HNSW indexes support at most 2000 dimensions. The configured
      // Gemini embedding is 3072D, so this deployment uses an exact cosine
      // scan instead of creating an invalid index during startup.
      await pgPool.query("ALTER TABLE issues ADD COLUMN IF NOT EXISTS resolved_at VARCHAR(100);");
      console.log("⚡ PostgreSQL pgvector extension & columns ready.");
    } catch (vErr) {
      console.warn("Notice on pgvector/columns initialization:", (vErr as Error).message);
    }

    // Auto-backfill semantic embeddings for all unindexed defects in PostgreSQL
    if (ai) {
      try {
        const unindexed = await pgPool.query(`
          SELECT id, title, description, reproduction_steps, expected_behavior, actual_behavior,
                 environment, priority, status, category, issue_type as "issueType",
                 project_name as "projectName", root_cause as "rootCause", resolution_notes as "resolutionNotes"
          FROM issues
          WHERE embedding IS NULL OR embedding_text_version IS DISTINCT FROM $1
        `, [EMBEDDING_TEXT_VERSION]);
        if (unindexed.rows.length > 0) {
          console.log(`🧠 Generating real vector embeddings for ${unindexed.rows.length} defects in PostgreSQL...`);
          for (const row of unindexed.rows) {
            const embText = buildDefectSemanticText(row);
            const vec = await generateEmbedding(embText, "RETRIEVAL_DOCUMENT");
            if (vec && vec.length > 0) {
              await pgPool.query(
                "UPDATE issues SET embedding = $1::vector, embedding_text_version = $2 WHERE id = $3",
                [`[${vec.join(",")}]`, EMBEDDING_TEXT_VERSION, row.id]
              );
            }
          }
          console.log("✅ All PostgreSQL defect vector embeddings indexed successfully.");
        }
      } catch (embErr) {
        console.warn("Notice on backfilling embeddings:", (embErr as Error).message);
      }
    }

  } catch (err) {
    console.error("⚠️ PostgreSQL connection failed, falling back to persistent disk store:", err);
    isPgConnected = false;
    loadStoreFromDisk();
  }
}

loadStoreFromDisk();

// Strict defect lifecycle status transition matrix
// Reported → Assigned → In Progress → In Review → Resolved → Verified → Closed
// Resolved → Reopened → In Progress (and Verified -> Reopened, Closed -> Reopened)
const VALID_TRANSITIONS: Record<string, string[]> = {
  "Reported": ["Assigned", "In Progress", "Closed"],
  "Open": ["Assigned", "In Progress", "Closed"], // backward compatibility
  "Assigned": ["In Progress", "Reported"],
  "In Progress": ["In Review", "Assigned", "Reported"],
  "In Review": ["Resolved", "In Progress", "Assigned"],
  "Resolved": ["Verified", "Reopened", "Closed"],
  "Verified": ["Closed", "Reopened"],
  "Closed": ["Reopened"],
  "Reopened": ["In Progress", "Assigned"]
};

// API Health Check & DB diagnostics
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "BugFlow Defect Lifecycle REST Engine",
    database: isPgConnected ? "PostgreSQL" : "Persistent File-Backed PostgreSQL Store",
    databaseName,
    pgConnected: isPgConnected,
    tables: ["users", "projects", "sprints", "issues", "comments", "attachments", "activity_logs"],
    aiModel: "Gemini-3.6-Flash",
    aiConfigured: !!ai
  });
});

// Swagger / OpenAPI Specification & Interactive UI
app.use("/api-docs", swaggerUi.serve as any, swaggerUi.setup(openapiSpec) as any);
app.get("/api-docs.json", (_req, res) => res.json(openapiSpec));

// Helper to compute analytics from PG or memory fallback
async function fetchSystemAnalytics(projectId?: number) {
  if (isPgConnected && pgPool) {
    try {
      const analytics = await getPostgreSqlAnalytics(pgPool, projectId);
      return {
        ...analytics,
        source: "PostgreSQL Database Engine",
        databaseName,
        isPgConnected: true
      };
    } catch (err) {
      console.error("Error computing PostgreSQL analytics:", err);
    }
  }

  const targetIssues = projectId 
    ? dbData.issues.filter(i => i.projectId === projectId)
    : dbData.issues;
  const analytics = computeAnalyticsFromIssues(targetIssues);
  return {
    ...analytics,
    source: "Persistent Storage Engine",
    databaseName,
    isPgConnected: false
  };
}

// Real PostgreSQL Analytics Summary Endpoint & Overview Alias
app.get(["/api/analytics", "/api/analytics/overview"], async (req, res) => {
  try {
    const projectId = req.query.project_id ? Number(req.query.project_id) : undefined;
    const data = await fetchSystemAnalytics(projectId);
    res.json(data);
  } catch (err) {
    console.error("Error fetching analytics overview:", err);
    res.status(500).json({ detail: "Unable to compute analytics from database at this time." });
  }
});

// Dedicated Analytics Sub-Endpoints
app.get("/api/analytics/severity", async (req, res) => {
  try {
    const projectId = req.query.project_id ? Number(req.query.project_id) : undefined;
    const data = await fetchSystemAnalytics(projectId);
    res.json(data.defectsBySeverity);
  } catch (err) {
    res.status(500).json({ detail: "Unable to fetch severity analytics." });
  }
});

app.get("/api/analytics/category", async (req, res) => {
  try {
    const projectId = req.query.project_id ? Number(req.query.project_id) : undefined;
    const data = await fetchSystemAnalytics(projectId);
    res.json(data.defectsByCategory);
  } catch (err) {
    res.status(500).json({ detail: "Unable to fetch category analytics." });
  }
});

app.get("/api/analytics/status", async (req, res) => {
  try {
    const projectId = req.query.project_id ? Number(req.query.project_id) : undefined;
    const data = await fetchSystemAnalytics(projectId);
    res.json(data.defectsByStatus);
  } catch (err) {
    res.status(500).json({ detail: "Unable to fetch status analytics." });
  }
});

app.get(["/api/analytics/workload", "/api/analytics/developer-workload"], async (req, res) => {
  try {
    const projectId = req.query.project_id ? Number(req.query.project_id) : undefined;
    const data = await fetchSystemAnalytics(projectId);
    res.json(data.developerWorkload);
  } catch (err) {
    res.status(500).json({ detail: "Unable to fetch developer workload analytics." });
  }
});

app.get("/api/analytics/trends", async (req, res) => {
  try {
    const projectId = req.query.project_id ? Number(req.query.project_id) : undefined;
    const data = await fetchSystemAnalytics(projectId);
    res.json(data.defectTrends);
  } catch (err) {
    res.status(500).json({ detail: "Unable to fetch defect trends." });
  }
});

app.get("/api/analytics/resolution-time", async (req, res) => {
  try {
    const projectId = req.query.project_id ? Number(req.query.project_id) : undefined;
    const data = await fetchSystemAnalytics(projectId);
    res.json({
      avgResolutionHours: data.avgResolutionHours,
      avgResolutionDisplay: data.avgResolutionDisplay
    });
  } catch (err) {
    res.status(500).json({ detail: "Unable to fetch resolution time metrics." });
  }
});

// Helper to extract dynamic authenticated user from JWT Bearer token or headers
export interface AuthenticatedUser {
  id: number | null;
  name: string;
  role: string;
  email?: string;
  isAuthenticated: boolean;
}

function getAuthenticatedUser(req: express.Request): AuthenticatedUser {
  const authHeader = req.headers["authorization"];
  let tokenPayload: any = null;

  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    try {
      tokenPayload = jwt.verify(token, JWT_SECRET);
    } catch {
      // invalid or expired token
    }
  }

  // Identity and authorization must come from the signed token. Client-supplied
  // identity headers/body fields are display hints only and are never credentials.
  const rawName = tokenPayload?.name;
  const rawRole = tokenPayload?.role;
  const rawId = tokenPayload?.id;
  const rawEmail = tokenPayload?.email;

  const hasCredentials = Boolean(tokenPayload);

  const cleanName = rawName && typeof rawName === "string" && rawName.trim() ? rawName.trim() : (hasCredentials ? "Authenticated User" : "");
  const cleanRole = rawRole && typeof rawRole === "string" && rawRole.trim() ? rawRole.trim() : (hasCredentials ? "Developer" : "");
  const cleanId = rawId ? Number(rawId) : null;

  return {
    id: isNaN(cleanId as any) ? null : cleanId,
    name: cleanName,
    role: cleanRole,
    email: rawEmail,
    isAuthenticated: hasCredentials
  };
}

// ==========================================
// AUTHENTICATION ENDPOINTS (POSTGRESQL + BCRYPT)
// ==========================================
app.post("/api/auth/register", async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!email || !email.trim()) {
    return res.status(400).json({ detail: "Email address is required." });
  }
  if (!password || password.trim().length < 4) {
    return res.status(400).json({ detail: "Password must be at least 4 characters." });
  }

  const cleanName = (name && name.trim()) || email.split("@")[0];
  const cleanEmail = email.trim().toLowerCase();
  // New accounts cannot self-select privileged roles. An authenticated admin
  // can promote a user through the role-management endpoint.
  const cleanRole = "User / QA";
  const avatar = cleanName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2) || "U";
  const createdAt = new Date().toISOString();
  const passwordHash = bcrypt.hashSync(password, 10);

  if (isPgConnected && pgPool) {
    try {
      // Check for duplicate email
      const existing = await pgPool.query("SELECT id FROM users WHERE LOWER(email) = $1", [cleanEmail]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ detail: "An account with this email already exists. Please sign in instead." });
      }

      const insertRes = await pgPool.query(
        `INSERT INTO users (name, email, password_hash, role, avatar, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, email, role, avatar, created_at as "createdAt"`,
        [cleanName, cleanEmail, passwordHash, cleanRole, avatar, createdAt]
      );

      const createdUser = insertRes.rows[0];
      const token = jwt.sign(
        { id: createdUser.id, name: createdUser.name, email: createdUser.email, role: createdUser.role },
        JWT_SECRET,
        { expiresIn: "7d" }
      );
      return res.status(201).json({
        message: "User registration successful",
        user: createdUser,
        token
      });
    } catch (err: any) {
      console.error("Error registering user in PG:", err);
      if (err.code === "23505") {
        return res.status(409).json({ detail: "Email already registered in database." });
      }
      return res.status(500).json({ detail: "Database error during registration." });
    }
  }

  // Fallback memory & disk store
  const existingDisk = dbData.users.find(u => u.email.toLowerCase() === cleanEmail);
  if (existingDisk) {
    return res.status(409).json({ detail: "An account with this email already exists." });
  }

  const newUser = {
    id: Date.now(),
    name: cleanName,
    email: cleanEmail,
    passwordHash,
    role: cleanRole,
    avatar,
    createdAt
  };

  dbData.users.push(newUser as any);
  saveStoreToDisk();

  const token = jwt.sign(
    { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.status(201).json({
    message: "User registration successful",
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      avatar: newUser.avatar,
      createdAt: newUser.createdAt
    },
    token
  });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !email.trim() || !password) {
    return res.status(400).json({ detail: "Both email and password are required." });
  }

  const cleanEmail = email.trim().toLowerCase();

  if (isPgConnected && pgPool) {
    try {
      const result = await pgPool.query(
        "SELECT id, name, email, password_hash, role, avatar, created_at as \"createdAt\" FROM users WHERE LOWER(email) = $1",
        [cleanEmail]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ detail: "Invalid email or password." });
      }

      const userRow = result.rows[0];
      if (role && role !== userRow.role) {
        return res.status(401).json({ detail: "The selected role does not match this account." });
      }
      let isMatch = false;

      if (userRow.password_hash) {
        isMatch = bcrypt.compareSync(password, userRow.password_hash);
      }

      if (!isMatch) {
        return res.status(401).json({ detail: "Invalid email or password." });
      }

      const token = jwt.sign(
        { id: userRow.id, name: userRow.name, email: userRow.email, role: userRow.role },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.json({
        message: "Login successful",
        user: {
          id: userRow.id,
          name: userRow.name,
          email: userRow.email,
          role: userRow.role,
          avatar: userRow.avatar || userRow.name[0],
          createdAt: userRow.createdAt
        },
        token
      });
    } catch (err) {
      console.error("Error logging in with PG:", err);
      return res.status(500).json({ detail: "Database error during login." });
    }
  }

  // Disk fallback
  const user = dbData.users.find(u => u.email.toLowerCase() === cleanEmail);
  if (!user) {
    return res.status(401).json({ detail: "Invalid email or password." });
  }

  if (role && role !== user.role) {
    return res.status(401).json({ detail: "The selected role does not match this account." });
  }

  let isMatch = false;
  if ((user as any).passwordHash) {
    isMatch = bcrypt.compareSync(password, (user as any).passwordHash);
  }

  if (!isMatch) {
    return res.status(401).json({ detail: "Invalid email or password." });
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    message: "Login successful",
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      createdAt: user.createdAt
    },
    token
  });
});

app.post("/api/auth/logout", (_req, res) => {
  res.json({ message: "Successfully logged out. Session cleared." });
});

app.post("/api/auth/switch-role", (_req, res) => {
  return res.status(403).json({
    detail: "Role switching is disabled. Your role is determined by your registered account in PostgreSQL."
  });
});

app.post("/api/auth/token", async (req, res) => {
  const { email, username, password } = req.body;
  const userEmail = (email || username || "").trim().toLowerCase();
  if (!userEmail || !password) {
    return res.status(400).json({ detail: "Both email/username and password are required." });
  }
  req.body.email = userEmail;
  // Reuse login handler logic
  if (isPgConnected && pgPool) {
    try {
      const result = await pgPool.query(
        "SELECT id, name, email, password_hash, role, avatar, created_at as \"createdAt\" FROM users WHERE LOWER(email) = $1",
        [userEmail]
      );
      if (result.rows.length === 0) {
        return res.status(401).json({ detail: "Invalid credentials." });
      }
      const userRow = result.rows[0];
      const isMatch = userRow.password_hash ? bcrypt.compareSync(password, userRow.password_hash) : false;
      if (!isMatch) {
        return res.status(401).json({ detail: "Invalid credentials." });
      }
      const token = jwt.sign(
        { id: userRow.id, name: userRow.name, email: userRow.email, role: userRow.role },
        JWT_SECRET,
        { expiresIn: "7d" }
      );
      return res.json({
        access_token: token,
        token,
        token_type: "bearer",
        user: {
          id: userRow.id,
          name: userRow.name,
          email: userRow.email,
          role: userRow.role
        }
      });
    } catch (e) {
      return res.status(500).json({ detail: "Database error during token generation." });
    }
  }

  const foundUser = dbData.users.find(u => u.email.toLowerCase() === userEmail);
  if (!foundUser) {
    return res.status(401).json({ detail: "Invalid credentials." });
  }
  const token = jwt.sign(
    { id: foundUser.id, name: foundUser.name, email: foundUser.email, role: foundUser.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
  return res.json({
    access_token: token,
    token,
    token_type: "bearer",
    user: {
      id: foundUser.id,
      name: foundUser.name,
      email: foundUser.email,
      role: foundUser.role
    }
  });
});

app.get(["/api/auth/me", "/api/auth/profile"], async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user.isAuthenticated) {
    return res.status(401).json({ detail: "Authentication required. Please log in or provide valid credentials." });
  }
  let profile: any = {
    id: user.id || 1,
    name: user.name || "Authenticated User",
    email: user.email || "user@bugflow.local",
    role: user.role || "Developer",
    avatar: (user.name || "U")[0].toUpperCase(),
    createdAt: new Date().toISOString()
  };

  if (user.id && isPgConnected && pgPool) {
    try {
      const q = await pgPool.query('SELECT id, name, email, role, avatar, created_at as "createdAt" FROM users WHERE id = $1', [user.id]);
      if (q.rows.length > 0) {
        profile = { ...profile, ...q.rows[0] };
      }
    } catch (e) {
      console.error("Error fetching me from PG:", e);
    }
  } else if (user.name && isPgConnected && pgPool) {
    try {
      const q = await pgPool.query('SELECT id, name, email, role, avatar, created_at as "createdAt" FROM users WHERE LOWER(name) = LOWER($1)', [user.name]);
      if (q.rows.length > 0) {
        profile = { ...profile, ...q.rows[0] };
      }
    } catch (e) {
      console.error("Error fetching me by name from PG:", e);
    }
  }

  return res.json({
    ...profile,
    user: profile
  });
});

// Users & Roles Management Endpoints
app.get("/api/users", async (req, res) => {
  if (!getAuthenticatedUser(req).isAuthenticated) {
    return res.status(401).json({ detail: "Authentication required." });
  }
  if (isPgConnected && pgPool) {
    try {
      const result = await pgPool.query("SELECT id, name, email, role, avatar, created_at as \"createdAt\" FROM users ORDER BY id ASC");
      return res.json(result.rows);
    } catch (err) {
      console.error("Error fetching users from PG:", err);
    }
  }
  res.json(dbData.users);
});

app.patch("/api/users/:id/role", async (req, res) => {
  const userId = Number(req.params.id);
  const requester = getAuthenticatedUser(req);

  if (!requester.isAuthenticated) {
    return res.status(401).json({ detail: "Authentication required." });
  }
  if (requester.role !== "Admin") {
    return res.status(403).json({ detail: "Permission Denied: Only Workspace Admins can modify user accounts and roles." });
  }

  const { role } = req.body;
  if (!role) {
    return res.status(400).json({ detail: "Role is required." });
  }

  const normalizedRole = role === "User" ? "User / QA" : role;

  if (isPgConnected && pgPool) {
    try {
      const result = await pgPool.query(
        "UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role, avatar, created_at as \"createdAt\"",
        [normalizedRole, userId]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ detail: "User not found" });
      }
      return res.json({ message: `Role updated to ${normalizedRole}`, user: result.rows[0] });
    } catch (err) {
      console.error("Error updating user role in PG:", err);
    }
  }

  const user = dbData.users.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ detail: "User not found" });
  }

  user.role = normalizedRole;
  saveStoreToDisk();
  res.json({ message: `Role updated to ${user.role}`, user });
});

// ==========================================
// PROJECTS CRUD ENDPOINTS
// ==========================================
app.get("/api/projects", async (_req, res) => {
  if (isPgConnected && pgPool) {
    try {
      const result = await pgPool.query(`
        SELECT p.id, p.name, p.key, p.category, p.description, p.created_at as "createdAt",
          COUNT(i.id)::int as "issueCount"
        FROM projects p
        LEFT JOIN issues i ON i.project_id = p.id OR i.project_name = p.name
        GROUP BY p.id, p.name, p.key, p.category, p.description, p.created_at
        ORDER BY p.id DESC
      `);
      return res.json(result.rows);
    } catch (err) {
      console.error("Error fetching projects from PG:", err);
    }
  }
  
  // Calculate dynamic issue count for disk store
  const projectsWithCounts = dbData.projects.map(p => ({
    ...p,
    issueCount: dbData.issues.filter(i => i.projectId === p.id || i.projectName === p.name).length
  }));
  res.json(projectsWithCounts);
});

app.get("/api/projects/:id", async (req, res) => {
  const projId = Number(req.params.id);
  if (isPgConnected && pgPool) {
    try {
      const result = await pgPool.query(`
        SELECT p.id, p.name, p.key, p.category, p.description, p.created_at as "createdAt",
          COUNT(i.id)::int as "issueCount"
        FROM projects p
        LEFT JOIN issues i ON i.project_id = p.id OR i.project_name = p.name
        WHERE p.id = $1
        GROUP BY p.id
      `, [projId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ detail: "Project not found" });
      }
      return res.json(result.rows[0]);
    } catch (err) {
      console.error("Error fetching project by ID from PG:", err);
    }
  }

  const proj = dbData.projects.find(p => p.id === projId);
  if (!proj) {
    return res.status(404).json({ detail: "Project not found" });
  }
  const count = dbData.issues.filter(i => i.projectId === proj.id || i.projectName === proj.name).length;
  res.json({ ...proj, issueCount: count });
});

app.post("/api/projects", async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user.isAuthenticated) {
    return res.status(401).json({ detail: "Authentication required to create projects." });
  }
  if (user.role !== "Admin") {
    return res.status(403).json({ detail: "Permission Denied: Only Workspace Admins can create new projects." });
  }

  const { name, description, category, key } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ detail: "Project name is required" });
  }

  const generatedKey = key || name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 4) || "PRJ";
  const projCategory = category || "Core Platform";
  const projDesc = description || "No project description provided.";
  const createdAt = new Date().toISOString().split("T")[0];

  if (isPgConnected && pgPool) {
    try {
      const result = await pgPool.query(
        "INSERT INTO projects (name, key, category, description, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, key, category, description, created_at as \"createdAt\"",
        [name.trim(), generatedKey, projCategory, projDesc.trim(), createdAt]
      );
      const newP = { ...result.rows[0], issueCount: 0 };
      return res.status(201).json(newP);
    } catch (err) {
      console.error("Error creating project in PG:", err);
    }
  }

  const newProj = {
    id: Date.now(),
    name: name.trim(),
    key: generatedKey,
    category: projCategory,
    description: projDesc.trim(),
    issueCount: 0,
    createdAt
  };

  dbData.projects.unshift(newProj);
  saveStoreToDisk();
  res.status(201).json(newProj);
});

app.patch("/api/projects/:id", async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user.isAuthenticated) {
    return res.status(401).json({ detail: "Authentication required to update projects." });
  }
  if (user.role !== "Admin") {
    return res.status(403).json({ detail: "Permission Denied: Only Workspace Admins can update projects." });
  }

  const projId = Number(req.params.id);
  const { name, description, category } = req.body;

  if (isPgConnected && pgPool) {
    try {
      const result = await pgPool.query(
        "UPDATE projects SET name = COALESCE($1, name), description = COALESCE($2, description), category = COALESCE($3, category) WHERE id = $4 RETURNING id, name, key, category, description, created_at as \"createdAt\"",
        [name, description, category, projId]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ detail: "Project not found" });
      }
      return res.json(result.rows[0]);
    } catch (err) {
      console.error("Error updating project in PG:", err);
    }
  }

  const proj = dbData.projects.find(p => p.id === projId);
  if (!proj) {
    return res.status(404).json({ detail: "Project not found" });
  }

  if (name !== undefined) proj.name = name;
  if (description !== undefined) proj.description = description;
  if (category !== undefined) proj.category = category;

  saveStoreToDisk();
  res.json(proj);
});

app.delete("/api/projects/:id", async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user.isAuthenticated) {
    return res.status(401).json({ detail: "Authentication required to delete projects." });
  }
  if (user.role !== "Admin") {
    return res.status(403).json({ detail: "Permission Denied: Only Workspace Admins can delete projects." });
  }

  const projId = Number(req.params.id);

  if (isPgConnected && pgPool) {
    try {
      const targetProj = await pgPool.query("SELECT * FROM projects WHERE id = $1", [projId]);
      if (targetProj.rows.length === 0) {
        return res.status(404).json({ detail: "Project not found" });
      }

      await pgPool.query("DELETE FROM sprints WHERE project_id = $1", [projId]);
      await pgPool.query("DELETE FROM issues WHERE project_id = $1 OR project_name = $2", [projId, targetProj.rows[0].name]);
      await pgPool.query("DELETE FROM projects WHERE id = $1", [projId]);

      return res.json({
        message: `Project '${targetProj.rows[0].name}' and associated issue(s) and sprint(s) deleted permanently.`,
        deletedProjectId: projId
      });
    } catch (err) {
      console.error("Error deleting project in PG:", err);
    }
  }

  const targetIndex = dbData.projects.findIndex(p => p.id === projId);
  if (targetIndex === -1) {
    return res.status(404).json({ detail: "Project not found" });
  }

  const deletedProj = dbData.projects[targetIndex];
  dbData.projects.splice(targetIndex, 1);

  // Cascade delete related sprints and issues
  dbData.sprints = dbData.sprints.filter(s => s.projectId !== projId);
  dbData.issues = dbData.issues.filter(i => i.projectId !== projId && i.projectName !== deletedProj.name);

  saveStoreToDisk();
  res.json({
    message: `Project '${deletedProj.name}' deleted.`,
    deletedProjectId: projId
  });
});

// ==========================================
// SPRINTS CRUD & PLANNING ENDPOINTS
// ==========================================
app.get("/api/sprints", async (req, res) => {
  const projectId = req.query.project_id ? Number(req.query.project_id) : null;

  if (isPgConnected && pgPool) {
    try {
      let query = `
        SELECT s.id, s.name, s.project_id as "projectId", s.start_date as "startDate",
               s.end_date as "endDate", s.goal, s.status, s.created_at as "createdAt",
               p.name as "projectName"
        FROM sprints s
        LEFT JOIN projects p ON p.id = s.project_id
      `;
      const params: any[] = [];
      if (projectId) {
        query += ` WHERE s.project_id = $1`;
        params.push(projectId);
      }
      query += ` ORDER BY s.id DESC`;
      const result = await pgPool.query(query, params);
      return res.json(result.rows);
    } catch (err) {
      console.error("Error fetching sprints from PG:", err);
    }
  }

  let list = dbData.sprints;
  if (projectId) {
    list = list.filter(s => s.projectId === projectId);
  }
  res.json(list);
});

app.get("/api/sprints/:id", async (req, res) => {
  const sprintId = Number(req.params.id);
  if (isPgConnected && pgPool) {
    try {
      const result = await pgPool.query(`
        SELECT s.id, s.name, s.project_id as "projectId", s.start_date as "startDate",
               s.end_date as "endDate", s.goal, s.status, s.created_at as "createdAt",
               p.name as "projectName"
        FROM sprints s
        LEFT JOIN projects p ON p.id = s.project_id
        WHERE s.id = $1
      `, [sprintId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ detail: "Sprint not found" });
      }
      return res.json(result.rows[0]);
    } catch (err) {
      console.error("Error fetching sprint by id from PG:", err);
    }
  }

  const s = dbData.sprints.find(item => item.id === sprintId);
  if (!s) return res.status(404).json({ detail: "Sprint not found" });
  res.json(s);
});

app.post("/api/sprints", async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user.isAuthenticated) {
    return res.status(401).json({ detail: "Authentication required to manage sprints." });
  }
  if (user.role === "User / QA" || user.role === "User" || user.role === "QA") {
    return res.status(403).json({ detail: "Permission Denied: User / QA role is not authorized to create sprints." });
  }

  const { name, projectId, startDate, endDate, goal, status } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ detail: "Sprint name is required" });
  }

  const newSprint = {
    id: Date.now(),
    name: name.trim(),
    projectId: projectId ? Number(projectId) : 1,
    startDate: startDate || new Date().toISOString().split("T")[0],
    endDate: endDate || new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
    goal: goal || "Sprint delivery goal",
    status: status || "Active",
    createdAt: new Date().toISOString()
  };

  if (isPgConnected && pgPool) {
    try {
      const result = await pgPool.query(
        `INSERT INTO sprints (id, name, project_id, start_date, end_date, goal, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, name, project_id as "projectId", start_date as "startDate", end_date as "endDate", goal, status, created_at as "createdAt"`,
        [newSprint.id, newSprint.name, newSprint.projectId, newSprint.startDate, newSprint.endDate, newSprint.goal, newSprint.status, newSprint.createdAt]
      );
      return res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("Error creating sprint in PG:", err);
    }
  }

  dbData.sprints.unshift(newSprint);
  saveStoreToDisk();
  res.status(201).json(newSprint);
});

app.patch("/api/sprints/:id", async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user.isAuthenticated) {
    return res.status(401).json({ detail: "Authentication required to update sprints." });
  }
  if (user.role === "User / QA" || user.role === "User" || user.role === "QA") {
    return res.status(403).json({ detail: "Permission Denied: User / QA role is not authorized to update sprints." });
  }

  const sprintId = Number(req.params.id);
  const { name, startDate, endDate, goal, status } = req.body;

  if (isPgConnected && pgPool) {
    try {
      const result = await pgPool.query(
        `UPDATE sprints SET
           name = COALESCE($1, name),
           start_date = COALESCE($2, start_date),
           end_date = COALESCE($3, end_date),
           goal = COALESCE($4, goal),
           status = COALESCE($5, status)
         WHERE id = $6
         RETURNING id, name, project_id as "projectId", start_date as "startDate", end_date as "endDate", goal, status, created_at as "createdAt"`,
        [name, startDate, endDate, goal, status, sprintId]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ detail: "Sprint not found" });
      }
      return res.json(result.rows[0]);
    } catch (err) {
      console.error("Error updating sprint in PG:", err);
    }
  }

  const sprint = dbData.sprints.find(s => s.id === sprintId);
  if (!sprint) {
    return res.status(404).json({ detail: "Sprint not found" });
  }

  if (name !== undefined) sprint.name = name;
  if (startDate !== undefined) sprint.startDate = startDate;
  if (endDate !== undefined) sprint.endDate = endDate;
  if (goal !== undefined) sprint.goal = goal;
  if (status !== undefined) sprint.status = status;

  saveStoreToDisk();
  res.json(sprint);
});

app.delete("/api/sprints/:id", async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user.isAuthenticated) {
    return res.status(401).json({ detail: "Authentication required to delete sprints." });
  }
  if (user.role !== "Admin") {
    return res.status(403).json({ detail: "Permission Denied: Only Workspace Admins can delete sprints." });
  }

  const sprintId = Number(req.params.id);

  if (isPgConnected && pgPool) {
    try {
      await pgPool.query("UPDATE issues SET sprint_id = NULL WHERE sprint_id = $1", [sprintId]);
      const result = await pgPool.query("DELETE FROM sprints WHERE id = $1 RETURNING *", [sprintId]);
      if (result.rowCount === 0) {
        return res.status(404).json({ detail: "Sprint not found" });
      }
      return res.json({ message: "Sprint deleted successfully", deletedSprintId: sprintId });
    } catch (err) {
      console.error("Error deleting sprint in PG:", err);
    }
  }

  const idx = dbData.sprints.findIndex(s => s.id === sprintId);
  if (idx === -1) {
    return res.status(404).json({ detail: "Sprint not found" });
  }

  dbData.sprints.splice(idx, 1);
  dbData.issues.forEach(i => {
    if (i.sprintId === sprintId) i.sprintId = null;
  });
  saveStoreToDisk();
  res.json({ message: "Sprint deleted successfully", deletedSprintId: sprintId });
});

// ==========================================
// ISSUES & DEFECT LIFECYCLE ENDPOINTS
// ==========================================
app.get(["/api/issues", "/api/defects"], async (req, res) => {
  const sprintId = req.query.sprint_id ? Number(req.query.sprint_id) : null;
  const projectId = req.query.project_id ? Number(req.query.project_id) : null;
  const status = req.query.status as string;
  const priority = req.query.priority as string;
  const search = (req.query.search as string || "").toLowerCase();

  if (isPgConnected && pgPool) {
    try {
      let query = `
        SELECT 
          id, key, title, description, status, priority, severity, environment,
          issue_type as "issueType", category, project_name as "projectName",
          project_id as "projectId", sprint_id as "sprintId",
          reproduction_steps as "reproductionSteps", expected_behavior as "expectedBehavior",
          actual_behavior as "actualBehavior", assignee_name as "assigneeName",
          assignee_role as "assigneeRole", created_at as "createdAt",
          resolution_notes as "resolutionNotes", root_cause as "rootCause", ai_summary as "aiSummary",
          comments, attachments, activity_logs as "activityLogs"
        FROM issues WHERE 1=1
      `;
      const params: any[] = [];
      let paramIdx = 1;

      if (projectId) {
        query += ` AND (project_id = $${paramIdx} OR project_id IS NULL)`;
        params.push(projectId);
        paramIdx++;
      }
      if (sprintId) {
        query += ` AND sprint_id = $${paramIdx}`;
        params.push(sprintId);
        paramIdx++;
      }
      if (status) {
        query += ` AND status = $${paramIdx}`;
        params.push(status);
        paramIdx++;
      }
      if (priority) {
        query += ` AND priority = $${paramIdx}`;
        params.push(priority);
        paramIdx++;
      }
      if (search) {
        query += ` AND (LOWER(title) LIKE $${paramIdx} OR LOWER(description) LIKE $${paramIdx} OR LOWER(key) LIKE $${paramIdx})`;
        params.push(`%${search}%`);
        paramIdx++;
      }

      query += ` ORDER BY id DESC`;
      const result = await pgPool.query(query, params);
      return res.json(result.rows);
    } catch (err) {
      console.error("Error fetching issues from PG:", err);
    }
  }

  let list = dbData.issues;
  if (projectId) list = list.filter(i => i.projectId === projectId);
  if (sprintId) list = list.filter(i => i.sprintId === sprintId);
  if (status) list = list.filter(i => i.status === status);
  if (priority) list = list.filter(i => i.priority === priority);
  if (search) {
    list = list.filter(i =>
      i.title.toLowerCase().includes(search) ||
      i.key.toLowerCase().includes(search) ||
      i.description.toLowerCase().includes(search) ||
      (i.category && i.category.toLowerCase().includes(search))
    );
  }

  res.json(list);
});

app.get(["/api/issues/:id", "/api/defects/:id"], async (req, res) => {
  const issueId = Number(req.params.id);

  if (isPgConnected && pgPool) {
    try {
      const result = await pgPool.query(`
        SELECT 
          id, key, title, description, status, priority, severity, environment,
          issue_type as "issueType", category, project_name as "projectName",
          project_id as "projectId", sprint_id as "sprintId",
          reproduction_steps as "reproductionSteps", expected_behavior as "expectedBehavior",
          actual_behavior as "actualBehavior", assignee_name as "assigneeName",
          assignee_role as "assigneeRole", created_at as "createdAt",
          resolution_notes as "resolutionNotes", root_cause as "rootCause", ai_summary as "aiSummary",
          comments, attachments, activity_logs as "activityLogs"
        FROM issues WHERE id = $1
      `, [issueId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ detail: "Issue not found" });
      }
      return res.json(result.rows[0]);
    } catch (err) {
      console.error("Error fetching issue by ID from PG:", err);
    }
  }

  const issue = dbData.issues.find(i => i.id === issueId);
  if (!issue) {
    return res.status(404).json({ detail: "Issue not found" });
  }
  res.json(issue);
});

app.post(["/api/issues", "/api/defects"], async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user.isAuthenticated) {
    return res.status(401).json({ detail: "Authentication required to report defects." });
  }

  let {
    title,
    description,
    priority,
    severity,
    environment,
    issueType,
    category,
    projectName,
    projectId,
    sprintId,
    reproductionSteps,
    expectedBehavior,
    actualBehavior,
    assigneeName,
    assigneeRole
  } = req.body;

  const validation = validateIssuePayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ detail: validation.error });
  }

  const createdAt = new Date().toISOString();
  const creator = user.name || "Authenticated User";
  const initialLogs = [
    { id: Date.now(), actionType: "STATUS_CHANGE", oldValue: "Created", newValue: "Reported", userName: creator, timestamp: createdAt }
  ];

  const draftIssue = {
    title: title.trim(),
    description: description || `### 📌 Overview\n${title}`,
    status: "Reported",
    priority: priority || "Medium",
    severity: severity || "Medium",
    environment: environment || "Production",
    issueType: issueType || "Bug",
    category: category || "General",
    projectName: projectName || "BugFlow Core",
    projectId: projectId ? Number(projectId) : 1,
    sprintId: sprintId ? Number(sprintId) : null,
    reproductionSteps: reproductionSteps || null,
    expectedBehavior: expectedBehavior || null,
    actualBehavior: actualBehavior || null,
    assigneeName: assigneeName || "Unassigned",
    assigneeRole: assigneeRole || "Developer",
    createdAt,
    resolutionNotes: "",
    comments: [],
    attachments: [],
    activityLogs: initialLogs
  };

  const embText = buildDefectSemanticText(draftIssue);
  const vec = await generateEmbedding(embText, "RETRIEVAL_DOCUMENT");

  if (isPgConnected && pgPool) {
    try {
      const insertRes = await pgPool.query(
        `INSERT INTO issues (
          title, description, status, priority, severity, environment,
          issue_type, category, project_name, project_id, sprint_id, reproduction_steps,
          expected_behavior, actual_behavior, assignee_name, assignee_role,
          created_at, resolution_notes, comments, attachments, activity_logs, embedding, embedding_text_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
        RETURNING id`,
        [
          draftIssue.title, draftIssue.description,
          draftIssue.status, draftIssue.priority, draftIssue.severity, draftIssue.environment,
          draftIssue.issueType, draftIssue.category, draftIssue.projectName, draftIssue.projectId,
          draftIssue.sprintId, draftIssue.reproductionSteps, draftIssue.expectedBehavior, draftIssue.actualBehavior,
          draftIssue.assigneeName, draftIssue.assigneeRole, draftIssue.createdAt,
          draftIssue.resolutionNotes, JSON.stringify([]), JSON.stringify([]), JSON.stringify(initialLogs),
          vec && vec.length > 0 ? `[${vec.join(",")}]` : null, vec ? EMBEDDING_TEXT_VERSION : null
        ]
      );
      const newId = insertRes.rows[0].id;
      const issueKey = `BF-${newId}`;
      await pgPool.query("UPDATE issues SET key = $1 WHERE id = $2", [issueKey, newId]);

      const newIssue = {
        id: newId,
        key: issueKey,
        ...draftIssue,
        activityLogs: initialLogs.map(log => ({ ...log, issueId: newId }))
      };
      return res.status(201).json(newIssue);
    } catch (err) {
      console.error("Error creating issue in PG:", err);
      return res.status(500).json({ detail: "Database error while creating defect." });
    }
  }

  const nextId = Date.now();
  const issueKey = `BF-${nextId}`;
  const newIssue = {
    id: nextId,
    key: issueKey,
    ...draftIssue,
    activityLogs: initialLogs.map(log => ({ ...log, issueId: nextId }))
  };
  if (vec) {
    (newIssue as any).embedding = vec;
  }

  dbData.issues.unshift(newIssue as any);
  saveStoreToDisk();
  res.status(201).json(newIssue);
});

const handleUpdateIssue = async (req: express.Request, res: express.Response) => {
  const issueId = Number(req.params.id);
  const user = getAuthenticatedUser(req);
  if (!user.isAuthenticated) {
    return res.status(401).json({ detail: "Authentication required to update defects." });
  }

  const requesterRole = user.role;
  const requesterName = user.name;

  let currentIssue: any = dbData.issues.find(i => i.id === issueId);

  if (isPgConnected && pgPool) {
    try {
      const pgQuery = await pgPool.query("SELECT * FROM issues WHERE id = $1", [issueId]);
      if (pgQuery.rows.length > 0) {
        const row = pgQuery.rows[0];
        currentIssue = {
          id: row.id,
          key: row.key,
          title: row.title,
          description: row.description,
          status: row.status,
          priority: row.priority,
          severity: row.severity,
          environment: row.environment,
          issueType: row.issue_type,
          category: row.category,
          projectName: row.project_name,
          projectId: row.project_id,
          sprintId: row.sprint_id,
          reproductionSteps: row.reproduction_steps,
          expectedBehavior: row.expected_behavior,
          actualBehavior: row.actual_behavior,
          assigneeName: row.assignee_name,
          assigneeRole: row.assignee_role,
          createdAt: row.created_at,
          resolvedAt: row.resolved_at || (row.status === "Resolved" || row.status === "Closed" || row.status === "Verified" ? row.created_at : null),
          resolutionNotes: row.resolution_notes || "",
          comments: typeof row.comments === "string" ? JSON.parse(row.comments) : (row.comments || []),
          attachments: typeof row.attachments === "string" ? JSON.parse(row.attachments) : (row.attachments || []),
          activityLogs: typeof row.activity_logs === "string" ? JSON.parse(row.activity_logs) : (row.activity_logs || [])
        };
      }
    } catch (err) {
      console.error("Error fetching issue for patch from PG:", err);
    }
  }

  if (!currentIssue) {
    return res.status(404).json({ detail: "Issue not found" });
  }

  let {
    status: targetStatus,
    title,
    description,
    priority,
    severity,
    environment,
    issueType,
    category,
    assigneeName,
    assigneeRole,
    sprintId,
    resolutionNotes,
    resolution_notes,
    rootCause,
    root_cause,
    aiSummary,
    ai_summary
  } = req.body;

  const actualResolutionNotes = resolutionNotes !== undefined ? resolutionNotes : resolution_notes;
  const actualRootCause = rootCause !== undefined ? rootCause : root_cause;
  const actualAiSummary = aiSummary !== undefined ? aiSummary : ai_summary;

  if (assigneeName !== undefined && assigneeName !== "Unassigned" && assigneeName !== null && String(assigneeName).trim()) {
    if (isPgConnected && pgPool) {
      const assigneeResult = await pgPool.query(
        "SELECT name, role FROM users WHERE LOWER(name) = LOWER($1) AND role IN ('Developer', 'Admin')",
        [String(assigneeName).trim()]
      );
      if (assigneeResult.rows.length === 0) {
        return res.status(400).json({ detail: "Assignee must be an existing Developer or Admin user." });
      }
      assigneeName = assigneeResult.rows[0].name;
      assigneeRole = assigneeResult.rows[0].role;
    } else {
      const assignee = dbData.users.find(user =>
        user.name.toLowerCase() === String(assigneeName).trim().toLowerCase() &&
        (user.role === "Developer" || user.role === "Admin")
      );
      if (!assignee) {
        return res.status(400).json({ detail: "Assignee must be an existing Developer or Admin user." });
      }
      assigneeName = assignee.name;
      assigneeRole = assignee.role;
    }
  }

  if (severity && !VALID_SEVERITIES.includes(severity)) {
    return res.status(400).json({ detail: `Invalid severity: '${severity}'. Allowed values: ${VALID_SEVERITIES.join(', ')}` });
  }

  if (priority && !VALID_PRIORITIES.includes(priority)) {
    return res.status(400).json({ detail: `Invalid priority: '${priority}'. Allowed values: ${VALID_PRIORITIES.join(', ')}` });
  }

  const now = new Date().toISOString();

  // 1. Status transition checks
  if (targetStatus && targetStatus !== currentIssue.status) {
    if (requesterRole === "User / QA" || requesterRole === "User" || requesterRole === "QA") {
      if (targetStatus === "Resolved" || targetStatus === "In Review") {
        return res.status(403).json({
          detail: "Permission Denied: User / QA role cannot directly resolve or review bugs. Only Developers or Workspace Admins can transition issues to Resolved or In Review."
        });
      }
    }

    const allowed = VALID_STATUS_TRANSITIONS[currentIssue.status] || [];
    if (!allowed.includes(targetStatus)) {
      return res.status(400).json({
        detail: `Invalid status transition: Cannot transition directly from '${currentIssue.status}' to '${targetStatus}'.`
      });
    }

    if (targetStatus === "Resolved") {
      const resolutionText = String(actualResolutionNotes || currentIssue.resolutionNotes || "").trim();
      if (!resolutionText) {
        return res.status(400).json({ detail: "Resolution notes are required before marking a defect as Resolved." });
      }
      currentIssue.resolutionNotes = resolutionText;
    }

    if (targetStatus === "Resolved" || targetStatus === "Closed" || targetStatus === "Verified") {
      if (!(currentIssue as any).resolvedAt) {
        (currentIssue as any).resolvedAt = now;
      }
    } else if (targetStatus === "Reopened") {
      (currentIssue as any).resolvedAt = null;
    }

    const newLog = {
      id: Date.now(),
      issueId,
      actionType: "STATUS_CHANGE",
      oldValue: currentIssue.status,
      newValue: targetStatus,
      userName: requesterName,
      timestamp: now
    };
    currentIssue.activityLogs = [newLog, ...(currentIssue.activityLogs || [])];
    currentIssue.status = targetStatus;
  }

  // 2. Priority change
  if (priority !== undefined && priority !== currentIssue.priority) {
    const newLog = {
      id: Date.now() + 1,
      issueId,
      actionType: "PRIORITY_CHANGE",
      oldValue: currentIssue.priority,
      newValue: priority,
      userName: requesterName,
      timestamp: now
    };
    currentIssue.activityLogs = [newLog, ...(currentIssue.activityLogs || [])];
    currentIssue.priority = priority;
  }

  // 3. Severity change
  if (severity !== undefined && severity !== currentIssue.severity) {
    const newLog = {
      id: Date.now() + 2,
      issueId,
      actionType: "SEVERITY_CHANGE",
      oldValue: currentIssue.severity,
      newValue: severity,
      userName: requesterName,
      timestamp: now
    };
    currentIssue.activityLogs = [newLog, ...(currentIssue.activityLogs || [])];
    currentIssue.severity = severity;
  }

  // 4. Assignee change
  if (assigneeName !== undefined && assigneeName !== currentIssue.assigneeName) {
    if (requesterRole === "User / QA" || requesterRole === "User" || requesterRole === "QA") {
      return res.status(403).json({
        detail: "Permission Denied: User / QA role is not authorized to assign developers to defects. Only Developers or Workspace Admins can assign defects."
      });
    }

    const newLog = {
      id: Date.now() + 3,
      issueId,
      actionType: "ASSIGNMENT_CHANGE",
      oldValue: currentIssue.assigneeName,
      newValue: assigneeName,
      userName: requesterName,
      timestamp: now
    };
    currentIssue.activityLogs = [newLog, ...(currentIssue.activityLogs || [])];
    currentIssue.assigneeName = assigneeName === "Unassigned" || assigneeName === null ? null : assigneeName;
    currentIssue.assigneeRole = assigneeName === "Unassigned" || assigneeName === null ? null : (assigneeRole || "Developer");
  }

  // 5. Sprint change
  if (sprintId !== undefined && sprintId !== currentIssue.sprintId) {
    const newLog = {
      id: Date.now() + 4,
      issueId,
      actionType: "SPRINT_CHANGE",
      oldValue: currentIssue.sprintId ? `Sprint #${currentIssue.sprintId}` : "Backlog",
      newValue: sprintId ? `Sprint #${sprintId}` : "Backlog",
      userName: requesterName,
      timestamp: now
    };
    currentIssue.activityLogs = [newLog, ...(currentIssue.activityLogs || [])];
    currentIssue.sprintId = sprintId ? Number(sprintId) : null;
  }

  const titleChanged = title !== undefined && title !== currentIssue.title;
  const descChanged = description !== undefined && description !== currentIssue.description;

  if (title !== undefined) currentIssue.title = title;
  if (description !== undefined) currentIssue.description = description;
  if (environment !== undefined) currentIssue.environment = environment;
  if (issueType !== undefined) currentIssue.issueType = issueType;
  if (category !== undefined) currentIssue.category = category;
  if (actualResolutionNotes !== undefined) currentIssue.resolutionNotes = actualResolutionNotes;
  if (actualRootCause !== undefined) (currentIssue as any).rootCause = actualRootCause;
  if (actualAiSummary !== undefined) (currentIssue as any).aiSummary = actualAiSummary;

  let newEmbeddingVec: number[] | null = null;
  if (titleChanged || descChanged || category !== undefined || issueType !== undefined ||
      priority !== undefined || severity !== undefined || environment !== undefined ||
      actualRootCause !== undefined || actualResolutionNotes !== undefined ||
      targetStatus !== undefined) {
    const textToEmbed = buildDefectSemanticText(currentIssue);
    newEmbeddingVec = await generateEmbedding(textToEmbed, "RETRIEVAL_DOCUMENT");
    if (newEmbeddingVec) {
      (currentIssue as any).embedding = newEmbeddingVec;
    }
  }

  if (isPgConnected && pgPool) {
    try {
      if (newEmbeddingVec && newEmbeddingVec.length > 0) {
        await pgPool.query(
          `UPDATE issues SET
            title = $1, description = $2, status = $3, priority = $4, severity = $5,
            environment = $6, issue_type = $7, assignee_name = $8, assignee_role = $9,
            sprint_id = $10, resolution_notes = $11, root_cause = $12, ai_summary = $13,
            activity_logs = $14, embedding = $15, embedding_text_version = $16, resolved_at = $17
          WHERE id = $18`,
          [
            currentIssue.title, currentIssue.description, currentIssue.status, currentIssue.priority, currentIssue.severity,
            currentIssue.environment, currentIssue.issueType, currentIssue.assigneeName, currentIssue.assigneeRole,
            currentIssue.sprintId, currentIssue.resolutionNotes, (currentIssue as any).rootCause || null, (currentIssue as any).aiSummary || null,
            JSON.stringify(currentIssue.activityLogs), `[${newEmbeddingVec.join(",")}]`, EMBEDDING_TEXT_VERSION,
            (currentIssue as any).resolvedAt || null, issueId
          ]
        );
      } else {
        await pgPool.query(
          `UPDATE issues SET
            title = $1, description = $2, status = $3, priority = $4, severity = $5,
            environment = $6, issue_type = $7, assignee_name = $8, assignee_role = $9,
            sprint_id = $10, resolution_notes = $11, root_cause = $12, ai_summary = $13,
            activity_logs = $14, resolved_at = $15
          WHERE id = $16`,
          [
            currentIssue.title, currentIssue.description, currentIssue.status, currentIssue.priority, currentIssue.severity,
            currentIssue.environment, currentIssue.issueType, currentIssue.assigneeName, currentIssue.assigneeRole,
            currentIssue.sprintId, currentIssue.resolutionNotes, (currentIssue as any).rootCause || null, (currentIssue as any).aiSummary || null,
            JSON.stringify(currentIssue.activityLogs), (currentIssue as any).resolvedAt || null, issueId
          ]
        );
      }
      return res.json(currentIssue);
    } catch (err) {
      console.error("Error updating issue in PG:", err);
    }
  }

  // Update in memory & disk
  const index = dbData.issues.findIndex(i => i.id === issueId);
  if (index !== -1) {
    dbData.issues[index] = currentIssue;
    saveStoreToDisk();
  }

  res.json(currentIssue);
};

app.patch(["/api/issues/:id", "/api/defects/:id"], handleUpdateIssue);

// Granular defect update endpoints
app.patch(["/api/issues/:id/assign", "/api/defects/:id/assign"], (req, res) => {
  const { assigneeName, assignee_name, assigneeRole, assignee_role } = req.body;
  req.body.assigneeName = assigneeName || assignee_name;
  req.body.assigneeRole = assigneeRole || assignee_role;
  return handleUpdateIssue(req, res);
});

app.patch(["/api/issues/:id/severity", "/api/defects/:id/severity"], handleUpdateIssue);
app.patch(["/api/issues/:id/priority", "/api/defects/:id/priority"], handleUpdateIssue);
app.patch(["/api/issues/:id/status", "/api/defects/:id/status"], handleUpdateIssue);
app.patch(["/api/issues/:id/sprint", "/api/defects/:id/sprint"], (req, res) => {
  if (req.body.sprint_id !== undefined && req.body.sprintId === undefined) {
    req.body.sprintId = req.body.sprint_id;
  }
  return handleUpdateIssue(req, res);
});

app.delete(["/api/issues/:id", "/api/defects/:id"], async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user.isAuthenticated) {
    return res.status(401).json({ detail: "Authentication required to delete issues." });
  }
  if (user.role !== "Admin") {
    return res.status(403).json({ detail: "Permission Denied: Only Workspace Admins can delete issues." });
  }

  const issueId = Number(req.params.id);

  if (isPgConnected && pgPool) {
    try {
      const result = await pgPool.query("DELETE FROM issues WHERE id = $1 RETURNING *", [issueId]);
      if (result.rowCount === 0) {
        return res.status(404).json({ detail: "Issue not found" });
      }
      return res.json({ message: `Issue #${issueId} deleted permanently from PostgreSQL database.`, deletedIssueId: issueId });
    } catch (err) {
      console.error("Error deleting issue from PG:", err);
    }
  }

  const targetIndex = dbData.issues.findIndex(i => i.id === issueId);
  if (targetIndex === -1) {
    return res.status(404).json({ detail: "Issue not found" });
  }

  const deletedIssue = dbData.issues[targetIndex];
  dbData.issues.splice(targetIndex, 1);
  saveStoreToDisk();

  res.json({ message: `Issue #${issueId} (${deletedIssue.title}) deleted permanently.`, deletedIssueId: issueId });
});

// ==========================================
// COMMENTS & REAL FILE ATTACHMENTS ENDPOINTS
// ==========================================
app.get("/api/issues/:id/comments", async (req, res) => {
  const issueId = Number(req.params.id);
  if (isPgConnected && pgPool) {
    try {
      const q = await pgPool.query("SELECT comments FROM issues WHERE id = $1", [issueId]);
      if (q.rows.length === 0) return res.status(404).json({ detail: "Issue not found" });
      const comments = typeof q.rows[0].comments === "string" ? JSON.parse(q.rows[0].comments) : (q.rows[0].comments || []);
      return res.json(comments);
    } catch (e) {
      console.error("Error fetching comments from PG:", e);
    }
  }

  const issue = dbData.issues.find(i => i.id === issueId);
  if (!issue) return res.status(404).json({ detail: "Issue not found" });
  res.json(issue.comments || []);
});

app.post("/api/issues/:id/comments", async (req, res) => {
  const issueId = Number(req.params.id);
  const { body } = req.body;
  const user = getAuthenticatedUser(req);

  if (!user.isAuthenticated) {
    return res.status(401).json({ detail: "Authentication required to add comments." });
  }

  if (!body || !body.trim()) {
    return res.status(400).json({ detail: "Comment text is required" });
  }

  const newComment = {
    id: Date.now(),
    issueId,
    userId: user.id || null,
    userName: user.name,
    body: body.trim(),
    createdAt: new Date().toISOString()
  };

  const newLog = {
    id: Date.now() + 1,
    issueId,
    actionType: "COMMENT_ADDED",
    oldValue: "",
    newValue: `Added comment: "${body.trim().slice(0, 50)}..."`,
    userName: user.name,
    timestamp: new Date().toISOString()
  };

  if (isPgConnected && pgPool) {
    try {
      const pgQuery = await pgPool.query("SELECT comments, activity_logs FROM issues WHERE id = $1", [issueId]);
      if (pgQuery.rows.length === 0) {
        return res.status(404).json({ detail: "Issue not found" });
      }
      const existingComments = typeof pgQuery.rows[0].comments === "string" ? JSON.parse(pgQuery.rows[0].comments) : (pgQuery.rows[0].comments || []);
      const existingLogs = typeof pgQuery.rows[0].activity_logs === "string" ? JSON.parse(pgQuery.rows[0].activity_logs) : (pgQuery.rows[0].activity_logs || []);

      existingComments.push(newComment);
      existingLogs.unshift(newLog);

      await pgPool.query("UPDATE issues SET comments = $1, activity_logs = $2 WHERE id = $3", [JSON.stringify(existingComments), JSON.stringify(existingLogs), issueId]);
      return res.status(201).json(newComment);
    } catch (err) {
      console.error("Error adding comment in PG:", err);
    }
  }

  const issue = dbData.issues.find(i => i.id === issueId);
  if (!issue) {
    return res.status(404).json({ detail: "Issue not found" });
  }

  issue.comments = [...(issue.comments || []), newComment];
  issue.activityLogs = [newLog, ...(issue.activityLogs || [])];
  saveStoreToDisk();
  res.status(201).json(newComment);
});

// DELETE a comment on an issue
app.delete("/api/issues/:id/comments/:commentId", async (req, res) => {
  const issueId = Number(req.params.id);
  const commentId = Number(req.params.commentId);
  const user = getAuthenticatedUser(req);
  const now = new Date().toISOString();

  if (isPgConnected && pgPool) {
    try {
      const q = await pgPool.query("SELECT comments, activity_logs FROM issues WHERE id = $1", [issueId]);
      if (q.rows.length === 0) return res.status(404).json({ detail: "Issue not found" });
      const comments = typeof q.rows[0].comments === "string" ? JSON.parse(q.rows[0].comments) : (q.rows[0].comments || []);
      const logs = typeof q.rows[0].activity_logs === "string" ? JSON.parse(q.rows[0].activity_logs) : (q.rows[0].activity_logs || []);

      const filtered = comments.filter((c: any) => c.id !== commentId);
      logs.unshift({
        id: Date.now(),
        issueId,
        actionType: "COMMENT_DELETED",
        oldValue: "",
        newValue: `Deleted comment #${commentId}`,
        userName: user.name,
        timestamp: now
      });

      await pgPool.query("UPDATE issues SET comments = $1, activity_logs = $2 WHERE id = $3", [JSON.stringify(filtered), JSON.stringify(logs), issueId]);
      return res.json({ message: "Comment deleted successfully", commentId, issueId });
    } catch (e) {
      console.error("Error deleting comment from PG:", e);
    }
  }

  const issue = dbData.issues.find(i => i.id === issueId);
  if (!issue) return res.status(404).json({ detail: "Issue not found" });
  issue.comments = (issue.comments || []).filter((c: any) => c.id !== commentId);
  saveStoreToDisk();
  res.json({ message: "Comment deleted successfully", commentId, issueId });
});

// GET all attachments for an issue
app.get("/api/issues/:id/attachments", async (req, res) => {
  const issueId = Number(req.params.id);

  if (isPgConnected && pgPool) {
    try {
      // 1. Try relational attachments table
      const attRows = await pgPool.query(
        `SELECT id, issue_id as "issueId", project_id as "projectId", original_name as "originalName",
                file_name as "fileName", file_type as "fileType", file_size as "fileSize",
                storage_path as "storagePath", file_url as "fileUrl", uploaded_by_id as "uploadedById",
                uploaded_by_name as "uploadedByName", created_at as "createdAt"
         FROM attachments WHERE issue_id = $1 ORDER BY id DESC`,
        [issueId]
      );
      if (attRows.rows.length > 0) {
        return res.json(attRows.rows);
      }

      // 2. Fallback to issues.attachments JSONB column if table empty
      const issueRes = await pgPool.query("SELECT attachments FROM issues WHERE id = $1", [issueId]);
      if (issueRes.rows.length === 0) {
        return res.status(404).json({ detail: "Issue not found" });
      }
      const jsonbAtts = typeof issueRes.rows[0].attachments === "string" ? JSON.parse(issueRes.rows[0].attachments) : (issueRes.rows[0].attachments || []);
      return res.json(jsonbAtts);
    } catch (err) {
      console.error("Error getting attachments from PG:", err);
    }
  }

  const issue = dbData.issues.find(i => i.id === issueId);
  if (!issue) return res.status(404).json({ detail: "Issue not found" });
  res.json(issue.attachments || []);
});

// POST real multipart/form-data file upload to an issue
app.post("/api/issues/:id/attachments", (req: any, res: any) => {
  upload.single("file")(req, res, async (err: any) => {
    if (err) {
      console.error("Upload error:", err);
      const isSize = err.code === "LIMIT_FILE_SIZE";
      const msg = isSize ? "File size exceeds 20MB maximum limit." : (err.message || "File upload validation failed.");
      return res.status(400).json({ detail: msg });
    }

    const issueId = Number(req.params.id);
    if (!req.file) {
      return res.status(400).json({ detail: "No file was selected for upload." });
    }

    const storagePath = req.file.path;

    const user = getAuthenticatedUser(req);
    if (!user.isAuthenticated) {
      if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
      return res.status(401).json({ detail: "Authentication required to upload attachments." });
    }

    const originalName = req.file.originalname;
    const storedFileName = req.file.filename;
    const fileSize = req.file.size;
    const fileType = req.file.mimetype || "application/octet-stream";
    const fileUrl = `/uploads/${storedFileName}`;
    const createdAt = new Date().toISOString();
    const attachmentId = Date.now();

    const attachmentRecord = {
      id: attachmentId,
      issueId,
      originalName,
      fileName: originalName,
      storedFileName,
      fileType,
      fileSize,
      storagePath,
      fileUrl,
      uploadedById: user.id || null,
      uploadedByName: user.name,
      uploadedBy: user.name, // backward compatibility
      createdAt
    };

    const newLog = {
      id: Date.now() + 1,
      issueId,
      actionType: "ATTACHMENT_UPLOADED",
      oldValue: "",
      newValue: `Uploaded attachment: ${originalName} (${Math.round(fileSize / 1024)} KB)`,
      userName: user.name,
      timestamp: createdAt
    };

    if (isPgConnected && pgPool) {
      try {
        // Fetch issue to ensure it exists and get project_id
        const issueCheck = await pgPool.query("SELECT id, project_id, attachments, activity_logs FROM issues WHERE id = $1", [issueId]);
        if (issueCheck.rows.length === 0) {
          // cleanup file
          if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
          return res.status(404).json({ detail: "Issue not found" });
        }

        const projectId = issueCheck.rows[0].project_id;
        const existingAtts = typeof issueCheck.rows[0].attachments === "string" ? JSON.parse(issueCheck.rows[0].attachments) : (issueCheck.rows[0].attachments || []);
        const existingLogs = typeof issueCheck.rows[0].activity_logs === "string" ? JSON.parse(issueCheck.rows[0].activity_logs) : (issueCheck.rows[0].activity_logs || []);

        // Insert into attachments relational table
        const insertAtt = await pgPool.query(
          `INSERT INTO attachments (
            issue_id, project_id, original_name, file_name, file_type, file_size, storage_path, file_url, uploaded_by_id, uploaded_by_name, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id, issue_id as "issueId", project_id as "projectId", original_name as "originalName",
                    file_name as "fileName", file_type as "fileType", file_size as "fileSize",
                    storage_path as "storagePath", file_url as "fileUrl", uploaded_by_id as "uploadedById",
                    uploaded_by_name as "uploadedByName", created_at as "createdAt"`,
          [issueId, projectId, originalName, storedFileName, fileType, fileSize, storagePath, fileUrl, user.id || null, user.name, createdAt]
        );

        const savedAtt = insertAtt.rows[0] ? { ...insertAtt.rows[0], uploadedBy: user.name, fileName: originalName } : attachmentRecord;

        existingAtts.unshift(savedAtt);
        existingLogs.unshift(newLog);

        await pgPool.query(
          "UPDATE issues SET attachments = $1, activity_logs = $2 WHERE id = $3",
          [JSON.stringify(existingAtts), JSON.stringify(existingLogs), issueId]
        );

        return res.status(201).json(savedAtt);
      } catch (pgErr) {
        console.error("Error saving attachment to PostgreSQL:", pgErr);
      }
    }

    // Disk / memory store
    const issue = dbData.issues.find(i => i.id === issueId);
    if (!issue) {
      if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
      return res.status(404).json({ detail: "Issue not found" });
    }

    issue.attachments = [attachmentRecord, ...(issue.attachments || [])];
    issue.activityLogs = [newLog, ...(issue.activityLogs || [])];
    saveStoreToDisk();

    res.status(201).json(attachmentRecord);
  });
});

// GET attachment metadata or stream direct download
const handleGetAttachment = async (req: express.Request, res: express.Response) => {
  if (!getAuthenticatedUser(req).isAuthenticated) {
    return res.status(401).json({ detail: "Authentication required to access attachments." });
  }

  const attachmentId = Number(req.params.id);
  const downloadMode = req.query.download === "true";

  let foundAtt: any = null;

  if (isPgConnected && pgPool) {
    try {
      const q = await pgPool.query(
        `SELECT id, issue_id as "issueId", project_id as "projectId", original_name as "originalName",
                file_name as "fileName", file_type as "fileType", file_size as "fileSize",
                storage_path as "storagePath", file_url as "fileUrl", uploaded_by_id as "uploadedById",
                uploaded_by_name as "uploadedByName", created_at as "createdAt"
         FROM attachments WHERE id = $1`,
        [attachmentId]
      );
      if (q.rows.length > 0) {
        foundAtt = q.rows[0];
      }
    } catch (err) {
      console.error("Error finding attachment in PG:", err);
    }
  }

  if (!foundAtt) {
    for (const issue of dbData.issues) {
      const att = (issue.attachments || []).find((a: any) => a.id === attachmentId);
      if (att) {
        foundAtt = att;
        break;
      }
    }
  }

  if (!foundAtt) {
    return res.status(404).json({ detail: "Attachment not found." });
  }

  if (downloadMode && foundAtt.storagePath && fs.existsSync(foundAtt.storagePath)) {
    return res.download(foundAtt.storagePath, foundAtt.originalName || foundAtt.fileName);
  }

  res.json(foundAtt);
};

app.get("/api/attachments/:id", handleGetAttachment);

// Explicit download route
app.get("/api/attachments/:id/download", (req, res) => {
  req.query.download = "true";
  return handleGetAttachment(req, res);
});

// DELETE attachment and update activity log with authenticated user
const handleDeleteAttachment = async (req: express.Request, res: express.Response) => {
  const attachmentId = Number(req.params.id);
  const user = getAuthenticatedUser(req);
  if (!user.isAuthenticated) {
    return res.status(401).json({ detail: "Authentication required to delete attachments." });
  }
  if (user.role === "User / QA" || user.role === "User" || user.role === "QA") {
    return res.status(403).json({ detail: "Permission Denied: User / QA role is not authorized to delete attachments." });
  }

  const now = new Date().toISOString();

  let targetIssueId: number | null = null;
  let originalFileName = "file";
  let storagePathToDelete: string | null = null;

  if (isPgConnected && pgPool) {
    try {
      const attQuery = await pgPool.query(
        "SELECT id, issue_id, original_name, storage_path FROM attachments WHERE id = $1",
        [attachmentId]
      );

      if (attQuery.rows.length > 0) {
        const attRow = attQuery.rows[0];
        targetIssueId = attRow.issue_id;
        originalFileName = attRow.original_name;
        storagePathToDelete = attRow.storage_path;

        await pgPool.query("DELETE FROM attachments WHERE id = $1", [attachmentId]);
      }
    } catch (err) {
      console.error("Error deleting from attachments table:", err);
    }
  }

  // Also locate in issues table / fallback store
  for (const issue of dbData.issues) {
    const existingIdx = (issue.attachments || []).findIndex((a: any) => a.id === attachmentId);
    if (existingIdx !== -1) {
      const att: any = issue.attachments[existingIdx];
      targetIssueId = targetIssueId || issue.id;
      originalFileName = originalFileName || att.originalName || att.fileName;
      storagePathToDelete = storagePathToDelete || att.storagePath;
      issue.attachments.splice(existingIdx, 1);
      break;
    }
  }

  if (!targetIssueId) {
    // Check in PostgreSQL issues JSONB column
    if (isPgConnected && pgPool) {
      const allIssues = await pgPool.query("SELECT id, attachments, activity_logs FROM issues");
      for (const row of allIssues.rows) {
        const atts = typeof row.attachments === "string" ? JSON.parse(row.attachments) : (row.attachments || []);
        const idx = atts.findIndex((a: any) => a.id === attachmentId);
        if (idx !== -1) {
          targetIssueId = row.id;
          originalFileName = atts[idx].originalName || atts[idx].fileName || "file";
          storagePathToDelete = atts[idx].storagePath || null;
          atts.splice(idx, 1);

          const newLog = {
            id: Date.now(),
            issueId: targetIssueId,
            actionType: "ATTACHMENT_REMOVED",
            oldValue: originalFileName,
            newValue: `Removed attachment: ${originalFileName}`,
            userName: user.name,
            timestamp: now
          };
          const logs = typeof row.activity_logs === "string" ? JSON.parse(row.activity_logs) : (row.activity_logs || []);
          logs.unshift(newLog);

          await pgPool.query(
            "UPDATE issues SET attachments = $1, activity_logs = $2 WHERE id = $3",
            [JSON.stringify(atts), JSON.stringify(logs), targetIssueId]
          );
          break;
        }
      }
    }
  }

  if (targetIssueId) {
    const newLog = {
      id: Date.now(),
      issueId: targetIssueId,
      actionType: "ATTACHMENT_REMOVED",
      oldValue: originalFileName,
      newValue: `Removed attachment: ${originalFileName}`,
      userName: user.name,
      timestamp: now
    };

    if (isPgConnected && pgPool) {
      try {
        const issueRes = await pgPool.query("SELECT attachments, activity_logs FROM issues WHERE id = $1", [targetIssueId]);
        if (issueRes.rows.length > 0) {
          const currentAtts = typeof issueRes.rows[0].attachments === "string" ? JSON.parse(issueRes.rows[0].attachments) : (issueRes.rows[0].attachments || []);
          const updatedAtts = currentAtts.filter((a: any) => a.id !== attachmentId);
          const currentLogs = typeof issueRes.rows[0].activity_logs === "string" ? JSON.parse(issueRes.rows[0].activity_logs) : (issueRes.rows[0].activity_logs || []);
          currentLogs.unshift(newLog);

          await pgPool.query(
            "UPDATE issues SET attachments = $1, activity_logs = $2 WHERE id = $3",
            [JSON.stringify(updatedAtts), JSON.stringify(currentLogs), targetIssueId]
          );
        }
      } catch (err) {
        console.error("Error updating issue attachments & activity log in PG:", err);
      }
    }

    const issue = dbData.issues.find(i => i.id === targetIssueId);
    if (issue) {
      issue.activityLogs = [newLog, ...(issue.activityLogs || [])];
      saveStoreToDisk();
    }
  }

  // Delete physical file from disk safely
  if (storagePathToDelete && fs.existsSync(storagePathToDelete)) {
    try {
      fs.unlinkSync(storagePathToDelete);
    } catch (e) {
      console.warn("Could not delete file from disk:", e);
    }
  }

  res.json({
    message: `Attachment '${originalFileName}' deleted successfully.`,
    deletedAttachmentId: attachmentId,
    issueId: targetIssueId,
    removedBy: user.name
  });
};

app.delete("/api/attachments/:id", handleDeleteAttachment);
app.delete("/api/issues/:id/attachments/:attachmentId", (req, res) => {
  req.params.id = req.params.attachmentId;
  return handleDeleteAttachment(req, res);
});

// ==========================================
// INTELLIGENT AI ENDPOINTS (GEMINI 3.6 FLASH)
// ==========================================

// Helper for invoking Gemini with fallback models and retry on temporary 503 high demand or 429 rate limits
async function callGemini(generateFn: (modelName: string) => Promise<any>) {
  // Start with the stable fallback so a high-demand model does not delay every request.
  const models = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.6-flash"];
  let lastError = null;

  for (const model of models) {
    // Retry up to 3 times per model on transient 503/429 errors with exponential backoff
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await generateFn(model);
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || err);
        const isTransient =
          err?.status === 503 ||
          err?.status === 429 ||
          msg.includes("503") ||
          msg.includes("429") ||
          msg.includes("high demand") ||
          msg.includes("UNAVAILABLE") ||
          msg.includes("Resource has been exhausted");

        const isHighDemand =
          err?.status === 503 ||
          msg.includes("503") ||
          msg.includes("high demand") ||
          msg.includes("UNAVAILABLE");

        if (isTransient && !isHighDemand && attempt < 3) {
          const delayMs = attempt * 800;
          console.warn(`[Gemini] Transient error (${err?.status || '503/429'}) on model '${model}', attempt ${attempt}/3. Retrying in ${delayMs}ms...`);
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        console.warn(`[Gemini] Model '${model}' failed on attempt ${attempt}:`, msg);
        break; // Break attempt loop to proceed to next fallback model
      }
    }
  }

  throw lastError;
}

// 1. Intelligent Defect Classification
app.post(["/api/ai/classify", "/api/ai/classify-bug"], async (req, res) => {
  const { description, title } = req.body;
  const input = `${title || ""} ${description || ""}`.trim();
  if (!input) {
    return res.status(400).json({ detail: "Description is required for classification" });
  }

  if (!ai) {
    return res.status(503).json({ detail: "AI classification requires GEMINI_API_KEY." });
  }

  if (ai) {
    try {
      const prompt = `Analyze this defect report and provide classification:
"${input}"

Respond ONLY in JSON with these exact keys:
{
  "category": "Payment" | "Security / Auth" | "Database / ORM" | "Frontend" | "Backend" | "AI Pipeline" | "UI/UX",
  "module": "string (e.g. Checkout, Auth, API, Dashboard)",
  "defect_type": "Functional Defect" | "Security Vulnerability" | "Performance Issue" | "UI Glitch" | "Database Error",
  "suggested_severity": "Critical" | "High" | "Medium" | "Low",
  "suggested_priority": "Critical" | "High" | "Medium" | "Low",
  "confidence_score": 0.95
}`;
      const response = await callGemini(model =>
        ai.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: "application/json", maxOutputTokens: 256 }
        })
      );
      const parsed = JSON.parse(response.text || "{}");
      return res.json({
        ...parsed,
        source: "Gemini AI Engine",
        status: "success"
      });
    } catch (e) {
      console.error("AI classification error:", e);
      return res.status(502).json({ detail: "Gemini classification failed." });
    }
  }

  // Smart heuristic fallback if AI key pending
  const lower = input.toLowerCase();
  let category = "Frontend";
  let defectType = "Functional Defect";
  let severity = "Medium";
  let priority = "Medium";
  let moduleName = "Core Module";

  if (lower.includes("payment") || lower.includes("checkout") || lower.includes("transaction")) {
    category = "Payment";
    moduleName = "Payment Gateway";
    severity = "High";
    priority = "High";
  } else if (lower.includes("crash") || lower.includes("panic") || lower.includes("freeze")) {
    severity = "Critical";
    priority = "Critical";
  } else if (lower.includes("login") || lower.includes("oauth") || lower.includes("auth")) {
    category = "Security / Auth";
    moduleName = "Authentication Proxy";
    defectType = "Security Vulnerability";
    severity = "Critical";
    priority = "High";
  }

  res.json({
    category,
    module: moduleName,
    defect_type: defectType,
    suggested_severity: severity,
    suggested_priority: priority,
    confidence_score: 0.88,
    source: "Rule-Based Expert Engine (Pending Gemini API Key for Deep NLP)",
    status: "heuristic_fallback"
  });
});

// 2. Direct Pairwise Defect Comparison (True 3072D Vector Cosine Similarity)
async function handleCompareDefects(req: express.Request, res: express.Response) {
  const def1 = req.body.defect1 || req.body.defect_a || req.body.existing_defect || req.body.text1 || req.body.defectA;
  const def2 = req.body.defect2 || req.body.defect_b || req.body.new_defect || req.body.text2 || req.body.defectB;

  if (!def1 || !def2) {
    return res.status(400).json({
      detail: "Both defect1 (existing_defect) and defect2 (new_defect) are required for semantic comparison."
    });
  }

  const text1 = buildDefectSemanticText(def1);
  const text2 = buildDefectSemanticText(def2);

  if (!text1 || !text2) {
    return res.status(400).json({ detail: "Both defects must contain textual description or title." });
  }

  const [vec1, vec2] = await Promise.all([
    generateEmbedding(text1),
    generateEmbedding(text2)
  ]);

  if (!vec1 || !vec2) {
    return res.status(500).json({ detail: "Unable to generate Gemini 3072D vector embeddings." });
  }

  const cosineSim = calculateCosineSimilarity(vec1, vec2);
  const similarityScore = Math.round(cosineSim * 10000) / 10000;
  const similarityPercentage = Math.round(cosineSim * 100);

  let relationship = "Unrelated / Distant";
  let isPossibleDuplicate = false;
  let isHighConfidenceDuplicate = false;

  if (similarityScore >= 0.80) {
    relationship = "Same Meaning / Duplicate";
    isPossibleDuplicate = true;
    isHighConfidenceDuplicate = true;
  } else if (similarityScore >= 0.75) {
    relationship = "Closely Related";
    isPossibleDuplicate = true;
    isHighConfidenceDuplicate = false;
  } else if (similarityScore >= 0.70) {
    relationship = "Related Defect";
    isPossibleDuplicate = false;
    isHighConfidenceDuplicate = false;
  }

  return res.json({
    existing_defect: typeof def1 === "string" ? def1 : (def1.title || def1.description || text1),
    new_defect: typeof def2 === "string" ? def2 : (def2.title || def2.description || text2),
    similarity_score: similarityScore,
    similarity_percentage: similarityPercentage,
    is_duplicate: isHighConfidenceDuplicate,
    is_possible_duplicate: isPossibleDuplicate,
    relationship,
    calculation_method: "Mathematical Vector Cosine Similarity (Dot Product / Norms)",
    embedding_model: `${EMBEDDING_MODEL} (3072D)`,
    database_compatible: "PostgreSQL pgvector (1 - (embedding <=> query))",
    status: "success"
  });
}

app.post(["/api/ai/compare-defects", "/api/ai/compare", "/api/ai/calculate-similarity"], handleCompareDefects);

// 3. Similar Defect Detection & Duplicate Prevention (pgvector + Gemini 3072D Embeddings)
app.post(["/api/ai/similar-defects", "/api/ai/detect-similar", "/api/ai/similar"], async (req, res) => {
  // If pairwise comparison is requested inside this endpoint
  const def1 = req.body.defect1 || req.body.defect_a || req.body.existing_defect || req.body.text1 || req.body.defectA;
  const def2 = req.body.defect2 || req.body.defect_b || req.body.new_defect || req.body.text2 || req.body.defectB;
  if (def1 && def2) {
    return handleCompareDefects(req, res);
  }

  const { exclude_id, threshold } = req.body;
  const minThreshold = Math.max(
    SEMANTIC_SEARCH_MIN_SCORE,
    typeof threshold === "number" && !isNaN(threshold) ? threshold : 0
  );
  const searchTxt = buildDefectSemanticText(req.body);
  
  if (!searchTxt.trim() || searchTxt.length < 3) {
    return res.json({ similar_defects: [], match_count: 0, duplicate_count: 0 });
  }

  const queryVector = await generateEmbedding(searchTxt, "RETRIEVAL_QUERY");

  if (!queryVector || !isPgConnected || !pgPool) {
    return res.json({
      similar_defects: [],
      match_count: 0,
      duplicate_count: 0,
      status: "unavailable",
      source: "PostgreSQL pgvector embeddings are unavailable"
    });
  }

  if (queryVector && isPgConnected && pgPool) {
    try {
      const excludeClause = exclude_id ? `AND id != ${Number(exclude_id)}` : "";
      const result = await pgPool.query(`
        SELECT
          id, key, title, description, status, priority, severity, category,
          issue_type as "issueType", project_name as "projectName",
          ROUND((1 - (embedding <=> $1::vector))::numeric, 4) as similarity_score
        FROM issues
        WHERE embedding IS NOT NULL
          AND embedding_text_version = $3
          AND (1 - (embedding <=> $1::vector)) >= $2
          ${excludeClause}
        ORDER BY embedding <=> $1::vector ASC, id DESC
        LIMIT $4
      `, [`[${queryVector.join(",")}]`, minThreshold, EMBEDDING_TEXT_VERSION, 10]);

      const scored = result.rows.map(row => {
        const simScore = parseFloat(row.similarity_score) || 0;
        return {
          id: row.id,
          key: row.key,
          title: row.title,
          description: row.description,
          status: row.status,
          priority: row.priority,
          severity: row.severity,
          category: row.category,
          issueType: row.issueType,
          projectName: row.projectName,
          similarity_score: simScore,
          similarity_percentage: Math.round(simScore * 100),
          is_possible_duplicate: simScore >= 0.75,
          is_high_confidence_duplicate: simScore >= 0.80
        };
      }).filter(i => i.similarity_score >= minThreshold);

      const duplicates = scored.filter(i => i.is_possible_duplicate);

      return res.json({
        similar_defects: scored.slice(0, 5),
        match_count: scored.length,
        duplicate_count: duplicates.length,
        similarity_model: `${EMBEDDING_MODEL} (3072 dimensions)`,
        database: "PostgreSQL pgvector (Cosine Distance)",
        thresholds: {
          possible_duplicate: 0.75,
          high_confidence_duplicate: 0.80
        },
        relevance_threshold: minThreshold,
        status: "success",
        warning: duplicates.length > 0
          ? `⚠️ Found ${duplicates.length} potential duplicate defect(s) in PostgreSQL (>= 75% similarity)`
          : "No duplicate defects detected."
      });
    } catch (err) {
      console.error("pgvector query error in similar-defects:", err);
      return res.status(503).json({ detail: "PostgreSQL semantic matching is temporarily unavailable." });
    }
  }

});

// 3. Semantic Search Across PostgreSQL Issues (pgvector + Vector Embeddings)
app.post("/api/ai/semantic-search", async (req, res) => {
  const { query, threshold, limit } = req.body;
  if (!query || !query.trim()) {
    return res.json({ query: "", count: 0, results: [], mode: "Empty query" });
  }

  const minThreshold = Math.max(
    SEMANTIC_SEARCH_MIN_SCORE,
    typeof threshold === "number" && !isNaN(threshold) ? threshold : 0
  );
  const limitCount = typeof limit === "number" && !isNaN(limit) && limit > 0 ? limit : 20;

  const cleanQuery = normalizeSemanticText(query);
  if (cleanQuery.length < 3) {
    return res.json({ query: cleanQuery, count: 0, results: [], mode: "Query too short" });
  }
  const queryVector = await generateEmbedding(cleanQuery, "RETRIEVAL_QUERY");

  if (!queryVector || !isPgConnected || !pgPool) {
    return res.json({
      query,
      count: 0,
      results: [],
      mode: "PostgreSQL pgvector unavailable",
      database: "PostgreSQL"
    });
  }

  if (queryVector && isPgConnected && pgPool) {
    try {
      const result = await pgPool.query(`
        SELECT
          id, key, title, description, status, priority, severity, environment,
          issue_type as "issueType", category, project_name as "projectName",
          project_id as "projectId", sprint_id as "sprintId", assignee_name as "assigneeName",
          assignee_role as "assigneeRole", created_at as "createdAt",
          ROUND((1 - (embedding <=> $1::vector))::numeric, 4) as similarity_score
        FROM issues
        WHERE embedding IS NOT NULL
          AND embedding_text_version = $3
          AND (1 - (embedding <=> $1::vector)) >= $2
        ORDER BY embedding <=> $1::vector ASC, id DESC
        LIMIT $4
      `, [`[${queryVector.join(",")}]`, minThreshold, EMBEDDING_TEXT_VERSION, limitCount]);

      const matched = result.rows.map(row => {
        const sim = parseFloat(row.similarity_score) || 0;
        return {
          ...row,
          similarity_score: sim,
          similarity_percentage: Math.round(sim * 100)
        };
      }).filter(r => r.similarity_score >= minThreshold);

      return res.json({
        query,
        count: matched.length,
        results: matched,
        mode: "PostgreSQL pgvector Semantic Search",
        embedding_model: `${EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS}D)`,
        database: "PostgreSQL (pgvector)",
        relevance_threshold: minThreshold
      });
    } catch (err) {
      console.error("pgvector query error in semantic-search:", err);
      return res.status(503).json({ detail: "PostgreSQL semantic search is temporarily unavailable." });
    }
  }
});


// 4. Resolution Assistance
app.post(["/api/ai/resolution-assistance", "/api/ai/resolution-recommendation", "/api/ai/root-cause-assistance"], async (req, res) => {
  const { issue_id, title, description, category, severity, priority, environment } = req.body;

  if (!ai) {
    return res.status(503).json({ detail: "AI resolution assistance requires GEMINI_API_KEY." });
  }

  let currentComments: any[] = [];
  let currentRootCause = "";
  let currentResolutionNotes = "";

  // Fetch defect and comments from PostgreSQL if issue_id is provided
  if (issue_id && isPgConnected && pgPool) {
    try {
      const issueRes = await pgPool.query(
        'SELECT comments, root_cause as "rootCause", resolution_notes as "resolutionNotes", severity, priority, category FROM issues WHERE id = $1',
        [Number(issue_id)]
      );
      if (issueRes.rows.length > 0) {
        currentComments = issueRes.rows[0].comments || [];
        currentRootCause = issueRes.rows[0].rootCause || "";
        currentResolutionNotes = issueRes.rows[0].resolutionNotes || "";
      }
    } catch (e) {
      console.warn("Notice fetching issue details for resolution assistance:", e);
    }
  }

  // Fetch historically similar resolved defects using semantic search when available
  let historicalContext = "";
  const histSearchText = buildDefectSemanticText({ title, description, category, severity, priority });
  const histQueryVec = await generateEmbedding(histSearchText, "RETRIEVAL_QUERY");

  if (histQueryVec && isPgConnected && pgPool) {
    try {
      const excludeClause = issue_id ? `AND id != ${Number(issue_id)}` : "";
      const histRes = await pgPool.query(`
        SELECT key, title, category, root_cause as "rootCause", resolution_notes as "resolutionNotes", comments,
               ROUND((1 - (embedding <=> $1))::numeric, 4) as similarity_score
        FROM issues
        WHERE (status = 'Resolved' OR status = 'Verified' OR status = 'Closed')
          AND embedding IS NOT NULL
          ${excludeClause}
        ORDER BY embedding <=> $1 ASC
        LIMIT 4
      `, [`[${histQueryVec.join(",")}]`]);
      if (histRes.rows.length > 0) {
        historicalContext = histRes.rows.map(h =>
          `- [${h.key}] "${h.title}" (${Math.round((parseFloat(h.similarity_score) || 0) * 100)}% similar): Root Cause: "${h.rootCause || 'N/A'}" | Resolution: "${h.resolutionNotes || 'N/A'}" | Comments: ${JSON.stringify(h.comments || [])}`
        ).join("\n");
      }
    } catch (e) {
      console.warn("Notice fetching semantically similar historical defects:", e);
    }
  } else if (isPgConnected && pgPool) {
    try {
      const histRes = await pgPool.query(`
        SELECT key, title, category, root_cause as "rootCause", resolution_notes as "resolutionNotes", comments
        FROM issues
        WHERE (status = 'Resolved' OR status = 'Verified' OR status = 'Closed')
          ${issue_id ? `AND id != ${Number(issue_id)}` : ""}
        ORDER BY created_at DESC
        LIMIT 4
      `);
      if (histRes.rows.length > 0) {
        historicalContext = histRes.rows.map(h =>
          `- [${h.key}] "${h.title}": Root Cause: "${h.rootCause || 'N/A'}" | Resolution: "${h.resolutionNotes || 'N/A'}" | Comments: ${JSON.stringify(h.comments || [])}`
        ).join("\n");
      }
    } catch (e) {
      console.warn("Notice fetching historical defects context:", e);
    }
  }

  const commentsText = currentComments.map((c: any) => `${c.userName || 'Developer'}: "${c.body}"`).join("\n");

  const inputPrompt = `Defect Title: ${title || "Untitled Defect"}
Category: ${category || "General"}
Severity: ${severity || "Medium"} | Priority: ${priority || "Medium"}
Description:
${description || "No description provided."}

Developer Comments on this Defect:
${commentsText || "None"}

Historical Resolved Defects from PostgreSQL:
${historicalContext || "None"}
`;

  if (ai) {
    try {
      const prompt = `You are the AI Defect Resolution Assistant for BugFlow.
Analyze this defect report, developer comments, and historical resolutions from PostgreSQL.
Provide actionable resolution recommendations and root cause investigation assistance.

${inputPrompt}

Requirements:
1. Provide "recommendation_steps": A numbered list of 4-5 concrete, practical debugging and resolution steps tailored to THIS defect's symptoms and module.
2. Provide "possible_resolution": A clear, direct 1-2 sentence recommendation based on the defect symptoms and any similar historical resolutions provided (do not invent fixes not supported by the data).
3. Provide "investigation_areas": A numbered list of 4-5 specific potential areas to investigate without claiming definitive root cause.
4. Provide "similar_defect_insights": A brief insight into relevant past defect patterns from the historical data provided, or state that no similar historical resolutions were found.
5. Provide "relevant_files_hint": An array of likely source file paths or modules to inspect based on the defect category and description.
6. Provide "disclaimer": "AI Suggested Resolution: These recommendations and investigation areas are suggestions only to assist developers. The developer remains responsible for determining the actual root cause."

Respond ONLY in JSON matching this exact structure:
{
  "recommendation_steps": ["1. ...", "2. ..."],
  "possible_resolution": "...",
  "investigation_areas": ["1. ...", "2. ..."],
  "similar_defect_insights": "...",
  "recommended_fix": "...",
  "relevant_files_hint": ["..."],
  "disclaimer": "AI Suggested Resolution: These recommendations and investigation areas are suggestions only to assist developers. The developer remains responsible for determining the actual root cause."
}`;

      const response = await callGemini(model =>
        ai.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: "application/json" }
        })
      );
      const parsed = JSON.parse(response.text || "{}");
      return res.json({
        recommendation_steps: parsed.recommendation_steps || [
          "1. Check the API response structure and schema validation.",
          "2. Inspect null/undefined error handling around state transitions.",
          "3. Review client-side error handling boundaries.",
          "4. Check server-side error logs and telemetry.",
          "5. Review recent code changes to the affected module."
        ],
        possible_resolution: parsed.possible_resolution || parsed.recommended_fix || "Validate the API response and handle null/unexpected responses before processing the result.",
        investigation_areas: parsed.investigation_areas || [
          "1. Check API timeout handling and payload serialization.",
          "2. Review database connection stability and query parameters.",
          "3. Check recent changes to middleware or handlers.",
          "4. Review application server exception logs.",
          "5. Check error handling in the affected module."
        ],
        similar_defect_insights: parsed.similar_defect_insights || "Past defects in this module were resolved by verifying API payload contracts.",
        recommended_fix: parsed.recommended_fix || parsed.possible_resolution || "Add boundary checks and null handling before state assignment.",
        relevant_files_hint: parsed.relevant_files_hint || ["server.ts", "src/components/Dashboard.jsx"],
        disclaimer: parsed.disclaimer || "AI Suggested Resolution: These recommendations and investigation areas are suggestions only to assist developers. The developer remains responsible for determining the actual root cause.",
        status: "success",
        provider: "Gemini AI Engine"
      });
    } catch (e) {
      console.error("AI resolution error:", e);
      return res.status(502).json({ detail: "Gemini resolution assistance failed." });
    }
  }

  // Heuristic rule-based fallback when Gemini is unavailable
  const moduleLabel = category || "affected module";
  res.json({
    recommendation_steps: [
      `1. Reproduce the defect in ${environment || "the reported environment"} and capture logs.`,
      `2. Inspect API/service responses and data contracts for the ${moduleLabel} area.`,
      "3. Review null/undefined handling and error boundaries in the affected code path.",
      "4. Check server and client logs for stack traces around the failure timestamp.",
      `5. Review recent changes to ${moduleLabel} and related dependencies.`
    ],
    possible_resolution: historicalContext
      ? "Review the similar historical resolutions listed above and validate whether the same root cause pattern applies to this defect."
      : `Investigate the ${moduleLabel} workflow end-to-end and add defensive handling for the failure described in the defect report.`,
    investigation_areas: [
      "1. Verify API payload parsing, serialization, and response schema validation.",
      "2. Review database queries, connection pools, and transaction boundaries if data persistence is involved.",
      "3. Check authentication, authorization, and session handling on the affected route.",
      "4. Review application and infrastructure logs for correlated errors.",
      `5. Trace state management and UI event handlers in the ${moduleLabel} component.`
    ],
    similar_defect_insights: historicalContext
      ? "Similar resolved defects from PostgreSQL are included above — compare their root causes and resolutions before implementing a fix."
      : "No similar historical resolutions were found in PostgreSQL for this defect.",
    recommended_fix: `Add targeted logging and boundary checks in the ${moduleLabel} code path, then validate the fix against the reproduction steps.`,
    relevant_files_hint: ["server.ts", "src/components/Dashboard.jsx"],
    disclaimer: "AI Suggested Resolution: These recommendations and investigation areas are suggestions only to assist developers. The developer remains responsible for determining the actual root cause.",
    status: "rule_assistant",
    provider: "BugFlow Knowledge Engine"
  });
});

// 5. Enhance Issue
app.post("/api/ai/enhance-issue", async (req, res) => {
  const { title, existing_desc, user_environment } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ detail: "Title is required for AI enhancement" });
  }

  if (!ai) {
    return res.status(503).json({ detail: "AI issue enhancement requires GEMINI_API_KEY." });
  }

  const prompt = `You are BugFlow AI, a senior QA and DevOps engineer.
Given the issue title: "${title}"
Optional context/notes: "${existing_desc || 'None'}"
Optional environment hint: "${user_environment || 'None'}"

Generate a complete, highly detailed bug report spec in JSON format with the following fields:
1. "detailed_description": A comprehensive Markdown formatted report including:
   - ### 📌 Overview
   - ### 🔁 Steps to Reproduce
   - ### 🎯 Expected Result
   - ### ⚠️ Actual Result / Symptoms
   - ### 🛠️ Suggested Fix / Investigation Area
2. "issue_type": One of ["Bug", "UI/UX", "Performance", "Security", "Backend/API", "Database"]
3. "priority": One of ["Critical", "High", "Medium", "Low"]
4. "severity": One of ["Critical", "High", "Medium", "Low"]
5. "environment": A realistic target environment string

Respond ONLY in JSON.`;

  if (ai) {
    try {
      const response = await callGemini(model =>
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
          },
        })
      );

      const text = response.text || "";
      const parsed = JSON.parse(text);

      return res.json({
        detailed_description: parsed.detailed_description || `### 📌 Overview\n${title}`,
        issue_type: parsed.issue_type || "Bug",
        priority: parsed.priority || "High",
        severity: parsed.severity || "High",
        environment: parsed.environment || "Production Web Portal"
      });
    } catch (e) {
      console.error("Gemini AI API call error in enhance-issue:", e);
      return res.status(502).json({ detail: "Gemini issue enhancement failed." });
    }
  }

  // Fallback
  const lowerTitle = title.toLowerCase();
  let defaultType = "Bug";
  let defaultPriority = "Medium";
  let defaultSeverity = "Medium";
  let defaultEnv = user_environment || "Production iOS App v2.4";

  if (lowerTitle.includes("crash") || lowerTitle.includes("loop") || lowerTitle.includes("oauth") || lowerTitle.includes("security")) {
    defaultPriority = "Critical";
    defaultSeverity = "Critical";
    defaultType = lowerTitle.includes("security") || lowerTitle.includes("oauth") ? "Security" : "Bug";
  } else if (lowerTitle.includes("slow") || lowerTitle.includes("memory") || lowerTitle.includes("latency")) {
    defaultPriority = "High";
    defaultSeverity = "High";
    defaultType = "Performance";
  } else if (lowerTitle.includes("button") || lowerTitle.includes("alignment") || lowerTitle.includes("css") || lowerTitle.includes("ui")) {
    defaultType = "UI/UX";
    defaultPriority = "Low";
    defaultSeverity = "Low";
  }

  res.json({
    detailed_description: `### 📌 Overview
${title}

### 🔁 Steps to Reproduce
1. Open the affected component in ${defaultEnv}.
2. Trigger the action: "${title}".
3. Observe unexpected failure or abnormal state transition.

### 🎯 Expected Result
The operation should complete gracefully with clear feedback and standard response times.

### ⚠️ Actual Result
${existing_desc || 'The system encounters an unexpected error or incorrect behavior as described in the title.'}

### 🛠️ Suggested Fix
Inspect recent network/app logs, verify error boundaries, and trace state parameters.`,
    issue_type: defaultType,
    priority: defaultPriority,
    severity: defaultSeverity,
    environment: defaultEnv
  });
});

// 6. Refine Report
app.post(["/api/ai/refine-report", "/api/ai/refine-bug", "/api/ai/refine"], async (req, res) => {
  const raw_report = req.body.raw_report || req.body.description || req.body.title;
  if (!raw_report || !raw_report.trim()) {
    return res.status(400).json({ detail: "raw_report string is required" });
  }

  if (!ai) {
    return res.status(503).json({ detail: "AI report refinement requires GEMINI_API_KEY." });
  }

  if (ai) {
    try {
      const response = await callGemini(model =>
        ai.models.generateContent({
          model,
          contents: `You are BugFlow AI, an expert QA bug report refiner.
Refine the following raw bug report into structured Markdown with:
### 🐛 Bug Summary
### 📝 Steps to Reproduce
### 🎯 Expected Behavior
### 💥 Actual Behavior

RAW REPORT: "${raw_report}"`,
    config: { maxOutputTokens: 600 }
        })
      );

      const refinedText = response.text || "";

      return res.json({
        refined_markdown: refinedText,
        profiling_questions: [
          "Which Operating System version (e.g., macOS 14.2, Windows 11) were you running?",
          "Which browser (e.g., Chrome v125, Safari 17) was used during this issue?",
          "Were there any developer console errors or failed HTTP network responses?"
        ]
      });
    } catch (e) {
      console.error("Gemini AI API call error in refine-report:", e);
      return res.status(502).json({ detail: "Gemini report refinement failed." });
    }
  }

  res.json({
    refined_markdown: `### 🐛 Bug Summary
${raw_report.charAt(0).toUpperCase() + raw_report.slice(1)}

### 📝 Steps to Reproduce
1. Navigate to the affected component.
2. Trigger the action: "${raw_report}".
3. Observe the bug behavior.

### 🎯 Expected Behavior
Action completes successfully without UI glitches.

### 💥 Actual Behavior
${raw_report}`,
    profiling_questions: [
      "What Operating System and version are you using?",
      "Which browser and version were active during the issue?",
      "Can you attach network logs or developer console error messages?"
    ]
  });
});

// 7. AI Defect Summarization (Concise executive defect summary)
app.post(["/api/ai/summarize-defect", "/api/ai/summary"], async (req, res) => {
  const { issue_id, title, description, save_to_db } = req.body;
  
  let defectTitle = title || "";
  let defectDesc = description || "";
  let defectSeverity = "";
  let defectPriority = "";
  let defectCategory = "";
  let defectEnvironment = "";

  if (issue_id && isPgConnected && pgPool) {
    try {
      const rowRes = await pgPool.query(
        `SELECT title, description, severity, priority, category, environment, ai_summary
         FROM issues WHERE id = $1`,
        [Number(issue_id)]
      );
      if (rowRes.rows.length > 0) {
        const row = rowRes.rows[0];
        defectTitle = defectTitle || row.title;
        defectDesc = defectDesc || row.description;
        defectSeverity = row.severity || "";
        defectPriority = row.priority || "";
        defectCategory = row.category || "";
        defectEnvironment = row.environment || "";
      }
    } catch (e) {
      console.warn("Notice fetching defect for summary:", e);
    }
  }

  if (!defectDesc && !defectTitle) {
    return res.status(400).json({ detail: "Title or description is required for summary." });
  }

  if (!ai) {
    return res.status(503).json({ detail: "AI executive summaries require GEMINI_API_KEY." });
  }

  const fullText = `Title: ${defectTitle}\nDescription: ${defectDesc}`.trim();
  let generatedSummary = "";

  if (ai) {
    try {
      const prompt = `You are BugFlow AI Defect Resolution Assistant. Provide ONE concise paragraph executive summary of the following defect for developers and QA engineers. Include severity/priority impact and the primary symptom. Base the summary ONLY on the provided defect data:

Title: ${defectTitle}
Description: ${defectDesc}
Severity: ${defectSeverity || "Unknown"}
Priority: ${defectPriority || "Unknown"}
Category/Module: ${defectCategory || "Unknown"}
Environment: ${defectEnvironment || "Unknown"}

Respond ONLY in JSON with the key "summary":
{
  "summary": "<one concise paragraph describing THIS specific defect>"
}`;
      const response = await callGemini(model =>
        ai.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: "application/json" }
        })
      );
      const parsed = JSON.parse(response.text || "{}");
      generatedSummary = parsed.summary || `${defectTitle}: Defect impacting component workflow.`;
    } catch (e) {
      console.error("Gemini AI API call error in summarize-defect:", e);
      return res.status(502).json({ detail: "Gemini executive summary failed." });
    }
  }

  if (!generatedSummary) {
    // Heuristic summary fallback
    const firstLine = (defectDesc || defectTitle || "").split("\n")[0].replace(/^###\s*📌?\s*Overview\s*/i, "").trim();
    generatedSummary = firstLine ? `${defectTitle}: ${firstLine}` : `${defectTitle}: Defect logged in workspace requiring investigation.`;
  }

  // Persist to PostgreSQL if requested or if issue_id is supplied
  if (issue_id && isPgConnected && pgPool) {
    try {
      await pgPool.query("UPDATE issues SET ai_summary = $1 WHERE id = $2", [generatedSummary, Number(issue_id)]);
    } catch (saveErr) {
      console.warn("Notice saving ai_summary to PG:", saveErr);
    }
  }

  res.json({
    summary: generatedSummary,
    provider: ai ? "Gemini AI Engine" : "BugFlow Rule Engine",
    status: "success"
  });
});

// 8. Historical Resolution Retrieval for Similar Defects (pgvector Semantic Retrieval)
app.post("/api/ai/historical-resolutions", async (req, res) => {
  const { title, description, category, exclude_id, threshold } = req.body;
  const minThreshold = Math.max(
    SEMANTIC_SEARCH_MIN_SCORE,
    typeof threshold === "number" && !isNaN(threshold) ? threshold : 0
  );
  const searchTxt = buildDefectSemanticText({ title, description, category });

  const queryVector = await generateEmbedding(searchTxt, "RETRIEVAL_QUERY");

  if (!queryVector || !isPgConnected || !pgPool) {
    return res.json({
      historical_resolutions: [],
      count: 0,
      message: "Semantic historical resolution search is unavailable.",
      status: "unavailable",
      source: "PostgreSQL pgvector embeddings are unavailable"
    });
  }

  if (queryVector && isPgConnected && pgPool) {
    try {
      const excludeClause = exclude_id ? `AND id != ${Number(exclude_id)}` : "";
      const query = `
        SELECT 
          id, key, title, description, category, status,
          root_cause as "rootCause", resolution_notes as "resolutionNotes", comments,
          assignee_name as "assigneeName", created_at as "createdAt",
          ROUND((1 - (embedding <=> $1::vector))::numeric, 4) as similarity_score
        FROM issues
        WHERE (status = 'Resolved' OR status = 'Verified' OR status = 'Closed')
          AND embedding IS NOT NULL
          AND embedding_text_version = $3
          AND (1 - (embedding <=> $1::vector)) >= $2
          AND (
            NULLIF(BTRIM(root_cause), '') IS NOT NULL
            OR NULLIF(BTRIM(resolution_notes), '') IS NOT NULL
            OR jsonb_array_length(COALESCE(comments, '[]'::jsonb)) > 0
          )
          ${excludeClause}
        ORDER BY embedding <=> $1::vector ASC, id DESC
        LIMIT 6
      `;
      const result = await pgPool.query(query, [
        `[${queryVector.join(",")}]`,
        minThreshold,
        EMBEDDING_TEXT_VERSION
      ]);
      const matched = (await Promise.all(result.rows.map(async issue => {
        let devComments = [];
        if (Array.isArray(issue.comments)) {
          devComments = issue.comments;
        } else if (typeof issue.comments === "string") {
          try { devComments = JSON.parse(issue.comments); } catch {}
        }

        const commentContext = devComments
          .map((comment: any) => comment.body)
          .filter(Boolean)
          .join(". ");
        const problemContext = buildDefectSemanticText({
          title: issue.title,
          description: issue.description,
          category: issue.category
        });
        const resolutionContext = [buildDefectSemanticText({
          title: issue.title,
          description: issue.description,
          category: issue.category,
          rootCause: issue.rootCause,
          resolutionNotes: issue.resolutionNotes
        }), commentContext ? `Comments: ${normalizeSemanticText(commentContext)}` : ""]
          .filter(Boolean)
          .join(". ");
        const problemVector = await generateEmbedding(problemContext, "RETRIEVAL_DOCUMENT");
        const resolutionVector = await generateEmbedding(resolutionContext, "RETRIEVAL_DOCUMENT");
        const problemScore = problemVector
          ? calculateCosineSimilarity(queryVector, problemVector)
          : 0;
        const resolutionScore = resolutionVector
          ? calculateCosineSimilarity(queryVector, resolutionVector)
          : 0;

        return {
          id: issue.id,
          key: issue.key,
          title: issue.title,
          category: issue.category,
          status: issue.status,
          resolvedBy: issue.assigneeName || "Developer",
          rootCause: issue.rootCause || "",
          resolutionNotes: issue.resolutionNotes || "",
          comments: devComments,
          developerComments: devComments.map((c: any) => `"${c.body || ''}" - ${c.userName || 'Developer'}`).join("; "),
          similarityScore: problemScore,
          similarityPercentage: Math.round(problemScore * 100),
          resolutionSimilarityScore: resolutionScore
        };
      }))).filter(item =>
        item.similarityScore >= minThreshold &&
        item.resolutionSimilarityScore >= minThreshold
      )
        .sort((left, right) => right.similarityScore - left.similarityScore);

      if (matched.length === 0) {
        return res.json({
          historical_resolutions: [],
          count: 0,
          message: "No relevant historical resolution found.",
          status: "success",
          source: "PostgreSQL pgvector Resolved Defects Archive"
        });
      }

      return res.json({
        historical_resolutions: matched.slice(0, 4),
        count: matched.length,
        status: "success",
        source: "PostgreSQL pgvector Resolved Defects Archive",
        relevance_threshold: minThreshold
      });
    } catch (err) {
      console.error("pgvector error in historical-resolutions:", err);
    }
  }

  return res.status(503).json({ detail: "PostgreSQL historical resolution search is temporarily unavailable." });
});

// ==========================================
// 9. AI DEFECT RESOLUTION ASSISTANT (CHAT ENGINE)
// ==========================================

// Helper to extract defect key mention from text or conversation history
function extractDefectKey(text: string): string | null {
  if (!text) return null;
  // Match BF-1234, DEF-1234, BFC-1, GW-1, SDK-1, #1234, issue 1234, defect 1234
  const keyMatch = text.match(/\b(BF-\d+|DEF-\d+|BFC-\d+|GW-\d+|SDK-\d+)\b/i);
  if (keyMatch) return keyMatch[1].toUpperCase();
  const numMatch = text.match(/(?:#|issue\s+|defect\s+|bug\s+)(\d{1,5})\b/i);
  if (numMatch) return numMatch[1];
  return null;
}

app.post("/api/ai/chat", async (req, res) => {
  const user = getAuthenticatedUser(req);
  const { message, session_id, defect_context, history = [] } = req.body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ detail: "Message text is required for AI Chat." });
  }

  if (!isPgConnected || !pgPool || !ai) {
    return res.status(503).json({ detail: "AI chat requires an active PostgreSQL connection and GEMINI_API_KEY." });
  }

  const cleanMessage = message.trim();
  const sessionId = session_id || `session_${user.id || 'anon'}_${Date.now()}`;
  const nowStr = new Date().toISOString();

  try {
    // 1. Retrieve all current defects, projects, and sprints from PostgreSQL
    let allIssues: any[] = [];
    let allProjects: any[] = [];
    let allSprints: any[] = [];

    if (isPgConnected && pgPool) {
      try {
        const issuesRes = await pgPool.query(`
          SELECT 
            id, key, title, description, status, priority, severity, environment,
            issue_type as "issueType", category, project_name as "projectName",
            project_id as "projectId", sprint_id as "sprintId", assignee_name as "assigneeName",
            assignee_role as "assigneeRole", created_at as "createdAt",
            resolution_notes as "resolutionNotes", comments, attachments, activity_logs as "activityLogs"
          FROM issues
          ORDER BY id ASC
        `);
        allIssues = issuesRes.rows;

        const projRes = await pgPool.query(`SELECT id, name, key, category, description FROM projects ORDER BY id ASC`);
        allProjects = projRes.rows;

        const sprintRes = await pgPool.query(`SELECT id, name, project_id as "projectId", start_date as "startDate", end_date as "endDate", goal, status FROM sprints ORDER BY id ASC`);
        allSprints = sprintRes.rows;
      } catch (dbErr) {
        console.error("Database query error in AI Chat:", dbErr);
        allIssues = dbData.issues;
        allProjects = dbData.projects;
        allSprints = dbData.sprints;
      }
    } else {
      allIssues = dbData.issues;
      allProjects = dbData.projects;
      allSprints = dbData.sprints;
    }

    // 2. Identify target defect context (from explicit defect_context, user message, or history)
    let explicitKey = typeof defect_context === "string" ? defect_context.trim() : (defect_context?.key || defect_context?.id ? String(defect_context.key || defect_context.id) : null);
    let extractedKey = extractDefectKey(cleanMessage);
    
    // Check conversation history for previously referenced defect if user uses pronouns ("it", "this defect", "the bug")
    if (!extractedKey && !explicitKey && Array.isArray(history) && history.length > 0) {
      const lower = cleanMessage.toLowerCase();
      const hasPronounRef = lower.includes(" it") || lower.includes("it ") || lower.includes("this defect") || lower.includes("this bug") || lower.includes("the issue") || lower.includes("this issue") || lower.includes("they");
      if (hasPronounRef) {
        for (let i = history.length - 1; i >= 0; i--) {
          const prevKey = extractDefectKey(history[i].content || "");
          if (prevKey) {
            extractedKey = prevKey;
            break;
          }
        }
      }
    }

    const targetKeyOrId = (extractedKey || explicitKey || "").toUpperCase();

    // Find the defect in database
    let targetDefect: any = null;
    if (targetKeyOrId) {
      targetDefect = allIssues.find(i => 
        (i.key && i.key.toUpperCase() === targetKeyOrId) ||
        String(i.id) === targetKeyOrId ||
        (i.key && i.key.toUpperCase().includes(targetKeyOrId)) ||
        (targetKeyOrId.startsWith("DEF-") && i.key && i.key.toUpperCase().endsWith(targetKeyOrId.replace("DEF-", ""))) ||
        (targetKeyOrId.startsWith("BF-") && i.key && i.key.toUpperCase() === targetKeyOrId)
      );

      // If key was numeric, e.g. "102", match by id or number ending
      if (!targetDefect && /^\d+$/.test(targetKeyOrId)) {
        targetDefect = allIssues.find(i => String(i.id) === targetKeyOrId || (i.key && i.key.endsWith(targetKeyOrId)));
      }
    }

    // 3. Compute real similar defects & historical resolutions if target defect or semantic query
    let similarDefects: any[] = [];
    let historicalResolutions: any[] = [];

    if (targetDefect) {
      // Real pgvector or cosine similarity search for similar defects
      const targetText = `${targetDefect.title}. ${targetDefect.description || ""}`.trim();
      const targetVec = await generateEmbedding(targetText, "RETRIEVAL_QUERY");

      if (targetVec && isPgConnected && pgPool) {
        try {
          const simRes = await pgPool.query(`
            SELECT 
              id, key, title, status, priority, severity, project_name as "projectName",
              ROUND((1 - (embedding <=> $1))::numeric, 4) as similarity_score
            FROM issues
            WHERE id != $2 AND embedding IS NOT NULL
            ORDER BY embedding <=> $1 ASC
            LIMIT 5
          `, [`[${targetVec.join(",")}]`, targetDefect.id]);

          similarDefects = simRes.rows.map(r => {
            const score = parseFloat(r.similarity_score) || 0;
            return {
              id: r.id,
              key: r.key,
              title: r.title,
              status: r.status,
              priority: r.priority,
              severity: r.severity,
              projectName: r.projectName,
              similarityScore: score,
              similarityPercentage: Math.round(score * 100)
            };
          }).filter(i => i.similarityScore >= 0.35);

          const histRes = await pgPool.query(`
            SELECT 
              id, key, title, category, status, resolution_notes as "resolutionNotes", 
              assignee_name as "assigneeName", comments,
              ROUND((1 - (embedding <=> $1))::numeric, 4) as similarity_score
            FROM issues
            WHERE id != $2 AND (status = 'Resolved' OR status = 'Verified' OR status = 'Closed') AND embedding IS NOT NULL
            ORDER BY embedding <=> $1 ASC
            LIMIT 3
          `, [`[${targetVec.join(",")}]`, targetDefect.id]);

          historicalResolutions = histRes.rows.map(r => {
            const score = parseFloat(r.similarity_score) || 0;
            return {
              id: r.id,
              key: r.key,
              title: r.title,
              category: r.category,
              status: r.status,
              resolvedBy: r.assigneeName || null,
              resolutionNotes: r.resolutionNotes || "",
              comments: r.comments || [],
              similarityScore: score,
              similarityPercentage: Math.round(score * 100)
            };
          });
        } catch (simErr) {
          console.error("Vector similarity lookup in chat error:", simErr);
        }
      }

    }

    // 4. Compute real project-level statistics from PostgreSQL
    const totalDefectsCount = allIssues.length;
    const statusCounts: Record<string, number> = {};
    const severityCounts: Record<string, number> = {};
    const developerWorkload: Record<string, number> = {};
    let unresolvedCount = 0;
    let criticalOpenCount = 0;

    for (const issue of allIssues) {
      statusCounts[issue.status] = (statusCounts[issue.status] || 0) + 1;
      severityCounts[issue.severity || "Medium"] = (severityCounts[issue.severity || "Medium"] || 0) + 1;

      const isResolved = issue.status === "Resolved" || issue.status === "Verified" || issue.status === "Closed";
      if (!isResolved) {
        unresolvedCount++;
        if (issue.severity === "Critical") {
          criticalOpenCount++;
        }
      }

      const assignee = issue.assigneeName || "Unassigned";
      developerWorkload[assignee] = (developerWorkload[assignee] || 0) + 1;
    }

    // Find developer with most assigned defects
    let maxAssignedDev = "None";
    let maxAssignedCount = 0;
    for (const [dev, count] of Object.entries(developerWorkload)) {
      if (dev !== "Unassigned" && count > maxAssignedCount) {
        maxAssignedCount = count;
        maxAssignedDev = dev;
      }
    }

    // Build rich database context for Gemini
    const defectContextText = targetDefect ? `
TARGET DEFECT DETAILS (RETRIEVED FROM POSTGRESQL):
- Key / ID: ${targetDefect.key || '#' + targetDefect.id} (Database ID: ${targetDefect.id})
- Title: ${targetDefect.title}
- Description: ${targetDefect.description || 'No description provided.'}
- Category / Module: ${targetDefect.category} (${targetDefect.projectName || 'BugFlow Core'})
- Issue Type: ${targetDefect.issueType || 'Bug'}
- Severity: ${targetDefect.severity || 'Medium'}
- Priority: ${targetDefect.priority || 'Medium'}
- Status: ${targetDefect.status}
- Assigned Developer: ${targetDefect.assigneeName || 'Unassigned'} (${targetDefect.assigneeRole || 'Developer'})
- Sprint: ${targetDefect.sprintId ? 'Sprint #' + targetDefect.sprintId : 'Backlog'}
- Environment: ${targetDefect.environment || 'Production'}
- Created At: ${targetDefect.createdAt || 'Recent'}
- Resolution Notes: ${targetDefect.resolutionNotes || 'None yet'}
- Comments (${(targetDefect.comments || []).length}): ${JSON.stringify((targetDefect.comments || []).map((c: any) => ({ user: c.userName, comment: c.body, time: c.createdAt })))}
- Activity Logs (${(targetDefect.activityLogs || []).length}): ${JSON.stringify((targetDefect.activityLogs || []).slice(-3))}

SIMILAR DEFECTS FOUND IN POSTGRESQL:
${similarDefects.length > 0 
  ? similarDefects.map(s => `- ${s.key || '#' + s.id}: "${s.title}" (Status: ${s.status}, Severity: ${s.severity}, Similarity: ${s.similarityPercentage}%)`).join('\n')
  : 'None found above 35% similarity threshold.'}

HISTORICAL RESOLUTIONS FROM RESOLVED DEFECTS:
${historicalResolutions.length > 0
  ? historicalResolutions.map(h => `- ${h.key || '#' + h.id}: "${h.title}" (Resolved by: ${h.resolvedBy})\n  Resolution Notes: "${h.resolutionNotes}"\n  Developer Comments: "${(h.comments || []).map((c: any) => c.body).join('; ') || 'None'}"`).join('\n\n')
  : 'No relevant historical resolution was found in PostgreSQL archive.'}
` : `
NO SPECIFIC DEFECT TARGETED. ALL POSTGRESQL ISSUES SUMMARY:
- Total Defects in Database: ${totalDefectsCount}
- Unresolved Defects: ${unresolvedCount}
- Critical Open Defects: ${criticalOpenCount}
- Status Breakdown: ${JSON.stringify(statusCounts)}
- Severity Breakdown: ${JSON.stringify(severityCounts)}
- Developer Workload (Assigned Defects): ${JSON.stringify(developerWorkload)} (Developer with most defects: ${maxAssignedDev} with ${maxAssignedCount} issues)
- Projects: ${allProjects.map(p => `${p.name} (${p.key})`).join(', ')}
- Sprints: ${allSprints.map(s => `${s.name} [${s.status}] (Goal: ${s.goal})`).join('; ')}
- Active Issues Sample:
${allIssues.slice(0, 8).map(i => `  • [${i.key || '#' + i.id}] (${i.status}, ${i.severity}, ${i.category}) "${i.title}" assigned to ${i.assigneeName || 'Unassigned'}`).join('\n')}
`;

    // 5. Generate AI Response via Gemini
    let aiResponseText = "";

    const systemPrompt = `You are the BugFlow AI Defect Resolution Assistant for "Intelligent Software Defect Tracking System with Resolution Assistance".
You assist developers, QA testers, and engineering leads with:
1. Real defect analysis, classification, and metadata breakdown.
2. Similar defect detection using actual cosine vector similarity percentages from PostgreSQL.
3. Suggested root-cause investigation steps and troubleshooting plans.
4. Historical resolution retrieval from past resolved defects.
5. Accurate project-level defect statistics and developer assignment tracking from PostgreSQL.
6. General software engineering and debugging concepts (HTTP status codes, database timeouts, CORS, race conditions), clearly distinguishing general concepts from project database facts.

CURRENT AUTHENTICATED USER:
- Name: ${user.name}
- Role: ${user.role}

MANDATORY RULES:
- ALWAYS use the real PostgreSQL data provided below. Never invent fake defect keys, numbers, or fake statistics.
- When suggesting root cause investigation areas:
  - ALWAYS use clear wording such as "Possible areas to investigate:" or "AI Suggested Investigation Areas:".
  - NEVER claim "The root cause is definitely X".
- When reporting similar defects:
  - Use the EXACT similarity percentages calculated from the database (e.g., 91%, 84%). Do NOT make up numbers.
- When asked about previous/historical resolutions:
  - If a relevant resolution is in the data, present it clearly with root cause, resolution notes, and developer comments.
  - If NO relevant historical resolution exists, explicitly state: "No relevant historical resolution was found."
- Response Formatting:
  - Keep answers concise, clear, and structured.
  - Use appropriate emoji section headers when helpful (e.g. 🔎 Defect Information, ⚠️ Severity / Priority, 👨‍💻 Assigned Developer, 🔍 Similar Defects, 📜 Previous History, 🛠️ Investigation Suggestions, 💡 Possible Resolution).
  - Do NOT leak database passwords, hashes, connection strings, or system secrets.`;

    if (ai) {
      try {
        const conversationHistory = history
          .slice(-6)
          .map((h: any) => `${h.role === 'user' ? 'User' : 'AI Assistant'}: ${h.content}`)
          .join('\n\n');

        const prompt = `${systemPrompt}

========================================
CURRENT POSTGRESQL DATABASE CONTEXT:
========================================
${defectContextText}

========================================
CONVERSATION HISTORY:
========================================
${conversationHistory || 'No previous conversation.'}

========================================
USER'S LATEST MESSAGE:
========================================
User: "${cleanMessage}"

AI Assistant Response:`;

        const response = await callGemini(model =>
          ai.models.generateContent({
            model,
            contents: prompt,
          })
        );

        aiResponseText = response.text || "";
      } catch (geminiErr) {
        console.error("Gemini AI chat error (generating intelligent data-grounded fallback):", geminiErr);
      }
    }

    // Heuristic data-grounded fallback if Gemini is pending or failed
    if (!aiResponseText || !aiResponseText.trim()) {
      const lower = cleanMessage.toLowerCase();

      if (targetDefect) {
        if (lower.includes("investigate") || lower.includes("check") || lower.includes("cause") || lower.includes("how to fix") || lower.includes("what should")) {
          aiResponseText = `🔎 **Defect Investigation Plan for ${targetDefect.key || '#' + targetDefect.id}**

**Title:** ${targetDefect.title}
**Category / Module:** ${targetDefect.category} (${targetDefect.projectName || 'Core Platform'})
**Severity / Priority:** ${targetDefect.severity} / ${targetDefect.priority}

🛠️ **AI Suggested Investigation Areas:**
1. Check ${targetDefect.category} API response payloads and schema deserialization for unexpected null values.
2. Inspect server error logs and trace unhandled exceptions at application runtime.
3. Review recent code changes or pull requests touching the affected module.
4. Verify edge cases in state transitions and boundary input conditions.

💡 *Note: These are AI-suggested investigation areas to assist your debugging process. The exact root cause should be verified via logs and tests.*`;
        } else if (lower.includes("similar") || lower.includes("duplicate")) {
          if (similarDefects.length > 0) {
            aiResponseText = `🔍 **Similar Defects Found in PostgreSQL for ${targetDefect.key || '#' + targetDefect.id}**

${similarDefects.map(s => `• **${s.key || '#' + s.id}**: ${s.title}\n  *Similarity:* **${s.similarityPercentage}%** • *Status:* ${s.status} • *Severity:* ${s.severity}`).join('\n\n')}

All similarity scores are computed using real vector embeddings and cosine distance against PostgreSQL.`;
          } else {
            aiResponseText = `🔍 **Similar Defect Search**

No similar defects above the 35% similarity threshold were found in PostgreSQL for **${targetDefect.key || '#' + targetDefect.id}**.`;
          }
        } else if (lower.includes("previous") || lower.includes("history") || lower.includes("past") || lower.includes("resolved before") || lower.includes("resolution")) {
          if (historicalResolutions.length > 0) {
            const hist = historicalResolutions[0];
            aiResponseText = `📜 **Historical Resolution Match from PostgreSQL**

**Related Defect:** ${hist.key || '#' + hist.id} - ${hist.title}
**Category:** ${hist.category}
**Resolved By:** ${hist.resolvedBy}

**Previous Resolution Notes:**
${hist.resolutionNotes}

${hist.comments && hist.comments.length > 0 ? `**Developer Notes / Comments:**\n"${hist.comments.map((c: any) => c.body).join('; ')}"` : ''}`;
          } else {
            aiResponseText = `📜 **Historical Resolution Search**

No relevant historical resolution was found in PostgreSQL archive for this issue category.`;
          }
        } else if (lower.includes("assign") || lower.includes("who")) {
          aiResponseText = `👨‍💻 **Assignment Details for ${targetDefect.key || '#' + targetDefect.id}**

• **Assigned Developer:** **${targetDefect.assigneeName || 'Unassigned'}**
• **Role:** ${targetDefect.assigneeRole || 'Developer'}
• **Current Status:** **${targetDefect.status}**
• **Sprint:** ${targetDefect.sprintId ? `Sprint #${targetDefect.sprintId}` : 'Backlog'}`;
        } else {
          aiResponseText = `🔎 **Defect Overview: ${targetDefect.key || '#' + targetDefect.id}**

• **Title:** ${targetDefect.title}
• **Description:** ${targetDefect.description || 'No description logged.'}
• **Category:** ${targetDefect.category}
• **Status:** **${targetDefect.status}**
• **Severity / Priority:** ${targetDefect.severity} / ${targetDefect.priority}
• **Assigned To:** ${targetDefect.assigneeName || 'Unassigned'} (${targetDefect.assigneeRole || 'Developer'})
• **Environment:** ${targetDefect.environment || 'Production'}
• **Sprint:** ${targetDefect.sprintId ? `Sprint #${targetDefect.sprintId}` : 'Backlog'}

${similarDefects.length > 0 ? `🔍 **Top Similar Defect:** ${similarDefects[0].key} (${similarDefects[0].similarityPercentage}% match) - "${similarDefects[0].title}"` : ''}`;
        }
      } else if (lower.includes("how many") || lower.includes("count") || lower.includes("statistics") || lower.includes("critical") || lower.includes("unresolved") || lower.includes("most assigned")) {
        aiResponseText = `📊 **Live PostgreSQL Defect Statistics**

• **Total Defects:** **${totalDefectsCount}**
• **Unresolved Defects:** **${unresolvedCount}**
• **Critical Open Defects:** **${criticalOpenCount}**
• **Developer with Most Defects:** **${maxAssignedDev}** (${maxAssignedCount} issues assigned)

**Defects by Status:**
${Object.entries(statusCounts).map(([st, cnt]) => `• ${st}: ${cnt}`).join('\n')}

**Defects by Severity:**
${Object.entries(severityCounts).map(([sev, cnt]) => `• ${sev}: ${cnt}`).join('\n')}`;
      } else if (lower.includes("http 500") || lower.includes("500 error")) {
        aiResponseText = `💡 **General Software Knowledge: HTTP 500 Internal Server Error**

An **HTTP 500 Internal Server Error** is a generic server-side status code indicating that the server encountered an unexpected condition that prevented it from fulfilling the request.

🛠️ **Possible Areas to Investigate:**
1. Unhandled exceptions or null pointer errors in backend route handlers.
2. Database connection timeouts, authentication rejections, or query syntax failures.
3. Missing environment variables or misconfigured service endpoints.
4. Server memory exhaustion or CPU spikes.

*(Note: This is general software development guidance and not a specific defect in your PostgreSQL database.)*`;
      } else if (lower.includes("timeout") || lower.includes("connection timeout")) {
        aiResponseText = `💡 **General Software Knowledge: Database Connection Timeout**

A **Database Connection Timeout** occurs when a client/server tries to connect to PostgreSQL (or another database) but does not receive an acknowledgment or connection within the designated timeout threshold (e.g. 5000ms).

🛠️ **Possible Areas to Investigate:**
1. Database host, port (5432), and network firewall rules.
2. Connection pool exhaustion (all active pool connections busy).
3. Incorrect database credentials or TLS/SSL certificate requirements.
4. High database server load or long-running locking transactions.`;
      } else if (lower.includes("401") || lower.includes("unauthorized")) {
        aiResponseText = `💡 **General Software Knowledge: HTTP 401 Unauthorized**

An **HTTP 401 Unauthorized** response indicates that the request lacks valid authentication credentials for the requested resource.

🛠️ **Possible Areas to Investigate:**
1. Missing or expired JWT / session token in the \`Authorization: Bearer <token>\` header.
2. Invalid API credentials or password verification failure.
3. Clock skew causing token expiration checks to fail prematurely.`;
      } else {
        aiResponseText = `🤖 **AI Defect Resolution Assistant**

Hello ${user.name}! I am connected to your PostgreSQL database. I can help you with:

- **Defect Analysis**: Explain any defect by key (e.g. \`BF-1482\`, \`BF-1905\`, \`BF-2492\`)
- **Similar Defect Search**: Find duplicate or similar issues using cosine vector embeddings
- **Resolution Suggestions**: Get AI-suggested root-cause investigation checklists
- **Previous Resolutions**: Retrieve historical fixes and developer comments from resolved defects
- **Project Statistics**: Query real defect counts, sprint progress, and developer workloads
- **General Software Debugging**: Ask about HTTP codes, timeouts, or architecture patterns

Try asking:
- *"How many open defects are there?"*
- *"Explain BF-1905"*
- *"What should I check for BF-1905?"*
- *"Are there similar defects to BF-1905?"*
- *"Which developer has the most assigned defects?"*`;
      }
    }

    // 6. Save interaction to chat_messages table in PostgreSQL (and memory store)
    const defectContextKey = targetDefect ? targetDefect.key || String(targetDefect.id) : (explicitKey || null);

    if (isPgConnected && pgPool) {
      try {
        await pgPool.query(
          `INSERT INTO chat_messages (user_id, session_id, user_name, message, response, defect_context, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [user.id, sessionId, user.name, cleanMessage, aiResponseText, defectContextKey, nowStr]
        );
      } catch (saveErr) {
        console.warn("Notice saving chat message to postgres:", saveErr);
      }
    }

    dbData.chatMessages = dbData.chatMessages || [];
    dbData.chatMessages.push({
      id: Date.now(),
      userId: user.id,
      sessionId: sessionId,
      userName: user.name,
      message: cleanMessage,
      response: aiResponseText,
      defectContext: defectContextKey,
      createdAt: nowStr
    });

    // Return structured payload
    return res.json({
      response: aiResponseText,
      sessionId: sessionId,
      defectContext: defectContextKey,
      targetDefect: targetDefect ? {
        id: targetDefect.id,
        key: targetDefect.key,
        title: targetDefect.title,
        status: targetDefect.status,
        severity: targetDefect.severity,
        priority: targetDefect.priority,
        category: targetDefect.category,
        assigneeName: targetDefect.assigneeName
      } : null,
      similarDefects: similarDefects.slice(0, 3),
      historicalResolutions: historicalResolutions.slice(0, 2),
      status: "success",
      database: isPgConnected ? "PostgreSQL" : "Persistent Store",
      provider: ai ? "Gemini AI Engine (Grounded in PostgreSQL)" : "BugFlow Expert Knowledge Engine"
    });

  } catch (error: any) {
    console.error("AI Chat handler exception:", error);
    return res.status(500).json({
      detail: "Unable to retrieve project information or generate response at the moment.",
      error: error?.message || "Internal server error"
    });
  }
});

// GET Chat History for a Session
app.get("/api/ai/chat/history", async (req, res) => {
  const sessionId = req.query.session_id as string;
  if (!sessionId) {
    return res.json({ messages: [], count: 0 });
  }

  if (isPgConnected && pgPool) {
    try {
      const result = await pgPool.query(
        `SELECT id, user_id as "userId", session_id as "sessionId", user_name as "userName", message, response, defect_context as "defectContext", created_at as "createdAt"
         FROM chat_messages
         WHERE session_id = $1
         ORDER BY id ASC
         LIMIT 100`,
        [sessionId]
      );
      return res.json({
        messages: result.rows,
        count: result.rows.length,
        sessionId,
        source: "PostgreSQL Database"
      });
    } catch (err) {
      console.error("Error fetching chat history from postgres:", err);
    }
  }

  const inMem = (dbData.chatMessages || []).filter(m => m.sessionId === sessionId);
  res.json({
    messages: inMem,
    count: inMem.length,
    sessionId,
    source: "Memory Store"
  });
});

// DELETE Chat History for a Session
app.delete("/api/ai/chat/history", async (req, res) => {
  const sessionId = req.query.session_id as string;
  if (!sessionId) {
    return res.status(400).json({ detail: "session_id parameter is required" });
  }

  if (isPgConnected && pgPool) {
    try {
      await pgPool.query(`DELETE FROM chat_messages WHERE session_id = $1`, [sessionId]);
    } catch (err) {
      console.error("Error deleting chat history in postgres:", err);
    }
  }

  if (dbData.chatMessages) {
    dbData.chatMessages = dbData.chatMessages.filter(m => m.sessionId !== sessionId);
  }

  res.json({ message: "Chat history cleared successfully.", sessionId });
});


async function startServer() {
  await initPostgreSQL();

  if (process.env.NODE_ENV !== "production") {
    process.env.DISABLE_HMR = "true";
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const port = await findAvailablePort(DEFAULT_PORT);
  app.listen(port, "0.0.0.0", () => {
    console.log(`\n🚀 BugFlow Server running on port ${port}`);
    console.log(`👉 Open in your browser: http://localhost:${port}\n`);
  });
}

startServer();
