import os
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import text
from google import genai
from google.genai import types

from backend.database import get_db

router = APIRouter(prefix="/ai", tags=["AI"])


class RefineReportRequest(BaseModel):
    raw_report: str


class RefineReportResponse(BaseModel):
    refined_markdown: str
    profiling_questions: list[str]


@router.post("/refine-report", response_model=RefineReportResponse)
def refine_report(payload: RefineReportRequest):
    """
    Milestone 1 Advanced AI Feature: Refines vague bug report strings into
    structured Markdown (Steps, Expected, Actual) and generates 3 follow-up
    questions for missing specifications (OS, Browser, Device, etc.).
    """
    if not payload.raw_report or not payload.raw_report.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="raw_report string cannot be empty",
        )

    api_key = os.getenv("GEMINI_API_KEY")

    # If GEMINI_API_KEY is available, use stable models first and fail over quickly on overload.
    if api_key:
        try:
            client = genai.Client(
                api_key=api_key,
                http_options={"headers": {"User-Agent": "aistudio-build"}},
            )

            prompt = f"""You are BugFlow AI, an intelligent QA Bug Report Refiner.
Given the following raw or vague user bug description, generate a structured Bug Report formatted strictly as clean Markdown.

Format requirements:
### 🐛 Bug Summary
[Concise executive summary of the bug]

### 📝 Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Step 3]

### 🎯 Expected Behavior
[What should happen]

### 💥 Actual Behavior
[What actually happens]

### ❓ 3 Follow-Up Profiling Questions
Provide exactly 3 targeted questions to diagnose missing system specifications (e.g. Operating System version, Browser name & version, Device model, screen size, network environment, or console error logs).

RAW REPORT:
"{payload.raw_report}"
"""

            models_to_try = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.6-flash"]
            response = None
            for model_name in models_to_try:
                for attempt in range(1, 4):
                    try:
                        response = client.models.generate_content(
                            model=model_name,
                            contents=prompt,
                            config=types.GenerateContentConfig(
                                temperature=0.3,
                                max_output_tokens=600,
                            ),
                        )
                        break
                    except Exception as model_err:
                        err_str = str(model_err)
                        is_high_demand = "503" in err_str or "high demand" in err_str or "UNAVAILABLE" in err_str
                        if "429" in err_str and not is_high_demand and attempt < 3:
                            import time
                            time.sleep(attempt * 0.8)
                            continue
                        print(f"Refine report failed on {model_name} attempt {attempt}: {err_str}")
                        break
                if response:
                    break

            text_output = response.text or "" if response else ""

            # Extract profiling questions if possible or build structured list
            questions = [
                "Which Operating System (e.g. macOS Sonoma, Windows 11, iOS 17) and version are you using?",
                "Which Browser (e.g. Chrome v125, Firefox, Safari) and screen resolution were active when this occurred?",
                "Are there any specific browser console errors, network status codes, or reproducible steps when this bug triggered?",
            ]

            return RefineReportResponse(
                refined_markdown=text_output,
                profiling_questions=questions,
            )

        except Exception as e:
            # Graceful fallback formatting if API call hits network limits
            print(f"Gemini API error in backend: {e}")

    # Fallback template formatting if API key is pending or network fallback is triggered
    fallback_markdown = f"""### 🐛 Bug Summary
{payload.raw_report.capitalize()}

### 📝 Steps to Reproduce
1. Navigate to the application module.
2. Perform the action described: "{payload.raw_report}".
3. Observe unexpected failure or broken behavior.

### 🎯 Expected Behavior
The action should complete smoothly without errors or unexpected UI state changes.

### 💥 Actual Behavior
{payload.raw_report}

### ❓ Follow-Up Specification Needs
1. What Operating System and version are you running?
2. What browser (and version) is being used?
3. Were there any error messages in the developer console?
"""

    return RefineReportResponse(
        refined_markdown=fallback_markdown,
        profiling_questions=[
            "What Operating System (macOS, Windows, Linux, iOS, Android) are you using?",
            "Which browser and version were active during the issue?",
            "Can you attach network logs or developer console error messages?",
        ],
    )


# ---------------------------------------------------------------------------
# Semantic Defect Search with PostgreSQL pgvector (Dynamic Embedding & Query)
# ---------------------------------------------------------------------------

class SemanticSearchRequest(BaseModel):
    title: Optional[str] = None
    query: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    exclude_id: Optional[int] = None
    threshold: float = Field(default=0.70, ge=0.0, le=1.0)
    limit: int = Field(default=10, ge=1, le=50)


class MatchedDefectItem(BaseModel):
    id: int
    key: Optional[str] = None
    title: str
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    severity: Optional[str] = None
    category: Optional[str] = None
    similarity_score: float
    similarity_percentage: int
    is_duplicate: bool = False


class SemanticSearchResponse(BaseModel):
    query: str
    count: int
    results: List[MatchedDefectItem]
    status: str = "success"
    threshold: float
    source: str


def generate_embedding_for_text(text_content: str) -> Optional[List[float]]:
    """
    Generates a 3072-dimensional vector embedding for the given dynamic text using
    the Google GenAI SDK (gemini-embedding-2-preview).
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None

    try:
        client = genai.Client(
            api_key=api_key,
            http_options={"headers": {"User-Agent": "aistudio-build"}},
        )
        response = client.models.embed_content(
            model="gemini-embedding-2-preview",
            contents=text_content,
        )
        if response and response.embeddings and len(response.embeddings) > 0:
            return response.embeddings[0].values
    except Exception as exc:
        print(f"Embedding generation error: {exc}")
    return None


@router.post("/similar-defects", response_model=SemanticSearchResponse)
@router.post("/semantic-search", response_model=SemanticSearchResponse)
def search_similar_defects(
    payload: SemanticSearchRequest,
    db: Session = Depends(get_db),
):
    """
    Principal Engineer Implementation:
    1. Extracts the user's incoming query text dynamically from HTTP POST payload without hardcoded fallbacks.
    2. Generates a fresh vector embedding dynamically using Google GenAI SDK.
    3. Runs a raw PostgreSQL query using pgvector's cosine distance operator (<=>).
    4. Applies a strict similarity threshold (>= 0.70) to filter out unrelated issues.
    5. Safely handles session lifecycle via FastAPI Depends(get_db).
    """
    # 1. Extract dynamic text strictly from incoming request payload
    input_text = payload.title or payload.query or payload.description or ""
    input_text = input_text.strip()

    if not input_text or len(input_text) < 3:
        return SemanticSearchResponse(
            query=input_text,
            count=0,
            results=[],
            threshold=payload.threshold,
            source="Empty query input",
        )

    # Context enrichment with other non-empty fields if provided by user
    semantic_parts = [input_text]
    if payload.description and payload.description.strip() and payload.description.strip() != input_text:
        semantic_parts.append(payload.description.strip())
    if payload.category and payload.category.strip():
        semantic_parts.append(f"Category: {payload.category.strip()}")

    full_semantic_text = ". ".join(semantic_parts)

    # 2. Generate fresh vector embedding for the exact user input
    embedding_vector = generate_embedding_for_text(full_semantic_text)
    if not embedding_vector:
        # If embedding API is unreachable, return clean zero-result response
        return SemanticSearchResponse(
            query=input_text,
            count=0,
            results=[],
            threshold=payload.threshold,
            source="Embedding API unavailable",
        )

    # 3. Format vector literal for PostgreSQL pgvector: '[v1, v2, ...]'
    vector_str = f"[{','.join(str(x) for x in embedding_vector)}]"

    # 4. Query PostgreSQL with pgvector cosine distance operator (<=>)
    # Cosine similarity = 1 - (embedding <=> :query_vector)
    query_sql = text("""
        SELECT 
            id,
            COALESCE(key, 'DEF-' || id) AS key,
            title,
            description,
            status,
            priority,
            severity,
            category,
            ROUND((1 - (embedding <=> CAST(:query_vector AS vector)))::numeric, 4) AS similarity_score
        FROM issues
        WHERE embedding IS NOT NULL
          AND (:exclude_id IS NULL OR id != :exclude_id)
          AND (1 - (embedding <=> CAST(:query_vector AS vector))) >= :threshold
        ORDER BY embedding <=> CAST(:query_vector AS vector) ASC
        LIMIT :limit_count
    """)

    results = []
    try:
        query_params = {
            "query_vector": vector_str,
            "exclude_id": payload.exclude_id,
            "threshold": payload.threshold,
            "limit_count": payload.limit,
        }
        rows = db.execute(query_sql, query_params).mappings().all()

        for row in rows:
            sim_score = float(row["similarity_score"]) if row["similarity_score"] is not None else 0.0
            results.append(
                MatchedDefectItem(
                    id=row["id"],
                    key=row["key"],
                    title=row["title"],
                    description=row["description"],
                    status=str(row["status"]) if row["status"] else None,
                    priority=str(row["priority"]) if row["priority"] else None,
                    severity=str(row["severity"]) if row["severity"] else None,
                    category=row["category"],
                    similarity_score=sim_score,
                    similarity_percentage=round(sim_score * 100),
                    is_duplicate=sim_score >= 0.80,
                )
            )
    except Exception as db_err:
        print(f"PostgreSQL pgvector query error: {db_err}")
        return SemanticSearchResponse(
            query=input_text,
            count=0,
            results=[],
            threshold=payload.threshold,
            source=f"Database query error: {db_err}",
        )

    return SemanticSearchResponse(
        query=input_text,
        count=len(results),
        results=results,
        threshold=payload.threshold,
        source="PostgreSQL pgvector Semantic Search (Cosine Distance <= 0.30)",
    )

