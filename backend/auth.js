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
    ssl: { rejectUnauthorized: false },   // Cloudtype PG면 거의 필수
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
});

// ★★ 이거 없으면 idle 커넥션 끊길 때 프로세스가 죽습니다
pool.on('error', (err) => {
    console.error('[PG POOL ERROR]', err.message);
});

// ── 2) 요청마다 새 클라이언트 (싱글톤 공유 금지)
const newClient = () => new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
);

// ── 3) 로그인 시작
router.get('/google', (req, res) => {
    if (!REDIRECT_URI) {
        return res.status(500).send('GOOGLE_REDIRECT_URI 환경변수가 설정되지 않았습니다.');
    }
    const url = newClient().generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        redirect_uri: REDIRECT_URI,        // 명시적으로 전달
        scope: [
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email',
        ],
    });
    console.log('[AUTH] redirecting to google, redirect_uri =', REDIRECT_URI);
    res.redirect(url);
});

// ── 4) 콜백
router.get('/google/callback', async (req, res) => {
    const { code, error: oauthError } = req.query;

    // 사용자가 취소했거나 구글이 에러를 준 경우 (바닐라 프론트엔드 URL 파라미터 구조 호환을 위해 유지)
    if (oauthError) {
        return res.redirect(`${FRONTEND_URL}/?error=${encodeURIComponent(oauthError)}`);
    }
    if (!code) {
        return res.redirect(`${FRONTEND_URL}/?error=no_code`);
    }

    let client;
    try {
        const oauth = newClient();
        const { tokens } = await oauth.getToken({ code, redirect_uri: REDIRECT_URI });
        oauth.setCredentials(tokens);

        const { data } = await oauth.request({
            url: 'https://www.googleapis.com/oauth2/v2/userinfo',
        });
        const { id: google_id, email, name, picture: avatar } = data;

        client = await pool.connect();

        // UPSERT 한 방으로 처리 (동시 로그인 시 중복 INSERT 방지)
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

        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // XSS 방어를 위한 보안 쿠키 발급 (HttpOnly, Secure)
        res.cookie('token', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.redirect(`${FRONTEND_URL}/?success=1`);
    } catch (err) {
        // 구글 API 에러는 err.response.data에 진짜 원인이 들어있습니다
        console.error('[AUTH ERROR]', err?.response?.data || err.message, err.stack);
        res.redirect(`${FRONTEND_URL}/?error=auth_failed`);
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
