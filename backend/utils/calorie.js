// frontend/index.html의 phaseFromPeriod/PHASE_CAL_RATIO와 반드시 같은 공식이어야 한다 —
// 여기서 계산한 "그날 목표 칼로리"가 클라이언트가 화면에 보여주는 값과 어긋나면 세이브 적립이
// 사용자 눈에 보이는 숫자와 안 맞게 된다.
const PHASE_CAL_RATIO = { follicular: 1.00, ovulation: 1.00, luteal: 1.10, menstrual: 1.05, unknown: 1.00 };

// periods: [{ start_date, duration_days }, ...] (start_date 오름차순일 필요 없음)
function phaseRatioForDate(periods, cycleLen, dateStr) {
  const target = new Date(dateStr + 'T00:00:00.000Z');
  const applicable = (periods || [])
    .filter(p => new Date(p.start_date + 'T00:00:00.000Z') <= target)
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
  if (!applicable.length) return PHASE_CAL_RATIO.unknown;
  const p = applicable[applicable.length - 1];
  const start = new Date(p.start_date + 'T00:00:00.000Z');
  const totalDays = Math.floor((target - start) / 86400000);
  if (totalDays < 0) return PHASE_CAL_RATIO.unknown;
  const cl = cycleLen || 28;
  const days = p.duration_days || 5;
  const dayIdx = totalDays % cl;
  if (dayIdx < days) return PHASE_CAL_RATIO.menstrual;
  if (dayIdx >= cl - 18 && dayIdx <= cl - 10) return PHASE_CAL_RATIO.ovulation;
  if (dayIdx >= cl - 9) return PHASE_CAL_RATIO.luteal;
  return PHASE_CAL_RATIO.follicular;
}

module.exports = { PHASE_CAL_RATIO, phaseRatioForDate };
