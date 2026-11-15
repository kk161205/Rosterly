"""create_rbac_mock_db pattern (see tests/assets/test_assets.py) for the leave RBAC checks."""
from unittest.mock import MagicMock
import uuid

from app.models.auth import RolePermission


def create_rbac_mock_db(allowed_grants: list[tuple[uuid.UUID, str, str]] | None = None) -> MagicMock:
    """Mock session: a RolePermission lookup returns a grant only for the given
    (role_id, resource, action) tuples; every other query is an empty chain."""
    mock_db = MagicMock()
    entity_query = MagicMock()
    for name in ("options", "join", "outerjoin", "filter", "order_by", "offset", "limit", "with_for_update"):
        getattr(entity_query, name).return_value = entity_query
    entity_query.first.return_value = None
    entity_query.all.return_value = []
    entity_query.count.return_value = 0
    grants = set(allowed_grants or [])

    def query_dispatcher(*entities):
        if entities and entities[0] is RolePermission:
            rp_query = MagicMock()
            rp_query.join.return_value = rp_query

            def rp_filter(*criteria):
                filter_mock = MagicMock()
                vals = [getattr(c.right, "value", None) for c in criteria if hasattr(c, "right")]
                role_ids = vals[0] if isinstance(vals[0], (list, tuple, set, frozenset)) else [vals[0]]
                hit = any((rid, vals[1], vals[2]) in grants for rid in role_ids)
                filter_mock.first.return_value = (
                    RolePermission(role_id=role_ids[0], permission_id=uuid.uuid4()) if hit else None
                )
                return filter_mock

            rp_query.filter.side_effect = rp_filter
            return rp_query
        return entity_query

    mock_db.query.side_effect = query_dispatcher
    return mock_db
