"""
Download legal PDFs (from the law manifests) into the Documents folder, so they become
REAL uploaded documents in the Document Management UI (physical file + extractable text
+ previewable), then embeddable via the UI (Add to Database -> Bulk Embed).

This is the demo-through-UI path for PDFs: fetch the official-law PDFs to the docs folder;
the app's /physical-files scan + /bulk-add-to-database + /bulk-embed do the rest.

Usage:
  python scripts/download_manifest_pdfs.py <docs_dir> [manifest.json ...]
  (defaults: docs_dir from DOCS_DIR env or ../docs ; manifests = the uae_laws_* + tax_all)

Idempotent: skips files already present. Verifies the download is really a PDF.
"""
import os, sys, json, re, time
from pathlib import Path
import requests
import urllib3
urllib3.disable_warnings()  # some gov hosts have expired certs (verify=False fallback)

HERE = Path(__file__).resolve().parent
DOCS_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(os.environ.get("DOCS_DIR", HERE.parents[2] / "docs"))
MANIFESTS = [Path(a) for a in sys.argv[2:]] or [
    HERE / "uae_laws_manifest.json", HERE / "uae_laws_batch2.json",
    HERE / "uae_laws_batch3.json", HERE / "tax_all.json",
]
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
LIMIT = int(os.environ.get("PDF_LIMIT", "0"))  # 0 = no limit


def sanitize(name: str) -> str:
    n = re.sub(r"[^\w\s.\-()]", "", name or "").strip()
    n = re.sub(r"\s+", "_", n)[:130]
    return n or "law"


def fetch(url: str) -> bytes | None:
    for verify in (True, False):
        try:
            r = requests.get(url, headers={"User-Agent": UA}, timeout=60, verify=verify, allow_redirects=True)
            if r.status_code == 200 and (r.content[:4] == b"%PDF" or "pdf" in r.headers.get("content-type", "").lower()):
                return r.content
            return None
        except requests.exceptions.SSLError:
            continue
        except Exception:
            return None
    return None


def main():
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"docs_dir = {DOCS_DIR}")
    ok = skip = fail = 0
    seen_urls = set()
    for mf in MANIFESTS:
        if not mf.exists():
            print(f"  (manifest missing: {mf})"); continue
        try:
            laws = json.loads(mf.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  (bad manifest {mf.name}: {e})"); continue
        print(f"== {mf.name}: {len(laws)} entries ==")
        for law in laws:
            if LIMIT and ok >= LIMIT:
                break
            url = (law.get("url") or "").strip()
            name = law.get("name") or url
            lang = (law.get("lang") or "en").lower()
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            dest = DOCS_DIR / (sanitize(f"{name}_{lang}") + ".pdf")
            if dest.exists():
                skip += 1; continue
            data = fetch(url)
            if data:
                dest.write_bytes(data); ok += 1
                print(f"  [ok] {dest.name} ({len(data)//1024}KB)", flush=True)
            else:
                fail += 1
                print(f"  [fail] {name[:60]}", flush=True)
            time.sleep(0.3)
    print(f"\nDONE: downloaded={ok} skipped={skip} failed={fail}  -> {DOCS_DIR}")


if __name__ == "__main__":
    main()
