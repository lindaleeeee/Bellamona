# BELLAMONA 혈당 예측 모델 개발 명세서 (MDS) v1.0
## AI 개발 에이전트 실행용 — 데이터 파이프라인 · 모델 · 평가 전체 사양

작성일: 2026-07-07 | 상위 문서: BELLAMONA_SRS.md (§4.2, §6과 정합)
대상: Claude Code 등 AI 개발 에이전트. 이 문서만으로 예측 시스템 전체를 구현할 수 있게 작성됨.

---

## §0. 에이전트 실행 원칙
1. 4개 단계(규칙 → k-NN → 공통ML → 개인보정)를 **순서대로** 배포한다. 데이터가 없으면 다음 단계는 죽은 코드다.
2. 예측은 항상 이전 단계로 **폴백** 가능해야 한다 (ML 실패 시 k-NN, k-NN 표본 부족 시 규칙).
3. 모든 예측은 glucose_predictions에 기록하고, 실측 도착 시 갱신한다. 이 로그가 곧 학습 데이터다.
4. 의료 표현 금지(PRD §9). 출력에 disclaimer 필수.

---

## §1. 예측 타깃 정의 (반드시 먼저 고정)

· **주 타깃 ΔPeak** = max(glucose[t_meal+30min : t_meal+120min]) − baseline
  - baseline = mean(glucose[t_meal−15min : t_meal])  (식전 15분 평균)
· 보조 타깃 iAUC (선택, v2): 식후 2시간 곡선에서 baseline 위 면적 (사다리꼴 적분)
· 출력 등급: low(ΔPeak<40) / medium(40~70) / high(>70) mg/dL  ※ 절대 혈당이 아니라 상승폭 기준
· 출력 형식: `{ delta_peak_estimate, peak_range:[min,max], level, confidence, method, similar_meals_n, disclaimer }`

---

## §2. 피처 정의표 (학습·추론 공통)

| 피처 | 타입 | 출처 | 결측 처리 |
|---|---|---|---|
| carb_g | float | meal_items 합산 | food_db 평균 대체 |
| sugar_g | float | meal_items | carb의 0.4배 추정 |
| fat_g | float | meal_items | 0 |
| protein_g | float | meal_items | 0 |
| fiber_g | float | food_db | 0 |
| gi_estimate | float | food_db | 탄수 가중 55 |
| meal_hour | int(0-23) | eaten_at | 필수 |
| time_since_prev_meal_min | float | 직전 meal | 없으면 480(공복) |
| baseline_glucose | float | CGM/수동 | 식전값 없으면 100 |
| sleep_h_last_night | float | sleep_logs | 사용자 평균 |
| cycle_phase | cat(4) | cycles 함수 | unknown |
| workout_within_30min_post | bool | workouts | false |
| carb_x_gi | float | 파생(carb×gi/100) | — |

**설계 근거**: 지방·단백·섬유질은 흡수를 늦춰 피크를 낮추는 완충 피처, cycle_phase(황체기 인슐린 감수성 저하)와 수면·직후 운동은 같은 음식의 반응 편차를 만드는 개인·상황 피처다.

---

## §3. 학습 데이터 파이프라인 (가장 중요)

### 3.1 쌍(pair) 생성 배치 — pg_cron 1시간 주기
```
for each meal M in last 24h where not yet labeled:
    baseline = mean(CGM[M.time-15m : M.time])
    if CGM missing in [M.time-15m : M.time+120m]: skip (label 불가)
    if 다른 meal exists in (M.time, M.time+120m): mark contaminated, skip
    peak = max(CGM[M.time+30m : M.time+120m])
    delta_peak = peak - baseline
    features = build_features(M)
    upsert training_pairs(user_id, meal_id, features jsonb, delta_peak, valid=true)
```

### 3.2 데이터 정제 규칙 (필수)
· CGM 결측률 20% 초과 구간 → 제외
· ΔPeak < −10 또는 > 200 → 이상치 제외(입력 오류 가능성)
· 식사 겹침(2시간 내 중복) → contaminated 플래그, 학습 제외
· 수동 혈당만 있는 식사 → k-NN에는 사용 가능하나 ML 학습셋에서는 저품질 태그(가중치 0.5)

### 3.3 training_pairs 테이블
```sql
training_pairs (
  id uuid, user_id uuid, meal_id uuid,
  features jsonb, delta_peak numeric,
  data_quality text,        -- 'cgm'/'manual'/'contaminated'
  valid boolean, created_at timestamptz
)
```

---

## §4. 4단계 예측 로직

### 단계 1 — 규칙 기반 (데이터 0, 콜드스타트)
```
base = LOOKUP_TABLE[carb_bucket][gi_bucket]         # 사전 정의 표 (부록 A)
buffer = 1 - 0.15*(fiber_g>5) - 0.1*(fat_g>15) - 0.1*(protein_g>20)
time_c = {아침1.1, 점심1.0, 저녁1.05, 야식(≥21시)1.15}[meal_hour]
cycle_c = {luteal:1.1, else:1.0}
delta_peak = base * buffer * time_c * cycle_c
confidence = 'low', method='rule'
```

### 단계 2 — 개인 k-NN (사용자 유효쌍 5건+)
```
neighbors = training_pairs where user_id=U and valid
            and |carb_g - x.carb_g| ≤ 20
            and |gi - x.gi| ≤ 15
            and same meal_hour bucket (아침/점심/저녁/야식)
if len(neighbors) ≥ 3:
    delta_peak = weighted_mean(neighbors.delta_peak, w=1/distance)
    peak_range = [p25, p75] of neighbors
    confidence = 'high' if n≥5 else 'medium'
    method='knn', similar_meals_n=len
    evidence = "지난번 비슷한 식사 n건 기준"
else: fall back to 단계1
```

### 단계 3 — 공통 ML (전체 유효쌍 5,000건+)
```
model = LightGBM regressor (부록 B 하이퍼파라미터)
delta_peak_ml = model.predict(features)
# 개인 보정(단계4)이 있으면 적용
```

### 단계 4 — 개인 잔차 보정 (사용자 30건+)
```
# 공통 모델의 그 사용자에 대한 평균 오차를 보정
personal_bias = mean( actual - model.predict(feat) ) over user's labeled pairs
personal_scale = std_ratio (선택)
delta_peak = delta_peak_ml + personal_bias
confidence='high', method='ml_personal'
```

### 최종 선택 로직 (매 추론)
```
if user_pairs≥30 and global_model_deployed: 단계4
elif global_model_deployed:                 단계3
elif user_pairs≥5:                          단계2
else:                                        단계1
항상 disclaimer 부착. similar_meals_n<3이면 UI에 "데이터 쌓이면 정확해져요" 표시
```

---

## §5. 학습·배포 파이프라인

· **모델**: LightGBM (표형 데이터 최적, 해석 가능, 학습 빠름). 딥러닝 불필요.
· **학습 주기**: 주 1회 서버 배치(일요일 새벽)
· **검증 분할**: 반드시 시간순(temporal). 각 사용자의 과거 80%로 학습, 최근 20%로 검증. **랜덤 분할 금지**(미래 정보 누수)
· **콜드스타트 방지**: 신규 사용자는 공통 모델만으로 즉시 예측(개인쌍 0이어도 단계3 작동)
· **배포 게이트**: 검증셋에서 아래 충족 시에만 규칙/k-NN을 ML로 승격
  - 피크 MAE < 25 mg/dL
  - 3등급 분류 정확도 > 70%
  - 규칙 모델 대비 MAE 15% 이상 개선
· **모델 버전 관리**: model_registry(version, trained_at, metrics, feature_list, active). 롤백 가능.
· **A/B**: 신모델은 10% 트래픽 섀도우 예측 → 실측과 비교 후 승격

---

## §6. 평가 프로토콜 (지속 운영)

· 지표: MAE, RMSE, 3등급 정확도, 방향 정확도(피크 높/낮 맞춤률)
· 온라인 모니터링: 매 예측-실측 쌍의 오차를 ai_usage_log와 별도 prediction_metrics에 적재 → 주간 MAE 추세 대시보드
· 사용자 대면 지표: "이번 주 예측 적중률 %"(오차 ±20mg/dL 이내를 적중으로 정의) → 리포트·홈에 노출 = 신뢰·전환 장치
· 드리프트 감지: 주간 MAE가 기준선 대비 20% 악화 시 알림 → 재학습/피처 점검

---

## §7. 데이터 볼륨 요건 (실측 근거)

### 개인 모델 (k-NN)
| 누적 끼니 | 상태 |
|---|---|
| 0~4 | 규칙만 |
| 5~15 | k-NN 시작(자주 먹는 음식) |
| 20~30 | 개인화 안정 |
| 50+ | 대부분 고신뢰 |
→ **하루 3끼 기준 1~2주면 개인 예측 체감. 첫 리포트(3주) 시점과 정렬됨.**

### 공통 ML 모델
| 누적 (식사–혈당)쌍 | 상태 | 도달 조건 |
|---|---|---|
| ~1,000 | 배포 전, 규칙보다 나음 | 활성 20명×2주 |
| ~5,000 | 학습 유의미, MAE 하락 | 활성 60명×4주 |
| ~15,000~20,000 | **배포 게이트 도달권** | 활성 150명×6주 |
| 50,000+ | 개인 보정층 안정 | 활성 300명×2~3개월 |

**핵심 결론**
· 개인 예측 on: 사용자당 15~20끼 (출시 직후 개별 충족)
· 공통 ML 학습 시작: 누적 5,000쌍 (활성 50~60명·1개월)
· ML 배포 전환: 누적 15,000~20,000쌍 (활성 150명·6주 = 사업화 M+3~6 구간과 일치)

**병목: CGM 비율.** 정답 라벨은 CGM 착용자에게서만 나온다. 위 "활성"은 CGM 활성 기준. 수동 입력자는 k-NN엔 기여하나 ML 학습셋 품질은 낮다 → CGM 커머스 퍼널이 곧 데이터 확보 전략.

### 데이터 부족 구간 운영 전략
· ML 배포 전(0~6주): 규칙+k-NN으로 서비스, 예측 UI에 신뢰도 배지 정직 표기
· "예측 vs 실측" 비교 카드를 적극 노출 → 사용자가 데이터를 쌓을 동기 부여(게이미피케이션)
· 자주 먹는 한식 상위 100종의 규칙 룩업테이블을 정교화하면 콜드스타트 정확도가 크게 개선됨(부록 A 우선 투자)

---

## §8. 개인정보·안전
· 학습은 가명처리된 features(jsonb)만 사용, 원본 식별자 미포함
· 모델·로그에 혈당 수치 외 식별정보 기록 금지
· 예측은 진단이 아님. 저혈당/고혈당 절대치 감지 시 "의료 전문가 상담" 안내(치료 지시 금지)

---

## §9. 구현 순서 (에이전트 작업 지시)
1. training_pairs 스키마 + 3.1 라벨링 배치 + 3.2 정제 규칙 (+단위테스트)
2. 부록 A 규칙 룩업테이블 + 단계1 (+경계값 테스트)
3. 단계2 k-NN 쿼리 + 폴백 로직 + 예측 UI 신뢰도 배지
4. prediction_metrics + "적중률" 집계 + 주간 대시보드
5. (누적 5,000쌍 도달 후) LightGBM 학습 배치 + model_registry + 시간순 검증
6. 배포 게이트 통과 시 단계3 승격, 이후 단계4 개인 보정
각 단계는 이전 단계로 폴백 가능해야 하며, 데이터 미달 시에도 서비스는 항상 예측을 반환한다.

---

## 부록 A. 규칙 룩업테이블 (초기값 — 실데이터로 보정)
탄수 버킷(g): [0-15, 15-30, 30-50, 50-75, 75+] × GI 버킷: [저<55, 중55-70, 고>70]
초기 ΔPeak 추정(mg/dL, 표준 성인 기준):
```
        저GI   중GI   고GI
0-15     8     12     18
15-30   18     28     40
30-50   32     48     65
50-75   48     70     92
75+     62     90    120
```
※ 이 표는 출발점. training_pairs가 쌓이면 버킷별 실측 중앙값으로 분기별 갱신.

## 부록 B. LightGBM 초기 하이퍼파라미터
```
objective: regression_l1 (MAE 최적화)
num_leaves: 31, max_depth: 6, learning_rate: 0.05
n_estimators: 300, min_child_samples: 20
subsample: 0.8, colsample_bytree: 0.8
early_stopping: 50 rounds on temporal val set
```
표본 5,000 미만에서는 과적합 위험 → num_leaves 15로 축소, 규제 강화.
