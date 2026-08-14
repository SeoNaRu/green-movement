import { fetchContributionGrid } from "../github/fetchGrid.js";
import { mapGrid } from "../grid/mapGrid.js";
import { renderGridSvg } from "../svg/renderGridSvg.js";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = join(__dirname, "..", "..", "assets");

export function withSvgTheme(svg: string, theme: "light" | "dark"): string {
  const themed = svg.replace("<svg xmlns=", `<svg data-theme="${theme}" xmlns=`);
  if (themed === svg) throw new Error("SVG root is missing");
  return themed;
}

export async function generateSvg(): Promise<void> {
  const username =
    process.env.GITHUB_USERNAME?.trim() ||
    process.env.GITHUB_REPOSITORY_OWNER?.trim() ||
    process.env.GITHUB_ACTOR?.trim() ||
    undefined;

  const weeks = await fetchContributionGrid(username);
  const grid = mapGrid(weeks);

  const svg = renderGridSvg(grid, { signatureText: username });
  writeFileSync(join(ASSET_DIR, "live.svg"), svg, "utf-8");
  writeFileSync(join(ASSET_DIR, "live-light.svg"), withSvgTheme(svg, "light"), "utf-8");
  writeFileSync(join(ASSET_DIR, "live-dark.svg"), withSvgTheme(svg, "dark"), "utf-8");
}
