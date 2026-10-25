// Slang left out by editorial decision (docs/PLATFORM.md section 17), applied
// by slang.mjs when it reviews a category and again by the pack builder, so a
// term added here leaves the dictionary on the next build without a new
// Gemini run. Keys are textKey(term).
//
//   - group or political labels, and expressions built on a nationality;
//   - words for children or pet names, which do not belong in a dictionary
//     for advanced adult speakers.
export const EXCLUDED_TERMS = new Set([
  "irish goodbye",
  "french leave",
  "woke",
  "cancel culture",
  "karen",
  "boomer",
  "ok boomer",
  "snowflake",
  "sleepyhead",
  "sweetheart",
  "pooped",
  "busy bee",
]);
