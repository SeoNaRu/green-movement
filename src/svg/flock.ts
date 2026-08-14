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
};

export type FlockTurnover = {
  slotIndex: number;
  outgoingRosterIndex: number;
  incomingRosterIndex: number;
  baseTime: number;
  historyIndex: number;
  cell: [number, number];
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
      const [x, y] = bite.cell.split(",").map(Number);
      const historyIndex = Math.max(
        1,
        Math.round(
          (bite.arrivalTime -
            (plan.spawnTick[slotIndex] ?? 0) * SHEEP_CELL_TIME -
            0.14) /
            SHEEP_CELL_TIME,
        ) + 1,
      );
      boundaryDrafts.push({
        slotIndex,
        baseTime: bite.arrivalTime + GRASS_STEP_TIMES_S.at(-1)!,
        historyIndex,
        cell: [x, y],
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
