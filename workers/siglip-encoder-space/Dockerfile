FROM python:3.11-slim

WORKDIR /code

ENV HF_HOME=/code/.cache/huggingface \
    TRANSFORMERS_CACHE=/code/.cache/huggingface \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

# HF Spaces requires the app to listen on $PORT (default 7860)
ENV PORT=7860
EXPOSE 7860

# Pre-download the model so first request after restart is faster
RUN python -c "from transformers import AutoTokenizer, AutoModel; \
    AutoTokenizer.from_pretrained('google/siglip-base-patch16-224'); \
    AutoModel.from_pretrained('google/siglip-base-patch16-224')"

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
