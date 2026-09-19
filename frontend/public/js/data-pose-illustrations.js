// 운동 상세(루틴 상세 모달)에서 "용어만으로는 안 보이는" 자세를 그림으로 보여주기 위한
// 미니멀 스틱맨 일러스트. 사진 생성 도구가 없어서 실사 사진 대신, 각 운동의 핵심 자세를
// 좌표 기반으로 그린 벡터 그림(SVG)이다 — 운동마다 1장씩, POSES에서 pose 키로 연결한다.
// 팔다리는 hip/neck/head를 기준으로 한 관절 좌표(joints)를 잇는 직선으로 그리고,
// 바벨/케틀벨/벤치 같은 소품은 extra에 별도 SVG 조각으로 얹는다.
(function () {
  function line(a, b, color, w) {
    return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
  }
  // joints: head,neck,hip,lKnee,lFoot,rKnee,rFoot,lElbow,lHand,rElbow,rHand (모두 [x,y], 0~100 좌표계)
  function stickSvg(j, extra) {
    const color = 'var(--gro2, var(--gro))';
    const w = 5, headR = 8;
    return `<svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
      <line x1="4" y1="95" x2="96" y2="95" stroke="var(--bdr)" stroke-width="2"/>
      ${extra || ''}
      ${line(j.hip, j.lKnee, color, w)}${line(j.lKnee, j.lFoot, color, w)}
      ${line(j.hip, j.rKnee, color, w)}${line(j.rKnee, j.rFoot, color, w)}
      ${line(j.neck, j.hip, color, w)}
      ${line(j.neck, j.lElbow, color, w)}${line(j.lElbow, j.lHand, color, w)}
      ${line(j.neck, j.rElbow, color, w)}${line(j.rElbow, j.rHand, color, w)}
      <circle cx="${j.head[0]}" cy="${j.head[1]}" r="${headR}" fill="none" stroke="${color}" stroke-width="${w}"/>
    </svg>`;
  }
  // 소품 헬퍼 (바벨/케틀벨/벤치/철봉)
  const props = {
    barbell: (x1, y, x2) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="var(--text)" stroke-width="4" stroke-linecap="round"/><circle cx="${x1}" cy="${y}" r="4" fill="var(--text)"/><circle cx="${x2}" cy="${y}" r="4" fill="var(--text)"/>`,
    ball: (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r || 6}" fill="none" stroke="var(--text)" stroke-width="3"/>`,
    bench: (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h || 6}" rx="2" fill="var(--bdr)"/>`,
    bar: (x1, y, x2) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="var(--text)" stroke-width="4" stroke-linecap="round"/>`,
  };

  const POSES = {
    squat: {
      joints: { head: [50, 18], neck: [50, 27], hip: [50, 55], lKnee: [37, 70], lFoot: [35, 90], rKnee: [63, 70], rFoot: [65, 90], lElbow: [40, 45], lHand: [34, 58], rElbow: [60, 45], rHand: [66, 58] },
    },
    lunge: {
      joints: { head: [45, 18], neck: [45, 27], hip: [45, 52], lKnee: [22, 76], lFoot: [12, 90], rKnee: [57, 70], rFoot: [60, 88], lElbow: [30, 40], lHand: [20, 50], rElbow: [60, 40], rHand: [70, 50] },
    },
    hinge: {
      joints: { head: [28, 36], neck: [34, 42], hip: [55, 55], lKnee: [58, 73], lFoot: [58, 90], rKnee: [52, 73], rFoot: [52, 90], lElbow: [33, 56], lHand: [30, 73], rElbow: [37, 56], rHand: [34, 73] },
      extra: props.barbell(24, 74, 40),
    },
    bridge: {
      joints: { head: [12, 72], neck: [22, 70], hip: [45, 55], lKnee: [68, 72], lFoot: [85, 74], rKnee: [68, 72], rFoot: [85, 74], lElbow: [20, 74], lHand: [10, 76], rElbow: [20, 74], rHand: [10, 76] },
    },
    plank: {
      joints: { head: [14, 46], neck: [25, 46], hip: [55, 48], lKnee: [80, 50], lFoot: [92, 52], rKnee: [80, 50], rFoot: [92, 52], lElbow: [25, 60], lHand: [22, 72], rElbow: [25, 60], rHand: [22, 72] },
    },
    pushup: {
      joints: { head: [14, 50], neck: [25, 50], hip: [55, 51], lKnee: [80, 53], lFoot: [92, 55], rKnee: [80, 53], rFoot: [92, 55], lElbow: [26, 63], lHand: [23, 76], rElbow: [26, 63], rHand: [23, 76] },
    },
    rowBent: {
      joints: { head: [26, 32], neck: [33, 38], hip: [55, 55], lKnee: [55, 73], lFoot: [53, 90], rKnee: [59, 73], rFoot: [57, 90], lElbow: [42, 47], lHand: [50, 40], rElbow: [42, 53], rHand: [50, 46] },
    },
    rowSeated: {
      joints: { head: [35, 35], neck: [35, 45], hip: [35, 75], lKnee: [60, 76], lFoot: [88, 76], rKnee: [60, 76], rFoot: [88, 76], lElbow: [20, 45], lHand: [14, 55], rElbow: [20, 45], rHand: [14, 55] },
      extra: `<line x1="14" y1="55" x2="90" y2="62" stroke="var(--text)" stroke-width="2" stroke-dasharray="3,3"/>`,
    },
    pulldown: {
      joints: { head: [50, 35], neck: [50, 45], hip: [50, 70], lKnee: [43, 85], lFoot: [38, 92], rKnee: [57, 85], rFoot: [62, 92], lElbow: [30, 38], lHand: [16, 24], rElbow: [70, 38], rHand: [84, 24] },
      extra: props.bar(12, 22, 88),
    },
    pressOverhead: {
      joints: { head: [50, 20], neck: [50, 28], hip: [50, 55], lKnee: [45, 73], lFoot: [42, 90], rKnee: [55, 73], rFoot: [58, 90], lElbow: [35, 15], lHand: [26, 4], rElbow: [65, 15], rHand: [74, 4] },
    },
    lateralRaise: {
      joints: { head: [50, 20], neck: [50, 28], hip: [50, 55], lKnee: [45, 73], lFoot: [42, 90], rKnee: [55, 73], rFoot: [58, 90], lElbow: [25, 32], lHand: [8, 34], rElbow: [75, 32], rHand: [92, 34] },
    },
    pressChest: {
      joints: { head: [14, 55], neck: [25, 55], hip: [50, 58], lKnee: [70, 60], lFoot: [85, 75], rKnee: [70, 60], rFoot: [85, 75], lElbow: [30, 40], lHand: [35, 25], rElbow: [30, 40], rHand: [35, 25] },
      extra: props.bench(10, 62, 55),
    },
    curl: {
      joints: { head: [50, 20], neck: [50, 28], hip: [50, 55], lKnee: [45, 73], lFoot: [42, 90], rKnee: [55, 73], rFoot: [58, 90], lElbow: [35, 48], lHand: [40, 30], rElbow: [65, 48], rHand: [60, 30] },
    },
    triceps: {
      joints: { head: [50, 32], neck: [50, 40], hip: [50, 55], lKnee: [70, 60], lFoot: [88, 58], rKnee: [70, 60], rFoot: [88, 58], lElbow: [35, 48], lHand: [25, 58], rElbow: [35, 48], rHand: [25, 58] },
      extra: props.bench(12, 60, 30),
    },
    calfRaise: {
      joints: { head: [50, 15], neck: [50, 22], hip: [50, 48], lKnee: [48, 68], lFoot: [46, 88], rKnee: [52, 68], rFoot: [54, 88], lElbow: [40, 32], lHand: [34, 45], rElbow: [60, 32], rHand: [66, 45] },
      extra: `<line x1="43" y1="88" x2="46" y2="82" stroke="var(--gro2, var(--gro))" stroke-width="3"/><line x1="57" y1="88" x2="54" y2="82" stroke="var(--gro2, var(--gro))" stroke-width="3"/>`,
    },
    legCurlProne: {
      joints: { head: [14, 50], neck: [25, 50], hip: [50, 52], lKnee: [70, 55], lFoot: [66, 33], rKnee: [70, 55], rFoot: [66, 33], lElbow: [22, 60], lHand: [20, 73], rElbow: [22, 60], rHand: [20, 73] },
      extra: props.bench(10, 60, 45),
    },
    hipSideLying: {
      joints: { head: [18, 40], neck: [27, 42], hip: [48, 50], lKnee: [62, 58], lFoot: [78, 58], rKnee: [62, 44], rFoot: [80, 47], lElbow: [28, 48], lHand: [18, 55], rElbow: [28, 48], rHand: [18, 55] },
    },
    hipStandAbduct: {
      joints: { head: [50, 20], neck: [50, 28], hip: [50, 52], lKnee: [28, 68], lFoot: [22, 88], rKnee: [72, 68], rFoot: [78, 88], lElbow: [35, 40], lHand: [25, 46], rElbow: [65, 40], rHand: [75, 46] },
    },
    hipQuadruped: {
      joints: { head: [14, 45], neck: [25, 48], hip: [55, 50], lKnee: [60, 60], lFoot: [58, 78], rKnee: [76, 44], rFoot: [92, 40], lElbow: [24, 60], lHand: [22, 76], rElbow: [24, 60], rHand: [22, 76] },
    },
    stretchKneel: {
      joints: { head: [45, 25], neck: [45, 32], hip: [50, 55], lKnee: [30, 86], lFoot: [18, 90], rKnee: [60, 70], rFoot: [65, 90], lElbow: [50, 44], lHand: [58, 64], rElbow: [50, 44], rHand: [58, 64] },
    },
    balanceSingle: {
      joints: { head: [50, 18], neck: [50, 26], hip: [50, 52], lKnee: [50, 70], lFoot: [50, 90], rKnee: [65, 60], rFoot: [76, 52], lElbow: [30, 40], lHand: [15, 42], rElbow: [70, 40], rHand: [85, 42] },
    },
    kbSwing: {
      joints: { head: [34, 30], neck: [38, 37], hip: [55, 55], lKnee: [55, 73], lFoot: [53, 90], rKnee: [59, 73], rFoot: [57, 90], lElbow: [42, 50], lHand: [24, 50], rElbow: [42, 54], rHand: [24, 52] },
      extra: props.ball(20, 51, 6),
    },
    massage: {
      joints: { head: [50, 33], neck: [50, 42], hip: [50, 75], lKnee: [38, 85], lFoot: [33, 92], rKnee: [62, 85], rFoot: [67, 92], lElbow: [38, 40], lHand: [46, 30], rElbow: [65, 55], rHand: [55, 68] },
      extra: props.ball(53, 40, 5),
    },
    pullup: {
      joints: { head: [50, 25], neck: [50, 32], hip: [50, 60], lKnee: [47, 78], lFoot: [45, 92], rKnee: [53, 78], rFoot: [55, 92], lElbow: [35, 20], lHand: [28, 9], rElbow: [65, 20], rHand: [72, 9] },
      extra: props.bar(15, 7, 85),
    },
    crunch: {
      joints: { head: [24, 50], neck: [34, 55], hip: [50, 70], lKnee: [65, 60], lFoot: [80, 70], rKnee: [65, 60], rFoot: [80, 70], lElbow: [28, 57], lHand: [20, 47], rElbow: [28, 57], rHand: [20, 47] },
    },
    legRaise: {
      joints: { head: [16, 72], neck: [30, 72], hip: [50, 72], lKnee: [58, 44], lFoot: [64, 14], rKnee: [58, 44], rFoot: [64, 14], lElbow: [35, 75], lHand: [22, 78], rElbow: [35, 75], rHand: [22, 78] },
    },
  };

  function poseSvgFor(key) {
    const p = POSES[key] || POSES.lateralRaise; // 매핑이 안 된 운동을 위한 기본(서있는) 자세
    return stickSvg(p.joints, p.extra);
  }

  window.POSES = POSES;
  window.poseSvgFor = poseSvgFor;
})();
