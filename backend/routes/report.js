const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { generateWithFallback } = require('../geminiClient');

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

// 프롬프트 입력 크기를 내부에서 고정해 호출당 비용을 예측 가능한 범위로 묶어둔다 — 일기를 아주 길게
// 쓰거나 식사를 아주 많이 기록한 날에도 입력 토큰이 무제한으로 커지지 않도록, 프롬프트에 넣기 전에
// 필드별로 잘라낸다(사용자 요청: 글자수를 내부에서 고정해서 회당 비용을 고정치에 맞추고 싶다).
const MAX_DIARY_CHARS = 300;
const MAX_DESC_CHARS = 80;
const MAX_MEALS = 10;
const MAX_ARR = 7;
const MAX_PROMPT_DATA_CHARS = 4000; // 위 필드별 캡을 다 걸어도 혹시 넘치면 마지막 안전장치로 통째로 자름
function truncateStr(s, max) {
    if (typeof s !== 'string') return s;
    return s.length > max ? s.slice(0, max) + '…' : s;
}
function capReportData(data) {
    const capped = { ...data };
    if (Array.isArray(capped.meals)) {
        capped.meals = capped.meals.slice(0, MAX_MEALS).map(m => ({ ...m, description: truncateStr(m.description, MAX_DESC_CHARS) }));
    }
    if (Array.isArray(capped.workouts)) capped.workouts = capped.workouts.slice(0, MAX_MEALS);
    if (Array.isArray(capped.recentWorkouts)) capped.recentWorkouts = capped.recentWorkouts.slice(-MAX_ARR);
    if (Array.isArray(capped.sleepThisWeek)) capped.sleepThisWeek = capped.sleepThisWeek.slice(-MAX_ARR);
    if (Array.isArray(capped.supplementsChecked)) capped.supplementsChecked = capped.supplementsChecked.slice(0, 20).map(s => truncateStr(s, 30));
    capped.diaryThatDay = truncateStr(capped.diaryThatDay, MAX_DIARY_CHARS);
    capped.periodContext = truncateStr(capped.periodContext, 60);
    let json = JSON.stringify(capped);
    if (json.length > MAX_PROMPT_DATA_CHARS) json = json.slice(0, MAX_PROMPT_DATA_CHARS) + '…"}';
    return json;
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
        meal_pattern_insight: (data.meals || []).length ? '식사 기록을 분석하는 데 문제가 있었어요. 잠시 후 다시 시도해주세요.' : '식사를 기록하면 시간대 패턴을 분석해드려요.',
        insights: ['기록이 쌓일수록 더 구체적인 인사이트를 볼 수 있어요.'],
        actions: ['오늘도 루틴 체크를 이어가 보세요.'],
        pcos_insight: null,
        degraded: true,
    };
}

// 이미 저장된 날짜별 리포트를 캐시로만 조회 (Gemini 호출 없음) — 달력에서 하루를 열어볼 때
// 매번 새로 생성하지 않고, 이미 만들어둔 리포트가 있으면 그것만 보여주기 위한 용도.
router.get('/:date', authenticateToken, async (req, res) => {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ success: false, error: 'invalid date' });
    try {
        const { rows } = await pool.query(
            'SELECT content FROM reports WHERE user_id = $1 AND period_start = $2 AND period_end = $2',
            [req.user.userId, date]
        );
        if (!rows.length) return res.json({ success: false });
        res.json({ success: true, report: rows[0].content, cached: true });
    } catch (error) {
        console.error('[REPORT] GET /:date 캐시 조회 실패:', error);
        res.status(500).json({ success: false });
    }
});

router.post('/', authenticateToken, async (req, res) => {
    console.log('[REPORT] POST / called by userId:', req.user?.userId);
    const { data, force } = req.body;
    if (!data) {
        console.warn('[REPORT] Rejected: no data provided in request body');
        return res.status(400).json({ success: false, error: 'No data provided' });
    }
    console.log('[REPORT] Input data keys:', Object.keys(data));

    // 하루 한 번만 Gemini를 호출하도록: force가 아니면 이미 저장된 리포트가 있는지 먼저 확인하고,
    // 있으면 그걸 그대로 반환한다 (토큰 재사용 없음). "다시 생성" 버튼을 누른 경우만 force=true로 와서
    // 이 캐시를 건너뛰고 새로 만든다.
    const reportDate = data.date;
    if (reportDate && !force) {
        try {
            const { rows } = await pool.query(
                'SELECT content FROM reports WHERE user_id = $1 AND period_start = $2 AND period_end = $2',
                [req.user.userId, reportDate]
            );
            if (rows.length) {
                console.log(`[REPORT] ${reportDate} 캐시된 리포트 재사용 (Gemini 미호출) userId:`, req.user?.userId);
                return res.json({ success: true, report: rows[0].content, cached: true });
            }
        } catch (dbErr) {
            console.error('[REPORT] 캐시 조회 실패, 새로 생성 절차로 진행:', dbErr);
        }
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

        const prompt = `
이 사용자의 건강 데이터를 분석하여 저속노화 및 호르몬 관리를 위한 통찰과 추천을 제공해 주세요.
반드시 JSON 형식으로만 응답해야 합니다. 의학적 진단은 금지합니다. 데이터가 부족한 항목은 "기록이 더
쌓이면 알려드릴게요" 같은 정직한 문구로 채우고, 절대 필드를 비우거나 JSON을 깨뜨리지 마세요.

이 리포트는 5개 섹션으로 구성됩니다: ① 목표 체중 예측(프론트에서 계산) ② 인슐린(식사 시간+메모 기록)
③ 성장호르몬(내일 운동 추천) ④ 코르티솔(수면) ⑤ 호르몬/일기.
비용 관리를 위해 응답은 짧고 간결하게 작성하세요 — 문장형 필드는 각각 1~2문장(최대 60자 내외)으로,
insights/actions는 각 항목 1문장씩 최대 2개로 제한합니다.

데이터: ${capReportData(data)}

응답 JSON 형식:
{
  "headline": "오늘의 한줄 평 (짧고 강력하게)",
  "scores": { "overall": 80, "biological_age_delta": -1.2 },
  "tomorrow_workout": "오늘 강도/부위 기록을 근거로 내일 추천 운동 (기록이 없으면 일반적인 저속노화 운동 팁)",
  "sleep_suggestion": "최근 수면 패턴을 근거로 내일 목표 수면시간과 이유",
  "emotion_keywords": [ { "word": "뿌듯", "count": 2, "type": "positive" } ],
  "diary_word_health": "일기 속 단어가 건강과 어떤 관련이 있는지 설명 (일기 없으면 그렇다고 안내)",
  "meal_pattern_insight": "식사 시간·메모 기록에서 보이는 패턴에 대한 한줄 코멘트 (식사 기록 없으면 그렇다고 안내)",
  "insights": ["통찰력 있는 분석 문장 1", "통찰력 있는 분석 문장 2"],
  "actions": ["구체적인 추천 행동 1", "구체적인 추천 행동 2"],
  "pcos_insight": "PCOS 맞춤형 통찰 (선택, 생리주기 데이터 기반)"
}
`;

        console.log('[REPORT] Calling Gemini API, prompt length:', prompt.length);
        // maxOutputTokens로 응답 토큰 상한을 고정 — 회당 API 비용이 프롬프트 지시(간결하게)와
        // 무관하게 항상 이 상한 이하로 묶이도록 하는 하드 캡이다.
        const { text } = await generateWithFallback(apiKey, prompt, '[REPORT]', { maxOutputTokens: 800 });
        let rawText = text.replace(/```json/g, '').replace(/```/g, '').trim();

        let reportJSON;
        try {
            reportJSON = JSON.parse(rawText);
        } catch (parseErr) {
            // Gemini가 JSON 앞뒤로 잡담을 붙이는 경우가 있어, 첫 {...} 블록만 추출해 한 번 더 시도
            const match = rawText.match(/\{[\s\S]*\}/);
            if (!match) throw parseErr;
            reportJSON = JSON.parse(match[0]);
        }
        console.log('[REPORT] Successfully parsed report JSON for userId:', req.user?.userId);

        // 실제 Gemini 응답이 성공한 경우만 저장 — 이후 같은 날 재요청은 위 캐시 조회에서 바로 반환되어
        // Gemini를 다시 호출하지 않는다 (사용자 요청: 하루 한 번 생성한 리포트를 저장해서 토큰 재사용 방지).
        if (reportDate) {
            try {
                await pool.query(`
                    INSERT INTO reports (user_id, period_start, period_end, content)
                    VALUES ($1, $2, $2, $3)
                    ON CONFLICT (user_id, period_start, period_end)
                    DO UPDATE SET content = EXCLUDED.content, created_at = CURRENT_TIMESTAMP
                `, [req.user.userId, reportDate, JSON.stringify(reportJSON)]);
                console.log(`[REPORT] ${reportDate} 리포트 저장 완료 (다음 요청부터 캐시 재사용)`);
            } catch (saveErr) {
                console.error('[REPORT] 리포트 저장 실패 (응답 자체는 정상 반환):', saveErr);
            }
        }
        res.json({ success: true, report: reportJSON });
    } catch (error) {
        console.error('[REPORT] Gemini API failed for userId:', req.user?.userId, '— returning fallback report. 아래 로그로 실제 원인을 확인하세요:');
        logGeminiError('[REPORT]', error);
        const report = fallbackReport(data);
        res.json({ success: true, report });
    }
});

module.exports = router;
