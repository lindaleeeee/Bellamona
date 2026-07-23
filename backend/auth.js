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

// ── 3) 로그인 시작 (초고속 데모 패스 - 구글 연동 생략 및 즉시 DB 로그인)
router.get('/google', async (req, res) => {
    let client;
    try {
        console.log('[AUTH] Bypassing Google OAuth and logging in instantly...');

        client = await pool.connect();

        // 언제나 성공하는 가상의 '테스트유저' 데이터 생성
        const google_id = 'demo_user_123';
        const email = 'demo@bellamona.net';
        const name = '혜딤 (Demo)';
        const avatar = '';

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

        // JWT 서명 (환경변수가 비어있어도 안 터지게 방어코드 삽입)
        const secret = process.env.JWT_SECRET || 'bellamona_secret_demo';
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            secret,
            { expiresIn: '7d' }
        );

        // 보안 토큰 쿠키로 굽기
        res.cookie('token', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        // 찰나의 순간에 프론트엔드로 즉시 돌려보냄! (URL 이동 없앰)
        res.json({ success: true, user });

    } catch (err) {
        console.error('[AUTH ERROR]', err);
        res.status(500).json({ error: 'auth_failed' });
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
