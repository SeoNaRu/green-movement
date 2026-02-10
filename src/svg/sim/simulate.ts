import type { GridCell } from "../../grid/mapGrid.js";
import type { SheepState } from "../../domain/sheep.js";
import {
  SHEEP_CELL_TIME,
  waitTicks,
  MAX_MEALS_PER_SHEEP,
  GRASS_RES_TTL,
  RESERVE_AHEAD_LIMIT,
} from "../constants.js";
import {
  cellKey,
  createReservationTable,
  getCellRes,
  getEdgeRes,
  isCellFree,
  reserveCell,
  reserveEdge,
  type ReservationTable,
} from "../reservationTable.js";
import { emptyBfsFromSeeds } from "../pathUtils.js";
import {
  planWindowed,
  findPullOverTarget,
  findNearestReachableGrassCandidates,
  pickBestGrassCandidate,
  estimateEtaTicks,
} from "../simHelpers.js";
import { getContributionLevel } from "../contribution.js";

export type { SheepState } from "../../domain/sheep.js";

type EatingState = { owner: number; doneTick: number };

type ApproachRes = { owner: number; tick: number; dist: number };

export type Arrival = {
  arrivalTime: number;
  level: number;
  sheepIndex: number;
};

export type SimulationResult = {
  positionsHistory: [number, number][][];
  targetCellArrivals: Map<string, Arrival[]>;
  maxTotalTime: number;
};

export function simulateGrid(params: {
  grid: GridCell[];
  byKey: Map<string, GridCell>;
  initialCountByKey: Map<string, number>;
  quartiles: number[];
  emptyCellSet: Set<string>;
  remainingGrassKeys: Set<string>;
  sheepStates: SheepState[];
  sheepCount: number;
  spawnTick: number[];
  maxSteps: number;
  dropStayS: number;
  minFunnelRow: number;
  maxX: number;
  maxY: number;
  targetBfsLen: Map<string, number>;
}): SimulationResult {
  const {
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
    dropStayS,
    minFunnelRow,
    maxX,
    maxY,
    targetBfsLen,
  } = params;

  const resTable: ReservationTable = createReservationTable();
  const reservedApproach = new Map<string, ApproachRes>();
  const reservedApproachBySheep: (string | null)[] = Array.from(
    { length: sheepCount },
    () => null,
  );
  const idleTicks: number[] = new Array(sheepCount).fill(0);

  const mealsEaten: number[] = new Array(sheepCount).fill(0);
  const grassEating = new Map<string, EatingState>();
  const reservedGrass = new Map<string, number>();
  const reservedBySheep: (string | null)[] = new Array(sheepCount).fill(null);
  const reservedAtTick: number[] = new Array(sheepCount).fill(-1);

  const recomputeReachableEmptyFromSeeds = (): Set<string> => {
    const seeds: [number, number][] = [];
    for (let r = 0; r <= maxY; r++) {
      for (let c = 0; c <= maxX; c++) {
        const cell = byKey.get(`${c},${r}`);
        if (!cell || cell.count !== 0) continue;
        const dirs: [number, number][] = [
          [0, 1],
          [1, 0],
          [-1, 0],
          [0, -1],
        ];
        for (const [dc, dr] of dirs) {
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nc > maxX || nr < 0 || nr > maxY) continue;
          const neighbor = byKey.get(`${nc},${nr}`);
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
    for (const cell of emptyOrder) out.add(`${cell.x},${cell.y}`);
    return out;
  };

  const refreshReachableGrassKeys = (
    emptySet: Set<string>,
    remaining: Set<string>,
  ) => {
    const dirs: [number, number][] = [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
    ];
    for (const key of emptySet) {
      const [c, r] = key.split(",").map(Number);
      for (const [dc, dr] of dirs) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nc > maxX || nr < 0 || nr > maxY) continue;
        const neighbor = byKey.get(`${nc},${nr}`);
        if (neighbor && neighbor.count > 0) {
          remaining.add(`${nc},${nr}`);
        }
      }
    }
  };

  const releaseGrassReservation = (sheepIndex: number) => {
    const gk = reservedBySheep[sheepIndex];
    if (!gk) return;
    reservedGrass.delete(gk);
    reservedBySheep[sheepIndex] = null;
    reservedAtTick[sheepIndex] = -1;
  };

  const assignGrassToSheep = (
    sheepIndex: number,
    grassKey: string,
    tick: number,
    availableKeysEarly: Set<string>,
  ) => {
    const currentOwner = reservedGrass.get(grassKey);
    if (currentOwner != null && currentOwner !== sheepIndex) {
      releaseGrassReservation(currentOwner);
    }
    const st = sheepStates[sheepIndex];
    st.goalGrassKey = grassKey;
    st.plan = [];
    reservedGrass.set(grassKey, sheepIndex);
    reservedBySheep[sheepIndex] = grassKey;
    reservedAtTick[sheepIndex] = tick;
    availableKeysEarly.delete(grassKey);
  };

  const positionsHistory: [number, number][][] = Array.from(
    { length: sheepCount },
    () => [],
  );

  const SIMULATION_TIME_LIMIT_MS = 45000;
  const simStartTime = Date.now();

  for (let t = 0; t < maxSteps; t++) {
    if (t % 100 === 0) {
      const elapsed = Date.now() - simStartTime;
      if (elapsed > SIMULATION_TIME_LIMIT_MS) break;
    }

    let emptyDirty = false;

    resTable.cell.delete(t - 2);
    resTable.edge.delete(t - 2);
    reservedApproach.clear();
    for (let i = 0; i < reservedApproachBySheep.length; i++) {
      reservedApproachBySheep[i] = null;
    }

    for (let i = 0; i < sheepStates.length; i++) {
      if (t < spawnTick[i]) continue;
      reserveCell(resTable, t, sheepStates[i].pos[0], sheepStates[i].pos[1], i);
    }

    const eatingCellSetForAssign = new Set(grassEating.keys());

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

    const availableKeysEarly = new Set(remainingGrassKeys);
    for (const k of reservedGrass.keys()) availableKeysEarly.delete(k);

    for (let i = 0; i < sheepStates.length; i++) {
      if (t < spawnTick[i]) continue;
      const st = sheepStates[i];
      if (st.eatingGrassKey) continue;
      if (t < st.eatUntil) continue;
      if (mealsEaten[i] >= MAX_MEALS_PER_SHEEP) continue;
      if (remainingGrassKeys.size === 0) continue;
      const globalIdle = idleTicks[i] >= 6;

      if (idleTicks[i] >= 1 && st.goalGrassKey != null) {
        const currentKey = st.goalGrassKey;
        const owner = reservedGrass.get(currentKey);
        if (owner != null && owner !== i) {
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
            const stealMargin = 2;
            if (etaSelf + stealMargin < etaOwner) {
              assignGrassToSheep(i, currentKey, t, availableKeysEarly);
            }
          }
        }
      }

      if (globalIdle) {
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

      let availableForThisSheep: Set<string>;
      if (globalIdle) {
        availableForThisSheep = new Set(remainingGrassKeys);
      } else {
        availableForThisSheep = availableKeysEarly;
      }

      const candidates = findNearestReachableGrassCandidates(
        i,
        st.pos,
        availableForThisSheep,
        emptyCellSet,
        new Set<string>(),
        minFunnelRow,
        maxX,
        maxY,
        byKey,
        new Map(),
        reservedApproach,
        8,
        grassEating,
      );
      const best = pickBestGrassCandidate(
        candidates,
        initialCountByKey,
        reservedGrass,
        i,
      );
      if (best) {
        assignGrassToSheep(
          i,
          `${best.grass.x},${best.grass.y}`,
          t,
          availableKeysEarly,
        );
      }
    }

    const needPlan = Array.from({ length: sheepCount }, (_, i) => i).filter(
      (i) => {
        const st = sheepStates[i];
        if (t < spawnTick[i]) return false;
        if (st.eatingGrassKey) return false;
        if (t < st.eatUntil) return false;
        if (mealsEaten[i] >= MAX_MEALS_PER_SHEEP) return false;
        if (!st.goalGrassKey) return true;
        if (st.plan.length <= 0) return true;
        return false;
      },
    );

    const needPlanDist = new Map<number, number>();
    for (const i of needPlan) {
      const st = sheepStates[i];
      if (!st.goalGrassKey) {
        needPlanDist.set(i, 1e9);
        continue;
      }
      const [gc, gr] = st.goalGrassKey.split(",").map(Number);
      needPlanDist.set(i, Math.abs(st.pos[0] - gc) + Math.abs(st.pos[1] - gr));
    }

    needPlan.sort(
      (a, b) => (needPlanDist.get(a) ?? 0) - (needPlanDist.get(b) ?? 0),
    );

    for (const i of needPlan) {
      const st = sheepStates[i];
      if (!st.goalGrassKey) continue;

      const [gc, gr] = st.goalGrassKey.split(",").map(Number);
      let planned = planWindowed(
        i,
        st.pos,
        t,
        [gc, gr],
        30,
        emptyCellSet,
        new Set<string>(),
        minFunnelRow,
        maxX,
        maxY,
        resTable,
        eatingCellSetForAssign,
      );

      if (!planned) {
        const releasedKey = st.goalGrassKey;
        releaseGrassReservation(i);
        const availableForFallback = new Set(availableKeysEarly);
        if (releasedKey) availableForFallback.add(releasedKey);
        const candidatesFallback = findNearestReachableGrassCandidates(
          i,
          st.pos,
          availableForFallback,
          emptyCellSet,
          new Set<string>(),
          minFunnelRow,
          maxX,
          maxY,
          byKey,
          new Map(),
          reservedApproach,
          8,
          grassEating,
        );
        const chosenFallback = pickBestGrassCandidate(
          candidatesFallback,
          initialCountByKey,
          reservedGrass,
          i,
        );
        if (chosenFallback) {
          const gkFallback = `${chosenFallback.grass.x},${chosenFallback.grass.y}`;
          st.goalGrassKey = gkFallback;
          availableKeysEarly.delete(gkFallback);
          reservedGrass.set(gkFallback, i);
          reservedBySheep[i] = gkFallback;
          reservedAtTick[i] = t;
          st.stuck = 0;
          continue;
        }
        if (releasedKey) {
          st.goalGrassKey = releasedKey;
          reservedGrass.set(releasedKey, i);
          reservedBySheep[i] = releasedKey;
          reservedAtTick[i] = t;
        }

        st.stuck += 1;
        if (st.stuck >= 6) {
          const goalForPull = st.goalGrassKey
            ? (st.goalGrassKey.split(",").map(Number) as [number, number])
            : undefined;
          const pull = findPullOverTarget(
            st.pos,
            emptyCellSet,
            new Set<string>(),
            minFunnelRow,
            maxX,
            maxY,
            goalForPull,
          );
          if (pull) {
            const p2 = planWindowed(
              i,
              st.pos,
              t,
              pull,
              30,
              emptyCellSet,
              new Set<string>(),
              minFunnelRow,
              maxX,
              maxY,
              resTable,
              eatingCellSetForAssign,
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

    const order = Array.from({ length: sheepStates.length }, (_, i) => i).sort(
      (a, b) => {
        const stuckA = sheepStates[a].stuck;
        const stuckB = sheepStates[b].stuck;
        if (stuckB !== stuckA) return stuckB - stuckA;
        const goalA = sheepStates[a].goalGrassKey;
        const goalB = sheepStates[b].goalGrassKey;
        let distA = 1e9;
        let distB = 1e9;
        if (goalA) {
          const [gc, gr] = goalA.split(",").map(Number);
          distA =
            Math.abs(sheepStates[a].pos[0] - gc) +
            Math.abs(sheepStates[a].pos[1] - gr);
        }
        if (goalB) {
          const [gc, gr] = goalB.split(",").map(Number);
          distB =
            Math.abs(sheepStates[b].pos[0] - gc) +
            Math.abs(sheepStates[b].pos[1] - gr);
        }
        if (distA !== distB) return distA - distB;
        return ((a + t) % sheepCount) - ((b + t) % sheepCount);
      },
    );

    getCellRes(resTable, t + 1);
    getEdgeRes(resTable, t + 1);

    const occupiedThisTick = new Set<string>();
    for (let idx = 0; idx < sheepStates.length; idx++) {
      if (t < spawnTick[idx]) continue;
      const p = sheepStates[idx].pos;
      occupiedThisTick.add(cellKey(p[0], p[1]));
    }

    for (const i of order) {
      if (t < spawnTick[i]) continue;
      const st = sheepStates[i];

      if (t < st.eatUntil) {
        reserveCell(resTable, t + 1, st.pos[0], st.pos[1], i);
        positionsHistory[i].push(st.pos);
        continue;
      }

      positionsHistory[i].push(st.pos);

      const intended = st.plan.length > 0 ? st.plan[0] : st.pos;
      const from: [number, number] = st.pos;
      let to: [number, number] = intended;

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

      const stayedFinal = to[0] === from[0] && to[1] === from[1];
      if (stayedFinal) {
        idleTicks[i] += 1;
      } else {
        idleTicks[i] = 0;
      }

      if (to[0] !== from[0] || to[1] !== from[1]) {
        const okCell = reserveCell(resTable, t + 1, to[0], to[1], i);
        const okEdge = okCell && reserveEdge(resTable, t + 1, from, to, i);

        if (okCell && okEdge) {
          occupiedThisTick.delete(fromKey);
          st.pos = to;
          occupiedThisTick.add(toKey);
          st.plan = st.plan.slice(1);
          st.stuck = 0;
        } else {
          reserveCell(resTable, t + 1, from[0], from[1], i);
          st.stuck += 1;
          if (st.stuck >= 2) st.plan = [];
          to = from;
        }
      } else {
        reserveCell(resTable, t + 1, from[0], from[1], i);
      }

      const k = cellKey(st.pos[0], st.pos[1]);
      const cell = byKey.get(k);
      const initialCount = initialCountByKey.get(k) ?? 0;

      if (cell && initialCount > 0 && cell.count > 0) {
        const gk = k;
        const es = grassEating.get(gk);
        if (!es) {
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
      const nextEmpty = recomputeReachableEmptyFromSeeds();
      emptyCellSet.clear();
      for (const k of nextEmpty) emptyCellSet.add(k);
      refreshReachableGrassKeys(emptyCellSet, remainingGrassKeys);
    }

    if (remainingGrassKeys.size === 0) break;
    if (mealsEaten.every((m) => m >= MAX_MEALS_PER_SHEEP)) break;
  }

  const targetCellArrivals = new Map<string, Arrival[]>();
  const pushArrival = (k: string, a: Arrival) => {
    const list = targetCellArrivals.get(k) ?? [];
    list.push(a);
    list.sort((x, y) => x.arrivalTime - y.arrivalTime);
    targetCellArrivals.set(k, list);
  };

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

      const arrivalTime =
        spawnTick[si] * SHEEP_CELL_TIME + dropStayS + t * SHEEP_CELL_TIME;
      const level = getContributionLevel(initialCount, quartiles);
      pushArrival(k, { arrivalTime, level, sheepIndex: si });
    }
  }

  const maxTotalTime =
    positionsHistory.length === 0
      ? 1
      : Math.max(
          1,
          ...positionsHistory.map((timeline, si) => {
            if (!timeline || timeline.length <= 1)
              return spawnTick[si] * SHEEP_CELL_TIME + dropStayS;
            return (
              spawnTick[si] * SHEEP_CELL_TIME +
              dropStayS +
              (timeline.length - 2) * SHEEP_CELL_TIME
            );
          }),
        );

  return { positionsHistory, targetCellArrivals, maxTotalTime };
}
