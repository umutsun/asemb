"""
Ingest already-downloaded law PDFs into bookie_lsemb.unified_embeddings.

For laws behind a bot-wall (e.g. uaelegislation.gov.ae, which 403s httpx AND Playwright),
an external anti-bot service / harvest_headless.py fetches the PDFs first; this script then
ingests them from disk via ingest_uae_law.ingest_law(pdf_bytes=...). Additive + idempotent
per source_name; ingest_law quality-gates each (rejects <3000 chars / corrupt / wrong-language),
so a wrong/scanned file is skipped rather than polluting the corpus.

Usage:
  PYTHONUTF8=1 .venv/Scripts/python.exe scripts/ingest_local_pdfs.py <docs_dir> [manifest.json ...]
  (default manifest: scripts/uae_core_codes_manifest.json)

Each manifest item is {url, name, lang}. The PDF is looked up in <docs_dir> as
sanitize(f"{name}_{lang}").pdf (the download_manifest_pdfs.py naming); if absent, a direct
fetch is attempted (works only if this host isn't blocking the URL).
"""
import os, sys, re, json, asyncio
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import httpx
from ingest_uae_law import ingest_law  # noqa: E402

HERE = Path(__file__).resolve().parent
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")


def sanitize(name: str) -> str:
    n = re.sub(r"[^\w\s.\-()]", "", name or "").strip()
    n = re.sub(r"\s+", "_", n)[:130]
    return n or "law"


def local_bytes(docs: Path, name: str, lang: str):
    p = docs / (sanitize(f"{name}_{lang}") + ".pdf")
    if p.exists() and p.stat().st_size > 1000:
        return p.read_bytes()
    return None


def direct_fetch(url: str):
    try:
        r = httpx.get(url, follow_redirects=True, timeout=90, headers={"User-Agent": UA})
        if r.status_code == 200 and (r.content[:4] == b"%PDF" or "pdf" in r.headers.get("content-type", "").lower()):
            return r.content
    except Exception:
        pass
    return None


async def main():
    docs = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(os.environ.get("DOCS_DIR", HERE.parents[2] / "docs"))
    manifests = [Path(a) for a in sys.argv[2:]] or [HERE / "uae_core_codes_manifest.json"]
    print(f"docs_dir = {docs}")
    ing = miss = fail = 0
    for mf in manifests:
        if not mf.exists():
            print(f"  (manifest missing: {mf})")
            continue
        laws = json.loads(mf.read_text(encoding="utf-8"))
        print(f"== {mf.name}: {len(laws)} entries ==")
        for law in laws:
            url = (law.get("url") or "").strip()
            name = law.get("name") or url
            lang = (law.get("lang") or "en").lower()
            data = local_bytes(docs, name, lang) or direct_fetch(url)
            if not data:
                miss += 1
                print(f"  [missing] {name[:70]} (no local {sanitize(name + '_' + lang)}.pdf; direct fetch failed)")
                continue
            try:
                n = await ingest_law(url, name, lang, prove=False, pdf_bytes=data)
                if n > 0:
                    ing += 1
                    print(f"  [ingested] {name[:70]} -> {n} chunks")
                else:
                    fail += 1
                    print(f"  [rejected by quality gate] {name[:70]}")
            except Exception as e:
                fail += 1
                print(f"  [error] {name[:60]}: {type(e).__name__}: {str(e)[:120]}")
    print(f"\nDONE: ingested={ing} missing={miss} failed/rejected={fail}")


if __name__ == "__main__":
    asyncio.run(main())
