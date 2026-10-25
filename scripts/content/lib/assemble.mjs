// Builds every pack in memory from the content sources. build.mjs writes what
// this returns; validate.mjs checks it. Pack layout in docs/PLATFORM.md 3.3.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTENT_DIR } from "./paths.mjs";
import { LEVELS, sha256Hex } from "./text.mjs";
import { TOPICS } from "../data/grammar-outline.mjs";
import { loadPlacementBanks, passingItems } from "./placement-bank.mjs";

/** TTS settings the audio is named by; audio.mjs synthesizes with the same. */
export const AUDIO_VOICE = "en-US-Neural2-F";
export const AUDIO_RATE = 1;
export const audioPath = (text) => `audio/${sha256Hex(`${AUDIO_VOICE}|${AUDIO_RATE}|${text}`).slice(0, 16)}.m4a`;

const VOCAB_TOPIC = { id: "topic.vocabulary", title: "Vocabulary", summary: "Everyday and academic words with definitions and example sentences." };
const LISTENING_TOPIC = { id: "topic.listening", title: "Listening", summary: "Dictation with real sentences, to train your ear." };
const SOUNDS_TOPIC = { id: "topic.pronunciation", title: "Pronunciation", summary: "The sounds of English, where they are made and how to tell them apart." };

const CARDS_PER_LESSON = 20;
const DICTATIONS_PER_LEVEL = 24;
const passStatus = new Set(["pass", "fixed"]);

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

export function loadGrammar(level) {
  const dir = join(CONTENT_DIR, "grammar", level.toLowerCase());
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .sort()
    .map((n) => readJson(join(dir, n)));
}

/** Exercises of a grammar file that passed the blind check, in id order. */
export function passingExercises(file) {
  const all = [...file.exercises, ...(file.check?.extra ?? [])];
  return all.filter((e) => passStatus.has(file.check?.results?.[e.id]?.status)).sort((a, b) => a.id.localeCompare(b.id));
}

export function loadVocab(level) {
  const file = join(CONTENT_DIR, "vocab", `${level.toLowerCase()}.json`);
  return existsSync(file) ? readJson(file).cards : [];
}

export function loadSentences(level) {
  const file = join(CONTENT_DIR, "sentences", `${level.toLowerCase()}.json`);
  return existsSync(file) ? readJson(file).sentences : [];
}

function relatedFor(gp, all) {
  const same = all.filter((o) => o.id !== gp.id && o.topicId === gp.topicId);
  const near = same.sort(
    (a, b) => Math.abs(LEVELS.indexOf(a.level) - LEVELS.indexOf(gp.level)) - Math.abs(LEVELS.indexOf(b.level) - LEVELS.indexOf(gp.level)) || a.id.localeCompare(b.id),
  );
  return near.slice(0, 3).map((o) => o.id);
}

function corePack(level, allGrammar) {
  const sources = loadGrammar(level);
  const grammarPoints = [];
  const exercises = [];
  const lessons = [];
  for (const file of sources) {
    const gp = structuredClone(file.grammarPoint);
    gp.related = relatedFor(gp, allGrammar);
    for (const s of file.tatoebaExamples ?? []) {
      gp.examples.push({ text: s.text, source: { kind: "tatoeba", sentenceId: s.sentenceId, author: s.author } });
    }
    grammarPoints.push(gp);
    const passed = passingExercises(file);
    exercises.push(...passed);
    lessons.push({
      id: `lesson.${level.toLowerCase()}.${file.slug}`,
      level,
      topicId: gp.topicId,
      title: gp.title,
      goal: gp.summary,
      minutes: Math.min(20, Math.max(6, Math.round(passed.length * 0.8))),
      grammarPointIds: [gp.id],
      soundIds: [],
      exerciseIds: passed.map((e) => e.id),
    });
  }

  const cards = loadVocab(level).map((card) => ({
    id: card.id,
    kind: "flashcard",
    level,
    grammarPointIds: [],
    prompt: "Do you know this word?",
    front: card.word,
    back: `(${card.pos}) ${card.definition}`,
    example: card.example,
    audio: audioPath(card.word),
  }));
  for (let i = 0; i < cards.length; i += CARDS_PER_LESSON) {
    const n = String(i / CARDS_PER_LESSON + 1).padStart(2, "0");
    const slice = cards.slice(i, i + CARDS_PER_LESSON);
    lessons.push({
      id: `lesson.${level.toLowerCase()}.vocabulary-${n}`,
      level,
      topicId: VOCAB_TOPIC.id,
      title: `Words ${level} ${n}: ${slice[0].front} to ${slice[slice.length - 1].front}`.slice(0, 80),
      goal: `Learn ${slice.length} ${level} words with example sentences.`,
      minutes: 8,
      grammarPointIds: [],
      soundIds: [],
      exerciseIds: slice.map((c) => c.id),
    });
  }
  exercises.push(...cards);

  const sentences = loadSentences(level);
  const dictations = [...sentences]
    .filter((s) => s.text.split(" ").length >= 5 && s.text.split(" ").length <= 12)
    .sort((a, b) => (sha256Hex(`dictation:${a.sentenceId}`) < sha256Hex(`dictation:${b.sentenceId}`) ? -1 : 1))
    .slice(0, DICTATIONS_PER_LEVEL)
    .sort((a, b) => a.sentenceId - b.sentenceId)
    .map((s) => ({
      id: `ex.${level.toLowerCase()}.dictation.${s.sentenceId}`,
      kind: "dictation",
      level,
      grammarPointIds: [],
      prompt: "Listen and type what you hear.",
      text: s.text,
      audio: audioPath(s.text),
      source: { kind: "tatoeba", sentenceId: s.sentenceId, author: s.author },
    }));
  if (dictations.length) {
    exercises.push(...dictations);
    lessons.push({
      id: `lesson.${level.toLowerCase()}.dictation`,
      level,
      topicId: LISTENING_TOPIC.id,
      title: `Dictation ${level}`,
      goal: "Write down real English sentences you hear.",
      minutes: 10,
      grammarPointIds: [],
      soundIds: [],
      exerciseIds: dictations.map((d) => d.id),
    });
  }

  const usedTopics = new Set(lessons.map((l) => l.topicId));
  const topics = [...TOPICS, VOCAB_TOPIC, LISTENING_TOPIC].filter((t) => usedTopics.has(t.id) || grammarPoints.some((g) => g.topicId === t.id));
  const scenarios = readJson(join(CONTENT_DIR, "scenarios", "scenarios.json")).scenarios.filter((s) => s.level === level);

  const files = {
    "content.json": { topics, grammarPoints, lessons, exercises },
    "sentences.json": {
      format: 1,
      source: "Tatoeba (https://tatoeba.org)",
      license: "CC BY 2.0 FR (https://creativecommons.org/licenses/by/2.0/fr/)",
      sentences,
    },
  };
  if (scenarios.length) files["scenarios.json"] = { format: 1, scenarios };
  return { id: `core-${level.toLowerCase()}`, title: `Cadence ${level}`, level, files };
}

function soundsPack() {
  const pairs = readJson(join(CONTENT_DIR, "sounds", "minimal-pairs.json")).exercises.map((e) => ({
    ...e,
    audio: [audioPath(e.words[0]), audioPath(e.words[1])],
  }));
  const groups = new Map();
  for (const e of pairs) {
    const key = e.soundIds.join("|");
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const lessons = [...groups.values()].map((list) => {
    const [a, b] = list[0].soundIds.map((id) => id.slice(6));
    return {
      id: `lesson.sounds.${a}-vs-${b}`,
      level: list[0].level,
      topicId: SOUNDS_TOPIC.id,
      title: `${list[0].words[0]} or ${list[0].words[1]}`,
      goal: "Hear the difference between two sounds that are easy to mix up.",
      minutes: 5,
      grammarPointIds: [],
      soundIds: list[0].soundIds,
      exerciseIds: list.map((e) => e.id),
    };
  });
  const articulation = ["consonants", "vowels", "diphthongs"].flatMap((n) => readJson(join(CONTENT_DIR, "articulation", `${n}.json`)).targets);
  return {
    id: "sounds",
    title: "Cadence sounds",
    files: {
      "content.json": { topics: [SOUNDS_TOPIC], grammarPoints: [], lessons, exercises: pairs },
      "articulation.json": { format: 1, targets: articulation },
    },
  };
}

/**
 * The placement bank as one pack: every item that passed the blind check and
 * the level check, as plain exercises (ids ex.placement.<level>.<type>.<nn>;
 * the adaptive test reads level and type from them). No lessons: the bank is
 * only ever asked by the placement test.
 */
function placementPack() {
  const exercises = loadPlacementBanks()
    .flatMap((bank) => passingItems(bank).map((item) => item.exercise))
    .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  return { id: "placement", title: "Cadence placement", files: { "content.json": { topics: [], grammarPoints: [], lessons: [], exercises } } };
}

export function assemblePacks() {
  const allGrammar = LEVELS.flatMap((level) => loadGrammar(level).map((f) => f.grammarPoint));
  const packs = [soundsPack()];
  const placement = placementPack();
  if (placement.files["content.json"].exercises.length) packs.push(placement);
  for (const level of LEVELS) {
    const pack = corePack(level, allGrammar);
    if (pack.files["content.json"].exercises.length) packs.push(pack);
  }
  return packs;
}
