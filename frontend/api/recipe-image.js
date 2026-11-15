// 레시피 대표 사진 생성 — Vercel 서버리스 함수 (POST /api/recipe-image)
// 메뉴 이름과 주재료로 Gemini 이미지 모델에 음식 사진을 만들어 base64로 돌려준다.
// 만든 사진은 브라우저가 줄여서(640px JPEG) Firestore recipe_images/{key}에 저장하고, 다음부터는 저장본을 쓴다.
// 그래서 같은 레시피는 처음 연 한 번만 생성 비용이 든다.
//
// 필요한 Vercel 환경변수: GEMINI_API_KEY(비밀), VITE_FIREBASE_API_KEY(로그인 토큰 확인용)

const IMAGE_MODELS = ['gemini-3.1-flash-lite-image', 'gemini-3.1-flash-image', 'gemini-2.5-flash-image'];
const perUser = new Map(); // 같은 서버 인스턴스 안에서의 간단한 남용 방지(사용자당 분당 6회)

async function verifyFirebaseUser(idToken) {
  const apiKey = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
  if (!idToken || !apiKey) return null;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return j && j.users && j.users[0] ? j.users[0].localId : null;
}

function buildPrompt(name, ingredients) {
  const ing = (Array.isArray(ingredients) ? ingredients : []).slice(0, 6).map(s => String(s).slice(0, 30)).join(', ');
  return [
    `A realistic, appetizing food photograph of the dish "${String(name).slice(0, 60)}".`,
    ing ? `Visible main ingredients: ${ing}.` : '',
    'Home-cooked, healthy and fresh looking, plated on a simple ceramic dish on a light wooden table.',
    'Soft natural daylight, slightly overhead angle, shallow depth of field, clean background.',
    'No text, no letters, no watermark, no logo, no people, no hands.',
  ].filter(Boolean).join(' ');
}

async function generateImage(apiKey, prompt) {
  let last = '';
  for (const model of IMAGE_MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:3' } },
      }),
    });
    const j = await r.json().catch(() => null);
    const msg = (j && j.error && j.error.message) || '';
    if (!r.ok) {
      last = `${model}: ${r.status} ${msg}`;
      if (r.status === 404 || r.status === 400 || /not found|not supported|unavailable/i.test(msg)) continue; // 다음 모델로
      throw new Error(last);
    }
    const parts = (j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    const img = parts.find(p => p.inlineData && p.inlineData.data);
    if (img) return { mime: img.inlineData.mimeType || 'image/png', data: img.inlineData.data, model };
    last = `${model}: 이미지 없음`;
  }
  throw new Error(last || '이미지를 만들지 못했어요');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const uid = await verifyFirebaseUser(token);
    if (!uid) return res.status(401).json({ error: '로그인이 필요해요' });
    const now = Date.now();
    const hist = (perUser.get(uid) || []).filter(t => now - t < 60000);
    if (hist.length >= 6) return res.status(429).json({ error: '잠시 후 다시 시도해 주세요' });
    perUser.set(uid, [...hist, now]);

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const name = String(body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name이 필요해요' });
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY가 설정되지 않았어요' });

    const out = await generateImage(apiKey, buildPrompt(name, body.ingredients));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(out);
  } catch (e) {
    console.error('[recipe-image]', e);
    return res.status(502).json({ error: String(e.message || e).slice(0, 300) });
  }
}
