"""Tính sẵn vector (embedding) cho kho kiến thức → data/knowledge_index.json.

Chạy lại mỗi khi sửa file trong data/knowledge/:
    python scripts/build_knowledge_index.py

Chỉ embed các đoạn mới hoặc đã đổi nội dung (so theo hash), đoạn cũ giữ nguyên vector.
Dùng EMBEDDING_* trong .env, mặc định là Gemini (gemini-embedding-001) qua key của nhà cung cấp thứ 2.
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(encoding="utf-8")

from app.config import get_settings  # noqa: E402
from app.services import knowledge  # noqa: E402


def main() -> None:
    s = get_settings()
    if not s.embedding_endpoint[0]:
        raise SystemExit("Chưa cấu hình embedding (EMBEDDING_BASE_URL/EMBEDDING_API_KEY hoặc SECONDARY_LLM_*).")
    kb = knowledge.kb()
    old = {}
    if knowledge.INDEX_FILE.exists():
        data = json.loads(knowledge.INDEX_FILE.read_text(encoding="utf-8"))
        if data.get("model") == s.embedding_model and data.get("dimensions") == s.embedding_dimensions:
            old = data.get("chunks", {})
    out, todo = {}, []
    for c in kb.chunks:
        if c.id in old and old[c.id].get("hash") == c.hash:
            out[c.id] = old[c.id]
        else:
            todo.append(c)
    print(f"{len(kb.chunks)} đoạn, cần embed {len(todo)}")
    for i in range(0, len(todo), 16):
        batch = todo[i:i + 16]
        vecs = None
        for attempt in range(4):
            vecs = knowledge.embed([c.embed_text for c in batch], timeout=60)
            if vecs:
                break
            knowledge._embed_down_until = 0
            time.sleep(5 * (attempt + 1))
        if not vecs:
            raise SystemExit("Không gọi được API embedding.")
        for c, v in zip(batch, vecs):
            out[c.id] = {"hash": c.hash, "v": [round(x, 5) for x in v]}
        print(f"  {min(i + 16, len(todo))}/{len(todo)}")
    knowledge.INDEX_FILE.write_text(json.dumps(
        {"model": s.embedding_model, "dimensions": s.embedding_dimensions, "chunks": out}, ensure_ascii=False), encoding="utf-8")
    print("Đã ghi", knowledge.INDEX_FILE)


if __name__ == "__main__":
    main()
