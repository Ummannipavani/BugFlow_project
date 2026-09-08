import os
from sqlalchemy.orm import Session
from backend.database import engine, Base, SessionLocal
from backend.models import User, Project, Issue, Comment, ActivityLog, UserRole, IssueStatus, IssuePriority
from backend.core.security import get_password_hash


def init_database():
    """Initializes tables and seeds initial project data."""
    print("Initializing BugFlow database schema...")
    Base.metadata.create_all(bind=engine)

    db: Session = SessionLocal()
    try:
        # Check if users exist
        if not db.query(User).first():
            print("Seeding initial BugFlow demo users...")
            admin_user = User(
                email="admin@bugflow.io",
                hashed_password=get_password_hash("admin123"),
                role=UserRole.ADMIN,
            )
            dev_user = User(
                email="dev@bugflow.io",
                hashed_password=get_password_hash("dev123"),
                role=UserRole.DEVELOPER,
            )
            qa_user = User(
                email="qa@bugflow.io",
                hashed_password=get_password_hash("qa123"),
                role=UserRole.QA,
            )
            reporter_user = User(
                email="reporter@bugflow.io",
                hashed_password=get_password_hash("reporter123"),
                role=UserRole.REPORTER,
            )

            db.add_all([admin_user, dev_user, qa_user, reporter_user])
            db.commit()

            print("Seeding demo project...")
            project = Project(
                name="BugFlow Platform v1.0",
                description="Core Capstone Bug Tracker & Issue Management Suite",
            )
            db.add(project)
            db.commit()
            db.refresh(project)

            print("Seeding sample issues...")
            issue1 = Issue(
                title="JWT Refresh Token expiration handling issue",
                description="Token expires without triggering refresh modal on client.",
                status=IssueStatus.OPEN,
                priority=IssuePriority.HIGH,
                project_id=project.id,
                reporter_id=qa_user.id,
                assignee_id=dev_user.id,
            )
            issue2 = Issue(
                title="Kanban Board column drag indicator misalignment",
                description="When dragging across 'In Review' column, ghost shadow jumps.",
                status=IssueStatus.IN_PROGRESS,
                priority=IssuePriority.MEDIUM,
                project_id=project.id,
                reporter_id=qa_user.id,
                assignee_id=dev_user.id,
            )
            issue3 = Issue(
                title="AI Report Refine fails when input is > 2000 chars",
                description="Large stack trace causes raw string payload timeout.",
                status=IssueStatus.IN_REVIEW,
                priority=IssuePriority.CRITICAL,
                project_id=project.id,
                reporter_id=reporter_user.id,
                assignee_id=dev_user.id,
            )
            issue4 = Issue(
                title="Database migration script missing foreign key constraint on activity_logs",
                description="Resolved FK constraint issue in Alembic migration #0001.",
                status=IssueStatus.RESOLVED,
                priority=IssuePriority.LOW,
                project_id=project.id,
                reporter_id=dev_user.id,
                assignee_id=admin_user.id,
            )

            db.add_all([issue1, issue2, issue3, issue4])
            db.commit()

            print("Seeding comments & activity logs...")
            comment1 = Comment(
                issue_id=issue1.id,
                user_id=dev_user.id,
                body="Looking into this now. Replicating on Chrome 125.",
            )
            db.add(comment1)

            log1 = ActivityLog(
                issue_id=issue2.id,
                user_id=dev_user.id,
                old_status="Open",
                new_status="In Progress",
            )
            log2 = ActivityLog(
                issue_id=issue3.id,
                user_id=qa_user.id,
                old_status="In Progress",
                new_status="In Review",
            )
            db.add_all([log1, log2])
            db.commit()

            print("BugFlow Database seeding completed successfully!")
    finally:
        db.close()


if __name__ == "__main__":
    init_database()
