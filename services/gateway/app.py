import sys
import uuid
import time
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from fastapi import FastAPI, HTTPException, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
import httpx
from shared.schemas import (
    ChatRequest, ChatResponse, InteractionEnvelope, Direction,
    Payload, PayloadRole, DecisionAction, UseCase, Geography, get_default_max_tokens,
    RiskTier, RiskAssessment, Decision
)
from shared.config import (
    setup_logging, INPUT_GUARD_URL, ROUTER_URL, ADAPTER_URL,
    OUTPUT_GUARD_URL, AUDIT_STORE_URL, ACTION_GUARD_URL,
    REVIEW_CONSOLE_URL, POLICY_ENGINE_URL, IMMUNE_SYSTEM_URL,
    CONTROLPLANE_SYSTEM_PROMPT
)

logger = setup_logging("gateway")
app = FastAPI(title="ControlPlane API Gateway", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def optional_auth(authorization: Optional[str] = Header(None)):
    """Auth is optional for dashboard/read endpoints."""
    if authorization and authorization.startswith("Bearer "):
        return authorization.split(" ")[1]
    return "anonymous"


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "gateway"}


@app.get("/v1/health")
async def aggregate_health():
    """Check health of all downstream services."""
    services = {
        "input_guard": INPUT_GUARD_URL,
        "output_guard": OUTPUT_GUARD_URL,
        "pii_service": "http://localhost:8003",
        "policy_engine": POLICY_ENGINE_URL,
        "router": ROUTER_URL,
        "adapter": ADAPTER_URL,
        "audit_store": AUDIT_STORE_URL,
        "review_console": REVIEW_CONSOLE_URL,
        "immune_system": IMMUNE_SYSTEM_URL,
        "action_guard": ACTION_GUARD_URL,
    }
    results = {}
    async with httpx.AsyncClient(timeout=3.0) as client:
        for name, url in services.items():
            try:
                resp = await client.get(f"{url}/healthz")
                results[name] = {
                    "status": "healthy" if resp.status_code == 200 else "unhealthy",
                    "latency_ms": round(resp.elapsed.total_seconds() * 1000, 1),
                }
            except Exception:
                results[name] = {"status": "unhealthy", "latency_ms": 0}
    results["gateway"] = {"status": "healthy", "latency_ms": 0}
    return results


@app.get("/v1/health/system")
async def system_health():
    raw = await aggregate_health()
    now = datetime.now(timezone.utc).isoformat()
    return [{
        "name": name.replace("_", " ").title(),
        "status": info.get("status", "unhealthy"),
        "latency": info.get("latency_ms", 0),
        "last_check": now,
    } for name, info in raw.items()]


# ─── Audit Logging Helper ────────────────────────────────────────────────────

async def log_audit_async(event_data: dict):
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(f"{AUDIT_STORE_URL}/events", json=event_data)
    except Exception as e:
        logger.error(f"Failed to log audit event: {e}")


async def create_escalation_async(item_data: dict):
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(f"{REVIEW_CONSOLE_URL}/escalations", json=item_data)
            if resp.status_code != 200:
                logger.error(f"Failed to create escalation: {resp.text}")
    except Exception as e:
        logger.error(f"Failed to reach Review Console: {e}")


def _enum_val(v):
    """Safely get .value from an enum or return the string."""
    return v.value if hasattr(v, "value") else v


# ─── Chat Completions (main endpoint) ─────────────────────────────────────────

@app.post("/v1/chat/completions")
async def chat_completions(req: ChatRequest, token: str = Depends(optional_auth)):
    start_time = time.time()

    interaction_id = str(uuid.uuid4())
    session_id = req.session_id or str(uuid.uuid4())
    last_message = req.messages[-1]

    envelope = InteractionEnvelope(
        interaction_id=interaction_id,
        session_id=session_id,
        use_case=req.use_case,
        geography=req.geography,
        direction=Direction.INPUT,
        payload=Payload(role=PayloadRole(last_message.role), content=last_message.content),
    )

    if req.model:
        envelope.model.requested = req.model

    logger.info(f"[{interaction_id}] Processing | use_case={req.use_case} geo={req.geography}")

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # 2. Input Guard
            try:
                resp = await client.post(f"{INPUT_GUARD_URL}/scan", json=envelope.model_dump())
                if resp.status_code == 200:
                    envelope = InteractionEnvelope(**resp.json())
            except Exception as e:
                logger.error(f"[{interaction_id}] Input Guard failed: {e}")
                if req.use_case == UseCase.DECISION_SUPPORT:
                    raise HTTPException(status_code=503, detail="Input Guard unavailable")

            if envelope.decision.action == DecisionAction.BLOCK:
                latency = (time.time() - start_time) * 1000
                asyncio.create_task(log_audit_async({
                    "interaction_id": interaction_id,
                    "session_id": session_id,
                    "direction": "input",
                    "use_case": _enum_val(req.use_case),
                    "geography": _enum_val(req.geography),
                    "envelope": envelope.model_dump(),
                    "decision_action": _enum_val(envelope.decision.action),
                    "policy_version": envelope.decision.policy_version,
                }))
                return ChatResponse(
                    interaction_id=interaction_id,
                    session_id=session_id,
                    content=envelope.decision.reason or "Request blocked by safety policy.",
                    decision=envelope.decision,
                    checks_summary=[c.model_dump() for c in envelope.checks],
                    risk=envelope.risk,
                    latency_ms=latency,
                )

            # Log Input Audit Event
            asyncio.create_task(log_audit_async({
                "interaction_id": interaction_id,
                "session_id": session_id,
                "direction": "input",
                "use_case": _enum_val(req.use_case),
                "geography": _enum_val(req.geography),
                "envelope": envelope.model_dump(),
                "decision_action": _enum_val(envelope.decision.action),
                "policy_version": envelope.decision.policy_version,
            }))

            # If flagged or escalated for human verification, enqueue review asynchronously without blocking execution!
            if envelope.decision.action in (DecisionAction.FLAG, DecisionAction.ESCALATE):
                asyncio.create_task(create_escalation_async({
                    "interaction_id": interaction_id,
                    "session_id": session_id,
                    "direction": "input",
                    "use_case": _enum_val(req.use_case),
                    "geography": _enum_val(req.geography),
                    "risk_tier": _enum_val(envelope.risk.tier),
                    "escalation_reason": envelope.decision.reason or "Flagged for human verification",
                    "checks": [c.model_dump() for c in envelope.checks],
                    "payload": envelope.payload.model_dump(),
                }))

            # 3. Router
            try:
                resp = await client.post(f"{ROUTER_URL}/route", json=envelope.model_dump())
                if resp.status_code == 200:
                    envelope = InteractionEnvelope(**resp.json())
            except Exception as e:
                logger.error(f"[{interaction_id}] Router failed: {e}")

            routed_model = envelope.model.routed_to or req.model or "google/gemini-2.0-flash-001"

            # 4. Model Adapter
            max_tokens = req.max_tokens or get_default_max_tokens(req.use_case)
            adapter_req = {
                "model": routed_model,
                "messages": [{"role": "system", "content": CONTROLPLANE_SYSTEM_PROMPT}]
                            + [m.model_dump() for m in req.messages],
                "max_tokens": max_tokens,
            }
            
            resp = await client.post(f"{ADAPTER_URL}/complete", json=adapter_req)
            resp.raise_for_status()
            adapter_resp = resp.json()

            # 5. Output Guard
            output_envelope = InteractionEnvelope(
                interaction_id=interaction_id,
                session_id=session_id,
                use_case=req.use_case,
                geography=req.geography,
                direction=Direction.OUTPUT,
                payload=Payload(role=PayloadRole.ASSISTANT, content=adapter_resp.get("content") or "Action executed successfully."),
                model=envelope.model,
            )

            try:
                resp = await client.post(f"{OUTPUT_GUARD_URL}/scan", json=output_envelope.model_dump())
                if resp.status_code == 200:
                    output_envelope = InteractionEnvelope(**resp.json())
            except Exception as e:
                logger.error(f"[{interaction_id}] Output Guard failed: {e}")

            # 6. Combined Governance Logic (Merge Input & Output Decisions)
            if output_envelope.decision.action == DecisionAction.BLOCK:
                combined_action = DecisionAction.BLOCK
                combined_reason = output_envelope.decision.reason or "Response blocked by output safety policy"
                combined_tier = RiskTier.HIGH
                final_content = "Response blocked by safety policy."
            elif envelope.decision.action == DecisionAction.FLAG or output_envelope.decision.action == DecisionAction.FLAG:
                combined_action = DecisionAction.FLAG
                flag_reason = envelope.decision.reason if envelope.decision.action == DecisionAction.FLAG else output_envelope.decision.reason
                combined_reason = f"Warning flagged: {flag_reason}"
                combined_tier = RiskTier.MEDIUM
                final_content = output_envelope.payload.content
            else:
                combined_action = DecisionAction.ALLOW
                combined_reason = "All checks passed"
                combined_tier = RiskTier.LOW
                final_content = output_envelope.payload.content

            # Combine checks from input guard and output guard
            combined_checks = []
            seen_check_names = set()
            
            # Prioritize checks with actual non-zero scores or warnings
            for c in envelope.checks:
                cdict = c.model_dump()
                combined_checks.append(cdict)
                seen_check_names.add(c.check_name)
                
            for c in output_envelope.checks:
                cdict = c.model_dump()
                if c.check_name not in seen_check_names:
                    combined_checks.append(cdict)
                elif c.score > 0: # overwrite 0.0 with non-zero if output triggered
                    for idx, existing in enumerate(combined_checks):
                        if existing.get("check_name") == c.check_name:
                            combined_checks[idx] = cdict

            combined_decision = Decision(
                action=combined_action,
                reason=combined_reason,
                policy_version=output_envelope.decision.policy_version or envelope.decision.policy_version or "default",
                decided_by="policy_engine",
                confidence=max(envelope.decision.confidence, output_envelope.decision.confidence)
            )

            # If flagged, asynchronously create escalation item for human review
            if combined_action == DecisionAction.FLAG:
                is_output_flag = output_envelope.decision.action == DecisionAction.FLAG
                escalation_direction = "output" if is_output_flag else "input"
                escalation_payload = output_envelope.payload.model_dump() if is_output_flag else envelope.payload.model_dump()

                asyncio.create_task(create_escalation_async({
                    "interaction_id": interaction_id,
                    "session_id": session_id,
                    "direction": escalation_direction,
                    "use_case": _enum_val(req.use_case),
                    "geography": _enum_val(req.geography),
                    "risk_tier": _enum_val(combined_tier),
                    "escalation_reason": combined_reason,
                    "checks": combined_checks,
                    "payload": escalation_payload,
                }))

            latency = (time.time() - start_time) * 1000

            response = ChatResponse(
                interaction_id=interaction_id,
                session_id=session_id,
                content=final_content,
                model_used=output_envelope.model.routed_to or routed_model,
                decision=combined_decision,
                checks_summary=combined_checks,
                risk=RiskAssessment(tier=combined_tier, confidence=combined_decision.confidence),
                latency_ms=latency,
            )

            # 7. Audit Logging (fire and forget) - Output event
            asyncio.create_task(log_audit_async({
                "interaction_id": interaction_id,
                "session_id": session_id,
                "direction": "output",
                "use_case": _enum_val(req.use_case),
                "geography": _enum_val(req.geography),
                "envelope": output_envelope.model_dump(),
                "decision_action": _enum_val(output_envelope.decision.action),
                "policy_version": output_envelope.decision.policy_version,
            }))

            return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{interaction_id}] Request failed: {e}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")


# ─── Actions Endpoint ─────────────────────────────────────────────────────────

@app.post("/v1/actions/execute")
async def execute_actions(req: Dict[str, Any], token: str = Depends(optional_auth)):
    interaction_id = str(uuid.uuid4())
    session_id = req.get("session_id", str(uuid.uuid4()))
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            guard_req = {
                "tool_calls": req.get("tool_calls", []),
                "session_id": session_id,
                "use_case": req.get("use_case", "customer_support"),
                "interaction_id": interaction_id,
            }
            resp = await client.post(f"{ACTION_GUARD_URL}/guard", json=guard_req)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        logger.error(f"Action Guard error: {e}")
        raise HTTPException(status_code=500, detail="Action Guard unavailable")


# ─── Proxy: Audit Store ──────────────────────────────────────────────────────

@app.get("/v1/interactions/{interaction_id}")
async def get_interaction(interaction_id: str):
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{AUDIT_STORE_URL}/events/{interaction_id}")
        if resp.status_code == 200:
            return resp.json()
        raise HTTPException(status_code=404, detail="Interaction not found")


@app.get("/v1/audit/events")
async def get_audit_events(
    use_case: Optional[str] = None,
    action: Optional[str] = None,
    direction: Optional[str] = None,
    since: Optional[str] = None,
    limit: int = 50,
):
    params: dict = {"limit": limit}
    if use_case:
        params["use_case"] = use_case
    if action:
        params["action"] = action
    if direction:
        params["direction"] = direction
    if since:
        params["since"] = since
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{AUDIT_STORE_URL}/events", params=params)
        if resp.status_code != 200:
            return []
        return [_to_frontend_audit_event(e) for e in resp.json().get("events", [])]

def _to_frontend_audit_event(e: dict) -> dict:
    envelope = e.get("envelope") or {}
    risk = envelope.get("risk", {}) or {}
    return {
        "interaction_id": e.get("interaction_id"),
        "timestamp": e.get("created_at"),
        "use_case": e.get("use_case"),
        "geography": e.get("geography"),
        "direction": e.get("direction"),
        "decision_action": e.get("decision_action"),
        "risk_tier": risk.get("tier", "low"),
        "interaction": {
            "interaction_id": envelope.get("interaction_id"),
            "timestamp": envelope.get("created_at"),
            "use_case": envelope.get("use_case"),
            "geography": envelope.get("geography"),
            "direction": envelope.get("direction"),
            "payload": envelope.get("payload", {}),
            "checks": envelope.get("checks", []),
            "risk_assessment": {
                "tier": risk.get("tier", "low"),
                "confidence": risk.get("confidence", 0.0),
                "blast_radius": "low",
                "reasoning": "",
            },
            "decision": envelope.get("decision", {}),
            "latency_breakdown": {},
            "model_used": (envelope.get("model") or {}).get("routed_to"),
        },
    }

# ─── Proxy: Review Console ───────────────────────────────────────────────────

@app.get("/v1/escalations")
async def get_escalations(status: Optional[str] = None):
    async with httpx.AsyncClient(timeout=5.0) as client:
        params = {"status": status} if status else {}
        resp = await client.get(f"{REVIEW_CONSOLE_URL}/escalations", params=params)
        return resp.json() if resp.status_code == 200 else []


@app.post("/v1/escalations/{interaction_id}/resolve")
async def resolve_escalation(interaction_id: str, body: Dict[str, Any]):
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(
            f"{REVIEW_CONSOLE_URL}/escalations/{interaction_id}/resolve", json=body
        )
        return resp.json() if resp.status_code == 200 else {}


# ─── Proxy: Policy Engine ────────────────────────────────────────────────────

@app.get("/v1/policies")
async def get_policies():
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{POLICY_ENGINE_URL}/policies")
        if resp.status_code != 200:
            return []
        rules = (resp.json().get("config") or {}).get("policies", [])
        return [{
            "id": f"{r.get('use_case')}:{r.get('geography')}:{r.get('check')}",
            "use_case": r.get("use_case"),
            "geography": r.get("geography"),
            "check_name": r.get("check"),
            "block_threshold": r.get("block_threshold"),
            "flag_threshold": r.get("flag_threshold"),
            "on_timeout": "block" if r.get("on_timeout") == "block" else "allow",
        } for r in rules]

@app.put("/v1/policies")
async def update_policies(request: Request):
    body = await request.json()
    # Frontend sends {"policies": [...]} (wrapped); bare list also accepted
    if isinstance(body, list):
        raw_rules = body
    elif isinstance(body, dict):
        raw_rules = body.get("policies") or body.get("rules") or []
    else:
        raw_rules = []

    policy_list = []
    for r in raw_rules:
        if not isinstance(r, dict):
            continue  # skip string keys if iterated wrongly
        policy_list.append({
            "use_case": r.get("use_case", "*"),
            "geography": r.get("geography", "*"),
            "check": r.get("check_name") or r.get("check", ""),
            "block_threshold": float(r.get("block_threshold", 0.7)),
            "flag_threshold": float(r.get("flag_threshold", 0.4)),
            "on_timeout": "block" if r.get("on_timeout") == "block" else "allow_with_flag",
        })

    config = {
        "policies": policy_list,
        "defaults": {"block_threshold": 0.7, "flag_threshold": 0.4, "on_timeout": "block"},
    }
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.put(f"{POLICY_ENGINE_URL}/policies", json=config)
        return resp.json() if resp.status_code == 200 else {}

# ─── Proxy: Router ────────────────────────────────────────────────────────────

@app.get("/v1/models")
async def get_models():
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{ROUTER_URL}/models")
        return resp.json() if resp.status_code == 200 else []


@app.get("/v1/audit/stats")
async def get_audit_stats():
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{AUDIT_STORE_URL}/stats")
        data = resp.json() if resp.status_code == 200 else {}
    
    total = data.get("total_interactions", 0)
    action_counts = data.get("action_counts", {})
    block_rate = round(data.get("block_rate", 0) * 100, 1)
    escalate_rate = round(data.get("escalation_rate", 0) * 100, 1)
    flag_count = action_counts.get("flag", 0)
    flag_rate = round((flag_count / total * 100) if total > 0 else 0, 1)

    return {
        "total": total,
        "total_interactions": total,
        "block_rate": block_rate,
        "flag_rate": flag_rate,
        "escalate_rate": escalate_rate,
        "escalation_rate": escalate_rate,
        "action_counts": action_counts,
        "by_use_case": data.get("by_use_case", {})
    }


@app.get("/v1/router/endpoints")
async def get_router_endpoints():
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{ROUTER_URL}/endpoints")
        return resp.json() if resp.status_code == 200 else []


@app.post("/v1/router/endpoints")
async def register_router_endpoint(endpoint: Dict[str, Any]):
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(f"{ROUTER_URL}/endpoints", json=endpoint)
        return resp.json() if resp.status_code == 200 else {}


@app.delete("/v1/router/endpoints/{endpoint_id}")
async def delete_router_endpoint(endpoint_id: str):
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.delete(f"{ROUTER_URL}/endpoints/{endpoint_id}")
        if resp.status_code == 200:
            return resp.json()
        raise HTTPException(status_code=resp.status_code, detail="Failed to delete endpoint")


@app.post("/v1/router/match")
async def test_router_match(body: Dict[str, Any]):
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(f"{ROUTER_URL}/match", json=body)
        return resp.json() if resp.status_code == 200 else {}


# ─── Proxy: Immune System ────────────────────────────────────────────────────

@app.get("/v1/health/alerts")
async def get_alerts():
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{IMMUNE_SYSTEM_URL}/alerts")
        if resp.status_code != 200:
            return []
        return [{
            "id": a.get("alert_id"),
            "severity": "high" if a.get("severity") == "critical" else "medium",
            "metric": a.get("metric_name"),
            "current_value": a.get("current_value"),
            "baseline_value": a.get("baseline_mean"),
            "timestamp": a.get("created_at"),
        } for a in resp.json()]


@app.get("/v1/health/proposals")
async def get_proposals():
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            resp = await client.get(f"{IMMUNE_SYSTEM_URL}/proposals")
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            logger.error(f"Failed to fetch proposals: {e}")
    return []


@app.post("/v1/health/proposals/{proposal_id}/accept")
async def accept_proposal(proposal_id: str):
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            resp = await client.post(f"{IMMUNE_SYSTEM_URL}/proposals/{proposal_id}/accept")
            if resp.status_code == 200:
                return resp.json()
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to accept proposal: {e}")
            raise HTTPException(status_code=500, detail=str(e))


@app.post("/v1/health/proposals/{proposal_id}/dismiss")
async def dismiss_proposal(proposal_id: str):
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            resp = await client.post(f"{IMMUNE_SYSTEM_URL}/proposals/{proposal_id}/dismiss")
            if resp.status_code == 200:
                return resp.json()
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to dismiss proposal: {e}")
            raise HTTPException(status_code=500, detail=str(e))


# ─── Proxy: Trust / Outcome Stats ────────────────────────────────────────────

@app.get("/v1/trust/outcomes")
async def get_outcome_stats():
    async with httpx.AsyncClient(timeout=5.0) as client:
        outcomes_resp, stats_resp = await asyncio.gather(
            client.get(f"{AUDIT_STORE_URL}/outcomes/stats"),
            client.get(f"{AUDIT_STORE_URL}/stats"),
            return_exceptions=True,
        )
        outcomes = outcomes_resp.json() if not isinstance(outcomes_resp, Exception) and outcomes_resp.status_code == 200 else {}
        stats = stats_resp.json() if not isinstance(stats_resp, Exception) and stats_resp.status_code == 200 else {}

    total = stats.get("total_interactions", 0)
    raw_action_counts = stats.get("action_counts", {})
    action_counts = {
        "allow": raw_action_counts.get("allow", 0),
        "flag": raw_action_counts.get("flag", 0),
        "block": raw_action_counts.get("block", 0),
        "escalate": raw_action_counts.get("escalate", 0),
    }

    block_rate = round(stats.get("block_rate", 0) * 100, 1)
    escalate_rate = round(stats.get("escalation_rate", 0) * 100, 1)
    flag_count = action_counts["flag"]
    flag_rate = round((flag_count / total * 100) if total > 0 else 0, 1)

    total_reviews = outcomes.get("total_reviews", 0)
    fpr_raw = outcomes.get("false_positive_rate", 0.0)
    fnr_raw = outcomes.get("false_negative_rate", 0.0)
    fpr = round(fpr_raw * 100, 1) if total_reviews > 0 else None
    fnr = round(fnr_raw * 100, 1) if total_reviews > 0 else None

    # Composite trust score: high baseline, penalized if false positives or false negatives occur
    if total == 0:
        trust_score = 100.0
    elif total_reviews > 0:
        trust_score = round(max(10.0, min(100.0, 100.0 - ((fpr or 0) * 2.5) - ((fnr or 0) * 3.5))), 1)
    else:
        # Before reviews, baseline compliance score based on safe throughput
        trust_score = round(max(75.0, min(100.0, 100.0 - (escalate_rate * 0.5))), 1)

    return {
        "total": total,
        "fpr": fpr,
        "fnr": fnr,
        "trust_score": trust_score,
        "block_rate": block_rate,
        "flag_rate": flag_rate,
        "escalate_rate": escalate_rate,
        "total_reviews": total_reviews,
        "by_use_case": stats.get("by_use_case", {}),
        "action_counts": action_counts,
    }


@app.get("/v1/audit/trend")
async def get_audit_trend():
    """Return last 7 days of block/flag/escalate counts for the Trust Dashboard chart."""
    from datetime import datetime, timedelta, timezone
    days = []
    for i in range(6, -1, -1):
        d = datetime.now(timezone.utc) - timedelta(days=i)
        days.append(d.strftime("%Y-%m-%d"))

    # Fetch recent events (up to 1000 to compute 7-day trend)
    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.get(f"{AUDIT_STORE_URL}/events", params={"limit": 1000})
        events = resp.json().get("events", []) if resp.status_code == 200 else []

    # Bucket by day
    from collections import defaultdict
    buckets: dict = defaultdict(lambda: {"block": 0, "flag": 0, "escalate": 0, "allow": 0})
    for ev in events:
        ts = (ev.get("created_at") or "")[:10]
        if ts in days:
            action = ev.get("decision_action", "allow")
            if action in buckets[ts]:
                buckets[ts][action] += 1

    day_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    result = []
    for i, day in enumerate(days):
        b = buckets.get(day, {})
        result.append({
            "date": day_labels[i % 7],
            "block": b.get("block", 0),
            "flag": b.get("flag", 0),
            "escalate": b.get("escalate", 0),
            "allow": b.get("allow", 0),
        })
    return result

# ─── Proxy: Action Guard ─────────────────────────────────────────────────────

@app.post("/v1/guard")
async def guard_action(body: Dict[str, Any]):
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(f"{ACTION_GUARD_URL}/guard", json=body)
        return resp.json() if resp.status_code == 200 else {}
