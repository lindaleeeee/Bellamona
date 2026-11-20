// 생리 기록: 시작일 하나만 받는 간단한 방식
// - 시작일을 한 번 입력하면 평균 주기로 다음 예정일을 계산해 달력에 점선으로 보여준다
// - 예정일이 되면 홈과 대시보드에서 "시작했어요" 한 번으로 실제 날짜를 맞춘다
// - 마지막 기록이 언제, 어떻게 들어온 값인지(가입할 때, 테스트용 예시 등) 함께 보여준다
// - 기록이 2번 이상 쌓이면 실제 간격으로 평균 주기를 다시 맞춘다

const PER_SNOOZE = 'bellamona_per_snooze_';

function _perParse(ds) { const [y, m, d] = String(ds).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
function _perISO(dt) { return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`; }
function _perAdd(ds, n) { const d = _perParse(ds); d.setDate(d.getDate() + n); return _perISO(d); }
function _perDiff(a, b) { return Math.round((_perParse(a) - _perParse(b)) / 86400000); }
function perFmt(ds) { const d = _perParse(ds); return `${d.getMonth() + 1}월 ${d.getDate()}일`; }
function _perToday() { return _perISO(new Date()); }

function perLast() { const p = (S.periods || []).slice().sort((a, b) => a.start < b.start ? -1 : 1); return p.length ? p[p.length - 1] : null; }
// 마지막 기록 다음으로 오는 예정 시작일
function perNextStart() { const l = perLast(); return l ? _perAdd(l.start, S.cycleLen || 28) : null; }
// 예정일 하루 전부터 "시작했나요?"를 묻는다(오늘 "아직이에요"를 눌렀으면 내일 다시)
function perDue() {
  if (typeof isMale === 'function' && isMale()) return false;
  const n = perNextStart(); if (!n) return false;
  if (_perDiff(_perToday(), n) < -1) return false;
  try { if (localStorage.getItem(PER_SNOOZE + _perToday())) return false; } catch (e) { }
  return true;
}

function perSourceText(p) {
  if (!p) return '';
  if (p.seed) return '테스트용 예시 기록이에요. 실제 날짜로 고쳐 주세요';
  if (p.created) {
    const c = _perISO(new Date(p.created));
    const joined = S.startDate ? _perISO(new Date(S.startDate)) : null;
    if (joined && Math.abs(_perDiff(c, joined)) <= 1) return `가입할 때 입력 (${perFmt(c)})`;
    return `${perFmt(c)}에 입력`;
  }
  return '';
}

function _perDueHtml(where) {
  const n = perNextStart(); const late = _perDiff(_perToday(), n);
  const msg = late < 0 ? `내일(${perFmt(n)})이 생리 예정일이에요` : late === 0 ? `오늘(${perFmt(n)})이 생리 예정일이에요` : `생리 예정일(${perFmt(n)})이 ${late}일 지났어요`;
  return `<div class="per-due">
    <div class="per-due-t">🌸 ${msg}</div>
    <div class="per-due-s">시작했으면 날짜만 맞춰 주세요. 다음 예정일이 다시 계산돼요.</div>
    <div class="per-due-b"><button class="per-btn per-btn-p" onclick="openPeriodSheet('new')">시작했어요</button><button class="per-btn" onclick="perSnooze('${where}')">아직이에요</button></div>
  </div>`;
}

function renderPeriodCard() {
  const male = typeof isMale === 'function' && isMale();
  const home = document.getElementById('nh-period');
  if (home) home.innerHTML = (!male && perDue()) ? `<section class="card per-home">${_perDueHtml('home')}</section>` : '';
  const dash = document.getElementById('dash-period'); if (!dash) return;
  if (male) { dash.innerHTML = ''; return; }
  const l = perLast();
  if (!l) {
    dash.innerHTML = `<div class="per-row"><div class="per-txt"><b>생리 시작일을 한 번만 알려주세요</b><span>다음 예정일은 자동으로 계산해 달력에 보여줘요</span></div><button class="per-btn per-btn-p" onclick="openPeriodSheet('new')">입력</button></div>`;
    return;
  }
  const src = perSourceText(l);
  const n = perNextStart();
  dash.innerHTML = `<div class="per-row">
      <div class="per-txt"><b>마지막 생리 시작 ${perFmt(l.start)}</b>${src ? `<span${l.seed ? ' class="per-warn"' : ''}>${src}</span>` : ''}</div>
      <button class="per-btn" onclick="openPeriodSheet('edit')">수정</button>
    </div>
    <div class="per-next">다음 예정일 <b>${perFmt(n)}</b> · 평균 주기 ${S.cycleLen || 28}일로 자동 계산</div>
    ${perDue() ? _perDueHtml('dash') : ''}`;
}

function perSnooze() {
  try { localStorage.setItem(PER_SNOOZE + _perToday(), '1'); } catch (e) { }
  renderPeriodCard();
}

// ── 입력 시트 ──
let _perSheet = { mode: 'new', date: null, days: 5 };
function openPeriodSheet(mode) {
  const l = perLast();
  _perSheet = { mode: mode === 'edit' && l ? 'edit' : 'new', date: mode === 'edit' && l ? l.start : _perToday(), days: (l && l.days) || 5, orig: mode === 'edit' && l ? l.start : null };
  renderPeriodSheet();
  if (typeof openMod === 'function') openMod('mod-period');
}
function renderPeriodSheet() {
  const box = document.getElementById('per-body'); if (!box) return;
  const t = _perToday();
  const quick = [[t, '오늘'], [_perAdd(t, -1), '어제'], [_perAdd(t, -2), '2일 전']];
  const isQuick = quick.some(([d]) => d === _perSheet.date);
  box.innerHTML = `
    <div class="per-sh-t">${_perSheet.mode === 'edit' ? '생리 시작일 고치기' : '생리 시작했어요'}</div>
    <div class="per-sh-s">시작일만 알려주면 돼요. 다음 예정일은 자동으로 계산해요.</div>
    <div class="per-chips">${quick.map(([d, lb]) => `<button class="per-chip${d === _perSheet.date ? ' on' : ''}" onclick="perPick('${d}')">${lb}<small>${perFmt(d)}</small></button>`).join('')}</div>
    <label class="per-date${isQuick ? '' : ' on'}">다른 날짜 <input type="date" max="${t}" value="${_perSheet.date}" onchange="perPick(this.value)"></label>
    <div class="per-days">기간 <button onclick="perDays(-1)">−</button><b>${_perSheet.days}일</b><button onclick="perDays(1)">+</button><span>잘 모르면 그대로 두세요</span></div>
    <button class="btn btn-p" onclick="perSave()">저장</button>
    ${_perSheet.mode === 'edit' ? `<button class="per-del" onclick="perDelete()">이 기록 지우기</button>` : ''}`;
}
function perPick(d) { if (!d) return; if (d > _perToday()) d = _perToday(); _perSheet.date = d; renderPeriodSheet(); }
function perDays(n) { _perSheet.days = Math.min(10, Math.max(2, _perSheet.days + n)); renderPeriodSheet(); }

function _perPost(p) {
  return fetchApi(apiUrl('/api/data/periods'), {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start_date: p.start, duration_days: p.days })
  }).catch(e => console.error('[period save]', e));
}
function _perDel(start) {
  return fetchApi(apiUrl('/api/data/periods/' + start), { method: 'DELETE', credentials: 'include' })
    .catch(e => console.error('[period delete]', e));
}

// 기록이 2번 이상이면 최근 간격(최대 3개)의 평균으로 주기를 맞춘다. 21~45일 밖의 간격은 빼먹은 기록으로 보고 제외
function _perRecalcCycle() {
  const s = (S.periods || []).map(p => p.start).sort();
  const gaps = [];
  for (let i = 1; i < s.length; i++) { const g = _perDiff(s[i], s[i - 1]); if (g >= 21 && g <= 45) gaps.push(g); }
  if (!gaps.length) return;
  const recent = gaps.slice(-3);
  const avg = Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
  if (avg !== S.cycleLen) { S.cycleLen = avg; if (typeof saveProfileRow === 'function') saveProfileRow(); }
}

async function perSave() {
  const p = { start: _perSheet.date, days: _perSheet.days, created: Date.now() };
  if (_perSheet.mode === 'edit' && _perSheet.orig) {
    S.periods = (S.periods || []).filter(x => x.start !== _perSheet.orig);
    await _perDel(_perSheet.orig);
  }
  S.periods = (S.periods || []).filter(x => x.start !== p.start);
  if (_perSheet.mode !== 'edit') await _perDel(p.start); // 같은 날짜를 두 번 저장해도 하나만 남게
  S.periods.push(p);
  S.periods.sort((a, b) => a.start < b.start ? -1 : 1);
  await _perPost(p);
  _perRecalcCycle();
  if (typeof saveState === 'function') saveState();
  if (typeof closeMod === 'function') closeMod('mod-period');
  if (typeof showCiToast === 'function') showCiToast(null, null, `다음 예정일 ${perFmt(perNextStart())}`, '생리 시작일을 저장했어요');
  _perRefresh();
}

async function perDelete() {
  if (!_perSheet.orig) return;
  if (!confirm(`${perFmt(_perSheet.orig)} 생리 기록을 지울까요?`)) return;
  S.periods = (S.periods || []).filter(x => x.start !== _perSheet.orig);
  await _perDel(_perSheet.orig);
  if (typeof saveState === 'function') saveState();
  if (typeof closeMod === 'function') closeMod('mod-period');
  _perRefresh();
}

function _perRefresh() {
  if (typeof renderDash === 'function' && document.getElementById('s-dash')?.classList.contains('on')) renderDash();
  renderPeriodCard();
  if (typeof updateHome === 'function') updateHome();
}
