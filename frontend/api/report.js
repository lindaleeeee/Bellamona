// AI 리포트 생성 — Vercel 서버리스 함수 (POST /api/report)
// 예전 클라우드타입 백엔드의 routes/report.js를 옮긴 것. Gemini 키는 비밀값이라 브라우저에 둘 수 없어서
// 이 기능만 서버(Vercel 함수)에 남긴다. Vercel 함수는 요청이 올 때만 실행되고 꺼져서 멈추는 일이 없다.
//
// 필요한 Vercel 환경변수:
//   GEMINI_API_KEY            Gemini API 키 (비밀)
//   VITE_FIREBASE_API_KEY     로그인 토큰 확인용 (프론트와 같은 값)
//
// 리포트 캐시(같은 날 다시 열면 재사용)는 브라우저(js/sync.js)가 Firestore에 저장/조회한다.

const MODEL_CANDIDATES = [
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-flash',
  'gemini-pro-latest',
  'gemini-1.5-flash',
];

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

// Gemini 실패/파싱 실패 시에도 리포트는 항상 정해진 형식으로 보여야 한다. degraded:true면 저장하지 않는다.
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


// Firebase 로그인 토큰(ID token)이 유효한지 Google에 확인하고 uid를 돌려준다. 유효하지 않으면 null.
async function verifyFirebaseUser(idToken) {
    const apiKey = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
    if (!idToken || !apiKey) return null;
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    return j && j.users && j.users[0] ? j.users[0].localId : null;
}

// 후보 모델을 순서대로 시도한다(모델 단종 404일 때만 다음 후보로).
async function generateWithFallback(apiKey, prompt) {
    let lastError = null;
    for (const model of MODEL_CANDIDATES) {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                // 응답 토큰 상한을 고정해 호출당 비용 상한을 묶는다
                generationConfig: { maxOutputTokens: 800 },
            }),
        });
        const j = await r.json().catch(() => null);
        if (!r.ok) {
            const msg = (j && j.error && j.error.message) || '';
            if (r.status === 404 || /not found|no longer available/i.test(msg)) {
                console.warn(`[REPORT] 모델 "${model}" 사용 불가, 다음 후보로:`, msg);
                lastError = new Error(msg || `model ${model} unavailable`);
                continue;
            }
            throw new Error(`Gemini ${r.status}: ${msg}`);
        }
        const text = ((j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [])
            .map(p => p.text || '').join('');
        if (!text) throw new Error('Gemini empty response');
        console.log(`[REPORT] Gemini 호출 성공 (모델: ${model})`);
        return text;
    }
    throw lastError || new Error('No Gemini model candidates succeeded');
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'method_not_allowed' });

    const authHeader = req.headers['authorization'] || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const uid = await verifyFirebaseUser(idToken).catch(() => null);
    if (!uid) return res.status(401).json({ success: false, error: 'unauthorized' });

    const data = req.body && req.body.data;
    if (!data) return res.status(400).json({ success: false, error: 'No data provided' });

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

        const prompt = `
이 사용자의 생활습관 기록(식사·운동·수면·일기)을 분석하여 저속노화를 위한 통찰과 추천을 제공해 주세요.
이 앱은 의료기기가 아닌 일반 웰니스 앱입니다 — 특정 질병의 진단·치료·예방을 언급하거나 암시하지 말고,
"의학적 소견", "치료", "질환" 같은 표현 없이 생활습관 관점의 코멘트만 작성하세요. 데이터가 부족한
항목은 "기록이 더 쌓이면 알려드릴게요" 같은 정직한 문구로 채우고, 절대 필드를 비우거나 JSON을
깨뜨리지 마세요. 반드시 JSON 형식으로만 응답해야 합니다.

이 리포트는 5개 섹션으로 구성됩니다: ① 목표 체중 예측(프론트에서 계산) ② 식사(식사 시간+메모 기록)
③ 운동(내일 운동 추천) ④ 마음(수면) ⑤ 일기.
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

        const text = await generateWithFallback(apiKey, prompt);
        const rawText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        let reportJSON;
        try {
            reportJSON = JSON.parse(rawText);
        } catch (parseErr) {
            // JSON 앞뒤에 잡담이 붙는 경우가 있어 첫 {...} 블록만 다시 시도
            const match = rawText.match(/\{[\s\S]*\}/);
            if (!match) throw parseErr;
            reportJSON = JSON.parse(match[0]);
        }
        return res.status(200).json({ success: true, report: reportJSON });
    } catch (error) {
        console.error('[REPORT] Gemini 실패 — 기본 안내 리포트로 응답:', error && error.message);
        return res.status(200).json({ success: true, report: fallbackReport(data) });
    }
}
