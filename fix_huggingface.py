import requests

url = "https://router.huggingface.co/hf-inference/models/google/siglip-base-patch16-224"
try:
    resp = requests.post(url, json={"inputs": "low"})
    print(resp.status_code)
    print(resp.text[:200])
except Exception as e:
    print(e)
