/** 시뮬레이션용 양 상태 (위치·경로·목표·먹는 중) */
export type SheepState = {
  pos: [number, number];
  plan: [number, number][];
  goalGrassKey: string | null;
  eatUntil: number;
  stuck: number;
  eatingGrassKey: string | null;
};
