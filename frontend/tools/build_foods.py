#!/usr/bin/env python3
"""식약처 식품영양성분 DB → public/js/data-foods-extra.js

사용법 (공공데이터포털/식품안전나라에서 받은 파일을 그대로, 순서 상관없음):
  python3 tools/build_foods.py 음식.xls 원재료성.xls 가공식품.xls
  (.xls, .xlsx, .csv 모두 가능. 파일 종류는 '데이터구분명' 열(음식/원재료성 식품/가공식품)로 판단)

검색 결과가 브랜드명이나 지역별 샘플로 뒤덮이지 않게 "대표 이름" 하나로 묶어 중앙값을 쓴다.
  - 원재료성: "사과_부사_생것", "전복류_전복_육_생것_완도_11월" → "사과 부사 (생것)", "전복 (생것)"
  - 음식(가정식/급식/외식): 이름의 "_"를 띄어쓰기로. 기존 data-foods.js에 있는 이름은 건너뛴다
  - 음식(프랜차이즈): 3개 이상 브랜드에 같은 이름이 있는 메뉴만(예: 아메리카노, 카페 라떼, 후라이드 치킨). HOT/ICE, 사이즈 표기는 합친다
  - 가공식품: 대표식품명별 1건 + 5곳 이상에서 같은 이름으로 파는 제품(예: 포기김치, 플레인 베이글)
값은 모두 100g(ml) 기준. GI는 DB에 없어서 분류/이름 키워드로 추정한다(참고용).
data-foods-basic.js의 기본 음식 중 식약처 값이 있는 것은 FOODS_BASIC_OFFICIAL로 값을 덮어쓴다.
"""
import csv, json, re, statistics, sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/js/data-foods-extra.js'
INCLUDE_PROCESSED = False
NUM_KEYS = {'kcal': '에너지(kcal)', 'c': '탄수화물(g)', 'p': '단백질(g)', 'f': '지방(g)', 'sugar': '당류(g)', 'fiber': '식이섬유(g)', 'na': '나트륨(mg)'}

# 기본 음식 이름 → 식약처 묶음 이름(정확히 이 이름의 묶음이 있으면 그 값으로 덮어쓴다)
BASIC_MATCH = {
    '우유': '우유', '바나나': '바나나 (생것)', '사과': '사과 (생것)', '배': '배 (생것)', '귤': '귤 온주밀감 (생것)',
    '오렌지': '오렌지 (생것)', '딸기': '딸기 설향 (생것)', '블루베리': '블루베리 (생것)', '포도': '포도 캠벨얼리 (생것)', '수박': '수박 적육질 (생것)',
    '참외': '참외 씨 포함 (생것)', '복숭아': '복숭아 백도 (생것)', '키위': '키위 그린 (생것)', '망고': '망고 (생것)', '파인애플': '파인애플 (생것)',
    '단감': '감 단감 (생것)', '자몽': '자몽(그레이프프루트) (생것)', '체리': '체리 (생것)', '토마토': '토마토 (생것)', '방울토마토': '토마토 방울토마토 (생것)',
    '아보카도': '아보카도 (생것)', '양배추': '양배추 (생것)', '브로콜리': '브로콜리 (생것)', '오이': '오이 개량종 (생것)', '당근': '당근 뿌리 (생것)',
    '양상추': '양상추 (생것)', '시금치': '시금치 (생것)', '파프리카': '파프리카(착색단고추) 빨간색 (생것)', '삶은 달걀': '달걀 (삶은것)',
    '아몬드': '아몬드 (볶은것)', '호두': '호두 (볶은것)', '땅콩': '땅콩 (볶은것)', '꿀': '꿀 잡화', '찐 고구마': '고구마 (찐것)',
    '찐 감자': '감자 수미 (찐것)', '찐 옥수수': '옥수수 찰옥수수 (찐것)', '아메리카노': '아메리카노', '카페라떼': '카페 라떼', '바닐라 라떼': '바닐라 라떼',
    '후라이드치킨': '후라이드 치킨', '양념치킨': '양념 치킨', '크루아상': '크로와상',
}
SKIP_REPS = re.compile(r'^기타|이유식|해당없음|(식용|올리브|포도씨|해바라기|현미|대두|콩|들|참|향미|카놀라|옥수수)유$|기름$|^소스|소스류|드레싱|시럽|조미료|양념$')

def read_rows(path):
    p = Path(path)
    suf = p.suffix.lower()
    if suf == '.xls':
        import xlrd
        sh = xlrd.open_workbook(p).sheet_by_index(0)
        rows = [sh.row_values(i) for i in range(sh.nrows)]
    elif suf in ('.xlsx', '.xlsm'):
        import openpyxl
        rows = [list(r) for r in openpyxl.load_workbook(p, read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True)]
    else:
        raw = p.read_bytes()
        for enc in ('utf-8-sig', 'cp949'):
            try: text = raw.decode(enc); break
            except UnicodeDecodeError: continue
        rows = list(csv.reader(text.splitlines()))
    hi = next(i for i, r in enumerate(rows[:5]) if any(str(c).strip() == '식품명' for c in r))
    header = [str(c).strip() for c in rows[hi]]
    if len(rows) - hi - 1 >= 50000:
        print(f'⚠️  {p.name}: {len(rows) - hi - 1}행 — 엑셀 내려받기 한도(50,000행)에서 잘렸을 수 있어요. CSV 전체 파일을 권장합니다.')
    for r in rows[hi + 1:]:
        yield dict(zip(header, r))

def num(v):
    # 빈 칸은 0이 아니라 '값 없음'(None) — 프랜차이즈 자료는 탄수/지방 칸이 빈 경우가 많아 0으로 두면 중앙값이 망가진다
    s = str(v if v is not None else '').strip().replace(',', '')
    try: return float(s)
    except ValueError: return None

def per100(row):
    m = re.search(r'([\d.]+)', str(row.get('영양성분함량기준량') or '100'))
    g = float(m.group(1)) if m else 100.0
    k = 100.0 / g if g else 1.0
    return {key: (None if num(row.get(col)) is None else num(row.get(col)) * k) for key, col in NUM_KEYS.items()}

STATE = re.compile(r'것|추출|젓갈|해당없음|절임|분말|^건조|^냉동')
REGION = re.compile(r'^(대표|평균|\d+월|부산|완도|통영|여수|제주|강원|경남|경북|전남|전북|충남|충북|인천|목포|포항|거제|군산|서해|동해|남해|국내산|수입산|양식|자연산)$')
def raw_name(n):
    parts = [x.strip() for x in str(n).split('_') if x.strip()]
    parts = [x for x in parts if not REGION.match(x)]
    if len(parts) >= 3 and parts[0].endswith('류'): parts = parts[1:]
    parts = [x for x in parts if x not in ('육', '해당없음', '가식부')]
    state = parts.pop() if len(parts) >= 2 and STATE.search(parts[-1]) else None
    return ' '.join(parts) + (f' ({state})' if state else '')

def franchise_name(n):
    n = str(n).split('_', 1)[-1]
    n = re.sub(r'\((?:R|L|S|M|XL|Tall|Grande|Venti|레귤러|라지|미디움|톨|그란데|벤티|ICED?|HOT|핫|아이스|[\d.]+ ?(?:oz|ml|g|조각|인분|개|입))\)', '', n, flags=re.I)
    n = re.sub(r'(?:^|\s)(HOT|ICED?|핫|아이스)(?=\s|$)', ' ', n, flags=re.I)
    return re.sub(r'\s+', ' ', n).strip()

GI_RULES = [
    (r'탄산|콜라|사이다|에이드|시럽|사탕|젤리|설탕|꿀|잼|스무디|주스', 65), (r'떡|쌀|밥|죽|면|국수|빵|베이글|피자|과자|스낵|케이크|도넛|와플|크로플|시리얼|감자', 70),
    (r'고구마|옥수수|호박|바나나|망고|파인애플|수박', 60), (r'라떼|우유|요구르트|요거트|두유|치즈|아이스크림|쉐이크', 40),
    (r'사과|배|귤|오렌지|딸기|포도|복숭아|키위|자두|감|체리|블루베리|과일', 40), (r'콩|두부|견과|아몬드|땅콩|호두', 20),
    (r'채소|나물|버섯|해조|김치|샐러드|상추|배추|양배추|오이|토마토|시금치', 15),
]
def est_gi(name, cat, c):
    if c < 2: return 0
    s = f'{name} {cat}'
    for pat, gi in GI_RULES:
        if re.search(pat, s): return gi
    return 50
EMOJI = [(r'커피|라떼|아메리카노|에스프레소|카푸치노|모카', '☕'), (r'차$|티$|차류', '🍵'), (r'우유|요구르트|두유|유제품', '🥛'), (r'치즈', '🧀'),
         (r'피자', '🍕'), (r'버거', '🍔'), (r'치킨|닭', '🍗'), (r'빵|베이글|크로와상|스콘|바게트', '🥐'), (r'케이크|와플|크로플|마카롱|쿠키|과자|도넛', '🍰'),
         (r'아이스크림|빙수', '🍨'), (r'주스|에이드|스무디|음료', '🥤'), (r'과일|사과|배|귤|딸기|포도|바나나|복숭아|감|키위', '🍎'),
         (r'채소|나물|버섯|해조|김치|샐러드', '🥬'), (r'육|고기|햄|소시지|돼지|소', '🍖'), (r'어|수산|생선|새우|오징어|조개|게|전복', '🐟'),
         (r'곡|쌀|밥|떡', '🍚'), (r'면|국수|파스타', '🍜'), (r'콩|두부|견과|땅콩|아몬드|호두', '🥜'), (r'달걀|계란', '🥚')]
def emoji(name, cat):
    s = f'{name} {cat}'
    for pat, e in EMOJI:
        if re.search(pat, s): return e
    return '🍽'


# 원재료성 식품은 품종, 지역, 부위 샘플이 3,000개가 넘어 검색을 어지럽힌다. 자주 먹는 것만 골라
# "이름 (조리상태)" 하나로 묶는다(품종, 지역, 등급은 중앙값으로 합침). 형식: (표시 이름, 원재료 이름 정규식)
def _w(*words): return [(w, rf'^{w}( |$)') for w in words]
CURATED_RAW = {
    ('과일', '🍎', ('생것',)): _w('사과', '배', '바나나', '귤', '오렌지', '딸기', '블루베리', '포도', '수박', '참외', '멜론', '복숭아', '자두',
                                  '키위', '망고', '파인애플', '감', '체리', '레몬', '아보카도', '석류', '무화과', '대추', '살구', '아로니아',
                                  '라즈베리', '블랙베리', '천도복숭아', '한라봉') + [('자몽', r'^자몽')],
    ('채소', '🥬', ('생것', '데친것', '삶은것')): _w('양배추', '배추', '시금치', '브로콜리', '오이', '당근', '무', '양파', '마늘', '가지', '토마토',
                                                  '피망', '고추', '깻잎', '콩나물', '숙주나물', '연근', '우엉', '아스파라거스', '케일', '청경채',
                                                  '미나리', '쑥갓', '부추', '비트', '콜리플라워', '미역', '김', '다시마', '고사리', '도라지', '애호박',
                                                  '단호박', '표고버섯', '느타리버섯', '팽이버섯', '양송이버섯', '상추', '셀러리')
                                                + [('대파', r'^파 대파'), ('쪽파', r'^파 쪽파'), ('양상추', r'양상추'), ('방울토마토', r'방울토마토'),
                                                   ('파프리카', r'^파프리카'), ('새송이버섯', r'새송이'), ('호박', r'^호박( |$)')],
    ('고기', '🍖', ('생것', '구운것', '삶은것')): [
        ('소고기 등심', r'^소고기 .*등심'), ('소고기 안심', r'^소고기 .*안심'), ('소고기 채끝', r'^소고기 .*채끝'), ('소고기 양지', r'^소고기 .*양지'),
        ('소고기 사태', r'^소고기 .*사태'), ('소고기 우둔', r'^소고기 .*우둔'), ('소고기 갈비', r'^소고기 .*갈비'), ('소고기 살코기', r'^소고기 .*살코기'),
        ('돼지고기 삼겹살', r'^돼지고기 삼겹살 \('), ('돼지고기 목심', r'^돼지고기 목심'), ('돼지고기 안심', r'^돼지고기 안심'),
        ('돼지고기 등심', r'^돼지고기 등심'), ('돼지고기 앞다리', r'^돼지고기 앞다리'), ('돼지고기 뒷다리', r'^돼지고기 뒷다리'),
        ('돼지고기 갈비', r'^돼지고기 갈비'), ('돼지고기 살코기', r'^돼지고기 살코기'),
        ('닭가슴살', r'^닭고기 가슴'), ('닭다리', r'^닭고기 .*(아랫다리|넓적다리)'), ('닭날개', r'^닭고기 .*날개'), ('닭고기 살코기', r'^닭고기 살코기'),
        ('오리고기', r'^오리고기'), ('양고기', r'^양고기')],
    ('생선', '🐟', ('생것', '구운것', '찐것', '삶은것')): _w('고등어', '갈치', '삼치', '꽁치', '조기', '대구', '명태', '가자미', '장어', '멸치',
                                                         '오징어', '문어', '낙지', '전복', '굴', '홍합', '바지락', '꽃게', '가리비')
                                                       + [('새우', r'^(새우|흰다리새우|대하) \('), ('연어', r'^연어 (?!알)'), ('참치', r'^(다랑어|참치)'), ('광어', r'^(넙치|광어)'),
                                                          ('우럭', r'조피볼락'), ('도미', r'^(참돔|도미|돔 )'), ('주꾸미', r'^(주꾸미|쭈꾸미)')],
    ('곡류', '🌾', ('생것', '삶은것', '찐것', '구운것')): [
        ('백미', r'^멥쌀 .*백미'), ('현미', r'^(멥쌀 .*현미|현미)'), ('찹쌀', r'^찹쌀'), ('흑미', r'흑미'), ('보리', r'^(보리|겉보리|쌀보리)( |$)'),
        ('귀리', r'^귀리'), ('메밀', r'^메밀( |$)'), ('수수', r'^수수( |$)'), ('기장', r'^기장( |$)'), ('퀴노아', r'^퀴노아'), ('율무', r'^율무'),
        ('옥수수', r'^옥수수 (?!기름|순)'), ('감자', r'^감자( |$)'), ('고구마', r'^고구마 (?!줄기|잎)'), ('밀가루', r'^밀가루')],
}
STATE_WORDS = ('생것', '구운것', '삶은것', '찐것', '데친것', '볶은것')
def state_of(key):
    i = key.rfind(' (')
    st = re.sub(r'\(.*\)', '', key[i + 2:-1]) if i >= 0 and key.endswith(')') else ''
    if not st:
        st = next((w for w in STATE_WORDS if w in key.split()), '')
    return st.strip()

def existing_names():
    txt = (ROOT / 'public/js/data-foods.js').read_text(encoding='utf8')
    names = set(re.findall(r'"n":"([^"]+)"', txt))
    names |= {n.replace(' ', '') for n in names}
    basic = (ROOT / 'public/js/data-foods-basic.js').read_text(encoding='utf8')
    names |= set(re.findall(r"^\s*\['([^']+)', '기본", basic, re.M))
    return names

def main(paths):
    groups = defaultdict(lambda: {'cat': '', 'rows': [], 'brands': set(), 'kind': ''})
    for path in paths:
        for row in read_rows(path):
            name = str(row.get('식품명') or '').strip()
            kind = str(row.get('데이터구분명') or '')
            if not name or '건강기능' in kind: continue
            vals = per100(row)
            if not vals['kcal'] or vals['kcal'] <= 0: continue
            cat = str(row.get('식품대분류명') or '').strip()
            origin = str(row.get('식품기원명') or '')
            if '원재료' in kind:
                key, gk = raw_name(name), 'raw'
            elif '가공' in kind:
                # 가공식품은 브랜드 제품이 너무 많아 검색만 헷갈리게 해서 넣지 않는다(파일을 넘겨도 무시)
                if not INCLUDE_PROCESSED: continue
                rep = str(row.get('대표식품명') or '').strip()
                if rep and not SKIP_REPS.search(rep):
                    g = groups[('procrep', f'{rep} (가공식품)')]; g['cat'] = cat; g['rows'].append(vals); g['kind'] = 'procrep'; g['brands'].add(row.get('업체명') or row.get('제조사명') or '')
                key, gk = re.sub(r'\s+', ' ', name) + ' (가공식품)', 'procname'
            elif '프랜차이즈' in origin:
                key, gk = franchise_name(name), 'fr'
            else:
                key, gk = name.replace('_', ' '), 'dish'
            g = groups[(gk, key)]
            g['cat'] = cat; g['rows'].append(vals); g['kind'] = gk
            g['brands'].add(str(row.get('업체명') or row.get('제조사명') or row.get('식품기원명') or ''))

    seen, out, by_name = existing_names(), [], {}
    order = {'raw': 0, 'dish': 1, 'fr': 2, 'procrep': 3, 'procname': 4}
    for (gk, key), g in sorted(groups.items(), key=lambda kv: order[kv[0][0]]):
        if gk == 'fr' and len(g['brands']) < 3: continue
        if gk == 'procname' and len(g['rows']) < 5: continue
        if gk == 'procrep' and len(g['rows']) < 3: continue
        med = {}
        for k in NUM_KEYS:
            vs = [r[k] for r in g['rows'] if r[k] is not None]
            med[k] = round(statistics.median(vs), 1) if vs else 0.0
        # 탄수, 단백, 지방이 전부 비어 있으면 혈당 계산에 쓸 수 없어 뺀다
        if not any(any(r[k] is not None for r in g['rows']) for k in ('c', 'p', 'f')): continue
        # 프랜차이즈 자료는 지방을 0으로 적은 경우가 있다(후라이드 치킨 지방 0 등). 칼로리에서 탄수, 단백을 빼고
        # 많이 남으면 그만큼을 지방으로 추정한다(1g = 9kcal)
        rest = med['kcal'] - 4 * med['c'] - 4 * med['p']
        if med['f'] == 0 and rest > max(20, 0.3 * med['kcal']): med['f'] = round(rest / 9, 1)
        # 탄수 칸이 비어 0이 된 프랜차이즈 메뉴(빵, 피자 토핑 등)는 혈당 계산을 망가뜨려서 뺀다
        if gk == 'fr' and med['c'] == 0 and med['kcal'] >= 100: continue
        item = {'n': key, 'cat': g['cat'] or '기타', 'e': emoji(key, g['cat']), **med, 'gi': est_gi(key, g['cat'], med['c'])}
        by_name.setdefault(key, item)
        if gk == 'raw': continue  # 원재료성은 아래 CURATED_RAW로만 내보낸다
        if gk == 'dish' and '간편조리세트' in key: continue  # 밀키트 제품은 가공식품 성격이라 뺀다
        nospace = key.replace(' ', '')
        if key in seen or nospace in seen: continue
        seen.add(key); seen.add(nospace); out.append(item)

    # 자주 먹는 원재료만 "이름 (조리상태)"로 묶어 추가
    raw_rows = {key: g['rows'] for (gk, key), g in groups.items() if gk == 'raw'}
    basic_names = set(BASIC_MATCH) | existing_names()
    for (catname, emo, states), entries in CURATED_RAW.items():
        for disp, pat in entries:
            rx = re.compile(pat)
            for st in states:
                rows = [r for key, rs in raw_rows.items() if rx.search(key) and state_of(key) == st for r in rs]
                if not rows: continue
                if st == '생것' and disp in basic_names: continue  # 기본 음식에 이미 있음(식약처 값으로 덮어씀)
                med = {}
                for k in NUM_KEYS:
                    vs = [r[k] for r in rows if r[k] is not None]
                    med[k] = round(statistics.median(vs), 1) if vs else 0.0
                n = f'{disp} ({st})'
                if n in seen: continue
                seen.add(n)
                out.append({'n': n, 'cat': catname, 'e': emo, **med, 'gi': est_gi(disp, catname, med['c'])})

    official = {}
    for basic, src in BASIC_MATCH.items():
        it = by_name.get(src)
        if it: official[basic] = {k: it[k] for k in list(NUM_KEYS) + ['gi']} | {'src': src}
    missing = [b for b, s in BASIC_MATCH.items() if s not in by_name]
    # 기본 음식에 값을 넘긴 항목은 검색 결과에 같은 음식이 두 번 나오지 않게 뺀다
    used = {v['src'] for v in official.values()}
    out = [o for o in out if o['n'] not in used]

    head = ('// 식약처 식품영양성분 DB(음식, 원재료성식품)에서 tools/build_foods.py로 생성. 직접 고치지 말 것.\n'
            '// 값은 100g(ml) 기준 중앙값. GI는 분류/이름 키워드 기반 추정치(참고용).\n')
    OUT.write_text(head + 'const FOODS_EXTRA = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n'
                   + '// 기본 음식(data-foods-basic.js) 중 식약처 값으로 덮어쓸 것\n'
                   + 'const FOODS_BASIC_OFFICIAL = ' + json.dumps(official, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf8')
    kinds = defaultdict(int)
    for o in out: kinds[o['cat'] if o['cat'] in ('과일', '채소', '고기', '생선', '곡류') else '외식/음식'] += 1
    print(f'{len(out)}개 저장 → {OUT.name} ({OUT.stat().st_size // 1024}KB)', dict(kinds))
    print(f'기본 음식 식약처 값 적용 {len(official)}개, 못 찾음: {missing}')
    return out, official

if __name__ == '__main__':
    if len(sys.argv) < 2: sys.exit(__doc__)
    main(sys.argv[1:])
