import { fetchContributionGrid } from "../github/fetchGrid.js";
import { mapGrid } from "../grid/mapGrid.js";
import { renderGridSvg } from "../svg/renderGridSvg.js";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "..", "assets", "live.svg");

export async function generateSvg(): Promise<void> {
  const username =
    process.env.GITHUB_USERNAME?.trim() ||
    process.env.GITHUB_REPOSITORY_OWNER?.trim() ||
    process.env.GITHUB_ACTOR?.trim() ||
    undefined;

  const weeks = await fetchContributionGrid(username);
  const grid = mapGrid(weeks);

  const svg = renderGridSvg(grid, { signatureText: username });
  writeFileSync(OUT_PATH, svg, "utf-8");
}
