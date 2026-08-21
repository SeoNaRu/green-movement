import type { TimelineResult } from "../../timeline/types.js";
import {
  FENCE_TILE,
  INVENTORY_OPENING_CYCLE_S,
  INVENTORY_OPENING_GATE_S,
  MOTION_TIME_SCALE,
  SHEEP_CONTENT,
  UFO_CONTENT,
  UFO_VIEWBOX,
} from "../constants.js";
import { buildFencePieces } from "../layout/gridLayout.js";
import { PIXEL_FONT_CSS } from "../pixelFont.js";
import { buildSheepTagSvg, getSheepTagCode } from "../sheepTag.js";

type PanelFlock = TimelineResult["flock"];

const HANDOFF_GAP_S = 0.55;
const MIN_HERO_SHOT_S = 1;
const INVENTORY_GATE_OPEN_S = 0.18;
const INVENTORY_ABSORB_DELAY_S = 0.04;
const INVENTORY_ABSORB_S = 0.08;
const INVENTORY_LOAD_S =
  INVENTORY_GATE_OPEN_S + INVENTORY_ABSORB_DELAY_S + INVENTORY_ABSORB_S;
const INVENTORY_EMPTY_HOLD_S = 0.05;
const INVENTORY_LIFT_S = 0.17;
const INVENTORY_SHIFT_S = 0.12;
const INVENTORY_REFILL_S = 0.08;
const INVENTORY_SETTLE_S = 0.04;
const INVENTORY_TRANSITION_S =
  INVENTORY_LOAD_S +
  INVENTORY_EMPTY_HOLD_S +
  INVENTORY_LIFT_S +
  INVENTORY_SHIFT_S +
  INVENTORY_REFILL_S +
  INVENTORY_SETTLE_S;
const INVENTORY_SLOT_COUNT = 8;
const OPENING_APPROACH_HOLD_S = 0.06;
const OPENING_ABSORB_DELAY_S = 0.04;
const OPENING_ABSORB_S = 0.08;
const OPENING_EMPTY_HOLD_S = 0.06;
const OPENING_SHIFT_S = 0.1;
const OPENING_REFILL_DELAY_S = 0.3;
const OPENING_REFILL_SHIFT_S = 0.14;
const OPENING_REFILL_STAGGER_S = 0.1;
const OPENING_REFILL_FADE_S = 0.08;
const OPENING_REFILL_SETTLE_S = 0.08;

const pctAt = (time: number, total: number) =>
  Math.min(100, Math.max(0, total > 0 ? (time * 100) / total : 0));

const meterSymbolCells = (
  width: number,
  height: number,
) => {
  const gap = 2;
  const cellWidth = (width - gap * 9) / 10;
  return Array.from({ length: 10 }, (_, index) =>
    `<rect x="${(index * (cellWidth + gap)).toFixed(2)}" width="${cellWidth.toFixed(2)}" height="${height}" fill="currentColor"/>`,
  ).join("");
};

const meter = (
  x: number,
  y: number,
  width: number,
  height: number,
  rosterIndex: number,
  pulseAnimation = "",
) => `<rect class="flock-meter-shell" x="${(x - 1.5).toFixed(2)}" y="${(y - 1.5).toFixed(2)}" width="${(width + 3).toFixed(2)}" height="${(height + 3).toFixed(2)}" fill="var(--gm-panel-section)" stroke="var(--gm-panel-line)" stroke-width=".8"/><use class="flock-meter-track" href="#flock-meter-selected" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height}" style="color:var(--gm-panel-track)"/><g clip-path="url(#flock-progress-${rosterIndex})"><use class="flock-meter-fill" href="#flock-meter-selected" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height}" style="color:var(--gm-level-4)"/>${pulseAnimation ? `<use class="flock-meter-pulse" href="#flock-meter-selected" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height}" style="color:var(--gm-beam-core);opacity:0;animation:${pulseAnimation}"/>` : ""}</g>`;

function visibilityKeyframes(
  name: string,
  intervals: { start: number; end: number }[],
  total: number,
): string {
  const holdsAtEnd = intervals.some(({ end }) => end >= total);
  const frames = [
    { time: 0, opacity: 0 },
    { time: total, opacity: holdsAtEnd ? 1 : 0 },
  ];
  for (const interval of intervals) {
    frames.push(
      { time: Math.max(0, interval.start - 0.001), opacity: 0 },
      { time: interval.start, opacity: 1 },
      { time: Math.max(interval.start, interval.end - 0.001), opacity: 1 },
    );
    if (interval.end < total) frames.push({ time: interval.end, opacity: 0 });
  }
  frames.sort((a, b) => a.time - b.time);
  return `@keyframes ${name} {
    ${frames.map(({ time, opacity }) => `${pctAt(time, total).toFixed(4)}% { opacity:${opacity}; }`).join("\n    ")}
  }`;
}

function focusKeyframes(
  name: string,
  intervals: { start: number; end: number }[],
  total: number,
): string {
  const frames = [
    { time: 0, opacity: 1 },
    { time: total, opacity: 1 },
  ];
  for (const interval of intervals) {
    frames.push(
      { time: Math.max(0, interval.start - 0.001), opacity: 1 },
      { time: interval.start, opacity: 0 },
      { time: Math.max(interval.start, interval.end - 0.001), opacity: 0 },
      { time: interval.end, opacity: 1 },
    );
  }
  frames.sort((a, b) => a.time - b.time);
  return `@keyframes ${name} {
    ${frames.map(({ time, opacity }) => `${pctAt(time, total).toFixed(4)}% { opacity:${opacity}; }`).join("\n    ")}
  }`;
}

export function buildFlockPanelLayer(params: {
  flock: PanelFlock;
  openingBoardEndAbsS: number;
  maxTotalTime: number;
  panelTop: number;
  totalWidth: number;
  maxX: number;
  maxY: number;
  gridLeftX: number;
  gridTopY: number;
  cameraTracks: Map<number, { atS: number; x: number; y: number }[]>;
  cameraSheepGroups: string;
}): { panelStyles: string; panelGroup: string } {
  const {
    flock,
    openingBoardEndAbsS,
    maxTotalTime,
    panelTop,
    totalWidth,
    maxX,
    maxY,
    gridLeftX,
    gridTopY,
    cameraTracks,
    cameraSheepGroups,
  } = params;
  const animationDuration = (maxTotalTime * MOTION_TIME_SCALE).toFixed(3);
  const panelHeight = 84;
  const mergedWidth = (columns: number) => columns * FENCE_TILE - 2;
  const mapLeft = 216;
  const mapTop = panelTop + 24;
  const mapColumns = 36;
  const mapRows = 4;
  const fieldMetaX = FENCE_TILE;
  const fieldMetaWidth = mergedWidth(18);
  const flockMetaX = fieldMetaX + fieldMetaWidth + 2;
  const flockMetaWidth = mergedWidth(17);
  const grassMetaX = flockMetaX + flockMetaWidth + 2;
  const grassMetaWidth = mergedWidth(18);
  const inventoryLabelX = flockMetaX + 3;
  const inventoryCountX = flockMetaX + 55;
  const inventoryPenX = flockMetaX + 59;
  const inventoryPenY = panelTop + 11;
  const inventoryPenPitch = 18;
  const inventoryRightPenX = inventoryPenX + (INVENTORY_SLOT_COUNT - 1) * inventoryPenPitch;
  const inventoryDockX = inventoryRightPenX + 8;
  const inventoryDockTravelY = 18.5;
  const panelFence = buildFencePieces({
    fenceRightX: totalWidth - FENCE_TILE,
    fenceBottomY: panelHeight - FENCE_TILE,
  });
  const firstSpawn = Math.min(
    maxTotalTime,
    ...flock.sheep.map((sheep) => sheep.spawnAbsS),
  );
  const lastHidden = Math.max(
    0,
    ...flock.sheep.map((sheep) => sheep.hiddenAbsS ?? 0),
  );
  const lifecycleEnd = (sheep: PanelFlock["sheep"][number]) =>
    sheep.hiddenAbsS ?? maxTotalTime;
  type InventoryEvent = { atS: number; rosterIndex: number };
  const inventoryEvents: InventoryEvent[] = flock.sheep
    .map((sheep) => ({ atS: sheep.spawnAbsS, rosterIndex: sheep.rosterIndex }))
    .sort((a, b) => a.atS - b.atS || a.rosterIndex - b.rosterIndex);
  const openingEvents = inventoryEvents.slice(0, flock.fieldCount);
  const hasOpening = openingEvents.length > 0;
  const openingTargetVisibleCount = Math.min(
    INVENTORY_SLOT_COUNT,
    Math.max(0, flock.rosterSize - openingEvents.length),
  );
  const openingRemainingVisibleCount = Math.max(
    0,
    Math.min(INVENTORY_SLOT_COUNT, flock.rosterSize) - openingEvents.length,
  );
  const openingRefillCount = Math.max(
    0,
    openingTargetVisibleCount - openingRemainingVisibleCount,
  );
  const openingShiftStart = hasOpening
    ? (openingEvents.at(-1)?.atS ?? 0) + OPENING_REFILL_DELAY_S
    : 0;
  const openingMotionEnd = hasOpening
    ? openingShiftStart + OPENING_REFILL_SHIFT_S
    : 0;
  const openingRevealEnd = hasOpening && openingRefillCount > 0
    ? openingMotionEnd +
      (openingRefillCount - 1) * OPENING_REFILL_STAGGER_S +
      OPENING_REFILL_FADE_S
    : openingMotionEnd;
  const openingShiftEnd = hasOpening
    ? openingRevealEnd + OPENING_REFILL_SETTLE_S
    : 0;
  const laterEvents = inventoryEvents.slice(flock.fieldCount);
  const inventoryTransitionWindows = [
    ...(openingEvents.length > 0
      ? [{ start: 0, end: openingBoardEndAbsS }]
      : []),
    ...(hasOpening
      ? [{ start: openingShiftStart, end: openingShiftEnd }]
      : []),
    ...laterEvents.map((event) => ({
      start: event.atS - INVENTORY_TRANSITION_S,
      end: event.atS,
    })),
  ];
  const inventoryMotionOverlap = (start: number, end: number) =>
    [...inventoryTransitionWindows].reverse().find(
      (window) => start < window.end && end > window.start,
    );
  const sheepPointAt = (
    sheep: PanelFlock["sheep"][number],
    time: number,
  ): [number, number] => {
    const track = cameraTracks.get(sheep.rosterIndex) ?? [];
    const afterIndex = track.findIndex(({ atS }) => atS >= time);
    if (afterIndex < 0) {
      const last = track.at(-1);
      if (last != null) return [last.x, last.y];
    } else if (afterIndex === 0) {
      return [track[0].x, track[0].y];
    } else {
      const before = track[afterIndex - 1];
      const after = track[afterIndex];
      const span = after.atS - before.atS;
      const progress = span > 0 ? (time - before.atS) / span : 1;
      return [
        before.x + (after.x - before.x) * progress,
        before.y + (after.y - before.y) * progress,
      ];
    }
    return [
      gridLeftX + sheep.spawnCell[0] * FENCE_TILE + 5,
      gridTopY + sheep.spawnCell[1] * FENCE_TILE + 5,
    ];
  };
  const activeAt = (time: number) => flock.sheep.filter(
    (sheep) => sheep.spawnAbsS <= time && lifecycleEnd(sheep) > time,
  );
  const nearbyCount = (
    sheep: PanelFlock["sheep"][number],
    time: number,
  ) => {
    const [x, y] = sheepPointAt(sheep, time);
    return activeAt(time).filter((candidate) => {
      if (candidate.rosterIndex === sheep.rosterIndex) return false;
      const [otherX, otherY] = sheepPointAt(candidate, time);
      return Math.abs(otherX - x) <= 96 && Math.abs(otherY - y) <= 24;
    }).length;
  };
  const heroProfile = (
    sheep: PanelFlock["sheep"][number],
    time: number,
  ) => {
    const end = lifecycleEnd(sheep);
    const track = (cameraTracks.get(sheep.rosterIndex) ?? []).filter(
      ({ atS }) => atS >= time && atS <= end,
    );
    const distance = track.slice(1).reduce((sum, point, index) => {
      const previous = track[index];
      return sum + Math.hypot(point.x - previous.x, point.y - previous.y);
    }, 0);
    return {
      distance,
      bites: sheep.bites.filter(({ atS }) => atS >= time && atS <= end).length,
      context: nearbyCount(sheep, time),
    };
  };
  const heroModes = ["context", "route", "graze"] as const;
  const heroShots: {
    sheep: PanelFlock["sheep"][number];
    start: number;
    selectedStart: number;
    end: number;
    mode: (typeof heroModes)[number];
  }[] = [];
  let heroCursor = firstSpawn;
  while (heroCursor < lastHidden - 0.001) {
    let available = activeAt(heroCursor);
    if (available.length === 0) {
      const nextSpawn = flock.sheep
        .map((sheep) => sheep.spawnAbsS)
        .filter((time) => time > heroCursor)
        .sort((a, b) => a - b)[0];
      if (nextSpawn == null) break;
      heroCursor = nextSpawn;
      available = activeAt(heroCursor);
    }
    const mode = heroModes[heroShots.length % heroModes.length];
    const hero = available.sort((a, b) => {
      const score = (sheep: PanelFlock["sheep"][number]) => {
        const profile = heroProfile(sheep, heroCursor);
        const modeBonus = mode === "context"
          ? profile.context * 1.4
          : mode === "route"
            ? Math.min(3, profile.distance / 48)
            : Math.min(3, profile.bites * 0.35);
        return lifecycleEnd(sheep) - heroCursor +
          profile.context * 1.2 +
          Math.min(2, profile.distance / 72) +
          Math.min(1, profile.bites / 6) +
          modeBonus;
      };
      return score(b) - score(a) || a.rosterIndex - b.rosterIndex;
    })[0];
    if (hero == null) break;
    const end = lifecycleEnd(hero);
    if (end - heroCursor < MIN_HERO_SHOT_S) break;
    heroShots.push({
      sheep: hero,
      start: heroCursor,
      selectedStart: Math.min(
        end,
        heroCursor + (heroShots.length === 0 ? 0 : HANDOFF_GAP_S),
      ),
      end,
      mode,
    });
    heroCursor = end;
  }
  const selectedIntervals = new Map<
    number,
    { start: number; end: number }[]
  >();
  for (const shot of heroShots) {
    if (shot.selectedStart >= shot.end) continue;
    selectedIntervals.set(shot.sheep.rosterIndex, [
      { start: shot.selectedStart, end: shot.end },
    ]);
  }

  const progressStyles: string[] = [];
  const progressClips: string[] = [];
  for (const [index, sheep] of flock.sheep.entries()) {
    let priorProgress = 0;
    const biteFrames = sheep.bites.flatMap((bite) => {
      const atS = bite.atS + 0.23;
      const frames = [
        `${pctAt(atS - 0.001, maxTotalTime).toFixed(4)}% { transform:scaleX(${priorProgress.toFixed(3)}); }`,
        `${pctAt(atS, maxTotalTime).toFixed(4)}% { transform:scaleX(${bite.progress.toFixed(3)}); }`,
      ];
      priorProgress = bite.progress;
      return frames;
    });
    const progressFrames = [
      `0% { transform:scaleX(0); }`,
      `${pctAt(sheep.spawnAbsS, maxTotalTime).toFixed(4)}% { transform:scaleX(0); }`,
      ...biteFrames,
      `100% { transform:scaleX(${priorProgress.toFixed(3)}); }`,
    ];
    progressStyles.push(
      `@keyframes flock-fill-${index} { ${progressFrames.join(" ")} }`,
    );
    progressClips.push(
      `<clipPath id="flock-progress-${index}" clipPathUnits="objectBoundingBox"><rect width="1" height="1" style="transform-box:fill-box;transform-origin:left;animation:flock-fill-${index} ${animationDuration}s linear 0s 1 both"/></clipPath>`,
    );
  }

  const mapBites = flock.sheep
    .flatMap((sheep) => sheep.bites.map((bite) => ({
      ...bite,
      rosterIndex: sheep.rosterIndex,
    })))
    .sort((a, b) => a.atS - b.atS);
  const mapPosition = (cell: string) => {
    const [column, row] = cell.split(",").map(Number);
    return {
      x: mapLeft + Math.round((column * (mapColumns - 1)) / Math.max(1, maxX)) * FENCE_TILE,
      y: mapTop + Math.round((row * (mapRows - 1)) / Math.max(1, maxY)) * FENCE_TILE,
    };
  };
  const cameraLeft = 18;
  const cameraTop = panelTop + 27;
  const cameraWidth = 190;
  const cameraHeight = 40;
  const cameraCenterX = cameraLeft + cameraWidth / 2;
  const cameraCenterY = cameraTop + cameraHeight / 2 - 6;
  const cameraScale = 1.3;
  const cameraTransform = ([sourceX, sourceY]: [number, number]) =>
    `translate(${(cameraCenterX - sourceX * cameraScale).toFixed(2)}px,${(cameraCenterY - sourceY * cameraScale).toFixed(2)}px) scale(${cameraScale})`;
  const groupFrameAt = (
    sheep: PanelFlock["sheep"][number],
    time: number,
  ): [number, number] => {
    const [heroX, heroY] = sheepPointAt(sheep, time);
    const neighbors = activeAt(time)
      .filter((candidate) => candidate.rosterIndex !== sheep.rosterIndex)
      .map((candidate) => ({
        cell: sheepPointAt(candidate, time),
        distance: Math.hypot(
          sheepPointAt(candidate, time)[0] - heroX,
          sheepPointAt(candidate, time)[1] - heroY,
        ),
      }))
      .filter(({ cell }) =>
        Math.abs(cell[0] - heroX) <= 96 && Math.abs(cell[1] - heroY) <= 24,
      )
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2);
    const cells = [[heroX, heroY] as [number, number], ...neighbors.map(({ cell }) => cell)];
    const averageX = cells.reduce((sum, [x]) => sum + x, 0) / cells.length;
    return [
      Math.max(heroX - 24, Math.min(heroX + 24, averageX)),
      heroY,
    ];
  };
  const cameraTargets: {
    atS: number;
    point: [number, number];
    lead: boolean;
    panStart?: number;
  }[] = [];
  for (const shot of heroShots) {
    let anchor = groupFrameAt(shot.sheep, shot.start);
    let lastReframe = shot.start;
    const scheduledInventoryWindows = new Set<number>();
    cameraTargets.push({ atS: shot.start, point: anchor, lead: false });
    for (const frame of (cameraTracks.get(shot.sheep.rosterIndex) ?? []).filter(
      (entry) => entry.atS > shot.selectedStart && entry.atS < shot.end,
    )) {
      const point = [frame.x, frame.y] as [number, number];
      const panStart = Math.max(lastReframe, frame.atS - HANDOFF_GAP_S);
      const inventoryOverlap = inventoryMotionOverlap(panStart, frame.atS);
      const verticalDistance = Math.abs(point[1] - anchor[1]);
      if (inventoryOverlap != null && frame.atS <= inventoryOverlap.end) {
        if (
          verticalDistance > 8 &&
          !scheduledInventoryWindows.has(inventoryOverlap.end)
        ) {
          const preframeAt = inventoryOverlap.start;
          const canPreframe = preframeAt > Math.max(lastReframe, shot.selectedStart);
          const targetAt = canPreframe
            ? preframeAt
            : Math.min(shot.end - 0.001, inventoryOverlap.end + 0.12);
          if (targetAt > lastReframe) {
            anchor = groupFrameAt(
              shot.sheep,
              canPreframe
                ? (inventoryOverlap.start + inventoryOverlap.end) / 2
                : targetAt,
            );
            cameraTargets.push({
              atS: targetAt,
              point: anchor,
              lead: true,
              panStart: canPreframe ? undefined : inventoryOverlap.end,
            });
            lastReframe = targetAt;
            scheduledInventoryWindows.add(inventoryOverlap.end);
          }
        }
        continue;
      }
      if (
        (verticalDistance <= 8 &&
          (frame.atS - lastReframe < 1.6 ||
            Math.abs(point[0] - anchor[0]) <= 72))
      ) {
        continue;
      }
      anchor = groupFrameAt(shot.sheep, frame.atS);
      cameraTargets.push({
        atS: frame.atS,
        point: anchor,
        lead: true,
        panStart: inventoryOverlap?.end,
      });
      lastReframe = frame.atS;
    }
  }
  cameraTargets.sort((a, b) => a.atS - b.atS);
  let priorCameraPoint = cameraTargets[0]?.point ?? [0, 0];
  let priorCameraTime = firstSpawn;
  const cameraFrames = [`0%{transform:${cameraTransform(priorCameraPoint)}}`];
  for (const [index, target] of cameraTargets.entries()) {
    if (index === 0) continue;
    const panEnd = target.lead
      ? target.atS
      : Math.min(maxTotalTime, target.atS + 0.55);
    const panStart = target.lead
      ? Math.max(priorCameraTime, target.panStart ?? panEnd - 0.55)
      : Math.max(priorCameraTime, target.atS);
    cameraFrames.push(
      `${pctAt(panStart, maxTotalTime).toFixed(4)}%{transform:${cameraTransform(priorCameraPoint)}}`,
      `${pctAt(panEnd, maxTotalTime).toFixed(4)}%{transform:${cameraTransform(target.point)}}`,
    );
    priorCameraPoint = target.point;
    priorCameraTime = panEnd;
  }
  cameraFrames.push(`100%{transform:${cameraTransform(priorCameraPoint)}}`);
  const cameraStyles = [
    `@keyframes flock-camera-follow{${cameraFrames.join(" ")}}`,
    visibilityKeyframes(
      "flock-camera-visible",
      heroShots
        .filter(({ selectedStart, end }) => selectedStart < end)
        .map(({ selectedStart, end }) => ({ start: selectedStart, end })),
      maxTotalTime,
    ),
  ];

  const mapStyles: string[] = [];
  const mapPulses: string[] = [];
  const mapFootprints = new Map<number, string[]>();
  const mapMarks = mapBites.map((bite, index) => {
    const { x, y } = mapPosition(bite.cell);
    const markName = `flock-map-mark-${index}`;
    const pulseName = `flock-map-pulse-${index}`;
    const atS = bite.atS + 0.23;
    mapStyles.push(
      visibilityKeyframes(markName, [{ start: atS, end: maxTotalTime }], maxTotalTime),
      `@keyframes ${pulseName} { 0%,${pctAt(atS - 0.001, maxTotalTime).toFixed(4)}%{opacity:0} ${pctAt(atS, maxTotalTime).toFixed(4)}%{opacity:1} ${pctAt(atS + 0.18, maxTotalTime).toFixed(4)}%,100%{opacity:0} }`,
    );
    const color = getSheepTagCode(bite.rosterIndex);
    const footprints = mapFootprints.get(bite.rosterIndex) ?? [];
    footprints.push(`<g class="flock-map-footprint" style="opacity:0;animation:${markName} ${animationDuration}s step-end 0s 1 both"><rect x="${x + 6}" y="${y + 6}" width="1.5" height="1.5" rx=".4" fill="hsl(${color},72%,62%)"/><rect x="${x + 8}" y="${y + 7.5}" width="1.5" height="1.5" rx=".4" fill="hsl(${color},72%,62%)"/></g>`);
    mapFootprints.set(bite.rosterIndex, footprints);
    mapPulses.push(`<rect class="flock-map-pulse" x="${x}" y="${y}" width="10" height="10" rx="2" fill="var(--gm-beam-core)" style="opacity:0;animation:${pulseName} ${animationDuration}s linear 0s 1 both"/>`);
    return `<rect class="flock-map-mark" x="${x}" y="${y}" width="10" height="10" rx="2" fill="var(--gm-level-${Math.min(4, bite.level)})" style="opacity:0;animation:${markName} ${animationDuration}s step-end 0s 1 both"/>`;
  });
  const footprintGroups = [...mapFootprints.entries()].map(
    ([rosterIndex, footprints]) =>
      `<g class="flock-map-footprints" style="opacity:0;animation:flock-selected-${rosterIndex} ${animationDuration}s step-end 0s 1 both">${footprints.join("")}</g>`,
  );
  const mapCursorFrames = mapBites.flatMap((bite) => {
    const { x, y } = mapPosition(bite.cell);
    const atS = bite.atS + 0.23;
    return `${pctAt(atS, maxTotalTime).toFixed(4)}%{opacity:1;transform:translate(${x - mapLeft}px,${y - mapTop}px)}`;
  });
  const lastMapBite = mapBites.at(-1)?.atS ?? 0;
  mapStyles.push(`@keyframes flock-map-focus { 0%{opacity:0;transform:translate(0,0)} ${mapCursorFrames.join(" ")} ${pctAt(lastMapBite + 0.47, maxTotalTime).toFixed(4)}%,100%{opacity:0} }`);
  const mapCursor = `<path class="flock-map-focus" d="M${mapLeft + 3} ${mapTop - 1.5}H${mapLeft - 1.5}V${mapTop + 3}M${mapLeft + 7} ${mapTop - 1.5}H${mapLeft + 11.5}V${mapTop + 3}M${mapLeft + 3} ${mapTop + 11.5}H${mapLeft - 1.5}V${mapTop + 7}M${mapLeft + 7} ${mapTop + 11.5}H${mapLeft + 11.5}V${mapTop + 7}" style="animation:flock-map-focus ${animationDuration}s step-end 0s 1 both"/>`;

  const selectedStyles: string[] = [];
  const selectedGroups: string[] = [];
  for (const sheep of flock.sheep) {
    const intervals = selectedIntervals.get(sheep.rosterIndex) ?? [];
    const pulseName = `flock-meter-pulse-${sheep.rosterIndex}`;
    const pulseFrames = sheep.bites.flatMap((bite) => {
      const atS = bite.atS + 0.23;
      return [
        `${pctAt(atS - 0.001, maxTotalTime).toFixed(4)}% { opacity:0; }`,
        `${pctAt(atS, maxTotalTime).toFixed(4)}% { opacity:1; }`,
        `${pctAt(atS + 0.14, maxTotalTime).toFixed(4)}% { opacity:0; }`,
      ];
    });
    selectedStyles.push(
      visibilityKeyframes(
        `flock-selected-${sheep.rosterIndex}`,
        intervals,
        maxTotalTime,
      ),
      `@keyframes ${pulseName} { 0% { opacity:0; } ${pulseFrames.join(" ")} 100% { opacity:0; } }`,
    );
    let energy = 0;
    let energyStart = sheep.inboundAbsS ?? sheep.spawnAbsS;
    const energyGroups: string[] = [];
    for (const [index, bite] of [...sheep.bites, null].entries()) {
      const energyEnd = bite == null ? maxTotalTime : bite.atS + 0.23;
      const energyName = `flock-energy-${sheep.rosterIndex}-${index}`;
      selectedStyles.push(
        visibilityKeyframes(
          energyName,
          [{ start: energyStart, end: energyEnd }],
          maxTotalTime,
        ),
      );
      energyGroups.push(
        `<text x="205" y="${panelTop + 64}" text-anchor="end" class="flock-energy" style="opacity:0;animation:${energyName} ${animationDuration}s step-end 0s 1 both">${energy}/${sheep.capacity}</text>`,
      );
      if (bite == null) break;
      energy = Math.min(sheep.capacity, energy + bite.level);
      energyStart = energyEnd;
    }
    selectedGroups.push(`<g style="opacity:0;animation:flock-selected-${sheep.rosterIndex} ${animationDuration}s step-end 0s 1 both">
      <rect class="flock-camera-hud" x="18" y="${panelTop + 52}" width="190" height="16" rx="2" fill="var(--gm-level-0)" fill-opacity=".9"/>
      <text x="22" y="${panelTop + 64}" class="flock-label">포만</text>
      ${buildSheepTagSvg({ rosterIndex: sheep.rosterIndex, x: 48, y: panelTop + 56.5, size: 4.2, className: "flock-selected-tag flock-fullness-tag", strokeWidth: 0.4 })}
      ${meter(57, panelTop + 57, 116, 7, sheep.rosterIndex, `${pulseName} ${animationDuration}s linear 0s 1 both`)}
      ${energyGroups.join("")}
    </g>`);
  }

  if (flock.sheep.length > 0) {
    selectedStyles.push(
      visibilityKeyframes(
        "flock-boarding",
        [{ start: 0, end: openingBoardEndAbsS }],
        maxTotalTime,
      ),
      visibilityKeyframes(
        "flock-inbound",
        [{ start: openingBoardEndAbsS, end: firstSpawn }],
        maxTotalTime,
      ),
      visibilityKeyframes(
        "flock-complete",
        [{ start: lastHidden, end: maxTotalTime }],
        maxTotalTime,
      ),
    );
    selectedGroups.push(
      `<g style="opacity:0;animation:flock-boarding ${animationDuration}s step-end 0s 1 both"><text x="18" y="${panelTop + 46}" class="flock-name">첫 방목 준비</text><text x="18" y="${panelTop + 60}" class="flock-status">양떼 승선 중</text></g>`,
      `<g style="opacity:0;animation:flock-inbound ${animationDuration}s step-end 0s 1 both"><text x="18" y="${panelTop + 46}" class="flock-name">양떼 이동 중</text><text x="18" y="${panelTop + 60}" class="flock-status">첫 투입 대기</text></g>`,
      `<g style="opacity:0;animation:flock-complete ${animationDuration}s step-end 0s 1 both"><rect class="flock-complete-scrim" x="48" y="${panelTop + 24}" width="130" height="46" rx="2" fill="var(--gm-level-0)" fill-opacity=".96"/><use href="#flock-ufo-icon" x="62" y="${panelTop + 34}" width="30" height="30"/><text x="132" y="${panelTop + 46}" text-anchor="middle" class="flock-name">목장 정리 완료</text><text x="132" y="${panelTop + 60}" text-anchor="middle" class="flock-status">모든 양 수거</text></g>`,
    );
  }

  const fieldDeltas: { atS: number; delta: number }[] = [];
  for (const sheep of flock.sheep) {
    fieldDeltas.push({ atS: sheep.spawnAbsS + 0.18, delta: 1 });
    if (sheep.hiddenAbsS != null) {
      fieldDeltas.push({ atS: sheep.hiddenAbsS, delta: -1 });
    }
  }
  fieldDeltas.sort((a, b) => a.atS - b.atS || a.delta - b.delta);
  let fieldValue = 0;
  const fieldEvents = [{ atS: 0, value: fieldValue }];
  for (const event of fieldDeltas) {
    fieldValue += event.delta;
    fieldEvents.push({ atS: event.atS, value: fieldValue });
  }

  const headerStyles: string[] = [];
  const fieldLabels = [...new Set(fieldEvents.map(({ value }) => value))].map(
    (value) => {
      const intervals = fieldEvents
        .map((event, index) => ({
          value: event.value,
          start: event.atS,
          end: fieldEvents[index + 1]?.atS ?? maxTotalTime,
        }))
        .filter((event) => event.value === value);
      const name = `flock-field-${value}`;
      headerStyles.push(visibilityKeyframes(name, intervals, maxTotalTime));
      return `<g style="opacity:0;animation:${name} ${animationDuration}s step-end 0s 1 both"><text x="${fieldMetaX + 7}" y="${panelTop + 21}" class="flock-meta-key">방목</text><text x="${fieldMetaX + fieldMetaWidth - 7}" y="${panelTop + 21}" text-anchor="end" class="flock-meta-value">${value}/${flock.fieldCount}</text></g>`;
    },
  );

  const grassEvents = [{ atS: 0, value: 0 }];
  for (const entry of flock.grassProgress) {
    const value = Math.min(100, Math.floor(entry.progress * 10 + 1e-6) * 10);
    if (value !== grassEvents.at(-1)!.value) {
      grassEvents.push({ atS: entry.atS, value });
    }
  }
  const grassLabels = grassEvents.map(({ value, atS: start }, index) => {
    const end = grassEvents[index + 1]?.atS ?? maxTotalTime;
    const name = `flock-grass-${value}`;
    headerStyles.push(
      visibilityKeyframes(name, [{ start, end }], maxTotalTime),
    );
    const filledCells = Math.round(value / 10);
    const progressX = grassMetaX + 76;
    const progressWidth = Math.max(40, grassMetaWidth - 82);
    const progressGap = 3;
    const progressCellWidth = (progressWidth - progressGap * 9) / 10;
    const progressPitch = progressCellWidth + progressGap;
    const cells = Array.from({ length: 10 }, (_, cellIndex) =>
      `<rect x="${(progressX + cellIndex * progressPitch).toFixed(2)}" y="${panelTop + 14}" width="${progressCellWidth.toFixed(2)}" height="6" fill="${cellIndex < filledCells ? "var(--gm-level-3)" : "var(--gm-panel-track)"}"/>`,
    ).join("");
    return `<g style="opacity:0;animation:${name} ${animationDuration}s step-end 0s 1 both"><text x="${grassMetaX + 7}" y="${panelTop + 21}" class="flock-meta-key">잔디</text><text x="${grassMetaX + 68}" y="${panelTop + 21}" text-anchor="end" class="flock-meta-value">${value}%</text>${cells}</g>`;
  });

  const inventoryStates: {
    start: number;
    end: number;
    queue: number[];
    visible: (number | null)[];
  }[] = [];
  const visibleQueue = (queue: number[]): (number | null)[] => {
    const visible = queue.slice(0, INVENTORY_SLOT_COUNT).reverse();
    return [
      ...Array.from(
        { length: INVENTORY_SLOT_COUNT - visible.length },
        () => null,
      ),
      ...visible,
    ];
  };
  const openingBoardTransitions: {
    event: InventoryEvent;
    start: number;
    end: number;
    queue: number[];
    visible: (number | null)[];
  }[] = [];
  let inventoryQueue = Array.from({ length: flock.rosterSize }, (_, index) => index);
  let inventoryCursor = 0;
  let openingVisible: (number | null)[] = visibleQueue(inventoryQueue);
  for (const [index, event] of openingEvents.entries()) {
    const start = INVENTORY_OPENING_GATE_S + index * INVENTORY_OPENING_CYCLE_S;
    const end = start + INVENTORY_OPENING_CYCLE_S;
    if (inventoryCursor < start) {
      inventoryStates.push({
        start: inventoryCursor,
        end: start,
        queue: [...inventoryQueue],
        visible: [...openingVisible],
      });
    }
    openingBoardTransitions.push({
      event,
      start,
      end,
      queue: [...inventoryQueue],
      visible: [...openingVisible],
    });
    const queueIndex = inventoryQueue.indexOf(event.rosterIndex);
    if (queueIndex >= 0) inventoryQueue.splice(queueIndex, 1);
    const remainingVisible = openingVisible.map((rosterIndex) =>
      rosterIndex === event.rosterIndex ? null : rosterIndex
    );
    openingVisible = index === openingEvents.length - 1
      ? remainingVisible
      : [null, ...remainingVisible.slice(0, INVENTORY_SLOT_COUNT - 1)];
    inventoryCursor = end;
  }
  if (inventoryCursor < (hasOpening ? openingShiftStart : maxTotalTime)) {
    inventoryStates.push({
      start: inventoryCursor,
      end: hasOpening ? openingShiftStart : maxTotalTime,
      queue: [...inventoryQueue],
      visible: [...openingVisible],
    });
  }
  const openingQueue = [...inventoryQueue];
  const openingCount = openingQueue.length;
  inventoryCursor = hasOpening ? openingShiftEnd : inventoryCursor;
  for (const event of laterEvents) {
    const loadStart = Math.max(inventoryCursor, event.atS - INVENTORY_TRANSITION_S);
    inventoryStates.push({
      start: inventoryCursor,
      end: loadStart,
      queue: [...inventoryQueue],
      visible: visibleQueue(inventoryQueue),
    });
    const queueIndex = inventoryQueue.indexOf(event.rosterIndex);
    if (queueIndex >= 0) inventoryQueue.splice(queueIndex, 1);
    inventoryCursor = event.atS;
  }
  inventoryStates.push({
    start: inventoryCursor,
    end: maxTotalTime,
    queue: [...inventoryQueue],
    visible: visibleQueue(inventoryQueue),
  });
  const penOccupant = (rosterIndex: number, slotIndex: number) => {
    const x = inventoryPenX + slotIndex * inventoryPenPitch;
    return `<g class="flock-inventory-sheep" data-roster="${rosterIndex}" data-inventory-slot="${slotIndex}" transform="translate(${x} ${inventoryPenY})"><use href="#flock-inventory-sheep-icon" x="1" y="0" width="14" height="10"/><rect class="flock-inventory-tag" x="13" y="8.5" width="3" height="2.5" rx=".5" fill="hsl(${getSheepTagCode(rosterIndex)},72%,52%)"/></g>`;
  };
  const boardingOccupant = (
    rosterIndex: number,
    bodyAnimation: string,
  ) => `<g class="flock-inventory-sheep" data-roster="${rosterIndex}" data-inventory-slot="${INVENTORY_SLOT_COUNT - 1}" data-board-occluded-slot="7"><g class="flock-inventory-board-body" style="animation:${bodyAnimation} ${animationDuration}s ease-in 0s 1 both"><use href="#flock-inventory-sheep-icon" x="${inventoryRightPenX + 1}" y="${inventoryPenY}" width="14" height="10"/><rect class="flock-inventory-tag flock-inventory-board-tag" x="${inventoryRightPenX + 13}" y="${inventoryPenY + 8.5}" width="3" height="2.5" rx=".5" fill="hsl(${getSheepTagCode(rosterIndex)},72%,52%)"/></g></g>`;
  const inventoryStyles: string[] = [];
  const inventoryGroups = inventoryStates.map((state, index) => {
    const name = `flock-inventory-state-${index}`;
    inventoryStyles.push(
      visibilityKeyframes(name, [{ start: state.start, end: state.end }], maxTotalTime),
    );
    return `<g class="flock-inventory-state" style="opacity:0;animation:${name} ${animationDuration}s step-end 0s 1 both"><text x="${inventoryCountX}" y="${panelTop + 21}" text-anchor="end" class="flock-meta-value">${state.queue.length}/${flock.rosterSize}</text>${state.visible.map((rosterIndex, slotIndex) => rosterIndex == null ? "" : penOccupant(rosterIndex, slotIndex)).join("")}</g>`;
  });
  const openingDispatchGroups = openingBoardTransitions.map((transition, index) => {
    const visibleName = `flock-inventory-opening-board-${index}`;
    const boardName = `flock-inventory-opening-load-${index}`;
    const shiftName = `flock-inventory-opening-board-shift-${index}`;
    const startPct = pctAt(transition.start, maxTotalTime).toFixed(4);
    const absorbStart = transition.start + OPENING_ABSORB_DELAY_S;
    const absorbEnd = absorbStart + OPENING_ABSORB_S;
    const shiftStart = absorbEnd + OPENING_EMPTY_HOLD_S;
    const shiftEnd = shiftStart + OPENING_SHIFT_S;
    const absorbStartPct = pctAt(absorbStart, maxTotalTime).toFixed(4);
    const absorbEndPct = pctAt(
      absorbEnd,
      maxTotalTime,
    ).toFixed(4);
    const shiftStartPct = pctAt(shiftStart, maxTotalTime).toFixed(4);
    const shiftEndPct = pctAt(shiftEnd, maxTotalTime).toFixed(4);
    const endPct = pctAt(transition.end, maxTotalTime).toFixed(4);
    const shiftsQueue = index < openingBoardTransitions.length - 1;
    inventoryStyles.push(
      visibilityKeyframes(
        visibleName,
        [{ start: transition.start, end: transition.end }],
        maxTotalTime,
      ),
      `@keyframes ${boardName}{0%,${startPct}%{opacity:1} ${absorbStartPct}%{opacity:1} ${absorbEndPct}%,100%{opacity:0}}`,
      `@keyframes ${shiftName}{0%,${shiftStartPct}%{transform:translateX(0)} ${shiftEndPct}%,${endPct}%,100%{transform:translateX(${shiftsQueue ? inventoryPenPitch : 0}px)}}`,
    );
    const shifting = shiftsQueue
      ? transition.visible.slice(0, INVENTORY_SLOT_COUNT - 1)
      : [];
    return `<g class="flock-inventory-opening-board" data-beats="dock-settle-absorb-empty-shift-settle" style="opacity:0;animation:${visibleName} ${animationDuration}s step-end 0s 1 both"><text x="${inventoryCountX}" y="${panelTop + 21}" text-anchor="end" class="flock-meta-value">${transition.queue.length}/${flock.rosterSize}</text><g class="flock-inventory-motion">${boardingOccupant(transition.event.rosterIndex, boardName)}<g class="flock-inventory-opening-shift" style="animation:${shiftName} ${animationDuration}s ease-in-out 0s 1 both">${shifting.map((rosterIndex, slotIndex) => rosterIndex == null ? "" : penOccupant(rosterIndex, slotIndex)).join("")}</g></g></g>`;
  });
  const openingShiftName = "flock-inventory-opening-shift";
  if (hasOpening) {
    inventoryStyles.push(
      `@keyframes ${openingShiftName}{0%,${pctAt(openingShiftStart, maxTotalTime).toFixed(4)}%{transform:translateX(0)} ${pctAt(openingMotionEnd, maxTotalTime).toFixed(4)}%,100%{transform:translateX(${inventoryPenPitch}px)}}`,
      visibilityKeyframes(
        "flock-inventory-opening-visible",
        [{ start: openingShiftStart, end: openingShiftEnd }],
        maxTotalTime,
      ),
    );
  }
  const openingPostVisible = visibleQueue(openingQueue);
  const openingExistingRoster = new Set(
    openingVisible.filter((rosterIndex) => rosterIndex != null),
  );
  const openingExistingActors = openingVisible.slice(0, INVENTORY_SLOT_COUNT - 1);
  const openingRefillActors = openingPostVisible
    .map((rosterIndex, slotIndex) => ({ rosterIndex, slotIndex }))
    .filter(
      (actor): actor is { rosterIndex: number; slotIndex: number } =>
        actor.rosterIndex != null && !openingExistingRoster.has(actor.rosterIndex),
    )
    .sort((a, b) => a.slotIndex - b.slotIndex);
  const openingRefills = openingRefillActors.map(({ rosterIndex, slotIndex }, index) => {
    const name = `flock-inventory-opening-refill-${index}`;
    const revealStart = openingMotionEnd + index * OPENING_REFILL_STAGGER_S;
    const revealEnd = revealStart + OPENING_REFILL_FADE_S;
    inventoryStyles.push(
      `@keyframes ${name}{0%,${pctAt(revealStart, maxTotalTime).toFixed(4)}%{opacity:0} ${pctAt(revealEnd, maxTotalTime).toFixed(4)}%,100%{opacity:1}}`,
    );
    return `<g class="flock-inventory-refill" style="opacity:0;animation:${name} ${animationDuration}s ease-out 0s 1 both">${penOccupant(rosterIndex, slotIndex)}</g>`;
  });
  const openingShiftGroup = hasOpening
    ? `<g class="flock-inventory-opening" data-refill="shift-then-stagger" style="opacity:0;animation:flock-inventory-opening-visible ${animationDuration}s step-end 0s 1 both"><text x="${inventoryCountX}" y="${panelTop + 21}" text-anchor="end" class="flock-meta-value">${openingCount}/${flock.rosterSize}</text><g class="flock-inventory-motion"><g class="flock-inventory-opening-shift" style="animation:${openingShiftName} ${animationDuration}s ease-in-out 0s 1 both">${openingExistingActors.map((rosterIndex, slotIndex) => rosterIndex == null ? "" : penOccupant(rosterIndex, slotIndex)).join("")}</g>${openingRefills.join("")}</g></g>`
    : "";
  const gateFrames = ["0%{stroke-dashoffset:0}"];
  if (hasOpening) {
    const openingLoadEnd = INVENTORY_OPENING_GATE_S + openingEvents.length * INVENTORY_OPENING_CYCLE_S;
    gateFrames.push(
      `${pctAt(INVENTORY_OPENING_GATE_S, maxTotalTime).toFixed(4)}%{stroke-dashoffset:16}`,
      `${pctAt(openingLoadEnd, maxTotalTime).toFixed(4)}%{stroke-dashoffset:16}`,
      `${pctAt(openingLoadEnd + INVENTORY_OPENING_GATE_S, maxTotalTime).toFixed(4)}%{stroke-dashoffset:0}`,
    );
  }
  const dispatchGroups = laterEvents.flatMap((event, index) => {
    const beforeQueue = Array.from(
      { length: flock.rosterSize - flock.fieldCount - index },
      (_, offset) => flock.fieldCount + index + offset,
    );
    if (beforeQueue[0] !== event.rosterIndex) return [];
    const name = `flock-inventory-shift-${index}`;
    const boardName = `flock-inventory-load-${index}`;
    const visibleName = `flock-inventory-transition-${index}`;
    const start = event.atS - INVENTORY_TRANSITION_S;
    const gateOpenEnd = start + INVENTORY_GATE_OPEN_S;
    const absorbStart = gateOpenEnd + INVENTORY_ABSORB_DELAY_S;
    const loadEnd = absorbStart + INVENTORY_ABSORB_S;
    const liftStart = loadEnd + INVENTORY_EMPTY_HOLD_S;
    const shiftStart = liftStart + INVENTORY_LIFT_S;
    const shiftEnd = shiftStart + INVENTORY_SHIFT_S;
    const refillEnd = shiftEnd + INVENTORY_REFILL_S;
    const settleEnd = refillEnd + INVENTORY_SETTLE_S;
    inventoryStyles.push(
      visibilityKeyframes(
        visibleName,
        [{ start, end: settleEnd }],
        maxTotalTime,
      ),
      `@keyframes ${name}{0%,${pctAt(shiftStart, maxTotalTime).toFixed(4)}%{transform:translateX(0)} ${pctAt(shiftEnd, maxTotalTime).toFixed(4)}%,100%{transform:translateX(${inventoryPenPitch}px)}}`,
      `@keyframes ${boardName}{0%,${pctAt(absorbStart, maxTotalTime).toFixed(4)}%{opacity:1} ${pctAt(loadEnd, maxTotalTime).toFixed(4)}%,100%{opacity:0}}`,
    );
    gateFrames.push(
      `${pctAt(start - 0.001, maxTotalTime).toFixed(4)}%{stroke-dashoffset:0}`,
      `${pctAt(gateOpenEnd, maxTotalTime).toFixed(4)}%{stroke-dashoffset:16}`,
      `${pctAt(liftStart, maxTotalTime).toFixed(4)}%{stroke-dashoffset:16}`,
      `${pctAt(shiftStart, maxTotalTime).toFixed(4)}%{stroke-dashoffset:0}`,
    );
    const shifting = visibleQueue(beforeQueue).slice(0, INVENTORY_SLOT_COUNT - 1);
    const refillRosterIndex = beforeQueue[INVENTORY_SLOT_COUNT];
    let refill = "";
    if (refillRosterIndex != null) {
      const refillName = `flock-inventory-refill-${index}`;
      inventoryStyles.push(
        `@keyframes ${refillName}{0%,${pctAt(shiftEnd, maxTotalTime).toFixed(4)}%{opacity:0} ${pctAt(refillEnd, maxTotalTime).toFixed(4)}%,100%{opacity:1}}`,
      );
      refill = `<g class="flock-inventory-refill" style="opacity:0;animation:${refillName} ${animationDuration}s ease-out 0s 1 both">${penOccupant(refillRosterIndex, 0)}</g>`;
    }
    return `<g class="flock-inventory-transition" data-beats="approach-settle-absorb-lift-shift-refill-settle-drop" style="opacity:0;animation:${visibleName} ${animationDuration}s step-end 0s 1 both"><text x="${inventoryCountX}" y="${panelTop + 21}" text-anchor="end" class="flock-meta-value">${beforeQueue.length}/${flock.rosterSize}</text><g class="flock-inventory-motion">${boardingOccupant(beforeQueue[0], boardName)}<g class="flock-inventory-shift" style="animation:${name} ${animationDuration}s ease-in-out 0s 1 both">${shifting.map((rosterIndex, slotIndex) => rosterIndex == null ? "" : penOccupant(rosterIndex, slotIndex)).join("")}</g>${refill}</g></g>`;
  });
  gateFrames.push("100%{stroke-dashoffset:0}");
  inventoryStyles.push(`@keyframes flock-inventory-gate{${gateFrames.join(" ")}}`);
  const dockWindows = laterEvents.map((event) => {
    const start = event.atS - INVENTORY_TRANSITION_S;
    return {
      start,
      end:
        start +
        INVENTORY_LOAD_S +
        INVENTORY_EMPTY_HOLD_S +
        INVENTORY_LIFT_S,
    };
  });
  const dockFrames = ["0%{transform:translateY(0)}"];
  if (hasOpening) {
    const openingLoadEnd =
      INVENTORY_OPENING_GATE_S +
      openingEvents.length * INVENTORY_OPENING_CYCLE_S;
    dockFrames.push(
      `${pctAt(OPENING_APPROACH_HOLD_S, maxTotalTime).toFixed(4)}%{transform:translateY(0)}`,
      `${pctAt(INVENTORY_OPENING_GATE_S, maxTotalTime).toFixed(4)}%{transform:translateY(${inventoryDockTravelY}px)}`,
      `${pctAt(openingLoadEnd, maxTotalTime).toFixed(4)}%{transform:translateY(${inventoryDockTravelY}px)}`,
      `${pctAt(openingBoardEndAbsS, maxTotalTime).toFixed(4)}%{transform:translateY(0)}`,
    );
  }
  for (const event of laterEvents) {
    const start = event.atS - INVENTORY_TRANSITION_S;
    const gateOpenEnd = start + INVENTORY_GATE_OPEN_S;
    const liftStart = start + INVENTORY_LOAD_S + INVENTORY_EMPTY_HOLD_S;
    const shiftStart = liftStart + INVENTORY_LIFT_S;
    dockFrames.push(
      `${pctAt(start - 0.001, maxTotalTime).toFixed(4)}%{transform:translateY(0)}`,
      `${pctAt(start, maxTotalTime).toFixed(4)}%{transform:translateY(0)}`,
      `${pctAt(gateOpenEnd, maxTotalTime).toFixed(4)}%{transform:translateY(${inventoryDockTravelY}px)}`,
      `${pctAt(liftStart, maxTotalTime).toFixed(4)}%{transform:translateY(${inventoryDockTravelY}px)}`,
      `${pctAt(shiftStart, maxTotalTime).toFixed(4)}%{transform:translateY(0)}`,
    );
  }
  dockFrames.push("100%{transform:translateY(0)}");
  const dockVisibilityFrames = [hasOpening ? "0%{opacity:1}" : "0%{opacity:0}"];
  if (hasOpening) {
    dockVisibilityFrames.push(
      `${pctAt(openingBoardEndAbsS - 0.08, maxTotalTime).toFixed(4)}%{opacity:1}`,
      `${pctAt(openingBoardEndAbsS, maxTotalTime).toFixed(4)}%{opacity:0}`,
    );
  }
  for (const { start, end } of dockWindows) {
    dockVisibilityFrames.push(
      `${pctAt(start - 0.001, maxTotalTime).toFixed(4)}%{opacity:0}`,
      `${pctAt(start, maxTotalTime).toFixed(4)}%{opacity:0}`,
      `${pctAt(start + 0.06, maxTotalTime).toFixed(4)}%{opacity:1}`,
      `${pctAt(end - 0.06, maxTotalTime).toFixed(4)}%{opacity:1}`,
      `${pctAt(end, maxTotalTime).toFixed(4)}%{opacity:0}`,
    );
  }
  dockVisibilityFrames.push("100%{opacity:0}");
  inventoryStyles.push(
    `@keyframes flock-inventory-ufo-visible{${dockVisibilityFrames.join(" ")}}`,
    focusKeyframes(
      "flock-turnover-focus",
      inventoryTransitionWindows,
      maxTotalTime,
    ),
    `@keyframes flock-inventory-dock{${dockFrames.join(" ")}}`,
  );
  const coreFrames = ["0%{opacity:0}"];
  if (hasOpening) {
    const openingLoadEnd =
      INVENTORY_OPENING_GATE_S +
      openingEvents.length * INVENTORY_OPENING_CYCLE_S;
    coreFrames.push(
      `${pctAt(OPENING_APPROACH_HOLD_S, maxTotalTime).toFixed(4)}%{opacity:0}`,
      `${pctAt(INVENTORY_OPENING_GATE_S, maxTotalTime).toFixed(4)}%{opacity:0.140}`,
      `${pctAt(openingLoadEnd, maxTotalTime).toFixed(4)}%{opacity:0.140}`,
      `${pctAt(openingBoardEndAbsS, maxTotalTime).toFixed(4)}%{opacity:0}`,
    );
  }
  for (const event of laterEvents) {
    const transitionStart = event.atS - INVENTORY_TRANSITION_S;
    const gateOpenEnd = transitionStart + INVENTORY_GATE_OPEN_S;
    const liftStart = transitionStart + INVENTORY_LOAD_S + INVENTORY_EMPTY_HOLD_S;
    const shiftStart = liftStart + INVENTORY_LIFT_S;
    coreFrames.push(
      `${pctAt(transitionStart, maxTotalTime).toFixed(4)}%{opacity:0}`,
      `${pctAt(gateOpenEnd, maxTotalTime).toFixed(4)}%{opacity:0.140}`,
      `${pctAt(liftStart, maxTotalTime).toFixed(4)}%{opacity:0.140}`,
      `${pctAt(shiftStart, maxTotalTime).toFixed(4)}%{opacity:0}`,
    );
  }
  coreFrames.push("100%{opacity:0}");
  inventoryStyles.push(`@keyframes flock-inventory-core{${coreFrames.join(" ")}}`);
  const panelStyles = `
  ${PIXEL_FONT_CSS}
  .flock-panel,.flock-panel *{shape-rendering:crispEdges}
  .flock-name,.flock-status,.flock-label,.flock-meta-key,.flock-meta-value,.flock-energy{font-family:GMPixel,ui-monospace,monospace;font-synthesis:none;font-weight:400;fill:var(--gm-panel-text)}
  .flock-meta-key{font-size:8px;opacity:.68}.flock-meta-value{font-size:8px}.flock-name{font-size:8px}.flock-label{font-size:8px;opacity:.68}.flock-status{font-size:8px;fill:var(--gm-level-3)}
  .flock-energy{font-size:8px;fill:var(--gm-level-4)}
  .flock-map-mark{fill-opacity:.52}.flock-map-footprint{fill-opacity:.42}.flock-map-focus{fill:none;stroke:var(--gm-level-4);stroke-width:1.2;stroke-linecap:square;stroke-linejoin:miter}
  .flock-inventory-pen,.flock-inventory-gate{fill:none;stroke:var(--gm-fence)}.flock-inventory-pen{stroke-width:.8}.flock-inventory-gate{stroke-width:1.2;stroke-dasharray:16;animation:flock-inventory-gate ${animationDuration}s linear 0s 1 both}.flock-inventory-tag{stroke:var(--gm-tag-outline);stroke-width:.35}
  .flock-secondary-motion,#grass-crumbs{animation:flock-turnover-focus ${animationDuration}s step-end 0s 1 both}
  ${progressStyles.join("\n  ")}
  ${cameraStyles.join("\n  ")}
  ${mapStyles.join("\n  ")}
  ${selectedStyles.join("\n  ")}
  ${headerStyles.join("\n  ")}
  ${inventoryStyles.join("\n  ")}`;

  const panelGroup = `<g class="flock-panel" aria-hidden="true">
    <defs><pattern id="flock-panel-grid" x="${FENCE_TILE}" y="${panelTop + FENCE_TILE}" width="${FENCE_TILE}" height="${FENCE_TILE}" patternUnits="userSpaceOnUse"><rect width="10" height="10" rx="2" fill="var(--gm-level-0)"/></pattern><clipPath id="flock-camera-clip"><rect x="${cameraLeft}" y="${cameraTop}" width="${cameraWidth}" height="${cameraHeight}" rx="2"/></clipPath><clipPath id="flock-inventory-clip"><rect x="${inventoryPenX}" y="${inventoryPenY}" width="${INVENTORY_SLOT_COUNT * 16 + (INVENTORY_SLOT_COUNT - 1) * 2}" height="11"/></clipPath><symbol id="flock-ufo-icon" viewBox="${UFO_VIEWBOX}">${UFO_CONTENT}</symbol><symbol id="flock-inventory-sheep-icon" viewBox="0.5 0 15 12.5">${SHEEP_CONTENT}</symbol><symbol id="flock-meter-selected" viewBox="0 0 80 8">${meterSymbolCells(80, 8)}</symbol>${progressClips.join("")}</defs>
    <rect class="flock-panel-grid" x="${FENCE_TILE}" y="${panelTop + FENCE_TILE}" width="${totalWidth - FENCE_TILE * 2 - 2}" height="${FENCE_TILE * 5 - 2}" fill="url(#flock-panel-grid)"/>
    <rect class="flock-merged-cell flock-selected-surface" x="12" y="${panelTop + 24}" width="202" height="46" rx="2" fill="var(--gm-level-0)"/>
    <rect class="flock-merged-cell flock-status-cell" x="${fieldMetaX}" y="${panelTop + 12}" width="${fieldMetaWidth}" height="10" rx="2" fill="var(--gm-level-0)"/>
    <rect class="flock-merged-cell flock-status-cell" x="${flockMetaX}" y="${panelTop + 12}" width="${flockMetaWidth}" height="10" rx="2" fill="var(--gm-level-0)"/>
    <rect class="flock-merged-cell flock-status-cell" x="${grassMetaX}" y="${panelTop + 12}" width="${grassMetaWidth}" height="10" rx="2" fill="var(--gm-level-0)"/>
    <g class="flock-panel-fence" transform="translate(0 ${panelTop})">${panelFence}</g>
    ${fieldLabels.join("")}
    <text x="${inventoryLabelX}" y="${panelTop + 21}" class="flock-meta-key">양떼</text>
    ${Array.from({ length: INVENTORY_SLOT_COUNT - 1 }, (_, index) => `<rect class="flock-inventory-pen" x="${inventoryPenX + index * inventoryPenPitch}" y="${inventoryPenY}" width="16" height="11" rx="1"/>`).join("")}<path class="flock-inventory-pen" d="M${inventoryRightPenX} ${inventoryPenY}V${inventoryPenY + 11}H${inventoryRightPenX + 16}V${inventoryPenY}"/>
    <g class="flock-inventory-states">${inventoryGroups.join("")}${openingDispatchGroups.join("")}${openingShiftGroup}${dispatchGroups.join("")}</g>
    <path class="flock-inventory-gate" d="M${inventoryRightPenX} ${inventoryPenY}H${inventoryRightPenX + 16}"/>
    <g class="flock-inventory-dock-activity" data-energy-link="pickup-dock-finale" style="opacity:0;animation:flock-inventory-ufo-visible ${animationDuration}s ease-in-out 0s 1 both"><g class="flock-inventory-dock-motion" style="animation:flock-inventory-dock ${animationDuration}s ease-in-out 0s 1 both"><use class="flock-inventory-ufo" href="#flock-ufo-icon" x="${inventoryDockX - 13}" y="${panelTop - 15}" width="26" height="26"/><circle class="flock-inventory-core" cx="${inventoryDockX}" cy="${panelTop + 7}" r="5" fill="var(--gm-beam-core)" style="opacity:0;animation:flock-inventory-core ${animationDuration}s ease-in-out 0s 1 both"/></g></g>
    ${grassLabels.join("")}
    <g class="flock-camera-window" data-camera-heroes="${heroShots.map(({ sheep }) => sheep.rosterIndex).join(",")}" data-camera-modes="${heroShots.map(({ mode }) => mode).join(",")}" data-camera-reframes="${Math.max(0, cameraTargets.length - heroShots.length)}" data-camera-handoff="blank" clip-path="url(#flock-camera-clip)" style="opacity:0;animation:flock-camera-visible ${animationDuration}s step-end 0s 1 both"><g class="flock-camera-live" style="animation:flock-camera-follow ${animationDuration}s linear 0s 1 both"><use href="#pasture-live-scene"/>${cameraSheepGroups}</g></g>
    <g class="flock-selected-region">${selectedGroups.join("")}</g>
    <g class="flock-map-region">${mapMarks.join("")}${footprintGroups.join("")}<g class="flock-secondary-motion">${mapPulses.join("")}${mapCursor}</g></g>
  </g>`;

  return { panelStyles, panelGroup };
}
