/**
 * glucoseModel.ts
 * BELLAMONA 혈당 예측 모델 (GMODEL v1.0) TypeScript 포팅본
 *
 * - §1. 규칙 기반 추정 (Rule Based)
 * - §2. k-NN 피처 모델링
 * - §3. ML 잔차 보정 (Backend) & 학습쌍 축적
 */

export interface FoodItem {
    food: {
        n?: string;
        c?: number; // 탄수화물/100g
        p?: number; // 단백질/100g
        f?: number; // 지방/100g
        gi?: number; // 혈당지수
        cal?: number;
    };
    g: number;
    qty?: number;
}

export interface Meal {
    id: number;
    label: string;
    time: string;
    foods: FoodItem[];
    bgPre?: number | null;
    bg1h?: number | null;
    bg2h?: number | null;
}

export interface PredictionContext {
    cyclePhase?: string;
    workoutPost?: boolean;
}

export interface TrainingPair {
    meal_id: number;
    features: any;
    delta_peak: number;
    data_quality: string;
    valid: boolean;
    created_at: string;
    ml_pred?: number;
}

// ── 부록 A. 규칙 룩업테이블 ──
const CARB_BUCKETS = [15, 30, 50, 75, Infinity];
const LOOKUP: Record<number, number[]> = {
    0: [8, 12, 18],
    1: [18, 28, 40],
    2: [32, 48, 65],
    3: [48, 70, 92],
    4: [62, 90, 120]
};

function carbBucket(carbG: number) {
    for (let i = 0; i < CARB_BUCKETS.length; i++) {
        if (carbG <= CARB_BUCKETS[i]) return i;
    }
    return 4;
}

function giBucket(gi: number) {
    if (gi < 55) return 0;
    if (gi <= 70) return 1;
    return 2;
}

function mealTimeBucket(hour: number) {
    if (hour >= 21 || hour < 5) return 'late';
    if (hour < 11) return 'morning';
    if (hour < 15) return 'lunch';
    return 'dinner';
}

function timeCoeff(hour: number) {
    const b = mealTimeBucket(hour);
    switch (b) {
        case 'morning': return 1.1;
        case 'lunch': return 1.0;
        case 'dinner': return 1.05;
        case 'late': return 1.15;
        default: return 1.0;
    }
}

function cycleCoeff(phase: string) {
    return phase === 'luteal' ? 1.1 : 1.0;
}

export function buildFeatures(meal: Meal, ctx: PredictionContext = {}) {
    let carb = 0, protein = 0, fat = 0, giNum = 0;

    (meal.foods || []).forEach(f => {
        const g = f.g || 0;
        const c = f.food.c || 0;
        carb += (c * g) / 100;
        protein += ((f.food.p || 0) * g) / 100;
        fat += ((f.food.f || 0) * g) / 100;
        giNum += (f.food.gi || 0) * ((c * g) / 100);
    });

    carb = Math.round(carb);
    protein = Math.round(protein);
    fat = Math.round(fat);

    const gi = carb > 0 ? Math.round(giNum / carb) : 55;
    const fiber = 0;
    const hour = meal.time ? parseInt(meal.time.split(':')[0], 10) : 12;

    return {
        carb_g: carb,
        protein_g: protein,
        fat_g: fat,
        fiber_g: fiber,
        gi_estimate: gi,
        meal_hour: hour,
        baseline_glucose: meal.bgPre ? Number(meal.bgPre) : 100,
        cycle_phase: ctx.cyclePhase || 'unknown',
        workout_within_30min_post: !!ctx.workoutPost,
        carb_x_gi: Math.round((carb * gi) / 100),
    };
}

function ruleBased(feat: any) {
    const cb = carbBucket(feat.carb_g);
    const gb = giBucket(feat.gi_estimate);
    const base = (LOOKUP[cb] && LOOKUP[cb][gb]) ? LOOKUP[cb][gb] : 20;

    const buffer = 1
        - 0.15 * (feat.fiber_g > 5 ? 1 : 0)
        - 0.10 * (feat.fat_g > 15 ? 1 : 0)
        - 0.10 * (feat.protein_g > 20 ? 1 : 0);

    const delta = base * buffer * timeCoeff(feat.meal_hour) * cycleCoeff(feat.cycle_phase);
    return { deltaPeak: Math.round(delta), method: 'rule', confidence: 'low' };
}

function knnBased(feat: any, history: TrainingPair[]) {
    const sameBucket = (h: TrainingPair) => mealTimeBucket(h.features.meal_hour) === mealTimeBucket(feat.meal_hour);

    const neighbors = (history || []).filter(h =>
        h.valid &&
        Math.abs(h.features.carb_g - feat.carb_g) <= 20 &&
        Math.abs(h.features.gi_estimate - feat.gi_estimate) <= 15 &&
        sameBucket(h)
    );

    if (neighbors.length < 3) return null;

    let wsum = 0, vsum = 0;
    const deltas: number[] = [];

    neighbors.forEach(n => {
        const dist = Math.abs(n.features.carb_g - feat.carb_g) + Math.abs(n.features.gi_estimate - feat.gi_estimate) + 1;
        const w = 1 / dist;
        wsum += w;
        vsum += w * n.delta_peak;
        deltas.push(n.delta_peak);
    });

    const delta = Math.round(vsum / wsum);
    deltas.sort((a, b) => a - b);

    const p = (q: number) => deltas[Math.min(deltas.length - 1, Math.floor(q * deltas.length))];

    return {
        deltaPeak: delta,
        range: [p(0.25), p(0.75)],
        method: 'knn',
        confidence: neighbors.length >= 5 ? 'high' : 'medium',
        similarN: neighbors.length,
        evidence: `지난번 비슷한 식사 ${neighbors.length}건 기준`,
    };
}

export function predict(meal: Meal, ctx: PredictionContext = {}, history: TrainingPair[] = []) {
    const feat = buildFeatures(meal, ctx);
    const userPairs = (history || []).filter(h => h.valid).length;

    let out: any;
    const knn = knnBased(feat, history);

    if (knn) out = knn;
    else out = ruleBased(feat);

    const baseline = feat.baseline_glucose;
    const peakEstimate = Math.round(baseline + out.deltaPeak);
    const level = out.deltaPeak > 70 ? 'high' : out.deltaPeak >= 40 ? 'medium' : 'low';
    const lowData = !knn && userPairs < 5;

    return {
        deltaPeak: out.deltaPeak as number,
        peakEstimate,
        baseline,
        level,
        confidence: out.confidence as string,
        method: out.method as string,
        similarN: (out.similarN || 0) as number,
        range: out.range ? [baseline + out.range[0], baseline + out.range[1]] : null,
        evidence: out.evidence || null,
        lowData,
        features: feat,
        disclaimer: '본 예측은 참고용 추정치이며 의료적 진단이 아닙니다.',
    };
}

export function makeTrainingPair(meal: Meal, ctx: PredictionContext = {}): TrainingPair | null {
    const pre = meal.bgPre != null ? Number(meal.bgPre) : null;
    const post = [meal.bg1h, meal.bg2h].filter(v => v != null).map(v => Number(v));

    if (pre == null || post.length === 0) return null;

    const peak = Math.max(...post);
    const deltaPeak = peak - pre;

    if (deltaPeak < -10 || deltaPeak > 200) return null; // Outliers

    return {
        meal_id: meal.id,
        features: buildFeatures(meal, ctx),
        delta_peak: deltaPeak,
        data_quality: 'manual',
        valid: true,
        created_at: new Date().toISOString(),
    };
}

export function hitRate(logs: { predicted_delta: number, actual_delta: number }[]) {
    const done = (logs || []).filter(l => l.actual_delta != null && l.predicted_delta != null);
    if (!done.length) return null;
    const hits = done.filter(l => Math.abs(l.predicted_delta - l.actual_delta) <= 20).length;
    return Math.round((hits / done.length) * 100);
}
