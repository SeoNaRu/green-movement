import {
  CELL_SIZE,
  GAP,
  UFO_TILT_DEG,
  UFO_VIEWBOX,
  UFO_WIDTH_PX,
  UFO_CONTENT,
} from "../../constants.js";
import { getCellCenterPx } from "../../gridLayout.js";

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
  readyAbsS: number[];
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
  paintSweepDuration?: number;
  paintCenterCol?: number;
  paintCenterRow?: number;
}): {
  ufoKeyframesStr: string;
  ufoLightKeyframesStr: string;
  ufoGroupStr: string;
  ufoRippleKeyframesStr: string;
  ufoRippleGroupStr: string;
} {
  const {
    funnelPositionsEarly,
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
    readyAbsS,
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
    paintSweepDuration = 0,
    paintCenterCol = 0,
    paintCenterRow = 0,
  } = params;

  const pickupCellsArr = pickupCells ?? [];
  const pickupArriveArr = pickupArriveAbsS ?? [];
  const sweepPositionsArr = sweepPositions ?? [];
  const sweepArriveArr = sweepArriveAbsS ?? [];
  const pickupWait = pickupWaitS ?? 0.35;
  const pickupLight = pickupLightS ?? 0.22;

  const ufoCenter = UFO_WIDTH_PX / 2;
  const dirAngle = (
    fromPx: { x: number; y: number },
    toPx: { x: number; y: number },
  ) => {
    const dx = toPx.x - fromPx.x;
    const dy = toPx.y - fromPx.y;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return 0;
    return (Math.atan2(dy, dx) * 180) / Math.PI - 90;
  };

  const PERSPECTIVE_PX = 800;
  const bankForDelta = (
    fromPx: { x: number; y: number },
    toPx: { x: number; y: number },
  ): string => {
    const dx = toPx.x - fromPx.x;
    const dy = toPx.y - fromPx.y;
    let rx = 0;
    let ry = 0;

    if (Math.abs(dx) >= Math.abs(dy)) {
      ry = dx > 0 ? -UFO_BANK_DEG : UFO_BANK_DEG;
    } else {
      rx = dy > 0 ? UFO_BANK_DEG : -UFO_BANK_DEG;
    }

    return `perspective(${PERSPECTIVE_PX}px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  };

  const UFO_BANK_DEG = UFO_TILT_DEG;
  const ufoMoveKeyframePcts: string[] = [];
  const ufoRotKeyframePcts: string[] = [];
  const ufoBankKeyframePcts: string[] = [];
  if (funnelPositionsEarly.length > 0) {
    const pos0 = getCellCenterPx(
      gridLeftX,
      gridTopY,
      funnelPositionsEarly[0][0],
      funnelPositionsEarly[0][1],
    );
    const x0 = pos0.x - UFO_WIDTH_PX / 2;
    const y0 = pos0.y - UFO_WIDTH_PX / 2;
    const entryY = y0 - 60;
    const entryAngle = 0;
    ufoMoveKeyframePcts.push(
      `0% { transform: translate(${x0}px, ${entryY}px); }`,
    );
    ufoRotKeyframePcts.push(`0% { transform: rotate(${entryAngle}deg); }`);
    const arrive0 = arriveAbsS[0] ?? ufoEntryS;
    const pctArrive0 = maxTotalTime > 0 ? (arrive0 * 100) / maxTotalTime : 0;
    const angle0 =
      funnelPositionsEarly.length > 1
        ? dirAngle(
            { x: x0 + ufoCenter, y: entryY + ufoCenter },
            { x: pos0.x, y: pos0.y },
          )
        : 0;
    ufoMoveKeyframePcts.push(
      `${pctArrive0.toFixed(4)}% { transform: translate(${x0}px, ${y0}px); }`,
    );
    ufoRotKeyframePcts.push(
      `${pctArrive0.toFixed(4)}% { transform: rotate(${angle0}deg); }`,
    );
    const stayEnd0 = ufoLeaveAbsS[0] ?? 0;
    const pctStayEnd0 = maxTotalTime > 0 ? (stayEnd0 * 100) / maxTotalTime : 0;
    if (funnelPositionsEarly.length > 1 && pctStayEnd0 < 99.99) {
      ufoMoveKeyframePcts.push(
        `${pctStayEnd0.toFixed(4)}% { transform: translate(${x0}px, ${y0}px); }`,
      );
      ufoRotKeyframePcts.push(
        `${pctStayEnd0.toFixed(4)}% { transform: rotate(${angle0}deg); }`,
      );
      const nextPos = getCellCenterPx(
        gridLeftX,
        gridTopY,
        funnelPositionsEarly[1][0],
        funnelPositionsEarly[1][1],
      );
      const arrive1 = arriveAbsS[1] ?? stayEnd0;
      const pctArrive1 = maxTotalTime > 0 ? (arrive1 * 100) / maxTotalTime : 0;
      const angle1 = dirAngle(pos0, nextPos);
      const bankTf1 = bankForDelta(pos0, nextPos);
      const startTiltPct = Math.min(
        pctArrive1 - 0.0001,
        pctStayEnd0 + 0.15 * (pctArrive1 - pctStayEnd0),
      );
      ufoRotKeyframePcts.push(
        `${startTiltPct.toFixed(4)}% { transform: rotate(${angle1}deg); }`,
      );
      const midPct = (pctStayEnd0 + pctArrive1) / 2;
      const endTiltPct = Math.min(
        pctArrive1 - 0.0001,
        pctStayEnd0 + 0.85 * (pctArrive1 - pctStayEnd0),
      );
      const nextX = nextPos.x - UFO_WIDTH_PX / 2;
      const nextY = nextPos.y - UFO_WIDTH_PX / 2;
      const midX = (x0 + nextX) / 2;
      const midY = (y0 + nextY) / 2;
      ufoMoveKeyframePcts.push(
        `${midPct.toFixed(4)}% { transform: translate(${midX}px, ${midY}px); }`,
      );
      ufoRotKeyframePcts.push(
        `${midPct.toFixed(4)}% { transform: rotate(${angle1}deg); }`,
      );
      ufoMoveKeyframePcts.push(
        `${pctArrive1.toFixed(4)}% { transform: translate(${nextPos.x - UFO_WIDTH_PX / 2}px, ${nextPos.y - UFO_WIDTH_PX / 2}px); }`,
      );
      ufoRotKeyframePcts.push(
        `${pctArrive1.toFixed(4)}% { transform: rotate(${angle1}deg); }`,
      );
      const bankReset = `perspective(${PERSPECTIVE_PX}px) rotateX(0deg) rotateY(0deg)`;
      ufoBankKeyframePcts.push(
        `${pctStayEnd0.toFixed(4)}% { transform: ${bankReset}; }`,
      );
      ufoBankKeyframePcts.push(
        `${startTiltPct.toFixed(4)}% { transform: ${bankTf1}; }`,
      );
      ufoBankKeyframePcts.push(
        `${midPct.toFixed(4)}% { transform: ${bankTf1}; }`,
      );
      ufoBankKeyframePcts.push(
        `${endTiltPct.toFixed(4)}% { transform: ${bankReset}; }`,
      );
      ufoBankKeyframePcts.push(
        `${pctArrive1.toFixed(4)}% { transform: ${bankReset}; }`,
      );
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
      const cx = currPos.x - UFO_WIDTH_PX / 2;
      const cy = currPos.y - UFO_WIDTH_PX / 2;
      const angleI = dirAngle(
        getCellCenterPx(
          gridLeftX,
          gridTopY,
          funnelPositionsEarly[i - 1][0],
          funnelPositionsEarly[i - 1][1],
        ),
        currPos,
      );
      ufoMoveKeyframePcts.push(
        `${pctStayEndI.toFixed(4)}% { transform: translate(${cx}px, ${cy}px); }`,
      );
      ufoRotKeyframePcts.push(
        `${pctStayEndI.toFixed(4)}% { transform: rotate(${angleI}deg); }`,
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
      const angleNext = dirAngle(currPos, nextPos);
      if (pctArriveNext <= 100) {
        const bankTf = bankForDelta(currPos, nextPos);
        const startTiltPct = Math.min(
          pctArriveNext - 0.0001,
          pctStayEndI + 0.15 * (pctArriveNext - pctStayEndI),
        );
        ufoRotKeyframePcts.push(
          `${startTiltPct.toFixed(4)}% { transform: rotate(${angleNext}deg); }`,
        );
        const midPct = (pctStayEndI + pctArriveNext) / 2;
        const endTiltPct = Math.min(
          pctArriveNext - 0.0001,
          pctStayEndI + 0.85 * (pctArriveNext - pctStayEndI),
        );
        const midX = cx + (nextPos.x - UFO_WIDTH_PX / 2 - cx) * 0.5;
        const midY = cy + (nextPos.y - UFO_WIDTH_PX / 2 - cy) * 0.5;
        ufoMoveKeyframePcts.push(
          `${midPct.toFixed(4)}% { transform: translate(${midX}px, ${midY}px); }`,
        );
        ufoRotKeyframePcts.push(
          `${midPct.toFixed(4)}% { transform: rotate(${angleNext}deg); }`,
        );
        ufoMoveKeyframePcts.push(
          `${pctArriveNext.toFixed(4)}% { transform: translate(${nextPos.x - UFO_WIDTH_PX / 2}px, ${nextPos.y - UFO_WIDTH_PX / 2}px); }`,
        );
        ufoRotKeyframePcts.push(
          `${pctArriveNext.toFixed(4)}% { transform: rotate(${angleNext}deg); }`,
        );
        const bankReset = `perspective(${PERSPECTIVE_PX}px) rotateX(0deg) rotateY(0deg)`;
        ufoBankKeyframePcts.push(
          `${pctStayEndI.toFixed(4)}% { transform: ${bankReset}; }`,
        );
        ufoBankKeyframePcts.push(
          `${startTiltPct.toFixed(4)}% { transform: ${bankTf}; }`,
        );
        ufoBankKeyframePcts.push(
          `${midPct.toFixed(4)}% { transform: ${bankTf}; }`,
        );
        ufoBankKeyframePcts.push(
          `${endTiltPct.toFixed(4)}% { transform: ${bankReset}; }`,
        );
        ufoBankKeyframePcts.push(
          `${pctArriveNext.toFixed(4)}% { transform: ${bankReset}; }`,
        );
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
    const lastSegAngle =
      lastIdx >= 1
        ? dirAngle(
            getCellCenterPx(
              gridLeftX,
              gridTopY,
              funnelPositionsEarly[lastIdx - 1][0],
              funnelPositionsEarly[lastIdx - 1][1],
            ),
            lastPosPx,
          )
        : 0;
    const lastTx = lastPosPx.x - UFO_WIDTH_PX / 2;
    const lastTy = lastPosPx.y - UFO_WIDTH_PX / 2;
    ufoMoveKeyframePcts.push(
      `${pctLastStay.toFixed(4)}% { transform: translate(${lastTx}px, ${lastTy}px); }`,
    );
    ufoRotKeyframePcts.push(
      `${pctLastStay.toFixed(4)}% { transform: rotate(${lastSegAngle}deg); }`,
    );
    if (
      pickupCellsArr.length > 0 &&
      pickupArriveArr.length === pickupCellsArr.length
    ) {
      const lastPosCell = funnelPositionsEarly[lastIdx];
      let prevPx = getCellCenterPx(
        gridLeftX,
        gridTopY,
        lastPosCell[0],
        lastPosCell[1],
      );

      for (let k = 0; k < pickupCellsArr.length; k++) {
        const cell = pickupCellsArr[k];
        const arriveT = pickupArriveArr[k];

        const posPx = getCellCenterPx(gridLeftX, gridTopY, cell[0], cell[1]);
        const tx = posPx.x - UFO_WIDTH_PX / 2;
        const ty = posPx.y - UFO_WIDTH_PX / 2;
        const pctArrive = maxTotalTime > 0 ? (arriveT * 100) / maxTotalTime : 0;

        ufoMoveKeyframePcts.push(
          `${pctArrive.toFixed(4)}% { transform: translate(${tx}px, ${ty}px); }`,
        );

        const angle = dirAngle(prevPx, posPx);
        ufoRotKeyframePcts.push(
          `${pctArrive.toFixed(4)}% { transform: rotate(${angle}deg); }`,
        );

        const holdEndT = arriveT + pickupWait + pickupLight;
        const pctHoldEnd =
          maxTotalTime > 0 ? (holdEndT * 100) / maxTotalTime : 0;
        ufoMoveKeyframePcts.push(
          `${pctHoldEnd.toFixed(4)}% { transform: translate(${tx}px, ${ty}px); }`,
        );
        ufoRotKeyframePcts.push(
          `${pctHoldEnd.toFixed(4)}% { transform: rotate(${angle}deg); }`,
        );

        const bankTfPickup = bankForDelta(prevPx, posPx);
        const bankReset = `perspective(${PERSPECTIVE_PX}px) rotateX(0deg) rotateY(0deg)`;
        ufoBankKeyframePcts.push(
          `${pctArrive.toFixed(4)}% { transform: ${bankReset}; }`,
        );
        const midPickupPct = (pctArrive + pctHoldEnd) / 2;
        ufoBankKeyframePcts.push(
          `${midPickupPct.toFixed(4)}% { transform: ${bankTfPickup}; }`,
        );
        ufoBankKeyframePcts.push(
          `${pctHoldEnd.toFixed(4)}% { transform: ${bankReset}; }`,
        );

        prevPx = posPx;
      }
    }

    let exitFromTx = lastTx;
    let exitFromTy = lastTy;
    let exitFromAngle = lastSegAngle;
    if (
      sweepPositionsArr.length > 0 &&
      sweepArriveArr.length === sweepPositionsArr.length
    ) {
      let prevPxSweep =
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
      const SWEEP_APPROACH_S = 0.25;
      const approachT = Math.max(0, firstSweepT - SWEEP_APPROACH_S);
      const approachPct =
        maxTotalTime > 0 ? (approachT * 100) / maxTotalTime : 0;
      const approachTx = prevPxSweep.x - UFO_WIDTH_PX / 2;
      const approachTy = prevPxSweep.y - UFO_WIDTH_PX / 2;
      const firstSweepPx = getCellCenterPx(
        gridLeftX,
        gridTopY,
        sweepPositionsArr[0][0],
        sweepPositionsArr[0][1],
      );
      const approachAngle = dirAngle(prevPxSweep, firstSweepPx);
      ufoMoveKeyframePcts.push(
        `${approachPct.toFixed(4)}% { transform: translate(${approachTx}px, ${approachTy}px); }`,
      );
      ufoRotKeyframePcts.push(
        `${approachPct.toFixed(4)}% { transform: rotate(${approachAngle}deg); }`,
      );
      for (let s = 0; s < sweepPositionsArr.length; s++) {
        const cell = sweepPositionsArr[s];
        const arriveT = sweepArriveArr[s];
        const posPx = getCellCenterPx(gridLeftX, gridTopY, cell[0], cell[1]);
        const tx = posPx.x - UFO_WIDTH_PX / 2;
        const ty = posPx.y - UFO_WIDTH_PX / 2;
        const pctArrive = maxTotalTime > 0 ? (arriveT * 100) / maxTotalTime : 0;
        const angle = dirAngle(prevPxSweep, posPx);
        ufoMoveKeyframePcts.push(
          `${pctArrive.toFixed(4)}% { transform: translate(${tx}px, ${ty}px); }`,
        );
        ufoRotKeyframePcts.push(
          `${pctArrive.toFixed(4)}% { transform: rotate(${angle}deg); }`,
        );
        const bankTf = bankForDelta(prevPxSweep, posPx);
        const bankReset = `perspective(${PERSPECTIVE_PX}px) rotateX(0deg) rotateY(0deg)`;
        ufoBankKeyframePcts.push(
          `${pctArrive.toFixed(4)}% { transform: ${bankReset}; }`,
        );
        ufoBankKeyframePcts.push(
          `${(pctArrive + 0.01).toFixed(4)}% { transform: ${bankTf}; }`,
        );
        ufoBankKeyframePcts.push(
          `${(pctArrive + 0.02).toFixed(4)}% { transform: ${bankReset}; }`,
        );
        exitFromTx = tx;
        exitFromTy = ty;
        exitFromAngle = angle;
        prevPxSweep = posPx;
      }
    }

    const exitStartPct = Math.min(
      99.5,
      ((maxTotalTime - ufoExitS) * 100) / maxTotalTime,
    );
    ufoMoveKeyframePcts.push(
      `${exitStartPct.toFixed(4)}% { transform: translate(${exitFromTx}px, ${exitFromTy}px); }`,
    );
    ufoRotKeyframePcts.push(
      `${exitStartPct.toFixed(4)}% { transform: rotate(${exitFromAngle}deg); }`,
    );
    ufoMoveKeyframePcts.push(
      `100% { transform: translate(${exitFromTx}px, ${entryY}px); }`,
    );
    ufoRotKeyframePcts.push(`100% { transform: rotate(${entryAngle}deg); }`);
  }
  const firstPos = funnelPositionsEarly[0];
  const firstPosPx = getCellCenterPx(
    gridLeftX,
    gridTopY,
    firstPos[0],
    firstPos[1],
  );
  const entryY = firstPosPx.y - UFO_WIDTH_PX / 2 - 60;
  if (ufoBankKeyframePcts.length > 0) {
    const bankReset = `perspective(${PERSPECTIVE_PX}px) rotateX(0deg) rotateY(0deg)`;
    ufoBankKeyframePcts.unshift(`0% { transform: ${bankReset}; }`);
    ufoBankKeyframePcts.push(`100% { transform: ${bankReset}; }`);
  }

  const hasUfo = ufoMoveKeyframePcts.length > 0;
  const ufoKeyframesStr = hasUfo
    ? `
  @keyframes ufo-move {
    ${ufoMoveKeyframePcts.join("\n    ")}
  }
  @keyframes ufo-rot {
    ${ufoRotKeyframePcts.join("\n    ")}
  }`
    : "";

  const lightKeyframeEntries: { pct: number; opacity: number }[] = [];
  for (let i = 0; i < funnelPositionsEarly.length; i++) {
    const tArrive = arriveAbsS[i] ?? spawnAbsS[i] ?? 0;
    const tBeamOn = tArrive + beamDelayS;
    const tBeamFull = tBeamOn + lightRampS;

    const pctOn = maxTotalTime > 0 ? (tBeamOn * 100) / maxTotalTime : 0;
    const pctFull = maxTotalTime > 0 ? (tBeamFull * 100) / maxTotalTime : 0;

    const moveStart = moveStartAbsS[i] ?? tBeamFull;
    const pctMoveStart =
      maxTotalTime > 0 ? (moveStart * 100) / maxTotalTime : 0;
    const lightOffComplete = moveStart + lightFadeOutS;
    const pctOff =
      maxTotalTime > 0 ? (lightOffComplete * 100) / maxTotalTime : 0;
    lightKeyframeEntries.push({ pct: pctOn, opacity: 0 });
    lightKeyframeEntries.push({ pct: pctFull, opacity: 0.1 });
    lightKeyframeEntries.push({ pct: pctMoveStart, opacity: 0.3 });
    lightKeyframeEntries.push({ pct: pctOff, opacity: 0 });
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
      lightKeyframeEntries.push({ pct: pOn, opacity: 0.12 });
      lightKeyframeEntries.push({ pct: pOff, opacity: 0 });
    }
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

  const glowR = UFO_WIDTH_PX * 0.7;
  const ufoGroupStr = hasUfo
    ? `<g class="ufo-move" style="transform: translate(${firstPosPx.x - UFO_WIDTH_PX / 2}px, ${entryY}px); animation: ufo-move ${maxTotalTime}s linear 0s 1 both;">
        <g class="ufo-rot" style="transform-box: fill-box; transform-origin: center; animation: ufo-rot ${maxTotalTime}s linear 0s 1 both;">
          <svg width="${UFO_WIDTH_PX}" height="${UFO_WIDTH_PX}" viewBox="${UFO_VIEWBOX}" x="0" y="0">${UFO_CONTENT}</svg>
          <circle cx="${ufoCenter}" cy="${ufoCenter}" r="${glowR}" fill="#79c0ff" style="opacity: 0; animation: ufo-light ${maxTotalTime}s linear 0s 1 both; pointer-events: none;"/>
        </g>
      </g>`
    : "";

  const RIPPLE_STEP_S = 0.06;
  const RIPPLE_OPACITY_PEAK = 0.14;
  const RIPPLE_OPACITY_EDGE = 0.06;
  const RIPPLE_RAMP_S = 0.03;
  const RIPPLE_CYCLE_S = 0.7;
  type RippleStop = {
    cx: number;
    cy: number;
    tBeamOn: number;
    tLeave: number;
    fullGridWave?: boolean;
  };
  const rippleStops: RippleStop[] = [];
  for (let i = 0; i < funnelPositionsEarly.length; i++) {
    const [cx, cy] = funnelPositionsEarly[i];
    const tBeamOn = (arriveAbsS[i] ?? spawnAbsS[i] ?? 0) + beamDelayS;
    const tLeave = ufoLeaveAbsS[i] ?? tBeamOn + 1;
    rippleStops.push({ cx, cy, tBeamOn, tLeave });
  }
  if (
    pickupCellsArr.length > 0 &&
    pickupArriveArr.length === pickupCellsArr.length
  ) {
    for (let k = 0; k < pickupCellsArr.length; k++) {
      const [cx, cy] = pickupCellsArr[k];
      const tBeamOn = (pickupArriveArr[k] ?? 0) + pickupWait;
      const tLeave = tBeamOn + pickupLight;
      rippleStops.push({ cx, cy, tBeamOn, tLeave });
    }
  }
  if (
    sweepPositionsArr.length > 0 &&
    sweepArriveArr.length > 0 &&
    paintSweepDuration > 0
  ) {
    const [cx, cy] = sweepPositionsArr[0];
    const tBeamOn = sweepArriveArr[0];
    const tLeave = tBeamOn + paintSweepDuration;
    rippleStops.push({ cx, cy, tBeamOn, tLeave, fullGridWave: true });
  }
  const rippleKeyframes: string[] = [];
  const rippleRects: string[] = [];
  if (hasUfo && rippleStops.length > 0 && maxTotalTime > 0) {
    const pctRamp = (RIPPLE_RAMP_S / maxTotalTime) * 100;
    for (let idx = 0; idx < rippleStops.length; idx++) {
      const { cx, cy, tBeamOn, tLeave, fullGridWave } = rippleStops[idx];
      const stayDuration = Math.max(0, tLeave - tBeamOn);
      const numBursts = fullGridWave
        ? 1
        : Math.max(1, Math.floor(stayDuration / RIPPLE_CYCLE_S));
      const maxRing = fullGridWave
        ? Math.max(cx + 1, maxX - cx, cy + 1, maxY - cy)
        : 3;
      const rippleStepS = fullGridWave
        ? paintSweepDuration / Math.max(1, maxRing - 1)
        : RIPPLE_STEP_S;
      for (let ring = 1; ring <= maxRing; ring++) {
        const entries: { pct: number; opacity: number }[] = [];
        for (let b = 0; b < numBursts; b++) {
          const tOn = tBeamOn + b * RIPPLE_CYCLE_S + (ring - 1) * rippleStepS;
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
        }
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
            `<rect x="${px}" y="${py}" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="#a8e6cf" style="opacity:0; animation: ${name} ${maxTotalTime}s linear 0s 1 both; pointer-events: none;"/>`,
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
