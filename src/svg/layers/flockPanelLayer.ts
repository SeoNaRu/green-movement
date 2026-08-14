import type { TimelineResult } from "../../timeline/types.js";
import { SHEEP_CONTENT } from "../constants.js";

type PanelFlock = TimelineResult["flock"];

const pctAt = (time: number, total: number) =>
  Math.min(100, Math.max(0, total > 0 ? (time * 100) / total : 0));

function visibilityKeyframes(
  name: string,
  intervals: { start: number; end: number }[],
  total: number,
): string {
  const frames = [{ time: 0, opacity: 0 }, { time: total, opacity: 0 }];
  for (const interval of intervals) {
    frames.push(
      { time: Math.max(0, interval.start - 0.001), opacity: 0 },
      { time: interval.start, opacity: 1 },
      { time: Math.max(interval.start, interval.end - 0.001), opacity: 1 },
      { time: interval.end, opacity: 0 },
    );
  }
  frames.sort((a, b) => a.time - b.time || a.opacity - b.opacity);
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
  const panelHeight = 78;
  const leftWidth = 181;
  const rosterLeft = leftWidth + 11;
  const rosterWidth = totalWidth - rosterLeft - 11;
  const columns = Math.max(1, Math.ceil(flock.rosterSize / 2));
  const slotPitch = Math.min(33, rosterWidth / columns);
  const rosterStart = rosterLeft + (rosterWidth - slotPitch * columns) / 2;
  const slotWidth = Math.min(27, Math.max(10, slotPitch - 3));

  const selectionEvents: { atS: number; rosterIndex: number; status: string }[] = [];
  for (const sheep of flock.sheep.slice(0, flock.fieldCount)) {
    selectionEvents.push({
      atS: sheep.spawnAbsS,
      rosterIndex: sheep.rosterIndex,
      status: "DEPLOYING",
    });
    selectionEvents.push({
      atS: sheep.spawnAbsS + 0.18,
      rosterIndex: sheep.rosterIndex,
      status: "GRAZING",
    });
  }
  for (const sheep of flock.sheep) {
    if (sheep.rosterIndex >= flock.fieldCount) {
      selectionEvents.push({
        atS: sheep.spawnAbsS,
        rosterIndex: sheep.rosterIndex,
        status: "DEPLOYING",
      });
      selectionEvents.push({
        atS: sheep.spawnAbsS + 0.18,
        rosterIndex: sheep.rosterIndex,
        status: "GRAZING",
      });
    }
    if (sheep.pickupAbsS != null) {
      selectionEvents.push({
        atS: sheep.pickupAbsS,
        rosterIndex: sheep.rosterIndex,
        status: "EXTRACTING",
      });
    }
  }
  selectionEvents.sort(
    (a, b) => a.atS - b.atS || a.rosterIndex - b.rosterIndex,
  );
  const selectedIntervals = new Map<
    number,
    { start: number; end: number; status: string }[]
  >();
  for (let index = 0; index < selectionEvents.length; index++) {
    const event = selectionEvents[index];
    const end = selectionEvents[index + 1]?.atS ?? maxTotalTime;
    const list = selectedIntervals.get(event.rosterIndex) ?? [];
    list.push({ start: event.atS, end, status: event.status });
    selectedIntervals.set(event.rosterIndex, list);
  }

  const progressStyles: string[] = [];
  const rosterSlots = flock.sheep.map((sheep, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = rosterStart + column * slotPitch + (slotPitch - slotWidth) / 2;
    const y = panelTop + 27 + row * 25;
    const label = String(sheep.rosterIndex + 1).padStart(2, "0");
    const labelSize = Math.max(
      4.2,
      Math.min(8, (slotWidth - 2) / (label.length * 0.62)),
    );
    const progressFrames = [
      `0% { transform:scaleX(0); }`,
      `${pctAt(sheep.spawnAbsS, maxTotalTime).toFixed(4)}% { transform:scaleX(0); }`,
      ...sheep.bites.map(
        (bite) =>
          `${pctAt(bite.atS + 0.23, maxTotalTime).toFixed(4)}% { transform:scaleX(${bite.progress.toFixed(3)}); }`,
      ),
      `100% { transform:scaleX(${(sheep.bites.at(-1)?.progress ?? 0).toFixed(3)}); }`,
    ];
    progressStyles.push(
      `@keyframes flock-fill-${index} { ${progressFrames.join(" ")} }`,
    );
    return `<g class="flock-slot flock-slot-${index}">
      <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${slotWidth.toFixed(2)}" height="21" rx="2.5" fill="var(--gm-panel-slot)" stroke="var(--gm-panel-line)" stroke-width=".45" opacity=".92"/>
      <text x="${(x + slotWidth / 2).toFixed(2)}" y="${(y + 12).toFixed(2)}" text-anchor="middle" class="flock-slot-index" font-size="${labelSize.toFixed(2)}">${label}</text>
      <rect x="${(x + 2).toFixed(2)}" y="${(y + 17).toFixed(2)}" width="${Math.max(1, slotWidth - 4).toFixed(2)}" height="2.8" rx="1.4" fill="var(--gm-panel-track)"/>
      <rect x="${(x + 2).toFixed(2)}" y="${(y + 17).toFixed(2)}" width="${Math.max(1, slotWidth - 4).toFixed(2)}" height="2.8" rx="1.4" fill="var(--gm-level-4)" style="transform-box:fill-box;transform-origin:left;animation:flock-fill-${index} ${maxTotalTime}s linear 0s 1 both"/>
      <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${slotWidth.toFixed(2)}" height="21" rx="2.5" fill="none" stroke="var(--gm-level-3)" stroke-width="1.2" style="opacity:0;animation:flock-selected-${sheep.rosterIndex} ${maxTotalTime}s linear 0s 1 both"/>
    </g>`;
  });

  const selectedStyles: string[] = [];
  const selectedGroups: string[] = [];
  for (const sheep of flock.sheep) {
    const intervals = selectedIntervals.get(sheep.rosterIndex) ?? [];
    if (intervals.length === 0) continue;
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
        `<text x="70" y="${panelTop + 66}" class="flock-status" style="opacity:0;animation:${name} ${maxTotalTime}s linear 0s 1 both">${interval.status}</text>`,
      );
    }
    selectedGroups.push(`<g style="opacity:0;animation:flock-selected-${sheep.rosterIndex} ${maxTotalTime}s linear 0s 1 both">
      <path d="M14 ${panelTop + 27}H56L61 ${panelTop + 32}V${panelTop + 68}H14L9 ${panelTop + 63}V${panelTop + 32}Z" fill="var(--gm-panel-slot)" stroke="var(--gm-panel-line)" stroke-width=".8"/>
      <path d="M13 ${panelTop + 31}V${panelTop + 64}" stroke="var(--gm-level-3)" stroke-width="2" opacity=".72"/>
      <use href="#flock-sheep-icon" x="21" y="${panelTop + 38}" width="28" height="23"/>
      <text x="70" y="${panelTop + 39}" class="flock-name">SHEEP ${String(sheep.rosterIndex + 1).padStart(2, "0")}</text>
      <text x="70" y="${panelTop + 53}" class="flock-label">FULLNESS</text>
      <rect x="111" y="${panelTop + 46}" width="55" height="8" rx="2" fill="var(--gm-panel-track)"/>
      <rect x="111" y="${panelTop + 46}" width="55" height="8" rx="2" fill="var(--gm-level-4)" style="transform-box:fill-box;transform-origin:left;animation:flock-fill-${sheep.rosterIndex} ${maxTotalTime}s linear 0s 1 both"/>
    </g>`);
  }

  const fieldDeltas: { atS: number; delta: number }[] = [];
  for (const sheep of flock.sheep.slice(0, flock.fieldCount)) {
    fieldDeltas.push({ atS: sheep.spawnAbsS + 0.18, delta: 1 });
  }
  for (const sheep of flock.sheep) {
    if (sheep.rosterIndex >= flock.fieldCount) {
      fieldDeltas.push({ atS: sheep.spawnAbsS + 0.18, delta: 1 });
    }
    if (sheep.pickupAbsS != null) {
      fieldDeltas.push({ atS: sheep.pickupAbsS, delta: -1 });
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
      return `<text x="14" y="${panelTop + 15}" class="flock-meta" style="opacity:0;animation:${name} ${maxTotalTime}s linear 0s 1 both"><tspan class="flock-meta-key">FIELD</tspan><tspan dx="5" class="flock-meta-value">${value}/${flock.fieldCount}</tspan></text>`;
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
    return `<text x="${totalWidth - 14}" y="${panelTop + 15}" text-anchor="end" class="flock-meta" style="opacity:0;animation:${name} ${maxTotalTime}s linear 0s 1 both"><tspan class="flock-meta-key">GRASS</tspan><tspan dx="5" class="flock-meta-value">${value}%</tspan></text>`;
  });

  const panelStyles = `
  .flock-meta,.flock-name,.flock-label,.flock-status,.flock-slot-index{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:var(--gm-panel-text)}
  .flock-meta{font-size:8.5px;letter-spacing:.7px}.flock-meta-key{opacity:.62;font-weight:600}.flock-meta-value{font-weight:800;letter-spacing:.2px}
  .flock-name{font-size:10.5px;font-weight:750;letter-spacing:.25px}.flock-label{font-size:6.5px;letter-spacing:.45px;opacity:.68}.flock-status{font-size:7px;font-weight:700;letter-spacing:.55px;fill:var(--gm-level-3)}
  .flock-slot-index{font-weight:750;letter-spacing:.15px;opacity:.82}
  ${progressStyles.join("\n  ")}
  ${selectedStyles.join("\n  ")}
  ${headerStyles.join("\n  ")}`;

  const panelGroup = `<g class="flock-panel" aria-hidden="true">
    <defs><symbol id="flock-sheep-icon" viewBox="0.5 0 15 12.5">${SHEEP_CONTENT}</symbol></defs>
    <path d="M6 ${panelTop}H${totalWidth - 6}L${totalWidth} ${panelTop + 6}V${panelTop + panelHeight - 6}L${totalWidth - 6} ${panelTop + panelHeight}H6L0 ${panelTop + panelHeight - 6}V${panelTop + 6}Z" fill="var(--gm-panel-bg)" stroke="var(--gm-panel-line)" stroke-width="1"/>
    <rect class="flock-selected-section" x="8" y="${panelTop + 26}" width="174" height="47" rx="3" fill="var(--gm-panel-section)" stroke="var(--gm-panel-line)" stroke-width=".8"/>
    <rect class="flock-roster-section" x="188" y="${panelTop + 26}" width="${totalWidth - 196}" height="47" rx="3" fill="var(--gm-panel-section)" stroke="var(--gm-panel-line)" stroke-width=".8"/>
    <path d="M9 ${panelTop + 22}H${totalWidth - 9}M185 ${panelTop + 6}V${panelTop + panelHeight - 6}" stroke="var(--gm-panel-line)" stroke-width=".9" opacity=".82"/>
    ${fieldLabels.join("")}
    <text x="${totalWidth / 2}" y="${panelTop + 15}" text-anchor="middle" class="flock-meta"><tspan class="flock-meta-key">FLOCK</tspan><tspan dx="5" class="flock-meta-value">${flock.rosterSize}</tspan></text>
    ${grassLabels.join("")}
    ${selectedGroups.join("")}
    ${rosterSlots.join("")}
  </g>`;

  return { panelStyles, panelGroup };
}
