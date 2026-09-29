"""Download Qwen/Qwen2.5-VL-3B-Instruct into the repo .models folder."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

# Xet transfers often stall on Windows with 0-byte incomplete shards.
os.environ["HF_HUB_DISABLE_XET"] = "1"

from huggingface_hub import snapshot_download

REPO_ID = "Qwen/Qwen2.5-VL-3B-Instruct"
ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / ".models" / "Qwen2.5-VL-3B-Instruct"
WEIGHTS = {
    "model-00001-of-00002.safetensors": 3_982_649_232,
    "model-00002-of-00002.safetensors": 3_526_688_744,
}


def _have(name: str, size: int) -> bool:
    path = DEST / name
    return path.exists() and path.stat().st_size >= size


def _download_weight(name: str, size: int) -> None:
    dest = DEST / name
    if _have(name, size):
        print(f"Already have {name}", flush=True)
        return
    url = f"https://huggingface.co/{REPO_ID}/resolve/main/{name}?download=true"
    curl = shutil.which("curl") or shutil.which("curl.exe")
    if not curl:
        from huggingface_hub import hf_hub_download

        print(f"Downloading {name} via huggingface_hub...", flush=True)
        hf_hub_download(repo_id=REPO_ID, filename=name, local_dir=str(DEST))
        return
    print(f"Downloading {name} (resume-safe)...", flush=True)
    subprocess.check_call(
        [
            curl,
            "-L",
            "--retry",
            "20",
            "--retry-all-errors",
            "--retry-delay",
            "3",
            "-C",
            "-",
            "--http1.1",
            "-o",
            str(dest),
            url,
        ]
    )


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {REPO_ID} -> {DEST}", flush=True)
    snapshot_download(
        repo_id=REPO_ID,
        local_dir=str(DEST),
        ignore_patterns=["*.safetensors"],
    )
    for name, size in WEIGHTS.items():
        _download_weight(name, size)
        if not _have(name, size):
            raise SystemExit(f"Incomplete download: {name}")
    print("Download complete.", flush=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
