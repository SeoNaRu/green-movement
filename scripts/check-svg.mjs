import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { buildContext } from "../dist/svg/buildContext.js";
import {
  CELL_SIZE,
  GAP,
  GRASS_STEP_TIMES_S,
  FENCE_TILE,
  INVENTORY_OPENING_CYCLE_S,
  INVENTORY_OPENING_GATE_S,
  INVENTORY_TURNOVER_EXCHANGE_S,
  SHEEP_CELL_TIME,
  SHEEP_GRAZE_HOLD_TICKS,
  SHEEP_VIEWBOX_W,
  SHEEP_WIDTH_PX,
  MAX_SHEEP,
  MOTION_TIME_SCALE,
  UFO_BLINK_EDGE_S,
  UFO_BLINK_FADE_S,
  UFO_BLINK_TRAVEL_S,
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
import {
  buildSheepTagSvg,
  getSheepTagCode,
  SHEEP_TAG_CAPACITY,
} from "../dist/svg/sheepTag.js";

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
const pixelFont = readFileSync("assets/fonts/Galmuri7.woff2");
if (
  createHash("sha256").update(pixelFont).digest("hex") !==
    "c372bb36f06c35b183216709beea7f0db2e70f09eebff964874c4347520a12de" ||
  !readFileSync("assets/fonts/Galmuri-OFL.txt", "utf8").includes(
    "SIL OPEN FONT LICENSE Version 1.1",
  )
) {
  throw new Error("embedded Galmuri7 font or its license changed");
}
const withoutEmbeddedFonts = (value) =>
  value.replace(/data:font\/woff2;base64,[A-Za-z0-9+/=]+/g, "");
const structuralSvg = withoutEmbeddedFonts(svg);
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
const emptyStructuralSvg = withoutEmbeddedFonts(emptySvg);
if (
  /NaN|undefined/.test(emptyStructuralSvg) ||
  !emptySvg.includes('class="flock-meta-value">0/0</text>') ||
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
  "@media (max-width: 480px)",
  ':root[data-theme="light"]',
  ':root[data-theme="dark"]',
  "--gm-background: #ffffff",
  "--gm-background: #0d1117",
  "--gm-level-4: #216e39",
  "--gm-level-4: #39d353",
  "--gm-tag-outline: #24292f",
  "--gm-tag-outline: #0d1117",
  "@keyframes signature-grid-wave-0",
  "@keyframes signature-grid-wave-7",
  "@keyframes signature-core",
  'class="signature-grid-wave"',
  'class="signature-grid-wave-cell"',
  'class="signature-grid-wave-cell" x=',
  'fill="var(--gm-level-3)" style="opacity:0; animation:signature-grid-wave-',
  'class="signature-core"',
  'class="flock-panel"',
  "@font-face{font-family:GMPixel",
  "font-family:GMPixel,ui-monospace,monospace",
  'class="flock-merged-cell flock-selected-surface"',
  'id="flock-panel-grid"',
  'class="flock-panel-grid"',
  'class="flock-panel-fence"',
  'class="flock-merged-cell flock-status-cell"',
  'class="flock-selected-region"',
  'class="flock-map-region"',
  'shape-rendering:crispEdges',
  'class="flock-map-mark"',
  'class="flock-map-pulse"',
  'class="flock-map-focus"',
  'class="flock-map-footprint"',
  'class="flock-camera-window"',
  'class="flock-camera-live"',
  'class="flock-camera-hud"',
  'class="flock-complete-scrim" x="48"',
  'class="camera-sheep-roster-0 sheep-camera-copy"',
  'class="sheep-ranch-tag sheep-camera-tag"',
  'id="pasture-live-scene"',
  'id="flock-camera-clip"',
  'id="flock-meter-selected"',
  'class="flock-meter-shell"',
  'class="flock-meter-track"',
  'class="flock-meter-fill"',
  'class="flock-meter-pulse"',
  'id="flock-progress-27"',
  'href="#flock-ufo-icon" x="62"',
  'class="sheep-ranch-tag sheep-field-tag"',
  'class="sheep-ear-tag" transform="translate(0,-1.55)"',
  'class="sheep-ranch-tag flock-selected-tag flock-fullness-tag"',
  'data-ranch-tag="',
  'class="flock-meta-key">양떼</text>',
  'class="flock-inventory-pen"',
  'class="flock-inventory-sheep"',
  'class="flock-inventory-tag"',
  'class="ufo-body"',
  'id="flock-inventory-sheep-icon"',
  'href="#flock-inventory-sheep-icon"',
  'data-beats="approach-settle-absorb-direct-departure-shift-refill-settle-drop"',
  'data-energy-link="pickup-dock-finale"',
  '@keyframes flock-turnover-focus',
  '@keyframes flock-inventory-core',
  '@keyframes flock-boarding',
  'data-camera-handoff="blank"',
  'data-camera-modes="context,route,graze,',
  'data-growth-exponent="0.72"',
  'class="flock-meta-value">22/28</text>',
  'class="flock-meta-value">23/28</text>',
  'class="flock-meta-value">28/28</text>',
  '>포만</text>',
  '>첫 방목 준비</text>',
  '>양떼 승선 중</text>',
  '>양떼 이동 중</text>',
  ">0/20</text>",
  ">20/20</text>",
  ">0/25</text>",
  ">25/25</text>",
  ">0/10</text>",
  ">10/10</text>",
  ">목장 정리 완료</text>",
  ">모든 양 수거</text>",
  "scale(.62, .62)",
  'class="flock-meta-key">잔디</text>',
  'class="flock-meta-value">100%</text>',
]) {
  if (!svg.includes(required)) throw new Error(`SVG fixture missing ${required}`);
}
const fieldUfoLayerIndex = svg.indexOf('<g class="ufo-move"');
const firstFieldSheepLayerIndex = svg.indexOf('data-roster-index="0"');
if (
  fieldUfoLayerIndex < 0 ||
  firstFieldSheepLayerIndex < 0 ||
  fieldUfoLayerIndex < firstFieldSheepLayerIndex
) {
  throw new Error("field sheep paint through the stopped opaque UFO");
}
const firstThreeHundredTags = Array.from(
  { length: 300 },
  (_, index) => getSheepTagCode(index),
);
const firstTag = buildSheepTagSvg({ rosterIndex: 0, x: 0, y: 0, size: 6 });
if (
  SHEEP_TAG_CAPACITY < 300 ||
  new Set(firstThreeHundredTags).size !== firstThreeHundredTags.length ||
  (firstTag.match(/<rect /g) ?? []).length !== 1 ||
  !firstTag.includes('fill="hsl(') ||
  !firstTag.includes('stroke="var(--gm-tag-outline)"') ||
  firstTag.includes('fill="var(--gm-level-')
) {
  throw new Error("sheep tags are not distinct one-square non-green identities");
}
const expectedTagCodes = Array.from({ length: 28 }, (_, index) =>
  getSheepTagCode(index),
).sort((a, b) => a - b);
for (const className of [
  "sheep-field-tag",
  "sheep-camera-tag",
  "flock-selected-tag",
  "flock-fullness-tag",
]) {
  const actual = [...svg.matchAll(
    new RegExp(`class="[^"]*${className}[^"]*" data-ranch-tag="(\\d+)"`, "g"),
  )].map((match) => Number(match[1])).sort((a, b) => a - b);
  if (actual.join(",") !== expectedTagCodes.join(",")) {
    throw new Error(`${className} does not preserve every roster identity`);
  }
}
if (
  !/<g class="sheep-ear-tag"[^>]*><g class="sheep-ranch-tag sheep-field-tag"[^>]*transform="translate\(3\.00 4\.55\)"/.test(svg) ||
  !/class="sheep-ranch-tag flock-selected-tag flock-fullness-tag"[^>]*transform="translate\(48\.00 [\d.]+\)"[^>]*><rect width="4\.20"/.test(svg) ||
  /class="sheep-ranch-tag sheep-field-tag"[^>]*transform="translate\(9\.00 6\.30\)"/.test(svg) ||
  svg.includes('stroke="var(--gm-panel-bg)"') ||
  (svg.match(/stroke="var\(--gm-tag-outline\)"/g) ?? []).length < 28 * 3
) {
  throw new Error("sheep identity tag is not attached to the ear");
}
if (
  (svg.match(/class="flock-meter-track"/g) ?? []).length !== 28 ||
  (svg.match(/class="flock-meter-fill"/g) ?? []).length !== 28 ||
  (svg.match(/class="flock-meter-pulse"/g) ?? []).length !== 28 ||
  (svg.match(/<clipPath id="flock-progress-/g) ?? []).length !== 28
) {
  throw new Error("selected ten-cell fullness is not bite-driven");
}
if (!/class="sheep-ranch-tag flock-selected-tag flock-fullness-tag"[\s\S]*?<use class="flock-meter-track" href="#flock-meter-selected"/.test(svg)) {
  throw new Error("selected identity tag is not beside the horizontal fullness cells");
}
const meterSymbol = svg.match(/<symbol id="flock-meter-selected"[^>]*>([\s\S]*?)<\/symbol>/)?.[1] ?? "";
if ((meterSymbol.match(/<rect /g) ?? []).length !== 10) {
  throw new Error("selected meter does not contain exactly ten fixed fullness cells");
}
if (
  !svg.includes('<symbol id="flock-meter-selected" viewBox="0 0 80 8"><rect x="0.00" width="6.20"') ||
  !svg.includes('<rect x="73.80" width="6.20" height="8"') ||
  svg.includes('class="flock-meter-secondary"')
) {
  throw new Error("selected fullness does not use ten clearly separated cells");
}
if (!svg.includes("animation:grass-crumb 0.416s")) {
  throw new Error("grass crumbs do not share the 1.3x motion scale");
}
for (const name of [
  "flock-complete",
  "flock-field-0",
  "flock-grass-100",
]) {
  const keyframes = svg.match(
    new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n  \\}`),
  )?.[1] ?? "";
  if (!keyframes.includes("100.0000% { opacity:1; }")) {
    throw new Error(`${name} disappears after the animation ends`);
  }
}
const workflow = readFileSync(".github/workflows/update-profile-readme.yml", "utf8");
for (const required of [
  "assets/live-light.svg",
  "assets/live-dark.svg",
  "#gh-light-mode-only",
  "#gh-dark-mode-only",
  "${PROFILE_REPO}/${ASSET_COMMIT}/assets/live-light.svg#gh-light-mode-only",
  "${PROFILE_REPO}/${ASSET_COMMIT}/assets/live-dark.svg#gh-dark-mode-only",
  "git log -1 --format=%H -- assets/live-light.svg assets/live-dark.svg",
  "assets/live-light\\.svg[^)]*",
  "assets/live-dark\\.svg[^)]*",
  "branches: [main]",
  "actions/checkout@v7",
  "actions/setup-node@v7",
  "permissions:",
  "contents: write",
  "Refresh project README preview",
  "chore: refresh project preview [auto]",
  "git add assets/live.svg assets/live-light.svg assets/live-dark.svg",
  "git add README.md",
]) {
  if (!workflow.includes(required)) {
    throw new Error(`profile workflow missing ${required}`);
  }
}
if (/NaN|undefined/.test(structuralSvg)) throw new Error("SVG fixture contains invalid values");
const sheepCount = new Set(
  [...svg.matchAll(/class="sheep-(\d+)"/g)].map((match) => match[1]),
).size;
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
if (!Number.isFinite(runtime) || MOTION_TIME_SCALE !== 1.3) {
  throw new Error(`expected one finite runtime at the shared 1.3x pace, got ${runtime}`);
}
const mismatchedDurations = [...svg.matchAll(/animation:\s*(?!grass-crumb)([\w-]+)\s+([\d.]+)s/g)]
  .map((match) => ({ name: match[1], duration: Number(match[2]) }))
  .filter(({ duration }) => Math.abs(duration - runtime) > 0.001);
if (mismatchedDurations.length) {
  throw new Error(`full-scene motion tracks do not share the 1.3x runtime: ${JSON.stringify(mismatchedDurations.slice(0, 5))}`);
}
const deploymentTimes = Array.from({ length: sheepCount }, (_, i) => {
  const move = svg.match(new RegExp(`@keyframes sheep-${i}-move \\{([\\s\\S]*?)\\n  \\}`))?.[1];
  const visiblePct = Number(move?.match(/([\d.]+)% \{[^}]*opacity: 1/)?.[1]);
  return (visiblePct / 100) * runtime;
});
const deploymentSeconds = deploymentTimes.at(-1);
if (deploymentTimes.some((time) => !Number.isFinite(time) || time > 6.5)) {
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
const rosterSvgFor = (activeGrass) =>
  renderGridSvg(
    timingGrid.map((cell, index) => ({
      ...cell,
      count: index < activeGrass ? 1 : 0,
    })),
    { targetWidth: 0 },
  );
const assertAlignedPanel = (value) => {
  const statusCells = [...value.matchAll(
    /<rect class="flock-merged-cell flock-status-cell" x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g,
  )].slice(0, 3).map((match) => ({ x: Number(match[1]), width: Number(match[2]) }));
  const totalWidth = Number(value.match(/viewBox="0 [\d.-]+ ([\d.]+)/)?.[1]);
  const expectedStatus = [
    { x: 12, width: 214 },
    { x: 228, width: 202 },
    { x: 432, width: 214 },
  ];
  if (
    statusCells.length !== 3 ||
    statusCells.some(({ x, width }, index) =>
      Math.abs(x - expectedStatus[index].x) > 0.01 ||
      Math.abs(width - expectedStatus[index].width) > 0.01
    ) ||
    Math.abs(statusCells[2].x + statusCells[2].width - (totalWidth - 14)) > 0.01
  ) {
    throw new Error("panel status cells do not follow the 18/17/18 merged-grid spans");
  }
  const grass100Start = value.indexOf('class="flock-meta-value">100%</text>');
  const grass100End = value.indexOf("</g>", grass100Start);
  const grass100 = value.slice(grass100Start, grass100End);
  const progressCells = [...grass100.matchAll(
    /<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="6"/g,
  )].map((match) => ({ x: Number(match[1]), width: Number(match[2]) }));
  const grassRight = statusCells[2].x + statusCells[2].width;
  const lastProgress = progressCells.at(-1);
  const progressRight = lastProgress == null ? Number.NaN : lastProgress.x + lastProgress.width;
  if (progressCells.length !== 10 || Math.abs(progressRight - (grassRight - 6)) > 0.02) {
    throw new Error("grass 100% cells do not fill their status column");
  }
  const sharedRightFence = `translate(${totalWidth - FENCE_TILE}, 0)`;
  if (value.split(sharedRightFence).length - 1 < 2) {
    throw new Error("pasture and panel fences do not share the same horizontal bounds");
  }
  if (
    !value.includes('<pattern id="flock-panel-grid" x="12"') ||
    !value.includes('width="12" height="12" patternUnits="userSpaceOnUse"><rect width="10" height="10" rx="2" fill="var(--gm-level-0)"') ||
    !value.includes('<rect class="flock-panel-grid" x="12"') ||
    !value.includes('width="634" height="58" fill="url(#flock-panel-grid)"') ||
    !value.includes('<rect class="flock-merged-cell flock-selected-surface" x="12"') ||
    !value.includes('width="202" height="46" rx="2" fill="var(--gm-level-0)"') ||
    value.includes('class="flock-merged-cell flock-fullness-surface"') ||
    !/<g class="flock-panel-fence"[^>]*>[\s\S]*?translate\(0, 72\)[\s\S]*?translate\(648, 72\)/.test(value)
  ) {
    throw new Error("panel does not share the pasture grid or aligned lower fence geometry");
  }
};
const assertInventoryPanel = (value) => {
  const slots = [...value.matchAll(/data-inventory-slot="(\d+)"/g)]
    .map((match) => Number(match[1]));
  if (
    (value.match(/class="flock-inventory-pen"/g) ?? []).length !== 8 ||
    slots.some((slot) => slot < 0 || slot >= 8) ||
    !value.includes('<text x="231"') ||
    !value.includes('class="flock-meta-key">양떼</text>') ||
    !value.includes('<clipPath id="flock-inventory-clip"><rect x="287"') ||
    value.includes('flock-inventory-board-clip') ||
    !value.includes('@keyframes flock-inventory-dock') ||
    value.includes("translateX(-18px)")
  ) {
    throw new Error("inventory variants lose the eight in-grid pens or left label alignment");
  }
};
const hundredMap = (rosterSvgFor(100).match(/class="flock-map-mark"/g) ?? []).length;
const denseRosterSvg = rosterSvgFor(300);
const threeHundredMap = (denseRosterSvg.match(/class="flock-map-mark"/g) ?? []).length;
if (threeHundredMap <= hundredMap || threeHundredMap <= 12) {
  throw new Error(
    `pasture map hides contribution activity: 100=${hundredMap}, 300=${threeHundredMap}`,
  );
}
const assertPastureMap = (value) => {
  const mapTop = Number(value.match(/class="flock-merged-cell flock-selected-surface" x="12" y="([\d.]+)"/)?.[1]);
  const marks = [...value.matchAll(
    /class="flock-map-mark" x="([\d.]+)" y="([\d.]+)" width="10" height="10"/g,
  )].map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
  if (
    marks.length === 0 ||
    (value.match(/class="flock-map-pulse"/g) ?? []).length !== marks.length ||
    (value.match(/class="flock-map-footprint"/g) ?? []).length !== marks.length ||
    (value.match(/class="flock-map-focus"/g) ?? []).length !== 1 ||
    (value.match(/class="flock-camera-window"/g) ?? []).length !== 1 ||
    (value.match(/class="flock-camera-live"/g) ?? []).length !== 1 ||
    marks.some(({ x, y }) =>
      x < 216 || x > 636 || y < mapTop || y > mapTop + 36 ||
      Math.abs((x - 216) / 12 - Math.round((x - 216) / 12)) > 0.01 ||
      Math.abs((y - mapTop) / 12 - Math.round((y - mapTop) / 12)) > 0.01
    ) ||
    value.includes('class="flock-slot') ||
    value.includes('class="flock-pen-sheep"') ||
    value.includes('class="sheep-ranch-tag flock-slot-tag"')
  ) {
    throw new Error("pasture map is not a fixed 36-by-4 bite-driven grid");
  }
};
assertPastureMap(denseRosterSvg);
const oneCellSvg = renderGridSvg(
  timingGrid.map((cell, index) => ({ ...cell, count: index === 0 ? 1 : 0 })),
  { targetWidth: 0 },
);
if (
  (oneCellSvg.match(/class="flock-map-mark"/g) ?? []).length !== 1 ||
  (oneCellSvg.match(/class="flock-meta-key">잔디/g) ?? []).length !== 2
) {
  throw new Error("low-volume pasture map or grass label events overlap");
}
const tenSheepSvg = renderGridSvg(
  timingGrid.map((cell, index) => ({ ...cell, count: index < 42 ? 1 : 0 })),
  { targetWidth: 0 },
);
assertPastureMap(tenSheepSvg);
const sparseSheepCount = (tenSheepSvg.match(/<clipPath id="flock-progress-/g) ?? []).length;
if (
  sparseSheepCount < 8 ||
  sparseSheepCount > 12 ||
  (tenSheepSvg.match(/class="flock-meter-track"/g) ?? []).length !== sparseSheepCount ||
  (tenSheepSvg.match(/class="flock-meter-fill"/g) ?? []).length !== sparseSheepCount ||
  tenSheepSvg.includes('class="flock-roster-region"')
) {
  throw new Error("sparse pasture map loses activity, focus, or selected fullness");
}
if (
  new Set([...svg.matchAll(/data-id-color="(\d+)"/g)].map((match) => match[1])).size !== 28 ||
  svg.includes('id="flock-meter-compact"') ||
  !svg.includes('class="flock-map-region"') ||
  /animation:flock-selected-\d+ [^";]* linear/.test(svg)
) {
  throw new Error("distinct sheep tags, pasture map, or snap visibility regressed");
}
assertAlignedPanel(svg);
assertAlignedPanel(tenSheepSvg);
assertAlignedPanel(denseRosterSvg);
assertInventoryPanel(emptySvg);
assertInventoryPanel(oneCellSvg);
assertInventoryPanel(tenSheepSvg);
assertInventoryPanel(denseRosterSvg);
if (
  svg.includes('class="flock-selected-section"') ||
  svg.includes('class="flock-roster-section"') ||
  svg.includes('class="flock-panel-surface"') ||
  /class="flock-merged-cell flock-(?:selected|fullness)-surface"[^>]*stroke=/.test(svg)
) {
  throw new Error("panel restored the rejected nested section boxes or divider");
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
const appetiteCounts = Object.fromEntries(
  ["high", "normal", "low"].map((appetite) => [
    appetite,
    timing.flock.sheep.filter((sheep) => sheep.appetite === appetite).length,
  ]),
);
const growthCurveSample = timing.flock.sheep
  .flatMap((sheep) => sheep.bites.map((bite) => ({ sheep, bite })))
  .find(({ bite }) => bite.progress > 0.05 && bite.progress < 0.95);
const growthScaleFor = (appetite) =>
  appetite === "high" ? 1.3 : appetite === "low" ? 1.083 : 1.18;
const growthCurvePct = growthCurveSample == null
  ? ""
  : (((growthCurveSample.bite.atS + 0.23) * 100) /
      timing.maxTotalTimeWithEntryExit).toFixed(4);
const expectedLateGrowth = growthCurveSample == null
  ? ""
  : (1 + Math.pow(growthCurveSample.bite.progress, 0.72) *
      (growthScaleFor(growthCurveSample.sheep.appetite) - 1)).toFixed(3);
const sampledGrowthKeyframes = growthCurveSample == null
  ? ""
  : svg.match(
      new RegExp(`@keyframes sheep-${growthCurveSample.sheep.slotIndex}-growth \\{([\\s\\S]*?)\\n  \\}`),
    )?.[1] ?? "";
if (
  timing.flock.sheep.some(
    (sheep) =>
      sheep.capacity !== ({ high: 25, normal: 20, low: 10 })[sheep.appetite] ||
      sheep.bites.some((bite) => bite.progress < 0 || bite.progress > 1),
  ) ||
  appetiteCounts.high < timing.flock.rosterSize * 0.5 ||
  appetiteCounts.high > timing.flock.rosterSize * 0.7 ||
  appetiteCounts.low < timing.flock.rosterSize * 0.2 ||
  appetiteCounts.low > timing.flock.rosterSize * 0.4 ||
  appetiteCounts.normal < 1 ||
  (svg.match(/transform: scale\(1\.000\)/g) ?? []).length !== timing.flock.rosterSize ||
  (svg.match(/data-growth-exponent="0\.72"/g) ?? []).length !== 2 ||
  growthCurveSample == null ||
  !sampledGrowthKeyframes.includes(`${growthCurvePct}% { transform: scale(${expectedLateGrowth}); }`) ||
  !svg.includes("transform: scale(1.300)") ||
  !svg.includes("transform: scale(1.083)") ||
  Math.abs(1.3 / 1.083 - 1.2) > 0.001
) {
  throw new Error("relative weekly appetite mix, fullness capacity, or 20% mature-size spread drifted");
}
const inventoryCounts = [...svg.matchAll(
  /class="flock-inventory-state"[^>]*><text[^>]*class="flock-meta-value">(\d+)\/(\d+)<\/text>/g,
)].map((match) => ({ current: Number(match[1]), total: Number(match[2]) }));
const inventoryTags = [...svg.matchAll(
  /class="flock-inventory-sheep" data-roster="(\d+)"[\s\S]*?class="flock-inventory-tag(?: [^"]*)?"[^>]*fill="hsl\((\d+)/g,
)].map((match) => ({ rosterIndex: Number(match[1]), tag: Number(match[2]) }));
const inventorySlots = [...svg.matchAll(/data-inventory-slot="(\d+)"/g)].map(
  (match) => Number(match[1]),
);
const inventoryStateStarts = [...svg.matchAll(/<g class="flock-inventory-state"/g)].map(
  (match) => match.index,
);
const inventoryStateEnd = svg.indexOf('<g class="flock-inventory-opening-board"');
const finalQueueAlignmentProblems = inventoryStateStarts.flatMap((start, index) => {
  const markup = svg.slice(start, inventoryStateStarts[index + 1] ?? inventoryStateEnd);
  const count = Number(markup.match(/class="flock-meta-value">(\d+)\/\d+<\/text>/)?.[1]);
  if (!Number.isInteger(count) || count > 8) return [];
  const slots = [...markup.matchAll(/data-inventory-slot="(\d+)"/g)].map((match) => Number(match[1]));
  const visibleCount = Math.min(8, count);
  const expected = Array.from({ length: visibleCount }, (_, slot) => 8 - visibleCount + slot);
  return slots.join(",") === expected.join(",") ? [] : [{ count, slots, expected }];
});
const postOpeningIdleSlots = inventoryStateStarts
  .map((start, index) => svg.slice(start, inventoryStateStarts[index + 1] ?? inventoryStateEnd))
  .filter((markup) => markup.includes(`class="flock-meta-value">${flock.rosterSize - flock.fieldCount}/${flock.rosterSize}</text>`))
  .map((markup) => [...markup.matchAll(/data-inventory-slot="(\d+)"/g)].map((match) => Number(match[1])))
  .find((slots) => slots.length === 8) ?? [];
const inventorySheepUses = (svg.match(/href="#flock-inventory-sheep-icon"/g) ?? []).length;
const inventoryTagLightnesses = [...svg.matchAll(
  /class="flock-inventory-tag(?: [^"]*)?"[^>]*fill="hsl\(\d+,72%,(\d+)%\)"/g,
)].map((match) => Number(match[1]));
const firstInventoryState = svg.slice(inventoryStateStarts[0], inventoryStateStarts[1]);
const initialInventoryOrder = [...firstInventoryState.matchAll(/data-roster="(\d+)"/g)]
  .map((match) => Number(match[1]));
const inventoryShiftBlocks = [...svg.matchAll(
  /@keyframes flock-inventory-(shift-\d+)\{([^\n]+)\}/g,
)];
const inventoryLoadBlocks = [...svg.matchAll(
  /@keyframes flock-inventory-load-\d+\{([^\n]+)\}/g,
)];
const openingLoadBlocks = [...svg.matchAll(
  /@keyframes flock-inventory-opening-load-\d+\{([^\n]+)\}/g,
)];
const openingBoardShiftBlocks = [...svg.matchAll(
  /@keyframes flock-inventory-opening-board-shift-\d+\{([^\n]+)\}/g,
)];
const openingRefillBlocks = [...svg.matchAll(
  /@keyframes flock-inventory-opening-refill-\d+\{([^\n]+)\}/g,
)];
const laterRefillBlocks = [...svg.matchAll(
  /@keyframes flock-inventory-refill-\d+\{([^\n]+)\}/g,
)];
const inventorySpawnEvents = timing.flock.sheep
  .map((sheep) => ({ atS: sheep.spawnAbsS, rosterIndex: sheep.rosterIndex }))
  .sort((a, b) => a.atS - b.atS || a.rosterIndex - b.rosterIndex);
const openingInventoryEvents = inventorySpawnEvents.slice(0, flock.fieldCount);
const laterInventoryEvents = inventorySpawnEvents.slice(flock.fieldCount);
const openingShiftStartS = (openingInventoryEvents.at(-1)?.atS ?? 0) + 0.3;
const openingTargetVisibleCount = Math.min(8, flock.rosterSize - flock.fieldCount);
const openingRemainingVisibleCount = Math.max(0, Math.min(8, flock.rosterSize) - flock.fieldCount);
const openingRefillCount = Math.max(0, openingTargetVisibleCount - openingRemainingVisibleCount);
const openingMotionEndS = openingShiftStartS + 0.14;
const openingRevealEndS = openingRefillCount > 0
  ? openingMotionEndS + (openingRefillCount - 1) * 0.1 + 0.08
  : openingMotionEndS;
const openingShiftEndS = openingRevealEndS + 0.08;
const openingLoadEndS =
  INVENTORY_OPENING_GATE_S +
  openingInventoryEvents.length * INVENTORY_OPENING_CYCLE_S;
const openingDepartLeadS = timing.openingBoardEndAbsS - 0.001;
const inventoryPct = (time) =>
  ((time * 100) / timing.maxTotalTimeWithEntryExit).toFixed(4);
const openingShiftBlock = svg.match(/@keyframes flock-inventory-opening-shift\{([^\n]+)\}/)?.[1] ?? "";
const firstShiftBlock = inventoryShiftBlocks.find(([, name]) => name === "shift-0")?.[2] ?? "";
const firstLoadBlock = inventoryLoadBlocks[0]?.[1] ?? "";
const firstOpeningBoardShiftBlock = openingBoardShiftBlocks[0]?.[1] ?? "";
const firstLaterEvent = laterInventoryEvents[0];
const firstTransitionStart = (firstLaterEvent?.atS ?? 0) - 0.76;
const firstGateOpenEnd = firstTransitionStart + 0.18;
const firstAbsorbStart = firstGateOpenEnd + 0.04;
const firstLoadEnd = firstAbsorbStart + 0.08;
const firstDepartHoldStart = firstLoadEnd + 0.05;
const firstShiftStart = firstDepartHoldStart + 0.17;
const firstShiftEnd = firstShiftStart + 0.12;
const firstRefillEnd = firstShiftEnd + 0.08;
const firstSettleEnd = firstRefillEnd + 0.04;
const openingMarkup = svg.slice(
  svg.indexOf('<g class="flock-inventory-opening"'),
  svg.indexOf('<g class="flock-inventory-transition"'),
);
const openingRefillSlots = [...openingMarkup.matchAll(
  /<g class="flock-inventory-refill"[\s\S]*?data-inventory-slot="(\d+)"/g,
)].map((match) => Number(match[1]));
const firstTransitionMarkup = svg.slice(
  svg.indexOf('<g class="flock-inventory-transition"'),
  svg.indexOf('animation:flock-inventory-transition-1'),
);
const firstTransitionShiftStart = firstTransitionMarkup.indexOf(
  '<g class="flock-inventory-shift"',
);
const firstTransitionRefillStart = firstTransitionMarkup.indexOf(
  '<g class="flock-inventory-refill"',
);
const firstTransitionShiftMarkup = firstTransitionMarkup.slice(
  firstTransitionShiftStart,
  firstTransitionRefillStart,
);
const firstTransitionRefillMarkup = firstTransitionMarkup.slice(
  firstTransitionRefillStart,
);
const inventoryTransitionStarts = [...svg.matchAll(/<g class="flock-inventory-transition"/g)].map(
  (match) => match.index,
);
const inventoryTransitionEnd = svg.indexOf('\n    <g style="opacity:0;animation:flock-grass-', inventoryTransitionStarts.at(-1));
const finalTransitionAlignmentProblems = inventoryTransitionStarts.flatMap((start, index) => {
  const beforeCount = flock.rosterSize - flock.fieldCount - index;
  const markup = svg.slice(start, inventoryTransitionStarts[index + 1] ?? inventoryTransitionEnd);
  const slots = [...markup.matchAll(/data-inventory-slot="(\d+)"/g)].map((match) => Number(match[1]));
  const shiftCount = Math.min(7, Math.max(0, beforeCount - 1));
  const shiftStart = Math.max(0, 8 - beforeCount);
  const expected = [
    7,
    ...Array.from({ length: shiftCount }, (_, slot) => shiftStart + slot),
    ...(beforeCount > 8 ? [0] : []),
  ];
  return slots.join(",") === expected.join(",") ? [] : [{ index, beforeCount, slots, expected }];
});
const gateKeyframes = svg.match(/@keyframes flock-inventory-gate\{([^\n]+)\}/)?.[1] ?? "";
const coreKeyframes = svg.match(/@keyframes flock-inventory-core\{([^\n]+)\}/)?.[1] ?? "";
const inventoryDockKeyframes = svg.match(
  /@keyframes flock-inventory-dock\{([^\n]+)\}/,
)?.[1] ?? "";
const coreTimingProblems = laterInventoryEvents.flatMap((event, index) => {
  const transitionStart = event.atS - 0.76;
  const gateOpenEnd = transitionStart + 0.18;
  const departHoldStart = transitionStart + 0.35;
  const shiftStart = transitionStart + 0.52;
  return !coreKeyframes.includes(`${inventoryPct(transitionStart)}%{opacity:0}`) ||
    !coreKeyframes.includes(`${inventoryPct(gateOpenEnd)}%{opacity:0.140}`) ||
    !coreKeyframes.includes(`${inventoryPct(departHoldStart)}%{opacity:0.140}`) ||
    !coreKeyframes.includes(`${inventoryPct(shiftStart)}%{opacity:0}`)
    ? [{ index, transitionStart, gateOpenEnd, departHoldStart, shiftStart }]
    : [];
});
const inventoryDiagnostics = {
  state: inventoryCounts.length < laterInventoryEvents.length + 2 ||
    finalQueueAlignmentProblems.length > 0 ||
    finalTransitionAlignmentProblems.length > 0 ||
    postOpeningIdleSlots.join(",") !== "0,1,2,3,4,5,6,7",
  tracks: inventoryShiftBlocks.length !== laterInventoryEvents.length ||
    inventoryLoadBlocks.length !== laterInventoryEvents.length ||
    openingLoadBlocks.length !== openingInventoryEvents.length ||
    openingBoardShiftBlocks.length !== openingInventoryEvents.length ||
    openingRefillBlocks.length !== openingRefillCount ||
    laterRefillBlocks.length !== Math.max(0, laterInventoryEvents.length - 8),
  openingTiming:
    !firstOpeningBoardShiftBlock.includes(`${inventoryPct(INVENTORY_OPENING_GATE_S + 0.18)}%{transform:translateX(0)}`) ||
    !firstOpeningBoardShiftBlock.includes(`${inventoryPct(INVENTORY_OPENING_GATE_S + 0.28)}%,`) ||
    !openingShiftBlock.includes(`${inventoryPct(openingMotionEndS)}%,100%{transform:translateX(18px)}`) ||
    !openingRefillBlocks[0]?.[1].includes(`${inventoryPct(openingMotionEndS)}%{opacity:0}`) ||
    !openingRefillBlocks.at(-1)?.[1].includes(`${inventoryPct(openingRevealEndS)}%,100%{opacity:1}`),
  laterTiming:
    !firstLoadBlock.includes(`${inventoryPct(firstAbsorbStart)}%{opacity:1}`) ||
    !firstLoadBlock.includes(`${inventoryPct(firstLoadEnd)}%,100%{opacity:0}`) ||
    !firstShiftBlock.includes(`${inventoryPct(firstShiftStart)}%{transform:translateX(0)}`) ||
    !firstShiftBlock.includes(`${inventoryPct(firstShiftEnd)}%,100%{transform:translateX(18px)}`) ||
    !laterRefillBlocks[0]?.[1].includes(`${inventoryPct(firstShiftEnd)}%{opacity:0}`) ||
    !laterRefillBlocks[0]?.[1].includes(`${inventoryPct(firstRefillEnd)}%,100%{opacity:1}`) ||
    Math.abs(firstSettleEnd - (firstLaterEvent?.atS ?? 0)) > 0.001,
  actors:
    openingRefillSlots.join(",") !== "0,1,2,3,4,5" ||
    !openingMarkup.includes('data-roster="13" data-inventory-slot="0"') ||
    !openingMarkup.includes('data-roster="8" data-inventory-slot="5"') ||
    !openingMarkup.includes('data-roster="7" data-inventory-slot="5"') ||
    !openingMarkup.includes('data-roster="6" data-inventory-slot="6"') ||
    firstTransitionShiftMarkup.includes('data-roster="14"') ||
    !firstTransitionRefillMarkup.includes('data-roster="14" data-inventory-slot="0"'),
  dock:
    !gateKeyframes.includes(`${inventoryPct(firstGateOpenEnd)}%{stroke-dashoffset:16}`) ||
    !gateKeyframes.includes(`${inventoryPct(firstDepartHoldStart)}%{stroke-dashoffset:16}`) ||
    !gateKeyframes.includes(`${inventoryPct(firstShiftStart)}%{stroke-dashoffset:0}`) ||
    !inventoryDockKeyframes.includes(`${inventoryPct(firstGateOpenEnd)}%{transform:translateY(18.5px)}`) ||
    !inventoryDockKeyframes.includes(`${inventoryPct(firstShiftStart - 0.001)}%{transform:translateY(18.5px)}`) ||
    !inventoryDockKeyframes.includes(`${inventoryPct(firstShiftStart)}%{transform:translateY(0)}`),
  light: coreTimingProblems.length > 0,
};
const failedInventoryDiagnostics = Object.entries(inventoryDiagnostics)
  .filter(([, failed]) => failed)
  .map(([name]) => name);
if (failedInventoryDiagnostics.length > 0) {
  console.error(`inventory diagnostics: ${failedInventoryDiagnostics.join(", ")}`);
}
if (
  inventoryCounts.length < laterInventoryEvents.length + 2 ||
  inventoryCounts.some(({ current, total }) => total !== flock.rosterSize || current < 0 || current > flock.rosterSize) ||
  inventoryCounts.slice(1).some(({ current }, index) => current > inventoryCounts[index].current) ||
  !inventoryCounts.some(({ current }) => current === flock.rosterSize - flock.fieldCount) ||
  inventoryCounts.at(-1)?.current !== 0 ||
  inventoryTags.length === 0 ||
  inventoryTags.some(({ rosterIndex, tag }) => tag !== getSheepTagCode(rosterIndex)) ||
  inventoryTagLightnesses.length !== inventoryTags.length ||
  inventoryTagLightnesses.some((lightness) => lightness !== 52) ||
  inventorySlots.some((slot) => slot < 0 || slot >= 8) ||
  finalQueueAlignmentProblems.length > 0 ||
  postOpeningIdleSlots.join(",") !== "0,1,2,3,4,5,6,7" ||
  finalTransitionAlignmentProblems.length > 0 ||
  initialInventoryOrder.join(",") !== "7,6,5,4,3,2,1,0" ||
  (svg.match(/<symbol id="flock-inventory-sheep-icon"/g) ?? []).length !== 1 ||
  inventorySheepUses !== inventoryTags.length ||
  inventoryShiftBlocks.length !== laterInventoryEvents.length ||
  inventoryShiftBlocks.some(([, , frames]) => !frames.includes("translateX(18px)") || frames.includes("translateX(-")) ||
  inventoryLoadBlocks.length !== laterInventoryEvents.length ||
  inventoryLoadBlocks.some(([, frames]) => !frames.includes("opacity:0") || frames.includes("transform:")) ||
  openingLoadBlocks.length !== openingInventoryEvents.length ||
  openingLoadBlocks.some(([, frames]) => !frames.includes("opacity:0") || frames.includes("transform:")) ||
  openingBoardShiftBlocks.length !== openingInventoryEvents.length ||
  openingBoardShiftBlocks.filter(([, frames]) => frames.includes("translateX(18px)")).length !== Math.max(0, openingInventoryEvents.length - 1) ||
  openingBoardShiftBlocks.some(([, frames]) => frames.includes("translateX(-")) ||
  !firstOpeningBoardShiftBlock.includes(`${inventoryPct(INVENTORY_OPENING_GATE_S + 0.18)}%{transform:translateX(0)}`) ||
  !firstOpeningBoardShiftBlock.includes(`${inventoryPct(INVENTORY_OPENING_GATE_S + 0.28)}%,`) ||
  openingRefillBlocks.length !== openingRefillCount ||
  laterRefillBlocks.length !== Math.max(0, laterInventoryEvents.length - 8) ||
  (svg.match(/data-beats="dock-settle-absorb-empty-shift-settle"/g) ?? []).length !== openingInventoryEvents.length ||
  (svg.match(/data-beats="approach-settle-absorb-direct-departure-shift-refill-settle-drop"/g) ?? []).length !== laterInventoryEvents.length ||
  !openingShiftBlock.includes(`${inventoryPct(openingMotionEndS)}%,100%{transform:translateX(18px)}`) ||
  !svg.includes('data-refill="shift-then-stagger"') ||
  (openingRefillCount > 0 &&
    (!openingRefillBlocks[0]?.[1].includes(`${inventoryPct(openingMotionEndS)}%{opacity:0}`) ||
      !openingRefillBlocks.at(-1)?.[1].includes(`${inventoryPct(openingRevealEndS)}%,100%{opacity:1}`))) ||
  !firstLoadBlock.includes(`${inventoryPct(firstAbsorbStart)}%{opacity:1}`) ||
  !firstLoadBlock.includes(`${inventoryPct(firstLoadEnd)}%,100%{opacity:0}`) ||
  !gateKeyframes.includes(`${inventoryPct(INVENTORY_OPENING_GATE_S)}%{stroke-dashoffset:16}`) ||
  !gateKeyframes.includes(`${inventoryPct(INVENTORY_OPENING_GATE_S + openingInventoryEvents.length * INVENTORY_OPENING_CYCLE_S)}%{stroke-dashoffset:16}`) ||
  !gateKeyframes.includes(`${inventoryPct(firstGateOpenEnd)}%{stroke-dashoffset:16}`) ||
  !gateKeyframes.includes(`${inventoryPct(firstDepartHoldStart)}%{stroke-dashoffset:16}`) ||
  !gateKeyframes.includes(`${inventoryPct(firstShiftStart)}%{stroke-dashoffset:0}`) ||
  !firstShiftBlock.includes(`${inventoryPct(firstShiftStart)}%{transform:translateX(0)}`) ||
  !firstShiftBlock.includes(`${inventoryPct(firstShiftEnd)}%,100%{transform:translateX(18px)}`) ||
  !laterRefillBlocks[0]?.[1].includes(`${inventoryPct(firstShiftEnd)}%{opacity:0}`) ||
  !laterRefillBlocks[0]?.[1].includes(`${inventoryPct(firstRefillEnd)}%,100%{opacity:1}`) ||
  Math.abs(firstSettleEnd - (firstLaterEvent?.atS ?? 0)) > 0.001 ||
  openingRefillSlots.join(",") !== "0,1,2,3,4,5" ||
  !openingMarkup.includes('data-roster="13" data-inventory-slot="0"') ||
  !openingMarkup.includes('data-roster="8" data-inventory-slot="5"') ||
  !openingMarkup.includes('data-roster="7" data-inventory-slot="5"') ||
  !openingMarkup.includes('data-roster="6" data-inventory-slot="6"') ||
  !firstTransitionMarkup.includes('animation:flock-inventory-load-0') ||
  !firstTransitionMarkup.includes('data-roster="6" data-inventory-slot="7"') ||
  !firstTransitionMarkup.includes('data-board-occluded-slot="7"') ||
  !firstTransitionMarkup.includes('animation:flock-inventory-shift-0') ||
  firstTransitionShiftMarkup.includes('data-roster="14"') ||
  !firstTransitionRefillMarkup.includes('animation:flock-inventory-refill-0') ||
  !firstTransitionRefillMarkup.includes('data-roster="14" data-inventory-slot="0"') ||
  !svg.includes('<clipPath id="flock-inventory-clip"><rect x="287" y="123" width="142" height="11"/>') ||
  svg.includes('flock-inventory-board-clip') ||
  svg.includes('translateY(-10px)') ||
  svg.indexOf('<g class="flock-panel"') > svg.indexOf('<g class="ufo-move"') ||
  svg.indexOf('<g class="ufo-move"') > svg.indexOf('<g class="flock-inventory-dock-activity"') ||
  !svg.includes('<path class="flock-inventory-pen" d="M413 123V134H429V123"/>') ||
  !svg.includes('<path class="flock-inventory-gate" d="M413 123H429"/>') ||
  svg.includes('class="flock-inventory-ufo"') ||
  (svg.match(/class="ufo-body"/g) ?? []).length !== 1 ||
  !svg.includes('flock-inventory-dock') ||
  !inventoryDockKeyframes.includes(`transform:translateY(18.5px)`) ||
  !inventoryDockKeyframes.includes(`${inventoryPct(INVENTORY_OPENING_GATE_S)}%{transform:translateY(18.5px)}`) ||
  !inventoryDockKeyframes.includes(`${inventoryPct(openingDepartLeadS)}%{transform:translateY(18.5px)}`) ||
  !inventoryDockKeyframes.includes(`${inventoryPct(timing.openingBoardEndAbsS)}%{transform:translateY(0)}`) ||
  !inventoryDockKeyframes.includes(`${inventoryPct(firstGateOpenEnd)}%{transform:translateY(18.5px)}`) ||
  !inventoryDockKeyframes.includes(`${inventoryPct(firstShiftStart - 0.001)}%{transform:translateY(18.5px)}`) ||
  !inventoryDockKeyframes.includes(`${inventoryPct(firstShiftStart)}%{transform:translateY(0)}`) ||
  !svg.includes('<text x="231" y="133" class="flock-meta-key">양떼</text>') ||
  !svg.includes('<text x="283" y="133" text-anchor="end" class="flock-meta-value">') ||
  !svg.includes("@keyframes flock-inventory-opening-shift") ||
  (svg.match(/@keyframes flock-inventory-shift-/g) ?? []).length !== flock.rosterSize - flock.fieldCount ||
  svg.includes("flock-inventory-return") ||
  (svg.match(/class="flock-inventory-core"/g) ?? []).length !== 1 ||
  (svg.match(/class="flock-inventory-gate"/g) ?? []).length !== 1 ||
  (svg.match(/class="flock-inventory-board-body"/g) ?? []).length !== inventorySpawnEvents.length ||
  (svg.match(/flock-inventory-board-tag"/g) ?? []).length !== inventorySpawnEvents.length ||
  (svg.match(/class="flock-inventory-opening-shift"/g) ?? []).length !== openingInventoryEvents.length + 1 ||
  (svg.match(/class="flock-inventory-shift"/g) ?? []).length !== laterInventoryEvents.length ||
  (svg.match(/class="flock-inventory-refill"/g) ?? []).length !== openingRefillBlocks.length + laterRefillBlocks.length ||
  !svg.includes('class="flock-inventory-core"') ||
  !svg.includes('fill="var(--gm-beam-core)" style="opacity:0;animation:flock-inventory-core') ||
  coreTimingProblems.length > 0 ||
  !svg.includes('.flock-secondary-motion,#grass-crumbs{animation:flock-turnover-focus') ||
  (svg.match(/class="flock-secondary-motion"/g) ?? []).length !== 1
) {
  throw new Error("eight-pen batch boarding, adjacent queue shift, or identity stamps drifted");
}
const rosterActorIndices = [...svg.matchAll(/data-roster-index="(\d+)"/g)].map(
  (match) => Number(match[1]),
);
if (
  svg.includes("-9999px") ||
  rosterActorIndices.length !== flock.rosterSize ||
  new Set(rosterActorIndices).size !== flock.rosterSize ||
  rosterActorIndices.some(
    (rosterIndex) =>
      !svg.includes(`@keyframes sheep-roster-${rosterIndex}-visible`),
  )
) {
  throw new Error("field sheep still reuse an offscreen slot actor instead of distinct roster actors");
}
const visibleSheepJumpProblems = Array.from({ length: sheepCount }, (_, slotIndex) => {
  const move = svg.match(
    new RegExp(`@keyframes sheep-${slotIndex}-move \\{([\\s\\S]*?)\\n  \\}`),
  )?.[1] ?? "";
  const frames = [...move.matchAll(/(?:^|\n\s*)([\d.]+)% \{ transform: translate\(([-\d.]+)px, ([-\d.]+)px\)[^;]+; opacity: ([01]);/g)]
    .map(([, pct, x, y, opacity]) => ({ pct: Number(pct), x: Number(x), y: Number(y), opacity: Number(opacity) }));
  return frames.slice(1).flatMap((frame, index) => {
    const previous = frames[index];
    const distance = Math.hypot(frame.x - previous.x, frame.y - previous.y);
    return previous.opacity === 1 && frame.opacity === 1 && distance > CELL_SIZE + GAP + 4
      ? [{ slotIndex, previous, frame, distance }]
      : [];
  });
}).flat();
if (visibleSheepJumpProblems.length) {
  throw new Error(`visible sheep teleport between route frames: ${JSON.stringify(visibleSheepJumpProblems)}`);
}
const deploymentFlightProblems = Array.from(
  { length: Math.max(0, sheepCount - 1) },
  (_, index) => {
    const from = timing.ufoStopCells[index];
    const to = timing.ufoStopCells[index + 1];
    const actual =
      timing.ufoArriveAbsSOffset[index + 1] -
      timing.ufoLeaveAbsSOffset[index];
    const expected = UFO_BLINK_TRAVEL_S;
    return Math.abs(actual - expected) > 0.001
      ? { index, from, to, actual, expected }
      : null;
  },
).filter(Boolean);
if (deploymentFlightProblems.length) {
  throw new Error(
    `long deployment flights are still compressed: ${JSON.stringify(deploymentFlightProblems)}`,
  );
}
const ufoVisibility =
  svg.match(/@keyframes ufo-visibility \{([\s\S]*?)\n  \}/)?.[1] ?? "";
const ufoBodyOpacities = [...ufoVisibility.matchAll(/opacity: ([\d.]+)/g)]
  .map((match) => Number(match[1]));
const ufoLight =
  svg.match(/@keyframes ufo-light \{([\s\S]*?)\n  \}/)?.[1] ?? "";
const ufoStreak =
  svg.match(/@keyframes ufo-streak \{([\s\S]*?)\n  \}/)?.[1] ?? "";
const visibilityFrame = (time, opacity) =>
  `${((time * 100) / timing.maxTotalTimeWithEntryExit).toFixed(4)}% { opacity: ${opacity}; }`;
const streakFrame = (time, opacity, scale) =>
  `${((time * 100) / timing.maxTotalTimeWithEntryExit).toFixed(4)}% { opacity: ${opacity}; transform: scaleY(${scale}); }`;
const ufoPositionAt = (time) => {
  const pct = ((time * 100) / timing.maxTotalTimeWithEntryExit).toFixed(4);
  const matches = [...ufoMove.matchAll(
    new RegExp(`(?:^|\\n\\s*)${pct}% \\{ transform: translate\\(([-\\d.]+)px, ([-\\d.]+)px\\);`, "g"),
  )];
  const match = matches.at(-1);
  return match ? { x: Number(match[1]) + UFO_WIDTH_PX / 2, y: Number(match[2]) + UFO_WIDTH_PX / 2 } : null;
};
const ufoPositionProblem = (time, expected) => {
  const actual = ufoPositionAt(time);
  return actual == null || Math.hypot(actual.x - expected.x, actual.y - expected.y) > 0.001;
};
const ufoHoldProblem = (start, end, expected) =>
  [...ufoMove.matchAll(/([\d.]+)% \{ transform: translate\(([-\d.]+)px, ([-\d.]+)px\);/g)]
    .some((match) => {
      const time = Number(match[1]) * timing.maxTotalTimeWithEntryExit / 100;
      const x = Number(match[2]) + UFO_WIDTH_PX / 2;
      const y = Number(match[3]) + UFO_WIDTH_PX / 2;
      return time >= start - 0.001 && time <= end + 0.001 &&
        Math.hypot(x - expected.x, y - expected.y) > 0.001;
    });
const blinkProblem = (
  from,
  to,
  depart,
  arrive,
) => {
  const duration = arrive - depart;
  const edgeDuration = Math.min(UFO_BLINK_EDGE_S, duration / 2);
  const edgeOut = depart + edgeDuration;
  const edgeIn = arrive - edgeDuration;
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const edgeRatio = distance > 0 ? Math.min(0.5, 8 / distance) : 0;
  const edgeOutPoint = {
    x: from.x + (to.x - from.x) * edgeRatio,
    y: from.y + (to.y - from.y) * edgeRatio,
  };
  const edgeInPoint = {
    x: from.x + (to.x - from.x) * (1 - edgeRatio),
    y: from.y + (to.y - from.y) * (1 - edgeRatio),
  };
  const expected = [
    [depart, from],
    [edgeOut, edgeOutPoint],
    [edgeIn, edgeInPoint],
    [arrive, to],
  ];
  const badPosition = expected.find(([time, point]) => {
    const actual = ufoPositionAt(time);
    return actual == null || Math.hypot(actual.x - point.x, actual.y - point.y) > 0.001;
  });
  const visibility = [
    visibilityFrame(depart, 1),
    visibilityFrame(edgeOut, 1),
    visibilityFrame(edgeOut, 0),
    visibilityFrame(edgeIn, 0),
    visibilityFrame(edgeIn, 1),
    visibilityFrame(arrive, 1),
  ];
  return badPosition || visibility.some((frame) => !ufoVisibility.includes(frame))
    ? { depart, arrive, badPosition, visibility }
    : null;
};
const firstDeployPx = getCellCenterPx(
  timingContext.gridLeftX,
  timingContext.gridTopY,
  timing.ufoStopCells[0][0],
  timing.ufoStopCells[0][1],
);
const inventoryDockStagingPx = { x: 421, y: timingContext.baseHeight + 2 };
const firstArrival = timing.ufoArriveAbsSOffset[0];
const firstDeparture = firstArrival - UFO_ENTRY_S;
const inventoryDockDownPx = {
  x: inventoryDockStagingPx.x,
  y: inventoryDockStagingPx.y + 18.5,
};
const firstArrivalFlash = `${((firstArrival * 100) / timing.maxTotalTimeWithEntryExit).toFixed(4)}% { opacity: 0.38; }`;
if (
  blinkProblem(inventoryDockDownPx, firstDeployPx, firstDeparture, firstArrival) ||
  ufoPositionProblem(INVENTORY_OPENING_GATE_S, inventoryDockDownPx) ||
  ufoPositionProblem(firstDeparture, inventoryDockDownPx) ||
  ufoHoldProblem(INVENTORY_OPENING_GATE_S, firstDeparture, inventoryDockDownPx) ||
  !ufoStreak.includes(streakFrame(firstDeparture, 0, 0.2)) ||
  ufoBodyOpacities.some((opacity) => opacity !== 0 && opacity !== 1) ||
  !/class="ufo-body" style="animation:ufo-visibility [\d.]+s step-end/.test(svg) ||
  !ufoLight.includes(firstArrivalFlash)
) {
  throw new Error("first deployment loses the visible-edge green blink arrival grammar");
}
const deploymentJumpProblems = Array.from(
  { length: Math.max(0, sheepCount - 1) },
  (_, index) => {
    const from = getCellCenterPx(
      timingContext.gridLeftX,
      timingContext.gridTopY,
      timing.ufoStopCells[index][0],
      timing.ufoStopCells[index][1],
    );
    const to = getCellCenterPx(
      timingContext.gridLeftX,
      timingContext.gridTopY,
      timing.ufoStopCells[index + 1][0],
      timing.ufoStopCells[index + 1][1],
    );
    const arrive = timing.ufoArriveAbsSOffset[index + 1];
    const depart = timing.ufoLeaveAbsSOffset[index];
    const arrivePct = ((arrive * 100) / timing.maxTotalTimeWithEntryExit).toFixed(4);
    const flash = `${arrivePct}% { opacity: 0.38; }`;
    return blinkProblem(from, to, depart, arrive) ||
      !ufoLight.includes(flash)
      ? { index, depart, arrive }
      : null;
  },
).filter(Boolean);
if (deploymentJumpProblems.length) {
  throw new Error(`opening deployment loses the shared visible-edge blink flight: ${JSON.stringify(deploymentJumpProblems)}`);
}
const turnoverFlightProblems = timing.turnovers.flatMap((turnover, index) => {
  const arrivePct = (turnover.dropArriveAbsS * 100) / timing.maxTotalTimeWithEntryExit;
  const pickup = getCellCenterPx(
    timingContext.gridLeftX,
    timingContext.gridTopY,
    turnover.pickupCell[0],
    turnover.pickupCell[1],
  );
  const drop = getCellCenterPx(
    timingContext.gridLeftX,
    timingContext.gridTopY,
    turnover.dropCell[0],
    turnover.dropCell[1],
  );
  const arriveFlash = `${arrivePct.toFixed(4)}% { opacity: 0.38; }`;
  const playbackDuration =
    (turnover.dropArriveAbsS - turnover.outgoingHiddenAbsS) * MOTION_TIME_SCALE;
  const transitionStart = turnover.dropArriveAbsS - 0.76;
  const dockedAt = transitionStart + 0.18;
  const departAt = transitionStart + 0.52;
  const inboundBlink = blinkProblem(
    pickup,
    inventoryDockDownPx,
    turnover.outgoingHiddenAbsS,
    dockedAt,
  );
  const outboundBlink = blinkProblem(
    inventoryDockDownPx,
    drop,
    departAt,
    turnover.dropArriveAbsS,
  );
  return inboundBlink ||
    outboundBlink ||
    ufoPositionProblem(departAt, inventoryDockDownPx) ||
    ufoHoldProblem(dockedAt, departAt, inventoryDockDownPx) ||
    !ufoStreak.includes(streakFrame(departAt, 0, 0.2)) ||
    !ufoStreak.includes(streakFrame(turnover.dropArriveAbsS, 0, 0.2)) ||
    !ufoLight.includes(arriveFlash) ||
    Math.abs(playbackDuration - INVENTORY_TURNOVER_EXCHANGE_S * MOTION_TIME_SCALE) > 0.001
    ? [{
        index,
        playbackDuration,
        inboundBlink,
        outboundBlink,
        arriveFlash: ufoLight.includes(arriveFlash),
      }]
    : [];
});
if (turnoverFlightProblems.length) {
  throw new Error(`turnover loses the inventory-facing blink-flight rhythm: ${JSON.stringify(turnoverFlightProblems)}`);
}
const offstageCenterY =
  getCellCenterPx(timingContext.gridLeftX, timingContext.gridTopY, 0, 0).y - 60;
const lastStopIndex = timing.ufoStopCells.length - 1;
const lastStopCell = timing.ufoStopCells[lastStopIndex];
const lastStopPx = getCellCenterPx(
  timingContext.gridLeftX,
  timingContext.gridTopY,
  lastStopCell[0],
  lastStopCell[1],
);
const stageExitDepart = timing.ufoLeaveAbsSOffset[lastStopIndex];
const offstageGapProblems = timing.ufoStopCells.flatMap((cell, index) => {
  if (index >= timing.ufoStopCells.length - 1) return [];
  const isTurnoverExchange =
    index >= flock.fieldCount &&
    (index - flock.fieldCount) % 2 === 0;
  if (isTurnoverExchange) return [];
  const depart = timing.ufoLeaveAbsSOffset[index];
  const arrive = timing.ufoArriveAbsSOffset[index + 1];
  if (arrive - depart <= 0.8) return [];
  const next = timing.ufoStopCells[index + 1];
  const from = getCellCenterPx(
    timingContext.gridLeftX,
    timingContext.gridTopY,
    cell[0],
    cell[1],
  );
  const to = getCellCenterPx(
    timingContext.gridLeftX,
    timingContext.gridTopY,
    next[0],
    next[1],
  );
  return [
    blinkProblem(from, { x: from.x, y: offstageCenterY }, depart, depart + UFO_BLINK_TRAVEL_S),
    blinkProblem({ x: to.x, y: offstageCenterY }, to, arrive - UFO_BLINK_TRAVEL_S, arrive),
  ].filter(Boolean);
});
const serviceBlinkProblems = [
  ...offstageGapProblems,
  blinkProblem(
    lastStopPx,
    { x: lastStopPx.x, y: offstageCenterY },
    stageExitDepart,
    stageExitDepart + UFO_BLINK_TRAVEL_S,
  ),
  ...timing.pickupArriveAbsSOffsetForUfo.map((arrive, index) => {
    const cell = timing.pickupCells[index];
    const to = getCellCenterPx(
      timingContext.gridLeftX,
      timingContext.gridTopY,
      cell[0],
      cell[1],
    );
    const from = index === 0
      ? { x: to.x, y: offstageCenterY }
      : getCellCenterPx(
          timingContext.gridLeftX,
          timingContext.gridTopY,
          timing.pickupCells[index - 1][0],
          timing.pickupCells[index - 1][1],
        );
    return blinkProblem(from, to, arrive - UFO_BLINK_TRAVEL_S, arrive);
  }),
  (() => {
    const lastPickup = timing.pickupCells.at(-1);
    const centre = timing.sweepPositions[0];
    return blinkProblem(
      getCellCenterPx(
        timingContext.gridLeftX,
        timingContext.gridTopY,
        lastPickup[0],
        lastPickup[1],
      ),
      getCellCenterPx(
        timingContext.gridLeftX,
        timingContext.gridTopY,
        centre[0],
        centre[1],
      ),
      timing.sweepArriveAbsSOffset[0] - UFO_BLINK_TRAVEL_S,
      timing.sweepArriveAbsSOffset[0],
    );
  })(),
  (() => {
    const cell = timing.sweepPositions[0];
    const from = getCellCenterPx(
      timingContext.gridLeftX,
      timingContext.gridTopY,
      cell[0],
      cell[1],
    );
    return blinkProblem(
      from,
      { x: from.x, y: offstageCenterY },
      timing.ufoExitStartAbsSOffset,
      timing.ufoExitEndAbsSOffset,
    );
  })(),
].filter(Boolean);
if (serviceBlinkProblems.length) {
  throw new Error(`collection or offstage service loses the shared blink flight: ${JSON.stringify(serviceBlinkProblems)}`);
}
const inboundHandoffProblems = timing.turnovers.flatMap((turnover, index) => {
  const incoming = timing.flock.sheep[turnover.incomingRosterIndex];
  return incoming?.inboundAbsS !== turnover.outgoingHiddenAbsS ||
    !(turnover.outgoingHiddenAbsS < incoming.spawnAbsS)
    ? [{ index, incoming: incoming?.rosterIndex, inbound: incoming?.inboundAbsS, spawn: incoming?.spawnAbsS }]
    : [];
});
if (inboundHandoffProblems.length) {
  throw new Error(`panel does not identify the hungry replacement before UFO travel: ${JSON.stringify(inboundHandoffProblems)}`);
}
const handoffGapS = 0.55;
const heroList = (svg.match(/data-camera-heroes="([\d,]+)"/)?.[1] ?? "")
  .split(",")
  .filter(Boolean)
  .map(Number);
const heroModes = (svg.match(/data-camera-modes="([a-z,]+)"/)?.[1] ?? "")
  .split(",")
  .filter(Boolean);
const cameraVisibleTrack = svg.match(
  /@keyframes flock-camera-visible \{([\s\S]*?)\n  \}/,
)?.[1] ?? "";
const selectedTracks = [...svg.matchAll(
  /@keyframes flock-selected-\d+ \{([\s\S]*?)\n  \}/g,
)].map((match) =>
  [...match[1].matchAll(/([\d.]+)% \{ opacity:([\d.]+); \}/g)].map(
    (frame) => ({ pct: Number(frame[1]), opacity: Number(frame[2]) }),
  ),
);
const handoffGapProblems = heroList.flatMap((rosterIndex, heroIndex) => {
  const priorHero = timing.flock.sheep[heroList[heroIndex - 1]];
  const switchAt = priorHero?.hiddenAbsS ?? timing.flock.sheep[rosterIndex].spawnAbsS;
  const selected = svg.match(
    new RegExp(`@keyframes flock-selected-${rosterIndex} \\{([\\s\\S]*?)\\n  \\}`),
  )?.[1] ?? "";
  const selectedAt = switchAt + (heroIndex === 0 ? 0 : handoffGapS);
  const switchPct = ((switchAt * 100) / timing.maxTotalTimeWithEntryExit).toFixed(4);
  const selectedPct = ((selectedAt * 100) / timing.maxTotalTimeWithEntryExit).toFixed(4);
  const hiddenPct = (((timing.flock.sheep[rosterIndex].hiddenAbsS ?? 0) * 100) /
    timing.maxTotalTimeWithEntryExit).toFixed(4);
  const gapMidPct = (((switchAt + selectedAt) / 2) * 100) / timing.maxTotalTimeWithEntryExit;
  const gapLeaks = selectedTracks.some((frames) => {
    const nextIndex = frames.findIndex((frame) => frame.pct >= gapMidPct);
    const previous = frames[Math.max(0, nextIndex - 1)];
    const next = frames[nextIndex < 0 ? frames.length - 1 : nextIndex];
    return (previous?.opacity ?? 0) > 0 || (next?.opacity ?? 0) > 0;
  });
  return !selected.includes(`${selectedPct}% { opacity:1; }`) ||
    !cameraVisibleTrack.includes(`${selectedPct}% { opacity:1; }`) ||
    !cameraVisibleTrack.includes(`${hiddenPct}% { opacity:0; }`) ||
    (heroIndex > 0 && selected.includes(`${switchPct}% { opacity:1; }`)) ||
    (heroIndex > 0 && gapLeaks)
    ? [{ roster: rosterIndex, switchPct, selectedPct, gapLeaks }]
    : [];
});
if (handoffGapProblems.length) {
  throw new Error(`hero-camera handoff loses its empty beat: ${JSON.stringify(handoffGapProblems)}`);
}
if (
  svg.includes('class="ufo-commit-cell"') ||
  svg.includes("@keyframes ufo-commit-cell") ||
  svg.includes('class="flock-exchange') ||
  svg.includes('class="flock-panel-divider"') ||
  svg.includes(">수거 중</text>") ||
  svg.includes(">출동 대기</text>") ||
  svg.includes(">수거 완료</text>") ||
  />수거 \d+<\/text>/.test(svg) ||
  />출동 \d+<\/text>/.test(svg) ||
  svg.includes(">착지 중</text>") ||
  svg.includes("l2.2 2.2 4-4.4") ||
  svg.includes("l2 2 4-5")
) {
  throw new Error("rejected exchange labels, mobile icons, or energy cargo returned");
}
const landingHoldProblems = timing.turnovers.flatMap((turnover, index) => {
  const move = svg.match(
    new RegExp(`@keyframes sheep-${turnover.slotIndex}-move \\{([\\s\\S]*?)\\n  \\}`),
  )?.[1] ?? "";
  const frameAt = (time, opacity = 1) => {
    const pct = ((time * 100) / timing.maxTotalTimeWithEntryExit).toFixed(4);
    return [...move.matchAll(new RegExp(`(?:^|\\n\\s*)${pct}% \\{ transform: ([^;]+); opacity: ${opacity};`, "g"))].at(-1)?.[1];
  };
  const spawn = frameAt(turnover.incomingSpawnAbsS, 0);
  const landing = frameAt(turnover.incomingReadyAbsS - 0.06);
  const ready = frameAt(turnover.incomingReadyAbsS);
  const moveStart = frameAt(turnover.incomingMoveAbsS);
  const leave = timing.ufoLeaveAbsSOffset[flock.fieldCount + index * 2 + 1];
  const expectedMove = leave + UFO_BLINK_EDGE_S + UFO_BLINK_FADE_S;
  const bridgeStepDuration = turnover.dropPath.length > 1
    ? turnover.bridgeDuration / (turnover.dropPath.length - 1)
    : 0;
  const moveStartPct = (turnover.incomingMoveAbsS * 100) / timing.maxTotalTimeWithEntryExit;
  const bridgeEndPct = ((turnover.incomingMoveAbsS + turnover.bridgeDuration) * 100) / timing.maxTotalTimeWithEntryExit;
  const allowedPcts = turnover.dropPath.map(
    (_, pathIndex) => ((turnover.incomingMoveAbsS + bridgeStepDuration * pathIndex) * 100) / timing.maxTotalTimeWithEntryExit,
  );
  const unexpectedFrames = [...move.matchAll(/(?:^|\n\s*)([\d.]+)% \{ transform: ([^;]+); opacity: ([01]);/g)]
    .map(([, pct, transform, opacity]) => ({ pct: Number(pct), transform, opacity: Number(opacity) }))
    .filter(({ pct }) =>
      pct > moveStartPct + 0.0002 &&
      pct < bridgeEndPct - 0.0002 &&
      allowedPcts.every((allowedPct) => Math.abs(pct - allowedPct) > 0.0002),
    );
  return spawn == null || landing == null || ready == null || moveStart == null || spawn !== landing || landing !== ready || ready !== moveStart || unexpectedFrames.length > 0 || leave <= turnover.incomingReadyAbsS || Math.abs(expectedMove - turnover.incomingMoveAbsS) > 0.001
    ? [{ index, spawn, landing, ready, moveStart, unexpectedFrames, leave, expectedMove, actualMove: turnover.incomingMoveAbsS }]
    : [];
});
if (landingHoldProblems.length) {
  throw new Error(`replacement leaves its exact drop before the first bridge step: ${JSON.stringify(landingHoldProblems)}`);
}
const openingAnchorProblems = Array.from({ length: timingPlan.sheepCount }, (_, index) => {
  const move = svg.match(
    new RegExp(`@keyframes sheep-${index}-move \\{([\\s\\S]*?)\\n  \\}`),
  )?.[1] ?? "";
  const frameAt = (time, opacity) => {
    const pct = ((time * 100) / timing.maxTotalTimeWithEntryExit).toFixed(4);
    return [...move.matchAll(new RegExp(`(?:^|\\n\\s*)${pct}% \\{ transform: ([^;]+); opacity: ${opacity};`, "g"))].at(-1)?.[1];
  };
  const spawn = frameAt(timing.spawnAbsSOffset[index], 0);
  const ready = frameAt(timing.readyAbsSOffset[index], 1);
  return spawn == null || ready == null || spawn !== ready
    ? { index, spawn, ready }
    : null;
}).filter(Boolean);
if (openingAnchorProblems.length) {
  throw new Error(`opening sheep do not materialize on their exact drop cell: ${JSON.stringify(openingAnchorProblems)}`);
}
if (Math.abs(runtime - timing.maxTotalTimeWithEntryExit * MOTION_TIME_SCALE) > 0.001) {
  throw new Error(`visual runtime does not apply the 1.3x motion scale: ${runtime}`);
}
for (const sheep of timing.flock.sheep) {
  let energy = 0;
  let priorProgress = 0;
  const fill = svg.match(
    new RegExp(`@keyframes flock-fill-${sheep.rosterIndex} \\{([^\\n]*)`),
  )?.[1] ?? "";
  const pulse = svg.match(
    new RegExp(`@keyframes flock-meter-pulse-${sheep.rosterIndex} \\{([^\\n]*)`),
  )?.[1] ?? "";
  for (const bite of sheep.bites) {
    energy += bite.level;
    const expected = Math.min(1, energy / sheep.capacity);
    if (Math.abs(bite.progress - expected) > 0.001) {
      throw new Error(`sheep ${sheep.rosterIndex} fullness does not follow grass level energy`);
    }
    const atS = bite.atS + 0.23;
    const beforePct = (((atS - 0.001) / timing.maxTotalTimeWithEntryExit) * 100).toFixed(4);
    const bitePct = ((atS / timing.maxTotalTimeWithEntryExit) * 100).toFixed(4);
    if (
      !fill.includes(`${beforePct}% { transform:scaleX(${priorProgress.toFixed(3)}); }`) ||
      !fill.includes(`${bitePct}% { transform:scaleX(${bite.progress.toFixed(3)}); }`)
    ) {
      throw new Error(`sheep ${sheep.rosterIndex} fullness drifts between bites`);
    }
    const pulseEndPct = (((atS + 0.14) / timing.maxTotalTimeWithEntryExit) * 100).toFixed(4);
    if (
      !pulse.includes(`${bitePct}% { opacity:1; }`) ||
      !pulse.includes(`${pulseEndPct}% { opacity:0; }`) ||
      !svg.includes(`>${Math.min(sheep.capacity, energy)}/${sheep.capacity}</text>`)
    ) {
      throw new Error(`sheep ${sheep.rosterIndex} bite energy feedback is not synchronized`);
    }
    priorProgress = bite.progress;
  }
}
if (
  !svg.includes(".flock-meter-pulse, .flock-map-pulse { display: none; }") ||
  !svg.includes(".flock-camera-live, .flock-inventory-motion, .flock-inventory-shift, .flock-inventory-opening-shift, .flock-inventory-refill, .flock-inventory-core, .flock-inventory-gate, .flock-inventory-board-body, .flock-inventory-board-tag, .flock-inventory-dock-activity { animation-timing-function: step-end !important; }") ||
  !svg.includes(".flock-inventory-dock-motion { animation-timing-function: step-start !important; }")
) {
  throw new Error("reduced motion does not hide bite feedback pulses");
}
if (
  !svg.includes(".flock-meta-key, .flock-meta-value { font-size: 9px; }") ||
  !svg.includes(".flock-name, .flock-status, .flock-label, .flock-energy { font-size: 10px; }") ||
  !svg.includes(".flock-inventory-pen, .flock-inventory-gate { stroke-width: 1.2; }") ||
  !svg.includes(".flock-inventory-tag { stroke-width: .6; }") ||
  !svg.includes(".flock-map-focus { stroke-width: 1.8; }") ||
  !svg.includes(".ufo-ripple, #grass-crumbs, .flock-map-pulse { display: none; }")
) {
  throw new Error("350px presentation lost its native SVG readability correction");
}
const turnoverPathProblems = timing.turnovers.flatMap((turnover, index) => {
  const firstBite = timing.flock.sheep[turnover.incomingRosterIndex]?.bites[0];
  return turnover.dropPath.length !== 1 ||
    turnover.dropCell.join(",") !== firstBite?.cell
    ? [{ index, path: turnover.dropPath, drop: turnover.dropCell, firstBite: firstBite?.cell }]
    : [];
});
if (turnoverPathProblems.length) {
  throw new Error(`replacement sheep do not return to their actual work cell: ${JSON.stringify(turnoverPathProblems)}`);
}
const walkingPickupCount = flock.turnovers.filter((turnover) => {
  const finalBite = flock.bites
    .filter((bite) => bite.rosterIndex === turnover.outgoingRosterIndex)
    .at(-1);
  return finalBite != null && turnover.pickupCell.join(",") !== finalBite.cell;
}).length;
if (
  walkingPickupCount === 0 ||
  flock.turnovers.some(
    (turnover) => turnover.resumeHistoryIndex - turnover.historyIndex !== 1,
  )
) {
  throw new Error("full sheep stop before their final recorded pickup approach");
}
const turnoverPaceProblems = timing.turnovers.flatMap((turnover, index) => {
  const expectedDuration = (turnover.dropPath.length - 1) * SHEEP_CELL_TIME;
  return Math.abs(turnover.bridgeDuration - expectedDuration) > 0.001
    ? [{ index, duration: turnover.bridgeDuration, expectedDuration, path: turnover.dropPath }]
    : [];
});
if (turnoverPaceProblems.length) {
  throw new Error(`replacement sheep rush their landing paths: ${JSON.stringify(turnoverPaceProblems)}`);
}
const turnoverHoldProblems = timing.turnovers.flatMap((turnover, index) => {
  if (flock.turnovers[index].bridgeHold <= 0.001) return [];
  const pose = svg.match(
    new RegExp(`@keyframes sheep-${turnover.slotIndex}-pose \\{([\\s\\S]*?)\\n  \\}`),
  )?.[1] ?? "";
  const bridgeEndPct = Math.min(
    99.9999,
    ((turnover.incomingMoveAbsS + turnover.bridgeDuration) * 100) /
      timing.maxTotalTimeWithEntryExit,
  ).toFixed(4);
  const frames = [...pose.matchAll(
    new RegExp(`${bridgeEndPct}% \\{ transform: ([^;]+); \\}`, "g"),
  )];
  return !["translateY(0) scale(1, 1)", "scale(1, 1)"].includes(frames.at(-1)?.[1])
    ? [{ index, bridgeEndPct, finalPose: frames.at(-1)?.[1] }]
    : [];
});
if (turnoverHoldProblems.length) {
  throw new Error(`replacement sheep freeze mid-step after landing: ${JSON.stringify(turnoverHoldProblems)}`);
}
if (
  flock.fieldCount !== 6 ||
  flock.rosterSize !== 28 ||
  timing.turnovers.length !== 22 ||
  timing.ufoStopCells.length !== flock.fieldCount + timing.turnovers.length * 2 ||
  timing.turnovers.some(
    (turnover, index) =>
      turnover.pickupArriveAbsS >= turnover.incomingSpawnAbsS ||
      turnover.pickupArriveAbsS >= turnover.outgoingHiddenAbsS ||
      turnover.outgoingHiddenAbsS >= turnover.dropArriveAbsS ||
      turnover.dropArriveAbsS > turnover.incomingSpawnAbsS ||
      turnover.incomingSpawnAbsS >= turnover.incomingReadyAbsS ||
      turnover.incomingReadyAbsS >= turnover.incomingMoveAbsS ||
      turnover.addedDelay <= 0 ||
      turnover.addedDelay + 0.001 < flock.turnovers[index].bridgeDelay ||
      turnover.dropPath[0].join(",") !== turnover.dropCell.join(",") ||
      timing.ufoStopCells[flock.fieldCount + index * 2].join(",") !==
        turnover.pickupCell.join(",") ||
      timing.ufoStopCells[flock.fieldCount + index * 2 + 1].join(",") !==
        turnover.dropCell.join(","),
  )
) {
  throw new Error(`full sheep do not receive serialized inventory replacements`);
}
if (
  timing.flock.sheep.some(
    (sheep) =>
      sheep.pickupAbsS == null ||
      sheep.hiddenAbsS == null ||
      sheep.hiddenAbsS <= sheep.pickupAbsS,
  )
) {
  throw new Error("panel sheep lifecycle does not extend through visual pickup");
}
if (
  timing.flock.sheep.slice(0, flock.fieldCount).some(
    (sheep) => sheep.spawnCell.join(",") !== timingPlan.funnelPositionsEarly[sheep.slotIndex]?.join(","),
  ) ||
  timing.turnovers.some(
    (turnover) => timing.flock.sheep[turnover.incomingRosterIndex]?.spawnCell.join(",") !== turnover.dropCell.join(","),
  )
) {
  throw new Error("tracking camera spawn cells drift from actual UFO drops");
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
  (svg.match(/class="flock-map-mark"/g) ?? []).length !== timing.flock.sheep.flatMap((sheep) => sheep.bites).length ||
  !svg.includes("@keyframes flock-fill-27") ||
  !svg.includes('class="flock-meta-value">6/6</text>') ||
  (svg.match(/class="flock-inventory-pen"/g) ?? []).length !== 8 ||
  (svg.match(/class="ufo-body"/g) ?? []).length !== 1 ||
  !svg.includes("@keyframes flock-inventory-shift-") ||
  svg.includes("flock-inventory-return")
) {
  throw new Error("pasture map or eight-pen inventory does not expose recorded activity");
}
const expectedMapPositions = timing.flock.sheep
  .flatMap((sheep) => sheep.bites)
  .sort((a, b) => a.atS - b.atS)
  .map(({ cell }) => {
    const [column, row] = cell.split(",").map(Number);
    return `${216 + Math.round((column * 35) / timingContext.maxX) * 12},${timingContext.baseHeight + 28 + Math.round((row * 3) / timingContext.maxY) * 12}`;
  });
const actualMapPositions = [...svg.matchAll(
  /class="flock-map-mark" x="([\d.]+)" y="([\d.]+)"/g,
)].map((match) => `${match[1]},${match[2]}`);
if (actualMapPositions.join("|") !== expectedMapPositions.join("|")) {
  throw new Error("pasture map marks drift from recorded bite cells");
}
const cameraReframes = Number(svg.match(/data-camera-reframes="(\d+)"/)?.[1]);
let heroStart = Math.min(...timing.flock.sheep.map((sheep) => sheep.spawnAbsS));
const heroDurations = heroList.map((rosterIndex) => {
  const end = timing.flock.sheep[rosterIndex]?.hiddenAbsS;
  const duration = end == null ? 0 : end - heroStart;
  heroStart = end ?? heroStart;
  return duration;
});
if (
  !svg.includes('<g id="pasture-live-scene">') ||
  !svg.includes('<g class="flock-camera-live"') ||
  !svg.includes('<use href="#pasture-live-scene"/>') ||
  (svg.match(/class="camera-sheep-roster-\d+ sheep-camera-copy"/g) ?? []).length !== flock.rosterSize ||
  !svg.includes('<clipPath id="flock-camera-clip"><rect x="18"') ||
  !svg.includes('width="190" height="40" rx="2"') ||
  !svg.includes('scale(1.3)') ||
  svg.includes('id="flock-camera-grid-source"') ||
  svg.includes('class="flock-camera-sheep"') ||
  (svg.match(/class="flock-map-footprint"/g) ?? []).length !== actualMapPositions.length ||
  (svg.match(/class="flock-map-footprints"/g) ?? []).length !== flock.rosterSize ||
  heroList.length < 3 ||
  heroList.length >= flock.rosterSize / 2 ||
  new Set(heroList).size !== heroList.length ||
  heroModes.length !== heroList.length ||
  !["context", "route", "graze"].every((mode) => heroModes.includes(mode)) ||
  heroModes.some((mode, index) => mode !== ["context", "route", "graze"][index % 3]) ||
  heroDurations[0] < 2.5 ||
  heroDurations.slice(1, -1).some((duration) => duration < 3.5) ||
  (heroDurations.at(-1) ?? 0) < 1 ||
  !Number.isFinite(cameraReframes) ||
  cameraReframes >= 22 ||
  cameraReframes > Math.ceil(timing.flock.sheep.flatMap((sheep) => sheep.bites).length / 8) ||
  !svg.includes(`class="flock-camera-live" style="animation:flock-camera-follow ${runtime.toFixed(3)}s linear`) ||
  !svg.includes("@keyframes flock-camera-follow") ||
  !svg.includes("@keyframes flock-camera-visible")
) {
  throw new Error(`live pasture camera or selected-sheep footprints do not follow recorded activity: ${JSON.stringify({ cameraReframes, heroList, heroModes, heroDurations })}`);
}
const cameraFollow = svg.match(/@keyframes flock-camera-follow\{([^\n]*)/)?.[1] ?? "";
const cameraFollowFrames = [...cameraFollow.matchAll(
  /([\d.]+)%\{transform:([^}]+)\}/g,
)].map((match) => ({ pct: Number(match[1]), transform: match[2] }));
const cameraPanSegments = cameraFollowFrames.slice(1).flatMap((frame, index) => {
  const previous = cameraFollowFrames[index];
  if (frame.transform === previous.transform) return [];
  return [{
    start: previous.pct * timing.maxTotalTimeWithEntryExit / 100,
    end: frame.pct * timing.maxTotalTimeWithEntryExit / 100,
  }];
});
let cameraHeroCursor = Math.min(...timing.flock.sheep.map((sheep) => sheep.spawnAbsS));
const cameraVisibleIntervals = heroList.map((rosterIndex, index) => {
  const end = timing.flock.sheep[rosterIndex]?.hiddenAbsS ?? cameraHeroCursor;
  const interval = {
    start: cameraHeroCursor + (index === 0 ? 0 : handoffGapS),
    end,
  };
  cameraHeroCursor = end;
  return interval;
});
const inventoryMotionWindows = [
  { start: openingShiftStartS, end: openingShiftEndS },
  ...laterInventoryEvents.map(({ atS }) => ({ start: atS - 0.76, end: atS })),
];
const cameraInventoryCompetition = cameraPanSegments.flatMap((pan) =>
  inventoryMotionWindows.flatMap((inventory) =>
    cameraVisibleIntervals.flatMap((visible) => {
      const start = Math.max(pan.start, inventory.start, visible.start);
      const end = Math.min(pan.end, inventory.end, visible.end);
      return start < end - 0.001 ? [{ pan, inventory, visible }] : [];
    }),
  ),
);
if (
  !cameraFollow.includes("scale(1.3)") ||
  cameraFollowFrames.slice(1).some((frame, index) => frame.pct < cameraFollowFrames[index].pct) ||
  cameraInventoryCompetition.length > 0 ||
  (cameraFollow.match(/transform:translate/g) ?? []).length >
    (timing.flock.sheep.flatMap((sheep) => sheep.bites).length * 2) / 3
) {
  throw new Error("live camera still reframes at bite speed");
}
const fieldCounts = [...svg.matchAll(/class="flock-meta-value">(-?\d+)\/6<\/text>/g)].map(
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
if (
  !svg.includes("@keyframes flock-map-focus") ||
  (svg.match(/class="flock-map-focus"/g) ?? []).length !== 1
) {
  throw new Error("pasture map lost its single activity focus");
}
const expectedOpeningBoardEnd =
  INVENTORY_OPENING_GATE_S * 2 +
  flock.fieldCount * INVENTORY_OPENING_CYCLE_S;
if (
  Math.abs(timing.openingBoardEndAbsS - expectedOpeningBoardEnd) > 0.001 ||
  Math.abs(timing.timelineOffset - timing.openingBoardEndAbsS - UFO_ENTRY_S) > 0.001
) {
  throw new Error("UFO does not wait for the opening inventory batch before entry");
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
const entryPct = ((timing.ufoArriveAbsSOffset[0] / timing.maxTotalTimeWithEntryExit) * 100).toFixed(4);
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
    (((timing.paintSweepStartAbsSOffset + cell.phase * phaseStep) / timing.maxTotalTimeWithEntryExit) * 100);
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
      timing.maxTotalTimeWithEntryExit) *
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
  const firstSafeMove =
    timing.ufoLeaveAbsSOffset[i] + UFO_BLINK_EDGE_S + UFO_BLINK_FADE_S;
  if (timing.moveStartAbsSOffset[i] + 0.001 < firstSafeMove) {
    throw new Error(`sheep ${i} moves before its deployment UFO body disappears`);
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
