import type { GridCell } from "../grid/mapGrid.js";
import {
  type ReservationTable,
  cellKey,
  isCellFree,
  reserveCell,
  reserveEdge,
  reserveEdgePreview,
} from "./reservationTable.js";
import {
  emptyBfsFromSeeds,
  isAdjacent4,
  findPrevDifferentIdx,
  ensureOnly4Direction,
  addCornerPause,
  tracePath,
  pathBetweenCells,
  pathBetweenGrassCells,
} from "./pathUtils.js";

export type PlannedWindow = {
  steps: [number, number][];
};

export function planWindowed(
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

export function findPullOverTarget(
  from: [number, number],
  emptyCellSet: Set<string>,
  funnelCellSet: Set<string>,
  minFunnelRow: number,
  maxX: number,
  maxY: number,
  goal?: [number, number],
): [number, number] | null {
  const radius = 6;
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
      // 목표 방향: 비켜선 칸이 목표에서 더 멀어지면 페널티 (목표 쪽으로 가깝게 비켜서기)
      let goalPenalty = 0;
      if (goal) {
        const distFromToGoal =
          Math.abs(from[0] - goal[0]) + Math.abs(from[1] - goal[1]);
        const distCellToGoal = Math.abs(c - goal[0]) + Math.abs(r - goal[1]);
        if (distCellToGoal > distFromToGoal) goalPenalty = 8;
      }
      const score = dist + backwardPenalty + goalPenalty;
      if (!best || score < best.score) best = { pos: [c, r], score };
    }
  }
  return best ? best.pos : null;
}

/**
 * 현재 칸이 잔디(count>0)인지
 */
export function isOnGrass(
  pos: [number, number],
  byKey: Map<string, GridCell>,
): boolean {
  const cell = byKey.get(`${pos[0]},${pos[1]}`);
  return !!cell && cell.count > 0;
}

/**
 * route에서 idx 위치가 같은 칸이 연속으로 waitTicks+1 이상인지 (도착칸 포함 + 대기)
 */
export function hasWaitedEnough(
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
export function findNearestReachableGrassCandidates(
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
 * 후보 중 거리(가까울수록 좋음), 풍부함(initialCount 클수록 좋음), 경쟁(다른 양이 가는 잔디는 패널티)으로 최선 선택.
 * score = dist * 2 - rich * RICHNESS_WEIGHT + (다른 양이 예약 중이면 RESERVED_BY_OTHER_PENALTY) → 낮을수록 좋음.
 */
const RESERVED_BY_OTHER_PENALTY = 6;
const RICHNESS_WEIGHT = 1.5;

export function pickBestGrassCandidate(
  candidates: GrassCandidate[],
  initialCountByKey: Map<string, number>,
  reservedGrass?: Map<string, number>,
  selfIndex: number = -1,
): GrassCandidate | null {
  if (candidates.length === 0) return null;
  const scored = candidates.map((c) => {
    const gk = `${c.grass.x},${c.grass.y}`;
    const rich = initialCountByKey.get(gk) ?? c.grass.count;
    let score = c.dist * 2 - rich * RICHNESS_WEIGHT;
    if (reservedGrass != null && selfIndex >= 0) {
      const owner = reservedGrass.get(gk);
      if (owner != null && owner !== selfIndex)
        score += RESERVED_BY_OTHER_PENALTY;
    }
    return { c, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0].c;
}

/**
 * 단일 최근접 잔디 (기존 호환용). 후보가 있으면 첫 번째 반환.
 */
export function findNearestReachableGrassFrom(
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
export function buildPathFromToGrass(
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
export function estimateEtaTicks(
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
 * GitHub contribution 그리드와 동일한 스펙의 SVG 문자열 생성.
 */
