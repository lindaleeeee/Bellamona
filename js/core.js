/* ═══════════════════════════════════════════════════════════════════════
   core.js — 화면전환/네비/모달/로그인/온보딩/시계/초기화 (원본 100% 보존)
   ※ 다른 js보다 마지막에 로드 (모든 render 함수가 정의된 뒤 초기화)
   ═══════════════════════════════════════════════════════════════════════ */

// ═══════════════════════ HELPERS ═══════════════════════
function go(id){document.querySelectorAll('.scr').forEach(s=>s.classList.remove('on'));const el=document.getElementById(id);if(el)el.classList.add('on');if(id==='s-dash')renderDash();if(id==='s-diet')renderRecipes();updateHome();}
function navTo(el,id){document.querySelectorAll('.ni').forEach(n=>n.classList.remove('on'));el.classList.add('on');if(id!=='s-hormone')S.prev=id;go(id);}
function openMod(id){
  if(id==='mod-report'&&!S.subscribed){document.getElementById('mod-paywall').classList.add('open');return;}
  if(id==='mod-report')renderReport();
  if(id==='mod-cheat'){renderCheat();document.getElementById('ch-avail').textContent=S.savedTotal;}
  if(id==='mod-edit-routine')renderEditRoutine();
  document.getElementById(id)?.classList.add('open');
}
function closeMod(id){document.getElementById(id).classList.remove('open')}
function setTxt(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}

// ═══════════════════════ GOOGLE LOGIN ═══════════════════════
function doGoogleLogin(){
  S.loggedIn=true;
  go('s-onboard');
}

// ═══════════════════════ ONBOARDING ═══════════════════════
function calcGoal(){
  const cw=parseFloat(document.getElementById('ob-cw')?.value)||52;
  const gw=parseFloat(document.getElementById('ob-gw')?.value)||48;
  const gm=parseFloat(document.getElementById('ob-gm')?.value)||3;
  const h=parseFloat(document.getElementById('ob-h')?.value)||165;
  const bmr=Math.round(655+9.563*cw+1.85*h-4.676*32);
  S.goalCal=Math.max(Math.round(bmr*1.375)-Math.round((cw-gw)*7700/(gm*30)),1000);
  S.initWeight=cw;S.goalWeight=gw;S.goalMonths=gm;
  setTxt('ob-cal',S.goalCal.toLocaleString());
  const d=document.getElementById('ob-cal-d');if(d)d.textContent=`체중 -${(cw-gw).toFixed(1)}kg ÷ ${gm*30}일 × 7,700kcal`;
}
function obNext(){
  if(S.obStep<3){document.getElementById(`ob-p${S.obStep}`).style.display='none';S.obStep++;document.getElementById(`ob-p${S.obStep}`).style.display='block';document.getElementById('ob-back').style.display='flex';if(S.obStep===3)document.getElementById('ob-next').textContent='시작하기 →';if(S.obStep===2)calcGoal();document.querySelectorAll('.step-dot').forEach((d,i)=>d.classList.toggle('on',i===S.obStep-1));}
  else{S.name=document.getElementById('ob-name')?.value||'혜림';S.cycleLen=parseInt(document.getElementById('ob-cycle')?.value)||28;S.weights=[{d:'오늘',w:S.initWeight}];initMain();}
}
function obPrev(){if(S.obStep>1){document.getElementById(`ob-p${S.obStep}`).style.display='none';S.obStep--;document.getElementById(`ob-p${S.obStep}`).style.display='block';if(S.obStep===1)document.getElementById('ob-back').style.display='none';document.getElementById('ob-next').textContent='다음';document.querySelectorAll('.step-dot').forEach((d,i)=>d.classList.toggle('on',i===S.obStep-1));}}
function initMain(){setTxt('h-greet',`오늘도 빛나는 ${S.name}님 ✨`);setTxt('prof-name',`${S.name}님`);setTxt('prof-me-name',S.name+'님 (나)');go('s-home');document.getElementById('nav-home').click();}

// ═══════════════════════ MISC / INIT ═══════════════════════
document.addEventListener('click',e=>{
  ['food-dd','cheat-dd'].forEach(id=>{const dd=document.getElementById(id);if(dd&&!dd.contains(e.target)&&e.target.id!==id.replace('-dd','-q'))dd.style.display='none';});
});
function tick(){const n=new Date();document.getElementById('clk').textContent=n.getHours()+':'+(n.getMinutes()<10?'0':'')+n.getMinutes();}
tick();setInterval(tick,30000);
updateHome();
