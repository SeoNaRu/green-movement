import type { GridCell } from "../grid/mapGrid.js";
import type { GridContext } from "../svg/buildContext.js";
import type { PlanResult, TargetWithGate } from "./types.js";
import type { SheepState } from "../domain/sheep.js";
import { emptyBfsFromSeeds } from "../svg/pathUtils.js";
import { buildPathFromToGrass } from "../svg/simHelpers.js";

const DROP_TICKS = 8;

/** 잔디(타겟) 선택 전략: 기본은 "빈칸 이웃의 잔디" */
export interface TargetStrategy {
  planTargets(ctx: GridContext): PlanResult;
}

function buildGrassTargets(
  ctx: GridContext,
  emptyOrder: GridCell[],
  gateCol: number,
): { grass: GridCell; emptyNeighbor: GridCell; gateCol: number }[] {
  const { byKey, inBounds, dirs4 } = ctx;
  const list: { grass: GridCell; emptyNeighbor: GridCell; gateCol: number }[] =
    [];
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
}

/** 기본 타겟 전략: UFO 드롭용 잔디 근처 빈칸 → BFS → 양당 (잔디, 빈칸) 배정 */
export function planTargets(
  ctx: GridContext,
  strategy?: TargetStrategy,
): PlanResult {
  const strategyImpl = strategy ?? defaultTargetStrategy;
  return strategyImpl.planTargets(ctx);
}

const defaultTargetStrategy: TargetStrategy = {
  planTargets(ctx: GridContext): PlanResult {
    const {
      grid,
      maxX,
      maxY,
      centerCol,
      byKey,
      initialCountByKey,
      sheepCountCap,
      inBounds,
      dirs4,
      keyOf,
      recomputeReachableEmptyFromSeeds,
    } = ctx;

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
    const allGrassTargets = buildGrassTargets(ctx, emptyOrderBfs, centerCol);

    let sheepCount = Math.min(
      sheepCountCap,
      emptyOrderBfs.length,
      allGrassTargets.length,
    );
    if (sheepCount === 0 && sheepCountCap > 0 && allGrassTargets.length > 0) {
      sheepCount = Math.min(sheepCountCap, allGrassTargets.length);
    }

    const grassKey = (g: GridCell) => `${g.x},${g.y}`;
    const allTargets: TargetWithGate[] = allGrassTargets;
    const targetBfsLen = new Map<string, number>();
    for (const t of allTargets) targetBfsLen.set(grassKey(t.grass), 0);

    const emptyCellSetEarly = new Set<string>(
      emptyOrderBfs.map((c) => keyOf(c.x, c.y)),
    );
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

    const validIndices = Array.from({ length: sheepCount }, (_, i) => i);
    const paths: [number, number][][] = validIndices.map((i) => {
      const t = sheepTargetsWithEmpty[i];
      if (!t) return [] as [number, number][];
      const from: [number, number] = funnelPositionsEarly[i];
      const p = buildPathFromToGrass(
        from,
        [t.emptyNeighbor.x, t.emptyNeighbor.y],
        t.grass,
        emptyCellSetEarly,
        maxX,
        maxY,
      );
      return (
        p.length > 0
          ? p
          : [
              [t.emptyNeighbor.x, t.emptyNeighbor.y],
              [t.grass.x, t.grass.y],
            ]
      ) as [number, number][];
    });

    const emptyCellSet = recomputeReachableEmptyFromSeeds();
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
    const remainingGrassKeys = new Set<string>(reachableGrassKeys);
    for (const ek of emptyCellSet) {
      const [c, r] = ek.split(",").map(Number);
      for (const [dc, dr] of dirs4) {
        const nc = c + dc;
        const nr = r + dr;
        if (!inBounds(nc, nr)) continue;
        const nk = `${nc},${nr}`;
        const cell = byKey.get(nk);
        const initial = initialCountByKey.get(nk) ?? 0;
        if (cell && initial > 0 && cell.count > 0) remainingGrassKeys.add(nk);
      }
    }

    const minFunnelRow = 0;
    const sheepStates: SheepState[] = funnelPositionsEarly.map((p) => ({
      pos: p,
      plan: [],
      goalGrassKey: null,
      eatUntil: -1,
      stuck: 0,
      eatingGrassKey: null,
    }));
    for (let i = 0; i < sheepCount; i++) {
      const t = sheepTargetsWithEmpty[i];
      if (t && paths[i].length > 0) {
        const path = paths[i];
        const dropPos = path[0];
        sheepStates[i].pos = [dropPos[0], dropPos[1]];
        sheepStates[i].goalGrassKey = grassKey(t.grass);
        sheepStates[i].plan = path.slice(1) as [number, number][];
      }
    }

    const spawnTick: number[] = Array.from(
      { length: sheepCount },
      (_, i) => i * DROP_TICKS,
    );

    return {
      sheepCount,
      sheepTargetsWithEmpty,
      funnelPositionsEarly,
      paths,
      emptyCellSet,
      remainingGrassKeys,
      sheepStates,
      spawnTick,
      targetBfsLen,
      minFunnelRow,
    };
  },
};
