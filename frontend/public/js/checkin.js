// ═══════════════════════ 새 기록 흐름 (2026-11) ═══════════════════════
// 앱을 열면 그 시간대 질문(체크인)이 먼저 뜨고, 답하면 홈에 기록 카드가 차곡차곡 쌓인다.
// 답은 기존 기록 구조에 그대로 저장한다(끼니 → meals, 수면 → sleep_logs, 운동 → workouts, 영양제 → 루틴 체크).
// 그래서 칼로리 점수, 친구 비교, 치팅데이 칼로리는 지금처럼 계산된다.
// 체크인에서만 나오는 값(잠의 질, 칼로리 구간, 운동 못 한 이유와 일기, 리포트 문장)은 오늘의 루틴 체크 문서에 ci로 함께 저장한다.

const CI_SLOTS = ['morning', 'lunch', 'dinner', 'workout'];
const CI_W = { morning: 10, lunch: 20, dinner: 30, workout: 40 };
const CI_TITLE = { morning: '수면과 아침', lunch: '점심', dinner: '저녁', workout: '운동과 영양제' };
const CI_MEAL_LABEL = { morning: '아침', lunch: '점심', dinner: '저녁' };
const CI_HEAD = {
  morning: '좋은 아침이에요.\n잘 잤나요?', lunch: '점심으로\n뭘 드셨나요?',
  dinner: '저녁은\n어떻게 드셨나요?', workout: '오늘 운동\n하셨나요?'
};
const CI_BANNER = {
  morning: ['좋은 아침이에요. 잘 잤나요?', '수면과 아침만 눌러 주세요'],
  lunch: ['점심으로 뭘 드셨나요?', '한 번만 누르면 끝나요'],
  dinner: ['저녁은 어떻게 드셨나요?', '오늘 보고서가 거의 다 찼어요'],
  workout: ['오늘 운동하셨나요?', '못 했어도 괜찮아요. 그것도 기록이에요'],
  report: ['오늘의 리포트가 나왔어요', '내일 바꿔볼 행동 하나를 확인해 보세요']
};
const CI_MEAL_OPTS = {
  morning: [
    { id: 'none', label: '안 먹었어요', kcal: 0, ex: '공복으로 시작했어요' },
    { id: 'light', label: '가볍게 · 약 300kcal', kcal: 300, ex: '요거트, 바나나, 빵 한 조각' },
    { id: 'full', label: '든든하게 · 약 600kcal', kcal: 600, ex: '밥과 국, 토스트와 계란' }
  ],
  lunch: [
    { id: 'k300', label: '약 300kcal', kcal: 300, ex: '콥샐러드, 샌드위치 하나' },
    { id: 'k600', label: '약 600kcal', kcal: 600, ex: '비빔밥, 김치찌개 백반' },
    { id: 'k900', label: '900kcal 이상', kcal: 900, ex: '돈까스 정식, 짜장면과 탕수육' }
  ],
  dinner: [
    { id: 'k300', label: '약 300kcal', kcal: 300, ex: '닭가슴살 샐러드, 두부 한 그릇' },
    { id: 'k600', label: '약 600kcal', kcal: 600, ex: '제육덮밥, 연어 포케' },
    { id: 'k900', label: '900kcal 이상', kcal: 900, ex: '치킨과 맥주, 삼겹살과 밥' }
  ]
};
// 운동 종류와 강도(MET). 근거: Compendium of Physical Activities 2011
const CI_WORKOUTS = [
  { id: 'none', label: '오늘은 못 했어요' },
  { id: 'walk', label: '걷기', levels: [['아주 천천히 · 시속 3km', 2.8], ['천천히 · 시속 4km', 3.0], ['보통 · 시속 5km', 3.5], ['빠르게 · 시속 5.6km', 4.3], ['아주 빠르게 · 시속 6.4km', 5.0]], def: 2, slopes: true },
  { id: 'strength', label: '근력 운동', levels: [['가볍게 · 가벼운 무게, 여러 동작', 3.5], ['보통 · 스쿼트, 런지 같은 큰 동작', 5.0], ['힘들게 · 무거운 무게, 쉬는 시간 짧게', 6.0]], def: 1 },
  { id: 'pilates', label: '필라테스', levels: [['가볍게 · 매트 기초', 3.0], ['보통 · 리포머(기구)', 3.5], ['힘들게 · 쉬는 시간 짧게', 4.5]], def: 1 },
  { id: 'stretch', label: '스트레칭, 요가', levels: [['가볍게 · 스트레칭', 2.3], ['보통 · 요가', 2.5], ['힘들게 · 파워 요가', 4.0]], def: 1 }
];
const CI_SLOPES = [['평지', 0], ['완만한 오르막', 1.8], ['가파른 오르막', 4.5]];
function ciWorkoutMet(w, lvl, slope) {
  const L = w.levels[lvl != null ? lvl : w.def];
  return Math.round((L[1] + (w.slopes ? CI_SLOPES[slope || 0][1] : 0)) * 10) / 10;
}
const CI_MINS = [10, 20, 30, 60];
const CI_REASONS = ['피곤해서', '어제 해서', '그냥 귀찮아서', '기타'];
const CI_SLEEP_Q = ['푹 잤어요', '보통이에요', '잘 못 잤어요'];
const CI_SLEEP_H = [{ l: '5시간 이하', h: 5 }, { l: '6시간', h: 6 }, { l: '7시간', h: 7 }, { l: '8시간', h: 8 }, { l: '9시간 이상', h: 9 }];
const CI_DAYS = '일월화수목금토';

let CI = null;          // 지금 열린 체크인의 입력값
let _ciJustAdded = null; // 방금 답한 칸(그 카드만 올라오는 효과를 준다)
let _ciSug = [];        // 음식 검색 결과
let _ciToastT = null, _ciBannerSlot = null;

function _ciEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _ciFmt(n) { return Math.round(Number(n) || 0).toLocaleString('ko-KR'); }
function _ciHM(ms) { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function _ciAddDays(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function ciGet() { return (S.checks && S.checks.ci) || {}; }
function ciData() { S.checks = S.checks || {}; if (!S.checks.ci || typeof S.checks.ci !== 'object') S.checks.ci = {}; return S.checks.ci; }
function ciMeal(label) { return (S.meals || []).find(m => m.label === label && (m.text || m.kcal != null)); }
function ciTodaySleep() { const t = todayISOLocal(); return (S.sleepLogs || []).find(s => s.date === t && s.hours); }
function ciWorkoutsToday() { return typeof todayWorkoutEntries === 'function' ? todayWorkoutEntries() : []; }
function ciDone(slot) {
  if (ciGet()[slot]) return true;
  if (slot === 'morning') return !!ciTodaySleep();
  if (slot === 'workout') return ciWorkoutsToday().length > 0;
  return !!ciMeal(CI_MEAL_LABEL[slot]);
}
function ciFillPct() { return CI_SLOTS.reduce((a, s) => a + (ciDone(s) ? CI_W[s] : 0), 0); }

// ── 자동으로 뜨는 시간 ──
function _ciSkipKey() { return 'bellamona_ci_skip_' + todayISOLocal(); }
function ciDismissed(slot) { try { return (JSON.parse(localStorage.getItem(_ciSkipKey()) || '[]')).includes(slot); } catch (e) { return false; } }
function ciDismiss(slot) { try { const a = JSON.parse(localStorage.getItem(_ciSkipKey()) || '[]'); if (!a.includes(slot)) a.push(slot); localStorage.setItem(_ciSkipKey(), JSON.stringify(a)); } catch (e) { } }
function ciDueSlots() {
  const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
  const due = [];
  if (h >= 5 && h < 11) due.push('morning');
  if (h >= 11 && h < 16) due.push('lunch');
  if (h >= 17.5) due.push('dinner');
  if (h >= 19.5) due.push('workout');
  return due.filter(s => !ciDone(s) && !ciDismissed(s));
}
function maybeAutoCheckin() {
  try {
    if (typeof _onboarded !== 'undefined' && !_onboarded) return;
    const home = document.getElementById('s-home'); if (!home || !home.classList.contains('on')) return;
    if (document.querySelector('.mov.open') || document.querySelector('#wk-focus.open')) return;
    const slot = ciDueSlots()[0];
    if (slot) openCheckin(slot, true);
    else if (new Date().getHours() < 14 && ciDone('morning')) ciMaybeYesterday();
  } catch (e) { console.error('[ci auto]', e); }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (typeof ensureFreshDay === 'function') ensureFreshDay();
  setTimeout(() => { if (typeof updateHome === 'function') updateHome(); maybeAutoCheckin(); }, 600);
});

// ── 체크인 열기 ──
function openCheckin(slot, auto, date) {
  const past = date && date !== todayISOLocal();
  const c = past ? {} : (ciGet()[slot] || {});
  const sl = slot === 'morning' && !past ? ciTodaySleep() : null;
  CI = {
    slot, auto: !!auto,
    opt: c.opt || null, text: c.text || '', kcal: c.kcal != null ? c.kcal : null, save: true,
    sq: c.sq || null, sh: c.sh || (sl ? Math.min(9, Math.max(5, Math.round(sl.hours))) : null),
    min: c.min || 30, reason: c.reason || null, diary: c.diary || '', supp: c.supp != null ? c.supp : null,
    lvl: c.lvl != null ? c.lvl : null, slope: c.slope || 0, date: past ? date : null
  };
  _ciSug = [];
  hideCiBanner();
  renderCheckin();
  openMod('mod-checkin');
}
function closeCheckin() {
  if (CI && CI.auto && !ciGet()[CI.slot]) ciDismiss(CI.slot);
  closeMod('mod-checkin'); CI = null;
}
function ciSet(k, v) {
  if (!CI) return; CI[k] = v;
  if (k === 'opt' && CI_MEAL_OPTS[CI.slot]) CI.kcal = null;
  if (k === 'opt' && CI.slot === 'workout') { CI.lvl = null; CI.slope = 0; }
  renderCheckin();
}
function ciNearest(opts, kcal) { return opts.reduce((b, x) => Math.abs(x.kcal - kcal) < Math.abs(b.kcal - kcal) ? x : b, opts[0]); }
function ciPickFav(i) {
  const f = (S.favFoods || [])[i]; if (!f || !CI) return;
  CI.text = f.name; CI.kcal = f.kcal; CI.opt = ciNearest(CI_MEAL_OPTS[CI.slot], f.kcal).id; CI.save = false; _ciSug = [];
  renderCheckin();
}
function ciPickSug(i) {
  const f = _ciSug[i]; if (!f || !CI) return;
  CI.text = f.name; _ciSug = [];
  CI.food = f; ciSetAmt(f.sg);
}
// 고른 음식의 양: 인분이나 g으로. 칼로리를 다시 계산하고 칼로리 구간도 맞춘다.
function ciSetAmt(g) {
  if (!CI || !CI.food) return;
  g = Math.max(1, Math.round(Number(g) || 0));
  CI.amt = g; CI.kcal = Math.round(CI.food.k100 * g / 100);
  if (CI_MEAL_OPTS[CI.slot]) CI.opt = ciNearest(CI_MEAL_OPTS[CI.slot], CI.kcal).id;
  renderCheckin();
}
function ciAmtHtml(f, cur, fn) {
  const serv = [0.5, 1, 1.5, 2].map(k => { const g = Math.round(f.sg * k); return `<button type="button" class="ci-chip ci-pill${cur === g ? ' on' : ''}" onclick="${fn}(${g})">${k}인분</button>`; }).join('');
  const gs = [100, 200, 300].map(g => `<button type="button" class="ci-chip ci-pill${cur === g ? ' on' : ''}" onclick="${fn}(${g})">${g}g</button>`).join('');
  return `<div class="ci-amt"><div class="ci-hint">인분으로 <small>(${_ciEsc(f.unit)}${f.est ? ', 추정' : ''})</small></div><div class="ci-wrap">${serv}</div>
    <div class="ci-hint">g으로</div><div class="ci-wrap">${gs}<label class="ci-g"><input type="number" min="1" inputmode="numeric" value="${cur || ''}" placeholder="직접" onchange="${fn}(this.value)">g</label></div></div>`;
}
// 음식 DB 검색: 1인분 단위가 있으면 그 칼로리, 없으면 100g 기준
function ciFoodSearch(q, n) {
  if (typeof searchFoods !== 'function' || !String(q).trim()) return [];
  return searchFoods(q, n || 5).map(f => {
    const sv = typeof foodServing === 'function' ? foodServing(f) : { label: f.u ? f.u[0] : '100g', g: f.u ? f.u[1] : 100, est: !f.u };
    return { name: f.n, k100: f.kcal, sg: sv.g, est: sv.est, unit: sv.est ? `1인분 약 ${sv.g}g` : `${sv.label} ${sv.g}g`, kcal: Math.round(f.kcal * sv.g / 100) };
  });
}
function ciOnText(v) {
  if (!CI) return;
  CI.text = v; CI.kcal = null; CI.food = null; CI.amt = null;
  const am = document.getElementById('ci-amt-box'); if (am) am.innerHTML = '';
  _ciSug = CI_MEAL_OPTS[CI.slot] ? ciFoodSearch(v, 5) : [];
  const box = document.getElementById('ci-sug'); if (box) box.innerHTML = ciSugHtml();
  const pk = document.getElementById('ci-picked'); if (pk) pk.textContent = '';
  const sv = document.getElementById('ci-savefav'); if (sv) sv.style.display = v.trim() && CI_MEAL_OPTS[CI.slot] ? 'flex' : 'none';
}
function ciSugHtml() {
  if (!_ciSug.length) return '';
  return `<div class="ci-sug">${_ciSug.map((f, i) => `<button type="button" onclick="ciPickSug(${i})"><span>${_ciEsc(f.name)} <small>${_ciEsc(f.unit)}</small></span><b>${f.kcal}kcal</b></button>`).join('')}</div>`;
}
function ciCanSubmit() {
  if (!CI || !CI.opt) return false;
  if (CI.slot === 'morning' && (!CI.sq || !CI.sh)) return false;
  if (CI.slot === 'workout' && (CI.supp === null || (CI.opt === 'none' && !CI.reason))) return false;
  return true;
}
function _ciChips(list, key, cls) {
  return list.map(o => {
    const v = typeof o === 'object' ? o.v : o, l = typeof o === 'object' ? o.l : o;
    const on = CI[key] === v;
    return `<button type="button" class="${cls || 'ci-chip'}${on ? ' on' : ''}" onclick='ciSet(${JSON.stringify(key)}, ${JSON.stringify(v)})'>${_ciEsc(l)}</button>`;
  }).join('');
}
function renderCheckin() {
  const box = document.getElementById('ci-body'); if (!box || !CI) return;
  const s = CI.slot, isMeal = !!CI_MEAL_OPTS[s];
  const isY = CI.date && CI.date === _ciAddDays(todayISOLocal(), -1);
  const dLabel = CI.date ? (isY ? '어제' : `${Number(CI.date.slice(5, 7))}월 ${Number(CI.date.slice(8))}일`) : '';
  const pastHead = { dinner: `${dLabel} 저녁은\n어떻게 드셨나요?`, workout: `${dLabel} 운동\n하셨나요?` };
  let h = `<div class="ci-top"><span>${CI.date ? `${dLabel} 기록 채우기 · ${CI_TITLE[s]}` : `${_ciHM(Date.now())} · ${CI_TITLE[s]}`}</span><button type="button" class="ci-x" onclick="closeCheckin()" aria-label="닫기"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
  <h2 class="ci-h">${_ciEsc(CI.date ? pastHead[s] : CI_HEAD[s]).replace(/\n/g, '<br>')}</h2>
  ${CI.date ? `<div class="ci-hint" style="margin-top:-8px">${CI.date === _ciAddDays(todayISOLocal(), -1) ? '어제 비어 있던 칸이에요. 하나만 누르면 어제 날짜로 들어가요.' : `${Number(CI.date.slice(5, 7))}월 ${Number(CI.date.slice(8))}일 날짜로 들어가요.`}</div>` : ''}`;
  if (s === 'morning') {
    h += `<div class="ci-q">어떻게 잤어요?</div><div class="ci-row">${_ciChips(CI_SLEEP_Q, 'sq')}</div>
      <div class="ci-q">몇 시간 잤어요?</div><div class="ci-row ci-row5">${_ciChips(CI_SLEEP_H.map(x => ({ v: x.h, l: x.l })), 'sh')}</div>
      <div class="ci-q">아침은 먹었어요?</div>`;
  }
  if (isMeal) {
    h += `<div class="ci-col">${CI_MEAL_OPTS[s].map(o => `<button type="button" class="ci-opt${CI.opt === o.id ? ' on' : ''}" onclick='ciSet("opt", ${JSON.stringify(o.id)})'><b>${_ciEsc(o.label)}</b><small>${_ciEsc(o.ex)}</small></button>`).join('')}</div>`;
    const favs = S.favFoods || [];
    if (favs.length) h += `<div class="ci-q ci-q-s">자주 먹는 음식</div><div class="ci-wrap">${favs.map((f, i) => `<button type="button" class="ci-chip ci-pill${CI.text === f.name ? ' on' : ''}" onclick="ciPickFav(${i})">${_ciEsc(f.name)} · ${f.kcal}kcal</button>`).join('')}</div>`;
  }
  if (s === 'workout') {
    h += `<div class="ci-col">${CI_WORKOUTS.map(o => `<button type="button" class="ci-opt ci-opt1${CI.opt === o.id ? ' on' : ''}" onclick='ciSet("opt", ${JSON.stringify(o.id)})'><b>${_ciEsc(o.label)}</b></button>`).join('')}</div>`;
    const wsel = CI_WORKOUTS.find(x => x.id === CI.opt);
    if (wsel && wsel.levels) {
      if (CI.lvl == null) CI.lvl = wsel.def;
      h += `<div class="ci-q">${wsel.id === 'walk' ? '얼마나 빠르게 걸었어요?' : '강도는 어땠어요?'}</div><div class="ci-col ci-lvls">${wsel.levels.map((L, i) => `<button type="button" class="ci-chip${CI.lvl === i ? ' on' : ''}" onclick="ciSet('lvl', ${i})">${_ciEsc(L[0])}</button>`).join('')}</div>`;
      if (wsel.slopes) h += `<div class="ci-q">길은요?</div><div class="ci-row">${CI_SLOPES.map((sl, i) => `<button type="button" class="ci-chip${(CI.slope || 0) === i ? ' on' : ''}" onclick="ciSet('slope', ${i})">${sl[0]}</button>`).join('')}</div>`;
    }
    if (CI.opt && CI.opt !== 'none') h += `<div class="ci-q">얼마나 했어요?</div><div class="ci-row">${_ciChips(CI_MINS.map(m => ({ v: m, l: m + '분' })), 'min')}</div>`;
    if (CI.opt === 'none') {
      h += `<div class="ci-q">왜 못 했어요?</div><div class="ci-wrap">${_ciChips(CI_REASONS, 'reason', 'ci-chip ci-pill')}</div>`;
      if (CI.reason === '기타') h += `<label class="ci-q ci-diary-l" for="ci-diary">기분이 좋지 않았나요?</label>
        <textarea id="ci-diary" class="ci-ta" placeholder="오늘 있었던 일이나 기분을 편하게 적어 보세요" oninput="if(CI)CI.diary=this.value">${_ciEsc(CI.diary)}</textarea>
        <div class="ci-hint">마이페이지 기록에 일기로 남아요</div>`;
    }
    h += `<button type="button" class="ci-link" onclick="closeCheckin();goH('growth')">근력, 스트레칭, 내 몸 맞춤 운동 보러 가기</button>`;
    h += `<div class="ci-q">영양제는 챙겨 먹었어요?</div><div class="ci-row">${_ciChips([{ v: true, l: '먹었어요' }, { v: false, l: '못 먹었어요' }], 'supp')}</div>`;
  }
  const showEtc = isMeal || (s === 'workout' && CI.opt && CI.opt !== 'none');
  if (showEtc) {
    const lbl = s === 'workout' ? '기타 · 어떤 운동이었는지 (선택)' : s === 'morning' ? '아침에 뭐 먹었는지 검색하거나 적기 (선택)' : '기타 · 음식 검색하거나 적기 (선택)';
    const ph = s === 'workout' ? '예: 계단 오르기' : s === 'morning' ? '예: 그릭요거트' : s === 'lunch' ? '예: 비빔밥' : '예: 제육덮밥';
    h += `<label class="ci-q ci-q-s" for="ci-text">${lbl}</label>
      <input id="ci-text" class="ci-in" type="text" autocomplete="off" value="${_ciEsc(CI.text)}" placeholder="${ph}" oninput="ciOnText(this.value)">
      <div id="ci-sug">${ciSugHtml()}</div>
      <div id="ci-amt-box">${isMeal && CI.food && CI.text === CI.food.name ? ciAmtHtml(CI.food, CI.amt, 'ciSetAmt') : ''}</div>
      <div id="ci-picked" class="ci-hint ci-hint-a">${isMeal && CI.kcal != null && CI.text ? `${_ciEsc(CI.text)}${CI.amt ? ` ${CI.amt}g` : ''} · ${CI.kcal}kcal로 기록돼요` : ''}</div>`;
    if (isMeal) h += `<label id="ci-savefav" class="ci-check" style="display:${CI.text.trim() ? 'flex' : 'none'}"><input type="checkbox" ${CI.save ? 'checked' : ''} onchange="if(CI)CI.save=this.checked"> 자주 먹는 음식으로 저장</label>`;
  }
  h += `<div class="ci-foot"><button type="button" class="btn btn-p ci-submit" ${ciCanSubmit() ? '' : 'disabled'} onclick="ciSubmit()">기록하기</button>${CI.date ? '<button type="button" class="btn btn-o" style="margin-top:8px" onclick="ciSkipPast()">기억이 안 나요, 건너뛰기</button>' : ''}</div>`;
  box.innerHTML = h;
}

// ── 저장 ──
function ciUpsertMeal(label, text, kcal) {
  let m = S.meals.find(x => x.label === label);
  if (!m) { m = { id: S.nextMealId++, label, time: _ciHM(Date.now()), text: '', kcal: null, foods: [] }; S.meals.push(m); }
  m.text = text; m.kcal = kcal; m.foods = [];
  if (!m.time) m.time = _ciHM(Date.now());
  if (typeof saveMealRow === 'function') saveMealRow(m);
}
function ciSubmit() {
  if (!ciCanSubmit()) return;
  if (CI.date) return ciSubmitPast();
  const s = CI.slot, today = todayISOLocal(), now = Date.now(), ci = ciData();
  const before = ciFillPct();
  const text = (CI.text || '').trim();
  if (s === 'morning') {
    const entry = { date: today, bedtime: null, wake: null, hours: CI.sh };
    const i = S.sleepLogs.findIndex(x => x.date === today);
    if (i >= 0) S.sleepLogs[i] = Object.assign({}, S.sleepLogs[i], { hours: CI.sh }); else S.sleepLogs.push(entry);
    if (typeof saveSleepRow === 'function') saveSleepRow(i >= 0 ? S.sleepLogs[i] : entry);
    S.checks.c1 = true;
    const o = CI_MEAL_OPTS.morning.find(x => x.id === CI.opt);
    const kcal = CI.kcal != null ? CI.kcal : o.kcal;
    ci.morning = { sq: CI.sq, sh: CI.sh, opt: CI.opt, text, kcal, at: now };
    if (CI.opt !== 'none') ciUpsertMeal('아침', text || `${o.label.split(' · ')[0]} (간편 기록)`, kcal);
  } else if (s === 'workout') {
    // 같은 날 체크인으로 남긴 운동을 다시 고치면 예전 행은 지우고 새로 남긴다
    const prev = ci.workout;
    if (prev && prev.time) {
      S.workoutLogs.filter(w => w.date === today && w.time === prev.time && w.exerciseType === prev.type).forEach(w => {
        if (typeof deleteWorkoutRow === 'function') deleteWorkoutRow(w);
        S.workoutLogs.splice(S.workoutLogs.indexOf(w), 1);
      });
    }
    const w = CI_WORKOUTS.find(x => x.id === CI.opt);
    const rec = { opt: CI.opt, supp: CI.supp, at: now };
    if (CI.opt === 'none') {
      rec.reason = CI.reason;
      rec.diary = CI.reason === '기타' ? (CI.diary || '').trim() : '';
      if (rec.diary && typeof todayDiaryEntry === 'function' && !todayDiaryEntry()) {
        const entry = { date: today, d: '오늘', t: rec.diary };
        S.diaries.push(entry); S.checks.c3 = true;
        if (typeof saveDiaryRow === 'function') saveDiaryRow(entry);
      }
    } else {
      const time = _ciHM(now);
      const met = ciWorkoutMet(w, CI.lvl, CI.slope);
      const intensity = met < 3.5 ? 'low' : met < 5 ? 'medium' : 'high';
      const lvlName = w.levels[CI.lvl != null ? CI.lvl : w.def][0].split(' · ')[0];
      const kcal = typeof exerciseKcal === 'function' ? exerciseKcal(intensity, CI.min, met) : Math.round(met * 3.5 * 55 / 200 * CI.min);
      const entry = { id: S.nextWorkoutId++, date: today, time, intensity, durationMin: CI.min, exerciseType: text || `${w.label} (${lvlName}${w.slopes && CI.slope ? ', ' + CI_SLOPES[CI.slope][0] : ''})`, met, kcal };
      S.workoutLogs.push(entry);
      if (typeof saveWorkoutRow === 'function') saveWorkoutRow(entry);
      Object.assign(rec, { min: CI.min, text, time, type: entry.exerciseType, kcal, lvl: CI.lvl, slope: CI.slope || 0 });
    }
    S.checks.suppAll = !!CI.supp;
    if (CI.supp) (S.routines.oxytocin || []).forEach(r => { S.checks[r.id] = true; });
    ci.workout = rec;
  } else {
    const o = CI_MEAL_OPTS[s].find(x => x.id === CI.opt);
    const kcal = CI.kcal != null ? CI.kcal : o.kcal;
    ci[s] = { opt: CI.opt, text, kcal, at: now };
    ciUpsertMeal(CI_MEAL_LABEL[s], text || `${o.label} (간편 기록)`, kcal);
  }
  if (CI_MEAL_OPTS[s] && text && CI.save) {
    const kcal = CI.kcal != null ? CI.kcal : CI_MEAL_OPTS[s].find(x => x.id === CI.opt).kcal;
    ciAddFav({ name: text, kcal });
  }
  ci.report = Object.assign(ciReport(), { date: today });
  _ciJustAdded = s;
  if (typeof saveChecksRow === 'function') saveChecksRow();
  closeMod('mod-checkin'); CI = null;
  if (typeof saveState === 'function') saveState();
  if (typeof updateHome === 'function') updateHome();
  const after = ciFillPct();
  const left = CI_SLOTS.filter(x => !ciDone(x));
  const sub = after >= 100 ? '오늘 리포트가 완성됐어요'
    : left[0] === 'lunch' ? '점심 때 또 물어볼게요' : left[0] === 'dinner' ? '저녁에 또 만나요'
    : left[0] === 'workout' ? '운동만 답하면 오늘 보고서가 완성돼요' : '남은 것도 한 번씩만 눌러 주세요';
  showCiToast(before, after, sub);
  // 지금 시간에 답할 게 더 남아 있으면 알림처럼 위에 띄운다
  setTimeout(() => {
    if (s === 'morning') { ciMaybeYesterday(); return; }
    const next = ciDueSlots()[0];
    if (next) showCiBanner(next); else if (before < 100 && after >= 100) showCiBanner('report');
  }, 3200);
}

// ── 어제 빈칸 채우기: 아침 질문 뒤에 어제 저녁이나 운동이 비어 있으면 한 장씩 더 묻는다 ──
let _ciYday = null, _ciYGaps = [];
function _ciYKey(d) { return 'bellamona_ci_yday_' + d; }
async function ciMaybeYesterday() {
  try {
    const y = _ciAddDays(todayISOLocal(), -1);
    if (localStorage.getItem(_ciYKey(y))) return;
    if (document.querySelector('.mov.open')) return;
    const r = await fetchApi(apiUrl('/api/data/day?date=' + y), { credentials: 'include' });
    if (!r.ok) return;
    const data = await r.json();
    // 어제 기록이 하나도 없고 기록한 날도 거의 없으면(막 시작한 사람) 어제를 묻지 않는다
    const yAny = (data.meals || []).length || (data.workouts || []).length || (data.checks && Object.keys(data.checks).length);
    if (!yAny && (S.totalLoggedDays || 0) < 2) return;
    _ciYday = { date: y, data };
    const meals = data.meals || [], ci = (data.checks && data.checks.ci) || {};
    const gaps = [];
    if (!meals.some(m => m.label === '저녁' && (m.description || m.kcal != null)) && !ci.dinner) gaps.push('dinner');
    if (!(data.workouts || []).length && !ci.workout) gaps.push('workout');
    if (!gaps.length) { localStorage.setItem(_ciYKey(y), '1'); return; }
    _ciYGaps = gaps;
    if (!document.querySelector('.mov.open')) openCheckin(gaps[0], false, y);
  } catch (e) { console.error('[ci yesterday]', e); }
}
function _ciNextPast() {
  const y = CI && CI.date; const cur = CI && CI.slot;
  _ciYGaps = _ciYGaps.filter(g => g !== cur);
  closeMod('mod-checkin'); CI = null;
  if (_ciYGaps.length && y) setTimeout(() => openCheckin(_ciYGaps[0], false, y), 350);
  else if (y) { try { localStorage.setItem(_ciYKey(y), '1'); } catch (e) { } }
}
function ciSkipPast() { _ciNextPast(); }
async function ciSubmitPast() {
  const s = CI.slot, date = CI.date, text = (CI.text || '').trim();
  // 그날 체크 문서를 통째로 다시 쓰므로, 먼저 그날 기록을 읽어 와서 합친다
  if (!(_ciYday && _ciYday.date === date)) {
    try { const r = await fetchApi(apiUrl('/api/data/day?date=' + date), { credentials: 'include' }); if (!r.ok) throw new Error('HTTP ' + r.status); _ciYday = { date, data: await r.json() }; }
    catch (e) { console.error('[ci past load]', e); alert('그날 기록을 불러오지 못했어요. 잠시 후 다시 해 주세요.'); return; }
  }
  if (!CI) return;
  const day = _ciYday.data;
  const checks = Object.assign({}, day.checks || {});
  const ci = Object.assign({}, checks.ci || {});
  const at = new Date(date + 'T21:00:00').getTime();
  if (s === 'workout') {
    const rec = { opt: CI.opt, supp: CI.supp, at };
    if (CI.opt === 'none') { rec.reason = CI.reason; rec.diary = CI.reason === '기타' ? (CI.diary || '').trim() : ''; }
    else {
      const w = CI_WORKOUTS.find(x => x.id === CI.opt);
      const met = ciWorkoutMet(w, CI.lvl, CI.slope), intensity = met < 3.5 ? 'low' : met < 5 ? 'medium' : 'high';
      const lvlName = w.levels[CI.lvl != null ? CI.lvl : w.def][0].split(' · ')[0];
      const kcal = exerciseKcal(intensity, CI.min, met);
      const entry = { id: S.nextWorkoutId++, date, time: '20:00', intensity, durationMin: CI.min, exerciseType: text || `${w.label} (${lvlName}${w.slopes && CI.slope ? ', ' + CI_SLOPES[CI.slope][0] : ''})`, met, kcal };
      S.workoutLogs.push(entry);
      if (typeof saveWorkoutRow === 'function') saveWorkoutRow(entry);
      Object.assign(rec, { min: CI.min, text, time: '20:00', type: entry.exerciseType, kcal, lvl: CI.lvl, slope: CI.slope || 0 });
      (day.workouts = day.workouts || []).push({ performed_date: date });
    }
    checks.suppAll = !!CI.supp;
    if (CI.supp) (S.routines.oxytocin || []).forEach(r => { checks[r.id] = true; });
    ci.workout = rec;
  } else {
    const o = CI_MEAL_OPTS[s].find(x => x.id === CI.opt);
    const kcal = CI.kcal != null ? CI.kcal : o.kcal;
    ci[s] = { opt: CI.opt, text, kcal, at };
    if (typeof saveMealRow === 'function') saveMealRow({ label: CI_MEAL_LABEL[s], time: '19:00', text: text || `${o.label} (간편 기록)`, kcal, foods: [] }, date);
    (day.meals = day.meals || []).push({ label: CI_MEAL_LABEL[s], kcal });
    if (text && CI.save) ciAddFav({ name: text, kcal });
  }
  checks.ci = ci; day.checks = checks;
  fetchApi(apiUrl('/api/data/checks'), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ check_date: date, checks }) })
    .catch(e => console.error('[ci past checks]', e));
  _ciHist = null; _ciMonCache = {};
  const isY = date === _ciAddDays(todayISOLocal(), -1);
  showCiToast(null, null, s === 'workout' ? '운동과 영양제를 저장했어요' : '저녁을 저장했어요', isY ? '어제 기록을 채웠어요' : `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일 기록을 채웠어요`);
  _ciNextPast();
  // 날짜별 상세가 열려 있으면 새로 그린다
  if (document.querySelector('.mov.open') && typeof showDayDetail === 'function' && document.getElementById('day-weight-input')) setTimeout(() => showDayDetail(date), 600);
}

// ── 뾰로롱 안내, 알림 배너 ──
function showCiToast(from, to, sub, title) {
  const el = document.getElementById('ci-toast'); if (!el) return;
  el.innerHTML = `<svg class="ci-spark s1" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/></svg>
    <svg class="ci-spark s2" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/></svg>
    <svg class="ci-spark s3" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/></svg>
    ${title ? `<div class="ci-t1">${_ciEsc(title)}</div>` : `<div class="ci-t1">내 몸 보고서 <b>${to}%</b> 채워졌어요</div>
    <div class="ci-bar"><div style="--from:${from}%;width:${to}%"></div></div>`}
    <div class="ci-t2">${_ciEsc(sub)}</div>`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(_ciToastT); _ciToastT = setTimeout(() => el.classList.remove('show'), 3000);
}
function showCiBanner(slot) {
  const el = document.getElementById('ci-banner'); if (!el) return;
  if (document.querySelector('.mov.open')) return;
  _ciBannerSlot = slot;
  const [t, b] = CI_BANNER[slot];
  el.innerHTML = `<span class="ci-bn-ic">B</span><span class="ci-bn-tx"><small>벨라모나 · 지금</small><b>${_ciEsc(t)}</b><span>${_ciEsc(b)}</span></span>`;
  el.classList.add('show');
}
function hideCiBanner() { const el = document.getElementById('ci-banner'); if (el) el.classList.remove('show'); _ciBannerSlot = null; }
function openCiBanner() {
  const s = _ciBannerSlot; hideCiBanner();
  if (s === 'report') openCiReport('day'); else if (s) openCheckin(s, false);
}

// ── 목표 달성률: 칼로리 40 + 운동 30 = 70, 수면 15, 영양제 15 ──
function ciScoreFor(d) {
  const sleep = d.sleepH == null ? null : d.sleepH >= 7 && d.sleepH <= 8.5 ? 15 : d.sleepH > 8.5 ? 12 : d.sleepH >= 6 ? 10 : 5;
  let kcal = null;
  if (d.mealsDone) {
    const gap = Math.abs(d.net - d.goal) / Math.max(d.goal, 1);
    kcal = gap <= 0.1 ? 40 : gap <= 0.2 ? 30 : gap <= 0.3 ? 20 : 10;
  }
  const wo = d.workoutMin >= 20 ? 30 : d.workoutMin > 0 ? 20 : 0;
  const supp = d.supp ? 15 : 0;
  return { sleep, kcal, wo, supp, total: (sleep || 0) + (kcal || 0) + wo + supp };
}
function ciTodayData() {
  const eaten = S.meals.reduce((a, m) => a + (m.kcal || 0), 0);
  const burn = typeof todayWorkoutKcal === 'function' ? todayWorkoutKcal() : 0;
  const sl = ciTodaySleep(), c = ciGet();
  const oxy = S.routines.oxytocin || [];
  const supp = !!((c.workout && c.workout.supp) || S.checks.suppAll || (oxy.length && oxy.every(r => S.checks[r.id])));
  return {
    eaten, burn, net: eaten - burn, goal: typeof phaseGoalCal === 'function' ? phaseGoalCal() : (S.goalCal || 1600),
    mealsDone: !!(ciMeal('점심') && ciMeal('저녁')), sleepH: sl ? Number(sl.hours) : null,
    workoutMin: ciWorkoutsToday().reduce((a, w) => a + (Number(w.durationMin) || 0), 0), supp
  };
}
function ciScore() {
  const d = ciTodayData(), sc = ciScoreFor(d), c = ciGet();
  const items = [
    { k: '칼로리', got: sc.kcal || 0, max: 40, v: sc.kcal == null ? '기록 중' : `${sc.kcal} / 40` },
    { k: '운동', got: sc.wo, max: 30, v: ciDone('workout') ? `${sc.wo} / 30` : '기록 전' },
    { k: '수면', got: sc.sleep || 0, max: 15, v: sc.sleep == null ? '기록 전' : `${sc.sleep} / 15` },
    { k: '영양제', got: sc.supp, max: 15, v: c.workout || d.supp ? `${sc.supp} / 15` : '기록 전' }
  ];
  return { total: sc.total, items, data: d };
}

// ── 오늘 알게 된 것 하나 + 내일 바꿔볼 행동 하나 (지금은 규칙으로, 나중에 AI로 바꿀 자리) ──
function ciReport() {
  const c = ciGet(), d = ciTodayData();
  const lunch = ciMeal('점심'), dinner = ciMeal('저녁');
  const wr = c.workout, skipped = wr && wr.opt === 'none';
  const sleepH = d.sleepH;
  let insight = '', action = '';
  if (skipped && wr.reason === '피곤해서' && sleepH != null && sleepH <= 6) { insight = '잠이 6시간 이하였던 날, 피곤해서 운동을 건너뛰었어요.'; action = '오늘 밤 30분 일찍 눕고, 내일은 10분 걷기부터 해보세요.'; }
  else if (skipped && wr.reason === '기타') { insight = '기분이 가라앉은 날로 기록했어요. 이런 날엔 운동이 더 멀게 느껴져요.'; action = '내일은 좋아하는 음악을 들으며 10분만 산책해 보세요.'; }
  else if (skipped && wr.reason === '그냥 귀찮아서') { insight = '오늘은 시작하기가 가장 어려운 날이었어요.'; action = '내일은 운동복을 먼저 꺼내 두세요. 10분만 걸어도 기록돼요.'; }
  else if (dinner && (dinner.kcal || 0) >= 900) { insight = '하루 중 저녁이 가장 무거웠어요.'; action = '내일은 점심을 600kcal 정도로 든든하게 먹고, 저녁을 한 단계 가볍게 해 보세요.'; }
  else if (d.mealsDone && d.net > d.goal * 1.2) { insight = `운동을 빼고도 목표보다 약 ${_ciFmt(d.net - d.goal)}kcal 더 먹었어요.`; action = '내일은 간식 하나를 빼거나, 저녁 먹고 20분 걸어보세요.'; }
  else if (sleepH != null && sleepH <= 6) { insight = '잠이 6시간 이하로 짧았어요.'; action = '오늘 밤은 평소보다 30분 일찍 누워 보세요.'; }
  else if (wr && !wr.supp) { insight = '영양제를 놓친 날이에요.'; action = '영양제를 칫솔 옆에 두고, 아침에 양치하면서 챙겨 보세요.'; }
  else if (skipped && wr.reason === '어제 해서') { insight = '어제 운동해서 오늘은 쉬어 갔어요. 회복도 계획의 일부예요.'; action = '내일은 다시 30분 운동을 해볼까요?'; }
  else if (lunch && dinner && (lunch.kcal || 0) <= 300 && (dinner.kcal || 0) >= 600) { insight = '점심을 가볍게 먹은 날, 저녁이 더 무거웠어요.'; action = '내일은 점심을 조금 더 든든하게 먹어 보세요.'; }
  else if (d.mealsDone) { insight = '목표 칼로리 가까이에서 하루를 마쳤어요.'; action = '오늘처럼만 하면 돼요. 내일도 알림에 한 번씩 답해 주세요.'; }
  else { insight = '기록이 더 쌓이면 나에게 맞는 패턴을 찾아 드려요.'; action = '남은 질문에 답하면 내일 바꿔볼 행동을 알려드릴게요.'; }
  return { insight, action };
}

// ── 홈 ──
function _ciCard(slot) {
  const c = ciGet()[slot] || {};
  let at = c.at, main = '', sub = '', chip = '';
  if (slot === 'morning') {
    const sl = ciTodaySleep(), m = ciMeal('아침');
    const h = c.sh || (sl && sl.hours);
    const hl = CI_SLEEP_H.find(x => x.h === c.sh);
    main = `${hl ? hl.l : h + '시간'}${c.sq ? ' · ' + c.sq : ' 잤어요'}`;
    const bo = c.opt ? CI_MEAL_OPTS.morning.find(x => x.id === c.opt) : null;
    sub = c.opt === 'none' ? '아침 안 먹었어요' : c.text ? `아침 · ${c.text}` : bo ? `아침 ${bo.label.split(' · ')[0]}` : m ? `아침 · ${m.text}` : '아침 기록 없음';
    chip = c.opt === 'none' ? '공복' : m && m.kcal != null ? `${m.kcal}kcal` : '수면';
  } else if (slot === 'workout') {
    const ws = ciWorkoutsToday();
    if (c.opt === 'none') { main = `쉬었어요 · ${c.reason}`; sub = c.diary ? c.diary.slice(0, 30) + (c.diary.length > 30 ? '…' : '') : ''; chip = '휴식'; }
    else {
      const min = ws.reduce((a, w) => a + (Number(w.durationMin) || 0), 0), kc = ws.reduce((a, w) => a + workoutKcalOf(w), 0);
      main = ws.length === 1 ? `${ws[0].exerciseType} ${ws[0].durationMin}분` : `운동 ${ws.length}번 · ${min}분`;
      chip = `-${_ciFmt(kc)}kcal`;
      if (!at && ws.length) { const [hh, mm] = (ws[ws.length - 1].time || '00:00').split(':').map(Number); const d = new Date(); d.setHours(hh, mm, 0, 0); at = d.getTime(); }
    }
    if (c.supp != null) sub = (sub ? sub + ' · ' : '') + `영양제 ${c.supp ? '먹었어요' : '못 먹었어요'}`;
  } else {
    const m = ciMeal(CI_MEAL_LABEL[slot]);
    const o = c.opt ? CI_MEAL_OPTS[slot].find(x => x.id === c.opt) : null;
    main = o ? o.label : (m && m.kcal != null ? `${m.kcal}kcal` : '기록했어요');
    sub = c.opt ? (c.text || '') : (m ? m.text : '');
    chip = m && m.kcal != null ? `${m.kcal}kcal` : '';
    if (!at && m && m.time) { const [hh, mm] = m.time.split(':').map(Number); const d = new Date(); d.setHours(hh, mm, 0, 0); at = d.getTime(); }
  }
  return { slot, at: at || 0, main, sub, chip };
}
// 다음 칸 안내 문구(지금 시간 기준)
function ciNextText(slot) {
  const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
  const start = { morning: 5, lunch: 11, dinner: 17.5, workout: 19.5 }[slot];
  const end = { morning: 11, lunch: 16, dinner: 24, workout: 24 }[slot];
  const name = { morning: '수면과 아침', lunch: '점심', dinner: '저녁', workout: '운동과 영양제' }[slot];
  const when = { morning: '아침에 잘 잤는지', lunch: '점심 때 뭘 먹었는지', dinner: '저녁 때 뭘 먹었는지', workout: '저녁에 운동과 영양제를' }[slot];
  if (h < start) return `${when} 물어볼게요.`;
  if (h < end) return `${name}을(를) 기록하면 여기에 쌓여요.`;
  return `${name}이(가) 아직 비어 있어요. 지금 적어도 돼요.`;
}
function renderCiHome() {
  const root = document.getElementById('nh-root'); if (!root) return;
  const pct = ciFillPct(), score = ciScore();
  const greet = pct >= 100 ? '오늘도 수고했어요' : pct ? '잘하고 있어요' : '오늘도 가볍게 시작해요';
  setTxt('h-greet', `${S.name}님, ${greet}`);
  const next = CI_SLOTS.find(s => !ciDone(s));
  const when = { morning: '아침', lunch: '점심 때', dinner: '저녁 때', workout: '저녁 때' };
  const ring = document.getElementById('nh-ring'); if (ring) ring.style.background = `conic-gradient(var(--accent-ink) ${Math.round(pct * 3.6)}deg, var(--sub) 0deg)`;
  setTxt('nh-pct', pct + '%');
  setTxt('nh-next', pct >= 100 ? '오늘 보고서를 다 채웠어요. 리포트를 확인해 보세요.' : ciNextText(next));
  setTxt('nh-score', score.total);
  const sb = document.getElementById('nh-score-items');
  if (sb) sb.innerHTML = score.items.map(it => `<div><div class="nh-mbar"><i style="width:${Math.round(it.got / it.max * 100)}%"></i></div><span>${it.k}</span><b>${it.v}</b></div>`).join('');
  const sl = ciTodaySleep(), ws = ciWorkoutsToday(), anyMeal = S.meals.some(m => m.text || m.kcal != null);
  const stats = [
    ['먹은 칼로리', anyMeal ? `${_ciFmt(score.data.eaten)}kcal` : '-'],
    ['수면', sl ? `${sl.hours}시간` : '-'],
    ['운동', ws.length ? `${ws.reduce((a, w) => a + (Number(w.durationMin) || 0), 0)}분` : (ciGet().workout && ciGet().workout.opt === 'none' ? '휴식' : '-')]
  ];
  const st = document.getElementById('nh-stats');
  if (st) st.innerHTML = stats.map(([k, v]) => `<div class="nh-stat"><span>${k}</span><b>${v}</b></div>`).join('');
  const cards = CI_SLOTS.filter(ciDone).map(_ciCard).sort((a, b) => a.at - b.at);
  const lastAt = Math.max(0, ...cards.map(c => c.at));
  const cb = document.getElementById('nh-cards');
  const just = _ciJustAdded; _ciJustAdded = null;
  if (cb) cb.innerHTML = cards.map(c => `<button type="button" class="nh-card${c.at && c.at === lastAt ? ' new' : ''}${c.slot === just ? ' anim' : ''}" onclick="openCheckin('${c.slot}', false)">
      <span class="nh-ck"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
      <span class="nh-cb"><small>${c.at ? _ciHM(c.at) + ' · ' : ''}${CI_TITLE[c.slot]}</small><b>${_ciEsc(c.main)}</b>${c.sub ? `<span>${_ciEsc(c.sub)}</span>` : ''}</span>
      ${c.chip ? `<em>${_ciEsc(c.chip)}</em>` : ''}</button>`).join('');
  const nx = document.getElementById('nh-nextcard');
  if (nx) {
    nx.style.display = next ? 'flex' : 'none';
    nx.innerHTML = next ? `<span class="nh-bell"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg></span><span class="nh-nt">${ciNextText(next)}</span><button type="button" onclick="openCheckin('${next}', false)">지금 기록</button>` : '';
  }
  setTxt('nh-cheat', `${_ciFmt(S.savedTotal || 0)}kcal`);
  ciRenderAction('nh-action');
  if (typeof renderPeriodCard === 'function') renderPeriodCard();
  renderWhatsNew();
  setTxt('nh-ex-custom', S.posture ? '내 몸 기반 추천' : '사진으로 추천');
}

// ── 리포트 화면 ──
let _ciRepTab = 'day', _ciHist = null, _ciHistAt = 0;
function openCiReport(tab) { _ciRepTab = tab || 'day'; renderCiReport(); openMod('mod-ci-report'); }
function setCiRepTab(t) { _ciRepTab = t; renderCiReport(); }
async function ciLoadHistory(force) {
  if (!force && _ciHist && Date.now() - _ciHistAt < 60000) return _ciHist;
  try {
    const from = _ciAddDays(todayISOLocal(), -27);
    const r = await fetchApi(apiUrl('/api/data/history?from=' + from), { credentials: 'include' });
    if (!r.ok) return null;
    _ciHist = await r.json(); _ciHistAt = Date.now();
    return _ciHist;
  } catch (e) { console.error('[ci history]', e); return null; }
}
// 날짜별로 묶은 기록 → 점수 계산용 값
function ciDays(h) {
  const days = {};
  const day = (d) => days[d] || (days[d] = { date: d, eaten: 0, burn: 0, labels: new Set(), workoutMin: 0, sleepH: null, checks: {}, any: false });
  (h.meals || []).forEach(m => { if (!(m.description || m.kcal != null)) return; const x = day(m.eaten_date); x.eaten += Number(m.kcal) || 0; x.labels.add(m.label); x.any = true; });
  (h.workouts || []).forEach(w => {
    const x = day(w.performed_date); x.workoutMin += Number(w.duration_min) || 0;
    x.burn += w.kcal != null ? Number(w.kcal) : (typeof exerciseKcal === 'function' ? exerciseKcal(w.intensity, w.duration_min, null) : 0); x.any = true;
  });
  (h.sleep || []).forEach(s => { if (s.hours) { const x = day(s.log_date); x.sleepH = Number(s.hours); x.any = true; } });
  (h.checks || []).forEach(c => { const x = day(c.date); x.checks = c.checks || {}; if (x.checks.ci && Object.keys(x.checks.ci).length) x.any = true; });
  // 오늘은 화면에 있는 최신 값으로 덮는다
  const t = todayISOLocal(), td = ciTodayData(), x = day(t);
  Object.assign(x, { eaten: td.eaten, burn: td.burn, sleepH: td.sleepH, workoutMin: td.workoutMin, checks: S.checks, labels: new Set(S.meals.filter(m => m.text || m.kcal != null).map(m => m.label)) });
  x.any = x.any || ciFillPct() > 0;
  Object.values(days).forEach(v => {
    const oxy = S.routines.oxytocin || [];
    const c = v.checks || {};
    const supp = !!((c.ci && c.ci.workout && c.ci.workout.supp) || c.suppAll || (oxy.length && oxy.every(r => c[r.id])));
    const goal = typeof phaseGoalCal === 'function' ? phaseGoalCal(new Date(v.date + 'T12:00:00')) : (S.goalCal || 1600);
    v.score = ciScoreFor({ sleepH: v.sleepH, mealsDone: v.labels.has('점심') && v.labels.has('저녁'), net: v.eaten - v.burn, goal, workoutMin: v.workoutMin, supp }).total;
  });
  return days;
}
function ciWeekAnswers(days) {
  const t = todayISOLocal();
  const list = Object.values(days).filter(d => d.any && d.date <= t).sort((a, b) => a.date.localeCompare(b.date));
  const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
  // 1. 잠을 푹 잔 날 덜 먹었나
  const ate = list.filter(d => d.sleepH != null && d.eaten > 0);
  const good = avg(ate.filter(d => d.sleepH >= 7).map(d => d.eaten)), bad = avg(ate.filter(d => d.sleepH < 7).map(d => d.eaten));
  const a1 = good != null && bad != null ? `7시간 이상 잔 날은 평균 ${_ciFmt(good)}kcal, 7시간보다 적게 잔 날은 ${_ciFmt(bad)}kcal를 먹었어요.` : '잠을 다르게 잔 날이 더 쌓이면 비교해 드릴게요.';
  // 2. 가장 많이 먹는 요일
  const last7 = list.filter(d => d.date > _ciAddDays(t, -7) && d.eaten > 0);
  const top = last7.slice().sort((a, b) => b.eaten - a.eaten)[0];
  const a2 = top ? `${CI_DAYS[new Date(top.date + 'T12:00:00').getDay()]}요일이 ${_ciFmt(top.eaten)}kcal로 가장 많았어요.` : '최근 7일 식사 기록이 쌓이면 알려드릴게요.';
  // 3. 운동을 건너뛴 이유
  const reasons = {};
  list.forEach(d => { const w = d.checks && d.checks.ci && d.checks.ci.workout; if (w && w.opt === 'none' && w.reason) reasons[w.reason] = (reasons[w.reason] || 0) + 1; });
  const rTop = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
  const a3 = rTop ? `"${rTop[0]}"가 ${rTop[1]}번으로 가장 많았어요.` : '운동을 건너뛴 날이 없거나, 아직 이유를 기록한 날이 없어요.';
  // 4. 지난주보다 달성률이 올랐나
  const thisW = avg(list.filter(d => d.date > _ciAddDays(t, -7)).map(d => d.score));
  const lastW = avg(list.filter(d => d.date <= _ciAddDays(t, -7) && d.date > _ciAddDays(t, -14)).map(d => d.score));
  const a4 = thisW != null && lastW != null ? (thisW >= lastW ? `평균 ${lastW}점에서 ${thisW}점으로 ${thisW - lastW}점 올랐어요.` : `평균 ${lastW}점에서 ${thisW}점으로 ${lastW - thisW}점 내려갔어요.`) : thisW != null ? `이번 주 평균은 ${thisW}점이에요. 지난주 기록이 쌓이면 비교해 드릴게요.` : '기록이 쌓이면 알려드릴게요.';
  return [
    { q: '잠을 푹 잔 날, 덜 먹었을까?', a: a1 }, { q: '내가 가장 많이 먹는 요일은?', a: a2 },
    { q: '운동을 건너뛴 가장 큰 이유는?', a: a3 }, { q: '지난주보다 목표 달성률이 올랐을까?', a: a4 }
  ];
}
async function renderCiReport() {
  const box = document.getElementById('ci-report-body'); if (!box) return;
  const tab = _ciRepTab;
  const tabs = `<div class="cr-tabs"><button type="button" class="${tab === 'day' ? 'on' : ''}" onclick="setCiRepTab('day')">오늘</button><button type="button" class="${tab === 'week' ? 'on' : ''}" onclick="setCiRepTab('week')">주간</button><button type="button" class="${tab === 'month' ? 'on' : ''}" onclick="setCiRepTab('month')">월간 달력</button></div>`;
  const head = `<div class="cr-head"><b>리포트</b><button type="button" class="ci-x" onclick="closeMod('mod-ci-report')" aria-label="닫기"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`;
  if (tab === 'day') {
    const sc = ciScore(), rep = ciReport(), pct = ciFillPct(), d = sc.data, c = ciGet();
    const headline = pct >= 100 ? (d.net <= d.goal ? '오늘은 목표 안에서 잘 마무리했어요' : `오늘은 목표보다 약 ${_ciFmt(d.net - d.goal)}kcal 더 먹었어요`) : pct ? '아직 채우는 중이에요. 남은 질문에 답하면 완성돼요' : '오늘 기록이 아직 없어요';
    const m = (l) => { const x = ciMeal(l); return x ? `${x.kcal != null ? x.kcal + 'kcal' : '기록'}${x.text ? ' · ' + _ciEsc(x.text) : ''}` : '기록 없음'; };
    const sl = ciTodaySleep(), ws = ciWorkoutsToday(), w = c.workout;
    const rows = [
      ['수면', sl ? `${sl.hours}시간${c.morning && c.morning.sq ? ' · ' + c.morning.sq : ''}` : '기록 없음'],
      ['아침', c.morning && c.morning.opt === 'none' ? '안 먹었어요' : m('아침')], ['점심', m('점심')], ['저녁', m('저녁')],
      ['운동', ws.length ? ws.map(x => `${_ciEsc(x.exerciseType)} ${x.durationMin}분`).join(', ') : w && w.opt === 'none' ? `못 했어요 · ${w.reason}` : '기록 없음'],
      ['영양제', d.supp ? '먹었어요' : w ? '못 먹었어요' : '기록 없음'],
      ['NET 칼로리', `${_ciFmt(d.net)}kcal <small>먹은 ${_ciFmt(d.eaten)} - 운동 ${_ciFmt(d.burn)} · 목표 ${_ciFmt(d.goal)}</small>`]
    ];
    box.innerHTML = head + tabs + `
      <div class="cr-hero"><div><small>${new Date().getMonth() + 1}월 ${new Date().getDate()}일 · 보고서 ${pct}%</small><b>${headline}</b></div><div class="cr-score"><b>${sc.total}</b><small>달성률</small></div></div>
      <div class="cr-card"><div class="cr-tag">AI 리포트</div>
        <div class="cr-k">오늘 알게 된 것</div><div class="cr-v">${_ciEsc(rep.insight)}</div>
        </div>
      ${ciActionCardHtml({ action: rep.action }, '내일 바꿔볼 행동 하나', '홈과 마이에도 띄워요')}
      <div class="cr-card"><div class="cr-t">목표 달성률 점수</div>
        ${sc.items.map(it => `<div class="cr-sr"><span>${it.k}</span><div class="nh-mbar"><i style="width:${Math.round(it.got / it.max * 100)}%"></i></div><b>${it.v}</b></div>`).join('')}
        <div class="cr-note2">칼로리는 먹은 칼로리에서 운동 칼로리를 뺀 NET 칼로리를 목표와 비교해요. 칼로리 40점, 운동 30점, 수면 15점, 영양제 15점이에요.</div></div>
      <div class="cr-card cr-rows">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
    return;
  }
  if (tab === 'month') { box.innerHTML = head + tabs + await ciMonthHtml(); return; }
  box.innerHTML = head + tabs + `<div class="cr-card" style="text-align:center;color:var(--muted)">불러오는 중…</div>`;
  const h = await ciLoadHistory();
  if (_ciRepTab !== 'week') return;
  if (!h) { box.innerHTML = head + tabs + `<div class="cr-card">주간 기록을 불러오지 못했어요. 잠시 후 다시 열어 주세요.</div>`; return; }
  const days = ciDays(h);
  const recorded = Object.values(days).filter(d => d.any).length;
  const qs = ciWeekAnswers(days);
  if (recorded < 7) {
    const dots = Array.from({ length: 7 }, (_, i) => `<i class="${i < recorded ? 'on' : ''}">${i + 1}</i>`).join('');
    box.innerHTML = head + tabs + `
      <div class="cr-card cr-lock"><span class="cr-lock-ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>
        <b>7일 기록이 쌓이면 열려요</b><div class="cr-dots">${dots}</div><small>지금까지 ${recorded}일 기록했어요</small></div>
      <div class="cr-card"><div class="cr-t">주간 리포트에서 알려드릴 것</div>${qs.map((x, i) => `<div class="cr-qi"><i>${i + 1}</i>${x.q}</div>`).join('')}</div>`;
    return;
  }
  const t = todayISOLocal(), prev = days[_ciAddDays(t, -7)], now = days[t];
  const dow = CI_DAYS[new Date().getDay()];
  const cmp = (k, a, b, unit, lowerGood) => {
    const has = a != null && b != null; const diff = has ? a - b : 0;
    const good = has && (lowerGood ? diff <= 0 : diff >= 0);
    return `<div class="cr-cmp"><span>${k}</span><b>${a != null ? _ciFmt(a) + unit : '-'} <small>/ 지난주 ${b != null ? _ciFmt(b) + unit : '-'}</small></b><em class="${good ? 'good' : ''}">${has ? (diff === 0 ? '같아요' : `${_ciFmt(Math.abs(diff))}${unit} ${diff > 0 ? '많이' : '적게'}`) : '-'}</em></div>`;
  };
  box.innerHTML = head + tabs + qs.map(x => `<div class="cr-card"><div class="cr-k cr-ka">${x.q}</div><div class="cr-v">${_ciEsc(x.a)}</div></div>`).join('') + `
    <div class="cr-card"><div class="cr-t">오늘 vs 지난주 ${dow}요일</div>
      ${cmp('NET 칼로리', now ? now.eaten - now.burn : null, prev && prev.any ? prev.eaten - prev.burn : null, 'kcal', true)}
      ${cmp('수면', now && now.sleepH, prev && prev.sleepH, '시간', false)}
      ${cmp('운동', now ? now.workoutMin : null, prev && prev.any ? prev.workoutMin : null, '분', false)}
      ${cmp('달성률', now ? now.score : null, prev && prev.any ? prev.score : null, '점', false)}</div>`;
}

// ── 월간 달력: 날짜별 목표 달성률, 누르면 그날 기록과 리포트 ──
let _ciMon = null, _ciSelDay = null, _ciMonCache = {};
async function ciLoadMonth(y, m) {
  const key = `${y}-${m}`;
  if (_ciMonCache[key] && Date.now() - _ciMonCache[key].at < 60000) return _ciMonCache[key].h;
  try {
    const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const r = await fetchApi(apiUrl('/api/data/history?from=' + from), { credentials: 'include' });
    if (!r.ok) return null;
    const h = await r.json(); _ciMonCache[key] = { at: Date.now(), h }; return h;
  } catch (e) { console.error('[ci month]', e); return null; }
}
function ciMonMove(d) {
  const n = new Date(_ciMon.y, _ciMon.m + d, 1);
  _ciMon = { y: n.getFullYear(), m: n.getMonth() }; _ciSelDay = null; renderCiReport();
}
function ciPickDay(iso) { _ciSelDay = iso; renderCiReport(); }
async function ciMonthHtml() {
  if (!_ciMon) { const t = new Date(); _ciMon = { y: t.getFullYear(), m: t.getMonth() }; }
  const { y, m } = _ciMon;
  const h = await ciLoadMonth(y, m);
  const days = h ? ciDays(h) : {};
  const today = todayISOLocal();
  const first = new Date(y, m, 1).getDay(), total = new Date(y, m + 1, 0).getDate();
  const iso = d => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  let cells = '일월화수목금토'.split('').map(d => `<div class="dw">${d}</div>`).join('');
  for (let i = 0; i < first; i++) cells += '<div></div>';
  const scores = [];
  for (let d = 1; d <= total; d++) {
    const k = iso(d), x = days[k], future = k > today;
    const sc = x && x.any ? x.score : null;
    if (sc != null) scores.push(sc);
    const cls = sc == null ? '' : sc >= 70 ? 'hi' : sc >= 40 ? 'mid' : 'lo';
    cells += `<button type="button" class="${cls}${k === _ciSelDay ? ' sel' : ''}${k === today ? ' today' : ''}" ${future ? 'disabled' : ''} onclick="ciPickDay('${k}')" aria-label="${m + 1}월 ${d}일${sc != null ? ' ' + sc + '점' : ''}"><span>${d}</span><b>${sc != null ? sc : ''}</b></button>`;
  }
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  let detail = '';
  const sel = _ciSelDay && days[_ciSelDay];
  if (_ciSelDay) {
    const dd = new Date(_ciSelDay + 'T12:00:00');
    const c = (sel && sel.checks) || {}, ci = c.ci || {}, rep = ci.report;
    const w = ci.workout;
    detail = `<div class="cr-card"><div class="cr-t">${dd.getMonth() + 1}월 ${dd.getDate()}일 (${CI_DAYS[dd.getDay()]})${sel && sel.any ? ` · 달성률 ${sel.score}점` : ''}</div>` + (sel && sel.any ? `
      <div class="cr-rows" style="padding:0">
        <div><span>먹은 칼로리</span><b>${_ciFmt(sel.eaten)}kcal</b></div>
        <div><span>운동</span><b>${sel.workoutMin ? sel.workoutMin + '분' : w && w.opt === 'none' ? '못 했어요 · ' + _ciEsc(w.reason || '') : '기록 없음'}</b></div>
        <div><span>수면</span><b>${sel.sleepH != null ? sel.sleepH + '시간' : '기록 없음'}</b></div>
        <div><span>영양제</span><b>${(w && w.supp) || c.suppAll ? '먹었어요' : w ? '못 먹었어요' : '기록 없음'}</b></div>
      </div>
      ${rep && rep.insight ? `<div class="cr-k">그날 알게 된 것</div><div class="cr-v">${_ciEsc(rep.insight)}</div><div class="cr-k">다음 날 바꿔볼 행동</div><div class="cr-v">${_ciEsc(rep.action)}</div>` : ''}
      ${w && w.diary ? `<div class="cr-k">그날 일기</div><div class="cr-v" style="font-weight:500">${_ciEsc(w.diary)}</div>` : ''}`
      : '<div class="my-empty">이날은 기록이 없어요</div>') + '</div>';
  }
  return `<div class="cr-card">
      <div class="cr-mhead"><button type="button" onclick="ciMonMove(-1)" aria-label="이전 달">‹</button><b>${y}년 ${m + 1}월</b><button type="button" onclick="ciMonMove(1)" aria-label="다음 달">›</button></div>
      <div class="cr-note2">${h ? (avg != null ? `기록한 ${scores.length}일 평균 달성률 ${avg}점 · 날짜를 누르면 그날 리포트가 보여요` : '이번 달 기록이 아직 없어요') : '기록을 불러오지 못했어요'}</div>
      <div class="cr-cal">${cells}</div>
      <div class="cr-legend"><span><i style="background:var(--accent-ink)"></i>70점 이상</span><span><i style="background:var(--accent-weak)"></i>40~69점</span><span><i style="background:#efedf2"></i>40점 미만</span></div>
    </div>${detail}`;
}

// ── 행동 지침 카드(홈, 마이, 리포트 공용) ──
const CI_TARGET_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>';
function ciActionCardHtml(rep, label, from) {
  if (!rep || !rep.action) return `<div class="act-card empty"><div class="act-top"><span class="act-ic">${CI_TARGET_SVG}</span><b>${label}</b></div><div class="act-v">오늘 질문에 답하면 리포트가 해볼 행동 하나를 여기에 띄워 드려요.</div></div>`;
  return `<div class="act-card"><div class="act-top"><span class="act-ic">${CI_TARGET_SVG}</span><b>${label}</b>${from ? `<small>${from}</small>` : ''}</div>
    <div class="act-v">${_ciEsc(rep.action)}</div>${rep.insight ? `<div class="act-why"><b>왜요?</b>${_ciEsc(rep.insight)}</div>` : ''}</div>`;
}
// 오늘 리포트가 있으면 '내일 바꿔볼 행동', 없으면 어제 리포트의 행동을 '오늘 해볼 행동'으로
let _myYesterdayRep = undefined;
async function ciLatestAction() {
  const today = ciGet().report;
  if (today && today.action && ciFillPct() > 0) return { rep: today, label: '내일 바꿔볼 행동', from: '오늘 리포트' };
  if (_myYesterdayRep === undefined) {
    _myYesterdayRep = null;
    try {
      const r = await fetchApi(apiUrl('/api/data/day?date=' + _ciAddDays(todayISOLocal(), -1)), { credentials: 'include' });
      if (r.ok) { const j = await r.json(); _myYesterdayRep = (j.checks && j.checks.ci && j.checks.ci.report) || null; }
    } catch (e) { }
  }
  return { rep: _myYesterdayRep, label: '오늘 해볼 행동', from: _myYesterdayRep ? '어제 리포트' : '' };
}
async function ciRenderAction(id) {
  const el = document.getElementById(id); if (!el) return;
  const a = await ciLatestAction();
  el.innerHTML = ciActionCardHtml(a.rep, a.label, a.from);
}

// ── 마이페이지: 내일 바꿔볼 행동, 자주 먹는 음식, 운동 못 한 날 ──
let _myFavQ = '';
async function renderMyCi() {
  await ciRenderAction('my-action');
  renderMyFav();
  const sk = document.getElementById('my-skip');
  if (sk) {
    const h = await ciLoadHistory();
    const logs = [];
    const add = (date, w) => { if (w && w.opt === 'none') logs.push({ date, w }); };
    if (h) (h.checks || []).forEach(c => { if (c.date !== todayISOLocal()) add(c.date, c.checks && c.checks.ci && c.checks.ci.workout); });
    add(todayISOLocal(), ciGet().workout);
    logs.sort((a, b) => b.date.localeCompare(a.date));
    sk.innerHTML = `<div class="cr-t">운동 못 한 날 기록</div>` + (logs.length ? logs.slice(0, 10).map(l => {
      const d = new Date(l.date + 'T12:00:00');
      return `<div class="my-skip-i"><small>${d.getMonth() + 1}월 ${d.getDate()}일 (${CI_DAYS[d.getDay()]}) · ${_ciEsc(l.w.reason || '')}</small>${l.w.diary ? `<div>${_ciEsc(l.w.diary)}</div>` : ''}</div>`;
    }).join('') : `<div class="my-empty">운동을 못 한 날 이유와 일기가 여기에 모여요</div>`);
  }
}
function ciAddFav(f) {
  S.favFoods = S.favFoods || [];
  if (!f || !f.name || S.favFoods.some(x => x.name === f.name)) return;
  S.favFoods.unshift({ name: String(f.name).slice(0, 40), kcal: Math.round(Number(f.kcal) || 0) });
  S.favFoods = S.favFoods.slice(0, 20);
  if (typeof saveState === 'function') saveState();
  if (typeof saveFavFoodsRow === 'function') saveFavFoodsRow();
}
function ciRemoveFav(i) {
  S.favFoods = (S.favFoods || []).filter((_, k) => k !== i);
  if (typeof saveState === 'function') saveState();
  if (typeof saveFavFoodsRow === 'function') saveFavFoodsRow();
  renderMyFav();
}
function myFavSearch(v) {
  _myFavQ = v;
  const box = document.getElementById('my-fav-res'); if (!box) return;
  const res = ciFoodSearch(v, 6).filter(f => !(S.favFoods || []).some(x => x.name === f.name));
  _ciSug = res;
  box.innerHTML = res.length ? res.map((f, i) => `<div class="my-fav-r"><span>${_ciEsc(f.name)} <small>${_ciEsc(f.unit)}</small></span><b>${f.kcal}kcal</b><button type="button" onclick="myFavAdd(${i})">추가</button></div>`).join('') : (v.trim() ? '<div class="my-empty">검색 결과가 없어요</div>' : '');
}
let _myFavPending = null, _myFavAmt = null;
function myFavAdd(i) {
  const f = _ciSug[i]; if (!f) return;
  _myFavPending = f; _myFavAmt = f.sg; renderMyFavPending();
}
function myFavSetAmt(g) { _myFavAmt = Math.max(1, Math.round(Number(g) || 0)); renderMyFavPending(); }
function renderMyFavPending() {
  const box = document.getElementById('my-fav-res'); const f = _myFavPending; if (!box || !f) return;
  const kcal = Math.round(f.k100 * _myFavAmt / 100);
  box.innerHTML = `<div class="my-fav-g"><div>${_ciEsc(f.name)} 한 번에 얼마나 먹어요?</div>${ciAmtHtml(f, _myFavAmt, 'myFavSetAmt')}
    <button type="button" class="btn btn-p" onclick="myFavConfirm()">${_myFavAmt}g · ${kcal}kcal로 추가</button></div>`;
}
function myFavConfirm() {
  const f = _myFavPending; if (!f) return;
  ciAddFav({ name: f.name, kcal: Math.round(f.k100 * _myFavAmt / 100) }); _myFavPending = null; _myFavQ = ''; renderMyFav();
}
function renderMyFav() {
  const box = document.getElementById('my-fav'); if (!box) return;
  const favs = S.favFoods || [];
  box.innerHTML = `<div class="cr-t">자주 먹는 음식</div>
    <label class="my-fav-l" for="my-fav-q">음식을 검색하면 칼로리가 자동으로 붙어요</label>
    <input id="my-fav-q" class="ci-in" type="text" autocomplete="off" placeholder="예: 비빔밥" value="${_ciEsc(_myFavQ)}" oninput="myFavSearch(this.value)">
    <div id="my-fav-res"></div>
    ${favs.length ? favs.map((f, i) => `<div class="my-fav-i"><span>${_ciEsc(f.name)}</span><small>${f.kcal}kcal</small><button type="button" onclick="ciRemoveFav(${i})" aria-label="${_ciEsc(f.name)} 삭제"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`).join('') : '<div class="my-empty">끼니를 기록할 때 저장하거나, 위에서 검색해서 추가해 보세요</div>'}`;
  if (_myFavQ) myFavSearch(_myFavQ);
}

// ── 레시피 필터: 재료, 조리시간, 칼로리, 카테고리, 비용 (한 줄씩 옆으로 밀어서 고르기) ──
const RF_ING = ['계란', '양파', '양배추', '두부', '닭가슴살', '토마토', '오이', '대파', '우유', '당근'];
const RF_TIME = [{ k: 't5', l: '~5분', f: t => t <= 5 }, { k: 't10', l: '~10분', f: t => t > 5 && t <= 10 }, { k: 't20', l: '~20분', f: t => t > 10 && t <= 20 }, { k: 't25', l: '~30분', f: t => t > 20 && t < 30 }, { k: 't30', l: '30분 이상', f: t => t >= 30 }];
const RF_CAL = [{ k: 'c1', l: '300 미만', f: c => c < 300 }, { k: 'c2', l: '300~600', f: c => c >= 300 && c < 600 }, { k: 'c3', l: '600~800', f: c => c >= 600 && c < 800 }, { k: 'c4', l: '800~1000', f: c => c >= 800 && c < 1000 }, { k: 'c5', l: '1000 이상', f: c => c >= 1000 }];
const RF_COST = [{ k: 'w2', l: '~2천원', f: w => w <= 2000 }, { k: 'w4', l: '~4천원', f: w => w > 2000 && w <= 4000 }, { k: 'w6', l: '~6천원', f: w => w > 4000 && w <= 6000 }, { k: 'w8', l: '~8천원', f: w => w > 6000 && w <= 8000 }, { k: 'w9', l: '8천원+', f: w => w > 8000 && w < 10000 }, { k: 'w10', l: '1만원 이상', f: w => w >= 10000 }];
function rfState() { S.rFilters = S.rFilters || {}; if (!Array.isArray(S.rFilters.ing)) S.rFilters.ing = []; return S.rFilters; }
function recipeHasIng(r, g) {
  if (r._ingc == null) r._ingc = (r.ingredients || []).map(l => String(l).replace(/\s+/g, '').replace(/달걀/g, '계란')).join('|');
  return r._ingc.includes(g);
}
function recipePassFilters(r, f) {
  f = f || rfState();
  if (f.ing.length && !f.ing.every(g => recipeHasIng(r, g))) return false;
  const pick = (list, k) => k ? list.find(x => x.k === k) : null;
  const tf = pick(RF_TIME, f.time), cf = pick(RF_CAL, f.cal), wf = pick(RF_COST, f.cost);
  if (tf && !(r.t != null && tf.f(Number(r.t)))) return false;
  if (cf && !(r.cal != null && cf.f(Number(r.cal)))) return false;
  if (wf && !(r.cost != null && wf.f(Number(r.cost)))) return false;
  if (f.type && r.tp !== f.type) return false;
  return true;
}
function rfToggle(key, v) {
  const f = rfState();
  if (key === 'ing') f.ing = f.ing.includes(v) ? f.ing.filter(x => x !== v) : [...f.ing, v];
  else f[key] = f[key] === v ? null : v;
  renderRecipes();
}
function rfClear() { S.rFilters = { ing: [], time: null, type: null, cost: null, cal: null }; renderRecipes(); }
// 레시피 화면: 필터는 오른쪽 위 버튼 하나, 누르면 팝업에서 고른다. 화면에는 고른 조건만 작게 보여준다.
const RF_TONES = {
  '한식': ['#ffeee3', '#c4622d'], '중식': ['#ffe9e6', '#c0473a'], '아시안': ['#fff4d9', '#a8780f'],
  '양식': ['#efe9ff', '#7e62b8'], '샐러드': ['#e6f6ea', '#3f8a57'], '샌드위치': ['#fbefdc', '#a06a2c'],
  '에피타이저': ['#e7f2fc', '#3d74a8'], '디저트': ['#fde8f1', '#b8487a'], '음료': ['#e2f6f5', '#2f8784']
};
function recipeTone(tp) { return RF_TONES[tp] || ['#f3eeff', '#7e62b8']; }
function recipeFilterCount(f) { f = f || rfState(); return (f.ing ? f.ing.length : 0) + ['time', 'cal', 'cost', 'type'].filter(k => f[k]).length; }
function _rfLabel(key, v) {
  const list = { time: RF_TIME, cal: RF_CAL, cost: RF_COST }[key];
  if (list) { const x = list.find(i => i.k === v); return x ? (key === 'cal' ? `${x.l} kcal` : x.l) : v; }
  return v;
}
function renderRecipeFilters() {
  const box = document.getElementById('rcp-filters'); if (!box) return;
  const f = rfState(), n = recipeFilterCount(f);
  const btn = document.getElementById('rcp-fbtn'); if (btn) btn.classList.toggle('on', n > 0);
  setTxt('rcp-fbadge', n ? String(n) : '');
  if (!n) { box.innerHTML = ''; return; }
  const chip = (key, v) => `<button type="button" onclick='rfToggle(${JSON.stringify(key)}, ${JSON.stringify(v)})'>${_ciEsc(_rfLabel(key, v))}<i>×</i></button>`;
  box.innerHTML = `<div class="rcp-active">${f.ing.map(g => chip('ing', g)).join('')}${['type', 'time', 'cal', 'cost'].filter(k => f[k]).map(k => chip(k, f[k])).join('')}<button type="button" class="rcp-reset" onclick="rfClear()">모두 해제</button></div>`;
}

let _rfDraft = null;
function openRecipeFilter() {
  const f = rfState();
  _rfDraft = { ing: [...f.ing], time: f.time || null, cal: f.cal || null, cost: f.cost || null, type: f.type || null };
  renderRecipeFilterSheet();
  if (typeof openMod === 'function') openMod('mod-rcp-filter');
}
function renderRecipeFilterSheet() {
  const box = document.getElementById('rfs-body'); if (!box || !_rfDraft) return;
  const d = _rfDraft;
  const all = typeof RCPS !== 'undefined' ? RCPS : [];
  const present = new Set(all.map(r => r.tp));
  const cats = (typeof RECIPE_CATS !== 'undefined' ? RECIPE_CATS : [...present]).filter(c => present.has(c));
  const emo = typeof RECIPE_CAT_EMOJI !== 'undefined' ? RECIPE_CAT_EMOJI : {};
  const count = all.filter(r => recipePassFilters(r, d)).length;
  const chip = (on, key, v, l) => `<button type="button" class="${on ? 'on' : ''}" onclick='rfDraftToggle(${JSON.stringify(key)}, ${JSON.stringify(v)})'>${_ciEsc(l)}</button>`;
  const group = (label, hint, items) => `<div class="rfs-g"><div class="rfs-l">${label}${hint ? `<small>${hint}</small>` : ''}</div><div class="rfs-chips">${items}</div></div>`;
  const scroll = box.querySelector('.rfs-scroll'); const top = scroll ? scroll.scrollTop : 0;
  box.innerHTML = `
    <div class="rfs-top"><div class="mh"></div><div class="rfs-hd"><b>필터</b><button type="button" class="rfs-x" onclick="closeMod('mod-rcp-filter')" aria-label="닫기">×</button></div></div>
    <div class="rfs-scroll">
      ${group('재료', '여러 개 고르면 모두 들어간 레시피', RF_ING.map(g => chip(d.ing.includes(g), 'ing', g, g)).join(''))}
      ${group('카테고리', '', cats.map(c => chip(d.type === c, 'type', c, `${emo[c] ? emo[c] + ' ' : ''}${c}`)).join(''))}
      ${group('조리시간', '', RF_TIME.map(x => chip(d.time === x.k, 'time', x.k, x.l)).join(''))}
      ${group('칼로리', '1인분', RF_CAL.map(x => chip(d.cal === x.k, 'cal', x.k, x.l)).join(''))}
      ${group('비용', '', RF_COST.map(x => chip(d.cost === x.k, 'cost', x.k, x.l)).join(''))}
    </div>
    <div class="rfs-foot">
      <button type="button" class="rfs-reset" onclick="rfDraftClear()">초기화</button>
      <button type="button" class="rfs-apply" onclick="rfApply()" ${count ? '' : 'disabled'}>${count ? `레시피 ${count.toLocaleString()}개 보기` : '맞는 레시피가 없어요'}</button>
    </div>`;
  const sc2 = box.querySelector('.rfs-scroll'); if (sc2) sc2.scrollTop = top;
}
function rfDraftToggle(key, v) {
  const d = _rfDraft; if (!d) return;
  if (key === 'ing') d.ing = d.ing.includes(v) ? d.ing.filter(x => x !== v) : [...d.ing, v];
  else d[key] = d[key] === v ? null : v;
  renderRecipeFilterSheet();
}
function rfDraftClear() { _rfDraft = { ing: [], time: null, cal: null, cost: null, type: null }; renderRecipeFilterSheet(); }
function rfApply() {
  if (!_rfDraft) return;
  S.rFilters = Object.assign(rfState(), _rfDraft, { ing: [..._rfDraft.ing] });
  if (typeof closeMod === 'function') closeMod('mod-rcp-filter');
  renderRecipes();
  const sc = document.querySelector('#s-diet .sc'); if (sc) sc.scrollTop = 0;
}

// ── 이번에 바뀐 점: 업데이트가 있을 때 홈 맨 위에 한 번 보여주고, 확인을 누르면 다음 업데이트까지 숨긴다 ──
const WHATS_NEW = {
  ver: '2026-11-22',
  items: [
    '대시보드에서 ‹ › 로 지난 달 기록을 볼 수 있어요. 날짜 아래 숫자가 그날 목표 달성률이에요',
    '대시보드 달력 위 "생리 기록" 버튼으로 생리 시작일을 바로 넣을 수 있어요',
    '레시피 필터는 오른쪽 위 필터 버튼 하나로 모았어요',
    '레시피 목록을 사진 카드처럼 보기 좋게 바꿨어요'
  ]
}
function renderWhatsNew() {
  const el = document.getElementById('nh-news'); if (!el) return;
  let seen = null; try { seen = localStorage.getItem('bellamona_news_seen'); } catch (e) { }
  // 오늘 처음 가입한 사람에게는 "바뀐 점"이 의미가 없으니 본 것으로 처리
  if (seen !== WHATS_NEW.ver && S.startDate && Date.now() - S.startDate < 86400000) { try { localStorage.setItem('bellamona_news_seen', WHATS_NEW.ver); } catch (e) { } seen = WHATS_NEW.ver; }
  if (seen === WHATS_NEW.ver) { el.innerHTML = ''; return; }
  el.innerHTML = `<section class="card nh-news"><div class="nh-news-t">✨ 이번에 바뀐 점</div><ul>${WHATS_NEW.items.map(t => `<li>${_ciEsc(t)}</li>`).join('')}</ul><button onclick="closeWhatsNew()">확인했어요</button></section>`;
}
function closeWhatsNew() { try { localStorage.setItem('bellamona_news_seen', WHATS_NEW.ver); } catch (e) { } const el = document.getElementById('nh-news'); if (el) el.innerHTML = ''; }
