"""Local Qwen2.5-VL-3B-Instruct sidecar for CueAI Screen analysis."""

from __future__ import annotations

import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# Xet transfers often stall on Windows with 0-byte incomplete shards.
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = Path(os.environ.get("CUEAI_QWEN_VL_DIR", ROOT / ".models" / "Qwen2.5-VL-3B-Instruct"))
HOST = os.environ.get("CUEAI_QWEN_VL_HOST", "127.0.0.1")
PORT = int(os.environ.get("CUEAI_QWEN_VL_PORT", "39292"))
REPO_ID = "Qwen/Qwen2.5-VL-3B-Instruct"
EXPECTED_WEIGHTS = {
    "model-00001-of-00002.safetensors": 3_982_649_232,
    "model-00002-of-00002.safetensors": 3_526_688_744,
}

_lock = threading.RLock()
_state = {
    "ready": False,
    "loading": False,
    "error": None,
    "device": "unknown",
}
_model = None
_processor = None


def _weight_progress() -> tuple[int, int]:
    need = sum(EXPECTED_WEIGHTS.values())
    have = 0
    for name, size in EXPECTED_WEIGHTS.items():
        path = MODEL_DIR / name
        if path.exists():
            have += min(path.stat().st_size, size)
    return have, need


def _model_present() -> bool:
    if not MODEL_DIR.exists():
        return False
    for name, size in EXPECTED_WEIGHTS.items():
        path = MODEL_DIR / name
        if not path.exists() or path.stat().st_size < size:
            return False
    return True


def load_model() -> None:
    global _model, _processor
    if _state["ready"]:
        return
    with _lock:
        if _state["ready"]:
            return
        _state["loading"] = True
        _state["error"] = None
        try:
            if not _model_present():
                from huggingface_hub import snapshot_download

                MODEL_DIR.mkdir(parents=True, exist_ok=True)
                snapshot_download(
                    repo_id=REPO_ID,
                    local_dir=str(MODEL_DIR),
                )

            import torch
            from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration

            device = "cuda" if torch.cuda.is_available() else "cpu"
            dtype = torch.float16 if device == "cuda" else torch.float32
            max_memory = {0: "3.2GiB", "cpu": "18GiB"} if device == "cuda" else None

            _processor = AutoProcessor.from_pretrained(
                str(MODEL_DIR),
                min_pixels=256 * 28 * 28,
                max_pixels=768 * 28 * 28,
            )
            _model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
                str(MODEL_DIR),
                torch_dtype=dtype,
                device_map="auto" if device == "cuda" else "cpu",
                max_memory=max_memory,
                low_cpu_mem_usage=True,
            )
            _state["device"] = device
            _state["ready"] = True
        except Exception as err:  # noqa: BLE001
            _state["error"] = str(err)
            raise
        finally:
            _state["loading"] = False


def analyze(image: str, prompt: str, session_context: str = "") -> str:
    load_model()
    from qwen_vl_utils import process_vision_info

    briefing = (session_context or "").strip()
    user_text = "\n".join(
        [
            "You are CueAI, a live interview copilot. The user will say your answer out loud.",
            "Reply in this exact shape:",
            "On screen: <one or two sentences about what is actually visible>",
            "Say: <first-person interview-ready answer, or the next thing to say/do>",
            "Keep it under 120 words. No preamble.",
            f"SESSION BRIEFING:\n{briefing}" if briefing else "",
            prompt.strip() or "What is happening on this screen? Give an interview-ready answer.",
        ]
    ).strip()

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": user_text},
            ],
        }
    ]
    text = _processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    image_inputs, video_inputs = process_vision_info(messages)
    inputs = _processor(
        text=[text],
        images=image_inputs,
        videos=video_inputs,
        padding=True,
        return_tensors="pt",
    )
    target = next(_model.parameters()).device
    inputs = inputs.to(target)
    generated = _model.generate(**inputs, max_new_tokens=220)
    trimmed = [out[len(inp) :] for inp, out in zip(inputs.input_ids, generated)]
    decoded = _processor.batch_decode(trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False)
    return (decoded[0] if decoded else "").strip()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        sys.stderr.write("qwen-vl: " + (fmt % args) + "\n")

    def _send(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path.rstrip("/") != "/status":
            self._send(404, {"ok": False, "error": "not found"})
            return
        have, need = _weight_progress()
        self._send(
            200,
            {
                "ok": True,
                "ready": _state["ready"],
                "loading": _state["loading"],
                "downloaded": _model_present(),
                "downloadedBytes": have,
                "totalBytes": need,
                "device": _state["device"],
                "error": _state["error"],
                "model": REPO_ID,
            },
        )

    def do_POST(self) -> None:  # noqa: N802
        if self.path.rstrip("/") != "/analyze":
            self._send(404, {"ok": False, "error": "not found"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._send(400, {"ok": False, "error": "invalid json"})
            return
        image = str(body.get("image") or "").strip()
        prompt = str(body.get("prompt") or "").strip()
        session_context = str(body.get("sessionContext") or "")
        if not image.startswith("data:image"):
            self._send(400, {"ok": False, "error": "image data URL is required"})
            return
        try:
            with _lock:
                answer = analyze(image, prompt, session_context)
            self._send(
                200,
                {
                    "ok": True,
                    "answer": answer,
                    "confidence": 0.78,
                    "model": REPO_ID,
                    "provider": "qwen",
                },
            )
        except Exception as err:  # noqa: BLE001
            self._send(503, {"ok": False, "error": str(err)})


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"CueAI Qwen-VL listening on http://{HOST}:{PORT}", flush=True)
    threading.Thread(target=load_model, daemon=True).start()
    server.serve_forever()


if __name__ == "__main__":
    main()
