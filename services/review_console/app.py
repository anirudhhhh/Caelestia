import sys
import json
from pathlib import Path
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from contextlib import asynccontextmanager

import aiosqlite
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from shared.schemas import EscalationItem, ReviewAction, HumanOutcome, Direction, UseCase, Geography, RiskTier, Payload, CheckResult
from shared.config import setup_logging, AUDIT_STORE_URL

logger = setup_logging("review_console")
DATA_DIR = Path(__file__).parent / "data"
DB_PATH = DATA_DIR / "review_console.db"

HTTP_CLIENT: Optional[httpx.AsyncClient] = None

def get_http_client() -> httpx.AsyncClient:
    global HTTP_CLIENT
    if HTTP_CLIENT is None or HTTP_CLIENT.is_closed:
        HTTP_CLIENT = httpx.AsyncClient(
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=100),
            timeout=httpx.Timeout(30.0, connect=5.0)
        )
    return HTTP_CLIENT

@asynccontextmanager
async def lifespan(app: FastAPI):
    global HTTP_CLIENT
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    HTTP_CLIENT = httpx.AsyncClient(
        limits=httpx.Limits(max_keepalive_connections=20, max_connections=100),
        timeout=httpx.Timeout(30.0, connect=5.0)
    )
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS escalations (
                interaction_id TEXT PRIMARY KEY,
                session_id TEXT,
                direction TEXT,
                use_case TEXT,
                geography TEXT,
                risk_tier TEXT,
                escalation_reason TEXT,
                checks JSON,
                payload JSON,
                created_at TEXT,
                status TEXT,
                resolution TEXT,
                resolved_by TEXT,
                resolved_at TEXT,
                resolution_reason TEXT,
                was_original_flag_correct BOOLEAN,
                edited_content TEXT
            )
        ''')
        await db.commit()
    logger.info("Review console persistent store initialized.")
    yield
    if HTTP_CLIENT and not HTTP_CLIENT.is_closed:
        await HTTP_CLIENT.aclose()

app = FastAPI(title="Review Console Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _row_to_item(row: dict) -> EscalationItem:
    checks = json.loads(row["checks"]) if isinstance(row["checks"], str) else (row["checks"] or [])
    payload = json.loads(row["payload"]) if isinstance(row["payload"], str) else (row["payload"] or {})
    return EscalationItem(
        interaction_id=row["interaction_id"],
        session_id=row["session_id"] or "",
        direction=Direction(row["direction"]) if row["direction"] in ("input", "output") else Direction.INPUT,
        use_case=UseCase(row["use_case"]) if row["use_case"] in [u.value for u in UseCase] else UseCase.CUSTOMER_SUPPORT,
        geography=Geography(row["geography"]) if row["geography"] in [g.value for g in Geography] else Geography.US,
        risk_tier=RiskTier(row["risk_tier"]) if row["risk_tier"] in [r.value for r in RiskTier] else RiskTier.MEDIUM,
        escalation_reason=row["escalation_reason"] or "",
        checks=[CheckResult(**c) for c in checks],
        payload=Payload(**payload),
        created_at=row["created_at"] or datetime.now(timezone.utc).isoformat(),
        status=row["status"] or "pending",
        resolution=row["resolution"],
        resolved_by=row["resolved_by"],
        resolved_at=row["resolved_at"],
        resolution_reason=row["resolution_reason"],
        was_original_flag_correct=bool(row["was_original_flag_correct"]) if row["was_original_flag_correct"] is not None else None,
        edited_content=row["edited_content"]
    )

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

@app.post("/escalations")
async def add_escalation(item: EscalationItem):
    logger.info(f"Adding persistent escalation for {item.interaction_id}")
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT status, resolution FROM escalations WHERE interaction_id = ?", (item.interaction_id,))
        existing = await cursor.fetchone()
        if existing and existing["status"] == "resolved" and existing["resolution"] == "deny":
            raise HTTPException(status_code=400, detail="This request has already been reviewed and denied by a human reviewer. Additional appeals are disabled.")

        await db.execute('''
            INSERT INTO escalations (
                interaction_id, session_id, direction, use_case, geography, risk_tier,
                escalation_reason, checks, payload, created_at, status, resolution,
                resolved_by, resolved_at, resolution_reason, was_original_flag_correct, edited_content
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(interaction_id) DO UPDATE SET
                status=excluded.status,
                escalation_reason=excluded.escalation_reason,
                checks=excluded.checks,
                payload=excluded.payload
        ''', (
            item.interaction_id,
            item.session_id,
            item.direction.value if hasattr(item.direction, 'value') else str(item.direction),
            item.use_case.value if hasattr(item.use_case, 'value') else str(item.use_case),
            item.geography.value if hasattr(item.geography, 'value') else str(item.geography),
            item.risk_tier.value if hasattr(item.risk_tier, 'value') else str(item.risk_tier),
            item.escalation_reason,
            json.dumps([c.model_dump() for c in item.checks]),
            json.dumps(item.payload.model_dump()),
            item.created_at,
            item.status,
            item.resolution,
            item.resolved_by,
            item.resolved_at,
            item.resolution_reason,
            item.was_original_flag_correct,
            item.edited_content
        ))
        await db.commit()
    return {"status": "added", "interaction_id": item.interaction_id}

@app.get("/escalations", response_model=List[EscalationItem])
async def list_escalations(status: Optional[str] = None):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if status and status.lower() != "all":
            cursor = await db.execute("SELECT * FROM escalations WHERE status = ? ORDER BY created_at DESC", (status.lower(),))
        else:
            cursor = await db.execute("SELECT * FROM escalations ORDER BY created_at DESC")
        rows = await cursor.fetchall()
        return [_row_to_item(dict(r)) for r in rows]

@app.get("/escalations/{interaction_id}", response_model=EscalationItem)
async def get_escalation(interaction_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM escalations WHERE interaction_id = ?", (interaction_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Escalation not found")
        return _row_to_item(dict(row))

@app.post("/escalations/{interaction_id}/resolve")
async def resolve_escalation(interaction_id: str, action: ReviewAction):
    resolved_at = datetime.now(timezone.utc).isoformat()
    reviewer = action.reviewer_id or "human_operator_1"

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM escalations WHERE interaction_id = ?", (interaction_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Escalation not found")

        await db.execute('''
            UPDATE escalations SET
                status = 'resolved',
                resolution = ?,
                resolved_by = ?,
                resolved_at = ?,
                resolution_reason = ?,
                was_original_flag_correct = ?,
                edited_content = ?
            WHERE interaction_id = ?
        ''', (
            action.action,
            reviewer,
            resolved_at,
            action.reason,
            action.was_original_flag_correct,
            action.edited_content,
            interaction_id
        ))
        await db.commit()

        # Ingest confirmed true positive attack inputs into L3 Vector Store
        if row and (row["direction"] or "input") == "input" and (action.was_original_flag_correct or action.action in ("deny", "block")):
            try:
                payload_content = ""
                if row and row["payload"]:
                    p_data = json.loads(row["payload"])
                    payload_content = p_data.get("content", "")
                
                if payload_content:
                    client = get_http_client()
                    await client.post(
                        f"{GUARDRAILS_ML_URL}/corpus/add",
                        json={
                            "text": payload_content,
                            "pattern_type": "confirmed_human_review",
                            "source": "review_console"
                        },
                        timeout=2.0
                    )
                    logger.info(f"Ingested confirmed attack payload from interaction {interaction_id} into L3 vector store")
            except Exception as e:
                logger.warning(f"Failed to ingest attack payload into vector store: {e}")

        # Re-fetch updated row
        cursor = await db.execute("SELECT * FROM escalations WHERE interaction_id = ?", (interaction_id,))
        updated_row = await cursor.fetchone()
        item = _row_to_item(dict(updated_row))

    # Write outcome to Audit Store
    outcome = HumanOutcome(
        interaction_id=interaction_id,
        reviewer_id=reviewer,
        action=action.action,
        was_original_flag_correct=action.was_original_flag_correct,
        reason=action.reason
    )
    
    try:
        client = get_http_client()
        resp = await client.post(
            f"{AUDIT_STORE_URL}/outcomes",
            json=outcome.model_dump(),
            timeout=5.0
        )
        if resp.status_code != 200:
            logger.error(f"Failed to save outcome to Audit Store: {resp.text}")
    except Exception as e:
        logger.error(f"Error calling Audit Store: {e}")
        
    return {"status": "resolved", "item": item}

@app.get("/stats")
async def get_stats():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT status, COUNT(*) as count FROM escalations GROUP BY status")
        rows = await cursor.fetchall()
        counts = {r["status"]: r["count"] for r in rows}
        resolved = counts.get("resolved", 0)
        pending = counts.get("pending", 0)
        return {
            "queue_depth": pending,
            "resolved_total": resolved
        }
