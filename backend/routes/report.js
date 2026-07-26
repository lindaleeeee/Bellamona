const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// 부팅 시점에 바로 확인 가능하도록 — 요청이 올 때까지 기다리지 않고 로그에서 키 누락을 알 수 있게 함
if (!process.env.GEMINI_API_KEY) console.error('[REPORT] 부팅 경고: GEMINI_API_KEY 환경변수가 설정되지 않았습니다. AI 리포트는 항상 폴백으로만 응답합니다.');

// Auth middleware for report
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);
    jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
        if (err) return res.sendStatus(403);

        try {
            const { rows } = await pool.query('SELECT deleted_at FROM users WHERE id = $1', [user.userId]);
            if (rows.length === 0 || rows[0].deleted_at) {
                console.warn('[REPORT] 탈퇴한 계정의 접근 차단:', user.email);
                return res.status(403).json({ error: 'account_deleted' });
            }
        } catch (dbErr) {
            console.error('[REPORT] deleted_at 확인 중 DB 오류:', dbErr);
            return res.sendStatus(500);
        }

        req.user = user;
        next();
    });
};

// Gemini 호출 실패의 진짜 원인(모델 단종/키 무효/네트워크/쿼터 초과 등)을 로그에서 바로 알아볼 수
// 있도록, error 객체가 들고 있을 수 있는 필드를 최대한 펼쳐서 찍는다. error.message만 찍으면
// "[GoogleGenerativeAI Error]: fetch failed" 처럼 뭉뚱그려져서 원인 파악이 안 되는 경우가 많다.
function logGeminiError(tag, error) {
    console.error(`${tag} name:`, error?.name);
    console.error(`${tag} message:`, error?.message);
    if (error?.status) console.error(`${tag} status:`, error.status, error.statusText);
    if (error?.errorDetails) console.error(`${tag} errorDetails:`, JSON.stringify(error.errorDetails));
    if (error?.cause) console.error(`${tag} cause:`, error.cause);
    if (error?.response) {
        try { console.error(`${tag} response:`, JSON.stringify(error.response).slice(0, 2000)); }
        catch (e) { console.error(`${tag} response (unstringifiable):`, error.response); }
    }
    console.error(`${tag} stack:`, error?.stack);
}

// meals 배열의 ai_estimate(자유 텍스트 식단 기록)를 우선으로 쓰고, 그게 없으면(레거시 그램 단위
// 구조화 식단 기록) foods 배열에서 직접 합산한다 — 예전 방식으로 기록된 식사만 있는 날은 ai_estimate가
// 없어서 매크로가 전부 0으로 나오는 버그가 있었다.
// AI 응답에 맡기지 않는 이유: 같은 입력에 항상 같은 숫자가 나와야 하고, Gemini 호출이 실패해도
// 이 섹션만은 항상 정확하게 보여야 하기 때문이다(사용자 요청: "데이터가 적어도 정해진 규칙대로 보여야").
function macroFromFoods(foods) {
    return (foods || []).reduce((acc, f) => {
        const g = f.g || 0; const food = f.food || {};
        acc.carb_g += (food.c || 0) * g / 100;
        acc.protein_g += (food.p || 0) * g / 100;
        acc.fat_g += (food.f || 0) * g / 100;
        acc.kcal_total += (food.cal || 0) * g / 100;
        return acc;
    }, { carb_g: 0, protein_g: 0, fat_g: 0, kcal_total: 0 });
}
function computeMacroBreakdown(meals) {
    const totals = (meals || []).reduce((acc, m) => {
        const src = m.ai_estimate
            ? { carb_g: m.ai_estimate.carb_g || 0, protein_g: m.ai_estimate.protein_g || 0, fat_g: m.ai_estimate.fat_g || 0, kcal_total: m.ai_estimate.kcal_est || 0 }
            : macroFromFoods(m.foods);
        acc.carb_g += src.carb_g; acc.protein_g += src.protein_g; acc.fat_g += src.fat_g; acc.kcal_total += src.kcal_total;
        return acc;
    }, { carb_g: 0, protein_g: 0, fat_g: 0, kcal_total: 0 });
    return {
        carb_g: Math.round(totals.carb_g), protein_g: Math.round(totals.protein_g),
        fat_g: Math.round(totals.fat_g), kcal_total: Math.round(totals.kcal_total),
    };
}

// Gemini 호출이 실패하거나(키 누락/네트워크 오류) JSON 파싱에 실패해도 리포트 자체는 항상 정해진
// 형식으로 보여야 한다는 요구사항에 따른 기본값. degraded:true로 프론트에 "AI 응답 실패, 기본 안내"임을 알린다.
function fallbackReport(data) {
    const overall = typeof data.overallRoutinePct === 'number' ? data.overallRoutinePct : 50;
    return {
        headline: '오늘도 기록해주셔서 감사해요 — 계속 쌓이면 더 정확한 리포트를 볼 수 있어요',
        scores: { overall, biological_age_delta: 0 },
        tomorrow_workout: '아직 추천을 만들 만큼 운동 기록이 충분하지 않아요. 오늘처럼 계속 기록해보세요.',
        sleep_suggestion: '최근 수면 기록이 쌓이면 적정 수면시간을 제안해드릴게요.',
        emotion_keywords: [],
        diary_word_health: data.diaryThatDay ? '일기를 분석하는 데 문제가 있었어요. 잠시 후 다시 시도해주세요.' : '일기를 쓰면 감정 단어 기반 분석을 볼 수 있어요.',
        insights: ['기록이 쌓일수록 더 구체적인 인사이트를 볼 수 있어요.'],
        actions: ['오늘도 루틴 체크를 이어가 보세요.'],
        pcos_insight: null,
        degraded: true,
    };
}

router.post('/', authenticateToken, async (req, res) => {
    console.log('[REPORT] POST / called by userId:', req.user?.userId);
    const { data } = req.body;
    if (!data) {
        console.warn('[REPORT] Rejected: no data provided in request body');
        return res.status(400).json({ success: false, error: 'No data provided' });
    }
    console.log('[REPORT] Input data keys:', Object.keys(data));
    const macro_breakdown = computeMacroBreakdown(data.meals);

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

        const genAI = new GoogleGenerativeAI(apiKey);
        // gemini-1.5-flash는 Google이 이후 세대 모델 출시와 함께 단종시켰다 — 실패 원인이 그거였을
        // 가능성이 높아 현재 지원되는 모델로 교체.
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = `
이 사용자의 건강 데이터를 분석하여 저속노화 및 호르몬 관리를 위한 통찰과 추천을 제공해 주세요.
반드시 JSON 형식으로만 응답해야 합니다. 의학적 진단은 금지합니다. 데이터가 부족한 항목은 "기록이 더
쌓이면 알려드릴게요" 같은 정직한 문구로 채우고, 절대 필드를 비우거나 JSON을 깨뜨리지 마세요.

이 리포트는 5개 섹션으로 구성됩니다: ① 목표 체중 예측(프론트에서 계산) ② 인슐린(식단+혈당, 매크로는
서버에서 이미 계산함) ③ 성장호르몬(내일 운동 추천) ④ 코르티솔(수면) ⑤ 호르몬/일기.

데이터: ${JSON.stringify(data)}

응답 JSON 형식:
{
  "headline": "오늘의 한줄 평 (짧고 강력하게)",
  "scores": { "overall": 80, "biological_age_delta": -1.2 },
  "tomorrow_workout": "오늘 강도/부위 기록을 근거로 내일 추천 운동 (기록이 없으면 일반적인 저속노화 운동 팁)",
  "sleep_suggestion": "최근 수면 패턴을 근거로 내일 목표 수면시간과 이유",
  "emotion_keywords": [ { "word": "뿌듯", "count": 2, "type": "positive" } ],
  "diary_word_health": "일기 속 단어가 건강과 어떤 관련이 있는지 설명 (일기 없으면 그렇다고 안내)",
  "insights": ["통찰력 있는 분석 문장 1", "통찰력 있는 분석 문장 2"],
  "actions": ["구체적인 추천 행동 1", "구체적인 추천 행동 2"],
  "pcos_insight": "PCOS 맞춤형 통찰 (선택, 생리주기 데이터 기반)"
}
`;

        console.log('[REPORT] Calling Gemini API, prompt length:', prompt.length);
        const result = await model.generateContent(prompt);
        let rawText = result.response.text();
        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

        let reportJSON;
        try {
            reportJSON = JSON.parse(rawText);
        } catch (parseErr) {
            // Gemini가 JSON 앞뒤로 잡담을 붙이는 경우가 있어, 첫 {...} 블록만 추출해 한 번 더 시도
            const match = rawText.match(/\{[\s\S]*\}/);
            if (!match) throw parseErr;
            reportJSON = JSON.parse(match[0]);
        }
        reportJSON.macro_breakdown = macro_breakdown; // 항상 서버 계산값으로 덮어써서 정확성 보장
        console.log('[REPORT] Successfully parsed report JSON for userId:', req.user?.userId);
        res.json({ success: true, report: reportJSON });
    } catch (error) {
        console.error('[REPORT] Gemini API failed for userId:', req.user?.userId, '— returning fallback report. 아래 로그로 실제 원인을 확인하세요:');
        logGeminiError('[REPORT]', error);
        const report = fallbackReport(data);
        report.macro_breakdown = macro_breakdown;
        res.json({ success: true, report });
    }
});

module.exports = router;
