// 레시피 카테고리를 9개로 통일한다: 한식, 중식, 아시안, 양식, 샐러드, 샌드위치, 에피타이저, 디저트, 음료
// 구글시트/엑셀의 카테고리 칸에는 "달콤·고소", "10", "정보", "디저트"처럼 맛이나 잡다한 값이 섞여 있어서
// ① 이미 9개 중 하나면 그대로 ② 알려진 값은 매핑 ③ 그 외에는 음식 이름과 재료 키워드로 분류 ④ 끝까지 모르면 한식.
// 원래 값은 r.tp0에 남겨 둔다(식사 추천에서 디저트 구분 등에 사용).
const RECIPE_CATS = ['한식', '중식', '아시안', '양식', '샐러드', '샌드위치', '에피타이저', '디저트', '음료'];
const RECIPE_CAT_EMOJI = { '한식': '🍚', '중식': '🥡', '아시안': '🍜', '양식': '🍝', '샐러드': '🥗', '샌드위치': '🥪', '에피타이저': '🥟', '디저트': '🍰', '음료': '🥤' };
const _RECIPE_CAT_MAP = {
  '일식': '아시안', '동남아식': '아시안', '아시안': '아시안', '베트남': '아시안', '태국': '아시안',
  '이탈리안': '양식', '프렌치': '양식', '멕시칸': '양식', '브런치': '양식', '퓨전': '양식', '양식': '양식',
  '디저트': '디저트', '간식': '에피타이저', '에피타이저': '에피타이저',
};
// 이름/재료 키워드 (위에서부터 먼저 맞는 것)
const _RECIPE_CAT_RULES = [
  ['음료', /라떼|주스|스무디|쉐이크|셰이크|에이드|밀크$|우유$|두유$|차$|티$|커피|음료|콤부차|식초물/],
  ['샌드위치', /샌드위치|토스트|버거|모닝빵|베이글|핫도그|부리또|브리또|타코|랩$|또띠아 ?랩|에그랩|바게트/],
  ['샐러드', /샐러드|포케|월남쌈|콥/],
  ['중식', /마라|짜장|짬뽕|탕수|마파|깐풍|꿔바|유린기|딤섬|훠궈|하이디라오|중국|토달볶|누룽지탕|팔보채|양장피/],
  ['아시안', /팟타이|나시고|쌀국수|분짜|카레|커리|규동|돈부리|덮밥 ?\(일|오차즈케|스시|초밥|우동|소바|라멘|야끼|오코노미|돈테키|똠양|반미|일본|태국|베트남|인도/],
  // 단 것(빵, 과자, 케이크, 아이스크림 등)은 디저트, 짭짤한 한입거리와 요거트볼은 에피타이저
  ['디저트', /쿠키|케이크|케잌|푸딩|머핀|타르트|브라우니|스콘|아이스크림|젤리|양갱|휘낭시에|마들렌|파이|와플|팬케이크|마카롱|티라미수|약과|정과|무스|빙수|초코|도넛|도너츠|카스텔라|파운드|떡$|강정|디저트|에너지바|그래놀라$/],
  ['에피타이저', /칩$|빵$|바$|간식|피클|볼$|치즈볼|요거트|요플레|그릭|크래커|과자|핑거|카나페|브루스케타|에그롤/],
  ['양식', /파스타|리조또|피자|스테이크|오믈렛|그라탕|라따뚜이|뇨끼|감바스|프리타타|퀘사디아|치미창가|파히타|수프|스프|크림 ?(소스|리조또)|오트밀|그래놀라 ?볼|에그 ?베네|플레이트/],
];
function normalizeRecipeCategory(r) {
  const raw = String(r.tp || '').trim();
  if (RECIPE_CATS.includes(raw)) return raw;
  const text = `${r.n || ''} ${(r.ingredients || []).slice(0, 3).join(' ')}`;
  const name = String(r.n || '');
  // 매핑 가능한 값이라도 이름이 더 분명하면(예: 디저트로 적힌 "단백질 라떼") 이름을 따른다
  for (const [cat, re] of _RECIPE_CAT_RULES) if (re.test(name)) return cat;
  if (_RECIPE_CAT_MAP[raw]) return _RECIPE_CAT_MAP[raw];
  for (const [cat, re] of _RECIPE_CAT_RULES) if (re.test(text)) return cat;
  return '한식';
}
// 레시피 객체에 tp(8개 중 하나), tp0(원래 값)을 채운다. 이미 정규화된 것은 건드리지 않는다.
function normalizeRecipe(r) {
  if (!r || r._catOk) return r;
  r.tp0 = r.tp0 || r.tp;
  r.tp = normalizeRecipeCategory(r);
  if (typeof applyRecipeIcon === 'function') applyRecipeIcon(r);
  r._catOk = true;
  return r;
}

// ── 레시피 아이콘: 카테고리 그림 대신 "가장 많이 들어가는 재료" ─────────────────────
// 재료 줄에서 양(g, ml, 개, 장 …)을 대략 g으로 바꿔 가장 많이 들어가는 재료를 고른다.
// 양념(소금, 간장, 오일, 알룰로스 등)과 고명(대파, 청양고추 등)은 주재료 후보에서 뺀다.
// 그 재료를 나타내는 그림 문자가 있으면 그것을, 없으면(두부, 김 등) 재료 이름을 작은 배지로 보여 준다.
const _ING_EMOJI = [
  [/닭|치킨|오리/, '🍗'], [/소고기|쇠고기|돼지|목살|삼겹|불고기|차돌|안심|등심|우삼겹|우둔|항정|갈비|스지|고기/, '🥩'], [/베이컨|햄|스팸/, '🥓'], [/소시지|소세지/, '🌭'],
  [/새우/, '🦐'], [/연어|참치|고등어|생선|대구|명태|동태|광어|틸라피아|가자미|코다리|멸치|황태/, '🐟'], [/오징어|문어|낙지|쭈꾸미|주꾸미|진미채/, '🦑'], [/골뱅이|우렁/, '🐚'], [/게살|크래미|맛살|대게|꽃게/, '🦀'], [/굴|조개|바지락|홍합|전복|관자/, '🦪'],
  [/계란|달걀|메추리알|노른자|흰자|숙란/, '🥚'],
  [/파스타|스파게티|펜네|푸실리|링귀니|마카로니/, '🍝'], [/면|국수|라면|우동|소바|당면|쌀국수/, '🍜'], [/밥|쌀|현미|잡곡|곤약밥/, '🍚'], [/베이글/, '🥯'], [/식빵|빵|바게트|모닝빵|치아바타|브리오슈/, '🍞'], [/또띠아|토르티야|라이스페이퍼/, '🌮'], [/오트밀|오트|귀리|그래놀라|뮤즐리/, '🥣'], [/떡/, '🍡'], [/밀가루|박력분|강력분|중력분|통밀|메밀|사워도우/, '🌾'],
  [/그릭|요거트|요구르트|우유|두유|아몬드 ?브리즈|귀리우유/, '🥛'], [/치즈/, '🧀'], [/생크림|휘핑|크림/, '🥛'], [/아이스크림|메로나/, '🍨'], [/버터(?!넛)/, '🧈'],
  [/아보카도/, '🥑'], [/바나나/, '🍌'], [/딸기/, '🍓'], [/블루베리|베리/, '🫐'], [/사과/, '🍎'], [/배$/, '🍐'], [/레몬|라임/, '🍋'], [/귤|오렌지|자몽|한라봉|유자/, '🍊'], [/참외|멜론/, '🍈'], [/포도|샤인머스캣/, '🍇'], [/복숭아/, '🍑'], [/망고/, '🥭'], [/파인애플/, '🍍'], [/수박/, '🍉'], [/키위/, '🥝'], [/체리/, '🍒'], [/코코넛/, '🥥'], [/무화과|대추|건포도|과일/, '🍇'],
  [/방울토마토|토마토/, '🍅'], [/고구마/, '🍠'], [/애호박|주키니/, '🥒'], [/단호박|호박(?!씨)/, '🎃'], [/감자/, '🥔'], [/당근/, '🥕'], [/오이/, '🥒'], [/브로콜리|콜리플라워/, '🥦'], [/가지/, '🍆'], [/파프리카|피망/, '🫑'], [/옥수수|콘/, '🌽'], [/버섯/, '🍄'], [/양파/, '🧅'], [/마늘/, '🧄'],
  [/김치|묵은지|양배추|알배추|배추|봄동|우거지|상추|양상추|로메인|케일|시금치|청경채|비타민|샐러드 ?채소|어린잎|루꼴라|채소/, '🥬'], [/깻잎|바질|부추|미나리|허브|민트|쑥갓|고수/, '🌿'], [/콩나물|숙주/, '🌱'],
  [/병아리콩|콩|렌틸|에다마메|팥|서리태|낫또/, '🫘'], [/땅콩|아몬드|호두|캐슈|피스타치오|견과|마카다미아|피칸/, '🥜'], [/밤/, '🌰'],
  [/초콜릿|초코|코코아|카카오/, '🍫'], [/꿀/, '🍯'], [/말차|녹차/, '🍵'], [/커피|에스프레소/, '☕'],
];
// 양념, 기름, 단맛, 가루, 고명 → 주재료 후보에서 제외
const _ING_MINOR = /^(물|얼음|소금|후추|설탕|간장|진간장|국간장|양조간장|참기름|들기름|올리브유|식용유|아보카도 ?오일|코코넛 ?오일|카놀라유|포도씨유|오일|식초|발사믹|알룰로스|스테비아|에리스리톨|올리고당|물엿|조청|굴소스|맛술|미림|청주|소주|다진 ?마늘|마늘|생강|통깨|깨|참깨|고춧가루|고추장|된장|쌈장|케첩|마요네즈|머스타드|홀그레인|스리라차|핫소스|소스|드레싱|육수|치킨스톡|다시다|참치액|액젓|멸치액젓|베이킹파우더|베이킹소다|바닐라|시나몬|계피|파슬리|후리카케|김가루|대파|쪽파|청양고추|홍고추|고추|레몬즙|라임즙|전분|녹말|부침가루|튀김가루|빵가루|소금물)\b/;
const _UNIT_G = { g: 1, kg: 1000, ml: 1, l: 1000, 리터: 1000, 컵: 200, 공기: 200, 개: 60, 알: 5, 모: 300, 장: 30, 봉: 150, 봉지: 150, 팩: 200, 마리: 200, 줄: 150, 캔: 150, 쪽: 5, 큰술: 15, 스푼: 15, 작은술: 5, 줌: 30, 대: 100, 송이: 150, 조각: 40, 덩이: 100, 통: 300, 단: 200, 포기: 800, 인분: 100 };
function _ingParse(line) {
  const raw = String(line || '').replace(/\([^)]*\)/g, ' ').trim();
  const m = raw.match(/(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+))?\s*(kg|g|ml|l|리터|컵|공기|개|알|모|장|봉지|봉|팩|마리|줄|캔|쪽|큰술|스푼|작은술|줌|대|송이|조각|덩이|통|단|포기|인분)?/i);
  let grams = 30;
  if (m) {
    const n = m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1]);
    const u = (m[3] || '').toLowerCase();
    grams = n * (_UNIT_G[u] || (u ? 30 : 50));
  } else if (/반 ?개|½/.test(raw)) grams = 30;
  const name = raw.replace(/\d+(?:\.\d+)?(\s*\/\s*\d+)?\s*(kg|g|ml|l|리터|컵|공기|개|알|모|장|봉지|봉|팩|마리|줄|캔|쪽|큰술|스푼|작은술|줌|대|송이|조각|덩이|통|단|포기|인분)?/gi, ' ')
    .replace(/\s*(약간|조금|적당량|한 ?꼬집|꼬집|반|½|~|-|넉넉히|듬뿍|기호에 ?따라|선택)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  // 개수로 적힌 작은 재료는 1개 무게를 따로 본다
  if (m && /개|알|장/.test(m[3] || '')) {
    const per = /방울토마토|대추토마토|체리/.test(name) ? 15 : /깻잎|김$|김밥김|마른김/.test(name) ? 2 : /상추|양상추|배추잎/.test(name) ? 10 : /메추리알/.test(name) ? 10 : null;
    if (per) grams = (m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1])) * per;
  }
  return { name, grams };
}
function _ingEmoji(name) { for (const [re, e] of _ING_EMOJI) if (re.test(name)) return e; return null; }
function recipeMainIngredient(r) {
  const items = (r.ingredients || []).map(_ingParse).filter(x => x.name && !/^(물|얼음)$/.test(x.name));
  if (!items.length) return null;
  const major = items.filter(x => !_ING_MINOR.test(x.name));
  const pool = (major.length ? major : items).slice().sort((a, b) => b.grams - a.grams);
  // 레시피 이름에 들어 있는 재료가 있으면 그게 주재료다("두부 스테이크 샐러드" → 두부, "봉골레 파스타" → 파스타면)
  const title = String(r.n || '').replace(/\s+/g, '');
  const core = nm => nm.replace(/^(부침용|찌개용|생|냉동|훈제|삶은|구운|다진|채 ?썬|저당|무가당|통)\s*/, '').replace(/\s+/g, '');
  const inTitle = pool.filter(x => { const c = core(x.name); return c.length >= 2 && (title.includes(c) || (c.endsWith('면') && c.length > 2 && title.includes(c.slice(0, -1)))); });
  const main = inTitle[0] || pool[0];
  const e = _ingEmoji(main.name);
  if (e) return { name: main.name, emoji: e };
  if (inTitle[0]) return { name: core(main.name), emoji: null }; // 이름에 나온 주재료는 그림이 없어도 그 재료로 표시
  // 가장 많은 재료에 그림이 없으면, 양이 그 절반 이상인 다른 주재료 중 그림이 있는 것
  const alt = pool.find(x => x.grams >= main.grams * 0.5 && _ingEmoji(x.name));
  if (alt) return { name: alt.name, emoji: _ingEmoji(alt.name) };
  return { name: main.name, emoji: null };
}
// 아이콘 HTML: 그림 문자 또는 재료 이름 배지. size = 그림 크기(px)
function recipeIconHtml(r, size) {
  const px = size || 28;
  if (r.img) return `<span style="font-size:${px}px;line-height:1">${r.img}</span>`;
  const label = String(r.imgLabel || '').replace(/[&<>"']/g, '').slice(0, 3) || '🍽️';
  const box = Math.round(px * 1.35);
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${box}px;height:${box}px;border-radius:${Math.round(box * 0.32)}px;background:#f3eeff;color:#7e62b8;font-weight:800;font-size:${Math.max(10, Math.round(px * (label.length >= 3 ? 0.36 : 0.44)))}px;letter-spacing:-.02em;line-height:1">${label}</span>`;
}
function applyRecipeIcon(r) {
  const m = recipeMainIngredient(r);
  if (!m) return r;
  r.mainIng = m.name;
  if (m.emoji) { r.img = m.emoji; r.imgLabel = ''; }
  else { r.img = ''; r.imgLabel = m.name.replace(/\s+/g, '').slice(0, 3); }
  return r;
}
