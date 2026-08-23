// 성장호르몬 화면 — 무산소(근력) 운동 부위별 기본 루틴.
// 사용자가 "+ 내 루틴 추가"로 직접 추가한 루틴은 S.customRoutines[부위]에 별도로 저장되고
// 이 기본 목록과 합쳐져서 보인다(index.html의 mergedRoutines() 참고).
const STRENGTH_ROUTINES = {
  shoulder: {
    label: '어깨', icon: '🏋️',
    routines: [
      { id: 'sh-1', name: '숄더프레스', sets: 4, reps: '12회', estMin: 8, tips: ['어깨보다 팔꿈치가 너무 벌어지지 않게', '내릴 때 천천히, 반동 쓰지 않기', '어깨 으쓱거리지 않고 승모근 힘 빼기'] },
      { id: 'sh-2', name: '사이드레터럴레이즈', sets: 3, reps: '15회', estMin: 6, tips: ['팔을 완전히 펴지 말고 살짝 굽히기', '새끼손가락이 위로 가듯 살짝 기울여 올리기', '어깨 높이까지만 올리기'] },
      { id: 'sh-3', name: '파이크푸시업', sets: 3, reps: '10회', estMin: 6, tips: ['엉덩이를 높이 들어 역V자 자세 만들기', '시선은 발쪽으로', '팔꿈치는 몸통과 45도 유지'] },
    ]
  },
  chest: {
    label: '가슴', icon: '🫸',
    routines: [
      { id: 'ch-1', name: '푸시업', sets: 4, reps: '15회', estMin: 8, tips: ['손은 어깨보다 약간 넓게', '엉덩이 빠지지 않게 일자 유지', '내려갈 때 가슴이 바닥에 닿기 직전까지'] },
      { id: 'ch-2', name: '덤벨 벤치프레스', sets: 4, reps: '10회', estMin: 10, tips: ['견갑골을 모아 고정하기', '덤벨을 가슴 옆까지 내리기', '발은 바닥에 단단히 고정'] },
      { id: 'ch-3', name: '체스트프레스 머신', sets: 3, reps: '12회', estMin: 7, tips: ['등을 패드에 밀착', '팔꿈치 완전히 펴지 않기', '호흡은 밀 때 내쉬기'] },
    ]
  },
  back: {
    label: '등', icon: '🧗',
    routines: [
      { id: 'bk-1', name: '랫풀다운', sets: 4, reps: '12회', estMin: 8, tips: ['가슴을 살짝 내밀고 바를 쇄골 쪽으로', '팔이 아닌 등으로 당기기', '어깨 으쓱임 없이 견갑골 아래로 내리기'] },
      { id: 'bk-2', name: '시티드로우', sets: 4, reps: '12회', estMin: 8, tips: ['허리를 곧게 펴고 앉기', '팔꿈치를 몸통 뒤로 당기기', '가슴을 펴며 견갑골 모으기'] },
      { id: 'bk-3', name: '풀업', sets: 3, reps: '8-10회', estMin: 7, tips: ['턱이 바 위로 올라올 때까지', '내려갈 땐 천천히 컨트롤', '몸이 흔들리지 않게 코어 유지'] },
    ]
  },
  arms: {
    label: '팔', icon: '💪',
    routines: [
      { id: 'ar-1', name: '덤벨컬', sets: 3, reps: '15회', estMin: 6, tips: ['팔꿈치 고정하고 앞뒤로 흔들지 않기', '올릴 때 손목 꺾지 않기', '천천히 내리며 이두 늘어남 느끼기'] },
      { id: 'ar-2', name: '트라이셉스 딥스', sets: 3, reps: '12회', estMin: 7, tips: ['어깨가 으쓱 올라가지 않게', '팔꿈치는 뒤쪽으로만 굽히기', '내려갈 때 90도까지만'] },
      { id: 'ar-3', name: '킥백', sets: 3, reps: '15회', estMin: 6, tips: ['상체를 숙이고 팔꿈치 고정', '뒤로 펼 때 삼두에 힘주기', '반동 없이 천천히'] },
    ]
  },
  legs: {
    label: '하체', icon: '🦵',
    routines: [
      { id: 'lg-1', name: '스쿼트', sets: 4, reps: '15회', estMin: 8, tips: ['무릎이 발끝 방향과 일치하게', '엉덩이를 뒤로 빼며 앉기', '무릎이 발끝을 넘지 않게'] },
      { id: 'lg-2', name: '런지', sets: 3, reps: '12회(양쪽)', estMin: 8, tips: ['상체는 곧게 세우기', '앞무릎이 발끝을 넘지 않게', '뒷다리 무릎이 바닥에 닿기 직전까지'] },
      { id: 'lg-3', name: '데드리프트', sets: 3, reps: '10회', estMin: 8, tips: ['발목이 쓰일 수 있게 앞으로 기울이기', "손은 바에 '매달린다'는 느낌으로 잡기", '복압 유지 필수'] },
    ]
  },
  core: {
    label: '복근', icon: '🔥',
    routines: [
      { id: 'co-1', name: '플랭크', sets: 3, reps: '40초', estMin: 5, tips: ['엉덩이가 너무 올라가거나 처지지 않게', '팔꿈치는 어깨 바로 아래', '호흡을 참지 말고 자연스럽게'] },
      { id: 'co-2', name: '크런치', sets: 3, reps: '20회', estMin: 5, tips: ['목이 아닌 복근 힘으로 올리기', '허리는 바닥에서 뜨지 않게', '내려갈 때 완전히 눕지 않고 긴장 유지'] },
      { id: 'co-3', name: '레그레이즈', sets: 3, reps: '15회', estMin: 6, tips: ['허리가 뜨지 않게 골반 고정', '다리를 천천히 내리기', '무릎을 살짝 굽혀도 OK'] },
    ]
  },
};
const BODY_PART_ORDER = ['shoulder', 'chest', 'back', 'arms', 'legs', 'core'];
