import { CELL_SIZE, GAP } from "../constants.js";

export type FlowerSpot = {
  col: number;
  row: number;
  appearTime: number;
  color: string;
};

/** 셀(10x10) 외곽 제외 내부(1~8)에서 완전 랜덤 위치. */
function randomPosInCell(): { x: number; y: number } {
  const x = 1 + Math.random() * 8;
  const y = 1 + Math.random() * 8;
  return { x, y };
}

/** 꽃 한 송이당 0.5~1.5px 크기. 완전 랜덤. */
function randomFlowerSize(): number {
  return 0.7 + Math.random() * 0.6;
}

/**
 * 양이 밟은 빈 칸에 피어나는 1x1 꽃 레이어.
 * 두 송이씩 셀 내부(외곽 제외)에 랜덤 배치.
 */
export function buildFlowerLayer(params: {
  flowers: FlowerSpot[];
  gridLeftX: number;
  gridTopY: number;
  maxTotalTime: number;
}): { flowerRects: string; flowerKeyframes: string } {
  const { flowers, gridLeftX, gridTopY, maxTotalTime } = params;
  const keyframes: string[] = [];
  const rects: string[] = [];
  let globalIndex = 0;

  const byCell = new Map<string, FlowerSpot[]>();
  for (const f of flowers) {
    const key = `${f.col},${f.row}`;
    const arr = byCell.get(key) ?? [];
    arr.push(f);
    byCell.set(key, arr);
  }

  byCell.forEach((list) => {
    const { col, row } = list[0];
    const cellLeft = gridLeftX + col * (CELL_SIZE + GAP);
    const cellTop = gridTopY + row * (CELL_SIZE + GAP);
    // 같은 appearTime·color 연속 = 한 번 밟을 때 난 꽃 묶음(1~4송이)
    let k = 0;
    let groupIndex = 0;
    while (k < list.length) {
      const { appearTime, color } = list[k];
      let groupLen = 1;
      while (
        k + groupLen < list.length &&
        list[k + groupLen].appearTime === appearTime &&
        list[k + groupLen].color === color
      ) {
        groupLen++;
      }
      const TWINKLE_SETTLE_S = 0.5;
      const OPACITY_RAMP_S = 0.05;

      for (let n = 0; n < groupLen; n++) {
        const stagger =
          groupLen > 1 && n === groupLen - 1 ? 0.05 + Math.random() * 0.05 : 0;
        const tAppear = appearTime + stagger;
        const pct = maxTotalTime > 0 ? (tAppear / maxTotalTime) * 100 : 0;
        const p0 = Math.max(0, Math.min(100, pct));
        const p1 = Math.max(0, Math.min(100, pct + 0.0001));
        const p1b = Math.max(
          p1,
          Math.min(100, pct + (OPACITY_RAMP_S / maxTotalTime) * 100),
        );
        const p2 = Math.max(
          p1,
          Math.min(100, pct + (TWINKLE_SETTLE_S / maxTotalTime) * 100),
        );
        const name = `flower-${globalIndex}`;
        keyframes.push(`
  @keyframes ${name} {
    0% { opacity: 0; visibility: hidden; transform: scale(0) rotate(-10deg); }
    ${p0.toFixed(4)}% { opacity: 0; visibility: hidden; transform: scale(0) rotate(-10deg); }
    ${p1.toFixed(4)}% { opacity: 0.8; visibility: visible; transform: scale(1.2) rotate(-10deg); }
    ${p1b.toFixed(4)}% { opacity: 1; visibility: visible; transform: scale(1.2) rotate(-10deg); }
    ${p2.toFixed(4)}% { opacity: 1; visibility: visible; transform: scale(1) rotate(0deg); }
    100% { opacity: 1; visibility: visible; transform: scale(1) rotate(0deg); }
  }`);
        const pos = randomPosInCell();
        const size = randomFlowerSize();
        const x = cellLeft + pos.x;
        const y = cellTop + pos.y;
        rects.push(
          `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${color}" style="opacity:0; visibility:hidden; transform-box: fill-box; transform-origin: center; animation: ${name} ${maxTotalTime}s linear 0s 1 both"/>`,
        );
        globalIndex++;
      }
      groupIndex++;
      k += groupLen;
    }
  });

  return {
    flowerRects: rects.join("\n  "),
    flowerKeyframes: keyframes.join(""),
  };
}
