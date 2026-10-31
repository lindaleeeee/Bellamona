// ═══════════════════════════════ DATA LAYER (Firebase) ═══════════════════════════════
// 예전에는 클라우드타입 서버(Express + PostgreSQL)가 /api/... 요청을 받아 처리했다. 그 서버는 무료
// 플랜에서 자꾸 꺼져서, 서버 없이 브라우저에서 바로 Firebase(Authentication + Firestore)를 쓰도록 바꿨다.
//
// 기존 화면 코드(app.html)는 fetchApi(apiUrl('/api/...'))를 그대로 부르고, 아래 _route()가 그 요청을
// 받아 서버가 하던 일을 Firestore로 똑같이 처리한 뒤 서버와 같은 모양의 응답(Response)을 돌려준다.
// 그래서 화면 코드는 거의 고칠 필요가 없다.
//
// 유일하게 서버가 남는 곳은 AI 리포트(Gemini 키는 비밀이라 브라우저에 둘 수 없음)뿐이고,
// 그건 Vercel 함수(frontend/api/report.js)가 처리한다. Vercel 함수는 꺼지지 않는다.
//
// Firestore 구조 (전부 users/{uid} 아래에 사용자별로 저장):
//   users/{uid}                  name, avatar, friend_code
//   users/{uid}/profile/main     온보딩 프로필 + 세이브 칼로리 정산 상태
//   users/{uid}/meals/{date_라벨} 식사 (같은 날짜+끼니면 덮어씀)
//   users/{uid}/workouts/{자동}   운동 (하루 여러 건)
//   users/{uid}/sleep_logs/{date}, routine_checks/{date}, diaries/{date}, reports/{date}
//   users/{uid}/weights/{자동}, periods/{자동}
//   users/{uid}/friends/{친구uid}
//   friendCodes/{BELLA-XXXX}     { uid }  친구 코드 → 사용자 찾기용

const FB = (() => {
  try {
    const cfg = window.FIREBASE_CONFIG || {};
    if (!cfg.apiKey || String(cfg.apiKey).startsWith('%')) {
      console.error('[firebase] FIREBASE_CONFIG가 비어 있습니다. Vercel 환경변수(VITE_FIREBASE_*)를 확인하세요.');
      return null;
    }
    firebase.initializeApp(cfg);
    const db = firebase.firestore();
    try { db.settings({ ignoreUndefinedProperties: true }); } catch (e) { }
    return { auth: firebase.auth(), db };
  } catch (e) {
    console.error('[firebase init]', e);
    return null;
  }
})();

let _authUser = null;
let _resolveAuthReady;
const _authReady = new Promise(r => { _resolveAuthReady = r; });
if (FB) {
  FB.auth.onAuthStateChanged(u => {
    _authUser = u;
    if (u) { try { localStorage.setItem('bellamona_token', '1'); } catch (e) { } } // 소개 페이지의 "앱 열기" 버튼 표시용
    _resolveAuthReady(u);
  });
} else {
  _resolveAuthReady(null);
}

// 기존 코드 호환: apiUrl은 경로를 그대로 돌려주고, fetchApi가 그 경로를 _route로 보낸다.
function apiUrl(path) { return path; }

function fetchApi(url, options = {}) {
  // 세션이 없으면(로그아웃 상태) 앱 화면에 남지 않고 로그인 화면으로 보낸다(app.html의 onSessionExpired).
  return _route((options.method || 'GET').toUpperCase(), url, options.body).then(res => {
    if ((res.status === 401 || res.status === 403) && typeof onSessionExpired === "function") onSessionExpired();
    return res;
  });
}

function _resp(status, body) {
  return new Response(JSON.stringify(body == null ? {} : body), { status, headers: { 'Content-Type': 'application/json' } });
}

function _uid() { return _authUser && _authUser.uid; }
function _userRef(uid) { return FB.db.collection('users').doc(uid || _uid()); }
function _sub(name, uid) { return _userRef(uid).collection(name); }
function _jsonOrNull(s) { if (s == null || s === '') return null; if (typeof s !== 'string') return s; try { return JSON.parse(s); } catch (e) { return null; } }
function _toJson(v) { return v == null ? null : JSON.stringify(v); }

// 'YYYY-MM-DD'에 n일을 더한다(순수 날짜 계산).
function _addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}
function _diffDays(a, b) { return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000); }
const _DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── 생리주기 단계별 목표 칼로리 비율 (app.html의 phaseFromPeriod/PHASE_CAL_RATIO와 같은 공식) ──
const _PHASE_CAL_RATIO = { follicular: 1.00, ovulation: 1.00, luteal: 1.10, menstrual: 1.05, unknown: 1.00 };
function _phaseRatioForDate(periods, cycleLen, dateStr) {
  const target = new Date(dateStr + 'T00:00:00.000Z');
  const applicable = (periods || [])
    .filter(p => new Date(p.start_date + 'T00:00:00.000Z') <= target)
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
  if (!applicable.length) return _PHASE_CAL_RATIO.unknown;
  const p = applicable[applicable.length - 1];
  const start = new Date(p.start_date + 'T00:00:00.000Z');
  const totalDays = Math.floor((target - start) / 86400000);
  if (totalDays < 0) return _PHASE_CAL_RATIO.unknown;
  const cl = cycleLen || 28;
  const days = p.duration_days || 5;
  const dayIdx = totalDays % cl;
  if (dayIdx < days) return _PHASE_CAL_RATIO.menstrual;
  if (dayIdx >= cl - 18 && dayIdx <= cl - 10) return _PHASE_CAL_RATIO.ovulation;
  if (dayIdx >= cl - 9) return _PHASE_CAL_RATIO.luteal;
  return _PHASE_CAL_RATIO.follicular;
}

// ── 문서 → 예전 서버 응답과 같은 모양으로 ──
function _mealOut(doc) {
  const m = doc.data();
  return { id: doc.id, eaten_date: m.eaten_date, label: m.label, time: m.time, foods: _jsonOrNull(m.foods) || [],
    description: m.description ?? null, ai_estimate: _jsonOrNull(m.ai_estimate), kcal: m.kcal ?? null,
    bg_pre: m.bg_pre ?? null, bg_1h: m.bg_1h ?? null, bg_2h: m.bg_2h ?? null };
}
function _workoutOut(doc) { return Object.assign({ id: doc.id }, doc.data()); }
function _profileOut(p) {
  if (!p) return null;
  return Object.assign({}, p, { supplements: _jsonOrNull(p.supplements) });
}
function _periodsOf(snap) {
  return snap.docs.map(d => d.data()).sort((a, b) => (a.start_date > b.start_date ? 1 : a.start_date < b.start_date ? -1 : 0));
}

// ── 연속 기록일 (루틴 체크를 저장한 날짜 기준) ──
let _checkDates = null; // 이번 세션에서 한 번 읽어두고 체크 저장 때마다 갱신(읽기 횟수 절약)
async function _loadCheckDates() {
  if (_checkDates) return _checkDates;
  const snap = await _sub('routine_checks').get();
  _checkDates = new Set(snap.docs.map(d => d.id));
  return _checkDates;
}
function _computeStreak(dates) {
  const today = todayISO();
  let streakDays = 0, gapDays = 0;
  if (dates.size > 0) {
    // 오늘 아직 기록을 안 했어도 어제까지 이어졌으면 연속으로 본다
    let cursor = dates.has(today) ? today : _addDays(today, -1);
    while (dates.has(cursor)) { streakDays++; cursor = _addDays(cursor, -1); }
    const last = [...dates].sort().pop();
    gapDays = Math.max(_diffDays(today, last), 0);
  }
  return { streakDays, gapDays, totalLoggedDays: dates.size };
}

// ── 세이브 칼로리 정산 / 칼로리 미달 집계 공용 ──
async function _dailyMealsWorkouts(from, to) {
  const [ms, ws] = await Promise.all([
    _sub('meals').where('eaten_date', '>=', from).get(),
    _sub('workouts').where('performed_date', '>=', from).get(),
  ]);
  const mealsByDate = {}, workoutsByDate = {};
  ms.docs.forEach(d => { const m = d.data(); if (m.eaten_date > to) return; (mealsByDate[m.eaten_date] = mealsByDate[m.eaten_date] || []).push(m); });
  ws.docs.forEach(d => { const w = d.data(); if (w.performed_date > to) return; (workoutsByDate[w.performed_date] = workoutsByDate[w.performed_date] || []).push(w); });
  return { mealsByDate, workoutsByDate };
}
// 식사 기록이 없는 날은 null(정산/집계 제외) — 안 그러면 순섭취 0이라 "덜 먹은 날"로 잘못 잡힌다.
function _dayNetVsGoal(mealsByDate, workoutsByDate, profile, periods, date) {
  const dayMeals = (mealsByDate[date] || []).filter(m => m.description);
  if (!dayMeals.length) return null;
  const mealsKcal = dayMeals.reduce((a, m) => a + (m.kcal || 0), 0);
  const workoutsKcal = (workoutsByDate[date] || []).reduce((a, w) => a + (w.kcal || 0), 0);
  const netKcal = mealsKcal - workoutsKcal;
  const dayGoal = Math.round(profile.daily_kcal_target * _phaseRatioForDate(periods, profile.cycle_len, date));
  return { netKcal, dayGoal, met: netKcal >= dayGoal };
}
// 어제까지 정산 안 된 날짜의 "목표보다 덜 먹은 만큼"을 치팅데이 세이브 칼로리에 적립한다.
async function _rolloverSavedTotal(profile, periods) {
  if (!profile || profile.daily_kcal_target == null) return profile ? (profile.saved_total_kcal || 0) : 0;
  const yesterday = _addDays(todayISO(), -1);
  const earliest = _addDays(yesterday, -59); // 최대 60일까지만 소급
  let cursor = profile.saved_total_computed_through ? _addDays(profile.saved_total_computed_through, 1) : (profile.start_date || earliest);
  if (cursor < earliest) cursor = earliest;
  if (cursor > yesterday) return profile.saved_total_kcal || 0;
  const { mealsByDate, workoutsByDate } = await _dailyMealsWorkouts(cursor, yesterday);
  let delta = 0;
  for (let d = cursor; d <= yesterday; d = _addDays(d, 1)) {
    const info = _dayNetVsGoal(mealsByDate, workoutsByDate, profile, periods, d);
    if (info && !info.met) delta += (info.dayGoal - info.netKcal);
  }
  const newTotal = (profile.saved_total_kcal || 0) + delta;
  await _sub('profile').doc('main').set({ saved_total_kcal: newTotal, saved_total_computed_through: yesterday }, { merge: true });
  return newTotal;
}

// ── 로그인한 사용자의 users 문서 + 친구 코드 준비 ──
const _FRIEND_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O, 1/I 제외
function _genFriendCode() {
  let c = '';
  for (let i = 0; i < 4; i++) c += _FRIEND_CODE_CHARS[Math.floor(Math.random() * _FRIEND_CODE_CHARS.length)];
  return `BELLA-${c}`;
}
async function _ensureUserDoc(user) {
  const ref = _userRef(user.uid);
  const snap = await ref.get();
  const cur = snap.exists ? snap.data() : {};
  if (cur.friend_code) {
    if (user.displayName && cur.name !== user.displayName) await ref.set({ name: user.displayName }, { merge: true });
    return;
  }
  for (let i = 0; i < 5; i++) {
    const code = _genFriendCode();
    try {
      await FB.db.runTransaction(async tx => {
        const cref = FB.db.collection('friendCodes').doc(code);
        if ((await tx.get(cref)).exists) throw new Error('code_taken');
        tx.set(cref, { uid: user.uid });
        tx.set(ref, {
          name: cur.name || user.displayName || '사용자',
          avatar: cur.avatar || user.photoURL || '',
          friend_code: code,
          created_at: Date.now()
        }, { merge: true });
      });
      return;
    } catch (e) {
      if (e.message !== 'code_taken') throw e;
    }
  }
  throw new Error('friend_code_failed');
}

async function _deleteCollection(colRef) {
  const snap = await colRef.get();
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = FB.db.batch();
    snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}

// ═══════════════ 예전 서버 API를 그대로 흉내 내는 라우터 ═══════════════
async function _route(method, url, rawBody) {
  await _authReady;
  const [path, qs = ''] = String(url).split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  let body = {};
  try { body = rawBody ? JSON.parse(rawBody) : {}; } catch (e) { body = {}; }

  if (method === 'POST' && path === '/api/auth/logout') {
    _checkDates = null;
    if (FB) await FB.auth.signOut().catch(() => { });
    return _resp(200, { success: true });
  }
  if (!FB || !_authUser) return _resp(401, { error: 'unauthorized' });

  try {
    const today = todayISO();

    // ── /api/data ─────────────────────────────
    if (method === 'GET' && path === '/api/data') {
      let userSnap = await _userRef().get();
      if (!userSnap.exists || !userSnap.data().friend_code) { await _ensureUserDoc(_authUser); userSnap = await _userRef().get(); }
      const [profSnap, mealsSnap, wTodaySnap, checksSnap, weightsSnap, periodsSnap, diariesSnap, sleepSnap, whSnap] = await Promise.all([
        _sub('profile').doc('main').get(),
        _sub('meals').where('eaten_date', '==', today).get(),
        _sub('workouts').where('performed_date', '==', today).get(),
        _sub('routine_checks').doc(today).get(),
        _sub('weights').get(),
        _sub('periods').get(),
        _sub('diaries').orderBy('written_date', 'desc').limit(30).get(),
        _sub('sleep_logs').orderBy('log_date', 'desc').limit(14).get(),
        _sub('workouts').where('performed_date', '>=', _addDays(today, -13)).get(),
      ]);
      const periods = _periodsOf(periodsSnap);
      let profile = profSnap.exists ? _profileOut(profSnap.data()) : null;
      if (profile) profile.saved_total_kcal = await _rolloverSavedTotal(profile, periods);
      const u = userSnap.data() || {};
      const byTime = (a, b) => (a.performed_date + (a.logged_time || '')).localeCompare(b.performed_date + (b.logged_time || ''));
      return _resp(200, {
        user: { name: u.name, avatar: u.avatar, friend_code: u.friend_code },
        profile,
        meals: mealsSnap.docs.map(_mealOut),
        workoutsToday: wTodaySnap.docs.map(_workoutOut),
        checks: checksSnap.exists ? (checksSnap.data().checks || {}) : {},
        weights: weightsSnap.docs.map(d => d.data()).sort((a, b) => a.logged_date.localeCompare(b.logged_date) || (a.created_at || 0) - (b.created_at || 0)),
        periods,
        diaries: diariesSnap.docs.map(d => d.data()),
        sleepLogs: sleepSnap.docs.map(d => d.data()),
        workoutHistory: whSnap.docs.map(_workoutOut).sort(byTime)
      });
    }

    if (method === 'GET' && path === '/api/data/streak') {
      return _resp(200, _computeStreak(await _loadCheckDates()));
    }

    if (method === 'GET' && path === '/api/data/day') {
      const date = query.date;
      if (!date || !_DATE_RE.test(date)) return _resp(400, { error: 'invalid_date' });
      const [cS, mS, wS, wtS, dS, pS] = await Promise.all([
        _sub('routine_checks').doc(date).get(),
        _sub('meals').where('eaten_date', '==', date).get(),
        _sub('workouts').where('performed_date', '==', date).get(),
        _sub('weights').where('logged_date', '==', date).get(),
        _sub('diaries').doc(date).get(),
        _sub('periods').get(),
      ]);
      const checks = cS.exists ? (cS.data().checks || null) : null;
      const meals = mS.docs.map(_mealOut);
      const workouts = wS.docs.map(_workoutOut);
      const wts = wtS.docs.map(d => d.data()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      const weight = wts.length ? wts[0].weight_kg : null;
      const diary = dS.exists ? dS.data().content : null;
      const period = _periodsOf(pS).filter(p => p.start_date <= date).pop() || null;
      const hasAnyRecord = !!checks || meals.length > 0 || workouts.length > 0 || weight != null || !!diary;
      return _resp(200, { date, checks, meals, workouts, weight, diary, period, hasAnyRecord });
    }

    if (method === 'GET' && path === '/api/data/month-summary') {
      const year = parseInt(query.year, 10), month = parseInt(query.month, 10);
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return _resp(400, { error: 'invalid_year_month' });
      const mm = String(month).padStart(2, '0');
      const start = `${year}-${mm}-01`;
      const end = `${year}-${mm}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
      const snap = await _sub('routine_checks').where('check_date', '>=', start).where('check_date', '<=', end).get();
      const days = snap.docs.map(d => ({ date: d.id, checks: d.data().checks })).sort((a, b) => a.date.localeCompare(b.date));
      return _resp(200, { year, month, days });
    }

    if (method === 'GET' && path === '/api/data/calorie-miss-summary') {
      const empty = { totalDaysTracked: 0, missedDays: 0, reasons: {} };
      const pSnap = await _sub('profile').doc('main').get();
      const profile = pSnap.exists ? pSnap.data() : null;
      if (!profile || profile.daily_kcal_target == null) return _resp(200, empty);
      const yesterday = _addDays(today, -1);
      const earliest = _addDays(yesterday, -59);
      const from = profile.start_date && profile.start_date > earliest ? profile.start_date : earliest;
      if (from > yesterday) return _resp(200, empty);
      const [periodsSnap, checksSnap, { mealsByDate, workoutsByDate }] = await Promise.all([
        _sub('periods').get(),
        _sub('routine_checks').where('check_date', '>=', from).get(),
        _dailyMealsWorkouts(from, yesterday),
      ]);
      const periods = _periodsOf(periodsSnap);
      const reasonByDate = {};
      checksSnap.docs.forEach(d => { const c = d.data().checks; if (c && c.calMissReason) reasonByDate[d.id] = c.calMissReason; });
      let totalDaysTracked = 0, missedDays = 0; const reasons = {};
      for (let d = from; d <= yesterday; d = _addDays(d, 1)) {
        const info = _dayNetVsGoal(mealsByDate, workoutsByDate, profile, periods, d);
        if (!info) continue;
        totalDaysTracked++;
        if (!info.met) { missedDays++; const r = reasonByDate[d] || 'unspecified'; reasons[r] = (reasons[r] || 0) + 1; }
      }
      return _resp(200, { totalDaysTracked, missedDays, reasons });
    }

    if (method === 'POST' && path === '/api/data/saved-total/spend') {
      const amount = parseInt(body.amount, 10);
      if (!Number.isInteger(amount) || amount <= 0) return _resp(400, { error: 'invalid_amount' });
      const ref = _sub('profile').doc('main');
      const total = await FB.db.runTransaction(async tx => {
        const s = await tx.get(ref);
        if (!s.exists) return null;
        const v = Math.max((s.data().saved_total_kcal || 0) - amount, 0);
        tx.set(ref, { saved_total_kcal: v }, { merge: true });
        return v;
      });
      if (total == null) return _resp(404, { error: 'profile_not_found' });
      return _resp(200, { success: true, saved_total_kcal: total });
    }

    if (method === 'POST' && path === '/api/data/profiles') {
      const b = body;
      const doc = {
        height_cm: b.height_cm ?? null, weight_kg: b.weight_kg ?? null, goal_weight_kg: b.goal_weight_kg ?? null,
        goal_months: b.goal_months ?? null, daily_kcal_target: b.daily_kcal_target ?? null, cycle_len: b.cycle_len ?? null,
        start_date: b.start_date || null, goal_date: b.goal_date || null, gender: b.gender || null,
        report_time: b.report_time || null, updated_at: Date.now()
      };
      if (b.supplements != null) doc.supplements = _toJson(b.supplements); // 안 보내면 기존 값 유지
      await _sub('profile').doc('main').set(doc, { merge: true });
      return _resp(200, { success: true });
    }

    if (method === 'POST' && path === '/api/data/meals') {
      const b = body;
      const date = b.eaten_date || today;
      const id = `${date}_${encodeURIComponent(b.label || '')}`; // 같은 날짜+끼니면 덮어쓴다
      const ref = _sub('meals').doc(id);
      await ref.set({
        eaten_date: date, label: b.label || '', time: b.time || null, foods: _toJson(b.foods || []),
        bg_pre: b.bg_pre ?? null, bg_1h: b.bg_1h ?? null, bg_2h: b.bg_2h ?? null,
        description: b.description || null, ai_estimate: _toJson(b.ai_estimate), kcal: b.kcal ?? null
      });
      return _resp(200, { success: true, meal: _mealOut(await ref.get()) });
    }
    if (method === 'DELETE' && path.startsWith('/api/data/meals/')) {
      await _sub('meals').doc(path.slice('/api/data/meals/'.length)).delete();
      return _resp(200, { success: true });
    }

    if (method === 'POST' && path === '/api/data/workouts') {
      const b = body;
      const row = {
        performed_date: b.performed_date || today, logged_time: b.logged_time || null, intensity: b.intensity ?? null,
        duration_min: b.duration_min ?? null, exercise_type: b.exercise_type ?? null, body_part: b.body_part ?? null,
        routine_name: b.routine_name ?? null, kcal: b.kcal ?? null, created_at: Date.now()
      };
      const ref = await _sub('workouts').add(row);
      return _resp(200, { success: true, workout: Object.assign({ id: ref.id }, row) });
    }
    if (method === 'DELETE' && path.startsWith('/api/data/workouts/')) {
      await _sub('workouts').doc(path.slice('/api/data/workouts/'.length)).delete();
      return _resp(200, { success: true });
    }

    if (method === 'POST' && path === '/api/data/sleep') {
      const date = body.log_date || today;
      await _sub('sleep_logs').doc(date).set({ log_date: date, bedtime: body.bedtime || null, wake_time: body.wake_time || null, hours: body.hours || null });
      return _resp(200, { success: true });
    }

    if (method === 'POST' && path === '/api/data/checks') {
      const date = body.check_date || today;
      await _sub('routine_checks').doc(date).set({ check_date: date, checks: body.checks || {} });
      if (_checkDates) _checkDates.add(date);
      return _resp(200, { success: true });
    }

    if (method === 'POST' && path === '/api/data/weights') {
      await _sub('weights').add({ logged_date: body.logged_date || today, weight_kg: body.weight_kg, created_at: Date.now() });
      return _resp(200, { success: true });
    }

    if (method === 'POST' && path === '/api/data/periods') {
      await _sub('periods').add({ start_date: body.start_date, duration_days: body.duration_days, created_at: Date.now() });
      return _resp(200, { success: true });
    }

    if (method === 'POST' && path === '/api/data/diaries') {
      const date = body.written_date || today;
      await _sub('diaries').doc(date).set({ written_date: date, content: body.content || '' });
      return _resp(200, { success: true });
    }

    // ── /api/user ─────────────────────────────
    if (method === 'PATCH' && path === '/api/user/avatar') {
      const a = body.avatar;
      if (!a || typeof a !== 'string' || a.length > 8) return _resp(400, { error: 'Invalid avatar' });
      await _userRef().set({ avatar: a }, { merge: true });
      return _resp(200, { success: true });
    }

    if (method === 'GET' && path === '/api/user/friends') {
      const fsnap = await _sub('friends').get();
      const list = await Promise.all(fsnap.docs.map(async d => {
        const fid = d.id;
        try {
          const uref = _userRef(fid);
          const [u, c, recent] = await Promise.all([
            uref.get(),
            uref.collection('routine_checks').doc(today).get(),
            uref.collection('routine_checks').orderBy('check_date', 'desc').limit(90).get(),
          ]);
          if (!u.exists) return null;
          return {
            id: fid, name: u.data().name, avatar: u.data().avatar || '🦋',
            todayChecks: c.exists ? (c.data().checks || null) : null,
            streakDays: _computeStreak(new Set(recent.docs.map(x => x.id))).streakDays,
            _t: d.data().created_at || 0
          };
        } catch (e) { return null; } // 상대가 탈퇴해서 더 이상 볼 수 없는 경우
      }));
      const friends = list.filter(Boolean).sort((a, b) => a._t - b._t).map(({ _t, ...f }) => f);
      return _resp(200, { friends });
    }

    if (method === 'POST' && path === '/api/user/friends') {
      const code = String(body.code || '').trim().toUpperCase();
      if (!code) return _resp(400, { error: 'code_required' });
      const cs = await FB.db.collection('friendCodes').doc(code).get();
      if (!cs.exists) return _resp(404, { error: 'not_found' });
      const target = cs.data().uid;
      if (target === _uid()) return _resp(400, { error: 'self' });
      // 나<->상대 양방향으로 넣어서 서로의 목록에 보이게 한다. via_code는 보안 규칙이
      // "코드를 실제로 알고 추가한 것인지" 확인하는 데 쓴다.
      const now = Date.now();
      const batch = FB.db.batch();
      batch.set(_sub('friends').doc(target), { created_at: now, via_code: code });
      batch.set(_sub('friends', target).doc(_uid()), { created_at: now, via_code: code });
      await batch.commit();
      const t = await _userRef(target).get().catch(() => null);
      const td = t && t.exists ? t.data() : {};
      return _resp(200, { success: true, friend: { id: target, name: td.name || '', avatar: td.avatar || '🦋' } });
    }

    if (method === 'DELETE' && path === '/api/user/withdraw') {
      // 회원 탈퇴: 이 사용자의 기록을 전부 지운다.
      const me = _uid();
      const uSnap = await _userRef().get();
      const code = uSnap.exists ? uSnap.data().friend_code : null;
      const fSnap = await _sub('friends').get();
      await Promise.all(fSnap.docs.map(d => _sub('friends', d.id).doc(me).delete().catch(() => { })));
      for (const c of ['meals', 'workouts', 'sleep_logs', 'routine_checks', 'weights', 'periods', 'diaries', 'reports', 'profile', 'friends']) {
        await _deleteCollection(_sub(c));
      }
      if (code) await FB.db.collection('friendCodes').doc(code).delete().catch(() => { });
      await _userRef().delete();
      _checkDates = null;
      try { await _authUser.delete(); } catch (e) { await FB.auth.signOut().catch(() => { }); }
      return _resp(200, { success: true });
    }

    // ── /api/report ─────────────────────────────
    // 저장된 리포트는 Firestore에서 바로 읽고, 새로 만들 때만 Vercel 함수(/api/report)로 Gemini를 부른다.
    if (method === 'GET' && path.startsWith('/api/report/')) {
      const date = path.slice('/api/report/'.length);
      if (!_DATE_RE.test(date)) return _resp(400, { success: false, error: 'invalid date' });
      const s = await _sub('reports').doc(date).get();
      if (!s.exists) return _resp(200, { success: false });
      return _resp(200, { success: true, report: _jsonOrNull(s.data().content), cached: true });
    }
    if (method === 'POST' && path === '/api/report') {
      const data = body.data;
      if (!data) return _resp(400, { success: false, error: 'No data provided' });
      const reportDate = data.date;
      if (reportDate && !body.force) {
        const s = await _sub('reports').doc(reportDate).get();
        if (s.exists) return _resp(200, { success: true, report: _jsonOrNull(s.data().content), cached: true });
      }
      const idToken = await _authUser.getIdToken();
      const r = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ data })
      });
      const json = await r.json().catch(() => null);
      if (!r.ok || !json) return _resp(r.status || 500, { success: false });
      // Gemini가 실제로 성공한 리포트만 저장(실패 시 기본 안내문은 저장하지 않음) — 같은 날 다시 열면 재사용
      if (json.success && json.report && !json.report.degraded && reportDate && _DATE_RE.test(reportDate)) {
        await _sub('reports').doc(reportDate).set({ content: _toJson(json.report), created_at: Date.now() }).catch(e => console.error('[report save]', e));
      }
      return _resp(200, json);
    }

    return _resp(404, { error: 'not_found', path });
  } catch (e) {
    // permission-denied가 나오면 대부분 Firestore 보안 규칙을 아직 안 넣었거나 잘못 넣은 경우다.
    console.error('[data]', method, path, e && e.code, e);
    return _resp(500, { error: e && (e.code || e.message) });
  }
}

function fmtDateShort(isoDateStr) {
  if (!isoDateStr) return '';
  const d = new Date(isoDateStr);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}
// UTC가 아니라 브라우저 로컬 날짜를 써야 한다 — 한국은 UTC+9라 자정~오전9시 사이에
// toISOString() 기준으로 날짜를 뽑으면 아직 "어제" UTC 날짜가 나와, 그 시간대에 기록한 게
// 전날 날짜로 저장되는 버그가 있었다(index.html의 todayISOLocal()과 반드시 같은 방식이어야 함).
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

// ── 구글 로그인 (Firebase Authentication) ──────────────────────────────
async function doGoogleLogin() {
  if (!FB) { alert('로그인 설정이 아직 완료되지 않았어요. 잠시 후 다시 시도해주세요.'); return; }
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const cred = await FB.auth.signInWithPopup(provider);
    _authUser = cred.user;
    await _ensureUserDoc(cred.user);
  } catch (e) {
    if (e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request')) return;
    if (e && e.code === 'auth/popup-blocked') {
      // 팝업이 막힌 브라우저는 페이지 이동 방식으로 로그인한다(돌아오면 boot()의 restoreFromServer가 이어서 처리)
      try { await FB.auth.signInWithRedirect(provider); return; } catch (e2) { console.error('[login redirect]', e2); }
    }
    console.error('[doGoogleLogin]', e);
    alert('구글 로그인에 실패했습니다. 다시 시도해주세요.');
    return;
  }
  const ok = await restoreFromServer();
  if (!ok) alert('로그인 확인에 실패했습니다. 다시 시도해주세요.');
}

// ── 로그아웃 / 회원 탈퇴 ──────────────────────────────────────
function _clearLocalAuth() {
  localStorage.removeItem('bellamona_token');
  localStorage.removeItem('bellamona_data');
}

async function doLogout() {
  try {
    await fetchApi(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' });
  } catch (e) {
    console.error('[doLogout]', e);
  } finally {
    _clearLocalAuth();
    location.replace("/"); // 로그아웃하면 소개(랜딩) 페이지로
  }
}

async function doWithdraw() {
  if (!confirm('정말 탈퇴하시겠습니까? 계정이 비활성화되며 다시 로그인하기 전까지 이용할 수 없습니다.')) return;
  try {
    const res = await fetchApi(apiUrl('/api/user/withdraw'), { method: 'DELETE', credentials: 'include' });
    if (!res.ok) {
      alert('탈퇴 처리에 실패했습니다. 다시 시도해주세요.');
      return;
    }
  } catch (e) {
    console.error('[doWithdraw]', e);
    alert('탈퇴 처리에 실패했습니다. 다시 시도해주세요.');
    return;
  }
  _clearLocalAuth();
  location.replace("/");
}

// ── 로그인 후 / 새로고침 시 저장된 정보 복원 ──────────────────────
async function restoreFromServer() {
  try {
    const res = await fetchApi(apiUrl('/api/data'), { credentials: 'include' });
    if (!res.ok) return false; // 로그인 안 된 상태 - 로그인 화면 유지

    const d = await res.json();

    // 이 기기에 저장된 상태가 지금 로그인한 계정 것이 아니면(다른 계정, 또는 서버 이전 전의 옛 데이터)
    // 기본값으로 비운 뒤 Firebase에서 받은 내 기록만 채운다 — 남의/옛 기록(세이브 칼로리, 식사,
    // 체중 등)이 섞여 보이지 않게 한다.
    if (S._uid !== _uid() && typeof S_DEFAULTS !== 'undefined') {
      Object.keys(S).forEach(k => { delete S[k]; });
      Object.assign(S, JSON.parse(JSON.stringify(S_DEFAULTS)));
      const now = new Date();
      S.calMon = { y: now.getFullYear(), m: now.getMonth() };
      if (typeof SCHEMA_VERSION !== 'undefined') S._schemaVersion = SCHEMA_VERSION;
      if (typeof ensureFreshDay === 'function') ensureFreshDay();
    }
    S._uid = _uid();

    if (d.user && d.user.name) S.name = d.user.name;
    // avatar는 구글 프로필 사진 URL이 기본값으로 들어있을 수 있어(길다),
    // 사용자가 아이콘 선택 모달에서 고른 짧은 이모지일 때만 적용한다.
    if (d.user && d.user.avatar && d.user.avatar.length <= 8) {
      S.avatar = d.user.avatar;
    }
    if (d.user && d.user.friend_code) S.friendCode = d.user.friend_code;

    if (d.profile) {
      if (d.profile.weight_kg != null) S.initWeight = Number(d.profile.weight_kg);
      if (d.profile.goal_weight_kg != null) S.goalWeight = Number(d.profile.goal_weight_kg);
      if (d.profile.goal_months != null) S.goalMonths = d.profile.goal_months;
      if (d.profile.daily_kcal_target != null) S.goalCal = d.profile.daily_kcal_target;
      if (d.profile.cycle_len != null) S.cycleLen = d.profile.cycle_len;
      if (d.profile.height_cm != null) S.heightCm = Number(d.profile.height_cm);
      if (d.profile.start_date) S.startDate = new Date(d.profile.start_date).getTime();
      if (d.profile.goal_date) S.goalDate = new Date(d.profile.goal_date).getTime();
      if (d.profile.gender) S.gender = d.profile.gender;
      // 세이브(치팅) 칼로리는 서버가 로그인/새로고침마다 전날까지 정산해서 내려주는 값이 항상 정답이라
      // 로컬 값과 병합하지 않고 그대로 덮어쓴다.
      S.savedTotal = Number(d.profile.saved_total_kcal || 0);
    }

    if (d.weights && d.weights.length) {
      S.weights = d.weights.map(w => ({ d: fmtDateShort(w.logged_date), w: Number(w.weight_kg), t: new Date(w.logged_date).getTime() }));
    }

    if (d.periods && d.periods.length) {
      S.periods = d.periods.map(p => ({ start: (p.start_date + '').slice(0, 10), days: p.duration_days }));
    }

    if (typeof ensureFreshDay === 'function') ensureFreshDay(); // 날짜가 바뀌었으면 옛 날짜의 체크를 먼저 비우고 서버 값을 채운다
    if (d.checks) S.checks = Object.assign({}, S.checks, d.checks);

    if (d.diaries && d.diaries.length) {
      S.diaries = d.diaries.slice().reverse().map(x => ({ date: (x.written_date + '').slice(0, 10), d: fmtDateShort(x.written_date), t: x.content }));
    }

    if (d.meals && d.meals.length) {
      S.meals = d.meals.map((row, i) => ({
        id: i,
        serverId: row.id,
        label: row.label,
        time: (row.time || '00:00').slice(0, 5),
        foods: row.foods || [],
        text: row.description || '',
        aiEstimate: row.ai_estimate || null,
        kcal: row.kcal ?? null,
        bgPre: row.bg_pre, bg1h: row.bg_1h, bg2h: row.bg_2h
      }));
      S.nextMealId = S.meals.length;
    }

    // 운동은 하루에 여러 번 기록할 수 있는 리스트다(식사 기록과 동일한 패턴).
    // workoutHistory가 최근 14일치(오늘 포함) 전체 행을 담고 있으므로 이것만으로 S.workoutLogs를 채운다.
    if (d.workoutHistory) {
      S.workoutLogs = d.workoutHistory.filter(w => w.intensity).map(w => ({
        id: w.id, serverId: w.id, date: (w.performed_date + '').slice(0, 10), time: (w.logged_time || '00:00').slice(0, 5),
        intensity: w.intensity, durationMin: w.duration_min, exerciseType: w.exercise_type
      }));
    }
    if (d.sleepLogs && d.sleepLogs.length) {
      S.sleepLogs = d.sleepLogs.map(s => ({
        date: (s.log_date + '').slice(0, 10), bedtime: s.bedtime, wake: s.wake_time, hours: s.hours != null ? Number(s.hours) : null
      }));
    }
    if (d.profile && Array.isArray(d.profile.supplements) && d.profile.supplements.length) {
      S.routines.oxytocin = d.profile.supplements;
    }

    try {
      const streakRes = await fetchApi(apiUrl('/api/data/streak'), { credentials: 'include' });
      if (streakRes.ok) {
        const s = await streakRes.json();
        S.streakDays = s.streakDays || 0;
        S.gapDays = s.gapDays || 0;
        S.totalLoggedDays = s.totalLoggedDays || 0;
      }
    } catch (e) {
      console.error('[restoreFromServer streak]', e);
    }

    S.loggedIn = true;
    _authed = true; // index.html의 화면 가드가 보는 값 — 서버가 세션을 인정했을 때만 true
    saveState();

    if (d.profile) initMain();
    else go('s-onboard');

    if (typeof loadFriends === 'function') loadFriends(); // 친구 비교는 앱 렌더를 막을 필요 없어 기다리지 않는다

    return true;
  } catch (e) {
    console.error('[restoreFromServer]', e);
    return false;
  }
}

// ── 친구 연동 ──────────────────────────────────────────────
// 달성률 계산(overallPctForChecks, S.routines 기반)은 프론트에만 있으므로 서버는 각 친구의
// 오늘 checks 원본만 내려주고, 프론트가 "나"와 똑같은 함수로 계산해서 보여준다.
async function loadFriends() {
  try {
    const res = await fetchApi(apiUrl('/api/user/friends'), { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    S.friends = data.friends || [];
    if (typeof renderFriendsCompare === 'function') renderFriendsCompare();
    if (typeof renderFriendsModalList === 'function') renderFriendsModalList();
  } catch (e) { console.error('[loadFriends]', e); }
}
async function addFriendByCode(code) {
  try {
    const res = await fetchApi(apiUrl('/api/user/friends'), {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = data && data.error === 'not_found' ? '그런 코드를 가진 친구를 찾을 수 없어요'
        : data && data.error === 'self' ? '내 코드는 추가할 수 없어요' : '친구 추가에 실패했어요';
      return { ok: false, message: msg };
    }
    await loadFriends();
    return { ok: true };
  } catch (e) {
    console.error('[addFriendByCode]', e);
    return { ok: false, message: '네트워크 오류로 실패했어요' };
  }
}

// ── 개별 저장 훅 (기존 코드의 savePeriodRow 패턴과 동일) ──────────────
function saveProfileRow() {
  fetchApi(apiUrl('/api/data/profiles'), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      height_cm: S.heightCm || null,
      weight_kg: S.initWeight,
      goal_weight_kg: S.goalWeight,
      goal_months: S.goalMonths || (S.goalDays ? Math.round(S.goalDays / 30) : null),
      daily_kcal_target: S.goalCal,
      cycle_len: S.cycleLen,
      start_date: S.startDate ? new Date(S.startDate).toISOString().split('T')[0] : null,
      goal_date: S.goalDate ? new Date(S.goalDate).toISOString().split('T')[0] : null,
      gender: S.gender || null,
      report_time: null, // AI 리포트 자동 생성 기능은 제거됨 — 컬럼 자체는 그대로 두되 더는 값을 안 채운다
      supplements: S.routines.oxytocin || []
    })
  }).catch(e => console.error('[saveProfileRow]', e));
}

function saveWeightRow(entry) {
  if (!entry) return;
  fetchApi(apiUrl('/api/data/weights'), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ logged_date: todayISO(), weight_kg: entry.w })
  }).catch(e => console.error('[saveWeightRow]', e));
}

function saveChecksRow() {
  fetchApi(apiUrl('/api/data/checks'), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ check_date: todayISO(), checks: S.checks })
  })
    .then(r => r.ok ? fetchApi(apiUrl('/api/data/streak'), { credentials: 'include' }) : null)
    .then(r => r && r.ok ? r.json() : null)
    .then(s => {
      if (!s) return;
      S.streakDays = s.streakDays || 0;
      S.gapDays = s.gapDays || 0;
      S.totalLoggedDays = s.totalLoggedDays || 0;
      if (typeof updateProfileHeader === 'function') updateProfileHeader();
    })
    .catch(e => console.error('[saveChecksRow]', e));
}

// AI 리포트의 "목표 칼로리 미달성" 도넛 그래프용 집계. 실패하면 그 카드만 조용히 안 보인다(리포트
// 전체를 막지 않음).
async function fetchCalMissSummary() {
  try {
    const res = await fetchApi(apiUrl('/api/data/calorie-miss-summary'), { credentials: 'include' });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error('[fetchCalMissSummary]', e);
    return null;
  }
}

// dateOverride를 주면 그 날짜로 저장한다(캘린더에서 과거 날짜 일기를 소급 기록할 때 사용).
function saveDiaryRow(entry, dateOverride) {
  if (!entry) return;
  fetchApi(apiUrl('/api/data/diaries'), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ written_date: dateOverride || todayISO(), content: entry.t })
  }).catch(e => console.error('[saveDiaryRow]', e));
}

// entry: {date, time, intensity, durationMin, exerciseType, bodyPart?, routineName?} — 하루에 여러 번
// 호출될 수 있다(식사 기록과 동일). bodyPart/routineName은 무산소(근력) 루틴 기록일 때만 채워진다.
function saveWorkoutRow(entry) {
  if (!entry) return;
  fetchApi(apiUrl('/api/data/workouts'), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      performed_date: entry.date || todayISO(),
      logged_time: entry.time,
      intensity: entry.intensity,
      duration_min: entry.durationMin,
      exercise_type: entry.exerciseType,
      body_part: entry.bodyPart,
      routine_name: entry.routineName,
      kcal: entry.kcal
    })
  })
    .then(r => r.ok ? r.json() : null)
    .then(data => { if (data && data.workout) entry.serverId = data.workout.id; })
    .catch(e => console.error('[saveWorkoutRow]', e));
}

// 치팅 음식을 골라 세이브 칼로리를 쓸 때 서버의 saved_total_kcal도 같이 차감한다.
// (실패해도 로컬 값은 이미 낙관적으로 줄어든 상태라 다음 로그인 때 서버 값으로 다시 맞춰진다)
function spendSavedTotal(amount) {
  if (!amount || amount <= 0) return;
  fetchApi(apiUrl('/api/data/saved-total/spend'), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount })
  })
    .then(r => r.ok ? r.json() : null)
    .then(data => { if (data && data.saved_total_kcal != null) { S.savedTotal = data.saved_total_kcal; if (typeof updateHome === 'function') updateHome(); } })
    .catch(e => console.error('[spendSavedTotal]', e));
}

function deleteWorkoutRow(entry) {
  if (!entry || !entry.serverId) return;
  fetchApi(apiUrl('/api/data/workouts/' + entry.serverId), { method: 'DELETE', credentials: 'include' })
    .catch(e => console.error('[deleteWorkoutRow]', e));
}

function saveSleepRow(entry) {
  if (!entry) return;
  fetchApi(apiUrl('/api/data/sleep'), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ log_date: entry.date || todayISO(), bedtime: entry.bedtime, wake_time: entry.wake, hours: entry.hours })
  }).catch(e => console.error('[saveSleepRow]', e));
}

// 영양제 목록은 profiles 테이블에 함께 저장되므로 saveProfileRow()를 그대로 재사용한다
// (POST /api/data/profiles가 프로필 전체를 UPSERT하는 구조라 일부 필드만 보내면 안 됨).
function saveSupplementsRow() { saveProfileRow(); }

function savePeriodRow() {
  const p = S.periods[S.periods.length - 1];
  if (!p) return;
  fetchApi(apiUrl('/api/data/periods'), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start_date: p.start, duration_days: p.days })
  }).catch(e => console.error('[savePeriodRow]', e));
}

// dateOverride를 주면 그 날짜로 저장한다(캘린더에서 과거 날짜 식사를 소급 기록할 때 사용).
function saveMealRow(meal, dateOverride) {
  if (!meal) return;
  fetchApi(apiUrl('/api/data/meals'), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eaten_date: dateOverride || todayISO(),
      label: meal.label,
      time: meal.time,
      foods: meal.foods,
      description: meal.text || null,
      ai_estimate: meal.aiEstimate || null,
      kcal: meal.kcal ?? null,
      bg_pre: meal.bgPre, bg_1h: meal.bg1h, bg_2h: meal.bg2h
    })
  })
    .then(r => r.ok ? r.json() : null)
    .then(data => { if (data && data.meal) meal.serverId = data.meal.id; })
    .catch(e => console.error('[saveMealRow]', e));
}

function saveAvatarRow(avatar) {
  if (!avatar) return;
  fetchApi(apiUrl('/api/user/avatar'), {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avatar })
  }).catch(e => console.error('[saveAvatarRow]', e));
}

function deleteMealRow(meal) {
  if (!meal || !meal.serverId) return;
  fetchApi(apiUrl('/api/data/meals/' + meal.serverId), {
    method: 'DELETE', credentials: 'include'
  }).catch(e => console.error('[deleteMealRow]', e));
}
