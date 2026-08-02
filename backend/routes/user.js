const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5
});

// PATCH /api/user/avatar
// 이모지 아이콘 저장
router.patch('/avatar', async (req, res) => {
    try {
        const { userId } = req.user;
        const { avatar } = req.body;
        console.log('[USER] PATCH /avatar for userId:', userId, 'avatar:', avatar);

        if (!avatar || typeof avatar !== 'string' || avatar.length > 8) {
            return res.status(400).json({ error: 'Invalid avatar' });
        }

        await pool.query('UPDATE users SET avatar = $1 WHERE id = $2', [avatar, userId]);
        console.log('[USER] PATCH /avatar success for userId:', userId);
        res.json({ success: true });
    } catch (error) {
        console.error('[PATCH /api/user/avatar error]', error);
        res.status(500).json({ error: 'Failed to update avatar' });
    }
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
                   p.goal_months, p.daily_kcal_target, p.cycle_len,
                   p.start_date, p.goal_date, p.gender, p.report_time
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
        const { height_cm, weight_kg, goal_weight_kg, goal_months, daily_kcal_target, cycle_len, start_date, goal_date, gender, report_time } = req.body;
        console.log('[USER] POST /onboard for userId:', userId, req.body);

        client = await pool.connect();

        // Upsert into profiles
        const result = await client.query(`
            INSERT INTO profiles (user_id, height_cm, weight_kg, goal_weight_kg, goal_months, daily_kcal_target, cycle_len, start_date, goal_date, gender, report_time)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (user_id)
            DO UPDATE SET
                height_cm = EXCLUDED.height_cm,
                weight_kg = EXCLUDED.weight_kg,
                goal_weight_kg = EXCLUDED.goal_weight_kg,
                goal_months = EXCLUDED.goal_months,
                daily_kcal_target = EXCLUDED.daily_kcal_target,
                cycle_len = EXCLUDED.cycle_len,
                start_date = EXCLUDED.start_date,
                goal_date = EXCLUDED.goal_date,
                gender = EXCLUDED.gender,
                report_time = EXCLUDED.report_time,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *;
        `, [userId, height_cm || null, weight_kg || null, goal_weight_kg || null, goal_months || null, daily_kcal_target || null, cycle_len || 28, start_date || null, goal_date || null, gender || null, report_time || null]);

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
        const { google_id, email, name, avatar, friend_code } = existing.rows[0];

        // users 행을 지우면 FK CASCADE로 profiles/meals/workouts/routine_checks/
        // weights/periods/diaries/reports/training_pairs가 전부 함께 삭제된다.
        // 계정 자체의 흔적(탈퇴 시각)은 남겨야 하므로 같은 id/google_id로 즉시 재생성한다.
        await client.query('DELETE FROM users WHERE id = $1', [userId]);
        await client.query(
            `INSERT INTO users (id, google_id, email, name, avatar, friend_code, deleted_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [userId, google_id, email, name, avatar, friend_code]
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

// GET /api/data/streak과 같은 연속기록일수 계산을 임의 userId에 대해 재사용하기 위한 헬퍼.
async function computeStreakFor(userId) {
    const recentRes = await pool.query(
        'SELECT check_date FROM routine_checks WHERE user_id = $1 ORDER BY check_date DESC LIMIT 90',
        [userId]
    );
    const loggedDates = new Set(recentRes.rows.map(r => r.check_date.toISOString().split('T')[0]));
    const todayStr = new Date().toISOString().split('T')[0];
    let streakDays = 0;
    if (recentRes.rows.length > 0) {
        const cursor = new Date(todayStr + 'T00:00:00.000Z');
        if (!loggedDates.has(todayStr)) cursor.setUTCDate(cursor.getUTCDate() - 1);
        while (loggedDates.has(cursor.toISOString().split('T')[0])) {
            streakDays++;
            cursor.setUTCDate(cursor.getUTCDate() - 1);
        }
    }
    return streakDays;
}

// GET /api/user/friends — 내 친구 목록. 달성률 계산 로직(S.routines 기반)은 프론트에만 있으므로
// 서버는 각 친구의 "오늘 체크 원본(checks JSON)"만 내려주고, 프론트가 overallPctForChecks로 계산한다.
router.get('/friends', async (req, res) => {
    try {
        const { userId } = req.user;
        const friendsRes = await pool.query(
            `SELECT u.id, u.name, u.avatar
             FROM friendships f JOIN users u ON u.id = f.friend_id
             WHERE f.user_id = $1 AND u.deleted_at IS NULL
             ORDER BY f.created_at ASC`,
            [userId]
        );
        const todayStr = new Date().toISOString().split('T')[0];
        const friends = await Promise.all(friendsRes.rows.map(async (f) => {
            const checksRes = await pool.query(
                'SELECT checks FROM routine_checks WHERE user_id = $1 AND check_date = $2',
                [f.id, todayStr]
            );
            const streakDays = await computeStreakFor(f.id);
            return { id: f.id, name: f.name, avatar: f.avatar || '🦋', todayChecks: checksRes.rows[0]?.checks || null, streakDays };
        }));
        res.json({ friends });
    } catch (error) {
        console.error('[GET /api/user/friends error]', error);
        res.status(500).json({ error: 'Failed to load friends' });
    }
});

// POST /api/user/friends { code } — 친구 코드로 친구 추가. 나<->상대 양방향으로 한 번에 넣어서
// 각자 자기 쪽 목록 조회 시 별도 처리 없이 서로 보이게 한다.
router.post('/friends', async (req, res) => {
    let client;
    try {
        const { userId } = req.user;
        const code = (req.body.code || '').trim().toUpperCase();
        if (!code) return res.status(400).json({ error: 'code_required' });

        const targetRes = await pool.query(
            'SELECT id, name, avatar FROM users WHERE friend_code = $1 AND deleted_at IS NULL',
            [code]
        );
        const target = targetRes.rows[0];
        if (!target) return res.status(404).json({ error: 'not_found' });
        if (target.id === userId) return res.status(400).json({ error: 'self' });

        client = await pool.connect();
        await client.query('BEGIN');
        await client.query(
            `INSERT INTO friendships (user_id, friend_id) VALUES ($1,$2), ($2,$1)
             ON CONFLICT (user_id, friend_id) DO NOTHING`,
            [userId, target.id]
        );
        await client.query('COMMIT');
        console.log('[USER] POST /friends success:', userId, '<->', target.id);
        res.json({ success: true, friend: { id: target.id, name: target.name, avatar: target.avatar || '🦋' } });
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('[POST /api/user/friends error]', error);
        res.status(500).json({ error: 'Failed to add friend' });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
