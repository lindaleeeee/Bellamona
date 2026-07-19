/* ═══════════════════════════════════════════════════════════════════════
   glucose-model.js  ★신규/발전 부분★
   BELLAMONA 혈당 예측 모델 개발 명세서(MDS) v1.0 구현
   - §1 타깃 ΔPeak = 식후 30~120분 최고치 − 식전 baseline
   - §4 4단계 예측 로직 (규칙 → 개인 k-NN → 공통ML → 개인보정)
   - §4.x 최종 선택 로직 + 폴백
   - §3 학습쌍(training_pairs) 생성 (클라이언트 로컬 버전)
   - §6 "예측 vs 실측" 적중률 집계
   프런트엔드(정적 사이트)에서 동작하도록 명세서 서버 로직을 이식.
   공통ML(LightGBM)은 서버 전용이므로, 여기서는 규칙+k-NN+개인보정까지 구현하고
   ML 자리는 훅(GMODEL.mlPredict)만 남겨 백엔드 연결 시 바로 끼우게 함.
   ═══════════════════════════════════════════════════════════════════════ */

const GMODEL = (() => {

  // ── 부록 A. 규칙 룩업테이블 (초기 ΔPeak 추정, mg/dL) ──
  // 탄수 버킷(g): [0-15,15-30,30-50,50-75,75+] × GI 버킷: [저<55,중55-70,고>70]
  const CARB_BUCKETS = [15, 30, 50, 75, Infinity];
  const LOOKUP = {
    // [저GI, 중GI, 고GI]
    0: [8, 12, 18],     // 0-15g
    1: [18, 28, 40],    // 15-30g
    2: [32, 48, 65],    // 30-50g
    3: [48, 70, 92],    // 50-75g
    4: [62, 90, 120],   // 75+g
  };

  function carbBucket(carbG) {
    for (let i = 0; i < CARB_BUCKETS.length; i++) {
      if (carbG <= CARB_BUCKETS[i]) return i;
    }
    return 4;
  }
  function giBucket(gi) {
    if (gi < 55) return 0;
    if (gi <= 70) return 1;
    return 2;
  }

  // 식사 시간대 → 아침/점심/저녁/야식 버킷
  function mealTimeBucket(hour) {
    if (hour >= 21 || hour < 5) return 'late';   // 야식(≥21시 또는 새벽)
    if (hour < 11) return 'morning';
    if (hour < 15) return 'lunch';
    return 'dinner';
  }
  function timeCoeff(hour) {
    const b = mealTimeBucket(hour);
    return { morning: 1.1, lunch: 1.0, dinner: 1.05, late: 1.15 }[b];
  }
  // 생리주기 phase 계수 (황체기 인슐린 감수성 저하)
  function cycleCoeff(phase) {
    return phase === 'luteal' ? 1.1 : 1.0;
  }

  /* ── §2 피처 빌드 ── 식사(meal) 객체에서 예측 피처를 뽑는다.
     meal: {foods:[{food:{c,p,f,gi,...}, g}], time:'HH:MM', bgPre}
     ctx : {cyclePhase, sleepH, workoutPost} (선택) */
  function buildFeatures(meal, ctx = {}) {
    let carb = 0, protein = 0, fat = 0, giNum = 0;
    (meal.foods || []).forEach(f => {
      const g = f.g || 0;
      carb += (f.food.c || 0) * g / 100;
      protein += (f.food.p || 0) * g / 100;
      fat += (f.food.f || 0) * g / 100;
      giNum += (f.food.gi || 0) * ((f.food.c || 0) * g / 100);
    });
    carb = Math.round(carb);
    protein = Math.round(protein);
    fat = Math.round(fat);
    const gi = carb > 0 ? Math.round(giNum / carb) : 55; // 결측 시 탄수 가중 55
    const fiber = 0; // food_db에 섬유질 없음 → 0 (명세서 결측 규칙)
    const hour = meal.time ? parseInt(meal.time.split(':')[0], 10) : 12;
    return {
      carb_g: carb, protein_g: protein, fat_g: fat, fiber_g: fiber,
      gi_estimate: gi, meal_hour: hour,
      baseline_glucose: meal.bgPre ? +meal.bgPre : 100,
      cycle_phase: ctx.cyclePhase || 'unknown',
      workout_within_30min_post: !!ctx.workoutPost,
      carb_x_gi: Math.round(carb * gi / 100),
    };
  }

  /* ── §4 단계 1: 규칙 기반 (콜드스타트) ── */
  function ruleBased(feat) {
    const base = LOOKUP[carbBucket(feat.carb_g)][giBucket(feat.gi_estimate)];
    const buffer = 1
      - 0.15 * (feat.fiber_g > 5 ? 1 : 0)
      - 0.10 * (feat.fat_g > 15 ? 1 : 0)
      - 0.10 * (feat.protein_g > 20 ? 1 : 0);
    const delta = base * buffer * timeCoeff(feat.meal_hour) * cycleCoeff(feat.cycle_phase);
    return { deltaPeak: Math.round(delta), method: 'rule', confidence: 'low' };
  }

  /* ── §4 단계 2: 개인 k-NN ──
     history: training_pairs 배열 [{features, delta_peak, valid}] (해당 유저) */
  function knnBased(feat, history) {
    const sameBucket = h => mealTimeBucket(h.features.meal_hour) === mealTimeBucket(feat.meal_hour);
    const neighbors = (history || []).filter(h =>
      h.valid &&
      Math.abs(h.features.carb_g - feat.carb_g) <= 20 &&
      Math.abs(h.features.gi_estimate - feat.gi_estimate) <= 15 &&
      sameBucket(h)
    );
    if (neighbors.length < 3) return null; // 폴백 신호
    // 거리 역가중 평균
    let wsum = 0, vsum = 0;
    const deltas = [];
    neighbors.forEach(n => {
      const dist = Math.abs(n.features.carb_g - feat.carb_g)
        + Math.abs(n.features.gi_estimate - feat.gi_estimate) + 1;
      const w = 1 / dist;
      wsum += w; vsum += w * n.delta_peak;
      deltas.push(n.delta_peak);
    });
    const delta = Math.round(vsum / wsum);
    deltas.sort((a, b) => a - b);
    const p = q => deltas[Math.min(deltas.length - 1, Math.floor(q * deltas.length))];
    return {
      deltaPeak: delta,
      range: [p(0.25), p(0.75)],
      method: 'knn',
      confidence: neighbors.length >= 5 ? 'high' : 'medium',
      similarN: neighbors.length,
      evidence: `지난번 비슷한 식사 ${neighbors.length}건 기준`,
    };
  }

  /* ── §4 단계 3: 공통 ML (백엔드 전용 훅) ──
     서버 LightGBM 연결 시 이 함수를 실제 fetch로 교체. 지금은 null 반환(미배포). */
  let mlPredict = null; // 예: async (feat)=>({deltaPeak, ...})
  function setMlPredictor(fn) { mlPredict = fn; }

  /* ── §4 단계 4: 개인 잔차 보정 ──
     history의 (실측 - ML예측) 평균 bias를 ML 결과에 더함 */
  function personalBias(history) {
    const labeled = (history || []).filter(h => h.valid && typeof h.ml_pred === 'number' && typeof h.delta_peak === 'number');
    if (labeled.length < 30) return null;
    const bias = labeled.reduce((a, h) => a + (h.delta_peak - h.ml_pred), 0) / labeled.length;
    return bias;
  }

  /* ── §4 최종 선택 로직 (매 추론) ──
     반환: {deltaPeak, peakEstimate(절대추정), level, confidence, method, similarN, range, evidence, disclaimer, lowData} */
  function predict(meal, ctx = {}, history = []) {
    const feat = buildFeatures(meal, ctx);
    const userPairs = (history || []).filter(h => h.valid).length;
    const globalDeployed = !!mlPredict;

    let out;
    // 단계 4 / 3 (ML 배포 시)
    if (globalDeployed) {
      // 주의: mlPredict가 async면 상위에서 await. 여기서는 동기 폴백 우선.
      out = { deltaPeak: null, method: 'ml', confidence: 'high' };
      // 실제 ML 호출은 predictAsync에서 처리. 동기 경로에선 규칙/knn로.
    }

    // 동기 경로: knn → rule
    const knn = knnBased(feat, history);
    if (knn) out = knn;
    else out = ruleBased(feat);

    const baseline = feat.baseline_glucose;
    const peakEstimate = Math.round(baseline + out.deltaPeak);
    const level = out.deltaPeak > 70 ? 'high' : out.deltaPeak >= 40 ? 'medium' : 'low';
    const lowData = !knn && userPairs < 5; // 데이터 부족

    return {
      deltaPeak: out.deltaPeak,
      peakEstimate,
      baseline,
      level,
      confidence: out.confidence,
      method: out.method,
      similarN: out.similarN || 0,
      range: out.range ? [baseline + out.range[0], baseline + out.range[1]] : null,
      evidence: out.evidence || null,
      lowData,
      features: feat,
      disclaimer: '본 예측은 참고용 추정치이며 의료적 진단이 아닙니다.',
    };
  }

  /* ── §4 ML 경로(비동기). 백엔드 연결 후 사용 ── */
  async function predictAsync(meal, ctx = {}, history = []) {
    const feat = buildFeatures(meal, ctx);
    if (mlPredict) {
      try {
        const ml = await mlPredict(feat);
        if (ml && typeof ml.deltaPeak === 'number') {
          const bias = personalBias(history);
          const userPairs = (history || []).filter(h => h.valid).length;
          const delta = Math.round(ml.deltaPeak + (bias || 0));
          const baseline = feat.baseline_glucose;
          const level = delta > 70 ? 'high' : delta >= 40 ? 'medium' : 'low';
          return {
            deltaPeak: delta, peakEstimate: Math.round(baseline + delta), baseline, level,
            confidence: (bias !== null && userPairs >= 30) ? 'high' : 'high',
            method: (bias !== null && userPairs >= 30) ? 'ml_personal' : 'ml',
            similarN: userPairs, range: null, evidence: '공통 모델 예측',
            lowData: false, features: feat,
            disclaimer: '본 예측은 참고용 추정치이며 의료적 진단이 아닙니다.',
          };
        }
      } catch (e) { /* ML 실패 → 폴백 */ }
    }
    return predict(meal, ctx, history); // 폴백
  }

  /* ── §3 학습쌍 생성 ──
     식사에 식전(bgPre)·식후(bg1h/bg2h)가 있으면 ΔPeak 라벨을 만들어 반환.
     명세서 §3.2 정제 규칙 일부 적용(이상치 제외). CGM 없으므로 수동 데이터 기반. */
  function makeTrainingPair(meal, ctx = {}) {
    const pre = meal.bgPre ? +meal.bgPre : null;
    const post = [meal.bg1h, meal.bg2h].filter(v => v != null).map(v => +v);
    if (pre == null || post.length === 0) return null;   // 라벨 불가
    const peak = Math.max(...post);
    const deltaPeak = peak - pre;
    if (deltaPeak < -10 || deltaPeak > 200) return null; // 이상치 제외
    return {
      meal_id: meal.id,
      features: buildFeatures(meal, ctx),
      delta_peak: deltaPeak,
      data_quality: 'manual',   // CGM 연동 전이므로 manual
      valid: true,
      created_at: new Date().toISOString(),
    };
  }

  /* ── §6 적중률 집계 ──
     예측 로그 배열 [{predicted_delta, actual_delta}] → ±20mg/dL 이내 적중률(%) */
  function hitRate(logs) {
    const done = (logs || []).filter(l => l.actual_delta != null && l.predicted_delta != null);
    if (!done.length) return null;
    const hits = done.filter(l => Math.abs(l.predicted_delta - l.actual_delta) <= 20).length;
    return Math.round(hits / done.length * 100);
  }

  return {
    buildFeatures, predict, predictAsync,
    ruleBased, knnBased, personalBias,
    makeTrainingPair, hitRate, setMlPredictor,
    mealTimeBucket, carbBucket, giBucket,
  };
})();

/* 전역 노출 (다른 스크립트에서 사용) */
window.GMODEL = GMODEL;
