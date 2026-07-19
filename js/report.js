window.renderReport = async function () {
  const today = new Date().toISOString().split('T')[0];

  // Check if already fetched
  if (S.reports && S.reports[today]) {
    renderReportUI(S.reports[today]);
    return;
  }

  document.getElementById('rep-body').innerHTML = `
        <div style="text-align:center; padding: 40px 20px;">
            <div style="font-size:32px; animation: spin 1s linear infinite;">🔄</div>
            <div style="margin-top:12px; font-weight:700; color:var(--text);">AI 리포트를 생성하는 중입니다...</div>
            <div style="font-size:11px; color:var(--muted); margin-top:4px;">Gemini가 3일치 패턴을 분석해 통찰을 제공해요</div>
        </div>
        <style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>
    `;

  try {
    const token = localStorage.getItem('token');
    if (!token) {
      document.getElementById('rep-body').innerHTML = '<div style="padding:20px;text-align:center;color:var(--danger)">로그인이 필요합니다.</div>';
      return;
    }

    const reqData = {
      meals: S.meals,
      workouts: S.exBurned,
      checkHistory: Object.values(S.checkHistory || {}).slice(-3),
      checks: S.checks,
      weights: S.weights,
      periods: S.periods,
      cycleLen: S.cycleLen
    };

    const res = await fetch(API_BASE + '/report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ data: reqData })
    });

    if (!res.ok) throw new Error('API 오류');
    const json = await res.json();

    if (json.success && json.report) {
      if (!S.reports) S.reports = {};
      S.reports[today] = json.report;
      renderReportUI(json.report);
    } else {
      throw new Error(json.error || '생성 실패');
    }
  } catch (e) {
    document.getElementById('rep-body').innerHTML = `<div style="padding:20px;text-align:center;color:var(--danger)">오류 통신 실패: ${e.message}</div>`;
  }
};

function renderReportUI(report) {
  const today = new Date();
  const dateStr = `${today.getFullYear()}.${today.getMonth() + 1}.${today.getDate()}`;
  const op = typeof overallPct === 'function' ? overallPct() : 74;

  let emotionHtml = '';
  if (report.emotion_keywords) {
    emotionHtml = report.emotion_keywords.map(k => {
      const bg = k.type === 'positive' ? 'rgba(91,184,245,.2)' : 'rgba(239,83,80,.15)';
      const color = k.type === 'positive' ? 'var(--sky2)' : 'var(--danger)';
      return `<div style="padding:4px 12px;border-radius:99px;font-size:12px;font-weight:700;background:${bg};color:${color}">${k.word} <span style="font-size:9px;opacity:.7">${k.count}</span></div>`;
    }).join('');
  }

  const insPercent = typeof hormonePct === 'function' ? hormonePct('insulin') : 50;
  const grwPercent = typeof hormonePct === 'function' ? hormonePct('growth') : 50;
  const corPercent = typeof hormonePct === 'function' ? hormonePct('cortisol') : 50;
  const oxyPercent = typeof hormonePct === 'function' ? hormonePct('oxytocin') : 50;

  let actionsHtml = '';
  if (report.actions) {
    actionsHtml = report.actions.map(a => `<li style="margin-bottom:4px">${a}</li>`).join('');
  }

  let insightsHtml = '';
  if (report.insights) {
    insightsHtml = report.insights.map(a => `<div style="padding:4px 0;border-bottom:1px solid rgba(0,0,0,0.05)">${a}</div>`).join('');
  }

  document.getElementById('rep-body').innerHTML = `
<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
  <div style="width:36px;height:36px;border-radius:12px;background:linear-gradient(135deg,var(--sky2),var(--lav2));display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🤖</div>
  <div><div style="font-size:15px;font-weight:700;color:var(--text)">AI 통합 리포트</div><div style="font-size:11px;color:var(--muted);font-weight:500">${dateStr} · 백엔드 Gemini 생성 리포트</div></div>
</div>

<div class="card" style="background:linear-gradient(135deg,var(--sky3),var(--lav3));margin-bottom:12px">
    <div class="cap" style="margin-bottom:2px">오늘의 한 줄 평가</div>
    <div style="font-size:14px;font-weight:800;color:var(--lav2);margin-bottom:12px">${report.headline}</div>
    <div class="cap">저속노화 종합점수</div>
    <div style="display:flex;align-items:flex-end;gap:6px;margin-bottom:8px">
        <div class="serif" style="font-size:60px;font-weight:700;color:var(--text);line-height:1">${report.scores?.overall || op}</div>
        <div style="margin-bottom:10px;font-size:10px;color:var(--muted);font-weight:600">/100</div>
        <div style="margin-bottom:12px;margin-left:8px">
            <div style="font-size:11px;color:var(--ok);font-weight:700">생물학적 나이 ${report.scores?.biological_age_delta > 0 ? '+' + report.scores.biological_age_delta : report.scores?.biological_age_delta || 0}세</div>
        </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:5px">
        ${[['🩺 인슐린', 'insulin', 'var(--sky2)', insPercent], ['💪 성장', 'growth', 'var(--gro)', grwPercent], ['🌿 코르티솔', 'cortisol', 'var(--cor)', corPercent], ['💗 옥시토신', 'oxytocin', 'var(--rose)', oxyPercent]].map(([l, h, c, pct]) => `<div style="display:flex;align-items:center;gap:6px"><span style="width:64px;font-size:11px;color:var(--muted);font-weight:600">${l}</span><div class="bar-t" style="flex:1;height:5px"><div class="bar-f" style="width:${pct}%;background:${c}"></div></div><span style="font-size:11px;width:26px;text-align:right;font-weight:800;color:${c}">${pct}%</span></div>`).join('')}
    </div>
</div>

<div class="card" style="margin-bottom:12px;border-color:rgba(244,143,177,.25)">
    <div class="cap">📔 일기 감정 분석 키워드</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${emotionHtml}</div>
    <div class="cap" style="margin-top:10px">💡 AI 데이터 인사이트</div>
    <div style="font-size:12px;color:var(--text);line-height:1.6;font-weight:500;">
        ${insightsHtml}
    </div>
</div>

<div class="card" style="background:linear-gradient(135deg,var(--sky3),var(--lav3));margin-bottom:12px;border-color:var(--sky2)">
    <div class="cap" style="color:var(--sky2)">🤖 추천 건강 액션</div>
    <ul style="font-size:12px;color:var(--text);line-height:1.7;font-weight:600;padding-left:14px;margin:0;">
        ${actionsHtml}
    </ul>
</div>

${report.pcos_insight ? `
<div class="card" style="border-color:rgba(244,143,177,.3);background:rgba(244,143,177,.05);margin-bottom:12px">
    <div class="cap" style="color:var(--rose2)">PCOS 맞춤 인사이트</div>
    <div style="font-size:12px;color:var(--text);line-height:1.7;font-weight:500">${report.pcos_insight}</div>
</div>` : ''}

  <button class="btn btn-o" style="margin-top:4px" onclick="closeMod('mod-report')">닫기</button>
    `;
}
