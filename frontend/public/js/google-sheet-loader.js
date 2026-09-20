/**
 * google-sheet-loader.js
 * 구글시트에서 레시피 데이터를 실시간으로 읽어 RCPS 배열을 업데이트한다.
 * 시트가 "링크가 있는 모든 사용자 → 뷰어" 로 공유되어 있어야 한다.
 * 로드 실패 시 기존 data-recipes.js (RCPS_IMPORTED) 가 그대로 쓰인다.
 */
(function () {
    'use strict';

    /* ─── 설정 ─── */
    const SHEET_ID = '1_csWpbLnQsoJm9EYyWZfdL8-JyyQHhB16tfXu_UexQA';
    const GID = 0;                          // 시트1
    // 시트 전체(채널명·영상링크 등 30,000행)를 받으면 응답이 약 19MB라, 앱이 쓰는 컬럼(F~P)과 음식이름이 있는 행만 요청한다
    // (약 10MB, gzip 전송 약 2MB). 컬럼을 추가/이동했다면 아래 SELECT의 열 문자를 함께 바꿔야 한다.
    //   F 카테고리 · G 음식이름 · H 시간 · I 가격 · J 맛 · K 주재료 · L 부재료 · M 양념 · N 순서 · O 팁 · P 칼로리
    const GVIZ_QUERY = 'select F,G,H,I,J,K,L,M,N,O,P where G is not null';
    const GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${GID}&tq=${encodeURIComponent(GVIZ_QUERY)}`;
    const CACHE_KEY = 'bellamona_sheet_recipes_v3'; // 시트/쿼리/중복 규칙을 바꾸면 이전 캐시를 쓰지 않도록 키를 올린다
    const CACHE_TTL = 1000 * 60 * 10;             // 10분 캐시

    /* ─── 카테고리 → 이모지 ─── */
    const CAT_EMOJI = {
        '한식': '🍚', '일식': '🍣', '중식': '🥡',
        '이탈리안': '🍝', '프렌치': '🥐', '샐러드': '🥗',
        '디저트': '🍰', '음료': '☕', '에피타이저': '🥟',
        '샌드위치': '🥪', '멕시칸': '🌮', '아시안': '🍜',
        '간식': '🍰', '양식': '🍝', '기타': '🍽️',
    };

    /* ─── 헤더 → 필드 매핑 (부분 문자열 매칭) ─── */
    function findCol(headers, ...keywords) {
        return headers.findIndex(h => {
            if (!h) return false;
            const lc = h.toLowerCase();
            return keywords.some(k => lc.includes(k));
        });
    }

    function buildColMap(headers) {
        return {
            name: findCol(headers, '음식이름', '음식 이름', '메뉴'),
            cat: findCol(headers, '카테고리'),
            time: findCol(headers, '시간'),
            cost: findCol(headers, '가격'),
            taste: findCol(headers, '맛'),
            main: findCol(headers, '주재료', '주 재료'),
            sub: findCol(headers, '부재료', '부 재료'),
            sauce: findCol(headers, '양념', '소스류'),
            steps: findCol(headers, '순서', '만드는'),
            tip: findCol(headers, '팁', 'tip'),
            cal: findCol(headers, '칼로리', 'kcal'),
        };
    }

    /* ─── 텍스트 → 배열 파서 ─── */
    function splitLines(text) {
        if (!text) return [];
        return text
            .split(/\n/)
            .map(s => s.replace(/^\s*[\d]+[\.\)\-]\s*/, '').trim())
            .filter(s => s.length > 0);
    }

    /* ─── 첫 번째 재료에서 쿠팡 검색어 추출 ─── */
    function cpgQuery(mainText) {
        if (!mainText) return '';
        const first = mainText.split(/\n|,/)[0]
            .replace(/^\s*[\d]+[\.\)\-]\s*/, '').trim()
            .replace(/\s*[\d\/\.]+\s*(g|kg|ml|cc|개|장|모|통|대|큰술|작은술|스푼|컵|약간|조금|적당량|넉넉히|듬뿍|한줌|한 줌|원하는|먹고).*$/i, '')
            .trim();
        return first || '';
    }

    /* ─── 행 → 레시피 객체 ─── */
    function rowToRecipe(cells, cm) {
        const v = (idx) => (idx >= 0 && cells[idx]) ? String(cells[idx]).trim() : '';

        const name = v(cm.name);
        if (!name) return null;

        const mainText = v(cm.main);
        const subText = v(cm.sub);
        const sauceText = v(cm.sauce);
        const stepsText = v(cm.steps);

        const ingredients = [
            ...splitLines(mainText),
            ...splitLines(subText),
            ...splitLines(sauceText),
        ];
        const steps = splitLines(stepsText);

        // 재료·순서 모두 없으면 표시용으로 부족 → 건너뜀
        if (ingredients.length === 0 && steps.length === 0) return null;

        const cat = v(cm.cat) || '기타';
        const time = parseInt(v(cm.time)) || 10;
        const cost = parseInt(v(cm.cost)) || 5000;
        const cal = parseInt(v(cm.cal)) || null;

        return {
            n: name,
            t: time,
            tp: cat,
            cost: cost,
            img: CAT_EMOJI[cat] || '🍽️',
            cal: cal,
            ingredients: ingredients,
            steps: steps.length > 0 ? steps : ['레시피 영상을 참고하세요.'],
            tip: v(cm.tip) || '',
            cpgQ: cpgQuery(mainText),
        };
    }

    /* ─── 같은 이름의 서로 다른 레시피에 제목 구분 붙이기 ─── */
    // 이름이 같은 레시피가 여러 개면 제목 뒤에 재료를 괄호로 붙여 목록에서 구분되게 한다.
    // 예: "봄동 겉절이" ×3 → "봄동 겉절이 (봄동)", "봄동 겉절이 (참치)" ...
    // 그룹 안에서 라벨이 서로 겹치지 않는 가장 짧은 후보를 쓰고, 끝까지 겹치면 번호를 붙인다. 이름이 하나뿐이면 그대로 둔다.
    function disambiguateTitles(recipes) {
        const groups = new Map();
        for (const r of recipes) {
            if (!groups.has(r.n)) groups.set(r.n, []);
            groups.get(r.n).push(r);
        }
        // 제목 끝 괄호 안에 또 괄호가 들어가 깨지지 않게, 재료 줄의 괄호 설명("방울토마토 5개(50g)")은 떼고 길면 자른다.
        const clip = (t) => {
            t = t.replace(/\s*\([^)]*\)?/g, '').replace(/[()]/g, '').trim();
            return t.length > 16 ? t.slice(0, 16) + '…' : t;
        };
        // 한 재료 줄에서 수량을 뗀 이름만 남긴다("봄동 1포기" → "봄동").
        const ingName = (line) => cpgQuery(line);
        // 그룹 안에서 "이 레시피에만 있는(또는 가장 드문)" 재료를 우선 골라, 목록에서 서로 구별되는 이름을 만든다.
        // 예: 당근라페 ×2 → "(호두)", "(크랜베리)". 후보를 늘려 가며(재료 1~3개, 수량 포함) 유일해질 때까지 시도한다.
        for (const [name, list] of groups) {
            if (list.length < 2) continue;
            const info = list.map(r => {
                const seen = new Set(), names = [];
                for (const line of r.ingredients) { const nm = ingName(line); if (nm && !seen.has(nm)) { seen.add(nm); names.push(nm); } }
                return { names, lines: r.ingredients.filter(Boolean) };
            });
            // 재료별로 그룹 안에서 몇 개 레시피가 쓰는지(적을수록 그 레시피를 잘 구별해 준다)
            const dfNames = new Map(), dfLines = new Map();
            info.forEach(x => {
                new Set(x.names).forEach(n => dfNames.set(n, (dfNames.get(n) || 0) + 1));
                new Set(x.lines).forEach(n => dfLines.set(n, (dfLines.get(n) || 0) + 1));
            });
            const rare = (arr, df) => arr.map((v, i) => [v, i]).sort((a, b) => (df.get(a[0]) - df.get(b[0])) || (a[1] - b[1])).map(x => x[0]);
            const levels = [
                (x, k) => rare(x.names, dfNames).slice(0, k).join(', '),
                (x, k) => rare(x.lines, dfLines).slice(0, k).join(', '),
            ];
            const done = new Array(list.length).fill(null);
            const taken = new Set();
            for (const level of levels) {
                for (const k of [1, 2, 3]) {
                    const pending = done.map((d, i) => (d == null ? i : -1)).filter(i => i >= 0);
                    if (!pending.length) break;
                    const tryLabels = pending.map(i => clip(level(info[i], k)));
                    const count = new Map();
                    tryLabels.forEach(l => count.set(l, (count.get(l) || 0) + 1));
                    pending.forEach((i, j) => {
                        const l = tryLabels[j];
                        if (l && count.get(l) === 1 && !taken.has(l)) { done[i] = l; taken.add(l); }
                    });
                }
            }
            // 그래도 구별되지 않는 것(재료가 사실상 같은 변형)만 번호로 구분
            let n = 0;
            list.forEach((r, i) => { r.n = done[i] ? `${name} (${done[i]})` : `${name} (${++n})`; });
        }
    }

    /* ─── gviz JSON 응답 파싱 ─── */
    function parseGviz(rawText) {
        // google.visualization.Query.setResponse({...}); 형태에서 JSON만 추출
        const json = rawText
            .replace(/^[^{]*/, '')   // 앞쪽 wrapper 제거
            .replace(/\);?\s*$/, '') // 뒤쪽 wrapper 제거
            .trim();
        return JSON.parse(json);
    }

    /* ─── 메인 로더 ─── */
    function loadSheet() {
        // 캐시 확인
        try {
            const cached = sessionStorage.getItem(CACHE_KEY);
            if (cached) {
                const { ts, data } = JSON.parse(cached);
                if (Date.now() - ts < CACHE_TTL && Array.isArray(data) && data.length > 0) {
                    applyRecipes(data);
                    console.log(`[구글시트] 캐시에서 ${data.length}개 레시피 로드`);
                    // 캐시 사용하되 백그라운드에서 새로고침
                    fetchAndApply(true);
                    return;
                }
            }
        } catch (_) { /* 캐시 읽기 실패 무시 */ }

        fetchAndApply(false);
    }

    function fetchAndApply(silent) {
        fetch(GVIZ_URL)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.text();
            })
            .then(text => {
                const gviz = parseGviz(text);
                const cols = gviz.table.cols;
                const rows = gviz.table.rows;
                const headers = cols.map(c => (c.label || '').trim());

                const cm = buildColMap(headers);
                if (cm.name < 0) {
                    console.warn('[구글시트] "음식이름" 컬럼을 찾을 수 없습니다. 헤더:', headers);
                    return;
                }

                const recipes = [];
                const seen = new Set();

                for (const row of rows) {
                    const cells = row.c
                        ? row.c.map(cell => (cell && cell.v != null) ? cell.v : '')
                        : [];

                    const r = rowToRecipe(cells, cm);
                    if (!r) continue;
                    // 이름만 같다고 같은 레시피가 아니다(같은 "봄동 겉절이"라도 재료가 다른 별개 레시피가 많다).
                    // 이름과 재료 목록이 모두 같은 행만 중복으로 보고 버린다.
                    const key = r.n + '\u0000' + r.ingredients.join('\u0001');
                    if (seen.has(key)) continue;
                    seen.add(key);
                    recipes.push(r);
                }
                disambiguateTitles(recipes);

                if (recipes.length > 0) {
                    applyRecipes(recipes);
                    // 캐시 저장
                    try {
                        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: recipes }));
                    } catch (_) { /* 초과 시 무시 */ }
                    console.log(`[구글시트] ${recipes.length}개 레시피 로드 완료`);
                } else if (!silent) {
                    console.warn('[구글시트] 유효한 레시피가 없습니다.');
                }
            })
            .catch(err => {
                if (!silent) {
                    console.warn('[구글시트] 로드 실패 → 정적 데이터 사용:', err.message);
                }
            });
    }

    /* ─── RCPS 배열 업데이트 + UI 새로고침 ─── */
    function applyRecipes(recipes) {
        if (typeof RCPS === 'undefined' || typeof RCPS_CURATED === 'undefined') return;

        // RCPS 배열을 in-place로 교체 (const 배열이라 재할당 불가, 내용만 교체)
        RCPS.length = 0;
        RCPS.push(...RCPS_CURATED, ...recipes);

        // 필터 칩 재생성 (새 카테고리가 추가되었을 수 있으므로)
        const catBox = document.getElementById('rcp-category-chips');
        if (catBox) catBox.innerHTML = '';
        const calBox = document.getElementById('rcp-cal-chips');
        if (calBox) calBox.innerHTML = '';

        // 현재 레시피 탭이 열려 있으면 즉시 다시 그리기
        if (typeof renderRecipes === 'function') {
            renderRecipes();
        }
    }

    /* ─── 실행 ─── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadSheet);
    } else {
        // DOMContentLoaded 이후 약간 지연 → RCPS_CURATED 등이 먼저 정의되도록
        setTimeout(loadSheet, 100);
    }
})();
