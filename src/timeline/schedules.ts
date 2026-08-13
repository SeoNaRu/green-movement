import type { GridContext } from "../svg/buildContext.js";
import type { PlanResult } from "../planning/types.js";
import type { SimulationResult } from "../svg/sim/simulate.js";
import type { TimelineResult } from "./types.js";
import {
  SHEEP_CELL_TIME,
  UFO_ENTRY_S,
  UFO_CELL_TIME,
  UFO_MOVE_MIN_S,
  UFO_MOVE_MAX_S,
  UFO_RELOCATION_APPROACH_S,
  UFO_RELOCATION_BOARD_S,
  UFO_RELOCATION_FLIGHT_S,
  UFO_RELOCATION_TOTAL_S,
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

export function buildTimeline(
  ctx: GridContext,
  plan: PlanResult,
  sim: SimulationResult,
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
  const pickupCells: [number, number][] = activeSheepIndices.map((i) => {
    const tl = positionsHistory[i]!;
    const last = tl[tl.length - 1];
    return [last[0], last[1]];
  });
  for (let i = 0; i < sheepCount; i++) {
    const prevLeave = i === 0 ? 0 : ufoLeaveAbsS[i - 1];
    let arrive = prevLeave;
    if (i >= 1 && funnelPositionsEarly[i] && funnelPositionsEarly[i - 1]) {
      const distCells =
        Math.abs(funnelPositionsEarly[i][0] - funnelPositionsEarly[i - 1][0]) +
        Math.abs(funnelPositionsEarly[i][1] - funnelPositionsEarly[i - 1][1]);
      const travelS = Math.min(
        UFO_MOVE_MAX_S,
        Math.max(UFO_MOVE_MIN_S, distCells * UFO_CELL_TIME),
      );
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

  const relocationBiteSettle = 0.23;
  const relocationFlightStart = UFO_RELOCATION_BOARD_S;
  const relocationDropArrive = relocationFlightStart + UFO_RELOCATION_FLIGHT_S;
  const relocationRelease = UFO_RELOCATION_TOTAL_S - UFO_RELOCATION_APPROACH_S;
  const relocationDuration = relocationBiteSettle + relocationRelease;
  const relocationStartAbsS = sim.relocation
    ? (() => {
        const { sheepIndex, historyIndex } = sim.relocation;
        const simFirstMoveArrival =
          (spawnTick[sheepIndex] ?? 0) * SHEEP_CELL_TIME +
          DROP_STAY_S +
          Math.max(0, firstMoveIndex[sheepIndex] ?? 0) * SHEEP_CELL_TIME;
        const visualFirstMoveArrival =
          (visualMoveStartAbsS[sheepIndex] ?? 0) + SHEEP_CELL_TIME;
        return (
          (spawnTick[sheepIndex] ?? 0) * SHEEP_CELL_TIME +
          DROP_STAY_S +
          historyIndex * SHEEP_CELL_TIME +
          visualFirstMoveArrival -
          simFirstMoveArrival
        );
      })()
    : null;

  const sheepEndAbsSActive = activeSheepIndices.map((i) => {
    const timeline = positionsHistory[i]!;
    const firstMove = firstMoveIndex[i];
    if (firstMove < 0) return readyAbsS[i];
    return (
      visualMoveStartAbsS[i] +
      (timeline.length - firstMove) * SHEEP_CELL_TIME +
      (sim.relocation?.sheepIndex === i ? relocationDuration : 0)
    );
  });

  // 실제 화면에서 마지막 양이 멈춘 뒤에만 회수를 시작한다.
  const allSheepDoneAbsS =
    sheepEndAbsSActive.length > 0 ? Math.max(0, ...sheepEndAbsSActive) : 0;
  // 그 시점 이후로는 UFO가 드롭 위치로 가지 않도록, 방문할 드롭 개수 제한
  let lastDropIndex = 0;
  for (let i = 0; i < sheepCount; i++) {
    if (ufoLeaveAbsS[i] <= allSheepDoneAbsS) lastDropIndex = i;
  }
  const effectiveDropCount = lastDropIndex + 1;

  const travelSCells = (from: [number, number], to: [number, number]) => {
    const dist = Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]);
    return Math.min(
      UFO_MOVE_MAX_S,
      Math.max(UFO_MOVE_MIN_S, dist * UFO_CELL_TIME),
    );
  };
  let tCursor = allSheepDoneAbsS;
  const pickupStartCell: [number, number] = funnelPositionsEarly[
    lastDropIndex
  ] ??
    funnelPositionsEarly[0] ?? [0, 0];
  let prevCell: [number, number] = pickupStartCell;
  for (let k = 0; k < activeSheepIndices.length; k++) {
    const sheepIndex = activeSheepIndices[k];
    const nextCell = pickupCells[k];
    tCursor += travelSCells(prevCell, nextCell);
    pickupArriveBySheep[sheepIndex] = tCursor;
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
      const relocationDelay =
        sim.relocation?.sheepIndex === sheepIndex &&
        relocationStartAbsS != null &&
        arrivalTime >= relocationStartAbsS
          ? relocationDuration
          : 0;
      firstArrivals.set(k, {
        arrivalTime: arrivalTime + relocationDelay,
        level: first.level,
        sheepIndex,
        directionRad: first.directionRad,
      });
    }
  }

  const pickupArriveAbsSOffsetForUfo = activeSheepIndices.map((i) => {
    const t = pickupArriveBySheep[i];
    return t == null ? 0 : t + timelineOffset;
  });
  const pickupArriveAbsSOffset: (number | null)[] = pickupArriveBySheep.map(
    (t) => (t == null ? null : t + timelineOffset),
  );
  const relocation = sim.relocation
    ? (() => {
        const { sheepIndex, historyIndex, from, to } = sim.relocation;
        const pickupArriveAbsS =
          (relocationStartAbsS ?? 0) + relocationBiteSettle + timelineOffset;
        return {
          sheepIndex,
          historyIndex,
          from,
          to,
          pickupArriveAbsS,
          flightStartAbsS: pickupArriveAbsS + relocationFlightStart,
          dropArriveAbsS: pickupArriveAbsS + relocationDropArrive,
          releaseAbsS: pickupArriveAbsS + relocationRelease,
          operationDuration: relocationDuration,
        };
      })()
    : null;
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
    effectiveDropCount,
    pickupCells,
    pickupArriveAbsSOffsetForUfo,
    pickupArriveAbsSOffset,
    relocation,
    sweepPositions,
    sweepArriveAbsSOffset,
    paintSweepStartAbsSOffset,
    paintSweepDuration,
    ufoExitStartAbsSOffset,
    ufoExitEndAbsSOffset,
    assignedIndices,
  };
}
