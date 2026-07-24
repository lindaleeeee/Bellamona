const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5
});

// GET /api/user/profile 
// Returns basic user info along with profile settings
router.get('/profile', async (req, res) => {
    let client;
    try {
        const { userId } = req.user;
        console.log('[USER] GET /profile for userId:', userId);
        client = await pool.connect();

        // Fetch user + profile
        const result = await client.query(`
            SELECT u.id, u.email, u.name, u.avatar,
                   p.height_cm, p.weight_kg, p.goal_weight_kg,
                   p.goal_months, p.daily_kcal_target, p.cycle_len
            FROM users u
            LEFT JOIN profiles p ON u.id = p.user_id
            WHERE u.id = $1
        `, [userId]);

        if (result.rows.length === 0) {
            console.warn('[USER] GET /profile - user not found:', userId);
            return res.status(404).json({ error: 'User not found' });
        }

        console.log('[USER] GET /profile success for userId:', userId);
        res.json(result.rows[0]);
    } catch (error) {
        console.error('[GET /api/user/profile error]', error);
        res.status(500).json({ error: 'Failed to fetch user profile' });
    } finally {
        if (client) client.release();
    }
});

// POST /api/user/onboard
// Upserts the user's profile settings
router.post('/onboard', async (req, res) => {
    let client;
    try {
        const { userId } = req.user;
        const { height_cm, weight_kg, goal_weight_kg, goal_months, daily_kcal_target, cycle_len } = req.body;
        console.log('[USER] POST /onboard for userId:', userId, req.body);

        client = await pool.connect();

        // Upsert into profiles
        const result = await client.query(`
            INSERT INTO profiles (user_id, height_cm, weight_kg, goal_weight_kg, goal_months, daily_kcal_target, cycle_len)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (user_id) 
            DO UPDATE SET 
                height_cm = EXCLUDED.height_cm,
                weight_kg = EXCLUDED.weight_kg,
                goal_weight_kg = EXCLUDED.goal_weight_kg,
                goal_months = EXCLUDED.goal_months,
                daily_kcal_target = EXCLUDED.daily_kcal_target,
                cycle_len = EXCLUDED.cycle_len,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *;
        `, [userId, height_cm || null, weight_kg || null, goal_weight_kg || null, goal_months || null, daily_kcal_target || null, cycle_len || 28]);

        console.log('[USER] POST /onboard success for userId:', userId);
        res.json({ message: 'Onboarding completed', profile: result.rows[0] });
    } catch (error) {
        console.error('[POST /api/user/onboard error]', error);
        res.status(500).json({ error: 'Failed to save onboarding data' });
    } finally {
        if (client) client.release();
    }
});

// DELETE /api/user/withdraw
// 회원 탈퇴 (소프트 삭제): users.deleted_at을 채우고 관련 데이터는 그대로 보존
router.delete('/withdraw', async (req, res) => {
    let client;
    try {
        const { userId } = req.user;
        console.log('[USER] DELETE /withdraw for userId:', userId);
        client = await pool.connect();

        await client.query('BEGIN');

        const existing = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (existing.rows.length === 0) {
            await client.query('ROLLBACK');
            console.warn('[USER] DELETE /withdraw - user not found:', userId);
            return res.status(404).json({ error: 'User not found' });
        }
        const { google_id, email, name, avatar } = existing.rows[0];

        // users 행을 지우면 FK CASCADE로 profiles/meals/workouts/routine_checks/
        // weights/periods/diaries/reports/training_pairs가 전부 함께 삭제된다.
        // 계정 자체의 흔적(탈퇴 시각)은 남겨야 하므로 같은 id/google_id로 즉시 재생성한다.
        await client.query('DELETE FROM users WHERE id = $1', [userId]);
        await client.query(
            `INSERT INTO users (id, google_id, email, name, avatar, deleted_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [userId, google_id, email, name, avatar]
        );

        await client.query('COMMIT');

        res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'none' });

        console.log('[USER] 회원 탈퇴 처리 완료 (개인 데이터 전체 삭제)');
        console.log(`- 이메일: ${email}`);
        console.log(`- 이름: ${name}`);
        console.log(`- DB 사용자 ID: ${userId}`);

        res.json({ success: true });
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('[DELETE /api/user/withdraw error]', error);
        res.status(500).json({ error: 'Failed to withdraw account' });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
