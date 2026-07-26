// 칼로리 구간별 예시 식단 DB — 500~2000kcal, 100kcal 구간(총 15구간)
// 저속노화/저GI 컨셉에 맞춰 아침·점심·저녁·간식 예시를 구성했다. 실제 처방이 아닌 참고용 예시.
// 사용: mealPlanForBucket(kcal) → index.html에서 렌더링 (mod-mealplan)
const MEALPLANS = [
  {
    range: [500, 600], mid: 550,
    breakfast: { items: ['그릭요거트 100g', '블루베리 한줌', '아몬드 5알'], kcal: 135 },
    lunch: { items: ['닭가슴살 100g', '그린샐러드(양상추·오이·토마토)', '발사믹 드레싱'], kcal: 190 },
    dinner: { items: ['두부 1/2모 스테이크', '브로콜리·양배추 찜'], kcal: 165 },
    snack: { items: ['방울토마토 10알'], kcal: 30 },
  },
  {
    range: [600, 700], mid: 650,
    breakfast: { items: ['오트밀 40g(우유 조리)', '바나나 1/2개'], kcal: 160 },
    lunch: { items: ['현미밥 1/2공기', '닭가슴살 100g', '나물 반찬'], kcal: 230 },
    dinner: { items: ['연어 스테이크 100g', '구운 채소(브로콜리·파프리카)'], kcal: 210 },
    snack: { items: ['그릭요거트 소컵'], kcal: 60 },
  },
  {
    range: [700, 800], mid: 750,
    breakfast: { items: ['삶은계란 2개', '통밀빵 1장', '아보카도 1/4개'], kcal: 190 },
    lunch: { items: ['현미밥 2/3공기', '제육볶음(저당 소스) 1/2인분', '쌈채소'], kcal: 290 },
    dinner: { items: ['두부조림 1/2모', '시금치나물', '된장국'], kcal: 210 },
    snack: { items: ['견과류 한줌'], kcal: 60 },
  },
  {
    range: [800, 900], mid: 850,
    breakfast: { items: ['오트밀 50g', '삶은계란 1개', '블루베리 한줌'], kcal: 220 },
    lunch: { items: ['잡곡밥 1공기', '닭가슴살 100g', '샐러드'], kcal: 330 },
    dinner: { items: ['고등어구이 1토막', '나물 2종', '현미밥 1/2공기'], kcal: 240 },
    snack: { items: ['사과 1/2개'], kcal: 50 },
  },
  {
    range: [900, 1000], mid: 950,
    breakfast: { items: ['현미밥 1/2공기', '계란찜', '김치'], kcal: 240 },
    lunch: { items: ['잡곡밥 1공기', '불고기(저당) 100g', '쌈채소·나물'], kcal: 370 },
    dinner: { items: ['두부 1/2모', '순두부찌개', '현미밥 1/2공기'], kcal: 270 },
    snack: { items: ['그릭요거트 + 견과류'], kcal: 70 },
  },
  {
    range: [1000, 1100], mid: 1050,
    breakfast: { items: ['통밀빵 2장', '삶은계란 1개', '아보카도 1/2개'], kcal: 280 },
    lunch: { items: ['현미밥 1공기', '닭가슴살 150g', '나물 반찬 2종'], kcal: 380 },
    dinner: { items: ['소고기 안심구이 100g', '구운 채소', '잡곡밥 1/2공기'], kcal: 300 },
    snack: { items: ['바나나 1개'], kcal: 90 },
  },
  {
    range: [1100, 1200], mid: 1150,
    breakfast: { items: ['오트밀 60g', '그릭요거트', '블루베리'], kcal: 300 },
    lunch: { items: ['잡곡밥 1공기', '제육볶음(저당) 1인분', '쌈채소'], kcal: 420 },
    dinner: { items: ['연어스테이크 120g', '구운 채소', '현미밥 1/2공기'], kcal: 330 },
    snack: { items: ['단백질쉐이크'], kcal: 100 },
  },
  {
    range: [1200, 1300], mid: 1250,
    breakfast: { items: ['통밀빵 2장', '계란후라이 2개', '토마토'], kcal: 330 },
    lunch: { items: ['현미밥 1공기', '불고기(저당) 150g', '나물 2종'], kcal: 450 },
    dinner: { items: ['닭가슴살 150g', '고구마 1개', '샐러드'], kcal: 350 },
    snack: { items: ['견과류 + 다크초콜릿 2칸'], kcal: 120 },
  },
  {
    range: [1300, 1400], mid: 1350,
    breakfast: { items: ['오트밀 60g', '삶은계란 2개', '바나나 1/2개'], kcal: 340 },
    lunch: { items: ['잡곡밥 1공기', '소고기 불고기 150g', '쌈채소·나물'], kcal: 480 },
    dinner: { items: ['고등어구이 1.5토막', '나물 2종', '현미밥 1공기'], kcal: 380 },
    snack: { items: ['그릭요거트 + 견과류 + 과일'], kcal: 150 },
  },
  {
    range: [1400, 1500], mid: 1450,
    breakfast: { items: ['통밀빵 2장', '계란 2개', '아보카도 1/2개', '우유 1잔'], kcal: 400 },
    lunch: { items: ['현미밥 1공기', '제육볶음(저당) 1.2인분', '나물 2종'], kcal: 500 },
    dinner: { items: ['소고기 안심 150g', '구운 채소', '잡곡밥 1공기'], kcal: 400 },
    snack: { items: ['바나나 1개 + 견과류'], kcal: 150 },
  },
  {
    range: [1500, 1600], mid: 1550,
    breakfast: { items: ['오트밀 70g', '그릭요거트', '블루베리', '아몬드'], kcal: 420 },
    lunch: { items: ['잡곡밥 1.2공기', '닭가슴살 200g', '나물 2종·샐러드'], kcal: 520 },
    dinner: { items: ['연어스테이크 150g', '구운 채소', '현미밥 1공기'], kcal: 430 },
    snack: { items: ['단백질쉐이크 + 과일'], kcal: 180 },
  },
  {
    range: [1600, 1700], mid: 1650,
    breakfast: { items: ['통밀빵 2장', '계란 2개', '아보카도', '우유 1잔'], kcal: 440 },
    lunch: { items: ['현미밥 1.2공기', '소고기 불고기 200g', '쌈채소·나물'], kcal: 560 },
    dinner: { items: ['닭가슴살 200g', '고구마 1개', '샐러드'], kcal: 450 },
    snack: { items: ['그릭요거트 + 견과류 + 과일'], kcal: 200 },
  },
  {
    range: [1700, 1800], mid: 1750,
    breakfast: { items: ['오트밀 80g', '삶은계란 2개', '바나나', '아몬드'], kcal: 470 },
    lunch: { items: ['잡곡밥 1.5공기', '제육볶음(저당) 1.5인분', '나물 2종'], kcal: 590 },
    dinner: { items: ['고등어구이 2토막', '나물 2종', '현미밥 1공기'], kcal: 480 },
    snack: { items: ['프로틴바 + 과일'], kcal: 210 },
  },
  {
    range: [1800, 1900], mid: 1850,
    breakfast: { items: ['통밀빵 2장', '계란 2개', '아보카도', '우유', '견과류'], kcal: 500 },
    lunch: { items: ['현미밥 1.5공기', '소고기 불고기 200g', '쌈채소·나물·계란찜'], kcal: 620 },
    dinner: { items: ['연어스테이크 180g', '구운 채소', '잡곡밥 1.2공기'], kcal: 500 },
    snack: { items: ['그릭요거트 + 견과류 + 바나나'], kcal: 230 },
  },
  {
    range: [1900, 2000], mid: 1950,
    breakfast: { items: ['오트밀 90g', '그릭요거트', '삶은계란 1개', '블루베리', '아몬드'], kcal: 520 },
    lunch: { items: ['잡곡밥 1.5공기', '닭가슴살 200g', '소고기 불고기 100g', '나물 2종·샐러드'], kcal: 650 },
    dinner: { items: ['연어스테이크 150g', '두부구이', '구운 채소', '현미밥 1공기'], kcal: 520 },
    snack: { items: ['단백질쉐이크 + 과일 + 견과류'], kcal: 260 },
  },
];

function mealPlanTotal(p) { return p.breakfast.kcal + p.lunch.kcal + p.dinner.kcal + p.snack.kcal; }
function mealPlanForBucket(kcal) {
  const k = Math.max(500, Math.min(1999, Math.round(kcal || 0)));
  const idx = Math.min(MEALPLANS.length - 1, Math.max(0, Math.floor((k - 500) / 100)));
  return MEALPLANS[idx];
}
