export function composeSvg(params: {
  totalWidth: number;
  totalHeight: number;
  viewBoxMinY: number;
  viewBoxHeight: number;
  backgroundColor: string;
  fenceRects: string;
  rects: string;
  flowerRects: string;
  flowerKeyframes: string;
  sheepGroups: string;
  ufoGroupStr: string;
  ufoRippleKeyframesStr: string;
  ufoRippleGroupStr: string;
  debugLayer: string;
  dotRects: string;
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
    backgroundColor,
    fenceRects,
    rects,
    flowerRects,
    flowerKeyframes,
    sheepGroups,
    ufoGroupStr,
    ufoRippleKeyframesStr,
    ufoRippleGroupStr,
    debugLayer,
    dotRects,
    grassFadeKeyframes,
    animationStyles,
    ufoKeyframesStr,
    ufoLightKeyframesStr,
  } = params;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 ${viewBoxMinY} ${totalWidth} ${viewBoxHeight}">
  <defs>
    <style>
  ${grassFadeKeyframes}
  ${flowerKeyframes}
  ${animationStyles}
  ${ufoKeyframesStr}
  ${ufoLightKeyframesStr}
  ${ufoRippleKeyframesStr}
    </style>
  </defs>
  <rect x="0" y="${viewBoxMinY}" width="${totalWidth}" height="${viewBoxHeight}" fill="${backgroundColor}"/>
  ${fenceRects}
  ${rects}
  <g id="flower-layer">${flowerRects}</g>
  ${sheepGroups}
  ${ufoRippleGroupStr}
  ${ufoGroupStr}
  ${debugLayer}
  ${dotRects}
</svg>`;
}
