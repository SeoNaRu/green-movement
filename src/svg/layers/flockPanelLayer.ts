import type { TimelineResult } from "../../timeline/types.js";
import {
  FENCE_TILE,
  MOTION_TIME_SCALE,
  SHEEP_FULLNESS_CAPACITY,
  UFO_CONTENT,
  UFO_VIEWBOX,
} from "../constants.js";
import { buildFencePieces } from "../layout/gridLayout.js";
import { PIXEL_FONT_CSS } from "../pixelFont.js";
import { buildSheepTagSvg, getSheepTagCode } from "../sheepTag.js";

type PanelFlock = TimelineResult["flock"];

const HANDOFF_GAP_S = 0.55;

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

export function buildFlockPanelLayer(params: {
  flock: PanelFlock;
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
  const heroShots: {
    sheep: PanelFlock["sheep"][number];
    start: number;
    selectedStart: number;
    end: number;
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
    const hero = available.sort((a, b) => {
      const score = (sheep: PanelFlock["sheep"][number]) =>
        lifecycleEnd(sheep) - heroCursor + nearbyCount(sheep, heroCursor) * 1.5;
      return score(b) - score(a) || a.rosterIndex - b.rosterIndex;
    })[0];
    if (hero == null) break;
    const end = lifecycleEnd(hero);
    heroShots.push({
      sheep: hero,
      start: heroCursor,
      selectedStart: Math.min(
        end,
        heroCursor + (heroShots.length === 0 ? 0 : HANDOFF_GAP_S),
      ),
      end,
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
  const cameraCenterY = cameraTop + cameraHeight / 2 - 8;
  const cameraScale = 1.55;
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
  }[] = [];
  for (const shot of heroShots) {
    let anchor = groupFrameAt(shot.sheep, shot.start);
    let lastReframe = shot.start;
    cameraTargets.push({ atS: shot.start, point: anchor, lead: false });
    for (const frame of (cameraTracks.get(shot.sheep.rosterIndex) ?? []).filter(
      (entry) => entry.atS > shot.start && entry.atS < shot.end,
    )) {
      const point = [frame.x, frame.y] as [number, number];
      if (
        Math.abs(point[1] - anchor[1]) <= 6 &&
        (frame.atS - lastReframe < 1 ||
          Math.abs(point[0] - anchor[0]) <= 40)
      ) {
        continue;
      }
      anchor = groupFrameAt(shot.sheep, frame.atS);
      cameraTargets.push({ atS: frame.atS, point: anchor, lead: true });
      lastReframe = frame.atS;
    }
  }
  let priorCameraPoint = cameraTargets[0]?.point ?? [0, 0];
  let priorCameraTime = firstSpawn;
  const cameraFrames = [`0%{transform:${cameraTransform(priorCameraPoint)}}`];
  for (const [index, target] of cameraTargets.entries()) {
    if (index === 0) continue;
    const panEnd = target.lead
      ? target.atS
      : Math.min(maxTotalTime, target.atS + 0.55);
    const panStart = target.lead
      ? Math.max(priorCameraTime, panEnd - 0.55)
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
      [{ start: firstSpawn, end: lastHidden }],
      maxTotalTime,
    ),
  ];

  const mapStyles: string[] = [];
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
    return `<rect class="flock-map-mark" x="${x}" y="${y}" width="10" height="10" rx="2" fill="var(--gm-level-${Math.min(4, bite.level)})" style="opacity:0;animation:${markName} ${animationDuration}s step-end 0s 1 both"/><rect class="flock-map-pulse" x="${x}" y="${y}" width="10" height="10" rx="2" fill="var(--gm-beam-core)" style="opacity:0;animation:${pulseName} ${animationDuration}s linear 0s 1 both"/>`;
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
        `<text x="205" y="${panelTop + 64}" text-anchor="end" class="flock-energy" style="opacity:0;animation:${energyName} ${animationDuration}s step-end 0s 1 both">${energy}/${SHEEP_FULLNESS_CAPACITY}</text>`,
      );
      if (bite == null) break;
      energy = Math.min(SHEEP_FULLNESS_CAPACITY, energy + bite.level);
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
        "flock-inbound",
        [{ start: 0, end: firstSpawn }],
        maxTotalTime,
      ),
      visibilityKeyframes(
        "flock-complete",
        [{ start: lastHidden, end: maxTotalTime }],
        maxTotalTime,
      ),
    );
    selectedGroups.push(
      `<g style="opacity:0;animation:flock-inbound ${animationDuration}s step-end 0s 1 both"><text x="18" y="${panelTop + 46}" class="flock-name">양떼 접근 중</text><text x="18" y="${panelTop + 60}" class="flock-status">첫 투입 대기</text></g>`,
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

  const panelStyles = `
  ${PIXEL_FONT_CSS}
  .flock-panel,.flock-panel *{shape-rendering:crispEdges}
  .flock-name,.flock-status,.flock-label,.flock-meta-key,.flock-meta-value,.flock-energy{font-family:GMPixel,ui-monospace,monospace;font-synthesis:none;font-weight:400;fill:var(--gm-panel-text)}
  .flock-meta-key{font-size:8px;opacity:.68}.flock-meta-value{font-size:8px}.flock-name{font-size:8px}.flock-label{font-size:8px;opacity:.68}.flock-status{font-size:8px;fill:var(--gm-level-3)}
  .flock-energy{font-size:8px;fill:var(--gm-level-4)}
  .flock-map-mark{fill-opacity:.52}.flock-map-footprint{fill-opacity:.42}.flock-map-focus{fill:none;stroke:var(--gm-level-4);stroke-width:1.2;stroke-linecap:square;stroke-linejoin:miter}
  ${progressStyles.join("\n  ")}
  ${cameraStyles.join("\n  ")}
  ${mapStyles.join("\n  ")}
  ${selectedStyles.join("\n  ")}
  ${headerStyles.join("\n  ")}`;

  const panelGroup = `<g class="flock-panel" aria-hidden="true">
    <defs><pattern id="flock-panel-grid" x="${FENCE_TILE}" y="${panelTop + FENCE_TILE}" width="${FENCE_TILE}" height="${FENCE_TILE}" patternUnits="userSpaceOnUse"><rect width="10" height="10" rx="2" fill="var(--gm-level-0)"/></pattern><clipPath id="flock-camera-clip"><rect x="${cameraLeft}" y="${cameraTop}" width="${cameraWidth}" height="${cameraHeight}" rx="2"/></clipPath><symbol id="flock-ufo-icon" viewBox="${UFO_VIEWBOX}">${UFO_CONTENT}</symbol><symbol id="flock-meter-selected" viewBox="0 0 80 8">${meterSymbolCells(80, 8)}</symbol>${progressClips.join("")}</defs>
    <rect class="flock-panel-grid" x="${FENCE_TILE}" y="${panelTop + FENCE_TILE}" width="${totalWidth - FENCE_TILE * 2 - 2}" height="${FENCE_TILE * 5 - 2}" fill="url(#flock-panel-grid)"/>
    <rect class="flock-merged-cell flock-selected-surface" x="12" y="${panelTop + 24}" width="202" height="46" rx="2" fill="var(--gm-level-0)"/>
    <rect class="flock-merged-cell flock-status-cell" x="${fieldMetaX}" y="${panelTop + 12}" width="${fieldMetaWidth}" height="10" rx="2" fill="var(--gm-level-0)"/>
    <rect class="flock-merged-cell flock-status-cell" x="${flockMetaX}" y="${panelTop + 12}" width="${flockMetaWidth}" height="10" rx="2" fill="var(--gm-level-0)"/>
    <rect class="flock-merged-cell flock-status-cell" x="${grassMetaX}" y="${panelTop + 12}" width="${grassMetaWidth}" height="10" rx="2" fill="var(--gm-level-0)"/>
    <g class="flock-panel-fence" transform="translate(0 ${panelTop})">${panelFence}</g>
    ${fieldLabels.join("")}
    <text x="${flockMetaX + 7}" y="${panelTop + 21}" class="flock-meta-key">양떼</text><text x="${flockMetaX + flockMetaWidth - 7}" y="${panelTop + 21}" text-anchor="end" class="flock-meta-value">${flock.rosterSize}</text>
    ${grassLabels.join("")}
    <g class="flock-camera-window" data-camera-heroes="${heroShots.map(({ sheep }) => sheep.rosterIndex).join(",")}" data-camera-reframes="${Math.max(0, cameraTargets.length - heroShots.length)}" clip-path="url(#flock-camera-clip)" style="opacity:0;animation:flock-camera-visible ${animationDuration}s step-end 0s 1 both"><g class="flock-camera-live" style="animation:flock-camera-follow ${animationDuration}s linear 0s 1 both"><use href="#pasture-live-scene"/>${cameraSheepGroups}</g></g>
    <g class="flock-selected-region">${selectedGroups.join("")}</g>
    <g class="flock-map-region">${mapMarks.join("")}${footprintGroups.join("")}${mapCursor}</g>
  </g>`;

  return { panelStyles, panelGroup };
}
