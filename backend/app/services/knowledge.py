"""RAG — kho kiến thức thể hình/dinh dưỡng có trích nguồn.

Dữ liệu: backend/data/knowledge/*.md, mỗi đoạn ("chunk") bắt đầu bằng
    ## <id> | <tiêu đề>
    Nguồn: ...
    Từ khóa: ...
    <nội dung>

Tìm kiếm LAI (hybrid):
1. BM25 — tìm theo từ khoá, bỏ dấu tiếng Việt, dùng cả từ đơn và cụm 2 từ (vd "dau lung").
   Luôn chạy được, không cần API.
2. Vector — embedding ngữ nghĩa (mặc định Gemini gemini-embedding-001). Vector của các đoạn được tính
   sẵn bằng scripts/build_knowledge_index.py và lưu ở data/knowledge_index.json, nên lúc chạy chỉ cần
   embed câu hỏi (1 lượt gọi ~0,3 giây). Không có key/mạng → tự bỏ qua, chỉ dùng BM25.
3. Gộp 2 bảng xếp hạng bằng Reciprocal Rank Fusion (RRF).

Vì kho nhỏ (~70 đoạn), tính cosine bằng Python thuần là đủ nhanh; không cần cơ sở dữ liệu vector.
Khi kho lớn (hàng chục nghìn đoạn) có thể chuyển sang pgvector trên Postgres/Supabase.
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
import re
import time
from collections import Counter
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from ..config import DATA_DIR, get_settings

log = logging.getLogger("fitbro.rag")

KB_DIR = DATA_DIR / "knowledge"
INDEX_FILE = DATA_DIR / "knowledge_index.json"

_STOP = set("""la cua va co cho khi thi de duoc nhung cac mot nhu voi trong tren duoi ve tu den nay do ra vao
lai roi hay hoac neu ma con cung rat qua bao nhieu gi sao the nao toi minh ban em anh chi oi a nhe khong chua
da dang se nen can muon biet hoi vay thoi nua""".split())


def _fold(s: str) -> str:
    from ..agents.guard import _plain

    return _plain(s)


def tokenize(s: str) -> list[str]:
    words = [w for w in re.findall(r"[a-z0-9]+", _fold(s)) if w not in _STOP]
    return words + [f"{a}_{b}" for a, b in zip(words, words[1:])]


@dataclass
class Chunk:
    id: str
    title: str
    source: str
    keywords: str
    text: str
    file: str
    tokens: Counter = field(default_factory=Counter)
    length: int = 0

    @property
    def embed_text(self) -> str:
        return f"{self.title}\n{self.keywords}\n{self.text}"

    @property
    def hash(self) -> str:
        return hashlib.sha1(self.embed_text.encode("utf-8")).hexdigest()[:16]


def _parse(path: Path) -> list[Chunk]:
    out: list[Chunk] = []
    cur: dict | None = None
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^##\s+([a-z0-9-]+)\s*\|\s*(.+)$", line)
        if m:
            if cur:
                out.append(Chunk(**cur))
            cur = {"id": m.group(1), "title": m.group(2).strip(), "source": "", "keywords": "", "text": "", "file": path.name}
            continue
        if cur is None:
            continue
        if line.startswith("Nguồn:"):
            cur["source"] = line.split(":", 1)[1].strip()
        elif line.startswith("Từ khóa:"):
            cur["keywords"] = line.split(":", 1)[1].strip()
        elif line.strip():
            cur["text"] = (cur["text"] + " " + line.strip()).strip()
    if cur:
        out.append(Chunk(**cur))
    return out


class KnowledgeBase:
    def __init__(self, chunks: list[Chunk]):
        self.chunks = chunks
        self.by_id = {c.id: c for c in chunks}
        for c in chunks:
            # tiêu đề và từ khoá quan trọng hơn thân bài → nhân trọng số
            toks = tokenize(c.title) * 3 + tokenize(c.keywords) * 2 + tokenize(c.text)
            c.tokens = Counter(toks)
            c.length = len(toks)
        self.avgdl = sum(c.length for c in chunks) / max(len(chunks), 1)
        df: Counter = Counter()
        for c in chunks:
            df.update(set(c.tokens))
        n = len(chunks)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}
        self.vectors: dict[str, list[float]] = {}
        self.vector_model = ""
        self._load_vectors()

    # ---------- BM25 ----------
    def bm25(self, query: str, k1: float = 1.4, b: float = 0.75) -> list[tuple[Chunk, float]]:
        q = [t for t in tokenize(query) if t in self.idf]
        scored = []
        for c in self.chunks:
            s = 0.0
            for t in q:
                f = c.tokens.get(t, 0)
                if f:
                    s += self.idf[t] * f * (k1 + 1) / (f + k1 * (1 - b + b * c.length / self.avgdl))
            if s > 0:
                scored.append((c, s))
        return sorted(scored, key=lambda x: -x[1])

    # ---------- Vector ----------
    def _load_vectors(self) -> None:
        if not INDEX_FILE.exists():
            return
        try:
            data = json.loads(INDEX_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return
        self.vector_model = data.get("model", "")
        for cid, item in data.get("chunks", {}).items():
            c = self.by_id.get(cid)
            if c and item.get("hash") == c.hash:  # nội dung đổi mà chưa build lại → bỏ vector cũ
                self.vectors[cid] = _normalize(item["v"])

    def vector(self, qvec: list[float]) -> list[tuple[Chunk, float]]:
        q = _normalize(qvec)
        scored = [(self.by_id[cid], sum(a * b for a, b in zip(q, v))) for cid, v in self.vectors.items()]
        return sorted(scored, key=lambda x: -x[1])


def _normalize(v: list[float]) -> list[float]:
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


@lru_cache
def kb() -> KnowledgeBase:
    chunks: list[Chunk] = []
    for p in sorted(KB_DIR.glob("*.md")):
        chunks += _parse(p)
    return KnowledgeBase(chunks)


# ---------------------------------------------------------------------------
# Embedding (chuẩn OpenAI /embeddings)
# ---------------------------------------------------------------------------

_qcache: dict[str, list[float]] = {}
_clients: dict = {}
_embed_down_until = 0.0


def embed(texts: list[str], timeout: float = 8.0) -> list[list[float]] | None:
    """Gọi API embedding. Lỗi → None (hệ thống tự dùng BM25)."""
    global _embed_down_until
    s = get_settings()
    base, key = s.embedding_endpoint
    if not base or not key or time.time() < _embed_down_until:
        return None
    from openai import OpenAI

    try:
        if (base, key) not in _clients:  # giữ kết nối (TLS) để các lần sau nhanh hơn
            _clients[(base, key)] = OpenAI(api_key=key, base_url=base, max_retries=0)
        cl = _clients[(base, key)].with_options(timeout=timeout)
        kw = {"model": s.embedding_model, "input": texts}
        if s.embedding_dimensions:
            kw["dimensions"] = s.embedding_dimensions
        r = cl.embeddings.create(**kw)
        return [d.embedding for d in r.data]
    except Exception as e:  # mạng/hạn mức → nghỉ 2 phút rồi thử lại
        log.warning("Embedding lỗi (%s) → dùng BM25", type(e).__name__)
        _embed_down_until = time.time() + 120
        return None


def embed_query(q: str) -> list[float] | None:
    if q in _qcache:
        return _qcache[q]
    r = embed([q], timeout=6.0)
    if r:
        if len(_qcache) > 500:
            _qcache.clear()
        _qcache[q] = r[0]
        return r[0]
    return None


# ---------------------------------------------------------------------------
# Tìm kiếm lai
# ---------------------------------------------------------------------------


def search(query: str, limit: int = 4, mode: str = "hybrid", rrf_k: int = 60) -> dict:
    """mode: hybrid | bm25 | vector. Trả {method, results: [{id,title,source,text,score,bm25_rank,vector_rank}]}."""
    base = kb()
    bm = base.bm25(query) if mode in ("hybrid", "bm25") else []
    vec: list[tuple[Chunk, float]] = []
    if mode in ("hybrid", "vector") and base.vectors and get_settings().rag_enabled:
        qv = embed_query(query)
        if qv:
            vec = base.vector(qv)
    method = "hybrid" if bm and vec else ("vector" if vec else "bm25")

    fused: dict[str, float] = {}
    ranks: dict[str, dict] = {}
    for r, (c, _) in enumerate(bm[:30]):
        fused[c.id] = fused.get(c.id, 0) + 1 / (rrf_k + r + 1)
        ranks.setdefault(c.id, {})["bm25_rank"] = r + 1
    for r, (c, sim) in enumerate(vec[:30]):
        if sim < 0.35 and r > 2:  # đoạn quá xa nghĩa → bỏ
            continue
        fused[c.id] = fused.get(c.id, 0) + 1 / (rrf_k + r + 1)
        ranks.setdefault(c.id, {}).update(vector_rank=r + 1, similarity=round(sim, 3))
    top = sorted(fused.items(), key=lambda x: -x[1])[:limit]
    results = []
    for cid, sc in top:
        c = base.by_id[cid]
        results.append({"id": c.id, "title": c.title, "source": c.source, "text": c.text, "score": round(sc, 4), **ranks[cid]})
    return {"method": method, "results": results}
