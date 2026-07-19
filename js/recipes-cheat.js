/* ═══════════════════════════════════════════════════════════════════════
   recipes-cheat.js — 레시피 / 치팅데이 / 아바타 / 친구알림 (원본 100% 보존)
   ═══════════════════════════════════════════════════════════════════════ */

// ═══════════════════════ RECIPES ═══════════════════════
function rfil(el,k,v){S.rFilters[k]=S.rFilters[k]===v?null:v;document.querySelectorAll(`.chip[dfk="${k}"]`).forEach(c=>{c.classList.remove('on');});el.setAttribute('dfk',k);if(S.rFilters[k])el.classList.add('on');else el.classList.remove('on');renderRecipes();}
function renderRecipes(){
  const g=document.getElementById('rcp-grid');if(!g)return;
  const f=RCPS.filter(r=>{
    if(S.rFilters.time&&r.t>S.rFilters.time)return false;
    if(S.rFilters.type&&r.tp!==S.rFilters.type)return false;
    if(S.rFilters.cost&&r.cost>S.rFilters.cost)return false;
    return true;
  });
  const costLabel=c=>`~${(c/1000).toFixed(0)}천원`;
  g.innerHTML=f.map(r=>`<div class="recipe-card" onclick="showRecipeDetail(${RCPS.indexOf(r)})">
    <div style="display:flex;align-items:center;gap:12px">
      <span style="font-size:32px">${r.img}</span>
      <div style="flex:1">
        <div style="font-size:10px;color:var(--sky2);font-weight:700;text-transform:uppercase;letter-spacing:.5px">${r.tp}</div>
        <div style="font-size:14px;font-weight:700;color:var(--text)">${r.n}</div>
        <div style="display:flex;gap:5px;margin-top:4px">
          <span style="font-size:10px;background:var(--sky3);color:var(--sky2);padding:2px 7px;border-radius:99px;font-weight:700">⏱ ${r.t}분</span>
          <span style="font-size:10px;background:rgba(255,167,38,.1);color:var(--warn);padding:2px 7px;border-radius:99px;font-weight:700">💰 ${costLabel(r.cost)}</span>
          <span style="font-size:10px;background:var(--card2);color:var(--muted);padding:2px 7px;border-radius:99px;font-weight:700">${r.cal}kcal</span>
        </div>
      </div>
    </div>
  </div>`).join('');
}
function showRecipeDetail(idx){
  const r=RCPS[idx];
  document.getElementById('recipe-detail-body').innerHTML=`
    <div style="text-align:center;margin-bottom:16px">
      <div style="font-size:48px;margin-bottom:10px">${r.img}</div>
      <div class="serif" style="font-size:22px;font-weight:700;color:var(--text)">${r.n}</div>
      <div style="display:flex;gap:6px;justify-content:center;margin-top:8px">
        <span style="font-size:11px;background:var(--sky3);color:var(--sky2);padding:3px 10px;border-radius:99px;font-weight:700">⏱ ${r.t}분</span>
        <span style="font-size:11px;background:rgba(255,167,38,.1);color:var(--warn);padding:3px 10px;border-radius:99px;font-weight:700">💰 ~${r.cost.toLocaleString()}원</span>
        <span style="font-size:11px;background:var(--card2);color:var(--muted);padding:3px 10px;border-radius:99px;font-weight:700">${r.cal}kcal</span>
      </div>
    </div>
    <div class="card" style="margin-bottom:10px">
      <div class="cap">재료</div>
      ${r.ingredients.map(ing=>`<div style="padding:6px 0;border-bottom:1px solid var(--bdr);font-size:13px;color:var(--text);font-weight:500">• ${ing}</div>`).join('')}
      <button onclick="window.open('https://www.coupang.com/np/search?q=${encodeURIComponent(r.cpgQ)}','_blank')" style="width:100%;margin-top:12px;background:linear-gradient(135deg,#ff6400,#ff4500);border:none;border-radius:11px;padding:11px;color:white;font-size:13px;font-weight:700;cursor:pointer;font-family:'Nunito',sans-serif">🛒 쿠팡에서 재료 구매하기</button>
    </div>
    <div class="card">
      <div class="cap">만드는 방법</div>
      ${r.steps.map((s,i)=>`<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--bdr);align-items:flex-start">
        <div style="width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,var(--sky2),var(--lav2));display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;flex-shrink:0">${i+1}</div>
        <div style="font-size:13px;color:var(--text);font-weight:500;padding-top:3px">${s}</div>
      </div>`).join('')}
    </div>
    <button class="btn btn-o" style="margin-top:8px" onclick="closeMod('mod-recipe-detail')">닫기</button>`;
  openMod('mod-recipe-detail');
}

// ═══════════════════════ CHEAT DAY ═══════════════════════
function renderCheat(){
  const avail=CHEATS_ALL.filter(f=>f.cal<=S.savedTotal).slice(0,5);
  document.getElementById('cheat-list').innerHTML=avail.length?avail.map((f,i)=>`<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--card2);border-radius:12px;border:1.5px solid var(--bdr);cursor:pointer;transition:all .15s" onclick="pickCheat(${CHEATS_ALL.indexOf(f)})" onmouseenter="this.style.borderColor='var(--rose)'" onmouseleave="this.style.borderColor='var(--bdr)'"><span style="font-size:24px">${f.img}</span><div style="flex:1"><div style="font-size:13px;font-weight:700;color:var(--text)">${f.n}</div><div style="font-size:11px;color:var(--muted);font-weight:500">${f.cal}kcal</div></div><div style="font-size:11px;color:var(--ok);font-weight:700">선택</div></div>`).join('')
  :'<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px;font-weight:500">누적 세이브 칼로리가 부족해요<br>루틴을 더 달성해서 세이브를 늘려보세요 💪</div>';
}
function searchCheat(q){
  const dd=document.getElementById('cheat-dd');if(!q.trim()){dd.style.display='none';return;}
  const res=CHEATS_ALL.filter(f=>f.n.includes(q)).slice(0,6);if(!res.length){dd.style.display='none';return;}
  dd.innerHTML=res.map(f=>`<div class="ddi" onclick="pickCheat(${CHEATS_ALL.indexOf(f)})"><span style="font-weight:600">${f.img} ${f.n}</span><span style="font-size:11px;color:var(--muted);font-weight:600">${f.cal}kcal ${f.cal<=S.savedTotal?'✓':'세이브 부족'}</span></div>`).join('');
  dd.style.display='block';
}
function pickCheat(i){const f=CHEATS_ALL[i];S.savedTotal=Math.max(0,S.savedTotal-f.cal);updateHome();closeMod('mod-cheat');document.getElementById('notify-msg').value=`🍕 치팅! ${f.n}(${f.cal}kcal) 먹었어요! 같이 내일 열심히 해요 💪`;openMod('mod-notify');}
function sendNotify(){const msg=document.getElementById('notify-msg')?.value;const who=[];if(document.getElementById('nf1')?.checked)who.push('도파민헌터');if(document.getElementById('nf2')?.checked)who.push('바이오PM');closeMod('mod-notify');if(who.length)alert(`✅ ${who.join(', ')}에게 전송!\n"${msg}"`);}

// ═══════════════════════ AVATAR ═══════════════════════
function setAvatar(em){S.avatar=em;const el=document.getElementById('user-avatar');if(el)el.textContent=em;const mini=document.getElementById('prof-avatar-mini');if(mini)mini.textContent=em;closeMod('mod-avatar');}
