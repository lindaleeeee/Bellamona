# BELLAMONA SRS (Software Requirements Specification)
## AI 개발 에이전트 실행용 기술 명세서 v1.0

문서 버전: 1.0 | 작성일: 2026-07-07
전제 문서: BELLAMONA_PRD.md (기능 정의·우선순위·규제 가드레일)

---

## §0. AI 에이전트 실행 프로토콜 (반드시 먼저 읽을 것)

당신(AI 에이전트)은 이 문서의 §12 실행 계획을 Phase 순서대로 수행한다. 규칙:

1. **순서 엄수**: Phase N의 완료 기준(DoD)을 모두 통과하기 전에 Phase N+1을 시작하지 않는다.
2. **작업 단위**: 각 Step은 하나의 커밋(또는 PR) 단위다. 커밋 메시지는 `[P{phase}-S{step}] 설명` 형식.
3. **보고**: 각 Phase 종료 시 (a) 구현 요약 (b) DoD 체크 결과 (c) 미해결 이슈 (d) 다음 Phase 착수 여부 질문 — 4가지를 제품 오너에게 보고한다.
4. **비밀정보**: API 키, DB 접속 정보는 절대 코드에 하드코딩하지 않는다. `.env` + 환경변수, `.gitignore` 필수. 키가 필요한 시점에 제품 오너에게 요청한다.
5. **규제 우선**: PRD §9(의료 표현), 본 문서 §9(개인정보·보안)과 충돌하는 구현은 중단하고 보고한다.
6. **테스트 우선**: 각 Step은 최소 1개 이상의 자동화 테스트를 포함한다. 서버 로직(예측, 리포트 파이프라인)은 단위 테스트 필수.
7. **모르면 묻는다**: 이 문서에 명시되지 않은 결정(라이브러리 선택 등)은 §2 기술 스택 원칙 내에서 스스로 결정하되, 아키텍처 변경급 결정은 질문한다.

---

## §1. 시스템 개요

```
[모바일 앱: Capacitor + React(Vite) SPA]
   ├── HealthKit / Health Connect 플러그인 (혈당·수면·운동 읽기)
   ├── 카메라 (음식 사진)
   ├── 푸시 (FCM / APNs)
   └── 인앱결제 (StoreKit2 / Play Billing — RevenueCat SDK 권장)
          │ HTTPS (TLS 1.2+)
[백엔드: Supabase]
   ├── Auth (Google / Apple OAuth)
   ├── PostgreSQL + RLS (행 단위 접근제어)
   ├── Edge Functions (Deno/TypeScript):
   │     · food-recognize (사진→음식 인식)
   │     · glucose-predict (혈당 반응 예측)
   │     · diary-analyze (일기 키워드·감정 분석)
   │     · report-generate (3일 AI 리포트, 비동기)
   │     · iap-webhook (RevenueCat 웹훅 수신)
   ├── Storage (음식 사진 — 비공개 버킷)
   └── pg_cron (3일 주기 리포트 스케줄러)
          │
[외부 API]
   ├── Anthropic Claude API (Haiku 4.5 = 인식/분석, Sonnet 4.6 = 리포트)
   ├── 식약처 식품영양성분 DB (공공데이터포털 Open API → 자체 테이블 캐시)
   └── RevenueCat (구독 상태 관리)
```

**스택 선택 근거**: 현재 자산이 단일 HTML/JS이므로 React(Vite) SPA로 리팩터 → Capacitor로 iOS/Android 패키징이 최단 경로. Supabase는 Auth+DB+RLS+서버리스 함수를 한 번에 제공하여 1인+AI 에이전트 개발에 최적. RevenueCat은 양대 스토어 IAP 검증·구독 상태 동기화를 대행하여 결제 구현 리스크를 크게 줄인다.

---

## §2. 기술 스택 (확정)

| 레이어 | 선택 | 비고 |
|---|---|---|
| 프론트 | React 18 + TypeScript + Vite | 기존 HTML/JS UI를 컴포넌트로 이식 |
| 상태관리 | Zustand + TanStack Query | 서버상태/로컬상태 분리 |
| 스타일 | Tailwind CSS | 기존 디자인 토큰(핑크/퍼플 계열) 유지 |
| 차트 | Recharts | 혈당 곡선, 감정 곡선 |
| 앱 셸 | Capacitor 6 | iOS 15+, Android 8(API 26)+ |
| 헬스 연동 | capacitor-health(또는 동급 유지보수 활성 플러그인)로 HealthKit/Health Connect 접근 | 혈당(bloodGlucose), 수면, 걸음 |
| 백엔드 | Supabase (Auth, Postgres 15, Edge Functions, Storage, pg_cron) | 리전: 가능하면 ap-northeast-2(서울) 또는 ap-northeast-1 |
| AI | Anthropic Claude API: claude-haiku-4-5(경량 작업), claude-sonnet-4-6(리포트) | 프롬프트 캐싱 필수 적용 |
| 결제 | RevenueCat + StoreKit2 / Play Billing | 웹훅으로 subscriptions 테이블 동기화 |
| 푸시 | FCM (Android/iOS 통합) | Edge Function에서 발송 |
| 에러추적 | Sentry | 프론트+Edge Functions |
| CI | GitHub Actions | lint, test, 빌드 |

---

## §3. 데이터 모델 (PostgreSQL DDL 사양)

모든 테이블 공통: `id uuid PK default gen_random_uuid()`, `created_at timestamptz default now()`, `updated_at timestamptz`. 사용자 데이터 테이블은 전부 `user_id uuid references auth.users(id) on delete cascade` 포함 + RLS 적용.

```sql
-- 프로필 (민감정보 포함 주의)
profiles (
  user_id uuid PK references auth.users,
  nickname text not null,
  avatar_emoji text default '🦋',
  birth_year int,                    -- 만14세 검증용
  height_cm numeric, weight_kg numeric,
  target_weight_kg numeric, target_date date,
  goal text check (goal in ('pcos','pregnancy_prep','slow_aging','fat_loss')),
  daily_kcal_target int,
  onboarding_done boolean default false
)

-- 동의 이력 (법적 증빙 — 절대 삭제 금지, 탈퇴 시에도 법정기간 보존)
consents (
  user_id, consent_type text,        -- 'terms','privacy','sensitive_health','cross_border_ai','marketing'
  version text, granted boolean, granted_at timestamptz, revoked_at timestamptz
)

-- 생리주기
cycles ( user_id, start_date date, duration_days int, cycle_length_days int )
-- phase 계산은 뷰/함수로: menstrual / follicular / ovulation / luteal

-- 식사 기록
meals (
  user_id, eaten_at timestamptz, meal_type text,      -- breakfast/lunch/dinner/snack
  photo_path text,                                     -- storage 경로 (비공개)
  total_kcal numeric, carb_g numeric, protein_g numeric, fat_g numeric,
  gi_estimate numeric, ai_recognized boolean default false
)
meal_items ( meal_id FK, food_name text, amount_desc text, kcal, carb_g, protein_g, fat_g, gi )

-- 혈당
glucose_readings (
  user_id, measured_at timestamptz, value_mgdl numeric not null,
  source text check (source in ('manual','healthkit','health_connect')),
  tag text,                                            -- fasting/pre_meal/post_meal/null
  external_id text                                     -- 헬스플랫폼 중복방지 (unique(user_id, external_id))
)

-- 혈당 예측 로그 (학습·검증용)
glucose_predictions (
  user_id, meal_id FK null, predicted_at timestamptz,
  input_summary jsonb,                                 -- 탄수량, GI, 시간대, cycle_phase, 유사식사 n
  predicted_level text,                                -- low/medium/high
  predicted_peak_min numeric, predicted_peak_max numeric,
  actual_peak numeric null, matched boolean null       -- 실측 유입 후 채움
)

-- 운동 / 수면
workouts ( user_id, performed_at, kind text, body_part text, kcal_burned numeric, source text )
sleep_logs ( user_id, sleep_start timestamptz, sleep_end timestamptz, quality int check (1<=quality<=5), source text )

-- 일기 (원문 암호화 대상 — §9.3)
diaries ( user_id, written_at, content_encrypted text, emotion_tags text[] )
diary_analysis (
  diary_id FK, sentiment numeric,                      -- -1 ~ +1
  emotion_primary text, keywords jsonb                 -- {stress:[], craving:[], relation:[], positive:[]}
)

-- 루틴 & 달성
routines ( user_id, pillar text check (pillar in ('insulin','growth','melatonin','oxytocin')), title text, active boolean )
routine_checks ( routine_id FK, user_id, date date, done boolean, unique(routine_id, date) )

-- AI 리포트
reports (
  user_id, period_start date, period_end date,
  status text check (status in ('queued','generating','done','failed')),
  scores jsonb,                                        -- {insulin:78, growth:60, melatonin:45, oxytocin:82}
  content jsonb,                                       -- §7.4 리포트 JSON 스키마
  model_used text, input_tokens int, output_tokens int, cost_usd numeric  -- 원가 추적
)

-- 구독
subscriptions ( user_id, provider text, product_id text, status text, current_period_end timestamptz, revenuecat_raw jsonb )

-- 친구/치팅데이 (P1)
friendships ( user_id, friend_user_id, status text )
cheat_savings ( user_id, date date, saved_kcal numeric )

-- 식품 영양 DB 캐시 (공용 — RLS 예외, 읽기 전용)
food_db ( food_code text unique, name text, kcal_per_100g, carb, protein, fat, gi_estimate, source text )

-- AI 사용량 (원가 관제)
ai_usage_log ( user_id, function_name text, model text, input_tokens int, output_tokens int, cached_tokens int, cost_usd numeric, created_at )
```

**RLS 정책 원칙**: 모든 사용자 테이블에 `auth.uid() = user_id` (select/insert/update/delete). food_db는 authenticated select만. reports/diary_analysis 등 서버 생성 테이블의 insert는 service_role 전용.

---

## §4. API 설계 (Edge Functions)

인증: 모든 함수는 Supabase JWT 검증. 요율제한: 사용자당 함수별 분당 10회(Upstash Redis 또는 pg 기반 카운터).

### 4.1 POST /food-recognize
· 입력: `{ image_base64 | storage_path }`
· 처리: Claude Haiku 4.5 vision 호출 → 시스템 프롬프트(캐싱): "한국 음식 사진에서 품목·추정량·영양성분 JSON만 반환" → food_db 매칭으로 영양값 보정
· 출력: `{ items: [{name, amount_desc, kcal, carb_g, protein_g, fat_g, gi, confidence}], needs_confirm: true }`
· 신뢰도 0.6 미만 항목은 사용자 확인 강제. 이미지에서 인물 얼굴 감지 시 처리 거부(개인정보).

### 4.2 POST /glucose-predict
· 입력: `{ meal: {carb_g, gi, kcal}, eaten_at, simulate: bool }`
· 처리 (LLM 미사용 — 순수 서버 로직, 비용 0):
```
base_peak = f(carb_g, gi)                       # 탄수 부하 지수 기반 룩업
personal_coeff = 사용자 과거 유사식사(탄수량 ±20%, GI ±15) 실측 피크 / 베이스라인 평균
time_coeff    = 아침 1.1 / 점심 1.0 / 저녁 1.05 / 야식(21시 이후) 1.15
cycle_coeff   = 황체기 1.1, 그 외 1.0
predicted_peak = base_peak × personal_coeff × time_coeff × cycle_coeff
level = low(<140) / medium(140~180) / high(>180)   # 식후 피크 mg/dL 기준
```
· 유사식사 표본 n<3이면 personal_coeff=1.0 고정 + `low_confidence:true`
· 출력에 disclaimer 문자열 필수 포함. glucose_predictions에 로그.
· **실측 매칭 배치**: pg_cron 1시간 주기 — 식후 30~150분 혈당 최고치를 actual_peak로 기록, 예측 검증 지표 산출.

### 4.3 POST /diary-analyze
· 트리거: 일기 저장 시 자동
· Claude Haiku 4.5, 프롬프트 캐싱. 가명처리: user_id·닉네임 전송 금지, 일기 본문 내 전화번호/이메일 패턴 마스킹 후 전송.
· 출력 JSON: `{sentiment, emotion_primary, keywords:{stress[], craving[], relation[], positive[]}}` — JSON 외 출력 금지 프롬프트, 파싱 실패 시 1회 재시도.

### 4.4 POST /report-generate (비동기)
· 트리거: (a) pg_cron — 구독자 대상 마지막 리포트 후 3일 경과 & 데이터 충족 시 큐잉 (b) 사용자 수동 요청
· 파이프라인: §7 참조. 완료 시 FCM 푸시 "혜림님의 3일 리포트가 도착했어요 🦋"

### 4.5 POST /iap-webhook
· RevenueCat 웹훅 서명 검증 → subscriptions upsert. 클라이언트는 구독 상태를 서버 기준으로만 신뢰.

### 4.6 POST /account-delete
· 30일 유예 마킹 → pg_cron이 유예 만료분 파기(consents 등 법정 보존 항목 제외) → 완료 이메일.

---

## §5. 헬스 플랫폼 연동 사양

### iOS (HealthKit)
· 읽기 권한: bloodGlucose, sleepAnalysis, stepCount, activeEnergyBurned
· Info.plist: NSHealthShareUsageDescription — "혈당·수면·활동 데이터를 리포트 분석에 사용합니다"
· 리브레/덱스콤 앱이 HealthKit에 기록한 혈당 샘플을 읽는 구조 (공식 API 직접 연동은 v2)
· 동기화: 앱 포그라운드 진입 시 + 백그라운드 딜리버리(가능 범위), 마지막 sync 시각 이후 증분만, external_id(HK UUID)로 중복 방지

### Android (Health Connect)
· 권한: BloodGlucose, SleepSession, Steps, TotalCaloriesBurned
· Health Connect 미설치 기기: 설치 유도 화면 + 수동 입력 폴백
· Play Console 건강 데이터 사용 신고(Health apps declaration) 필수 — 심사 서류 준비 항목에 포함

공통 규칙: 헬스 데이터는 읽기 전용(v1), 원본 삭제·수정 금지, 사용자가 연동 해제 시 이후 수집 중단(기존 데이터는 유지하되 설정에서 일괄 삭제 옵션 제공).

---

## §6. 혈당 예측 고도화 로드맵 (v2 참고 사양)
· 데이터 축적 후(사용자당 예측-실측 쌍 30건+) gradient boosting 회귀(탄수, GI, 지방·단백 완충효과, 시간대, cycle_phase, 전날 수면시간, 직전 운동 여부 피처)로 교체
· 학습은 서버 배치(주 1회), 모델은 사용자군 공통 모델 + 개인 잔차 보정 2단 구조
· 평가지표: 피크 MAE < 25mg/dL, level 3분류 정확도 > 70% 달성 시 배포

---

## §7. AI 리포트 파이프라인 (핵심 명세)

### 7.1 입력 데이터 조립 (서버, LLM 비용 절감의 핵심)
LLM에 원시 데이터를 던지지 않는다. 서버가 3일치 데이터를 **통계 요약 JSON**으로 압축한다 (~3,000 토큰 목표):
```json
{
  "period": {"start":"...","end":"...","cycle_phase":"luteal"},
  "profile": {"goal":"pcos","age_band":"late20s"},          // 식별자 없음
  "glucose": {"avg":103,"tir_pct":78,"spikes":[{"meal_ref":"m2","peak":174,"foods":["김치볶음밥"],"diary_same_day_keywords":["야근","피곤"]}], "stable_meals":[...]},
  "meals": {"count":8,"avg_carb_g":62,"late_night_count":2,"pattern_notes":"저녁 탄수 비중 58%"},
  "workouts": {"sessions":2,"kcal":420,"skipped_days_diary_keywords":["약속","피곤"]},
  "sleep": {"avg_h":6.1,"quality_avg":2.7,"short_sleep_next_day_avg_glucose_delta":+9},
  "diary": {"sentiment_trend":[-0.2,0.1,-0.5],"top_keywords":{"stress":["야근","마감"],"craving":["떡볶이"],"positive":["산책"]}},
  "routine_completion": {"insulin":0.6,"growth":0.3,"melatonin":0.5,"oxytocin":0.8},
  "cross_stats": [ // 서버가 미리 계산한 상관 후보 (LLM은 해석·서술만 담당)
    {"type":"keyword_glucose","keyword":"피곤","effect":"+23mgdl_evening_peak","n":2},
    {"type":"sleep_craving","effect":"수면6h미만 다음날 간식 +180kcal","n":2}
  ]
}
```
**원칙**: 수치 계산·상관 탐지는 전부 SQL/서버 코드가 수행하고, LLM은 "해석과 한국어 서술, 실천 제안 생성"만 한다. 이것이 환각 방지 + 토큰 절감의 이중 장치다.

### 7.2 LLM 호출
· 모델: claude-sonnet-4-6, max_tokens 2000
· 시스템 프롬프트(프롬프트 캐싱 — 1시간 TTL): 벨라모나 페르소나(따뜻한 여성 헬스 코치), PRD §9 금지·허용 표현 전문 수록, 출력 JSON 스키마, "입력에 없는 수치를 만들어내지 말 것", "의료 조언 금지" 명시
· cross_stats의 n(표본수)이 2 미만인 항목은 "경향이 보여요" 수준으로만 서술하도록 지시

### 7.3 출력 JSON 스키마 (앱 렌더링 계약)
```json
{
  "headline": "string (1문장, 이번 3일의 핵심)",
  "scores": {"insulin":0-100,"growth":..,"melatonin":..,"oxytocin":..},
  "insights": [ {"icon":"emoji","title":"string","body":"string","evidence":"서버 통계 인용","pillars":["insulin","oxytocin"]} ],  // 3~5개
  "glucose_highlight": {"best_meal":"...","worst_meal":"...","comment":"..."},
  "emotion_summary": {"trend":"...","keywords_comment":"..."},
  "cycle_note": "string",
  "actions": [ {"title":"...","how":"측정가능한 구체 행동","pillar":"..."} ],       // 정확히 3개
  "disclaimer": "고정 문구"
}
```
· 스키마 검증(zod) 실패 시 1회 재생성, 재실패 시 status=failed + Sentry 알림.

### 7.4 원가 계산 (관제 기준)
· 리포트 1건: input ~4K(캐시된 시스템 3K + 데이터 1~3K) + output ~1.5K
· Sonnet 4.6 기준 ≈ $0.03~0.05/건. ai_usage_log에 전건 기록, 일 사용자당 상한(리포트 3건/일, 예측 무제한—LLM 미사용, 사진인식 30건/일) 초과 시 차단.

---

## §8. 프론트엔드 사양
· 라우팅: /login /onboarding /today /log/meal /log/glucose /log/workout /log/sleep /diary /predict /report/:id /reports /dashboard /recipes /my /settings
· 오프라인: 기록 4종(식사·혈당·운동·수면)과 일기는 IndexedDB 큐에 저장 → 온라인 복귀 시 동기화(충돌: 클라이언트 타임스탬프 기준 append-only라 충돌 없음)
· 접근성: 폰트 스케일 대응, 색상만으로 정보 전달 금지(혈당 level에 아이콘 병기)
· 기존 bellamona.net의 화면·카피·이모지 톤을 최대한 계승 (사용자에게 익숙한 UI 유지)

---

## §9. 보안 & 개인정보 구현 명세 (법적 필수 — 생략 불가)

### 9.1 분류
· 민감정보(개인정보보호법 §23): 혈당, 생리주기, 목표(PCOS·임신준비), 일기 내용 → **별도 명시 동의** 없이는 저장 자체 금지 (온보딩에서 동의 전 입력 UI 비활성)
· 일반 개인정보: 이메일(OAuth), 닉네임, 신체정보

### 9.2 동의 화면 요구사항 (온보딩 필수 스텝)
체크박스 분리(전체동의 UI 허용하되 개별 확인 가능): ① 이용약관(필수) ② 개인정보 수집·이용(필수) ③ **민감정보(건강정보) 수집·이용(필수)** — 항목·목적·보유기간 명시 ④ **AI 분석을 위한 국외 이전(필수)** — 이전받는 자(Anthropic PBC 등), 국가(미국), 항목(가명처리된 건강기록·일기), 목적, 보유기간 명시 ⑤ 마케팅 수신(선택). 모든 동의는 consents 테이블에 버전·시각 기록.

### 9.3 암호화
· 전송: 전 구간 TLS 1.2+ (Supabase 기본), 앱 내 cleartext 통신 금지 설정
· 저장: Supabase Postgres 디스크 암호화(기본) + **일기 원문은 애플리케이션 레벨 AES-256-GCM 추가 암호화** (키는 Supabase Vault/환경변수, 코드·로그 노출 금지)
· 음식 사진: 비공개 Storage 버킷, 서명 URL(만료 1시간)로만 접근, EXIF GPS 메타데이터 업로드 전 클라이언트에서 제거

### 9.4 가명처리 (LLM 전송 규칙)
· 외부 AI API 페이로드에 금지: 이메일, 실명, 닉네임, user_id 원값, 전화번호, 주소, 사진 속 얼굴
· 일기 본문 전송 전 정규식 마스킹: 전화번호/이메일/URL → [MASKED]
· Anthropic API는 zero-retention 성격의 상용 API 약관을 사용하되, 처리방침에는 보수적으로 국외 이전으로 기재

### 9.5 접근통제·감사
· RLS 전 테이블 강제, service_role 키는 Edge Function 환경변수에만 존재
· 관리자(제품 오너) 조회는 별도 admin 함수 + 감사로그(access_logs: 누가/언제/어떤 user 데이터)
· Rate limit + 인증 실패 잠금(10회/시간)

### 9.6 이용자 권리
· 설정 화면: 데이터 내보내기(JSON+Excel), 동의 내역·철회, 계정 삭제(30일 유예), 헬스 연동 해제
· 개인정보처리방침·민감정보 고지 페이지는 앱 내 + bellamona.net 웹 양쪽 게시 (제품 오너가 최종 법률 검토)

### 9.7 기타
· 만 14세 미만: birth_year 검증으로 가입 차단 + 약관 명시
· 로그에 건강 수치·일기 내용 출력 금지 (Sentry beforeSend 스크러버 구현)
· 백업: Supabase PITR 활성(유료 플랜), 복구 절차 문서화

---

## §10. 테스트 요구사항
· 단위: 혈당 예측 로직(경계값: 탄수 0g, GI null, 황체기), 리포트 JSON 스키마 검증, 마스킹 함수
· 통합: 기록→예측→실측 매칭 E2E(시드 데이터), 리포트 생성 파이프라인(LLM은 목킹 + 실호출 스모크 1건)
· RLS 테스트: 타 사용자 데이터 접근 시도 → 전건 차단 확인 (자동화 필수)
· 결제: RevenueCat 샌드박스 시나리오(구독/갱신/취소/환불→페이월 복귀)
· 성능: 3일 리포트 데이터 조립 쿼리 < 2초(인덱스: (user_id, measured_at) 등)

---

## §11. 스토어 제출 체크리스트
· iOS: Sign in with Apple 구현, HealthKit 사용 목적 문구, App Privacy(건강 데이터 수집 신고), 구독 약관·복원 버튼, 심사 노트에 테스트 계정 제공
· Android: Health Connect 권한 선언 + Play Console 건강앱 신고, Data safety 폼, 구독 상품 등록
· 공통: 개인정보처리방침 URL, 앱 내 계정삭제 진입점(양 스토어 필수 정책), 스크린샷·설명 문구에 의료 표현 금지(PRD §9)

---

## §12. 단계별 실행 계획 (AI 에이전트 작업 지시서)

### Phase 0 — 프로젝트 부트스트랩 (기간 목표: 3일)
S1. 모노레포 생성: `apps/mobile`(Vite+React+TS+Tailwind+Capacitor), `supabase/`(migrations, functions), GitHub Actions(lint+test)
S2. Supabase 프로젝트 연결, §3 전체 스키마 마이그레이션 작성·적용, RLS 정책 전 테이블 작성
S3. .env 체계, Sentry, 기본 라우터/레이아웃(하단 탭: 홈/대시보드/기록+/레시피/마이)
**DoD**: CI 녹색, 마이그레이션 재현 가능(reset 후 재적용 성공), RLS 자동테스트 통과

### Phase 1 — 인증·온보딩·동의 (5일)
S1. Google/Apple OAuth 로그인, 세션 관리
S2. 온보딩 5스텝 UI(기존 사이트 UI 이식) + profiles 저장
S3. §9.2 동의 화면 + consents 기록, 만14세 차단
S4. 설정 화면 골격(동의 조회·철회, 계정삭제 30일 유예 함수)
**DoD**: 신규 가입→온보딩→홈 도달 E2E 통과, 동의 없이는 건강 데이터 입력 UI 접근 불가

### Phase 2 — 기록 기능 4종 + 오프라인 동기화 (7일)
S1. 식사 기록: food_db 적재 배치(공공 API→테이블), 검색 UI, 수동 입력
S2. 음식 사진 → /food-recognize → 확인 화면 → 저장 (EXIF 제거 포함)
S3. 혈당 수동 기록 + 일 혈당 차트(식사 마커 오버레이)
S4. 운동·수면 기록 (기존 UI 이식)
S5. 일기 작성 + /diary-analyze 자동 분석 + 암호화 저장
S6. IndexedDB 오프라인 큐 + 동기화
**DoD**: 비행기모드에서 기록 5종 저장 후 복귀 시 서버 반영, 사진 인식 정확도 스모크(10장 중 7장 이상 사용자 수정 1회 이하)

### Phase 3 — 헬스 플랫폼 연동 (5일)
S1. Capacitor 헬스 플러그인 통합, 권한 플로우(iOS/Android 분기)
S2. 혈당 증분 동기화 + 중복 방지, 수면·걸음 동기화(P1이면 스텁만)
S3. 연동 상태 관리 화면(마지막 동기화 시각, 해제, 데이터 삭제 옵션)
**DoD**: 실기기에서 리브레→건강앱→벨라모나 혈당 유입 확인(테스트 데이터 주입으로 대체 가능), 동일 샘플 재동기화 시 중복 0

### Phase 4 — 혈당 예측 v1 (5일)
S1. /glucose-predict 구현(§4.2 로직) + 단위테스트(경계값 포함)
S2. 예측 UI: 식사 기록 화면 내 실시간 표시 + "이거 먹으면?" 시뮬레이터 화면
S3. 실측 매칭 배치(pg_cron) + "예측 vs 실측" 비교 카드
S4. 무료 티어 일 3회 제한
**DoD**: 시드 데이터로 예측→실측 매칭 E2E, disclaimer 전 화면 노출, 표본 부족 시 low_confidence 처리

### Phase 5 — AI 통합 리포트 (7일)
S1. 3일 데이터 조립 SQL/서비스 (cross_stats 계산 포함) + 단위테스트
S2. /report-generate: Sonnet 호출(프롬프트 캐싱), zod 검증, 재시도, ai_usage_log
S3. pg_cron 스케줄러(구독자 3일 주기) + 데이터 충족 조건 게이트
S4. 리포트 뷰어(카드 스와이프 UI) + 히스토리 + FCM 푸시
S5. 무료 1회 체험 → 페이월 연결
**DoD**: 시드 사용자로 리포트 실생성 성공, 스키마 검증 실패율 <5%(20회 반복 테스트), 건당 비용 로그 $0.08 이하, 금지 의료표현 자동 검사(키워드 스캔) 통과

### Phase 6 — 구독 결제 (5일)
S1. RevenueCat 연동, 상품(월 9,900원) 등록 가이드 문서 산출(스토어 콘솔 작업은 제품 오너)
S2. 페이월 화면(기존 디자인 이식), 구독 상태 게이팅(서버 기준)
S3. /iap-webhook + subscriptions 동기화, 복원 버튼
**DoD**: 샌드박스에서 구독→리포트 잠금해제→취소→만료 후 페이월 복귀 전 시나리오 통과

### Phase 7 — 대시보드·잔여 기능·알림 (5일)
S1. TODAY 홈 완성(4축 링, NET 칼로리), DASHBOARD 월간(저속노화 점수, 달력, 생리기 표시)
S2. CGM 사용자용 혈당 통계 위젯(TIR 등)
S3. 레시피(정적 JSON CMS + 쿠팡파트너스 링크), 알림 3종(리포트/리마인더/주기)
**DoD**: 기존 bellamona.net 대비 기능 패리티 체크리스트 100%

### Phase 8 — 보안 점검·베타·스토어 제출 (7일)
S1. §9 전 항목 셀프 감사 체크리스트 실행·보고 (RLS, 암호화, 마스킹, 로그 스크러버)
S2. 데이터 내보내기/삭제 최종 검증, 처리방침 페이지 연결(문안은 제품 오너 검토)
S3. TestFlight/내부 테스트 트랙 배포, 크래시·성능 모니터링 1주
S4. §11 체크리스트 기반 스토어 제출물 생성(스크린샷 자동화 포함), 심사 노트 작성
**DoD**: 베타 크래시 프리 세션 >99%, 심사 제출 완료

**총 예상 기간: 약 6~7주 (풀타임 AI 에이전트 협업 기준). 제품 오너 병행 작업: 스토어 계정·상품 등록, RevenueCat/Supabase/Anthropic 키 발급, 처리방침 법률 검토, 베타 테스터 10명 모집.**

---

## §13. 용어
· CGM: 연속혈당측정기 (FreeStyle Libre, Dexcom 등)
· TIR: Time in Range, 목표 혈당 범위(70~140 또는 70~180) 내 시간 비율
· cycle_phase: 생리주기 4단계 (menstrual/follicular/ovulation/luteal)
· RLS: Row Level Security (Postgres 행 단위 접근제어)
