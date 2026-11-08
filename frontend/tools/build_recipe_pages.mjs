// 레시피 공개 페이지 만들기 (로그인 없이 열리고 검색엔진이 읽을 수 있는 정적 HTML)
//
//   /recipe            → dist/recipe/index.html   카테고리별 목록 + 검색
//   /recipe/r-xxxxxx   → dist/recipe/r-xxxxxx.html 레시피 하나
//   /sitemap.xml, /robots.txt
//
// vite build가 끝난 뒤(closeBundle) 실행된다. 데이터는 앱과 같은 파일을 읽는다:
//   public/js/data-recipes.js (RCPS_IMPORTED), app.html 안의 RCPS_CURATED, public/js/recipe-categories.js
// 주소(r-xxxxxx)는 레시피 이름으로 만든 해시라 데이터 순서가 바뀌어도 그대로 유지된다.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const SITE = 'https://bellamona.net';

let iconHtml = (r, px) => r.img || '🍽️';
let coupangLinkFor = () => 'https://link.coupang.com/a/cmjENT';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function fnv(str) { let h = 0x811c9dc5; for (const ch of str) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36).padStart(7, '0'); }

export function loadRecipes(root) {
  const ctx = vm.createContext({ console });
  vm.runInContext(readFileSync(resolve(root, 'public/js/recipe-categories.js'), 'utf8') + ';this.RECIPE_CATS=RECIPE_CATS;this.RECIPE_CAT_EMOJI=RECIPE_CAT_EMOJI;this.normalizeRecipe=normalizeRecipe;this.recipeIconHtml=recipeIconHtml;', ctx);
  vm.runInContext(readFileSync(resolve(root, 'public/js/data-recipes.js'), 'utf8') + ';this.RCPS_IMPORTED=RCPS_IMPORTED;', ctx);
  vm.runInContext(readFileSync(resolve(root, 'public/js/coupang-links.js'), 'utf8') + ';this.coupangLinkFor=coupangLinkFor;', ctx);
  coupangLinkFor = ctx.coupangLinkFor;
  const app = readFileSync(resolve(root, 'app.html'), 'utf8');
  const m = app.match(/const RCPS_CURATED = (\[[\s\S]*?\n\s*\]);/);
  const curated = m ? vm.runInContext(`(() => { const STEP_IMG = () => []; return ${m[1]}; })()`, ctx) : [];
  const seen = new Set();
  const list = [];
  for (const r0 of [...curated, ...ctx.RCPS_IMPORTED]) {
    if (!r0 || !r0.n || seen.has(r0.n)) continue;
    if (!Array.isArray(r0.ingredients) || !r0.ingredients.length || !Array.isArray(r0.steps) || !r0.steps.length) continue;
    seen.add(r0.n);
    const r = ctx.normalizeRecipe({ ...r0 });
    list.push({ ...r, ingredients: [...r0.ingredients], steps: [...r0.steps] });
  }
  // 주소: 이름 해시. 혹시 겹치면 뒤에 -2, -3
  const used = new Set();
  for (const r of list) {
    let slug = 'r-' + fnv(r.n), i = 2;
    while (used.has(slug)) slug = 'r-' + fnv(r.n) + '-' + i++;
    used.add(slug); r.slug = slug;
  }
  iconHtml = ctx.recipeIconHtml;
  return { recipes: list, cats: [...ctx.RECIPE_CATS], catEmoji: { ...ctx.RECIPE_CAT_EMOJI } };
}

const CSS = `
:root{--bg:#f8f4ff;--surf:#fff;--card2:#f3eeff;--bdr:#e2d9f3;--text:#2d1f4e;--muted:#7d6c9c;--lav2:#9575cd;--rose2:#ec407a;--grad:linear-gradient(135deg,#5bb8f5,#9575cd)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.65 'Nunito','Apple SD Gothic Neo','Malgun Gothic',sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}.wrap{max-width:760px;margin:0 auto;padding:0 16px}
header{background:var(--surf);border-bottom:1px solid var(--bdr)}header .wrap{display:flex;align-items:center;justify-content:space-between;height:56px}
.logo{font-family:'Playfair Display',serif;font-weight:700;font-size:20px;text-decoration:none}
.btn{display:inline-block;background:var(--grad);color:#fff;text-decoration:none;font-weight:800;border-radius:999px;padding:10px 18px;font-size:14px}
.btn.sm{padding:7px 14px;font-size:13px}
main{padding:24px 0 48px}.crumb{font-size:13px;color:var(--muted);margin-bottom:12px}.crumb a{text-decoration:none}
h1{font-size:26px;line-height:1.3;margin:6px 0 10px}h2{font-size:18px;margin:28px 0 10px}
.tag{display:inline-block;background:var(--card2);color:var(--lav2);border-radius:999px;padding:2px 10px;font-size:13px;font-weight:700}
.badges{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 4px}.badges span{background:var(--surf);border:1px solid var(--bdr);border-radius:999px;padding:3px 10px;font-size:13px}
.hero{font-size:56px;line-height:1}
.card{background:var(--surf);border:1px solid var(--bdr);border-radius:16px;padding:18px 20px}
ul.ing{list-style:none;padding:0;margin:0}ul.ing li{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px dashed var(--bdr)}ul.ing li:last-child{border-bottom:0}
ul.ing a{font-size:13px;color:var(--rose2);text-decoration:none;white-space:nowrap;font-weight:700}
ol.steps{padding-left:22px;margin:0}ol.steps li{margin:0 0 10px}
.tip{background:var(--card2);border-radius:12px;padding:12px 14px;font-size:15px}
.cta{margin:28px 0;text-align:center;background:var(--surf);border:1px solid var(--bdr);border-radius:16px;padding:22px 18px}.cta p{margin:0 0 12px}
.note{font-size:12px;color:var(--muted)}
.disclose{margin:0 0 14px;padding:8px 12px;border-radius:10px;background:var(--card2);color:var(--lav2);font-size:13px;font-weight:700}
.rel{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
.rel a,.item{display:flex;gap:10px;align-items:center;background:var(--surf);border:1px solid var(--bdr);border-radius:12px;padding:10px 12px;text-decoration:none}
.item .t{font-weight:700;font-size:15px;line-height:1.35}.item .m{font-size:12px;color:var(--muted)}.item .e{font-size:24px}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}.chips a{background:var(--surf);border:1px solid var(--bdr);border-radius:999px;padding:4px 12px;font-size:13px;text-decoration:none}
input.search{width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--bdr);font:inherit;background:var(--surf)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
footer{border-top:1px solid var(--bdr);padding:20px 0;font-size:12px;color:var(--muted)}
`;

function page({ title, description, path, body, jsonLd }) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${SITE}${path}" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${SITE}${path}" />
<meta property="og:site_name" content="Bellamona" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Nunito:wght@400;700;800&display=swap" rel="stylesheet" />
<style>${CSS}</style>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<header><div class="wrap"><a class="logo" href="/">Bellamona</a><a class="btn sm" href="/login">기록 시작하기</a></div></header>
<main><div class="wrap">${body}</div></main>
<footer><div class="wrap">Bellamona는 건강 습관 기록을 돕는 서비스이며, 의학적 진단이나 치료를 대신하지 않아요. 칼로리와 비용은 재료로 계산한 추정치예요.</div></footer>
</body>
</html>`;
}

function recipePage(r, related, catEmoji) {
  const desc = `${r.n} 레시피. ${r.t}분, 재료 ${r.ingredients.length}가지${r.cal != null ? `, 약 ${r.cal}kcal(추정)` : ''}. ${r.ingredients.slice(0, 5).join(', ')}`;
  const body = `
<p class="disclose">이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</p>
<div class="crumb"><a href="/recipe">레시피</a> › <a href="/recipe#${encodeURIComponent(r.tp)}">${esc(r.tp)}</a></div>
<div class="hero">${iconHtml(r, 56)}</div>
<span class="tag">${esc(r.tp)}</span>
<h1>${esc(r.n)}</h1>
<div class="badges"><span>⏱ ${esc(r.t)}분</span>${r.cost ? `<span>💰 약 ${Number(r.cost).toLocaleString('ko-KR')}원</span>` : ''}${r.cal != null ? `<span>🔥 약 ${esc(r.cal)}kcal (추정)</span>` : ''}</div>

<h2>재료</h2>
<div class="card"><ul class="ing">
${r.ingredients.map(i => `<li><span>${esc(i)}</span><a href="${esc(coupangLinkFor(i))}" target="_blank" rel="sponsored nofollow noopener">쿠팡에서 보기</a></li>`).join('\n')}
</ul></div>

<h2>만드는 법</h2>
<div class="card"><ol class="steps">
${r.steps.map(s => `<li>${esc(s)}</li>`).join('\n')}
</ol></div>
${r.tip ? `<h2>팁</h2><div class="tip">${esc(r.tip)}</div>` : ''}

<div class="cta">
  <p><b>이 메뉴 먹고 나면, 내 몸은 어떻게 반응할까?</b><br><span class="note">벨라모나에 식사를 기록하면 기록이 쌓일수록 나에게 맞는 패턴을 알려 줘요.</span></p>
  <a class="btn" href="/login">벨라모나에 기록하기</a>
</div>

${related.length ? `<h2>${esc(r.tp)} 레시피 더 보기</h2><div class="rel">${related.map(x => `<a href="/recipe/${x.slug}"><span class="e">${iconHtml(x, 24)}</span><span>${esc(x.n)}</span></a>`).join('')}</div>` : ''}`;
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Recipe', name: r.n, recipeCategory: r.tp,
    totalTime: `PT${Number(r.t) || 0}M`, recipeIngredient: r.ingredients,
    recipeInstructions: r.steps.map(s => ({ '@type': 'HowToStep', text: s })),
    author: { '@type': 'Organization', name: 'Bellamona' },
  };
  return page({ title: `${r.n} 레시피 | 벨라모나`, description: desc, path: `/recipe/${r.slug}`, body, jsonLd });
}

function listPage(recipes, cats, catEmoji) {
  const byCat = Object.fromEntries(cats.map(c => [c, []]));
  for (const r of recipes) (byCat[r.tp] || (byCat[r.tp] = [])).push(r);
  const present = Object.keys(byCat).filter(c => byCat[c].length);
  const body = `
<h1>건강하게 먹는 레시피 ${recipes.length.toLocaleString('ko-KR')}가지</h1>
<p class="note" style="font-size:14px">로그인 없이 볼 수 있어요. 재료 옆 링크로 장보기까지 한 번에.</p>
<input class="search" id="q" type="search" placeholder="메뉴나 재료로 찾기 (예: 닭가슴살, 두부, 샐러드)" autocomplete="off" />
<div class="chips">${present.map(c => `<a href="#${encodeURIComponent(c)}">${esc(c)} ${byCat[c].length}</a>`).join('')}</div>
${present.map(c => `<section data-cat><h2 id="${esc(c)}">${esc(c)}</h2><div class="grid">
${byCat[c].map(r => `<a class="item" href="/recipe/${r.slug}" data-k="${esc((r.n + ' ' + r.ingredients.join(' ')).toLowerCase())}"><span class="e">${iconHtml(r, 24)}</span><span><span class="t">${esc(r.n)}</span><br><span class="m">${esc(r.t)}분${r.cal != null ? ` · 약 ${esc(r.cal)}kcal` : ''}</span></span></a>`).join('\n')}
</div></section>`).join('\n')}
<p id="none" class="note" hidden>찾는 레시피가 없어요.</p>
<div class="cta"><p><b>먹은 걸 기록하면, 내 몸의 패턴이 보여요</b></p><a class="btn" href="/login">벨라모나 시작하기</a></div>
<script>
(function(){var q=document.getElementById('q'),items=[].slice.call(document.querySelectorAll('.item')),secs=[].slice.call(document.querySelectorAll('section[data-cat]')),none=document.getElementById('none');
q.addEventListener('input',function(){var v=q.value.trim().toLowerCase(),any=false;items.forEach(function(a){var ok=!v||a.getAttribute('data-k').indexOf(v)>=0;a.hidden=!ok;if(ok)any=true;});
secs.forEach(function(s){s.hidden=!s.querySelector('.item:not([hidden])');});none.hidden=any;});})();
</script>`;
  return page({ title: '건강 레시피 모음 | 벨라모나', description: `닭가슴살, 두부, 샐러드부터 디저트까지 ${recipes.length}가지 레시피. 재료, 만드는 법, 추정 칼로리를 한 번에.`, path: '/recipe', body });
}

export function buildRecipePages(root, outDir) {
  const { recipes, cats, catEmoji } = loadRecipes(root);
  const dir = resolve(outDir, 'recipe');
  mkdirSync(dir, { recursive: true });
  const byCat = {};
  recipes.forEach(r => (byCat[r.tp] ||= []).push(r));
  for (const r of recipes) {
    const same = byCat[r.tp];
    const i = same.indexOf(r);
    const related = [];
    for (let k = 1; k < same.length && related.length < 6; k++) related.push(same[(i + k) % same.length]);
    writeFileSync(resolve(dir, `${r.slug}.html`), recipePage(r, related, catEmoji));
  }
  writeFileSync(resolve(dir, 'index.html'), listPage(recipes, cats, catEmoji));
  const today = new Date().toISOString().slice(0, 10);
  const urls = ['/', '/recipe', ...recipes.map(r => `/recipe/${r.slug}`)];
  writeFileSync(resolve(outDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  if (!existsSync(resolve(root, 'public/robots.txt'))) {
    writeFileSync(resolve(outDir, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${SITE}/sitemap.xml\n`);
  }
  return recipes.length;
}
