"""
Uploaded file storage.

One small interface so the rest of the app never cares where bytes live.
Today they live in Postgres (`document_files`): free, backed up with the
database, and safe on hosts whose disk is wiped on restart. Moving to S3/R2
later means changing only this module.

Types are checked from the file's first bytes, not its name: a ".pdf" that
isn't a PDF is refused.
"""
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.lifecycle import DocumentFile

# Allowed types: signature -> (content type, extensions that may carry it)
_SIGNATURES: list[tuple[bytes, str, frozenset[str]]] = [
    (b"%PDF-", "application/pdf", frozenset({".pdf"})),
    (b"\x89PNG\r\n\x1a\n", "image/png", frozenset({".png"})),
    (b"\xff\xd8\xff", "image/jpeg", frozenset({".jpg", ".jpeg"})),
]


def detect_type(content: bytes, extension: str) -> Optional[str]:
    """The content type when the bytes are a PDF, PNG or JPEG whose extension
    matches; otherwise None."""
    for signature, content_type, extensions in _SIGNATURES:
        if content.startswith(signature):
            return content_type if extension.lower() in extensions else None
    return None


def save_file(db: Session, document_id: UUID, content: bytes, content_type: str) -> None:
    """Stores the bytes for a document. The caller commits."""
    db.add(DocumentFile(document_id=document_id, content=content, content_type=content_type, size_bytes=len(content)))


def load_file(db: Session, document_id: UUID) -> Optional[tuple[bytes, str]]:
    row = db.get(DocumentFile, document_id)
    return (row.content, row.content_type) if row else None


def delete_file(db: Session, document_id: UUID) -> None:
    """Removes a document's bytes. The caller commits."""
    db.query(DocumentFile).filter(DocumentFile.document_id == document_id).delete(synchronize_session=False)
