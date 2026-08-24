import asyncio
import json
import sqlite3
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

import aiosqlite
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Adjust path to import shared modules
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from shared.config import setup_logging
from shared.schemas import AuditEvent, HumanOutcome

logger = setup_logging("audit_store")
DATA_DIR = Path(__file__).parent / "data"
DB_PATH = DATA_DIR / "audit_store.db"

@asynccontextmanager
async def lifespan(app: FastAPI):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS interaction_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                interaction_id TEXT,
                session_id TEXT,
                direction TEXT,
                use_case TEXT,
                geography TEXT,
                envelope JSON,
                decision_action TEXT,
                policy_version TEXT,
                created_at TEXT
            )
        ''')
        await db.execute('''
            CREATE TABLE IF NOT EXISTS human_outcomes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                interaction_id TEXT,
                reviewer_id TEXT,
                action TEXT,
                was_original_flag_correct BOOLEAN,
                reason TEXT,
                created_at TEXT
            )
        ''')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_interaction_id ON interaction_events (interaction_id)')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_use_case_created_at ON interaction_events (use_case, created_at)')
        await db.commit()
    logger.info("Audit store initialized.")
    yield

app = FastAPI(title="Audit Store Service", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def _write_event(event: AuditEvent):
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                """
                INSERT INTO interaction_events (
                    interaction_id, session_id, direction, use_case, geography,
                    envelope, decision_action, policy_version, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event.interaction_id,
                    event.session_id,
                    event.direction,
                    event.use_case,
                    event.geography,
                    json.dumps(event.envelope),
                    event.decision_action,
                    event.policy_version,
                    event.created_at,
                )
            )
            await db.commit()
    except Exception as e:
        logger.error(f"Failed to write event {event.interaction_id}: {e}")

@app.post("/events")
async def create_event(event: AuditEvent, background_tasks: BackgroundTasks):
    background_tasks.add_task(_write_event, event)
    return {"status": "accepted"}

@app.post("/outcomes")
async def create_outcome(outcome: HumanOutcome):
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                """
                INSERT INTO human_outcomes (
                    interaction_id, reviewer_id, action, was_original_flag_correct, reason, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    outcome.interaction_id,
                    outcome.reviewer_id,
                    outcome.action,
                    outcome.was_original_flag_correct,
                    outcome.reason,
                    outcome.created_at,
                )
            )
            await db.commit()
    except Exception as e:
        logger.error(f"Failed to write outcome {outcome.interaction_id}: {e}")
        raise HTTPException(status_code=500, detail="Database write error")
    return {"status": "created"}

@app.get("/events/{interaction_id}")
async def get_events(interaction_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM interaction_events WHERE interaction_id = ? ORDER BY created_at ASC",
            (interaction_id,)
        )
        rows = await cursor.fetchall()
        if not rows:
            raise HTTPException(status_code=404, detail="Interaction not found")
        events = [dict(row) for row in rows]
        for e in events:
            if "envelope" in e and isinstance(e["envelope"], str):
                e["envelope"] = json.loads(e["envelope"])
        return {"events": events}

@app.get("/events")
async def query_events(
    use_case: Optional[str] = None,
    action: Optional[str] = None,
    direction: Optional[str] = None,
    since: Optional[str] = None,
    limit: int = Query(50, le=1000)
):
    query = "SELECT * FROM interaction_events"
    conditions = []
    params = []
    if use_case:
        conditions.append("use_case = ?")
        params.append(use_case)
    if action:
        conditions.append("decision_action = ?")
        params.append(action)
    if direction:
        conditions.append("direction = ?")
        params.append(direction)
    if since:
        conditions.append("created_at >= ?")
        params.append(since)
    
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)
    
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()
        events = [dict(row) for row in rows]
        for e in events:
            if "envelope" in e and isinstance(e["envelope"], str):
                e["envelope"] = json.loads(e["envelope"])
        return {"events": events}

@app.get("/stats")
async def get_stats():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        
        # total interactions
        cursor = await db.execute("SELECT COUNT(DISTINCT interaction_id) as total FROM interaction_events")
        row = await cursor.fetchone()
        total_interactions = row["total"] if row else 0

        # action counts
        cursor = await db.execute("SELECT decision_action, COUNT(*) as count FROM interaction_events GROUP BY decision_action")
        action_rows = await cursor.fetchall()
        action_counts = {r["decision_action"]: r["count"] for r in action_rows if r["decision_action"]}
        
        block_rate = (action_counts.get("block", 0) / total_interactions) if total_interactions > 0 else 0
        escalation_rate = (action_counts.get("escalate", 0) / total_interactions) if total_interactions > 0 else 0
        
        # use case counts
        cursor = await db.execute("SELECT use_case, COUNT(*) as count FROM interaction_events GROUP BY use_case")
        use_case_rows = await cursor.fetchall()
        use_cases = {r["use_case"]: r["count"] for r in use_case_rows if r["use_case"]}

        return {
            "total_interactions": total_interactions,
            "action_counts": action_counts,
            "block_rate": block_rate,
            "escalation_rate": escalation_rate,
            "by_use_case": use_cases
        }

@app.get("/outcomes/stats")
async def get_outcomes_stats():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT COUNT(*) as total FROM human_outcomes")
        row = await cursor.fetchone()
        total = row["total"] if row else 0
        
        cursor = await db.execute("SELECT was_original_flag_correct, COUNT(*) as count FROM human_outcomes GROUP BY was_original_flag_correct")
        correctness_rows = await cursor.fetchall()
        
        correct_count = 0
        incorrect_count = 0
        for r in correctness_rows:
            if r["was_original_flag_correct"]:
                correct_count = r["count"]
            else:
                incorrect_count = r["count"]
                
        fp_rate = incorrect_count / total if total > 0 else 0
        fn_rate = 0 # Cannot strictly calculate false negatives easily without labels on ALL events, but returning structure
        
        return {
            "total_reviews": total,
            "correct_flags": correct_count,
            "incorrect_flags": incorrect_count,
            "false_positive_rate": fp_rate,
            "false_negative_rate": fn_rate,
        }

@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "audit_store"}

@app.get("/metrics")
async def metrics():
    # Placeholder for Prometheus metrics
    return {"status": "ok"}

