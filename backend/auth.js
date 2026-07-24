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
// 로그에 원문 토큰이 남지 않도록 앞뒤 일부만 노출
const maskToken = (token) => {
    if (!token || token.length < 12) return '(invalid)';
    return `${token.slice(0, 6)}...${token.slice(-4)} (len=${token.length})`;
};

// 친구 코드 생성: 혼동하기 쉬운 문자(0/O, 1/I) 제외
const FRIEND_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const generateFriendCode = () => {
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += FRIEND_CODE_CHARS[Math.floor(Math.random() * FRIEND_CODE_CHARS.length)];
    }
    return `BELLA-${code}`;
};

router.post('/google/verify', async (req, res) => {
    const { access_token } = req.body;
    console.log('[AUTH] POST /google/verify called. access_token:', maskToken(access_token));

    if (!access_token) {
        console.warn('[AUTH] Rejected: no access_token in request body');
        return res.status(400).json({ error: 'no_token' });
    }

    let client;
    try {
        console.log('[AUTH] Verifying Google access token securely with Google userinfo endpoint...');

        // 구글 서버에 직접 통신하여 토큰의 무결성 검증 및 유저 정보 요청
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${access_token}` }
        });
        console.log('[AUTH] Google userinfo response status:', response.status);
        const data = await response.json();

        // 구글이 거부하면 해킹 시도이므로 거절
        if (!data.id) {
            console.warn('[AUTH] Google rejected the token. Response:', data);
            return res.status(401).json({ error: 'invalid_google_token' });
        }

        const { id: google_id, email, name, picture: avatar } = data;
        console.log('[AUTH] Google user verified:', { google_id, email, name });

        client = await pool.connect();
        console.log('[AUTH] DB client acquired, upserting user...');

        // 신규 유저에게만 부여될 친구 코드. friend_code에 UNIQUE 제약이 있어
        // 충돌 시(극히 드묾) 재시도한다. 기존 유저는 ON CONFLICT에서 friend_code를
        // 건드리지 않으므로 이 값은 무시된다.
        let result;
        for (let attempt = 0; attempt < 5; attempt++) {
            const candidateCode = generateFriendCode();
            try {
                result = await client.query(
                    `INSERT INTO users (google_id, email, name, avatar, friend_code)
                     VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT (google_id)
                     DO UPDATE SET email = EXCLUDED.email,
                                   name  = EXCLUDED.name,
                                   avatar = COALESCE(users.avatar, EXCLUDED.avatar),
                                   friend_code = COALESCE(users.friend_code, EXCLUDED.friend_code),
                                   deleted_at = NULL
                     RETURNING *`,
                    [google_id, email, name, avatar, candidateCode]
                );
                break;
            } catch (insertErr) {
                if (insertErr.code === '23505' && insertErr.constraint && insertErr.constraint.includes('friend_code')) {
                    console.warn('[AUTH] friend_code 충돌, 재시도:', candidateCode);
                    continue;
                }
                throw insertErr;
            }
        }
        const user = result.rows[0];
        const isNewUser = new Date(user.created_at).getTime() > Date.now() - 5000;
        console.log('[AUTH] User upserted in DB:', { id: user.id, email: user.email, isNewUser });

        // 혜딤님의 JWT Secret으로 자체 로그인 쿠키 굽기
        const secret = process.env.JWT_SECRET || 'bellamona_secret_fallback';
        if (!process.env.JWT_SECRET) {
            console.warn('[AUTH] JWT_SECRET not set in env, using fallback secret!');
        }
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            secret,
            { expiresIn: '7d' }
        );
        console.log('[AUTH] JWT issued:', maskToken(token));

        res.cookie('token', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        console.log('[AUTH SUCCESS] 사용자 로그인 완료!');
        console.log(`- 이메일: ${user.email}`);
        console.log(`- 이름: ${user.name}`);
        console.log(`- DB 사용자 ID: ${user.id}`);

        res.json({ success: true, token: token, user: { name: user.name, email: user.email } });

    } catch (err) {
        // 👇 에러 원인을 백엔드 로그에 정확히 찍어줍니다.
        console.error('[AUTH ERROR] 구글 토큰 검증 실패:', err);
        res.status(500).json({ error: 'auth_verify_failed' });
    } finally {
        if (client) {
            client.release();
            console.log('[AUTH] DB client released');
        }
    }
});

// ── 4) 로그아웃
router.post('/logout', async (req, res) => {
    const token = req.cookies?.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);

    // 로그아웃은 토큰이 만료/위조되었어도 항상 성공해야 하므로 verify가 아닌 decode로 best-effort 로깅만 함
    let email = '(unknown)';
    let userId = '(unknown)';
    if (token) {
        const decoded = jwt.decode(token);
        if (decoded) {
            email = decoded.email || email;
            userId = decoded.userId || userId;
        }
    }

    res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'none' });
    console.log('[AUTH] 로그아웃:', { email, userId });

    res.json({ success: true });
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
