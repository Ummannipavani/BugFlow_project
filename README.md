# Intelligent Software Defect Tracking System with Resolution Assistance

> An enterprise-grade, full-stack defect lifecycle management, intelligent analytics, and resolution engineering platform featuring **PostgreSQL persistence**, **pgvector 3072D semantic search**, **Role-Based Access Control (RBAC)**, **10-Point Real-Time Defect Analytics**, **Sprint Planning & Backlog Management**, **Secure File Attachments**, and an **AI Resolution Assistant powered by Google Gemini**.

---

## 📑 Table of Contents
- [Project Overview](#-project-overview)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [System Architecture](#-system-architecture)
- [Project Structure](#-project-structure)
- [Quickstart & Installation](#-quickstart--installation)
- [Environment Variables](#-environment-variables)
- [Intelligent Defect Dashboard (10 Real-Data Insights)](#-intelligent-defect-dashboard-10-real-data-insights)
- [AI & Intelligent Features](#-ai--intelligent-features)
- [Database Schema & Performance Optimization](#-database-schema--performance-optimization)
- [Role-Based Access Control (RBAC)](#-role-based-access-control-rbac)
- [API Reference & Swagger Documentation](#-api-reference--swagger-documentation)
- [Automated Verification & Test Suite](#-automated-verification--test-suite)
- [Security & Production Readiness](#-security--production-readiness)

---

## 🎯 Project Overview

The **Intelligent Software Defect Tracking System with Resolution Assistance** (BugFlow) is a production-ready quality engineering platform designed for software engineering teams. It governs a strict, auditable defect lifecycle (`Reported` → `Assigned` → `In Progress` → `In Review` → `Resolved` → `Verified` → `Closed` / `Reopened`) while assisting developers with Google Gemini AI-driven defect classification, 3072D vector similarity duplicate detection, specification refinement, diagnostic investigation checklists, and root-cause assistance.

Built for **Developers**, **QA Testers**, and **Project Administrators**, the system ensures permanent data persistence with PostgreSQL, provides agile sprint planning, delivers real-time defect analytics across 10 critical operational dimensions, and maintains comprehensive audit histories.

---

## ✨ Key Features

- **Role-Based Access Control (RBAC)**: Strict permission boundaries for `Admin`, `Developer`, and `User / QA` backed by JWT and bcrypt password hashing.
- **Defect Lifecycle Governance**: Validated state-machine transitions preventing invalid workflow jumps and enforcing quality gates.
- **10-Point Real Defect Analytics**: Zero hardcoded values; computed live from PostgreSQL and workspace datasets.
- **Sprint Planning & Backlog**: Multi-project agile sprint management with start/end dates, delivery goals, and backlog aging analysis.
- **Real File Attachments**: Native file upload supporting multi-file drag-and-drop (up to 20MB), validation, in-browser previews, direct downloads, and secure deletion.
- **Dynamic Activity Audit History**: Automatic, immutable timestamped logging for all status, priority, severity, assignee, sprint, and attachment changes.
- **Discussion Threads**: Contextual collaboration comments and notes attached directly to defects.
- **Intelligent Defect Classification**: Auto-infers category, module, defect type, severity, and priority using Google Gemini.
- **Semantic Vector Search & Similar Defect Warning**: 3072D dense vector cosine similarity (`gemini-embedding-2-preview` + pgvector) to detect duplicates and search defects semantically.
- **AI Bug Report Refiner**: Converts raw notes into structured Markdown bug specifications with reproduction steps and diagnostic profiling questions.
- **Resolution Assistance**: Generates diagnostic investigation steps, previous fix insights, and relevant codebase file hints.
- **Interactive OpenAPI / Swagger Docs**: Live interactive API explorer at `/api-docs` with schema validation.

---

## 🛠 Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, Tailwind CSS v4, Lucide React, Motion |
| **Backend** | Node.js, Express, TypeScript, Multer, tsx, esbuild, Python FastAPI (Secondary Service) |
| **Database & Storage** | PostgreSQL (`pg` pool, `pgvector`), Optimized B-Tree Indexes, Persistent disk fallback store, Local `/uploads` |
| **Authentication & Security** | JWT Bearer Tokens (HS256), Bcryptjs (10 salt rounds), Strict Whitelist Multer Upload Security |
| **AI Engine** | Google GenAI SDK (`@google/genai`), Gemini 3.1 Flash Lite / Gemini 3.6 Flash / Gemini Embedding 2 (3072D) |
| **API Documentation** | OpenAPI 3.0 / Swagger UI (`swagger-ui-express`, `swagger-jsdoc`) |

---

## 🏛 System Architecture

```mermaid
flowchart LR
    Client["React 19 Frontend\n(Dashboard.jsx & Analytics)"]
    Server["Express / TypeScript REST Engine\n(server.ts)"]
    DB[("PostgreSQL Database\n(pgvector + B-Tree Indexes)")]
    Disk[("Secure Local Storage\n/uploads & Fallback Store")]
    AI["Google Gemini AI Engine\n(3072D Embeddings & Flash LLMs)"]

    Client <-->|"REST API / JWT / Multipart"| Server
    Server <-->|"pg Connection Pool"| DB
    Server <-->|"Sanitized File I/O"| Disk
    Server <-->|"GenAI SDK (Multi-Tier Fallback)"| AI
```

---

## 📂 Project Structure

```
.
├── backend/
│   ├── core/                       # Python backend security & DB utilities
│   ├── migrations/                 # Alembic database migration scripts
│   ├── routers/                    # Python FastAPI modular routers (auth, issues, ai)
│   ├── data_store.json             # Persistent disk fallback store
│   ├── database.py                 # SQLAlchemy database session
│   ├── main.py                     # Python FastAPI application entry point
│   └── models.py                   # SQLAlchemy ORM models with indexed columns
├── frontend/
│   └── src/
│       └── components/
│           ├── AIChatDrawer.jsx    # Defect Resolution AI Assistant Chat drawer
│           ├── AnalyticsDashboard.jsx # 10-Point Real Defect Analytics Dashboard
│           ├── Dashboard.jsx       # Main interactive Kanban, table, and defect lifecycle view
│           └── SwaggerDocsView.jsx # In-app interactive Swagger / OpenAPI viewer
├── src/
│   ├── analyticsService.ts         # Pure TypeScript 10-point defect analytics engine
│   ├── App.tsx                     # Top-level React application root
│   ├── index.css                   # Global Tailwind CSS v4 styling
│   ├── main.tsx                    # React DOM entry point
│   ├── swaggerDocs.ts              # Complete OpenAPI 3.0 specification definition
│   ├── testSuite.ts                # Comprehensive automated verification suite
│   └── validation.ts               # Strict input validation and state transition rules
├── uploads/                        # Server directory for verified defect attachments
├── .env.example                    # Environment variable template
├── package.json                    # Project dependencies and npm scripts
├── server.ts                       # Express backend, PostgreSQL pool, API routes, & AI pipeline
├── tsconfig.json                   # TypeScript compiler configuration
└── vite.config.ts                  # Vite build configuration
```

---

## 🚀 Quickstart & Installation

### Prerequisites
- **Node.js**: v18.0+
- **PostgreSQL** (Optional; persistent file-backed store activates automatically if `DATABASE_URL` is omitted)
- **Git**

### Installation Steps

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/vaishnavivardineni/Bug-Flow.git
   cd "bugflow (1)"
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   ```bash
   cp .env.example .env
   ```
   Add your `DATABASE_URL` (optional) and `GEMINI_API_KEY` (optional) to `.env`.

4. **Run Development Server**:
   ```bash
   npm run dev
   ```
   Open **http://localhost:3000** in your browser.

5. **Build and Run Production Bundle**:
   ```bash
   npm run build
   npm start
   ```

6. **Run TypeScript Type Check & Verification**:
   ```bash
   npm run lint
   npx tsx src/testSuite.ts
   ```

---

## 🔑 Environment Variables

| Variable | Required | Description |
| :--- | :---: | :--- |
| `DATABASE_URL` | Optional | PostgreSQL connection URI (`postgresql://user:pass@host:5432/dbname`). |
| `GEMINI_API_KEY` | Optional | Google Gemini API key for AI classification, embeddings, and resolution assistance. |
| `JWT_SECRET` | Optional | Secret key for signing HS256 JWT tokens. |
| `PORT` | Optional | Server port (Default: `3000`). |

---

## 📊 Intelligent Defect Dashboard (10 Real-Data Insights)

The analytics engine (`src/analyticsService.ts`) computes all defect insights directly from database records without any hardcoded mock data:

1. **Most Common Defect Categories**: Ranked distribution of defects across categories (Frontend, Payment, Security, Database, UI/UX, AI Pipeline) with percentage share and critical ticket counts.
2. **Most Affected Components**: Module-level defect density analysis showing open, resolved, and critical ticket counts per component.
3. **Repeated Defects**: Pattern detection identifying recurring defect titles, duplicate signatures, and reopened defect instances.
4. **Similar Defects**: Pairwise similarity analysis detecting closely related defect pairs across the database with similarity scores.
5. **Average Resolution Time (MTTR)**: Mean Time to Resolve computed from defect creation to resolution timestamps, broken down overall and per severity level (Critical, High, Medium, Low).
6. **Critical Defect Trends**: Critical defect ratio (%) and historical timeline of critical issues reported by date.
7. **Defect Backlog**: Active unresolved ticket count, unassigned backlog count, priority distribution, and ticket aging analysis (<7 days, 7–30 days, >30 days).
8. **Resolution Trends**: Timeline comparing defect discovery rate vs resolution velocity over time.
9. **Developer Workload**: Assignment distribution per developer, tracking open, resolved, and critical tickets along with individual completion rate (%).
10. **Sprint Defect Trends**: Sprint-by-sprint completion velocity, defect status distribution, and active sprint health metrics.

---

## 🧠 AI & Intelligent Features

1. **Intelligent Defect Classification (`/api/ai/classify`)**: Ingests title and description to infer category, module, defect type, suggested severity, and priority with confidence scores.
2. **Semantic Vector Search (`/api/ai/semantic-search`)**: Generates 3072D dense vector embeddings (`gemini-embedding-2-preview`) and performs exact cosine similarity search across PostgreSQL records.
3. **Similar Defect & Duplicate Warning (`/api/ai/similar-defects`, `/api/ai/compare-defects`)**: Detects semantic duplicate candidates before or after defect creation with mathematical cosine similarity scores.
4. **AI Resolution Assistance (`/api/ai/resolution-assistance`)**: Evaluates defect description, developer comments, and similar historical resolutions to produce actionable investigation checklists, remediation hints, and relevant codebase file hints.
5. **Historical Resolution Retrieval (`/api/ai/historical-resolutions`)**: Queries past resolved and closed defects in PostgreSQL to supply proven fix strategies for recurring problems.
6. **AI Bug Report Refiner (`/api/ai/refine-report`)**: Converts unstructured, raw bug notes into standardized Markdown specifications with reproduction steps and diagnostic profiling questions.
7. **AI Defect Chat Assistant (`/api/ai/chat`)**: Context-aware interactive assistant grounded in real defect data and historical resolutions.

---

## 🗄 Database Schema & Performance Optimization

### Optimized Database Indexes
To ensure high-throughput queries on large issue tables, the following B-tree and vector indexes are applied:
- `idx_issues_project_id` on `issues(project_id)`: Accelerates project-filtered queries.
- `idx_issues_sprint_id` on `issues(sprint_id)`: Accelerates sprint backlog and Kanban views.
- `idx_issues_status` on `issues(status)`: Optimizes state-based filtering and backlog metrics.
- `idx_issues_priority` & `idx_issues_severity`: Accelerates priority/severity filtering and sorting.
- `idx_issues_category` on `issues(category)`: Optimizes category breakdown analytics.
- `idx_issues_created_at` & `idx_issues_key`: Accelerates timeline trend groupings and direct key lookups.
- `idx_sprints_project_id` & `idx_sprints_status`: Optimizes sprint queries.
- `idx_users_role` on `users(role)`: Accelerates developer workload aggregation.
- `idx_attachments_issue_id` & `idx_chat_messages_session`: Optimizes relational child lookups.

### Entity Relationship Diagram

```mermaid
erDiagram
    USERS ||--o{ ISSUES : "assignee / reporter"
    PROJECTS ||--o{ SPRINTS : "contains"
    PROJECTS ||--o{ ISSUES : "contains"
    SPRINTS ||--o{ ISSUES : "allocates"
    ISSUES ||--o{ ATTACHMENTS : "contains"
    ISSUES ||--o{ COMMENTS : "contains"

    USERS {
        int id PK
        string email UK
        string password_hash
        string role
        string name
    }
    PROJECTS {
        int id PK
        string name
        string key
        string category
    }
    SPRINTS {
        int id PK
        int project_id FK
        string name
        string status
        string start_date
        string end_date
    }
    ISSUES {
        int id PK
        string key
        string title
        string status
        string priority
        string severity
        string category
        int project_id FK
        int sprint_id FK
        jsonb comments
        jsonb attachments
        jsonb activity_logs
        vector embedding
    }
    ATTACHMENTS {
        int id PK
        int issue_id FK
        string original_name
        string file_name
        string file_type
        int file_size
        text storage_path
    }
```

---

## 🔒 Role-Based Access Control (RBAC)

| Capability | Admin | Developer | User / QA |
| :--- | :---: | :---: | :---: |
| **View Dashboard, Defects, Sprints** | ✅ | ✅ | ✅ |
| **Report New Defect** | ✅ | ✅ | ✅ |
| **Add Comments & Upload Attachments** | ✅ | ✅ | ✅ |
| **Update Defect Status (`In Progress`, `In Review`)** | ✅ | ✅ | ❌ |
| **Resolve Defect (`In Review` → `Resolved`)** | ✅ | ✅ | ❌ |
| **Verify / Close Defect** | ✅ | ✅ | ✅ |
| **Reopen Resolved/Closed Defect** | ✅ | ✅ | ✅ |
| **Create / Edit Sprints** | ✅ | ✅ | ❌ |
| **Delete Sprints** | ✅ | ❌ | ❌ |
| **Create / Edit Projects** | ✅ | ❌ | ❌ |
| **Delete Projects & Defects** | ✅ | ❌ | ❌ |
| **Manage User Roles** | ✅ | ❌ | ❌ |

---

## 📡 API Reference & Swagger Documentation

Interactive OpenAPI / Swagger documentation is served at `/api-docs` (and raw JSON at `/api-docs.json`).

### Key API Endpoints

#### Authentication & Users
- `POST /api/auth/register`: Register new user account.
- `POST /api/auth/login`: Authenticate and receive signed JWT.
- `GET /api/auth/me`: Retrieve current authenticated profile.
- `GET /api/users`: List users in workspace.
- `PATCH /api/users/:id/role`: Promote user role (Admin only).

#### Projects & Sprints
- `GET /api/projects` | `POST /api/projects`: List projects / Create project (Admin).
- `PATCH /api/projects/:id` | `DELETE /api/projects/:id`: Update / Delete project (Admin).
- `GET /api/sprints` | `POST /api/sprints`: List sprints / Create sprint (Admin/Dev).
- `PATCH /api/sprints/:id` | `DELETE /api/sprints/:id`: Update / Delete sprint.

#### Defects & Lifecycle
- `GET /api/issues` | `POST /api/issues`: List defects / Create new defect.
- `GET /api/issues/:id` | `PATCH /api/issues/:id`: Get defect details / Transition defect status.
- `DELETE /api/issues/:id`: Delete defect permanently (Admin only).
- `POST /api/issues/:id/comments`: Add comment to defect thread.
- `GET /api/issues/:id/attachments` | `POST /api/issues/:id/attachments`: Manage defect attachments.

#### Real-Time Defect Analytics
- `GET /api/analytics` | `GET /api/analytics/overview`: Unified 10-point analytics summary.
- `GET /api/analytics/top-categories`: Most common defect categories ranking.
- `GET /api/analytics/components`: Most affected platform components.
- `GET /api/analytics/repeated`: Repeated and recurring defect pattern detection.
- `GET /api/analytics/similar`: Detected similar defect pairs with similarity scores.
- `GET /api/analytics/backlog`: Active backlog breakdown, unassigned count, and aging (<7d, 7-30d, >30d).
- `GET /api/analytics/sprints`: Sprint defect trends and completion rate velocity.
- `GET /api/analytics/resolution-time`: Average resolution time (MTTR) overall and by severity.
- `GET /api/analytics/workload`: Developer workload distribution and completion rates.
- `GET /api/analytics/trends` | `GET /api/analytics/critical-trends`: Historical trend timelines.

#### AI Resolution Engine
- `POST /api/ai/classify`: AI classification of category, defect type, severity, priority.
- `POST /api/ai/similar-defects`: Real-time duplicate defect detection.
- `POST /api/ai/compare-defects`: 3072D vector cosine similarity defect comparison.
- `POST /api/ai/semantic-search`: Semantic search across defect database.
- `POST /api/ai/resolution-assistance`: Root-cause investigation checklist and remediation hints.
- `POST /api/ai/historical-resolutions`: Retrieve past resolution strategies for similar defects.
- `POST /api/ai/summarize-defect`: Concise defect summarization.
- `POST /api/ai/refine-report`: Convert raw notes into structured Markdown specification.
- `POST /api/ai/chat`: Defect resolution interactive assistant chat.

---

## 🧪 Automated Verification & Test Suite

The project includes an end-to-end automated verification suite (`src/testSuite.ts`) that validates:
1. Service and Database Health diagnostics.
2. Semantic vector search & cosine similarity scores.
3. Real PostgreSQL Analytics Engine & all 10 defect insights.
4. Dedicated analytics sub-endpoints (`/api/analytics/backlog`, `/api/analytics/sprints`, `/api/analytics/components`).
5. Authentication and JWT-based RBAC enforcement.
6. Defect creation and strict enum payload validation.
7. Defect lifecycle state transitions and state-machine constraints.
8. AI defect intelligence (summarization, historical resolutions, resolution checklists).

To run the verification suite:
```bash
npx tsx src/testSuite.ts
```

---

## 🛡 Security & Production Readiness

- **Authentication**: All user passwords hashed with `bcryptjs` (10 rounds). Dynamic authenticated identity resolved via signed JWT tokens.
- **Upload Security**: 20MB maximum file size, whitelisted file extensions (`.png`, `.jpg`, `.pdf`, `.txt`, `.docx`, `.zip`), blacklist rejection of dangerous executables/scripts (`.exe`, `.sh`, `.bat`, `.js`, `.ps1`), sanitized randomized filenames to prevent traversal/collision, and `X-Content-Type-Options: nosniff`.
- **Relational Integrity**: Foreign key constraints with cascading deletes prevent orphaned records across projects, sprints, issues, and attachments.
- **Dual-Engine Continuity**: High-performance PostgreSQL persistence with automated fallback to persistent local disk store.

---

## 📄 License
Developed for the Software Engineering Defect Tracking & Resolution Assistance Capstone Project. All rights reserved.
