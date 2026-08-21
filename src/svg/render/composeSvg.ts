import { GITHUB_THEME_CSS } from "../constants.js";

export function composeSvg(params: {
  totalWidth: number;
  totalHeight: number;
  viewBoxMinY: number;
  viewBoxHeight: number;
  /** 출력 SVG의 width. 없으면 totalWidth 사용 */
  displayWidth?: number;
  /** 출력 SVG의 height. 없으면 totalHeight 사용 (displayWidth 있으면 비율에 맞춤) */
  displayHeight?: number;
  backgroundColor: string;
  fenceRects: string;
  rects: string;
  crumbKeyframes: string;
  crumbGroup: string;
  sheepGroups: string;
  ufoGroupStr: string;
  ufoRippleKeyframesStr: string;
  ufoRippleGroupStr: string;
  debugLayer: string;
  grassFadeKeyframes: string;
  animationStyles: string;
  ufoKeyframesStr: string;
  ufoLightKeyframesStr: string;
  panelStyles: string;
  panelGroup: string;
  panelForeground: string;
}): string {
  const {
    totalWidth,
    totalHeight,
    viewBoxMinY,
    viewBoxHeight,
    displayWidth = totalWidth,
    displayHeight = totalHeight,
    backgroundColor,
    fenceRects,
    rects,
    crumbKeyframes,
    crumbGroup,
    sheepGroups,
    ufoGroupStr,
    ufoRippleKeyframesStr,
    ufoRippleGroupStr,
    debugLayer,
    grassFadeKeyframes,
    animationStyles,
    ufoKeyframesStr,
    ufoLightKeyframesStr,
    panelStyles,
    panelGroup,
    panelForeground,
  } = params;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${displayWidth}" height="${displayHeight}" viewBox="0 ${viewBoxMinY} ${totalWidth} ${viewBoxHeight}">
  <defs>
    <style>
  ${GITHUB_THEME_CSS}
  ${grassFadeKeyframes}
  ${crumbKeyframes}
  ${animationStyles}
  ${ufoKeyframesStr}
  ${ufoLightKeyframesStr}
  ${ufoRippleKeyframesStr}
  ${panelStyles}
  @media (prefers-reduced-motion: reduce) {
    .ufo-streak, .ufo-ripple, .signature-reveal, #grass-crumbs, .flock-meter-pulse, .flock-map-pulse { display: none; }
    .flock-camera-live, .flock-inventory-motion, .flock-inventory-shift, .flock-inventory-opening-shift, .flock-inventory-refill, .flock-inventory-core, .flock-inventory-gate, .flock-inventory-board-body, .flock-inventory-board-tag, .flock-inventory-dock-activity { animation-timing-function: step-end !important; }
    .flock-inventory-dock-motion { animation-timing-function: step-start !important; }
  }
  @media (max-width: 480px) {
    .flock-meta-key, .flock-meta-value { font-size: 9px; }
    .flock-name, .flock-status, .flock-label, .flock-energy { font-size: 10px; }
    .flock-meta-key { opacity: .82; }
    .flock-inventory-pen, .flock-inventory-gate { stroke-width: 1.2; }
    .flock-inventory-tag { stroke-width: .6; }
    .flock-map-focus { stroke-width: 1.8; }
    .flock-map-footprint { fill-opacity: .58; }
    .ufo-ripple, #grass-crumbs, .flock-map-pulse { display: none; }
  }
    </style>
  </defs>
  <rect x="0" y="${viewBoxMinY}" width="${totalWidth}" height="${viewBoxHeight}" fill="${backgroundColor}"/>
  ${fenceRects}
  <g id="pasture-live-scene">${rects}${crumbGroup}</g>
  ${sheepGroups}
  ${ufoRippleGroupStr}
  ${panelGroup}
  ${ufoGroupStr}
  ${panelForeground}
  ${debugLayer}
</svg>`.replace(/[ \t]+$/gm, "");
}
