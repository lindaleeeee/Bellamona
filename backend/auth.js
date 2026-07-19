const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// 1. 구글 로그인 페이지로 리다이렉트
router.get('/google', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email',
        ],
    });
    res.redirect(url);
});

// 2. 구글 OAuth 2.0 콜백 처리
router.get('/google/callback', async (req, res) => {
    const { code } = req.query;

    try {
        // 엑세스 토큰 받아오기
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // 구글 사용자 정보 가져오기
        const userInfoResponse = await oauth2Client.request({
            url: 'https://www.googleapis.com/oauth2/v2/userinfo'
        });

        const { id: google_id, email, name, picture: avatar } = userInfoResponse.data;

        const client = await pool.connect();
        try {
            // DB에 사용자 확인
            let result = await client.query('SELECT * FROM users WHERE google_id = $1', [google_id]);
            let user = result.rows[0];

            if (!user) {
                // 새 사용자 생성
                result = await client.query(
                    'INSERT INTO users (google_id, email, name, avatar) VALUES ($1, $2, $3, $4) RETURNING *',
                    [google_id, email, name, avatar]
                );
                user = result.rows[0];
            }

            // JWT 발급
            const token = jwt.sign(
                { userId: user.id, email: user.email },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            // 클라이언트로 리다이렉트 (JWT를 URL 파라미터로 전달)
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5500';
            res.redirect(`${frontendUrl}?token=${token}`);

        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error during Google authentication:', error);
        res.status(500).send(`Authentication failed: ${error.message || error}`);
    }
});

module.exports = router;
