import {
  SHEEP_CELL_TIME,
  SHEEP_CONTENT,
  SHEEP_VIEWBOX_CX,
  SHEEP_VIEWBOX_CY,
  SHEEP_VIEWBOX_W,
  SHEEP_WIDTH_PX,
  SHEEP_BODY_SHIFT_PX,
} from "../../constants.js";
import { getCellCenterPx } from "../../gridLayout.js";

export function buildSheepLayer(params: {
  positionsHistory: [number, number][][];
  assignedIndices: number[];
  spawnAbsS: number[];
  moveStartAbsS: number[];
  maxTotalTime: number;
  gridLeftX: number;
  gridTopY: number;
  dropStayS: number;
  lightRampS: number;
  sheepFadeS: number;
  dropDescentPx: number;
  moveStartS: number;
  pickupArriveAbsS?: (number | null)[];
  pickupFadeS?: number;
  pickupWaitS?: number;
  pickupLightS?: number;
}): { animationStyles: string; sheepGroups: string } {
  const {
    positionsHistory,
    assignedIndices,
    spawnAbsS,
    moveStartAbsS,
    maxTotalTime,
    gridLeftX,
    gridTopY,
    dropStayS,
    lightRampS,
    sheepFadeS,
    dropDescentPx,
    moveStartS,
    pickupArriveAbsS,
    pickupFadeS = 0.25,
    pickupWaitS,
    pickupLightS,
  } = params;

  const sheepScale = SHEEP_WIDTH_PX / SHEEP_VIEWBOX_W / 2.5;
  const bodyShift = (angleDeg: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      dx: -SHEEP_BODY_SHIFT_PX * Math.sin(rad),
      dy: SHEEP_BODY_SHIFT_PX * Math.cos(rad),
    };
  };

  const sheepAnimations = assignedIndices.map((si: number) => {
    const timeline = positionsHistory[si];
    if (!timeline || timeline.length === 0) {
      return { id: `sheep-${si}`, keyframes: "", animationCSS: "" };
    }
    const totalPoints = timeline.length;
    const totalMoves = Math.max(totalPoints - 1, 0);

    const frames: {
      t: number;
      x: number;
      y: number;
      angle: number;
    }[] = [];
    let lastAngle = 180;
    let time = 0;

    const angleOf = (dx: number, dy: number, fallback: number) => {
      if (dx > 0) return 90;
      if (dx < 0) return 270;
      if (dy > 0) return 180;
      if (dy < 0) return 0;
      return fallback;
    };

    {
      const cur = timeline[0];
      frames.push({ t: 0, x: cur[0], y: cur[1], angle: lastAngle });
    }

    for (let idx = 0; idx < totalMoves; idx++) {
      const cur = timeline[idx];
      const next = timeline[idx + 1];
      if (!next) break;

      const dx = next[0] - cur[0];
      const dy = next[1] - cur[1];

      const nextAngle = angleOf(dx, dy, lastAngle);
      const dirChanged = nextAngle !== lastAngle;
      const tickEnd = time + SHEEP_CELL_TIME;

      if (dx === 0 && dy === 0) {
        frames.push({
          t: tickEnd,
          x: cur[0],
          y: cur[1],
          angle: lastAngle,
        });
        time = tickEnd;
        continue;
      }

      if (dirChanged) {
        const rotateTime = time + SHEEP_CELL_TIME * 0.18;
        frames.push({
          t: rotateTime,
          x: cur[0],
          y: cur[1],
          angle: nextAngle,
        });
        frames.push({
          t: tickEnd,
          x: next[0],
          y: next[1],
          angle: nextAngle,
        });
      } else {
        frames.push({
          t: tickEnd,
          x: next[0],
          y: next[1],
          angle: nextAngle,
        });
      }

      lastAngle = nextAngle;
      time = tickEnd;
    }

    const timeOffset = spawnAbsS[si] ?? 0;
    const keyframeEntries: { pct: number; css: string }[] = [];
    const dropFrame = frames[0];
    const dropPx = getCellCenterPx(
      gridLeftX,
      gridTopY,
      dropFrame.x,
      dropFrame.y,
    );
    const dropOff = bodyShift(dropFrame.angle);
    const dropX = dropPx.x + dropOff.dx;
    const dropY = dropPx.y + dropOff.dy;
    const dropStartY = dropY - dropDescentPx;
    const offscreen = `transform: translate(-9999px, -9999px) rotate(180deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); opacity: 0;`;
    const pctSpawn = maxTotalTime > 0 ? (timeOffset * 100) / maxTotalTime : 0;
    keyframeEntries.push({
      pct: 0,
      css: `0% { ${offscreen} }`,
    });
    if (pctSpawn > 0) {
      keyframeEntries.push({
        pct: Math.min(100, pctSpawn),
        css: `${Math.min(100, pctSpawn).toFixed(4)}% { transform: translate(${dropX}px, ${dropStartY}px) rotate(${dropFrame.angle}deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); opacity: 0; }`,
      });
    } else {
      keyframeEntries.push({
        pct: 0,
        css: `0% { transform: translate(${dropX}px, ${dropStartY}px) rotate(${dropFrame.angle}deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); opacity: 0; }`,
      });
    }
    const readyTime = timeOffset + (lightRampS + sheepFadeS);
    const moveStartTime = Math.max(moveStartAbsS[si] ?? 0, readyTime);
    const pctReady = maxTotalTime > 0 ? (readyTime * 100) / maxTotalTime : 0;
    const pctMoveStart =
      maxTotalTime > 0 ? (moveStartTime * 100) / maxTotalTime : 0;
    keyframeEntries.push({
      pct: Math.min(100, pctReady),
      css: `${Math.min(100, pctReady).toFixed(4)}% { transform: translate(${dropX}px, ${dropY}px) rotate(${dropFrame.angle}deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); opacity: 1; }`,
    });
    keyframeEntries.push({
      pct: Math.min(100, pctMoveStart),
      css: `${Math.min(100, pctMoveStart).toFixed(4)}% { transform: translate(${dropX}px, ${dropY}px) rotate(${dropFrame.angle}deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); opacity: 1; }`,
    });
    let firstMoveIdxHistory = -1;
    for (let ti = 1; ti < timeline.length; ti++) {
      if (
        timeline[ti][0] !== timeline[0][0] ||
        timeline[ti][1] !== timeline[0][1]
      ) {
        firstMoveIdxHistory = ti;
        break;
      }
    }
    const firstMoveT =
      firstMoveIdxHistory >= 0
        ? firstMoveIdxHistory * SHEEP_CELL_TIME
        : (frames[1]?.t ?? SHEEP_CELL_TIME);
    if (firstMoveIdxHistory >= 0) {
      for (let fi = 1; fi < frames.length; fi++) {
        const f = frames[fi];
        if (f.t < firstMoveT) continue;
        const { x, y } = getCellCenterPx(gridLeftX, gridTopY, f.x, f.y);
        const off = bodyShift(f.angle);
        const globalTime = moveStartTime + (f.t - firstMoveT);
        const percent =
          maxTotalTime > 0 ? (globalTime * 100) / maxTotalTime : 0;
        const pct = Math.min(99.9999, percent);
        keyframeEntries.push({
          pct,
          css: `${pct.toFixed(4)}% { transform: translate(${x + off.dx}px, ${y + off.dy}px) rotate(${f.angle}deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); opacity: 1; }`,
        });
      }
    }

    const pickupT = pickupArriveAbsS?.[si] ?? null;
    const pickupFade = pickupFadeS ?? 0.25;
    const pickupWait = pickupWaitS ?? 0.35;
    const pickupLight = pickupLightS ?? 0.22;

    if (pickupT != null && Number.isFinite(pickupT) && pickupT > 0) {
      const fadeStartT = pickupT + pickupWait + pickupLight * 0.6;

      const p1 = maxTotalTime > 0 ? (fadeStartT * 100) / maxTotalTime : 0;
      const p2 =
        maxTotalTime > 0 ? ((fadeStartT + pickupFade) * 100) / maxTotalTime : 0;

      const a = Math.min(99.9998, Math.max(0, p1));
      const b = Math.min(99.9999, Math.max(a, p2));

      keyframeEntries.push({
        pct: a,
        css: `${a.toFixed(4)}% { opacity: 1; }`,
      });
      keyframeEntries.push({
        pct: b,
        css: `${b.toFixed(4)}% { opacity: 0; }`,
      });
    }

    const lastCell = timeline[timeline.length - 1];
    const lastFrame = frames[frames.length - 1];
    const lastPx = getCellCenterPx(
      gridLeftX,
      gridTopY,
      lastCell[0],
      lastCell[1],
    );
    const lastFrameAngle = lastFrame?.angle ?? 180;
    const lastOff = bodyShift(lastFrameAngle);
    const hasPickup =
      pickupT != null && Number.isFinite(pickupT) && pickupT > 0;
    keyframeEntries.push({
      pct: 100,
      css: `100% { transform: translate(${lastPx.x + lastOff.dx}px, ${lastPx.y + lastOff.dy}px) rotate(${lastFrameAngle}deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); opacity: ${hasPickup ? 0 : 1}; }`,
    });

    const delay = 0;
    const initialTransform = `transform: translate(-9999px, -9999px) rotate(180deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); opacity: 0; `;

    const sorted = keyframeEntries.slice().sort((a, b) => a.pct - b.pct);
    const deduped: string[] = [];
    let lastPct: number | null = null;
    for (const kf of sorted) {
      if (lastPct !== null && Math.abs(kf.pct - lastPct) < 1e-6) {
        deduped[deduped.length - 1] = kf.css;
      } else {
        deduped.push(kf.css);
        lastPct = kf.pct;
      }
    }

    return {
      id: `sheep-${si}`,
      keyframes: `@keyframes sheep-${si}-move {\n    ${deduped.join(
        "\n    ",
      )}\n  }`,
      animationCSS: `${initialTransform}animation: sheep-${si}-move ${maxTotalTime}s linear ${delay}s 1 both;`,
    };
  });

  const validSheepAnimations = sheepAnimations.filter(
    (a: { keyframes: string }) => a.keyframes.length > 0,
  );
  const animationStyles = validSheepAnimations
    .map((a: { keyframes: string }) => a.keyframes)
    .join("\n  ");

  let sheepGroups: string;
  if (validSheepAnimations.length > 0) {
    sheepGroups = validSheepAnimations
      .map(
        (a: { id: string; animationCSS: string }) =>
          `<g class="${a.id}" style="${a.animationCSS}">${SHEEP_CONTENT}</g>`,
      )
      .join("\n  ");
  } else {
    const pos = getCellCenterPx(gridLeftX, gridTopY, 0, 0);
    const off = bodyShift(180);
    const transform = `translate(${pos.x + off.dx}px, ${pos.y + off.dy}px) rotate(180deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px)`;
    sheepGroups = `<g class="sheep-fallback" transform="${transform}">${SHEEP_CONTENT}</g>`;
  }

  return { animationStyles, sheepGroups };
}
