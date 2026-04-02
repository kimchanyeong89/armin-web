import requests
import json
import os

HF_TOKEN = "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" # Fake token or you probably have one. Wait, let me just try the endpoint. It should give Auth error if token is wrong, but 404 if model endpoint is dead.

url = "https://router.huggingface.co/hf-inference/pipeline/feature-extraction/google/siglip-base-patch16-224"
try:
    resp = requests.post(url, json={"inputs": "low", "options": { "wait_for_model": True }})
    print(resp.status_code)
    print(resp.text[:200])
except Exception as e:
    print(e)
