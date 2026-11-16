// 레시피 구글 시트를 빌드할 때 한 번 읽어 dist/data/recipe-sheet.json 으로 저장한다.
// 앱은 이 파일을 먼저 읽고(빠르고, 구글 쪽 응답 한도와 상관없음), 파일이 없을 때만 시트를 직접 읽는다.
// 시트 내용이 바뀌면 다음 배포 때 새로 저장된다.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const SHEET_ID = '1_csWpbLnQsoJm9EYyWZfdL8-JyyQHhB16tfXu_UexQA';
const GID = 0;
// 앱이 쓰는 컬럼만: F 카테고리, G 음식이름, H 시간, I 가격, J 맛, K 주재료, L 부재료, M 양념, N 순서, O 팁, P 칼로리
const QUERY = 'select F,G,H,I,J,K,L,M,N,O,P where G is not null';
const PAGE_ROWS = 4000;

const url = (offset) => `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${GID}&tq=${encodeURIComponent(`${QUERY} limit ${PAGE_ROWS} offset ${offset}`)}`;

async function fetchPage(offset) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 60000);
  try {
    const res = await fetch(url(offset), { signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const g = JSON.parse(text.replace(/^[^{]*/, '').replace(/\);?\s*$/, '').trim());
    if (g.status === 'error' || !g.table) throw new Error((g.errors && g.errors[0] && (g.errors[0].detailed_message || g.errors[0].message)) || '응답 형식 오류');
    return g.table;
  } finally { clearTimeout(t); }
}

export async function snapshotRecipeSheet(outDir) {
  try {
    let cols = null;
    const rows = [];
    for (let offset = 0; offset < 200000; offset += PAGE_ROWS) {
      let table = null;
      for (let attempt = 0; attempt < 3 && !table; attempt++) {
        try { table = await fetchPage(offset); } catch (e) { if (attempt === 2) throw e; await new Promise(r => setTimeout(r, 2000)); }
      }
      if (!cols) cols = table.cols.map(c => (c.label || '').trim());
      for (const row of table.rows || []) rows.push((row.c || []).map(cell => (cell && cell.v != null) ? cell.v : ''));
      if ((table.rows || []).length < PAGE_ROWS) break;
    }
    if (!rows.length) throw new Error('행이 없습니다');
    const at = new Date().toISOString();
    mkdirSync(resolve(outDir, 'data'), { recursive: true });
    writeFileSync(resolve(outDir, 'data/recipe-sheet.json'), JSON.stringify({ at, cols, rows }));
    writeFileSync(resolve(outDir, 'data/recipe-sheet-meta.json'), JSON.stringify({ at, rows: rows.length }));
    return rows.length;
  } catch (e) {
    // 시트를 못 읽어도 배포는 계속한다(앱은 시트를 직접 읽는 방식으로 돌아간다)
    console.warn('[recipe sheet] 저장 실패, 앱이 시트를 직접 읽습니다:', e.message);
    return 0;
  }
}
