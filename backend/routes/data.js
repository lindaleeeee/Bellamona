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

    jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
        if (err) return res.sendStatus(403);

        try {
            const { rows } = await pool.query('SELECT deleted_at FROM users WHERE id = $1', [user.userId]);
            if (rows.length === 0 || rows[0].deleted_at) {
                console.warn('[DATA] 탈퇴한 계정의 접근 차단:', user.email);
                return res.status(403).json({ error: 'account_deleted' });
            }
        } catch (dbErr) {
            console.error('[DATA] deleted_at 확인 중 DB 오류:', dbErr);
            return res.sendStatus(500);
        }

        req.user = user;
        next();
    });
};

router.use(authenticateToken);

// 연속 기록일수 (GET /api/data/streak) - Slow Aging Lv./연속기록 표시용
router.get('/streak', async (req, res) => {
    const { userId } = req.user;
    console.log('[DATA] GET /streak for userId:', userId);
    try {
        const recentRes = await pool.query(
            'SELECT check_date FROM routine_checks WHERE user_id = $1 ORDER BY check_date DESC LIMIT 90',
            [userId]
        );
        const totalRes = await pool.query(
            'SELECT COUNT(*)::int AS count FROM routine_checks WHERE user_id = $1',
            [userId]
        );

        const loggedDates = new Set(recentRes.rows.map(r => r.check_date.toISOString().split('T')[0]));
        const todayStr = new Date().toISOString().split('T')[0];

        let streakDays = 0;
        let gapDays = 0;

        if (recentRes.rows.length > 0) {
            const cursor = new Date(todayStr + 'T00:00:00.000Z');
            // 오늘 기록을 아직 안 했어도 어제까지 연속이면 스트릭 유지, 오늘 자정 지나면 끊긴 걸로 판단
            if (!loggedDates.has(todayStr)) cursor.setUTCDate(cursor.getUTCDate() - 1);
            while (loggedDates.has(cursor.toISOString().split('T')[0])) {
                streakDays++;
                cursor.setUTCDate(cursor.getUTCDate() - 1);
            }

            const lastDateStr = recentRes.rows[0].check_date.toISOString().split('T')[0];
            const diffMs = new Date(todayStr + 'T00:00:00.000Z') - new Date(lastDateStr + 'T00:00:00.000Z');
            gapDays = Math.max(Math.round(diffMs / 86400000), 0);
        }

        const totalLoggedDays = totalRes.rows[0].count;
        console.log('[DATA] GET /streak result for userId:', userId, { streakDays, gapDays, totalLoggedDays });

        res.json({ streakDays, gapDays, totalLoggedDays });
    } catch (err) {
        console.error('[DATA] GET /streak failed for userId:', userId, err);
        res.status(500).json({ error: 'Failed to compute streak' });
    }
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 특정 날짜의 기록 스냅샷 (GET /api/data/day?date=YYYY-MM-DD) - 달력 날짜 클릭 상세보기용
router.get('/day', async (req, res) => {
    const { userId } = req.user;
    const { date } = req.query;
    console.log('[DATA] GET /day for userId:', userId, 'date:', date);

    if (!date || !DATE_RE.test(date)) {
        return res.status(400).json({ error: 'invalid_date' });
    }

    try {
        const [checksRes, mealsRes, workoutRes, weightRes, diaryRes, periodsRes] = await Promise.all([
            pool.query('SELECT checks FROM routine_checks WHERE user_id = $1 AND check_date = $2', [userId, date]),
            pool.query('SELECT * FROM meals WHERE user_id = $1 AND eaten_date = $2', [userId, date]),
            pool.query('SELECT * FROM workouts WHERE user_id = $1 AND performed_date = $2', [userId, date]),
            pool.query('SELECT weight_kg FROM weights WHERE user_id = $1 AND logged_date = $2', [userId, date]),
            pool.query('SELECT content FROM diaries WHERE user_id = $1 AND written_date = $2', [userId, date]),
            pool.query('SELECT start_date, duration_days FROM periods WHERE user_id = $1 AND start_date <= $2 ORDER BY start_date DESC LIMIT 1', [userId, date]),
        ]);

        const checks = checksRes.rows[0]?.checks || null;
        const meals = mealsRes.rows;
        const workout = workoutRes.rows[0] || null;
        const weight = weightRes.rows[0]?.weight_kg ?? null;
        const diary = diaryRes.rows[0]?.content ?? null;
        const period = periodsRes.rows[0] || null;

        const hasAnyRecord = !!checks || meals.length > 0 || !!workout || weight != null || !!diary;

        res.json({ date, checks, meals, workout, weight, diary, period, hasAnyRecord });
    } catch (err) {
        console.error('[DATA] GET /day failed for userId:', userId, err);
        res.status(500).json({ error: 'Failed to load day snapshot' });
    }
});

// 월간 루틴체크 히스토리 (GET /api/data/month-summary?year=&month=) - 이달 평균 점수 + 캘린더 완벽달성일 표시용
router.get('/month-summary', async (req, res) => {
    const { userId } = req.user;
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10); // 1-12
    console.log('[DATA] GET /month-summary for userId:', userId, { year, month });

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: 'invalid_year_month' });
    }

    try {
        const start = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        const { rows } = await pool.query(
            'SELECT check_date, checks FROM routine_checks WHERE user_id = $1 AND check_date BETWEEN $2 AND $3 ORDER BY check_date',
            [userId, start, end]
        );

        const days = rows.map(r => ({
            date: r.check_date.toISOString().split('T')[0],
            checks: r.checks,
        }));

        res.json({ year, month, days });
    } catch (err) {
        console.error('[DATA] GET /month-summary failed for userId:', userId, err);
        res.status(500).json({ error: 'Failed to load month summary' });
    }
});

// 데이터 로드 (GET /api/data)
router.get('/', async (req, res) => {
    const { userId } = req.user;
    console.log('[DATA] GET / - loading data for userId:', userId);
    const client = await pool.connect();

    try {
        const today = new Date().toISOString().split('T')[0];

        // 프로필 병합
        const profileRes = await client.query('SELECT * FROM profiles WHERE user_id = $1', [userId]);
        const userRes = await client.query('SELECT name, avatar, friend_code FROM users WHERE id = $1', [userId]);

        // 오늘의 식사
        const mealsRes = await client.query('SELECT * FROM meals WHERE user_id = $1 AND eaten_date = $2', [userId, today]);

        // 오늘의 운동
        const workoutsRes = await client.query('SELECT * FROM workouts WHERE user_id = $1 AND performed_date = $2', [userId, today]);

        // 오늘의 루틴 체크
        const checksRes = await client.query('SELECT * FROM routine_checks WHERE user_id = $1 AND check_date = $2', [userId, today]);

        // 몸무게 전체
        const weightsRes = await client.query('SELECT * FROM weights WHERE user_id = $1 ORDER BY logged_date ASC', [userId]);

        // 생리 주기 전체
        const periodsRes = await client.query('SELECT * FROM periods WHERE user_id = $1 ORDER BY start_date ASC', [userId]);

        // 월별/최근 일기
        const diariesRes = await client.query('SELECT * FROM diaries WHERE user_id = $1 ORDER BY written_date DESC LIMIT 30', [userId]);

        // 최근 수면 기록 / 운동 기록 (이번주 시각화용)
        const sleepLogsRes = await client.query('SELECT * FROM sleep_logs WHERE user_id = $1 ORDER BY log_date DESC LIMIT 14', [userId]);
        const workoutHistoryRes = await client.query('SELECT * FROM workouts WHERE user_id = $1 ORDER BY performed_date DESC LIMIT 14', [userId]);

        console.log('[DATA] GET / success for userId:', userId, {
            meals: mealsRes.rows.length,
            workouts: workoutsRes.rows.length,
            checks: checksRes.rows.length,
            weights: weightsRes.rows.length,
            periods: periodsRes.rows.length,
            diaries: diariesRes.rows.length
        });

        res.json({
            user: userRes.rows[0],
            profile: profileRes.rows[0] || null,
            meals: mealsRes.rows,
            workout: workoutsRes.rows[0] || null,
            checks: checksRes.rows[0]?.checks || {},
            weights: weightsRes.rows,
            periods: periodsRes.rows,
            diaries: diariesRes.rows,
            sleepLogs: sleepLogsRes.rows,
            workoutHistory: workoutHistoryRes.rows
        });
    } catch (err) {
        console.error('[DATA] GET / failed for userId:', userId, err);
        res.status(500).json({ error: 'Failed to load data.' });
    } finally {
        client.release();
    }
});

// 프로필 저장 (UPSERT)
router.post('/profiles', async (req, res) => {
    const { userId } = req.user;
    const { height_cm, weight_kg, goal_weight_kg, goal_months, daily_kcal_target, cycle_len, start_date, goal_date, gender, report_time, supplements } = req.body;
    console.log('[DATA] POST /profiles for userId:', userId, req.body);
    try {
        await pool.query(`
      INSERT INTO profiles (user_id, height_cm, weight_kg, goal_weight_kg, goal_months, daily_kcal_target, cycle_len, start_date, goal_date, gender, report_time, supplements)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
        supplements = COALESCE(EXCLUDED.supplements, profiles.supplements),
        updated_at = CURRENT_TIMESTAMP
    `, [userId, height_cm, weight_kg, goal_weight_kg, goal_months, daily_kcal_target, cycle_len, start_date || null, goal_date || null, gender || null, report_time || null, supplements ? JSON.stringify(supplements) : null]);
        console.log('[DATA] POST /profiles success for userId:', userId);
        res.json({ success: true });
    } catch (err) {
        console.error('[DATA] POST /profiles failed for userId:', userId, err);
        res.status(500).json({ error: err.message });
    }
});

// 식사 저장 (같은 날짜+끼니 라벨이면 UPSERT)
router.post('/meals', async (req, res) => {
    const { userId } = req.user;
    const { eaten_date, label, time, foods, bg_pre, bg_1h, bg_2h, description, ai_estimate } = req.body;
    console.log('[DATA] POST /meals for userId:', userId, { eaten_date, label, time, bg_pre, bg_1h, bg_2h, description });
    try {
        const today = eaten_date || new Date().toISOString().split('T')[0];
        const exist = await pool.query('SELECT id FROM meals WHERE user_id=$1 AND eaten_date=$2 AND label=$3', [userId, today, label]);
        let row;
        if (exist.rows.length > 0) {
            console.log('[DATA] Existing meal slot found, updating id:', exist.rows[0].id);
            const r = await pool.query(
                `UPDATE meals SET time=$1, foods=$2, bg_pre=$3, bg_1h=$4, bg_2h=$5, description=$6, ai_estimate=$7 WHERE id=$8 RETURNING *`,
                [time, JSON.stringify(foods), bg_pre, bg_1h, bg_2h, description || null, ai_estimate ? JSON.stringify(ai_estimate) : null, exist.rows[0].id]);
            row = r.rows[0];
        } else {
            console.log('[DATA] No existing meal slot, inserting new row');
            const r = await pool.query(
                `INSERT INTO meals (user_id, eaten_date, label, time, foods, bg_pre, bg_1h, bg_2h, description, ai_estimate)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
                [userId, today, label, time, JSON.stringify(foods), bg_pre, bg_1h, bg_2h, description || null, ai_estimate ? JSON.stringify(ai_estimate) : null]);
            row = r.rows[0];
        }
        console.log('[DATA] POST /meals success, meal id:', row.id);
        res.json({ success: true, meal: row });
    } catch (err) {
        console.error('[DATA] POST /meals failed for userId:', userId, err);
        res.status(500).json({ error: err.message });
    }
});

// 식사 슬롯 삭제
router.delete('/meals/:id', async (req, res) => {
    const { userId } = req.user;
    const { id } = req.params;
    console.log('[DATA] DELETE /meals/:id for userId:', userId, 'mealId:', id);
    try {
        await pool.query('DELETE FROM meals WHERE id = $1 AND user_id = $2', [id, userId]);
        console.log('[DATA] DELETE /meals/:id success, mealId:', id);
        res.json({ success: true });
    } catch (err) {
        console.error('[DATA] DELETE /meals/:id failed for mealId:', id, err);
        res.status(500).json({ error: err.message });
    }
});

// 운동 저장 (UPSERT) — 강도(intensity)×시간(duration_min)으로 자동 추정하는 방식
router.post('/workouts', async (req, res) => {
    const { userId } = req.user;
    const { performed_date, intensity, duration_min, exercise_type, minutes_after_meal } = req.body;
    console.log('[DATA] POST /workouts for userId:', userId, { performed_date, intensity, duration_min, exercise_type, minutes_after_meal });
    try {
        const today = performed_date || new Date().toISOString().split('T')[0];
        const exist = await pool.query('SELECT id FROM workouts WHERE user_id=$1 AND performed_date=$2', [userId, today]);
        if (exist.rows.length > 0) {
            console.log('[DATA] Existing workout found, updating id:', exist.rows[0].id);
            await pool.query('UPDATE workouts SET intensity=$1, duration_min=$2, exercise_type=$3, minutes_after_meal=$4 WHERE id=$5',
                [intensity ?? null, duration_min ?? null, exercise_type ?? null, minutes_after_meal ?? null, exist.rows[0].id]);
        } else {
            console.log('[DATA] No existing workout, inserting new row');
            await pool.query('INSERT INTO workouts (user_id, performed_date, intensity, duration_min, exercise_type, minutes_after_meal) VALUES ($1, $2, $3, $4, $5, $6)',
                [userId, today, intensity ?? null, duration_min ?? null, exercise_type ?? null, minutes_after_meal ?? null]);
        }
        console.log('[DATA] POST /workouts success for userId:', userId);
        res.json({ success: true });
    } catch (err) {
        console.error('[DATA] POST /workouts failed for userId:', userId, err);
        res.status(500).json({ error: err.message });
    }
});

// 수면 기록 저장 (UPSERT)
router.post('/sleep', async (req, res) => {
    const { userId } = req.user;
    const { log_date, bedtime, wake_time, hours } = req.body;
    console.log('[DATA] POST /sleep for userId:', userId, { log_date, bedtime, wake_time, hours });
    try {
        const today = log_date || new Date().toISOString().split('T')[0];
        await pool.query(`
      INSERT INTO sleep_logs (user_id, log_date, bedtime, wake_time, hours)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, log_date)
      DO UPDATE SET bedtime = EXCLUDED.bedtime, wake_time = EXCLUDED.wake_time, hours = EXCLUDED.hours
    `, [userId, today, bedtime || null, wake_time || null, hours || null]);
        console.log('[DATA] POST /sleep success for userId:', userId);
        res.json({ success: true });
    } catch (err) {
        console.error('[DATA] POST /sleep failed for userId:', userId, err);
        res.status(500).json({ error: err.message });
    }
});

// 체크 (UPSERT)
router.post('/checks', async (req, res) => {
    const { userId } = req.user;
    const { check_date, checks } = req.body;
    console.log('[DATA] POST /checks for userId:', userId, { check_date, checks });
    try {
        const today = check_date || new Date().toISOString().split('T')[0];
        await pool.query(`
      INSERT INTO routine_checks (user_id, check_date, checks)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, check_date)
      DO UPDATE SET checks = EXCLUDED.checks
    `, [userId, today, JSON.stringify(checks)]);
        console.log('[DATA] POST /checks success for userId:', userId);
        res.json({ success: true });
    } catch (err) {
        console.error('[DATA] POST /checks failed for userId:', userId, err);
        res.status(500).json({ error: err.message });
    }
});

// 체중 저장
router.post('/weights', async (req, res) => {
    const { userId } = req.user;
    const { logged_date, weight_kg } = req.body;
    console.log('[DATA] POST /weights for userId:', userId, { logged_date, weight_kg });
    try {
        const today = logged_date || new Date().toISOString().split('T')[0];
        await pool.query('INSERT INTO weights (user_id, logged_date, weight_kg) VALUES ($1, $2, $3)', [userId, today, weight_kg]);
        console.log('[DATA] POST /weights success for userId:', userId);
        res.json({ success: true });
    } catch (err) {
        console.error('[DATA] POST /weights failed for userId:', userId, err);
        res.status(500).json({ error: err.message });
    }
});

// 생리(주기) 저장
router.post('/periods', async (req, res) => {
    const { userId } = req.user;
    const { start_date, duration_days } = req.body;
    console.log('[DATA] POST /periods for userId:', userId, { start_date, duration_days });
    try {
        await pool.query('INSERT INTO periods (user_id, start_date, duration_days) VALUES ($1, $2, $3)', [userId, start_date, duration_days]);
        console.log('[DATA] POST /periods success for userId:', userId);
        res.json({ success: true });
    } catch (err) {
        console.error('[DATA] POST /periods failed for userId:', userId, err);
        res.status(500).json({ error: err.message });
    }
});

// 일기 저장
router.post('/diaries', async (req, res) => {
    const { userId } = req.user;
    const { written_date, content } = req.body;
    console.log('[DATA] POST /diaries for userId:', userId, { written_date, contentLength: content?.length });
    try {
        const today = written_date || new Date().toISOString().split('T')[0];
        await pool.query('INSERT INTO diaries (user_id, written_date, content) VALUES ($1, $2, $3)', [userId, today, content]);
        console.log('[DATA] POST /diaries success for userId:', userId);
        res.json({ success: true });
    } catch (err) {
        console.error('[DATA] POST /diaries failed for userId:', userId, err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
