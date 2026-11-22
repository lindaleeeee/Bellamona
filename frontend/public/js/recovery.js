// 만회 행동 알람
// 오늘 먹은 칼로리(운동으로 쓴 만큼 뺀 값)가 목표보다 높아지면, 알림처럼 위에 띄우고
// 내가 지난 4주 동안 직접 남긴 기록(자주 한 운동, 가볍게 먹었던 식사, 자주 먹는 음식)에서 만회 행동을 하나씩 보여준다.
// - 같은 날 다시 띄우는 건 초과량이 150kcal 이상 더 늘었을 때만
// - "다른 방법"을 누르면 다음 행동을 하나 더 보여준다

const REC_KEY = 'bellamona_rec_';
let _recActs = [], _recIdx = 0, _recOver = 0, _recBusy = false;

function _recState() { try { return JSON.parse(localStorage.getItem(REC_KEY + todayISOLocal()) || '{}'); } catch (e) { return {}; } }
function _recSave(st) { try { localStorage.setItem(REC_KEY + todayISOLocal(), JSON.stringify(st)); } catch (e) { } }
function _recEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _recBase(name) { return String(name || '').replace(/\s*\(.*$/, '').trim(); }
function _recShort(s, n) { s = String(s || '').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }

// 지금 시간 기준으로 다음 식사가 무엇인지
function _recNextMeal() {
  const done = new Set(S.meals.filter(m => m.text || m.kcal != null).map(m => m.label));
  if (!done.has('저녁') && new Date().getHours() < 21) return '저녁';
  return '내일 점심';
}

function recActions(h, over, d) {
  const acts = [];
  const today = todayISOLocal();
  // 1) 자주 한 운동: 내 기록에서 분당 소모량을 그대로 써서 몇 분이면 얼마나 만회되는지 계산
  const ws = (h && h.workouts || []).map(w => ({ name: _recBase(w.exercise_type || w.routine_name), min: Number(w.duration_min) || 0, kcal: Number(w.kcal) || 0, date: w.performed_date }))
    .concat(S.workoutLogs.filter(w => w.date === today).map(w => ({ name: _recBase(w.exerciseType || w.routineName), min: Number(w.durationMin) || 0, kcal: Number(w.kcal) || 0, date: today })))
    .filter(w => w.name && w.min > 0 && w.kcal > 0);
  const groups = {};
  ws.forEach(w => { const g = groups[w.name] || (groups[w.name] = { name: w.name, n: 0, min: 0, kcal: 0, days: new Set() }); g.n++; g.min += w.min; g.kcal += w.kcal; g.days.add(w.date); });
  Object.values(groups).sort((a, b) => b.days.size - a.days.size || b.n - a.n).slice(0, 2).forEach(g => {
    const rate = g.kcal / g.min; // 내 기록 기준 분당 kcal
    const min = Math.min(60, Math.max(10, Math.round(over / rate / 5) * 5));
    const back = Math.round(rate * min);
    acts.push({
      ic: '🏃', t: `${g.name} ${min}분`,
      b: `지난 4주 동안 ${g.days.size}일 했던 운동이에요. 내 기록으로 보면 ${min}분에 약 ${back}kcal를 쓸 수 있어요.`,
      go: 'workout'
    });
  });
  // 2) 기록된 운동이 없으면 가벼운 걷기
  if (!acts.length && typeof exerciseKcal === 'function') {
    const per10 = exerciseKcal('medium', 10, 3.5) || 1;
    const min = Math.min(60, Math.max(15, Math.round(over / (per10 / 10) / 5) * 5));
    acts.push({ ic: '🚶', t: `식후 걷기 ${min}분`, b: `아직 남긴 운동 기록이 없어서 보통 속도 걷기로 계산했어요. ${min}분이면 약 ${exerciseKcal('medium', min, 3.5)}kcal예요.`, go: 'workout' });
  }
  // 3) 내가 가볍게 먹었던 식사: 다음 식사와 같은 끼니에서, 목표의 30% 이하로 기록한 것 중 자주 먹은 것
  const next = _recNextMeal(), label = next === '저녁' ? '저녁' : '점심';
  const goal = d.goal || 1600;
  const meals = (h && h.meals || []).filter(m => m.label === label && m.description && Number(m.kcal) > 0 && Number(m.kcal) <= goal * 0.3 && !/간편 기록/.test(m.description));
  const mc = {};
  meals.forEach(m => { const k = String(m.description).trim(); const x = mc[k] || (mc[k] = { name: k, n: 0, kcal: 0 }); x.n++; x.kcal += Number(m.kcal); });
  const light = Object.values(mc).sort((a, b) => b.n - a.n || a.kcal / a.n - b.kcal / b.n)[0];
  if (light) {
    const kcal = Math.round(light.kcal / light.n);
    acts.push({ ic: '🥗', t: `${next}은 ‘${_recShort(light.name, 18)}’처럼`, b: `직접 기록했던 ${label} 중 가벼웠던 식사예요(약 ${kcal}kcal). ${next}을 이 정도로 먹으면 오늘 넘친 만큼을 나눠서 줄일 수 있어요.` });
  }
  // 4) 자주 먹는 음식 중 가장 가벼운 것
  const fav = (S.favFoods || []).filter(f => f.kcal > 0 && (!light || f.name !== light.name)).sort((a, b) => a.kcal - b.kcal)[0];
  if (fav && fav.kcal <= goal * 0.3) {
    acts.push({ ic: '⭐', t: `${next}은 자주 먹는 ‘${_recShort(fav.name, 16)}’로`, b: `내가 저장한 자주 먹는 음식 중 가장 가벼워요(${fav.kcal}kcal).` });
  }
  return acts;
}

async function maybeRecoveryAlarm(force) {
  if (_recBusy) return;
  if (typeof ciTodayData !== 'function') return;
  const d = ciTodayData();
  const over = Math.round(d.net - d.goal);
  if (over < 50) return;
  const st = _recState();
  if (!force && st.over != null && over < st.over + 150) return;
  // 다른 창이나 알림이 떠 있으면 다음 화면 갱신 때 다시 본다
  if (document.querySelector('.mov.open, #wk-focus.open') || document.getElementById('ci-banner')?.classList.contains('show')) return;
  _recBusy = true;
  try {
    const h = typeof ciLoadHistory === 'function' ? await ciLoadHistory() : null;
    const acts = recActions(h, over, d);
    if (!acts.length) return;
    _recActs = acts; _recOver = over;
    _recIdx = (st.idx || 0) % acts.length; // 이전에 본 다음 행동부터
    _recSave({ over, idx: _recIdx + 1 });
    renderRecoveryAlarm();
  } finally { _recBusy = false; }
}

function renderRecoveryAlarm() {
  const el = document.getElementById('rec-alarm'); if (!el || !_recActs.length) return;
  const a = _recActs[_recIdx % _recActs.length];
  el.innerHTML = `
    <div class="rec-top"><span class="ci-bn-ic">B</span><div class="rec-hd"><small>벨라모나 · 만회 행동</small><b>오늘 목표보다 약 ${_recOver}kcal 더 드셨어요</b></div><button type="button" class="rec-x" onclick="hideRecoveryAlarm()" aria-label="닫기">×</button></div>
    <div class="rec-act"><span class="rec-ic">${a.ic}</span><div><b>${_recEsc(a.t)}</b><span>${_recEsc(a.b)}</span></div></div>
    <div class="rec-btns">
      ${_recActs.length > 1 ? `<button type="button" class="rec-b" onclick="nextRecoveryAction()">다른 방법 <small>${(_recIdx % _recActs.length) + 1}/${_recActs.length}</small></button>` : ''}
      ${a.go === 'workout' ? `<button type="button" class="rec-b rec-bp" onclick="recGoWorkout()">운동하러 가기</button>` : `<button type="button" class="rec-b rec-bp" onclick="hideRecoveryAlarm()">알겠어요</button>`}
    </div>`;
  el.classList.add('show');
}
function nextRecoveryAction() {
  _recIdx = (_recIdx + 1) % _recActs.length;
  const st = _recState(); st.idx = _recIdx + 1; _recSave(st);
  renderRecoveryAlarm();
}
function hideRecoveryAlarm() { const el = document.getElementById('rec-alarm'); if (el) el.classList.remove('show'); }
function recoveryAlarmShown() { return !!document.getElementById('rec-alarm')?.classList.contains('show'); }
// 오늘 운동 체크인을 아직 안 했으면 체크인으로, 했으면 운동 화면으로(체크인을 다시 열면 먼저 남긴 운동이 바뀌므로)
function recGoWorkout() {
  hideRecoveryAlarm();
  if (typeof ciDone === 'function' && !ciDone('workout')) openCheckin('workout', false);
  else if (typeof goH === 'function') goH('growth');
}
