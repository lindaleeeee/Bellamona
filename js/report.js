/* ═══════════════════════════════════════════════════════════════════════
   report.js — AI 통합 리포트 / Excel 내보내기 (원본 100% 보존)
   ★소폭 발전: 리포트에 혈당 예측 적중률(§6) 한 줄 추가
   ═══════════════════════════════════════════════════════════════════════ */

// ═══════════════════════ AI REPORT ═══════════════════════
function renderReport(){
  const allText=S.diaries.map(d=>d.t).join(' ');
  const words=allText.replace(/[.,?!]/g,'').split(/\s+/).filter(w=>w.length>=2);
  const freq={};words.forEach(w=>{freq[w]=(freq[w]||0)+1;});
  const top=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,14);
  const pos=['행복','좋아','뿌듯','상쾌','즐거','감사','가볍','에너지','차분','안정'];
  const neg=['피곤','무겁','걱정','힘들','무기력','불안'];
  const health=['혈당','운동','수면','식단','명상','호르몬'];
  const getColor=w=>{if(pos.some(p=>w.includes(p)))return['rgba(91,184,245,.2)','var(--sky2)'];if(neg.some(p=>w.includes(p)))return['rgba(239,83,80,.15)','var(--danger)'];if(health.some(p=>w.includes(p)))return['rgba(179,157,219,.2)','var(--lav2)'];return['var(--card2)','var(--muted)'];};
  const wc=top.map(([w,cnt])=>{const[bg,col]=getColor(w);const sz=Math.max(10,Math.min(15,10+cnt*1.5));return`<div style="padding:4px ${sz}px;border-radius:99px;font-size:${sz}px;font-weight:700;background:${bg};color:${col}">${w} <span style="font-size:9px;opacity:.7">${cnt}</span></div>`;}).join('');
  const intake=totalIntake();const op=overallPct();
  // ★ 혈당 예측 적중률(§6)
  const hr=GMODEL.hitRate(S.predLogs);const nPairs=S.trainingPairs.filter(p=>p.valid).length;
  document.getElementById('rep-body').innerHTML=`
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
    <div style="width:36px;height:36px;border-radius:12px;background:linear-gradient(135deg,var(--sky2),var(--lav2));display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🤖</div>
    <div><div style="font-size:15px;font-weight:700;color:var(--text)">AI 통합 리포트</div><div style="font-size:11px;color:var(--muted);font-weight:500">4일차 · 2026.04.22 · 다음 생성 3일 후</div></div>
  </div>
  <div class="card" style="background:linear-gradient(135deg,var(--sky3),var(--lav3));margin-bottom:12px">
    <div class="cap">저속노화 종합점수</div>
    <div style="display:flex;align-items:flex-end;gap:6px;margin-bottom:8px">
      <div class="serif" style="font-size:60px;font-weight:700;color:var(--text);line-height:1">${op>0?Math.max(op,50):74}</div>
      <div style="margin-bottom:10px;font-size:10px;color:var(--muted);font-weight:600">/100</div>
      <div style="margin-bottom:12px;margin-left:8px">
        <div style="font-size:11px;color:var(--ok);font-weight:700">생물학적 나이 0.3세 ↓</div>
        <div style="font-size:10px;color:var(--lav2);background:var(--lav3);padding:2px 8px;border-radius:99px;margin-top:3px;display:inline-block;font-weight:700">목표 85점까지 +${85-Math.max(op,50)}점</div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:5px">
      ${[['🩺 인슐린','insulin','var(--sky2)'],['💪 성장','growth','var(--gro)'],['🌿 코르티솔','cortisol','var(--cor)'],['💗 옥시토신','oxytocin','var(--rose)']].map(([l,h,c])=>`<div style="display:flex;align-items:center;gap:6px"><span style="width:64px;font-size:11px;color:var(--muted);font-weight:600">${l}</span><div class="bar-t" style="flex:1;height:5px"><div class="bar-f" style="width:${hormonePct(h)}%;background:${c}"></div></div><span style="font-size:11px;width:26px;text-align:right;font-weight:800;color:${c}">${hormonePct(h)}%</span></div>`).join('')}
    </div>
  </div>
  <!-- ★ 혈당 예측 성능 카드 (명세서 §6) -->
  <div class="card" style="margin-bottom:12px;border-color:rgba(91,184,245,.3)">
    <div class="cap" style="color:var(--sky2)">🩺 혈당 예측 개인화 현황</div>
    <div style="display:flex;gap:10px;align-items:center">
      <div style="text-align:center;flex:1;background:var(--sky3);border-radius:12px;padding:10px"><div style="font-size:20px;font-weight:800;color:var(--sky2)">${nPairs}</div><div style="font-size:9px;color:var(--muted);font-weight:600">학습 데이터(건)</div></div>
      <div style="text-align:center;flex:1;background:rgba(102,187,106,.1);border-radius:12px;padding:10px"><div style="font-size:20px;font-weight:800;color:var(--ok)">${hr!=null?hr+'%':'—'}</div><div style="font-size:9px;color:var(--muted);font-weight:600">예측 적중률</div></div>
      <div style="text-align:center;flex:1;background:var(--lav3);border-radius:12px;padding:10px"><div style="font-size:13px;font-weight:800;color:var(--lav2)">${nPairs>=40?'개인화':nPairs>=5?'학습중':'기본'}</div><div style="font-size:9px;color:var(--muted);font-weight:600">예측 단계</div></div>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:8px;font-weight:500;line-height:1.5">${nPairs>=40?'✅ 개인 데이터가 충분해 예측이 안정적이에요.':`혈당을 ${Math.max(0,40-nPairs)}건 더 기록하면 개인화 예측이 안정화돼요 (약 2주 목표).`} ※ 참고용 추정이며 의료 정보가 아닙니다.</div>
  </div>
  <div class="card" style="margin-bottom:12px;border-color:rgba(244,143,177,.25)">
    <div class="cap">📔 일기 감정 분석 (${S.diaries.length}일)</div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:8px;font-weight:500">자주 쓴 단어 · 크기 = 빈도</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${wc}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:3px;font-size:10px;color:var(--sky2);font-weight:700"><div style="width:8px;height:8px;border-radius:50%;background:rgba(91,184,245,.2)"></div>긍정</div>
      <div style="display:flex;align-items:center;gap:3px;font-size:10px;color:var(--danger);font-weight:700"><div style="width:8px;height:8px;border-radius:50%;background:rgba(239,83,80,.15)"></div>부정</div>
      <div style="display:flex;align-items:center;gap:3px;font-size:10px;color:var(--lav2);font-weight:700"><div style="width:8px;height:8px;border-radius:50%;background:rgba(179,157,219,.2)"></div>건강관련</div>
    </div>
    ${[['🩺','혈당 스파이크 → 부정 감정 +40%','1일차 스파이크 시 걱정·무거움 키워드 급증'],['💪','운동 완료일 → 긍정 감정 +35%','상쾌·뿌듯·에너지 키워드 운동일 집중'],['💗','가족·친구 교류 → 평온 +28%','행복·감사·즐거 키워드 동시 등장'],['🌿','수면 7h+ → 다음날 긍정 +22%','차분·가볍다 다음날 증가']].map(([em,t,s])=>`<div style="display:flex;gap:8px;padding:8px;background:var(--card2);border-radius:11px;margin-bottom:6px;border:1px solid var(--bdr)"><span style="font-size:13px;flex-shrink:0">${em}</span><div><div style="font-size:12px;color:var(--text);font-weight:700">${t}</div><div style="font-size:10px;color:var(--muted);margin-top:1px;font-weight:500">${s}</div></div></div>`).join('')}
    <div style="background:var(--oxy-bg);border:1.5px solid rgba(244,143,177,.25);border-radius:12px;padding:10px 12px;font-size:12px;color:var(--text);line-height:1.7;font-weight:500;margin-top:6px">
      💗 AI 분석: ${S.name}님은 <strong style="color:var(--rose2)">'연결감'</strong>이 감정 안정의 핵심이에요. 가족·친구와 교류한 날 긍정 감정이 평균 31% 높았고, 혈당도 안정적이었어요.
    </div>
  </div>
  <div class="card" style="margin-bottom:12px">
    <div class="cap">칼로리 & 체중 예측</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px;text-align:center">
      <div><div style="font-size:10px;color:var(--muted);font-weight:600">오늘 섭취</div><div style="font-size:18px;font-weight:800;color:var(--sky2)">${intake||0}</div><div style="font-size:9px;color:var(--muted);font-weight:600">kcal</div></div>
      <div><div style="font-size:10px;color:var(--muted);font-weight:600">오늘 소모</div><div style="font-size:18px;font-weight:800;color:var(--gro)">${totalBurned()}</div><div style="font-size:9px;color:var(--muted);font-weight:600">kcal</div></div>
      <div><div style="font-size:10px;color:var(--muted);font-weight:600">누적 세이브</div><div style="font-size:18px;font-weight:800;color:var(--ok)">${S.savedTotal}</div><div style="font-size:9px;color:var(--muted);font-weight:600">kcal</div></div>
    </div>
    <div style="background:var(--card2);border-radius:12px;padding:10px;font-size:12px">
      <div style="display:grid;grid-template-columns:42px 1fr 1fr 1fr;gap:4px;color:var(--muted);font-size:10px;text-align:center;margin-bottom:6px;font-weight:700"><span></span><span>낙관</span><span>현실</span><span>보수</span></div>
      ${[['1개월','-1.8kg','-1.2kg','-0.7kg'],['3개월','-4.2kg','-3.1kg','-2.0kg'],['6개월','-6.8kg','-5.0kg','-3.4kg']].map(([p,...vs])=>`<div style="display:grid;grid-template-columns:42px 1fr 1fr 1fr;gap:4px;text-align:center;margin-bottom:4px"><span style="font-size:10px;color:var(--muted);font-weight:600">${p}</span>${vs.map(v=>`<span style="color:var(--ok);font-weight:800;font-size:12px">${v}</span>`).join('')}</div>`).join('')}
    </div>
  </div>
  <div class="card" style="background:linear-gradient(135deg,var(--sky3),var(--lav3));margin-bottom:12px;border-color:var(--sky2)">
    <div class="cap" style="color:var(--sky2)">🤖 AI 루틴 추천</div>
    <div style="font-size:12px;color:var(--text);line-height:1.7;font-weight:500">
      <strong style="color:var(--sky2)">성장호르몬</strong>이 가장 낮아요 (${hormonePct('growth')}%).<br>
      추천: <span style="color:var(--gro);font-weight:700">빈속 아침 유산소 15분</span>을 루틴에 추가해보세요. 성장호르몬 +8점 예상.<br><br>
      <strong style="color:var(--cor)">코르티솔</strong> 루틴이 부족해요. 황체기 중 코르티솔 관리가 중요합니다.<br>
      추천: <span style="color:var(--cor);font-weight:700">취침 전 5분 복식호흡</span>을 추가하면 수면 품질이 향상됩니다.
    </div>
  </div>
  <div class="card" style="border-color:rgba(244,143,177,.3);background:rgba(244,143,177,.05);margin-bottom:12px">
    <div class="cap" style="color:var(--rose2)">PCOS 맞춤 인사이트</div>
    <div style="font-size:12px;color:var(--text);line-height:1.7;font-weight:500">현재 <strong style="color:var(--rose2)">황체기(21일차)</strong>. PCOS 여성은 이 시기 인슐린 저항성이 <strong style="color:var(--danger)">15~20% 높아요</strong>.<br><br>권장: 정제탄수 30% ↓ · 마그네슘(아몬드·시금치) · 저강도 유산소 45분</div>
  </div>
  <button class="btn btn-o" style="margin-top:4px" onclick="closeMod('mod-report')">닫기</button>`;
}

// ═══════════════════════ EXCEL EXPORT (원본 보존) ═══════════════════════
function doExport(){
  const BOM='\uFEFF';
  const mealInfo=S.meals.map(m=>`${m.label}:${m.foods.map(f=>`${f.food.n}${f.qty}${f.food.unit}`).join('+')}`).join(' / ');
  const mealCals=S.meals.map(m=>mCalc(m,'cal'));
  const bgInfo=S.meals.map(m=>`공복${m.bgPre||'—'}/1h${m.bg1h||'—'}/2h${m.bg2h||'—'}`).join(' | ');
  const rows=[
    ['날짜','저속노화점수','인슐린%','성장호르몬%','코르티솔%','옥시토신%','섭취kcal','소모kcal','NET kcal','공복혈당(mg/dL)','식사종류','식사내용','식후혈당기록'],
    ['2026-04-19',68,75,50,80,75,1380,420,960,88,'아침/점심/저녁','삶은달걀+샐러드/두부찌개/연어구이','공복88/1h142/2h118'],
    ['2026-04-20',71,75,75,80,100,1290,520,770,85,'아침/점심/저녁','그릭요거트/현미밥+된장찌개/닭가슴살','공복85/1h128/2h108'],
    ['2026-04-21',74,100,75,60,50,1350,580,770,82,'아침/점심/저녁','오트밀/두부샐러드/고등어구이','공복82/1h115/2h98'],
    ['2026-04-22',Math.max(overallPct(),50),hormonePct('insulin'),hormonePct('growth'),hormonePct('cortisol'),hormonePct('oxytocin'),totalIntake(),totalBurned(),getNet(),S.meals[0]?.bgPre||'—',S.meals.map(m=>m.label).join('/'),mealInfo,bgInfo],
  ];
  const csv=BOM+rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`Bellamona_기록_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
  alert('✅ CSV 파일이 다운로드됐어요!\nExcel에서 열면 스프레드시트로 확인할 수 있어요.');
}
