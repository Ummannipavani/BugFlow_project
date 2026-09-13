export const openapiSpec = {
  openapi: "3.0.0",
  info: {
    title: "Intelligent Software Defect Tracking System with Resolution Assistance API",
    version: "2.0.0",
    description: "Enterprise REST API engine for defect lifecycle tracking, role-based access control, sprint planning, file attachments, and Google Gemini AI resolution engineering."
  },
  servers: [
    {
      url: "/",
      description: "Default API Host"
    }
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Standard JWT Bearer token authentication. Format: Bearer <token>"
      },
      UserIdentityHeaders: {
        type: "apiKey",
        in: "header",
        name: "x-user-role",
        description: "Authenticated user role header (Admin, Developer, User / QA). Also supports x-user-name and x-user-id."
      }
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          detail: { type: "string", example: "Invalid request payload" }
        }
      },
      User: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          name: { type: "string", example: "Sarah Connor" },
          email: { type: "string", example: "admin@bugflow.io" },
          role: { type: "string", enum: ["Admin", "Developer", "User / QA"], example: "Admin" },
          avatar: { type: "string", example: "SC" },
          createdAt: { type: "string", example: "2026-07-01T00:00:00Z" }
        }
      },
      Project: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          name: { type: "string", example: "BugFlow Core" },
          key: { type: "string", example: "BFC" },
          category: { type: "string", example: "Core Platform" },
          description: { type: "string", example: "Main defect tracking engine" },
          issueCount: { type: "integer", example: 5 },
          createdAt: { type: "string", example: "2026-07-15" }
        }
      },
      Sprint: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          name: { type: "string", example: "Sprint 14: Core Stability" },
          projectId: { type: "integer", example: 1 },
          startDate: { type: "string", example: "2026-08-01" },
          endDate: { type: "string", example: "2026-08-15" },
          goal: { type: "string", example: "Resolve OAuth token race conditions" },
          status: { type: "string", enum: ["Active", "Planned", "Completed"], example: "Active" },
          createdAt: { type: "string", example: "2026-08-01T08:00:00Z" }
        }
      },
      Defect: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1042 },
          key: { type: "string", example: "BF-1042" },
          title: { type: "string", example: "OAuth2 redirect loop on staging" },
          description: { type: "string", example: "### 📌 Overview\nDetailed bug report..." },
          summary: { type: "string", example: "SSO redirect loop occurs on staging due to missing CORS headers." },
          status: { type: "string", enum: ["Reported", "Assigned", "In Progress", "In Review", "Resolved", "Verified", "Closed", "Reopened"], example: "Reported" },
          priority: { type: "string", enum: ["Critical", "High", "Medium", "Low"], example: "Critical" },
          severity: { type: "string", enum: ["Critical", "High", "Medium", "Low"], example: "Critical" },
          environment: { type: "string", example: "Staging Web Portal" },
          issueType: { type: "string", example: "Security" },
          category: { type: "string", example: "Security / Auth" },
          projectName: { type: "string", example: "API Gateway" },
          projectId: { type: "integer", example: 2 },
          sprintId: { type: "integer", nullable: true, example: 3 },
          assigneeName: { type: "string", example: "Sarah Connor" },
          assigneeRole: { type: "string", example: "Admin" },
          resolutionNotes: { type: "string", example: "Updated CORS origin domain headers." },
          createdAt: { type: "string", example: "2026-07-31T08:30:00Z" },
          comments: { type: "array", items: { type: "object" } },
          attachments: { type: "array", items: { type: "object" } },
          activityLogs: { type: "array", items: { type: "object" } }
        }
      },
      Attachment: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          issueId: { type: "integer", example: 1042 },
          originalName: { type: "string", example: "error_trace.log" },
          fileName: { type: "string", example: "error_trace.log" },
          fileType: { type: "string", example: "text/plain" },
          fileSize: { type: "integer", example: 14200 },
          fileUrl: { type: "string", example: "/uploads/att_175653_abc.log" },
          uploadedByName: { type: "string", example: "Sarah Connor" },
          createdAt: { type: "string", example: "2026-07-31T08:35:00Z" }
        }
      },
      AnalyticsSummary: {
        type: "object",
        properties: {
          totalDefects: { type: "integer", example: 15 },
          openDefects: { type: "integer", example: 7 },
          resolvedDefects: { type: "integer", example: 5 },
          closedDefects: { type: "integer", example: 3 },
          reopenedDefects: { type: "integer", example: 1 },
          avgResolutionHours: { type: "number", nullable: true, example: 14.5 },
          avgResolutionDisplay: { type: "string", example: "14.5 hrs" },
          mttrBySeverity: { type: "object" },
          criticalRatio: { type: "number", example: 20.0 },
          criticalRatioDisplay: { type: "string", example: "20.0%" },
          defectsBySeverity: { type: "object", example: { Critical: 3, High: 5, Medium: 4, Low: 3 } },
          defectsByCategory: { type: "object", example: { "Frontend": 6, "Security / Auth": 4, "Database / ORM": 3, "Backend": 2 } },
          topCategories: { type: "array", items: { type: "object" } },
          affectedComponents: { type: "array", items: { type: "object" } },
          repeatedDefects: { type: "array", items: { type: "object" } },
          repeatedDefectsCount: { type: "integer", example: 2 },
          similarDefects: { type: "array", items: { type: "object" } },
          similarDefectsCount: { type: "integer", example: 4 },
          defectsByStatus: { type: "object", example: { "Reported": 3, "In Progress": 4, "Resolved": 5, "Closed": 3 } },
          defectBacklog: { type: "object" },
          developerWorkload: { type: "array", items: { type: "object" } },
          defectTrends: { type: "array", items: { type: "object" } },
          criticalDefectTrends: { type: "array", items: { type: "object" } },
          sprintDefectTrends: { type: "array", items: { type: "object" } }
        }
      }
    }
  },
  paths: {
    "/api/health": {
      get: {
        tags: ["System"],
        summary: "Database & AI health diagnostics",
        responses: {
          200: { description: "Health status details" }
        }
      }
    },
    "/api/auth/register": {
      post: {
        tags: ["Authentication"],
        summary: "Register new user with bcrypt password hashing",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  name: { type: "string", example: "Alex Rivera" },
                  email: { type: "string", example: "dev@bugflow.io" },
                  password: { type: "string", example: "BugFlow2026!" },
                  role: { type: "string", enum: ["Admin", "Developer", "User / QA"], example: "Developer" }
                }
              }
            }
          }
        },
        responses: {
          201: { description: "User created successfully" },
          400: { description: "Validation error" },
          409: { description: "User email already exists" }
        }
      }
    },
    "/api/auth/login": {
      post: {
        tags: ["Authentication"],
        summary: "Authenticate user email and password",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", example: "admin@bugflow.io" },
                  password: { type: "string", example: "BugFlow2026!" }
                }
              }
            }
          }
        },
        responses: {
          200: { description: "Authentication successful" },
          401: { description: "Invalid email or password" }
        }
      }
    },
    "/api/auth/me": {
      get: {
        tags: ["Authentication"],
        summary: "Get current authenticated user profile",
        security: [{ BearerAuth: [] }, { UserIdentityHeaders: [] }],
        responses: {
          200: { description: "User profile details", content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } },
          401: { description: "Unauthenticated" }
        }
      }
    },
    "/api/auth/logout": {
      post: {
        tags: ["Authentication"],
        summary: "Sign out active session",
        responses: {
          200: { description: "Sign out confirmation" }
        }
      }
    },
    "/api/analytics": {
      get: {
        tags: ["Analytics"],
        summary: "Get real PostgreSQL defect analytics & metrics (Total, Open, Resolved, Closed, etc.)",
        parameters: [
          { name: "project_id", in: "query", schema: { type: "integer" }, description: "Optional project ID filter" }
        ],
        responses: {
          200: {
            description: "Analytics calculation result",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AnalyticsSummary" }
              }
            }
          }
        }
      }
    },
    "/api/analytics/overview": {
      get: {
        tags: ["Analytics"],
        summary: "Get complete analytics overview summary",
        parameters: [
          { name: "project_id", in: "query", schema: { type: "integer" }, description: "Optional project ID filter" }
        ],
        responses: {
          200: {
            description: "Complete analytics summary",
            content: { "application/json": { schema: { $ref: "#/components/schemas/AnalyticsSummary" } } }
          }
        }
      }
    },
    "/api/analytics/severity": {
      get: {
        tags: ["Analytics"],
        summary: "Get defect distribution by severity (Critical, High, Medium, Low)",
        parameters: [
          { name: "project_id", in: "query", schema: { type: "integer" }, description: "Optional project ID filter" }
        ],
        responses: {
          200: { description: "Severity distribution map" }
        }
      }
    },
    "/api/analytics/category": {
      get: {
        tags: ["Analytics"],
        summary: "Get defect distribution by module/category",
        parameters: [
          { name: "project_id", in: "query", schema: { type: "integer" }, description: "Optional project ID filter" }
        ],
        responses: {
          200: { description: "Category breakdown counts" }
        }
      }
    },
    "/api/analytics/status": {
      get: {
        tags: ["Analytics"],
        summary: "Get defect distribution by status (Reported, In Progress, In Review, Resolved, Closed, etc.)",
        parameters: [
          { name: "project_id", in: "query", schema: { type: "integer" }, description: "Optional project ID filter" }
        ],
        responses: {
          200: { description: "Status breakdown counts" }
        }
      }
    },
    "/api/analytics/developer-workload": {
      get: {
        tags: ["Analytics"],
        summary: "Get developer workload distribution (defects per developer, open, resolved, critical)",
        parameters: [
          { name: "project_id", in: "query", schema: { type: "integer" }, description: "Optional project ID filter" }
        ],
        responses: {
          200: { description: "Array of developer workload objects" }
        }
      }
    },
    "/api/analytics/trends": {
      get: {
        tags: ["Analytics"],
        summary: "Get defect creation vs resolution trend metrics over time",
        parameters: [
          { name: "project_id", in: "query", schema: { type: "integer" }, description: "Optional project ID filter" }
        ],
        responses: {
          200: { description: "Daily defect creation vs resolution trend data" }
        }
      }
    },
    "/api/analytics/top-categories": {
      get: {
        tags: ["Analytics"],
        summary: "Get ranked list of most common defect categories with counts, critical counts, and percentages",
        parameters: [{ name: "project_id", in: "query", schema: { type: "integer" } }],
        responses: { 200: { description: "Ranked categories array" } }
      }
    },
    "/api/analytics/components": {
      get: {
        tags: ["Analytics"],
        summary: "Get most affected platform components and modules with open, resolved, and critical counts",
        parameters: [{ name: "project_id", in: "query", schema: { type: "integer" } }],
        responses: { 200: { description: "Affected components array" } }
      }
    },
    "/api/analytics/repeated": {
      get: {
        tags: ["Analytics"],
        summary: "Get repeated and recurring defect patterns with occurrence count and reopened frequency",
        parameters: [{ name: "project_id", in: "query", schema: { type: "integer" } }],
        responses: { 200: { description: "Repeated defect patterns" } }
      }
    },
    "/api/analytics/similar": {
      get: {
        tags: ["Analytics"],
        summary: "Get detected similar defect pairs across the workspace with similarity percentages",
        parameters: [{ name: "project_id", in: "query", schema: { type: "integer" } }],
        responses: { 200: { description: "Similar defect pairs" } }
      }
    },
    "/api/analytics/backlog": {
      get: {
        tags: ["Analytics"],
        summary: "Get active defect backlog with priority breakdown, unassigned count, and aging (<7d, 7-30d, >30d)",
        parameters: [{ name: "project_id", in: "query", schema: { type: "integer" } }],
        responses: { 200: { description: "Defect backlog breakdown and aging" } }
      }
    },
    "/api/analytics/sprints": {
      get: {
        tags: ["Analytics"],
        summary: "Get sprint defect trends and completion rate velocity across sprints",
        parameters: [{ name: "project_id", in: "query", schema: { type: "integer" } }],
        responses: { 200: { description: "Sprint defect trends" } }
      }
    },
    "/api/analytics/critical-trends": {
      get: {
        tags: ["Analytics"],
        summary: "Get critical defect discovery trends by date",
        parameters: [{ name: "project_id", in: "query", schema: { type: "integer" } }],
        responses: { 200: { description: "Critical defect trends" } }
      }
    },
    "/api/analytics/resolution-time": {
      get: {
        tags: ["Analytics"],
        summary: "Get average defect resolution time (MTTR) overall and by severity",
        parameters: [
          { name: "project_id", in: "query", schema: { type: "integer" }, description: "Optional project ID filter" }
        ],
        responses: {
          200: { description: "Average resolution hours, display string, and MTTR by severity" }
        }
      }
    },
    "/api/projects": {
      get: {
        tags: ["Projects"],
        summary: "List all workspace projects with live issue counts",
        responses: {
          200: {
            description: "Array of projects",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Project" } }
              }
            }
          }
        }
      },
      post: {
        tags: ["Projects"],
        summary: "Create new project (Admin required)",
        security: [{ UserIdentityHeaders: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", example: "Payment Service" },
                  key: { type: "string", example: "PAY" },
                  category: { type: "string", example: "Backend" },
                  description: { type: "string", example: "Stripe and microservice payment processing" }
                }
              }
            }
          }
        },
        responses: {
          201: { description: "Project created" },
          403: { description: "Forbidden: Admin required" }
        }
      }
    },
    "/api/projects/{id}": {
      patch: {
        tags: ["Projects"],
        summary: "Update project metadata (Admin required)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { 200: { description: "Project updated" } }
      },
      delete: {
        tags: ["Projects"],
        summary: "Cascade delete project and associated issues (Admin required)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { 200: { description: "Project deleted" } }
      }
    },
    "/api/sprints": {
      get: {
        tags: ["Sprints"],
        summary: "List sprints",
        parameters: [{ name: "project_id", in: "query", schema: { type: "integer" } }],
        responses: { 200: { description: "Array of sprints" } }
      },
      post: {
        tags: ["Sprints"],
        summary: "Create new sprint",
        responses: { 201: { description: "Sprint created" } }
      }
    },
    "/api/issues": {
      get: {
        tags: ["Issues"],
        summary: "Query defects with multi-dimensional filtering",
        parameters: [
          { name: "project_id", in: "query", schema: { type: "integer" } },
          { name: "sprint_id", in: "query", schema: { type: "integer" } },
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "priority", in: "query", schema: { type: "string" } },
          { name: "search", in: "query", schema: { type: "string" } }
        ],
        responses: {
          200: {
            description: "List of matching defects",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Defect" } }
              }
            }
          }
        }
      },
      post: {
        tags: ["Issues"],
        summary: "Create a new defect ticket",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title"],
                properties: {
                  title: { type: "string", example: "Database deadlock on concurrent checkouts" },
                  description: { type: "string", example: "Detailed repro steps..." },
                  summary: { type: "string", example: "Deadlock occurs when multiple workers acquire user lock simultaneously." },
                  priority: { type: "string", enum: ["Critical", "High", "Medium", "Low"], example: "High" },
                  severity: { type: "string", enum: ["Critical", "High", "Medium", "Low"], example: "High" },
                  environment: { type: "string", example: "Production PostgreSQL v16" },
                  issueType: { type: "string", example: "Database" },
                  category: { type: "string", example: "Database / ORM" },
                  projectName: { type: "string", example: "BugFlow Core" },
                  projectId: { type: "integer", example: 1 },
                  sprintId: { type: "integer", nullable: true, example: 1 },
                  assigneeName: { type: "string", example: "Alex Rivera" },
                  assigneeRole: { type: "string", example: "Developer" }
                }
              }
            }
          }
        },
        responses: {
          201: { description: "Defect created" },
          400: { description: "Validation error" }
        }
      }
    },
    "/api/issues/{id}": {
      get: {
        tags: ["Issues"],
        summary: "Get defect details with comments and audit trail",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { 200: { description: "Defect details" } }
      },
      patch: {
        tags: ["Issues"],
        summary: "Update defect attributes or perform state machine status transition",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          200: { description: "Defect updated" },
          400: { description: "Invalid transition or enum value" },
          403: { description: "Role permission denied" }
        }
      },
      delete: {
        tags: ["Issues"],
        summary: "Delete defect permanently (Admin required)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { 200: { description: "Defect deleted" } }
      }
    },
    "/api/issues/{id}/attachments": {
      get: {
        tags: ["Attachments"],
        summary: "List attachments for a defect",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { 200: { description: "List of attachments" } }
      },
      post: {
        tags: ["Attachments"],
        summary: "Upload real file attachment (Max 20MB)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  file: { type: "string", format: "binary" }
                }
              }
            }
          }
        },
        responses: {
          201: { description: "File uploaded successfully" },
          400: { description: "Validation / size limit error" }
        }
      }
    },
    "/api/attachments/{id}": {
      get: {
        tags: ["Attachments"],
        summary: "Get attachment metadata or stream direct file download",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
          { name: "download", in: "query", schema: { type: "boolean" }, description: "Set to true to force download" }
        ],
        responses: {
          200: { description: "Attachment metadata or file stream" }
        }
      },
      delete: {
        tags: ["Attachments"],
        summary: "Delete attachment and remove from disk",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { 200: { description: "Attachment deleted" } }
      }
    },
    "/api/ai/summarize-defect": {
      post: {
        tags: ["AI"],
        summary: "Generate concise AI summary of defect description",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["description"],
                properties: {
                  title: { type: "string", example: "Payment failure on checkout" },
                  description: { type: "string", example: "User enters valid credit card and clicks submit, application halts..." }
                }
              }
            }
          }
        },
        responses: {
          200: { description: "AI generated summary result" }
        }
      }
    },
    "/api/ai/classify": {
      post: {
        tags: ["AI"],
        summary: "AI classification of category, defect type, severity, priority",
        responses: { 200: { description: "Classification result" } }
      }
    },
    "/api/ai/similar-defects": {
      post: {
        tags: ["AI"],
        summary: "Detect duplicate and similar defects in PostgreSQL using pgvector",
        responses: { 200: { description: "Similar defects with similarity scores" } }
      }
    },
    "/api/ai/compare-defects": {
      post: {
        tags: ["AI"],
        summary: "Compare two defects or texts using Gemini 3072D vector cosine similarity",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  defect1: { type: "string", example: "Login fails when user enters valid credentials" },
                  defect2: { type: "string", example: "Users cannot sign in even with valid username and password" }
                },
                required: ["defect1", "defect2"]
              }
            }
          }
        },
        responses: { 200: { description: "Real semantic similarity percentage and duplicate classification" } }
      }
    },
    "/api/ai/historical-resolutions": {
      post: {
        tags: ["AI"],
        summary: "Retrieve past resolutions from similar resolved defects in database",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string", example: "OAuth redirect loop" },
                  description: { type: "string", example: "CORS preflight error" },
                  category: { type: "string", example: "Security / Auth" },
                  exclude_id: { type: "integer", example: 1042 }
                }
              }
            }
          }
        },
        responses: {
          200: { description: "Historical resolution matches and developer notes" }
        }
      }
    },
    "/api/ai/resolution-assistance": {
      post: {
        tags: ["AI"],
        summary: "Generate root-cause investigation checklist and recommended fix",
        responses: { 200: { description: "Investigation areas, fix hints, and file suggestions" } }
      }
    },
    "/api/ai/semantic-search": {
      post: {
        tags: ["AI"],
        summary: "Weighted token & semantic search across database issues",
        responses: { 200: { description: "Search results with similarity ranking" } }
      }
    },
    "/api/ai/chat": {
      post: {
        tags: ["AI"],
        summary: "Defect Resolution Assistant AI Chat Engine",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["message"],
                properties: {
                  message: { type: "string", example: "Explain BF-1042 and suggest resolution" },
                  session_id: { type: "string", example: "sess_123" }
                }
              }
            }
          }
        },
        responses: {
          200: { description: "Chatbot response grounded in PostgreSQL data and Gemini AI" }
        }
      }
    },
    "/api/ai/chat/history": {
      get: {
        tags: ["AI"],
        summary: "Get chat interaction history for a session",
        parameters: [{ name: "session_id", in: "query", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Chat message history" } }
      },
      delete: {
        tags: ["AI"],
        summary: "Clear chat history for a session",
        parameters: [{ name: "session_id", in: "query", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Session history cleared" } }
      }
    }
  }
};
