"""
Jina CLIP v2 텍스트 인코더만 ONNX export + INT8 동적 양자화.

출력:
  scripts/modal_embed/onnx_models/jina_text_fp32.onnx  (~600MB)
  scripts/modal_embed/onnx_models/jina_text_int8.onnx  (~150MB)  ← 호스팅용

실행:
  arch -arm64 /Library/Frameworks/Python.framework/Versions/3.10/bin/python3 \\
    scripts/modal_embed/onnx_export.py
"""
import os
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import time
import torch
from pathlib import Path
from transformers import AutoModel, AutoTokenizer
from onnxruntime.quantization import quantize_dynamic, QuantType

MODEL_ID = "jinaai/jina-clip-v2"
OUT_DIR = Path("scripts/modal_embed/onnx_models")
OUT_DIR.mkdir(parents=True, exist_ok=True)
FP32 = OUT_DIR / "jina_text_fp32.onnx"
INT8 = OUT_DIR / "jina_text_int8.onnx"

print(f"[1/4] Loading {MODEL_ID}...")
t0 = time.time()
model = AutoModel.from_pretrained(MODEL_ID, trust_remote_code=True).eval()
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)
print(f"  ✓ {time.time()-t0:.1f}s")

# Jina v2의 텍스트 path: encode_text(texts) — 내부에서 tokenize + text_model + projection + L2 norm
# encode_text를 그대로 wrap 못함 (string input). 토큰화는 외부, 그 다음 path만 export.

class TextEncoderWrapper(torch.nn.Module):
    """input_ids → 1024D L2-normalized vector.
    Jina v2 text_model (XLM-RoBERTa Flash)은 padding을 내부에서 처리하므로
    attention_mask가 별도 인자 필요 없음. get_text_features 흉내."""
    def __init__(self, jina_model):
        super().__init__()
        self.text_model = jina_model.text_model
        self.text_projection = jina_model.text_projection

    def forward(self, input_ids):
        x = self.text_model(x=input_ids)
        x = self.text_projection(x)
        return torch.nn.functional.normalize(x, p=2, dim=-1)


print("[2/4] Wrapping + ONNX export FP32...")
wrapper = TextEncoderWrapper(model).eval()

# Dummy input — pad_to_max_length 단순. Jina tokenizer max_length=512 권장.
sample = tokenizer(["고요한 풍경"], padding="max_length", truncation=True, max_length=64, return_tensors="pt")
with torch.no_grad():
    ref_vec = wrapper(sample["input_ids"])
print(f"  reference vector dim: {ref_vec.shape}, L2 norm: {ref_vec.norm(dim=-1).item():.4f}")

t0 = time.time()
# Legacy TorchScript-based exporter — torch.export(dynamo)는 Jina의 dynamic loop 처리 못함
torch.onnx.export(
    wrapper,
    (sample["input_ids"],),
    str(FP32),
    opset_version=17,
    input_names=["input_ids"],
    output_names=["text_embedding"],
    dynamic_axes={
        "input_ids": {0: "batch", 1: "seq"},
        "text_embedding": {0: "batch"},
    },
    do_constant_folding=True,
    dynamo=False,  # 옛 exporter 강제
)
print(f"  ✓ FP32 export {time.time()-t0:.1f}s  size: {FP32.stat().st_size/1024/1024:.1f}MB")

print("[3/4] INT8 dynamic quantization...")
t0 = time.time()
quantize_dynamic(
    model_input=str(FP32),
    model_output=str(INT8),
    weight_type=QuantType.QInt8,
)
print(f"  ✓ INT8 quantize {time.time()-t0:.1f}s  size: {INT8.stat().st_size/1024/1024:.1f}MB")

print("[4/4] Verify INT8 output vs original")
import onnxruntime as ort
sess = ort.InferenceSession(str(INT8), providers=["CPUExecutionProvider"])
inp = tokenizer(["고요한 풍경", "abstract painting", "추상화"], padding="max_length", truncation=True, max_length=64, return_tensors="np")
t0 = time.time()
out = sess.run(None, {"input_ids": inp["input_ids"]})[0]
dt = time.time() - t0
print(f"  3 queries inference: {dt*1000:.0f}ms = {dt*1000/3:.0f}ms/query")
print(f"  dim: {out.shape}, L2: {(out**2).sum(axis=-1)**0.5}")

# Compare with original PyTorch
with torch.no_grad():
    orig = wrapper(torch.tensor(inp["input_ids"]))
import numpy as np
cos = (out * orig.numpy()).sum(axis=-1)
print(f"  INT8 vs FP32 cosine similarity per query: {cos}")
print(f"  → 평균 유사도 {cos.mean():.4f} (1.0이 완벽, 0.99 이상이면 사실상 동일)")

print("\n✅ 완료")
print(f"  배포용 모델: {INT8}  ({INT8.stat().st_size/1024/1024:.1f}MB)")
