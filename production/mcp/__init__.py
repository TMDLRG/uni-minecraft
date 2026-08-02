"""uni-production-mcp -- the FastMCP production surface for the UNI Production Platform.

DESIGN / REFERENCE only. Nothing in this package is deployed. Every "the platform
will ..." is a proposal (status: pending), not a statement of current fact.

This package mirrors services/control_mcp to the letter:
  - the server is built in create_server() -> FastMCP("uni-production-mcp", ...);
  - read-only tools are sync, wrapped with a local @_threaded so the event loop is
    not blocked, and return guards.metadata(...);
  - mutating tools are async def and FIRST gate through approvals.require() before
    doing any real work, then write an append-only audit row;
  - every tool returns the metadata() provenance envelope with an evidence_class.

The business stack (solutionwright-*, odoo, jitsi, cloudflared, portainer) is never
a mutation target, and the producer agent cannot self-approve a destructive verb.
"""

from __future__ import annotations

VERSION = "0.1.0-design"
SERVER_NAME = "uni-production-mcp"

__all__ = ["VERSION", "SERVER_NAME"]
