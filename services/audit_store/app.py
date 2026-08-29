import asyncio
import json
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
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
from shared.schemas import (
    AuditEvent, HumanOutcome, RegisteredSecret, PolicyRecord,
    UseCaseConfig, SanitizerOutput, RawEntity
)

logger = setup_logging("audit_store")
DATA_DIR = Path(__file__).parent / "data"
DB_PATH = DATA_DIR / "audit_store.db"

# Server Secret Key for HMAC-SHA256 fingerprint hashing (zero plaintext storage)
SERVER_HMAC_KEY = b"controlplane_enterprise_hmac_secret_key_2026"

# In-Memory Redaction Vault with short TTL (10 minutes)
REDACTION_VAULT: Dict[str, Dict[str, Any]] = {}
VAULT_TTL_SECONDS = 600

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
        await db.execute('''
            CREATE TABLE IF NOT EXISTS registered_secrets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                secret_id TEXT UNIQUE,
                fingerprint TEXT UNIQUE,
                secret_type TEXT,
                action_on_match TEXT,
                status TEXT DEFAULT 'active',
                date_registered TEXT,
                date_last_matched TEXT,
                created_by TEXT
            )
        ''')
        await db.execute('''
            CREATE TABLE IF NOT EXISTS policy_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                policy_id TEXT,
                version INTEGER,
                raw_text TEXT,
                short_description TEXT,
                structured_rule JSON,
                embedding JSON,
                status TEXT DEFAULT 'active',
                author TEXT,
                created_at TEXT,
                updated_at TEXT,
                UNIQUE(policy_id, version)
            )
        ''')
        await db.execute('''
            CREATE TABLE IF NOT EXISTS use_case_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                use_case_id TEXT,
                version INTEGER,
                name TEXT,
                description TEXT,
                latency_tier TEXT,
                detectors JSON,
                pii_permissions JSON,
                strict_pii_declaration BOOLEAN DEFAULT 0,
                change_note TEXT,
                updated_by TEXT,
                updated_at TEXT,
                UNIQUE(use_case_id, version)
            )
        ''')
        try:
            await db.execute("ALTER TABLE use_case_configs ADD COLUMN pii_permissions JSON")
            await db.commit()
        except Exception:
            pass
        await db.execute('''
            CREATE TABLE IF NOT EXISTS redaction_vault (
                interaction_id TEXT PRIMARY KEY,
                entities JSON,
                created_at REAL,
                expires_at REAL
            )
        ''')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_interaction_id ON interaction_events (interaction_id)')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_use_case_created_at ON interaction_events (use_case, created_at)')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_secret_fingerprint ON registered_secrets (fingerprint)')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_policy_id_ver ON policy_records (policy_id, version)')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_vault_expires ON redaction_vault (expires_at)')
        await db.commit()
    logger.info("Audit store & enterprise security tables initialized.")
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

@app.get("/")
async def root():
    return {"status": "ok", "service": "audit_store"}

@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "audit_store"}

# ─── HMAC Secret Fingerprint Store (§4 & §5) ───────────────────────────────────

class SecretRegisterRequest(BaseModel):
    raw_secret: str
    secret_type: str = "api_key"
    action_on_match: str = "block"
    created_by: str = "security_admin"

@app.post("/v1/secrets/register")
async def register_secret(req: SecretRegisterRequest):
    import hmac
    import hashlib
    raw = req.raw_secret.strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Raw secret cannot be empty")
    
    # Compute HMAC-SHA256 fingerprint; discard raw secret immediately from RAM
    fingerprint = hmac.new(SERVER_HMAC_KEY, raw.encode("utf-8"), hashlib.sha256).hexdigest()
    secret_id = f"sec_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT secret_id, secret_type, action_on_match, status, date_registered FROM registered_secrets WHERE fingerprint = ?", (fingerprint,))
        existing = await cursor.fetchone()
        if existing:
            # Reactivate if previously revoked or update action
            await db.execute("UPDATE registered_secrets SET status = 'active', action_on_match = ?, secret_type = ? WHERE fingerprint = ?", (req.action_on_match, req.secret_type, fingerprint))
            await db.commit()
            logger.info(f"Re-activated existing registered secret fingerprint: {existing['secret_id']}")
            return {
                "status": "registered",
                "secret_id": existing["secret_id"],
                "secret_type": req.secret_type,
                "action_on_match": req.action_on_match,
                "date_registered": existing["date_registered"]
            }

        await db.execute(
            """
            INSERT INTO registered_secrets (
                secret_id, fingerprint, secret_type, action_on_match, status, date_registered, created_by
            ) VALUES (?, ?, ?, ?, 'active', ?, ?)
            """,
            (secret_id, fingerprint, req.secret_type, req.action_on_match, now, req.created_by)
        )
        await db.commit()

    logger.info(f"Registered secret fingerprint: {secret_id} ({req.secret_type})")
    # Return metadata only — never return raw secret
    return {
        "status": "registered",
        "secret_id": secret_id,
        "secret_type": req.secret_type,
        "action_on_match": req.action_on_match,
        "date_registered": now
    }

@app.get("/v1/secrets")
async def list_secrets():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT secret_id, secret_type, action_on_match, status, date_registered, date_last_matched, created_by FROM registered_secrets ORDER BY id DESC")
        rows = await cursor.fetchall()
        return {"secrets": [dict(r) for r in rows]}

@app.post("/v1/secrets/{secret_id}/revoke")
async def revoke_secret(secret_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE registered_secrets SET status = 'revoked' WHERE secret_id = ?", (secret_id,))
        await db.commit()
    logger.info(f"Revoked secret fingerprint: {secret_id}")
    return {"status": "revoked", "secret_id": secret_id}

class FingerprintMatchRequest(BaseModel):
    candidates: List[str]

@app.post("/v1/secrets/fingerprints/match")
async def match_secret_fingerprints(req: FingerprintMatchRequest):
    import hmac
    import hashlib
    matches = []
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT secret_id, fingerprint, secret_type, action_on_match FROM registered_secrets WHERE status = 'active'")
        active_secrets = {r["fingerprint"]: dict(r) for r in await cursor.fetchall()}

        now = datetime.now(timezone.utc).isoformat()
        matched_ids = set()
        for cand in req.candidates:
            c_fp = hmac.new(SERVER_HMAC_KEY, cand.encode("utf-8"), hashlib.sha256).hexdigest()
            if c_fp in active_secrets:
                sec_meta = active_secrets[c_fp]
                matches.append(sec_meta)
                matched_ids.add(sec_meta["secret_id"])

        if matched_ids:
            for sid in matched_ids:
                await db.execute("UPDATE registered_secrets SET date_last_matched = ? WHERE secret_id = ?", (now, sid))
            await db.commit()

    return {"matches": matches}

# ─── Structured Policy Library (§4 & §5) ───────────────────────────────────────

@app.post("/v1/policies")
async def save_policy_record(record: PolicyRecord):
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        # Check current version
        cursor = await db.execute("SELECT MAX(version) as max_v FROM policy_records WHERE policy_id = ?", (record.policy_id,))
        row = await cursor.fetchone()
        next_version = (row[0] + 1) if row and row[0] else record.version

        await db.execute(
            """
            INSERT INTO policy_records (
                policy_id, version, raw_text, short_description, structured_rule, embedding, status, author, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record.policy_id,
                next_version,
                record.raw_text,
                record.short_description,
                json.dumps(record.structured_rule.model_dump() if hasattr(record.structured_rule, "model_dump") else record.structured_rule),
                json.dumps(record.embedding),
                record.status,
                record.author,
                record.created_at or now,
                now
            )
        )
        await db.commit()

    logger.info(f"Saved policy record {record.policy_id} v{next_version} ({record.status})")
    return {"status": "saved", "policy_id": record.policy_id, "version": next_version}

@app.get("/v1/policies")
async def list_policies(status: Optional[str] = None):
    query = """
        SELECT p1.* FROM policy_records p1
        INNER JOIN (
            SELECT policy_id, MAX(version) as max_version
            FROM policy_records
            GROUP BY policy_id
        ) p2 ON p1.policy_id = p2.policy_id AND p1.version = p2.max_version
    """
    params = []
    if status:
        query += " WHERE p1.status = ?"
        params.append(status)
    query += " ORDER BY p1.id DESC"

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()
        policies = []
        for r in rows:
            p = dict(r)
            if "structured_rule" in p and isinstance(p["structured_rule"], str):
                p["structured_rule"] = json.loads(p["structured_rule"])
            if "embedding" in p and isinstance(p["embedding"], str):
                p["embedding"] = json.loads(p["embedding"])
            policies.append(p)
        return {"policies": policies}

@app.get("/v1/policies/{policy_id}/history")
async def get_policy_history(policy_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM policy_records WHERE policy_id = ? ORDER BY version DESC", (policy_id,))
        rows = await cursor.fetchall()
        history = []
        for r in rows:
            p = dict(r)
            if "structured_rule" in p and isinstance(p["structured_rule"], str):
                p["structured_rule"] = json.loads(p["structured_rule"])
            if "embedding" in p and isinstance(p["embedding"], str):
                p["embedding"] = json.loads(p["embedding"])
            history.append(p)
        return {"policy_id": policy_id, "history": history}

@app.post("/v1/policies/{policy_id}/archive")
async def archive_policy(policy_id: str):
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE policy_records SET status = 'archived', updated_at = ? WHERE policy_id = ?", (now, policy_id))
        await db.commit()
    logger.info(f"Archived policy {policy_id}")
    return {"status": "archived", "policy_id": policy_id}

# ─── Use-Case Configuration Store (§5 & §9) ───────────────────────────────────

@app.post("/v1/configs/{use_case_id:path}")
async def save_use_case_config(config: UseCaseConfig):
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT MAX(version) FROM use_case_configs WHERE use_case_id = ?", (config.use_case_id,))
        row = await cursor.fetchone()
        next_version = (row[0] + 1) if row and row[0] else config.version

        detectors_data = {k: v.model_dump() if hasattr(v, "model_dump") else v for k, v in config.detectors.items()}
        pii_perms_json = json.dumps(config.pii_permissions) if config.pii_permissions else json.dumps({})

        await db.execute(
            """
            INSERT INTO use_case_configs (
                use_case_id, version, name, description, latency_tier, detectors, pii_permissions, strict_pii_declaration, change_note, updated_by, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                config.use_case_id,
                next_version,
                config.name,
                config.description,
                config.latency_tier,
                json.dumps(detectors_data),
                pii_perms_json,
                1 if config.strict_pii_declaration else 0,
                config.change_note,
                config.updated_by,
                now
            )
        )
        await db.commit()

    # Sync to default_policy.yaml so static baseline stays synchronized
    try:
        policy_path = Path(__file__).parent.parent.parent / "policies" / "default_policy.yaml"
        if policy_path.exists() and config.pii_permissions:
            import yaml
            with open(policy_path, "r") as f:
                ydata = yaml.safe_load(f) or {}
            if "pii_permissions" not in ydata:
                ydata["pii_permissions"] = {}
            ydata["pii_permissions"][config.use_case_id] = config.pii_permissions
            with open(policy_path, "w") as f:
                yaml.safe_dump(ydata, f, sort_keys=False)
    except Exception as e:
        logger.warning(f"Could not sync to default_policy.yaml: {e}")

    logger.info(f"Saved use-case configuration {config.use_case_id} v{next_version} with PII permissions")
    return {"status": "saved", "use_case_id": config.use_case_id, "version": next_version}

@app.get("/v1/configs/{use_case_id:path}")
async def get_use_case_config(use_case_id: str):
    default_pii_permissions = {
        "EMAIL": "allow",
        "PHONE": "allow",
        "ADDRESS": "allow",
        "SSN": "block",
        "CREDIT_CARD": "block",
        "PAN": "block",
        "AADHAAR": "block",
        "BANK_ACCOUNT": "block",
        "GOVERNMENT_ID": "block"
    }

    try:
        policy_path = Path(__file__).parent.parent.parent / "policies" / "default_policy.yaml"
        if policy_path.exists():
            import yaml
            with open(policy_path, "r") as f:
                ydata = yaml.safe_load(f)
                if ydata and "pii_permissions" in ydata and use_case_id in ydata["pii_permissions"]:
                    default_pii_permissions = ydata["pii_permissions"][use_case_id]
    except Exception:
        pass

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM use_case_configs WHERE use_case_id = ? ORDER BY version DESC LIMIT 1", (use_case_id,))
        row = await cursor.fetchone()
        if not row:
            default_detectors = {
                "secrets": {"enabled": True, "flag_threshold": 0.3, "block_threshold": 0.5, "fail_behavior": "fail_closed", "is_locked": True},
                "injection": {"enabled": True, "flag_threshold": 0.5, "block_threshold": 0.8, "fail_behavior": "fail_closed", "is_locked": True},
                "pii": {"enabled": True, "flag_threshold": 0.5, "block_threshold": 0.75, "fail_behavior": "fail_closed", "is_locked": False},
                "toxicity": {"enabled": True, "flag_threshold": 0.6, "block_threshold": 0.8, "fail_behavior": "fail_closed", "is_locked": False},
                "policy": {"enabled": True, "flag_threshold": 0.4, "block_threshold": 0.7, "fail_behavior": "fail_closed", "is_locked": False}
            }
            return {
                "use_case_id": use_case_id,
                "name": use_case_id.replace("_", " ").title(),
                "version": 1,
                "latency_tier": "real_time",
                "detectors": default_detectors,
                "pii_permissions": default_pii_permissions,
                "strict_pii_declaration": False,
                "change_note": "Default baseline",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }

        config_data = dict(row)
        if "detectors" in config_data and isinstance(config_data["detectors"], str):
            try:
                config_data["detectors"] = json.loads(config_data["detectors"])
            except Exception:
                config_data["detectors"] = {}
        if "pii_permissions" in config_data and config_data["pii_permissions"]:
            if isinstance(config_data["pii_permissions"], str):
                try:
                    config_data["pii_permissions"] = json.loads(config_data["pii_permissions"])
                except Exception:
                    config_data["pii_permissions"] = default_pii_permissions
        else:
            config_data["pii_permissions"] = default_pii_permissions
        return config_data

@app.get("/v1/configs/{use_case_id:path}/history")
async def get_use_case_config_history(use_case_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM use_case_configs WHERE use_case_id = ? ORDER BY version DESC", (use_case_id,))
        rows = await cursor.fetchall()
        history = []
        for r in rows:
            c = dict(r)
            if "detectors" in c and isinstance(c["detectors"], str):
                c["detectors"] = json.loads(c["detectors"])
            history.append(c)
        return {"use_case_id": use_case_id, "history": history}

# ─── Redaction Vault (§3.10 & §5) ───────────────────────────────────────────────

class VaultStoreRequest(BaseModel):
    interaction_id: str
    raw_entities: List[RawEntity]

@app.post("/v1/vault/store")
async def store_in_vault(req: VaultStoreRequest):
    import time
    now_ts = time.time()
    expires_ts = now_ts + VAULT_TTL_SECONDS
    entities_map = {e.id: e.value for e in req.raw_entities}

    REDACTION_VAULT[req.interaction_id] = {
        "entities": entities_map,
        "created_at": now_ts,
        "expires_at": expires_ts
    }

    try:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                """
                INSERT OR REPLACE INTO redaction_vault (interaction_id, entities, created_at, expires_at)
                VALUES (?, ?, ?, ?)
                """,
                (req.interaction_id, json.dumps(entities_map), now_ts, expires_ts)
            )
            await db.commit()
    except Exception as e:
        logger.warning(f"Failed to persist vault entry to SQLite: {e}")

    return {"status": "stored", "vault_ref": req.interaction_id, "ttl_seconds": VAULT_TTL_SECONDS}

@app.get("/v1/vault/{interaction_id}")
async def get_from_vault(interaction_id: str):
    import time
    now_ts = time.time()

    # Check RAM cache first
    if interaction_id in REDACTION_VAULT:
        entry = REDACTION_VAULT[interaction_id]
        if now_ts > entry["expires_at"]:
            del REDACTION_VAULT[interaction_id]
            raise HTTPException(status_code=410, detail="Vault entry expired")
        return {"vault_ref": interaction_id, "entities": entry["entities"], "expires_in_seconds": int(entry["expires_at"] - now_ts)}

    # Fallback to SQLite DB
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM redaction_vault WHERE interaction_id = ?", (interaction_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Vault entry not found")
        if now_ts > row["expires_at"]:
            await db.execute("DELETE FROM redaction_vault WHERE interaction_id = ?", (interaction_id,))
            await db.commit()
            raise HTTPException(status_code=410, detail="Vault entry expired")

        entities = json.loads(row["entities"]) if isinstance(row["entities"], str) else row["entities"]
        REDACTION_VAULT[interaction_id] = {"entities": entities, "created_at": row["created_at"], "expires_at": row["expires_at"]}
        return {"vault_ref": interaction_id, "entities": entities, "expires_in_seconds": int(row["expires_at"] - now_ts)}

@app.post("/v1/vault/{interaction_id}/reveal")
async def reveal_vault_entity(interaction_id: str, placeholder_id: str, requester: str = "admin"):
    import time
    now_ts = time.time()

    entities = None
    if interaction_id in REDACTION_VAULT:
        entry = REDACTION_VAULT[interaction_id]
        if now_ts <= entry["expires_at"]:
            entities = entry["entities"]

    if entities is None:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM redaction_vault WHERE interaction_id = ?", (interaction_id,))
            row = await cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Vault entry expired or not found")
            if now_ts > row["expires_at"]:
                raise HTTPException(status_code=410, detail="Vault entry expired")
            entities = json.loads(row["entities"]) if isinstance(row["entities"], str) else row["entities"]

    raw_val = entities.get(placeholder_id)
    if not raw_val:
        raise HTTPException(status_code=404, detail=f"Entity {placeholder_id} not found in vault")

    logger.info(f"REDACTION VAULT REVEAL: User {requester} accessed {placeholder_id} on {interaction_id}")
    return {"placeholder_id": placeholder_id, "raw_value": raw_val}

@app.get("/metrics")
async def metrics():
    # Placeholder for Prometheus metrics
    return {"status": "ok"}

