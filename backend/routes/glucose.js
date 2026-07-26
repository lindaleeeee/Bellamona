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

이번 식사: "${text}" (섭취 시간: ${time || '알 수 없음'})
생리주기 단계: ${cyclePhase || 'unknown'} (황체기는 인슐린 감수성이 낮아지는 경향 참고)
오늘 운동 기록: ${workoutToday && workoutToday.intensity ? `${workoutToday.intensity} 강도, ${workoutToday.durationMin}분` : '없음'}
최근 2주 식단·혈당 이력 (텍스트, 시간, 실측 혈당이 있으면 함께): ${JSON.stringify((recentMeals || []).slice(-30))}

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
        const { text: rawTextResult } = await generateWithFallback(apiKey, prompt, '[GLUCOSE]');
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

module.exports = router;
