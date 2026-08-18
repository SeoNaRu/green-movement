import type { TimelineResult } from "../../timeline/types.js";
import {
  FENCE_TILE,
  MOTION_TIME_SCALE,
  SHEEP_FULLNESS_CAPACITY,
  SHEEP_CONTENT,
  UFO_CONTENT,
  UFO_VIEWBOX,
} from "../constants.js";
import { buildFencePieces } from "../layout/gridLayout.js";
import { PIXEL_FONT_CSS } from "../pixelFont.js";
import { buildSheepTagSvg, getSheepTagCode } from "../sheepTag.js";

type PanelFlock = TimelineResult["flock"];
type SelectedState = "INBOUND" | "DEPLOYING" | "GRAZING" | "EXTRACTING";

const selectedStateLabel: Record<SelectedState, string> = {
  INBOUND: "",
  DEPLOYING: "",
  GRAZING: "식사 중",
  EXTRACTING: "",
};

const HANDOFF_GAP_S = 0.08;
const READY_CUE_LEAD_S = 0.54;

const pctAt = (time: number, total: number) =>
  Math.min(100, Math.max(0, total > 0 ? (time * 100) / total : 0));

const meterSymbolCells = (
  width: number,
  height: number,
  gap: number,
) => {
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
) => `<use class="flock-meter-track" href="#flock-meter-selected" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height}" style="color:var(--gm-panel-track)"/><g clip-path="url(#flock-progress-${rosterIndex})"><use class="flock-meter-fill" href="#flock-meter-selected" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height}" style="color:var(--gm-level-4)"/>${pulseAnimation ? `<use class="flock-meter-pulse" href="#flock-meter-selected" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height}" style="color:var(--gm-beam-core);opacity:0;animation:${pulseAnimation}"/>` : ""}</g>`;

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

function readyCueKeyframes(
  name: string,
  start: number,
  pickup: number,
  end: number,
  total: number,
): string {
  const frames = [
    [0, 0],
    [Math.max(0, start - 0.001), 0],
    [start, 0.25],
    [Math.min(pickup, start + 0.08), 1],
    [Math.min(pickup, start + 0.18), 0.35],
    [pickup, 0.72],
    [Math.max(pickup, end - 0.001), 0.72],
    [end, 0],
    [total, 0],
  ].sort(([a], [b]) => a - b);
  return `@keyframes ${name} {
    ${frames.map(([time, opacity]) => `${pctAt(time, total).toFixed(4)}% { opacity:${opacity}; }`).join("\n    ")}
  }`;
}

export function buildFlockPanelLayer(params: {
  flock: PanelFlock;
  maxTotalTime: number;
  panelTop: number;
  totalWidth: number;
}): { panelStyles: string; panelGroup: string } {
  const { flock, maxTotalTime, panelTop, totalWidth } = params;
  const animationDuration = (maxTotalTime * MOTION_TIME_SCALE).toFixed(3);
  const panelHeight = 78;
  const panelBottom = panelTop + panelHeight - 0.5;
  const panelRight = totalWidth - 0.5;
  const rosterLeft = 212;
  const rosterWidth = totalWidth - rosterLeft - 10;
  const columns = Math.max(1, Math.ceil(flock.rosterSize / 2));
  const slotSize = Math.min(16, rosterWidth / columns);
  const slotGap = columns > 1 ? (rosterWidth - slotSize) / (columns - 1) : 0;
  const fieldMetaX = 10;
  const fieldMetaWidth = (totalWidth - fieldMetaX * 2) / 3;
  const flockMetaWidth = fieldMetaWidth;
  const grassMetaWidth = fieldMetaWidth;
  const flockMetaX = fieldMetaX + fieldMetaWidth;
  const grassMetaX = flockMetaX + flockMetaWidth;
  const panelFence = buildFencePieces({
    fenceRightX: totalWidth - FENCE_TILE,
    fenceBottomY: panelHeight - FENCE_TILE,
  });
  const stateAt = (
    sheep: PanelFlock["sheep"][number],
    time: number,
  ): SelectedState | null => {
    if (time < sheep.spawnAbsS) {
      return sheep.inboundAbsS != null &&
        time >= sheep.inboundAbsS + HANDOFF_GAP_S
        ? "INBOUND"
        : null;
    }
    if (sheep.hiddenAbsS != null && time >= sheep.hiddenAbsS) {
      return null;
    }
    if (time < sheep.spawnAbsS + 0.18) return "DEPLOYING";
    if (sheep.pickupAbsS != null && time >= sheep.pickupAbsS) {
      return "EXTRACTING";
    }
    return "GRAZING";
  };

  const boundaries = new Set<number>([0, maxTotalTime]);
  for (const sheep of flock.sheep) {
    if (sheep.inboundAbsS != null) {
      boundaries.add(sheep.inboundAbsS);
      boundaries.add(
        Math.min(maxTotalTime, sheep.inboundAbsS + HANDOFF_GAP_S),
      );
    }
    boundaries.add(sheep.spawnAbsS);
    boundaries.add(Math.min(maxTotalTime, sheep.spawnAbsS + 0.18));
    if (sheep.pickupAbsS != null) boundaries.add(sheep.pickupAbsS);
    if (sheep.hiddenAbsS != null) boundaries.add(sheep.hiddenAbsS);
  }
  const times = [...boundaries]
    .filter((time) => time >= 0 && time <= maxTotalTime)
    .sort((a, b) => a - b);
  const selectedIntervals = new Map<
    number,
    { start: number; end: number; status: SelectedState }[]
  >();
  const handoffGaps = flock.sheep
    .filter((sheep) => sheep.inboundAbsS != null)
    .map((sheep) => ({
      start: sheep.inboundAbsS!,
      end: sheep.inboundAbsS! + HANDOFF_GAP_S,
    }));
  let priorRosterIndex: number | null = null;
  for (let index = 0; index < times.length - 1; index++) {
    const start = times[index];
    const end = times[index + 1];
    if (end <= start) continue;
    const middle = start + (end - start) / 2;
    if (handoffGaps.some((gap) => middle >= gap.start && middle < gap.end)) {
      priorRosterIndex = null;
      continue;
    }
    const available = flock.sheep
      .map((sheep) => ({ sheep, status: stateAt(sheep, middle) }))
      .filter(
        (entry): entry is { sheep: PanelFlock["sheep"][number]; status: SelectedState } =>
          entry.status != null,
      );
    const priority = available.filter(({ status }) => status === "EXTRACTING");
    const inbound = available.filter(({ status }) => status === "INBOUND");
    const deploying = available.filter(({ status }) => status === "DEPLOYING");
    const grazing = available.filter(({ status }) => status === "GRAZING");
    const preferred = grazing.find(
      ({ sheep }) => sheep.rosterIndex === priorRosterIndex,
    );
    const selected =
      priority.at(-1) ??
      inbound.at(-1) ??
      deploying.at(-1) ??
      preferred ??
      grazing.at(-1);
    if (!selected) {
      priorRosterIndex = null;
      continue;
    }
    priorRosterIndex = selected.sheep.rosterIndex;
    const list = selectedIntervals.get(priorRosterIndex) ?? [];
    const previous = list.at(-1);
    if (previous?.end === start && previous.status === selected.status) {
      previous.end = end;
    } else {
      list.push({ start, end, status: selected.status });
    }
    selectedIntervals.set(priorRosterIndex, list);
  }

  const progressStyles: string[] = [];
  const progressClips: string[] = [];
  const rosterStateStyles: string[] = [];
  const rosterSlots = flock.sheep.map((sheep, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = rosterLeft + column * slotGap;
    const y = panelTop + 31 + row * 19;
    const label = String(sheep.rosterIndex + 1).padStart(2, "0");
    const labelSize = Math.max(4.2, Math.min(8, slotSize * 0.44));
    const tagColor = getSheepTagCode(sheep.rosterIndex);
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

    const pickup = sheep.pickupAbsS ?? maxTotalTime;
    const hidden = sheep.hiddenAbsS ?? maxTotalTime;
    const outgoing = sheep.inboundAbsS == null
      ? null
      : flock.sheep.find(
          (candidate) =>
            candidate.hiddenAbsS != null &&
            Math.abs(candidate.hiddenAbsS - sheep.inboundAbsS!) < 0.0001,
        );
    const cuePickup = outgoing?.pickupAbsS ?? null;
    const cueName = `flock-ready-cue-${index}`;
    rosterStateStyles.push(
      visibilityKeyframes(
        `flock-active-${index}`,
        [{ start: sheep.spawnAbsS, end: pickup }],
        maxTotalTime,
      ),
      visibilityKeyframes(
        `flock-extracting-${index}`,
        sheep.pickupAbsS != null
          ? [{ start: sheep.pickupAbsS, end: hidden }]
          : [],
        maxTotalTime,
      ),
      visibilityKeyframes(
        `flock-collected-${index}`,
        sheep.hiddenAbsS != null
          ? [{ start: sheep.hiddenAbsS, end: maxTotalTime }]
          : [],
        maxTotalTime,
      ),
      ...(cuePickup == null
        ? []
        : [
            readyCueKeyframes(
              cueName,
              Math.max(0, cuePickup - READY_CUE_LEAD_S),
              cuePickup,
              sheep.spawnAbsS,
              maxTotalTime,
            ),
          ]),
    );
    return `<g class="flock-slot flock-slot-${index}">
      <rect class="sheep-ranch-tag flock-slot-tag flock-slot-id" data-ranch-tag="${tagColor}" data-id-color="${tagColor}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${slotSize.toFixed(2)}" height="${slotSize.toFixed(2)}" fill="var(--gm-level-${tagColor})" fill-opacity=".28" stroke="var(--gm-level-${tagColor})" stroke-width="1.2"/>
      ${cuePickup == null ? "" : `<rect class="flock-ready-cue" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${slotSize.toFixed(2)}" height="${slotSize.toFixed(2)}" fill="var(--gm-level-2)" style="opacity:0;animation:${cueName} ${animationDuration}s linear 0s 1 both"/>`}
      <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${slotSize.toFixed(2)}" height="${slotSize.toFixed(2)}" fill="var(--gm-level-1)" style="opacity:0;animation:flock-collected-${index} ${animationDuration}s step-end 0s 1 both"/>
      <text x="${(x + slotSize / 2).toFixed(2)}" y="${(y + slotSize * 0.64).toFixed(2)}" text-anchor="middle" class="flock-slot-index" font-size="${labelSize.toFixed(2)}">${label}</text>
      <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${slotSize.toFixed(2)}" height="${slotSize.toFixed(2)}" fill="none" stroke="var(--gm-level-2)" stroke-width="1" style="opacity:0;animation:flock-active-${index} ${animationDuration}s step-end 0s 1 both"/>
      <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${slotSize.toFixed(2)}" height="${slotSize.toFixed(2)}" fill="none" stroke="var(--gm-level-4)" stroke-width="2" style="opacity:0;animation:flock-extracting-${index} ${animationDuration}s step-end 0s 1 both"/>
      <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${slotSize.toFixed(2)}" height="${slotSize.toFixed(2)}" fill="none" stroke="var(--gm-level-4)" stroke-width="1.5" style="opacity:0;animation:flock-selected-${sheep.rosterIndex} ${animationDuration}s step-end 0s 1 both"/>
    </g>`;
  });

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
    for (const [intervalIndex, interval] of intervals.entries()) {
      const label = selectedStateLabel[interval.status];
      if (!label) continue;
      const name = `flock-status-${sheep.rosterIndex}-${intervalIndex}`;
      selectedStyles.push(
        visibilityKeyframes(name, [interval], maxTotalTime),
      );
      selectedGroups.push(
        `<text x="70" y="${panelTop + 58}" class="flock-status" style="opacity:0;animation:${name} ${animationDuration}s step-end 0s 1 both">${label}</text>`,
      );
    }
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
        `<text x="190" y="${panelTop + 43}" text-anchor="end" class="flock-energy" style="opacity:0;animation:${energyName} ${animationDuration}s step-end 0s 1 both">${energy}/${SHEEP_FULLNESS_CAPACITY}</text>`,
      );
      if (bite == null) break;
      energy = Math.min(SHEEP_FULLNESS_CAPACITY, energy + bite.level);
      energyStart = energyEnd;
    }
    selectedGroups.push(`<g style="opacity:0;animation:flock-selected-${sheep.rosterIndex} ${animationDuration}s step-end 0s 1 both">
      <use href="#flock-sheep-icon" x="17" y="${panelTop + 34}" width="30" height="25"/>
      ${buildSheepTagSvg({ rosterIndex: sheep.rosterIndex, x: 53, y: panelTop + 35, size: 8, className: "flock-selected-tag", strokeWidth: 0.6 })}
      <text x="70" y="${panelTop + 43}" class="flock-name">양 ${String(sheep.rosterIndex + 1).padStart(2, "0")}</text>
      <text x="112" y="${panelTop + 43}" class="flock-label">포만</text>
      ${meter(112, panelTop + 51, 78, 7, sheep.rosterIndex, `${pulseName} ${animationDuration}s linear 0s 1 both`)}
      ${energyGroups.join("")}
    </g>`);
  }

  const firstSpawn = Math.min(
    maxTotalTime,
    ...flock.sheep.map((sheep) => sheep.spawnAbsS),
  );
  const lastHidden = Math.max(
    0,
    ...flock.sheep.map((sheep) => sheep.hiddenAbsS ?? 0),
  );
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
      `<g style="opacity:0;animation:flock-complete ${animationDuration}s step-end 0s 1 both"><use href="#flock-ufo-icon" x="17" y="${panelTop + 34}" width="30" height="30"/><text x="56" y="${panelTop + 46}" class="flock-name">목장 정리 완료</text><text x="56" y="${panelTop + 60}" class="flock-status">모든 양 수거</text></g>`,
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
  .flock-slot-index{font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;fill:var(--gm-panel-text)}
  .flock-meta-key{font-size:8px;opacity:.68}.flock-meta-value{font-size:8px}.flock-name{font-size:8px}.flock-label{font-size:8px;opacity:.68}.flock-status{font-size:8px;fill:var(--gm-level-3)}
  .flock-energy{font-size:8px;fill:var(--gm-level-4)}
  .flock-slot-index{font-weight:650;opacity:.8}
  ${progressStyles.join("\n  ")}
  ${rosterStateStyles.join("\n  ")}
  ${selectedStyles.join("\n  ")}
  ${headerStyles.join("\n  ")}`;

  const panelGroup = `<g class="flock-panel" aria-hidden="true">
    <defs><pattern id="flock-panel-grid" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="var(--gm-panel-section)"/></pattern><symbol id="flock-sheep-icon" viewBox="0.5 0 15 12.5">${SHEEP_CONTENT}</symbol><symbol id="flock-ufo-icon" viewBox="${UFO_VIEWBOX}">${UFO_CONTENT}</symbol><symbol id="flock-meter-selected" viewBox="0 0 80 6">${meterSymbolCells(80, 6, 1)}</symbol>${progressClips.join("")}</defs>
    <path class="flock-panel-surface" d="M6 ${panelTop + 6}H${panelRight - 6}V${panelBottom - 6}H6Z" fill="var(--gm-panel-bg)"/>
    <path class="flock-panel-grid" d="M8 ${panelTop + 8}H${panelRight - 8}V${panelBottom - 8}H8Z" fill="url(#flock-panel-grid)" opacity=".56"/>
    <rect class="flock-selected-surface" x="10" y="${panelTop + 30}" width="188" height="36" fill="var(--gm-panel-bg)"/>
    <rect class="flock-status-cell" x="${fieldMetaX}" y="${panelTop + 10}" width="${fieldMetaWidth}" height="16" fill="var(--gm-panel-bg)" stroke="var(--gm-panel-line)" stroke-width="1"/>
    <rect class="flock-status-cell" x="${flockMetaX}" y="${panelTop + 10}" width="${flockMetaWidth}" height="16" fill="var(--gm-panel-bg)" stroke="var(--gm-panel-line)" stroke-width="1"/>
    <rect class="flock-status-cell" x="${grassMetaX}" y="${panelTop + 10}" width="${grassMetaWidth}" height="16" fill="var(--gm-panel-bg)" stroke="var(--gm-panel-line)" stroke-width="1"/>
    <g class="flock-panel-fence" transform="translate(0 ${panelTop})">${panelFence}</g>
    ${fieldLabels.join("")}
    <text x="${flockMetaX + 7}" y="${panelTop + 21}" class="flock-meta-key">양떼</text><text x="${flockMetaX + flockMetaWidth - 7}" y="${panelTop + 21}" text-anchor="end" class="flock-meta-value">${flock.rosterSize}</text>
    ${grassLabels.join("")}
    <g class="flock-selected-region">${selectedGroups.join("")}</g>
    <g class="flock-roster-region">${rosterSlots.join("")}</g>
  </g>`;

  return { panelStyles, panelGroup };
}
