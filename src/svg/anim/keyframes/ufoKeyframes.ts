import {
  CELL_SIZE,
  GAP,
  UFO_CELL_TIME,
  UFO_MOVE_MAX_S,
  UFO_MOVE_MIN_S,
  UFO_RELOCATION_APPROACH_S,
  UFO_VIEWBOX,
  UFO_WIDTH_PX,
  UFO_CONTENT,
  MOTION_TIME_SCALE,
} from "../../constants.js";
import { getCellCenterPx } from "../../layout/gridLayout.js";
import {
  getGridWaveMetrics,
  getGridWavePhase,
} from "../../signature.js";

/** UFO 리플: ring 1=2x2중앙, ring n(n>=2)= (2n)x(2n) 테두리. 그리드 밖은 add에서 걸러짐. */
function getRippleRingCells(
  cx: number,
  cy: number,
  ring: number,
  maxX: number,
  maxY: number,
): [number, number][] {
  const out: [number, number][] = [];
  const add = (c: number, r: number) => {
    if (c >= 0 && c <= maxX && r >= 0 && r <= maxY) out.push([c, r]);
  };
  if (ring === 1) {
    add(cx, cy);
    add(cx + 1, cy);
    add(cx, cy + 1);
    add(cx + 1, cy + 1);
    return out;
  }
  const n = ring;
  for (let c = cx - n + 1; c <= cx + n; c++) {
    add(c, cy - n + 1);
    add(c, cy + n);
  }
  for (let r = cy - n + 1; r <= cy + n; r++) {
    add(cx - n + 1, r);
    add(cx + n, r);
  }
  return out;
}

export function buildUfoLayer(params: {
  funnelPositionsEarly: [number, number][];
  deploymentStopCount: number;
  spawnAbsS: number[];
  arriveAbsS: number[];
  maxTotalTime: number;
  gridLeftX: number;
  gridTopY: number;
  beamDelayS: number;
  lightRampS: number;
  lightFadeOutS: number;
  moveStartAbsS: number[];
  ufoLeaveAbsS: number[];
  ufoEntryS: number;
  ufoExitS: number;
  maxX: number;
  maxY: number;
  pickupCells?: [number, number][];
  pickupArriveAbsS?: number[];
  pickupWaitS?: number;
  pickupLightS?: number;
  sweepPositions?: [number, number][];
  sweepArriveAbsS?: number[];
  paintStartAbsS?: number;
  paintSweepDuration?: number;
  signatureCells?: [number, number][];
  exitStartAbsS?: number;
  exitEndAbsS?: number;
  relocation?: {
    sheepIndex: number;
    historyIndex: number;
    from: [number, number];
    to: [number, number];
    pickupArriveAbsS: number;
    flightStartAbsS: number;
    dropArriveAbsS: number;
    releaseAbsS: number;
    operationDuration: number;
  } | null;
}): {
  ufoKeyframesStr: string;
  ufoLightKeyframesStr: string;
  ufoGroupStr: string;
  ufoRippleKeyframesStr: string;
  ufoRippleGroupStr: string;
} {
  const {
    funnelPositionsEarly,
    deploymentStopCount,
    spawnAbsS,
    arriveAbsS,
    maxTotalTime,
    gridLeftX,
    gridTopY,
    beamDelayS,
    lightRampS,
    lightFadeOutS,
    moveStartAbsS,
    ufoLeaveAbsS,
    ufoEntryS,
    ufoExitS,
    maxX,
    maxY,
    pickupCells,
    pickupArriveAbsS,
    pickupWaitS,
    pickupLightS,
    sweepPositions,
    sweepArriveAbsS,
    paintStartAbsS,
    paintSweepDuration = 0,
    signatureCells,
    exitStartAbsS,
    exitEndAbsS,
    relocation,
  } = params;
  const animationDuration = (maxTotalTime * MOTION_TIME_SCALE).toFixed(3);

  const pickupCellsArr = pickupCells ?? [];
  const pickupArriveArr = pickupArriveAbsS ?? [];
  const sweepPositionsArr = sweepPositions ?? [];
  const sweepArriveArr = sweepArriveAbsS ?? [];
  const signatureCellsArr = signatureCells ?? [];
  const pickupWait = pickupWaitS ?? 0.35;
  const pickupLight = pickupLightS ?? 0.22;

  const ufoCenter = UFO_WIDTH_PX / 2;
  const headingFor = (
    fromPx: { x: number; y: number },
    toPx: { x: number; y: number },
    previous: number,
  ) => {
    const dx = toPx.x - fromPx.x;
    const dy = toPx.y - fromPx.y;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return previous;
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
    while (angle - previous > 180) angle -= 360;
    while (angle - previous < -180) angle += 360;
    return Number(angle.toFixed(2));
  };
  const travelSeconds = (
    from: [number, number],
    to: [number, number],
  ) => {
    const cells = Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]);
    return Math.min(
      UFO_MOVE_MAX_S,
      Math.max(UFO_MOVE_MIN_S, cells * UFO_CELL_TIME),
    );
  };
  const pctAt = (seconds: number) =>
    maxTotalTime > 0 ? (seconds * 100) / maxTotalTime : 0;
  const TURN_LEAD_S = 0.1;

  const ufoMoveKeyframePcts: string[] = [];
  const ufoRotKeyframePcts: string[] = [];
  const ufoStreakFrames: { t: number; opacity: number; scale: number }[] = [];
  const ufoVisibilityFrames: { t: number; opacity: number }[] = [
    { t: 0, opacity: 1 },
  ];
  let signaturePulse: { x: number; y: number; start: number; duration: number } | null = null;
  const addFlight = (
    fromPx: { x: number; y: number },
    toPx: { x: number; y: number },
    departT: number,
    arriveT: number,
    showStreak = false,
  ) => {
    ufoMoveKeyframePcts.push(
      `${pctAt(departT).toFixed(4)}% { transform: translate(${fromPx.x - UFO_WIDTH_PX / 2}px, ${fromPx.y - UFO_WIDTH_PX / 2}px); animation-timing-function: cubic-bezier(.4,0,.2,1); }`,
    );
    ufoMoveKeyframePcts.push(
      `${pctAt(arriveT).toFixed(4)}% { transform: translate(${toPx.x - UFO_WIDTH_PX / 2}px, ${toPx.y - UFO_WIDTH_PX / 2}px); }`,
    );

    if (showStreak) {
      const ramp = Math.min(0.04, (arriveT - departT) / 4);
      ufoStreakFrames.push(
        { t: departT, opacity: 0, scale: 0.2 },
        { t: departT + ramp, opacity: 0.32, scale: 1 },
        { t: Math.max(departT + ramp, arriveT - ramp), opacity: 0.18, scale: 0.65 },
        { t: arriveT, opacity: 0, scale: 0.2 },
      );
    }
  };
  const addServiceCut = (
    fromPx: { x: number; y: number },
    toPx: { x: number; y: number },
    departT: number,
    arriveT: number,
  ) => {
    const edge = Math.min(0.06, (arriveT - departT) / 3);
    const lift = 12;
    addFlight(fromPx, { x: fromPx.x, y: fromPx.y - lift }, departT, departT + edge);
    addFlight(
      { x: toPx.x, y: toPx.y - lift },
      toPx,
      arriveT - edge,
      arriveT,
    );
    ufoVisibilityFrames.push(
      { t: departT, opacity: 1 },
      { t: departT + edge, opacity: 0 },
      { t: arriveT - edge, opacity: 0 },
      { t: arriveT, opacity: 1 },
    );
  };
  const entryY =
    getCellCenterPx(gridLeftX, gridTopY, 0, 0).y - UFO_WIDTH_PX / 2 - 60;
  if (funnelPositionsEarly.length > 0) {
    const pos0 = getCellCenterPx(
      gridLeftX,
      gridTopY,
      funnelPositionsEarly[0][0],
      funnelPositionsEarly[0][1],
    );
    const entryAngle = 0;
    ufoMoveKeyframePcts.push(
      `0% { transform: translate(${pos0.x - ufoCenter}px, ${entryY}px); }`,
    );
    ufoRotKeyframePcts.push(`0% { transform: rotate(${entryAngle}deg); }`);
    const arrive0 = arriveAbsS[0] ?? ufoEntryS;
    const pctArrive0 = maxTotalTime > 0 ? (arrive0 * 100) / maxTotalTime : 0;
    addFlight(
      { x: pos0.x, y: entryY + ufoCenter },
      pos0,
      0,
      arrive0,
      true,
    );
    ufoRotKeyframePcts.push(
      `${pctAt(ufoEntryS).toFixed(4)}% { transform: rotate(${entryAngle}deg); }`,
    );
    let currentAngle = entryAngle;
    ufoRotKeyframePcts.push(
      `${pctArrive0.toFixed(4)}% { transform: rotate(${entryAngle}deg); }`,
    );
    const stayEnd0 = ufoLeaveAbsS[0] ?? 0;
    const pctStayEnd0 = maxTotalTime > 0 ? (stayEnd0 * 100) / maxTotalTime : 0;
    if (funnelPositionsEarly.length > 1 && pctStayEnd0 < 99.99) {
      const nextPos = getCellCenterPx(
        gridLeftX,
        gridTopY,
        funnelPositionsEarly[1][0],
        funnelPositionsEarly[1][1],
      );
      const arrive1 = arriveAbsS[1] ?? stayEnd0;
      const pctArrive1 = maxTotalTime > 0 ? (arrive1 * 100) / maxTotalTime : 0;
      const angle1 = headingFor(pos0, nextPos, currentAngle);
      const turnStartPct = pctAt(
        Math.max(arrive0, stayEnd0 - TURN_LEAD_S),
      );
      ufoRotKeyframePcts.push(
        `${turnStartPct.toFixed(4)}% { transform: rotate(${currentAngle}deg); animation-timing-function: cubic-bezier(.2,.8,.2,1); }`,
      );
      ufoRotKeyframePcts.push(
        `${pctStayEnd0.toFixed(4)}% { transform: rotate(${angle1}deg); }`,
      );
      addFlight(pos0, nextPos, stayEnd0, arrive1);
      ufoRotKeyframePcts.push(
        `${pctArrive1.toFixed(4)}% { transform: rotate(${angle1}deg); }`,
      );
      currentAngle = angle1;
    }
    for (let i = 1; i < funnelPositionsEarly.length - 1; i++) {
      const stayEndI = ufoLeaveAbsS[i] ?? 0;
      const pctStayEndI =
        maxTotalTime > 0 ? (stayEndI * 100) / maxTotalTime : 0;
      const currPos = getCellCenterPx(
        gridLeftX,
        gridTopY,
        funnelPositionsEarly[i][0],
        funnelPositionsEarly[i][1],
      );
      const nextPos = getCellCenterPx(
        gridLeftX,
        gridTopY,
        funnelPositionsEarly[i + 1][0],
        funnelPositionsEarly[i + 1][1],
      );
      const arriveNext = arriveAbsS[i + 1] ?? stayEndI;
      const pctArriveNext =
        maxTotalTime > 0 ? (arriveNext * 100) / maxTotalTime : 0;
      const angleNext = headingFor(currPos, nextPos, currentAngle);
      if (pctArriveNext <= 100) {
        if (!relocation && arriveNext - stayEndI > 0.8) {
          const offstageCurrent = { x: currPos.x, y: entryY + ufoCenter };
          const offstageNext = { x: nextPos.x, y: entryY + ufoCenter };
          const exitEnd = stayEndI + 0.3;
          const entryStart = arriveNext - 0.3;
          const exitAngle = headingFor(currPos, offstageCurrent, currentAngle);
          ufoRotKeyframePcts.push(
            `${pctAt(Math.max(0, stayEndI - TURN_LEAD_S)).toFixed(4)}% { transform: rotate(${currentAngle}deg); animation-timing-function: cubic-bezier(.2,.8,.2,1); }`,
            `${pctAt(stayEndI).toFixed(4)}% { transform: rotate(${exitAngle}deg); }`,
            `${pctAt(exitEnd).toFixed(4)}% { transform: rotate(${exitAngle}deg); }`,
          );
          addFlight(currPos, offstageCurrent, stayEndI, exitEnd, true);
          const entryAngle = headingFor(offstageNext, nextPos, exitAngle);
          ufoRotKeyframePcts.push(
            `${pctAt(Math.max(exitEnd, entryStart - TURN_LEAD_S)).toFixed(4)}% { transform: rotate(${exitAngle}deg); animation-timing-function: cubic-bezier(.2,.8,.2,1); }`,
            `${pctAt(entryStart).toFixed(4)}% { transform: rotate(${entryAngle}deg); }`,
            `${pctAt(arriveNext).toFixed(4)}% { transform: rotate(${entryAngle}deg); }`,
          );
          addFlight(offstageNext, nextPos, entryStart, arriveNext, true);
          currentAngle = entryAngle;
          continue;
        }
        if (relocation && i === 3) {
          const sourcePx = getCellCenterPx(
            gridLeftX,
            gridTopY,
            relocation.from[0],
            relocation.from[1],
          );
          const targetPx = getCellCenterPx(
            gridLeftX,
            gridTopY,
            relocation.to[0],
            relocation.to[1],
          );
          const offstageAt = (point: { x: number; y: number }) => ({
            x: point.x,
            y: entryY + ufoCenter,
          });
          const turnAndFly = (
            from: { x: number; y: number },
            to: { x: number; y: number },
            depart: number,
            arrive: number,
            streak = false,
          ) => {
            const angle = headingFor(from, to, currentAngle);
            ufoRotKeyframePcts.push(
              `${pctAt(Math.max(0, depart - TURN_LEAD_S)).toFixed(4)}% { transform: rotate(${currentAngle}deg); animation-timing-function: cubic-bezier(.2,.8,.2,1); }`,
              `${pctAt(depart).toFixed(4)}% { transform: rotate(${angle}deg); }`,
              `${pctAt(arrive).toFixed(4)}% { transform: rotate(${angle}deg); }`,
            );
            addFlight(from, to, depart, arrive, streak);
            currentAngle = angle;
          };
          const stageExitEnd = Math.min(
            relocation.pickupArriveAbsS - UFO_RELOCATION_APPROACH_S,
            stayEndI + UFO_RELOCATION_APPROACH_S,
          );
          turnAndFly(currPos, offstageAt(currPos), stayEndI, stageExitEnd, true);
          turnAndFly(
            offstageAt(sourcePx),
            sourcePx,
            relocation.pickupArriveAbsS - UFO_RELOCATION_APPROACH_S,
            relocation.pickupArriveAbsS,
            true,
          );
          turnAndFly(
            sourcePx,
            targetPx,
            relocation.flightStartAbsS,
            relocation.dropArriveAbsS,
            true,
          );
          ufoMoveKeyframePcts.push(
            `${pctAt(relocation.releaseAbsS).toFixed(4)}% { transform: translate(${targetPx.x - ufoCenter}px, ${targetPx.y - ufoCenter}px); }`,
          );
          const operationExitEnd = Math.min(
            arriveNext - 0.3,
            relocation.releaseAbsS + 0.3,
          );
          turnAndFly(
            targetPx,
            offstageAt(targetPx),
            relocation.releaseAbsS,
            operationExitEnd,
            true,
          );
          turnAndFly(
            offstageAt(nextPos),
            nextPos,
            arriveNext - 0.3,
            arriveNext,
            true,
          );
          continue;
        }
        const isTurnoverExchange =
          i >= deploymentStopCount &&
          (i - deploymentStopCount) % 2 === 0;
        if (isTurnoverExchange) {
          const edge = Math.min(0.06, (arriveNext - stayEndI) / 3);
          const exitAngle = headingFor(
            currPos,
            { x: currPos.x, y: currPos.y - 12 },
            currentAngle,
          );
          const entryAngle = headingFor(
            { x: nextPos.x, y: nextPos.y - 12 },
            nextPos,
            exitAngle,
          );
          ufoRotKeyframePcts.push(
            `${pctAt(Math.max(arriveAbsS[i] ?? 0, stayEndI - TURN_LEAD_S)).toFixed(4)}% { transform: rotate(${currentAngle}deg); animation-timing-function: cubic-bezier(.2,.8,.2,1); }`,
            `${pctStayEndI.toFixed(4)}% { transform: rotate(${exitAngle}deg); }`,
            `${pctAt(stayEndI + edge).toFixed(4)}% { transform: rotate(${exitAngle}deg); }`,
            `${pctAt(arriveNext - edge).toFixed(4)}% { transform: rotate(${entryAngle}deg); }`,
            `${pctArriveNext.toFixed(4)}% { transform: rotate(${entryAngle}deg); }`,
          );
          addServiceCut(currPos, nextPos, stayEndI, arriveNext);
          currentAngle = entryAngle;
        } else {
          const turnStartPct = pctAt(
            Math.max(arriveAbsS[i] ?? 0, stayEndI - TURN_LEAD_S),
          );
          ufoRotKeyframePcts.push(
            `${turnStartPct.toFixed(4)}% { transform: rotate(${currentAngle}deg); animation-timing-function: cubic-bezier(.2,.8,.2,1); }`,
            `${pctStayEndI.toFixed(4)}% { transform: rotate(${angleNext}deg); }`,
            `${pctArriveNext.toFixed(4)}% { transform: rotate(${angleNext}deg); }`,
          );
          addFlight(currPos, nextPos, stayEndI, arriveNext);
          currentAngle = angleNext;
        }
      }
    }
    const lastIdx = funnelPositionsEarly.length - 1;
    const lastPos = funnelPositionsEarly[lastIdx];
    const lastPosPx = getCellCenterPx(
      gridLeftX,
      gridTopY,
      lastPos[0],
      lastPos[1],
    );
    const lastStayEnd = ufoLeaveAbsS[lastIdx] ?? 0;
    const pctLastStay =
      maxTotalTime > 0 ? (lastStayEnd * 100) / maxTotalTime : 0;
    const lastSegAngle = currentAngle;
    const lastTx = lastPosPx.x - UFO_WIDTH_PX / 2;
    const lastTy = lastPosPx.y - UFO_WIDTH_PX / 2;
    ufoMoveKeyframePcts.push(
      `${pctLastStay.toFixed(4)}% { transform: translate(${lastTx}px, ${lastTy}px); }`,
    );
    ufoRotKeyframePcts.push(
      `${pctLastStay.toFixed(4)}% { transform: rotate(${lastSegAngle}deg); }`,
    );
    let latestHoldEndT = lastStayEnd;
    let stageExitPx = lastPosPx;
    if (
      pickupCellsArr.length > 0 &&
      pickupArriveArr.length === pickupCellsArr.length
    ) {
      stageExitPx = { x: lastPosPx.x, y: entryY + ufoCenter };
      const stageExitEndT = lastStayEnd + UFO_MOVE_MAX_S;
      const stageExitAngle = headingFor(lastPosPx, stageExitPx, currentAngle);
      ufoRotKeyframePcts.push(
        `${pctAt(Math.max(arriveAbsS[lastIdx] ?? 0, lastStayEnd - TURN_LEAD_S)).toFixed(4)}% { transform: rotate(${currentAngle}deg); animation-timing-function: cubic-bezier(.2,.8,.2,1); }`,
      );
      ufoRotKeyframePcts.push(
        `${pctLastStay.toFixed(4)}% { transform: rotate(${stageExitAngle}deg); }`,
      );
      addFlight(lastPosPx, stageExitPx, lastStayEnd, stageExitEndT, true);
      ufoRotKeyframePcts.push(
        `${pctAt(stageExitEndT).toFixed(4)}% { transform: rotate(${stageExitAngle}deg); }`,
      );
      currentAngle = stageExitAngle;
      latestHoldEndT = stageExitEndT;

      const lastPosCell = funnelPositionsEarly[lastIdx];
      let prevCell = lastPosCell;
      let prevPx = stageExitPx;

      for (let k = 0; k < pickupCellsArr.length; k++) {
        const cell = pickupCellsArr[k];
        const arriveT = pickupArriveArr[k];

        const posPx = getCellCenterPx(gridLeftX, gridTopY, cell[0], cell[1]);
        const tx = posPx.x - UFO_WIDTH_PX / 2;
        const ty = posPx.y - UFO_WIDTH_PX / 2;
        const pctArrive = maxTotalTime > 0 ? (arriveT * 100) / maxTotalTime : 0;
        const flightFromPx =
          k === 0 ? { x: posPx.x, y: stageExitPx.y } : prevPx;
        const departT = Math.max(
          latestHoldEndT,
          arriveT -
            (k === 0 ? UFO_MOVE_MAX_S : travelSeconds(prevCell, cell)),
        );
        const pctDepart = pctAt(departT);
        const angle = headingFor(flightFromPx, posPx, currentAngle);

        addFlight(flightFromPx, posPx, departT, arriveT);
        ufoRotKeyframePcts.push(
          `${pctAt(Math.max(0, departT - TURN_LEAD_S)).toFixed(4)}% { transform: rotate(${currentAngle}deg); animation-timing-function: cubic-bezier(.2,.8,.2,1); }`,
        );
        ufoRotKeyframePcts.push(
          `${pctDepart.toFixed(4)}% { transform: rotate(${angle}deg); }`,
        );

        ufoRotKeyframePcts.push(
          `${pctArrive.toFixed(4)}% { transform: rotate(${angle}deg); }`,
        );

        const holdEndT = arriveT + pickupWait + pickupLight;
        latestHoldEndT = holdEndT;
        const pctHoldEnd =
          maxTotalTime > 0 ? (holdEndT * 100) / maxTotalTime : 0;
        ufoMoveKeyframePcts.push(
          `${pctHoldEnd.toFixed(4)}% { transform: translate(${tx}px, ${ty}px); }`,
        );
        ufoRotKeyframePcts.push(
          `${pctHoldEnd.toFixed(4)}% { transform: rotate(${angle}deg); }`,
        );

        currentAngle = angle;
        prevCell = cell;
        prevPx = posPx;
      }
    }

    let exitFromTx = stageExitPx.x - UFO_WIDTH_PX / 2;
    let exitFromTy = stageExitPx.y - UFO_WIDTH_PX / 2;
    let exitFromAngle = currentAngle;
    if (
      sweepPositionsArr.length > 0 &&
      sweepArriveArr.length === sweepPositionsArr.length &&
      signatureCellsArr.length > 0 &&
      paintStartAbsS != null &&
      paintSweepDuration > 0
    ) {
      const prevPxSweep =
        pickupCellsArr.length > 0
          ? getCellCenterPx(
              gridLeftX,
              gridTopY,
              pickupCellsArr[pickupCellsArr.length - 1][0],
              pickupCellsArr[pickupCellsArr.length - 1][1],
            )
          : getCellCenterPx(
              gridLeftX,
              gridTopY,
              funnelPositionsEarly[lastIdx][0],
              funnelPositionsEarly[lastIdx][1],
            );
      const firstSweepT = sweepArriveArr[0];
      const SWEEP_APPROACH_S = 0.3;
      const approachT = Math.max(
        latestHoldEndT,
        firstSweepT - SWEEP_APPROACH_S,
      );
      const centerCell = sweepPositionsArr[0];
      const centerPx = getCellCenterPx(
        gridLeftX,
        gridTopY,
        centerCell[0],
        centerCell[1],
      );
      const approachAngle = headingFor(
        prevPxSweep,
        centerPx,
        currentAngle,
      );
      ufoMoveKeyframePcts.push(
        `${pctAt(approachT).toFixed(4)}% { transform: translate(${prevPxSweep.x - ufoCenter}px, ${prevPxSweep.y - ufoCenter}px); }`,
      );
      ufoRotKeyframePcts.push(
        `${pctAt(Math.max(0, approachT - TURN_LEAD_S)).toFixed(4)}% { transform: rotate(${currentAngle}deg); animation-timing-function: cubic-bezier(.2,.8,.2,1); }`,
        `${pctAt(approachT).toFixed(4)}% { transform: rotate(${approachAngle}deg); }`,
      );
      addFlight(prevPxSweep, centerPx, approachT, firstSweepT, true);
      ufoMoveKeyframePcts.push(
        `${pctAt(exitStartAbsS ?? firstSweepT).toFixed(4)}% { transform: translate(${centerPx.x - ufoCenter}px, ${centerPx.y - ufoCenter}px); }`,
      );
      ufoRotKeyframePcts.push(
        `${pctAt(firstSweepT).toFixed(4)}% { transform: rotate(${approachAngle}deg); }`,
        `${pctAt(Math.max(firstSweepT, paintStartAbsS - TURN_LEAD_S)).toFixed(4)}% { transform: rotate(${approachAngle}deg); animation-timing-function: cubic-bezier(.2,.8,.2,1); }`,
        `${pctAt(paintStartAbsS).toFixed(4)}% { transform: rotate(0deg); }`,
        `${pctAt(exitStartAbsS ?? paintStartAbsS + paintSweepDuration).toFixed(4)}% { transform: rotate(0deg); }`,
      );
      signaturePulse = {
        x: centerPx.x,
        y: centerPx.y,
        start: paintStartAbsS,
        duration: paintSweepDuration,
      };
      exitFromTx = centerPx.x - ufoCenter;
      exitFromTy = centerPx.y - ufoCenter;
      exitFromAngle = 0;
      currentAngle = 0;
    }

    const exitStartT = exitStartAbsS ?? maxTotalTime - ufoExitS;
    const exitEndT = exitEndAbsS ?? maxTotalTime;
    const exitStartPct = Math.min(
      99.5,
      (exitStartT * 100) / maxTotalTime,
    );
    const exitAngle = headingFor(
      { x: exitFromTx, y: exitFromTy },
      { x: exitFromTx, y: entryY },
      currentAngle,
    );
    ufoMoveKeyframePcts.push(
      `${exitStartPct.toFixed(4)}% { transform: translate(${exitFromTx}px, ${exitFromTy}px); }`,
    );
    ufoRotKeyframePcts.push(
      `${pctAt(Math.max(0, exitStartT - TURN_LEAD_S)).toFixed(4)}% { transform: rotate(${exitFromAngle}deg); animation-timing-function: cubic-bezier(.2,.8,.2,1); }`,
    );
    ufoRotKeyframePcts.push(
      `${exitStartPct.toFixed(4)}% { transform: rotate(${exitAngle}deg); }`,
    );
    ufoMoveKeyframePcts.push(
      `${pctAt(exitEndT).toFixed(4)}% { transform: translate(${exitFromTx}px, ${entryY}px); }`,
    );
    ufoRotKeyframePcts.push(
      `${pctAt(exitEndT).toFixed(4)}% { transform: rotate(${exitAngle}deg); }`,
    );
    ufoMoveKeyframePcts.push(
      `100% { transform: translate(${exitFromTx}px, ${entryY}px); }`,
    );
    ufoRotKeyframePcts.push(`100% { transform: rotate(${exitAngle}deg); }`);
  }
  const firstPos = funnelPositionsEarly[0] ?? [0, 0];
  const firstPosPx = getCellCenterPx(
    gridLeftX,
    gridTopY,
    firstPos[0],
    firstPos[1],
  );
  const hasUfo = ufoMoveKeyframePcts.length > 0;
  const gridWaveMetrics = getGridWaveMetrics(maxX, maxY);
  const gridWavePhase = (x: number, y: number) =>
    getGridWavePhase(x, y, gridWaveMetrics);
  const signaturePulseKeyframes =
    signaturePulse != null
      ? `
  ${Array.from({ length: gridWaveMetrics.maxPhase + 1 }, (_, phase) => {
    const step = signaturePulse.duration / gridWaveMetrics.maxPhase;
    const hit = signaturePulse.start + phase * step;
    const on = Math.max(signaturePulse.start, hit - 0.02);
    const peak = phase === 0 ? hit + 0.02 : hit;
    const wake = hit + 0.05;
    const off = hit + 0.12;
    const distance = phase / gridWaveMetrics.phaseScale;
    const peakOpacity = Math.max(
      0.14,
      0.5 / Math.sqrt(1 + distance * 0.35),
    );
    const wakeOpacity = peakOpacity * 0.28;
    return `@keyframes signature-grid-wave-${phase} {
    0% { opacity: 0; }
    ${pctAt(on).toFixed(4)}% { opacity: 0; }
    ${pctAt(peak).toFixed(4)}% { opacity: ${peakOpacity.toFixed(3)}; }
    ${pctAt(wake).toFixed(4)}% { opacity: ${wakeOpacity.toFixed(3)}; }
    ${pctAt(off).toFixed(4)}% { opacity: 0; }
    100% { opacity: 0; }
  }`;
  }).join("\n  ")}
  @keyframes signature-core {
    0% { opacity: 0; transform: translate(${signaturePulse.x}px, ${signaturePulse.y}px) scale(.6); }
    ${pctAt(Math.max(0, signaturePulse.start - 0.08)).toFixed(4)}% { opacity: 0; transform: translate(${signaturePulse.x}px, ${signaturePulse.y}px) scale(.6); }
    ${pctAt(signaturePulse.start).toFixed(4)}% { opacity: .9; transform: translate(${signaturePulse.x}px, ${signaturePulse.y}px) scale(1); }
    ${pctAt(signaturePulse.start + 0.16).toFixed(4)}% { opacity: 0; transform: translate(${signaturePulse.x}px, ${signaturePulse.y}px) scale(1.15); }
    100% { opacity: 0; }
  }`
      : "";
  const ufoKeyframesStr = hasUfo
    ? `
  @keyframes ufo-move {
    ${ufoMoveKeyframePcts.join("\n    ")}
  }
  @keyframes ufo-rot {
    ${ufoRotKeyframePcts.join("\n    ")}
  }
  @keyframes ufo-streak {
    0% { opacity: 0; transform: scaleY(.2); }
    ${ufoStreakFrames
      .sort((a, b) => a.t - b.t)
      .map(
        (frame) =>
          `${pctAt(frame.t).toFixed(4)}% { opacity: ${frame.opacity}; transform: scaleY(${frame.scale}); }`,
      )
      .join("\n    ")}
    100% { opacity: 0; transform: scaleY(.2); }
  }
  @keyframes ufo-visibility {
    ${ufoVisibilityFrames
      .sort((a, b) => a.t - b.t)
      .map(
        (frame) =>
          `${pctAt(frame.t).toFixed(4)}% { opacity: ${frame.opacity}; }`,
      )
      .join("\n    ")}
    100% { opacity: 1; }
  }
  ${signaturePulseKeyframes}`
    : "";

  const lightKeyframeEntries: { pct: number; opacity: number }[] = [];
  for (let i = 0; i < funnelPositionsEarly.length; i++) {
    const tArrive = arriveAbsS[i] ?? spawnAbsS[i] ?? 0;
    const tBeamOn = tArrive + beamDelayS;
    const tBeamFull = tBeamOn + lightRampS;

    const pctOn = maxTotalTime > 0 ? (tBeamOn * 100) / maxTotalTime : 0;
    const pctFull = maxTotalTime > 0 ? (tBeamFull * 100) / maxTotalTime : 0;

    const leave = ufoLeaveAbsS[i] ?? moveStartAbsS[i] ?? tBeamFull;
    const pctMoveStart = maxTotalTime > 0 ? (leave * 100) / maxTotalTime : 0;
    const lightOffComplete = leave + lightFadeOutS;
    const pctOff =
      maxTotalTime > 0 ? (lightOffComplete * 100) / maxTotalTime : 0;
    lightKeyframeEntries.push({ pct: pctOn, opacity: 0 });
    lightKeyframeEntries.push({ pct: pctFull, opacity: 0.07 });
    lightKeyframeEntries.push({ pct: pctMoveStart, opacity: 0.16 });
    lightKeyframeEntries.push({ pct: pctOff, opacity: 0 });
  }
  if (relocation) {
    lightKeyframeEntries.push(
      { pct: pctAt(relocation.pickupArriveAbsS), opacity: 0 },
      { pct: pctAt(relocation.pickupArriveAbsS + 0.04), opacity: 0.2 },
      { pct: pctAt(relocation.flightStartAbsS), opacity: 0.08 },
      { pct: pctAt(relocation.dropArriveAbsS), opacity: 0.08 },
      { pct: pctAt(relocation.releaseAbsS - 0.04), opacity: 0.2 },
      { pct: pctAt(relocation.releaseAbsS), opacity: 0 },
    );
  }

  if (
    pickupCellsArr.length > 0 &&
    pickupArriveArr.length === pickupCellsArr.length
  ) {
    for (let k = 0; k < pickupCellsArr.length; k++) {
      const arriveT = pickupArriveArr[k] ?? 0;

      const tOn = arriveT + pickupWait;
      const tOff = tOn + pickupLight;

      const pArrive = maxTotalTime > 0 ? (arriveT * 100) / maxTotalTime : 0;
      const pOn = maxTotalTime > 0 ? (tOn * 100) / maxTotalTime : 0;
      const pOff = maxTotalTime > 0 ? (tOff * 100) / maxTotalTime : 0;

      lightKeyframeEntries.push({ pct: pArrive, opacity: 0 });
      lightKeyframeEntries.push({ pct: pOn, opacity: 0.12 + k * 0.02 });
      lightKeyframeEntries.push({ pct: pOff, opacity: 0 });
    }
  }
  if (paintStartAbsS != null && paintSweepDuration > 0) {
    lightKeyframeEntries.push(
      { pct: pctAt(Math.max(0, paintStartAbsS - 0.18)), opacity: 0 },
      { pct: pctAt(Math.max(0, paintStartAbsS - 0.03)), opacity: 0.42 },
      { pct: pctAt(paintStartAbsS), opacity: 0.2 },
      { pct: pctAt(paintStartAbsS + 0.18), opacity: 0.08 },
      {
        pct: pctAt(paintStartAbsS + paintSweepDuration),
        opacity: 0.06,
      },
      {
        pct: pctAt(paintStartAbsS + paintSweepDuration + 0.12),
        opacity: 0,
      },
    );
  }
  lightKeyframeEntries.push({ pct: 0, opacity: 0 }, { pct: 100, opacity: 0 });
  lightKeyframeEntries.sort((a, b) => a.pct - b.pct);
  const deduped: { pct: number; opacity: number }[] = [];
  for (const e of lightKeyframeEntries) {
    if (deduped.length === 0 || deduped[deduped.length - 1].pct !== e.pct)
      deduped.push(e);
  }
  const ufoLightKeyframesStr =
    funnelPositionsEarly.length > 0 && deduped.length > 0
      ? `
  @keyframes ufo-light {
    ${deduped.map((e) => `${e.pct.toFixed(4)}% { opacity: ${e.opacity}; }`).join("\n    ")}
  }`
      : "";

  const glowR = UFO_WIDTH_PX * 0.48;
  const gridWaveCells = signaturePulse
    ? Array.from({ length: maxX + 1 }, (_, x) =>
        Array.from({ length: maxY + 1 }, (_, y) => {
          const px = gridLeftX + x * (CELL_SIZE + GAP);
          const py = gridTopY + y * (CELL_SIZE + GAP);
          const phase = gridWavePhase(x, y);
          return `<rect class="signature-grid-wave-cell" x="${px}" y="${py}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="2" fill="var(--gm-level-3)" style="opacity:0; animation:signature-grid-wave-${phase} ${animationDuration}s linear 0s 1 both;"/>`;
        }).join(""),
      ).join("")
    : "";
  const signatureGroupStr = signaturePulse
    ? `<g class="signature-reveal" aria-hidden="true" pointer-events="none"><g class="signature-grid-wave">${gridWaveCells}</g><g class="signature-core" style="opacity:0; transform-box:view-box; transform-origin:0 0; animation:signature-core ${animationDuration}s cubic-bezier(.2,.8,.2,1) 0s 1 both;"><rect x="-5" y="-5" width="10" height="10" rx="2" fill="var(--gm-beam-core)" opacity=".75"/><path d="M0-3L3 0 0 3-3 0Z" fill="var(--gm-level-4)"/></g></g>`
    : "";
  const ufoGroupStr = hasUfo
    ? `${signatureGroupStr}<g class="ufo-move" style="transform:translate(${firstPosPx.x - UFO_WIDTH_PX / 2}px, ${entryY}px); animation:ufo-move ${animationDuration}s cubic-bezier(.12,.72,.2,1) 0s 1 both, ufo-visibility ${animationDuration}s linear 0s 1 both;">
        <g class="ufo-rot" style="transform-box:fill-box; transform-origin:center; animation:ufo-rot ${animationDuration}s cubic-bezier(.12,.72,.2,1) 0s 1 both;">
          <path class="ufo-streak" d="M12 11 Q16 -20 20 11 Q16 7 12 11Z" fill="var(--gm-level-3)" style="opacity:0; transform-origin:16px 11px; animation:ufo-streak ${animationDuration}s linear 0s 1 both; pointer-events:none;"/>
          <svg width="${UFO_WIDTH_PX}" height="${UFO_WIDTH_PX}" viewBox="${UFO_VIEWBOX}" x="0" y="0">${UFO_CONTENT}</svg>
          <circle cx="${ufoCenter}" cy="${ufoCenter}" r="${glowR}" fill="var(--gm-level-3)" style="opacity:0; animation:ufo-light ${animationDuration}s ease-out 0s 1 both; pointer-events:none;"/>
        </g>
      </g>`
    : "";

  const RIPPLE_STEP_S = 0.06;
  const RIPPLE_OPACITY_PEAK = 0.1;
  const RIPPLE_OPACITY_EDGE = 0.035;
  const RIPPLE_RAMP_S = 0.03;
  type RippleStop = {
    cx: number;
    cy: number;
    tBeamOn: number;
  };
  const rippleStops: RippleStop[] = [];
  for (let i = 0; i < funnelPositionsEarly.length; i++) {
    const [cx, cy] = funnelPositionsEarly[i];
    const tBeamOn = (arriveAbsS[i] ?? spawnAbsS[i] ?? 0) + beamDelayS;
    rippleStops.push({ cx, cy, tBeamOn });
  }
  if (
    pickupCellsArr.length > 0 &&
    pickupArriveArr.length === pickupCellsArr.length
  ) {
    for (let k = 0; k < pickupCellsArr.length; k++) {
      const [cx, cy] = pickupCellsArr[k];
      const tBeamOn = (pickupArriveArr[k] ?? 0) + pickupWait;
      rippleStops.push({ cx, cy, tBeamOn });
    }
  }
  const rippleKeyframes: string[] = [];
  const rippleRects: string[] = [];
  if (hasUfo && rippleStops.length > 0 && maxTotalTime > 0) {
    const pctRamp = (RIPPLE_RAMP_S / maxTotalTime) * 100;
    for (let idx = 0; idx < rippleStops.length; idx++) {
      const { cx, cy, tBeamOn } = rippleStops[idx];
      const maxRing = 2;
      const rippleStepS = RIPPLE_STEP_S;
      for (let ring = 1; ring <= maxRing; ring++) {
        const entries: { pct: number; opacity: number }[] = [];
        const tOn = tBeamOn + (ring - 1) * rippleStepS;
        const tOff = tOn + rippleStepS;
        const pctOn = (tOn / maxTotalTime) * 100;
        const pctOff = (tOff / maxTotalTime) * 100;
        const pIn = Math.max(0, pctOn - pctRamp);
        const pOut = Math.min(100, pctOff + pctRamp);
        const mid = (pctOn + pctOff) / 2;
        entries.push({ pct: pIn, opacity: 0 });
        entries.push({ pct: pctOn, opacity: RIPPLE_OPACITY_EDGE });
        entries.push({ pct: mid, opacity: RIPPLE_OPACITY_PEAK });
        entries.push({ pct: pctOff, opacity: RIPPLE_OPACITY_EDGE });
        entries.push({ pct: pOut, opacity: 0 });
        entries.sort((a, b) => a.pct - b.pct);
        const dedupedRipple: { pct: number; opacity: number }[] = [];
        for (const e of entries) {
          if (
            dedupedRipple.length > 0 &&
            dedupedRipple[dedupedRipple.length - 1].pct >= e.pct - 0.0001
          )
            dedupedRipple[dedupedRipple.length - 1] = e;
          else dedupedRipple.push(e);
        }
        const name = `ufo-ripple-${idx}-${ring}`;
        rippleKeyframes.push(`
  @keyframes ${name} {
    0% { opacity: 0; }
    ${dedupedRipple.map((e) => `${e.pct.toFixed(4)}% { opacity: ${e.opacity}; }`).join("\n    ")}
    100% { opacity: 0; }
  }`);
        const cells = getRippleRingCells(cx, cy, ring, maxX, maxY);
        for (const [c, row] of cells) {
          const px = gridLeftX + c * (CELL_SIZE + GAP);
          const py = gridTopY + row * (CELL_SIZE + GAP);
          rippleRects.push(
            `<rect x="${px}" y="${py}" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="#a8e6cf" style="opacity:0; animation: ${name} ${animationDuration}s linear 0s 1 both; pointer-events: none;"/>`,
          );
        }
      }
    }
  }
  const ufoRippleKeyframesStr = rippleKeyframes.join("");
  const ufoRippleGroupStr =
    rippleRects.length > 0
      ? `<g class="ufo-ripple" aria-hidden="true">${rippleRects.join("")}</g>`
      : "";

  return {
    ufoKeyframesStr,
    ufoLightKeyframesStr,
    ufoGroupStr,
    ufoRippleKeyframesStr,
    ufoRippleGroupStr,
  };
}
