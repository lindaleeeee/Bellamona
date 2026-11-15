// 체형 사진(앞, 뒤 거울 셀카)으로 어깨 높낮이와 골반 기울기를 계산하고, 그에 맞는 운동을 고른다.
//
// · 사진은 이 기기(브라우저) 안에서만 분석한다. 서버나 AI로 보내지 않고, 저장하는 것은 각도 숫자뿐이다.
// · 분석은 MediaPipe Pose(구글 공개 모델)로 어깨 2점, 골반(고관절) 2점의 위치를 찾아 기울기 각도를 잰다.
// · 거울 셀카 기준: 앞모습은 사진 왼쪽 = 내 왼쪽, 뒷모습은 사진 왼쪽 = 내 오른쪽. 결과가 반대로 느껴지면
//   "좌우 바꾸기"로 뒤집는다(직접 찍어 준 사진은 거울과 반대).
// · 진단이 아니라 운동을 고르기 위한 참고값이다.
const POSTURE_MP_VER = '0.10.14';
const POSTURE_LEVEL_DEG = 1.0; // 이보다 작으면 거의 수평으로 본다
let _poseLandmarkerP = null;
function _loadPoseLandmarker() {
  if (!_poseLandmarkerP) {
    _poseLandmarkerP = (async () => {
      const base = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${POSTURE_MP_VER}`;
      const vision = await import(`${base}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${base}/wasm`);
      return vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task', delegate: 'CPU' },
        runningMode: 'IMAGE', numPoses: 1,
      });
    })().catch(e => { _poseLandmarkerP = null; throw e; });
  }
  return _poseLandmarkerP;
}
function _fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
// 사진 속 두 점(왼쪽에 보이는 점, 오른쪽에 보이는 점)의 기울기. + = 사진 왼쪽이 더 높다.
function _tiltDeg(A, B, w, h) {
  const L = A.x < B.x ? A : B, R = A.x < B.x ? B : A;
  return Math.atan2((R.y - L.y) * h, (R.x - L.x) * w) * 180 / Math.PI;
}
// view: 'front' | 'back'. 반환값의 + = 내 왼쪽이 더 높다(거울 셀카 가정).
async function measurePosture(file, view) {
  const img = await _fileToImage(file);
  const lm = await _loadPoseLandmarker();
  const res = lm.detect(img);
  const p = res && res.landmarks && res.landmarks[0];
  if (!p) return { ok: false, img, reason: '사람을 찾지 못했어요' };
  const need = [11, 12, 23, 24];
  if (need.some(i => (p[i].visibility != null && p[i].visibility < 0.5))) return { ok: false, img, reason: '어깨와 골반이 다 보이게 찍어 주세요' };
  const w = img.naturalWidth, h = img.naturalHeight;
  const sign = view === 'back' ? -1 : 1; // 뒷모습 거울 셀카는 사진 왼쪽이 내 오른쪽
  return {
    ok: true, img, points: { ls: p[11], rs: p[12], lh: p[23], rh: p[24] },
    shoulder: sign * _tiltDeg(p[11], p[12], w, h),
    pelvis: sign * _tiltDeg(p[23], p[24], w, h),
  };
}
function _postureSide(v) { return Math.abs(v) < POSTURE_LEVEL_DEG ? null : (v > 0 ? 'left' : 'right'); }
function combinePosture(front, back, flip) {
  const ms = [front, back].filter(m => m && m.ok);
  if (!ms.length) return null;
  const avg = k => ms.reduce((a, m) => a + m[k], 0) / ms.length * (flip ? -1 : 1);
  const sh = avg('shoulder'), pv = avg('pelvis');
  return {
    shoulderDeg: Math.round(Math.abs(sh) * 10) / 10, shoulderHigh: _postureSide(sh),
    pelvisDeg: Math.round(Math.abs(pv) * 10) / 10, pelvisHigh: _postureSide(pv),
    views: ms.length, at: Date.now(),
  };
}
const _SIDE_KO = { left: '왼쪽', right: '오른쪽' };
function postureSummary(ps) {
  if (!ps) return [];
  const out = [];
  out.push(ps.shoulderHigh ? `${_SIDE_KO[ps.shoulderHigh]} 어깨가 ${ps.shoulderDeg}° 더 높아요` : '어깨 높이는 거의 같아요');
  out.push(ps.pelvisHigh ? `골반 ${_SIDE_KO[ps.pelvisHigh]}이 ${ps.pelvisDeg}° 더 올라가 있어요` : '골반은 거의 수평이에요');
  return out;
}
// 체형 결과 → 운동 목록. 기존 근력(STRENGTH_ROUTINES), 스트레칭(STRETCH_ROUTINES) 데이터에서 고른다.
function postureSuggestions(ps) {
  if (!ps) return [];
  const other = s => (s === 'left' ? 'right' : 'left');
  const list = [];
  const add = (kind, bp, id, why, side) => list.push({ kind, bp, id, why, side });
  if (ps.shoulderHigh) {
    const hi = _SIDE_KO[ps.shoulderHigh];
    add('stretch', 'shoulder', 'st-sh-2', `${hi} 목과 어깨 옆을 30초 더 늘려 주세요`);
    add('stretch', 'chest', 'st-ch-1', '가슴 앞쪽을 열어 어깨가 말리지 않게');
    add('strength', 'back', 'bk-9', `${hi} 팔은 어깨를 아래로 끌어내리듯 당기기`);
    add('strength', 'shoulder', 'sh-7', '어깨 뒤쪽을 고르게 써서 좌우 균형 잡기');
  }
  if (ps.pelvisHigh) {
    const hi = _SIDE_KO[ps.pelvisHigh], lo = _SIDE_KO[other(ps.pelvisHigh)];
    add('stretch', 'core', 'st-co-2', `${hi} 옆구리를 더 길게 늘려 주세요`);
    add('stretch', 'glutes', 'st-gl-2', `${hi} 고관절 앞쪽을 한 번 더`);
    add('strength', 'glutes', 'gl-1', `${lo} 다리부터 시작해 1세트 더`);
    add('strength', 'glutes', 'gl-9', `${lo} 쪽 엉덩이 옆에 힘을 주는 느낌으로`);
    add('strength', 'glutes', 'gl-3', '양쪽 같은 횟수, 골반이 기울지 않게 천천히');
  }
  if (ps.shoulderHigh || ps.pelvisHigh) add('strength', 'core', 'co-1', '몸통을 곧게 버텨 좌우 균형 유지');
  // 데이터에 실제로 있는 운동만 남긴다
  return list.map(x => {
    const db = x.kind === 'stretch' ? (typeof STRETCH_ROUTINES !== 'undefined' ? STRETCH_ROUTINES : {}) : (typeof STRENGTH_ROUTINES !== 'undefined' ? STRENGTH_ROUTINES : {});
    const r = db[x.bp] && (db[x.bp].routines || []).find(y => y.id === x.id);
    return r ? Object.assign({}, x, { routine: r }) : null;
  }).filter(Boolean);
}

// ── 화면: 사진 2장 고르기 → 분석 → 결과 확인 → 저장/건너뛰기 ─────────────────
// opts: { onDone(result|null), skipLabel, saveLabel }
const _pf = { front: null, back: null, mFront: null, mBack: null, flip: false, opts: null, box: null };
function renderPostureFlow(boxId, opts) {
  const box = document.getElementById(boxId); if (!box) return;
  Object.assign(_pf, { front: null, back: null, mFront: null, mBack: null, flip: false, opts: opts || {}, box });
  box.innerHTML = `
    <div class="pf">
      <div class="pf-guide">몸 라인이 보이는 옷을 입고 거울 앞에서 <b>앞모습</b>과 <b>뒷모습</b>을 한 장씩 찍어 주세요. 머리부터 무릎까지 나오게, 똑바로 서서 찍으면 좋아요.</div>
      <div class="pf-pick">
        <label class="pf-slot" id="pf-slot-front"><input type="file" accept="image/*" onchange="_pfPick('front', this.files[0])" hidden /><span>앞모습 사진</span></label>
        <label class="pf-slot" id="pf-slot-back"><input type="file" accept="image/*" onchange="_pfPick('back', this.files[0])" hidden /><span>뒷모습 사진</span></label>
      </div>
      <div class="pf-privacy">사진은 이 휴대폰 안에서만 분석하고 어디에도 올리지 않아요. 저장되는 건 기울기 숫자뿐이에요.</div>
      <div id="pf-status" class="pf-status"></div>
      <div id="pf-result"></div>
      <button class="btn btn-p" id="pf-analyze" onclick="_pfAnalyze()" disabled>분석하기</button>
      <button class="btn btn-o" style="margin-top:8px" onclick="_pfSkip()">${(opts && opts.skipLabel) || '건너뛰기'}</button>
      <div class="pf-note">건너뛰면 맞춤 운동 추천은 보이지 않아요. 나중에 마이페이지에서 언제든 할 수 있어요.</div>
    </div>`;
}
function _pfPick(view, file) {
  if (!file) return;
  _pf[view] = file; _pf[view === 'front' ? 'mFront' : 'mBack'] = null;
  const slot = document.getElementById(`pf-slot-${view}`);
  if (slot) { slot.style.backgroundImage = `url(${URL.createObjectURL(file)})`; slot.classList.add('has'); }
  const b = document.getElementById('pf-analyze'); if (b) b.disabled = !(_pf.front || _pf.back);
  document.getElementById('pf-result').innerHTML = '';
}
async function _pfAnalyze() {
  const st = document.getElementById('pf-status'); const btn = document.getElementById('pf-analyze');
  btn.disabled = true; st.textContent = '분석 중이에요… (처음 한 번은 10초 정도 걸려요)';
  try {
    if (_pf.front && !_pf.mFront) _pf.mFront = await measurePosture(_pf.front, 'front');
    if (_pf.back && !_pf.mBack) _pf.mBack = await measurePosture(_pf.back, 'back');
  } catch (e) {
    console.error('[posture]', e);
    st.textContent = '분석 도구를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.';
    btn.disabled = false; return;
  }
  const bad = [['앞모습', _pf.mFront], ['뒷모습', _pf.mBack]].filter(([, m]) => m && !m.ok);
  st.textContent = bad.map(([n, m]) => `${n}: ${m.reason}`).join(' · ');
  btn.disabled = false;
  _pfRenderResult();
}
function _pfRenderResult() {
  const box = document.getElementById('pf-result'); if (!box) return;
  const r = combinePosture(_pf.mFront, _pf.mBack, _pf.flip);
  if (!r) { box.innerHTML = ''; return; }
  const m = (_pf.mFront && _pf.mFront.ok) ? _pf.mFront : _pf.mBack;
  box.innerHTML = `
    <div class="pf-res">
      <canvas id="pf-canvas"></canvas>
      <div class="pf-lines">${postureSummary(r).map(t => `<div>${t}</div>`).join('')}</div>
      <button class="pf-flip" onclick="_pf.flip=!_pf.flip;_pfRenderResult()">좌우가 반대로 나온 것 같아요 (좌우 바꾸기)</button>
      <div class="pf-note">사진으로 본 대략적인 기울기예요. 통증이 있거나 차이가 크게 느껴지면 전문가와 상담해 주세요.</div>
      <button class="btn btn-p" style="margin-top:10px" onclick="_pfSave()">${_pf.opts.saveLabel || '이 결과로 맞춤 운동 받기'}</button>
    </div>`;
  _pfDraw(m);
  const an = document.getElementById('pf-analyze'); if (an) an.style.display = 'none';
}
function _pfDraw(m) {
  const cv = document.getElementById('pf-canvas'); if (!cv || !m || !m.img) return;
  const W = 260, s = W / m.img.naturalWidth, H = Math.round(m.img.naturalHeight * s);
  cv.width = W * 2; cv.height = H * 2; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const g = cv.getContext('2d'); g.scale(2, 2); g.drawImage(m.img, 0, 0, W, H);
  const P = k => [m.points[k].x * W, m.points[k].y * H];
  const line = (a, b) => { g.beginPath(); g.moveTo(...P(a)); g.lineTo(...P(b)); g.stroke(); };
  g.lineWidth = 3; g.strokeStyle = '#9575cd'; line('ls', 'rs'); line('lh', 'rh');
  g.setLineDash([5, 4]); g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,.9)';
  [['ls', 'rs'], ['lh', 'rh']].forEach(([a]) => { const [x, y] = P(a); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); });
  g.setLineDash([]);
  ['ls', 'rs', 'lh', 'rh'].forEach(k => { const [x, y] = P(k); g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); g.strokeStyle = '#9575cd'; g.lineWidth = 2; g.stroke(); });
}
function _pfSave() {
  const r = combinePosture(_pf.mFront, _pf.mBack, _pf.flip);
  if (_pf.opts.onDone) _pf.opts.onDone(r);
}
function _pfSkip() { if (_pf.opts.onDone) _pf.opts.onDone(null); }
