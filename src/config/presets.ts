/**
 * 타이밍 프리셋.
 * buildTimeline(..., policy)에 넘길 때 사용.
 * @see timeline/schedules.ts TimingPolicy
 */
export type TimingPresetName = "default" | "fast" | "cinematic";

/** TimingPolicy와 동일한 키 (일부만 지정 가능) */
export type TimingPreset = Partial<{
  sheepCellTime: number;
  ufoEntryS: number;
  ufoExitS: number;
  lightRampS: number;
  sheepFadeS: number;
  dropStayS: number;
  moveStartS: number;
}>;

export const PRESET_DEFAULT: TimingPreset = {};

/** 짧게: 양·UFO 모두 빠르게 */
export const PRESET_FAST: TimingPreset = {
  sheepCellTime: 0.35,
  ufoEntryS: 1.0,
  ufoExitS: 1.2,
  lightRampS: 0.05,
  sheepFadeS: 0.15,
  dropStayS: 0.15,
};

/** 길게: 진입·퇴장 여유 */
export const PRESET_CINEMATIC: TimingPreset = {
  sheepCellTime: 0.6,
  ufoEntryS: 2.0,
  ufoExitS: 2.5,
  lightRampS: 0.12,
  sheepFadeS: 0.3,
  dropStayS: 0.35,
};

export const PRESETS: Record<TimingPresetName, TimingPreset> = {
  default: PRESET_DEFAULT,
  fast: PRESET_FAST,
  cinematic: PRESET_CINEMATIC,
};
