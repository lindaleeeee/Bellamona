const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// JWT 검증 미들웨어
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

router.use(authenticateToken);

// 데이터 로드 (GET /api/data)
router.get('/', async (req, res) => {
    const { userId } = req.user;
    const client = await pool.connect();

    try {
        const today = new Date().toISOString().split('T')[0];

        // 프로필 병합
        const profileRes = await client.query('SELECT * FROM profiles WHERE user_id = $1', [userId]);
        const userRes = await client.query('SELECT name, avatar FROM users WHERE id = $1', [userId]);

        // 오늘의 식사
        const mealsRes = await client.query('SELECT * FROM meals WHERE user_id = $1 AND eaten_date = $2', [userId, today]);

        // 운동 전체 (캘린더 연동 대비 옵션)
        const workoutsRes = await client.query('SELECT * FROM workouts WHERE user_id = $1 ORDER BY performed_date DESC LIMIT 30', [userId]);

        // 루틴 체크 전체
        const checksRes = await client.query('SELECT * FROM routine_checks WHERE user_id = $1 ORDER BY check_date ASC', [userId]);

        // 몸무게 전체
        const weightsRes = await client.query('SELECT * FROM weights WHERE user_id = $1 ORDER BY logged_date ASC', [userId]);

        // 생리 주기 전체
        const periodsRes = await client.query('SELECT * FROM periods WHERE user_id = $1 ORDER BY start_date ASC', [userId]);

        // 월별/최근 일기
        const diariesRes = await client.query('SELECT * FROM diaries WHERE user_id = $1 ORDER BY written_date DESC LIMIT 30', [userId]);

        res.json({
            user: userRes.rows[0],
            profile: profileRes.rows[0] || null,
            meals: mealsRes.rows,
            workout: workoutsRes.rows[0] || null,
            checks: checksRes.rows[0]?.checks || {},
            weights: weightsRes.rows,
            periods: periodsRes.rows,
            diaries: diariesRes.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load data.' });
    } finally {
        client.release();
    }
});

// 프로필 저장 (UPSERT)
router.post('/profiles', async (req, res) => {
    const { userId } = req.user;
    const { height_cm, weight_kg, goal_weight_kg, goal_months, daily_kcal_target, cycle_len } = req.body;
    try {
        await pool.query(`
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
    `, [userId, height_cm, weight_kg, goal_weight_kg, goal_months, daily_kcal_target, cycle_len]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 식사 저장
router.post('/meals', async (req, res) => {
    const { userId } = req.user;
    const { eaten_date, label, time, foods, bg_pre, bg_1h, bg_2h } = req.body;
    try {
        const today = eaten_date || new Date().toISOString().split('T')[0];
        await pool.query(`
      INSERT INTO meals (user_id, eaten_date, label, time, foods, bg_pre, bg_1h, bg_2h)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [userId, today, label, time, JSON.stringify(foods), bg_pre, bg_1h, bg_2h]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 운동 저장 (UPSERT)
router.post('/workouts', async (req, res) => {
    const { userId } = req.user;
    const { performed_date, strength, hiit, cardio, walk, note } = req.body;
    try {
        const today = performed_date || new Date().toISOString().split('T')[0];
        // 간단한 처리를 위해 DELETE 후 INSERT (체크가 쉬움) 또는 SELECT 후 업데이트. 원래는 고유 제약조건 필요.
        // 여기서는 고유 제약조건이 없으므로 일단 매번 INSERT 하거나 오늘자 찾아서 업데이트.
        const exist = await pool.query('SELECT id FROM workouts WHERE user_id=$1 AND performed_date=$2', [userId, today]);
        if (exist.rows.length > 0) {
            await pool.query('UPDATE workouts SET strength=$1, hiit=$2, cardio=$3, walk=$4, note=$5 WHERE id=$6',
                [strength, hiit, cardio, walk, note, exist.rows[0].id]);
        } else {
            await pool.query('INSERT INTO workouts (user_id, performed_date, strength, hiit, cardio, walk, note) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [userId, today, strength, hiit, cardio, walk, note]);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 체크 (UPSERT)
router.post('/checks', async (req, res) => {
    const { userId } = req.user;
    const { check_date, checks } = req.body;
    try {
        const today = check_date || new Date().toISOString().split('T')[0];
        await pool.query(`
      INSERT INTO routine_checks (user_id, check_date, checks)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, check_date)
      DO UPDATE SET checks = EXCLUDED.checks
    `, [userId, today, JSON.stringify(checks)]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 체중 저장
router.post('/weights', async (req, res) => {
    const { userId } = req.user;
    const { logged_date, weight_kg } = req.body;
    try {
        const today = logged_date || new Date().toISOString().split('T')[0];
        await pool.query('INSERT INTO weights (user_id, logged_date, weight_kg) VALUES ($1, $2, $3)', [userId, today, weight_kg]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 생리(주기) 저장
router.post('/periods', async (req, res) => {
    const { userId } = req.user;
    const { start_date, duration_days } = req.body;
    try {
        await pool.query('INSERT INTO periods (user_id, start_date, duration_days) VALUES ($1, $2, $3)', [userId, start_date, duration_days]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 일기 저장
router.post('/diaries', async (req, res) => {
    const { userId } = req.user;
    const { written_date, content } = req.body;
    try {
        const today = written_date || new Date().toISOString().split('T')[0];
        await pool.query('INSERT INTO diaries (user_id, written_date, content) VALUES ($1, $2, $3)', [userId, today, content]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
