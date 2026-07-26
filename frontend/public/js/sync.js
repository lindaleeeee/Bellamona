// ═══════════════════════════════ BACKEND SYNC ═══════════════════════════════
// API_BASE / GOOGLE_CLIENT_ID는 index.html의 메인 스크립트에서 선언된다.
// (Vite의 %VITE_X% 환경변수 치환은 index.html 자체에만 적용되고 이 파일에는 적용되지 않음)

function apiUrl(path) { return API_BASE.replace(/\/+$/, '') + path; }

function fetchApi(url, options = {}) {
  const token = localStorage.getItem('bellamona_token');
  if (token) {
    options.headers = options.headers || {};
    options.headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, options);
}
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
    const data = await res.json();
    if (data.token) localStorage.setItem('bellamona_token', data.token);
    return true;
  } catch (e) {
    console.error('[verifyWithBackend]', e);
    return false;
  }
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
    location.reload();
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
  location.reload();
}

// ── 로그인 후 / 새로고침 시 저장된 정보 복원 ──────────────────────
async function restoreFromServer() {
  try {
    const res = await fetchApi(apiUrl('/api/data'), { credentials: 'include' });
    if (!res.ok) return false; // 로그인 안 된 상태 - 로그인 화면 유지

    const d = await res.json();

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
      if (d.profile.report_time) S.reportTime = (d.profile.report_time + '').slice(0, 5);
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
        text: row.description || '',
        aiEstimate: row.ai_estimate || null,
        bgPre: row.bg_pre, bg1h: row.bg_1h, bg2h: row.bg_2h
      }));
      S.nextMealId = S.meals.length;
    }

    if (d.workout) {
      S.exBurned = {
        intensity: d.workout.intensity || null,
        durationMin: d.workout.duration_min || 0,
        exerciseType: d.workout.exercise_type || '',
        minutesAfterMeal: d.workout.minutes_after_meal ?? null
      };
    }
    if (d.workoutHistory && d.workoutHistory.length) {
      S.workoutLogs = d.workoutHistory.filter(w => w.intensity).map(w => ({
        date: (w.performed_date + '').slice(0, 10), intensity: w.intensity, durationMin: w.duration_min, exerciseType: w.exercise_type
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
      report_time: S.reportTime || null,
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

function saveDiaryRow(entry) {
  if (!entry) return;
  fetchApi(apiUrl('/api/data/diaries'), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ written_date: todayISO(), content: entry.t })
  }).catch(e => console.error('[saveDiaryRow]', e));
}

function saveWorkoutRow() {
  fetchApi(apiUrl('/api/data/workouts'), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      performed_date: todayISO(),
      intensity: S.exBurned.intensity,
      duration_min: S.exBurned.durationMin,
      exercise_type: S.exBurned.exerciseType,
      minutes_after_meal: S.exBurned.minutesAfterMeal
    })
  }).catch(e => console.error('[saveWorkoutRow]', e));
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

function saveMealRow(meal) {
  if (!meal) return;
  fetchApi(apiUrl('/api/data/meals'), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eaten_date: todayISO(),
      label: meal.label,
      time: meal.time,
      foods: meal.foods,
      description: meal.text || null,
      ai_estimate: meal.aiEstimate || null,
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
