// 기록이 쌓일수록 열리는 인사이트 (AI 호출 없이 코드로 계산)
//
// 누적 기록일(연속 아님)에 따라 단계가 열린다.
//   1일  오늘      : 그날 데이터만으로 계산 가능한 것
//   3일  나의 기본값 : 평균 첫 끼, 평균 수면, 평균 순섭취, 평균 루틴 점수
//   7일  주간       : 혈당 부담 TOP3, 평일/주말, 운동한 날 수면, 잘 잔 날 기분, 지난주 대비
//   14일 나의 패턴   : 늦은 저녁 다음 날, 잘 된 날의 공통점, 식사 시간 규칙성
//   30일 월간       : 주기 단계별 식욕/기분, 30일 체중, 나 사용설명서
//
// 원칙: 계산할 수 없는 카드는 숨긴다(빈말 금지). 비교 카드는 표본 수(n)에 따라
// "가설"(5일 미만) / "패턴"(5일 이상)으로 확신도를 표시한다.
// 결과는 renderInsightsHtml()로 아이콘 카드 그리드로 그린다.

const INSIGHT_TIERS = [
  { id: 'daily', min: 1, icon: '☀️', label: '오늘' },
  { id: 'base', min: 3, icon: '🧭', label: '나의 기본값' },
  { id: 'weekly', min: 7, icon: '📅', label: '주간 리포트' },
  { id: 'pattern', min: 14, icon: '🔍', label: '나의 패턴' },
  { id: 'monthly', min: 30, icon: '🌙', label: '월간 리포트' },
];
// 잠긴 단계에서 미리 보여줄 카드 제목(내용은 흐리게)
const INSIGHT_TEASERS = {
  base: ['평균 첫 끼 시간', '평균 수면', '하루 평균 순섭취', '평균 루틴 점수'],
  weekly: ['혈당 부담 큰 음식 TOP 3', '평일 vs 주말', '운동한 날의 수면', '잘 잔 날의 기분'],
  pattern: ['늦은 저녁 다음 날', '잘 된 날의 공통점', '식사 시간 규칙성'],
  monthly: ['주기별 식욕', '주기별 기분', '30일 체중 흐름', '나 사용설명서'],
};

const _POS_WORDS = ['좋', '행복', '뿌듯', '상쾌', '개운', '즐거', '신나', '감사', '편안', '차분', '만족', '기쁘', '기뻤', '설레', '활기', '가벼', '든든', '여유', '웃', '재밌', '재미있'];
const _NEG_WORDS = ['피곤', '힘들', '힘듦', '우울', '짜증', '불안', '스트레스', '지치', '지쳤', '무기력', '화나', '화났', '속상', '걱정', '귀찮', '아프', '아팠', '붓', '부었', '졸리', '예민', '슬프', '슬펐', '외로', '답답', '폭식', '후회'];

// ── 작은 도우미 ──
function _insAddDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function _insMin(t) { if (!t) return null; const m = String(t).match(/^(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; }
function _insHHMM(min) { min = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`; }
function _insAvg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
function _insStd(a) { if (a.length < 2) return null; const m = _insAvg(a); return Math.sqrt(_insAvg(a.map(x => (x - m) ** 2))); }
function _insR1(x) { return Math.round(x * 10) / 10; }
function _insSigned(x, unit = '') { const v = typeof x === 'number' ? x : 0; return `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toLocaleString()}${unit}`; }
function _insEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
// 받침 있으면 a(은/이), 없으면 b(는/가)
function _josa(w, a, b) { const c = String(w).charCodeAt(String(w).length - 1); if (c < 0xac00 || c > 0xd7a3) return w + a; return w + ((c - 0xac00) % 28 ? a : b); }
function _insConf(n) { return n >= 5 ? 'pattern' : 'hyp'; }
// 취침 시각은 자정을 넘는 경우가 많아 정오 이전 시각은 +24시간으로 보고 평균 낸다
function _insBedMin(t) { const m = _insMin(t); return m == null ? null : (m < 720 ? m + 1440 : m); }

function diaryMood(text) {
  if (!text) return null;
  const s = String(text);
  const pos = _POS_WORDS.reduce((a, w) => a + (s.split(w).length - 1), 0);
  const neg = _NEG_WORDS.reduce((a, w) => a + (s.split(w).length - 1), 0);
  return { pos, neg, score: pos > neg ? 1 : neg > pos ? -1 : 0 };
}
function _moodIcon(score) { return score > 0 ? '😊' : score < 0 ? '😟' : '😐'; }

// 한 끼의 혈당 부하(GL) 추정치 = Σ 탄수화물(g) × GI / 100. 음식 단위 기록이 없으면 null
function mealGL(meal) {
  const foods = Array.isArray(meal.foods) ? meal.foods : [];
  const withGi = foods.filter(f => typeof f.c === 'number' && typeof f.gi === 'number');
  if (!withGi.length) return null;
  return _insR1(withGi.reduce((a, f) => a + f.c * f.gi / 100, 0));
}
function _glLevel(gl) { return gl >= 20 ? '높음' : gl >= 10 ? '중간' : '낮음'; }

// ── 날짜별 요약 만들기 ──
// history: { meals, workouts, sleep, checks:[{date,checks}], diaries, weights, periods }
// ctx: { routinePct(checks)->0~100, phaseOf(date)->{id,name}, goalCal(date)->kcal }
function buildDaySummaries(history, ctx) {
  const days = {};
  const day = d => (days[d] = days[d] || { date: d, meals: [], workouts: [] });
  (history.meals || []).forEach(m => { if (m.eaten_date && (m.description || (m.foods && m.foods.length) || m.kcal != null)) day(m.eaten_date).meals.push(m); });
  (history.workouts || []).forEach(w => { if (w.performed_date) day(w.performed_date).workouts.push(w); });
  (history.sleep || []).forEach(s => { if (s.log_date && s.hours) day(s.log_date).sleep = s; });
  (history.checks || []).forEach(c => {
    const vals = Object.entries(c.checks || {}).filter(([k, v]) => k !== 'calMissReason' && v === true);
    if (c.date && vals.length) { const x = day(c.date); x.checks = c.checks; x.routine = ctx.routinePct ? ctx.routinePct(c.checks) : null; }
  });
  (history.diaries || []).forEach(dr => { if (dr.written_date && dr.content) { const x = day(dr.written_date); x.diary = dr.content; x.mood = diaryMood(dr.content); } });
  (history.weights || []).forEach(w => { if (w.logged_date && w.weight_kg != null) day(w.logged_date).weight = Number(w.weight_kg); });

  Object.values(days).forEach(x => {
    const times = x.meals.map(m => _insMin(m.time)).filter(v => v != null).sort((a, b) => a - b);
    x.firstMeal = times.length ? times[0] : null;
    x.lastMeal = times.length ? times[times.length - 1] : null;
    const kcalMeals = x.meals.filter(m => typeof m.kcal === 'number');
    x.mealsKcal = kcalMeals.length ? kcalMeals.reduce((a, m) => a + m.kcal, 0) : null;
    x.workoutKcal = x.workouts.reduce((a, w) => a + (w.kcal || 0), 0);
    x.workoutMin = x.workouts.reduce((a, w) => a + (w.duration_min || 0), 0);
    x.net = x.mealsKcal != null ? Math.round(x.mealsKcal - x.workoutKcal) : null;
    x.goal = ctx.goalCal ? ctx.goalCal(x.date) : null;
    x.phase = ctx.phaseOf ? ctx.phaseOf(x.date) : null;
    x.weekday = new Date(x.date + 'T00:00:00Z').getUTCDay();
  });
  return days;
}

function _isRecorded(x) {
  return !!(x && (x.meals.length || x.workouts.length || x.sleep || x.checks || x.diary || x.weight != null));
}

// 두 그룹 평균 비교. 각 그룹에 최소 minEach개가 있어야 결과를 낸다
function _compare(a, b, minEach = 2) {
  if (a.length < minEach || b.length < minEach) return null;
  return { a: _insAvg(a), b: _insAvg(b), n: Math.min(a.length, b.length) };
}

// ── 메인: 인사이트 계산 ──
function buildInsights(history, asOf, ctx = {}) {
  const days = buildDaySummaries(history, ctx);
  const dates = Object.keys(days).filter(d => d <= asOf && _isRecorded(days[d])).sort();
  const recordedDays = dates.length;
  const tierIdx = INSIGHT_TIERS.reduce((acc, t, i) => (recordedDays >= t.min ? i : acc), -1);
  const next = INSIGHT_TIERS[tierIdx + 1] || null;
  // 최근 30일. 단, 그달 1일이 더 앞이면 1일부터(10월 31일에 보면 10월 1일~31일 전체가 들어가게)
  const monthStart = asOf.slice(0, 8) + '01';
  const winFrom = monthStart < _insAddDays(asOf, -29) ? monthStart : _insAddDays(asOf, -29);
  const win = dates.filter(d => d >= winFrom).map(d => days[d]); // 최근 30일(기록 있는 날만)
  const cards = []; // {tier, icon, title, value, sub, conf?, n?, delta?, wide?, rule?}
  const push = c => cards.push(c);
  const today = days[asOf] || { date: asOf, meals: [], workouts: [] };
  const unlocked = id => INSIGHT_TIERS.findIndex(t => t.id === id) <= tierIdx;
  const others = win.filter(x => x.date !== asOf);

  // 평소값(오늘 제외) — 3일 단계부터 오늘 카드에 "평소보다" 비교를 붙인다
  const base = {
    first: _insAvg(others.map(x => x.firstMeal).filter(v => v != null)),
    sleep: _insAvg(others.map(x => x.sleep && x.sleep.hours).filter(Boolean)),
    routine: _insAvg(others.map(x => x.routine).filter(v => v != null)),
    net: _insAvg(others.map(x => x.net).filter(v => v != null)),
  };
  const showDelta = unlocked('base');

  // ─── 1일: 오늘 ───
  const missing = [];
  if (today.meals.length) {
    if (today.firstMeal != null && today.lastMeal != null && today.lastMeal > today.firstMeal) {
      const span = _insR1((today.lastMeal - today.firstMeal) / 60);
      push({ tier: 'daily', icon: '🕐', title: '식사 시간창', value: `${span}시간`, sub: `${_insHHMM(today.firstMeal)} → ${_insHHMM(today.lastMeal)}` });
    } else if (today.firstMeal != null) {
      const d = showDelta && base.first != null ? Math.round(today.firstMeal - base.first) : null;
      push({ tier: 'daily', icon: '🕐', title: '첫 끼', value: _insHHMM(today.firstMeal), sub: d != null && Math.abs(d) >= 20 ? `평소보다 ${Math.abs(d) >= 60 ? _insR1(Math.abs(d) / 60) + '시간' : Math.abs(d) + '분'} ${d > 0 ? '늦게' : '일찍'}` : '첫 끼 기록', delta: d != null && Math.abs(d) >= 20 ? (d > 0 ? 'down' : 'up') : null });
    }
    const gls = today.meals.map(m => ({ m, gl: mealGL(m) })).filter(x => x.gl != null).sort((a, b) => b.gl - a.gl);
    if (gls.length) {
      push({ tier: 'daily', icon: '📈', title: '혈당 부담 큰 끼니', value: gls[0].m.label || '식사', sub: `GL ${gls[0].gl} · ${_glLevel(gls[0].gl)} (추정)`, delta: gls[0].gl >= 20 ? 'down' : null });
    } else {
      const big = today.meals.filter(m => typeof m.kcal === 'number').sort((a, b) => b.kcal - a.kcal)[0];
      if (big && today.meals.length >= 2) push({ tier: 'daily', icon: '🍽', title: '가장 많이 먹은 끼니', value: big.label || '식사', sub: `${big.kcal.toLocaleString()}kcal` });
    }
    if (today.net != null && today.goal) {
      const diff = today.net - today.goal;
      push({ tier: 'daily', icon: '🔥', title: '순섭취', value: `${today.net.toLocaleString()}kcal`, sub: `목표 대비 ${_insSigned(diff)}`, delta: diff > 150 ? 'down' : diff <= 0 ? 'up' : null });
    }
  } else missing.push('meal');
  if (today.sleep) {
    const h = _insR1(today.sleep.hours);
    const d = showDelta && base.sleep != null ? _insR1(h - base.sleep) : null;
    push({ tier: 'daily', icon: '😴', title: '수면', value: `${h}시간`, sub: d != null && Math.abs(d) >= 0.3 ? `평소보다 ${_insSigned(d, '시간')}` : (today.sleep.bedtime ? `${String(today.sleep.bedtime).slice(0, 5)} 취침` : '수면 기록'), delta: d != null && Math.abs(d) >= 0.3 ? (d > 0 ? 'up' : 'down') : null });
  } else missing.push('sleep');
  if (today.routine != null) {
    const d = showDelta && base.routine != null ? Math.round(today.routine - base.routine) : null;
    push({ tier: 'daily', icon: '✅', title: '루틴 점수', value: `${today.routine}점`, sub: d != null && Math.abs(d) >= 3 ? `평소보다 ${_insSigned(d, '점')}` : '오늘 체크 기준', delta: d != null && Math.abs(d) >= 3 ? (d > 0 ? 'up' : 'down') : null });
  }
  if (today.workouts.length) {
    push({ tier: 'daily', icon: '🏃', title: '운동', value: `${today.workoutMin}분`, sub: today.workoutKcal ? `${today.workoutKcal}kcal 소모` : `${today.workouts.length}회 기록` });
  } else missing.push('workout');
  if (today.mood) {
    push({ tier: 'daily', icon: _moodIcon(today.mood.score), title: '일기 기분', value: today.mood.score > 0 ? '좋음' : today.mood.score < 0 ? '지침' : '보통', sub: `긍정 단어 ${today.mood.pos} · 부정 ${today.mood.neg}` });
  } else missing.push('diary');
  if (today.weight != null) push({ tier: 'daily', icon: '⚖️', title: '체중', value: `${_insR1(today.weight)}kg`, sub: '오늘 기록' });

  // ─── 3일: 나의 기본값 ───
  if (unlocked('base')) {
    const fm = win.map(x => x.firstMeal).filter(v => v != null);
    if (fm.length >= 2) push({ tier: 'base', icon: '⏰', title: '평균 첫 끼', value: _insHHMM(_insAvg(fm)), sub: `${fm.length}일 평균`, n: fm.length });
    const sl = win.filter(x => x.sleep);
    if (sl.length >= 2) {
      const beds = sl.map(x => _insBedMin(x.sleep.bedtime)).filter(v => v != null);
      push({ tier: 'base', icon: '🌙', title: '평균 수면', value: `${_insR1(_insAvg(sl.map(x => x.sleep.hours)))}시간`, sub: beds.length ? `보통 ${_insHHMM(_insAvg(beds))} 취침` : `${sl.length}일 평균`, n: sl.length });
    }
    const nets = win.filter(x => x.net != null && x.goal);
    if (nets.length >= 2) {
      const avg = Math.round(_insAvg(nets.map(x => x.net)));
      const gap = Math.round(_insAvg(nets.map(x => x.net - x.goal)));
      push({ tier: 'base', icon: '🔥', title: '하루 평균 순섭취', value: `${avg.toLocaleString()}kcal`, sub: `목표 대비 ${_insSigned(gap)}`, n: nets.length });
    }
    const rt = win.map(x => x.routine).filter(v => v != null);
    if (rt.length >= 2) push({ tier: 'base', icon: '✅', title: '평균 루틴 점수', value: `${Math.round(_insAvg(rt))}점`, sub: `${rt.length}일 평균`, n: rt.length });
  }

  // ─── 7일: 주간 ───
  if (unlocked('weekly')) {
    // 혈당 부담 TOP3 음식 (음식 단위 기록 + 추정 GI 기준)
    const foodGL = {};
    win.forEach(x => x.meals.forEach(m => (m.foods || []).forEach(f => {
      if (typeof f.c !== 'number' || typeof f.gi !== 'number' || !f.n) return;
      const gl = f.c * f.gi / 100;
      const k = f.n; foodGL[k] = foodGL[k] || { n: k, e: f.e || '🍽', sum: 0, cnt: 0 };
      foodGL[k].sum += gl; foodGL[k].cnt++;
    })));
    const top = Object.values(foodGL).map(f => ({ ...f, gl: _insR1(f.sum / f.cnt) })).filter(f => f.gl >= 5).sort((a, b) => b.gl - a.gl).slice(0, 3);
    if (top.length) push({ tier: 'weekly', icon: '🍰', title: '혈당 부담 큰 음식 TOP ' + top.length, list: top.map(f => `${f.e} ${f.n} · GL ${f.gl}`), sub: '먹은 양 기준 추정치', wide: true, rule: top[0].gl >= 15 ? { icon: '🍰', text: `${_josa(top[0].n, '은', '는')} 양을 줄이거나 단백질과 같이 먹기` } : null });

    // 평일 vs 주말 순섭취
    const wk = win.filter(x => x.net != null);
    const cmpWE = _compare(wk.filter(x => x.weekday >= 1 && x.weekday <= 5).map(x => x.net), wk.filter(x => x.weekday === 0 || x.weekday === 6).map(x => x.net), 1);
    if (cmpWE && Math.abs(cmpWE.b - cmpWE.a) >= 50) {
      const d = Math.round(cmpWE.b - cmpWE.a);
      push({ tier: 'weekly', icon: '📅', title: '주말 순섭취', value: _insSigned(d, 'kcal'), sub: `평일 ${Math.round(cmpWE.a).toLocaleString()} · 주말 ${Math.round(cmpWE.b).toLocaleString()}`, n: cmpWE.n, conf: _insConf(cmpWE.n), rule: d >= 200 ? { icon: '📅', text: `주말엔 평일보다 ${d}kcal 더 먹는 편 → 주말 한 끼를 미리 정해두기` } : null });
    }
    // 운동한 날 vs 안 한 날 수면
    const sl = win.filter(x => x.sleep);
    const cmpWS = _compare(sl.filter(x => x.workouts.length).map(x => x.sleep.hours), sl.filter(x => !x.workouts.length).map(x => x.sleep.hours));
    if (cmpWS) {
      const d = _insR1(cmpWS.a - cmpWS.b);
      push({ tier: 'weekly', icon: '🏃', title: '운동한 날 수면', value: _insSigned(d, '시간'), sub: `운동 ${_insR1(cmpWS.a)}h · 안 한 날 ${_insR1(cmpWS.b)}h`, n: cmpWS.n, conf: _insConf(cmpWS.n), delta: d > 0 ? 'up' : d < 0 ? 'down' : null, rule: d >= 0.3 ? { icon: '🏃', text: `운동한 날 ${d}시간 더 잠 → 잠이 안 오는 날엔 가볍게라도 움직이기` } : null });
    }
    // 잘 잔 날 기분 (7시간 이상 vs 미만)
    const md = win.filter(x => x.sleep && x.mood);
    const good = md.filter(x => x.sleep.hours >= 7), bad = md.filter(x => x.sleep.hours < 7);
    if (good.length >= 2 && bad.length >= 2) {
      const pg = Math.round(good.filter(x => x.mood.score > 0).length / good.length * 100);
      const pb = Math.round(bad.filter(x => x.mood.score > 0).length / bad.length * 100);
      const n = Math.min(good.length, bad.length);
      push({ tier: 'weekly', icon: '😊', title: '7시간 이상 잔 날 기분', value: `긍정 ${pg}%`, sub: `덜 잔 날은 ${pb}%`, n, conf: _insConf(n), delta: pg > pb ? 'up' : pg < pb ? 'down' : null, rule: pg - pb >= 20 ? { icon: '😴', text: `7시간 이상 잔 날 기분 좋은 날이 ${pg - pb}%p 많음 → 수면부터 지키기` } : null });
    }
    // 이번 주 vs 지난주 루틴
    const thisW = win.filter(x => x.date > _insAddDays(asOf, -7) && x.routine != null).map(x => x.routine);
    const lastW = win.filter(x => x.date <= _insAddDays(asOf, -7) && x.date > _insAddDays(asOf, -14) && x.routine != null).map(x => x.routine);
    if (thisW.length >= 2 && lastW.length >= 2) {
      const d = Math.round(_insAvg(thisW) - _insAvg(lastW));
      push({ tier: 'weekly', icon: '📊', title: '지난주 대비 루틴', value: _insSigned(d, '점'), sub: `이번 주 ${Math.round(_insAvg(thisW))}점 · 지난주 ${Math.round(_insAvg(lastW))}점`, delta: d > 0 ? 'up' : d < 0 ? 'down' : null });
    }
    const wkDays = dates.filter(d => d > _insAddDays(asOf, -7)).length;
    push({ tier: 'weekly', icon: '🗓', title: '이번 주 기록', value: `${wkDays}/7일`, sub: wkDays >= 5 ? '꾸준해요' : '기록할수록 정확해져요' });
  }

  // ─── 14일: 나의 패턴 ───
  if (unlocked('pattern')) {
    // 늦은 저녁(20시 이후 마지막 끼) 다음 날 순섭취
    const late = [], early = [];
    win.forEach(x => {
      if (x.lastMeal == null) return;
      const nx = days[_insAddDays(x.date, 1)];
      if (!nx || nx.net == null || nx.date > asOf) return;
      (x.lastMeal >= 20 * 60 ? late : early).push(nx.net);
    });
    const cmpL = _compare(late, early);
    if (cmpL && Math.abs(cmpL.a - cmpL.b) >= 50) {
      const d = Math.round(cmpL.a - cmpL.b);
      push({ tier: 'pattern', icon: '🌃', title: '늦은 저녁 다음 날', value: _insSigned(d, 'kcal'), sub: '20시 이후 먹은 다음 날 순섭취', n: cmpL.n, conf: _insConf(cmpL.n), delta: d > 0 ? 'down' : 'up', rule: d >= 100 ? { icon: '🌃', text: `20시 이후에 먹으면 다음 날 ${d}kcal 더 먹는 편 → 저녁은 20시 전에` } : null });
    }
    // 루틴 잘 된 날(상위 1/3)의 공통점
    const rd = win.filter(x => x.routine != null).sort((a, b) => b.routine - a.routine);
    if (rd.length >= 6) {
      const k = Math.max(2, Math.floor(rd.length / 3));
      const topD = rd.slice(0, k), rest = rd.slice(k);
      const feats = [
        { key: '수면', get: x => x.sleep && x.sleep.hours, fmt: v => `${_insR1(v)}시간`, scale: 1, icon: '😴', rule: (a) => `잘 된 날은 ${_insR1(a)}시간 이상 잤음` },
        { key: '첫 끼', get: x => x.firstMeal, fmt: v => _insHHMM(v), scale: 60, icon: '⏰', rule: (a) => `잘 된 날은 ${_insHHMM(a)}쯤 첫 끼를 먹었음` },
        { key: '운동', get: x => (x.workouts.length ? 1 : 0), fmt: v => `운동 ${Math.round(v * 100)}%`, scale: 0.5, icon: '🏃', rule: () => `잘 된 날은 대부분 운동을 했음` },
      ];
      let best = null;
      feats.forEach(f => {
        const a = topD.map(f.get).filter(v => v != null), b = rest.map(f.get).filter(v => v != null);
        if (a.length < 2 || b.length < 2) return;
        const score = Math.abs(_insAvg(a) - _insAvg(b)) / f.scale;
        if (!best || score > best.score) best = { f, a: _insAvg(a), b: _insAvg(b), score, n: Math.min(a.length, b.length) };
      });
      if (best && best.score >= 0.3) {
        push({ tier: 'pattern', icon: '⭐', title: '루틴 잘 된 날의 공통점', value: best.f.fmt(best.a), sub: `다른 날은 ${best.f.fmt(best.b)}`, n: best.n, conf: _insConf(best.n), rule: { icon: best.f.icon, text: best.f.rule(best.a) } });
      }
    }
    // 첫 끼 시간 규칙성
    const fm = win.map(x => x.firstMeal).filter(v => v != null);
    const sd = _insStd(fm);
    if (fm.length >= 5 && sd != null) {
      const m = Math.round(sd);
      push({ tier: 'pattern', icon: '🎯', title: '첫 끼 시간 규칙성', value: `±${m}분`, sub: m <= 45 ? '규칙적이에요' : '날마다 달라요', n: fm.length, conf: _insConf(fm.length), delta: m <= 45 ? 'up' : 'down' });
    }
  }

  // ─── 30일: 월간 ───
  if (unlocked('monthly')) {
    const byPhase = {};
    win.forEach(x => { if (!x.phase || !x.phase.id || x.phase.id === 'unknown') return; const p = (byPhase[x.phase.id] = byPhase[x.phase.id] || { name: x.phase.name, nets: [], moods: [] }); if (x.net != null && x.goal) p.nets.push(x.net - x.goal); if (x.mood) p.moods.push(x.mood.score); });
    const ph = Object.values(byPhase).filter(p => p.nets.length >= 2);
    if (ph.length >= 2) {
      ph.sort((a, b) => _insAvg(b.nets) - _insAvg(a.nets));
      const hi = ph[0], lo = ph[ph.length - 1];
      const d = Math.round(_insAvg(hi.nets) - _insAvg(lo.nets));
      const n = Math.min(hi.nets.length, lo.nets.length);
      push({ tier: 'monthly', icon: '🌸', title: '주기별 식욕', value: `${hi.name} ${_insSigned(d, 'kcal')}`, sub: `${lo.name}보다 많이 먹어요`, n, conf: _insConf(n), rule: d >= 100 ? { icon: '🌸', text: `${hi.name}엔 ${d}kcal 더 먹는 편 → 이 시기엔 간식을 미리 준비하기` } : null });
    }
    const pm = Object.values(byPhase).filter(p => p.moods.length >= 2);
    if (pm.length >= 2) {
      pm.sort((a, b) => _insAvg(a.moods) - _insAvg(b.moods));
      const n = pm[0].moods.length;
      push({ tier: 'monthly', icon: _moodIcon(Math.sign(_insAvg(pm[0].moods))), title: '기분이 가장 처지는 시기', value: pm[0].name, sub: `가장 좋은 시기는 ${pm[pm.length - 1].name}`, n, conf: _insConf(n) });
    }
    const ws = win.filter(x => x.weight != null);
    if (ws.length >= 2) {
      const f = ws[0], l = ws[ws.length - 1];
      const span = (new Date(l.date) - new Date(f.date)) / 86400000;
      if (span >= 7) {
        const d = _insR1(l.weight - f.weight);
        push({ tier: 'monthly', icon: '📉', title: '30일 체중 흐름', value: _insSigned(d, 'kg'), sub: `주당 ${_insSigned(_insR1(d / span * 7), 'kg')}`, delta: d < 0 ? 'up' : d > 0 ? 'down' : null });
      }
    }
  }

  // 나 사용설명서: 30일부터. 찾은 규칙 중 확신도 높은 순 최대 5개
  const rules = unlocked('monthly') ? cards.filter(c => c.rule).sort((a, b) => (b.n || 0) - (a.n || 0)).slice(0, 5).map(c => ({ ...c.rule, conf: c.conf || 'hyp' })) : [];
  const learned = cards.filter(c => c.tier !== 'daily').length;

  return { asOf, recordedDays, tier: tierIdx >= 0 ? INSIGHT_TIERS[tierIdx] : null, next, daysToNext: next ? next.min - recordedDays : 0, cards, rules, learned, missing };
}

// 이번 날짜 인사이트를 Gemini에 넘길 짧은 사실 목록(AI가 숫자를 지어내지 않게 계산값만 넘긴다)
function insightFacts(result) {
  if (!result) return [];
  return result.cards.slice(0, 14).map(c => `${c.title}: ${c.value || ''}${c.list ? ' ' + c.list.join(', ') : ''}${c.sub ? ' (' + c.sub + ')' : ''}${c.conf === 'hyp' ? ' [가설]' : c.conf === 'pattern' ? ' [패턴]' : ''}`);
}

// ── 그리기 ──
const _INS_QUICK = {
  meal: { icon: '🍽', label: '식사', fn: d => `openFoodModalForDate('${d}','점심')` },
  sleep: { icon: '😴', label: '수면', fn: d => `openSleepModalForDate('${d}')` },
  workout: { icon: '🏃', label: '운동', fn: d => `openWorkoutLogModalForDate('${d}','medium')` },
  diary: { icon: '📝', label: '일기', fn: d => `openDiaryModalForDate('${d}')` },
};
function _insCardHtml(c) {
  const conf = c.conf ? `<span class="ins-conf ${c.conf}">${c.conf === 'pattern' ? '패턴' : '가설'} · ${c.n}일</span>` : '';
  const arrow = c.delta === 'up' ? '<span class="ins-ar up">▲</span>' : c.delta === 'down' ? '<span class="ins-ar down">▼</span>' : '';
  const body = c.list
    ? `<div class="ins-list">${c.list.map((t, i) => `<div><b>${i + 1}</b> ${_insEsc(t)}</div>`).join('')}</div>`
    : `<div class="ins-v">${_insEsc(c.value)}${arrow}</div>`;
  return `<div class="ins-card${c.wide ? ' wide' : ''}"><div class="ins-top"><span class="ins-ic">${c.icon}</span><span class="ins-t">${_insEsc(c.title)}</span></div>${body}${c.sub ? `<div class="ins-s">${_insEsc(c.sub)}</div>` : ''}${conf}</div>`;
}
function renderInsightsHtml(r) {
  if (!r) return '';
  const tierIdx = r.tier ? INSIGHT_TIERS.findIndex(t => t.id === r.tier.id) : -1;
  const pct = r.next ? Math.min(100, Math.round(r.recordedDays / r.next.min * 100)) : 100;
  const head = `<div class="ins-head">
    <div class="ins-head-row"><span class="ins-badge">📚 누적 ${r.recordedDays}일</span>${r.learned ? `<span class="ins-badge soft">💡 알게 된 것 ${r.learned}개</span>` : ''}</div>
    ${r.next ? `<div class="ins-prog"><div class="ins-prog-f" style="width:${pct}%"></div></div><div class="ins-prog-t">${r.next.icon} <b>${r.next.label}</b>까지 ${r.daysToNext}일 더 기록하면 열려요</div>` : `<div class="ins-prog-t">🌙 모든 리포트가 열렸어요</div>`}
  </div>`;
  let html = head;
  INSIGHT_TIERS.forEach((t, i) => {
    const cs = r.cards.filter(c => c.tier === t.id);
    if (i <= tierIdx || t.id === 'daily') {
      if (t.id === 'daily') {
        const quick = (r.missing || []).map(k => _INS_QUICK[k]).filter(Boolean)
          .map(q => `<button class="ins-quick" onclick="${q.fn(r.asOf)}">${q.icon} ${q.label} +</button>`).join('');
        if (!cs.length && !quick) return;
        html += `<div class="ins-sec"><div class="ins-sec-t">${t.icon} ${t.label}</div>${cs.length ? `<div class="ins-grid">${cs.map(_insCardHtml).join('')}</div>` : ''}${quick ? `<div class="ins-quick-row">${quick}</div>` : ''}</div>`;
      } else if (cs.length) {
        html += `<div class="ins-sec"><div class="ins-sec-t">${t.icon} ${t.label}</div><div class="ins-grid">${cs.map(_insCardHtml).join('')}</div></div>`;
      }
      if (t.id === 'monthly' && r.rules.length) {
        html += `<div class="ins-sec"><div class="ins-sec-t">📖 나 사용설명서</div><div class="ins-rules">${r.rules.map(x => `<div class="ins-rule"><span>${x.icon}</span><span>${_insEsc(x.text)}</span>${x.conf === 'pattern' ? '' : '<em>가설</em>'}</div>`).join('')}</div></div>`;
      }
    } else if (i === Math.max(tierIdx, 0) + 1) {
      // 바로 다음 단계만 흐리게 미리보기
      const teasers = INSIGHT_TEASERS[t.id] || [];
      if (teasers.length) html += `<div class="ins-sec locked"><div class="ins-sec-t">🔒 ${t.label} <span>${t.min}일</span></div><div class="ins-grid">${teasers.map(x => `<div class="ins-card lock"><div class="ins-top"><span class="ins-ic">❔</span><span class="ins-t">${_insEsc(x)}</span></div><div class="ins-v blur">00.0</div></div>`).join('')}</div></div>`;
    }
  });
  return `<div class="ins-wrap">${html}</div>`;
}

// 마이페이지 등에 붙이는 한 줄 진행 표시
function renderInsightProgressHtml(r) {
  if (!r) return '';
  const pct = r.next ? Math.min(100, Math.round(r.recordedDays / r.next.min * 100)) : 100;
  return `<div class="ins-mini">
    <div class="ins-head-row"><span class="ins-badge">📚 누적 ${r.recordedDays}일</span>${r.learned ? `<span class="ins-badge soft">💡 ${r.learned}개</span>` : ''}</div>
    ${r.next ? `<div class="ins-prog"><div class="ins-prog-f" style="width:${pct}%"></div></div><div class="ins-prog-t">${r.next.icon} ${r.next.label}까지 ${r.daysToNext}일</div>` : `<div class="ins-prog-t">🌙 모든 리포트가 열렸어요</div>`}
  </div>`;
}

if (typeof module !== 'undefined') module.exports = { buildInsights, renderInsightsHtml, renderInsightProgressHtml, insightFacts, diaryMood, mealGL, INSIGHT_TIERS };
