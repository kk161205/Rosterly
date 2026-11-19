"""uploaded document files stored in Postgres, served by an authenticated route

- document_files(document_id PK → documents.id ON DELETE CASCADE, content,
  content_type, size_bytes): the bytes of each uploaded document. Hosts such
  as Render's free tier have no persistent disk, and the old `/uploads/...`
  paths were never served at all.
- documents.file_url now points at the download route
  `/employees/{employee_id}/documents/{id}/download` (relative to the API base).
  Files that were only ever on a developer's disk can't be moved by a
  migration; their download answers 404 `file_missing` until re-uploaded.

Revision ID: c6e8a0b2d4f5
Revises: b5d7f9a1c3e4
Create Date: 2026-11-20 00:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "c6e8a0b2d4f5"
down_revision = "b5d7f9a1c3e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "document_files",
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
    )
    op.execute(
        "UPDATE documents SET file_url = "
        "'/employees/' || employee_id::text || '/documents/' || id::text || '/download'"
    )


def downgrade() -> None:
    op.drop_table("document_files")
    op.execute(
        "UPDATE documents SET file_url = '/uploads/documents/' || employee_id::text || '/' || file_name"
    )
