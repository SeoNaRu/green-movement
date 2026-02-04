import "dotenv/config";
import { fetchContributionGrid } from "./github/fetchGrid.js";
import { mapGrid } from "./grid/mapGrid.js";
import { renderGridSvg } from "./svg/renderGridSvg.js";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "assets", "live.svg");

const username = process.env.GITHUB_USERNAME?.trim() || undefined;

const weeks = await fetchContributionGrid(username);
const grid = mapGrid(weeks);

// 잔디 통계: 그리드 칸 수, 기여 있는 칸 수(초록), 기여 합계
const totalCells = grid.length;
const grassCells = grid.filter((c) => c.count > 0).length;
const totalContributions = grid.reduce((sum, c) => sum + c.count, 0);
console.log("GitHub 잔디:", {
  "총 칸 수": totalCells,
  "기여한 칸(초록 잔디)": grassCells,
  "기여 합계": totalContributions,
});

const svg = renderGridSvg(grid);
writeFileSync(OUT_PATH, svg, "utf-8");
console.log("Written:", OUT_PATH);
