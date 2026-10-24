import type { GameId } from "./progress.ts";

export interface GameInfo {
  id: GameId;
  title: string;
  /** Two or three words under the title. */
  tagline: string;
  blurb: string;
  /** Rounds that play audio need the computer (or cloud) to be reachable. */
  needsServer: boolean;
  /** Roughly how long one round takes. */
  minutes: number;
}

export const GAMES: GameInfo[] = [
  {
    id: "flashcards",
    title: "Flashcards",
    tagline: "Learn new words",
    blurb: "Flip, decide if you knew it, and let spaced repetition bring it back right before you forget.",
    needsServer: false,
    minutes: 3,
  },
  {
    id: "meaning-match",
    title: "Meaning Match",
    tagline: "Definition quiz",
    blurb: "Four choices, one right answer. Build a combo for bonus points.",
    needsServer: false,
    minutes: 2,
  },
  {
    id: "spelling",
    title: "Spelling Bee",
    tagline: "Listen and type",
    blurb: "Hear the word in your coach's voice and spell it. Three lives, hints if you need them.",
    needsServer: true,
    minutes: 3,
  },
  {
    id: "scramble",
    title: "Word Scramble",
    tagline: "Unjumble the letters",
    blurb: "Tap the tiles into the right order. The definition is your clue.",
    needsServer: false,
    minutes: 2,
  },
  {
    id: "sound-match",
    title: "Sound Match",
    tagline: "Train your ear",
    blurb: "Right or light? Hear one word and pick which of the pair it was.",
    needsServer: true,
    minutes: 2,
  },
];

export function gameInfo(id: GameId): GameInfo {
  return GAMES.find((game) => game.id === id) ?? GAMES[0];
}
