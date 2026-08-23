const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { todayKST, addDays } = require('../utils/date');
const { phaseRatioForDate } = require('../utils/calorie');
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
        const todayStr = todayKST();

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
        const workouts = workoutRes.rows; // 하루에 여러 건 가능
        const weight = weightRes.rows[0]?.weight_kg ?? null;
        const diary = diaryRes.rows[0]?.content ?? null;
        const period = periodsRes.rows[0] || null;

        const hasAnyRecord = !!checks || meals.length > 0 || workouts.length > 0 || weight != null || !!diary;

        res.json({ date, checks, meals, workouts, weight, diary, period, hasAnyRecord });
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

// 하루가 끝나면(KST 자정) "그날 순섭취(식사kcal-운동kcal) < 그날 목표 칼로리"였던 만큼을 치팅데이
// 세이브 칼로리(profiles.saved_total_kcal)에 적립한다. 정확히 자정에 도는 배치 잡이 따로 없는 대신,
// 매번 GET /api/data 때마다 "어제까지" 아직 정산 안 된 날짜가 있으면 여기서 한꺼번에 정산한다.
// saved_total_computed_through로 이미 정산한 마지막 날짜를 기억해서 같은 날을 두 번 더하지 않는다.
// 식사를 하나도 기록 안 한 날은 순섭취가 항상 0이라 무조건 "목표보다 적게 먹은 걸로" 잘못 적립되므로
// 그런 날은 건너뛴다(정산 완료 표시만 하고 세이브는 늘리지 않음).
const toDateStr = (d) => (d == null ? null : (d instanceof Date ? d.toISOString().split('T')[0] : String(d).slice(0, 10)));
async function rolloverSavedTotal(client, userId, profile, periods) {
    if (!profile || profile.daily_kcal_target == null) return profile ? (profile.saved_total_kcal || 0) : 0;

    const yesterday = addDays(todayKST(), -1);
    const computedThrough = toDateStr(profile.saved_total_computed_through);
    const startDate = toDateStr(profile.start_date);
    // 이 기능이 처음 배포되는 시점의 기존 계정은 saved_total_computed_through가 없으므로,
    // 시작일(또는 최대 60일 전)부터 소급 정산한다 — 너무 먼 과거까지 훑지 않도록 60일로 제한.
    const earliestAllowed = addDays(yesterday, -59);
    let cursor = computedThrough ? addDays(computedThrough, 1) : (startDate || earliestAllowed);
    if (cursor < earliestAllowed) cursor = earliestAllowed;
    if (cursor > yesterday) return profile.saved_total_kcal || 0; // 정산할 새 날짜 없음

    const [mealsRes, workoutsRes] = await Promise.all([
        client.query('SELECT eaten_date, kcal, description FROM meals WHERE user_id = $1 AND eaten_date BETWEEN $2 AND $3', [userId, cursor, yesterday]),
        client.query('SELECT performed_date, kcal FROM workouts WHERE user_id = $1 AND performed_date BETWEEN $2 AND $3', [userId, cursor, yesterday]),
    ]);

    const mealsByDate = {}, workoutsByDate = {};
    mealsRes.rows.forEach(m => { const k = toDateStr(m.eaten_date); (mealsByDate[k] = mealsByDate[k] || []).push(m); });
    workoutsRes.rows.forEach(w => { const k = toDateStr(w.performed_date); (workoutsByDate[k] = workoutsByDate[k] || []).push(w); });
    const normPeriods = (periods || []).map(p => ({ start_date: toDateStr(p.start_date), duration_days: p.duration_days }));

    let delta = 0;
    for (let d = cursor; d <= yesterday; d = addDays(d, 1)) {
        const dayMeals = (mealsByDate[d] || []).filter(m => m.description);
        if (!dayMeals.length) continue; // 그날 식사 기록이 없으면 정산에서 제외
        const mealsKcal = dayMeals.reduce((a, m) => a + (m.kcal || 0), 0);
        const workoutsKcal = (workoutsByDate[d] || []).reduce((a, w) => a + (w.kcal || 0), 0);
        const netKcal = mealsKcal - workoutsKcal;
        const dayGoal = Math.round(profile.daily_kcal_target * phaseRatioForDate(normPeriods, profile.cycle_len, d));
        if (netKcal < dayGoal) delta += (dayGoal - netKcal);
    }

    const newTotal = (profile.saved_total_kcal || 0) + delta;
    await client.query(
        'UPDATE profiles SET saved_total_kcal = $1, saved_total_computed_through = $2 WHERE user_id = $3',
        [newTotal, yesterday, userId]
    );
    if (delta) console.log('[DATA] rolloverSavedTotal userId:', userId, { cursor, yesterday, delta, newTotal });
    return newTotal;
}

// 데이터 로드 (GET /api/data)
router.get('/', async (req, res) => {
    const { userId } = req.user;
    console.log('[DATA] GET / - loading data for userId:', userId);
    const client = await pool.connect();

    try {
        const today = todayKST();

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

        // 어제까지 정산 안 된 세이브 칼로리가 있으면 여기서 한꺼번에 적립
        const profile = profileRes.rows[0] || null;
        if (profile) profile.saved_total_kcal = await rolloverSavedTotal(client, userId, profile, periodsRes.rows);

        // 월별/최근 일기
        const diariesRes = await client.query('SELECT * FROM diaries WHERE user_id = $1 ORDER BY written_date DESC LIMIT 30', [userId]);

        // 최근 수면 기록 / 운동 기록 (이번주 시각화용). 운동은 하루에 여러 건 가능해서 "행 개수"가 아니라
        // "최근 14일" 기준으로 가져와야 특정 날 여러 번 기록했다고 다른 날짜가 밀려나지 않는다.
        const sleepLogsRes = await client.query('SELECT * FROM sleep_logs WHERE user_id = $1 ORDER BY log_date DESC LIMIT 14', [userId]);
        const workoutHistoryRes = await client.query(
            "SELECT * FROM workouts WHERE user_id = $1 AND performed_date >= (CURRENT_DATE - INTERVAL '13 days') ORDER BY performed_date ASC, logged_time ASC",
            [userId]);

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
            profile,
            meals: mealsRes.rows,
            workoutsToday: workoutsRes.rows,
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

// 치팅데이 세이브 칼로리 사용 — 치팅 음식을 고르면 그만큼 saved_total_kcal에서 차감한다.
router.post('/saved-total/spend', async (req, res) => {
    const { userId } = req.user;
    const amount = parseInt(req.body.amount, 10);
    console.log('[DATA] POST /saved-total/spend for userId:', userId, { amount });
    if (!Number.isInteger(amount) || amount <= 0) {
        return res.status(400).json({ error: 'invalid_amount' });
    }
    try {
        const r = await pool.query(
            'UPDATE profiles SET saved_total_kcal = GREATEST(saved_total_kcal - $1, 0) WHERE user_id = $2 RETURNING saved_total_kcal',
            [amount, userId]
        );
        if (!r.rows.length) return res.status(404).json({ error: 'profile_not_found' });
        res.json({ success: true, saved_total_kcal: r.rows[0].saved_total_kcal });
    } catch (err) {
        console.error('[DATA] POST /saved-total/spend failed for userId:', userId, err);
        res.status(500).json({ error: err.message });
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
    const { eaten_date, label, time, foods, bg_pre, bg_1h, bg_2h, description, ai_estimate, kcal } = req.body;
    console.log('[DATA] POST /meals for userId:', userId, { eaten_date, label, time, bg_pre, bg_1h, bg_2h, description, kcal });
    try {
        const today = eaten_date || todayKST();
        const exist = await pool.query('SELECT id FROM meals WHERE user_id=$1 AND eaten_date=$2 AND label=$3', [userId, today, label]);
        let row;
        if (exist.rows.length > 0) {
            console.log('[DATA] Existing meal slot found, updating id:', exist.rows[0].id);
            const r = await pool.query(
                `UPDATE meals SET time=$1, foods=$2, bg_pre=$3, bg_1h=$4, bg_2h=$5, description=$6, ai_estimate=$7, kcal=$8 WHERE id=$9 RETURNING *`,
                [time, JSON.stringify(foods), bg_pre, bg_1h, bg_2h, description || null, ai_estimate ? JSON.stringify(ai_estimate) : null, kcal ?? null, exist.rows[0].id]);
            row = r.rows[0];
        } else {
            console.log('[DATA] No existing meal slot, inserting new row');
            const r = await pool.query(
                `INSERT INTO meals (user_id, eaten_date, label, time, foods, bg_pre, bg_1h, bg_2h, description, ai_estimate, kcal)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
                [userId, today, label, time, JSON.stringify(foods), bg_pre, bg_1h, bg_2h, description || null, ai_estimate ? JSON.stringify(ai_estimate) : null, kcal ?? null]);
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

// 운동 기록 추가 — 하루에 저/중/고강도 운동을 여러 번 할 수 있어 매번 새 행을 추가한다
// (인슐린의 식사 기록처럼 리스트에 계속 추가되는 구조. 예전엔 날짜당 1행 UPSERT라
// 하루에 두 번째 운동을 기록하면 첫 번째 기록을 덮어썼다).
router.post('/workouts', async (req, res) => {
    const { userId } = req.user;
    const { performed_date, logged_time, intensity, duration_min, exercise_type, body_part, routine_name, kcal } = req.body;
    console.log('[DATA] POST /workouts for userId:', userId, { performed_date, logged_time, intensity, duration_min, exercise_type, body_part, routine_name, kcal });
    try {
        const today = performed_date || todayKST();
        const r = await pool.query(
            `INSERT INTO workouts (user_id, performed_date, logged_time, intensity, duration_min, exercise_type, body_part, routine_name, kcal)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [userId, today, logged_time || null, intensity ?? null, duration_min ?? null, exercise_type ?? null, body_part ?? null, routine_name ?? null, kcal ?? null]);
        console.log('[DATA] POST /workouts success, id:', r.rows[0].id);
        res.json({ success: true, workout: r.rows[0] });
    } catch (err) {
        console.error('[DATA] POST /workouts failed for userId:', userId, err);
        res.status(500).json({ error: err.message });
    }
});

// 운동 기록 삭제
router.delete('/workouts/:id', async (req, res) => {
    const { userId } = req.user;
    const { id } = req.params;
    console.log('[DATA] DELETE /workouts/:id for userId:', userId, 'id:', id);
    try {
        await pool.query('DELETE FROM workouts WHERE id = $1 AND user_id = $2', [id, userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('[DATA] DELETE /workouts/:id failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// 수면 기록 저장 (UPSERT)
router.post('/sleep', async (req, res) => {
    const { userId } = req.user;
    const { log_date, bedtime, wake_time, hours } = req.body;
    console.log('[DATA] POST /sleep for userId:', userId, { log_date, bedtime, wake_time, hours });
    try {
        const today = log_date || todayKST();
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
        const today = check_date || todayKST();
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
        const today = logged_date || todayKST();
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

// 일기 저장 (UPSERT) — 예전엔 매번 새 행을 INSERT해서 같은 날 두 번째로 저장하면 어느 행이
// "오늘 쓴 일기"인지 알 수 없었다. 하루 1건으로 합쳐서 다시 열었을 때 이어서 수정할 수 있게 한다.
router.post('/diaries', async (req, res) => {
    const { userId } = req.user;
    const { written_date, content } = req.body;
    console.log('[DATA] POST /diaries for userId:', userId, { written_date, contentLength: content?.length });
    try {
        const today = written_date || todayKST();
        await pool.query(`
      INSERT INTO diaries (user_id, written_date, content)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, written_date)
      DO UPDATE SET content = EXCLUDED.content
    `, [userId, today, content]);
        console.log('[DATA] POST /diaries success for userId:', userId);
        res.json({ success: true });
    } catch (err) {
        console.error('[DATA] POST /diaries failed for userId:', userId, err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
