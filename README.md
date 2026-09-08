# Intelligent Software Defect Tracking System with Resolution Assistance

> A full-stack defect lifecycle management and resolution engineering platform featuring **PostgreSQL persistence**, **Role-Based Access Control (RBAC)**, **Sprint Planning**, **Real File Attachments**, and an **AI Resolution Assistant powered by Google Gemini**.

---

## 📑 Table of Contents
- [Project Overview](#-project-overview)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [System Architecture](#-system-architecture)
- [Project Structure](#-project-structure)
- [Quickstart & Installation](#-quickstart--installation)
- [Environment Variables](#-environment-variables)
- [API Reference](#-api-reference)
- [Database Schema](#-database-schema)
- [AI Capabilities](#-ai-capabilities)
- [Security & Architecture Decisions](#-security--architecture-decisions)
- [Project Status & Limitations](#-project-status--limitations)

---

## 🎯 Project Overview

The **Intelligent Software Defect Tracking System with Resolution Assistance** is a defect management platform that streamlines software quality engineering. It enforces a strict defect lifecycle (`Reported` → `Assigned` → `In Progress` → `In Review` → `Resolved` → `Verified` → `Closed` / `Reopened`) while assisting engineers with AI-driven defect classification, real-time duplicate detection, specification refinement, and resolution checklists.

Built for **Developers**, **QA Testers**, and **Project Administrators**, the system ensures data persistence with PostgreSQL, provides agile sprint planning, and maintains audit trails for compliance.

---

## ✨ Key Features

- **Role-Based Access Control (RBAC)**: Enforced permission boundaries for `Admin`, `Developer`, and `User / QA`.
- **Defect Lifecycle Governance**: Validated state-machine transitions preventing invalid workflow jumps.
- **Sprint Planning & Backlog**: Create active/planned sprints with dates and goals; assign defects across sprints or backlogs.
- **Real File Attachments**: Native file picker integration supporting drag-and-drop, multi-file uploads (up to 20MB), in-browser previews, direct downloads, and secure deletion.
- **Dynamic Activity Audit History**: Automatic, timestamped logging for all status, priority, assignee, sprint, and attachment changes.
- **Discussion Threads**: Contextual comments and notes attached directly to defects.
- **Intelligent Defect Classification**: Auto-infers category, module, defect type, severity, and priority using Google Gemini.
- **Duplicate & Similar Defect Warning**: Evaluates existing issues in real-time to alert users before creating duplicate tickets.
- **AI Bug Report Refiner**: Converts raw notes into structured Markdown bug specifications with reproduction steps.
- **Resolution Assistance**: Generates diagnostic investigation steps, previous fix insights, and relevant codebase file hints.

---

## 🛠 Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, Tailwind CSS v4, Lucide React, Motion |
| **Backend** | Node.js, Express, TypeScript, Multer, tsx, esbuild |
| **Database & Storage** | PostgreSQL (`pg` pool), Persistent JSON fallback store, Local `/uploads` directory |
| **Authentication** | Bcryptjs (10 salt rounds), Session/Header-based RBAC |
| **AI Engine** | Google GenAI SDK (`@google/genai`), Gemini 2.5/3 Flash models with heuristic fallback |

---

## 🏛 System Architecture

```mermaid
flowchart LR
    Client["React 19 Frontend\n(Dashboard.jsx)"]
    Server["Express / TypeScript Backend\n(server.ts)"]
    DB[("PostgreSQL Database\n(Tables & JSONB)")]
    Disk[("Local Storage\n/uploads & Fallback Store")]
    AI["Google Gemini AI\n(Classification & Guidance)"]

    Client <-->|"REST API / Multipart"| Server
    Server <-->|"pg Pool Queries"| DB
    Server <-->|"File I/O"| Disk
    Server <-->|"GenAI SDK"| AI
```

*Summary*: Client requests flow through Express REST endpoints where user identity and RBAC are validated. Server handlers interact directly with PostgreSQL connection pools, store attachments securely on disk, and invoke Gemini AI with automatic multi-tier fallback.

---

## 📂 Project Structure

```
.
├── backend/
│   └── data_store.json             # Persistent disk fallback store
├── frontend/
│   └── src/
│       └── components/
│           └── Dashboard.jsx       # Main interactive dashboard component
├── src/
│   ├── App.tsx                     # Top-level React root
│   ├── index.css                   # Global Tailwind CSS styles
│   └── main.tsx                    # React DOM entry point
├── uploads/                        # Server directory for real defect attachments
├── .env.example                    # Environment variable template
├── package.json                    # Dependencies and build scripts
├── server.ts                       # Express backend, PostgreSQL schemas & API routes
└── tsconfig.json                   # TypeScript compiler configuration
```

---

## 🚀 Quickstart & Installation

### Prerequisites
- **Node.js**: v18.0+
- **PostgreSQL** (Optional; persistent disk store activates automatically if DB URL is not set)
- **Git**

### Installation Steps

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/your-username/intelligent-software-defect-tracking-system.git
   cd intelligent-software-defect-tracking-system
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment**:
   ```bash
   cp .env.example .env
   ```
   Add your `DATABASE_URL` (optional) and `GEMINI_API_KEY` (optional) to `.env`.

4. **Start the Application**:
   ```bash
   npm run dev
   ```
   Open **http://localhost:3000** in your browser.

5. **Build for Production**:
   ```bash
   npm run build
   npm start
   ```

---

## 🔑 Environment Variables

| Variable | Required | Description |
| :--- | :---: | :--- |
| `DATABASE_URL` | Optional | PostgreSQL connection URI (`postgresql://user:pass@host:5432/dbname`). |
| `GEMINI_API_KEY` | Optional | Google Gemini API key for AI features. |
| `APP_URL` | Optional | Hosting base URL for self-referential links. |

---

## 📡 API Reference

### Authentication & Projects
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :---: |
| `POST` | `/api/auth/register` | Register user with bcrypt password hash | Public |
| `POST` | `/api/auth/login` | Authenticate user credentials | Public |
| `GET` / `POST` | `/api/projects` | List all projects / Create new project | Public / Admin |
| `PATCH` / `DELETE` | `/api/projects/:id` | Update project / Cascade delete project | Admin |

### Sprints & Defects
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :---: |
| `GET` / `POST` | `/api/sprints` | List sprints (by `?project_id=`) / Create sprint | Public / All |
| `PATCH` / `DELETE` | `/api/sprints/:id` | Update sprint goal/status / Delete sprint | All / Admin |
| `GET` / `POST` | `/api/issues` | Filtered defects search / Create new defect | Public / All |
| `GET` / `PATCH` | `/api/issues/:id` | Fetch defect details / Update with state transitions | Public / RBAC |
| `DELETE` | `/api/issues/:id` | Permanently remove defect | Admin |

### Attachments & AI
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :---: |
| `GET` / `POST` | `/api/issues/:id/attachments` | List attachments / Upload real file (max 20MB) | Public / All |
| `GET` / `DELETE` | `/api/attachments/:id` | Download/View file (`?download=true`) / Delete file | Public / All |
| `POST` | `/api/ai/classify` | AI category, type, severity, and priority inference | Public |
| `POST` | `/api/ai/similar-defects`| Real-time duplicate defect detection | Public |
| `POST` | `/api/ai/resolution-assistance`| Investigation checklist and remediation hints | Public |
| `POST` | `/api/ai/enhance-issue` | Auto-format raw notes into structured Markdown spec | Public |

---

## 🗄 Database Schema

```mermaid
erDiagram
    USERS ||--o{ ISSUES : "assignee"
    PROJECTS ||--o{ SPRINTS : "contains"
    PROJECTS ||--o{ ISSUES : "contains"
    SPRINTS ||--o{ ISSUES : "allocates"
    ISSUES ||--o{ ATTACHMENTS : "contains"

    USERS {
        int id PK
        string email UK
        string password_hash
        string role
    }
    PROJECTS {
        int id PK
        string name
        string key
    }
    SPRINTS {
        int id PK
        int project_id FK
        string name
        string status
    }
    ISSUES {
        int id PK
        string key
        string title
        string status
        string priority
        string severity
        int project_id FK
        int sprint_id FK
        jsonb activity_logs
    }
    ATTACHMENTS {
        int id PK
        int issue_id FK
        string file_name
        string file_type
        int file_size
        text storage_path
    }
```

---

## 🧠 AI Capabilities

1. **Intelligent Defect Classification**: Ingests title and description to categorize module, defect type, suggested severity, and priority with confidence scores.
2. **Duplicate Defect Prevention**: Calculates token overlap against existing database records to alert developers to duplicate issues.
3. **AI Resolution Assistant**: Analyzes defect context to produce actionable investigation checklists, historical remediation insights, and relevant code hints.
4. **Resilient AI Pipeline**: Multi-tier model routing (`gemini-3.8-flash` → `gemini-3.6-flash` → `gemini-3.5-flash-lite`) with automatic heuristic fallback when API limits or offline modes occur.

> *Note: AI outputs serve as recommendations. The developer remains responsible for validating and implementing final software resolutions.*

---

## 🔒 Security & Engineering Decisions

- **Password Encryption**: All credentials hashed with `bcryptjs` (10 rounds).
- **File Upload Security**: Enforces a 20MB limit, whitelist validation (`.png`, `.jpg`, `.pdf`, `.txt`, `.docx`, `.zip`), blacklist rejection of executables (`.exe`, `.sh`, `.bat`, `.js`), random storage filenames, and `X-Content-Type-Options: nosniff`.
- **Relational Integrity**: Foreign key constraints with cascading deletes prevent orphaned records across projects, sprints, and issues.
- **Dual-Mode Continuity**: Full PostgreSQL operational capability with automatic in-memory/disk store fallback.

---

## 📊 Project Status & Limitations

### Status Matrix
- ✅ **User Authentication & RBAC**: Completed (Admin, Developer, QA)
- ✅ **Defect Lifecycle Governance**: Completed (Strict state machine)
- ✅ **PostgreSQL Persistence**: Completed (Relational tables & pool)
- ✅ **Real File Upload & Storage**: Completed (Multi-file, validation, download)
- ✅ **Sprint Planning & Backlog**: Completed (Active/Planned management)
- ✅ **AI Classification & Resolution**: Completed (Gemini 2.5/3 with heuristics)
- 🟡 **Vector Search**: Partially Completed (Token-weighted semantic matching active; `pgvector` dense search planned)
- 🔴 **Cloud Object Storage (S3)**: Pending (Local server storage currently used)

---

## 📄 License
Developed as part of an engineering internship project. All rights reserved.
