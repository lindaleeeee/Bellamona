# Bellamona

PCOS 여성을 위한 AI 호르몬·혈당·감정 통합 관리 앱 (프런트엔드 프로토타입).

## 구조 (파일 분할)

```
index.html              뼈대(화면 HTML). 원본 UI 100% 유지
css/styles.css          전체 스타일
js/
  data.js               음식DB(FDB) · 상태(S) · 레시피 · 치팅 데이터
  glucose-model.js      ★혈당 예측 엔진 (MDS 명세서 4단계: 규칙→k-NN→ML→개인보정)
  home-dash.js          홈 · 대시보드 · 달력 · 체중 · 칼로리 계산
  insulin.js            인슐린(식단·혈당) 화면 + 예측 엔진 연결
  hormones.js           성장호르몬 · 코르티솔 · 옥시토신 화면
  recipes-cheat.js      레시피 · 치팅데이 · 아바타
  report.js             AI 통합 리포트 · Excel 내보내기
  core.js               로그인 · 온보딩 · 네비 · 모달 · 초기화 (마지막 로드)
```

## 혈당 예측 모델 (glucose-model.js)

`BELLAMONA_혈당예측모델_개발명세서(MDS)` 기반. 전역 객체 `GMODEL` 제공.

- **타깃 ΔPeak** = 식후 30~120분 최고 − 식전 baseline
- **4단계 폴백**: 데이터가 없어도 항상 예측 반환
  1. 규칙 기반 (부록 A 룩업 × 완충 × 시간대 × 생리주기 계수)
  2. 개인 k-NN (유사 식사 3건+): `GMODEL.knnBased`
  3. 공통 ML: `GMODEL.setMlPredictor(fn)`로 백엔드 연결 시 활성화
  4. 개인 잔차 보정 (30건+)
- 혈당 실측 입력 시 `GMODEL.makeTrainingPair`로 학습쌍 자동 축적
- `GMODEL.hitRate`로 예측 적중률(±20mg/dL) 집계

### 백엔드 ML 연결 방법 (나중에)
```js
GMODEL.setMlPredictor(async (feat) => {
  const r = await fetch('/api/glucose-predict', {method:'POST', body:JSON.stringify(feat)});
  const j = await r.json();
  return { deltaPeak: j.delta_peak };
});
```
이 한 줄만 추가하면 예측이 규칙/k-NN → 서버 ML로 자동 승격됩니다(실패 시 폴백).

## 로컬 실행
정적 파일이라 서버가 필요 없지만, 여러 파일 로드를 위해 로컬 서버 권장:
```
npx serve .
# 또는
python3 -m http.server 8000
```

## 배포
GitHub에 push → Vercel이 자동 배포. 별도 빌드 설정 불필요(정적).
