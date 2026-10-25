// Which drafted placement items may ship: passed (or fixed by) the blind
// check, and rated within one level of their band by the level check.
// placement.mjs writes content/placement/<level>.json; assemble.mjs reads it.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTENT_DIR } from "./paths.mjs";
import { LEVELS, levelIndex } from "./text.mjs";

/** An item rated more than one level away from its band does not measure it. */
export function ratingFits(level, rated) {
  if (!LEVELS.includes(rated)) return false;
  return Math.abs(levelIndex(rated) - levelIndex(level)) <= 1;
}

export function passingItems(bank) {
  return bank.items.filter(
    (item) => ["pass", "fixed"].includes(bank.check.results[item.exercise.id]?.status) && ratingFits(bank.level, bank.check.ratings[item.exercise.id]),
  );
}

export const placementFile = (level) => join(CONTENT_DIR, "placement", `${level.toLowerCase()}.json`);

/** Every level's bank file that exists. */
export function loadPlacementBanks() {
  return LEVELS.map(placementFile)
    .filter((file) => existsSync(file))
    .map((file) => JSON.parse(readFileSync(file, "utf8")));
}
