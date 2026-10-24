// FILE: mobile/src/platform/vocal-tract/index.ts
//
// The mouth map's model: Cadence's TypeScript port of the VocalTract LaTeX
// package by Dimitrios Ververidis (CTAN pkg/vocaltract; D. Ververidis,
// D. Schneider and J. Koehler, "The vocal tract LaTeX package", The PracTeX
// Journal, 2012, no. 1), built on Maeda's articulatory model. Apache License
// 2.0 per the package README; LPPL per the VocalTract.sty header. Modified,
// translated version. See NOTICE and CREDITS.md.
//
// Typical use: computeVocalTract(params) -> buildShape(state) ->
// subpathToSvg(shape.fills.tongue, createViewport(HEAD_VIEW_BOX, width)).
//
// Twin: src/lib/platform/vocal-tract/index.ts, byte-identical below this
// header, checked by tests/platform/drift.test.ts.

/**
 * Re-exports the whole vocal-tract module.
 */
export * from "./maeda.ts";
export * from "./geometry.ts";
export * from "./svg-path.ts";
export * from "./animate.ts";
export * from "./fit.ts";
export * from "./codebook.ts";
export * from "./articulation.ts";
