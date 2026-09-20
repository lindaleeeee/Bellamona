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
    const CACHE_KEY = 'bellamona_sheet_recipes_v2'; // 시트/쿼리를 바꾸면 이전 캐시(다른 시트 데이터)를 쓰지 않도록 키를 올린다
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
                    if (r && !seen.has(r.n)) {
                        seen.add(r.n);
                        recipes.push(r);
                    }
                }

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
