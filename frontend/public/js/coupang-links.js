// 재료별 쿠팡 파트너스 링크 (쿠팡 파트너스 → 링크 생성에서 "쿠팡 검색 결과" 주소로 만든 단축 링크)
// 앱의 레시피 화면(app.html)과 레시피 공개 페이지(tools/build_recipe_pages.mjs)가 같이 쓴다.
// 목록에 없는 재료는 기본 링크로 연결된다. 링크를 추가하려면 COUPANG_LINKS에 한 줄 넣으면 된다.
const COUPANG_DEFAULT_LINK = 'https://link.coupang.com/a/cmjENT';
const COUPANG_LINKS = {
  '계란': 'https://link.coupang.com/a/ivF8rp7lZc',
  '양파': 'https://link.coupang.com/a/ivGa4SIv92',
  '알룰로스': 'https://link.coupang.com/a/ivGdhxeCwm',
  '다진 마늘': 'https://link.coupang.com/a/ivGeGaCBwG',
  '간장': 'https://link.coupang.com/a/ivGhL9rLag',
  '참기름': 'https://link.coupang.com/a/ivGi4os01k',
  '올리브유': 'https://link.coupang.com/a/ivGklSMOg8',
  '통깨': 'https://link.coupang.com/a/ivGoJC5hWS',
  '대파': 'https://link.coupang.com/a/ivGqEeVrFY',
  '닭가슴살': 'https://link.coupang.com/a/ivGsH1oqgm',
  '오이': 'https://link.coupang.com/a/ivGtKbqvGC',
  '청양고추': 'https://link.coupang.com/a/ivGuILXDmE',
  '식용유': 'https://link.coupang.com/a/ivGwbfAZ7k',
  '고춧가루': 'https://link.coupang.com/a/ivGxozpbO0',
  '양배추': 'https://link.coupang.com/a/ivGybFnjNc',
  '식초': 'https://link.coupang.com/a/ivGzPgU5u0',
  '두부': 'https://link.coupang.com/a/ivGA6lWVSS',
  '우유': 'https://link.coupang.com/a/ivGB4bis2u',
  '베이킹파우더': 'https://link.coupang.com/a/ivGDnM0TdY',
  '모짜렐라 치즈': 'https://link.coupang.com/a/ivGEC3tySG',
  '당근': 'https://link.coupang.com/a/ivGFBwrmkS',
  '고추장': 'https://link.coupang.com/a/ivGGZR890e',
  '그릭요거트': 'https://link.coupang.com/a/ivGH4zjwT6',
  '김가루': 'https://link.coupang.com/a/ivGI8EmGqG',
  '스테비아': 'https://link.coupang.com/a/ivGKiMxSFM',
  '아몬드 가루': 'https://link.coupang.com/a/ivGLcOWBoW',
  '레몬즙': 'https://link.coupang.com/a/ivGLYYFD3s',
  '굴소스': 'https://link.coupang.com/a/ivGNxUN3FA',
  '바닐라 익스트랙': 'https://link.coupang.com/a/ivGPkoCx0m',
  '버터': 'https://link.coupang.com/a/ivGQAZSW2C',
  '들기름': 'https://link.coupang.com/a/ivGRULpQce',
  '파프리카': 'https://link.coupang.com/a/ivGSYppXLo',
  '꿀': 'https://link.coupang.com/a/ivGX75oGsK',
  '코코아 파우더': 'https://link.coupang.com/a/ivG24bRr3Y',
  '마늘': 'https://link.coupang.com/a/ivG4guD0gK',
  '방울토마토': 'https://link.coupang.com/a/ivG49HqaDk',
  '오트밀': 'https://link.coupang.com/a/ivG6ZhQIns',
  '버섯': 'https://link.coupang.com/a/ivG8dHE8Iu',
  '토마토': 'https://link.coupang.com/a/ivG9vrdrLU',
  '애호박': 'https://link.coupang.com/a/ivHaZeCWho',
  '깻잎': 'https://link.coupang.com/a/ivHclsvhGm',
  '시나몬 가루': 'https://link.coupang.com/a/ivHc23efEy',
  '마요네즈': 'https://link.coupang.com/a/ivHfpAUrBI',
  '크림치즈': 'https://link.coupang.com/a/ivHh0cCY6S',
  '토마토소스': 'https://link.coupang.com/a/ivHjJSqo2u',
  '바나나': 'https://link.coupang.com/a/ivHkRoRJrV',
  '파슬리 가루': 'https://link.coupang.com/a/ivHmgzPlKu',
  '양상추': 'https://link.coupang.com/a/ivHnzsGg2u',
  '치킨스톡': 'https://link.coupang.com/a/ivHo6VRyrQ',
  '홍고추': 'https://link.coupang.com/a/ivHpY53Dps',
  '파슬리': 'https://link.coupang.com/a/ivHqURZNNA',
  '김': 'https://link.coupang.com/a/ivHtndPEaa',
  '맛술': 'https://link.coupang.com/a/ivHuKcl8vY',
  '올리고당': 'https://link.coupang.com/a/ivHvSOqaOq',
  '땅콩버터': 'https://link.coupang.com/a/ivHyfhR16O',
  '쪽파': 'https://link.coupang.com/a/ivHzM2mQr6',
  '고구마': 'https://link.coupang.com/a/ivHBN15Bpk',
  '새우': 'https://link.coupang.com/a/ivHCMz4kUL',
  '아보카도': 'https://link.coupang.com/a/ivHGXk7lcW',
  '표고버섯': 'https://link.coupang.com/a/ivHHO6QBky',
};
// 같은 재료의 다른 이름
const COUPANG_ALIAS = {
  '달걀': '계란', '삶은 달걀': '계란', '삶은 계란': '계란', '계란 노른자': '계란', '계란 흰자': '계란', '달걀 노른자': '계란', '달걀 흰자': '계란',
  '다진마늘': '다진 마늘', '올리브 오일': '올리브유', '올리브오일': '올리브유', '엑스트라버진 올리브유': '올리브유',
  '아몬드가루': '아몬드 가루', '토마토 소스': '토마토소스', '시나몬 파우더': '시나몬 가루', '시나몬가루': '시나몬 가루',
  '깨': '통깨', '깨소금': '통깨', '참깨': '통깨', '스테비아 또는 에리스리톨': '스테비아', '무가당 코코아 파우더': '코코아 파우더',
  '김밥용 김': '김', '구운 김': '김', '모짜렐라치즈': '모짜렐라 치즈', '그릭 요거트': '그릭요거트', '파슬리가루': '파슬리 가루',
};
const _CP_UNIT_RE = /\s*(g|kg|ml|cc|L|리터|큰술|작은술|스푼|컵|공기|모|통|개|알|쪽|톨|줄|장|봉|팩|인분|조각|덩이|마리|대|자루|줌|캔|병|약간|조금|정도|이상|이하)\s*$/;
function coupangIngredientName(line) {
  let s = String(line || '').replace(/\([^)]*\)/g, '').trim();
  s = s.replace(/\d+\s*\/\s*\d+|\d+(\.\d+)?/g, '').trim();
  s = s.replace(_CP_UNIT_RE, '').trim();
  s = s.replace(/\s*(한 꼬집|꼬집|한|적당량|T|t)$/, '').trim();
  return s || String(line || '').trim();
}
// 재료 줄 → 파트너스 링크. ① 이름 그대로 ② 다른 이름 ③ 이름 안에 든 재료 중 가장 긴 것(두 글자 이상만, "김치"가 "김"으로 가지 않게)
const _CP_NO_PARTIAL = /새우젓|아보카도오일|두부면|발사믹/;
const _CP_KEYS = Object.keys(COUPANG_LINKS).filter(k => k.length >= 2).sort((a, b) => b.length - a.length);
function coupangLinkFor(line) {
  const n = coupangIngredientName(line);
  const key = COUPANG_LINKS[n] ? n : COUPANG_ALIAS[n];
  if (key && COUPANG_LINKS[key]) return COUPANG_LINKS[key];
  const compact = n.replace(/\s+/g, '');
  if (_CP_NO_PARTIAL.test(compact)) return COUPANG_DEFAULT_LINK; // 이름에 재료가 들어 있어도 다른 상품인 경우
  const hit = _CP_KEYS.find(k => compact.includes(k.replace(/\s+/g, '')));
  return hit ? COUPANG_LINKS[hit] : COUPANG_DEFAULT_LINK;
}
