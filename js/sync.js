const API_BASE = 'https://port-0-bellamona-mkvbnlkhad097f26.sel3.cloudtype.app/api'; // 실제 배포 주소로 추후 변경

// 인증 헤더 생성 함수
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
}

async function loadUserData() {
    try {
        if (!localStorage.getItem('token')) return false;
        const res = await fetch(`${API_BASE}/data`, { headers: getAuthHeaders() });
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                localStorage.removeItem('token');
            }
            throw new Error(`API fetch error: ${res.status}`);
        }
        const d = await res.json();

        // S 객체 복원 (기존 로직 보존)
        if (d.user) S.name = d.user.name;
        if (d.profile) {
            S.initWeight = parseFloat(d.profile.weight_kg) || S.initWeight;
            S.goalWeight = parseFloat(d.profile.goal_weight_kg) || S.goalWeight;
            S.goalMonths = d.profile.goal_months || S.goalMonths;
            S.goalCal = d.profile.daily_kcal_target || S.goalCal;
            S.cycleLen = d.profile.cycle_len || S.cycleLen;
        }

        // 저장된 데이터들을 매핑 (형식 변환 고려)
        if (d.meals && Array.isArray(d.meals)) {
            S.meals = d.meals.map(m => ({
                id: m.id,
                label: m.label,
                time: m.time,
                foods: Object.keys(m.foods || {}).length ? m.foods : [],
                bgPre: m.bg_pre, bg1h: m.bg_1h, bg2h: m.bg_2h
            }));
        }
        const todayStr = new Date().toISOString().split('T')[0];
        if (d.workout && Array.isArray(d.workout)) {
            const tdWk = d.workout.find(w => new Date(w.performed_date).toISOString().split('T')[0] === todayStr);
            if (tdWk) {
                S.exBurned.strength = tdWk.strength || 0;
                S.exBurned.hiit = tdWk.hiit || 0;
                S.exBurned.cardio = tdWk.cardio || 0;
                S.exBurned.walk = tdWk.walk || 0;
            }
        }
        if (d.checks && Array.isArray(d.checks)) {
            S.checkHistory = d.checks.map(c => ({
                date: new Date(c.check_date).toISOString().split('T')[0],
                checks: c.checks || {}
            }));
            const tdCk = S.checkHistory.find(c => c.date === todayStr);
            S.checks = tdCk ? tdCk.checks : { i1: false, i2: false, i3: false, i4: false, g1: false, g2: false, g3: false, g4: false, c1: false, c2: false, c3: false, c4: false, o1: false, o2: false, o3: false, o4: false };
        }
        if (d.weights && d.weights.length > 0) {
            S.weights = d.weights.map(w => ({
                d: new Date(w.logged_date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }),
                w: parseFloat(w.weight_kg)
            }));
        }
        if (d.periods && d.periods.length > 0) {
            S.periods = d.periods.map(p => ({
                start: new Date(p.start_date).toISOString().split('T')[0],
                days: p.duration_days
            }));
        }
        if (d.diaries && d.diaries.length > 0) {
            S.diaries = d.diaries.map(d => ({
                d: new Date(d.written_date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }),
                t: d.content
            }));
        }

        if (typeof updateHome === 'function') updateHome();
        if (typeof renderDash === 'function') renderDash();
        return true;
    } catch (err) {
        console.error('loadUserData error:', err);
        return false;
    }
}

async function apiSaveMeal() {
    try {
        if (!localStorage.getItem('token')) return;
        const today = new Date().toISOString().split('T')[0];
        const latestMeal = S.meals[S.meals.length - 1]; // 마지막 추가/수정된 식사 전송 (단순화)
        if (!latestMeal) return;

        await fetch(`${API_BASE}/data/meals`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                eaten_date: today,
                label: latestMeal.label,
                time: latestMeal.time,
                foods: latestMeal.foods,
                bg_pre: latestMeal.bgPre, bg_1h: latestMeal.bg1h, bg_2h: latestMeal.bg2h
            })
        });
    } catch (err) { console.error(err); }
}

async function apiSaveWorkout() {
    try {
        if (!localStorage.getItem('token')) return;
        const body = {
            strength: S.exBurned.strength || 0,
            hiit: S.exBurned.hiit || 0,
            cardio: S.exBurned.cardio || 0,
            walk: S.exBurned.walk || 0
        };
        await fetch(`${API_BASE}/data/workouts`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(body) });
    } catch (err) { console.error(err); }
}

async function apiSaveChecks() {
    try {
        if (!localStorage.getItem('token')) return;
        await fetch(`${API_BASE}/data/checks`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ checks: S.checks }) });
    } catch (err) { console.error(err); }
}

async function apiSaveWeightRow() {
    try {
        if (!localStorage.getItem('token') || !S.weights.length) return;
        const lastWt = S.weights[S.weights.length - 1].w;
        await fetch(`${API_BASE}/data/weights`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ weight_kg: lastWt }) });
    } catch (err) { console.error(err); }
}

async function apiSavePeriodRow() {
    try {
        if (!localStorage.getItem('token') || !S.periods.length) return;
        const lastP = S.periods[S.periods.length - 1];
        await fetch(`${API_BASE}/data/periods`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ start_date: lastP.start, duration_days: lastP.days }) });
    } catch (err) { console.error(err); }
}

async function apiSaveDiaryRow() {
    try {
        if (!localStorage.getItem('token') || !S.diaries.length) return;
        const lastD = S.diaries[S.diaries.length - 1];
        await fetch(`${API_BASE}/data/diaries`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ content: lastD.t }) });
    } catch (err) { console.error(err); }
}

async function apiSaveProfile() {
    try {
        if (!localStorage.getItem('token')) return;
        const body = {
            weight_kg: S.initWeight,
            goal_weight_kg: S.goalWeight,
            goal_months: S.goalMonths,
            daily_kcal_target: S.goalCal,
            cycle_len: S.cycleLen
        };
        await fetch(`${API_BASE}/data/profiles`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(body) });
    } catch (err) { console.error(err); }
}

// User requested exact function names sync:
const saveMeal = apiSaveMeal;
const saveChecks = apiSaveChecks;
const saveWeightRow = apiSaveWeightRow;
const savePeriodRow = apiSavePeriodRow;
const saveDiaryRow = apiSaveDiaryRow;
const saveProfile = apiSaveProfile;
// Note: saveWorkout is NOT exported directly to global window under the same name yet without collision. We'll inject `apiSave...()` in existing js.
