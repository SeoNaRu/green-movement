# Frozen visual benchmark v1

Generate the representative, credential-free SVG with `npm run visual:fixture`, then inspect `dist/visual-fixture.svg` at 700px on `#0d1117`.

Score each dimension from 0 to 4. A candidate passes at 16/20 or better with no dimension below 3.

| Dimension | 0–1 | 2 | 3–4 |
| --- | --- | --- | --- |
| Motion hierarchy | Competing motion; no clear subject | Main action is readable but effects compete | One clear hero action; secondary motion supports it |
| Character acting | Objects only translate/rotate | Some anticipation or reaction | Walk, eat, land, and pickup each have convincing anticipation and follow-through |
| Pacing and easing | Mechanical linear motion | Mixed rhythm with abrupt segments | Deliberate acceleration, holds, impacts, and recovery |
| Visual cohesion | Mixed asset languages | Mostly related but inconsistent detail | One miniature-pasture language across sheep, UFO, fence, cells, and restrained grass reactions |
| README readability | Details disappear or clutter at 700px | Core action survives | Silhouette and important reactions remain clear without visual noise |

Baseline before the motion-polish pass: 8/20 — hierarchy 2, acting 1, pacing 1, cohesion 2, readability 2. Mechanical checks pass; this score is the frozen comparison, not a release claim.

Guardrails: `npm run check` passes, no credentials or network are required, the fixture contains no invalid SVG values, and generated SVG size does not grow by more than 15% without a measured visual benefit.
