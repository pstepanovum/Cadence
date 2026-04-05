// FILE: src/lib/conversation.ts
export const CONVERSATION_PROGRESS_COOKIE = "cadence_conversation_progress";

export interface ConversationTurn {
  id: string;
  coachMessage: string;
  userPrompt: string;
  expectedResponse: string;
  coachingCue: string;
}

export interface ConversationModule {
  slug: string;
  title: string;
  level: string;
  topic: string;
  summary: string;
  scenario: string;
  focus: string[];
  sortOrder: number;
  estimatedMinutes: number;
  passScore: number;
  turns: ConversationTurn[];
}

export interface ConversationProgressEntry {
  bestScore: number;
  lastScore: number;
  passed: boolean;
  completedAt: string | null;
  updatedAt: string;
}

export type ConversationProgressMap = Record<string, ConversationProgressEntry>;

export interface ConversationModuleWithProgress extends ConversationModule {
  progress: ConversationProgressEntry | null;
  isUnlocked: boolean;
  isCompleted: boolean;
}

export const CONVERSATION_MODULES: ConversationModule[] = [
  {
    slug: "coffee-chat-introductions",
    title: "Coffee Chat Introductions",
    level: "B1",
    topic: "Networking",
    summary: "Open a short professional conversation without sounding stiff or over-rehearsed.",
    scenario: "You meet a new teammate before a workshop and need to introduce yourself with calm, clear phrasing.",
    focus: ["long e", "short i", "final t", "linking"],
    sortOrder: 1,
    estimatedMinutes: 8,
    passScore: 84,
    turns: [
      {
        id: "intro-1",
        coachMessage: "Hi, I don't think we've met yet. What do you work on?",
        userPrompt: "Give a short introduction with your role and focus.",
        expectedResponse: "I work on product design, and I focus on research for new features.",
        coachingCue: "Keep design, focus, and features crisp without swallowing the final consonants.",
      },
      {
        id: "intro-2",
        coachMessage: "What kind of projects have you been busy with lately?",
        userPrompt: "Describe one current project in a natural way.",
        expectedResponse: "Lately, I have been helping our team improve the onboarding experience for new users.",
        coachingCue: "Hold lately and onboarding steady, and keep improve relaxed instead of rushed.",
      },
      {
        id: "intro-3",
        coachMessage: "That sounds interesting. What do you hope people notice first?",
        userPrompt: "Explain your main goal with one clear sentence.",
        expectedResponse: "I want people to feel confident quickly and understand the product without extra effort.",
        coachingCue: "Keep confident and quickly controlled, with a clean final t in effort.",
      },
    ],
  },
  {
    slug: "team-standup-update",
    title: "Team Standup Update",
    level: "B1+",
    topic: "Work updates",
    summary: "Give a compact project update that sounds steady, direct, and professional.",
    scenario: "You are in a remote standup and need to explain progress, blockers, and your next step.",
    focus: ["short u", "cluster endings", "weak forms", "stress control"],
    sortOrder: 2,
    estimatedMinutes: 8,
    passScore: 85,
    turns: [
      {
        id: "standup-1",
        coachMessage: "Can you walk us through what you finished yesterday?",
        userPrompt: "Report completed work in one sentence.",
        expectedResponse: "Yesterday, I finished the first draft of the support dashboard and reviewed the data labels.",
        coachingCue: "Keep finished, first, and draft stable instead of flattening the consonant clusters.",
      },
      {
        id: "standup-2",
        coachMessage: "Do you have any blockers right now?",
        userPrompt: "Mention one blocker and its impact.",
        expectedResponse: "My main blocker is the missing export data, so I cannot test the final report yet.",
        coachingCue: "Blocker, missing, and export should stay distinct and not blur together.",
      },
      {
        id: "standup-3",
        coachMessage: "What is your next move once that issue is fixed?",
        userPrompt: "Say what you will do next.",
        expectedResponse: "Once the data arrives, I will test the report flow and share an updated version by noon.",
        coachingCue: "Use a steady rhythm in arrives, updated, and version so the sentence stays clear.",
      },
    ],
  },
  {
    slug: "clinic-scheduling-call",
    title: "Clinic Scheduling Call",
    level: "B1+",
    topic: "Appointments",
    summary: "Handle a practical phone exchange with precise dates, times, and polite requests.",
    scenario: "You are calling a clinic to move an appointment and need to sound clear over the phone.",
    focus: ["short vowels", "date phrases", "question rhythm", "polite tone"],
    sortOrder: 3,
    estimatedMinutes: 9,
    passScore: 85,
    turns: [
      {
        id: "clinic-1",
        coachMessage: "How can I help you today?",
        userPrompt: "Explain why you are calling.",
        expectedResponse: "I need to move my appointment because I have a meeting at the same time.",
        coachingCue: "Move, appointment, and meeting should stay separate and not collapse into one rhythm.",
      },
      {
        id: "clinic-2",
        coachMessage: "What day would work better for you?",
        userPrompt: "Ask for a practical replacement time.",
        expectedResponse: "Could you check whether there is anything available on Thursday afternoon?",
        coachingCue: "Check, whether, Thursday, and afternoon need clear stress and clean endings.",
      },
      {
        id: "clinic-3",
        coachMessage: "We have one opening at three thirty. Does that work?",
        userPrompt: "Confirm politely and mention one small request.",
        expectedResponse: "Yes, that works well for me, and I would appreciate a reminder by email.",
        coachingCue: "Works, appreciate, and reminder should sound deliberate, not clipped.",
      },
    ],
  },
  {
    slug: "hotel-change-request",
    title: "Hotel Change Request",
    level: "B2",
    topic: "Travel",
    summary: "Explain a problem clearly and request a practical solution without sounding abrupt.",
    scenario: "You are at a hotel desk and need to request a room change after a noisy night.",
    focus: ["voiced vs unvoiced th", "long o", "sentence stress", "polite firmness"],
    sortOrder: 4,
    estimatedMinutes: 9,
    passScore: 86,
    turns: [
      {
        id: "hotel-1",
        coachMessage: "Good morning. Is there anything I can help with?",
        userPrompt: "Describe the issue with the current room.",
        expectedResponse: "My room was much louder than I expected, and I could hear traffic most of the night.",
        coachingCue: "Louder, expected, and traffic should stay controlled without losing the middle sounds.",
      },
      {
        id: "hotel-2",
        coachMessage: "I am sorry to hear that. What would you prefer?",
        userPrompt: "Ask for a quieter alternative.",
        expectedResponse: "If possible, I would like a quieter room away from the street and the elevator.",
        coachingCue: "Possible, quieter, street, and elevator should each stay fully shaped.",
      },
      {
        id: "hotel-3",
        coachMessage: "We may have one option on a higher floor. Would that help?",
        userPrompt: "Respond positively and stay polite.",
        expectedResponse: "Yes, that would help a lot, and I would really appreciate your help with the change.",
        coachingCue: "Would, appreciate, and change need steady rhythm instead of rushing the vowels.",
      },
    ],
  },
  {
    slug: "product-feedback-round",
    title: "Product Feedback Round",
    level: "B2",
    topic: "Product review",
    summary: "Give balanced product feedback that sounds thoughtful, not vague.",
    scenario: "You are giving feedback after testing a new workflow with your team.",
    focus: ["final d", "contrast language", "thought groups", "long a"],
    sortOrder: 5,
    estimatedMinutes: 10,
    passScore: 86,
    turns: [
      {
        id: "feedback-1",
        coachMessage: "What was your first impression of the new flow?",
        userPrompt: "Offer one positive first impression.",
        expectedResponse: "My first impression was positive because the layout felt simpler and easier to scan.",
        coachingCue: "Impression, positive, and easier should stay open and stable.",
      },
      {
        id: "feedback-2",
        coachMessage: "Was there anything confusing for you?",
        userPrompt: "Describe one unclear part with precision.",
        expectedResponse: "The settings section was less clear, and I needed an extra second to understand the labels.",
        coachingCue: "Settings, section, clear, and labels should stay distinct in the middle of the sentence.",
      },
      {
        id: "feedback-3",
        coachMessage: "What would you change first if you could?",
        userPrompt: "Suggest one practical change.",
        expectedResponse: "I would rewrite the labels first so the choices feel more direct and easier to compare.",
        coachingCue: "Rewrite, direct, and compare need clean consonants and a calm pace.",
      },
    ],
  },
  {
    slug: "project-delay-explanation",
    title: "Project Delay Explanation",
    level: "B2",
    topic: "Project communication",
    summary: "Explain a delay with ownership, clarity, and calm language.",
    scenario: "You need to explain a late delivery to a manager without sounding defensive.",
    focus: ["short a", "responsibility language", "linking", "final l"],
    sortOrder: 6,
    estimatedMinutes: 10,
    passScore: 87,
    turns: [
      {
        id: "delay-1",
        coachMessage: "Can you explain why the launch moved back?",
        userPrompt: "State the reason with ownership.",
        expectedResponse: "The launch moved back because I underestimated the time needed for the final review.",
        coachingCue: "Underestimated and final review should stay clear, even in a longer phrase.",
      },
      {
        id: "delay-2",
        coachMessage: "What has been the biggest impact so far?",
        userPrompt: "Describe the impact precisely.",
        expectedResponse: "The biggest impact is that the team cannot publish the update until the review is complete.",
        coachingCue: "Biggest, publish, and complete need clear endings so the sentence stays clean.",
      },
      {
        id: "delay-3",
        coachMessage: "What are you doing to recover the schedule?",
        userPrompt: "Describe your recovery plan in one answer.",
        expectedResponse: "I have already simplified the checklist, and I will send a revised timeline this afternoon.",
        coachingCue: "Simplified, checklist, revised, and timeline should hold their full vowel shapes.",
      },
    ],
  },
  {
    slug: "travel-story-recap",
    title: "Travel Story Recap",
    level: "B2",
    topic: "Storytelling",
    summary: "Tell a short story with better rhythm, contrast, and narrative clarity.",
    scenario: "You are describing a travel mishap to a friend after returning from a conference.",
    focus: ["past tense endings", "story rhythm", "long i", "contrast"],
    sortOrder: 7,
    estimatedMinutes: 10,
    passScore: 87,
    turns: [
      {
        id: "story-1",
        coachMessage: "How did the trip start?",
        userPrompt: "Set the scene in one sentence.",
        expectedResponse: "The trip started smoothly, but I realized at the airport that I had left my charger at home.",
        coachingCue: "Started, smoothly, realized, and charger should stay fully shaped and not flatten.",
      },
      {
        id: "story-2",
        coachMessage: "What happened after that?",
        userPrompt: "Continue the story with one clear event.",
        expectedResponse: "After that, I borrowed one from a colleague, but my flight was delayed for nearly two hours.",
        coachingCue: "Borrowed, colleague, flight, and delayed need steady timing with clean endings.",
      },
      {
        id: "story-3",
        coachMessage: "What did you learn from the whole experience?",
        userPrompt: "Close with a short reflection.",
        expectedResponse: "I learned that a calm backup plan matters more than trying to control every detail.",
        coachingCue: "Learned, backup, and detail should stay deliberate so the ending sounds mature and calm.",
      },
    ],
  },
  {
    slug: "interview-follow-up",
    title: "Interview Follow-up",
    level: "B2+",
    topic: "Career",
    summary: "Speak with warmth and precision in a post-interview follow-up conversation.",
    scenario: "You are speaking with a recruiter after a strong first-round interview.",
    focus: ["word stress", "thank-you phrasing", "linking", "soft certainty"],
    sortOrder: 8,
    estimatedMinutes: 11,
    passScore: 88,
    turns: [
      {
        id: "interview-1",
        coachMessage: "How did you feel after the interview yesterday?",
        userPrompt: "Give a reflective but positive answer.",
        expectedResponse: "I felt encouraged because the discussion was thoughtful and the role seems genuinely collaborative.",
        coachingCue: "Encouraged, discussion, and collaborative should keep their stress in the right place.",
      },
      {
        id: "interview-2",
        coachMessage: "What part of the role interests you the most now?",
        userPrompt: "Explain one strong reason.",
        expectedResponse: "I am especially interested in the chance to lead research and turn complex feedback into action.",
        coachingCue: "Especially, interested, research, and complex need steady vowel control.",
      },
      {
        id: "interview-3",
        coachMessage: "What would you like us to remember about you?",
        userPrompt: "End with a concise professional statement.",
        expectedResponse: "I would like you to remember that I communicate clearly and stay calm when projects become difficult.",
        coachingCue: "Communicate, clearly, projects, and difficult should stay precise and unhurried.",
      },
    ],
  },
  {
    slug: "deadline-negotiation",
    title: "Deadline Negotiation",
    level: "B2+",
    topic: "Negotiation",
    summary: "Negotiate scope and timing without sounding aggressive or uncertain.",
    scenario: "A client wants an earlier deadline, and you need to respond with a realistic alternative.",
    focus: ["conditional language", "diphthongs", "firm tone", "final consonants"],
    sortOrder: 9,
    estimatedMinutes: 11,
    passScore: 88,
    turns: [
      {
        id: "deadline-1",
        coachMessage: "Can your team deliver the full update by Friday?",
        userPrompt: "Respond clearly without overpromising.",
        expectedResponse: "We could deliver part of the update by Friday, but the full release would need more time.",
        coachingCue: "Could, deliver, Friday, and release need careful contrast and clean final sounds.",
      },
      {
        id: "deadline-2",
        coachMessage: "What would be a realistic option from your side?",
        userPrompt: "Offer a structured compromise.",
        expectedResponse: "A realistic option would be a smaller release on Friday and the remaining changes early next week.",
        coachingCue: "Realistic, smaller, remaining, and changes should stay smooth, not rushed.",
      },
      {
        id: "deadline-3",
        coachMessage: "Why do you think that plan makes sense?",
        userPrompt: "Justify the compromise with confidence.",
        expectedResponse: "That plan makes sense because it protects quality while still giving you visible progress this week.",
        coachingCue: "Protects, quality, visible, and progress need clean clusters and stable stress.",
      },
    ],
  },
  {
    slug: "client-check-in-lead",
    title: "Client Check-in Lead",
    level: "C1",
    topic: "Client communication",
    summary: "Lead a client check-in with strong control over pacing, emphasis, and explanation.",
    scenario: "You are leading a short client update and need to sound calm, credible, and precise.",
    focus: ["controlled emphasis", "long sentences", "pause placement", "professional tone"],
    sortOrder: 10,
    estimatedMinutes: 12,
    passScore: 90,
    turns: [
      {
        id: "client-1",
        coachMessage: "Could you open with a quick summary of where the project stands?",
        userPrompt: "Deliver a polished project overview.",
        expectedResponse: "At this stage, the project is on track overall, and the main deliverables are moving in the expected order.",
        coachingCue: "Overall, deliverables, and expected order should stay measured and not rush together.",
      },
      {
        id: "client-2",
        coachMessage: "What should we pay the closest attention to over the next week?",
        userPrompt: "Highlight one priority with professional emphasis.",
        expectedResponse: "Over the next week, the priority is validating the final workflow so we can reduce risk before launch.",
        coachingCue: "Priority, validating, workflow, and reduce risk need clear stress placement.",
      },
      {
        id: "client-3",
        coachMessage: "What would you like from us before the next check-in?",
        userPrompt: "Close with a direct request.",
        expectedResponse: "Before the next check-in, I would like prompt feedback on the revised draft and any open concerns.",
        coachingCue: "Prompt feedback, revised draft, and open concerns should sound confident and complete.",
      },
    ],
  },
];

export function parseConversationProgress(
  rawValue: string | null | undefined,
): ConversationProgressMap {
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue) as ConversationProgressMap;
    return parsed ?? {};
  } catch {
    return {};
  }
}

export function serializeConversationProgress(
  progress: ConversationProgressMap,
): string {
  return JSON.stringify(progress);
}

export function getConversationModule(
  slug: string,
): ConversationModule | undefined {
  return CONVERSATION_MODULES.find((module) => module.slug === slug);
}

export function isConversationModuleUnlocked(
  module: ConversationModule,
  progress: ConversationProgressMap,
): boolean {
  if (module.sortOrder === 1) {
    return true;
  }

  const previous = CONVERSATION_MODULES.find(
    (item) => item.sortOrder === module.sortOrder - 1,
  );

  if (!previous) {
    return true;
  }

  return progress[previous.slug]?.passed === true;
}

export function getConversationModulesWithProgress(
  progress: ConversationProgressMap,
): ConversationModuleWithProgress[] {
  return CONVERSATION_MODULES.map((module) => {
    const entry = progress[module.slug] ?? null;
    return {
      ...module,
      progress: entry,
      isUnlocked: isConversationModuleUnlocked(module, progress),
      isCompleted: entry?.passed === true,
    };
  });
}

export function getCompletedConversationCount(
  progress: ConversationProgressMap,
): number {
  return Object.values(progress).filter((entry) => entry.passed).length;
}
