import type { GridCell } from "../grid/mapGrid.js";
import {
  CELL_SIZE,
  GAP,
  BACKGROUND_COLOR,
  FENCE_TILE,
  FENCE_MARGIN,
  SHEEP_CELL_TIME,
  UFO_ENTRY_S,
  UFO_EXIT_S,
  LIGHT_FADE_OUT_S,
  UFO_CELL_TIME,
  UFO_MOVE_MIN_S,
  UFO_MOVE_MAX_S,
} from "./constants.js";
import { getCellCenterPx, buildFencePieces } from "./gridLayout.js";
import { emptyBfsFromSeeds, pathBetweenCells } from "./pathUtils.js";
import { calculateQuartiles } from "./contribution.js";
import { buildPathFromToGrass } from "./simHelpers.js";
import {
  buildGrassLayer,
  buildUfoLayer,
  buildSheepLayer,
} from "./anim/keyframes.js";
import { simulateGrid, type SheepState } from "./sim/simulate.js";
import { composeSvg } from "./render/composeSvg.js";

/** 디버그용: 지정한 칸 중앙에 점 찍기. 0-based. 빈 배열 []이면 점 없음 */
const CELL_DOTS: [col: number, row: number][] = [];

// ---- renderGridSvg (메인) ----
export function renderGridSvg(grid: GridCell[]): string {
  if (grid.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"/>`;
  }

  // ----- Section 2: 그리드 크기·레이아웃 -----
  const maxX = Math.max(...grid.map((c) => c.x));
  const maxY = Math.max(...grid.map((c) => c.y));
  const gridWidth = (maxX + 1) * (CELL_SIZE + GAP);
  const gridHeight = (maxY + 1) * (CELL_SIZE + GAP);
  const gridLeftX = FENCE_MARGIN;
  const gridTopY = FENCE_MARGIN;
  const gridRightX = gridLeftX + gridWidth;
  const gridBottomY = gridTopY + gridHeight;
  const fenceRightX = gridRightX;
  const fenceBottomY = gridBottomY;
  const totalWidth = fenceRightX + FENCE_TILE;
  const baseHeight = fenceBottomY + FENCE_TILE;
  const centerCol = Math.floor(maxX / 2);

  // ----- Section 3: UFO 드롭 준비 (빈칸 BFS, 스폰 위치, 경로, 목표 잔디) -----
  const byKey = new Map<string, GridCell>();
  for (const c of grid) byKey.set(`${c.x},${c.y}`, c);
  const initialCountByKey = new Map<string, number>();
  for (const c of grid) initialCountByKey.set(`${c.x},${c.y}`, c.count);
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

  /** 잔디와 인접한 빈칸을 시드로 BFS → 연결된 빈칸. 매 틱 갱신용 (UFO 드롭 모드) */
  function recomputeReachableEmptyFromSeeds(): Set<string> {
    const seeds: [number, number][] = [];
    for (let r = 0; r <= maxY; r++) {
      for (let c = 0; c <= maxX; c++) {
        const cell = byKey.get(keyOf(c, r));
        if (!cell || cell.count !== 0) continue;
        for (const [dc, dr] of dirs4) {
          const nc = c + dc;
          const nr = r + dr;
          if (!inBounds(nc, nr)) continue;
          const neighbor = byKey.get(keyOf(nc, nr));
          if (neighbor && neighbor.count > 0) {
            seeds.push([c, r]);
            break;
          }
        }
      }
    }
    if (seeds.length === 0) {
      for (const c of grid) {
        if (c.count === 0) seeds.push([c.x, c.y]);
      }
    }
    const { emptyOrder } = emptyBfsFromSeeds(grid, maxX, maxY, seeds);
    const out = new Set<string>();
    for (const cell of emptyOrder) out.add(keyOf(cell.x, cell.y));
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
  // 시드: 잔디와 인접한 빈칸 → BFS로 연결된 빈칸 전체
  const seeds: [number, number][] = [];
  for (let r = 0; r <= maxY; r++) {
    for (let c = 0; c <= maxX; c++) {
      const cell = byKey.get(keyOf(c, r));
      if (!cell || cell.count !== 0) continue;
      for (const [dc, dr] of dirs4) {
        const nc = c + dc;
        const nr = r + dr;
        if (!inBounds(nc, nr)) continue;
        const neighbor = byKey.get(keyOf(nc, nr));
        if (neighbor && neighbor.count > 0) {
          seeds.push([c, r]);
          break;
        }
      }
    }
  }
  const fallbackSeeds =
    seeds.length > 0
      ? seeds
      : grid
          .filter((c) => c.count === 0)
          .map((c) => [c.x, c.y] as [number, number]);
  const { emptyOrder: emptyOrderBfs } = emptyBfsFromSeeds(
    grid,
    maxX,
    maxY,
    fallbackSeeds,
  );
  const allGrassTargets = buildGrassTargets(emptyOrderBfs, centerCol);
  let sheepCount = Math.min(
    sheepCountCap,
    emptyOrderBfs.length,
    allGrassTargets.length,
  );
  if (sheepCount === 0 && sheepCountCap > 0 && allGrassTargets.length > 0) {
    sheepCount = Math.min(sheepCountCap, allGrassTargets.length);
  }

  // UFO 드롭: 잔디 근처(빈칸 이웃)로 이동해 양을 내림 (1→빛→양→2→빛→양→…)
  const minFunnelRow = 0;
  // sheepTargets not defined yet - we need to assign first. So we need to build sheepTargetsWithEmpty and sheepTargets here.
  type TargetWithGate = {
    grass: GridCell;
    emptyNeighbor: GridCell;
    gateCol: number;
  };
  const grassKey = (g: GridCell) => `${g.x},${g.y}`;
  const allTargets: TargetWithGate[] = allGrassTargets;
  const targetBfsLen = new Map<string, number>();
  for (const t of allTargets) {
    targetBfsLen.set(grassKey(t.grass), 0);
  }
  const emptyCellSetEarly = new Set<string>(
    emptyOrderBfs.map((c) => keyOf(c.x, c.y)),
  );
  // 드롭 빈칸(emptyNeighbor)이 겹치지 않도록 한 양당 서로 다른 빈칸 배정
  const usedEmptyKeys = new Set<string>();
  const sheepTargetsWithEmpty: (TargetWithGate | undefined)[] = [];
  for (let i = 0; i < sheepCount; i++) {
    const preferred = allTargets.find(
      (t) => !usedEmptyKeys.has(keyOf(t.emptyNeighbor.x, t.emptyNeighbor.y)),
    );
    const fallback = allTargets[i];
    const t = preferred ?? fallback;
    if (t) {
      usedEmptyKeys.add(keyOf(t.emptyNeighbor.x, t.emptyNeighbor.y));
      sheepTargetsWithEmpty.push(t);
    } else {
      sheepTargetsWithEmpty.push(undefined);
    }
  }
  const funnelPositionsEarly: [number, number][] = sheepTargetsWithEmpty.map(
    (t) => (t ? [t.emptyNeighbor.x, t.emptyNeighbor.y] : [0, 0]),
  );
  const totalHeight = baseHeight;

  // Calculate quartiles for level determination
  const allCounts = grid.map((c) => c.count);
  const quartiles = calculateQuartiles(allCounts);
  // rects는 타임라인 루프 이후, 양별 도착 시각을 알 수 있을 때 생성 (잔디 페이드 애니메이션 적용)

  // ----- Section: 울타리 SVG (gridLayout에서 생성) -----
  const fenceRects = buildFencePieces({ fenceRightX, fenceBottomY });

  // 시뮬레이션은 전체 양(sheepCount) 기준; 애니메이션은 배정받은 양만
  const validIndices = Array.from({ length: sheepCount }, (_, i) => i);
  const sheepTargets = validIndices.map(
    (i) => sheepTargetsWithEmpty[i]?.grass as GridCell | undefined,
  );
  // 양 이미지 크기 조정 숫자가 작을수록 크게 보임
  // 경로: 스폰 위치 → 첫 잔디 (UFO 드롭 모드, 깔때기 없음)
  const paths = validIndices.map((i) => {
    const t = sheepTargetsWithEmpty[i];
    if (!t) return [];
    const from: [number, number] = funnelPositionsEarly[i];
    const p = buildPathFromToGrass(
      from,
      [t.emptyNeighbor.x, t.emptyNeighbor.y],
      t.grass,
      emptyCellSetEarly,
      maxX,
      maxY,
    );
    return p.length > 0
      ? p
      : [
          [t.emptyNeighbor.x, t.emptyNeighbor.y],
          [t.grass.x, t.grass.y],
        ];
  });

  const funnelPositions = funnelPositionsEarly;

  const funnelCellSet = new Set<string>();
  let emptyCellSet = recomputeReachableEmptyFromSeeds();

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
  for (let i = 0; i < sheepCount; i++) {
    const t = sheepTargetsWithEmpty[i];
    if (t) {
      const gk = grassKey(t.grass);
      reservedGrass.set(gk, i);
      reservedBySheep[i] = gk;
      reservedAtTick[i] = 0;
    }
  }

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
  const sheepStates: SheepState[] = funnelPositions.map((p) => ({
    pos: p,
    plan: [],
    goalGrassKey: null,
    eatUntil: -1,
    stuck: 0,
    eatingGrassKey: null,
  }));
  // UFO 드롭: 스폰 시점에 이미 배정된 첫 잔디·경로로 초기화. 양은 빈칸(emptyNeighbor)에 내려서 그다음 잔디로 이동.
  for (let i = 0; i < sheepCount; i++) {
    const t = sheepTargetsWithEmpty[i];
    if (t && paths[i].length > 0) {
      const path = paths[i];
      // 경로: [emptyNeighbor, ..., grass] 형태. 시작 위치 = 빈칸(드롭 위치), plan = 그 다음부터
      const dropPos = path[0];
      sheepStates[i].pos = [dropPos[0], dropPos[1]];
      sheepStates[i].goalGrassKey = grassKey(t.grass);
      sheepStates[i].plan = path.slice(1) as [number, number][];
    }
  }

  // UFO 한 마리씩 드롭: 양 i는 spawnTick[i] 틱에 등장 (충돌 방지 위해 간격 확보)
  const DROP_TICKS = 16;
  const spawnTick: number[] = Array.from(
    { length: sheepCount },
    (_, i) => i * DROP_TICKS,
  );
  // UFO 드롭 타이밍: 빛 빠르게 → 양 내려옴 → 대기 → 함께 출발
  const LIGHT_RAMP_S = 0.12;
  const SHEEP_FADE_S = 2.0;
  const DROP_STAY_S = 1.2;
  const MOVE_START_S = Math.max(DROP_STAY_S, LIGHT_RAMP_S + SHEEP_FADE_S);
  const DROP_DESCENT_PX = 0;
  // 시뮬레이션 틱 상한: SVG 제한 때문에 중간에 멈추지 않도록 넉넉히
  const maxSteps = 24000;

  // ----- Section 5+6: 시뮬레이션 (루프 + 도착 시각/전체 길이) -----
  const { positionsHistory, targetCellArrivals, maxTotalTime } = simulateGrid({
    grid,
    byKey,
    initialCountByKey,
    quartiles,
    emptyCellSet,
    remainingGrassKeys,
    sheepStates,
    sheepCount,
    spawnTick,
    maxSteps,
    dropStayS: DROP_STAY_S,
    minFunnelRow,
    maxX,
    maxY,
    targetBfsLen,
  });

  const moveStartAbsS = Array.from({ length: sheepCount }, (_, i) => {
    const timeline = positionsHistory[i];
    if (!timeline || timeline.length === 0) {
      return spawnTick[i] * SHEEP_CELL_TIME + MOVE_START_S;
    }
    const [sx, sy] = timeline[0];
    let firstMoveIdx = -1;
    for (let t = 1; t < timeline.length; t++) {
      const [x, y] = timeline[t];
      if (x !== sx || y !== sy) {
        firstMoveIdx = t;
        break;
      }
    }
    const extra =
      firstMoveIdx < 0
        ? (timeline.length - 1) * SHEEP_CELL_TIME
        : (firstMoveIdx - 1) * SHEEP_CELL_TIME;
    return spawnTick[i] * SHEEP_CELL_TIME + MOVE_START_S + extra;
  });

  const simSpawnAbsS = spawnTick.map((t) => t * SHEEP_CELL_TIME);
  const visualSpawnAbsS: number[] = new Array(sheepCount).fill(0);
  const readyAbsS: number[] = new Array(sheepCount).fill(0);
  const visualMoveStartAbsS: number[] = new Array(sheepCount).fill(0);
  const sheepFirstGrassArrivalS: number[] = new Array(sheepCount).fill(
    Infinity,
  );
  const ufoLeaveAbsS: number[] = new Array(sheepCount).fill(0);

  for (let i = 0; i < sheepCount; i++) {
    const prevLeave = i === 0 ? 0 : ufoLeaveAbsS[i - 1];
    let minSpawn = prevLeave;
    if (i >= 1 && funnelPositionsEarly[i] && funnelPositionsEarly[i - 1]) {
      const distCells =
        Math.abs(funnelPositionsEarly[i][0] - funnelPositionsEarly[i - 1][0]) +
        Math.abs(funnelPositionsEarly[i][1] - funnelPositionsEarly[i - 1][1]);
      const travelS = Math.min(
        UFO_MOVE_MAX_S,
        Math.max(UFO_MOVE_MIN_S, distCells * UFO_CELL_TIME),
      );
      minSpawn = prevLeave + travelS;
    }
    visualSpawnAbsS[i] = Math.max(simSpawnAbsS[i] ?? 0, minSpawn);

    readyAbsS[i] = visualSpawnAbsS[i] + (LIGHT_RAMP_S + SHEEP_FADE_S);

    const simOffset = (moveStartAbsS[i] ?? 0) - (simSpawnAbsS[i] ?? 0);
    visualMoveStartAbsS[i] = Math.max(
      readyAbsS[i],
      visualSpawnAbsS[i] + Math.max(0, simOffset),
    );

    const timeline = positionsHistory[i];
    if (timeline?.length) {
      for (let idx = 0; idx < timeline.length; idx++) {
        const [c, r] = timeline[idx];
        const key = `${c},${r}`;
        if ((initialCountByKey.get(key) ?? 0) > 0) {
          sheepFirstGrassArrivalS[i] =
            (visualSpawnAbsS[i] ?? 0) + idx * SHEEP_CELL_TIME;
          break;
        }
      }
    }

    const lightOffDone = (visualMoveStartAbsS[i] ?? 0) + LIGHT_FADE_OUT_S;
    ufoLeaveAbsS[i] = Math.max(
      lightOffDone,
      sheepFirstGrassArrivalS[i] === Infinity
        ? lightOffDone
        : sheepFirstGrassArrivalS[i],
    );
  }

  // ---- ACTIVE SHEEP: 실제로 화면에 존재하는 양만 회수 대상으로 잡는다 ----
  const activeSheepIndices = Array.from(
    { length: sheepCount },
    (_, i) => i,
  ).filter((i) => (positionsHistory[i]?.length ?? 0) > 0);

  const pickupArriveBySheep: (number | null)[] = Array.from(
    { length: sheepCount },
    () => null,
  );

  const pickupCells: [number, number][] = activeSheepIndices.map((i) => {
    const tl = positionsHistory[i]!;
    const last = tl[tl.length - 1];
    return [last[0], last[1]];
  });

  const sheepEndAbsSActive = activeSheepIndices.map((i) => {
    const tl = positionsHistory[i]!;
    return spawnTick[i] * SHEEP_CELL_TIME + (tl.length - 1) * SHEEP_CELL_TIME;
  });

  // --- [PICKUP PHASE] 추가: 모든 양이 멈춘 뒤 UFO가 회수하고 나간다 ---
  const DROP_WAIT_S = 0.6; // 도착 후 기다렸다가 드롭
  const PICKUP_WAIT_S = 0.35; // 회수 위치 도착 후 잠깐 대기
  const PICKUP_LIGHT_S = 0.22; // 회수 빛 켜지는 시간(짧게)
  const PICKUP_FADE_S = 0.25; // 양 사라지는 시간

  const ufoArriveAbsS: number[] = visualSpawnAbsS.slice();
  for (let i = 0; i < sheepCount; i++) {
    visualSpawnAbsS[i] = ufoArriveAbsS[i] + DROP_WAIT_S;
    readyAbsS[i] = visualSpawnAbsS[i] + (LIGHT_RAMP_S + SHEEP_FADE_S);

    const simOffset = (moveStartAbsS[i] ?? 0) - (simSpawnAbsS[i] ?? 0);
    visualMoveStartAbsS[i] = Math.max(
      readyAbsS[i],
      visualSpawnAbsS[i] + Math.max(0, simOffset),
    );

    const timeline = positionsHistory[i];
    if (timeline?.length) {
      for (let idx = 0; idx < timeline.length; idx++) {
        const [c, r] = timeline[idx];
        const key = `${c},${r}`;
        if ((initialCountByKey.get(key) ?? 0) > 0) {
          sheepFirstGrassArrivalS[i] =
            (visualSpawnAbsS[i] ?? 0) + idx * SHEEP_CELL_TIME;
          break;
        }
      }
    }

    const lightOffDone = (visualMoveStartAbsS[i] ?? 0) + LIGHT_FADE_OUT_S;
    ufoLeaveAbsS[i] = Math.max(
      lightOffDone,
      sheepFirstGrassArrivalS[i] === Infinity
        ? lightOffDone
        : sheepFirstGrassArrivalS[i] + DROP_WAIT_S,
    );
  }

  const allSheepDoneAbsS = Math.max(0, ...sheepEndAbsSActive, ...ufoLeaveAbsS);

  // UFO 이동 시간(셀거리 기반)은 그대로 사용
  const travelSCells = (from: [number, number], to: [number, number]) => {
    const dist = Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]);
    return Math.min(
      UFO_MOVE_MAX_S,
      Math.max(UFO_MOVE_MIN_S, dist * UFO_CELL_TIME),
    );
  };

  // ---- pickup 스케줄 (active sheep만) ----
  let tCursor = allSheepDoneAbsS;

  // “마지막 드롭 위치”가 시작점
  let prevCell = funnelPositionsEarly[sheepCount - 1] ??
    funnelPositionsEarly[0] ?? [0, 0];

  for (let k = 0; k < activeSheepIndices.length; k++) {
    const sheepIndex = activeSheepIndices[k];
    const nextCell = pickupCells[k];

    tCursor += travelSCells(prevCell, nextCell);
    // UFO가 해당 양 위에 “도착한 시각”
    pickupArriveBySheep[sheepIndex] = tCursor;

    // 도착 후 잠깐 + 빛 + 페이드
    tCursor += PICKUP_WAIT_S;
    tCursor += PICKUP_LIGHT_S + PICKUP_FADE_S;

    prevCell = nextCell;
  }
  const pickupEndAbsS = tCursor;

  const timelineOffset = UFO_ENTRY_S;
  const maxTotalTimeWithEntryExit =
    Math.max(timelineOffset + maxTotalTime, pickupEndAbsS) + UFO_EXIT_S;
  const spawnAbsSOffset = visualSpawnAbsS.map((s) => s + timelineOffset);
  const readyAbsSOffset = readyAbsS.map((r) => r + timelineOffset);
  const moveStartAbsSOffset = visualMoveStartAbsS.map(
    (m) => m + timelineOffset,
  );
  const ufoLeaveAbsSOffset = ufoLeaveAbsS.map((u) => u + timelineOffset);

  if (process.env?.DEBUG_TIMING === "1") {
    const sample = Math.min(5, sheepCount);
    for (let i = 0; i < sample; i++) {
      const timeline = positionsHistory[i] ?? [];
      const target = sheepTargetsWithEmpty[i];
      const spawnPos = funnelPositionsEarly[i];
      if (target && spawnPos) {
        console.log(
          `[spawn] sheep=${i} spawnCell=${spawnPos[0]},${spawnPos[1]} targetGrass=${target.grass.x},${target.grass.y} neighbor=${target.emptyNeighbor.x},${target.emptyNeighbor.y}`,
        );
      }
      console.log(
        `[timing] sheep=${i} spawn=${(visualSpawnAbsS[i] ?? 0).toFixed(2)} ready=${readyAbsS[i].toFixed(2)} moveStart=${(visualMoveStartAbsS[i] ?? 0).toFixed(2)} len=${timeline.length}`,
      );
    }
    console.log(
      `[timing] maxTotalTime=${maxTotalTime.toFixed(2)} MOVE_START_S=${MOVE_START_S.toFixed(2)}`,
    );
  }

  if (process.env?.DEBUG_DROP === "1") {
    console.log("\n--- [DEBUG_DROP] 드롭 위치·타이밍 검증 ---");
    for (let i = 0; i < sheepCount; i++) {
      const t = sheepTargetsWithEmpty[i];
      const path = paths[i] ?? [];
      const firstPos = positionsHistory[i]?.[0];
      const dropKey = firstPos ? `${firstPos[0]},${firstPos[1]}` : "none";
      const countAtDrop =
        dropKey !== "none" ? (initialCountByKey.get(dropKey) ?? -1) : -1;
      const isGrass = countAtDrop > 0;
      console.log(
        `[drop] sheep=${i} path[0]=${path[0] ? `${path[0][0]},${path[0][1]}` : "none"} ` +
          `emptyNeighbor=${t ? `${t.emptyNeighbor.x},${t.emptyNeighbor.y}` : "n/a"} ` +
          `simFirstPos=${dropKey} count=${countAtDrop} ${isGrass ? "⚠️잔디(버그)" : "✓빈칸"}`,
      );
      console.log(
        `[ufo] sheep=${i} spawn=${(visualSpawnAbsS[i] ?? 0).toFixed(2)}s ready=${readyAbsS[i].toFixed(2)}s ` +
          `moveStart=${(visualMoveStartAbsS[i] ?? 0).toFixed(2)}s firstGrass=${sheepFirstGrassArrivalS[i] === Infinity ? "∞" : sheepFirstGrassArrivalS[i].toFixed(2)}s ufoLeave=${ufoLeaveAbsS[i].toFixed(2)}s`,
      );
    }
    console.log("---\n");
  }

  if (process.env?.DEBUG_SPEC === "1") {
    console.log(
      "\n--- [DEBUG_SPEC] UFO_SHEEP_SPEC 타임라인 (sheep 0 기준) ---",
    );
    const i = 0;
    console.log(
      `진입 끝(우주선 정지): ${timelineOffset.toFixed(2)}s | ` +
        `불빛 켜짐 완료: ${(spawnAbsSOffset[i] + 0.12).toFixed(2)}s | ` +
        `양 내림 완료(보임): ${readyAbsSOffset[i].toFixed(2)}s`,
    );
    console.log(
      `양 움직임 시작: ${moveStartAbsSOffset[i].toFixed(2)}s | ` +
        `불빛 꺼짐 완료: ${(moveStartAbsSOffset[i] + LIGHT_FADE_OUT_S).toFixed(2)}s | ` +
        `양 첫 잔디 도착: ${sheepFirstGrassArrivalS[i] === Infinity ? "∞" : (sheepFirstGrassArrivalS[i] + timelineOffset).toFixed(2)}s`,
    );
    console.log(
      `UFO 다음 위치 출발: ${ufoLeaveAbsSOffset[i].toFixed(2)}s (불빛끔 & 양 첫잔디 도착 중 늦은 시점)`,
    );
    console.log(
      `전체 길이: ${maxTotalTimeWithEntryExit.toFixed(2)}s (진입 ${UFO_ENTRY_S}s + 본편 + 퇴장 ${UFO_EXIT_S}s)`,
    );
    console.log("---\n");
  }

  // ----- Section 6: 시뮬 후 데이터 (잔디 도착 시각, 전체 애니 길이) -----

  // 잔디 rect + 페이드 키프레임 (targetCellArrivals 기준)
  const firstArrivals = new Map<
    string,
    { arrivalTime: number; level: number }
  >();
  for (const [k, v] of targetCellArrivals) {
    if (v.length > 0) {
      firstArrivals.set(k, {
        arrivalTime: v[0].arrivalTime,
        level: v[0].level,
      });
    }
  }
  const { rects, grassFadeKeyframes } = buildGrassLayer({
    grid,
    gridLeftX,
    gridTopY,
    initialCountByKey,
    quartiles,
    targetCellArrivals: firstArrivals,
    maxTotalTime: maxTotalTimeWithEntryExit,
    timeOffset: timelineOffset,
  });

  const pickupArriveAbsSOffsetForUfo = activeSheepIndices.map((i) => {
    const t = pickupArriveBySheep[i];
    return t == null ? 0 : t + timelineOffset;
  });

  const { ufoKeyframesStr, ufoLightKeyframesStr, ufoGroupStr } = buildUfoLayer({
    funnelPositionsEarly,
    spawnAbsS: spawnAbsSOffset,
    maxTotalTime: maxTotalTimeWithEntryExit,
    gridLeftX,
    gridTopY,
    lightRampS: LIGHT_RAMP_S,
    lightFadeOutS: LIGHT_FADE_OUT_S,
    moveStartAbsS: moveStartAbsSOffset,
    ufoLeaveAbsS: ufoLeaveAbsSOffset,
    readyAbsS: readyAbsSOffset,
    ufoEntryS: UFO_ENTRY_S,
    ufoExitS: UFO_EXIT_S,
    pickupCells,
    pickupArriveAbsS: pickupArriveAbsSOffsetForUfo,
    pickupWaitS: PICKUP_WAIT_S,
    pickupLightS: PICKUP_LIGHT_S,
  });
  const assignedIndices = Array.from(
    { length: sheepCount },
    (_, i) => i,
  ).filter(
    (i) => sheepTargetsWithEmpty[i] != null && positionsHistory[i].length > 0,
  );

  const pickupArriveAbsSOffset: (number | null)[] = pickupArriveBySheep.map(
    (t) => (t == null ? null : t + timelineOffset),
  );
  const { animationStyles, sheepGroups } = buildSheepLayer({
    positionsHistory,
    assignedIndices,
    spawnAbsS: spawnAbsSOffset,
    moveStartAbsS: moveStartAbsSOffset,
    maxTotalTime: maxTotalTimeWithEntryExit,
    gridLeftX,
    gridTopY,
    dropStayS: DROP_STAY_S,
    lightRampS: LIGHT_RAMP_S,
    sheepFadeS: SHEEP_FADE_S,
    dropDescentPx: DROP_DESCENT_PX,
    moveStartS: MOVE_START_S,
    pickupArriveAbsS: pickupArriveAbsSOffset,
    pickupFadeS: PICKUP_FADE_S,
    pickupWaitS: PICKUP_WAIT_S,
    pickupLightS: PICKUP_LIGHT_S,
  });

  // 지정한 칸(열,행) 중앙에 점 — CELL_DOTS 수정해서 빠르게 배치
  const dotRects = CELL_DOTS.map(([col, row]) => {
    const { x, y } = getCellCenterPx(gridLeftX, gridTopY, col, row);
    return `<circle cx="${x}" cy="${y}" r="1.5" fill="#ff4444"/>`;
  }).join("\n  ");

  const DEBUG_LAYER = process.env?.DEBUG_SVG === "1";
  const debugLayer = DEBUG_LAYER
    ? `<g opacity="0.9">${funnelPositionsEarly
        .map((pos, i) => {
          const { x, y } = getCellCenterPx(gridLeftX, gridTopY, pos[0], pos[1]);
          return `<g><circle cx="${x}" cy="${y}" r="5" fill="none" stroke="#00ff88" stroke-width="1.5"/><circle cx="${x}" cy="${y}" r="1.5" fill="#00ff88"/><text x="${x + 6}" y="${y - 6}" font-size="6" fill="#00ff88">U${i}</text></g>`;
        })
        .join("")}</g>`
    : "";

  // viewBox 위로 확장해서 대기 줄이 보이게 (y: -queueHeight ~ baseHeight)
  const viewBoxMinY = 0;
  const viewBoxHeight = totalHeight;

  return composeSvg({
    totalWidth,
    totalHeight,
    viewBoxMinY,
    viewBoxHeight,
    backgroundColor: BACKGROUND_COLOR,
    fenceRects,
    rects,
    sheepGroups,
    ufoGroupStr,
    debugLayer,
    dotRects,
    grassFadeKeyframes,
    animationStyles,
    ufoKeyframesStr,
    ufoLightKeyframesStr,
  });
}
