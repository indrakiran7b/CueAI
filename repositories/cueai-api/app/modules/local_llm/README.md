# Local LLM

`tools/qwen-vl/` is a **local inference sidecar** (Qwen2.5-VL) for screen analysis.
It is not a fine-tuning or training pipeline.

Electron may start the sidecar (`qwen-vl-sidecar.ts`). The Next server calls it via `CUEAI_QWEN_VL_URL`.

A future admin "Train with Local LLM" feature should live beside this module and must not be described as training unless a training job is actually implemented.
