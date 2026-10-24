// FILE: src/components/learn-hub/fixture-pack.ts
//
// A small built-in pack per CEFR level, written for Cadence, used by the web
// practice hub only when public/packs has no readable pack for a level yet
// (before the content pipeline has run, or offline with nothing cached).
// tests/web/fixture-pack.test.ts runs validatePackContent over it.
import type { CefrLevel, Exercise, GrammarPoint, Lesson, PackContent, Topic } from "../../lib/platform/content-model.ts";

const gen = { kind: "generated" } as const;
const ex = (text: string, note?: string) => (note ? { text, note, source: gen } : { text, source: gen });

interface LevelSeed {
  level: CefrLevel;
  topic: Topic;
  points: GrammarPoint[];
  exercises: Exercise[];
}

function seed(level: CefrLevel, topic: Topic, points: GrammarPoint[], exercises: Exercise[]): LevelSeed {
  return { level, topic, points, exercises };
}

const l = (level: CefrLevel) => level.toLowerCase();

const SEEDS: LevelSeed[] = [
  seed(
    "A1",
    { id: "topic.a1.everyday", title: "Everyday life", summary: "Talking about yourself and your day." },
    [
      {
        id: "gp.present-simple-be", level: "A1", topicId: "topic.a1.everyday", title: "Present simple of be",
        summary: "am, is and are for who and what things are.",
        explanation: "Use *am* with I, *is* with he, she and it, and *are* with you, we and they. In speech the short forms are normal: I'm, she's, they're.",
        patterns: ["I am / I'm", "he/she/it is / 's", "you/we/they are / 're"],
        examples: [ex("I'm a nurse."), ex("They are at home today."), ex("Is she your sister?")],
        commonErrors: [{ wrong: "She are tired.", right: "She is tired.", note: "he, she and it take is." }],
        related: ["gp.present-simple"],
      },
      {
        id: "gp.present-simple", level: "A1", topicId: "topic.a1.everyday", title: "Present simple",
        summary: "Habits and facts: I work, she works.",
        explanation: "Use the present simple for routines and things that are generally true. Add *-s* for he, she and it. Questions and negatives use *do* or *does*.",
        patterns: ["I/you/we/they + verb", "he/she/it + verb-s", "do/does + subject + verb?"],
        examples: [ex("I drink coffee every morning."), ex("He works in a bank."), ex("Do you like music?")],
        commonErrors: [{ wrong: "He work every day.", right: "He works every day.", note: "Add -s after he, she and it." }],
        related: ["gp.present-simple-be"],
      },
    ],
    [
      { id: "ex.a1.be.01", kind: "multiple_choice", level: "A1", grammarPointIds: ["gp.present-simple-be"], prompt: "Choose the right word.", question: "My parents ___ from Brazil.", options: ["is", "are", "am"], answer: 1, explanation: "Parents is they, so are." },
      { id: "ex.a1.ps.01", kind: "multiple_choice", level: "A1", grammarPointIds: ["gp.present-simple"], prompt: "Choose the right form.", question: "She ___ to work by bus.", options: ["go", "goes", "going"], answer: 1, explanation: "He, she and it add -s: goes." },
      { id: "ex.a1.ps.02", kind: "gap_fill", level: "A1", grammarPointIds: ["gp.present-simple"], prompt: "Fill the gap.", text: "___ you speak Spanish?", answers: [["Do"]], bank: ["Do", "Does", "Are"], explanation: "You takes do." },
      { id: "ex.a1.ps.03", kind: "sentence_building", level: "A1", grammarPointIds: ["gp.present-simple"], prompt: "Put the words in order.", answer: ["She", "likes", "green", "tea"], distractors: ["like"] },
      { id: "ex.a1.ps.04", kind: "error_correction", level: "A1", grammarPointIds: ["gp.present-simple"], prompt: "Correct the sentence.", sentence: "My brother live in London.", answers: ["My brother lives in London."] },
      { id: "ex.a1.be.02", kind: "transformation", level: "A1", grammarPointIds: ["gp.present-simple-be"], prompt: "Rewrite the sentence.", source: "You are late.", instruction: "Make it a question.", answers: ["Are you late?"] },
      { id: "ex.a1.match.01", kind: "matching", level: "A1", grammarPointIds: ["gp.present-simple"], prompt: "Match the halves.", pairs: [{ left: "I get up", right: "at seven." }, { left: "She has", right: "two cats." }, { left: "We don't", right: "eat meat." }] },
      { id: "ex.a1.card.01", kind: "flashcard", level: "A1", grammarPointIds: [], prompt: "Recall the meaning.", front: "busy", back: "having a lot to do", example: ex("I'm busy on Mondays.") },
      { id: "ex.a1.card.02", kind: "flashcard", level: "A1", grammarPointIds: [], prompt: "Recall the meaning.", front: "usually", back: "most of the time", example: ex("I usually walk to work.") },
      { id: "ex.a1.card.03", kind: "flashcard", level: "A1", grammarPointIds: [], prompt: "Recall the meaning.", front: "neighbour", back: "a person who lives next to you", example: ex("Our neighbour has a big dog.") },
    ],
  ),
  seed(
    "A2",
    { id: "topic.a2.past", title: "Past events", summary: "Telling people what happened." },
    [
      {
        id: "gp.past-simple", level: "A2", topicId: "topic.a2.past", title: "Past simple",
        summary: "Finished actions at a finished time: I called, we went.",
        explanation: "Use the past simple for something that happened and finished, often with a time: yesterday, last week, in 2019. Regular verbs add *-ed*; many common verbs are irregular.",
        patterns: ["subject + verb-ed / irregular past", "did + subject + verb?", "subject + didn't + verb"],
        examples: [ex("We visited my aunt last weekend."), ex("She didn't see the message."), ex("Where did you go?")],
        commonErrors: [{ wrong: "Did you went out?", right: "Did you go out?", note: "After did, use the base verb." }],
        related: ["gp.past-continuous"],
      },
      {
        id: "gp.past-continuous", level: "A2", topicId: "topic.a2.past", title: "Past continuous",
        summary: "An action in progress at a past moment: I was cooking.",
        explanation: "Use *was* or *were* with *-ing* for something in progress at a moment in the past, often interrupted by a shorter action in the past simple.",
        patterns: ["was/were + verb-ing", "was/were + verb-ing ... when + past simple"],
        examples: [ex("I was cooking when you called."), ex("They were waiting outside.")],
        commonErrors: [{ wrong: "I was cook dinner.", right: "I was cooking dinner.", note: "Keep the -ing form after was." }],
        related: ["gp.past-simple"],
      },
    ],
    [
      { id: "ex.a2.past.01", kind: "multiple_choice", level: "A2", grammarPointIds: ["gp.past-simple"], prompt: "Choose the right form.", question: "We ___ a great film last night.", options: ["see", "saw", "seen"], answer: 1 },
      { id: "ex.a2.past.02", kind: "multiple_choice", level: "A2", grammarPointIds: ["gp.past-continuous"], prompt: "Choose the right form.", question: "It ___ when I left the house.", options: ["was raining", "rained", "is raining"], answer: 0, explanation: "Something in progress at that moment." },
      { id: "ex.a2.past.03", kind: "gap_fill", level: "A2", grammarPointIds: ["gp.past-simple"], prompt: "Fill the gap with one word.", text: "I ___ not hear the alarm.", answers: [["did"]] },
      { id: "ex.a2.past.04", kind: "sentence_building", level: "A2", grammarPointIds: ["gp.past-continuous"], prompt: "Put the words in order.", answer: ["She", "was", "reading", "a", "book"] },
      { id: "ex.a2.past.05", kind: "error_correction", level: "A2", grammarPointIds: ["gp.past-simple"], prompt: "Correct the sentence.", sentence: "Did she called you?", answers: ["Did she call you?"] },
      { id: "ex.a2.past.06", kind: "transformation", level: "A2", grammarPointIds: ["gp.past-simple"], prompt: "Rewrite the sentence.", source: "They went home early.", instruction: "Make it negative.", answers: ["They didn't go home early.", "They did not go home early."] },
      { id: "ex.a2.match.01", kind: "matching", level: "A2", grammarPointIds: ["gp.past-simple"], prompt: "Match each verb to its past form.", pairs: [{ left: "buy", right: "bought" }, { left: "take", right: "took" }, { left: "write", right: "wrote" }, { left: "find", right: "found" }] },
      { id: "ex.a2.card.01", kind: "flashcard", level: "A2", grammarPointIds: [], prompt: "Recall the meaning.", front: "luggage", back: "the bags you take on a trip", example: ex("Our luggage arrived a day late.") },
      { id: "ex.a2.card.02", kind: "flashcard", level: "A2", grammarPointIds: [], prompt: "Recall the meaning.", front: "suddenly", back: "quickly and without warning", example: ex("Suddenly the lights went out.") },
      { id: "ex.a2.card.03", kind: "flashcard", level: "A2", grammarPointIds: [], prompt: "Recall the meaning.", front: "borrow", back: "take something and give it back later", example: ex("Can I borrow your pen?") },
    ],
  ),
  seed(
    "B1",
    { id: "topic.b1.experience", title: "Experience and change", summary: "Linking the past to now." },
    [
      {
        id: "gp.present-perfect", level: "B1", topicId: "topic.b1.experience", title: "Present perfect",
        summary: "Past actions that matter now: I've lost my keys.",
        explanation: "Use *have* or *has* with the past participle when the time is not stated or still open, or when the result matters now. With a finished time (yesterday, in 2020), use the past simple instead.",
        patterns: ["have/has + past participle", "have you ever + past participle?", "for / since + time"],
        examples: [ex("I've never been to Japan."), ex("She has worked here since March."), ex("Have you finished the report?")],
        commonErrors: [{ wrong: "I have seen him yesterday.", right: "I saw him yesterday.", note: "A finished time takes the past simple." }],
        related: ["gp.past-simple"],
      },
      {
        id: "gp.first-conditional", level: "B1", topicId: "topic.b1.experience", title: "First conditional",
        summary: "Real possibilities: If it rains, we'll stay in.",
        explanation: "Use *if* + present simple for a real possibility, and *will* + verb for the result. Do not use will in the if part.",
        patterns: ["if + present simple, will + verb", "will + verb + if + present simple"],
        examples: [ex("If you hurry, you'll catch the train."), ex("I'll call you if I hear anything.")],
        commonErrors: [{ wrong: "If it will rain, we stay home.", right: "If it rains, we'll stay home.", note: "No will after if." }],
        related: [],
      },
    ],
    [
      { id: "ex.b1.pp.01", kind: "multiple_choice", level: "B1", grammarPointIds: ["gp.present-perfect"], prompt: "Choose the best answer.", question: "I ___ this film three times.", options: ["saw", "have seen", "am seeing"], answer: 1 },
      { id: "ex.b1.fc.01", kind: "multiple_choice", level: "B1", grammarPointIds: ["gp.first-conditional"], prompt: "Choose the best answer.", question: "If you ___ early, we can have lunch together.", options: ["arrive", "will arrive", "arrived"], answer: 0 },
      { id: "ex.b1.pp.02", kind: "gap_fill", level: "B1", grammarPointIds: ["gp.present-perfect"], prompt: "Fill the gap with for or since.", text: "We have lived here ___ 2018.", answers: [["since"]], bank: ["for", "since"] },
      { id: "ex.b1.fc.02", kind: "sentence_building", level: "B1", grammarPointIds: ["gp.first-conditional"], prompt: "Put the words in order.", answer: ["I'll", "help", "you", "if", "I", "can"] },
      { id: "ex.b1.pp.03", kind: "error_correction", level: "B1", grammarPointIds: ["gp.present-perfect"], prompt: "Correct the sentence.", sentence: "She has went home.", answers: ["She has gone home.", "She's gone home."] },
      { id: "ex.b1.fc.03", kind: "transformation", level: "B1", grammarPointIds: ["gp.first-conditional"], prompt: "Join the two ideas.", source: "Maybe it will snow. We will build a snowman.", instruction: "Write one sentence starting with If.", answers: ["If it snows, we'll build a snowman.", "If it snows, we will build a snowman."] },
      { id: "ex.b1.match.01", kind: "matching", level: "B1", grammarPointIds: ["gp.present-perfect"], prompt: "Match the halves.", pairs: [{ left: "Have you ever", right: "eaten sushi?" }, { left: "She hasn't replied", right: "yet." }, { left: "I've known him", right: "for years." }] },
      { id: "ex.b1.card.01", kind: "flashcard", level: "B1", grammarPointIds: [], prompt: "Recall the meaning.", front: "deadline", back: "the time by which something must be done", example: ex("The deadline is Friday at noon.") },
      { id: "ex.b1.card.02", kind: "flashcard", level: "B1", grammarPointIds: [], prompt: "Recall the meaning.", front: "reliable", back: "able to be trusted", example: ex("She's the most reliable person on the team.") },
      { id: "ex.b1.card.03", kind: "flashcard", level: "B1", grammarPointIds: [], prompt: "Recall the meaning.", front: "put off", back: "move something to a later time", example: ex("We put off the meeting until Monday.") },
    ],
  ),
  seed(
    "B2",
    { id: "topic.b2.work", title: "Work and opinions", summary: "Being clear and polite at work." },
    [
      {
        id: "gp.passive-voice", level: "B2", topicId: "topic.b2.work", title: "The passive",
        summary: "Focus on what happened, not who did it: The report was sent.",
        explanation: "Use *be* in the right tense plus the past participle when the action matters more than the person doing it, or when that person is unknown. Add *by* only if the doer is useful information.",
        patterns: ["be + past participle", "has been + past participle", "will be + past participle"],
        examples: [ex("The office is cleaned every evening."), ex("Your order has been shipped."), ex("The results will be announced tomorrow.")],
        commonErrors: [{ wrong: "The email was send yesterday.", right: "The email was sent yesterday.", note: "Use the past participle." }],
        related: [],
      },
      {
        id: "gp.second-conditional", level: "B2", topicId: "topic.b2.work", title: "Second conditional",
        summary: "Unreal or unlikely situations: If I had more time, I'd learn piano.",
        explanation: "Use *if* + past simple for an imagined present or future, and *would* + verb for the result. *Were* is common for all persons in careful speech: If I were you…",
        patterns: ["if + past simple, would + verb", "if I were you, I'd + verb"],
        examples: [ex("If I lived nearer, I'd visit more often."), ex("What would you do if you lost your job?")],
        commonErrors: [{ wrong: "If I would have money, I'd travel.", right: "If I had money, I'd travel.", note: "No would in the if part." }],
        related: ["gp.first-conditional"],
      },
    ],
    [
      { id: "ex.b2.pass.01", kind: "multiple_choice", level: "B2", grammarPointIds: ["gp.passive-voice"], prompt: "Choose the best answer.", question: "The new policy ___ next month.", options: ["will introduce", "will be introduced", "is introducing"], answer: 1 },
      { id: "ex.b2.sc.01", kind: "multiple_choice", level: "B2", grammarPointIds: ["gp.second-conditional"], prompt: "Choose the best answer.", question: "If I ___ you, I'd ask for a raise.", options: ["am", "were", "will be"], answer: 1 },
      { id: "ex.b2.pass.02", kind: "gap_fill", level: "B2", grammarPointIds: ["gp.passive-voice"], prompt: "Fill the gaps.", text: "The meeting has ___ ___ until Thursday.", answers: [["been"], ["moved", "postponed"]] },
      { id: "ex.b2.sc.02", kind: "sentence_building", level: "B2", grammarPointIds: ["gp.second-conditional"], prompt: "Put the words in order.", answer: ["What", "would", "you", "do", "if", "you", "won?"] },
      { id: "ex.b2.pass.03", kind: "error_correction", level: "B2", grammarPointIds: ["gp.passive-voice"], prompt: "Correct the sentence.", sentence: "The windows are clean every week.", answers: ["The windows are cleaned every week."] },
      { id: "ex.b2.pass.04", kind: "transformation", level: "B2", grammarPointIds: ["gp.passive-voice"], prompt: "Rewrite the sentence.", source: "Someone stole my bike.", instruction: "Rewrite it in the passive.", answers: ["My bike was stolen.", "My bike was stolen by someone."] },
      { id: "ex.b2.match.01", kind: "matching", level: "B2", grammarPointIds: ["gp.second-conditional"], prompt: "Match the halves.", pairs: [{ left: "If I had a car,", right: "I'd drive to work." }, { left: "If she knew the answer,", right: "she'd tell us." }, { left: "If we left now,", right: "we'd be on time." }] },
      { id: "ex.b2.card.01", kind: "flashcard", level: "B2", grammarPointIds: [], prompt: "Recall the meaning.", front: "follow up", back: "contact someone again about something", example: ex("I'll follow up with the client tomorrow.") },
      { id: "ex.b2.card.02", kind: "flashcard", level: "B2", grammarPointIds: [], prompt: "Recall the meaning.", front: "workload", back: "the amount of work you have to do", example: ex("My workload doubled this month.") },
      { id: "ex.b2.card.03", kind: "flashcard", level: "B2", grammarPointIds: [], prompt: "Recall the meaning.", front: "straightforward", back: "simple and easy to understand", example: ex("The process is fairly straightforward.") },
    ],
  ),
  seed(
    "C1",
    { id: "topic.c1.nuance", title: "Nuance and emphasis", summary: "Shaping what you mean." },
    [
      {
        id: "gp.third-conditional", level: "C1", topicId: "topic.c1.nuance", title: "Third and mixed conditionals",
        summary: "Imagined pasts: If I'd known, I would have come.",
        explanation: "Use *if* + past perfect with *would have* + past participle for a past that did not happen. Mix the forms when a past condition has a present result: If I had taken that job, I would be in Berlin now.",
        patterns: ["if + had + participle, would have + participle", "if + had + participle, would + verb (now)"],
        examples: [ex("If we'd left earlier, we wouldn't have missed the flight."), ex("If she hadn't moved, she'd still be here.")],
        commonErrors: [{ wrong: "If I would have known, I'd have helped.", right: "If I had known, I'd have helped.", note: "The if part takes the past perfect." }],
        related: ["gp.second-conditional"],
      },
      {
        id: "gp.inversion", level: "C1", topicId: "topic.c1.nuance", title: "Inversion for emphasis",
        summary: "Never have I seen…: putting a negative word first.",
        explanation: "After a negative or limiting word at the start (*never, rarely, not only, no sooner*), the auxiliary comes before the subject. It sounds formal and emphatic.",
        patterns: ["Never/Rarely + auxiliary + subject + verb", "Not only + auxiliary + subject …, but …"],
        examples: [ex("Rarely do we get feedback this quickly."), ex("Not only did he apologise, but he also paid for the damage.")],
        commonErrors: [{ wrong: "Never I have seen such a view.", right: "Never have I seen such a view.", note: "The auxiliary goes before the subject." }],
        related: [],
      },
    ],
    [
      { id: "ex.c1.tc.01", kind: "multiple_choice", level: "C1", grammarPointIds: ["gp.third-conditional"], prompt: "Choose the best answer.", question: "If they had asked me, I ___ them.", options: ["would help", "would have helped", "had helped"], answer: 1 },
      { id: "ex.c1.inv.01", kind: "multiple_choice", level: "C1", grammarPointIds: ["gp.inversion"], prompt: "Choose the best answer.", question: "Seldom ___ such a clear explanation.", options: ["I have heard", "have I heard", "I heard"], answer: 1 },
      { id: "ex.c1.tc.02", kind: "gap_fill", level: "C1", grammarPointIds: ["gp.third-conditional"], prompt: "Fill the gap with one word.", text: "If I ___ taken that job, I'd be living abroad now.", answers: [["had"]] },
      { id: "ex.c1.inv.02", kind: "sentence_building", level: "C1", grammarPointIds: ["gp.inversion"], prompt: "Put the words in order.", answer: ["Not", "once", "did", "she", "complain"] },
      { id: "ex.c1.tc.03", kind: "error_correction", level: "C1", grammarPointIds: ["gp.third-conditional"], prompt: "Correct the sentence.", sentence: "If he would have studied, he would have passed.", answers: ["If he had studied, he would have passed.", "If he'd studied, he would have passed.", "If he had studied, he'd have passed."] },
      { id: "ex.c1.inv.03", kind: "transformation", level: "C1", grammarPointIds: ["gp.inversion"], prompt: "Rewrite the sentence.", source: "I have never felt so tired.", instruction: "Start with Never.", answers: ["Never have I felt so tired."] },
      { id: "ex.c1.match.01", kind: "matching", level: "C1", grammarPointIds: ["gp.inversion"], prompt: "Match the halves.", pairs: [{ left: "No sooner had we sat down", right: "than the phone rang." }, { left: "Hardly had she arrived", right: "when the power went off." }, { left: "Not only is it cheaper,", right: "it's also faster." }] },
      { id: "ex.c1.card.01", kind: "flashcard", level: "C1", grammarPointIds: [], prompt: "Recall the meaning.", front: "nuance", back: "a small difference in meaning or feeling", example: ex("The translation lost some of the nuance.") },
      { id: "ex.c1.card.02", kind: "flashcard", level: "C1", grammarPointIds: [], prompt: "Recall the meaning.", front: "come across as", back: "seem to other people in a certain way", example: ex("He comes across as quite shy.") },
      { id: "ex.c1.card.03", kind: "flashcard", level: "C1", grammarPointIds: [], prompt: "Recall the meaning.", front: "substantial", back: "large in amount or importance", example: ex("They made a substantial offer.") },
    ],
  ),
  seed(
    "C2",
    { id: "topic.c2.style", title: "Style and precision", summary: "Saying exactly what you mean." },
    [
      {
        id: "gp.cleft-sentences", level: "C2", topicId: "topic.c2.style", title: "Cleft sentences",
        summary: "It was the price that surprised me: moving the focus.",
        explanation: "Split a sentence to put one part in focus. *It + be + focus + that/who* points at one element; *What … is/was …* builds up to it. Both are common in speech to correct or contrast.",
        patterns: ["It is/was + focus + that/who …", "What + clause + is/was + focus"],
        examples: [ex("It was Maria who found the mistake."), ex("What I need is a quiet afternoon.")],
        commonErrors: [{ wrong: "It was the noise what kept me awake.", right: "It was the noise that kept me awake.", note: "Use that or who, not what, after the focus." }],
        related: ["gp.inversion"],
      },
      {
        id: "gp.subjunctive", level: "C2", topicId: "topic.c2.style", title: "The subjunctive",
        summary: "They insisted that he leave: the base form after demands.",
        explanation: "After verbs and adjectives of demand or importance (*insist, recommend, essential, vital*), formal English uses the bare verb with no *-s* and no tense: It is vital that she be informed. British English often uses *should* + verb instead.",
        patterns: ["verb/adjective + that + subject + base verb", "It is essential that + subject + be + participle"],
        examples: [ex("The doctor recommended that he rest for a week."), ex("It is essential that everyone be on time.")],
        commonErrors: [{ wrong: "They demanded that he leaves.", right: "They demanded that he leave.", note: "No -s in the subjunctive." }],
        related: [],
      },
    ],
    [
      { id: "ex.c2.cleft.01", kind: "multiple_choice", level: "C2", grammarPointIds: ["gp.cleft-sentences"], prompt: "Choose the best answer.", question: "___ I don't understand is why he left.", options: ["That", "What", "Which"], answer: 1 },
      { id: "ex.c2.subj.01", kind: "multiple_choice", level: "C2", grammarPointIds: ["gp.subjunctive"], prompt: "Choose the best answer.", question: "The board insisted that the plan ___ reviewed.", options: ["is", "be", "was"], answer: 1 },
      { id: "ex.c2.cleft.02", kind: "gap_fill", level: "C2", grammarPointIds: ["gp.cleft-sentences"], prompt: "Fill the gap with one word.", text: "It was the second chapter ___ I enjoyed most.", answers: [["that", "which"]] },
      { id: "ex.c2.subj.02", kind: "sentence_building", level: "C2", grammarPointIds: ["gp.subjunctive"], prompt: "Put the words in order.", answer: ["It", "is", "vital", "that", "he", "attend"] },
      { id: "ex.c2.subj.03", kind: "error_correction", level: "C2", grammarPointIds: ["gp.subjunctive"], prompt: "Correct the sentence.", sentence: "I suggest that she takes the earlier train.", answers: ["I suggest that she take the earlier train.", "I suggest that she should take the earlier train."] },
      { id: "ex.c2.cleft.03", kind: "transformation", level: "C2", grammarPointIds: ["gp.cleft-sentences"], prompt: "Rewrite the sentence.", source: "Tom broke the vase.", instruction: "Put the focus on Tom, starting with It.", answers: ["It was Tom who broke the vase.", "It was Tom that broke the vase."] },
      { id: "ex.c2.match.01", kind: "matching", level: "C2", grammarPointIds: ["gp.cleft-sentences"], prompt: "Match the halves.", pairs: [{ left: "What surprised me", right: "was how calm she stayed." }, { left: "It was only later", right: "that I understood." }, { left: "All we need", right: "is a little more time." }] },
      { id: "ex.c2.card.01", kind: "flashcard", level: "C2", grammarPointIds: [], prompt: "Recall the meaning.", front: "ubiquitous", back: "found everywhere", example: ex("Phones are now ubiquitous.") },
      { id: "ex.c2.card.02", kind: "flashcard", level: "C2", grammarPointIds: [], prompt: "Recall the meaning.", front: "tacit", back: "understood without being said", example: ex("There was a tacit agreement not to mention it.") },
      { id: "ex.c2.card.03", kind: "flashcard", level: "C2", grammarPointIds: [], prompt: "Recall the meaning.", front: "hedge", back: "avoid giving a clear answer", example: ex("She hedged when asked about the budget.") },
    ],
  ),
];

/** The built-in pack for one level, in the same shape as a pack's content.json. */
export function fixturePack(level: CefrLevel): PackContent {
  const s = SEEDS.find((entry) => entry.level === level)!;
  const lesson: Lesson = {
    id: `lesson.${l(level)}.starter`,
    level,
    topicId: s.topic.id,
    title: s.topic.title,
    goal: s.topic.summary,
    minutes: 10,
    grammarPointIds: s.points.map((p) => p.id),
    soundIds: [],
    exerciseIds: s.exercises.filter((e) => e.kind !== "flashcard").map((e) => e.id),
  };
  return { topics: [s.topic], grammarPoints: s.points, lessons: [lesson], exercises: s.exercises };
}
