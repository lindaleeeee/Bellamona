/* ═══════════════════════════════════════════════════════════════════════
   insulin.js — 인슐린(혈당·식단) 화면
   원본 renderInsulin/renderBGChart/식사·혈당 로직 100% 보존.
   ★변경점(발전): 단순 predBG() → GMODEL(명세서 4단계 예측 엔진) 연결
     - 식사별 예측: ΔPeak·신뢰도·방법·유사식사수·disclaimer 표시
     - 혈당 실측 입력 시 GMODEL.makeTrainingPair로 학습쌍 자동 축적
     - "예측 vs 실측" 적중률 카드 추가
   ═══════════════════════════════════════════════════════════════════════ */

/* 현재 생리주기 phase 계산 (예측 컨텍스트용) — 간이 버전.
   기존 달력 로직과 동일 기준(배란기/생리기 근처)으로 황체기 추정. */
function currentCyclePhase(){
  // 데모 상태에서 대시보드가 '황체기 21일차'로 표기 → luteal 기본값과 정합
  try{
    const p=S.periods&&S.periods.length?S.periods[S.periods.length-1]:null;
    if(!p)return 'unknown';
    const start=new Date(p.start);
    const today=new Date(2026,3,22); // 데모 기준일(원본 today=22일과 정합)
    const dayIdx=Math.floor((today-start)/86400000)%S.cycleLen;
    if(dayIdx<p.days)return 'menstrual';
    if(dayIdx>=S.cycleLen-18 && dayIdx<=S.cycleLen-10)return 'ovulation';
    if(dayIdx>=S.cycleLen-9)return 'luteal';
    return 'follicular';
  }catch(e){return 'unknown';}
}

/* 식사 → 예측 결과 (명세서 엔진 호출). history=개인 학습쌍 */
function predictMeal(m){
  const ctx={cyclePhase:currentCyclePhase(),workoutPost:!!S.checks.i2};
  return GMODEL.predict(m,ctx,S.trainingPairs);
}

// ── INSULIN 화면 렌더 ──
function renderInsulin(){
  const intake=totalIntake();const net=getNet();const save=getSave();
  const lastMealTime=S.meals.filter(m=>m.foods.length>0).map(m=>m.time).sort().pop();
  let fastHours=0;
  if(lastMealTime){const[hh,mm]=lastMealTime.split(':').map(Number);const now=new Date();const last=new Date();last.setHours(hh,mm,0,0);if(last>now)last.setDate(last.getDate()-1);fastHours=Math.round((now-last)/3600000*10)/10;}

  // ★ 개인화 진행도(명세서 §7): 학습쌍 개수로 예측 단계 안내
  const nPairs=S.trainingPairs.filter(p=>p.valid).length;
  const hr=GMODEL.hitRate(S.predLogs);

  const mHtml=S.meals.map((m,mi)=>{
    const cal=mCalc(m,'cal');const carb=mCarb(m);const prot=mProt(m);const fat=mFat(m);const gi=mGI(m);const hasFoods=m.foods.length>0;
    const gl=hasFoods?Math.round(gi*carb/100):0;
    // ★ 새 예측 엔진
    const pred=hasFoods?predictMeal(m):null;
    const peak=pred?pred.peakEstimate:null;
    const foodRows=m.foods.map((f,fi)=>`
      <div class="fi"><span style="flex:1;font-size:12px;color:var(--text);font-weight:600">${f.food.n}</span>
        <input type="number" min="0.5" step="0.5" value="${f.qty}" onchange="updQty(${m.id},${fi},this.value)" style="width:50px;background:var(--card2);border:1.5px solid var(--bdr);border-radius:8px;padding:4px 5px;color:var(--text);font-size:12px;font-weight:700;text-align:center;outline:none;font-family:'Nunito',sans-serif"/>
        <span style="font-size:9px;color:var(--muted);width:26px;text-align:center;font-weight:600">${f.food.unit}</span>
        <span style="font-size:12px;font-weight:800;color:var(--sky2);width:38px;text-align:right">${Math.round(f.food.cal*f.g/100)}</span>
        <button onclick="rmFood(${m.id},${fi})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:0 2px;line-height:1">×</button>
      </div>`).join('');
    // ★ 예측 카드 HTML (신뢰도 배지/방법/근거/disclaimer 포함)
    let predHtml='';
    if(carb>0&&pred){
      const lvColor=pred.level==='high'?'var(--danger)':pred.level==='medium'?'var(--warn)':'var(--sky2)';
      const lvBg=pred.level==='high'?'rgba(239,83,80,.08)':pred.level==='medium'?'rgba(255,167,38,.08)':'rgba(91,184,245,.08)';
      const lvBd=pred.level==='high'?'rgba(239,83,80,.25)':pred.level==='medium'?'rgba(255,167,38,.25)':'rgba(91,184,245,.25)';
      const methodLabel={rule:'기본 추정',knn:'개인 데이터',ml:'AI 모델',ml_personal:'개인 AI'}[pred.method]||'추정';
      const rangeTxt=pred.range?` (${pred.range[0]}~${pred.range[1]})`:'';
      predHtml=`<div style="background:${lvBg};border:1.5px solid ${lvBd};border-radius:12px;padding:10px 12px">
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:5px;align-items:center">
          <span style="font-size:11px;font-weight:800;padding:2px 9px;border-radius:99px;background:${gl<10?'rgba(102,187,106,.15)':gl<20?'rgba(255,167,38,.15)':'rgba(239,83,80,.15)'};color:${gl<10?'var(--ok)':gl<20?'var(--warn)':'var(--danger)'}">GL ${gl}</span>
          <span style="font-size:11px;font-weight:700;padding:2px 9px;border-radius:99px;background:var(--lav3);color:var(--lav2)">GI ${gi}</span>
          <span class="pred-badge ${pred.confidence}">${pred.confidence==='high'?'신뢰 높음':pred.confidence==='medium'?'신뢰 보통':'신뢰 낮음'}</span>
          <span class="pred-method">· ${methodLabel}${pred.similarN?` ${pred.similarN}건`:''}</span>
        </div>
        <div style="font-size:12px;color:var(--text);font-weight:600">예측 상승폭 <strong style="color:${lvColor}">+${pred.deltaPeak} mg/dL</strong> → 예상 피크 <strong style="color:${lvColor}">${peak}${rangeTxt}</strong> ${pred.level==='high'?'⚠️ 높음':pred.level==='medium'?'주의':'✓ 양호'}</div>
        ${pred.evidence?`<div style="font-size:10px;color:var(--muted);margin-top:3px;font-weight:500">📊 ${pred.evidence}</div>`:''}
        ${pred.lowData?'<div style="font-size:10px;color:var(--muted);margin-top:2px;font-weight:500">데이터가 더 쌓이면 정확해져요 (2주 목표)</div>':''}
        ${!m.bgPre?'<div style="font-size:10px;color:var(--muted);margin-top:2px;font-weight:500">공복 혈당 입력 시 더 정확해져요</div>':''}
        <div class="pred-disclaimer">※ ${pred.disclaimer}</div>
      </div>`;
    }
    return`<div class="mb${hasFoods?' hd':''}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${hasFoods?'10px':'0'}">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:34px;height:34px;border-radius:10px;background:${['rgba(91,184,245,.15)','rgba(129,199,132,.15)','rgba(179,157,219,.15)','rgba(244,143,177,.15)'][mi%4]};display:flex;align-items:center;justify-content:center;font-size:14px">${['🌅','☀️','🌙','🍎'][mi%4]}</div>
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--text)">${m.label}</div>
            <input type="time" value="${m.time}" onchange="updMealTime(${m.id},this.value)" style="font-size:10px;color:var(--muted);background:transparent;border:none;outline:none;font-family:'Nunito',sans-serif;font-weight:600;cursor:pointer"/>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          ${hasFoods?`<div style="text-align:right"><div style="font-size:15px;font-weight:800;color:var(--sky2)">${cal}</div><div style="font-size:9px;color:var(--muted);font-weight:600">kcal</div></div>`:''}
          <button onclick="openFoodModal(${m.id})" style="background:var(--sky3);border:1.5px solid rgba(91,184,245,.3);border-radius:9px;padding:6px 12px;font-size:12px;color:var(--sky2);cursor:pointer;font-family:'Nunito',sans-serif;font-weight:700">+ 음식</button>
          <button onclick="delMeal(${m.id})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px;line-height:1;padding:0">×</button>
        </div>
      </div>
      ${hasFoods?`
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:10px">
        <div style="text-align:center;background:var(--sky3);border-radius:9px;padding:6px 3px;border:1px solid rgba(91,184,245,.2)"><div style="font-size:12px;font-weight:800;color:var(--sky2)">${cal}</div><div style="font-size:9px;color:var(--muted);font-weight:600">kcal</div></div>
        <div style="text-align:center;background:rgba(255,167,38,.1);border-radius:9px;padding:6px 3px;border:1px solid rgba(255,167,38,.2)"><div style="font-size:12px;font-weight:800;color:var(--warn)">${carb}g</div><div style="font-size:9px;color:var(--muted);font-weight:600">탄수</div></div>
        <div style="text-align:center;background:var(--lav3);border-radius:9px;padding:6px 3px;border:1px solid rgba(149,117,205,.2)"><div style="font-size:12px;font-weight:800;color:var(--lav2)">${prot}g</div><div style="font-size:9px;color:var(--muted);font-weight:600">단백</div></div>
        <div style="text-align:center;background:var(--card2);border-radius:9px;padding:6px 3px;border:1px solid var(--bdr)"><div style="font-size:12px;font-weight:800;color:var(--muted)">${fat}g</div><div style="font-size:9px;color:var(--muted);font-weight:600">지방</div></div>
      </div>
      <div style="border-top:1px solid var(--bdr);padding-top:8px;margin-bottom:8px">
        <div style="display:flex;font-size:9px;color:var(--muted);padding:0 0 5px;gap:8px;font-weight:600"><span style="flex:1">음식</span><span style="width:50px;text-align:center">수량</span><span style="width:26px"></span><span style="width:38px;text-align:right">kcal</span><span style="width:20px"></span></div>
        ${foodRows}
      </div>
      <div style="border-top:1px solid var(--bdr);padding-top:10px;margin-bottom:8px">
        <div class="cap" style="margin-bottom:6px">혈당 실측 입력</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
          <div style="display:flex;flex-direction:column;gap:3px"><div style="font-size:10px;color:var(--muted);text-align:center;font-weight:600">공복</div><input class="bg-inp" type="number" placeholder="mg/dL" value="${m.bgPre||''}" onchange="updBG(${m.id},'bgPre',this.value)"/></div>
          <div style="display:flex;flex-direction:column;gap:3px"><div style="font-size:10px;color:var(--muted);text-align:center;font-weight:600">식후 1시간</div><input class="bg-inp" type="number" placeholder="mg/dL" value="${m.bg1h||''}" onchange="updBG(${m.id},'bg1h',this.value)"/></div>
          <div style="display:flex;flex-direction:column;gap:3px"><div style="font-size:10px;color:var(--muted);text-align:center;font-weight:600">식후 2시간</div><input class="bg-inp" type="number" placeholder="mg/dL" value="${m.bg2h||''}" onchange="updBG(${m.id},'bg2h',this.value)"/></div>
        </div>
      </div>
      ${predHtml}
      `:`<div style="font-size:11px;color:var(--muted);text-align:center;padding:10px 0;font-weight:500">+ 음식 버튼으로 식사를 기록하세요</div>`}
    </div>`;
  }).join('');

  return`
  <div class="card" style="border-color:rgba(91,184,245,.3)">
    <div class="cap">⏱ 공복 타이머</div>
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:28px;font-weight:800;color:var(--sky2)">${fastHours ? fastHours+'h' : '—'}</div>
      <div style="font-size:12px;color:var(--muted);font-weight:500;text-align:right">
        ${fastHours?`마지막 식사: ${lastMealTime}<br><span style="color:${fastHours>=16?'var(--ok)':'var(--sky2)'};font-weight:700">${fastHours>=16?'✅ 16시간 달성!':'목표까지 '+(16-fastHours).toFixed(1)+'h'}</span>`:'식사를 기록하면 시작돼요'}
      </div>
    </div>
  </div>
  <!-- ★ 개인화 예측 진행도 카드 (명세서 §7 데이터 볼륨) -->
  <div class="card" style="border-color:rgba(179,157,219,.3);background:linear-gradient(135deg,var(--lav3),var(--sky3))">
    <div class="cap" style="color:var(--lav2)">🤖 AI 혈당 예측 개인화</div>
    <div style="display:flex;align-items:center;gap:10px">
      <div style="flex:1">
        <div class="bar-t" style="height:7px;margin-bottom:5px"><div class="bar-f" style="width:${Math.min(nPairs/40*100,100)}%;background:linear-gradient(90deg,var(--lav2),var(--sky2))"></div></div>
        <div style="font-size:11px;color:var(--text);font-weight:600">학습 데이터 <strong style="color:var(--lav2)">${nPairs}</strong>건 / 개인화 목표 40건(약 2주)</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px;font-weight:500">${nPairs>=40?'✅ 개인 예측 안정 단계':nPairs>=5?'개인 데이터 예측 작동 중':'현재 기본 추정 단계 · 혈당을 기록하면 정확해져요'}</div>
      </div>
      ${hr!=null?`<div style="text-align:center;background:var(--surf);border-radius:12px;padding:8px 12px;border:1px solid var(--bdr)"><div style="font-size:18px;font-weight:800;color:var(--ok)">${hr}%</div><div style="font-size:9px;color:var(--muted);font-weight:600">예측 적중률</div></div>`:''}
    </div>
  </div>
  <div class="card" style="border-color:rgba(91,184,245,.25)">
    <div class="cap">칼로리 — 인슐린 ↔ 성장호르몬 연동</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <div style="background:var(--sky3);border-radius:12px;padding:10px;text-align:center;border:1px solid rgba(91,184,245,.2)"><div style="font-size:10px;color:var(--muted);font-weight:600">🩺 섭취</div><div style="font-size:22px;font-weight:800;color:var(--sky2)">${intake}</div><div style="font-size:9px;color:var(--muted);font-weight:600">목표 ${S.goalCal}kcal</div></div>
      <div style="background:var(--gro-bg);border-radius:12px;padding:10px;text-align:center;border:1px solid rgba(129,199,132,.2)"><div style="font-size:10px;color:var(--muted);font-weight:600">💪 소모</div><div style="font-size:22px;font-weight:800;color:var(--gro)">${totalBurned()}</div><div style="font-size:9px;color:var(--muted);font-weight:600">NET ${getNet()}kcal</div></div>
    </div>
    ${getSave()>=0?`<div style="font-size:12px;color:var(--ok);background:rgba(102,187,106,.1);border:1.5px solid rgba(102,187,106,.25);border-radius:11px;padding:8px 12px;font-weight:700">✅ 오늘 ${getSave()}kcal 세이브 · 누적 ${S.savedTotal}kcal</div>`:`<div style="font-size:12px;color:var(--danger);background:rgba(239,83,80,.07);border:1.5px solid rgba(239,83,80,.2);border-radius:11px;padding:8px 12px;font-weight:700">⚠️ ${Math.abs(getSave())}kcal 초과 → 💪 운동으로 더 소모하세요</div>`}
  </div>
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div class="cap" style="margin-bottom:0">식사 기록</div>
      <button onclick="addMeal()" style="background:var(--sky3);border:1.5px solid rgba(91,184,245,.3);border-radius:8px;padding:5px 12px;font-size:12px;color:var(--sky2);cursor:pointer;font-family:'Nunito',sans-serif;font-weight:700">+ 식사 추가</button>
    </div>
    ${mHtml}
    <div style="border-top:1px solid var(--bdr);padding-top:10px;margin-top:6px">
      <div class="cap" style="margin-bottom:5px">혈당 추이 (최대 250mg/dL)</div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-bottom:4px">
        <div style="display:flex;align-items:center;gap:3px;font-size:9px;color:var(--sky2);font-weight:700"><div style="width:16px;height:2px;background:var(--sky2);border-radius:1px"></div>실측</div>
        <div style="display:flex;align-items:center;gap:3px;font-size:9px;color:var(--warn);font-weight:700"><div style="width:16px;height:2px;background:var(--warn);border-radius:1px;border-top:1px dashed var(--warn)"></div>예측</div>
      </div>
      <svg width="100%" height="90" viewBox="0 0 310 90" id="bg-svg">
        <rect x="0" y="14" width="310" height="17" fill="rgba(91,184,245,.06)" rx="2"/>
        <line x1="0" y1="5" x2="310" y2="5" stroke="var(--bdr)" stroke-width=".7" stroke-dasharray="3 2"/>
        <line x1="0" y1="31" x2="310" y2="31" stroke="var(--bdr)" stroke-width=".7" stroke-dasharray="3 2"/>
        <line x1="0" y1="56" x2="310" y2="56" stroke="var(--bdr)" stroke-width=".7" stroke-dasharray="3 2"/>
        <line x1="0" y1="81" x2="310" y2="81" stroke="var(--bdr)" stroke-width=".7" stroke-dasharray="3 2"/>
        <text x="263" y="8" font-size="8" fill="var(--muted)" font-family="Nunito" font-weight="700">250</text>
        <text x="263" y="34" font-size="8" fill="var(--muted)" font-family="Nunito" font-weight="700">180</text>
        <text x="263" y="59" font-size="8" fill="var(--muted)" font-family="Nunito" font-weight="700">140</text>
        <text x="263" y="84" font-size="8" fill="var(--muted)" font-family="Nunito" font-weight="700">70</text>
        <g id="bg-line-g"></g><g id="bg-dot-g"></g>
      </svg>
    </div>
  </div>
  <div class="cap" style="padding:0 2px;margin-bottom:6px">루틴 체크</div>
  ${S.routines.insulin.map(r=>ckHtml(r.id,r.label,r.sub,'var(--sky2)')).join('')}`;
}

function updMealTime(id,val){const m=S.meals.find(x=>x.id===id);if(m)m.time=val;goH('insulin');}

// ── 혈당 추이 차트 (원본 로직 보존, 예측 피크만 새 엔진으로 계산) ──
function renderBGChart(){
  const lg=document.getElementById('bg-line-g');const dg=document.getElementById('bg-dot-g');if(!lg||!dg)return;lg.innerHTML='';dg.innerHTML='';
  const pts=[];
  S.meals.forEach((m,mi)=>{
    if(!m.foods.length)return;
    const x=20+mi*90;const carb=mCarb(m);const base=m.bgPre||90;
    const pred=predictMeal(m);const peak=pred?pred.peakEstimate:base;
    const toY=bg=>81-Math.round((Math.min(Math.max(bg,70),250)-70)/(250-70)*76);
    if(m.bgPre)pts.push({x,y:toY(m.bgPre),v:m.bgPre,real:true});
    else pts.push({x,y:toY(base),v:base,real:false});
    if(carb>0){
      if(m.bg1h)pts.push({x:x+38,y:toY(m.bg1h),v:m.bg1h,real:true});
      else pts.push({x:x+38,y:toY(peak),v:peak,real:false});
      const r2=Math.max(base-5,88);
      if(m.bg2h)pts.push({x:x+72,y:toY(m.bg2h),v:m.bg2h,real:true});
      else pts.push({x:x+72,y:toY(r2),v:r2,real:false});
    }
  });
  if(pts.length<2)return;
  const pD=pts.map((p,i)=>`${i===0?'M':'L'}${p.x},${p.y}`).join(' ');
  const pl=document.createElementNS('http://www.w3.org/2000/svg','path');pl.setAttribute('d',pD);pl.setAttribute('fill','none');pl.setAttribute('stroke','rgba(255,167,38,.6)');pl.setAttribute('stroke-width','2');pl.setAttribute('stroke-dasharray','4 3');pl.setAttribute('stroke-linecap','round');lg.appendChild(pl);
  const rPts=pts.filter(p=>p.real);if(rPts.length>=2){const rD=rPts.map((p,i)=>`${i===0?'M':'L'}${p.x},${p.y}`).join(' ');const rl=document.createElementNS('http://www.w3.org/2000/svg','path');rl.setAttribute('d',rD);rl.setAttribute('fill','none');rl.setAttribute('stroke','var(--sky2)');rl.setAttribute('stroke-width','2.5');rl.setAttribute('stroke-linecap','round');lg.appendChild(rl);}
  pts.forEach(p=>{const col=p.v>180?'var(--danger)':p.v>140?'var(--warn)':p.real?'var(--sky2)':'rgba(255,167,38,.8)';const c=document.createElementNS('http://www.w3.org/2000/svg','circle');c.setAttribute('cx',p.x);c.setAttribute('cy',p.y);c.setAttribute('r',p.real?'4':'3');if(p.real)c.setAttribute('fill',col);else{c.setAttribute('fill','none');c.setAttribute('stroke',col);c.setAttribute('stroke-width','1.5');}dg.appendChild(c);const t=document.createElementNS('http://www.w3.org/2000/svg','text');t.setAttribute('x',p.x);t.setAttribute('y',p.y-7);t.setAttribute('text-anchor','middle');t.setAttribute('font-size','9');t.setAttribute('fill',col);t.setAttribute('font-family','Nunito');t.setAttribute('font-weight','700');t.textContent=p.v;dg.appendChild(t);});
}

// ═══════════════════════ FOOD SEARCH (원본 보존) ═══════════════════════
function openFoodModal(mealId){
  S.activeMealId=mealId;S.pending=[];
  const m=S.meals.find(x=>x.id===mealId);
  setTxt('food-title',`${['🌅','☀️','🌙','🍎'][S.meals.indexOf(m)%4]} ${m.label} — 음식 추가`);
  document.getElementById('food-q').value='';document.getElementById('food-dd').style.display='none';
  renderPending();openMod('mod-food');
  setTimeout(()=>document.getElementById('food-q')?.focus(),300);
}
function searchFood(q){
  const dd=document.getElementById('food-dd');if(!q.trim()){dd.style.display='none';return;}
  const res=FDB.filter(f=>f.n.includes(q)).slice(0,10);if(!res.length){dd.style.display='none';return;}
  dd.innerHTML=res.map((f,i)=>`<div class="ddi" onclick="addPending(${FDB.indexOf(f)})"><span style="font-weight:600">${f.n}</span><span style="font-size:10px;color:var(--muted);font-weight:600">${f.cal}kcal/100g · ${f.unit}당 ${Math.round(f.cal*f.ug/100)}kcal</span></div>`).join('');
  dd.style.display='block';
}
function addPending(idx){const food=FDB[idx];S.pending.push({food,qty:1,g:food.ug});document.getElementById('food-q').value='';document.getElementById('food-dd').style.display='none';renderPending();}
function rmPending(i){S.pending.splice(i,1);renderPending();}
function updPendQty(i,val){const q=parseFloat(val)||0;S.pending[i].qty=q;S.pending[i].g=q*S.pending[i].food.ug;renderPending();}
function renderPending(){
  const list=document.getElementById('pend-list');const prev=document.getElementById('pend-prev');if(!S.pending.length){list.innerHTML='<div style="font-size:11px;color:var(--muted);text-align:center;padding:12px 0;font-weight:500">음식을 검색해서 추가하세요 👆</div>';prev.style.display='none';return;}
  const tC=S.pending.reduce((a,f)=>a+Math.round(f.food.cal*f.g/100),0);const tCb=S.pending.reduce((a,f)=>a+Math.round(f.food.c*f.g/100),0);const tP=S.pending.reduce((a,f)=>a+Math.round(f.food.p*f.g/100),0);const tF=S.pending.reduce((a,f)=>a+Math.round(f.food.f*f.g/100),0);const avgGI=tCb>0?Math.round(S.pending.reduce((a,f)=>a+f.food.gi*(f.food.c*f.g/100),0)/tCb):0;const gl=Math.round(avgGI*tCb/100);
  // ★ 미리보기 예측도 새 엔진 사용 (가상 식사 객체 구성)
  const nowH=new Date().getHours();
  const virtualMeal={foods:S.pending.map(f=>({food:f.food,g:f.g})),time:`${nowH}:00`,bgPre:null};
  const pred=GMODEL.predict(virtualMeal,{cyclePhase:currentCyclePhase()},S.trainingPairs);
  const peak=pred.peakEstimate;
  list.innerHTML=S.pending.map((f,i)=>{const cal=Math.round(f.food.cal*f.g/100);return`<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--bdr)"><span style="flex:1;font-size:13px;color:var(--text);font-weight:600">${f.food.n}</span><div style="display:flex;align-items:center;gap:4px"><input type="number" min="0.5" step="0.5" value="${f.qty}" onchange="updPendQty(${i},this.value)" style="width:46px;background:var(--card2);border:1.5px solid var(--bdr);border-radius:8px;padding:4px 5px;color:var(--text);font-size:12px;font-weight:700;text-align:center;outline:none;font-family:'Nunito',sans-serif"/><span style="font-size:9px;color:var(--muted);white-space:nowrap;font-weight:600">${f.food.unit}<br>${Math.round(f.g)}g</span><span style="font-size:13px;font-weight:800;color:var(--sky2);width:36px;text-align:right">${cal}</span><button onclick="rmPending(${i})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:0;line-height:1">×</button></div></div>`;}).join('');
  setTxt('pend-cal',`${tC} kcal`);setTxt('pend-carb',`${tCb}g`);setTxt('pend-prot',`${tP}g`);setTxt('pend-fat',`${tF}g`);
  const giEl=document.getElementById('pend-gi');if(giEl){giEl.textContent=avgGI||'—';giEl.style.color=avgGI>60?'var(--danger)':avgGI>40?'var(--warn)':'var(--ok)';}
  const pb=document.getElementById('pend-pred');if(pb){pb.style.cssText=`background:${peak>180?'rgba(239,83,80,.08)':peak>140?'rgba(255,167,38,.08)':'rgba(91,184,245,.08)'};border:1.5px solid ${peak>180?'rgba(239,83,80,.25)':peak>140?'rgba(255,167,38,.25)':'rgba(91,184,245,.25)'};border-radius:11px;padding:8px 11px;font-size:12px;font-weight:700`;pb.innerHTML=`<span style="color:var(--muted);font-weight:500">식후 예측: </span><strong style="color:${peak>180?'var(--danger)':peak>140?'var(--warn)':'var(--sky2)'}">${peak} mg/dL</strong> ${peak>180?'⚠️ 위험':peak>140?'주의':'✓ 안정'} · GL ${gl} · <span class="pred-badge ${pred.confidence}" style="font-size:9px">${pred.confidence==='high'?'신뢰↑':pred.confidence==='medium'?'신뢰~':'기본'}</span>`;}
  prev.style.display='block';
}
function confirmFoods(){if(!S.pending.length){closeMod('mod-food');return;}const m=S.meals.find(x=>x.id===S.activeMealId);if(m)S.pending.forEach(f=>m.foods.push({...f}));S.pending=[];closeMod('mod-food');goH('insulin');}
function addMeal(){const labels=['간식','야식'];const used=S.meals.map(m=>m.label);const label=labels.find(l=>!used.includes(l))||'간식';const now=new Date();const t=`${now.getHours()}:${now.getMinutes()<10?'0':''}${now.getMinutes()}`;S.meals.push({id:S.nextMealId++,label,time:t,foods:[],bgPre:null,bg1h:null,bg2h:null});goH('insulin');}
function delMeal(id){const i=S.meals.findIndex(m=>m.id===id);if(i>=0)S.meals.splice(i,1);goH('insulin');}
function rmFood(mealId,fi){const m=S.meals.find(x=>x.id===mealId);if(m){m.foods.splice(fi,1);goH('insulin');}}
function updQty(mealId,fi,val){const m=S.meals.find(x=>x.id===mealId);if(!m)return;const q=parseFloat(val)||0;m.foods[fi].qty=q;m.foods[fi].g=q*m.foods[fi].food.ug;goH('insulin');}

// ── 혈당 실측 입력 → ★학습쌍 생성 + 예측 로그(적중률) 축적 ──
function updBG(mealId,key,val){
  const m=S.meals.find(x=>x.id===mealId);if(!m)return;
  m[key]=val?parseInt(val):null;
  // ★ 명세서 §3: 식전+식후가 모이면 학습쌍 생성/갱신
  const ctx={cyclePhase:currentCyclePhase(),workoutPost:!!S.checks.i2};
  const predBefore=GMODEL.predict(m,ctx,S.trainingPairs); // 실측 반영 전 예측(로그용)
  const pair=GMODEL.makeTrainingPair(m,ctx);
  if(pair){
    const idx=S.trainingPairs.findIndex(p=>p.meal_id===m.id);
    if(idx>=0)S.trainingPairs[idx]=pair;else S.trainingPairs.push(pair);
    // ★ 예측 vs 실측 로그 (적중률 집계용)
    const li=S.predLogs.findIndex(l=>l.meal_id===m.id);
    const log={meal_id:m.id,predicted_delta:predBefore.deltaPeak,actual_delta:pair.delta_peak};
    if(li>=0)S.predLogs[li]=log;else S.predLogs.push(log);
  }
  goH('insulin'); // 예측·진행도·차트 즉시 갱신
}
