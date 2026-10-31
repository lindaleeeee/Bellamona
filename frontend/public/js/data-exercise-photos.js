// 운동/스트레칭 상세에 보여줄 실제 동작 사진.
// 출처: free-exercise-db (https://github.com/yuhonas/free-exercise-db) — 퍼블릭 도메인(Unlicense).
// 운동마다 시작 자세(0.jpg)와 끝 자세(1.jpg) 두 장이 있어서, 두 장을 번갈아 보여주면 동작 흐름이 보인다.
// 사진은 /images/exercises/<사진ID>/ 아래에 넣어 두었다(용량 줄이려고 가로 480px로 축소).
// 루틴 id → 사진ID. 딱 맞는 사진이 없는 운동은 빼두었다(틀린 동작을 보여주지 않기 위해).
(function () {
  const EXERCISE_PHOTOS = {
    'sh-2': 'Side_Lateral_Raise',
    'sh-5': 'Standing_Military_Press',
    'sh-6': 'Seated_Bent-Over_Rear_Delt_Raise',
    'sh-7': 'Face_Pull',
    'ch-1': 'Pushups',
    'ch-2': 'Dumbbell_Bench_Press',
    'ch-4': 'Butterfly',
    'ch-5': 'Incline_Push-Up',
    'ch-7': 'Incline_Dumbbell_Press',
    'bk-1': 'Wide-Grip_Lat_Pulldown',
    'bk-2': 'Seated_Cable_Rows',
    'bk-3': 'Pullups',
    'bk-8': 'Bent_Over_Barbell_Row',
    'bk-9': 'Seated_One-arm_Cable_Pulley_Rows',
    'bk-10': 'One-Arm_Kettlebell_Row',
    'ar-1': 'Dumbbell_Bicep_Curl',
    'ar-2': 'Bench_Dips',
    'ar-3': 'Tricep_Dumbbell_Kickback',
    'ar-4': 'Standing_Dumbbell_Triceps_Extension',
    'ar-5': 'Triceps_Pushdown',
    'ar-6': 'Hammer_Curls',
    'lg-1': 'Bodyweight_Squat',
    'lg-2': 'Dumbbell_Lunges',
    'lg-8': 'Split_Squat_with_Dumbbells',
    'lg-10': 'Romanian_Deadlift',
    'lg-13': 'Lying_Leg_Curls',
    'lg-16': 'Standing_Dumbbell_Calf_Raise',
    'gl-1': 'Side_Leg_Raises',
    'gl-2': 'Glute_Kickback',
    'gl-3': 'Single_Leg_Glute_Bridge',
    'gl-10': 'Monster_Walk',
    'gl-11': 'Barbell_Hip_Thrust',
    'co-1': 'Plank',
    'co-2': 'Crunches',
    'co-3': 'Flat_Bench_Lying_Leg_Raise',
    'bl-1': 'Bodyweight_Squat',
    'bl-2': 'Kettlebell_One-Legged_Deadlift',
    'bl-3': 'Kettlebell_One-Legged_Deadlift',
    'bl-6': 'Kettlebell_One-Legged_Deadlift',
    'bl-8': 'One-Arm_Kettlebell_Swings',
    'bl-9': 'Freehand_Jump_Squat',
    'st-sh-1': 'Shoulder_Stretch',
    'st-sh-2': 'Side_Neck_Stretch',
    'st-ch-1': 'Dynamic_Chest_Stretch',
    'st-ch-2': 'Round_The_World_Shoulder_Stretch',
    'st-bk-1': 'Childs_Pose',
    'st-bk-2': 'Spinal_Stretch',
    'st-ar-1': 'Triceps_Stretch',
    'st-ar-2': 'Kneeling_Forearm_Stretch',
    'st-lg-2': 'Standing_Toe_Touches',
    'st-gl-1': 'Ankle_On_The_Knee',
    'st-gl-2': 'Kneeling_Hip_Flexor',
    'st-co-2': 'Standing_Lateral_Stretch'
  };

  let styled = false;
  function ensureStyle() {
    if (styled) return; styled = true;
    const st = document.createElement('style');
    st.textContent = `
      .ex-photo{position:relative;width:100%;max-width:300px;aspect-ratio:4/3;margin:0 auto 10px;border-radius:16px;overflow:hidden;background:var(--card2);border:1.5px solid var(--bdr)}
      .ex-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
      .ex-photo img.ex-b{animation:exFlip 2.4s infinite}
      .ex-photo .ex-tag{position:absolute;left:8px;bottom:8px;background:rgba(0,0,0,.55);color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:99px}
      @keyframes exFlip{0%,42%{opacity:0}50%,92%{opacity:1}100%{opacity:0}}
      @media (prefers-reduced-motion: reduce){.ex-photo img.ex-b{animation:none;opacity:0}}`;
    document.head.appendChild(st);
  }

  // 사진이 있으면 시작/끝 자세를 번갈아 보여주는 HTML, 없으면 빈 문자열
  function exercisePhotoHtml(routineId) {
    const id = EXERCISE_PHOTOS[routineId];
    if (!id) return '';
    ensureStyle();
    const base = `/images/exercises/${id}`;
    return `<div class="ex-photo"><img src="${base}/0.jpg" alt="시작 자세" loading="lazy"><img class="ex-b" src="${base}/1.jpg" alt="끝 자세" loading="lazy"><span class="ex-tag">시작 ↔ 끝 동작</span></div>`;
  }

  window.EXERCISE_PHOTOS = EXERCISE_PHOTOS;
  window.exercisePhotoHtml = exercisePhotoHtml;
})();
