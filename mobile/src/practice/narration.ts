// Lesson narration. The TTS route renders a couple of paragraphs at a time, so a
// long lesson is read as a queue of chunks. Each chunk ends on a sentence
// boundary, so the voice never stops in the middle of a word.
//
// Kept free of React imports so it can be unit tested (tests/narration.test.ts).

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

/** The text a lesson's HTML reads as, with tags dropped and whitespace collapsed. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&(nbsp|amp|quot|#39|apos|lt|gt);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Splits text into chunks of whole sentences, each at most `max` characters.
 * A single sentence longer than `max` is broken at the last space before the
 * limit rather than mid-word.
 */
export function narrationChunks(text: string, max = 600): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const sentences = clean.match(/[^.!?]+[.!?]+["'”’)\]]*|[^.!?]+$/g) ?? [clean];
  const chunks: string[] = [];
  let current = "";

  for (const raw of sentences) {
    let sentence = raw.trim();
    if (!sentence) continue;

    if (sentence.length > max) {
      if (current) chunks.push(current);
      current = "";
      while (sentence.length > max) {
        const space = sentence.lastIndexOf(" ", max);
        const cut = space > 0 ? space : max;
        chunks.push(sentence.slice(0, cut).trim());
        sentence = sentence.slice(cut).trim();
      }
    }

    const joined = current ? `${current} ${sentence}` : sentence;
    if (joined.length > max) {
      chunks.push(current);
      current = sentence;
    } else {
      current = joined;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
