"""
ControlPlane.ai — Real-Time Sliding-Window Token Streaming Scanner (§8)

Scans real-time LLM token streams on the fly using a 30-token sliding window.
Triggers mid-stream truncation and terminates the stream if system prompt
leakage or credential secrets are detected.
"""

import asyncio
import json
from typing import AsyncGenerator, Dict, Any, List

from services.output_guard.scanners.system_prompt_leakage import scan_system_prompt_leakage
from shared.schemas import CheckVerdict


async def scan_and_stream_tokens(
    token_generator: AsyncGenerator[str, None],
    sliding_window_size: int = 30
) -> AsyncGenerator[str, None]:
    """
    Consumes a raw LLM token stream, maintains a 30-token sliding window,
    scans for leakage/secrets, and yields SSE data chunks.
    Truncates mid-stream if a violation occurs.
    """
    token_buffer: List[str] = []
    
    async for raw_token in token_generator:
        token_buffer.append(raw_token)
        
        # Scan sliding window (last 30 tokens)
        window_tokens = token_buffer[-sliding_window_size:]
        window_text = "".join(window_tokens)

        # Check for system prompt leakage
        leak_res = scan_system_prompt_leakage(window_text)
        if leak_res.verdict == CheckVerdict.FAIL:
            yield f"data: {json.dumps({'content': ' [BLOCKED BY CONTROLPLANE.AI FIREWALL: SYSTEM PROMPT LEAKAGE DETECTED]', 'finish_reason': 'content_filter'})}\n\n"
            yield f"data: [DONE]\n\n"
            return

        # Check for secret patterns in sliding window
        if "sk-" in window_text or "ghp_" in window_text or "AKIA" in window_text:
            yield f"data: {json.dumps({'content': ' [BLOCKED BY CONTROLPLANE.AI FIREWALL: SECRET DETECTED IN OUTPUT]', 'finish_reason': 'content_filter'})}\n\n"
            yield f"data: [DONE]\n\n"
            return

        yield f"data: {json.dumps({'content': raw_token, 'finish_reason': None})}\n\n"

    yield f"data: {json.dumps({'content': '', 'finish_reason': 'stop'})}\n\n"
    yield f"data: [DONE]\n\n"
