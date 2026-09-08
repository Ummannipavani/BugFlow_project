from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Issue, IssueStatus, IssuePriority, ActivityLog, Comment, User, UserRole
from backend.core.security import get_current_user, get_current_user_with_roles

router = APIRouter(prefix="/issues", tags=["Issues"])

# Strict status transition matrix defining permitted state movements
VALID_STATUS_TRANSITIONS = {
    IssueStatus.OPEN: [IssueStatus.IN_PROGRESS],
    IssueStatus.IN_PROGRESS: [IssueStatus.IN_REVIEW, IssueStatus.OPEN],
    IssueStatus.IN_REVIEW: [IssueStatus.RESOLVED, IssueStatus.IN_PROGRESS],
    IssueStatus.RESOLVED: [IssueStatus.OPEN],  # Can be reopened back to Open
}


class IssueCreateSchema(BaseModel):
    title: str
    description: Optional[str] = None
    priority: IssuePriority = IssuePriority.MEDIUM
    project_id: int
    assignee_id: Optional[int] = None
    sprint_id: Optional[int] = None


class IssueUpdateSchema(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[IssueStatus] = None
    priority: Optional[IssuePriority] = None
    assignee_id: Optional[int] = None
    sprint_id: Optional[int] = None


class CommentCreateSchema(BaseModel):
    body: str


class CommentResponseSchema(BaseModel):
    id: int
    issue_id: int
    user_id: int
    body: str
    created_at: datetime

    class Config:
        from_attributes = True


class ActivityLogSchema(BaseModel):
    id: int
    issue_id: int
    user_id: int
    old_status: str
    new_status: str
    timestamp: datetime

    class Config:
        from_attributes = True


class IssueResponseSchema(BaseModel):
    id: int
    title: str
    description: Optional[str]
    status: str
    priority: str
    project_id: int
    reporter_id: int
    assignee_id: Optional[int]
    sprint_id: Optional[int]
    created_at: datetime
    comments: List[CommentResponseSchema] = []
    activity_logs: List[ActivityLogSchema] = []

    class Config:
        from_attributes = True


@router.post("", response_model=IssueResponseSchema, status_code=status.HTTP_201_CREATED)
def create_issue(
    issue_data: IssueCreateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Creates a new issue in Open status and logs the creation activity."""
    new_issue = Issue(
        title=issue_data.title,
        description=issue_data.description,
        status=IssueStatus.OPEN,
        priority=issue_data.priority,
        project_id=issue_data.project_id,
        reporter_id=current_user.id,
        assignee_id=issue_data.assignee_id,
        sprint_id=issue_data.sprint_id,
    )
    db.add(new_issue)
    db.commit()
    db.refresh(new_issue)

    # Initial creation activity log
    initial_log = ActivityLog(
        issue_id=new_issue.id,
        user_id=current_user.id,
        old_status="None",
        new_status=IssueStatus.OPEN.value,
    )
    db.add(initial_log)
    db.commit()
    db.refresh(new_issue)

    return new_issue


@router.get("", response_model=List[IssueResponseSchema])
def list_issues(
    project_id: Optional[int] = None,
    status_filter: Optional[IssueStatus] = None,
    assignee_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieves list of issues with optional filtering."""
    query = db.query(Issue)
    if project_id:
        query = query.filter(Issue.project_id == project_id)
    if status_filter:
        query = query.filter(Issue.status == status_filter)
    if assignee_id:
        query = query.filter(Issue.assignee_id == assignee_id)
    return query.all()


@router.get("/{issue_id}", response_model=IssueResponseSchema)
def get_issue(
    issue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieves a single issue by ID with comments and activity logs."""
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found"
        )
    return issue


@router.patch("/{issue_id}", response_model=IssueResponseSchema)
def update_issue(
    issue_id: int,
    issue_data: IssueUpdateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Updates issue details with strict state transition validation
    and automatic ActivityLog auditing on status changes.
    """
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found"
        )

    # Status Transition Validation
    if issue_data.status and issue_data.status != issue.status:
        current_status = issue.status
        target_status = issue_data.status

        allowed_targets = VALID_STATUS_TRANSITIONS.get(current_status, [])
        if target_status not in allowed_targets:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status transition: Cannot transition directly from '{current_status.value}' to '{target_status.value}'. Allowed transitions: {[s.value for s in allowed_targets]}",
            )

        # Log Activity Change
        activity_log = ActivityLog(
            issue_id=issue.id,
            user_id=current_user.id,
            old_status=current_status.value,
            new_status=target_status.value,
        )
        db.add(activity_log)
        issue.status = target_status

    if issue_data.title is not None:
        issue.title = issue_data.title
    if issue_data.description is not None:
        issue.description = issue_data.description
    if issue_data.priority is not None:
        issue.priority = issue_data.priority
    if issue_data.assignee_id is not None:
        issue.assignee_id = issue_data.assignee_id
    if issue_data.sprint_id is not None:
        issue.sprint_id = issue_data.sprint_id

    db.commit()
    db.refresh(issue)
    return issue


@router.delete("/{issue_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_issue(
    issue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user_with_roles([UserRole.ADMIN.value, UserRole.QA.value])
    ),
):
    """Deletes an issue (restricted to Admin and QA roles via RBAC)."""
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found"
        )
    db.delete(issue)
    db.commit()
    return None


@router.post("/{issue_id}/comments", response_model=CommentResponseSchema)
def add_comment(
    issue_id: int,
    comment_data: CommentCreateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Adds an internal collaboration comment to an issue."""
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found"
        )

    comment = Comment(
        issue_id=issue_id,
        user_id=current_user.id,
        body=comment_data.body,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment
