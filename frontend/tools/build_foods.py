#!/usr/bin/env python3
"""식약처 식품영양성분 DB(원재료성식품, 가공식품) → public/js/data-foods-extra.js

사용법:
  python3 tools/build_foods.py 원재료성.xlsx 가공식품.xlsx [더 있으면 계속]
  (csv도 가능: utf-8 또는 cp949)

- 원재료성식품: 행 하나가 음식 하나(예: "바나나, 생것"). 모두 넣는다.
- 가공식품: 같은 제품이 브랜드별로 수만 건이라 "대표식품명"별로 묶어 중앙값 1건만 넣는다
  (예: 두유 제품 수백 개 → "두유" 1건). 브랜드 이름이 검색 결과를 뒤덮지 않게 하려는 것.
- 값은 100g(ml) 기준으로 맞춘다. 기준량이 100g이 아니면 비례 환산한다.
- GI는 DB에 없어서 분류/이름 키워드로 추정한다(data-foods.js와 같은 방식, 참고용).
- 이미 data-foods.js(음식 DB)나 data-foods-basic.js에 같은 이름이 있으면 건너뛴다.
"""
import csv, json, re, statistics, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/js/data-foods-extra.js'

COLS = {  # 내부키: 열 이름에 들어 있는 글자(앞에서부터 처음 맞는 열)
    'name': ['식품명'], 'rep': ['대표식품명'], 'cat': ['식품대분류명', '대분류'], 'basis': ['영양성분함량기준량', '기준량'],
    'kcal': ['에너지(kcal)', '에너지'], 'c': ['탄수화물(g)', '탄수화물'], 'p': ['단백질(g)', '단백질'], 'f': ['지방(g)', '지방'],
    'sugar': ['당류(g)', '당류'], 'fiber': ['식이섬유(g)', '식이섬유'], 'na': ['나트륨(mg)', '나트륨'], 'kind': ['데이터구분명', 'DB구분', '구분명'],
}

def read_rows(path):
    p = Path(path)
    if p.suffix.lower() in ('.xlsx', '.xlsm'):
        import openpyxl
        wb = openpyxl.load_workbook(p, read_only=True, data_only=True)
        ws = wb.worksheets[0]
        it = ws.iter_rows(values_only=True)
        header = [str(h or '').strip() for h in next(it)]
        for r in it:
            yield dict(zip(header, r))
    else:
        raw = p.read_bytes()
        for enc in ('utf-8-sig', 'cp949'):
            try: text = raw.decode(enc); break
            except UnicodeDecodeError: continue
        yield from csv.DictReader(text.splitlines())

def pick(row, key):
    for want in COLS[key]:
        for k in row:
            if k and want in k:
                return row[k]
    return None

def num(v):
    if v is None: return 0.0
    s = str(v).strip().replace(',', '')
    if s in ('', '-', '—', 'tr', 'Tr'): return 0.0
    try: return float(s)
    except ValueError: return 0.0

def basis_grams(v):
    m = re.search(r'([\d.]+)\s*(g|ml|mL)', str(v or '100g'))
    return float(m.group(1)) if m else 100.0

GI_RULES = [  # (키워드, GI)
    (r'설탕|사탕|젤리|시럽|꿀|잼|탄산|콜라|사이다|이온', 70), (r'쌀|밥|떡|면|국수|빵|시리얼|감자|과자|스낵|케이크|도넛', 70),
    (r'고구마|옥수수|호박', 60), (r'우유|요구르트|요거트|두유|치즈|유제품', 35), (r'과일|사과|배|귤|오렌지|딸기|포도|바나나|복숭아|키위', 45),
    (r'콩|두부|견과|아몬드|땅콩|호두', 20), (r'채소|나물|버섯|해조|김치', 15),
]
def est_gi(name, cat, c):
    if c < 2: return 0
    s = f'{cat} {name}'
    for pat, gi in GI_RULES:
        if re.search(pat, s): return gi
    return 50

EMOJI = [(r'우유|요구르트|요거트|두유', '🥛'), (r'치즈', '🧀'), (r'과일|사과|배|귤|딸기|포도|바나나|복숭아', '🍎'), (r'채소|나물|버섯', '🥬'),
         (r'육|고기|닭|돼지|소|햄|소시지', '🍖'), (r'어|수산|생선|새우|오징어|조개', '🐟'), (r'음료|주스|커피|차', '🥤'), (r'과자|스낵|빵|케이크', '🍪'),
         (r'곡|쌀|밥|면', '🍚'), (r'콩|두부|견과', '🫘'), (r'주류|술|맥주|소주', '🍺')]
def emoji(name, cat):
    s = f'{cat} {name}'
    for pat, e in EMOJI:
        if re.search(pat, s): return e
    return '🍽'

def existing_names():
    names = set()
    for f in ('data-foods.js', 'data-foods-basic.js'):
        txt = (ROOT / 'public/js' / f).read_text(encoding='utf8')
        names |= set(re.findall(r'"n":"([^"]+)"', txt)) | set(re.findall(r"\['([^']+)', '기본", txt))
    return names

def main(paths):
    raw_items, processed = [], {}
    for path in paths:
        for row in read_rows(path):
            name = str(pick(row, 'name') or '').strip()
            if not name: continue
            g = basis_grams(pick(row, 'basis')) or 100.0
            k = 100.0 / g
            vals = {key: round(num(pick(row, key)) * k, 1) for key in ('kcal', 'c', 'p', 'f', 'sugar', 'fiber', 'na')}
            if vals['kcal'] <= 0 and vals['c'] <= 0 and vals['p'] <= 0: continue
            cat = str(pick(row, 'cat') or '').strip()
            kind = str(pick(row, 'kind') or '') + ' ' + Path(path).name
            rep = str(pick(row, 'rep') or '').strip()
            if '가공' in kind and rep and rep not in ('-', '해당없음'):
                processed.setdefault(rep, {'cat': cat, 'rows': []})['rows'].append(vals)
            else:
                # 원재료성: "바나나, 생것" → "바나나 (생것)"
                nm = re.sub(r'\s*,\s*', ' (', name, count=1) + (')' if ',' in name else '')
                raw_items.append({'n': nm, 'cat': cat, **vals})
    for rep, g in processed.items():
        rows = g['rows']
        med = {key: round(statistics.median(r[key] for r in rows), 1) for key in rows[0]}
        raw_items.append({'n': rep, 'cat': g['cat'], **med})

    seen, out = existing_names(), []
    for it in raw_items:
        if it['n'] in seen: continue
        seen.add(it['n'])
        out.append({'n': it['n'], 'cat': it['cat'] or '기타', 'e': emoji(it['n'], it['cat']), 'kcal': it['kcal'], 'c': it['c'], 'p': it['p'],
                    'f': it['f'], 'sugar': it['sugar'], 'fiber': it['fiber'], 'na': it['na'], 'gi': est_gi(it['n'], it['cat'], it['c'])})
    head = ('// 식약처 식품영양성분 DB(원재료성식품, 가공식품 대표식품명별 중앙값)에서 tools/build_foods.py로 생성.\n'
            '// 값은 100g(ml) 기준. GI는 분류/이름 키워드 기반 추정치(참고용).\n')
    OUT.write_text(head + 'const FOODS_EXTRA = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf8')
    print(f'{len(out)}개 저장 → {OUT}  ({OUT.stat().st_size // 1024}KB)')

if __name__ == '__main__':
    if len(sys.argv) < 2: sys.exit(__doc__)
    main(sys.argv[1:])
