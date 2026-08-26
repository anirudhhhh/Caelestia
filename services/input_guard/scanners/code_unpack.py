"""
ControlPlane.ai — AST-Aware Code Normalizer & Secret Unpacker (§3.2)

Parses code input to statically unpack string concatenations,
hex/base64 decodes, and chr() character arrays to detect programmatically
constructed secrets before runtime execution.
"""

import ast
import base64
import re
from typing import List, Tuple, Optional


def is_likely_code(text: str) -> bool:
    """Heuristic check if input text contains programming language constructs or string construction."""
    if '+' in text or '=' in text or '(' in text or '{' in text or ';' in text:
        return True
    code_indicators = [
        r'\bdef\s+\w+\s*\(', r'\bclass\s+\w+', r'\bimport\s+\w+',
        r'\bfrom\s+\w+\s+import', r'\bconst\s+\w+\s*=', r'\blet\s+\w+\s*=',
        r'\bvar\s+\w+\s*=', r'\bfunction\s+\w+\s*\(', r'\bbytes\.fromhex\(',
        r'\bbase64\.b64decode\(', r'[\{\}\[\];]{2,}', r'->\s*\w+:',
        r'#include\s+<', r'public\s+static\s+void', r'\w+\s*='
    ]
    for pattern in code_indicators:
        if re.search(pattern, text):
            return True
    return False


def unpack_code_strings(code_text: str, max_depth: int = 1) -> List[str]:
    """
    Extracts statically constructed strings from code using Python AST.
    Folds string concatenations, bytes.fromhex, chr() arrays, and base64.
    """
    extracted_strings = []
    
    # 1. Try Python AST parsing
    try:
        tree = ast.parse(code_text)
        
        class StringUnpackVisitor(ast.NodeVisitor):
            def visit_BinOp(self, node):
                # Unpack string concatenation: "sk-" + "proj-12345"
                if isinstance(node.op, ast.Add):
                    val = self._eval_concat(node)
                    if val and len(val) >= 16:
                        extracted_strings.append(val)
                self.generic_visit(node)

            def visit_Call(self, node):
                # Unpack bytes.fromhex('736b2d...')
                if isinstance(node.func, ast.Attribute) and node.func.attr == "fromhex":
                    if node.args and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str):
                        try:
                            decoded = bytes.fromhex(node.args[0].value).decode("utf-8", errors="ignore")
                            if len(decoded) >= 12:
                                extracted_strings.append(decoded)
                        except Exception:
                            pass

                # Unpack "".join([chr(115), chr(107)...])
                elif isinstance(node.func, ast.Attribute) and node.func.attr == "join":
                    if node.args and isinstance(node.args[0], ast.List):
                        chars = []
                        for el in node.args[0].elts:
                            if isinstance(el, ast.Call) and getattr(el.func, "id", "") == "chr":
                                if el.args and isinstance(el.args[0], ast.Constant) and isinstance(el.args[0].value, int):
                                    chars.append(chr(el.args[0].value))
                        if chars:
                            assembled = "".join(chars)
                            if len(assembled) >= 12:
                                extracted_strings.append(assembled)

                # Unpack base64.b64decode('...')
                elif isinstance(node.func, ast.Attribute) and "b64decode" in node.func.attr:
                    if node.args and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str):
                        try:
                            decoded = base64.b64decode(node.args[0].value).decode("utf-8", errors="ignore")
                            if len(decoded) >= 12:
                                extracted_strings.append(decoded)
                        except Exception:
                            pass

                self.generic_visit(node)

            def _eval_concat(self, node) -> Optional[str]:
                if isinstance(node, ast.Constant) and isinstance(node.value, str):
                    return node.value
                elif isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
                    left = self._eval_concat(node.left)
                    right = self._eval_concat(node.right)
                    if left is not None and right is not None:
                        return left + right
                return None

        visitor = StringUnpackVisitor()
        visitor.visit(tree)
    except Exception:
        pass

    # 2. General Regex Fallbacks for Javascript / Go / other language string concatenations
    js_concat = re.findall(r'["\']([a-zA-Z0-9_\-]{4,})["\']\s*\+\s*["\']([a-zA-Z0-9_\-]{4,})["\']', code_text)
    for part1, part2 in js_concat:
        combined = part1 + part2
        if len(combined) >= 16:
            extracted_strings.append(combined)

    # Base64 string extraction
    b64_matches = re.findall(r'(?:atob|b64decode|FromBase64String)\s*\(\s*["\']([A-Za-z0-9+/=]{20,})["\']\s*\)', code_text)
    for b64_str in b64_matches:
        try:
            decoded = base64.b64decode(b64_str).decode("utf-8", errors="ignore")
            if len(decoded) >= 12:
                extracted_strings.append(decoded)
        except Exception:
            pass

    return list(set(extracted_strings))
