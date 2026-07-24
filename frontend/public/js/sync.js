// ═══════════════════════════════ BACKEND SYNC ═══════════════════════════════
// API_BASE / GOOGLE_CLIENT_ID는 index.html의 메인 스크립트에서 선언된다.
// (Vite의 %VITE_X% 환경변수 치환은 index.html 자체에만 적용되고 이 파일에는 적용되지 않음)

function apiUrl(path) { return API_BASE.replace(/\/+$/, '') + path; }

function fmtDateShort(isoDateStr) {
  if (!isoDateStr) return '';
  const d = new Date(isoDateStr);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}
function todayISO() { return new Date().toISOString().split('T')[0]; }

// ── 구글 로그인 ──────────────────────────────────────────────
let _tokenClient = null;
function _ensureTokenClient() {
  if (_tokenClient) return _tokenClient;
  if (!window.google || !google.accounts || !google.accounts.oauth2) return null;
  _tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'openid email profile',
    callback: async (resp) => {
      if (resp.error || !resp.access_token) {
        alert('구글 로그인에 실패했습니다. 다시 시도해주세요.');
        return;
      }
      const ok = await verifyWithBackend(resp.access_token);
      if (ok) await restoreFromServer();
      else alert('로그인 확인에 실패했습니다. 다시 시도해주세요.');
    }
  });
  return _tokenClient;
}

function doGoogleLogin() {
  const client = _ensureTokenClient();
  if (!client) {
    // gsi 스크립트가 아직 로딩 중이면 잠깐 기다렸다 재시도
    setTimeout(() => {
      const retry = _ensureTokenClient();
      if (retry) retry.requestAccessToken();
      else alert('구글 로그인 준비 중입니다. 잠시 후 다시 시도해주세요.');
    }, 500);
    return;
  }
  client.requestAccessToken();
}

async function verifyWithBackend(access_token) {
  try {
    const res = await fetch(apiUrl('/api/auth/google/verify'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token })
    });
    if (!res.ok) return false;
    return true;
  } catch (e) {
    console.error('[verifyWithBackend]', e);
    return false;
  }
}

// ── 로그인 후 / 새로고침 시 저장된 정보 복원 ──────────────────────
async function restoreFromServer() {
  try {
    const res = await fetch(apiUrl('/api/data'), { credentials: 'include' });
    if (!res.ok) return false; // 로그인 안 된 상태 - 로그인 화면 유지

    const d = await res.json();

    if (d.user && d.user.name) S.name = d.user.name;

    if (d.profile) {
      if (d.profile.weight_kg != null) S.initWeight = Number(d.profile.weight_kg);
      if (d.profile.goal_weight_kg != null) S.goalWeight = Number(d.profile.goal_weight_kg);
      if (d.profile.goal_months != null) S.goalMonths = d.profile.goal_months;
      if (d.profile.daily_kcal_target != null) S.goalCal = d.profile.daily_kcal_target;
      if (d.profile.cycle_len != null) S.cycleLen = d.profile.cycle_len;
      if (d.profile.height_cm != null) S.heightCm = Number(d.profile.height_cm);
    }

    if (d.weights && d.weights.length) {
      S.weights = d.weights.map(w => ({ d: fmtDateShort(w.logged_date), w: Number(w.weight_kg), t: new Date(w.logged_date).getTime() }));
    }

    if (d.periods && d.periods.length) {
      S.periods = d.periods.map(p => ({ start: (p.start_date + '').slice(0, 10), days: p.duration_days }));
    }

    if (d.checks) S.checks = Object.assign({}, S.checks, d.checks);

    if (d.diaries && d.diaries.length) {
      S.diaries = d.diaries.slice().reverse().map(x => ({ d: fmtDateShort(x.written_date), t: x.content }));
    }

    if (d.meals && d.meals.length) {
      S.meals = d.meals.map((row, i) => ({
        id: i,
        serverId: row.id,
        label: row.label,
        time: (row.time || '00:00').slice(0, 5),
        foods: row.foods || [],
        bgPre: row.bg_pre, bg1h: row.bg_1h, bg2h: row.bg_2h
      }));
      S.nextMealId = S.meals.length;
    }

    if (d.workout) {
      S.exBurned = {
        strength: d.workout.strength || 0,
        hiit: d.workout.hiit || 0,
        cardio: d.workout.cardio || 0,
        walk: d.workout.walk || 0
      };
    }

    S.loggedIn = true;
    saveState();

    if (d.profile) initMain();
    else go('s-onboard');

    return true;
  } catch (e) {
    console.error('[restoreFromServer]', e);
    return false;
  }
}

// ── 개별 저장 훅 (기존 코드의 savePeriodRow 패턴과 동일) ──────────────
function saveProfileRow() {
  fetch(apiUrl('/api/data/profiles'), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      height_cm: S.heightCm || null,
      weight_kg: S.initWeight,
      goal_weight_kg: S.goalWeight,
      goal_months: S.goalMonths,
      daily_kcal_target: S.goalCal,
      cycle_len: S.cycleLen
    })
  }).catch(e => console.error('[saveProfileRow]', e));
}

function saveWeightRow(entry) {
  if (!entry) return;
  fetch(apiUrl('/api/data/weights'), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ logged_date: todayISO(), weight_kg: entry.w })
  }).catch(e => console.error('[saveWeightRow]', e));
}

function saveChecksRow() {
  fetch(apiUrl('/api/data/checks'), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ check_date: todayISO(), checks: S.checks })
  }).catch(e => console.error('[saveChecksRow]', e));
}

function saveDiaryRow(entry) {
  if (!entry) return;
  fetch(apiUrl('/api/data/diaries'), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ written_date: todayISO(), content: entry.t })
  }).catch(e => console.error('[saveDiaryRow]', e));
}

function saveWorkoutRow() {
  fetch(apiUrl('/api/data/workouts'), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ performed_date: todayISO(), ...S.exBurned })
  }).catch(e => console.error('[saveWorkoutRow]', e));
}

function savePeriodRow() {
  const p = S.periods[S.periods.length - 1];
  if (!p) return;
  fetch(apiUrl('/api/data/periods'), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start_date: p.start, duration_days: p.days })
  }).catch(e => console.error('[savePeriodRow]', e));
}

function saveMealRow(meal) {
  if (!meal) return;
  fetch(apiUrl('/api/data/meals'), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eaten_date: todayISO(),
      label: meal.label,
      time: meal.time,
      foods: meal.foods,
      bg_pre: meal.bgPre, bg_1h: meal.bg1h, bg_2h: meal.bg2h
    })
  })
    .then(r => r.ok ? r.json() : null)
    .then(data => { if (data && data.meal) meal.serverId = data.meal.id; })
    .catch(e => console.error('[saveMealRow]', e));
}

function deleteMealRow(meal) {
  if (!meal || !meal.serverId) return;
  fetch(apiUrl('/api/data/meals/' + meal.serverId), {
    method: 'DELETE', credentials: 'include'
  }).catch(e => console.error('[deleteMealRow]', e));
}
