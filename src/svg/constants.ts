// 공통 상수·스타일 정의

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
// 시간 관계: waitTicks = round(GRASS_FADE_DURATION / SHEEP_CELL_TIME).
export const waitTicks = Math.round(GRASS_FADE_DURATION / SHEEP_CELL_TIME);
// 각 양이 최대 몇 칸의 잔디를 먹을지 (전체 잔디 전부를 원하면 크게)
export const MAX_MEALS_PER_SHEEP = 50;
// 접근칸 예약 TTL: 이 틱 수 지나면 예약 자동 해제 (입구 독점 완화)
export const APPROACH_TTL = 12;
// 거리 기반 뺏기: 예약 후 이 틱 수 지나면, 더 가까운 양이 뺏을 수 있음
export const APPROACH_STEAL_AFTER = 6;
export const APPROACH_STEAL_MARGIN = 2;
// 입구(깔때기) 셀 예약 TTL: 이 틱 수까지만 예약해 뒤쪽 양이 경로를 찾을 수 있게 함
export const FUNNEL_RESERVATION_TICKS = 2;
// 경로 계획 시 앞으로 예약하는 최대 틱 수 (이 값만 예약해 뒤쪽 양이 경로를 찾을 수 있게)
export const RESERVE_AHEAD_LIMIT = 6;
// 잔디 예약 TTL: 이 틱 수 지나면 또는 stuck이 크면 예약 해제 (너무 짧으면 왔다갔다 반복)
export const GRASS_RES_TTL = 50;

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
