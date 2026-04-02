import requests
import json

URL = "https://armin-semantic-search.armin-art.workers.dev/check-ids"
payload = {"ids": ["allegory-of-monastic-life-uccello", "annunciation-allori-8662"]}

try:
    resp = requests.post(URL, json=payload, headers={"Content-Type": "application/json"})
    print("Status:", resp.status_code)
    print("Response:", resp.json())
except Exception as e:
    print("Error:", e)
