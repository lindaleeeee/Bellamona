// 테스트용 가짜 기록(2026년 10월 한 달) 넣기 / 지우기
//
// 사용법(로그인한 상태에서 주소창에):
//   bellamona.net/home?demo=seed   → 10월 1~31일 기록을 내 계정에 넣는다
//   bellamona.net/home?demo=clear  → 이 기능으로 넣은 기록만 지운다(직접 입력한 기록은 그대로)
//
// 음식별 식후 혈당 반응은 실제 연속혈당측정기 기록 화면을 참고해 만든 예시다
// (참치김밥, 카이센동, 스시는 크게 오르고 장어덮밥, 가라아게정식, 닭가슴살 샐러드는 안정적).
// 넣은 문서에는 모두 seed 필드를 붙여 나중에 이것만 골라 지울 수 있게 한다.
// 이미 그 날짜에 직접 입력한 식사, 수면, 일기, 루틴 체크가 있으면 덮어쓰지 않고 건너뛴다.

const DEMO_SEED_TAG = 'demo-2026-10';
const DEMO_MONTH = { y: 2026, m: 10 };

// 식사 메뉴: foods 각 항목 [이름, 이모지, g, kcal, 탄수, 단백, 지방, GI], rise = 식후 상승 폭 범위(mg/dL)
const DEMO_MENUS = {
  아침: [
    { d: '그릭요거트볼', foods: [['그릭요거트 (무가당)', '🥣', 150, 120, 6, 13, 4.5, 12], ['블루베리', '🫐', 40, 19, 5, 0.2, 0, 53], ['아몬드', '🌰', 10, 59, 2, 2.3, 5, 15]], rise: [12, 22] },
    { d: '삶은 달걀 2개, 아메리카노', foods: [['삶은 달걀', '🥚', 100, 145, 1.4, 13.5, 8.7, 0], ['아메리카노', '☕', 355, 10, 1.7, 0.7, 0, 0]], rise: [4, 10] },
    { d: '버터토스트, 카페라떼', foods: [['식빵', '🍞', 70, 186, 34, 6.3, 2.2, 75], ['버터', '🧈', 8, 57, 0, 0, 6.5, 0], ['카페라떼', '☕', 355, 117, 8.5, 5.7, 5.3, 37]], rise: [55, 70] },
    { d: '오트밀, 바나나', foods: [['귀리(오트밀)', '🥣', 40, 156, 26.5, 6.8, 2.8, 55], ['바나나', '🍌', 100, 77, 20, 1.1, 0.2, 51]], rise: [35, 48] },
  ],
  점심: [
    { d: '참치김밥 외 3개', foods: [['참치김밥', '🍙', 250, 480, 68, 15, 15, 72], ['떡볶이', '🍢', 150, 250, 50, 5, 3, 85], ['어묵국', '🍲', 200, 60, 6, 5, 2, 50], ['단무지', '🥒', 30, 10, 2, 0, 0, 30]], rise: [100, 120] },
    { d: '가라아게정식', foods: [['흰쌀밥', '🍚', 150, 215, 47, 3.9, 0.5, 73], ['가라아게', '🍗', 120, 250, 12, 22, 13, 50], ['양배추 샐러드', '🥗', 50, 15, 3, 0.7, 0, 10]], rise: [22, 38] },
    { d: '장어덮밥', foods: [['흰쌀밥', '🍚', 200, 286, 63, 5.2, 0.6, 73], ['장어구이', '🐟', 130, 380, 8, 28, 26, 40], ['장국', '🍲', 150, 50, 4, 3, 1, 30]], rise: [24, 40] },
    { d: '비빔밥', foods: [['비빔밥', '🍚', 400, 600, 92, 18, 16, 68]], rise: [50, 68] },
    { d: '김치찌개, 공기밥', foods: [['김치찌개', '🍲', 350, 230, 10, 15, 14, 30], ['흰쌀밥', '🍚', 210, 300, 66, 5.5, 0.6, 73]], rise: [55, 75] },
    { d: '닭가슴살 샌드위치', foods: [['샌드위치 닭가슴살', '🥪', 220, 420, 45, 28, 13, 60], ['아메리카노', '☕', 355, 10, 1.7, 0.7, 0, 0]], rise: [42, 58] },
    { d: '제육덮밥', foods: [['제육덮밥', '🍚', 400, 750, 98, 28, 25, 72]], rise: [70, 90] },
    { d: '연어 포케', foods: [['연어 포케', '🥗', 350, 520, 55, 30, 18, 45]], rise: [28, 42] },
  ],
  저녁: [
    { d: '닭가슴살샐러드 외 2개', foods: [['닭가슴살 샐러드', '🥗', 250, 203, 8, 30, 5, 10], ['후무스', '🫘', 60, 177, 8.5, 4.7, 14, 25], ['호밀빵', '🍞', 25, 65, 12, 2.1, 0.8, 55]], rise: [20, 30] },
    { d: '츠지한 카이센동', foods: [['초밥용 밥', '🍚', 230, 330, 72, 6, 0.6, 80], ['해산물 회', '🐟', 120, 170, 0, 30, 5, 0], ['연어알', '🟠', 20, 50, 0.5, 6, 2.8, 0]], rise: [100, 120] },
    { d: '스시세트 외 1개', foods: [['초밥 모둠', '🍣', 300, 480, 80, 25, 5, 75], ['미소된장국', '🍲', 200, 50, 5, 3, 2, 30], ['맥주', '🍺', 200, 86, 7.2, 1, 0, 66]], rise: [80, 95] },
    { d: '삼겹살, 된장찌개, 공기밥', foods: [['구운 삼겹살', '🥓', 200, 800, 0, 34, 74, 0], ['된장찌개', '🍲', 300, 120, 9, 9, 5, 30], ['흰쌀밥', '🍚', 150, 215, 47, 3.9, 0.5, 73]], rise: [42, 58] },
    { d: '토마토 파스타', foods: [['토마토 파스타', '🍝', 350, 620, 95, 20, 16, 55]], rise: [68, 85] },
    { d: '떡볶이, 순대', foods: [['떡볶이', '🍢', 300, 500, 100, 10, 6, 85], ['순대', '🌭', 150, 280, 40, 10, 8, 60]], rise: [100, 118] },
    { d: '연어 스테이크 샐러드', foods: [['연어구이', '🐟', 150, 330, 0, 33, 21, 0], ['채소 샐러드', '🥗', 150, 30, 6, 2, 0.3, 10], ['현미밥', '🍚', 100, 140, 30.5, 3, 1, 66]], rise: [25, 36] },
    { d: '후라이드치킨, 맥주', foods: [['후라이드치킨', '🍗', 240, 677, 18, 59, 41, 50], ['맥주', '🍺', 500, 215, 18, 2.5, 0, 66]], rise: [40, 56] },
  ],
  간식: [
    { d: '랑그드샤 화이트', foods: [['랑그드샤 화이트', '🍪', 30, 160, 18, 1.5, 9, 60]], rise: [30, 45] },
    { d: '바나나', foods: [['바나나', '🍌', 120, 92, 24, 1.3, 0.2, 51]], rise: [32, 45] },
    { d: '하루견과', foods: [['하루견과', '🥜', 25, 150, 4.5, 4.5, 12.5, 20]], rise: [3, 8] },
    { d: '바닐라 라떼', foods: [['바닐라 라떼', '☕', 355, 195, 21.6, 6, 5.3, 55]], rise: [35, 50] },
  ],
  야식: [
    { d: '에비스 생맥주 외 1개', foods: [['맥주', '🍺', 250, 108, 9, 1.3, 0, 66], ['풋콩 (에다마메)', '🫛', 40, 48, 3.6, 4.8, 2, 18]], rise: [8, 15] },
    { d: '라면', foods: [['라면', '🍜', 500, 500, 78, 10, 16, 73]], rise: [85, 100] },
  ],
};

const DEMO_DIARIES = {
  good: ['운동하고 나니 개운하고 뿌듯했다.', '잘 자서 하루 종일 몸이 가벼웠다. 기분 좋음', '점심 먹고 10분 걸었더니 오후에 덜 졸렸다. 만족', '친구랑 통화해서 즐거웠다. 오늘은 여유 있는 하루', '아침에 요거트 먹고 출근. 상쾌하게 시작했다'],
  bad: ['잠을 설쳐서 하루 종일 피곤하고 예민했다.', '야식 먹고 후회. 속이 답답하다', '회의가 길어서 스트레스. 점심도 대충 먹었다', '오후에 너무 졸리고 무기력했다', '단 게 계속 당겨서 걱정이다'],
  period: ['생리 시작. 몸이 붓고 무기력하다', '배가 아프고 피곤해서 일찍 누웠다', '생리 중이라 예민하고 단 게 당긴다'],
};

function _demoRng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function _demoHHMM(min) { min = Math.round(min); return `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`; }

// 10월 한 달 기록을 만든다(Firestore에 쓰지 않고 객체만). 같은 결과가 나오도록 고정 시드 사용.
function buildDemoOctober(opts = {}) {
  const rnd = _demoRng(20261031);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const range = (a, b) => a + rnd() * (b - a);
  const days = new Date(DEMO_MONTH.y, DEMO_MONTH.m, 0).getDate();
  const iso = d => `${DEMO_MONTH.y}-${String(DEMO_MONTH.m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const supplements = opts.supplementIds || [];
  const startW = opts.startWeight || 60;
  const out = { meals: [], workouts: [], sleep: [], checks: [], diaries: [], weights: [], periods: [{ start_date: '2026-09-08', duration_days: 5 }, { start_date: '2026-10-06', duration_days: 5 }] };
  let prevLate = false;
  for (let d = 1; d <= days; d++) {
    const date = iso(d);
    const wd = new Date(DEMO_MONTH.y, DEMO_MONTH.m - 1, d).getDay();
    const weekend = wd === 0 || wd === 6;
    const menstrual = d >= 6 && d <= 10;
    const luteal = d <= 5 || d >= 25; // 9/8, 10/6 시작 기준 황체기 무렵
    // 수면(전날 밤): 늦게 먹은 다음 날은 덜 잔다
    const wake = (weekend ? 9 * 60 : 7 * 60) + range(-30, 30);
    const hours = Math.max(4.8, Math.min(8.8, 7.1 + range(-0.7, 0.7) - (prevLate ? 1.1 : 0) - (menstrual ? 0.4 : 0)));
    out.sleep.push({ log_date: date, bedtime: _demoHHMM(wake - hours * 60 + 1440), wake_time: _demoHHMM(wake), hours: Math.round(hours * 10) / 10 });
    const poorSleep = hours < 6.3;

    // 운동: 저녁 식후 걷기 / 아침 조깅 / 근력
    const r = rnd();
    const walkAfterDinner = r < 0.32;
    const jog = !walkAfterDinner && r < 0.5 && !menstrual;
    const hiit = !walkAfterDinner && !jog && r < 0.6 && !menstrual;

    // 식사
    const meals = [];
    if (rnd() < (weekend ? 0.3 : 0.45)) meals.push(['아침', (weekend ? 9.5 * 60 : 8 * 60) + range(-20, 30)]);
    meals.push(['점심', 12 * 60 + range(-10, 100)]);
    const late = rnd() < (weekend ? 0.4 : 0.25);
    meals.push(['저녁', late ? 20.5 * 60 + range(0, 50) : 18.8 * 60 + range(0, 70)]);
    if (rnd() < (luteal ? 0.7 : 0.35)) meals.push(['간식', 15.5 * 60 + range(0, 60)]);
    const yasik = rnd() < (weekend ? 0.3 : 0.12) + (luteal ? 0.1 : 0);
    if (yasik) meals.push(['야식', 22 * 60 + range(0, 60)]);
    let lastMeal = 0;
    meals.forEach(([label, t]) => {
      // 주말 저녁은 기름진/탄수 많은 메뉴, 평일 저녁은 가벼운 메뉴가 조금 더 자주
      let pool = DEMO_MENUS[label];
      if (label === '저녁') pool = weekend ? pool.filter((_, i) => [1, 2, 3, 5, 7].includes(i)) : pool;
      const menu = pick(pool);
      const pre = Math.round(range(84, 97));
      let rise = range(menu.rise[0], menu.rise[1]);
      if (label === '저녁' && walkAfterDinner) rise *= 0.62;  // 식후 걷기 효과
      if (poorSleep) rise *= 1.15;                            // 잠 못 잔 날은 조금 더 오름
      const peak = Math.round(pre + rise);
      const foods = menu.foods.map(([n, e, g, kcal, c, p, f, gi]) => ({ n, e, g, kcal, c, p, f, sugar: 0, fiber: 0, na: 0, gi }));
      const kcal = foods.reduce((a, f) => a + f.kcal, 0);
      out.meals.push({ eaten_date: date, label, time: _demoHHMM(t), description: menu.d, foods, kcal, bg_pre: pre, bg_1h: peak, bg_2h: Math.round(pre + rise * 0.18 + range(-4, 4)) });
      lastMeal = Math.max(lastMeal, t);
    });
    prevLate = late || yasik;

    // 운동 기록
    const dinnerT = meals.find(m => m[0] === '저녁')[1];
    if (walkAfterDinner) out.workouts.push({ performed_date: date, logged_time: _demoHHMM(dinnerT + 15), intensity: 'low', duration_min: 20, exercise_type: '식후 걷기', kcal: 80 });
    if (jog) out.workouts.push({ performed_date: date, logged_time: _demoHHMM(7 * 60 + range(-20, 20)), intensity: 'medium', duration_min: 30, exercise_type: '조깅', kcal: 240 });
    if (hiit) out.workouts.push({ performed_date: date, logged_time: _demoHHMM(19.5 * 60), intensity: 'high', duration_min: 25, exercise_type: '근력운동', kcal: 230 });

    // 일기
    let diary = null;
    if (rnd() < 0.75) {
      const mood = menstrual ? 'period' : (poorSleep || yasik || (luteal && rnd() < 0.5)) ? 'bad' : (walkAfterDinner || jog || hiit || hours >= 7 ? 'good' : pick(['good', 'bad']));
      diary = pick(DEMO_DIARIES[mood]);
      out.diaries.push({ written_date: date, content: diary });
    }

    // 루틴 체크
    const hasBreakfast = meals.some(m => m[0] === '아침');
    const checks = {
      i1: !hasBreakfast && lastMeal <= 20 * 60, i2: walkAfterDinner, i3: rnd() < 0.5, i4: true,
      g1: walkAfterDinner, g2: jog, g3: hiit,
      c1: true, c2: rnd() < 0.3, c3: !!diary, c4: rnd() < 0.4,
    };
    supplements.forEach(id => { checks[id] = rnd() < 0.7; });
    out.checks.push({ check_date: date, checks });

    // 체중: 이틀에 한 번쯤, 서서히 감소 + 황체기 붓기
    if (d === 1 || rnd() < 0.5) {
      const w = startW - 0.025 * (d - 1) + (luteal && d > 20 ? 0.4 : 0) + range(-0.25, 0.25);
      out.weights.push({ logged_date: date, weight_kg: Math.round(w * 10) / 10 });
    }
  }
  return out;
}

async function seedDemoOctober() {
  if (typeof FB === 'undefined' || !FB || typeof _uid !== 'function' || !_uid()) throw new Error('로그인 후에 실행해 주세요');
  const supplementIds = (typeof S !== 'undefined' && S.routines && S.routines.oxytocin || []).map(r => r.id);
  const startWeight = typeof S !== 'undefined' && S.initWeight ? Number(S.initWeight) : 60;
  await clearDemoSeed(); // 두 번 실행해도 운동, 체중이 중복되지 않게 이전 테스트 기록부터 지운다
  const data = buildDemoOctober({ supplementIds, startWeight });
  const tag = { seed: DEMO_SEED_TAG };
  const [mS, sS, cS, dS, pS] = await Promise.all([
    _sub('meals').where('eaten_date', '>=', '2026-10-01').get(),
    _sub('sleep_logs').where('log_date', '>=', '2026-10-01').get(),
    _sub('routine_checks').where('check_date', '>=', '2026-10-01').get(),
    _sub('diaries').where('written_date', '>=', '2026-10-01').get(),
    _sub('periods').get(),
  ]);
  const has = snap => new Set(snap.docs.map(d => d.id));
  const mealIds = has(mS), sleepIds = has(sS), checkIds = has(cS), diaryIds = has(dS);
  const periodStarts = new Set(pS.docs.map(d => d.data().start_date));
  const ops = [];
  data.meals.forEach(m => {
    const id = `${m.eaten_date}_${encodeURIComponent(m.label)}`;
    if (mealIds.has(id)) return;
    ops.push([_sub('meals').doc(id), { ...m, foods: JSON.stringify(m.foods), ai_estimate: null, ...tag }]);
  });
  data.sleep.forEach(s => { if (!sleepIds.has(s.log_date)) ops.push([_sub('sleep_logs').doc(s.log_date), { ...s, ...tag }]); });
  data.checks.forEach(c => { if (!checkIds.has(c.check_date)) ops.push([_sub('routine_checks').doc(c.check_date), { ...c, ...tag }]); });
  data.diaries.forEach(x => { if (!diaryIds.has(x.written_date)) ops.push([_sub('diaries').doc(x.written_date), { ...x, ...tag }]); });
  data.workouts.forEach(w => ops.push([_sub('workouts').doc(), { ...w, body_part: null, routine_name: null, created_at: Date.now(), ...tag }]));
  data.weights.forEach(w => ops.push([_sub('weights').doc(), { ...w, created_at: new Date(w.logged_date + 'T08:00:00').getTime(), ...tag }]));
  data.periods.forEach(p => { if (!periodStarts.has(p.start_date)) ops.push([_sub('periods').doc(), { ...p, created_at: Date.now(), ...tag }]); });
  for (let i = 0; i < ops.length; i += 400) {
    const b = FB.db.batch();
    ops.slice(i, i + 400).forEach(([ref, d]) => b.set(ref, d));
    await b.commit();
  }
  try { _checkDates = null; _histCache = null; } catch (e) { /* 캐시 없음 */ }
  return ops.length;
}

async function clearDemoSeed() {
  if (typeof FB === 'undefined' || !FB || typeof _uid !== 'function' || !_uid()) throw new Error('로그인 후에 실행해 주세요');
  let n = 0;
  for (const col of ['meals', 'sleep_logs', 'routine_checks', 'diaries', 'workouts', 'weights', 'periods', 'reports']) {
    const snap = await _sub(col).where('seed', '==', DEMO_SEED_TAG).get();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const b = FB.db.batch();
      snap.docs.slice(i, i + 400).forEach(d => b.delete(d.ref));
      await b.commit();
    }
    n += snap.size;
  }
  try { _checkDates = null; _histCache = null; } catch (e) { /* 캐시 없음 */ }
  return n;
}

// 주소에 ?demo=seed / ?demo=clear 가 있으면 확인 후 실행
(function () {
  if (typeof window === 'undefined' || !window.location) return;
  const mode = new URLSearchParams(location.search).get('demo');
  if (mode !== 'seed' && mode !== 'clear') return;
  const done = () => { const u = new URL(location.href); u.searchParams.delete('demo'); location.replace(u.toString()); };
  window.addEventListener('load', async () => {
    try {
      if (typeof _authReady !== 'undefined') await _authReady;
      await new Promise(r => setTimeout(r, 800)); // 첫 화면 복원이 끝나기를 잠깐 기다림
      if (mode === 'seed') {
        if (!confirm('10월 1~31일 테스트 기록을 내 계정에 넣을까요?\n(직접 입력한 기록이 있는 날짜/끼니는 건너뛰고, 나중에 ?demo=clear 로 이것만 지울 수 있어요)')) return done();
        const n = await seedDemoOctober();
        alert(`테스트 기록 ${n}건을 넣었어요. 캘린더에서 10월 31일을 눌러 보세요.`);
      } else {
        if (!confirm('테스트로 넣은 10월 기록만 지울까요? (직접 입력한 기록은 그대로)')) return done();
        const n = await clearDemoSeed();
        alert(`테스트 기록 ${n}건을 지웠어요.`);
      }
    } catch (e) { alert('실패했어요: ' + (e && e.message || e)); }
    done();
  });
})();
