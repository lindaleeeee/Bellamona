const { GoogleGenerativeAI } = require('@google/generative-ai');

// Google이 모델을 자꾸 단종시켜서(1.5-flash → 2.5-flash도 "new users에게 더 이상 제공 안 함" 404)
// 매번 코드를 고쳐 배포해야 하는 문제를 근본적으로 없애기 위해, 후보 모델을 순서대로 시도한다.
// "-latest" 별칭은 Google이 현재 권장하는 모델을 자동으로 가리키므로 가장 먼저 시도한다.
const MODEL_CANDIDATES = [
    'gemini-flash-latest',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-flash',
    'gemini-pro-latest',
    'gemini-1.5-flash',
];

// 모델이 없거나(404) 이 계정/키에서 더 이상 지원되지 않는다는 에러일 때만 다음 후보로 넘어간다.
// 그 외의 에러(키 무효, 네트워크 등)는 재시도해도 어차피 실패하므로 바로 던진다.
function isModelUnavailableError(error) {
    const status = error?.status;
    const msg = (error?.message || '').toLowerCase();
    return status === 404 || msg.includes('not found') || msg.includes('no longer available') || msg.includes('is not found for api version');
}

/**
 * 후보 모델을 순서대로 시도해 첫 성공 응답의 텍스트를 반환한다.
 * 실패 시 어떤 모델까지 시도했고 마지막 에러가 무엇인지 로그로 남긴다.
 * @param {string} apiKey
 * @param {string|Array} promptOrParts 텍스트 프롬프트 또는 멀티모달 parts 배열
 *   (예: [{text:'...'}, {inlineData:{mimeType:'image/jpeg', data: base64}}]) — 사진 식단 인식에 사용
 * @param {string} tag 로그 접두사 (예: '[REPORT]')
 * @param {object} [generationConfig] 예: { maxOutputTokens: 800 } — 응답 토큰 상한을 걸어서
 *   호출당 비용 상한을 고정한다(응답이 너무 길어져 비용이 들쭉날쭉해지는 걸 방지).
 */
async function generateWithFallback(apiKey, promptOrParts, tag, generationConfig) {
    const genAI = new GoogleGenerativeAI(apiKey);
    let lastError = null;
    for (const modelName of MODEL_CANDIDATES) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName, generationConfig });
            const result = await model.generateContent(promptOrParts);
            console.log(`${tag} Gemini 호출 성공 (모델: ${modelName})`);
            return { text: result.response.text(), modelUsed: modelName };
        } catch (error) {
            lastError = error;
            if (isModelUnavailableError(error)) {
                console.warn(`${tag} 모델 "${modelName}" 사용 불가(${error?.status || ''}), 다음 후보로 재시도:`, error?.message);
                continue;
            }
            // 모델 문제가 아닌 다른 에러(키/네트워크 등)는 후보를 더 시도해도 소용없으니 바로 던진다
            throw error;
        }
    }
    throw lastError || new Error('No Gemini model candidates succeeded');
}

module.exports = { generateWithFallback, MODEL_CANDIDATES };
