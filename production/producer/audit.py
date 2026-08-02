"""audit.py -- minimal append-only audit shim for the UNI Producer daemon.

DESIGN/REFERENCE, status: pending (authored, not yet run on node hardware).

Mirrors production/mcp/server.py's _LocalAudit class (~line 124-150) with the same
row shape: a JSON line per event, stamped with an audit_id (rid) + UTC timestamp.
The producer talks to production.mcp.adapters directly (same-process import, not
HTTP to the MCP), so it keeps its own ledger -- UNI_PRODUCER_AUDIT, default
/var/lib/uni/broadcast/audit/producer.ndjson -- separate from prod-mcp.ndjson.
Both are honest, independent append-only trails of the same broadcast.
"""

from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any, Dict, Optional

SERVER_NAME = "uni-producer"


class ProducerAudit:
    """Append-only audit shim; same .write(row) -> audit_id shape as _LocalAudit."""

    def __init__(self, path: Optional[str] = None) -> None:
        self.path = path or os.environ.get(
            "UNI_PRODUCER_AUDIT", "/var/lib/uni/broadcast/audit/producer.ndjson"
        )

    def write(self, row: Dict[str, Any]) -> str:
        rid = row.get("audit_id") or uuid.uuid4().hex
        row = dict(row)
        row.setdefault("audit_id", rid)
        row.setdefault("server", SERVER_NAME)
        row.setdefault("ts", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        try:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            with open(self.path, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(row, ensure_ascii=False) + "\n")
        except OSError:
            # Audit must never crash the show-runner; the row id is still returned.
            pass
        return rid
