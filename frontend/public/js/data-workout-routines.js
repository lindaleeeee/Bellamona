// 성장호르몬(운동) 화면 — 무산소(근력) 운동 부위별 루틴.
// 사용자가 "+ 내 루틴 추가"로 직접 추가한 루틴은 S.customRoutines[부위]에 별도로 저장되고
// 이 기본 목록과 합쳐져서 보인다(index.html의 mergedRoutines() 참고).
// weight는 실측치가 아니라 사용자의 실제 PT 기록을 참고한 "참고 중량"이며, 체력에 맞게 조절하면 된다.
// glutes(중둔근·고관절 안정화)와 balance(균형·기능성) 두 부위는 PT 기록에 반복적으로 나온
// 고관절/불안정면 훈련을 별도 카테고리로 분리한 것이다.
// 이름은 전부 "무슨 동작인지" 괄호 설명을 붙였고, 같은 동작을 기구만 다르게 부른 중복
// (숄더프레스=오버헤드프레스, 벤치프레스=체스트프레스머신, 펙댁플라이=케이블크로스오버,
// 랫풀다운=프론트풀다운)은 하나로 합쳤다. 스트레칭/마사지 항목(견갑거근 마사지볼 풀기,
// 장요근·이상근 스트레칭)은 근력 세트·횟수 목록과 성격이 달라 제거했다.
const STRENGTH_ROUTINES = {
  shoulder: {
    label: '어깨', icon: '🏋️',
    routines: [
      { id: 'sh-2', pose: 'lateralRaise', name: '사이드 레터럴레이즈 (옆으로 팔 들기)', sets: 3, reps: '15회', estMin: 6, tips: ['팔을 완전히 펴지 말고 살짝 굽히기', '새끼손가락이 위로 가듯 살짝 기울여 올리기', '어깨 높이까지만 올리기'] },
      { id: 'sh-3', pose: 'pushup', name: '파이크 푸시업 (어깨로 미는 푸시업)', sets: 3, reps: '10회', estMin: 6, tips: ['엉덩이를 높이 들어 역V자 자세 만들기', '시선은 발쪽으로', '팔꿈치는 몸통과 45도 유지'] },
      { id: 'sh-5', pose: 'pressOverhead', name: '오버헤드프레스 (숄더프레스, 머리 위로 밀기)', sets: 4, reps: '8회', estMin: 9, weight: '15kg', tips: ['바벨 경로가 수직이 되도록 광배근에 힘주어(외회전) 세우기', '엉덩이·복부로 몸통을 받쳐 밀어올리기', '내릴 때도 광배근으로 버티며 천천히', '손목을 수직으로 세워 팔꿈치를 겨드랑이 쪽으로 내렸다가, 모으지 말고 그대로 수직으로 다시 올리기'] },
      { id: 'sh-6', pose: 'lateralRaise', name: '벤트오버 레터럴레이즈 (숙여서 팔 들기)', sets: 3, reps: '12회', estMin: 6, weight: '2kg', tips: ['목을 숙이고 복부에 힘을 준 채 상체를 기울이기', '팔꿈치를 사선 뒤로 멀리 보낸다는 느낌으로 올리기'] },
      { id: 'sh-7', pose: 'rowSeated', name: '케이블 페이스풀 (얼굴 쪽으로 당기기)', sets: 3, reps: '15회', estMin: 6, weight: '10kg', tips: ['로프를 팔꿈치로 가로로 찢는다는 느낌으로 당기기', '주먹으로 낚아채지 말고 얼굴 쪽으로 가져오기'] },
    ]
  },
  chest: {
    label: '가슴', icon: '🫸',
    routines: [
      { id: 'ch-1', pose: 'pushup', name: '푸시업 (가슴으로 밀기)', sets: 4, reps: '15회', estMin: 8, tips: ['손은 어깨보다 약간 넓게', '엉덩이 빠지지 않게 일자 유지', '내려갈 때 가슴이 바닥에 닿기 직전까지'] },
      { id: 'ch-2', pose: 'pressChest', name: '벤치프레스 (가슴 밀어올리기, 덤벨·머신)', sets: 4, reps: '10회', estMin: 10, tips: ['견갑골을 모아 고정하기', '가슴 옆까지 내렸다가 밀어올리기', '등을 패드나 벤치에 밀착', '호흡은 밀 때 내쉬기'] },
      { id: 'ch-4', pose: 'pressChest', name: '체스트 플라이 (양팔로 가슴 모으기, 펙댁·케이블)', sets: 3, reps: '15회', estMin: 6, weight: '15kg', tips: ['가슴을 모은다는 느낌으로 팔을 몸 앞에서 모으기', '팔꿈치는 살짝 굽힌 채 고정', '동작 내내 가슴 긴장 유지'] },
      { id: 'ch-5', pose: 'pushup', name: '스미스머신 푸시업 (각도조절 푸시업)', sets: 3, reps: '12회', estMin: 7, tips: ['가슴을 바 위로 들고 팔 사이로 가슴통을 집어넣기', '엉덩이에 힘주고 몸통을 일자로 유지'] },
      { id: 'ch-7', pose: 'pressChest', name: '인클라인 덤벨프레스 (윗가슴 밀기)', sets: 3, reps: '10회', estMin: 8, tips: ['벤치 각도는 30~45도로', '가슴 윗부분에 자극이 오는지 확인하며 천천히'] },
    ]
  },
  back: {
    label: '등', icon: '🧗',
    routines: [
      { id: 'bk-1', pose: 'pulldown', name: '랫풀다운 (봉을 가슴까지 당기기)', sets: 4, reps: '12회', estMin: 8, weight: '20kg', tips: ['가슴을 살짝 내밀고 바를 쇄골 쪽으로', '팔이 아닌 등으로 당기기', '어깨 으쓱임 없이 견갑골 아래로 내리기', '올라갈 때(이완 시)도 어깨를 누르고 겨드랑이를 조이며 가슴을 든 채 천천히 풀어주기'] },
      { id: 'bk-2', pose: 'rowSeated', name: '시티드로우 (앉아서 등 가운데로 당기기)', sets: 4, reps: '12회', estMin: 8, weight: '15kg', tips: ['허리를 곧게 펴고 앉기', '팔꿈치를 몸통 뒤로 당기기', '가슴을 펴며 견갑골 모으기'] },
      { id: 'bk-3', pose: 'pullup', name: '풀업 (턱걸이)', sets: 3, reps: '8-10회', estMin: 7, tips: ['턱이 바 위로 올라올 때까지', '내려갈 땐 천천히 컨트롤', '몸이 흔들리지 않게 코어 유지'] },
      { id: 'bk-4', pose: 'pulldown', name: '케이블 암풀다운 (팔 펴고 당기기)', sets: 3, reps: '15회', estMin: 6, weight: '15kg', tips: ['팔꿈치가 좌우로 열리게', '주먹이 아닌 팔을 몸통으로 끌어내리기', '체스트업은 마지막 순간에만'] },
      { id: 'bk-5', pose: 'pulldown', name: '클로즈그립 랫풀다운 (좁게 잡고 당기기)', sets: 4, reps: '12회', estMin: 8, weight: '20kg', tips: ['늘릴 때도 팔꿈치가 벌어지지 않게 외회전력을 유지하며 늘리기'] },
      { id: 'bk-6', pose: 'pulldown', name: '회전 랫풀다운 (한쪽씩 비틀어 당기기)', sets: 3, reps: '편측 15-20회 × 2-3세트', estMin: 8, tips: ['무릎으로 하체·골반을 단단히 지지하기', '한쪽으로 회전해 등 긴장감을 강하게 머금은 채 당기기'] },
      { id: 'bk-7', pose: 'rowSeated', name: '클로즈그립 시티드로우 (좁게 잡고 당기기)', sets: 4, reps: '12회', estMin: 8, weight: '20kg', tips: ['광배근을 위해 견갑보다 팔을 찍어누르듯 당기기', '늘릴 때는 체스트업만 유지'] },
      { id: 'bk-8', pose: 'rowBent', name: '바벨로우 (허리 숙여 당기기)', sets: 4, reps: '10회', estMin: 9, weight: '10kg', tips: ['엉덩이를 살짝 빼 앞꿈치 무게중심을 유지', '바를 구부러뜨린다는 느낌으로 광배근 힘 유지', '팔꿈치로 몸통에 붙이며 당기기'] },
      { id: 'bk-9', pose: 'rowSeated', name: '원암 시티드로우 (한쪽씩 당기기)', sets: 3, reps: '편측 12회', estMin: 8, tips: ['어깨를 낮추고 팔을 뻗어 고관절을 숙여 최대한 이완', '팔꿈치를 찍어누르며 당기고, 가슴은 곧게 든 채 마무리'] },
      { id: 'bk-10', pose: 'rowBent', name: '원레그 케틀벨 로우 (한발 서서 당기기)', sets: 3, reps: '편측 12회', estMin: 7, weight: '6kg', tips: ['광배근 긴장을 유지하며 팔꿈치를 적극적으로 접어 몸에 붙이기', '골반을 스프링처럼 이용해 상하체를 함께 움직여도 좋음'] },
      { id: 'bk-11', pose: 'rowBent', name: '케틀벨 로우 (탄력있게 당기기)', sets: 3, reps: '12회', estMin: 7, tips: ['발바닥으로 땅을 눌러주며 손으로만 낚아채지 않기', '몸통·골반으로도 함께 눌러 받아주기'] },
    ]
  },
  arms: {
    label: '팔', icon: '💪',
    routines: [
      { id: 'ar-1', pose: 'curl', name: '덤벨컬 (이두 감아올리기)', sets: 3, reps: '15회', estMin: 6, tips: ['팔꿈치 고정하고 앞뒤로 흔들지 않기', '올릴 때 손목 꺾지 않기', '천천히 내리며 이두 늘어남 느끼기'] },
      { id: 'ar-2', pose: 'triceps', name: '트라이셉스 딥스 (팔 굽혀 내려앉기)', sets: 3, reps: '12회', estMin: 7, tips: ['어깨가 으쓱 올라가지 않게', '팔꿈치는 뒤쪽으로만 굽히기', '내려갈 때 90도까지만'] },
      { id: 'ar-3', pose: 'triceps', name: '킥백 (팔 뒤로 펴기)', sets: 3, reps: '15회', estMin: 6, tips: ['상체를 숙이고 팔꿈치 고정', '뒤로 펼 때 삼두에 힘주기', '반동 없이 천천히'] },
      { id: 'ar-4', pose: 'triceps', name: '덤벨 오버헤드 익스텐션 (머리 뒤로 폈다 접기)', sets: 3, reps: '12회', estMin: 6, weight: '4kg', tips: ['광배와 복근에 힘을 주어 팔이 너무 모이지 않게', '덤벨을 너무 많이 내리지 않기'] },
      { id: 'ar-5', pose: 'triceps', name: '케이블 푸쉬다운 (아래로 눌러 펴기)', sets: 3, reps: '15회', estMin: 6, weight: '10kg', tips: ['어깨를 눌러 무게중심을 그립에 싣기', '주먹을 누르며 몸 쪽으로 끌어당기기'] },
      { id: 'ar-6', pose: 'curl', name: '해머컬 (손바닥 세워 감아올리기)', sets: 3, reps: '12회', estMin: 6, tips: ['손바닥이 마주보게 잡고 팔꿈치 고정', '전완이 함께 자극되는 느낌 확인'] },
    ]
  },
  legs: {
    label: '하체', icon: '🦵',
    routines: [
      { id: 'lg-1', pose: 'squat', name: '스쿼트 (앉았다 일어서기)', sets: 4, reps: '15회', estMin: 8, tips: ['무릎이 발끝 방향과 일치하게', '엉덩이를 뒤로 빼며 앉기', '무릎이 발끝을 넘지 않게'] },
      { id: 'lg-2', pose: 'lunge', name: '런지 (한발 내딛어 앉기)', sets: 3, reps: '12회(양쪽)', estMin: 8, tips: ['상체는 곧게 세우기', '앞무릎이 발끝을 넘지 않게', '뒷다리 무릎이 바닥에 닿기 직전까지'] },
      { id: 'lg-3', pose: 'hinge', name: '컨벤셔널 데드리프트 (기본 바닥에서 들기)', sets: 4, reps: '10회', estMin: 9, weight: '30kg', tips: ['발목이 쓰일 수 있게 살짝 앞으로 기울이기', "손은 바에 '매달린다'는 느낌으로 잡기", '복압 유지 필수'] },
      { id: 'lg-4', pose: 'squat', name: '덤벨 스쿼트 (고블릿 스쿼트, 덤벨 안고 앉기)', sets: 4, reps: '15회', estMin: 8, tips: ['덤벨을 가슴 앞에 세로로 들고 앉기', '팔꿈치로 무릎을 살짝 밀어주며 가동범위 확보'] },
      { id: 'lg-5', pose: 'squat', name: '스미스머신 스쿼트 (기구 지지대 스쿼트)', sets: 4, reps: '10회', estMin: 9, weight: '10kg', tips: ['복부 긴장을 잡고 허리를 곧게 세워 고관절부터 접기', '사타구니 사이로 몸통을 아래로 박아주듯 앉기'] },
      { id: 'lg-7', pose: 'lunge', name: '스플릿 스쿼트 (앞뒤로 다리 벌려 앉기)', sets: 3, reps: '편측 10회', estMin: 8, tips: ['척추는 세우고 상체를 살짝 기울여 앞발 9 : 뒷발 1 무게중심 유지', '발로 땅을 누르며 일어나기'] },
      { id: 'lg-8', pose: 'lunge', name: '불가리안 스플릿 스쿼트 (뒷발 벤치 올려 앉기)', sets: 3, reps: '편측 10회', estMin: 8, tips: ['뒷발을 벤치에 올리고 앞다리 위주로 체중 싣기', '무릎이 안이나 밖으로 흔들리지 않게'] },
      { id: 'lg-9', pose: 'squat', name: '점프 스쿼트 (뛰어오르는 스쿼트)', sets: 3, reps: '10회', estMin: 6, tips: ['착지할 때 무릎을 부드럽게 굽혀 충격 흡수', '착지 즉시 바로 다음 점프로 이어가지 않아도 됨'] },
      { id: 'lg-10', pose: 'hinge', name: '루마니안 데드리프트 (다리 편 채 숙이기)', sets: 4, reps: '10회', estMin: 9, weight: '30kg', tips: ['발 접지가 땅에 찐하게 박히도록(특히 앞꿈치까지)', '내려갈 때도 복압과 광배근 긴장 유지', '곧게 서는 힌지가 중요 — 상체는 광배에 힘주기'] },
      { id: 'lg-11', pose: 'hinge', name: '슈트케이스 데드리프트 (한쪽만 들어올리기)', sets: 3, reps: '편측 10회', estMin: 8, weight: '8kg', tips: ['어깨와 고관절이 돌아가지 않게 몸통을 바로 세우기'] },
      { id: 'lg-12', pose: 'hinge', name: '랜드마인 데드리프트 (봉 한쪽 끝 들어올리기)', sets: 3, reps: '12회', estMin: 8, weight: '+5kg', tips: ['앞으로 살짝 쏟아지는 느낌으로 서기', '엉덩이만 빼고 집어넣듯 움직이기'] },
      { id: 'lg-13', pose: 'legCurlProne', name: '레그컬 (엎드려 다리 당기기)', sets: 4, reps: '15회', estMin: 7, weight: '15kg', tips: ['햄스트링에 집중해서 천천히 당기기', '반동 없이 컨트롤하며 내리기'] },
      { id: 'lg-14', pose: 'lunge', name: '런지 발올리기 (런지 후 뒷발 들기)', sets: 3, reps: '편측 12회', estMin: 8, tips: ['런지 하강 후 뒷발을 살짝 들어 균형을 잡으며 일어나기'] },
      { id: 'lg-15', pose: 'lunge', name: '런지 니업 + 케틀벨 띄우기 (런지 후 뛰어오르기)', sets: 3, reps: '편측 8회', estMin: 8, tips: ['몸통을 아래로 눌러주며 스프링처럼 튀어오르는 느낌으로 다리와 케틀벨을 띄우기'] },
      { id: 'lg-16', pose: 'calfRaise', name: '카프레이즈 (까치발 들기)', sets: 4, reps: '20회', estMin: 5, tips: ['발로 땅을 잘 밟은 상태로 모아 몸을 위로 세우기', '발끝으로 최대한 높이 올라간 뒤 천천히 내리기'] },
      { id: 'lg-17', pose: 'calfRaise', name: '월싯 카프레이즈 (벽 기대고 까치발 들기)', sets: 3, reps: '15회', estMin: 5, tips: ['벽에 기대 앉은 자세를 유지한 채 종아리만 올렸다 내리기', '발로 땅을 잘 밟은 상태로 모아 몸을 위로 세우기'] },
      { id: 'lg-18', pose: 'calfRaise', name: '카프레이즈 (공 끼우고 까치발 들기)', sets: 3, reps: '15회', estMin: 5, tips: ['무릎 사이에 공을 끼워 안쪽 정렬을 유지한 채 발끝으로 올리기', '발로 땅을 잘 밟은 상태로 모아 몸을 위로 세우기'] },
      { id: 'lg-19', pose: 'squat', name: '스쿼트 발목 스트레칭 (쭈그려 앉아 체중 싣기)', sets: 3, reps: '10회', estMin: 6, tips: ['쭈그려 앉아 두번째 발가락 쪽으로 체중 싣기', '뒤꿈치가 떨어지지 않도록 주의'] },
    ]
  },
  glutes: {
    label: '둔근 · 고관절', icon: '🍑',
    routines: [
      { id: 'gl-1', pose: 'hipStandAbduct', name: '사이드 레그레이즈 (다리 옆으로 들기, 중둔근)', sets: 2, reps: '20회 × 2세트', estMin: 6, tips: ['다리를 옆으로 들어올리며 중둔근 긴장 유지', '몸통이 흔들리지 않게 코어 고정'] },
      { id: 'gl-2', pose: 'hipQuadruped', name: '네발기기 다리차기 (뒤로 차올리기, 둔근)', sets: 2, reps: '20회 × 2세트', estMin: 6, tips: ['골반이 좌우로 기울지 않게 유지한 채 다리를 위아래로 움직이기'] },
      { id: 'gl-3', pose: 'bridge', name: '원레그 힙브릿지 (한다리로 엉덩이 들기)', sets: 3, reps: '편측 12회', estMin: 6, tips: ['복부를 웅크려 뒤꿈치로 땅을 밟아 엉덩이 띄우기', '허리가 아닌 엉덩이 힘으로 밀어올리기'] },
      { id: 'gl-4', pose: 'hipStandAbduct', name: '스탠딩 아웃타이 (서서 다리 벌리기)', sets: 3, reps: '15회', estMin: 6, tips: ['척추를 세워 스쿼트 하듯 앉으며 다리 벌리기', '무릎이 발끝 방향을 따라가게'] },
      { id: 'gl-5', pose: 'lunge', name: '짐볼 런지 (짐볼 밟고 런지, 엉덩이)', sets: 3, reps: '편측 10회', estMin: 8, tips: ['고관절을 뒤로 접으며 앉기', '뒷발로 짐볼을 짓누르며 밀어내듯 빼기'] },
      { id: 'gl-6', pose: 'lunge', name: '고관절 외회전 (다리 바깥으로 돌리기)', sets: 2, reps: '10회 × 좌우', estMin: 6, tips: ['런지 자세에서 발을 더 넓게 선 뒤 복부를 최대한 말기', '내전근 스트레칭·둔부 수축감이 느껴지면 체중을 검지발가락 쪽으로 3초 이동 후 복귀'] },
      { id: 'gl-7', pose: 'balanceSingle', name: '고관절 내회전 (뒷다리 들어 안쪽으로 돌리기)', sets: 2, reps: '15-20회 × 좌우', estMin: 7, tips: ['상체를 세운 채 뒷발만 살짝 들었다 천천히 내리기', '엉덩이가 바닥에서 너무 뜨지 않게 주의'] },
      { id: 'gl-8', pose: 'bridge', name: '골반 중립 잡기 (힙드라이빙, 골반 밀기)', sets: 3, reps: '15회', estMin: 6, tips: ['발을 바깥으로 두고 발바닥으로 땅을 바깥으로 찢듯이 밀기', '둔부에 30% 정도의 긴장을 잡는 느낌 유지'] },
      { id: 'gl-9', pose: 'hipSideLying', name: '클램쉘 (옆으로 누워 다리 벌리기)', sets: 3, reps: '편측 15회', estMin: 6, tips: ['옆으로 누워 무릎을 조개처럼 벌리기', '골반이 뒤로 넘어가지 않게 고정'] },
      { id: 'gl-10', pose: 'hipStandAbduct', name: '몬스터워크 (밴드 걸고 옆걸음)', sets: 3, reps: '10걸음 × 전후', estMin: 6, tips: ['무릎 위에 밴드를 걸고 살짝 굽힌 자세 유지한 채 옆으로/앞뒤로 걷기'] },
      { id: 'gl-11', pose: 'bridge', name: '힙쓰러스트 (엉덩이 밀어올리기)', sets: 4, reps: '12회', estMin: 8, tips: ['어깨를 벤치에 걸치고 턱을 당긴 채 엉덩이로 밀어올리기', '정점에서 둔근을 짜듯 1초 정지'] },
      { id: 'gl-12', pose: 'hipQuadruped', name: '파이어하이드런트 (네발기기 다리 옆으로 들기)', sets: 3, reps: '편측 15회', estMin: 6, tips: ['네발기기 자세에서 무릎을 굽힌 채 옆으로 들어올리기', '허리가 함께 돌아가지 않게 코어 고정'] },
    ]
  },
  core: {
    label: '복근', icon: '🔥',
    routines: [
      { id: 'co-1', pose: 'plank', name: '플랭크 (엎드려 버티기)', sets: 3, reps: '40초', estMin: 5, tips: ['엉덩이가 너무 올라가거나 처지지 않게', '팔꿈치는 어깨 바로 아래', '호흡을 참지 말고 자연스럽게'] },
      { id: 'co-2', pose: 'crunch', name: '크런치 (윗몸 말아 올리기)', sets: 3, reps: '20회', estMin: 5, tips: ['목이 아닌 복근 힘으로 올리기', '허리는 바닥에서 뜨지 않게', '내려갈 때 완전히 눕지 않고 긴장 유지'] },
      { id: 'co-3', pose: 'legRaise', name: '레그레이즈 (누워서 다리 들기)', sets: 3, reps: '15회', estMin: 6, tips: ['허리가 뜨지 않게 골반 고정', '다리를 천천히 내리기', '무릎을 살짝 굽혀도 OK'] },
    ]
  },
  balance: {
    label: '균형 · 기능성', icon: '🤸',
    routines: [
      { id: 'bl-1', pose: 'squat', name: '보수볼 스쿼트 (불안정 발판 위 스쿼트)', sets: 3, reps: '12회', estMin: 8, tips: ['발바닥 전체로 보수볼을 눌러 균형 잡기', '무릎이 안쪽으로 무너지지 않게'] },
      { id: 'bl-2', pose: 'hinge', name: '보수볼 한다리 데드리프트+프레스 (균형+밀기)', sets: 3, reps: '편측 8회', estMin: 8, tips: ['원레그 데드리프트 후 ㄱ자로 덤벨을 몸에 얹어 바로 프레스로 연결'] },
      { id: 'bl-3', pose: 'hinge', name: '보수볼 버티기 (한다리로 숙여 균형잡기)', sets: 3, reps: '30초 × 3세트', estMin: 6, tips: ['곧게 서는 힌지 자세가 중요', '상체는 광배에 힘을 주는 게 좋음'] },
      { id: 'bl-6', pose: 'hinge', name: '싱글레그 데드리프트 (한다리로 숙여 들기)', sets: 3, reps: '편측 10회', estMin: 8, tips: ['골반이 정면을 유지한 채 상체와 뒷다리를 일직선으로 뻗기'] },
      { id: 'bl-8', pose: 'kbSwing', name: '케틀벨 스윙 (골반 힘으로 흔들어 들기)', sets: 4, reps: '15회', estMin: 7, weight: '8kg', tips: ['케틀벨과 몸통이 한 타이밍으로 떨어질 수 있게', '허리가 아닌 고관절 힌지로 스윙'] },
      { id: 'bl-9', pose: 'hinge', name: '케틀벨 데드리프트+점프스쿼트 (들고 바로 뛰어오르기)', sets: 3, reps: '8회', estMin: 8, tips: ['데드리프트로 들어올린 뒤 바로 이어서 점프스쿼트로 연결'] },
    ]
  },
};
const BODY_PART_ORDER = ['shoulder', 'chest', 'back', 'arms', 'legs', 'glutes', 'core', 'balance'];
