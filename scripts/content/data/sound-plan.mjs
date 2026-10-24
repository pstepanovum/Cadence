// How each English articulation target is made: which CC0 drawing it is fitted
// to, which parameters are set by phonetic rule rather than fitted, and the
// features the mouth map shows (place, manner, voicing, airflow, vowel
// quality, highlighted layers, overlays). Phonetic facts in our own words.

/** Commons file names (without "File:") of the Wright/McCloy drawings used. */
export const DRAWINGS = {
  neutral: "Neutral Sagittal Section.svg",
  p: "IPA p Sagittal Section.svg",
  b: "IPA b Sagittal Section.svg",
  m: "IPA m Sagittal Section.svg",
  t: "IPA t Sagittal Section.svg",
  d: "IPA d Sagittal Section.svg",
  n: "IPA n Sagittal Section.svg",
  k: "IPA k Sagittal Section.svg",
  g: "IPA g Sagittal Section.svg",
  ng: "IPA ŋ Sagittal Section.svg",
  f: "IPA F Sagittal Section.svg",
  v: "IPA v Sagittal Section.svg",
  th: "IPA θ Sagittal Section.svg",
  dh: "IPA ð Sagittal Section.svg",
  s: "IPA s̺ apical Sagittal Section.svg",
  z: "IPA z apical Sagittal Section.svg",
  sh: "IPA ʃ laminal Sagittal Section.svg",
  retroflex: "IPA ɽ retroflex Sagittal Section.svg",
  palatal: "IPA ʝ Sagittal Section.svg",
  i: "IPA i Sagittal Section.svg",
  ih: "IPA Ɪ Sagittal Section.svg",
  eh: "IPA Ɛ Sagittal Section.svg",
  ae: "IPA æ Sagittal Section.svg",
  a: "IPA a Sagittal Section.svg",
  u: "IPA u Sagittal Section.svg",
  uh: "IPA Ʊ Sagittal Section.svg",
};

/** The package's demo codebook entries used as published values (Ververidis et al. 2012). */
export const LITERATURE = {
  e: { label: "e", citation: "Ververidis, Schneider and Koehler (2012), The vocal tract LaTeX package, The PracTeX Journal 2012/1: demo codebook, German /e/" },
  o: { label: "o", citation: "Ververidis, Schneider and Koehler (2012), The vocal tract LaTeX package, The PracTeX Journal 2012/1: demo codebook, German /o/" },
};

const VOICED = { glottalAperture: -1, glottalFrequency: 0 };
const VOICELESS = { glottalAperture: -3, glottalFrequency: -3 };
const ORAL = { velum: -3 };
const NASAL = { velum: 0 };

/**
 * One plan per target. `fit` names a drawing; `rules` are parameters set by
 * phonetic rule (rounding, lip closure, voicing, velum), never fitted;
 * `tune` adjusts a fitted shape by hand (the target is then hand-tuned and
 * needs review). Diphthongs and affricates list keyframes instead.
 */
export const PLAN = [
  // Plosives
  { soundId: "sound.p", variant: "both", fit: "p", rules: { lipAperture: -3, ...VOICELESS, ...ORAL }, place: "bilabial", manner: "plosive", voicing: "voiceless", airflow: "central", highlight: ["lips"], overlays: ["plosiveBurst"], anchor: "bilabial" },
  { soundId: "sound.b", variant: "both", fit: "b", rules: { lipAperture: -3, ...VOICED, ...ORAL }, place: "bilabial", manner: "plosive", voicing: "voiced", airflow: "central", highlight: ["lips", "glottis"], overlays: ["plosiveBurst"], anchor: "bilabial" },
  { soundId: "sound.t", variant: "both", fit: "t", rules: { ...VOICELESS, ...ORAL }, place: "alveolar", manner: "plosive", voicing: "voiceless", airflow: "central", highlight: ["tongueTip", "alveolarRidge"], overlays: ["tongueTipContact", "plosiveBurst"], anchor: "alveolar" },
  { soundId: "sound.d", variant: "both", fit: "d", rules: { ...VOICED, ...ORAL }, place: "alveolar", manner: "plosive", voicing: "voiced", airflow: "central", highlight: ["tongueTip", "alveolarRidge", "glottis"], overlays: ["tongueTipContact", "plosiveBurst"], anchor: "alveolar" },
  { soundId: "sound.k", variant: "both", fit: "k", rules: { ...VOICELESS, ...ORAL }, place: "velar", manner: "plosive", voicing: "voiceless", airflow: "central", highlight: ["tongueBody", "velum"], overlays: ["plosiveBurst"], anchor: "velar" },
  { soundId: "sound.g", variant: "both", fit: "g", rules: { ...VOICED, ...ORAL }, place: "velar", manner: "plosive", voicing: "voiced", airflow: "central", highlight: ["tongueBody", "velum", "glottis"], overlays: ["plosiveBurst"], anchor: "velar" },
  // Fricatives
  { soundId: "sound.f", variant: "both", fit: "f", rules: { ...VOICELESS, ...ORAL }, place: "labiodental", manner: "fricative", voicing: "voiceless", airflow: "central", highlight: ["lips", "teeth"], overlays: ["centralAirflow"], anchor: "labiodental" },
  { soundId: "sound.v", variant: "both", fit: "v", rules: { ...VOICED, ...ORAL }, place: "labiodental", manner: "fricative", voicing: "voiced", airflow: "central", highlight: ["lips", "teeth", "glottis"], overlays: ["centralAirflow"], anchor: "labiodental" },
  { soundId: "sound.th", variant: "both", fit: "th", rules: { ...VOICELESS, ...ORAL }, place: "dental", manner: "fricative", voicing: "voiceless", airflow: "central", highlight: ["tongueTip", "teeth"], overlays: ["tongueBetweenTeeth", "centralAirflow"], anchor: "dental" },
  { soundId: "sound.dh", variant: "both", fit: "dh", rules: { ...VOICED, ...ORAL }, place: "dental", manner: "fricative", voicing: "voiced", airflow: "central", highlight: ["tongueTip", "teeth", "glottis"], overlays: ["tongueBetweenTeeth", "centralAirflow"], anchor: "dental" },
  { soundId: "sound.s", variant: "both", fit: "s", rules: { ...VOICELESS, ...ORAL }, place: "alveolar", manner: "fricative", voicing: "voiceless", airflow: "central", highlight: ["tongueTip", "alveolarRidge"], overlays: ["centralAirflow"], anchor: "alveolar" },
  { soundId: "sound.z", variant: "both", fit: "z", rules: { ...VOICED, ...ORAL }, place: "alveolar", manner: "fricative", voicing: "voiced", airflow: "central", highlight: ["tongueTip", "alveolarRidge", "glottis"], overlays: ["centralAirflow"], anchor: "alveolar" },
  { soundId: "sound.sh", variant: "both", fit: "sh", rules: { lipProtrusion: 1, ...VOICELESS, ...ORAL }, place: "postalveolar", manner: "fricative", voicing: "voiceless", airflow: "central", highlight: ["tongueBlade", "alveolarRidge", "lips"], overlays: ["centralAirflow", "lipRounding"], anchor: "postalveolar" },
  // The series has only an apical drawing of the voiced sound; English /ʒ/ is made like /ʃ/, so it is fitted to that drawing.
  { soundId: "sound.zh", variant: "both", fit: "sh", rules: { lipProtrusion: 1, ...VOICED, ...ORAL }, place: "postalveolar", manner: "fricative", voicing: "voiced", airflow: "central", highlight: ["tongueBlade", "alveolarRidge", "lips", "glottis"], overlays: ["centralAirflow", "lipRounding"], anchor: "postalveolar" },
  { soundId: "sound.hh", variant: "both", fit: "neutral", rules: { glottalAperture: -3, glottalFrequency: -3, ...ORAL }, place: "glottal", manner: "fricative", voicing: "voiceless", airflow: "central", highlight: ["glottis"], overlays: ["glottalFriction"], anchor: "glottal" },
  // Affricates: the stop, held, then released into the fricative.
  { soundId: "sound.ch", variant: "both", keyframes: [[0, "sound.t"], [0.3, "sound.t"], [1, "sound.sh"]], rules: { lipProtrusion: 1, ...VOICELESS, ...ORAL }, place: "postalveolar", manner: "affricate", voicing: "voiceless", airflow: "central", highlight: ["tongueBlade", "alveolarRidge", "lips"], overlays: ["tongueTipContact", "centralAirflow", "lipRounding"], anchor: "postalveolar" },
  { soundId: "sound.jh", variant: "both", keyframes: [[0, "sound.d"], [0.3, "sound.d"], [1, "sound.zh"]], rules: { lipProtrusion: 1, ...VOICED, ...ORAL }, place: "postalveolar", manner: "affricate", voicing: "voiced", airflow: "central", highlight: ["tongueBlade", "alveolarRidge", "lips", "glottis"], overlays: ["tongueTipContact", "centralAirflow", "lipRounding"], anchor: "postalveolar" },
  // Nasals
  { soundId: "sound.m", variant: "both", fit: "m", rules: { lipAperture: -3, ...VOICED, ...NASAL }, place: "bilabial", manner: "nasal", voicing: "voiced", airflow: "nasal", highlight: ["lips", "velum", "glottis"], overlays: ["nasalAirflow"], anchor: "bilabial" },
  { soundId: "sound.n", variant: "both", fit: "n", rules: { ...VOICED, ...NASAL }, place: "alveolar", manner: "nasal", voicing: "voiced", airflow: "nasal", highlight: ["tongueTip", "alveolarRidge", "velum", "glottis"], overlays: ["tongueTipContact", "nasalAirflow"], anchor: "alveolar" },
  { soundId: "sound.ng", variant: "both", fit: "ng", rules: { ...VOICED, ...NASAL }, place: "velar", manner: "nasal", voicing: "voiced", airflow: "nasal", highlight: ["tongueBody", "velum", "glottis"], overlays: ["nasalAirflow"], anchor: "velar" },
  // Approximants: the series has no drawing of these, so each starts from the nearest fitted shape and is tuned by hand.
  { soundId: "sound.l", variant: "both", fit: "d", tune: { tongueShape: -0.5, tonguePosition: 0.4 }, rules: { ...VOICED, ...ORAL }, place: "alveolar", manner: "lateral-approximant", voicing: "voiced", airflow: "lateral", highlight: ["tongueTip", "alveolarRidge", "glottis"], overlays: ["tongueTipContact", "lateralAirflow"], anchor: "alveolar" },
  { soundId: "sound.r", variant: "both", fit: "retroflex", tune: { tongueApex: 0.6, jaw: -0.2 }, rules: { lipProtrusion: 1, ...VOICED, ...ORAL }, place: "alveolar", manner: "approximant", voicing: "voiced", airflow: "central", highlight: ["tongueTip", "tongueBody", "lips", "glottis"], overlays: ["bunchedTongue", "lipRounding"], anchor: "postalveolar" },
  { soundId: "sound.w", variant: "both", fit: "u", tune: { lipAperture: -1.5 }, rules: { lipProtrusion: 2, ...VOICED, ...ORAL }, place: "labial-velar", manner: "approximant", voicing: "voiced", airflow: "central", highlight: ["lips", "tongueBody", "glottis"], overlays: ["lipRounding"], anchor: "bilabial" },
  { soundId: "sound.y", variant: "both", fit: "palatal", tune: { tongueShape: -0.3 }, rules: { ...VOICED, ...ORAL }, place: "palatal", manner: "approximant", voicing: "voiced", airflow: "central", highlight: ["tongueBody", "hardPalate", "glottis"], overlays: [], anchor: "palatal" },

  // Monophthongs
  { soundId: "sound.iy", variant: "both", fit: "i", rules: { lipProtrusion: -0.5, ...VOICED, ...ORAL }, vowel: ["close", "front", "unrounded"], voicing: "voiced", airflow: "central", highlight: ["tongueBody", "lips"], overlays: ["lipSpreading"], anchor: "palatal" },
  { soundId: "sound.ih", variant: "both", fit: "ih", rules: { lipProtrusion: -0.3, ...VOICED, ...ORAL }, vowel: ["near-close", "front", "unrounded"], voicing: "voiced", airflow: "central", highlight: ["tongueBody"], overlays: [], anchor: "palatal" },
  { soundId: "sound.eh", variant: "both", fit: "eh", rules: { ...VOICED, ...ORAL }, vowel: ["open-mid", "front", "unrounded"], voicing: "voiced", airflow: "central", highlight: ["tongueBody", "jaw"], overlays: [], anchor: "palatal" },
  { soundId: "sound.ae", variant: "both", fit: "ae", rules: { ...VOICED, ...ORAL }, vowel: ["near-open", "front", "unrounded"], voicing: "voiced", airflow: "central", highlight: ["tongueBody", "jaw"], overlays: [], anchor: "palatal" },
  { soundId: "sound.aa", variant: "both", fit: "a", tune: { tonguePosition: 1.2, tongueShape: 0.3 }, rules: { ...VOICED, ...ORAL }, vowel: ["open", "back", "unrounded"], voicing: "voiced", airflow: "central", highlight: ["tongueRoot", "jaw"], overlays: [], anchor: "uvular" },
  { soundId: "sound.oh", variant: "RP", fit: "a", tune: { tonguePosition: 1.4, tongueShape: 0.4, jaw: 0.2 }, rules: { lipProtrusion: 0.6, ...VOICED, ...ORAL }, vowel: ["open", "back", "rounded"], voicing: "voiced", airflow: "central", highlight: ["tongueRoot", "jaw", "lips"], overlays: ["lipRounding"], anchor: "uvular" },
  { soundId: "sound.ao", variant: "GA", fit: "a", tune: { tonguePosition: 1.5, tongueShape: 0.6, jaw: 0.4 }, rules: { lipProtrusion: 0.5, ...VOICED, ...ORAL }, vowel: ["open-mid", "back", "rounded"], voicing: "voiced", airflow: "central", highlight: ["tongueBody", "lips"], overlays: ["lipRounding"], anchor: "velar" },
  { soundId: "sound.ao", variant: "RP", literature: "o", tune: { jaw: 0.2 }, rules: { lipProtrusion: 1.2, ...VOICED, ...ORAL }, vowel: ["open-mid", "back", "rounded"], voicing: "voiced", airflow: "central", highlight: ["tongueBody", "lips"], overlays: ["lipRounding"], anchor: "velar" },
  { soundId: "sound.uh", variant: "both", fit: "uh", rules: { lipProtrusion: 1, ...VOICED, ...ORAL }, vowel: ["near-close", "back", "rounded"], voicing: "voiced", airflow: "central", highlight: ["tongueBody", "lips"], overlays: ["lipRounding"], anchor: "velar" },
  { soundId: "sound.uw", variant: "both", fit: "u", rules: { lipProtrusion: 1.5, ...VOICED, ...ORAL }, vowel: ["close", "back", "rounded"], voicing: "voiced", airflow: "central", highlight: ["tongueBody", "lips"], overlays: ["lipRounding"], anchor: "velar" },
  { soundId: "sound.ah", variant: "both", fit: "neutral", tune: { jaw: -0.8, tonguePosition: 0.4 }, rules: { ...VOICED, ...ORAL }, vowel: ["open-mid", "central", "unrounded"], voicing: "voiced", airflow: "central", highlight: ["tongueBody", "jaw"], overlays: [], anchor: "velar" },
  { soundId: "sound.ax", variant: "both", fit: "neutral", rules: { ...VOICED, ...ORAL }, vowel: ["mid", "central", "unrounded"], voicing: "voiced", airflow: "central", highlight: ["tongueBody"], overlays: [], anchor: "palatal" },
  { soundId: "sound.er", variant: "GA", fit: "retroflex", tune: { tongueApex: 0.6, jaw: -0.5 }, rules: { lipProtrusion: 0.8, ...VOICED, ...ORAL }, vowel: ["open-mid", "central", "unrounded"], voicing: "voiced", airflow: "central", highlight: ["tongueTip", "tongueBody", "lips"], overlays: ["bunchedTongue"], anchor: "postalveolar" },
  { soundId: "sound.er", variant: "RP", fit: "neutral", tune: { jaw: -0.4, tongueShape: 0.2 }, rules: { ...VOICED, ...ORAL }, vowel: ["open-mid", "central", "unrounded"], voicing: "voiced", airflow: "central", highlight: ["tongueBody"], overlays: [], anchor: "palatal" },
  { soundId: "sound.axr", variant: "GA", fit: "retroflex", tune: { tongueApex: 0.6 }, rules: { lipProtrusion: 0.6, ...VOICED, ...ORAL }, vowel: ["mid", "central", "unrounded"], voicing: "voiced", airflow: "central", highlight: ["tongueTip", "tongueBody"], overlays: ["bunchedTongue"], anchor: "postalveolar" },

  // Diphthongs: start to end.
  { soundId: "sound.ey", variant: "both", keyframes: [[0, "lit:e"], [1, "sound.ih"]], rules: { ...VOICED, ...ORAL }, vowel: ["close-mid", "front", "unrounded"], voicing: "voiced", airflow: "central", highlight: ["tongueBody", "jaw"], overlays: [], anchor: "palatal" },
  { soundId: "sound.ay", variant: "both", keyframes: [[0, "fit:a"], [1, "sound.ih"]], rules: { ...VOICED, ...ORAL }, vowel: ["open", "front", "unrounded"], voicing: "voiced", airflow: "central", highlight: ["tongueBody", "jaw"], overlays: [], anchor: "palatal" },
  { soundId: "sound.oy", variant: "both", keyframes: [[0, "sound.ao:RP"], [1, "sound.ih"]], rules: { ...VOICED, ...ORAL }, vowel: ["open-mid", "back", "rounded"], voicing: "voiced", airflow: "central", highlight: ["tongueBody", "lips"], overlays: ["lipRounding"], anchor: "velar" },
  { soundId: "sound.ow", variant: "GA", keyframes: [[0, "lit:o"], [1, "sound.uh"]], rules: { ...VOICED, ...ORAL }, roundAll: 1, vowel: ["close-mid", "back", "rounded"], voicing: "voiced", airflow: "central", highlight: ["tongueBody", "lips"], overlays: ["lipRounding"], anchor: "velar" },
  { soundId: "sound.ow", variant: "RP", keyframes: [[0, "sound.ax"], [1, "sound.uh"]], rules: { ...VOICED, ...ORAL }, vowel: ["mid", "central", "unrounded"], voicing: "voiced", airflow: "central", highlight: ["tongueBody", "lips"], overlays: ["lipRounding"], anchor: "velar" },
  { soundId: "sound.aw", variant: "both", keyframes: [[0, "fit:a"], [1, "sound.uh"]], rules: { ...VOICED, ...ORAL }, vowel: ["open", "front", "unrounded"], voicing: "voiced", airflow: "central", highlight: ["tongueBody", "jaw", "lips"], overlays: ["lipRounding"], anchor: "velar" },
  { soundId: "sound.ia", variant: "RP", keyframes: [[0, "sound.ih"], [1, "sound.ax"]], rules: { ...VOICED, ...ORAL }, vowel: ["near-close", "front", "unrounded"], voicing: "voiced", airflow: "central", highlight: ["tongueBody"], overlays: [], anchor: "palatal" },
  { soundId: "sound.ea", variant: "RP", keyframes: [[0, "sound.eh"], [1, "sound.ax"]], rules: { ...VOICED, ...ORAL }, vowel: ["open-mid", "front", "unrounded"], voicing: "voiced", airflow: "central", highlight: ["tongueBody", "jaw"], overlays: [], anchor: "palatal" },
  { soundId: "sound.ua", variant: "RP", keyframes: [[0, "sound.uh"], [1, "sound.ax"]], rules: { ...VOICED, ...ORAL }, vowel: ["near-close", "back", "rounded"], voicing: "voiced", airflow: "central", highlight: ["tongueBody", "lips"], overlays: ["lipRounding"], anchor: "velar" },
];
