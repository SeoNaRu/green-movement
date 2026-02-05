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
// 양 이동: 1틱 = 1칸 이동 = 이 시간(초). 애니메이션에서 셀당 구간 길이.
const SHEEP_CELL_TIME = 0.75; // 1칸 0.75초 (체감 확 빨라짐)
// 양이 잔디에 도착한 뒤 잔디 색이 레벨 4→0으로 줄어드는 시간(초). 이만큼 대기 후 다시 탐색.
const GRASS_FADE_DURATION = 2.0;
// 시간 관계: waitTicks = round(GRASS_FADE_DURATION / SHEEP_CELL_TIME). 잔디 페이드 끝나기 전에는 다음 잔디로 못 감.
const waitTicks = Math.round(GRASS_FADE_DURATION / SHEEP_CELL_TIME);
// 각 양이 최대 몇 칸의 잔디를 먹을지 (전체 잔디 전부를 원하면 크게)
const MAX_MEALS_PER_SHEEP = 50;
// 교착 해소: 같은 칸에서 이 틱 수 이상 막히면 한 칸 후진(backoff) 시도
const STUCK_BACKOFF_THRESHOLD = 2; // 막히면 더 빨리 후진 시도
// 접근칸 예약 TTL: 이 틱 수 지나면 예약 자동 해제 (입구 독점 완화)
const APPROACH_TTL = 12;
// 거리 기반 뺏기: 예약 후 이 틱 수 지나면, 더 가까운 양이 뺏을 수 있음
const APPROACH_STEAL_AFTER = 6;
const APPROACH_STEAL_MARGIN = 2; // 새 dist가 기존보다 이만큼 이상 가까우면 뺏음

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
 * 상하좌우 인접 여부 (한 칸만 차이)
 */
function isAdjacent4(a: [number, number], b: [number, number]): boolean {
  return Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) === 1;
}

/**
 * path에서 currIdx보다 앞이면서 좌표가 currIdx와 다른 마지막 인덱스 (addCornerPause 중복 대비)
 */
function findPrevDifferentIdx(
  path: [number, number][],
  currIdx: number,
): number {
  const [cc, cr] = path[currIdx] ?? [0, 0];
  for (let j = currIdx - 1; j >= 0; j--) {
    const [pc, pr] = path[j] ?? [0, 0];
    if (pc !== cc || pr !== cr) return j;
  }
  return Math.max(0, currIdx - 1);
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
    if (c0 === c1 && r0 === r1) continue;
    let cx = c0;
    let rx = r0;
    do {
      if (cx !== c1) cx += c1 > cx ? 1 : -1;
      else if (rx !== r1) rx += r1 > rx ? 1 : -1;
      out.push([cx, rx]);
    } while (cx !== c1 || rx !== r1);
  }
  return out;
}

/**
 * 코너(방향이 바뀌는 칸)에서 한 틱 멈추도록 칸을 한 번 더 넣음 — 대각선 느낌·성급한 이동 방지
 */
function addCornerPause(path: [number, number][]): [number, number][] {
  if (path.length < 3) return path;
  const out: [number, number][] = [path[0], path[1]];
  for (let i = 2; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const prevDir: [number, number] = [
      path[i - 1][0] - path[i - 2][0],
      path[i - 1][1] - path[i - 2][1],
    ];
    const currDir: [number, number] = [curr[0] - prev[0], curr[1] - prev[1]];
    const dirChanged = prevDir[0] !== currDir[0] || prevDir[1] !== currDir[1];
    if (dirChanged) out.push([prev[0], prev[1]]);
    out.push(curr);
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
 * BFS로 두 칸 사이 경로 (allowedSet 안의 칸만 통과). 4방향.
 */
function pathBetweenCells(
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
  allowedSet: Set<string>,
  maxX: number,
  maxY: number,
): [number, number][] {
  const key = (c: number, r: number) => `${c},${r}`;
  const allowed = (c: number, r: number) =>
    c >= 0 && c <= maxX && r >= 0 && r <= maxY && allowedSet.has(key(c, r));
  const visited = new Set<string>();
  const parent = new Map<string, string | null>();
  const queue: [number, number][] = [[fromCol, fromRow]];
  visited.add(key(fromCol, fromRow));
  parent.set(key(fromCol, fromRow), null);
  const dirs: [number, number][] = [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
  ];
  while (queue.length > 0) {
    const [col, row] = queue.shift()!;
    if (col === toCol && row === toRow) break;
    for (const [dc, dr] of dirs) {
      const nc = col + dc;
      const nr = row + dr;
      const nk = key(nc, nr);
      if (!allowed(nc, nr) || visited.has(nk)) continue;
      visited.add(nk);
      parent.set(nk, key(col, row));
      queue.push([nc, nr]);
    }
  }
  return tracePath(toCol, toRow, parent);
}

/**
 * 잔디→잔디 경로 (빈 칸 + 두 잔디만 통과)
 */
function pathBetweenGrassCells(
  firstGrass: GridCell,
  secondGrass: GridCell,
  emptyCellSet: Set<string>,
  maxX: number,
  maxY: number,
): [number, number][] {
  const allowed = new Set([
    ...emptyCellSet,
    `${firstGrass.x},${firstGrass.y}`,
    `${secondGrass.x},${secondGrass.y}`,
  ]);
  return pathBetweenCells(
    firstGrass.x,
    firstGrass.y,
    secondGrass.x,
    secondGrass.y,
    allowed,
    maxX,
    maxY,
  );
}

/**
 * 현재 칸이 잔디(count>0)인지
 */
function isOnGrass(
  pos: [number, number],
  byKey: Map<string, GridCell>,
): boolean {
  const cell = byKey.get(`${pos[0]},${pos[1]}`);
  return !!cell && cell.count > 0;
}

/**
 * route에서 idx 위치가 같은 칸이 연속으로 waitTicks+1 이상인지 (도착칸 포함 + 대기)
 */
function hasWaitedEnough(
  route: [number, number][],
  idx: number,
  waitTicks: number,
): boolean {
  const [c, r] = route[idx] ?? route[route.length - 1];
  let same = 0;
  for (let j = idx; j >= 0; j--) {
    const p = route[j];
    if (!p || p[0] !== c || p[1] !== r) break;
    same++;
    if (same >= waitTicks + 1) return true;
  }
  return false;
}

export type GrassCandidate = {
  grass: GridCell;
  emptyNeighbor: [number, number];
  dist: number;
};

/**
 * 현재 위치에서 BFS로 퍼지다가 인접한 "가용 잔디"를 발견하면 후보로 수집.
 * availableGrassKeys = remainingGrassKeys에서 이번 틱에 이미 배정된 것은 제외한 집합.
 * 반환에 dist(BFS 레벨) 포함. 최대 maxCandidates개까지 수집.
 */
function findNearestReachableGrassCandidates(
  selfIndex: number,
  from: [number, number],
  availableGrassKeys: Set<string>,
  emptyCellSet: Set<string>,
  funnelCellSet: Set<string>,
  minFunnelRow: number,
  maxX: number,
  maxY: number,
  byKey: Map<string, GridCell>,
  occupiedNowMap: Map<string, number>,
  reservedApproach: Map<string, { owner: number }>,
  maxCandidates: number = 5,
): GrassCandidate[] {
  const key = (c: number, r: number) => `${c},${r}`;
  const inBounds = (c: number, r: number) =>
    c >= 0 && c <= maxX && r >= minFunnelRow && r <= maxY;

  const visited = new Set<string>();
  const q: { pos: [number, number]; dist: number }[] = [];
  const results: GrassCandidate[] = [];

  visited.add(key(from[0], from[1]));
  q.push({ pos: from, dist: 0 });

  const dirs: [number, number][] = [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
  ];

  const canExpand = (c: number, r: number) =>
    emptyCellSet.has(key(c, r)) || funnelCellSet.has(key(c, r));

  while (q.length > 0 && results.length < maxCandidates) {
    const {
      pos: [c, r],
      dist,
    } = q.shift()!;

    for (const [dc, dr] of dirs) {
      const nc = c + dc;
      const nr = r + dr;
      if (!inBounds(nc, nr)) continue;

      const nk = key(nc, nr);
      if (!availableGrassKeys.has(nk)) continue;

      const grassCell = byKey.get(nk);
      if (!grassCell || grassCell.count <= 0) continue;

      const approachKey = key(c, r);
      const occ = occupiedNowMap.get(approachKey);
      if (occ != null && occ !== selfIndex) continue;
      const res = reservedApproach.get(approachKey);
      if (res != null && res.owner !== selfIndex) continue;

      results.push({ grass: grassCell, emptyNeighbor: [c, r], dist });
      if (results.length >= maxCandidates) return results;
    }

    for (const [dc, dr] of dirs) {
      const nc = c + dc;
      const nr = r + dr;
      const nk = key(nc, nr);
      if (!inBounds(nc, nr) || visited.has(nk)) continue;
      if (!canExpand(nc, nr)) continue;

      visited.add(nk);
      q.push({ pos: [nc, nr], dist: dist + 1 });
    }
  }

  return results;
}

/**
 * 단일 최근접 잔디 (기존 호환용). 후보가 있으면 첫 번째 반환.
 */
function findNearestReachableGrassFrom(
  from: [number, number],
  availableGrassKeys: Set<string>,
  emptyCellSet: Set<string>,
  maxX: number,
  maxY: number,
  byKey: Map<string, GridCell>,
  occupiedNowMap: Map<string, number> = new Map(),
  reservedApproach: Map<string, { owner: number }> = new Map(),
  funnelCellSet: Set<string> = new Set(),
  minFunnelRow: number = 0,
): { grass: GridCell; emptyNeighbor: [number, number]; dist: number } | null {
  const candidates = findNearestReachableGrassCandidates(
    -1,
    from,
    availableGrassKeys,
    emptyCellSet,
    funnelCellSet,
    minFunnelRow,
    maxX,
    maxY,
    byKey,
    occupiedNowMap,
    reservedApproach,
    1,
  );
  return candidates.length > 0 ? candidates[0] : null;
}

/**
 * from → emptyNeighbor(길) → targetGrass 경로 생성 (pathBetweenCells + 마지막 1칸)
 */
function buildPathFromToGrass(
  from: [number, number],
  emptyNeighbor: [number, number],
  targetGrass: GridCell,
  emptyCellSet: Set<string>,
  maxX: number,
  maxY: number,
): [number, number][] {
  const allowed = new Set<string>([
    ...emptyCellSet,
    `${from[0]},${from[1]}`,
    `${emptyNeighbor[0]},${emptyNeighbor[1]}`,
    `${targetGrass.x},${targetGrass.y}`,
  ]);

  let p1 = pathBetweenCells(
    from[0],
    from[1],
    emptyNeighbor[0],
    emptyNeighbor[1],
    allowed,
    maxX,
    maxY,
  );

  p1 = ensureOnly4Direction(p1);
  p1 = addCornerPause(p1);

  const p2: [number, number][] = [[targetGrass.x, targetGrass.y]];

  if (p1.length === 0) return p2;
  const last = p1[p1.length - 1];
  if (last[0] === p2[0][0] && last[1] === p2[0][1]) return p1;
  return [...p1, ...p2];
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
  const centerCol = Math.floor(maxX / 2);
  // 입구별 BFS → 각 양이 자기 입구에서 나온 경로만 사용 (대각선 방지)
  const leftBfs = emptyBfsFromGate(grid, maxX, maxY, centerCol - 1);
  const rightBfs = emptyBfsFromGate(grid, maxX, maxY, centerCol);
  const byKey = new Map<string, GridCell>();
  for (const c of grid) byKey.set(`${c.x},${c.y}`, c);
  const initialCountByKey = new Map<string, number>();
  for (const c of grid) initialCountByKey.set(`${c.x},${c.y}`, c.count);
  const G1 = `${centerCol - 1},0`;
  const G2 = `${centerCol},0`;
  const g1 = byKey.get(G1);
  const g2 = byKey.get(G2);
  if (g1) g1.count = 0;
  if (g2) g2.count = 0;
  initialCountByKey.set(G1, 0);
  initialCountByKey.set(G2, 0);
  const grassCells = grid.filter(
    (c) => (initialCountByKey.get(`${c.x},${c.y}`) ?? 0) > 0,
  );
  const sheepCountCap = Math.floor(grassCells.length / 3);
  const inBounds = (col: number, row: number) =>
    col >= 0 && col <= maxX && row >= 0 && row <= maxY;
  const dirs4: [number, number][] = [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
  ];
  const keyOf = (c: number, r: number) => `${c},${r}`;

  /** 게이트에서 연결된, 현재 count===0인 칸만 BFS. 매 틱 갱신용 */
  function recomputeReachableEmptyFromGates(): Set<string> {
    const out = new Set<string>();
    const q: [number, number][] = [];

    const trySeed = (c: number, r: number) => {
      if (!inBounds(c, r)) return;
      const cell = byKey.get(keyOf(c, r));
      if (!cell) return;
      if (cell.count !== 0) return;
      const k = keyOf(c, r);
      if (out.has(k)) return;
      out.add(k);
      q.push([c, r]);
    };

    trySeed(centerCol - 1, 0);
    trySeed(centerCol, 0);

    while (q.length) {
      const [c, r] = q.shift()!;
      for (const [dc, dr] of dirs4) {
        const nc = c + dc;
        const nr = r + dr;
        if (!inBounds(nc, nr)) continue;
        const cell = byKey.get(keyOf(nc, nr));
        if (!cell || cell.count !== 0) continue;
        const nk = keyOf(nc, nr);
        if (out.has(nk)) continue;
        out.add(nk);
        q.push([nc, nr]);
      }
    }
    return out;
  }

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
  // 깔때기: 수학 기반 삼각형 영역 + 스폰 칸. funnelAreaSet = 영역 전체, spawnPositions = 양별 시작 칸.
  type FunnelGen = {
    spawnPositions: [number, number][];
    funnelAreaSet: Set<string>;
    minRow: number;
  };
  function generateFunnel(
    sheepCount: number,
    centerCol: number,
    maxX: number,
  ): FunnelGen {
    const key = (c: number, r: number) => `${c},${r}`;

    const funnelAreaSet = new Set<string>();
    const spawnPositions: [number, number][] = [];

    const gateMin = centerCol - 1;
    const gateMax = centerCol;

    const bufferRow1 = -1;
    for (let c = gateMin; c <= gateMax; c++)
      funnelAreaSet.add(key(c, bufferRow1));

    const bufferRow2 = -2;
    let b2Start = gateMin - 1;
    let b2End = gateMax + 1;
    b2Start = Math.max(0, b2Start);
    b2End = Math.min(maxX, b2End);
    for (let c = b2Start; c <= b2End; c++)
      funnelAreaSet.add(key(c, bufferRow2));

    let row = -3;
    while (spawnPositions.length < sheepCount) {
      const k = -row;

      let start = centerCol - k;
      let end = centerCol + k - 1;

      if (start < 0) start = 0;
      if (end > maxX) end = maxX;

      for (let c = start; c <= end; c++) {
        funnelAreaSet.add(key(c, row));
      }

      for (let c = start; c <= end && spawnPositions.length < sheepCount; c++) {
        spawnPositions.push([c, row]);
      }

      row -= 1;
    }

    return { spawnPositions, funnelAreaSet, minRow: row + 1 };
  }
  const {
    spawnPositions: funnelPositionsEarly,
    funnelAreaSet,
    minRow: minFunnelRow,
  } = generateFunnel(sheepCount, centerCol, maxX);
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
  const queueHeight = -minFunnelRow * (CELL_SIZE + GAP);
  const totalHeight = baseHeight + queueHeight;

  // Calculate quartiles for level determination
  const allCounts = grid.map((c) => c.count);
  const quartiles = calculateQuartiles(allCounts);
  // rects는 타임라인 루프 이후, 양별 도착 시각을 알 수 있을 때 생성 (잔디 페이드 애니메이션 적용)

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
  const sheepScale = SHEEP_WIDTH_PX / SHEEP_VIEWBOX_W / 2.5;
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
    const path: [number, number][] = [];
    let c = Math.max(0, Math.min(maxX, col));
    let r = fromRow;

    path.push([c, r]);

    while (r < -2) {
      const nextRow = r + 1;
      const k = -nextRow;
      let start = centerCol - k;
      let end = centerCol + k - 1;

      if (start < 0) start = 0;
      if (end > maxX) end = maxX;

      while (c < start) {
        c += 1;
        path.push([c, r]);
      }
      while (c > end) {
        c -= 1;
        path.push([c, r]);
      }

      r = nextRow;
      path.push([c, r]);
    }

    const targetGateCol = Math.max(gateColMin, Math.min(gateColMax, c));
    while (c < targetGateCol) {
      c += 1;
      path.push([c, r]);
    }
    while (c > targetGateCol) {
      c -= 1;
      path.push([c, r]);
    }

    r = -1;
    path.push([c, r]);
    path.push([c, 0]);
    return path;
  }

  // 깔때기 영역 전체 + 그리드 빈 칸(길) + 각 양의 목표 잔디만 이동 가능.
  const funnelCellSet = funnelAreaSet;
  let emptyCellSet = recomputeReachableEmptyFromGates();

  // emptyCellSet에 인접한 잔디만 도달 가능 → remaining은 여기서만 초기화
  const reachableGrassKeys = new Set<string>();
  for (const ek of emptyCellSet) {
    const [c, r] = ek.split(",").map(Number);
    for (const [dc, dr] of dirs4) {
      const nc = c + dc;
      const nr = r + dr;
      const nk = `${nc},${nr}`;
      const cell = byKey.get(nk);
      const initial = initialCountByKey.get(nk) ?? 0;
      if (cell && initial > 0) reachableGrassKeys.add(nk);
    }
  }

  /** emptyCellSet이 바뀔 때마다 새로 도달 가능해진 잔디를 remainingGrassKeys에 보충 */
  function refreshReachableGrassKeys(
    emptyCellSet: Set<string>,
    remainingGrassKeys: Set<string>,
  ) {
    for (const ek of emptyCellSet) {
      const [c, r] = ek.split(",").map(Number);
      for (const [dc, dr] of dirs4) {
        const nc = c + dc;
        const nr = r + dr;
        if (!inBounds(nc, nr)) continue;

        const nk = `${nc},${nr}`;
        const cell = byKey.get(nk);
        const initial = initialCountByKey.get(nk) ?? 0;

        if (cell && initial > 0 && cell.count > 0) {
          remainingGrassKeys.add(nk);
        }
      }
    }
  }

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

  // 전역: 아직 안 먹은 잔디(도착 시에만 삭제). 도달 가능한 잔디만 포함.
  const remainingGrassKeys = new Set<string>(reachableGrassKeys);
  refreshReachableGrassKeys(emptyCellSet, remainingGrassKeys);
  const reservedGrass = new Map<string, number>(); // grassKey -> sheepIndex
  const reservedBySheep: (string | null)[] = Array.from(
    { length: sheepTargets.length },
    () => null,
  );
  const reservedAtTick: number[] = new Array(sheepTargets.length).fill(-1);
  type ApproachRes = { owner: number; tick: number; dist: number };
  const reservedApproach = new Map<string, ApproachRes>();
  const reservedApproachBySheep: (string | null)[] = Array.from(
    { length: sheepTargets.length },
    () => null,
  );

  const fullPaths: [number, number][][] = [];
  for (let si = 0; si < sheepTargets.length; si++) {
    const firstGrass = sheepTargets[si];
    const gateToTarget = paths[si];
    const funnel = funnelPositions[si];
    const toGate = funnelToGate(funnel[0], funnel[1]);

    const raw = [...toGate, ...gateToTarget];
    let p = ensureOnly4Direction(raw);

    const validSet = new Set([
      ...funnelCellSet,
      ...emptyCellSet,
      `${gateColMin},0`,
      `${gateColMax},0`,
      `${firstGrass.x},${firstGrass.y}`,
    ]);
    p = trimPathToValidOnly(p, validSet);
    p = ensureOnly4Direction(p);
    p = addCornerPause(p);

    const waitAtFirst: [number, number][] = [];
    for (let w = 0; w < waitTicks; w++)
      waitAtFirst.push([firstGrass.x, firstGrass.y]);
    const route: [number, number][] = [...p, ...waitAtFirst];
    fullPaths.push(route);
  }

  if (process.env.NODE_ENV !== "production") {
    fullPaths.forEach((p, i) => {
      if (p.length <= 1) console.warn("STUCK_AT_SPAWN", i, p[0]);
    });
  }

  // 첫 잔디는 remaining에서 빼지 않고 예약만
  for (let i = 0; i < sheepTargets.length; i++) {
    const g = sheepTargets[i];
    const k = `${g.x},${g.y}`;
    reservedGrass.set(k, i);
    reservedBySheep[i] = k;
    reservedAtTick[i] = 0;
  }

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
  const maxSteps = 4000; // N-meals로 경로가 길어질 수 있음
  const stuckTicks: number[] = fullPaths.map(() => 0);
  const mealsEaten: number[] = fullPaths.map(() => 1); // 첫 잔디 = 1
  const backoffCooldown: number[] = new Array(fullPaths.length).fill(0);

  const edgeKey = (a: [number, number], b: [number, number]) =>
    `${a[0]},${a[1]}->${b[0]},${b[1]}`;

  for (let t = 0; t < maxSteps; t++) {
    let emptyDirty = false;
    for (let i = 0; i < fullPaths.length; i++) {
      indicesNow[i] = Math.min(
        indicesNow[i],
        Math.max(0, fullPaths[i].length - 1),
      );
    }
    const currentPos: [number, number][] = fullPaths.map((path, i) => {
      const idx = indicesNow[i];
      return path[idx] ?? path[path.length - 1];
    });
    const occupiedNowMap = new Map<string, number>();
    for (let si = 0; si < currentPos.length; si++) {
      const [c, r] = currentPos[si];
      occupiedNowMap.set(`${c},${r}`, si);
    }

    // 0) 예약 TTL: 100틱 이상 못 먹으면 예약 해제 + 경로 잘라서 재탐색 유도
    for (let i = 0; i < fullPaths.length; i++) {
      const rk = reservedBySheep[i];
      if (!rk) continue;
      if (reservedAtTick[i] >= 0 && t - reservedAtTick[i] > 100) {
        reservedGrass.delete(rk);
        reservedBySheep[i] = null;
        reservedAtTick[i] = -1;
        const ak = reservedApproachBySheep[i];
        if (ak) {
          reservedApproach.delete(ak);
          reservedApproachBySheep[i] = null;
        }
        fullPaths[i].length = indicesNow[i] + 1;
      }
    }
    // 0.5) approach TTL: 일정 틱 지나면 접근칸 예약 자동 해제
    for (const [ak, res] of reservedApproach.entries()) {
      if (t - res.tick > APPROACH_TTL) {
        reservedApproach.delete(ak);
        if (reservedApproachBySheep[res.owner] === ak)
          reservedApproachBySheep[res.owner] = null;
      }
    }

    // 1) 다음 목표가 필요한 양들 수집: 잔디에서 대기 끝났을 때만, 예외로 경로 끝+길에서 멈춘 경우
    const need: number[] = [];
    for (let i = 0; i < fullPaths.length; i++) {
      if (mealsEaten[i] >= MAX_MEALS_PER_SHEEP) continue;
      if (remainingGrassKeys.size === 0) continue;
      const route = fullPaths[i];
      const idx = indicesNow[i];
      const pos = currentPos[i];
      const atGrass = isOnGrass(pos, byKey);
      const waited = atGrass ? hasWaitedEnough(route, idx, waitTicks) : true;
      const routeEnded = idx >= route.length - 1;
      const needNext = (atGrass && waited) || (routeEnded && !atGrass);
      if (needNext) need.push(i);
    }
    // 2) 배치 할당: priority 순서. 후보 풀 = remaining - reserved
    const availableKeys = new Set(remainingGrassKeys);
    for (const k of reservedGrass.keys()) availableKeys.delete(k);
    const needByPriority = [...need].sort((a, b) => priority[a] - priority[b]);
    for (const i of needByPriority) {
      const route = fullPaths[i];
      const idx = indicesNow[i];
      const pos = currentPos[i];
      const routeEnded = idx >= route.length - 1;
      const emergency = routeEnded && !isOnGrass(pos, byKey);
      const maxCandidates = emergency ? 10 : 5;
      const candidates = findNearestReachableGrassCandidates(
        i,
        pos,
        availableKeys,
        emptyCellSet,
        funnelCellSet,
        minFunnelRow,
        maxX,
        maxY,
        byKey,
        occupiedNowMap,
        reservedApproach,
        maxCandidates,
      );
      for (const cand of candidates) {
        const gk = `${cand.grass.x},${cand.grass.y}`;
        if (!availableKeys.has(gk)) continue;
        const ak = `${cand.emptyNeighbor[0]},${cand.emptyNeighbor[1]}`;
        const res = reservedApproach.get(ak);
        if (res && res.owner !== i) {
          const oldAge = t - res.tick;
          const muchCloser = cand.dist + APPROACH_STEAL_MARGIN < res.dist;
          const oldEnough = oldAge >= APPROACH_STEAL_AFTER;
          if (!(oldEnough && muchCloser)) continue;
          if (reservedApproachBySheep[res.owner] === ak)
            reservedApproachBySheep[res.owner] = null;
          reservedApproach.delete(ak);
        }
        let toNext = buildPathFromToGrass(
          pos,
          cand.emptyNeighbor,
          cand.grass,
          emptyCellSet,
          maxX,
          maxY,
        );
        if (toNext.length > 0) {
          const lastRoute = route[route.length - 1];
          const firstStep = toNext[0];
          if (
            lastRoute &&
            firstStep[0] === lastRoute[0] &&
            firstStep[1] === lastRoute[1]
          ) {
            toNext = toNext.slice(1);
          }
          route.push(...toNext);
        }
        for (let w = 0; w < waitTicks; w++)
          route.push([cand.grass.x, cand.grass.y]);
        availableKeys.delete(gk);
        reservedGrass.set(gk, i);
        reservedBySheep[i] = gk;
        reservedAtTick[i] = t;
        reservedApproach.set(ak, { owner: i, tick: t, dist: cand.dist });
        reservedApproachBySheep[i] = ak;
        mealsEaten[i]++;
        break;
      }
    }

    let allAtEnd = true;
    for (let i = 0; i < fullPaths.length; i++) {
      positionsHistory[i].push(currentPos[i]);
      if (indicesNow[i] < fullPaths[i].length - 1) allAtEnd = false;
    }
    if (allAtEnd) break;

    const occupiedNext = new Map<string, number>();
    const occupiedEdge = new Set<string>();
    const nextIndices = indicesNow.slice();

    // 큐 순서(입구에 가까운 양부터)로 한 마리씩 이동 시도
    for (const i of queueOrder) {
      const path = fullPaths[i];
      const currIdx = Math.min(indicesNow[i], path.length - 1);
      const curr = path[currIdx] ?? currentPos[i];
      let targetIdx =
        currIdx < path.length - 1 ? ((currIdx + 1) as number) : currIdx;
      let target = path[targetIdx];
      if (target == null) {
        targetIdx = currIdx;
        target = curr;
      }
      if (backoffCooldown[i] > 0) {
        backoffCooldown[i] -= 1;
        nextIndices[i] = currIdx;
        occupiedNext.set(`${curr[0]},${curr[1]}`, i);
        continue;
      }

      if (targetIdx !== currIdx) {
        const targetKey = `${target[0]},${target[1]}`;
        let blocked = false;

        // (0) 4방향 규칙
        const sameCell = curr[0] === target[0] && curr[1] === target[1];
        let blockedReason:
          | "occupiedNow"
          | "occupiedNext"
          | "edgeSwap"
          | "invalidMove"
          | null = null;
        if (!sameCell && !isAdjacent4(curr, target)) {
          blocked = true;
          blockedReason = "invalidMove";
        }

        // 대기는 route에 waitTicks 반복으로 보장됨 “먹기”가 끝나기 전에는 둘째 잔디 쪽으로 한 칸도 못 감
        // (2) 블로킹: 그 칸에 이미 다른 양이 있으면 대기
        if (!blocked) {
          for (let k = 0; k < currentPos.length; k++) {
            if (k === i) continue;
            const pk = currentPos[k];
            if (pk != null && pk[0] === target[0] && pk[1] === target[1]) {
              blocked = true;
              blockedReason = "occupiedNow";
              break;
            }
          }
        }

        // (3) 블로킹: 이번 틱에 다른 양이 먼저 그 칸을 예약했으면 대기
        if (!blocked && occupiedNext.has(targetKey)) {
          blocked = true;
          blockedReason = "occupiedNext";
        }

        // (3.5) 엣지 충돌: 같은 틱에 (A→B)와 (B→A) 교차 금지
        if (!blocked) {
          const rev = edgeKey(target, curr);
          if (occupiedEdge.has(rev)) {
            blocked = true;
            blockedReason = "edgeSwap";
          }
        }

        if (blocked) {
          stuckTicks[i] += 1;
          let didBackoff = false;
          if (stuckTicks[i] >= 3) {
            const rk = reservedBySheep[i];
            if (rk) {
              reservedGrass.delete(rk);
              reservedBySheep[i] = null;
              reservedAtTick[i] = -1;
            }
            const ak = reservedApproachBySheep[i];
            if (ak) {
              reservedApproach.delete(ak);
              reservedApproachBySheep[i] = null;
            }
            fullPaths[i].length = currIdx + 1;
            stuckTicks[i] = 0;
            targetIdx = currIdx;
            target = curr;
            backoffCooldown[i] = 0;
            didBackoff = true;
          }
          if (
            !didBackoff &&
            (blockedReason === "occupiedNow" ||
              blockedReason === "occupiedNext") &&
            stuckTicks[i] >= STUCK_BACKOFF_THRESHOLD &&
            currIdx > 0
          ) {
            const backoffIdx = findPrevDifferentIdx(path, currIdx);
            if (backoffIdx < currIdx) {
              const backoffCell = path[backoffIdx];
              if (backoffCell != null) {
                const backoffKey = `${backoffCell[0]},${backoffCell[1]}`;
                let backoffBlocked = false;
                for (let k = 0; k < currentPos.length; k++) {
                  if (k === i) continue;
                  const pk = currentPos[k];
                  if (
                    pk != null &&
                    pk[0] === backoffCell[0] &&
                    pk[1] === backoffCell[1]
                  ) {
                    backoffBlocked = true;
                    break;
                  }
                }
                if (!backoffBlocked && !occupiedNext.has(backoffKey)) {
                  targetIdx = backoffIdx;
                  target = backoffCell;
                  stuckTicks[i] = 0;
                  backoffCooldown[i] = 0;
                  didBackoff = true;
                }
              }
            }
          }
          if (!didBackoff) {
            targetIdx = currIdx;
            target = curr;
          }
        } else {
          stuckTicks[i] = 0;
        }
      }

      nextIndices[i] = targetIdx;
      const moved = targetIdx !== currIdx;
      if (moved) {
        const ak = reservedApproachBySheep[i];
        if (ak) {
          const [ac, ar] = ak.split(",").map(Number);
          if (target[0] === ac && target[1] === ar) {
            reservedApproach.delete(ak);
            reservedApproachBySheep[i] = null;
          }
        }
        occupiedEdge.add(edgeKey(curr, target));
        const k = `${target[0]},${target[1]}`;
        const cell = byKey.get(k);
        const initialCount = initialCountByKey.get(k) ?? 0;
        if (cell && initialCount > 0 && cell.count > 0) {
          cell.count = 0;
          emptyDirty = true;
          remainingGrassKeys.delete(k);
          reservedGrass.delete(k);
          if (reservedBySheep[i] === k) {
            reservedBySheep[i] = null;
            reservedAtTick[i] = -1;
          }
          const ak = reservedApproachBySheep[i];
          if (ak) {
            reservedApproach.delete(ak);
            reservedApproachBySheep[i] = null;
          }
        }
      }
      const key = `${target[0]},${target[1]}`;
      occupiedNext.set(key, i);
    }

    if (emptyDirty) {
      emptyCellSet = recomputeReachableEmptyFromGates();
      refreshReachableGrassKeys(emptyCellSet, remainingGrassKeys);
    }
    indicesNow = nextIndices;
  }

  // 양들끼리 같은 칸을 공유하는지 검사 (블로킹이 제대로 되었는지)
  const collisionLog: { tick: number; cell: string; sheep: number[] }[] = [];
  const historyLen = Math.min(...positionsHistory.map((h) => h.length));
  for (let tick = 0; tick < historyLen; tick++) {
    const byCell = new Map<string, number[]>();
    for (let i = 0; i < positionsHistory.length; i++) {
      const pos = positionsHistory[i][tick];
      if (pos == null) continue;
      const key = `${pos[0]},${pos[1]}`;
      if (!byCell.has(key)) byCell.set(key, []);
      byCell.get(key)!.push(i);
    }
    for (const [cell, sheep] of byCell) {
      if (sheep.length > 1) collisionLog.push({ tick, cell, sheep });
    }
  }
  if (collisionLog.length > 0 && process.env.NODE_ENV !== "production") {
    console.warn(
      "[renderGridSvg] 양 위치 충돌: 같은 틱에 같은 칸에 2마리 이상",
      collisionLog.slice(0, 5),
    );
  }

  // 잔디 셀별 도착 기록(여러 번). 렌더는 최초 1회만 fade 적용
  type Arrival = {
    arrivalTime: number;
    level: number;
    sheepIndex: number;
  };
  const targetCellArrivals = new Map<string, Arrival[]>();
  function pushArrival(k: string, a: Arrival) {
    const list = targetCellArrivals.get(k) ?? [];
    list.push(a);
    list.sort((x, y) => x.arrivalTime - y.arrivalTime);
    targetCellArrivals.set(k, list);
  }
  for (let si = 0; si < positionsHistory.length; si++) {
    const timeline = positionsHistory[si];
    for (let t = 0; t < timeline.length; t++) {
      const [c, r] = timeline[t];
      const k = `${c},${r}`;
      const initialCount = initialCountByKey.get(k) ?? 0;
      if (initialCount <= 0) continue;

      const prev = t > 0 ? timeline[t - 1] : null;
      const movedIn = !prev || prev[0] !== c || prev[1] !== r;
      if (!movedIn) continue;

      const arrivalTime = (t + 1) * SHEEP_CELL_TIME;
      const level = getContributionLevel(initialCount, quartiles);
      pushArrival(k, { arrivalTime, level, sheepIndex: si });
    }
  }

  // 잔디 레벨 4→0 서서히 감소용 CSS 키프레임 (시작 레벨별)
  const grassFadeKeyframes = `
  @keyframes grass-fade-from-4 {
    0% { fill: ${COLORS.LEVEL_4}; }
    25% { fill: ${COLORS.LEVEL_3}; }
    50% { fill: ${COLORS.LEVEL_2}; }
    75% { fill: ${COLORS.LEVEL_1}; }
    100% { fill: ${COLORS.LEVEL_0}; }
  }
  @keyframes grass-fade-from-3 {
    0% { fill: ${COLORS.LEVEL_3}; }
    33.33% { fill: ${COLORS.LEVEL_2}; }
    66.67% { fill: ${COLORS.LEVEL_1}; }
    100% { fill: ${COLORS.LEVEL_0}; }
  }
  @keyframes grass-fade-from-2 {
    0% { fill: ${COLORS.LEVEL_2}; }
    50% { fill: ${COLORS.LEVEL_1}; }
    100% { fill: ${COLORS.LEVEL_0}; }
  }
  @keyframes grass-fade-from-1 {
    0% { fill: ${COLORS.LEVEL_1}; }
    100% { fill: ${COLORS.LEVEL_0}; }
  }`;

  const rects = grid
    .map((cell) => {
      const px = gridLeftX + cell.x * (CELL_SIZE + GAP);
      const py = gridTopY + cell.y * (CELL_SIZE + GAP);
      const key = `${cell.x},${cell.y}`;
      const initialCount = initialCountByKey.get(key) ?? cell.count;
      const level = getContributionLevel(initialCount, quartiles);
      const arrivals = targetCellArrivals.get(key);
      if (arrivals && arrivals.length > 0) {
        const first = arrivals[0];
        const startLevel = Math.max(1, first.level);
        const fill = getColor(startLevel);
        const anim = `animation: grass-fade-from-${startLevel} ${GRASS_FADE_DURATION}s ease-out ${first.arrivalTime}s forwards`;
        return `<rect x="${px}" y="${py}" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="${fill}" rx="${BORDER_RADIUS}" style="${anim}"/>`;
      }
      const color = getColor(level);
      return `<rect x="${px}" y="${py}" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="${color}" rx="${BORDER_RADIUS}"/>`;
    })
    .join("\n  ");

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

    // 퍼센트를 0.1%로 반올림하면 totalPoints가 클 때 여러 점이 같은 %로 겹쳐져
    // CSS가 중간 키프레임을 덮어쓰고 직선 보간 → 대각선/겹침처럼 보임. 0.0001% 단위로 정밀도 올림.
    const keyframeEntries: string[] = [];
    const pctUsed = new Set<string>();
    for (let idx = 0; idx < totalPoints; idx++) {
      const pos = timeline[idx];
      const { x, y } = getCellCenterPx(gridLeftX, gridTopY, pos[0], pos[1]);
      const percent = totalPoints > 1 ? (idx * 100) / (totalPoints - 1) : 0;
      let pct = Number.isFinite(percent) ? percent.toFixed(4) : "0";
      while (pctUsed.has(pct)) {
        const num = Math.min(100, parseFloat(pct) + 0.0001);
        pct = num.toFixed(4);
      }
      pctUsed.add(pct);
      const angle = angles[idx];
      keyframeEntries.push(
        `${pct}% { transform: translate(${x}px, ${y}px) rotate(${angle}deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); }`,
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
      animationCSS: `${initialTransform}animation: sheep-${i}-move ${totalTime}s steps(${totalSegments}, end) 0s forwards;`,
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

  // 입구 위 대기 칸: 깔때기 삼각형 전체(funnelAreaSet)를 길로 렌더
  const QUEUE_CELL_FILL = TILE_PATH;
  const queueRects = [...funnelAreaSet]
    .map((k) => {
      const [col, row] = k.split(",").map(Number);
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
  ${grassFadeKeyframes}
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
