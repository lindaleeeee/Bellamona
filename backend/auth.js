const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const router = express.Router();

// ── 0) 환경변수 검증: 부팅 로그에서 바로 확인 가능
const REQUIRED = [
    'DATABASE_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI', 'JWT_SECRET', 'FRONTEND_URL',
];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) console.error('[BOOT] 환경변수 누락:', missing.join(', '));

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5500').replace(/\/+$/, '');
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

// ── 1) DB 풀
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
});

// ★★ 이거 없으면 idle 커넥션 끊길 때 프로세스가 죽습니다
pool.on('error', (err) => {
    console.error('[PG POOL ERROR]', err.message);
});

// ── 3) 팝업 콜백 검증 방식 (제로 리다이렉트 완전한 보안 OAuth)
router.post('/google/verify', async (req, res) => {
    const { access_token } = req.body;
    if (!access_token) return res.status(400).json({ error: 'no_token' });

    let client;
    try {
        console.log('[AUTH] Verifying Google access token securely...');

        // 구글 서버에 직접 통신하여 토큰의 무결성 검증 및 유저 정보 요청
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${access_token}` }
        });
        const data = await response.json();

        // 구글이 거부하면 해킹 시도이므로 거절
        if (!data.id) {
            return res.status(401).json({ error: 'invalid_google_token' });
        }

        const { id: google_id, email, name, picture: avatar } = data;

        client = await pool.connect();
        const result = await client.query(
            `INSERT INTO users (google_id, email, name, avatar)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (google_id)
             DO UPDATE SET email = EXCLUDED.email,
                           name  = EXCLUDED.name,
                           avatar = EXCLUDED.avatar
             RETURNING *`,
            [google_id, email, name, avatar]
        );
        const user = result.rows[0];

        // 혜딤님의 JWT Secret으로 자체 로그인 쿠키 굽기
        const secret = process.env.JWT_SECRET || 'bellamona_secret_fallback';
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            secret,
            { expiresIn: '7d' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({ success: true, user: { name: user.name, email: user.email } });

    } catch (err) {
        // 👇 에러 원인을 백엔드 로그에 정확히 찍어줍니다.
        console.error('[AUTH ERROR] 구글 토큰 검증 실패:', err);
        res.status(500).json({ error: 'auth_verify_failed' });
    } finally {
        if (client) client.release();
    }
});

// ── 5) 진단용
router.get('/healthz', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({
            db: 'ok',
            redirect_uri: REDIRECT_URI,
            frontend_url: FRONTEND_URL,
            has_client_id: !!process.env.GOOGLE_CLIENT_ID,
            has_jwt_secret: !!process.env.JWT_SECRET,
        });
    } catch (e) {
        res.status(500).json({ db: 'fail', message: e.message });
    }
});

module.exports = router;
