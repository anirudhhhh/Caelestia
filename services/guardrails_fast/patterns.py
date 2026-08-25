"""
ControlPlane.ai — Layer 1 Fast Heuristic Patterns

Fast regex patterns for command injection, SSRF, prompt injection delimiters,
and tool parameter sanitization.
"""

import re
from typing import List, Dict, Any

# Tool call & Command Injection patterns (for Action Guard & prompt arguments)
COMMAND_INJECTION_PATTERNS = [
    (r';\s*(?:rm|sudo|cat|wget|curl|bash|sh|exec|nc|netcat|python|perl)\b', 0.95, "command_chaining"),
    (r'\|\s*(?:bash|sh|exec|curl|wget)\b', 0.95, "pipe_execution"),
    (r'`[^`]+`', 0.90, "backtick_execution"),
    (r'\$\([^)]+\)', 0.90, "subshell_execution"),
    (r'(?:/etc/passwd|/etc/shadow|/proc/self/environ)', 0.95, "path_traversal"),
    (r'(?:file://|gopher://|dict://|php://)', 0.90, "ssrf_protocol"),
    (r'127\.0\.0\.1|0\.0\.0\.0|localhost|169\.254\.169\.254', 0.85, "internal_ssrf"),
]

# Prompt Injection Fast Delimiter Patterns
PROMPT_INJECTION_FAST_PATTERNS = [
    (r'(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|prompts|rules)', 0.95, "override_instructions"),
    (r'(?:you\s+are\s+now|act\s+as|roleplay\s+as)\s+(?:DAN|jailbreak|unfiltered|an\s+AI\s+without\s+rules)', 0.95, "dan_jailbreak"),
    (r'\[SYSTEM\s*PROMPT\]|\<system\>|\[INST\]|```system', 0.90, "system_tag_injection"),
    (r'(?:reveal|show|print|display|output)\s+(?:your\s+)?(?:system\s+prompt|instructions|initial\s+prompt)', 0.85, "prompt_exfiltration"),
    (r'(?:override\s+mode|developer\s+mode|god\s+mode|sudo\s+mode)\s+(?:enabled|activated|on)', 0.90, "mode_override"),
]

def scan_fast_patterns(text: str) -> List[Dict[str, Any]]:
    """Scans input text for command injection, SSRF, and fast prompt injection patterns."""
    hits = []
    text_lower = text.lower()
    
    # 1. Command injection
    for pattern, score, name in COMMAND_INJECTION_PATTERNS:
        if re.search(pattern, text_lower, re.IGNORECASE):
            hits.append({"category": "command_injection", "name": name, "score": score})
            
    # 2. Prompt injection fast patterns
    for pattern, score, name in PROMPT_INJECTION_FAST_PATTERNS:
        if re.search(pattern, text_lower, re.IGNORECASE):
            hits.append({"category": "prompt_injection", "name": name, "score": score})
            
    return hits
