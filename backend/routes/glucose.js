const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { generateWithFallback } = require('../geminiClient');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Auth middleware (report.js/data.js와 동일한 패턴)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);
    jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
        if (err) return res.sendStatus(403);
        try {
            const { rows } = await pool.query('SELECT deleted_at FROM users WHERE id = $1', [user.userId]);
            if (rows.length === 0 || rows[0].deleted_at) {
                console.warn('[GLUCOSE] 탈퇴한 계정의 접근 차단:', user.email);
                return res.status(403).json({ error: 'account_deleted' });
            }
        } catch (dbErr) {
            console.error('[GLUCOSE] deleted_at 확인 중 DB 오류:', dbErr);
            return res.sendStatus(500);
        }
        req.user = user;
        next();
    });
};

if (!process.env.GEMINI_API_KEY) console.error('[GLUCOSE] 부팅 경고: GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');

// 실패 원인을 로그에서 바로 알아볼 수 있도록 error 객체를 최대한 펼쳐서 찍는다 (report.js와 동일한 헬퍼)
function logGeminiError(tag, error) {
    console.error(`${tag} name:`, error?.name);
    console.error(`${tag} message:`, error?.message);
    if (error?.status) console.error(`${tag} status:`, error.status, error.statusText);
    if (error?.errorDetails) console.error(`${tag} errorDetails:`, JSON.stringify(error.errorDetails));
    if (error?.cause) console.error(`${tag} cause:`, error.cause);
    console.error(`${tag} stack:`, error?.stack);
}

// 호출당 비용을 예측 가능한 범위로 고정하기 위한 입력 크기 상한 — 식사 기록이 많이 쌓인 유저도
// 프롬프트에 실제로 들어가는 이력 건수/글자수가 무제한으로 커지지 않도록 잘라낸다.
const MAX_RECENT_MEALS = 15;
const MAX_TEXT_CHARS = 200;
function truncateStr(s, max) {
    if (typeof s !== 'string') return s;
    return s.length > max ? s.slice(0, max) + '…' : s;
}

// POST /api/glucose/predict
// 그램 단위 정확한 음식 검색 대신, 자유 텍스트 식단 설명 + 시간 + 최근 2주 식단/혈당/운동 이력을
// 근거로 이번 식사의 혈당 반응(ΔPeak, 신호등 레벨)을 추정한다. 매크로(탄수/단백/지방/GI)도 함께
// 추정해서 반환 — 프론트가 GMODEL(규칙기반/개인화) 계산과 대시보드 매크로 표시에 재사용한다.
router.post('/predict', authenticateToken, async (req, res) => {
    console.log('[GLUCOSE] POST /predict called by userId:', req.user?.userId);
    try {
        const { text, time, recentMeals, cyclePhase, workoutToday } = req.body;
        if (!text || !text.trim()) {
            return res.status(400).json({ success: false, error: 'No text provided' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error('[GLUCOSE] GEMINI_API_KEY not configured');
            return res.status(500).json({ success: false, error: 'API Key not configured' });
        }

        const prompt = `
당신은 PCOS(다낭성난소증후군) 여성을 위한 혈당 관리 앱의 예측 보조 도구입니다.
아래 "이번 식사" 설명(자유 텍스트, 그램 단위 아님)과 이 사용자의 최근 2주 식단·혈당·운동 이력을
참고하여, 이번 식사의 매크로 영양소를 추정하고 식후 혈당 반응을 예측해 주세요.
반드시 JSON 형식으로만 응답하십시오. 의학적 진단이나 치료 지시는 금지합니다.

이번 식사: "${truncateStr(text, MAX_TEXT_CHARS)}" (섭취 시간: ${time || '알 수 없음'})
생리주기 단계: ${cyclePhase || 'unknown'} (황체기는 인슐린 감수성이 낮아지는 경향 참고)
오늘 운동 기록: ${workoutToday && workoutToday.intensity ? `${workoutToday.intensity} 강도, ${workoutToday.durationMin}분` : '없음'}
최근 식단·혈당 이력 (텍스트, 시간, 실측 혈당이 있으면 함께): ${JSON.stringify((recentMeals || []).slice(-MAX_RECENT_MEALS).map(m => ({ ...m, text: truncateStr(m.text, 60) })))}

응답 JSON 형식:
{
  "carb_g": 45,
  "protein_g": 20,
  "fat_g": 12,
  "kcal_est": 420,
  "gi_estimate": 55,
  "deltaPeak": 48,
  "level": "low" | "medium" | "high",
  "rationale": "왜 이렇게 추정했는지 한 문장 (과거 비슷한 식사가 있었다면 그것도 언급)"
}
`;

        console.log('[GLUCOSE] Calling Gemini API, prompt length:', prompt.length);
        // maxOutputTokens로 응답 상한 고정 — 이 스키마는 짧은 JSON이라 300 토큰이면 충분히 여유있음
        const { text: rawTextResult } = await generateWithFallback(apiKey, prompt, '[GLUCOSE]', { maxOutputTokens: 300 });
        let rawText = rawTextResult.replace(/```json/g, '').replace(/```/g, '').trim();

        let estimate;
        try {
            estimate = JSON.parse(rawText);
        } catch (parseErr) {
            const match = rawText.match(/\{[\s\S]*\}/);
            if (!match) throw parseErr;
            estimate = JSON.parse(match[0]);
        }
        console.log('[GLUCOSE] Successfully parsed estimate for userId:', req.user?.userId, estimate.level);
        res.json({ success: true, estimate });
    } catch (error) {
        console.error('[GLUCOSE] Gemini API failed for userId:', req.user?.userId, '— 아래 로그로 실제 원인을 확인하세요:');
        logGeminiError('[GLUCOSE]', error);
        res.status(500).json({ success: false, error: 'Failed to predict glucose response' });
    }
});

// POST /api/glucose/predict-photo
// 사진으로 식단 기록: 음식 사진(base64) + 시간/이력 컨텍스트를 Gemini 멀티모달로 보내 사진 속 음식을
// 인식하고 매크로·혈당 반응을 추정한다. /predict(텍스트)와 동일한 응답 스키마를 반환해 프론트에서
// 그대로 재사용할 수 있게 한다.
router.post('/predict-photo', authenticateToken, async (req, res) => {
    console.log('[GLUCOSE-PHOTO] POST /predict-photo called by userId:', req.user?.userId);
    try {
        const { imageBase64, mimeType, time, recentMeals, cyclePhase, workoutToday } = req.body;
        if (!imageBase64) {
            return res.status(400).json({ success: false, error: 'No image provided' });
        }
        // 원본 기준 대략 1.5MB 상한(base64는 원본의 ~4/3배) — 업로드/토큰 비용을 예측 가능한 범위로 고정.
        // 프론트에서 이미 리사이즈해서 보내지만, 서버에서도 한 번 더 방어적으로 막는다.
        if (imageBase64.length > 2_000_000) {
            return res.status(400).json({ success: false, error: 'Image too large' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error('[GLUCOSE-PHOTO] GEMINI_API_KEY not configured');
            return res.status(500).json({ success: false, error: 'API Key not configured' });
        }

        const promptText = `
당신은 PCOS(다낭성난소증후군) 여성을 위한 혈당 관리 앱의 예측 보조 도구입니다.
첨부된 사진 속 음식을 보고 무엇을 얼마나 먹었는지 추정한 뒤, 이 사용자의 최근 식단·혈당·운동 이력을
참고하여 매크로 영양소와 식후 혈당 반응을 예측해 주세요. 반드시 JSON 형식으로만 응답하십시오.
의학적 진단이나 치료 지시는 금지합니다. 비용 관리를 위해 rationale은 1문장(최대 60자)으로 짧게 쓰세요.

섭취 시간: ${time || '알 수 없음'}
생리주기 단계: ${cyclePhase || 'unknown'} (황체기는 인슐린 감수성이 낮아지는 경향 참고)
오늘 운동 기록: ${workoutToday && workoutToday.intensity ? `${workoutToday.intensity} 강도, ${workoutToday.durationMin}분` : '없음'}
최근 식단·혈당 이력: ${JSON.stringify((recentMeals || []).slice(-MAX_RECENT_MEALS).map(m => ({ ...m, text: truncateStr(m.text, 60) })))}

응답 JSON 형식:
{
  "foodGuess": "사진에서 인식한 음식 이름 (예: 닭가슴살 샐러드)",
  "carb_g": 45,
  "protein_g": 20,
  "fat_g": 12,
  "kcal_est": 420,
  "gi_estimate": 55,
  "deltaPeak": 48,
  "level": "low" | "medium" | "high",
  "rationale": "왜 이렇게 추정했는지 한 문장"
}
`;

        const parts = [
            { text: promptText },
            { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } },
        ];

        console.log('[GLUCOSE-PHOTO] Calling Gemini API (multimodal), prompt text length:', promptText.length, 'image base64 length:', imageBase64.length);
        const { text: rawTextResult } = await generateWithFallback(apiKey, parts, '[GLUCOSE-PHOTO]', { maxOutputTokens: 350 });
        let rawText = rawTextResult.replace(/```json/g, '').replace(/```/g, '').trim();

        let estimate;
        try {
            estimate = JSON.parse(rawText);
        } catch (parseErr) {
            const match = rawText.match(/\{[\s\S]*\}/);
            if (!match) throw parseErr;
            estimate = JSON.parse(match[0]);
        }
        console.log('[GLUCOSE-PHOTO] Successfully parsed estimate for userId:', req.user?.userId, estimate.level, estimate.foodGuess);
        res.json({ success: true, estimate });
    } catch (error) {
        console.error('[GLUCOSE-PHOTO] Gemini API failed for userId:', req.user?.userId, '— 아래 로그로 실제 원인을 확인하세요:');
        logGeminiError('[GLUCOSE-PHOTO]', error);
        res.status(500).json({ success: false, error: 'Failed to analyze food photo' });
    }
});

module.exports = router;
