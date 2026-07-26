// 2주치 예시 식단·혈당 기록 — GMODEL(BELLAMONA_혈당예측모델_개발명세서.md §4)로 실시간 계산해 보여주기 위한 원본 데이터.
// 아직 연속혈당측정기(CGM) 기록이 없는 사용자를 위해 "이렇게 2주간 기록하면 이런 예측을 볼 수 있다"를
// 보여주는 예시(가상) 데이터다. bgPre/bg1h/bg2h는 실제 CGM 임상값이 아니라, 각 식사의 탄수화물·GI·지방/단백질
// 구성에 따른 전형적인 식후혈당 반응 패턴(참고 논문: Zeevi et al. — 개인/음식별 반응 변이,
// Liu et al. — 식사 흡수+운동 반영, van Doorn et al. — 활동량 반영 CGM 예측)을 참고해 저속노화팀이
// 수기로 구성한 예시치다. food 객체는 index.html의 FDB와 동일한 규격: c/p/f = 100g당 g, gi = 혈당지수,
// g = 실제 섭취량(g). meal 객체는 S.meals와 동일 규격이라 GMODEL.predict()/makeTrainingPair()에 그대로 전달된다.
const GLUCOSE_EXAMPLE_DAYS = [
  { date: '04/08', cyclePhase: 'follicular', meals: [
    { label: '아침', time: '07:30', bgPre: 88, bg1h: 118, bg2h: 96, workoutPost: false, foods: [
      { food: { n: '오트밀', c: 12, p: 2.4, f: 1.4, gi: 55 }, g: 200 },
      { food: { n: '삶은계란', c: 1.1, p: 13, f: 11, gi: 0 }, g: 60 } ] },
    { label: '점심', time: '12:30', bgPre: 92, bg1h: 152, bg2h: 108, workoutPost: false, foods: [
      { food: { n: '백미밥', c: 28.5, p: 2.1, f: 0.3, gi: 72 }, g: 210 },
      { food: { n: '제육볶음(저당)', c: 6, p: 20, f: 12, gi: 40 }, g: 150 } ] },
    { label: '저녁', time: '19:00', bgPre: 90, bg1h: 128, bg2h: 98, workoutPost: true, foods: [
      { food: { n: '닭가슴살', c: 0, p: 23, f: 1.2, gi: 0 }, g: 120 },
      { food: { n: '현미밥', c: 23.5, p: 2.5, f: 0.8, gi: 55 }, g: 140 } ] } ] },
  { date: '04/09', cyclePhase: 'follicular', meals: [
    { label: '아침', time: '07:40', bgPre: 86, bg1h: 108, bg2h: 90, workoutPost: false, foods: [
      { food: { n: '그릭요거트', c: 3.6, p: 10, f: 0.4, gi: 11 }, g: 170 },
      { food: { n: '블루베리', c: 14.5, p: 0.7, f: 0.3, gi: 25 }, g: 100 } ] },
    { label: '점심', time: '12:20', bgPre: 91, bg1h: 165, bg2h: 112, workoutPost: false, foods: [
      { food: { n: '김밥', c: 29.2, p: 6, f: 5.2, gi: 65 }, g: 250 },
      { food: { n: '떡볶이', c: 28, p: 3.6, f: 2, gi: 72 }, g: 100 } ] },
    { label: '저녁', time: '18:50', bgPre: 89, bg1h: 122, bg2h: 95, workoutPost: false, foods: [
      { food: { n: '연어', c: 0, p: 20, f: 13, gi: 0 }, g: 120 },
      { food: { n: '브로콜리', c: 6.6, p: 2.8, f: 0.4, gi: 10 }, g: 100 } ] } ] },
  { date: '04/10', cyclePhase: 'follicular', meals: [
    { label: '아침', time: '07:25', bgPre: 87, bg1h: 112, bg2h: 92, workoutPost: false, foods: [
      { food: { n: '통밀빵', c: 41, p: 9, f: 3.4, gi: 51 }, g: 60 },
      { food: { n: '아보카도', c: 9, p: 2, f: 15, gi: 10 }, g: 75 } ] },
    { label: '점심', time: '12:35', bgPre: 90, bg1h: 148, bg2h: 104, workoutPost: false, foods: [
      { food: { n: '비빔밥', c: 18.2, p: 4, f: 2.2, gi: 60 }, g: 450 } ] },
    { label: '저녁', time: '19:10', bgPre: 91, bg1h: 130, bg2h: 100, workoutPost: true, foods: [
      { food: { n: '두부', c: 1.7, p: 8.1, f: 4.2, gi: 15 }, g: 300 },
      { food: { n: '시금치', c: 3.6, p: 2.9, f: 0.4, gi: 15 }, g: 70 } ] } ] },
  { date: '04/11', cyclePhase: 'follicular', meals: [
    { label: '아침', time: '07:30', bgPre: 89, bg1h: 116, bg2h: 94, workoutPost: false, foods: [
      { food: { n: '오트밀', c: 12, p: 2.4, f: 1.4, gi: 55 }, g: 200 } ] },
    { label: '점심', time: '12:30', bgPre: 92, bg1h: 172, bg2h: 118, workoutPost: false, foods: [
      { food: { n: '짜장면', c: 25, p: 6, f: 8, gi: 65 }, g: 500 } ] },
    { label: '저녁', time: '18:40', bgPre: 93, bg1h: 126, bg2h: 99, workoutPost: false, foods: [
      { food: { n: '고등어', c: 0, p: 19, f: 12, gi: 0 }, g: 100 },
      { food: { n: '양배추', c: 5.8, p: 1.3, f: 0.1, gi: 10 }, g: 80 } ] } ] },
  { date: '04/12', cyclePhase: 'ovulation', meals: [
    { label: '아침', time: '08:00', bgPre: 90, bg1h: 120, bg2h: 96, workoutPost: false, foods: [
      { food: { n: '계란', c: 0.8, p: 12.4, f: 9.8, gi: 0 }, g: 120 },
      { food: { n: '고구마', c: 20.1, p: 1.6, f: 0.1, gi: 44 }, g: 130 } ] },
    { label: '점심', time: '13:00', bgPre: 93, bg1h: 158, bg2h: 110, workoutPost: false, foods: [
      { food: { n: '파스타', c: 26, p: 5.6, f: 3.2, gi: 60 }, g: 250 } ] },
    { label: '저녁', time: '19:20', bgPre: 91, bg1h: 132, bg2h: 100, workoutPost: true, foods: [
      { food: { n: '스테이크', c: 0, p: 26, f: 16, gi: 0 }, g: 200 },
      { food: { n: '샐러드(그린)', c: 3.5, p: 1.5, f: 0.5, gi: 10 }, g: 150 } ] } ] },
  { date: '04/13', cyclePhase: 'ovulation', meals: [
    { label: '아침', time: '07:45', bgPre: 88, bg1h: 114, bg2h: 93, workoutPost: false, foods: [
      { food: { n: '그릭요거트', c: 3.6, p: 10, f: 0.4, gi: 11 }, g: 170 },
      { food: { n: '아몬드', c: 22, p: 21, f: 50, gi: 15 }, g: 20 } ] },
    { label: '점심', time: '12:40', bgPre: 94, bg1h: 175, bg2h: 122, workoutPost: false, foods: [
      { food: { n: '초밥세트', c: 24, p: 7, f: 2, gi: 62 }, g: 350 } ] },
    { label: '저녁', time: '18:30', bgPre: 92, bg1h: 129, bg2h: 99, workoutPost: false, foods: [
      { food: { n: '순두부찌개', c: 5, p: 10, f: 8, gi: 20 }, g: 350 },
      { food: { n: '현미밥', c: 23.5, p: 2.5, f: 0.8, gi: 55 }, g: 100 } ] } ] },
  { date: '04/14', cyclePhase: 'ovulation', meals: [
    { label: '아침', time: '08:10', bgPre: 91, bg1h: 122, bg2h: 97, workoutPost: false, foods: [
      { food: { n: '통밀빵', c: 41, p: 9, f: 3.4, gi: 51 }, g: 60 },
      { food: { n: '삶은계란', c: 1.1, p: 13, f: 11, gi: 0 }, g: 60 } ] },
    { label: '점심', time: '12:50', bgPre: 95, bg1h: 168, bg2h: 116, workoutPost: false, foods: [
      { food: { n: '피자(한조각)', c: 33, p: 12, f: 11, gi: 60 }, g: 300 } ] },
    { label: '저녁', time: '19:00', bgPre: 93, bg1h: 134, bg2h: 101, workoutPost: true, foods: [
      { food: { n: '닭가슴살', c: 0, p: 23, f: 1.2, gi: 0 }, g: 150 },
      { food: { n: '브로콜리', c: 6.6, p: 2.8, f: 0.4, gi: 10 }, g: 100 } ] } ] },
  { date: '04/15', cyclePhase: 'luteal', meals: [
    { label: '아침', time: '07:35', bgPre: 93, bg1h: 132, bg2h: 104, workoutPost: false, foods: [
      { food: { n: '오트밀', c: 12, p: 2.4, f: 1.4, gi: 55 }, g: 200 },
      { food: { n: '바나나', c: 23, p: 1.1, f: 0.3, gi: 51 }, g: 60 } ] },
    { label: '점심', time: '12:30', bgPre: 96, bg1h: 178, bg2h: 126, workoutPost: false, foods: [
      { food: { n: '백미밥', c: 28.5, p: 2.1, f: 0.3, gi: 72 }, g: 210 },
      { food: { n: '불고기', c: 8, p: 22, f: 11, gi: 30 }, g: 150 } ] },
    { label: '저녁', time: '18:45', bgPre: 94, bg1h: 138, bg2h: 106, workoutPost: false, foods: [
      { food: { n: '두부', c: 1.7, p: 8.1, f: 4.2, gi: 15 }, g: 300 } ] } ] },
  { date: '04/16', cyclePhase: 'luteal', meals: [
    { label: '아침', time: '07:50', bgPre: 92, bg1h: 128, bg2h: 101, workoutPost: false, foods: [
      { food: { n: '그릭요거트', c: 3.6, p: 10, f: 0.4, gi: 11 }, g: 170 },
      { food: { n: '딸기', c: 7.7, p: 0.7, f: 0.3, gi: 40 }, g: 100 } ] },
    { label: '점심', time: '12:45', bgPre: 97, bg1h: 190, bg2h: 132, workoutPost: false, foods: [
      { food: { n: '떡볶이', c: 28, p: 3.6, f: 2, gi: 72 }, g: 250 },
      { food: { n: '초콜릿', c: 60, p: 5, f: 31, gi: 49 }, g: 20 } ] },
    { label: '저녁', time: '19:15', bgPre: 95, bg1h: 140, bg2h: 108, workoutPost: true, foods: [
      { food: { n: '고등어', c: 0, p: 19, f: 12, gi: 0 }, g: 100 },
      { food: { n: '시금치', c: 3.6, p: 2.9, f: 0.4, gi: 15 }, g: 70 } ] } ] },
  { date: '04/17', cyclePhase: 'luteal', meals: [
    { label: '아침', time: '07:30', bgPre: 94, bg1h: 130, bg2h: 103, workoutPost: false, foods: [
      { food: { n: '계란', c: 0.8, p: 12.4, f: 9.8, gi: 0 }, g: 120 },
      { food: { n: '통밀빵', c: 41, p: 9, f: 3.4, gi: 51 }, g: 30 } ] },
    { label: '점심', time: '12:20', bgPre: 96, bg1h: 172, bg2h: 122, workoutPost: false, foods: [
      { food: { n: '김밥', c: 29.2, p: 6, f: 5.2, gi: 65 }, g: 250 } ] },
    { label: '저녁', time: '18:50', bgPre: 93, bg1h: 136, bg2h: 104, workoutPost: false, foods: [
      { food: { n: '연어', c: 0, p: 20, f: 13, gi: 0 }, g: 120 },
      { food: { n: '양배추', c: 5.8, p: 1.3, f: 0.1, gi: 10 }, g: 80 } ] } ] },
  { date: '04/18', cyclePhase: 'luteal', meals: [
    { label: '아침', time: '07:40', bgPre: 92, bg1h: 124, bg2h: 99, workoutPost: false, foods: [
      { food: { n: '오트밀', c: 12, p: 2.4, f: 1.4, gi: 55 }, g: 200 } ] },
    { label: '점심', time: '12:30', bgPre: 98, bg1h: 195, bg2h: 136, workoutPost: false, foods: [
      { food: { n: '짬뽕', c: 20, p: 8, f: 6, gi: 68 }, g: 500 },
      { food: { n: '아이스크림', c: 23.6, p: 3.5, f: 11, gi: 61 }, g: 100 } ] },
    { label: '저녁', time: '19:05', bgPre: 96, bg1h: 142, bg2h: 108, workoutPost: true, foods: [
      { food: { n: '닭가슴살', c: 0, p: 23, f: 1.2, gi: 0 }, g: 150 },
      { food: { n: '샐러드(그린)', c: 3.5, p: 1.5, f: 0.5, gi: 10 }, g: 150 } ] } ] },
  { date: '04/19', cyclePhase: 'luteal', meals: [
    { label: '아침', time: '07:35', bgPre: 91, bg1h: 120, bg2h: 97, workoutPost: false, foods: [
      { food: { n: '그릭요거트', c: 3.6, p: 10, f: 0.4, gi: 11 }, g: 170 },
      { food: { n: '아몬드', c: 22, p: 21, f: 50, gi: 15 }, g: 20 } ] },
    { label: '점심', time: '12:40', bgPre: 95, bg1h: 168, bg2h: 118, workoutPost: false, foods: [
      { food: { n: '현미밥', c: 23.5, p: 2.5, f: 0.8, gi: 55 }, g: 210 },
      { food: { n: '제육볶음(저당)', c: 6, p: 20, f: 12, gi: 40 }, g: 150 } ] },
    { label: '저녁', time: '18:55', bgPre: 93, bg1h: 132, bg2h: 102, workoutPost: false, foods: [
      { food: { n: '두부', c: 1.7, p: 8.1, f: 4.2, gi: 15 }, g: 300 },
      { food: { n: '브로콜리', c: 6.6, p: 2.8, f: 0.4, gi: 10 }, g: 100 } ] } ] },
  { date: '04/20', cyclePhase: 'luteal', meals: [
    { label: '아침', time: '07:30', bgPre: 90, bg1h: 118, bg2h: 96, workoutPost: false, foods: [
      { food: { n: '계란', c: 0.8, p: 12.4, f: 9.8, gi: 0 }, g: 120 },
      { food: { n: '아보카도', c: 9, p: 2, f: 15, gi: 10 }, g: 75 } ] },
    { label: '점심', time: '12:30', bgPre: 94, bg1h: 176, bg2h: 124, workoutPost: false, foods: [
      { food: { n: '비빔밥', c: 18.2, p: 4, f: 2.2, gi: 60 }, g: 450 } ] },
    { label: '저녁', time: '19:00', bgPre: 92, bg1h: 134, bg2h: 102, workoutPost: true, foods: [
      { food: { n: '연어', c: 0, p: 20, f: 13, gi: 0 }, g: 120 },
      { food: { n: '시금치', c: 3.6, p: 2.9, f: 0.4, gi: 15 }, g: 70 } ] } ] },
  { date: '04/21', cyclePhase: 'menstrual', meals: [
    { label: '아침', time: '07:45', bgPre: 89, bg1h: 114, bg2h: 93, workoutPost: false, foods: [
      { food: { n: '오트밀', c: 12, p: 2.4, f: 1.4, gi: 55 }, g: 200 },
      { food: { n: '블루베리', c: 14.5, p: 0.7, f: 0.3, gi: 25 }, g: 100 } ] },
    { label: '점심', time: '12:35', bgPre: 91, bg1h: 150, bg2h: 106, workoutPost: false, foods: [
      { food: { n: '현미밥', c: 23.5, p: 2.5, f: 0.8, gi: 55 }, g: 210 },
      { food: { n: '닭가슴살', c: 0, p: 23, f: 1.2, gi: 0 }, g: 120 } ] },
    { label: '저녁', time: '18:40', bgPre: 90, bg1h: 124, bg2h: 96, workoutPost: false, foods: [
      { food: { n: '순두부찌개', c: 5, p: 10, f: 8, gi: 20 }, g: 350 } ] } ] },
];

/* 참고 논문(방법론적 근거로만 인용; 본 데이터의 수치는 실측치가 아닌 예시임) */
const GLUCOSE_EXAMPLE_REFS = [
  'Zeevi D, et al. "Personalized Nutrition by Prediction of Glycemic Responses." (개인·음식별 혈당 반응 변이가 크다는 근거 — 규칙 기반 예측에 개인화 단계가 필요한 이유)',
  'Liu J, et al. "Enhancing Blood Glucose Prediction with Meal Absorption and Physical Exercise Information." (식사 흡수 속도·운동 정보가 혈당 반응 예측을 개선한다는 근거)',
  'van Doorn W, et al. "Machine learning-based glucose prediction with use of continuous glucose and physical activity monitoring data: The Maastricht Study." (CGM + 활동량 데이터를 결합한 예측 모델링 근거)',
];
