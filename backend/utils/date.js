// 서버는 UTC로 돈다(대부분의 호스팅 기본값). 한국은 UTC+9라 `new Date().toISOString()`으로
// "오늘"을 구하면 자정~오전9시(KST) 사이엔 아직 어제 UTC 날짜가 나온다 — 이 시간대에 저장/조회하는
// 모든 "오늘" 계산이 하루 밀리는 버그의 원인이었다(성장호르몬 기록이 다음날 걸로 잡히던 문제 등).
// 항상 이 함수로 한국 기준 오늘 날짜를 구한다.
function todayKST() {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().split('T')[0];
}

// 'YYYY-MM-DD' 문자열에 n일을 더한 문자열을 반환한다(순수 날짜 계산이라 타임존과 무관).
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

module.exports = { todayKST, addDays };
