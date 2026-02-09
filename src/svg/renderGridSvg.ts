import type { GridCell } from "../grid/mapGrid.js";
import {
  CELL_SIZE,
  GAP,
  BORDER_RADIUS,
  BACKGROUND_COLOR,
  FENCE_TILE,
  FENCE_MARGIN,
  FENCE_SCALE,
  FENCE_H_PATH,
  FENCE_V_PATH,
  FENCE_CORNER_PATH,
  FENCE_GROUP_STYLE,
  SHEEP_CELL_TIME,
  GRASS_FADE_DURATION,
  waitTicks,
  MAX_MEALS_PER_SHEEP,
  GRASS_RES_TTL,
  RESERVE_AHEAD_LIMIT,
  SHEEP_CONTENT,
  SHEEP_VIEWBOX_CX,
  SHEEP_VIEWBOX_CY,
  SHEEP_VIEWBOX_W,
  SHEEP_WIDTH_PX,
  TILE_PATH,
  COLORS,
} from "./constants.js";

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

// ---- Reservation Table (시간 확장 예약: t, t+1, ... 미래 점유/엣지) ----
import {
  type ReservationTable,
  type CellKey,
  cellKey,
  edgeKeyAtTime,
  createReservationTable,
  getCellRes,
  getEdgeRes,
  isCellFree,
  reserveCell,
  reserveEdge,
  clearReservationsInRange,
  reserveEdgePreview,
} from "./reservationTable.js";

import {
  getContributionLevel,
  getColor,
  calculateQuartiles,
} from "./contribution.js";

import {
  emptyBfsFromGate,
  isAdjacent4,
  findPrevDifferentIdx,
  ensureOnly4Direction,
  addCornerPause,
  tracePath,
  pathBetweenCells,
  pathBetweenGrassCells,
} from "./pathUtils.js";

// ---- 윈도우 플래너 (시간 확장 BFS + 예약) ----
type PlannedWindow = {
  steps: [number, number][];
};

function planWindowed(
  self: number,
  from: [number, number],
  startTick: number,
  goal: [number, number],
  W: number,
  emptyCellSet: Set<string>,
  funnelCellSet: Set<string>,
  minFunnelRow: number,
  maxX: number,
  maxY: number,
  res: ReservationTable,
  eatingCellSet?: Set<string>,
): PlannedWindow | null {
  const inBounds = (c: number, r: number) =>
    c >= 0 && c <= maxX && r >= minFunnelRow && r <= maxY;

  const passable = (c: number, r: number) => {
    const k = cellKey(c, r);
    if (eatingCellSet?.has(k)) return false;
    return (
      emptyCellSet.has(k) ||
      funnelCellSet.has(k) ||
      (c === goal[0] && r === goal[1])
    );
  };

  const moves: [number, number][] = [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
  ];

  type Node = { c: number; r: number; t: number };
  const start: Node = { c: from[0], r: from[1], t: startTick };

  const seen = new Set<string>();
  const parent = new Map<string, string | null>();

  const key3 = (c: number, r: number, t: number) => `${c},${r},${t}`;
  const q: Node[] = [start];
  seen.add(key3(start.c, start.r, start.t));
  parent.set(key3(start.c, start.r, start.t), null);

  const targetT = startTick + W;
  let foundKey: string | null = null;

  while (q.length) {
    const cur = q.shift()!;
    if (cur.t >= targetT) continue;

    if (cur.c === goal[0] && cur.r === goal[1]) {
      foundKey = key3(cur.c, cur.r, cur.t);
      break;
    }

    for (const [dc, dr] of moves) {
      const nc = cur.c + dc;
      const nr = cur.r + dr;
      const nt = cur.t + 1;

      if (!inBounds(nc, nr)) continue;
      if (!passable(nc, nr)) continue;

      // 입구(깔때기) 셀은 다른 양 예약을 무시해 뒤쪽 양이 항상 경로를 찾을 수 있게 함
      // 단, row -1은 실제 병목 구간이므로 예약을 준수해야 충돌/정체가 줄어든다.
      const inFunnel = nr < -1; // -2 이하만 \"예약 무시\"
      const fromFunnel = cur.r < -1;
      if (!inFunnel && !isCellFree(res, nt, nc, nr, self)) continue;
      // 깔때기 안에서는 엣지 예약도 무시 (입구 정체 완화)
      if (
        !(inFunnel || fromFunnel) &&
        !reserveEdgePreview(res, cur.t, [cur.c, cur.r], [nc, nr], self)
      )
        continue;

      const k = key3(nc, nr, nt);
      if (seen.has(k)) continue;

      seen.add(k);
      parent.set(k, key3(cur.c, cur.r, cur.t));
      q.push({ c: nc, r: nr, t: nt });
    }
  }

  if (!foundKey) {
    let best: { key: string; score: number } | null = null;
    for (const k of seen) {
      const parts = k.split(",").map(Number);
      const t = parts[2];
      if (t !== targetT) continue;
      const c = parts[0];
      const r = parts[1];
      const manhattan = Math.abs(goal[0] - c) + Math.abs(goal[1] - r);
      const score = manhattan;
      if (!best || score < best.score) best = { key: k, score };
    }
    if (!best) return null;
    foundKey = best.key;
  }

  const chain: Node[] = [];
  let k: string | null = foundKey;
  while (k) {
    const parts = k.split(",").map(Number);
    chain.unshift({ c: parts[0], r: parts[1], t: parts[2] });
    k = parent.get(k) ?? null;
  }

  const steps: [number, number][] = [];
  let last: [number, number] = [
    chain[chain.length - 1].c,
    chain[chain.length - 1].r,
  ];

  const mapByTime = new Map<number, [number, number]>();
  for (const n of chain) mapByTime.set(n.t, [n.c, n.r]);

  for (let tt = startTick + 1; tt <= startTick + W; tt++) {
    const p = mapByTime.get(tt);
    if (p) last = p;
    steps.push(last);
  }

  return { steps };
}

function countFreeNeighbors(
  c: number,
  r: number,
  emptyCellSet: Set<string>,
  funnelCellSet: Set<string>,
): number {
  const dirs: [number, number][] = [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
  ];
  let n = 0;
  for (const [dc, dr] of dirs) {
    const k = cellKey(c + dc, r + dr);
    if (emptyCellSet.has(k) || funnelCellSet.has(k)) n++;
  }
  return n;
}

function findPullOverTarget(
  from: [number, number],
  emptyCellSet: Set<string>,
  funnelCellSet: Set<string>,
  minFunnelRow: number,
  maxX: number,
  maxY: number,
): [number, number] | null {
  const radius = 4;
  let best: { pos: [number, number]; score: number } | null = null;
  for (let r = from[1] - radius; r <= from[1] + radius; r++) {
    if (r < minFunnelRow || r > maxY) continue;
    for (let c = from[0] - radius; c <= from[0] + radius; c++) {
      if (c < 0 || c > maxX) continue;
      const k = cellKey(c, r);
      if (!(emptyCellSet.has(k) || funnelCellSet.has(k))) continue;
      const neigh = countFreeNeighbors(c, r, emptyCellSet, funnelCellSet);
      if (neigh < 3) continue;
      const dist = Math.abs(c - from[0]) + Math.abs(r - from[1]);
      // 그리드 쪽(아래)으로 치우쳐서 왔다갔다 줄이기: 위쪽(r < from[1])이면 페널티
      const backwardPenalty = r < from[1] ? 20 : 0;
      const score = dist + backwardPenalty;
      if (!best || score < best.score) best = { pos: [c, r], score };
    }
  }
  return best ? best.pos : null;
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
  grassEating?: Map<string, { owner: number; doneTick: number }>,
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

      if (grassEating?.has(nk)) continue;

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

  if (p1.length === 0) return [];

  const p2: [number, number][] = [[targetGrass.x, targetGrass.y]];
  const last = p1[p1.length - 1];
  if (last[0] === p2[0][0] && last[1] === p2[0][1]) return p1;
  return [...p1, ...p2];
}

// 현재 위치와 목표 잔디까지의 ETA(틱 수)를 대략 계산한다.
// - 우선: 미리 계산해 둔 targetBfsLen(게이트 기준 거리)을 사용
// - 보정: 현재 위치까지의 맨해튼 거리, 게이트·퍼널에 있으면 살짝 가중치
function estimateEtaTicks(
  from: [number, number],
  target: { grass: GridCell },
  targetBfsLen: Map<string, number>,
): number {
  const key = `${target.grass.x},${target.grass.y}`;
  const base = targetBfsLen.get(key) ?? 0;
  const dx = Math.abs(from[0] - target.grass.x);
  const dy = Math.abs(from[1] - target.grass.y);
  const manhattanFromSelf = dx + dy;

  // 퍼널/게이트 부근이면 살짝 패널티를 줘서,
  // 이미 안쪽에 들어간 양에게 조금 더 유리하게.
  const inFunnelOrGate = from[1] <= 0;
  const funnelPenalty = inFunnelOrGate ? 1 : 0;

  return base + manhattanFromSelf + funnelPenalty;
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
  // 잔디가 별로 없는 사람도 양이 너무 적게 나오지 않도록,
  // "잔디 수 / 3" 비율에 더해서, 잔디가 조금이라도 있으면 최소 몇 마리 이상은 보장한다.
  const sheepCountCap = (() => {
    const grassCount = grassCells.length;
    if (grassCount <= 0) return 0;
    // 기본 비율: 잔디 3칸당 양 1마리
    const base = Math.floor(grassCount / 3);
    // 최소 보장: 잔디가 적어도 있으면 최대 5마리까지는 잔디 칸 수만큼 허용
    const minSheepIfAnyGrass = Math.min(5, grassCount);
    return Math.min(
      40, // 양 절대 상한
      Math.max(base, minSheepIfAnyGrass),
    );
  })();
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
  let grassTargetsLeft = buildGrassTargets(leftBfs.emptyOrder, centerCol - 1);
  let grassTargetsRight = buildGrassTargets(rightBfs.emptyOrder, centerCol);
  let sheepCount = Math.min(
    sheepCountCap,
    grassTargetsLeft.length + grassTargetsRight.length,
  );

  // 게이트에서 도달 가능한 잔디가 하나도 없으면, 전체 빈 칸 기준으로라도 최소 일부 잔디를 타깃으로 잡는다.
  let isFallback = false;
  if (sheepCount === 0 && sheepCountCap > 0) {
    const allEmptyCells = grid.filter(
      (c) => (initialCountByKey.get(`${c.x},${c.y}`) ?? 0) === 0,
    );
    const allGrassTargets = buildGrassTargets(allEmptyCells, centerCol - 1);
    if (allGrassTargets.length > 0) {
      if (process.env?.NODE_ENV !== "production") {
        console.log(
          "[renderGridSvg] no reachable grass from gates; using fallback targets:",
          allGrassTargets.length,
        );
      }
      isFallback = true;
      // 오른쪽 입구 양이 아래·오른쪽 잔디를 먼저 차지하도록, 잔디를 왼쪽/오른쪽 게이트에 가까운 쪽으로 나눔
      const distToLeft = (g: GridCell) => Math.abs(g.x - (centerCol - 1)) + g.y;
      const distToRight = (g: GridCell) => Math.abs(g.x - centerCol) + g.y;
      const leftPart: typeof allGrassTargets = [];
      const rightPart: typeof allGrassTargets = [];
      for (const t of allGrassTargets) {
        if (distToLeft(t.grass) <= distToRight(t.grass)) {
          leftPart.push(t);
        } else {
          rightPart.push({ ...t, gateCol: centerCol });
        }
      }
      grassTargetsLeft = leftPart;
      grassTargetsRight = rightPart;
      sheepCount = Math.min(
        sheepCountCap,
        grassTargetsLeft.length + grassTargetsRight.length,
      );
    }
  }
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
    // 스폰은 입구 바로 위(row -1)부터: 처음 두 마리는 실제 입구 두 칸에 서 있는 상태로 시작
    if (sheepCount > 0) spawnPositions.push([gateMin, bufferRow1]);
    if (sheepCount > 1) spawnPositions.push([gateMax, bufferRow1]);

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
  // 초기 배정: 입구에 가까운 양부터, 입구에서 가까운 잔디를 순서대로 1:1 배정 (흐름이 잘 나가도록)
  const grassKey = (g: GridCell) => `${g.x},${g.y}`;
  const allTargets: TargetWithGate[] = [
    ...grassTargetsLeft,
    ...grassTargetsRight,
  ];
  const targetBfsLen = new Map<string, number>();
  for (const t of allTargets) {
    const d = isFallback
      ? Math.abs(t.grass.x - t.gateCol) + t.grass.y
      : (() => {
          const path = tracePath(
            t.emptyNeighbor.x,
            t.emptyNeighbor.y,
            t.gateCol === centerCol - 1 ? leftBfs.parent : rightBfs.parent,
          );
          return path.length + 1;
        })();
    targetBfsLen.set(grassKey(t.grass), d);
  }
  // 잔디를 입구(게이트)에서 가까운 순으로 정렬 (왼쪽/오른쪽 줄 각각)
  // 같은 거리면 "바로 아래·바로 옆" 우선: 아래(row 작을수록) → 왼쪽은 더 왼쪽, 오른쪽은 더 오른쪽
  const sortedLeftByDist = [...grassTargetsLeft].sort((a, b) => {
    const da = targetBfsLen.get(grassKey(a.grass)) ?? 0;
    const db = targetBfsLen.get(grassKey(b.grass)) ?? 0;
    if (da !== db) return da - db;
    if (a.grass.y !== b.grass.y) return a.grass.y - b.grass.y; // 아래(작은 y) 먼저
    return a.grass.x - b.grass.x; // 왼쪽(작은 x) 먼저
  });
  const sortedRightByDist = [...grassTargetsRight].sort((a, b) => {
    const da = targetBfsLen.get(grassKey(a.grass)) ?? 0;
    const db = targetBfsLen.get(grassKey(b.grass)) ?? 0;
    if (da !== db) return da - db;
    if (a.grass.y !== b.grass.y) return a.grass.y - b.grass.y; // 아래 먼저
    return b.grass.x - a.grass.x; // 오른쪽(큰 x) 먼저
  });
  // 입구 두 칸에 도착한 양부터 가까운 잔디 순으로 배정 (깔때기에서는 배정 안 함)
  const sheepTargetsWithEmpty: (TargetWithGate | undefined)[] = new Array(
    sheepCount,
  );
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

  // 시뮬레이션은 전체 양(sheepCount) 기준; 애니메이션은 배정받은 양만
  const validIndices = Array.from({ length: sheepCount }, (_, i) => i);
  const sheepTargets = validIndices.map(
    (i) => sheepTargetsWithEmpty[i]?.grass as GridCell | undefined,
  );
  // 양 이미지 크기 조정 숫자가 작을수록 크게 보임
  const sheepScale = SHEEP_WIDTH_PX / SHEEP_VIEWBOX_W / 2.5;
  // 경로는 배정 후에만 의미 있음 (애니메이션은 시뮬 종료 후 assignedIndices 기준으로 생성)
  const paths = validIndices.map((i) => {
    const t = sheepTargetsWithEmpty[i];
    if (!t) return [];
    return tracePath(
      t.emptyNeighbor.x,
      t.emptyNeighbor.y,
      t.gateCol === centerCol - 1 ? leftBfs.parent : rightBfs.parent,
    ).concat([[t.grass.x, t.grass.y]]);
  });

  const funnelPositions = funnelPositionsEarly;
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

  type EatingState = { owner: number; doneTick: number };
  const grassEating = new Map<string, EatingState>(); // grassKey -> 먹는 중(페이드 끝나면 확정)

  const reservedGrass = new Map<string, number>(); // grassKey -> sheepIndex
  const reservedBySheep: (string | null)[] = Array.from(
    { length: sheepCount },
    () => null,
  );
  const reservedAtTick: number[] = new Array(sheepCount).fill(-1);

  function releaseGrassReservation(i: number) {
    const rk = reservedBySheep[i];
    if (!rk) return;
    if (reservedGrass.get(rk) === i) reservedGrass.delete(rk);
    reservedBySheep[i] = null;
    reservedAtTick[i] = -1;
  }

  // 특정 잔디(gk)를 sheepIndex에게 넘겨주는 공통 헬퍼.
  // 이미 다른 양이 예약/이동 중이라도, 여기서 예약/목표를 해제하고 양보시키고,
  // sheepIndex가 새 주인이 되도록 만든다.
  function assignGrassToSheep(
    sheepIndex: number,
    grassKey: string,
    tick: number,
    availableKeysEarly: Set<string>,
  ) {
    const currentOwner = reservedGrass.get(grassKey);
    if (currentOwner != null && currentOwner !== sheepIndex) {
      // 기존 주인은 잔디를 양보하고 목표/경로를 다시 잡게 만든다.
      if (tick < 200) {
        console.log(
          `[gate-steal] t=${tick} grass=${grassKey} from=sheep-${currentOwner} to=sheep-${sheepIndex}`,
        );
      }
      releaseGrassReservation(currentOwner);
      const ownerState = sheepStates[currentOwner];
      ownerState.goalGrassKey = null;
      ownerState.plan = [];
    }
    if (
      reservedBySheep[sheepIndex] &&
      reservedBySheep[sheepIndex] !== grassKey
    ) {
      releaseGrassReservation(sheepIndex);
    }
    const st = sheepStates[sheepIndex];
    st.goalGrassKey = grassKey;
    st.plan = [];
    reservedGrass.set(grassKey, sheepIndex);
    reservedBySheep[sheepIndex] = grassKey;
    reservedAtTick[sheepIndex] = tick;
    availableKeysEarly.delete(grassKey);
  }

  type ApproachRes = { owner: number; tick: number; dist: number };
  const reservedApproach = new Map<string, ApproachRes>();
  const reservedApproachBySheep: (string | null)[] = Array.from(
    { length: sheepCount },
    () => null,
  );
  // 전역 idle 시간: 어떤 칸이든 제자리면 +1, 움직이면 0
  const idleTicks: number[] = new Array(sheepCount).fill(0);
  // 입구(row -1, 0)에서 제자리인 틱 수: 입구 전용 병목 감지용
  const gateIdleTicks: number[] = new Array(sheepCount).fill(0);

  const WINDOW_W = 20;

  type SheepState = {
    pos: [number, number];
    plan: [number, number][];
    goalGrassKey: string | null;
    eatUntil: number;
    stuck: number;
    eatingGrassKey: string | null;
  };

  const sheepStates: SheepState[] = funnelPositions.map((p) => ({
    pos: p,
    plan: [],
    goalGrassKey: null,
    eatUntil: -1,
    stuck: 0,
    eatingGrassKey: null,
  }));
  // 각 양이 처음 깔때기에서 어느 쪽(왼/오른쪽) 레인에 있었는지 고정 저장
  const sheepLane: ("L" | "R")[] = funnelPositions.map(([c]) =>
    c < centerCol ? "L" : "R",
  );

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

  const positionsHistory: [number, number][][] = Array.from(
    { length: sheepCount },
    () => [],
  );
  // 시뮬레이션 틱 상한: SVG 제한 때문에 중간에 멈추지 않도록 넉넉히
  const maxSteps = 12000;
  const mealsEaten: number[] = sheepTargets.map(() => 0);

  const edgeKey = (a: [number, number], b: [number, number]) =>
    `${a[0]},${a[1]}->${b[0]},${b[1]}`;

  const resTable = createReservationTable();

  // 시간 기반 안전장치: 렌더링에 너무 오래 걸리면 강제로 종료 (양이 움직이다 얼어 멈추지 않도록 여유 있게)
  const SIMULATION_TIME_LIMIT_MS = 45000;
  const simStartTime = Date.now();

  console.time("[renderGridSvg] simLoop");
  let lastTick = 0;
  for (let t = 0; t < maxSteps; t++) {
    lastTick = t;
    // 주기적으로 시간 초과 검사 (매 틱마다 하면 Date.now 호출 비용이 아까우므로 간격을 둠)
    if (t % 100 === 0) {
      const elapsed = Date.now() - simStartTime;
      if (elapsed > SIMULATION_TIME_LIMIT_MS) {
        break;
      }
    }
    let emptyDirty = false;

    // 오래된 예약 정리(메모리/충돌 방지): t-2 이하 삭제
    resTable.cell.delete(t - 2);
    resTable.edge.delete(t - 2);
    // 접근칸 예약은 한 틱만 의미가 있으므로, 매 틱 전체를 비워서 오래된 접근 예약 때문에 길이 영원히 막히는 문제 방지
    reservedApproach.clear();
    for (let i = 0; i < reservedApproachBySheep.length; i++) {
      reservedApproachBySheep[i] = null;
    }

    // 현재 점유는 매 틱 확정 예약(동일 tick)
    for (let i = 0; i < sheepStates.length; i++) {
      reserveCell(resTable, t, sheepStates[i].pos[0], sheepStates[i].pos[1], i);
    }

    // 깔때기 대기 중(row -2 이하)에는 배정 안 함. row -1 도착 시에만 가장 가까운 잔디 배정.
    // 왼쪽 입구 → 자기한테 가장 가까운 잔디(나가면 row -1 비움), 오른쪽 입구 → 자기 위치에서 가장 가까운 잔디.
    const eatingCellSetForAssign = new Set(grassEating.keys());
    const gateSheep = Array.from(
      { length: sheepStates.length },
      (_, i) => i,
    ).filter(
      (i) => sheepStates[i].pos[1] === -1 && sheepTargetsWithEmpty[i] == null,
    );
    // 왼쪽 먼저 배정 → 왼쪽 양이 가장 가까운 잔디 받고 출발하면 row -1 비움 → row -2 중앙 양들이 내려와서 배정받음
    gateSheep.sort((a, b) => {
      const [ca, cb] = [sheepStates[a].pos[0], sheepStates[b].pos[0]];
      if (ca !== cb) return ca - cb; // 왼쪽 게이트 먼저
      return a - b;
    });
    if (gateSheep.length > 0) {
      const atLeft = gateSheep.filter(
        (i) => sheepStates[i].pos[0] === gateColMin,
      );
      const atRight = gateSheep.filter(
        (i) => sheepStates[i].pos[0] === gateColMax,
      );
      const fmt = (indices: number[]) =>
        "[" + indices.map((i) => `양${i + 1}`).join(",") + "]";
      console.log(`t=${t} 입구 왼쪽: ${fmt(atLeft)}, 오른쪽: ${fmt(atRight)}`);
    }
    // 입구/바로 아래에 있는 양들의 상태 스냅샷 (초반 200틱만), 어느 쪽에서 얼마나 멈춰 있는지 확인용
    if (t < 200) {
      const gateRegion: string[] = [];
      for (let i = 0; i < sheepStates.length; i++) {
        const st = sheepStates[i];
        if (st.pos[1] === -1 || st.pos[1] === 0) {
          const side =
            st.pos[0] <= centerCol - 1
              ? "L"
              : st.pos[0] >= centerCol
                ? "R"
                : "M";
          gateRegion.push(
            `양${i + 1}@${st.pos[0]},${st.pos[1]} side=${side} stuck=${st.stuck} goal=${st.goalGrassKey}`,
          );
        }
      }
      if (gateRegion.length > 0) {
        console.log(`[gate-snapshot] t=${t} ${gateRegion.join(" | ")}`);
      }
    }
    for (const i of gateSheep) {
      const from: [number, number] = [
        sheepStates[i].pos[0],
        sheepStates[i].pos[1],
      ];
      let assigned = false;
      // 왼쪽 입구 → 자기한테 가장 가까운 잔디, 오른쪽 입구 → 자기 위치에서 가장 가까운 잔디 (각각 거리순 후보)
      const isLeftGate = from[0] === gateColMin;
      const candidatesForLane = isLeftGate
        ? [...sortedLeftByDist, ...sortedRightByDist]
        : [...sortedRightByDist, ...sortedLeftByDist];
      for (const item of candidatesForLane) {
        const gk = grassKey(item.grass);
        if (reservedGrass.has(gk)) continue;
        if (!remainingGrassKeys.has(gk)) continue;
        const goal: [number, number] = [item.grass.x, item.grass.y];
        const planned = planWindowed(
          i,
          from,
          t,
          goal,
          WINDOW_W,
          emptyCellSet,
          funnelCellSet,
          minFunnelRow,
          maxX,
          maxY,
          resTable,
          eatingCellSetForAssign,
        );
        if (planned) {
          sheepTargetsWithEmpty[i] = item;
          sheepStates[i].goalGrassKey = gk;
          reservedGrass.set(gk, i);
          reservedBySheep[i] = gk;
          reservedAtTick[i] = t;
          assigned = true;
          break;
        }
      }
      if (!assigned && t < 50) {
        console.log(
          `[gate-assign-fail] t=${t} sheep=${i} pos=${from[0]},${from[1]} lane=${
            isLeftGate ? "L" : "R"
          }`,
        );
      }
    }

    // 먹기 완료된 잔디를 실제 길(count=0)로 확정
    for (const [gk, es] of [...grassEating.entries()]) {
      if (t >= es.doneTick) {
        const cell = byKey.get(gk);
        const initial = initialCountByKey.get(gk) ?? 0;
        if (cell && initial > 0) {
          cell.count = 0;
          emptyDirty = true;
          remainingGrassKeys.delete(gk);
          reservedGrass.delete(gk);
          grassEating.delete(gk);
          if (reservedBySheep[es.owner] === gk) {
            reservedBySheep[es.owner] = null;
            reservedAtTick[es.owner] = -1;
          }
        }
      }
    }

    // 잔디 예약 TTL: 너무 오래 들고 있거나(stuck) 오래 못 먹으면 해제
    for (let i = 0; i < sheepStates.length; i++) {
      const rk = reservedBySheep[i];
      if (!rk) continue;

      const tooOld =
        reservedAtTick[i] >= 0 && t - reservedAtTick[i] > GRASS_RES_TTL;
      const tooStuck = sheepStates[i].stuck >= 6;

      if (tooOld || tooStuck) {
        reservedGrass.delete(rk);
        reservedBySheep[i] = null;
        reservedAtTick[i] = -1;
        sheepStates[i].goalGrassKey = null;
        sheepStates[i].plan = [];
      }
    }

    // 먹는 중이면 count==0 될 때까지 이동/리플랜 금지
    for (let i = 0; i < sheepStates.length; i++) {
      const st = sheepStates[i];
      if (!st.eatingGrassKey) continue;

      const cell = byKey.get(st.eatingGrassKey);
      if (cell && cell.count > 0) {
        st.plan = [];
        st.goalGrassKey = null;
        st.eatUntil = Math.max(st.eatUntil, t + 1);
      } else {
        st.eatingGrassKey = null;
        st.eatUntil = -1;
        st.goalGrassKey = null;
        st.plan = [];
      }
    }

    // 옆에 잔디가 있으면 멀리 계획 무시하고 바로 그 잔디를 먹는다
    const inBoundsTick = (c: number, r: number) =>
      c >= 0 && c <= maxX && r >= minFunnelRow && r <= maxY;
    for (let i = 0; i < sheepStates.length; i++) {
      const st = sheepStates[i];
      if (st.eatingGrassKey) continue;
      if (t < st.eatUntil) continue;
      if (mealsEaten[i] >= MAX_MEALS_PER_SHEEP) continue;

      const dirs: [number, number][] = [
        [0, 1],
        [1, 0],
        [-1, 0],
        [0, -1],
      ];
      for (const [dc, dr] of dirs) {
        const gc = st.pos[0] + dc;
        const gr = st.pos[1] + dr;
        if (!inBoundsTick(gc, gr)) continue;

        const gk = cellKey(gc, gr);
        const cell = byKey.get(gk);
        const initial = initialCountByKey.get(gk) ?? 0;
        if (!cell || initial <= 0 || cell.count <= 0) continue;

        const owner = reservedGrass.get(gk);
        if (owner != null && owner !== i) {
          const age =
            reservedAtTick[owner] >= 0 ? t - reservedAtTick[owner] : 0;
          if (age < 6) continue;
          releaseGrassReservation(owner);
          reservedGrass.delete(gk);
        }
        if (grassEating.has(gk)) continue;

        if (isCellFree(resTable, t + 1, gc, gr, i)) {
          if (reservedBySheep[i] && reservedBySheep[i] !== gk) {
            releaseGrassReservation(i);
          }
          st.goalGrassKey = gk;
          st.plan = [[gc, gr]];
          reservedGrass.set(gk, i);
          reservedBySheep[i] = gk;
          reservedAtTick[i] = t;
          break;
        }
      }
    }

    // 가는 길 재평가: 목표가 없거나 빼앗겼을 때만 새로 잡음 (매 틱 바꾸면 뭉치고 얼음)
    // 다만 입구 주변(row -1, 0)에서 오래 멈춰(stuck) 있으면, 기존 목표/예약을 버리고 다시 계산해서 얼타는 양 제거
    const availableKeysEarly = new Set(remainingGrassKeys);
    for (const k of reservedGrass.keys()) availableKeysEarly.delete(k);
    for (let i = 0; i < sheepStates.length; i++) {
      const st = sheepStates[i];
      if (st.eatingGrassKey) continue;
      if (t < st.eatUntil) continue;
      if (mealsEaten[i] >= MAX_MEALS_PER_SHEEP) continue;
      if (remainingGrassKeys.size === 0) continue;
      const nearGate = st.pos[1] === -1 || st.pos[1] === 0;
      const gateIdle = gateIdleTicks[i] >= 2;
      const globalIdle = idleTicks[i] >= 6;

      // --- 전역 idle 기반 ETA 비교 & 목표 재배정 (ETA-steal) ---
      // 1) 이 양이 2틱 이상 거의 안 움직였고(전역 idle),
      // 2) 목표가 잔디이고,
      // 3) 같은 잔디를 노리는 "아직 먹기 시작하지 않은" 다른 양이 있는데 그 양보다 ETA가 더 좋으면,
      //    그 잔디를 "뺏어 온다". (이미 먹고 있는 잔디는 절대 뺏지 않는다)
      if (idleTicks[i] >= 2 && st.goalGrassKey != null) {
        const currentKey = st.goalGrassKey;
        const owner = reservedGrass.get(currentKey);
        if (owner != null && owner !== i) {
          // 이미 누가 먹기 시작한 잔디면, 남은 양은 도중에 잔디가 사라져 보이므로 스틸 금지
          if (grassEating.has(currentKey)) {
            continue;
          }
          const ownerState = sheepStates[owner];
          if (ownerState.eatingGrassKey === currentKey) {
            continue;
          }
          const targetCell = byKey.get(currentKey);
          if (targetCell) {
            const target = { grass: targetCell };
            const etaSelf = estimateEtaTicks(st.pos, target, targetBfsLen);
            const etaOwner = estimateEtaTicks(
              ownerState.pos,
              target,
              targetBfsLen,
            );
            if (etaSelf + 1 < etaOwner) {
              // 이 양이 더 빨리 도착할 수 있으면, 목표를 뺏어온다.
              assignGrassToSheep(i, currentKey, t, availableKeysEarly);
            }
          }
        }
      }

      // 입구 근처에서 오래(2틱 이상) 멈춰 있으면, 현재 목표/예약을 버리고 다시 가장 좋은 잔디를 찾는다
      if (gateIdle) {
        if (t < 200) {
          console.log(
            `[gate-stuck] t=${t} sheep=${i} pos=${st.pos[0]},${st.pos[1]} idle=${gateIdleTicks[i]} goal=${st.goalGrassKey}`,
          );
        }
        if (reservedBySheep[i]) {
          releaseGrassReservation(i);
        }
        st.goalGrassKey = null;
        st.plan = [];
      }

      // 필드 어디서든 10틱 이상 거의 안 움직인 양은,
      // 현재 목표/예약을 비우고 전체 잔디 기준으로 다시 탐색하게 만들어 "중간에 멈춰 있는" 상태를 없앤다.
      if (!nearGate && globalIdle) {
        if (t < 200) {
          console.log(
            `[global-stuck] t=${t} sheep=${i} pos=${st.pos[0]},${st.pos[1]} idle=${idleTicks[i]} goal=${st.goalGrassKey}`,
          );
        }
        if (reservedBySheep[i]) {
          releaseGrassReservation(i);
        }
        st.goalGrassKey = null;
        st.plan = [];
      }
      if (
        st.goalGrassKey &&
        st.plan.length > 0 &&
        availableKeysEarly.has(st.goalGrassKey)
      )
        continue;
      if (st.plan.length > 0) continue;

      // 기본적으로는 availableKeysEarly를 쓰되,
      // - 입구 근처에서 2틱 이상 대기한 양(gateIdle && t<12) 이나
      // - 필드 어디서든 10틱 이상 거의 안 움직인 양(globalIdle)
      // 은 이미 다른 양이 예약한 잔디까지 포함해(remainingGrassKeys 전체) 다시 탐색하고,
      // 그 잔디의 현재 주인에게서 양보를 받아올 수 있게 한다.
      let availableForThisSheep: Set<string>;
      if ((gateIdle && t < 12) || (!nearGate && globalIdle)) {
        availableForThisSheep = new Set(remainingGrassKeys);
      } else {
        availableForThisSheep = availableKeysEarly;
      }

      const candidates = findNearestReachableGrassCandidates(
        i,
        st.pos,
        availableForThisSheep,
        emptyCellSet,
        funnelCellSet,
        minFunnelRow,
        maxX,
        maxY,
        byKey,
        new Map(),
        reservedApproach,
        1,
        grassEating,
      );
      if (candidates.length > 0) {
        const gk = `${candidates[0].grass.x},${candidates[0].grass.y}`;
        if (gk !== st.goalGrassKey) {
          assignGrassToSheep(i, gk, t, availableKeysEarly);
        }
      }
    }

    // 목표가 필요한 양
    const needPlan: number[] = [];
    for (let i = 0; i < sheepStates.length; i++) {
      if (mealsEaten[i] >= MAX_MEALS_PER_SHEEP) continue;
      const st = sheepStates[i];
      if (st.goalGrassKey == null) {
        if (st.plan.length === 0) needPlan.push(i);
        continue;
      }
      if (remainingGrassKeys.size === 0) continue;

      const onGrass = isOnGrass(st.pos, byKey);
      if (t < st.eatUntil) continue;

      const need = st.plan.length === 0 || (onGrass && st.eatUntil === -1);
      if (need) needPlan.push(i);
    }

    const occupiedNowMap = new Map<string, number>();
    for (let si = 0; si < sheepStates.length; si++) {
      occupiedNowMap.set(
        cellKey(sheepStates[si].pos[0], sheepStates[si].pos[1]),
        si,
      );
    }

    const availableKeys = new Set(remainingGrassKeys);
    for (const k of reservedGrass.keys()) availableKeys.delete(k);

    // needPlan 정렬: 배정 전(깔때기) 양은 게이트까지 거리, 배정 후는 잔디까지 거리
    const needPlanDist = new Map<number, number>();
    for (const i of needPlan) {
      const st = sheepStates[i];
      if (!st.goalGrassKey) {
        const gateCol = st.pos[0] < centerCol ? gateColMin : gateColMax;
        needPlanDist.set(i, Math.abs(st.pos[0] - gateCol) + st.pos[1] + 1);
      } else {
        const cand = findNearestReachableGrassCandidates(
          i,
          st.pos,
          availableKeys,
          emptyCellSet,
          funnelCellSet,
          minFunnelRow,
          maxX,
          maxY,
          byKey,
          occupiedNowMap,
          reservedApproach,
          1,
          grassEating,
        );
        needPlanDist.set(i, cand[0]?.dist ?? 1e9);
      }
    }
    // 깔때기 안 양을 먼저 계획해 입구 정체 완화 (row 작을수록 뒤쪽)
    // 그리드 안 양은 틱마다 계획 순서를 돌려서 한 마리만 선점하지 않게 함 (골고루 돌아다니게)
    // 추가: 입구 근처에서 2틱 이상 제자리(gateIdle>=2)였던 양은 최우선으로 다시 경로/잔디를 가져가게 함
    needPlan.sort((a, b) => {
      const inFunnelA = sheepStates[a].pos[1] < 0;
      const inFunnelB = sheepStates[b].pos[1] < 0;
      if (inFunnelA !== inFunnelB) return inFunnelA ? -1 : 1;
      const idleA = gateIdleTicks[a];
      const idleB = gateIdleTicks[b];
      const priStuckA = idleA >= 2;
      const priStuckB = idleB >= 2;
      if (priStuckA !== priStuckB) return priStuckA ? -1 : 1;
      if (priStuckA && priStuckB && idleA !== idleB) return idleB - idleA;
      const distA = needPlanDist.get(a) ?? 1e9;
      const distB = needPlanDist.get(b) ?? 1e9;
      if (distA !== distB) return distA - distB;
      return (
        ((priority[a] + t) % sheepCount) - ((priority[b] + t) % sheepCount)
      );
    });

    const eatingCellSet = new Set(grassEating.keys());

    for (const i of needPlan) {
      const st = sheepStates[i];

      clearReservationsInRange(resTable, i, t + 1, t + WINDOW_W);

      const posKey = cellKey(st.pos[0], st.pos[1]);
      const onGrassCell =
        (initialCountByKey.get(posKey) ?? 0) > 0 &&
        (byKey.get(posKey)?.count ?? 0) <= 0;
      if (onGrassCell) {
        releaseGrassReservation(i);
        st.goalGrassKey = null;
        const dirs: [number, number][] = [
          [0, 1],
          [1, 0],
          [-1, 0],
          [0, -1],
        ];
        for (const [dc, dr] of dirs) {
          const nc = st.pos[0] + dc;
          const nr = st.pos[1] + dr;
          if (!inBoundsTick(nc, nr)) continue;
          const nk = cellKey(nc, nr);
          const pass = emptyCellSet.has(nk) || funnelCellSet.has(nk);
          if (!pass) continue;
          st.plan = [[nc, nr]];
          break;
        }
        continue;
      }

      // 배정 전(깔때기) 양: 목표 = 입구 한 칸 (게이트)
      // 처음 깔때기에서 어느 쪽(왼/오른쪽)에 있었는지(sheepLane)로 레인을 고정 — 중간에 약간 치우쳐도 출발 쪽 입구로만 나감
      const gateGoal: [number, number] =
        sheepLane[i] === "L" ? [gateColMin, -1] : [gateColMax, -1];

      if (!st.goalGrassKey) {
        // 깔때기 안 → 게이트로만 이동
        const planned = planWindowed(
          i,
          st.pos,
          t,
          gateGoal,
          WINDOW_W,
          emptyCellSet,
          funnelCellSet,
          minFunnelRow,
          maxX,
          maxY,
          resTable,
          eatingCellSet,
        );
        if (planned) {
          let prev: [number, number] = st.pos;
          let ok = true;
          const reserveLimit = Math.min(
            planned.steps.length,
            RESERVE_AHEAD_LIMIT,
          );
          for (let k = 0; k < reserveLimit; k++) {
            const tt = t + 1 + k;
            const cur = planned.steps[k];
            if (cur[1] < 0) {
              prev = cur;
              continue;
            }
            if (!reserveCell(resTable, tt, cur[0], cur[1], i)) {
              ok = false;
              break;
            }
            if (!reserveEdge(resTable, tt, prev, cur, i)) {
              ok = false;
              break;
            }
            prev = cur;
          }
          if (ok) {
            st.plan = planned.steps;
            st.stuck = 0;
          } else {
            st.stuck += 1;
          }
        } else {
          st.stuck += 1;
        }
        continue;
      }

      if (!availableKeys.has(st.goalGrassKey)) {
        releaseGrassReservation(i);
        const candidates = findNearestReachableGrassCandidates(
          i,
          st.pos,
          availableKeys,
          emptyCellSet,
          funnelCellSet,
          minFunnelRow,
          maxX,
          maxY,
          byKey,
          occupiedNowMap,
          reservedApproach,
          8,
          grassEating,
        );

        if (candidates.length > 0) {
          candidates.sort((a, b) => {
            if (a.dist !== b.dist) return a.dist - b.dist;
            const ai =
              initialCountByKey.get(`${a.grass.x},${a.grass.y}`) ??
              a.grass.count;
            const bi =
              initialCountByKey.get(`${b.grass.x},${b.grass.y}`) ??
              b.grass.count;
            if (ai !== bi) return bi - ai;
            if (a.grass.y !== b.grass.y) return a.grass.y - b.grass.y;
            return a.grass.x - b.grass.x;
          });
          const chosen = candidates[0];
          const gk = `${chosen.grass.x},${chosen.grass.y}`;
          st.goalGrassKey = gk;
          availableKeys.delete(gk);
          reservedGrass.set(gk, i);
          reservedBySheep[i] = gk;
          reservedAtTick[i] = t;
        }
      }

      if (!st.goalGrassKey) {
        st.stuck += 1;
        continue;
      }

      const [gc, gr] = st.goalGrassKey.split(",").map(Number);

      let planned = planWindowed(
        i,
        st.pos,
        t,
        [gc, gr],
        WINDOW_W,
        emptyCellSet,
        funnelCellSet,
        minFunnelRow,
        maxX,
        maxY,
        resTable,
        eatingCellSet,
      );

      if (!planned) {
        st.stuck += 1;
        if (st.stuck >= 6) {
          const pull = findPullOverTarget(
            st.pos,
            emptyCellSet,
            funnelCellSet,
            minFunnelRow,
            maxX,
            maxY,
          );
          if (pull) {
            const p2 = planWindowed(
              i,
              st.pos,
              t,
              pull,
              WINDOW_W,
              emptyCellSet,
              funnelCellSet,
              minFunnelRow,
              maxX,
              maxY,
              resTable,
              eatingCellSet,
            );
            if (p2) {
              let prev: [number, number] = st.pos;
              let ok = true;
              const limit = Math.min(p2.steps.length, RESERVE_AHEAD_LIMIT);
              for (let k = 0; k < limit; k++) {
                const tt = t + 1 + k;
                const cur = p2.steps[k];
                if (cur[1] < 0) {
                  prev = cur;
                  continue;
                }
                if (!reserveCell(resTable, tt, cur[0], cur[1], i)) {
                  ok = false;
                  break;
                }
                if (!reserveEdge(resTable, tt, prev, cur, i)) {
                  ok = false;
                  break;
                }
                prev = cur;
              }
              if (ok) {
                releaseGrassReservation(i);
                st.plan = p2.steps;
                st.goalGrassKey = null;
                st.stuck = 0;
              }
            }
          }
        }
        continue;
      }

      let prev: [number, number] = st.pos;
      let ok = true;
      const reserveLimit = Math.min(planned.steps.length, RESERVE_AHEAD_LIMIT);
      for (let k = 0; k < reserveLimit; k++) {
        const tt = t + 1 + k;
        const cur = planned.steps[k];
        if (cur[1] < 0) {
          prev = cur;
          continue;
        }
        if (!reserveCell(resTable, tt, cur[0], cur[1], i)) {
          ok = false;
          break;
        }
        if (!reserveEdge(resTable, tt, prev, cur, i)) {
          ok = false;
          break;
        }
        prev = cur;
      }
      if (!ok) {
        st.stuck += 1;
        continue;
      }

      st.plan = planned.steps;
      st.stuck = 0;
    }

    // 목표 잔디 바로 옆이면, 마지막 한 칸(잔디 진입)을 강제해서 지나침 방지
    for (let i = 0; i < sheepStates.length; i++) {
      const st = sheepStates[i];
      if (t < st.eatUntil) continue;
      if (!st.goalGrassKey) continue;

      const [gc, gr] = st.goalGrassKey.split(",").map(Number);
      const here: [number, number] = st.pos;

      if (Math.abs(here[0] - gc) + Math.abs(here[1] - gr) === 1) {
        if (
          isCellFree(resTable, t + 1, gc, gr, i) &&
          reserveCell(resTable, t + 1, gc, gr, i)
        ) {
          reserveEdge(resTable, t + 1, here, [gc, gr], i);
          st.plan = [[gc, gr], ...st.plan];
        }
      }
    }

    // ---- 실행 단계 (1틱) ----
    // 이동 순서를 틱마다 돌려서 한 마리만 항상 먼저 가지 않게 함 (골고루 움직이게)
    const order = Array.from({ length: sheepStates.length }, (_, i) => i).sort(
      (a, b) =>
        ((priority[a] + t) % sheepCount) - ((priority[b] + t) % sheepCount),
    );

    getCellRes(resTable, t + 1);
    getEdgeRes(resTable, t + 1);

    const occupiedThisTick = new Set<string>();
    for (let idx = 0; idx < sheepStates.length; idx++) {
      const p = sheepStates[idx].pos;
      occupiedThisTick.add(cellKey(p[0], p[1]));
    }

    for (const i of order) {
      const st = sheepStates[i];

      if (t < st.eatUntil) {
        reserveCell(resTable, t + 1, st.pos[0], st.pos[1], i);
        positionsHistory[i].push(st.pos);
        continue;
      }

      const intended = st.plan.length > 0 ? st.plan[0] : st.pos;
      const from: [number, number] = st.pos;
      let to: [number, number] = intended;

      // 입구(row -1) 또는 바로 아래(row 0)에 서 있는데 안 움직이면 → 아래 칸이 비어 있을 때 강제로 한 칸 내려가서 길 터기
      if (
        (from[1] === -1 || from[1] === 0) &&
        from[1] < maxY &&
        to[0] === from[0] &&
        to[1] === from[1]
      ) {
        if (t < 200 && gateIdleTicks[i] >= 2) {
          console.log(
            `[gate-blocked] t=${t} sheep=${i} pos=${from[0]},${from[1]} idle=${gateIdleTicks[i]} goal=${st.goalGrassKey}`,
          );
        }
        const belowKey = cellKey(from[0], from[1] + 1);
        if (
          !occupiedThisTick.has(belowKey) &&
          isCellFree(resTable, t + 1, from[0], from[1] + 1, i)
        ) {
          to = [from[0], from[1] + 1];
        }
      }

      const toKey = cellKey(to[0], to[1]);
      const fromKey = cellKey(from[0], from[1]);
      let blockedByEating = false;
      for (let j = 0; j < sheepStates.length; j++) {
        if (j === i) continue;
        if (sheepStates[j].eatingGrassKey === toKey) {
          blockedByEating = true;
          break;
        }
      }
      const cellTakenByOther =
        (to[0] !== from[0] || to[1] !== from[1]) && occupiedThisTick.has(toKey);
      if (blockedByEating || cellTakenByOther) {
        to = from;
      }

      // 최종 결정된 to를 기준으로 idle / gateIdle 계산
      const stayedFinal = to[0] === from[0] && to[1] === from[1];

      // 전역 idle 카운터: 최종적으로 한 틱이라도 안 움직였으면 +1, 움직였으면 0
      if (stayedFinal) {
        idleTicks[i] += 1;
      } else {
        idleTicks[i] = 0;
      }

      // 입구(row -1, 0)에서 최종적으로 제자리면 gateIdleTicks++, 아니면 0으로 리셋
      const inGateRegion = from[1] === -1 || from[1] === 0;
      if (inGateRegion && stayedFinal) {
        gateIdleTicks[i] += 1;
      } else {
        gateIdleTicks[i] = 0;
      }

      let moved = false;

      if (to[0] !== from[0] || to[1] !== from[1]) {
        const okCell = reserveCell(resTable, t + 1, to[0], to[1], i);
        const okEdge = okCell && reserveEdge(resTable, t + 1, from, to, i);

        if (okCell && okEdge) {
          moved = true;
          occupiedThisTick.delete(fromKey);
          st.pos = to;
          occupiedThisTick.add(toKey);
          st.plan = st.plan.slice(1);
          st.stuck = 0;
        } else {
          reserveCell(resTable, t + 1, from[0], from[1], i);
          st.stuck += 1;
          // 2틱 이상 막히면 계획 비우기 → 다음 틱에 재계획해 다른 경로 시도
          if (st.stuck >= 2) st.plan = [];
          to = from;
        }
      } else {
        reserveCell(resTable, t + 1, from[0], from[1], i);
      }

      positionsHistory[i].push(st.pos);

      const k = cellKey(st.pos[0], st.pos[1]);
      const cell = byKey.get(k);
      const initialCount = initialCountByKey.get(k) ?? 0;

      if (cell && initialCount > 0 && cell.count > 0) {
        const gk = k;
        const es = grassEating.get(gk);
        if (!es) {
          // 잔디 페이드가 끝난 것을 "확인"한 뒤 한 틱 더 머물게 하기 위해
          // waitTicks 보다 1틱 더 여유를 둔다.
          grassEating.set(gk, { owner: i, doneTick: t + waitTicks + 1 });
          mealsEaten[i]++;
          st.eatingGrassKey = gk;
          st.eatUntil = t + waitTicks;
          st.goalGrassKey = null;
          st.plan = [];
        }
      }

      if (st.eatUntil !== -1 && t >= st.eatUntil) st.eatUntil = -1;
    }

    if (emptyDirty) {
      emptyCellSet = recomputeReachableEmptyFromGates();
      refreshReachableGrassKeys(emptyCellSet, remainingGrassKeys);
    }

    if (remainingGrassKeys.size === 0) break;
    // 모든 양이 식사 상한에 도달하면 조기 종료 (불필요한 틱 방지)
    if (mealsEaten.every((m) => m >= MAX_MEALS_PER_SHEEP)) break;
  }
  console.timeEnd("[renderGridSvg] simLoop");
  if (process.env?.NODE_ENV !== "production") {
    console.log(
      "[renderGridSvg] simLoop finished at tick",
      lastTick,
      "remainingGrassKeys=",
      remainingGrassKeys.size,
    );
  }

  // 양들끼리 같은 칸을 공유하는지 검사 (블로킹이 제대로 되었는지)
  const collisionLog: { tick: number; cell: string; sheep: number[] }[] = [];
  if (positionsHistory.length > 0) {
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
  }
  if (collisionLog.length > 0 && process.env?.NODE_ENV !== "production") {
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

  // 양 애니메이션과 같은 길이로 루프 맞춤 (잔디도 루프 시 0%에서 다시 초록)
  const maxTotalTime =
    positionsHistory.length === 0
      ? 1
      : Math.max(
          1,
          ...positionsHistory.map((timeline) => {
            if (!timeline || timeline.length <= 1) return 0;
            return (timeline.length - 1) * SHEEP_CELL_TIME;
          }),
        );

  const grassLoopKeyframes: string[] = [];
  const rects = grid
    .map((cell, cellIndex) => {
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
        const p1 = (first.arrivalTime / maxTotalTime) * 100;
        const p2 =
          ((first.arrivalTime + GRASS_FADE_DURATION) / maxTotalTime) * 100;
        const kfName = `grass-loop-${cellIndex}`;
        grassLoopKeyframes.push(`
  @keyframes ${kfName} {
    0% { fill: ${fill}; }
    ${p1}% { fill: ${fill}; }
    ${p2}% { fill: ${COLORS.LEVEL_0}; }
    100% { fill: ${COLORS.LEVEL_0}; }
  }`);
        const anim = `animation: ${kfName} ${maxTotalTime}s linear 0s infinite`;
        return `<rect x="${px}" y="${py}" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="${fill}" rx="${BORDER_RADIUS}" style="${anim}"/>`;
      }
      const color = getColor(level);
      return `<rect x="${px}" y="${py}" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="${color}" rx="${BORDER_RADIUS}"/>`;
    })
    .join("\n  ");

  const grassFadeKeyframes = grassLoopKeyframes.join("");

  const CORNER_PAUSE = 0.18;

  const assignedIndices = Array.from(
    { length: sheepCount },
    (_, i) => i,
  ).filter((i) => sheepTargetsWithEmpty[i] != null);
  const sheepAnimations = assignedIndices.map((si: number) => {
    const timeline = positionsHistory[si];
    const totalPoints = timeline.length;
    const totalMoves = Math.max(totalPoints - 1, 1);
    const totalTime = totalMoves * SHEEP_CELL_TIME;

    const frames: {
      t: number;
      x: number;
      y: number;
      angle: number;
    }[] = [];
    let lastAngle = 180;
    let time = 0;

    const angleOf = (dx: number, dy: number, fallback: number) => {
      if (dx > 0) return 90;
      if (dx < 0) return 270;
      if (dy > 0) return 180;
      if (dy < 0) return 0;
      return fallback;
    };

    {
      const cur = timeline[0];
      frames.push({ t: 0, x: cur[0], y: cur[1], angle: lastAngle });
    }

    for (let idx = 0; idx < totalMoves; idx++) {
      const cur = timeline[idx];
      const next = timeline[idx + 1];

      const dx = next[0] - cur[0];
      const dy = next[1] - cur[1];

      const nextAngle = angleOf(dx, dy, lastAngle);
      const dirChanged = nextAngle !== lastAngle;
      const tickEnd = time + SHEEP_CELL_TIME;

      if (dx === 0 && dy === 0) {
        frames.push({
          t: tickEnd,
          x: cur[0],
          y: cur[1],
          angle: lastAngle,
        });
        time = tickEnd;
        continue;
      }

      if (dirChanged) {
        const rotateTime = time + SHEEP_CELL_TIME * CORNER_PAUSE;
        frames.push({
          t: rotateTime,
          x: cur[0],
          y: cur[1],
          angle: nextAngle,
        });
        frames.push({
          t: tickEnd,
          x: next[0],
          y: next[1],
          angle: nextAngle,
        });
      } else {
        frames.push({
          t: tickEnd,
          x: next[0],
          y: next[1],
          angle: nextAngle,
        });
      }

      lastAngle = nextAngle;
      time = tickEnd;
    }

    const totalFrames = frames.length;
    const totalSegments = Math.max(totalFrames - 1, 1);

    const keyframeEntries: string[] = [];
    for (let fi = 0; fi < totalFrames; fi++) {
      const f = frames[fi];
      const { x, y } = getCellCenterPx(gridLeftX, gridTopY, f.x, f.y);
      const percent = maxTotalTime > 0 ? (f.t * 100) / maxTotalTime : 0;
      const pct = percent.toFixed(4);
      keyframeEntries.push(
        `${pct}% { transform: translate(${x}px, ${y}px) rotate(${f.angle}deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); }`,
      );
    }

    const [qCol, qRow] = funnelPositionsEarly[si];
    const queuePosPx = getCellCenterPx(gridLeftX, gridTopY, qCol, qRow);
    const initialTransform = `transform: translate(${queuePosPx.x}px, ${queuePosPx.y}px) rotate(180deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); `;

    return {
      id: `sheep-${si}`,
      keyframes: `@keyframes sheep-${si}-move {\n    ${keyframeEntries.join(
        "\n    ",
      )}\n  }`,
      animationCSS: `${initialTransform}animation: sheep-${si}-move ${maxTotalTime}s linear 0s infinite;`,
    };
  });

  const animationStyles = sheepAnimations
    .map((a: { keyframes: string }) => a.keyframes)
    .join("\n  ");

  let sheepGroups: string;
  if (sheepAnimations.length > 0) {
    sheepGroups = sheepAnimations
      .map(
        (a: { id: string; animationCSS: string }) =>
          `<g class="${a.id}" style="${a.animationCSS}">${SHEEP_CONTENT}</g>`,
      )
      .join("\n  ");
  } else {
    // 시뮬레이션 결과 양이 한 마리도 없으면, 입구 위에 최소 1마리는 보여주자 (정적 양)
    const fallbackCol = centerCol;
    const fallbackRow = -1; // 입구 바로 위 대기 칸
    const pos = getCellCenterPx(gridLeftX, gridTopY, fallbackCol, fallbackRow);
    const sheepScale = SHEEP_WIDTH_PX / SHEEP_VIEWBOX_W / 2.5;
    const transform = `translate(${pos.x}px, ${pos.y}px) rotate(180deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px)`;
    sheepGroups = `<g class="sheep-fallback" transform="${transform}">${SHEEP_CONTENT}</g>`;
  }

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
