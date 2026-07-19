/* ═══════════════════════════════════════════════════════════════════════
   home-dash.js — 홈/대시보드/달력/체중/칼로리 계산 (원본 100% 보존)
   ═══════════════════════════════════════════════════════════════════════ */

// ═══════════════════════ CALORIE CALCS ═══════════════════════
function totalBurned() { return S.baseBurned + Object.values(S.exBurned).reduce((a, v) => a + (v || 0), 0); }
function totalIntake() { return S.meals.reduce((a, m) => a + mCalc(m, 'cal'), 0); }
function mCalc(m, k) { return m.foods.reduce((a, f) => a + Math.round(f.food[k === 'cal' ? 'cal' : k] * f.g / 100), 0); }
function mCarb(m) { return mCalc(m, 'c'); }
function mProt(m) { return mCalc(m, 'p'); }
function mFat(m) { return mCalc(m, 'f'); }
function mGI(m) { const cb = mCarb(m); if (!cb) return 0; return Math.round(m.foods.reduce((a, f) => a + f.food.gi * (f.food.c * f.g / 100), 0) / cb); }
function getNet() { return totalIntake() - totalBurned(); }
function getSave() { return S.goalCal - getNet(); }
/* 원본 predBG 하위호환용(다른 곳에서 참조 대비). 실제 예측은 GMODEL 사용. */
function predBG(baseBG, gi, carbG) { return Math.round((baseBG || 90) + (gi * carbG / 100) * 2.5); }

function hormonePct(hid) {
  const rts = S.routines[hid]; if (!rts) return 0;
  const done = rts.filter(r => S.checks[r.id]).length;
  return Math.round(done / rts.length * 100);
}
function overallPct() {
  const all = Object.values(S.routines).flat();
  const done = all.filter(r => S.checks[r.id]).length;
  return Math.round(done / all.length * 100);
}

function updateHome() {
  const intake = totalIntake(); const burned = totalBurned(); const net = getNet(); const save = getSave();
  const pct = Math.min(Math.round(intake / S.goalCal * 100), 120);
  setTxt('h-intake', intake.toLocaleString()); setTxt('h-burned', burned.toLocaleString());
  const netEl = document.getElementById('h-net'); if (netEl) { netEl.textContent = net.toLocaleString(); netEl.style.color = net <= S.goalCal ? 'var(--ok)' : 'var(--danger)'; }
  setTxt('h-goal', S.goalCal.toLocaleString());
  const bar = document.getElementById('h-calbar'); if (bar) { bar.style.width = Math.min(pct, 100) + '%'; bar.style.background = pct > 100 ? 'linear-gradient(90deg,var(--sky2),var(--danger))' : 'linear-gradient(90deg,var(--sky2),var(--lav2))'; }
  const msg = document.getElementById('h-calmsg'); if (msg) { if (save >= 0) msg.innerHTML = `<span style="color:var(--ok);font-weight:700">▼ 오늘 ${save}kcal 세이브</span> <span style="color:var(--muted)">· 누적 ${S.savedTotal}kcal</span>`; else msg.innerHTML = `<span style="color:var(--danger);font-weight:700">▲ 목표보다 ${Math.abs(save)}kcal 초과</span>`; }
  const ring = document.getElementById('h-ring'); const op = overallPct(); if (ring) { const circ = 2 * Math.PI * 29; ring.setAttribute('stroke-dasharray', `${Math.min(op / 100 * circ, circ)} ${circ}`); }
  setTxt('h-ring-pct', op + '%');
  const allRts = Object.values(S.routines).flat(); setTxt('h-done-cnt', allRts.filter(r => S.checks[r.id]).length); setTxt('h-total-cnt', allRts.length);
  ['ins', 'gro', 'cor', 'oxy'].forEach((k, i) => { const hids = ['insulin', 'growth', 'cortisol', 'oxytocin']; const p = hormonePct(hids[i]); setTxt('hc-' + k, p + '%'); const bar = document.getElementById('bar-' + k); if (bar) bar.style.width = p + '%'; const b = document.getElementById('h-' + k + '-badge'); if (b) b.textContent = { ins: '인슐린', gro: '성장', cor: '코르티솔', oxy: '옥시토신' }[k] + ' ' + p + '%'; });
  S.savedTotal = Math.max(0, S.savedTotal + (save > 0 ? 0 : 0));
  setTxt('prof-save-val', S.savedTotal + ' kcal');
  // Weight display
  const lastWt = S.weights.length ? S.weights[S.weights.length - 1].w : S.initWeight;
  setTxt('h-wt', lastWt.toFixed(1) + ' kg');
  const wtLost = S.initWeight - lastWt; const wtRemain = Math.max(0, lastWt - S.goalWeight);
  setTxt('h-wt-remain', `${S.goalWeight}kg까지 ${wtRemain.toFixed(1)}kg · D-${Math.max(0, S.goalMonths * 30 - 4)}`);
  const wtPct = Math.min(Math.round(wtLost / Math.max(S.initWeight - S.goalWeight, 0.1) * 100), 100);
  const wtBar = document.getElementById('wt-bar'); if (wtBar) wtBar.style.width = wtPct + '%';
  renderWtMiniChart();
  // Dashboard sync
  setTxt('d-wt-prog', `목표 -${(S.initWeight - S.goalWeight).toFixed(1)}kg · 현재 -${wtLost.toFixed(1)}kg`);
  const dgb = document.getElementById('d-goal-bar'); if (dgb) dgb.style.width = wtPct + '%';
  ['ins', 'gro', 'cor', 'oxy'].forEach((k, i) => { const hids = ['insulin', 'growth', 'cortisol', 'oxytocin']; const p = hormonePct(hids[i]); const db = document.getElementById('d-' + k + '-bar'); if (db) db.style.width = p + '%'; setTxt('d-' + k + '-pct', p + '%'); });
  // Profile
  const pmb = document.getElementById('prof-me-bar'); if (pmb) pmb.style.width = op + '%'; setTxt('prof-me-pct', op + '%');
  const pname = document.getElementById('prof-me-name'); if (pname) pname.textContent = S.name + '님 (나)';
}

function renderWtMiniChart() {
  const c = document.getElementById('wt-mini-chart'); if (!c) return; c.innerHTML = '';
  const ws = S.weights.map(w => w.w); if (!ws.length) return;
  const mn = Math.min(...ws) - .5, mx = Math.max(...ws) + .5;
  ws.forEach((w, i) => { const h = Math.max(Math.round((w - mn) / (mx - mn) * 40), 4); const b = document.createElement('div'); const isT = i === ws.length - 1; b.style.cssText = `flex:1;border-radius:3px 3px 0 0;height:${h}px;background:${isT ? 'linear-gradient(180deg,var(--sky2),var(--lav2))' : 'rgba(91,184,245,.3)'};min-width:4px`; c.appendChild(b); });
}

// ═══════════════════════ WEIGHT ═══════════════════════
function openWtModal() { const el = document.getElementById('wt-input'); if (el) el.value = ''; openMod('mod-wt'); }
function saveWeight() { const v = parseFloat(document.getElementById('wt-input')?.value); if (!v || v < 20 || v > 300) { alert('올바른 체중을 입력해주세요'); return; } const now = new Date(); const d = `${now.getMonth() + 1}/${now.getDate()}`; S.weights.push({ d, w: v }); closeMod('mod-wt'); updateHome(); if (typeof saveWeightRow === 'function') saveWeightRow(); }

// ═══════════════════════ CALENDAR / DASHBOARD ═══════════════════════
function getPDays(y, m) { const r = []; S.periods.forEach(p => { const s = new Date(p.start); for (let i = 0; i < p.days; i++) { const d = new Date(s); d.setDate(d.getDate() + i); if (d.getFullYear() === y && d.getMonth() === m) r.push(d.getDate()); } }); return r; }
function getODays(y, m) { const r = []; S.periods.forEach(p => { const s = new Date(p.start); const os = new Date(s); os.setDate(os.getDate() + S.cycleLen - 18); const oe = new Date(s); oe.setDate(oe.getDate() + S.cycleLen - 10); const c = new Date(os); while (c <= oe) { if (c.getFullYear() === y && c.getMonth() === m) r.push(c.getDate()); c.setDate(c.getDate() + 1); } }); return r; }
// S.calMon overriding with actual date if needed
if (typeof S !== 'undefined' && S.calMon && S.calMon.y === 2026 && S.calMon.m === 3) {
  const d = new Date();
  S.calMon = { y: d.getFullYear(), m: d.getMonth() };
}

function renderDash() {
  const { y, m } = S.calMon; setTxt('d-title', `${y}년 ${m + 1}월 성과`); setTxt('cal-lbl', `${m + 1}월 달력`);
  const g = document.getElementById('dash-cal'); if (!g) return; g.innerHTML = '';
  ['일', '월', '화', '수', '목', '금', '토'].forEach(d => { const e = document.createElement('div'); e.className = 'cdow'; e.textContent = d; g.appendChild(e); });
  const first = new Date(y, m, 1).getDay(); const total = new Date(y, m + 1, 0).getDate();
  const perDays = getPDays(y, m); const ovDays = getODays(y, m);
  const today = new Date(); const isCur = y === today.getFullYear() && m === today.getMonth(); const todayDate = today.getDate();

  // Calculate goodDays from history 
  const goodDays = [];
  const reqTotal = S.routines ? Object.values(S.routines).flat().length : 16;
  if (S.checkHistory) {
    S.checkHistory.forEach(ch => {
      const d = new Date(ch.date);
      if (d.getFullYear() === y && d.getMonth() === m) {
        if (Object.values(ch.checks).filter(Boolean).length >= reqTotal) goodDays.push(d.getDate());
      }
    });
  }

  for (let i = 0; i < first; i++) { const e = document.createElement('div'); g.appendChild(e); }
  for (let d = 1; d <= total; d++) {
    const e = document.createElement('div'); e.className = 'cday'; const isP = perDays.includes(d); const isO = ovDays.includes(d);
    if (isCur && d === todayDate) e.classList.add('today'); else if (isP) e.classList.add('per'); else if (isO) e.classList.add('ovul'); else if (goodDays.includes(d)) e.classList.add('full');
    let inner = `<span>${d}</span>`;
    if ((d >= todayDate - 3 && d <= todayDate && isCur) && !isP && !isO && d !== todayDate) inner += `<div class="dtr"><div class="d4" style="background:var(--sky2)"></div><div class="d4" style="background:var(--cor)"></div><div class="d4" style="background:var(--gro)"></div><div class="d4" style="background:var(--rose)"></div></div>`;
    e.innerHTML = inner; g.appendChild(e);
  }
  renderHistBars(); updateHome();
}
function chgMon(d) { S.calMon.m += d; if (S.calMon.m > 11) { S.calMon.m = 0; S.calMon.y++; } if (S.calMon.m < 0) { S.calMon.m = 11; S.calMon.y--; } renderDash(); }
function savePeriod() { const s = document.getElementById('per-start')?.value; const days = parseInt(document.getElementById('per-days')?.value) || 5; if (s) S.periods.push({ start: s, days }); closeMod('mod-period'); renderDash(); if (typeof savePeriodRow === 'function') savePeriodRow(); }
function renderHistBars() {
  const c = document.getElementById('hist-bars'); if (!c) return;
  const data = []; const today = new Date();
  const reqTotal = S.routines ? Object.values(S.routines).flat().length : 16;
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const dStr = d.toISOString().split('T')[0];
    const ch = S.checkHistory ? S.checkHistory.find(x => x.date === dStr) : null;
    let v = 0;
    if (ch) v = Math.round(Object.values(ch.checks).filter(Boolean).length / reqTotal * 100);
    else if (i === 0 && S.checks) v = Math.round(Object.values(S.checks).filter(Boolean).length / reqTotal * 100); // today fallback
    data.push(v);
  }
  c.innerHTML = '';
  const isCurMonth = S.calMon.y === today.getFullYear() && S.calMon.m === today.getMonth();
  data.forEach((v, i) => {
    const b = document.createElement('div'); const isT = i === data.length - 1 && isCurMonth;
    b.style.cssText = `flex:1;border-radius:4px 4px 0 0;height:${Math.max(v * .8, 4)}px;background:${isT ? 'linear-gradient(180deg,var(--sky2),var(--lav2))' : v >= 80 ? 'rgba(91,184,245,.5)' : v >= 60 ? 'rgba(179,157,219,.4)' : 'rgba(200,200,220,.3)'};transition:height .5s`;
    c.appendChild(b);
  });
  const dd = document.getElementById('hist-dates');
  if (dd) {
    const d1 = new Date(today); d1.setDate(today.getDate() - 13);
    const d2 = new Date(today); d2.setDate(today.getDate() - 6);
    dd.innerHTML = `<span>${d1.getMonth() + 1}/${d1.getDate()}</span><span>${d2.getMonth() + 1}/${d2.getDate()}</span><span>${today.getMonth() + 1}/${today.getDate()}</span>`;
  }
}
