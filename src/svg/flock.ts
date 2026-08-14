import type { PlanResult } from "../planning/types.js";
import { pathBetweenCells } from "./pathUtils.js";
import type { SimulationResult } from "./sim/simulate.js";
import {
  GRASS_STEP_TIMES_S,
  SHEEP_CELL_TIME,
  SHEEP_FULLNESS_CAPACITY,
} from "./constants.js";

export type FlockBite = {
  cell: string;
  slotIndex: number;
  rosterIndex: number;
  baseArrivalTime: number;
  level: number;
  progress: number;
};

export type FlockTurnover = {
  slotIndex: number;
  outgoingRosterIndex: number;
  incomingRosterIndex: number;
  baseTime: number;
  historyIndex: number;
  pickupCell: [number, number];
  dropCell: [number, number];
  dropPath: [number, number][];
  resumeHistoryIndex: number;
  bridgeDuration: number;
};

export type FlockPlan = {
  fieldCount: number;
  totalEnergy: number;
  rosterSize: number;
  bites: FlockBite[];
  turnovers: FlockTurnover[];
};

export function buildFlockPlan(
  plan: PlanResult,
  sim: SimulationResult,
): FlockPlan {
  const bySlot = Array.from({ length: plan.sheepCount }, () => [] as {
    cell: string;
    arrivalTime: number;
    level: number;
  }[]);
  for (const [cell, arrivals] of sim.targetCellArrivals) {
    const arrival = arrivals[0];
    if (arrival) {
      bySlot[arrival.sheepIndex]?.push({
        cell,
        arrivalTime: arrival.arrivalTime,
        level: arrival.level,
      });
    }
  }
  for (const bites of bySlot) {
    bites.sort((a, b) => a.arrivalTime - b.arrivalTime);
  }

  const firstArrivalByCell = new Map(
    [...sim.targetCellArrivals].flatMap(([cell, arrivals]) =>
      arrivals[0] ? [[cell, arrivals[0].arrivalTime] as const] : [],
    ),
  );
  const gridKeys = [
    ...plan.targetBfsLen.keys(),
    ...firstArrivalByCell.keys(),
    ...sim.positionsHistory.flat().map(([x, y]) => `${x},${y}`),
  ];
  const gridPoints = gridKeys.map((key) => key.split(",").map(Number));
  const maxX = Math.max(0, ...gridPoints.map(([x]) => x));
  const maxY = Math.max(0, ...gridPoints.map(([, y]) => y));
  const remoteDropPath = (
    pickup: [number, number],
    target: [number, number],
    clearedAt: number,
  ): [number, number][] => {
    const targetKey = `${target[0]},${target[1]}`;
    const allowed = new Set<string>();
    for (let x = 0; x <= maxX; x++) {
      for (let y = 0; y <= maxY; y++) {
        const key = `${x},${y}`;
        const firstArrival = firstArrivalByCell.get(key);
        if (key === targetKey || firstArrival == null || firstArrival <= clearedAt)
          allowed.add(key);
      }
    }
    const candidates = [...allowed]
      .map((key) => key.split(",").map(Number) as [number, number])
      .filter(
        ([x, y]) =>
          `${x},${y}` !== targetKey &&
          Math.abs(x - pickup[0]) + Math.abs(y - pickup[1]) >= 3,
      )
      .map((cell) => ({
        pickupDistance:
          Math.abs(cell[0] - pickup[0]) + Math.abs(cell[1] - pickup[1]),
        path: pathBetweenCells(
          cell[0],
          cell[1],
          target[0],
          target[1],
          allowed,
          maxX,
          maxY,
        ),
      }))
      .filter(({ path }) => path.length >= 1);
    candidates.sort(
      (a, b) =>
        Number(!(a.path.length >= 3 && a.path.length <= 4)) -
          Number(!(b.path.length >= 3 && b.path.length <= 4)) ||
        a.path.length - b.path.length ||
        b.pickupDistance - a.pickupDistance ||
        a.path[0][0] - b.path[0][0] ||
        a.path[0][1] - b.path[0][1],
    );
    if (candidates[0]) return candidates[0].path;
    return [target];
  };

  const segmentByBite = bySlot.map((slotBites) => {
    let segment = 0;
    let energy = 0;
    return slotBites.map((bite, index) => {
      energy += bite.level;
      const current = { segment, energy };
      if (
        energy >= SHEEP_FULLNESS_CAPACITY &&
        index < slotBites.length - 1
      ) {
        segment++;
        energy = 0;
      }
      return current;
    });
  });

  const boundaryDrafts: Omit<
    FlockTurnover,
    "outgoingRosterIndex" | "incomingRosterIndex"
  >[] = [];
  for (let slotIndex = 0; slotIndex < bySlot.length; slotIndex++) {
    const slotBites = bySlot[slotIndex];
    const segments = segmentByBite[slotIndex];
    for (let index = 0; index < slotBites.length - 1; index++) {
      if (segments[index + 1].segment === segments[index].segment) continue;
      const bite = slotBites[index];
      const nextBite = slotBites[index + 1];
      const historyIndex = Math.max(
        1,
        Math.round(
          (bite.arrivalTime -
            (plan.spawnTick[slotIndex] ?? 0) * SHEEP_CELL_TIME -
            0.14) /
            SHEEP_CELL_TIME,
        ) + 1,
      );
      const history = sim.positionsHistory[slotIndex] ?? [];
      const pickupCell = (history[Math.min(historyIndex, history.length - 1)] ??
        bite.cell.split(",").map(Number)) as [number, number];
      const nextCell = nextBite.cell.split(",").map(Number) as [number, number];
      const resumeHistoryIndex = history.findIndex(
        ([x, y], candidateIndex) =>
          candidateIndex > historyIndex &&
          x === nextCell[0] &&
          y === nextCell[1] &&
          (candidateIndex === 0 ||
            history[candidateIndex - 1][0] !== x ||
            history[candidateIndex - 1][1] !== y),
      );
      const dropPath = remoteDropPath(pickupCell, nextCell, bite.arrivalTime);
      boundaryDrafts.push({
        slotIndex,
        baseTime: bite.arrivalTime + GRASS_STEP_TIMES_S.at(-1)!,
        historyIndex,
        pickupCell,
        dropCell: dropPath[0],
        dropPath,
        resumeHistoryIndex:
          resumeHistoryIndex >= 0 ? resumeHistoryIndex : historyIndex + 1,
        bridgeDuration: Math.max(
          SHEEP_CELL_TIME,
          nextBite.arrivalTime -
            (bite.arrivalTime + GRASS_STEP_TIMES_S.at(-1)!),
        ),
      });
    }
  }
  boundaryDrafts.sort(
    (a, b) => a.baseTime - b.baseTime || a.slotIndex - b.slotIndex,
  );

  const rosterBySlotSegment = new Map<string, number>();
  for (let slot = 0; slot < plan.sheepCount; slot++) {
    rosterBySlotSegment.set(`${slot},0`, slot);
  }
  const turnovers: FlockTurnover[] = boundaryDrafts.map((draft, index) => {
    const priorSegments = boundaryDrafts.filter(
      (candidate) =>
        candidate.slotIndex === draft.slotIndex &&
        (candidate.baseTime < draft.baseTime ||
          (candidate.baseTime === draft.baseTime && candidate === draft)),
    ).length;
    const outgoingRosterIndex = rosterBySlotSegment.get(
      `${draft.slotIndex},${priorSegments - 1}`,
    )!;
    const incomingRosterIndex = plan.sheepCount + index;
    rosterBySlotSegment.set(
      `${draft.slotIndex},${priorSegments}`,
      incomingRosterIndex,
    );
    return { ...draft, outgoingRosterIndex, incomingRosterIndex };
  });

  const bites: FlockBite[] = [];
  for (let slotIndex = 0; slotIndex < bySlot.length; slotIndex++) {
    for (let index = 0; index < bySlot[slotIndex].length; index++) {
      const bite = bySlot[slotIndex][index];
      const segment = segmentByBite[slotIndex][index];
      bites.push({
        cell: bite.cell,
        slotIndex,
        rosterIndex: rosterBySlotSegment.get(`${slotIndex},${segment.segment}`)!,
        baseArrivalTime: bite.arrivalTime,
        level: bite.level,
        progress: Math.min(1, segment.energy / SHEEP_FULLNESS_CAPACITY),
      });
    }
  }
  bites.sort((a, b) => a.baseArrivalTime - b.baseArrivalTime);

  return {
    fieldCount: plan.sheepCount,
    totalEnergy: bites.reduce((sum, bite) => sum + bite.level, 0),
    rosterSize: plan.sheepCount + turnovers.length,
    bites,
    turnovers,
  };
}
