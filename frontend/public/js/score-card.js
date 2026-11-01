// 오늘의 칼로리 점수 + 친구 점수판 + 공유 카드(카드뉴스)
//
// 점수 = 100 − |순섭취 ÷ 목표 − 1| × 100   (0~100, 목표에 딱 맞으면 100점)
//   순섭취 = 먹은 칼로리 − 운동으로 쓴 칼로리, 목표 = 오늘(생리주기 반영) 섭취 목표 칼로리
//   예) 목표 1,600 / 순섭취 1,440 → 90점,  순섭취 1,840 → 85점
// 친구에게는 점수만 공유한다(users/{uid}.today_score = {date, score}). 섭취/소비 숫자는 내 카드에만.

function kcalScore(intake, burn, goal) {
  if (!goal || intake == null) return null;
  const net = intake - (burn || 0);
  return Math.max(0, Math.min(100, Math.round(100 - Math.abs(net / goal - 1) * 100)));
}
function kcalScoreBadge(score) {
  if (score == null) return { e: '🍽', t: '아직 기록 전' };
  if (score >= 95) return { e: '🎯', t: '칼로리 저격수' };
  if (score >= 85) return { e: '👍', t: '거의 완벽해요' };
  if (score >= 70) return { e: '🙂', t: '괜찮은 하루' };
  if (score >= 50) return { e: '😅', t: '조금 아쉬워요' };
  return { e: '🫠', t: '내일 다시 도전' };
}
function kcalGapText(net, goal) {
  const d = Math.round(net - goal);
  if (Math.abs(d) < 30) return '목표 칼로리에 딱 맞췄어요';
  return d < 0 ? `목표보다 ${Math.abs(d).toLocaleString()}kcal 덜 먹었어요` : `목표보다 ${d.toLocaleString()}kcal 더 먹었어요`;
}
function todayKcalScore() {
  const meals = (typeof S !== 'undefined' && S.meals) || [];
  const intake = Math.round(meals.reduce((a, m) => a + (Number(m.kcal) || 0), 0));
  const logged = meals.some(m => Number(m.kcal) > 0);
  const burn = Math.round(typeof todayWorkoutKcal === 'function' ? todayWorkoutKcal() : 0);
  const goal = typeof phaseGoalCal === 'function' ? phaseGoalCal() : (S.goalCal || 0);
  const net = intake - burn;
  return { date: typeof todayISOLocal === 'function' ? todayISOLocal() : '', intake, burn, goal, net, score: logged ? kcalScore(intake, burn, goal) : null };
}

// ── 홈(대시보드) 링 카드 ──
function renderKcalScoreHome() {
  const k = todayKcalScore();
  const ring = document.getElementById('h-ring');
  if (ring) { const circ = 2 * Math.PI * 29; ring.setAttribute('stroke-dasharray', `${Math.min((k.score || 0) / 100 * circ, circ)} ${circ}`); }
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set('h-ring-pct', k.score == null ? '–' : String(k.score));
  const b = kcalScoreBadge(k.score);
  set('h-kscore-badge', `${b.e} ${b.t}`);
  set('h-kscore-sub', k.score == null ? `오늘 목표 ${k.goal.toLocaleString()}kcal · 식사를 기록하면 점수가 나와요` : kcalGapText(k.net, k.goal));
  set('h-kscore-in', `🍽 섭취 ${k.intake.toLocaleString()}`);
  set('h-kscore-out', `🔥 소비 ${k.burn.toLocaleString()}`);
  publishMyScore(k);
}

// ── 친구에게 내 점수 공유(바뀔 때만, 몇 초 모아서 한 번) ──
let _scorePubTimer = null, _scorePubLast = '';
function publishMyScore(k) {
  const payload = JSON.stringify({ date: k.date, score: k.score });
  if (payload === _scorePubLast || !localStorage.getItem('bellamona_token')) return;
  clearTimeout(_scorePubTimer);
  _scorePubTimer = setTimeout(() => {
    _scorePubLast = payload;
    fetchApi(apiUrl('/api/user/score'), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: payload })
      .catch(e => { _scorePubLast = ''; console.error('[publishMyScore]', e); });
  }, 2500);
}

// ── 마이페이지 점수판 ──
function scoreBoardEntries() {
  const k = todayKcalScore();
  const me = { me: true, name: (S.name || "나"), avatar: S.avatar || '🦋', score: k.score };
  const friends = (S.friends || []).map(f => ({ name: f.name || '친구', avatar: f.avatar || '🦋', score: f.todayScore != null ? f.todayScore : null }));
  return [me, ...friends].sort((a, b) => (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score));
}
function renderScoreBoard() {
  const box = document.getElementById('prof-scoreboard'); if (!box) return;
  const k = todayKcalScore();
  const b = kcalScoreBadge(k.score);
  const rows = scoreBoardEntries();
  const medal = i => ['🥇', '🥈', '🥉'][i] || `${i + 1}`;
  box.innerHTML = `
    <table class="ks-table">
      <tr><th>목표 칼로리</th><th>순섭취</th><th>오늘의 점수</th></tr>
      <tr><td>${k.goal.toLocaleString()}</td><td>${k.net.toLocaleString()}</td><td class="ks-score">${k.score == null ? '–' : k.score + '점'}</td></tr>
    </table>
    <div class="ks-sub"><span>🍽 섭취 <b>${k.intake.toLocaleString()}</b>kcal</span><span>🔥 소비 <b>${k.burn.toLocaleString()}</b>kcal</span></div>
    <div class="ks-badge">${b.e} ${b.t}${k.score != null ? ` · ${kcalGapText(k.net, k.goal)}` : ''}</div>
    <div class="ks-board">${rows.map((r, i) => `
      <div class="ks-row${r.me ? ' me' : ''}">
        <span class="ks-rank">${r.score == null ? '·' : medal(i)}</span><span class="ks-av">${r.avatar}</span>
        <span class="ks-name">${String(r.name).replace(/[<>&]/g, '')}${r.me ? ' (나)' : ''}</span>
        <span class="ks-bar"><i style="width:${r.score || 0}%"></i></span>
        <span class="ks-pt">${r.score == null ? '기록 전' : r.score + '점'}</span>
      </div>`).join('')}
      ${(S.friends || []).length ? '' : `<div class="ks-empty">친구를 추가하면 점수판에서 같이 비교할 수 있어요</div>`}
    </div>
    <button class="btn btn-p" style="margin-top:10px" onclick="openScoreCards()">📸 카드로 친구에게 공유하기</button>`;
}

// ── 공유 카드(캔버스 이미지 2장: 내 점수 / 점수판) ──
const _CARD_FONT = '"Nunito", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
function _rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function _cardBase(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#dcefff'); g.addColorStop(1, '#ece2ff');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffffff';
  [[900, 140, 180], [120, 1180, 220], [980, 1120, 90]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); });
  ctx.globalAlpha = 1;
  const d = new Date();
  ctx.fillStyle = '#7b6fa8'; ctx.font = `800 34px ${_CARD_FONT}`; ctx.textAlign = 'left'; ctx.fillText('BELLAMONA', 70, 96);
  ctx.textAlign = 'right'; ctx.fillText(`${d.getMonth() + 1}.${d.getDate()} (${'일월화수목금토'[d.getDay()]})`, W - 70, 96);
}
function _cardFooter(ctx, W, H, text) {
  ctx.textAlign = 'center'; ctx.fillStyle = '#7b6fa8'; ctx.font = `700 34px ${_CARD_FONT}`; ctx.fillText(text, W / 2, H - 60);
}
function drawMyScoreCard() {
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'); const k = todayKcalScore(); const b = kcalScoreBadge(k.score);
  _cardBase(ctx, W, H);
  ctx.fillStyle = '#ffffff'; _rr(ctx, 60, 150, W - 120, 900, 56); ctx.fill();
  ctx.textAlign = 'center'; ctx.fillStyle = '#8a86a8'; ctx.font = `700 44px ${_CARD_FONT}`; ctx.fillText('오늘의 칼로리 점수', W / 2, 250);
  // 점수 링
  const cx = W / 2, cy = 560, R = 210;
  ctx.lineCap = 'round'; ctx.lineWidth = 38; ctx.strokeStyle = '#eeeafa'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  const rg = ctx.createLinearGradient(cx - R, cy, cx + R, cy); rg.addColorStop(0, '#5bb8f5'); rg.addColorStop(1, '#9575cd');
  ctx.strokeStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ((k.score || 0) / 100)); ctx.stroke();
  ctx.fillStyle = '#2d2a4a'; ctx.font = `900 190px ${_CARD_FONT}`; ctx.textBaseline = 'middle';
  ctx.fillText(k.score == null ? '–' : String(k.score), cx, cy - 10);
  ctx.font = `800 52px ${_CARD_FONT}`; ctx.fillStyle = '#8a86a8'; ctx.fillText(k.score == null ? '' : '점 / 100', cx, cy + 110);
  ctx.textBaseline = 'alphabetic';
  // 칭호
  ctx.font = `800 58px ${_CARD_FONT}`; const t = `${b.e} ${b.t}`; const tw = ctx.measureText(t).width + 90;
  ctx.fillStyle = '#f1ecff'; _rr(ctx, cx - tw / 2, 830, tw, 100, 50); ctx.fill();
  ctx.fillStyle = '#6a4fc9'; ctx.fillText(t, cx, 900);
  ctx.fillStyle = '#8a86a8'; ctx.font = `700 40px ${_CARD_FONT}`;
  ctx.fillText(k.score == null ? '식사를 기록하면 점수가 나와요' : kcalGapText(k.net, k.goal), cx, 1000);
  // 섭취 / 소비 / 목표
  const boxes = [['🍽 섭취', k.intake], ['🔥 소비', k.burn], ['🎯 목표', k.goal]];
  const bw = (W - 120 - 40) / 3;
  boxes.forEach(([label, v], i) => {
    const x = 60 + i * (bw + 20);
    ctx.fillStyle = 'rgba(255,255,255,.75)'; _rr(ctx, x, 1090, bw, 150, 36); ctx.fill();
    ctx.fillStyle = '#8a86a8'; ctx.font = `700 34px ${_CARD_FONT}`; ctx.fillText(label, x + bw / 2, 1145);
    ctx.fillStyle = '#2d2a4a'; ctx.font = `900 50px ${_CARD_FONT}`; ctx.fillText(`${Number(v).toLocaleString()}`, x + bw / 2, 1210);
  });
  _cardFooter(ctx, W, H, '나랑 점수 비교해볼래? · bellamona.net');
  return c;
}
function drawBoardCard() {
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'); const rows = scoreBoardEntries().slice(0, 6);
  _cardBase(ctx, W, H);
  ctx.textAlign = 'center'; ctx.fillStyle = '#2d2a4a'; ctx.font = `900 70px ${_CARD_FONT}`; ctx.fillText('오늘의 점수판 🏆', W / 2, 230);
  ctx.fillStyle = '#8a86a8'; ctx.font = `700 36px ${_CARD_FONT}`; ctx.fillText('목표 칼로리에 가까울수록 100점', W / 2, 290);
  const medal = i => ['🥇', '🥈', '🥉'][i] || `${i + 1}`;
  rows.forEach((r, i) => {
    const y = 350 + i * 140;
    ctx.fillStyle = r.me ? '#ffffff' : 'rgba(255,255,255,.6)'; _rr(ctx, 60, y, W - 120, 120, 40); ctx.fill();
    if (r.me) { ctx.strokeStyle = '#9575cd'; ctx.lineWidth = 5; _rr(ctx, 60, y, W - 120, 120, 40); ctx.stroke(); }
    ctx.textAlign = 'center'; ctx.fillStyle = '#2d2a4a'; ctx.font = `800 54px ${_CARD_FONT}`;
    ctx.fillText(r.score == null ? '·' : medal(i), 130, y + 80);
    ctx.font = `60px ${_CARD_FONT}`; ctx.fillText(r.avatar, 220, y + 82);
    ctx.textAlign = 'left'; ctx.font = `800 44px ${_CARD_FONT}`; ctx.fillStyle = '#2d2a4a';
    let name = String(r.name) + (r.me ? ' (나)' : ''); while (ctx.measureText(name).width > 300 && name.length > 2) name = name.slice(0, -2) + '…';
    ctx.fillText(name, 280, y + 76);
    const bx = 600, bwid = 230;
    ctx.fillStyle = '#eeeafa'; _rr(ctx, bx, y + 50, bwid, 22, 11); ctx.fill();
    if (r.score) { const gg = ctx.createLinearGradient(bx, 0, bx + bwid, 0); gg.addColorStop(0, '#5bb8f5'); gg.addColorStop(1, '#9575cd'); ctx.fillStyle = gg; _rr(ctx, bx, y + 50, Math.max(22, bwid * r.score / 100), 22, 11); ctx.fill(); }
    ctx.textAlign = 'right'; ctx.fillStyle = r.score == null ? '#a9a5c2' : '#6a4fc9'; ctx.font = `900 ${r.score == null ? 34 : 50}px ${_CARD_FONT}`;
    ctx.fillText(r.score == null ? '기록 전' : `${r.score}점`, W - 90, y + 80);
  });
  if (rows.length === 1) {
    ctx.textAlign = 'center'; ctx.fillStyle = '#6a4fc9'; ctx.font = `800 44px ${_CARD_FONT}`;
    ctx.fillText('같이 할 친구를 기다리는 중 👀', W / 2, 640);
  }
  _cardFooter(ctx, W, H, S.friendCode ? `내 친구 코드 ${S.friendCode} · bellamona.net` : 'bellamona.net');
  return c;
}

let _scoreCardBlobs = [];
async function openScoreCards() {
  const canvases = [drawMyScoreCard(), drawBoardCard()];
  const box = document.getElementById('scorecard-slides');
  if (box) box.innerHTML = canvases.map((cv, i) => `<img src="${cv.toDataURL('image/png')}" alt="공유 카드 ${i + 1}" class="ks-slide"/>`).join('');
  _scoreCardBlobs = await Promise.all(canvases.map(cv => new Promise(r => cv.toBlob(r, 'image/png'))));
  if (typeof openMod === 'function') openMod('mod-scorecard');
}
async function shareScoreCards() {
  const k = todayKcalScore();
  const files = _scoreCardBlobs.filter(Boolean).map((b, i) => new File([b], `bellamona-score-${i + 1}.png`, { type: 'image/png' }));
  const text = k.score == null ? '오늘 칼로리 점수 같이 비교해요! bellamona.net' : `오늘 내 칼로리 점수 ${k.score}점! 너는 몇 점이야? bellamona.net`;
  try {
    if (navigator.canShare && navigator.canShare({ files })) { await navigator.share({ files, text, title: '오늘의 칼로리 점수' }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  saveScoreCards();
}
function saveScoreCards() {
  _scoreCardBlobs.filter(Boolean).forEach((b, i) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `bellamona-score-${i + 1}.png`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  });
}
