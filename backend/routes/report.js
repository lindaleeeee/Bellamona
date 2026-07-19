const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const jwt = require('jsonwebtoken');

// Auth middleware for report
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

router.post('/', authenticateToken, async (req, res) => {
    try {
        const { data } = req.body;
        if (!data) return res.status(400).json({ success: false, error: 'No data provided' });

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ success: false, error: 'API Key not configured' });

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `
이 사용자의 건강 데이터를 분석하여 저속노화 및 호르몬 관리를 위한 통찰과 추천을 제공해 주세요. 
반드시 JSON 형식으로만 응답해야 합니다. 의학적 진단은 금지합니다.

데이터: ${JSON.stringify(data)}

응답 JSON 형식:
{
  "headline": "오늘의 한줄 평 (짧고 강력하게)",
  "scores": {
    "overall": 80, // 종합 점수 (0-100)
    "biological_age_delta": -1.2 // 생물학적 나이 변화량 시뮬레이션
  },
  "emotion_keywords": [
    { "word": "뿌듯", "count": 2, "type": "positive" },
    { "word": "피곤", "count": 1, "type": "negative" }
  ],
  "insights": [
    "통찰력 있는 분석 문장 1",
    "통찰력 있는 분석 문장 2"
  ],
  "actions": [
    "구체적인 추천 행동 1",
    "구체적인 추천 행동 2"
  ],
  "pcos_insight": "PCOS 맞춤형 통찰 (선택사항, 생리주기 데이터를 기반으로)"
}
`;

        const result = await model.generateContent(prompt);
        let rawText = result.response.text();
        // Remove markdown blocks if exists
        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

        const reportJSON = JSON.parse(rawText);
        res.json({ success: true, report: reportJSON });
    } catch (error) {
        console.error('Gemini API Error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate report' });
    }
});

module.exports = router;
