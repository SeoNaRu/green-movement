import "dotenv/config";
import { fetchContributionGrid } from "../github/fetchGrid.js";
import { mapGrid } from "../grid/mapGrid.js";
import { renderGridSvg } from "../renderGridSvg.js";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "..", "assets", "live.svg");
const CIRCLE_JSON_PATH = join(__dirname, "..", "..", "assets", "circle.json");

export async function generateSvg(): Promise<void> {
  const username = process.env.GITHUB_USERNAME?.trim() || undefined;

  console.time("fetch+map");
  const weeks = await fetchContributionGrid(username);
  const grid = mapGrid(weeks);
  console.timeEnd("fetch+map");

  const totalCells = grid.length;
  const grassCells = grid.filter((c) => c.count > 0).length;
  const totalContributions = grid.reduce((sum, c) => sum + c.count, 0);
  console.log("GitHub 잔디:", {
    "총 칸 수": totalCells,
    "기여한 칸(초록 잔디)": grassCells,
    "기여 합계": totalContributions,
  });

  let paintMap: Record<string, string> = {};
  try {
    const raw = readFileSync(CIRCLE_JSON_PATH, "utf-8");
    paintMap = JSON.parse(raw) as Record<string, string>;
  } catch {
    // circle.json 없거나 파싱 실패 시 페인트 없음
  }

  console.time("renderGridSvg");
  const svg = renderGridSvg(grid, { paintMap });
  console.timeEnd("renderGridSvg");
  writeFileSync(OUT_PATH, svg, "utf-8");
  console.log("Written:", OUT_PATH);
}
