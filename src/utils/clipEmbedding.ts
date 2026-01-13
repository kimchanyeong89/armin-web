/**
 * 브라우저에서 CLIP 텍스트 임베딩 생성
 * Transformers.js - CLIPTextModelWithProjection 사용
 */

import { AutoTokenizer, CLIPTextModelWithProjection, env } from '@huggingface/transformers';

// 브라우저 캐시 사용
env.allowLocalModels = false;
env.useBrowserCache = true;

// 싱글톤
let tokenizer: any = null;
let textModel: any = null;
let isLoading = false;
let loadPromise: Promise<boolean> | null = null;

/**
 * CLIP 텍스트 인코더 초기화
 * 첫 호출 시 모델 다운로드 (~50MB)
 */
export async function initClipTextEncoder(): Promise<boolean> {
    if (tokenizer && textModel) return true;

    if (isLoading && loadPromise) {
        return loadPromise;
    }

    isLoading = true;

    loadPromise = (async () => {
        try {
            console.log('🔄 Loading CLIP text encoder...');

            // 토크나이저와 텍스트 모델을 별도로 로드
            const modelId = 'Xenova/clip-vit-base-patch32';

            tokenizer = await AutoTokenizer.from_pretrained(modelId);
            textModel = await CLIPTextModelWithProjection.from_pretrained(modelId);

            console.log('✅ CLIP text encoder loaded!');
            return true;
        } catch (error) {
            console.error('❌ Failed to load CLIP text encoder:', error);
            return false;
        } finally {
            isLoading = false;
        }
    })();

    return loadPromise;
}

/**
 * 텍스트를 CLIP 임베딩으로 변환 (512차원)
 */
export async function getTextEmbedding(text: string): Promise<number[] | null> {
    if (!tokenizer || !textModel) {
        const loaded = await initClipTextEncoder();
        if (!loaded) return null;
    }

    try {
        // 텍스트 토큰화
        const textInputs = tokenizer(text, { padding: true, truncation: true });

        // 텍스트 임베딩 생성
        const output = await textModel(textInputs);

        // text_embeds 추출 및 정규화
        const embeds = output.text_embeds;
        const data = embeds.data as Float32Array;

        // 정규화 (L2 norm)
        let norm = 0;
        for (let i = 0; i < data.length; i++) {
            norm += data[i] * data[i];
        }
        norm = Math.sqrt(norm);

        const normalized: number[] = [];
        for (let i = 0; i < data.length; i++) {
            normalized.push(data[i] / norm);
        }

        console.log(`Generated embedding: ${normalized.length} dimensions`);

        return normalized;
    } catch (error) {
        console.error('Failed to generate text embedding:', error);
        return null;
    }
}

/**
 * 모델 로딩 상태 확인
 */
export function isModelLoaded(): boolean {
    return !!tokenizer && !!textModel;
}

/**
 * 모델 로딩 중인지 확인
 */
export function isModelLoading(): boolean {
    return isLoading;
}
