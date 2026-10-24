#!/usr/bin/env node
// Fits the English articulation targets for the mouth map.
//
//   node scripts/content/fit-articulation.mjs
//
// 1. Confirms through the Wikimedia Commons API that each reference drawing
//    (Richard Wright and Dan McCloy's "IPA … Sagittal Section.svg" series) is
//    CC0, and downloads it into scripts/content/.cache/commons (gitignored).
// 2. Traces each drawing into the vocal-tract model's coordinates
//    (lib/articulation-trace.mjs) and fits Maeda's parameters to it with
//    fitParams from src/lib/platform/vocal-tract.
// 3. Builds every target in data/sound-plan.mjs and writes
//    content/articulation/{consonants,vowels,diphthongs}.json plus
//    references.json (the traced points and fit of each drawing, which the
//    tests use to check the fit without the downloads).
//
// Prints the targets that were tuned by hand (needsReview).

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE_DIR, CONTENT_DIR } from "./lib/paths.mjs";
import { calibrate, targetsFor } from "./lib/articulation-trace.mjs";
import { DRAWINGS, LITERATURE, PLAN } from "./data/sound-plan.mjs";
import {
  ARTICULATORY_KEYS,
  GERMAN_DEMO_CODEBOOK,
  NEUTRAL_PARAMS,
  PARAM_KEYS,
  computeVocalTract,
  fitParams,
  paramsFromVector,
  soundById,
  validateArticulationTarget,
} from "../../src/lib/platform/vocal-tract/index.ts";

const COMMONS_DIR = join(CACHE_DIR, "commons");
const UA = "CadenceContentPipeline/1.0 (https://cadence.pstepanov.dev)";
const REGULARIZATION = 0.002;
const WEIGHTS = { lipDownIn: 3 };
export const ROUND = (n) => Math.round(n * 1000) / 1000 + 0;

async function commonsInfo(titles) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "url|extmetadata|sha1",
    iiextmetadatafilter: "LicenseShortName|License|Artist",
    titles: titles.map((t) => `File:${t}`).join("|"),
  }).toString();
  const response = await fetch(url, { headers: { "user-agent": UA } });
  if (!response.ok) throw new Error(`Commons API ${response.status}`);
  const json = await response.json();
  const normalized = new Map((json.query.normalized ?? []).map((n) => [n.to, n.from]));
  const out = new Map();
  for (const page of json.query.pages) {
    const info = page.imageinfo?.[0];
    const title = (normalized.get(page.title) ?? page.title).replace(/^File:/, "");
    if (!info) throw new Error(`${title}: not found on Commons`);
    const meta = info.extmetadata ?? {};
    out.set(title, {
      license: meta.LicenseShortName?.value,
      licenseCode: meta.License?.value,
      artist: String(meta.Artist?.value ?? "").replace(/<[^>]+>/g, "").trim(),
      fileUrl: info.url,
      pageUrl: info.descriptionurl,
    });
  }
  return out;
}

async function fetchDrawings() {
  mkdirSync(join(COMMONS_DIR, "svg"), { recursive: true });
  const titles = [...new Set(Object.values(DRAWINGS))];
  const infos = new Map();
  for (let i = 0; i < titles.length; i += 40) {
    for (const [k, v] of await commonsInfo(titles.slice(i, i + 40))) infos.set(k, v);
  }
  const out = {};
  for (const [key, title] of Object.entries(DRAWINGS)) {
    const info = infos.get(title);
    if (!info) throw new Error(`${title}: no Commons record`);
    if (info.license !== "CC0" || info.licenseCode !== "cc0") throw new Error(`${title}: licence is ${info.license}, not CC0`);
    if (!/Richard Wright/.test(info.artist) || !/Dan McCloy/.test(info.artist)) throw new Error(`${title}: artist is ${info.artist}`);
    const file = join(COMMONS_DIR, "svg", title.replace(/[^\p{L}\p{N}.]+/gu, "_"));
    if (!existsSync(file)) {
      const response = await fetch(info.fileUrl, { headers: { "user-agent": UA } });
      if (!response.ok) throw new Error(`${title}: download ${response.status}`);
      writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    }
    const text = readFileSync(file, "utf8");
    out[key] = { key, title, ...info, text, sha256: createHash("sha256").update(text).digest("hex") };
  }
  return out;
}

const roundParams = (params) => Object.fromEntries(PARAM_KEYS.map((k) => [k, ROUND(params[k])]));

function rmsOf(params, targets) {
  const { points } = computeVocalTract(params);
  const names = Object.keys(targets);
  const sum = names.reduce((s, n) => s + (points[n].x - targets[n].x) ** 2 + (points[n].y - targets[n].y) ** 2, 0);
  return Math.sqrt(sum / names.length);
}

const drawings = await fetchDrawings();
const calibration = calibrate(drawings.neutral.text);

// Trace and fit each drawing once, with the lips' aperture free unless a plan fixes it.
const references = {};
function fitDrawing(key, fixed = {}) {
  const cacheKey = `${key}|${JSON.stringify(fixed)}`;
  if (references[cacheKey]) return references[cacheKey];
  const d = drawings[key];
  const { targets, jaw, notes } = targetsFor(d.text, drawings.neutral.text, calibration);
  const keys = ARTICULATORY_KEYS.filter((k) => !["jaw", "lipProtrusion", "larynxHeight"].includes(k) && !(k in fixed));
  const start = { ...NEUTRAL_PARAMS, jaw: ROUND(jaw), ...fixed };
  const fit = fitParams(targets, { keys, start, weights: WEIGHTS, regularization: REGULARIZATION });
  const params = roundParams(fit.params);
  const roundedTargets = Object.fromEntries(Object.entries(targets).map(([n, p]) => [n, { x: ROUND(p.x), y: ROUND(p.y) }]));
  const entry = {
    id: key,
    drawing: d.title,
    url: d.pageUrl,
    license: "CC0 1.0",
    artist: d.artist,
    sha256: d.sha256,
    fixed,
    jawFromIncisor: ROUND(jaw),
    targets: roundedTargets,
    params: Object.fromEntries(ARTICULATORY_KEYS.map((k) => [k, params[k]])),
    rms: Math.ceil(rmsOf(params, roundedTargets) * 1000) / 1000,
    notes,
  };
  references[cacheKey] = entry;
  return entry;
}

const RANK = { "hand-tuned": 0, literature: 1, fitted: 2 };
const built = new Map();
const keyFor = (soundId, variant) => `${soundId}:${variant}`;

function vowelFeatures(v) {
  return v ? { height: v[0], backness: v[1], rounding: v[2] } : undefined;
}

function base(plan) {
  return {
    soundId: plan.soundId,
    variant: plan.variant,
    ...(plan.place ? { place: plan.place } : {}),
    ...(plan.manner ? { manner: plan.manner } : {}),
    voicing: plan.voicing,
    airflow: plan.airflow,
    ...(plan.vowel ? { vowel: vowelFeatures(plan.vowel) } : {}),
    highlight: plan.highlight,
    overlays: plan.overlays,
    ...(plan.anchor ? { anchor: plan.anchor } : {}),
  };
}

function steady(plan) {
  let params;
  let method;
  let references = [];
  let fitRms;
  const adjusted = Object.keys(plan.rules).filter((k) => ARTICULATORY_KEYS.includes(k));
  if (plan.fit) {
    const fixed = Object.fromEntries(Object.entries(plan.rules).filter(([k]) => k === "lipAperture"));
    const ref = fitDrawing(plan.fit, fixed);
    params = { ...NEUTRAL_PARAMS, ...ref.params, ...plan.rules };
    method = "fitted";
    references = [ref.url];
    fitRms = ref.rms;
  } else if (plan.literature) {
    const lit = LITERATURE[plan.literature];
    params = { ...paramsFromVector(GERMAN_DEMO_CODEBOOK.find((e) => e.label === lit.label).vector), ...plan.rules };
    method = "literature";
    references = [lit.citation];
  }
  if (plan.tune) {
    for (const [k, v] of Object.entries(plan.tune)) params[k] = Math.max(-3, Math.min(3, params[k] + v));
    method = "hand-tuned";
    fitRms = undefined;
  }
  return {
    ...base(plan),
    params: roundParams(params),
    source: {
      method,
      references,
      ...(fitRms !== undefined ? { fitRms } : {}),
      ...(adjusted.length ? { setByRule: adjusted } : {}),
      ...(plan.tune ? { tuned: Object.keys(plan.tune) } : {}),
    },
    needsReview: method === "hand-tuned",
  };
}

function resolveKeyframe(ref, plan) {
  if (ref.startsWith("lit:")) {
    const lit = LITERATURE[ref.slice(4)];
    return { params: paramsFromVector(GERMAN_DEMO_CODEBOOK.find((e) => e.label === lit.label).vector), method: "literature", references: [lit.citation] };
  }
  if (ref.startsWith("fit:")) {
    const r = fitDrawing(ref.slice(4));
    return { params: { ...NEUTRAL_PARAMS, ...r.params }, method: "fitted", references: [r.url] };
  }
  const [soundId, variant] = ref.split(":");
  const target =
    built.get(keyFor(soundId, variant ?? plan.variant)) ??
    built.get(keyFor(soundId, "both")) ??
    built.get(keyFor(soundId, "GA"));
  if (!target) throw new Error(`${plan.soundId}: keyframe ${ref} is not built yet`);
  return { params: target.params, method: target.source.method, references: target.source.references };
}

function trajectory(plan) {
  const frames = plan.keyframes.map(([at, ref]) => ({ at, ...resolveKeyframe(ref, plan) }));
  const method = frames.reduce((m, f) => (RANK[f.method] < RANK[m] ? f.method : m), "fitted");
  const voiceAndVelum = Object.fromEntries(Object.entries(plan.rules).filter(([k]) => !ARTICULATORY_KEYS.includes(k)));
  const lips = Object.fromEntries(Object.entries(plan.rules).filter(([k]) => ARTICULATORY_KEYS.includes(k)));
  const keyframes = frames.map((f) => {
    const params = { ...f.params, ...voiceAndVelum, ...lips };
    if (plan.roundAll !== undefined) params.lipProtrusion = Math.max(params.lipProtrusion, plan.roundAll);
    return { at: f.at, params: roundParams(params) };
  });
  const adjusted = [...Object.keys(lips), ...(plan.roundAll !== undefined ? ["lipProtrusion"] : [])];
  return {
    ...base(plan),
    trajectory: keyframes,
    source: {
      method,
      references: [...new Set(frames.flatMap((f) => f.references))],
      ...(adjusted.length ? { setByRule: [...new Set(adjusted)] } : {}),
    },
    needsReview: method === "hand-tuned",
  };
}

const problems = [];
for (const plan of PLAN) {
  const target = plan.keyframes ? trajectory(plan) : steady(plan);
  problems.push(...validateArticulationTarget(target));
  built.set(keyFor(plan.soundId, plan.variant), target);
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

const group = (kind) => [...built.values()].filter((t) => soundById(t.soundId).kind === kind);
const header = (title) => ({
  format: 1,
  title,
  model: "Maeda's articulatory model via the VocalTract LaTeX package port (src/lib/platform/vocal-tract)",
  generatedBy: "scripts/content/fit-articulation.mjs",
});
const dir = join(CONTENT_DIR, "articulation");
mkdirSync(dir, { recursive: true });
const write = (name, body) => writeFileSync(join(dir, name), `${JSON.stringify(body, null, 1)}\n`);
write("consonants.json", { ...header("English consonants"), targets: group("consonant") });
write("vowels.json", { ...header("English vowels"), targets: group("vowel") });
write("diphthongs.json", { ...header("English diphthongs"), targets: group("diphthong") });
write("references.json", {
  format: 1,
  title: "Traced reference drawings and their fits",
  series: "Richard Wright and Dan McCloy, IPA sagittal sections, Wikimedia Commons, CC0 1.0",
  calibration: { scale: ROUND(calibration.scale * 1000) / 1000, angleDegrees: ROUND((calibration.angle * 180) / Math.PI) },
  regularization: REGULARIZATION,
  weights: WEIGHTS,
  references: Object.values(references).sort((a, b) => a.id.localeCompare(b.id)),
});

console.log(`${built.size} targets from ${Object.keys(references).length} fitted drawings.`);
const review = [...built.values()].filter((t) => t.needsReview);
console.log(`needsReview (${review.length}):`);
for (const t of review) console.log(`  ${t.soundId} (${t.variant}): ${t.source.method}${t.source.tuned ? `, tuned ${t.source.tuned.join(", ")}` : ""}`);
