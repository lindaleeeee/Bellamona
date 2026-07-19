/* ═══════════════════════════════════════════════════════════════════════
   hormones.js — 성장호르몬 / 코르티솔 / 옥시토신 화면 (원본 100% 보존)
   + 호르몬 공통(HCFG, goH, ckHtml, doCheck, saveDiary) + 운동/루틴수정
   ═══════════════════════════════════════════════════════════════════════ */

// ═══════════════════════ HORMONE SCREENS ═══════════════════════
const HCFG = {
  insulin: { em: '🩺', label: '인슐린', color: 'var(--sky2)', bg: 'var(--ins-bg)' },
  growth: { em: '💪', label: '성장호르몬', color: 'var(--gro)', bg: 'var(--gro-bg)' },
  cortisol: { em: '🌿', label: '코르티솔', color: 'var(--cor)', bg: 'var(--cor-bg)' },
  oxytocin: { em: '💗', label: '옥시토신', color: 'var(--rose)', bg: 'var(--oxy-bg)' },
};
function goH(id) {
  S.prev = document.querySelector('.scr.on')?.id || 's-home'; S.curH = id;
  const h = HCFG[id];
  document.getElementById('h-hdr').innerHTML = `<div style="font-family:'Playfair Display',serif;font-size:19px;font-weight:700;color:${h.color}">${h.em} ${h.label}</div>`;
  const body = document.getElementById('h-body');
  if (id === 'insulin') body.innerHTML = renderInsulin();
  else if (id === 'growth') body.innerHTML = renderGrowth();
  else if (id === 'cortisol') body.innerHTML = renderCortisol();
  else body.innerHTML = renderOxytocin();
  go('s-hormone');
  if (id === 'insulin') setTimeout(renderBGChart, 50); // ★ 차트 렌더 보장
}

function ckHtml(id, label, sub, color) {
  const done = !!S.checks[id]; const c = color || 'var(--sky2)';
  return `<div class="ck-item${done ? ' done' : ''}" onclick="doCheck('${id}')" style="${done ? `border-color:${c};background:rgba(91,184,245,.08)` : ''}" >
    <div class="ck-box${done ? ' done' : ''}" style="${done ? `background:${c};border-color:${c}` : ''}">${done ? '✓' : ''}</div>
    <div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--text)">${label}</div><div style="font-size:10px;color:var(--muted);margin-top:1px;font-weight:500">${sub}</div></div>
  </div>`;
}
function doCheck(id) {
  if (id === 'o4') { openMod('mod-diary'); return; }
  if (id === 'g2') { openMod('mod-workout'); return; }
  S.checks[id] = !S.checks[id]; goH(S.curH); updateHome();
  if (typeof saveChecks === 'function') saveChecks();
}
function saveDiary() { S.checks.o4 = true; const txt = document.getElementById('diary-txt')?.value; if (txt) S.diaries.push({ d: '오늘', t: txt }); closeMod('mod-diary'); goH('oxytocin'); updateHome(); if (typeof saveDiaryRow === 'function') saveDiaryRow(); if (typeof saveChecks === 'function') saveChecks(); }

// ── GROWTH ──
function renderGrowth() {
  const net = getNet(); const save = getSave(); const need = save < 0 ? Math.abs(save) : 0; const burned = totalBurned();
  const wk = [{ done: true, t: '하체' }, { done: true, t: '등' }, { done: false }, { done: true, t: '전신' }, { done: true, t: '어깨' }, { done: false }, { done: true, t: '팔' }];
  const days = ['월', '화', '수', '목', '금', '토', '일'];
  return `
  <div class="card" style="border-color:rgba(129,199,132,.3)">
    <div class="cap">칼로리 소모 현황</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:8px">
      <div style="background:var(--gro-bg);border-radius:12px;padding:10px;text-align:center;border:1px solid rgba(129,199,132,.2)"><div style="font-size:10px;color:var(--muted);font-weight:600">오늘 소모</div><div style="font-size:22px;font-weight:800;color:var(--gro)">${burned}</div><div style="font-size:9px;color:var(--muted);font-weight:600">기초${S.baseBurned}+운동${burned - S.baseBurned}</div></div>
      <div style="background:${need > 0 ? 'rgba(239,83,80,.08)' : 'rgba(102,187,106,.08)'};border-radius:12px;padding:10px;text-align:center;border:1px solid ${need > 0 ? 'rgba(239,83,80,.2)' : 'rgba(102,187,106,.2)'}"><div style="font-size:10px;color:var(--muted);font-weight:600">${need > 0 ? '추가 소모 필요' : 'NET 칼로리'}</div><div style="font-size:22px;font-weight:800;color:${need > 0 ? 'var(--danger)' : 'var(--ok)'}">${need > 0 ? need : net}</div><div style="font-size:9px;color:var(--muted);font-weight:600">kcal</div></div>
    </div>
    ${need > 0 ? `<div style="font-size:12px;color:var(--danger);background:rgba(239,83,80,.07);border:1.5px solid rgba(239,83,80,.2);border-radius:11px;padding:8px 12px;font-weight:600">🔗 인슐린 ${Math.abs(save)}kcal 초과 → 운동으로 ${need}kcal 더 태우면 목표 달성</div>` : `<div style="font-size:12px;color:var(--ok);background:rgba(102,187,106,.07);border:1.5px solid rgba(102,187,106,.2);border-radius:11px;padding:8px 12px;font-weight:700">✅ NET ${net}kcal · 목표 이내</div>`}
  </div>
  <div class="card">
    <div class="cap" style="margin-bottom:8px">이번 주 운동 기록 (7일)</div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-bottom:8px">
      ${days.map((d, i) => `<div onclick="${i === 6 ? 'openMod(\'mod-workout\')' : ''}" style="background:${wk[i].done ? 'rgba(129,199,132,.1)' : 'var(--card2)'};border:1.5px solid ${wk[i].done ? 'rgba(129,199,132,.4)' : 'var(--bdr)'};border-radius:9px;padding:7px 2px;text-align:center;cursor:pointer"><div style="font-size:9px;color:var(--muted);font-weight:700">${d}</div><div style="font-size:14px;margin:3px 0">${wk[i].done ? '🏋️' : '—'}</div>${wk[i].done ? `<div style="font-size:7px;color:var(--gro);font-weight:700">${wk[i].t}</div>` : ''}</div>`).join('')}
    </div>
    <button onclick="openMod('mod-workout')" style="width:100%;background:var(--gro-bg);border:1.5px solid rgba(129,199,132,.3);border-radius:10px;padding:10px;font-size:13px;color:var(--gro);font-weight:700;cursor:pointer;font-family:'Nunito',sans-serif">+ 운동 소모 칼로리 기록하기</button>
  </div>
  <div class="cap" style="padding:0 2px;margin-bottom:6px">루틴 체크</div>
  ${S.routines.growth.map(r => ckHtml(r.id, r.label, r.sub, 'var(--gro)')).join('')}`;
}

function updateBurned() {
  const s = parseInt(document.getElementById('ex-strength')?.value) || 0;
  const h = parseInt(document.getElementById('ex-hiit')?.value) || 0;
  const c = parseInt(document.getElementById('ex-cardio')?.value) || 0;
  const w = parseInt(document.getElementById('ex-walk')?.value) || 0;
  const total = s + h + c + w; setTxt('ex-total', total + ' kcal');
}
function saveWorkout() {
  S.exBurned.strength = parseInt(document.getElementById('ex-strength')?.value) || 0;
  S.exBurned.hiit = parseInt(document.getElementById('ex-hiit')?.value) || 0;
  S.exBurned.cardio = parseInt(document.getElementById('ex-cardio')?.value) || 0;
  S.exBurned.walk = parseInt(document.getElementById('ex-walk')?.value) || 0;
  S.checks.g2 = true; closeMod('mod-workout'); goH('growth'); updateHome();
  if (typeof window.apiSaveWorkout === 'function') window.apiSaveWorkout();
  if (typeof saveChecks === 'function') saveChecks();
}

// ── CORTISOL ──
function renderCortisol() {
  const pc = typeof getCycleInfo === 'function' ? getCycleInfo() : { name: '황체기', day: 21 };
  return `
  <div class="card" style="border-color:rgba(206,147,216,.3)">
    <div class="cap">오늘 코르티솔 관리</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
      <div style="background:var(--sky3);border-radius:12px;padding:10px;text-align:center;border:1px solid rgba(91,184,245,.2)"><div style="font-size:18px;font-weight:800;color:var(--sky2)">7h20m</div><div style="font-size:9px;color:var(--muted);font-weight:600">어젯밤 수면</div></div>
      <div style="background:rgba(129,199,132,.1);border-radius:12px;padding:10px;text-align:center;border:1px solid rgba(129,199,132,.2)"><div style="font-size:18px;font-weight:800;color:var(--ok)">22분</div><div style="font-size:9px;color:var(--muted);font-weight:600">햇볕 노출</div></div>
      <div style="background:var(--cor-bg);border-radius:12px;padding:10px;text-align:center;border:1px solid rgba(206,147,216,.2)"><div style="font-size:18px;font-weight:800;color:var(--cor)">${pc.name}</div><div style="font-size:9px;color:var(--muted);font-weight:600">${pc.day}일차</div></div>
    </div>
    <div style="margin-top:8px;font-size:12px;color:var(--cor);background:var(--cor-bg);padding:8px 12px;border-radius:11px;line-height:1.5;font-weight:600">🌿 ${pc.name} 중 코르티솔이 상승하기 쉬워요. 명상과 규칙적인 수면이 핵심입니다.</div>
  </div>
  <div class="cap" style="padding:0 2px;margin-bottom:6px">루틴 체크</div>
  ${S.routines.cortisol.map(r => ckHtml(r.id, r.label, r.sub, 'var(--cor)')).join('')}`;
}

// ── OXYTOCIN ──
function renderOxytocin() {
  return `
  <div class="card" style="border-color:rgba(244,143,177,.3)">
    <div class="cap">오늘 옥시토신</div>
    <div style="font-size:13px;color:var(--text);line-height:1.6;font-weight:500">💗 포옹 20초 → 옥시토신 즉각 분비 · 코르티솔 억제 · 감정 안정</div>
  </div>
  <div class="cap" style="padding:0 2px;margin-bottom:6px">루틴 체크</div>
  ${S.routines.oxytocin.map(r => ckHtml(r.id, r.label, r.sub, 'var(--rose)')).join('')}
  ${S.checks.o4 ? `<div class="card" style="background:var(--oxy-bg);border-color:rgba(244,143,177,.3);text-align:center"><div style="font-size:24px;margin-bottom:4px">🎉</div><div style="font-size:14px;font-weight:700;color:var(--rose2)">옥시토신 100% 달성!</div><div style="font-size:11px;color:var(--muted);margin-top:3px;font-weight:500">일기가 AI 리포트에 반영됩니다</div></div>` : ''}`;
}

// ═══════════════════════ EDITABLE ROUTINE ═══════════════════════
function renderEditRoutine() {
  const hid = S.curH; const rts = S.routines[hid];
  document.getElementById('edit-routine-list').innerHTML = rts.map((r, i) => `
    <div style="margin-bottom:10px">
      <div class="cap" style="margin-bottom:4px">루틴 ${i + 1}</div>
      <input class="input" id="edit-r-label-${i}" value="${r.label}" style="margin-bottom:5px"/>
      <input class="input" id="edit-r-sub-${i}" value="${r.sub}" placeholder="부제목 (알람, 설명 등)"/>
    </div>`).join('');
}
function saveRoutine() {
  const hid = S.curH; const rts = S.routines[hid];
  rts.forEach((r, i) => { const l = document.getElementById(`edit-r-label-${i}`)?.value; const s = document.getElementById(`edit-r-sub-${i}`)?.value; if (l) r.label = l; if (s) r.sub = s; });
  closeMod('mod-edit-routine'); goH(hid);
}
