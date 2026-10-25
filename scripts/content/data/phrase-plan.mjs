// The phrase bank's outline (docs/PLATFORM.md section 17): the situations a
// phrase belongs to and what each level means for a phrase. Our own plan and
// our own wording; the generator is never prompted with a published list.
//
// Each situation is drafted once per level, `PER_BATCH` phrases a round.
// Round 1 builds the starter bank (about 3,000 after deduplication and the
// blind check); later rounds (`--round 2`, `--round 3`, ...) add fresh
// phrases with everything already written excluded, which is how the bank
// grows towards 10,000 without renaming anything.

export const PHRASE_LEVELS = ["B2", "C1", "C2"];

export const PER_BATCH = 80;

/** [id, title, what the learner is doing there] */
export const SITUATIONS = [
  ["meetings", "Meetings", "running or taking part in work meetings: opening, steering, interrupting politely, summing up, assigning actions"],
  ["negotiation", "Negotiation", "negotiating terms, prices, deadlines and scope: anchoring, conceding, making conditional offers, holding a line"],
  ["small-talk", "Small talk", "starting and keeping up light conversation with colleagues, neighbours and strangers, and leaving it gracefully"],
  ["disagreeing", "Disagreeing politely", "disagreeing, pushing back and raising doubts without sounding rude, and finding common ground"],
  ["storytelling", "Storytelling", "telling an anecdote well: setting the scene, building tension, reported speech, the punchline, reacting to someone else's story"],
  ["academic", "Academic", "seminars, lectures, papers and research talk: hedging claims, citing, qualifying, comparing positions"],
  ["interviews", "Interviews", "job interviews from both sides: describing experience, strengths and failures, asking good questions, buying time to think"],
  ["travel", "Travel", "travel and getting things done abroad: bookings, problems, complaints, asking for help, directions"],
  ["presenting", "Presenting", "giving talks and presentations: signposting, handling questions, emphasising, recovering from a slip"],
  ["feedback", "Giving feedback", "giving and taking feedback at work: praise that is specific, criticism that lands, responding to criticism"],
  ["persuading", "Persuading", "making a case and winning people over: framing, appealing to shared goals, anticipating objections"],
  ["explaining", "Explaining", "explaining something complicated clearly: simplifying, giving examples, checking understanding, rephrasing"],
  ["reacting", "Reacting and feelings", "reacting naturally to news, surprises and other people's feelings: sympathy, delight, mild annoyance, relief"],
  ["problem-solving", "Problem solving", "dealing with problems and setbacks with colleagues: diagnosing, proposing options, deciding, following up"],
  ["socialising", "Socialising", "making plans, invitations, accepting and declining, hosting and being a guest, catching up with friends"],
  ["calls", "Calls and video calls", "phone and video calls: connection trouble, turn-taking, wrapping up, leaving and returning messages"],
];

export const LEVEL_BRIEF = {
  B2: "B2: common, high-frequency chunks a fluent speaker uses every week and an upper-intermediate learner understands but rarely produces (for example the kind of thing that makes speech sound natural rather than translated).",
  C1: "C1: idiomatic, more nuanced chunks that mark an advanced speaker: softeners, discourse markers, collocations with precise meaning, set phrases for steering a conversation.",
  C2: "C2: subtle, register-sensitive and idiomatic expressions a highly educated native speaker uses naturally: understatement, irony, elegant hedges, sophisticated collocations. Still common in real speech, never obscure or literary.",
};
