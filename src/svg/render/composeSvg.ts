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
  @media (prefers-reduced-motion: reduce) {
    .ufo-streak, .ufo-ripple, .signature-reveal, #grass-crumbs { display: none; }
  }
    </style>
  </defs>
  <rect x="0" y="${viewBoxMinY}" width="${totalWidth}" height="${viewBoxHeight}" fill="${backgroundColor}"/>
  ${fenceRects}
  ${rects}
  ${crumbGroup}
  ${sheepGroups}
  ${ufoRippleGroupStr}
  ${ufoGroupStr}
  ${debugLayer}
</svg>`;
}
