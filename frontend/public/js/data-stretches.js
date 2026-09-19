// 성장호르몬(운동) 화면 — 운동 후 부위별 스트레칭.
// STRENGTH_ROUTINES(근력, 세트·횟수)와 성격이 달라 별도 목록으로 뒀다. 같은 STRETCH_BODY_PART_ORDER
// 키(shoulder/chest/back/arms/legs/glutes/core)로 근력 부위와 짝지어 "이 부위 운동 후 스트레칭"으로
// 보여줄 수 있게 만들었다. holdSec = 유지 시간(초), pose는 data-pose-illustrations.js의 스트레칭 자세.
const STRETCH_ROUTINES = {
  shoulder: {
    label: '어깨', icon: '🏋️',
    routines: [
      { id: 'st-sh-1', pose: 'stretchCrossBody', name: '크로스바디 숄더 스트레칭 (팔 가슴쪽으로 당기기)', holdSec: 30, reps: '좌우 각 1회', tips: ['한쪽 팔을 몸 앞으로 곧게 뻗어 반대쪽 손으로 팔꿈치를 감싸 당기기', '어깨는 으쓱 올라가지 않게 아래로 힘 빼기'] },
      { id: 'st-sh-2', pose: 'stretchNeckSide', name: '목·어깨 옆으로 당기기', holdSec: 30, reps: '좌우 각 1회', tips: ['한 손으로 머리를 살짝 반대쪽으로 기울이고, 반대쪽 손은 아래로 뻗어 당김을 더하기', '목이 아닌 어깨 옆쪽이 늘어나는 느낌에 집중'] },
    ]
  },
  chest: {
    label: '가슴', icon: '🫸',
    routines: [
      { id: 'st-ch-1', pose: 'stretchChestDoorway', name: '도어웨이 가슴 스트레칭 (문틀 짚고 몸 돌리기)', holdSec: 30, reps: '좌우 각 1회', tips: ['팔꿈치를 어깨 높이로 문틀이나 벽에 대고 몸을 반대 방향으로 돌리기', '가슴 앞쪽이 당기는 느낌이 들 때까지만'] },
      { id: 'st-ch-2', pose: 'stretchChestClasp', name: '깍지껴 가슴 펴기 (양손 등 뒤로 잡기)', holdSec: 30, reps: '2회', tips: ['양손을 등 뒤에서 깍지 끼고 팔을 뒤로 살짝 들어올리기', '가슴을 앞으로 내밀며 어깨뼈를 모으기'] },
    ]
  },
  back: {
    label: '등', icon: '🧗',
    routines: [
      { id: 'st-bk-1', pose: 'stretchChildPose', name: '아이 자세 (무릎 꿇고 팔 뻗어 엎드리기)', holdSec: 40, reps: '1-2회', tips: ['무릎을 꿇고 엉덩이를 뒤꿈치 쪽으로 앉히며 팔을 앞으로 쭉 뻗기', '호흡할 때마다 등이 넓어지는 느낌에 집중'] },
      { id: 'st-bk-2', pose: 'stretchSeatedTwist', name: '시티드 스파인 트위스트 (앉아서 허리 비틀기)', holdSec: 30, reps: '좌우 각 1회', tips: ['앉은 자세에서 한쪽 무릎을 세우고 반대 팔로 그 무릎을 살짝 눌러 상체를 비틀기', '허리가 아닌 등 전체가 부드럽게 회전되는 느낌으로'] },
    ]
  },
  arms: {
    label: '팔', icon: '💪',
    routines: [
      { id: 'st-ar-1', pose: 'stretchOverheadTriceps', name: '오버헤드 트라이셉스 스트레칭 (팔 머리 뒤로 접기)', holdSec: 30, reps: '좌우 각 1회', tips: ['한쪽 팔을 위로 들어 팔꿈치를 접어 손이 등 위쪽에 닿게 하기', '반대쪽 손으로 팔꿈치를 살짝 눌러 당김을 더하기'] },
      { id: 'st-ar-2', pose: 'stretchWrist', name: '손목·전완 스트레칭 (손가락 뒤로 당기기)', holdSec: 20, reps: '좌우 각 2회', tips: ['팔을 앞으로 뻗고 손바닥이 위를 향하게 한 뒤 반대 손으로 손가락을 몸쪽으로 살짝 당기기', '통증이 아닌 당기는 느낌까지만'] },
    ]
  },
  legs: {
    label: '하체', icon: '🦵',
    routines: [
      { id: 'st-lg-1', pose: 'stretchQuadStanding', name: '스탠딩 대퇴사두 스트레칭 (서서 발등 잡아 당기기)', holdSec: 30, reps: '좌우 각 1회', tips: ['한쪽 발을 뒤로 접어 발등이나 발목을 손으로 잡고 뒤꿈치를 엉덩이 쪽으로 당기기', '무릎은 몸통과 나란히, 골반이 앞으로 빠지지 않게'] },
      { id: 'st-lg-2', pose: 'stretchHamstringForward', name: '햄스트링 스트레칭 (서서 상체 숙이기)', holdSec: 30, reps: '2회', tips: ['무릎을 살짝 편 채로 골반부터 접듯이 상체를 앞으로 숙이기', '허리를 둥글게 마는 게 아니라 고관절에서 접는 느낌으로'] },
    ]
  },
  glutes: {
    label: '둔근 · 고관절', icon: '🍑',
    routines: [
      { id: 'st-gl-1', pose: 'stretchFigure4', name: '피겨4 스트레칭 (누워서 발목 무릎에 걸치기)', holdSec: 30, reps: '좌우 각 1회', tips: ['누운 상태에서 한쪽 발목을 반대쪽 무릎 위에 4자 모양으로 걸치기', '반대쪽 허벅지 뒤를 잡고 가슴 쪽으로 당기기'] },
      { id: 'st-gl-2', pose: 'stretchKneel', name: '런지 자세 고관절 스트레칭 (한쪽 무릎 꿇고 앞으로 밀기)', holdSec: 30, reps: '좌우 각 1회', tips: ['런지 자세에서 뒷무릎을 바닥에 대고 골반을 앞으로 살짝 밀기', '엉덩이와 허벅지 앞쪽이 늘어나는 느낌에 집중'] },
    ]
  },
  core: {
    label: '복근', icon: '🔥',
    routines: [
      { id: 'st-co-1', pose: 'stretchCobra', name: '코브라 스트레칭 (엎드려 상체 들어올리기)', holdSec: 30, reps: '2회', tips: ['엎드린 상태에서 팔로 바닥을 밀어 상체만 천천히 들어올리기', '허리에 통증이 있으면 팔꿈치를 굽힌 채로만 살짝 들기'] },
      { id: 'st-co-2', pose: 'stretchSideBend', name: '사이드 벤드 스트레칭 (서서 옆으로 굽히기)', holdSec: 20, reps: '좌우 각 1회', tips: ['한쪽 팔을 머리 위로 뻗으며 반대쪽으로 몸통을 옆으로 굽히기', '허리 옆쪽이 늘어나는 느낌으로, 앞뒤로 기울지 않게'] },
    ]
  },
};
const STRETCH_BODY_PART_ORDER = ['shoulder', 'chest', 'back', 'arms', 'legs', 'glutes', 'core'];
