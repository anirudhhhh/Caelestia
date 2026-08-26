"""
ControlPlane.ai — Layer 3 Attack Corpus Vector Store & Semantic Similarity Engine

Maintains a 384-dimensional vector embedding corpus of seed attack patterns and
dynamically ingested human review attack resolutions.
Performs fast cosine similarity search to detect novel jailbreaks & prompt injections.
"""

import math
import re
import time
from typing import List, Dict, Any, Tuple, Optional
from services.guardrails_ml.seed_attacks import SEED_ATTACK_PATTERNS

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

try:
    from transformers import AutoTokenizer, AutoModel
    import torch
    HAS_TRANSFORMERS = True
except ImportError:
    HAS_TRANSFORMERS = False

class VectorStoreEngine:
    """Semantic vector similarity store for attack pattern detection."""

    def __init__(self):
        self.corpus: List[Dict[str, Any]] = []
        self.tokenizer = None
        self.model = None
        self.dimension = 384
        self._initialize_model()
        self._seed_corpus()

    def _initialize_model(self):
        """Initializes fast embedding model if PyTorch & Transformers are available."""
        if HAS_TRANSFORMERS:
            try:
                # Use fast lightweight embedding model
                model_name = "sentence-transformers/all-MiniLM-L6-v2"
                self.tokenizer = AutoTokenizer.from_pretrained(model_name)
                self.model = AutoModel.from_pretrained(model_name)
                self.model.eval()
            except Exception:
                # Fallback to TF-IDF / Neural Heuristic Embedding Generator if offline/no download
                self.tokenizer = None
                self.model = None

    def _compute_embedding(self, text: str) -> List[float]:
        """Computes 384-dimensional normalized embedding for text."""
        if self.model and self.tokenizer and HAS_TRANSFORMERS:
            try:
                inputs = self.tokenizer(text, padding=True, truncation=True, max_length=256, return_tensors="pt")
                with torch.no_grad():
                    outputs = self.model(**inputs)
                    # Mean pooling over token embeddings
                    embeddings = outputs.last_hidden_state.mean(dim=1).squeeze().numpy()
                    norm = np.linalg.norm(embeddings)
                    if norm > 0:
                        embeddings = embeddings / norm
                    return embeddings.tolist()
            except Exception:
                pass

        # Robust Fallback: Feature-rich TF-IDF N-gram hashing vectorizer (384-d)
        vec = [0.0] * self.dimension
        words = re.findall(r'\b\w+\b', text.lower())
        if not words:
            return vec

        for idx, word in enumerate(words):
            # Compute hash bucket for word and bigrams
            h = hash(word) % self.dimension
            vec[h] += 1.0
            if idx > 0:
                bigram = f"{words[idx-1]}_{word}"
                h2 = hash(bigram) % self.dimension
                vec[h2] += 1.5

        # Normalize L2 norm
        norm = math.sqrt(sum(v * v for v in vec))
        if norm > 0:
            vec = [v / norm for v in vec]
        return vec

    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculates cosine similarity between two 384-d vectors."""
        if HAS_NUMPY:
            v1 = np.array(vec1)
            v2 = np.array(vec2)
            dot = np.dot(v1, v2)
            n1 = np.linalg.norm(v1)
            n2 = np.linalg.norm(v2)
            if n1 > 0 and n2 > 0:
                return float(dot / (n1 * n2))
            return 0.0

        dot = sum(a * b for a, b in zip(vec1, vec2))
        n1 = math.sqrt(sum(a * a for a in vec1))
        n2 = math.sqrt(sum(b * b for b in vec2))
        if n1 > 0 and n2 > 0:
            return dot / (n1 * n2)
        return 0.0

    def _seed_corpus(self):
        """Seeds multi-corpus vector index with initial pattern templates."""
        # 1. Attack / Injection Corpus
        for item in SEED_ATTACK_PATTERNS:
            vec = self._compute_embedding(item["text"])
            self.corpus.append({
                "id": item["id"],
                "source": "seed_dataset",
                "pattern_type": item["pattern_type"],
                "text": item["text"],
                "embedding": vec
            })

        # 2. Toxicity Vector Corpus
        self.toxicity_corpus = []
        seed_toxic = [
            ("tox_1", "toxicity", "You are a parasite, waste of space, go end your life"),
            ("tox_2", "toxicity", "I hate your kind, people like you shouldn't be allowed to live"),
            ("tox_3", "toxicity", "Shut up you useless piece of trash, nobody cares about you"),
            ("tox_4", "toxicity", "I will track you down and hurt you severely")
        ]
        for tid, ptype, text in seed_toxic:
            self.toxicity_corpus.append({
                "id": tid, "pattern_type": ptype, "text": text, "embedding": self._compute_embedding(text)
            })

        # 3. Secrets & Credential Vector Corpus
        self.secrets_corpus = []
        seed_secrets = [
            ("sec_1", "api_key", "AKIAIOSFODNN7EXAMPLE secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"),
            ("sec_2", "private_key", "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Z3\n-----END RSA PRIVATE KEY-----"),
            ("sec_3", "db_uri", "postgres://admin:Password123!@db.internal.corp:5432/production"),
            ("sec_4", "token", "bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0")
        ]
        for sid, ptype, text in seed_secrets:
            self.secrets_corpus.append({
                "id": sid, "pattern_type": ptype, "text": text, "embedding": self._compute_embedding(text)
            })

        # 4. Policy & Compliance Violation Vector Corpus
        self.policy_corpus = []
        seed_policy = [
            ("pol_1", "data_leak", "Disclose unannounced financial results and internal earnings report before Q4 release"),
            ("pol_2", "compliance", "Bypass GDPR consent rules and export user personal data without user permission"),
            ("pol_3", "confidentiality", "Share proprietary source code, trade secrets, and internal employee salary database")
        ]
        for pid, ptype, text in seed_policy:
            self.policy_corpus.append({
                "id": pid, "pattern_type": ptype, "text": text, "embedding": self._compute_embedding(text)
            })

    def add_attack_pattern(self, text: str, pattern_type: str = "confirmed_review", source: str = "human_review") -> Dict[str, Any]:
        """Adds a confirmed true-positive attack pattern to the living corpus."""
        vec = self._compute_embedding(text)
        item_id = f"custom_{len(self.corpus) + 1}_{int(time.time())}"
        entry = {
            "id": item_id,
            "source": source,
            "pattern_type": pattern_type,
            "text": text,
            "embedding": vec
        }
        self.corpus.append(entry)
        return {"status": "added", "id": item_id, "corpus_size": len(self.corpus)}

    def search_similar_attacks(self, query_text: str, top_k: int = 3) -> Dict[str, Any]:
        """Executes fast cosine similarity search over attack corpus."""
        return self._search_vector_corpus(self.corpus, query_text, top_k)

    def search_similar_toxicity(self, query_text: str, top_k: int = 3) -> Dict[str, Any]:
        """Executes fast cosine similarity search over toxicity vector corpus."""
        return self._search_vector_corpus(self.toxicity_corpus, query_text, top_k)

    def search_similar_secrets(self, query_text: str, top_k: int = 3) -> Dict[str, Any]:
        """Executes fast cosine similarity search over secrets & credentials vector corpus."""
        return self._search_vector_corpus(self.secrets_corpus, query_text, top_k)

    def search_similar_policy(self, query_text: str, top_k: int = 3) -> Dict[str, Any]:
        """Executes fast cosine similarity search over compliance policy vector corpus."""
        return self._search_vector_corpus(self.policy_corpus, query_text, top_k)

    def _search_vector_corpus(self, target_corpus: List[Dict[str, Any]], query_text: str, top_k: int = 3) -> Dict[str, Any]:
        start = time.time()
        query_vec = self._compute_embedding(query_text)
        
        matches = []
        for item in target_corpus:
            sim = self._cosine_similarity(query_vec, item["embedding"])
            matches.append((sim, item))

        matches.sort(key=lambda x: x[0], reverse=True)
        top_matches = matches[:top_k]

        max_sim = top_matches[0][0] if top_matches else 0.0
        best_match = top_matches[0][1] if top_matches else None

        latency_ms = (time.time() - start) * 1000

        return {
            "max_similarity": round(float(max_sim), 4),
            "top_match": {
                "id": best_match["id"],
                "pattern_type": best_match["pattern_type"],
                "text": best_match["text"]
            } if best_match else None,
            "latency_ms": latency_ms,
            "total_corpus_size": len(target_corpus)
        }

# Global singleton instance
_VECTOR_STORE_INSTANCE: Optional[VectorStoreEngine] = None

def get_vector_store() -> VectorStoreEngine:
    global _VECTOR_STORE_INSTANCE
    if _VECTOR_STORE_INSTANCE is None:
        _VECTOR_STORE_INSTANCE = VectorStoreEngine()
    return _VECTOR_STORE_INSTANCE
