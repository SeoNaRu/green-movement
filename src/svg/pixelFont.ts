import { readFileSync } from "node:fs";

const galmuri7 = readFileSync(
  new URL("../../assets/fonts/Galmuri7.woff2", import.meta.url),
).toString("base64");

export const PIXEL_FONT_CSS = `@font-face{font-family:GMPixel;src:url(data:font/woff2;base64,${galmuri7}) format("woff2");font-style:normal;font-weight:400;font-display:block}`;
