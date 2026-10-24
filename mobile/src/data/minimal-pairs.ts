// Minimal pairs for the listening game: two real words that differ by one
// sound. Curated from src/backend/data/phoneme_catalog.json with the
// non-words ("fess", "mesher", "rin") left out, because every entry here is
// synthesised by the TTS engine and shown on a button.

export interface PairGroup {
  key: string;
  label: string;
  /** One line on what to listen for. */
  blurb: string;
  pairs: readonly [string, string][];
}

export const MINIMAL_PAIRS: PairGroup[] = [
  {
    key: "r-l",
    label: "R vs L",
    blurb: "The tongue curls back for R and touches the ridge for L.",
    pairs: [
      ["right", "light"],
      ["red", "led"],
      ["rain", "lane"],
      ["road", "load"],
      ["rice", "lice"],
      ["correct", "collect"],
      ["fry", "fly"],
      ["grass", "glass"],
      ["pray", "play"],
      ["arrive", "alive"],
    ],
  },
  {
    key: "v-w",
    label: "V vs W",
    blurb: "V bites the lower lip; W rounds both lips.",
    pairs: [
      ["vine", "wine"],
      ["vet", "wet"],
      ["vest", "west"],
      ["veil", "whale"],
      ["vow", "wow"],
      ["vary", "wary"],
      ["verse", "worse"],
      ["vent", "went"],
    ],
  },
  {
    key: "th-voiceless",
    label: "TH vs S / T",
    blurb: "Tongue between the teeth for TH, behind them for S and T.",
    pairs: [
      ["think", "sink"],
      ["thin", "tin"],
      ["three", "tree"],
      ["thank", "tank"],
      ["mouth", "mouse"],
      ["bath", "bat"],
      ["faith", "fate"],
      ["thick", "sick"],
    ],
  },
  {
    key: "th-voiced",
    label: "TH vs D",
    blurb: "Voiced TH is soft and buzzy; D stops the air completely.",
    pairs: [
      ["then", "den"],
      ["those", "doze"],
      ["breathe", "breed"],
      ["there", "dare"],
      ["they", "day"],
      ["though", "dough"],
    ],
  },
  {
    key: "i-ee",
    label: "Short I vs long E",
    blurb: "“Ship” is quick and relaxed; “sheep” is long with spread lips.",
    pairs: [
      ["sit", "seat"],
      ["bit", "beat"],
      ["ship", "sheep"],
      ["fill", "feel"],
      ["hit", "heat"],
      ["live", "leave"],
      ["chip", "cheap"],
      ["bin", "bean"],
    ],
  },
  {
    key: "a-e",
    label: "Short A vs short E",
    blurb: "The jaw drops further for “bad” than for “bed”.",
    pairs: [
      ["bad", "bed"],
      ["man", "men"],
      ["pan", "pen"],
      ["sat", "set"],
      ["bat", "bet"],
      ["had", "head"],
      ["and", "end"],
    ],
  },
  {
    key: "a-u",
    label: "Short A vs short U",
    blurb: "“Cat” is wide and forward; “cut” is central and relaxed.",
    pairs: [
      ["cat", "cut"],
      ["bat", "but"],
      ["cap", "cup"],
      ["hat", "hut"],
      ["fan", "fun"],
      ["bag", "bug"],
      ["match", "much"],
    ],
  },
  {
    key: "oo",
    label: "Short OO vs long OO",
    blurb: "“Full” is short with loose lips; “fool” is long and tight.",
    pairs: [
      ["full", "fool"],
      ["pull", "pool"],
      ["soot", "suit"],
      ["look", "Luke"],
      ["should", "shooed"],
    ],
  },
  {
    key: "sh-ch",
    label: "SH vs CH",
    blurb: "SH is a steady hiss; CH starts with a tiny stop.",
    pairs: [
      ["ship", "chip"],
      ["share", "chair"],
      ["shoes", "choose"],
      ["wash", "watch"],
      ["cash", "catch"],
      ["sheep", "cheap"],
      ["shin", "chin"],
    ],
  },
  {
    key: "voicing",
    label: "P/B, T/D, K/G",
    blurb: "Same mouth shape, but one of each pair uses the voice.",
    pairs: [
      ["pat", "bat"],
      ["pie", "buy"],
      ["cap", "cab"],
      ["tin", "din"],
      ["town", "down"],
      ["cold", "gold"],
      ["back", "bag"],
      ["coat", "goat"],
    ],
  },
  {
    key: "o-oh",
    label: "Short O vs long O",
    blurb: "“Not” is open and quick; “note” glides and rounds.",
    pairs: [
      ["not", "note"],
      ["cot", "coat"],
      ["rod", "road"],
      ["hop", "hope"],
      ["sock", "soak"],
      ["got", "goat"],
    ],
  },
  {
    key: "ay-e",
    label: "Long A vs short E",
    blurb: "“Late” glides upward; “let” stays flat and short.",
    pairs: [
      ["late", "let"],
      ["pain", "pen"],
      ["taste", "test"],
      ["gate", "get"],
      ["wait", "wet"],
      ["sale", "sell"],
    ],
  },
];

export function pairGroup(key: string): PairGroup | undefined {
  return MINIMAL_PAIRS.find((group) => group.key === key);
}
