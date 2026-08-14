import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildContext } from "../dist/svg/buildContext.js";
import {
  GRASS_STEP_TIMES_S,
  SHEEP_CELL_TIME,
  SHEEP_GRAZE_HOLD_TICKS,
  SHEEP_VIEWBOX_W,
  SHEEP_WIDTH_PX,
  MAX_SHEEP,
  UFO_ENTRY_S,
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
import { buildFlockPlan } from "../dist/svg/flock.js";
import { withSvgTheme } from "../dist/app/generateSvg.js";

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
const lightSvg = withSvgTheme(svg, "light");
const darkSvg = withSvgTheme(svg, "dark");
if (
  !lightSvg.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg data-theme="light"') ||
  !darkSvg.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg data-theme="dark"') ||
  lightSvg.replace(' data-theme="light"', "") !== svg ||
  darkSvg.replace(' data-theme="dark"', "") !== svg
) {
  throw new Error("forced theme variants do not share the same animation SVG");
}
const emptySvg = renderGridSvg(
  grid.map((cell) => ({ ...cell, count: 0 })),
  { targetWidth: 700 },
);
if (
  /NaN|undefined/.test(emptySvg) ||
  !emptySvg.includes(
    '<tspan class="flock-meta-key">FLOCK</tspan><tspan dx="5" class="flock-meta-value">0</tspan>',
  ) ||
  emptySvg.includes('class="ufo-move"')
) {
  throw new Error("empty contribution grid does not render as an idle pasture");
}
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
  ':root[data-theme="light"]',
  ':root[data-theme="dark"]',
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
  'class="flock-panel"',
  'class="flock-selected-section"',
  'class="flock-roster-section"',
  'font-size:8.5px',
  'width="27.00" height="21"',
  'class="flock-slot-index"',
  'href="#flock-sheep-icon" x="21"',
  '<tspan class="flock-meta-key">FLOCK</tspan><tspan dx="5" class="flock-meta-value">28</tspan>',
  "FULLNESS",
  "GRAZING",
  '<tspan class="flock-meta-key">GRASS</tspan><tspan dx="5" class="flock-meta-value">100%</tspan>',
]) {
  if (!svg.includes(required)) throw new Error(`SVG fixture missing ${required}`);
}
const workflow = readFileSync(".github/workflows/update-profile-readme.yml", "utf8");
for (const required of [
  "assets/live-light.svg",
  "assets/live-dark.svg",
  "#gh-light-mode-only",
  "#gh-dark-mode-only",
  "branches: [main]",
  "git add README.md assets/live.svg assets/live-light.svg assets/live-dark.svg",
]) {
  if (!workflow.includes(required)) {
    throw new Error(`profile workflow missing ${required}`);
  }
}
if (/NaN|undefined/.test(svg)) throw new Error("SVG fixture contains invalid values");
const sheepCount = (svg.match(/class="sheep-\d+"/g) ?? []).length;
const grassCount = timingGrid.filter(({ count }) => count > 0).length;
const expectedSheepCount = buildContext(timingGrid).sheepCountCap;
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
  /ufo-scan-gradient|class="ufo-scan"|scan-(?:field|bar|lock)|scan-band-gradient/.test(svg)
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
  deploymentTimes.some((time) => !Number.isFinite(time) || time > 4.5)
) {
  throw new Error(`expected the full field flock to deploy immediately: ${deploymentTimes}`);
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
  [1, 1],
  [10, 1],
  [11, 2],
  [40, 2],
  [41, 4],
  [120, 4],
  [121, 6],
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
const rosterSizeFor = (activeGrass) =>
  (
    renderGridSvg(
      timingGrid.map((cell, index) => ({
        ...cell,
        count: index < activeGrass ? 1 : 0,
      })),
      { targetWidth: 0 },
    ).match(/class="flock-slot /g) ?? []
  ).length;
const hundredRoster = rosterSizeFor(100);
const threeHundredRoster = rosterSizeFor(300);
if (threeHundredRoster <= hundredRoster || threeHundredRoster <= 12) {
  throw new Error(
    `full roster hides contribution scale: 100=${hundredRoster}, 300=${threeHundredRoster}`,
  );
}
const oneCellSvg = renderGridSvg(
  timingGrid.map((cell, index) => ({ ...cell, count: index === 0 ? 1 : 0 })),
  { targetWidth: 0 },
);
if (
  (oneCellSvg.match(/class="flock-slot /g) ?? []).length !== 1 ||
  (oneCellSvg.match(/class="flock-meta-key">GRASS/g) ?? []).length !== 2
) {
  throw new Error("low-volume selection grid or grass label events overlap");
}
const timingPlan = planTargets(timingContext);
if (timingPlan.spawnTick.join(",") !== "0,1,2,3,4,5") {
  throw new Error(`unexpected initial deployment schedule: ${timingPlan.spawnTick}`);
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
});
const flock = buildFlockPlan(timingPlan, timingSimulation);
const timing = buildTimeline(timingContext, timingPlan, timingSimulation, flock);
if (
  flock.fieldCount !== 6 ||
  flock.rosterSize !== 28 ||
  timing.turnovers.length !== 22 ||
  timing.ufoStopCells.length !== flock.rosterSize ||
  timing.turnovers.some(
    (turnover) =>
      turnover.pickupArriveAbsS >= turnover.incomingSpawnAbsS ||
      turnover.pickupArriveAbsS >= turnover.outgoingHiddenAbsS ||
      turnover.outgoingHiddenAbsS >= turnover.incomingSpawnAbsS ||
      turnover.incomingSpawnAbsS - turnover.outgoingHiddenAbsS < 0.079 ||
      turnover.incomingSpawnAbsS >= turnover.incomingReadyAbsS ||
      turnover.addedDelay <= 0,
  )
) {
  throw new Error(`full sheep do not receive immediate serialized replacements`);
}
if (
  timing.flock.grassProgress.some(
    (entry, index, entries) =>
      index > 0 &&
      (entry.atS < entries[index - 1].atS ||
        entry.progress < entries[index - 1].progress),
  ) ||
  Math.abs((timing.flock.grassProgress.at(-1)?.progress ?? 0) - 1) > 0.001
) {
  throw new Error("panel grass progress does not follow visual bite order");
}
if (
  (svg.match(/class="flock-slot /g) ?? []).length !== flock.rosterSize ||
  !svg.includes("@keyframes flock-fill-27") ||
  !svg.includes(
    '<tspan class="flock-meta-key">FIELD</tspan><tspan dx="5" class="flock-meta-value">6/6</tspan>',
  )
) {
  throw new Error("two-row flock panel does not expose the complete roster");
}
const fieldCounts = [...svg.matchAll(/class="flock-meta-value">(-?\d+)\/6<\/tspan>/g)].map(
  (match) => Number(match[1]),
);
if (
  fieldCounts.length === 0 ||
  Math.min(...fieldCounts) !== 0 ||
  Math.max(...fieldCounts) !== 6 ||
  fieldCounts.some((count) => count < 0 || count > 6)
) {
  throw new Error("panel FIELD lifecycle leaves the 0/6 to 6/6 range");
}
const rosterPositions = [...svg.matchAll(
  /<g class="flock-slot flock-slot-(\d+)">\s*<rect x="[\d.]+" y="([\d.]+)"/g,
)].map((match) => ({ index: Number(match[1]), y: Number(match[2]) }));
if (
  rosterPositions[0]?.y !== rosterPositions[13]?.y ||
  rosterPositions[14]?.y <= rosterPositions[13]?.y ||
  (svg.match(/animation:flock-selected-\d+/g) ?? []).length < flock.rosterSize * 2
) {
  throw new Error("flock selection grid lost row-major order or active highlights");
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
const visualFinishBySheep = [];
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
    timing.turnovers
      .filter((turnover) => turnover.slotIndex === i)
      .reduce((sum, turnover) => sum + turnover.addedDelay, 0);
  visualFinishBySheep[i] = visualFinish;
  if ((timing.pickupArriveAbsSOffset[i] ?? 0) < visualFinish) {
    throw new Error(`UFO reaches sheep ${i} before its relay run finishes`);
  }
}
const finalPickupTimes = timing.pickupArriveAbsSOffset.filter(Number.isFinite);
if (
  Math.min(...finalPickupTimes) >= Math.max(...visualFinishBySheep.filter(Number.isFinite)) ||
  timing.pickupArriveAbsSOffsetForUfo.some(
    (arrival, index, entries) => index > 0 && arrival <= entries[index - 1],
  )
) {
  throw new Error("UFO waits for the whole field instead of collecting finished sheep");
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
  const turnoverDelay = (index) =>
    timing.turnovers
      .filter(
        (turnover) =>
          turnover.slotIndex === arrival.sheepIndex &&
          index >= turnover.historyIndex,
      )
      .reduce((sum, turnover) => sum + turnover.addedDelay, 0);
  const sheepArrival =
    timing.moveStartAbsSOffset[arrival.sheepIndex] +
    (arrivalIndex - firstMoveIndex + 1) * SHEEP_CELL_TIME +
    turnoverDelay(arrivalIndex);
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
      turnoverDelay(nextMoveIndex);
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
