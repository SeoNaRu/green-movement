import type { GridContext } from "../svg/buildContext.js";
import type { PlanResult } from "../planning/types.js";
import type { SimulationResult } from "../svg/sim/simulate.js";
import type { TimelineResult } from "./types.js";
import type { FlockPlan } from "../svg/flock.js";
import {
  SHEEP_CELL_TIME,
  UFO_ENTRY_S,
  UFO_CELL_TIME,
  UFO_MOVE_MIN_S,
  UFO_MOVE_MAX_S,
} from "../svg/constants.js";

const LIGHT_RAMP_S = 0.04;
const SHEEP_FADE_S = 0.14;
const DROP_STAY_S = 0.14;
const MOVE_START_S = Math.max(DROP_STAY_S, LIGHT_RAMP_S + SHEEP_FADE_S);
const DROP_WAIT_S = 0.06;
const UFO_RELEASE_S = 0.06;
const PICKUP_WAIT_S = 0.2;
const PICKUP_LIGHT_S = 0.14;
const PICKUP_FADE_S = 0.18;
const SIGNATURE_FALSE_END_S = 0.28;
const SIGNATURE_APPROACH_S = 0.3;
const SIGNATURE_FOCUS_S = 0.18;
const SIGNATURE_IMPACT_S = 0.12;
const SIGNATURE_REVEAL_S = 1.08;
const SIGNATURE_CONFIRM_S = 0.28;
const SIGNATURE_EXIT_S = 0.36;
const SIGNATURE_HOLD_S = 1.4;
const TURNOVER_PICKUP_S = 0.16;
const TURNOVER_EXCHANGE_S = 0.18;
const TURNOVER_DROP_S = LIGHT_RAMP_S + SHEEP_FADE_S;

export function buildTimeline(
  ctx: GridContext,
  plan: PlanResult,
  sim: SimulationResult,
  flock: FlockPlan,
): TimelineResult {
  const {
    sheepCount,
    funnelPositionsEarly,
    spawnTick,
    sheepTargetsWithEmpty,
  } = plan;
  const { positionsHistory, targetCellArrivals, maxTotalTime } = sim;
  const firstMoveIndex = positionsHistory.map((timeline) => {
    if (!timeline?.length) return -1;
    const [sx, sy] = timeline[0];
    return timeline.findIndex(
      ([x, y], index) => index > 0 && (x !== sx || y !== sy),
    );
  });
  const moveStartAbsS = Array.from({ length: sheepCount }, (_, i) => {
    const timeline = positionsHistory[i];
    if (!timeline || timeline.length === 0) {
      return spawnTick[i] * SHEEP_CELL_TIME + MOVE_START_S;
    }
    const firstMoveIdx = firstMoveIndex[i];
    const simExtra =
      firstMoveIdx < 0
        ? (timeline.length - 1) * SHEEP_CELL_TIME
        : (firstMoveIdx - 1) * SHEEP_CELL_TIME;
    const extra = Math.max(0, simExtra);
    return spawnTick[i] * SHEEP_CELL_TIME + MOVE_START_S + extra;
  });

  const simSpawnAbsS = spawnTick.map((t) => t * SHEEP_CELL_TIME);
  const visualSpawnAbsS: number[] = new Array(sheepCount).fill(0);
  const readyAbsS: number[] = new Array(sheepCount).fill(0);
  const visualMoveStartAbsS: number[] = new Array(sheepCount).fill(0);
  const ufoArriveAbsS: number[] = new Array(sheepCount).fill(0);
  const ufoLeaveAbsS: number[] = new Array(sheepCount).fill(0);

  const activeSheepIndices = Array.from(
    { length: sheepCount },
    (_, i) => i,
  ).filter((i) => (positionsHistory[i]?.length ?? 0) > 0);

  const pickupArriveBySheep: (number | null)[] = Array.from(
    { length: sheepCount },
    () => null,
  );
  for (let i = 0; i < sheepCount; i++) {
    const prevLeave = i === 0 ? 0 : ufoLeaveAbsS[i - 1];
    let arrive = prevLeave;
    if (i >= 1 && funnelPositionsEarly[i] && funnelPositionsEarly[i - 1]) {
      const distCells =
        Math.abs(funnelPositionsEarly[i][0] - funnelPositionsEarly[i - 1][0]) +
        Math.abs(funnelPositionsEarly[i][1] - funnelPositionsEarly[i - 1][1]);
      const travelS = Math.max(UFO_MOVE_MIN_S, distCells * UFO_CELL_TIME);
      arrive = prevLeave + travelS;
    }
    const earliestArrival = Math.max(
      0,
      (simSpawnAbsS[i] ?? 0) - DROP_WAIT_S,
    );
    arrive = Math.max(arrive, earliestArrival);
    ufoArriveAbsS[i] = arrive;
    const baseSpawn = arrive + DROP_WAIT_S;
    visualSpawnAbsS[i] = Math.max(simSpawnAbsS[i] ?? 0, baseSpawn);
    readyAbsS[i] = visualSpawnAbsS[i] + (LIGHT_RAMP_S + SHEEP_FADE_S);
    const simOffset = (moveStartAbsS[i] ?? 0) - (simSpawnAbsS[i] ?? 0);
    visualMoveStartAbsS[i] = Math.max(
      readyAbsS[i],
      visualSpawnAbsS[i] + Math.max(0, simOffset),
    );
    ufoLeaveAbsS[i] = (readyAbsS[i] ?? 0) + UFO_RELEASE_S;
  }

  const travelSCells = (from: [number, number], to: [number, number]) => {
    const dist = Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]);
    return Math.min(
      UFO_MOVE_MAX_S,
      Math.max(UFO_MOVE_MIN_S, dist * UFO_CELL_TIME),
    );
  };
  const visualBaseTime = (slotIndex: number, baseTime: number) => {
    const simFirstMoveArrival =
      (spawnTick[slotIndex] ?? 0) * SHEEP_CELL_TIME +
      DROP_STAY_S +
      Math.max(0, firstMoveIndex[slotIndex] ?? 0) * SHEEP_CELL_TIME;
    return (
      baseTime +
      (visualMoveStartAbsS[slotIndex] ?? 0) +
      SHEEP_CELL_TIME -
      simFirstMoveArrival
    );
  };

  const slotDelays = new Array(sheepCount).fill(0);
  const scheduledTurnovers: {
    slotIndex: number;
    outgoingRosterIndex: number;
    incomingRosterIndex: number;
    historyIndex: number;
    resumeHistoryIndex: number;
    baseTime: number;
    pickupCell: [number, number];
    dropCell: [number, number];
    dropPath: [number, number][];
    bridgeDuration: number;
    bridgeDelay: number;
    bridgeHold: number;
    pickupArriveAbsS: number;
    outgoingHiddenAbsS: number;
    dropArriveAbsS: number;
    incomingSpawnAbsS: number;
    incomingReadyAbsS: number;
    leaveAbsS: number;
    addedDelay: number;
  }[] = [];
  const ufoStopCells = funnelPositionsEarly.slice();
  let serviceCursor = ufoLeaveAbsS.at(-1) ?? 0;
  let serviceCell = funnelPositionsEarly.at(-1) ?? [0, 0];
  for (const turnover of flock.turnovers) {
    const requested =
      visualBaseTime(turnover.slotIndex, turnover.baseTime) +
      slotDelays[turnover.slotIndex];
    const arrive = Math.max(
      requested,
      serviceCursor + travelSCells(serviceCell, turnover.pickupCell),
    );
    const outgoingHidden = arrive + TURNOVER_PICKUP_S;
    const dropArrive = outgoingHidden + TURNOVER_EXCHANGE_S;
    const incomingSpawn = dropArrive;
    const incomingReady = incomingSpawn + TURNOVER_DROP_S;
    const leave = incomingReady;
    const addedDelay = Math.max(0, incomingReady - requested) + turnover.bridgeDelay;
    slotDelays[turnover.slotIndex] += addedDelay;
    scheduledTurnovers.push({
      ...turnover,
      pickupArriveAbsS: arrive,
      outgoingHiddenAbsS: outgoingHidden,
      dropArriveAbsS: dropArrive,
      incomingSpawnAbsS: incomingSpawn,
      incomingReadyAbsS: incomingReady,
      leaveAbsS: leave,
      addedDelay,
    });
    ufoStopCells.push(turnover.pickupCell, turnover.dropCell);
    ufoArriveAbsS.push(arrive, dropArrive);
    visualSpawnAbsS.push(arrive, incomingSpawn);
    readyAbsS.push(outgoingHidden, incomingReady);
    visualMoveStartAbsS.push(outgoingHidden, incomingReady);
    ufoLeaveAbsS.push(outgoingHidden, leave);
    serviceCursor = leave;
    serviceCell = turnover.dropCell;
  }

  const delayAt = (slotIndex: number, baseTime: number) =>
    scheduledTurnovers
      .filter(
        (turnover) =>
          turnover.slotIndex === slotIndex && turnover.baseTime < baseTime,
      )
      .reduce((sum, turnover) => sum + turnover.addedDelay, 0);

  const sheepEndAbsSActive = activeSheepIndices.map((i) => {
    const timeline = positionsHistory[i]!;
    const firstMove = firstMoveIndex[i];
    if (firstMove < 0) return readyAbsS[i];
    return (
      visualMoveStartAbsS[i] +
      (timeline.length - firstMove) * SHEEP_CELL_TIME +
      slotDelays[i]
    );
  });

  const effectiveDropCount = ufoStopCells.length;
  const finishBySheep = new Map(
    activeSheepIndices.map((sheepIndex, index) => [
      sheepIndex,
      sheepEndAbsSActive[index],
    ]),
  );
  const finalCellBySheep = new Map(
    activeSheepIndices.map((sheepIndex) => {
      const history = positionsHistory[sheepIndex]!;
      const [x, y] = history[history.length - 1];
      return [sheepIndex, [x, y] as [number, number]];
    }),
  );
  const pickupCells: [number, number][] = [];
  const pickupVisitSheep: number[] = [];
  const pending = [...activeSheepIndices];
  let tCursor = serviceCursor + UFO_MOVE_MAX_S;
  let prevCell: [number, number] = serviceCell;
  while (pending.length > 0) {
    let nextPendingIndex = 0;
    let nextArrival = Number.POSITIVE_INFINITY;
    for (let index = 0; index < pending.length; index++) {
      const sheepIndex = pending[index];
      const nextCell = finalCellBySheep.get(sheepIndex)!;
      const arrival = Math.max(
        finishBySheep.get(sheepIndex) ?? 0,
        tCursor + travelSCells(prevCell, nextCell),
      );
      if (arrival < nextArrival) {
        nextPendingIndex = index;
        nextArrival = arrival;
      }
    }
    const [sheepIndex] = pending.splice(nextPendingIndex, 1);
    const nextCell = finalCellBySheep.get(sheepIndex)!;
    tCursor = nextArrival;
    pickupCells.push(nextCell);
    pickupVisitSheep.push(sheepIndex);
    pickupArriveBySheep[sheepIndex] = nextArrival;
    tCursor += PICKUP_WAIT_S;
    tCursor += PICKUP_LIGHT_S + PICKUP_FADE_S;
    prevCell = nextCell;
  }
  const pickupEndAbsS = tCursor;

  // ---- Crop Signature: 빈 목장 → 중앙 집결 → 원형 각인 → 퇴장 → 이름 hold ----
  const { centerCol, maxY } = ctx;
  const signatureArriveAbsS =
    pickupEndAbsS + SIGNATURE_FALSE_END_S + SIGNATURE_APPROACH_S;
  const paintSweepStartAbsS =
    signatureArriveAbsS + SIGNATURE_FOCUS_S + SIGNATURE_IMPACT_S;
  const paintSweepDuration = SIGNATURE_REVEAL_S;
  const ufoExitStartAbsS =
    paintSweepStartAbsS + paintSweepDuration + SIGNATURE_CONFIRM_S;
  const ufoExitEndAbsS = ufoExitStartAbsS + SIGNATURE_EXIT_S;
  const sweepPositions: [number, number][] = [[centerCol, Math.floor(maxY / 2)]];
  const sweepArriveAbsS: number[] = [signatureArriveAbsS];

  const timelineOffset = UFO_ENTRY_S;
  const maxTotalTimeWithEntryExit =
    Math.max(
      timelineOffset + maxTotalTime,
      timelineOffset + ufoExitEndAbsS + SIGNATURE_HOLD_S,
    );
  const ufoArriveAbsSOffset = ufoArriveAbsS.map(
    (t: number) => t + timelineOffset,
  );
  const spawnAbsSOffset = visualSpawnAbsS.map((s) => s + timelineOffset);
  const readyAbsSOffset = readyAbsS.map((r) => r + timelineOffset);
  const moveStartAbsSOffset = visualMoveStartAbsS.map(
    (m) => m + timelineOffset,
  );
  const ufoLeaveAbsSOffset = ufoLeaveAbsS.map((u) => u + timelineOffset);
  const sweepArriveAbsSOffset = sweepArriveAbsS.map((t) => t + timelineOffset);
  const paintSweepStartAbsSOffset = paintSweepStartAbsS + timelineOffset;
  const ufoExitStartAbsSOffset = ufoExitStartAbsS + timelineOffset;
  const ufoExitEndAbsSOffset = ufoExitEndAbsS + timelineOffset;

  const firstArrivals = new Map<
    string,
    {
      arrivalTime: number;
      level: number;
      sheepIndex: number;
      directionRad?: number;
    }
  >();
  for (const [k, v] of targetCellArrivals) {
    if (v.length > 0) {
      const first = v[0];
      const sheepIndex = first.sheepIndex;
      const firstMoveIdx = firstMoveIndex[sheepIndex] ?? -1;
      const simFirstMoveArrival =
        (spawnTick[sheepIndex] ?? 0) * SHEEP_CELL_TIME +
        DROP_STAY_S +
        Math.max(0, firstMoveIdx) * SHEEP_CELL_TIME;
      const visualFirstMoveArrival =
        (visualMoveStartAbsS[sheepIndex] ?? 0) + SHEEP_CELL_TIME;
      const arrivalTime =
        first.arrivalTime + visualFirstMoveArrival - simFirstMoveArrival;
      firstArrivals.set(k, {
        arrivalTime: arrivalTime + delayAt(sheepIndex, first.arrivalTime),
        level: first.level,
        sheepIndex,
        directionRad: first.directionRad,
      });
    }
  }

  const pickupArriveAbsSOffsetForUfo = pickupVisitSheep.map((i) => {
    const t = pickupArriveBySheep[i];
    return t == null ? 0 : t + timelineOffset;
  });
  const pickupArriveAbsSOffset: (number | null)[] = pickupArriveBySheep.map(
    (t) => (t == null ? null : t + timelineOffset),
  );
  const pickupHiddenAbsSOffset: (number | null)[] =
    pickupArriveAbsSOffset.map((t) =>
      t == null
        ? null
        : t + PICKUP_WAIT_S + PICKUP_LIGHT_S * 0.6 + PICKUP_FADE_S,
    );
  const turnovers = scheduledTurnovers.map((turnover) => ({
    slotIndex: turnover.slotIndex,
    outgoingRosterIndex: turnover.outgoingRosterIndex,
    incomingRosterIndex: turnover.incomingRosterIndex,
    historyIndex: turnover.historyIndex,
    resumeHistoryIndex: turnover.resumeHistoryIndex,
    pickupCell: turnover.pickupCell,
    dropCell: turnover.dropCell,
    dropPath: turnover.dropPath,
    bridgeDuration: turnover.bridgeDuration,
    pickupArriveAbsS: turnover.pickupArriveAbsS + timelineOffset,
    outgoingHiddenAbsS: turnover.outgoingHiddenAbsS + timelineOffset,
    dropArriveAbsS: turnover.dropArriveAbsS + timelineOffset,
    incomingSpawnAbsS: turnover.incomingSpawnAbsS + timelineOffset,
    incomingReadyAbsS: turnover.incomingReadyAbsS + timelineOffset,
    addedDelay: turnover.addedDelay,
  }));

  const finalRosterBySlot = Array.from(
    { length: flock.fieldCount },
    (_, slotIndex) => slotIndex,
  );
  for (const turnover of turnovers) {
    finalRosterBySlot[turnover.slotIndex] = turnover.incomingRosterIndex;
  }
  const flockSheep = Array.from({ length: flock.rosterSize }, (_, rosterIndex) => {
    const incoming = turnovers.find(
      (turnover) => turnover.incomingRosterIndex === rosterIndex,
    );
    const slotIndex = incoming?.slotIndex ?? rosterIndex;
    const outgoing = turnovers.find(
      (turnover) => turnover.outgoingRosterIndex === rosterIndex,
    );
    const isFinal = finalRosterBySlot[slotIndex] === rosterIndex;
    const pickupAbsS =
      outgoing?.pickupArriveAbsS ??
      (isFinal ? pickupArriveAbsSOffset[slotIndex] ?? null : null);
    const hiddenAbsS =
      outgoing?.outgoingHiddenAbsS ??
      (isFinal ? pickupHiddenAbsSOffset[slotIndex] ?? null : null);
    return {
      rosterIndex,
      slotIndex,
      spawnAbsS:
        incoming?.incomingSpawnAbsS ?? spawnAbsSOffset[slotIndex] ?? timelineOffset,
      pickupAbsS,
      hiddenAbsS,
      bites: flock.bites
        .filter((bite) => bite.rosterIndex === rosterIndex)
        .map((bite) => {
          const arrival = firstArrivals.get(bite.cell);
          return {
            atS: timelineOffset + (arrival?.arrivalTime ?? bite.baseArrivalTime),
            progress: bite.progress,
            level: bite.level,
          };
        }),
    };
  });
  let clearedEnergy = 0;
  const grassProgress = flock.bites
    .map((bite) => {
      const arrival = firstArrivals.get(bite.cell);
      return {
        atS:
          timelineOffset +
          (arrival?.arrivalTime ?? bite.baseArrivalTime) +
          0.23,
        level: bite.level,
      };
    })
    .sort((a, b) => a.atS - b.atS)
    .map(({ atS, level }) => ({
      atS,
      progress:
        flock.totalEnergy > 0
          ? (clearedEnergy += level) / flock.totalEnergy
          : 1,
    }));
  const assignedIndices = Array.from(
    { length: sheepCount },
    (_, i) => i,
  ).filter(
    (i) =>
      sheepTargetsWithEmpty[i] != null &&
      (positionsHistory[i]?.length ?? 0) > 0,
  );

  return {
    timelineOffset,
    maxTotalTimeWithEntryExit,
    firstArrivals,
    ufoArriveAbsSOffset,
    spawnAbsSOffset,
    readyAbsSOffset,
    moveStartAbsSOffset,
    ufoLeaveAbsSOffset,
    ufoStopCells,
    effectiveDropCount,
    pickupCells,
    pickupArriveAbsSOffsetForUfo,
    pickupArriveAbsSOffset,
    relocation: null,
    turnovers,
    flock: {
      fieldCount: flock.fieldCount,
      totalEnergy: flock.totalEnergy,
      rosterSize: flock.rosterSize,
      sheep: flockSheep,
      grassProgress,
    },
    sweepPositions,
    sweepArriveAbsSOffset,
    paintSweepStartAbsSOffset,
    paintSweepDuration,
    ufoExitStartAbsSOffset,
    ufoExitEndAbsSOffset,
    assignedIndices,
  };
}
