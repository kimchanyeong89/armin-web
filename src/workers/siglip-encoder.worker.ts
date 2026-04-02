/**
 * SigLIP 텍스트 인코더 Web Worker
 *
 * @huggingface/transformers 를 사용해 브라우저 WASM에서 직접 실행.
 * 서버 불필요, 비용 0, 모델은 첫 로드 후 브라우저에 캐시됨.
 *
 * 모델: Xenova/siglip-base-patch16-224 (text encoder, q8 quantized ~70MB)
 * 출력: 768D L2-normalized vector (이미지 임베딩과 동일 공간)
 */

import { AutoTokenizer, SiglipTextModel } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/siglip-base-patch16-224';
const VECTOR_DIM = 768;

let tokenizer: any = null;
let model: any = null;
let loadPromise: Promise<void> | null = null;

function l2normalize(arr: Float32Array): number[] {
    let norm = 0;
    for (let i = 0; i < arr.length; i++) norm += arr[i] * arr[i];
    norm = Math.sqrt(norm);
    if (norm === 0) return Array.from(arr);
    const result = new Array<number>(arr.length);
    for (let i = 0; i < arr.length; i++) result[i] = arr[i] / norm;
    return result;
}

async function loadModel(): Promise<void> {
    if (tokenizer && model) return;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
        self.postMessage({ type: 'status', status: 'loading' });
        try {
            tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
            model = await SiglipTextModel.from_pretrained(MODEL_ID, {
                dtype: 'q8',
            } as any);
            self.postMessage({ type: 'status', status: 'ready' });
        } catch (err) {
            self.postMessage({ type: 'status', status: 'error', error: String(err) });
            loadPromise = null; // retry 허용
            throw err;
        }
    })();

    return loadPromise;
}

// Worker 시작 즉시 모델 로드 시작 (백그라운드 프리로드)
loadModel().catch(() => {});

self.addEventListener('message', async (e: MessageEvent) => {
    const { id, text } = e.data;
    if (!id || typeof text !== 'string') return;

    try {
        await loadModel();

        const inputs = tokenizer(text, {
            padding: 'max_length',
            truncation: true,
            max_length: 64,
        });

        const outputs = await model(inputs);

        // SiglipTextModel → pooler_output: [1, 768]
        const raw: Float32Array = outputs.pooler_output?.data;
        if (!raw || raw.length !== VECTOR_DIM) {
            throw new Error(`Unexpected dim: ${raw?.length ?? 'null'} (expected ${VECTOR_DIM})`);
        }

        const vector = l2normalize(raw);
        self.postMessage({ id, vector });
    } catch (err) {
        self.postMessage({ id, error: String(err) });
    }
});
