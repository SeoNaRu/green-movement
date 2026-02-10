// 공통 상수·스타일 정의 (시뮬레이션 + SVG 공용)
// NOTE: 기존 `src/svg/constants.ts`에서 이동한 실제 소스입니다.
//       SVG 계층은 `../svg/constants.js`를 통해 이 모듈을 재사용합니다.

// GitHub official specs
export const CELL_SIZE = 10;
export const GAP = 2;
export const BORDER_RADIUS = 2;
export const BACKGROUND_COLOR = "#0d1117"; // GitHub dark background

// Pasture fence: 잔디 그리드와 동일하게 1타일 = 10px 셀 + 2px 간격 (12px).
// 펜스 드로잉은 10px로 스케일.
export const FENCE_TILE = CELL_SIZE + GAP; // 12 — 타일 배치 간격(셀+간격)
export const FENCE_MARGIN = FENCE_TILE;
export const FENCE_SCALE = CELL_SIZE / 14; // 10/14 — 14x14 에셋을 10px(셀)로 스케일, 타일마다 2px 간격
export const FENCE_STROKE = "#8B4513";

// Inlined path from assets/fance/*.svg (viewBox 0 0 14 14).
export const FENCE_H_PATH = "M 1.5 7 H 12.5";
export const FENCE_V_PATH = "M 7 1.5 V 12.5";
// fence-corner.svg 하나: TL 기준 (12.5,7)-(7,12.5), 나머지는 반사로 간격 통일
export const FENCE_CORNER_PATH = "M 12.5 7 A 5.5 5.5 0 0 0 7 12.5";
export const FENCE_GROUP_STYLE =
  'fill="none" stroke="' +
  FENCE_STROKE +
  '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';

// 양 이동: 1틱 = 1칸 이동 = 이 시간(초). 애니메이션에서 셀당 구간 길이.
export const SHEEP_CELL_TIME = 0.5;
// 양이 잔디에 도착한 뒤 잔디 색이 레벨 4→0으로 줄어드는 시간(초).
export const GRASS_FADE_DURATION = 2;
// 양이 잔디에 도착한 뒤 페이드가 시작되기까지 대기(초). 도착 전에 잔디가 사라지지 않도록.
export const GRASS_FADE_START_DELAY = 0.4;
// 우주선이 양이 완전히 내린 뒤(ready) 추가로 대기하는 시간(초). 양이 보인 뒤에 우주선이 움직이도록.
export const UFO_STAY_BUFFER_S = 0.08;
// 스펙: 우주선 밖에서 진입하는 데 걸리는 시간(초).
export const UFO_ENTRY_S = 1.5;
// 스펙: 잔디 다 먹은 뒤 우주선이 양 태우고 밖으로 나가는 시간(초).
export const UFO_EXIT_S = 2;
// 스펙: 양이 움직이기 시작할 때 불빛이 점점 꺼지는 데 걸리는 시간(초).
export const LIGHT_FADE_OUT_S = 0.5;
// UFO 이동: 1칸당 시간(초), 이동만 빠르게
export const UFO_CELL_TIME = 0.14; // 0.09 -> 0.14
export const UFO_MOVE_MIN_S = 0.75; // 0.30 -> 0.75  (핵심)
export const UFO_MOVE_MAX_S = 1.8; // 0.80 -> 1.80
// UFO 이동 중 방향 기울기(deg). 기본 아래(▼) 기준.
export const UFO_TILT_DEG = 14; // 기존 8 → 12~16 권장
export const EAT_HOLD_MULT = 1.4; // 1.0 = 동일, 1.6 = 60% 더 머묾, 2.0 = 두 배
// 시간 관계: waitTicks ≈ GRASS_FADE_DURATION / SHEEP_CELL_TIME (잔디 페이드 동안 양이 멈춰 있게)
export const waitTicks = Math.max(
  1,
  Math.ceil((GRASS_FADE_DURATION * EAT_HOLD_MULT) / SHEEP_CELL_TIME),
);
// 각 양이 최대 몇 칸의 잔디를 먹을지 (전체 잔디 전부를 원하면 크게)
export const MAX_MEALS_PER_SHEEP = 50;
// 접근칸 예약 TTL: 이 틱 수 지나면 예약 자동 해제 (입구 독점 완화)
export const APPROACH_TTL = 20;
// 거리 기반 뺏기: 예약 후 이 틱 수 지나면, 더 가까운 양이 뺏을 수 있음
export const APPROACH_STEAL_AFTER = 12;
export const APPROACH_STEAL_MARGIN = 4;
// 입구(깔때기) 셀 예약 TTL: 이 틱 수까지만 예약해 뒤쪽 양이 경로를 찾을 수 있게 함
export const FUNNEL_RESERVATION_TICKS = 2;
// 경로 계획 시 앞으로 예약하는 최대 틱 수 (이 값만 예약해 뒤쪽 양이 경로를 찾을 수 있게)
export const RESERVE_AHEAD_LIMIT = 6;
// 잔디 예약 TTL: 이 틱 수 지나면 또는 stuck이 크면 예약 해제 (너무 짧으면 왔다갔다 반복)
export const GRASS_RES_TTL = 80;
// UFO가 타일 도착 후 빔 켜기까지 지연
export const UFO_BEAM_DELAY_S = 0.2;

// Sheep (assets/sheep.svg) — viewBox 0.5 0 15 12.5, 중심 (8, 6.25)
// assets/sheep.svg 의 <g id="sheep"> 내용과 동일하게 유지해야 함.
export const SHEEP_CONTENT = `<g transform="translate(0,7.5) scale(1,1.25) translate(0,-7.5)">
  <path
    d="M8 10.5
       C6.4 10.9 5.0 10.4 4.3 9.3
       C3.1 9.1 2.7 7.9 3.5 7.1
       C2.7 6.1 3.5 5.0 4.6 4.7
       C4.6 3.6 5.6 2.9 6.6 3.2
       C7.1 2.3 8.0 2.1 8.0 2.1
       C8.0 2.1 8.9 2.3 9.4 3.2
       C10.4 2.9 11.4 3.6 11.4 4.7
       C12.5 5.0 13.3 6.1 12.5 7.1
       C13.3 7.9 12.9 9.1 11.7 9.3
       C11.0 10.4 9.6 10.9 8.0 10.5
       Z"
    fill="#f0f0f0" stroke="#d0d0d0" stroke-width="0.5"/>

</g>
<g transform="translate(0,-1.55)">
  <!-- 머리 -->
  <ellipse cx="8" cy="3.6" rx="3" ry="2.4" fill="#2b2b2b"/>
  <!-- 귀 -->
  <ellipse cx="4.8" cy="4.4" rx="1.5" ry="1.0" fill="#333333"/>
  <ellipse cx="11.2" cy="4.4" rx="1.5" ry="1.0" fill="#333333"/>
  <!-- 코끝 느낌의 밝은 점 (살짝 더 크게) -->
  <circle cx="8" cy="2.0" r="0.35" fill="#444"/>
  <!-- 뿔: 아래 털 쪽으로 조금 더 길게, 아래쪽 간격이 살짝 더 넓어지도록 -->
  <path d="M6.7 3.9 C6.0 4.7 6.0 5.7 6.5 6.0"
        stroke="#e0c090" stroke-width="1.4"
        stroke-linecap="round" fill="none"/>
  <path d="M9.3 3.9 C10.0 4.7 10.0 5.7 9.5 6.0"
        stroke="#e0c090" stroke-width="1.4"
        stroke-linecap="round" fill="none"/>
</g>`;
export const SHEEP_VIEWBOX_CX = 8;
export const SHEEP_VIEWBOX_CY = 6.25;
export const SHEEP_VIEWBOX_W = 15;
export const SHEEP_WIDTH_PX = 24;

// UFO (assets/ufo.svg) — viewBox 0 0 512 512, 그리드에서는 양과 같은 크기(24px)로 표시
// assets/ufo.svg 의 내부 <g> 내용과 동일하게 유지해야 함.
export const UFO_VIEWBOX = "0 0 512 512";
export const UFO_WIDTH_PX = SHEEP_WIDTH_PX;
export const UFO_Y_OFFSET = -20;
export const UFO_CONTENT = `<g>
  <circle cx="256" cy="256" r="200" fill="#dfe3ea" stroke="#6c7482" stroke-width="10"/>
  <g fill="#f2f4f8" stroke="#6c7482" stroke-width="6">
    <circle cx="256" cy="56" r="14"/><circle cx="356" cy="86" r="14"/>
    <circle cx="426" cy="156" r="14"/><circle cx="456" cy="256" r="14"/>
    <circle cx="426" cy="356" r="14"/><circle cx="356" cy="426" r="14"/>
    <circle cx="256" cy="456" r="14"/><circle cx="156" cy="426" r="14"/>
    <circle cx="86" cy="356" r="14"/><circle cx="56" cy="256" r="14"/>
    <circle cx="86" cy="156" r="14"/><circle cx="156" cy="86" r="14"/>
  </g>
  <circle cx="256" cy="256" r="160" fill="none" stroke="#8a92a1" stroke-width="12"/>
  <circle cx="256" cy="256" r="130" fill="#c9ced8" stroke="#5e6675" stroke-width="10"/>
</g>
<g>
  <circle cx="256" cy="256" r="100" fill="#2c3e50" stroke="#4e5563" stroke-width="8"/>
  <g>
    <ellipse cx="256" cy="285" rx="50" ry="35" fill="#2ecc71"/>
    <path d="M 256 285 Q 256 315 256 325" stroke="#27ae60" stroke-width="4" fill="none" opacity="0.6"/>
    <ellipse cx="215" cy="290" rx="15" ry="25" fill="#2ecc71" transform="rotate(30 215 290)"/>
    <ellipse cx="297" cy="290" rx="15" ry="25" fill="#2ecc71" transform="rotate(-30 297 290)"/>
    <circle cx="210" cy="310" r="8" fill="#95a5a6" stroke="#7f8c8d" stroke-width="2"/>
    <circle cx="302" cy="310" r="8" fill="#95a5a6" stroke="#7f8c8d" stroke-width="2"/>
    <ellipse cx="256" cy="250" rx="55" ry="51" fill="#38e54d"/>
    <ellipse cx="232" cy="264" rx="14" ry="18" fill="#0b0f14"/>
    <ellipse cx="280" cy="264" rx="14" ry="18" fill="#0b0f14"/>
    <circle cx="228" cy="258" r="3" fill="#ffffff" opacity="0.6"/>
    <circle cx="276" cy="258" r="3" fill="#ffffff" opacity="0.6"/>
  </g>
  <path d="M 210 210 Q 256 190 302 210" stroke="#3498db" stroke-width="4" fill="none" opacity="0.7"/>
  <circle cx="256" cy="205" r="5" fill="#e74c3c" opacity="0.8"/>
  <circle cx="236" cy="210" r="3" fill="#f1c40f" opacity="0.8"/>
  <circle cx="276" cy="210" r="3" fill="#2ecc71" opacity="0.8"/>
  <circle cx="256" cy="256" r="100" fill="#85c1e9" opacity="0.3" stroke="#aed6f1" stroke-width="4"/>
  <ellipse cx="230" cy="200" rx="60" ry="30" fill="#ffffff" opacity="0.2" transform="rotate(-20 230 200)"/>
</g>`;

// 길(이동 가능한 타일).
export const TILE_PATH = "#161b22";

// GitHub contribution colors (dark theme) - EXACT official colors
export const COLORS = {
  LEVEL_0: TILE_PATH, // 0 contributions = 빈 칸 = 길
  LEVEL_1: "#0e4429", // low
  LEVEL_2: "#006d32", // medium-low
  LEVEL_3: "#26a641", // medium-high
  LEVEL_4: "#39d353", // high
} as const;
