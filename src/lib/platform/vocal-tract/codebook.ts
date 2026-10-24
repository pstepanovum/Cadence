// FILE: src/lib/platform/vocal-tract/codebook.ts
//
// The package's own demo codebook: parameter vectors for 26 German phonemes,
// copied from VocalTract.sty (array SpeakVec) and vtQueryVisual.m. They are the
// reference the port is tested against and a starting point for fitting
// English targets; they are not English targets themselves. English targets
// live in content/articulation/*.json.
//
// From the VocalTract LaTeX package by Dimitrios Ververidis (CTAN
// pkg/vocaltract; Ververidis, Schneider and Koehler, "The vocal tract LaTeX
// package", The PracTeX Journal, 2012, no. 1). Apache License 2.0 per the
// package README; LPPL per the VocalTract.sty header. See NOTICE and CREDITS.md.
//
// Twin: mobile/src/platform/vocal-tract/codebook.ts, byte-identical below this
// header, checked by tests/platform/drift.test.ts.

/**
 * One codebook entry: the package's 1-based index, its SAMPA-style label, the
 * IPA symbol it stands for, and the ten controls in package order
 * (JW TP TS TA LA LP LH GA FX NS).
 */
export interface CodebookEntry {
  index: number;
  label: string;
  ipa: string;
  vector: readonly number[];
}

export const GERMAN_DEMO_CODEBOOK: readonly CodebookEntry[] = [
  { index: 1, label: "i", ipa: "i", vector: [0.5, -2, 1, -2, 1, -1, 0, 0, 0, 0] },
  { index: 2, label: "y", ipa: "y", vector: [0.5, -2, 1, -2, 0, 2, 0, 0, 0, 0] },
  { index: 3, label: "e", ipa: "e", vector: [-1, -1, 1, -2, 1, -0.5, 0, 0, 0, 0] },
  { index: 4, label: "2", ipa: "ø", vector: [-1, -1, 1, -2, 0, 2, 0, 0, 0, 0] },
  { index: 5, label: "E", ipa: "ɛ", vector: [-1.5, 2.5, 0, -0.5, 0, 2, 0, 0, 0, 0] },
  { index: 6, label: "@", ipa: "ə", vector: [-1.5, 1.5, 0, 0.5, 0.5, -0.5, 0, 0, 0, 0] },
  { index: 7, label: "a", ipa: "a", vector: [-1.5, 2.5, 0, -0.5, 0.5, -0.5, 0, 0, 0, 0] },
  { index: 8, label: "u", ipa: "u", vector: [0.5, 2, 1.5, -2, -1, 1.5, 0, 0, 0, 0] },
  { index: 9, label: "o", ipa: "o", vector: [-0.4, 3, 1.5, 0, -0.3, 0, 0, 0, 0, 0] },
  { index: 10, label: "p", ipa: "p", vector: [0, 0, 0, 0, -3, 0, 0, -3, -3, -3] },
  { index: 11, label: "t", ipa: "t", vector: [0, -0.5, -1, 2.3, 0, 0, 0, -3, -3, -3] },
  { index: 12, label: "k", ipa: "k", vector: [0, -1.5, 3, -3, 0, 0, 0, -3, -3, -3] },
  { index: 13, label: "f", ipa: "f", vector: [2, 1, 0, 0, -1.5, -2, 0, -3, -3, -3] },
  { index: 14, label: "s", ipa: "s", vector: [2.5, 0, 0, 0.4, 0, 0, 0, -3, -3, -3] },
  { index: 15, label: "x", ipa: "x", vector: [0, -1, 3, -3, 0, 0, 0, -3, -3, -3] },
  { index: 16, label: "b", ipa: "b", vector: [0, 0, 0, 0, -3, 0, -1, -1, 0, -3] },
  { index: 17, label: "d", ipa: "d", vector: [0, -0.5, -1, 2.3, 0, 0, 0, -1, 0, -3] },
  { index: 18, label: "g", ipa: "ɡ", vector: [0, -1.5, 3, -3, 0, 0, 0, -1, 0, -3] },
  { index: 19, label: "r", ipa: "r", vector: [1, 0, 0, 3, 0, 0, 0, -1, 0, 0] },
  { index: 20, label: "l", ipa: "l", vector: [0, -2, 3, 3, 0, 0, 0, -1, 0, 0] },
  { index: 21, label: "R", ipa: "ʁ", vector: [0, 2.3, 2.5, -2, 0, 0, 0, -1, 0, 0] },
  { index: 22, label: "j", ipa: "j", vector: [1, 0, 2, 0, 0, 0, 0, -1, 0, 0] },
  { index: 23, label: "v", ipa: "v", vector: [2, 1, 0, 0, -1.5, -2, 0, -1, 0, 0] },
  { index: 24, label: "z", ipa: "z", vector: [2.5, 0, 0, 0.4, 0, 0, 0, -1, 0, 0] },
  { index: 25, label: "m", ipa: "m", vector: [0, 0, 0, 0, -3, -1, 0, -1, 0, 0] },
  { index: 26, label: "n", ipa: "n", vector: [0.5, 0, 0, 3, 0, 0, 0, -1, 0, 0] },
];
