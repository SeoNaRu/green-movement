import type { GridCell } from "../grid/mapGrid.js";

// GitHub official specs
const CELL_SIZE = 10;
const GAP = 2;
const BORDER_RADIUS = 2;
const BACKGROUND_COLOR = "#0d1117"; // GitHub dark background

// Pasture fence: 잔디 그리드와 동일하게 1타일 = 10px 셀 + 2px 간격 (12px). 펜스 드로잉은 10px로 스케일.
const FENCE_TILE = CELL_SIZE + GAP; // 12 — 타일 배치 간격(셀+간격)
const FENCE_MARGIN = FENCE_TILE;
const FENCE_SCALE = CELL_SIZE / 14; // 10/14 — 14x14 에셋을 10px(셀)로 스케일, 타일마다 2px 간격
const FENCE_STROKE = "#8B4513";

// Inlined path from assets/fance/*.svg (viewBox 0 0 14 14). 직선은 끝이 조금 떨어짐.
const FENCE_H_PATH = "M 1.5 7 H 12.5";
const FENCE_V_PATH = "M 7 1.5 V 12.5";
// fence-corner.svg 하나: TL 기준 (12.5,7)-(7,12.5), 나머지는 반사로 간격 통일
const FENCE_CORNER_PATH = "M 12.5 7 A 5.5 5.5 0 0 0 7 12.5";
const FENCE_GROUP_STYLE =
  'fill="none" stroke="' +
  FENCE_STROKE +
  '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
// 양 이동: 셀당 시간(초), 이 간격으로 한 마리씩 출발. 느리게(1.0) 해서 목장 입장 느낌
const SHEEP_CELL_TIME = 1.0;

// Sheep (assets/sheep.svg) — viewBox 0.5 0 15 12.5, 중심 (8, 6.25)
// assets/sheep.svg 의 <g id="sheep"> 내용과 동일하게 유지해야 함.
const SHEEP_CONTENT = `<g transform="translate(0,7.5) scale(1,1.25) translate(0,-7.5)">
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
const SHEEP_VIEWBOX_CX = 8;
const SHEEP_VIEWBOX_CY = 6.25;
const SHEEP_VIEWBOX_W = 15;
const SHEEP_WIDTH_PX = 24;

/**
 * GitHub 잔디 그리드 좌표 (0-based)
 * - 열(col): 0 = 1번째 열, 7 = 8번째 열, maxX = 마지막 열
 * - 행(row): 0 = 1번째 행(일요일), 6 = 7번째 행(토요일). row 7이면 8번째 자리(그리드 밖)
 * - 셀 (col, row) 정중앙 px = getCellCenterPx(gridLeftX, gridTopY, col, row)
 */
export function getCellCenterPx(
  gridLeftX: number,
  gridTopY: number,
  col: number,
  row: number,
): { x: number; y: number } {
  const x = gridLeftX + col * (CELL_SIZE + GAP) + CELL_SIZE / 2;
  const y = gridTopY + row * (CELL_SIZE + GAP) + CELL_SIZE / 2;
  return { x, y };
}

/** 특정 칸 중앙에 점 찍기. 0-based: [[7, 1]] = 8번째 열·2번째 행. 빈 배열 []이면 점 없음 */
// 디버그용: 지정한 칸 중앙에 점 찍기 (비우면 점 없음)
const CELL_DOTS: [col: number, row: number][] = [];

// #161b22 = 길(이동 가능한 타일). 대기 칸·빈 그리드 칸 모두 이 색.
// 양은 좌우·앞뒤(4방향)만 이동. 양옆 앞뒤에 길이 없으면 멈춤(경로 끝이거나 막힘).
const TILE_PATH = "#161b22";

// GitHub contribution colors (dark theme) - EXACT official colors
const COLORS = {
  LEVEL_0: TILE_PATH, // 0 contributions = 빈 칸 = 길
  LEVEL_1: "#0e4429", // low
  LEVEL_2: "#006d32", // medium-low
  LEVEL_3: "#26a641", // medium-high
  LEVEL_4: "#39d353", // high
};

/**
 * Calculate contribution level using quartiles (GitHub's actual algorithm)
 * 0: no contributions
 * 1-4: quartiles of non-zero contributions
 */
function getContributionLevel(count: number, quartiles: number[]): number {
  if (count === 0) return 0;
  if (count < quartiles[0]) return 1;
  if (count < quartiles[1]) return 2;
  if (count < quartiles[2]) return 3;
  return 4;
}

function getColor(level: number): string {
  switch (level) {
    case 0:
      return COLORS.LEVEL_0;
    case 1:
      return COLORS.LEVEL_1;
    case 2:
      return COLORS.LEVEL_2;
    case 3:
      return COLORS.LEVEL_3;
    case 4:
      return COLORS.LEVEL_4;
    default:
      return COLORS.LEVEL_0;
  }
}

/**
 * Calculate quartiles from non-zero contribution counts
 */
function calculateQuartiles(counts: number[]): number[] {
  const nonZero = counts.filter((c) => c > 0).sort((a, b) => a - b);
  if (nonZero.length === 0) return [0, 0, 0];

  const q1 = nonZero[Math.floor(nonZero.length * 0.25)] || 1;
  const q2 = nonZero[Math.floor(nonZero.length * 0.5)] || 1;
  const q3 = nonZero[Math.floor(nonZero.length * 0.75)] || 1;

  return [q1, q2, q3];
}

/**
 * 한 입구 칸에서 BFS, 길(빈 칸)만 확장.
 * 상하좌우 4방향만 사용 → 인접한 길이 없으면 그쪽으로는 확장 안 함(멈춤).
 */
function emptyBfsFromGate(
  grid: GridCell[],
  maxX: number,
  maxY: number,
  startCol: number,
): { emptyOrder: GridCell[]; parent: Map<string, string | null> } {
  const byKey = new Map<string, GridCell>();
  for (const c of grid) byKey.set(`${c.x},${c.y}`, c);

  const visited = new Set<string>();
  const parent = new Map<string, string | null>();
  const queue: [number, number][] = [];
  const emptyOrder: GridCell[] = [];

  const key = (col: number, row: number) => `${col},${row}`;
  const inBounds = (col: number, row: number) =>
    col >= 0 && col <= maxX && row >= 0 && row <= maxY;

  const start: [number, number] = [startCol, 0];
  const cell = byKey.get(key(start[0], start[1]));
  if (cell && cell.count === 0) {
    visited.add(key(start[0], start[1]));
    parent.set(key(start[0], start[1]), null);
    emptyOrder.push(cell);
    queue.push(start);
  }

  const dirs: [number, number][] = [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
  ];
  while (queue.length > 0) {
    const [col, row] = queue.shift()!;
    for (const [dc, dr] of dirs) {
      const nc = col + dc;
      const nr = row + dr;
      if (!inBounds(nc, nr) || visited.has(key(nc, nr))) continue;

      const next = byKey.get(key(nc, nr));
      if (!next || next.count !== 0) continue;

      visited.add(key(nc, nr));
      parent.set(key(nc, nr), key(col, row));
      emptyOrder.push(next);
      queue.push([nc, nr]);
    }
  }

  return { emptyOrder, parent };
}

/**
 * 경로에서 대각선(한 번에 2칸 이상) 제거: 인접하지 않은 연속 칸 사이에 중간 칸 삽입 → 4방향만
 */
function ensureOnly4Direction(path: [number, number][]): [number, number][] {
  if (path.length <= 1) return path;
  const out: [number, number][] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const [c0, r0] = path[i - 1];
    const [c1, r1] = path[i];
    let cx = c0;
    let rx = r0;
    while (cx !== c1 || rx !== r1) {
      if (cx !== c1) cx += c1 > cx ? 1 : -1;
      else if (rx !== r1) rx += r1 > rx ? 1 : -1;
      out.push([cx, rx]);
    }
  }
  return out;
}

/**
 * BFS parent 맵으로 시작→목표 경로 추적 (셀 리스트 반환)
 */
function tracePath(
  targetCol: number,
  targetRow: number,
  parent: Map<string, string | null>,
): [number, number][] {
  const path: [number, number][] = [];
  let key: string | null = `${targetCol},${targetRow}`;
  while (key !== null) {
    const [c, r] = key.split(",").map(Number);
    path.unshift([c, r]);
    key = parent.get(key) ?? null;
  }
  return path;
}

/**
 * Generate SVG matching GitHub contribution grid EXACTLY.
 * Uses GitHub's official sizing, colors, and quartile-based level calculation.
 */
export function renderGridSvg(grid: GridCell[]): string {
  if (grid.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"/>`;
  }

  const maxX = Math.max(...grid.map((c) => c.x));
  const maxY = Math.max(...grid.map((c) => c.y));
  // 열/행당 12px(셀+간격)만 사용. 끝에 +GAP 넣으면 오른쪽·아래가 2px씩 더 떨어져 보임
  const gridWidth = (maxX + 1) * (CELL_SIZE + GAP);
  const gridHeight = (maxY + 1) * (CELL_SIZE + GAP);

  // 그리드: 울타리 바로 안쪽에 붙여서 네 면 모두 동일 (간격 없음)
  const gridLeftX = FENCE_MARGIN;
  const gridTopY = FENCE_MARGIN;
  const gridRightX = gridLeftX + gridWidth;
  const gridBottomY = gridTopY + gridHeight;

  // 오른쪽·아래 울타리는 그리드 끝에 바로 붙임 (fenceRightX = gridRightX)
  const fenceRightX = gridRightX;
  const fenceBottomY = gridBottomY;
  const totalWidth = fenceRightX + FENCE_TILE;
  const baseHeight = fenceBottomY + FENCE_TILE;

  // 양 수: 기여 칸/3. 목적지는 잔디(경로는 길만 사용, 마지막 한 칸만 잔디)
  const grassCells = grid.filter((c) => c.count > 0);
  const sheepCountCap = Math.floor(grassCells.length / 3);
  const centerCol = Math.floor(maxX / 2);
  // 입구별 BFS → 각 양이 자기 입구에서 나온 경로만 사용 (대각선 방지)
  const leftBfs = emptyBfsFromGate(grid, maxX, maxY, centerCol - 1);
  const rightBfs = emptyBfsFromGate(grid, maxX, maxY, centerCol);
  const byKey = new Map<string, GridCell>();
  for (const c of grid) byKey.set(`${c.x},${c.y}`, c);
  const inBounds = (col: number, row: number) =>
    col >= 0 && col <= maxX && row >= 0 && row <= maxY;
  const dirs4: [number, number][] = [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
  ];
  const buildGrassTargets = (
    emptyOrder: GridCell[],
    gateCol: number,
  ): { grass: GridCell; emptyNeighbor: GridCell; gateCol: number }[] => {
    const list: {
      grass: GridCell;
      emptyNeighbor: GridCell;
      gateCol: number;
    }[] = [];
    const seen = new Set<string>();
    for (const emptyCell of emptyOrder) {
      for (const [dc, dr] of dirs4) {
        const nc = emptyCell.x + dc;
        const nr = emptyCell.y + dr;
        if (!inBounds(nc, nr)) continue;
        const neighbor = byKey.get(`${nc},${nr}`);
        if (!neighbor || neighbor.count === 0) continue;
        const key = `${nc},${nr}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({ grass: neighbor, emptyNeighbor: emptyCell, gateCol });
      }
    }
    return list;
  };
  const grassTargetsLeft = buildGrassTargets(leftBfs.emptyOrder, centerCol - 1);
  const grassTargetsRight = buildGrassTargets(rightBfs.emptyOrder, centerCol);
  const sheepCount = Math.min(
    sheepCountCap,
    grassTargetsLeft.length + grassTargetsRight.length,
  );
  // 깔때기: 대기 칸은 (col, row) 한 칸씩 — 기본 모양은
  // row -1에 2칸, row -2에 4칸, row -3에 6칸 … 이지만
  // 맨 위에 "반쪽짜리 줄"이 생기면 그 남은 양들은 바로 아래 줄로 내려서 대기시킨다.
  // → 위로 쓸데없이 길어지지 않고, 길이 없는 맨 위 칸에 양이 서 있는 상황을 방지.
  const funnelPositionsEarly: [number, number][] = [];
  type RowSpec = { rowY: number; count: number };
  const rowSpecs: RowSpec[] = [];
  {
    let remaining = sheepCount;
    let k = 1; // |row|: 1 → row -1, 2 → row -2, …
    while (remaining > 0) {
      const fullCap = 2 * k; // 이 row의 기본 정원 (2,4,6,…)
      if (remaining > fullCap) {
        rowSpecs.push({ rowY: -k, count: fullCap });
        remaining -= fullCap;
        k++;
      } else {
        // 남는 양이 이 줄 정원보다 적으면, 새 줄(row -k)을 만들지 않고 바로 아래(직전) 줄에 합쳐서 대기
        if (rowSpecs.length > 0) {
          rowSpecs[rowSpecs.length - 1].count += remaining;
        } else {
          // 아직 아무 줄도 없으면 첫 줄(row -1)에 남은 양만큼만 배치 (1 또는 2마리)
          rowSpecs.push({ rowY: -k, count: remaining });
        }
        remaining = 0;
      }
    }
  }

  for (const { rowY, count } of rowSpecs) {
    const half = -rowY; // 이 row의 "기본" 삼각형 half (2*half = 기본 정원)
    const baseWidth = 2 * half;
    let startCol: number;
    if (count <= baseWidth) {
      // 기본 삼각형 폭 안에서만 사용: [center-half, center+half-1]
      startCol = centerCol - half;
    } else {
      // 이 줄에 더 많은 양을 합쳐 둔 경우: 기본 삼각형을 중심으로 좌우로 조금 더 넓힘
      const extra = count - baseWidth;
      const leftExtra = Math.ceil(extra / 2);
      // 오른쪽도 필요하면 자동으로 따라감 (연속 구간)
      startCol = centerCol - half - leftExtra;
    }
    for (let i = 0; i < count; i++) {
      const c = startCol + i;
      funnelPositionsEarly.push([c, rowY]);
    }
  }
  const gateColMin = centerCol - 1;
  const gateColMax = centerCol;
  const queueOrderEarly = Array.from({ length: sheepCount }, (_, i) => i).sort(
    (a, b) => {
      const [, ra] = funnelPositionsEarly[a];
      const [ca] = funnelPositionsEarly[a];
      const [, rb] = funnelPositionsEarly[b];
      const [cb] = funnelPositionsEarly[b];
      if (ra !== rb) return rb - ra;
      const aAbove = ca >= gateColMin && ca <= gateColMax ? 0 : 1;
      const bAbove = cb >= gateColMin && cb <= gateColMax ? 0 : 1;
      if (aAbove !== bAbove) return aAbove - bAbove;
      return ca - cb;
    },
  );
  // sheepTargets not defined yet - we need to assign first. So we need to build sheepTargetsWithEmpty and sheepTargets here.
  type TargetWithGate = {
    grass: GridCell;
    emptyNeighbor: GridCell;
    gateCol: number;
  };
  // 잔디 한 칸당 양 한 마리만: 먼저 차지한 양이 있으면 다른 잔디를 찾음
  const assignedGrass = new Set<string>();
  const grassKey = (g: GridCell) => `${g.x},${g.y}`;
  const pickFirstFree = (
    list: TargetWithGate[],
  ): TargetWithGate | undefined => {
    for (const item of list) {
      if (!assignedGrass.has(grassKey(item.grass))) {
        assignedGrass.add(grassKey(item.grass));
        return item;
      }
    }
    return undefined;
  };
  const sheepTargetsWithEmpty: (TargetWithGate | undefined)[] = new Array(
    sheepCount,
  );
  for (let idx = 0; idx < queueOrderEarly.length; idx++) {
    const i = queueOrderEarly[idx];
    const [fcol, frow] = funnelPositionsEarly[i];
    const entryGate =
      frow === -1 ? fcol : Math.max(gateColMin, Math.min(gateColMax, fcol));
    const preferred =
      entryGate === centerCol - 1 ? grassTargetsLeft : grassTargetsRight;
    const other =
      entryGate === centerCol - 1 ? grassTargetsRight : grassTargetsLeft;
    const item = pickFirstFree(preferred) ?? pickFirstFree(other);
    if (item) sheepTargetsWithEmpty[i] = item;
  }
  const funnelRows = Math.max(
    1,
    Math.ceil((-1 + Math.sqrt(1 + 8 * sheepCount)) / 2),
  );
  const queueHeight = funnelRows * (CELL_SIZE + GAP);
  const totalHeight = baseHeight + queueHeight;

  // Calculate quartiles for level determination
  const allCounts = grid.map((c) => c.count);
  const quartiles = calculateQuartiles(allCounts);
  const rects = grid
    .map((cell) => {
      const px = gridLeftX + cell.x * (CELL_SIZE + GAP);
      const py = gridTopY + cell.y * (CELL_SIZE + GAP);
      const level = getContributionLevel(cell.count, quartiles);
      const color = getColor(level);
      return `<rect x="${px}" y="${py}" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="${color}" rx="${BORDER_RADIUS}"/>`;
    })
    .join("\n  ");

  // Fence: fence-corner.svg 하나, TL만 그대로·TR/BL/BR은 반사로 간격 통일
  const fencePieces: string[] = [];
  const g = (x: number, y: number, pathD: string) =>
    `<g transform="translate(${x}, ${y}) scale(${FENCE_SCALE})" ${FENCE_GROUP_STYLE}><path d="${pathD}"/></g>`;
  // 반사: 타일 중심(7,7) 기준 — TR=세로축, BL=가로축, BR=양축
  const gCorner = (
    x: number,
    y: number,
    reflect: "none" | "x" | "y" | "xy",
  ) => {
    const t =
      reflect === "none"
        ? `translate(${x}, ${y}) scale(${FENCE_SCALE})`
        : reflect === "x"
          ? `translate(${x}, ${y}) scale(${FENCE_SCALE}) translate(14, 0) scale(-1, 1)`
          : reflect === "y"
            ? `translate(${x}, ${y}) scale(${FENCE_SCALE}) translate(0, 14) scale(1, -1)`
            : `translate(${x}, ${y}) scale(${FENCE_SCALE}) translate(14, 14) scale(-1, -1)`;
    return `<g transform="${t}" ${FENCE_GROUP_STYLE}><path d="${FENCE_CORNER_PATH}"/></g>`;
  };

  // 입구: 가로 4칸 = [왼쪽 코너] [비움=입구] [비움=입구] [오른쪽 코너]. 비움 2칸을 입구로 간주.
  const GATE_TILES = 4;
  const gateCenterX = totalWidth / 2;
  const gateStartX =
    Math.floor((gateCenterX - (GATE_TILES * FENCE_TILE) / 2) / FENCE_TILE) *
    FENCE_TILE;
  const gateEndX = gateStartX + (GATE_TILES - 1) * FENCE_TILE; // 오른쪽 코너 = 4칸 중 마지막 칸

  // Top row: 왼쪽 코너, 가로 펜스(입구 전까지), [왼쪽 코너] [입구] [입구] [오른쪽 코너], 가로 펜스, 오른쪽 코너
  fencePieces.push(gCorner(0, 0, "none"));
  for (let x = FENCE_TILE; x <= fenceRightX - FENCE_TILE; x += FENCE_TILE) {
    // 4칸 구간: 코너 + 비움(입구) + 비움(입구) + 코너 → 가로 펜스 생략
    if (x >= gateStartX && x <= gateEndX) continue;
    fencePieces.push(g(x, 0, FENCE_H_PATH));
  }
  fencePieces.push(gCorner(fenceRightX, 0, "x"));
  // 입구 양옆 코너: 입구 쪽(아래)으로 열린 모양 — 왼쪽은 xy(곡선 우하), 오른쪽은 y(곡선 좌하)
  fencePieces.push(gCorner(gateStartX, 0, "xy"));
  fencePieces.push(gCorner(gateEndX, 0, "y"));
  // Left column: fence-v, corner
  for (let y = FENCE_TILE; y <= fenceBottomY - FENCE_TILE; y += FENCE_TILE) {
    fencePieces.push(g(0, y, FENCE_V_PATH));
  }
  fencePieces.push(gCorner(0, fenceBottomY, "y"));

  // Right column
  for (let y = FENCE_TILE; y <= fenceBottomY - FENCE_TILE; y += FENCE_TILE) {
    fencePieces.push(g(fenceRightX, y, FENCE_V_PATH));
  }
  fencePieces.push(gCorner(fenceRightX, fenceBottomY, "xy"));

  // Bottom row: 전부 가로 펜스 (입구는 위쪽만)
  for (let x = FENCE_TILE; x <= fenceRightX - FENCE_TILE; x += FENCE_TILE) {
    fencePieces.push(g(x, fenceBottomY, FENCE_H_PATH));
  }

  const fenceRects = fencePieces.join("\n  ");

  const validIndices = Array.from({ length: sheepCount }, (_, i) => i).filter(
    (i) => sheepTargetsWithEmpty[i] != null,
  );
  const actualSheepCount = validIndices.length;
  const sheepTargets = validIndices.map((i) => sheepTargetsWithEmpty[i]!.grass);
  // 양 이미지 크기 조정 숫자가 작을수록 크게 보임
  const sheepScale = SHEEP_WIDTH_PX / SHEEP_VIEWBOX_W / 1.3;
  // 경로: 자기 입구에서 BFS한 parent 사용 → 4방향만, 대각선 없음
  const paths = validIndices.map((i) => {
    const t = sheepTargetsWithEmpty[i]!;
    return tracePath(
      t.emptyNeighbor.x,
      t.emptyNeighbor.y,
      t.gateCol === centerCol - 1 ? leftBfs.parent : rightBfs.parent,
    ).concat([[t.grass.x, t.grass.y]]);
  });

  const funnelPositions = validIndices.map((i) => funnelPositionsEarly[i]);
  function funnelToGate(col: number, fromRow: number): [number, number][] {
    // 깔때기 안에서만 상하좌우로 이동해서 게이트까지 내려가는 경로 생성.
    // 존재하지 않는 대기 칸(예: row=-3의 제일 바깥에서 바로 아래로 내려가는 칸)으로는 절대 가지 않음.
    const path: [number, number][] = [];
    let c = col;
    let r = fromRow;
    path.push([c, r]);

    // row -1까지 내려가기: 각 행에서, 바로 아래 행에도 존재하는 열 범위 안으로 먼저 좌우로 들어간 뒤 아래로 한 칸씩.
    while (r < -1) {
      const k = -r; // 예: r=-3 → k=3
      const halfNext = k - 1; // 다음 행(|r+1|)의 half
      const minNext = centerCol - halfNext;
      const maxNext = centerCol + halfNext - 1;
      if (c < minNext) {
        c += 1;
        path.push([c, r]);
        continue;
      }
      if (c > maxNext) {
        c -= 1;
        path.push([c, r]);
        continue;
      }
      // 이제 바로 아래 행에도 이 열(c)이 존재하므로 아래로 내려갈 수 있음
      r += 1;
      path.push([c, r]);
    }

    // r === -1: 게이트 위 행. 여기서 게이트 열(centerCol-1 또는 centerCol)로 가로 이동 후 0으로 내려감.
    const colAtNeg1 = Math.max(gateColMin, Math.min(gateColMax, c));
    while (c < colAtNeg1) {
      c += 1;
      path.push([c, r]);
    }
    while (c > colAtNeg1) {
      c -= 1;
      path.push([c, r]);
    }
    // 게이트로 한 칸 내려감
    path.push([c, 0]);
    return path;
  }

  // 대기 칸(깔때기) + 그리드 빈 칸(길) + 각 양의 목표 잔디만 이동 가능. 길이 아닌 칸으로는 한 걸음도 안 함.
  const funnelCellSet = new Set(
    funnelPositionsEarly.map(([c, r]) => `${c},${r}`),
  );
  const emptyCellSet = new Set(
    [...leftBfs.emptyOrder, ...rightBfs.emptyOrder].map((c) => `${c.x},${c.y}`),
  );

  function trimPathToValidOnly(
    path: [number, number][],
    validSet: Set<string>,
  ): [number, number][] {
    if (path.length === 0) return path;
    const out: [number, number][] = [path[0]];
    for (let i = 1; i < path.length; i++) {
      const [col, row] = path[i];
      const key = `${col},${row}`;
      if (!validSet.has(key)) break;
      const last = out[out.length - 1];
      if (last[0] !== col || last[1] !== row) out.push([col, row]);
    }
    return out;
  }

  const fullPaths = sheepTargets.map((_, i) => {
    const gateToTarget = paths[i];
    const funnel = funnelPositions[i];
    const toGate = funnelToGate(funnel[0], funnel[1]);
    const lastGate = toGate[toGate.length - 1];
    const firstGrid = gateToTarget[0];
    let gateToGrid: [number, number][] = [];
    if (
      firstGrid &&
      (lastGate[0] !== firstGrid[0] || lastGate[1] !== firstGrid[1])
    ) {
      gateToGrid = [firstGrid];
    }
    const raw = [...toGate, ...gateToGrid, ...gateToTarget.slice(1)];
    const path4 = ensureOnly4Direction(raw);
    const grass = sheepTargets[i];
    const validSet = new Set([
      ...funnelCellSet,
      ...emptyCellSet,
      `${grass.x},${grass.y}`,
    ]);
    return trimPathToValidOnly(path4, validSet);
  });

  // 출발 순서: (1) 양1·양2 row -1 → (2) 양4·양5 입구 위 → (3) 양3·양6 양옆.
  // "다음 칸에 양이 지나가고 있으면, 그 칸이 완전히 비워질 때까지 확실히 멈췄다가 이동"을 위해
  // 각 틱마다 현재 칸을 기준으로 다음 칸을 시도하되, (1) 지금 양이 서 있는 칸, (2) 이번 틱에 이미 예약된 칸에는 절대 진입하지 않는다.
  const sortedValidIndices = [...validIndices].sort((a, b) => {
    const [, ra] = funnelPositionsEarly[a];
    const [ca] = funnelPositionsEarly[a];
    const [, rb] = funnelPositionsEarly[b];
    const [cb] = funnelPositionsEarly[b];
    if (ra !== rb) return rb - ra;
    const aAbove = ca >= gateColMin && ca <= gateColMax ? 0 : 1;
    const bAbove = cb >= gateColMin && cb <= gateColMax ? 0 : 1;
    if (aAbove !== bAbove) return aAbove - bAbove;
    return ca - cb;
  });
  const queueOrder = sortedValidIndices.map((orig) =>
    validIndices.indexOf(orig),
  );
  const priority: number[] = new Array(sheepTargets.length);
  for (let rank = 0; rank < queueOrder.length; rank++) {
    priority[queueOrder[rank]] = rank;
  }

  // 시간 t마다 각 양의 위치를 기록하는 타임라인.
  const positionsHistory: [number, number][][] = fullPaths.map(() => []);
  let indicesNow: number[] = fullPaths.map(() => 0);
  const maxSteps = 2000; // 안전 장치: 이 이상이면 강제 종료

  for (let t = 0; t < maxSteps; t++) {
    // 현재 위치 배열
    const currentPos: [number, number][] = fullPaths.map((path, i) => {
      return path[indicesNow[i]];
    });

    let allAtEnd = true;
    for (let i = 0; i < fullPaths.length; i++) {
      positionsHistory[i].push(currentPos[i]);
      if (indicesNow[i] < fullPaths[i].length - 1) allAtEnd = false;
    }
    if (allAtEnd) break;

    // 다음 틱에 점유될 칸 (이미 예약된 칸)
    const occupiedNext = new Map<string, number>();
    const nextIndices = indicesNow.slice();

    // 큐 순서(입구에 가까운 양부터)로 한 마리씩 이동 시도
    for (const i of queueOrder) {
      const path = fullPaths[i];
      const currIdx = indicesNow[i];
      const curr = currentPos[i];
      let targetIdx =
        currIdx < path.length - 1 ? ((currIdx + 1) as number) : currIdx;
      let target = path[targetIdx];

      if (targetIdx !== currIdx) {
        const targetKey = `${target[0]},${target[1]}`;
        let blocked = false;

        // (1) 지금 시점에 그 칸에 이미 양이 서 있으면, 그 양이 완전히 빠져나갈 다음 틱까지 대기
        for (let k = 0; k < currentPos.length; k++) {
          if (k === i) continue;
          const pk = currentPos[k];
          if (pk[0] === target[0] && pk[1] === target[1]) {
            blocked = true;
            break;
          }
        }

        // (2) 이번 틱에서 다른 양이 먼저 그 칸을 예약했다면, 역시 대기
        if (!blocked && occupiedNext.has(targetKey)) {
          blocked = true;
        }

        if (blocked) {
          targetIdx = currIdx;
          target = curr;
        }
      }

      nextIndices[i] = targetIdx;
      const key = `${target[0]},${target[1]}`;
      occupiedNext.set(key, i);
    }

    indicesNow = nextIndices;
  }

  const sheepAnimations = sheepTargets.map((target: GridCell, i: number) => {
    const timeline = positionsHistory[i];
    const totalPoints = timeline.length;
    const totalSegments = Math.max(totalPoints - 1, 1);
    const totalTime = totalSegments * SHEEP_CELL_TIME;

    // 양이 "길을 기다릴 때" 얼굴이 빙글빙글 돌지 않도록,
    // 실제로 이동한 틱(좌표가 바뀐 틱)에서만 방향을 갱신하고,
    // 같은 칸에 머무르는 동안에는 직전에 움직였던 방향을 유지한다.
    const angles: number[] = new Array(totalPoints).fill(180); // 기본은 아래(게이트 쪽) 바라봄
    let currentAngle = 180;
    for (let idx = 0; idx < totalPoints; idx++) {
      const pos = timeline[idx];

      // 앞으로(또는 뒤로) 좌표가 바뀌는 틱을 찾아 그 방향으로만 각도 갱신
      let found = false;
      // 1) 앞으로 가면서 다른 칸으로 이동하는 틱 찾기
      for (let j = idx + 1; j < totalPoints; j++) {
        const next = timeline[j];
        const dx = next[0] - pos[0];
        const dy = next[1] - pos[1];
        if (dx === 0 && dy === 0) continue;
        if (dx > 0)
          currentAngle = 90; // 오른쪽 이동
        else if (dx < 0)
          currentAngle = 270; // 왼쪽 이동
        else if (dy > 0)
          currentAngle = 180; // 아래로 이동 → 머리 아래
        else if (dy < 0) currentAngle = 0; // 위로 이동 → 머리 위
        found = true;
        break;
      }
      // 2) 앞으로는 전부 대기라면, 직전 틱에서의 실제 이동 방향을 사용
      if (!found && idx > 0) {
        for (let j = idx - 1; j >= 0; j--) {
          const prev = timeline[j];
          const dx = pos[0] - prev[0];
          const dy = pos[1] - prev[1];
          if (dx === 0 && dy === 0) continue;
          if (dx > 0) currentAngle = 90;
          else if (dx < 0) currentAngle = 270;
          else if (dy > 0) currentAngle = 180;
          else if (dy < 0) currentAngle = 0;
          break;
        }
      }
      angles[idx] = currentAngle;
    }

    const keyframeEntries: string[] = [];
    for (let idx = 0; idx < totalPoints; idx++) {
      const pos = timeline[idx];
      const { x, y } = getCellCenterPx(gridLeftX, gridTopY, pos[0], pos[1]);
      const percent = totalPoints > 1 ? (idx / (totalPoints - 1)) * 100 : 0;
      const angle = angles[idx];

      keyframeEntries.push(
        `${percent.toFixed(
          1,
        )}% { transform: translate(${x}px, ${y}px) rotate(${angle}deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); }`,
      );
    }

    const [qCol, qRow] = funnelPositions[i];
    const queuePosPx = getCellCenterPx(gridLeftX, gridTopY, qCol, qRow);
    const initialTransform = `transform: translate(${queuePosPx.x}px, ${queuePosPx.y}px) rotate(180deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); `;

    return {
      id: `sheep-${i}`,
      keyframes: `@keyframes sheep-${i}-move {\n    ${keyframeEntries.join(
        "\n    ",
      )}\n  }`,
      animationCSS: `${initialTransform}animation: sheep-${i}-move ${totalTime}s linear 0s forwards;`,
    };
  });

  const animationStyles = sheepAnimations
    .map((a: { keyframes: string }) => a.keyframes)
    .join("\n  ");
  const sheepGroups = sheepAnimations
    .map(
      (a: { id: string; animationCSS: string }) =>
        `<g class="${a.id}" style="${a.animationCSS}">${SHEEP_CONTENT}</g>`,
    )
    .join("\n  ");

  // 입구 위 대기 칸: 깔때기 형태. 한 칸(1타일)씩 — 그리드와 동일하게 CELL_SIZE×CELL_SIZE, 왼쪽 위 기준 (px, py)
  const QUEUE_CELL_FILL = TILE_PATH; // 대기 칸도 길
  const queueRects = funnelPositions
    .map(([col, row]) => {
      const px = gridLeftX + col * (CELL_SIZE + GAP);
      const py = gridTopY + row * (CELL_SIZE + GAP);
      return `<rect x="${px}" y="${py}" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="${QUEUE_CELL_FILL}" rx="${BORDER_RADIUS}"/>`;
    })
    .join("\n  ");

  // 지정한 칸(열,행) 중앙에 점 — CELL_DOTS 수정해서 빠르게 배치
  const dotRects = CELL_DOTS.map(([col, row]) => {
    const { x, y } = getCellCenterPx(gridLeftX, gridTopY, col, row);
    return `<circle cx="${x}" cy="${y}" r="1.5" fill="#ff4444"/>`;
  }).join("\n  ");

  // viewBox 위로 확장해서 대기 줄이 보이게 (y: -queueHeight ~ baseHeight)
  const viewBoxMinY = -queueHeight;
  const viewBoxHeight = totalHeight;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 ${viewBoxMinY} ${totalWidth} ${viewBoxHeight}">
  <defs>
    <style>
  ${animationStyles}
    </style>
  </defs>
  <rect x="0" y="${viewBoxMinY}" width="${totalWidth}" height="${viewBoxHeight}" fill="${BACKGROUND_COLOR}"/>
  ${fenceRects}
  ${rects}
  ${queueRects}
  ${sheepGroups}
  ${dotRects}
</svg>`;
}
