import type { TimelineResult } from "../../timeline/types.js";
import {
  MOTION_TIME_SCALE,
  SHEEP_CONTENT,
  UFO_CONTENT,
  UFO_VIEWBOX,
} from "../constants.js";

type PanelFlock = TimelineResult["flock"];
type SelectedState = "DEPLOYING" | "GRAZING" | "EXTRACTING";

const pctAt = (time: number, total: number) =>
  Math.min(100, Math.max(0, total > 0 ? (time * 100) / total : 0));

const meterSymbolCells = (
  width: number,
  height: number,
  gap: number,
) => {
  const cellWidth = (width - gap * 9) / 10;
  return Array.from({ length: 10 }, (_, index) =>
    `<rect x="${(index * (cellWidth + gap)).toFixed(2)}" width="${cellWidth.toFixed(2)}" height="${height}" rx="${Math.min(0.8, height / 2).toFixed(2)}" fill="currentColor"/>`,
  ).join("");
};

const meter = (
  x: number,
  y: number,
  width: number,
  height: number,
  rosterIndex: number,
  compact = false,
) => `<use class="flock-meter-track" href="#flock-meter-${compact ? "compact" : "selected"}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height}" style="color:var(--gm-panel-track)"/><g clip-path="url(#flock-progress-${rosterIndex})"><use class="flock-meter-fill" href="#flock-meter-${compact ? "compact" : "selected"}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height}" style="color:var(--gm-level-4)"/></g>`;

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
}): { panelStyles: string; panelGroup: string } {
  const { flock, maxTotalTime, panelTop, totalWidth } = params;
  const animationDuration = (maxTotalTime * MOTION_TIME_SCALE).toFixed(3);
  const panelHeight = 78;
  const panelBottom = panelTop + panelHeight - 0.5;
  const panelRight = totalWidth - 0.5;
  const rosterLeft = 198;
  const rosterWidth = totalWidth - rosterLeft - 8;
  const columns = Math.max(1, Math.ceil(flock.rosterSize / 2));
  const slotPitch = rosterWidth / columns;
  const slotWidth = Math.min(72, Math.max(10, slotPitch - 6));

  const stateAt = (
    sheep: PanelFlock["sheep"][number],
    time: number,
  ): SelectedState | null => {
    if (
      time < sheep.spawnAbsS ||
      (sheep.hiddenAbsS != null && time >= sheep.hiddenAbsS)
    ) {
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
  let priorRosterIndex: number | null = null;
  for (let index = 0; index < times.length - 1; index++) {
    const start = times[index];
    const end = times[index + 1];
    if (end <= start) continue;
    const middle = start + (end - start) / 2;
    const available = flock.sheep
      .map((sheep) => ({ sheep, status: stateAt(sheep, middle) }))
      .filter(
        (entry): entry is { sheep: PanelFlock["sheep"][number]; status: SelectedState } =>
          entry.status != null,
      );
    const priority = available.filter(({ status }) => status === "EXTRACTING");
    const deploying = available.filter(({ status }) => status === "DEPLOYING");
    const grazing = available.filter(({ status }) => status === "GRAZING");
    const preferred = grazing.find(
      ({ sheep }) => sheep.rosterIndex === priorRosterIndex,
    );
    const selected =
      priority.at(-1) ?? deploying.at(-1) ?? preferred ?? grazing.at(-1);
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
    const x = rosterLeft + column * slotPitch + (slotPitch - slotWidth) / 2;
    const y = panelTop + 28 + row * 23;
    const label = String(sheep.rosterIndex + 1).padStart(2, "0");
    const labelSize = Math.max(
      4.2,
      Math.min(8, (slotWidth - 4) / (label.length * 0.62)),
    );
    const labelX = slotWidth >= 36 ? x + 6 : x + slotWidth / 2;
    const labelAnchor = slotWidth >= 36 ? "start" : "middle";
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
    );
    const check =
      slotWidth >= 28
        ? `<path d="M${(x + slotWidth - 12).toFixed(2)} ${(y + 8.5).toFixed(2)}l2.2 2.2 4-4.4" fill="none" stroke="var(--gm-level-4)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" style="opacity:0;animation:flock-collected-${index} ${animationDuration}s linear 0s 1 both"/>`
        : "";
    return `<g class="flock-slot flock-slot-${index}">
      <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${slotWidth.toFixed(2)}" height="18" rx=".8" fill="var(--gm-panel-section)" stroke="var(--gm-panel-line)" stroke-width=".5"/>
      <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${slotWidth.toFixed(2)}" height="18" rx=".8" fill="var(--gm-level-1)" style="opacity:0;animation:flock-collected-${index} ${animationDuration}s linear 0s 1 both"/>
      <text x="${labelX.toFixed(2)}" y="${(y + 10.5).toFixed(2)}" text-anchor="${labelAnchor}" class="flock-slot-index" font-size="${labelSize.toFixed(2)}">${label}</text>
      ${check}
      ${meter(x + 3, y + 14, Math.max(1, slotWidth - 6), 2.5, index, true)}
      <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${slotWidth.toFixed(2)}" height="18" rx=".8" fill="none" stroke="var(--gm-level-2)" stroke-width=".9" style="opacity:0;animation:flock-active-${index} ${animationDuration}s linear 0s 1 both"/>
      <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${slotWidth.toFixed(2)}" height="18" rx=".8" fill="none" stroke="var(--gm-level-4)" stroke-width="1.5" style="opacity:0;animation:flock-extracting-${index} ${animationDuration}s linear 0s 1 both"/>
      <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${slotWidth.toFixed(2)}" height="18" rx=".8" fill="none" stroke="var(--gm-level-4)" stroke-width="1.2" style="opacity:0;animation:flock-selected-${sheep.rosterIndex} ${animationDuration}s linear 0s 1 both"/>
    </g>`;
  });

  const selectedStyles: string[] = [];
  const selectedGroups: string[] = [];
  for (const sheep of flock.sheep) {
    const intervals = selectedIntervals.get(sheep.rosterIndex) ?? [];
    selectedStyles.push(
      visibilityKeyframes(
        `flock-selected-${sheep.rosterIndex}`,
        intervals,
        maxTotalTime,
      ),
    );
    for (const [intervalIndex, interval] of intervals.entries()) {
      const name = `flock-status-${sheep.rosterIndex}-${intervalIndex}`;
      selectedStyles.push(
        visibilityKeyframes(name, [interval], maxTotalTime),
      );
      selectedGroups.push(
        `<text x="50" y="${panelTop + 51}" class="flock-status" style="opacity:0;animation:${name} ${animationDuration}s linear 0s 1 both">${interval.status}</text>`,
      );
    }
    selectedGroups.push(`<g style="opacity:0;animation:flock-selected-${sheep.rosterIndex} ${animationDuration}s linear 0s 1 both">
      <use href="#flock-sheep-icon" x="13" y="${panelTop + 38}" width="28" height="23"/>
      <text x="50" y="${panelTop + 39}" class="flock-name">SHEEP ${String(sheep.rosterIndex + 1).padStart(2, "0")}</text>
      <text x="50" y="${panelTop + 66}" class="flock-label">FULLNESS</text>
      ${meter(96, panelTop + 59, 80, 6, sheep.rosterIndex)}
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
      `<g style="opacity:0;animation:flock-inbound ${animationDuration}s linear 0s 1 both"><text x="14" y="${panelTop + 44}" class="flock-name">FLOCK INBOUND</text><text x="14" y="${panelTop + 58}" class="flock-status">AWAITING DEPLOYMENT</text></g>`,
      `<g style="opacity:0;animation:flock-complete ${animationDuration}s linear 0s 1 both"><use href="#flock-ufo-icon" x="12" y="${panelTop + 34}" width="30" height="30"/><text x="50" y="${panelTop + 46}" class="flock-name">PASTURE CLEAR</text><text x="50" y="${panelTop + 60}" class="flock-status">ALL SHEEP COLLECTED</text></g>`,
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
      return `<text x="14" y="${panelTop + 15}" class="flock-meta" style="opacity:0;animation:${name} ${animationDuration}s linear 0s 1 both"><tspan class="flock-meta-key">Field</tspan><tspan dx="5" class="flock-meta-value">${value}/${flock.fieldCount}</tspan></text>`;
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
    return `<text x="${totalWidth - 14}" y="${panelTop + 15}" text-anchor="end" class="flock-meta" style="opacity:0;animation:${name} ${animationDuration}s linear 0s 1 both"><tspan class="flock-meta-key">Grass</tspan><tspan dx="5" class="flock-meta-value">${value}%</tspan></text>`;
  });

  const panelStyles = `
  .flock-name{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:var(--gm-panel-text)}
  .flock-meta,.flock-label,.flock-status,.flock-slot-index{font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;fill:var(--gm-panel-text)}
  .flock-meta{font-size:9px}.flock-meta-key{opacity:.64;font-weight:500}.flock-meta-value{font-weight:650}.flock-name{font-size:10px;font-weight:650}.flock-label{font-size:6.5px;letter-spacing:.35px;opacity:.62}.flock-status{font-size:7px;font-weight:650;letter-spacing:.35px;fill:var(--gm-level-3)}
  .flock-slot-index{font-weight:650;opacity:.8}
  ${progressStyles.join("\n  ")}
  ${rosterStateStyles.join("\n  ")}
  ${selectedStyles.join("\n  ")}
  ${headerStyles.join("\n  ")}`;

  const panelGroup = `<g class="flock-panel" aria-hidden="true">
    <defs><symbol id="flock-sheep-icon" viewBox="0.5 0 15 12.5">${SHEEP_CONTENT}</symbol><symbol id="flock-ufo-icon" viewBox="${UFO_VIEWBOX}">${UFO_CONTENT}</symbol><symbol id="flock-meter-selected" viewBox="0 0 80 6">${meterSymbolCells(80, 6, 1)}</symbol><symbol id="flock-meter-compact" viewBox="0 0 100 10">${meterSymbolCells(100, 10, 3)}</symbol>${progressClips.join("")}</defs>
    <path class="flock-panel-surface" d="M6 ${panelTop + 0.5}H${panelRight - 6}V${panelTop + 3.5}H${panelRight - 3}V${panelTop + 6.5}H${panelRight}V${panelBottom - 6}H${panelRight - 3}V${panelBottom - 3}H${panelRight - 6}V${panelBottom}H6V${panelBottom - 3}H3V${panelBottom - 6}H.5V${panelTop + 6.5}H3V${panelTop + 3.5}H6Z" fill="var(--gm-panel-bg)" stroke="var(--gm-fence)" stroke-opacity=".78" stroke-width="1" stroke-linejoin="miter"/>
    <path class="flock-panel-divider" d="M9 ${panelTop + 24}H${totalWidth - 9}M192 ${panelTop + 30}V${panelTop + panelHeight - 7}" stroke="var(--gm-fence)" stroke-opacity=".42" stroke-width=".8"/>
    ${fieldLabels.join("")}
    <text x="${totalWidth / 2}" y="${panelTop + 15}" text-anchor="middle" class="flock-meta"><tspan class="flock-meta-key">Flock</tspan><tspan dx="5" class="flock-meta-value">${flock.rosterSize}</tspan></text>
    ${grassLabels.join("")}
    <g class="flock-selected-region">${selectedGroups.join("")}</g>
    <g class="flock-roster-region">${rosterSlots.join("")}</g>
  </g>`;

  return { panelStyles, panelGroup };
}
