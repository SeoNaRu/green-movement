import { mkdirSync, writeFileSync } from "node:fs";
import { buildContext } from "../dist/svg/buildContext.js";
import {
  GRASS_STEP_TIMES_S,
  SHEEP_CELL_TIME,
  SHEEP_GRAZE_HOLD_TICKS,
  SHEEP_VIEWBOX_W,
  SHEEP_WIDTH_PX,
  MAX_SHEEP,
  UFO_ENTRY_S,
  UFO_RELOCATION_APPROACH_S,
  UFO_RELOCATION_TOTAL_S,
  UFO_WIDTH_PX,
} from "../dist/svg/constants.js";
import { planTargets } from "../dist/planning/targetPlanner.js";
import { simulateGrid } from "../dist/svg/sim/simulate.js";
import { renderGridSvg } from "../dist/svg/renderGridSvg.js";
import { buildTimeline } from "../dist/timeline/schedules.js";
import {
  buildSignatureCells,
  getGridWaveMetrics,
  getGridWavePhase,
} from "../dist/svg/signature.js";
import { getCellCenterPx } from "../dist/svg/layout/gridLayout.js";

let randomState = 0x6d2b79f5;
Math.random = () => {
  randomState = Math.imul(randomState ^ (randomState >>> 15), randomState | 1);
  randomState ^= randomState + Math.imul(randomState ^ (randomState >>> 7), randomState | 61);
  return ((randomState ^ (randomState >>> 14)) >>> 0) / 4294967296;
};

const grid = Array.from({ length: 53 * 7 }, (_, index) => {
  const x = Math.floor(index / 7);
  const y = index % 7;
  const signal = (x * 17 + y * 11 + x * y) % 19;
  return {
    x,
    y,
    date: `fixture-${x}-${y}`,
    count: signal < 7 ? 0 : Math.min(4, 1 + ((signal + x) % 4)),
  };
});
const timingGrid = grid.map((cell) => ({ ...cell }));

const svg = renderGridSvg(grid, { targetWidth: 700 });
const grazeWindow = SHEEP_GRAZE_HOLD_TICKS * SHEEP_CELL_TIME;
if (GRASS_STEP_TIMES_S.at(-1) > grazeWindow) {
  throw new Error(
    `grass finishes after sheep leaves: ${GRASS_STEP_TIMES_S.at(-1)}s > ${grazeWindow}s`,
  );
}
for (const required of [
  '<?xml version="1.0"',
  'width="700"',
  "@keyframes sheep-",
  "@keyframes sheep-0-pose",
  "@keyframes sheep-0-head",
  'class="sheep-head"',
  "scale(.92, 1.06)",
  'class="ufo-move"',
  "@keyframes ufo-rot",
  "rotate(-90deg)",
  "animation-timing-function: cubic-bezier(.2,.8,.2,1)",
  'class="ufo-streak"',
  "@keyframes ufo-streak",
  "@media (prefers-reduced-motion: reduce)",
  'id="grass-crumbs"',
  "@keyframes grass-crumb",
  "@media (prefers-color-scheme: dark)",
  "--gm-background: #ffffff",
  "--gm-background: #0d1117",
  "--gm-level-4: #216e39",
  "--gm-level-4: #39d353",
  "@keyframes signature-grid-wave-0",
  "@keyframes signature-grid-wave-7",
  "@keyframes signature-core",
  'class="signature-grid-wave"',
  'class="signature-grid-wave-cell"',
  'class="signature-grid-wave-cell" x=',
  'fill="var(--gm-level-3)" style="opacity:0; animation:signature-grid-wave-',
  'class="signature-core"',
]) {
  if (!svg.includes(required)) throw new Error(`SVG fixture missing ${required}`);
}
if (/NaN|undefined/.test(svg)) throw new Error("SVG fixture contains invalid values");
const sheepCount = (svg.match(/class="sheep-\d+"/g) ?? []).length;
const grassCount = timingGrid.filter(({ count }) => count > 0).length;
const expectedSheepCount = Math.min(
  MAX_SHEEP,
  grassCount,
);
if (sheepCount !== expectedSheepCount) {
  throw new Error(`expected ${expectedSheepCount} sheep for ${grassCount} grass cells, got ${sheepCount}`);
}
const sheepScale = Number(
  svg.match(/class="sheep-0"[^>]*scale\(([\d.]+)\)/)?.[1],
);
const expectedSheepScale = (SHEEP_WIDTH_PX / SHEEP_VIEWBOX_W / 2.05) * 0.8;
if (Math.abs(sheepScale - expectedSheepScale) > 0.0001) {
  throw new Error(`expected sheep at 80% of the v7 size, got ${sheepScale}`);
}
if (/@keyframes (?:crumb|flower)-\d/.test(svg)) {
  throw new Error("SVG fixture contains per-particle keyframes");
}
if (/flower-(?:bloom|layer)|class="flower/.test(svg)) {
  throw new Error("SVG fixture still contains the rejected flowers");
}
if (/ufo-(?:hover|bank)/.test(svg)) {
  throw new Error("SVG fixture contains rejected ambient UFO motion");
}
if (
  /signature-(?:beam|laser|impact|writing)/.test(svg) ||
  /ufo-scan-gradient|class="ufo-scan"|scan-(?:field|bar|lock)|scan-band-gradient/.test(svg) ||
  new RegExp(`ufo-ripple-${sheepCount * 2}-`).test(svg)
) {
  throw new Error("SVG fixture contains a rejected spotlight or plotter effect");
}
if (/filter\s*[:=]/.test(svg)) {
  throw new Error("SVG fixture contains a blur/filter effect");
}
const runtime = Number(svg.match(/animation:ufo-move ([\d.]+)s/)?.[1]);
if (!Number.isFinite(runtime) || runtime > 40) {
  throw new Error(`expected the speed-pass runtime at or below 40s, got ${runtime}`);
}
const deploymentTimes = Array.from({ length: sheepCount }, (_, i) => {
  const move = svg.match(new RegExp(`@keyframes sheep-${i}-move \\{([\\s\\S]*?)\\n  \\}`))?.[1];
  const visiblePct = Number(move?.match(/([\d.]+)% \{[^}]*opacity: 1/)?.[1]);
  return (visiblePct / 100) * runtime;
});
const deploymentSeconds = deploymentTimes.at(-1);
if (
  deploymentTimes.slice(0, 4).some((time) => !Number.isFinite(time) || time > 3.2) ||
  deploymentTimes.slice(4).some((time) => !Number.isFinite(time) || time < 7.2 || time > 8.5) ||
  deploymentTimes[4] - deploymentTimes[3] < 4.4
) {
  throw new Error(`expected a four-sheep advance flock and delayed two-sheep reinforcement: ${deploymentTimes}`);
}
if (!svg.includes("@keyframes sheep-0-growth") || !svg.includes("class=\"sheep-energy\"")) {
  throw new Error("sheep do not accumulate body mass and visible grass energy");
}
const ufoMove = svg.match(/@keyframes ufo-move \{([\s\S]*?)\n  \}/)?.[1] ?? "";
if (
  ufoMove.includes("animation-timing-function: cubic-bezier(.2,.8,.2,1)") ||
  !ufoMove.includes("animation-timing-function: cubic-bezier(.4,0,.2,1)")
) {
  throw new Error("UFO travel still contains the rejected pre-arrival snap");
}
const offstagePcts = [...ufoMove.matchAll(/([\d.]+)% \{[^}]*translate\([^,]+, -59px\)/g)].map(
  (match) => Number(match[1]),
);
if (
  !offstagePcts.some(
    (pct) => pct > 0 && (pct / 100) * runtime < deploymentSeconds + 0.6,
  )
) {
  throw new Error("expected UFO to leave the stage after deployment");
}
for (let i = 0; i < sheepCount; i++) {
  const move = svg.match(new RegExp(`@keyframes sheep-${i}-move \\{([\\s\\S]*?)\\n  \\}`))?.[1] ?? "";
  if (!move.includes("animation-timing-function: linear")) {
    throw new Error(`sheep ${i} movement does not preserve continuous velocity`);
  }
  const angles = [...move.matchAll(/rotate\(([-\d.]+)deg\)/g)].map((match) =>
    Number(match[1]),
  );
  if (angles.some((angle, index) => index > 0 && Math.abs(angle - angles[index - 1]) > 180)) {
    throw new Error(`sheep ${i} takes a long rotation path`);
  }
}
const timingContext = buildContext(timingGrid);
for (const [activeGrass, expected] of [
  [0, 0],
  [1, 6],
  [40, 6],
  [41, 6],
  [201, 6],
  [241, 6],
  [351, 6],
]) {
  const countGrid = timingGrid.map((cell, index) => ({
    ...cell,
    count: index < activeGrass ? 1 : 0,
  }));
  const actual = buildContext(countGrid).sheepCountCap;
  if (actual !== expected) {
    throw new Error(`expected ${expected} sheep for ${activeGrass} grass cells, got ${actual}`);
  }
}
const timingPlan = planTargets(timingContext);
if (timingPlan.spawnTick.join(",") !== "0,1,2,3,28,29") {
  throw new Error(`unexpected reinforcement schedule: ${timingPlan.spawnTick}`);
}
if (timingPlan.relayStartTick.join(",") !== timingPlan.spawnTick.join(",")) {
  throw new Error(`sheep do not start as soon as they are deployed: ${timingPlan.relayStartTick}`);
}
for (let i = 0; i < timingPlan.sheepTargetsWithEmpty.length; i++) {
  const target = timingPlan.sheepTargetsWithEmpty[i];
  if (!target) continue;
  const expectedBand = Math.min(
    2,
    Math.floor((i * 3) / timingPlan.sheepCount),
  );
  const actualBand = Math.min(
    2,
    Math.floor((target.grass.x * 3) / (timingContext.maxX + 1)),
  );
  if (actualBand !== expectedBand) {
    throw new Error(`sheep ${i} starts outside relay band ${expectedBand}`);
  }
}
for (let i = 1; i < timingPlan.funnelPositionsEarly.length; i++) {
  const previous = timingPlan.funnelPositionsEarly[i - 1];
  const current = timingPlan.funnelPositionsEarly[i];
  if (current[0] <= previous[0]) {
    throw new Error("UFO deployment route doubles back horizontally");
  }
  if (Math.abs(current[1] - previous[1]) < timingContext.maxY - 3) {
    throw new Error("UFO deployment route loses its single zigzag rhythm");
  }
}
const timingSimulation = simulateGrid({
  grid: timingContext.grid,
  byKey: timingContext.byKey,
  initialCountByKey: timingContext.initialCountByKey,
  quartiles: timingContext.quartiles,
  emptyCellSet: timingPlan.emptyCellSet,
  remainingGrassKeys: timingPlan.remainingGrassKeys,
  sheepStates: timingPlan.sheepStates,
  sheepCount: timingPlan.sheepCount,
  spawnTick: timingPlan.spawnTick,
  relayStartTick: timingPlan.relayStartTick,
  maxSteps: 24000,
  dropStayS: 0.14,
  minFunnelRow: timingPlan.minFunnelRow,
  maxX: timingContext.maxX,
  maxY: timingContext.maxY,
  targetBfsLen: timingPlan.targetBfsLen,
  relocation:
    timingPlan.sheepCount >= 6
      ? {
          sheepIndex: 1,
          earliestTick: 10,
          preferredTarget: [timingPlan.funnelPositionsEarly[3][0], 1],
        }
      : undefined,
});
const timing = buildTimeline(timingContext, timingPlan, timingSimulation);
if (
  timing.relocation?.sheepIndex !== 1 ||
  timing.relocation.to.join(",") !== "30,1" ||
  timing.relocation.pickupArriveAbsS >= timing.relocation.flightStartAbsS ||
  timing.relocation.flightStartAbsS >= timing.relocation.dropArriveAbsS ||
  timing.relocation.dropArriveAbsS >= timing.relocation.releaseAbsS ||
  timing.relocation.flightStartAbsS - timing.relocation.pickupArriveAbsS < 0.44 ||
  timing.relocation.dropArriveAbsS - timing.relocation.flightStartAbsS < 1.19 ||
  timing.relocation.releaseAbsS - timing.relocation.dropArriveAbsS < 0.44 ||
  Math.abs(
    timing.relocation.releaseAbsS - timing.relocation.pickupArriveAbsS +
      UFO_RELOCATION_APPROACH_S - UFO_RELOCATION_TOTAL_S,
  ) > 0.001
) {
  throw new Error(`aerial relocation is missing or out of order: ${JSON.stringify(timing.relocation)}`);
}
const relocationMove = svg.match(/@keyframes sheep-1-move \{([\s\S]*?)\n  \}/)?.[1] ?? "";
const relocationFlightPct =
  (timing.relocation.flightStartAbsS / runtime) * 100;
const relocationReleasePct =
  (timing.relocation.releaseAbsS / runtime) * 100;
if (
  !relocationMove.includes(`${relocationFlightPct.toFixed(4)}% {`) ||
  !relocationMove.includes(`${relocationReleasePct.toFixed(4)}% {`) ||
  !relocationMove.includes("opacity: 0") ||
  !svg.includes("100% { transform: scale(1.15); }")
) {
  throw new Error("relocated sheep does not board, land, and retain meal growth");
}
const relocationSource = getCellCenterPx(
  timingContext.gridLeftX,
  timingContext.gridTopY,
  timing.relocation.from[0],
  timing.relocation.from[1],
);
const relocationPickupPct =
  (timing.relocation.pickupArriveAbsS / runtime) * 100;
if (
  !ufoMove.includes(
    `${relocationPickupPct.toFixed(4)}% { transform: translate(${relocationSource.x - UFO_WIDTH_PX / 2}px, ${relocationSource.y - UFO_WIDTH_PX / 2}px)`,
  )
) {
  throw new Error("UFO does not arrive over the sheep it transports");
}
if (Math.abs(timing.timelineOffset - UFO_ENTRY_S) > 0.001) {
  throw new Error("UFO does not deploy directly from its entry flight");
}
const [firstDropX, firstDropY] = timingPlan.funnelPositionsEarly[0];
const firstDrop = getCellCenterPx(
  timingContext.gridLeftX,
  timingContext.gridTopY,
  firstDropX,
  firstDropY,
);
const firstDropTx = firstDrop.x - UFO_WIDTH_PX / 2;
const firstDropTy = firstDrop.y - UFO_WIDTH_PX / 2;
const entryPct = ((UFO_ENTRY_S / runtime) * 100).toFixed(4);
if (!ufoMove.includes(`${entryPct}% { transform: translate(${firstDropTx}px, ${firstDropTy}px)`)) {
  throw new Error("UFO entry still stops somewhere other than the first drop");
}
const signatureCells = buildSignatureCells(timingContext.maxX, timingContext.maxY);
if (signatureCells.length !== 123) {
  throw new Error(`expected 123 SEONARU grass cells, got ${signatureCells.length}`);
}
const signatureCoords = signatureCells.map(({ key }) => key.split(",").map(Number));
const [minSignatureX, maxSignatureX] = [
  Math.min(...signatureCoords.map(([x]) => x)),
  Math.max(...signatureCoords.map(([x]) => x)),
];
if (minSignatureX !== 3 || maxSignatureX !== 49) {
  throw new Error(`SEONARU does not fill the 53-column grid: ${minSignatureX}..${maxSignatureX}`);
}
const signaturePhases = [...new Set(signatureCells.map(({ phase }) => phase))].sort(
  (a, b) => a - b,
);
const waveMetrics = getGridWaveMetrics(timingContext.maxX, timingContext.maxY);
if (
  waveMetrics.maxPhase !== 52 ||
  getGridWavePhase(26, 3, waveMetrics) !== 0 ||
  getGridWavePhase(0, 0, waveMetrics) !==
    getGridWavePhase(52, 6, waveMetrics) ||
  getGridWavePhase(0, 6, waveMetrics) !==
    getGridWavePhase(52, 0, waveMetrics)
) {
  throw new Error("grid wave is no longer radially symmetric");
}
if (
  signaturePhases[0] !== 0 ||
  signaturePhases.at(-1) >= waveMetrics.maxPhase
) {
  throw new Error(`signature phases do not lie inside the physical wave: ${signaturePhases}`);
}
const dynamicSignature = buildSignatureCells(
  timingContext.maxX,
  timingContext.maxY,
  "github-user-1",
);
if (dynamicSignature.length === 0) {
  throw new Error("13-character GitHub username did not produce a compact signature");
}
const twoLineSignature = buildSignatureCells(
  timingContext.maxX,
  timingContext.maxY,
  "very-long-github-username",
);
const twoLineRows = new Set(twoLineSignature.map(({ key }) => Number(key.split(",")[1])));
if (twoLineSignature.length === 0 || !twoLineRows.has(0) || !twoLineRows.has(6)) {
  throw new Error("long GitHub username did not produce a full-height two-line signature");
}
try {
  buildSignatureCells(timingContext.maxX, timingContext.maxY, "abcdefghijklmnopqrstuvwxyz-0");
  throw new Error("overlong GitHub username was silently truncated");
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes("maximum 26")) throw error;
}
if (
  timing.sweepPositions.length !== 1 ||
  timing.sweepPositions[0].join(",") !== "26,3" ||
  timing.sweepArriveAbsSOffset[0] >= timing.paintSweepStartAbsSOffset ||
  timing.paintSweepDuration !== 1.08
) {
  throw new Error("UFO does not stage the centered point-wave reveal");
}
if ((svg.match(/class="signature-grid-wave-cell"/g) ?? []).length !== 53 * 7) {
  throw new Error("signature wave does not travel through every grid cell");
}
for (let phase = 0; phase <= waveMetrics.maxPhase; phase++) {
  if (!svg.includes(`@keyframes signature-grid-wave-${phase}`)) {
    throw new Error(`signature grid wave is missing phase ${phase}`);
  }
}
const signatureReveal = svg.slice(
  svg.indexOf('<g class="signature-reveal"'),
  svg.indexOf('<g class="ufo-move"'),
);
if (/<(?:ellipse|circle)\b/.test(signatureReveal)) {
  throw new Error("signature reveal regressed to a growing circle or ellipse");
}
const phaseStep = timing.paintSweepDuration / waveMetrics.maxPhase;
for (const cell of signatureCells) {
  const [x, y] = cell.key.split(",").map(Number);
  const paintPct =
    (((timing.paintSweepStartAbsSOffset + cell.phase * phaseStep) / runtime) * 100);
  const keyframe =
    svg.match(new RegExp(`@keyframes grass-(?:loop|paint)-${x * 7 + y} \\{([\\s\\S]*?)\\n  \\}`))?.[1] ?? "";
  if (!keyframe.includes(`${(paintPct + 0.01).toFixed(4)}% { fill: var(--gm-level-4); }`)) {
    throw new Error(`signature cell ${cell.key} is out of phase ${cell.phase}`);
  }
}
if (
  timing.ufoExitStartAbsSOffset <=
    timing.paintSweepStartAbsSOffset + timing.paintSweepDuration ||
  timing.maxTotalTimeWithEntryExit - timing.ufoExitEndAbsSOffset < 1.39
) {
  throw new Error("signature reveal is missing its confirmation beat or final hold");
}
const expectedGrassCount = [...timingContext.initialCountByKey.values()].filter(
  (count) => count > 0,
).length;
if (timing.firstArrivals.size !== expectedGrassCount) {
  throw new Error(
    `relay missed grass cells: ${timing.firstArrivals.size}/${expectedGrassCount}`,
  );
}
for (const arrival of timing.firstArrivals.values()) {
  const impactPct =
    ((timing.timelineOffset + arrival.arrivalTime + GRASS_STEP_TIMES_S[0]) /
      runtime) *
    100;
  const head =
    svg.match(
      new RegExp(`@keyframes sheep-${arrival.sheepIndex}-head \\{([\\s\\S]*?)\\n  \\}`),
    )?.[1] ?? "";
  const pose =
    svg.match(
      new RegExp(`@keyframes sheep-${arrival.sheepIndex}-pose \\{([\\s\\S]*?)\\n  \\}`),
    )?.[1] ?? "";
  if (
    !head.includes(`${impactPct.toFixed(4)}% { transform: translate(0px, -2.90px); }`) ||
    !pose.includes(`${impactPct.toFixed(4)}% { transform: translateY(.65px) scale(1.08, .9); }`)
  ) {
    throw new Error(`sheep ${arrival.sheepIndex} bite misses the first grass step`);
  }
}
for (let i = 0; i < timingPlan.sheepCount; i++) {
  if (Math.abs(timing.moveStartAbsSOffset[i] - timing.readyAbsSOffset[i]) > 0.001) {
    throw new Error(`sheep ${i} waits after landing instead of moving immediately`);
  }
}
for (let i = 0; i < timingSimulation.positionsHistory.length; i++) {
  const positions = timingSimulation.positionsHistory[i];
  const firstMove = positions.findIndex(
    ([x, y], index) =>
      index > 0 &&
      (x !== positions[0][0] || y !== positions[0][1]),
  );
  if (firstMove < 0) continue;
  const visualFinish =
    timing.moveStartAbsSOffset[i] +
    (positions.length - firstMove) * SHEEP_CELL_TIME +
    (timing.relocation?.sheepIndex === i
      ? timing.relocation.operationDuration
      : 0);
  if ((timing.pickupArriveAbsSOffset[i] ?? 0) < visualFinish) {
    throw new Error(`UFO reaches sheep ${i} before its relay run finishes`);
  }
}
for (const [cell, arrivals] of timingSimulation.targetCellArrivals) {
  const arrival = arrivals[0];
  const positions = timingSimulation.positionsHistory[arrival.sheepIndex];
  const [col, row] = cell.split(",").map(Number);
  const arrivalIndex = positions.findIndex(
    ([x, y], index) =>
      x === col &&
      y === row &&
      (index === 0 ||
        positions[index - 1][0] !== col ||
        positions[index - 1][1] !== row),
  );
  const firstMoveIndex = positions.findIndex(
    ([x, y], index) =>
      index > 0 && (x !== positions[0][0] || y !== positions[0][1]),
  );
  if (arrivalIndex < 0 || firstMoveIndex < 0) continue;
  const relocationDelay = (index) =>
    timing.relocation?.sheepIndex === arrival.sheepIndex &&
    index >= timing.relocation.historyIndex
      ? timing.relocation.operationDuration
      : 0;
  const sheepArrival =
    timing.moveStartAbsSOffset[arrival.sheepIndex] +
    (arrivalIndex - firstMoveIndex + 1) * SHEEP_CELL_TIME +
    relocationDelay(arrivalIndex);
  const grassReaction =
    timing.timelineOffset +
    timing.firstArrivals.get(cell).arrivalTime +
    GRASS_STEP_TIMES_S[0];
  if (grassReaction < sheepArrival - 0.001) {
    throw new Error(`grass ${cell} reacts before sheep arrival`);
  }
  const nextMoveIndex = positions.findIndex(
    ([x, y], index) => index > arrivalIndex && (x !== col || y !== row),
  );
  if (nextMoveIndex > 0) {
    const sheepDeparture =
      timing.moveStartAbsSOffset[arrival.sheepIndex] +
      (nextMoveIndex - firstMoveIndex) * SHEEP_CELL_TIME +
      relocationDelay(nextMoveIndex);
    const grassGone =
      timing.timelineOffset +
      timing.firstArrivals.get(cell).arrivalTime +
      GRASS_STEP_TIMES_S[
        Math.min(arrival.level, GRASS_STEP_TIMES_S.length) - 1
      ];
    if (grassGone > sheepDeparture + 0.001) {
      throw new Error(
        `grass ${cell} level ${arrival.level} remains until ${grassGone}s after sheep departs at ${sheepDeparture}s`,
      );
    }
  }
}
const svgBytes = Buffer.byteLength(svg);
if (svgBytes > 4_714_129) {
  throw new Error(`SVG fixture exceeded the 15% size guardrail: ${svgBytes}`);
}

if (process.argv.includes("--write")) {
  mkdirSync("dist", { recursive: true });
  writeFileSync("dist/visual-fixture.svg", svg);
  console.log("wrote dist/visual-fixture.svg");
} else {
  console.log(`svg-smoke: ${svgBytes} bytes`);
}
