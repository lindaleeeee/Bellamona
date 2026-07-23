const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const oauth2Client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Google OAuth 2.0 Token Verification
router.post('/google/verify', async (req, res) => {
    const { credential } = req.body;

    if (!credential) {
        return res.status(400).json({ error: 'Missing credential token' });
    }

    try {
        // 프론트엔드로부터 받은 Google JWT 검증
        const ticket = await oauth2Client.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const { sub: google_id, email, name, picture: avatar } = payload;

        const client = await pool.connect();
        try {
            // DB에 사용자 확인
            let result = await client.query('SELECT * FROM users WHERE google_id = $1', [google_id]);
            let user = result.rows[0];

            if (!user) {
                // 새 사용자 생성 (회원가입 처리)
                result = await client.query(
                    'INSERT INTO users (google_id, email, name, avatar) VALUES ($1, $2, $3, $4) RETURNING *',
                    [google_id, email, name, avatar]
                );
                user = result.rows[0];
            } else {
                // 사용자 정보 업데이트 로직이 필요한 경우 (예: 프로필 사진 갱신)
                result = await client.query(
                    'UPDATE users SET name = $1, avatar = $2 WHERE google_id = $3 RETURNING *',
                    [name, avatar, google_id]
                );
                user = result.rows[0];
            }

            // 클라이언트용 자체 JWT 발급
            const token = jwt.sign(
                { userId: user.id, email: user.email },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            // 프론트엔드에 응답 (리다이렉트가 아닌 JSON 응답)
            res.json({ success: true, token, user });

        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error during Google token verification:', error);
        res.status(401).json({ error: 'Invalid or expired Google token' });
    }
});

module.exports = router;
