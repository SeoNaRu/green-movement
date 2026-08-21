import type { PlanResult } from "../planning/types.js";
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
  capacity: number;
  appetite: SheepAppetite;
};

export type SheepAppetite = "high" | "normal" | "low";

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
  bridgeDelay: number;
  bridgeHold: number;
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

  const weekEnergy = new Map<number, number>();
  for (const bites of bySlot) {
    for (const bite of bites) {
      const week = Number(bite.cell.split(",")[0]);
      weekEnergy.set(week, (weekEnergy.get(week) ?? 0) + bite.level);
    }
  }
  const rankedWeeks = [...weekEnergy].sort(
    ([weekA, energyA], [weekB, energyB]) => energyB - energyA || weekA - weekB,
  );
  const appetiteByWeek = new Map<number, SheepAppetite>();
  const highWeeks = Math.round(rankedWeeks.length * 0.6);
  const lowWeeks = Math.round(rankedWeeks.length * 0.3);
  for (const [rank, [week]] of rankedWeeks.entries()) {
    appetiteByWeek.set(
      week,
      rank < highWeeks
        ? "high"
        : rank >= rankedWeeks.length - lowWeeks
          ? "low"
          : "normal",
    );
  }
  const energyQuantum = bySlot
    .flatMap((bites) => bites.map((bite) => bite.level))
    .reduce((a, b) => {
      while (b !== 0) [a, b] = [b, a % b];
      return a;
    }, 0) || 1;
  const appetiteDelta = Math.max(
    energyQuantum,
    Math.floor(5 / energyQuantum) * energyQuantum,
  );
  const capacityByAppetite: Record<SheepAppetite, number> = {
    high: SHEEP_FULLNESS_CAPACITY + appetiteDelta,
    normal: SHEEP_FULLNESS_CAPACITY,
    low: SHEEP_FULLNESS_CAPACITY - appetiteDelta * 2,
  };
  const quota: Record<SheepAppetite, number> = { high: 6, normal: 1, low: 3 };
  let quotaUsed: Record<SheepAppetite, number> = { high: 0, normal: 0, low: 0 };
  const nextAppetite = (cell: string): SheepAppetite => {
    if (Object.values(quotaUsed).reduce((sum, value) => sum + value, 0) === 10) {
      quotaUsed = { high: 0, normal: 0, low: 0 };
    }
    const week = Number(cell.split(",")[0]);
    const desired = appetiteByWeek.get(week) ?? "normal";
    const preference: SheepAppetite[] = desired === "high"
      ? ["high", "normal", "low"]
      : desired === "low"
        ? ["low", "normal", "high"]
        : ["normal", "high", "low"];
    const selected = preference.find((tier) => quotaUsed[tier] < quota[tier])!;
    quotaUsed[selected]++;
    return selected;
  };
  const segmentByBite = bySlot.map((bites) =>
    bites.map(() => ({
      segment: 0,
      energy: 0,
      capacity: SHEEP_FULLNESS_CAPACITY,
      appetite: "normal" as SheepAppetite,
    })),
  );
  const slotState = bySlot.map(() => ({
    segment: 0,
    energy: 0,
    capacity: 0,
    appetite: "normal" as SheepAppetite,
  }));
  const chronologicalBites = bySlot
    .flatMap((bites, slotIndex) =>
      bites.map((bite, biteIndex) => ({ bite, biteIndex, slotIndex })),
    )
    .sort(
      (a, b) =>
        a.bite.arrivalTime - b.bite.arrivalTime ||
        a.slotIndex - b.slotIndex ||
        a.biteIndex - b.biteIndex,
    );
  for (const { bite, biteIndex, slotIndex } of chronologicalBites) {
    const state = slotState[slotIndex];
    if (state.capacity === 0) {
      state.appetite = nextAppetite(bite.cell);
      state.capacity = capacityByAppetite[state.appetite];
    }
    state.energy += bite.level;
    segmentByBite[slotIndex][biteIndex] = { ...state };
    if (
      state.energy >= state.capacity &&
      biteIndex < bySlot[slotIndex].length - 1
    ) {
      state.segment++;
      state.energy = 0;
      state.capacity = 0;
    }
  }

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
      const fullHistoryIndex = Math.max(
        1,
        Math.round(
          (bite.arrivalTime -
            (plan.spawnTick[slotIndex] ?? 0) * SHEEP_CELL_TIME -
            0.14) /
            SHEEP_CELL_TIME,
        ) + 1,
      );
      const history = sim.positionsHistory[slotIndex] ?? [];
      const nextCell = nextBite.cell.split(",").map(Number) as [number, number];
      const resumeHistoryIndex = history.findIndex(
        ([x, y], candidateIndex) =>
          candidateIndex > fullHistoryIndex &&
          x === nextCell[0] &&
          y === nextCell[1] &&
          (candidateIndex === 0 ||
            history[candidateIndex - 1][0] !== x ||
            history[candidateIndex - 1][1] !== y),
      );
      const historyIndex = resumeHistoryIndex > 0
        ? Math.max(fullHistoryIndex, resumeHistoryIndex - 1)
        : fullHistoryIndex;
      const pickupCell = (history[Math.min(historyIndex, history.length - 1)] ??
        bite.cell.split(",").map(Number)) as [number, number];
      const dropPath = [nextCell];
      const routeWindow = Math.max(
        SHEEP_CELL_TIME,
        nextBite.arrivalTime -
          (bite.arrivalTime + GRASS_STEP_TIMES_S.at(-1)!),
      );
      boundaryDrafts.push({
        slotIndex,
        baseTime:
          bite.arrivalTime +
          GRASS_STEP_TIMES_S.at(-1)! +
          (historyIndex - fullHistoryIndex) * SHEEP_CELL_TIME,
        historyIndex,
        pickupCell,
        dropCell: dropPath[0],
        dropPath,
        resumeHistoryIndex:
          resumeHistoryIndex >= 0 ? resumeHistoryIndex : historyIndex + 1,
        bridgeDuration: 0,
        bridgeDelay: 0,
        bridgeHold: routeWindow,
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
        progress: Math.min(1, segment.energy / segment.capacity),
        capacity: segment.capacity,
        appetite: segment.appetite,
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
