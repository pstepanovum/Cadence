// The word bank behind the vocabulary games. Hand-written: every entry has a
// plain-English definition, one example sentence, and General American IPA.
// The IPA is for display only — the scoring engine derives its own targets.
//
// Levels map onto the onboarding "focus" so the first deck a learner sees is
// the one they said they cared about (see `suggestedLevel`).

export type VocabLevel = "everyday" | "work" | "travel" | "ideas";

export type PartOfSpeech = "noun" | "verb" | "adjective" | "adverb" | "phrase";

export interface VocabWord {
  /** Stable key for progress — never renumber. */
  id: string;
  word: string;
  ipa: string;
  pos: PartOfSpeech;
  definition: string;
  example: string;
  level: VocabLevel;
}

export const VOCAB_LEVELS: { key: VocabLevel; label: string; blurb: string }[] = [
  { key: "everyday", label: "Everyday", blurb: "Words that come up at home, with friends, around town." },
  { key: "work", label: "At work", blurb: "Meetings, email, and sounding sure of yourself." },
  { key: "travel", label: "Travel", blurb: "Airports, hotels, directions, and getting unstuck." },
  { key: "ideas", label: "Big ideas", blurb: "Words for opinions, arguments, and explaining why." },
];

export function isVocabLevel(value: unknown): value is VocabLevel {
  return VOCAB_LEVELS.some((item) => item.key === value);
}

/** A route param becomes a level, falling back to the first deck. */
export function parseLevel(value: unknown): VocabLevel {
  return isVocabLevel(value) ? value : "everyday";
}

export function levelLabel(level: VocabLevel): string {
  return VOCAB_LEVELS.find((item) => item.key === level)?.label ?? level;
}

/** The deck to open first, given the goals the learner chose in setup. */
export function suggestedLevel(goals: readonly string[]): VocabLevel {
  if (goals.includes("work")) return "work";
  if (goals.some((goal) => goal === "fluency" || goal === "natural" || goal === "exam")) return "ideas";
  return "everyday";
}

export const VOCABULARY: VocabWord[] = [
  // --- Everyday ------------------------------------------------------------
  { id: "ev-01", word: "errand", ipa: "/ˈɛrənd/", pos: "noun", level: "everyday", definition: "A short trip to do a small task, like buying milk or posting a letter.", example: "I have a few errands to run before dinner." },
  { id: "ev-02", word: "chore", ipa: "/tʃɔr/", pos: "noun", level: "everyday", definition: "A routine job at home, such as washing up or taking out the trash.", example: "Doing the laundry is my least favorite chore." },
  { id: "ev-03", word: "cozy", ipa: "/ˈkoʊzi/", pos: "adjective", level: "everyday", definition: "Warm, comfortable, and relaxing.", example: "The café was small and cozy, with soft chairs by the window." },
  { id: "ev-04", word: "leftovers", ipa: "/ˈlɛftˌoʊvərz/", pos: "noun", level: "everyday", definition: "Food that was not eaten at a meal and is saved for later.", example: "We had leftovers from Sunday's roast for lunch." },
  { id: "ev-05", word: "grocery", ipa: "/ˈɡroʊsəri/", pos: "noun", level: "everyday", definition: "Food and household items you buy at a supermarket.", example: "Can you pick up some groceries on your way home?" },
  { id: "ev-06", word: "neighbor", ipa: "/ˈneɪbər/", pos: "noun", level: "everyday", definition: "A person who lives next to or near you.", example: "Our neighbor waters our plants when we travel." },
  { id: "ev-07", word: "commute", ipa: "/kəˈmjut/", pos: "verb", level: "everyday", definition: "To travel regularly between home and work.", example: "She commutes forty minutes by train every day." },
  { id: "ev-08", word: "exhausted", ipa: "/ɪɡˈzɔstɪd/", pos: "adjective", level: "everyday", definition: "Extremely tired.", example: "After the hike we were completely exhausted." },
  { id: "ev-09", word: "appointment", ipa: "/əˈpɔɪntmənt/", pos: "noun", level: "everyday", definition: "An arranged time to meet someone, such as a doctor or dentist.", example: "I have a dentist appointment at three." },
  { id: "ev-10", word: "receipt", ipa: "/rɪˈsit/", pos: "noun", level: "everyday", definition: "A piece of paper that proves you paid for something.", example: "Keep the receipt in case you need to return it." },
  { id: "ev-11", word: "borrow", ipa: "/ˈbɑroʊ/", pos: "verb", level: "everyday", definition: "To take and use something that belongs to someone else, planning to give it back.", example: "Can I borrow your charger for an hour?" },
  { id: "ev-12", word: "spill", ipa: "/spɪl/", pos: "verb", level: "everyday", definition: "To accidentally let a liquid flow out of its container.", example: "I spilled coffee all over my notes." },
  { id: "ev-13", word: "lukewarm", ipa: "/ˌlukˈwɔrm/", pos: "adjective", level: "everyday", definition: "Only slightly warm; not hot enough.", example: "The soup had gone lukewarm by the time she sat down." },
  { id: "ev-14", word: "sibling", ipa: "/ˈsɪblɪŋ/", pos: "noun", level: "everyday", definition: "A brother or sister.", example: "I have two siblings, both younger than me." },
  { id: "ev-15", word: "weekday", ipa: "/ˈwikˌdeɪ/", pos: "noun", level: "everyday", definition: "Any day from Monday to Friday.", example: "The gym is quieter on weekday mornings." },
  { id: "ev-16", word: "stroll", ipa: "/stroʊl/", pos: "verb", level: "everyday", definition: "To walk slowly and in a relaxed way.", example: "We strolled along the river after dinner." },
  { id: "ev-17", word: "nap", ipa: "/næp/", pos: "noun", level: "everyday", definition: "A short sleep during the day.", example: "A twenty-minute nap fixed my afternoon." },
  { id: "ev-18", word: "crowded", ipa: "/ˈkraʊdɪd/", pos: "adjective", level: "everyday", definition: "Full of people, with little space.", example: "The bus was so crowded I had to stand the whole way." },
  { id: "ev-19", word: "bargain", ipa: "/ˈbɑrɡən/", pos: "noun", level: "everyday", definition: "Something bought for much less than its usual price.", example: "Those shoes were a real bargain at half price." },
  { id: "ev-20", word: "faucet", ipa: "/ˈfɔsɪt/", pos: "noun", level: "everyday", definition: "The tap that controls water in a sink or bath.", example: "The kitchen faucet has been dripping all week." },
  { id: "ev-21", word: "drowsy", ipa: "/ˈdraʊzi/", pos: "adjective", level: "everyday", definition: "Sleepy and slow, almost falling asleep.", example: "The medicine made him drowsy, so he went to bed early." },
  { id: "ev-22", word: "ripe", ipa: "/raɪp/", pos: "adjective", level: "everyday", definition: "Fully grown and ready to eat, said of fruit or vegetables.", example: "These bananas are ripe — eat them today." },
  { id: "ev-23", word: "clutter", ipa: "/ˈklʌtər/", pos: "noun", level: "everyday", definition: "A messy pile of things left lying around.", example: "I need to clear the clutter off my desk." },
  { id: "ev-24", word: "chilly", ipa: "/ˈtʃɪli/", pos: "adjective", level: "everyday", definition: "Uncomfortably cold, but not freezing.", example: "It's chilly tonight — bring a jacket." },
  { id: "ev-25", word: "reckon", ipa: "/ˈrɛkən/", pos: "verb", level: "everyday", definition: "To think or suppose something, in casual speech.", example: "I reckon it'll rain later." },
  { id: "ev-26", word: "hangout", ipa: "/ˈhæŋˌaʊt/", pos: "noun", level: "everyday", definition: "A place where people like to spend relaxed time together.", example: "That coffee shop is our usual hangout." },
  { id: "ev-27", word: "catch up", ipa: "/kætʃ ʌp/", pos: "phrase", level: "everyday", definition: "To talk with someone you have not seen for a while and share news.", example: "Let's grab lunch and catch up." },
  { id: "ev-28", word: "run out", ipa: "/rʌn aʊt/", pos: "phrase", level: "everyday", definition: "To use all of something so none is left.", example: "We've run out of milk again." },
  { id: "ev-29", word: "wobbly", ipa: "/ˈwɑbli/", pos: "adjective", level: "everyday", definition: "Unsteady, moving from side to side.", example: "This chair is wobbly — one leg is loose." },
  { id: "ev-30", word: "thrifty", ipa: "/ˈθrɪfti/", pos: "adjective", level: "everyday", definition: "Careful with money; not wasteful.", example: "My grandmother was thrifty and never threw food away." },
  { id: "ev-31", word: "leash", ipa: "/liʃ/", pos: "noun", level: "everyday", definition: "A strap or rope used to lead a dog.", example: "Keep your dog on a leash in the park." },
  { id: "ev-32", word: "sneeze", ipa: "/sniz/", pos: "verb", level: "everyday", definition: "To push air out of your nose and mouth suddenly, often because of a cold.", example: "The dust made me sneeze three times." },
  { id: "ev-33", word: "mingle", ipa: "/ˈmɪŋɡəl/", pos: "verb", level: "everyday", definition: "To move around at a social event and talk to different people.", example: "Grab a drink and mingle — everyone here is friendly." },
  { id: "ev-34", word: "snack", ipa: "/snæk/", pos: "noun", level: "everyday", definition: "A small amount of food eaten between meals.", example: "I packed a snack for the train." },
  { id: "ev-35", word: "tidy", ipa: "/ˈtaɪdi/", pos: "adjective", level: "everyday", definition: "Neat and well organized.", example: "His room is always surprisingly tidy." },
  { id: "ev-36", word: "yawn", ipa: "/jɔn/", pos: "verb", level: "everyday", definition: "To open your mouth wide and breathe in deeply because you are tired or bored.", example: "She tried not to yawn during the long speech." },
  { id: "ev-37", word: "blister", ipa: "/ˈblɪstər/", pos: "noun", level: "everyday", definition: "A painful bubble of skin filled with liquid, often caused by rubbing.", example: "My new shoes gave me a blister on my heel." },
  { id: "ev-38", word: "doze", ipa: "/doʊz/", pos: "verb", level: "everyday", definition: "To sleep lightly for a short time.", example: "Grandpa dozed in his chair after lunch." },
  { id: "ev-39", word: "pantry", ipa: "/ˈpæntri/", pos: "noun", level: "everyday", definition: "A small room or cupboard where food is stored.", example: "There's pasta in the pantry if you're hungry." },
  { id: "ev-40", word: "wander", ipa: "/ˈwɑndər/", pos: "verb", level: "everyday", definition: "To walk around with no particular destination.", example: "We wandered through the old town for hours." },

  // --- At work ---------------------------------------------------------------
  { id: "wk-01", word: "deadline", ipa: "/ˈdɛdˌlaɪn/", pos: "noun", level: "work", definition: "The time or date by which something must be finished.", example: "The deadline for the report is Friday at noon." },
  { id: "wk-02", word: "agenda", ipa: "/əˈdʒɛndə/", pos: "noun", level: "work", definition: "A list of topics to be discussed at a meeting.", example: "Let's add your question to tomorrow's agenda." },
  { id: "wk-03", word: "delegate", ipa: "/ˈdɛləˌɡeɪt/", pos: "verb", level: "work", definition: "To give part of your work or responsibility to someone else.", example: "A good manager knows when to delegate." },
  { id: "wk-04", word: "feedback", ipa: "/ˈfidˌbæk/", pos: "noun", level: "work", definition: "Comments about how well someone did something, meant to help them improve.", example: "She gave me useful feedback on my presentation." },
  { id: "wk-05", word: "colleague", ipa: "/ˈkɑliɡ/", pos: "noun", level: "work", definition: "A person you work with.", example: "A colleague from finance joined our meeting." },
  { id: "wk-06", word: "prioritize", ipa: "/praɪˈɔrəˌtaɪz/", pos: "verb", level: "work", definition: "To decide which tasks are most important and do those first.", example: "We need to prioritize the bug fixes before new features." },
  { id: "wk-07", word: "negotiate", ipa: "/nəˈɡoʊʃiˌeɪt/", pos: "verb", level: "work", definition: "To discuss something in order to reach an agreement.", example: "They negotiated a better price with the supplier." },
  { id: "wk-08", word: "milestone", ipa: "/ˈmaɪlˌstoʊn/", pos: "noun", level: "work", definition: "An important stage or event in a project.", example: "Launching the beta was a big milestone for the team." },
  { id: "wk-09", word: "concise", ipa: "/kənˈsaɪs/", pos: "adjective", level: "work", definition: "Giving a lot of information clearly in few words.", example: "Keep the summary concise — one paragraph at most." },
  { id: "wk-10", word: "stakeholder", ipa: "/ˈsteɪkˌhoʊldər/", pos: "noun", level: "work", definition: "A person or group with an interest in how a project turns out.", example: "We'll share the roadmap with every stakeholder next week." },
  { id: "wk-11", word: "follow up", ipa: "/ˈfɑloʊ ʌp/", pos: "phrase", level: "work", definition: "To contact someone again about something discussed earlier.", example: "I'll follow up with the client on Monday." },
  { id: "wk-12", word: "outcome", ipa: "/ˈaʊtˌkʌm/", pos: "noun", level: "work", definition: "The final result of a process or event.", example: "We were pleased with the outcome of the pilot." },
  { id: "wk-13", word: "brainstorm", ipa: "/ˈbreɪnˌstɔrm/", pos: "verb", level: "work", definition: "To come up with many ideas quickly as a group.", example: "Let's brainstorm names for the new product." },
  { id: "wk-14", word: "proficient", ipa: "/prəˈfɪʃənt/", pos: "adjective", level: "work", definition: "Skilled and able to do something well.", example: "She is proficient in three programming languages." },
  { id: "wk-15", word: "reschedule", ipa: "/riˈskɛdʒul/", pos: "verb", level: "work", definition: "To change the time of a planned event.", example: "Can we reschedule our call to Thursday?" },
  { id: "wk-16", word: "accomplish", ipa: "/əˈkɑmplɪʃ/", pos: "verb", level: "work", definition: "To succeed in finishing something.", example: "We accomplished more this quarter than all of last year." },
  { id: "wk-17", word: "tentative", ipa: "/ˈtɛntətɪv/", pos: "adjective", level: "work", definition: "Not certain or fixed; may still change.", example: "We have a tentative launch date of May first." },
  { id: "wk-18", word: "collaborate", ipa: "/kəˈlæbəˌreɪt/", pos: "verb", level: "work", definition: "To work together with others on a shared goal.", example: "Design and engineering collaborated closely on the feature." },
  { id: "wk-19", word: "promotion", ipa: "/prəˈmoʊʃən/", pos: "noun", level: "work", definition: "A move to a higher, more important job.", example: "He got a promotion to team lead last month." },
  { id: "wk-20", word: "workload", ipa: "/ˈwɜrkˌloʊd/", pos: "noun", level: "work", definition: "The amount of work a person has to do.", example: "My workload doubled when two people left." },
  { id: "wk-21", word: "clarify", ipa: "/ˈklɛrəˌfaɪ/", pos: "verb", level: "work", definition: "To make something clearer or easier to understand.", example: "Could you clarify what you mean by 'soon'?" },
  { id: "wk-22", word: "efficient", ipa: "/ɪˈfɪʃənt/", pos: "adjective", level: "work", definition: "Working well without wasting time or effort.", example: "The new process is far more efficient." },
  { id: "wk-23", word: "invoice", ipa: "/ˈɪnvɔɪs/", pos: "noun", level: "work", definition: "A document listing goods or services and the amount owed.", example: "Please send the invoice by the end of the month." },
  { id: "wk-24", word: "postpone", ipa: "/poʊstˈpoʊn/", pos: "verb", level: "work", definition: "To move an event to a later time.", example: "The meeting was postponed until next week." },
  { id: "wk-25", word: "thorough", ipa: "/ˈθɜroʊ/", pos: "adjective", level: "work", definition: "Done carefully and completely, with attention to every detail.", example: "She did a thorough review of the contract." },
  { id: "wk-26", word: "overtime", ipa: "/ˈoʊvərˌtaɪm/", pos: "noun", level: "work", definition: "Extra hours worked beyond the normal schedule.", example: "We worked overtime to finish before the demo." },
  { id: "wk-27", word: "expertise", ipa: "/ˌɛkspərˈtiz/", pos: "noun", level: "work", definition: "Special skill or knowledge in a particular area.", example: "We hired her for her expertise in data privacy." },
  { id: "wk-28", word: "reliable", ipa: "/rɪˈlaɪəbəl/", pos: "adjective", level: "work", definition: "Able to be trusted to do what is expected.", example: "He's reliable — if he says it's done, it's done." },
  { id: "wk-29", word: "summarize", ipa: "/ˈsʌməˌraɪz/", pos: "verb", level: "work", definition: "To give the main points of something briefly.", example: "Can you summarize the discussion for those who missed it?" },
  { id: "wk-30", word: "quarterly", ipa: "/ˈkwɔrtərli/", pos: "adjective", level: "work", definition: "Happening four times a year, once every three months.", example: "The quarterly numbers come out next week." },
  { id: "wk-31", word: "mentor", ipa: "/ˈmɛntɔr/", pos: "noun", level: "work", definition: "An experienced person who guides and advises someone newer.", example: "My mentor helped me prepare for the interview." },
  { id: "wk-32", word: "bottleneck", ipa: "/ˈbɑtəlˌnɛk/", pos: "noun", level: "work", definition: "A point where progress slows because too much depends on it.", example: "Code review has become the bottleneck for releases." },
  { id: "wk-33", word: "straightforward", ipa: "/ˌstreɪtˈfɔrwərd/", pos: "adjective", level: "work", definition: "Easy to understand or do; not complicated.", example: "The setup is straightforward — three steps." },
  { id: "wk-34", word: "allocate", ipa: "/ˈæləˌkeɪt/", pos: "verb", level: "work", definition: "To give out resources or time for a specific purpose.", example: "We allocated two days for testing." },
  { id: "wk-35", word: "turnaround", ipa: "/ˈtɜrnəˌraʊnd/", pos: "noun", level: "work", definition: "The time it takes to complete a task from start to finish.", example: "Their turnaround on repairs is about a week." },
  { id: "wk-36", word: "initiative", ipa: "/ɪˈnɪʃətɪv/", pos: "noun", level: "work", definition: "The ability to decide and act on your own without being told.", example: "She showed initiative by fixing the problem before anyone asked." },
  { id: "wk-37", word: "benchmark", ipa: "/ˈbɛntʃˌmɑrk/", pos: "noun", level: "work", definition: "A standard used to measure or compare performance.", example: "Last year's sales are our benchmark for this year." },
  { id: "wk-38", word: "onboard", ipa: "/ˈɑnˌbɔrd/", pos: "verb", level: "work", definition: "To help a new employee or customer get started.", example: "We onboard new hires in their first week." },
  { id: "wk-39", word: "consensus", ipa: "/kənˈsɛnsəs/", pos: "noun", level: "work", definition: "General agreement among a group.", example: "After an hour we reached consensus on the plan." },
  { id: "wk-40", word: "wrap up", ipa: "/ræp ʌp/", pos: "phrase", level: "work", definition: "To finish or bring something to an end.", example: "Let's wrap up — we're out of time." },

  // --- Travel ----------------------------------------------------------------
  { id: "tr-01", word: "itinerary", ipa: "/aɪˈtɪnəˌrɛri/", pos: "noun", level: "travel", definition: "A planned route or schedule for a journey.", example: "Our itinerary has two days in Lisbon and three in Porto." },
  { id: "tr-02", word: "layover", ipa: "/ˈleɪˌoʊvər/", pos: "noun", level: "travel", definition: "A stop between flights while traveling.", example: "We have a four-hour layover in Dallas." },
  { id: "tr-03", word: "luggage", ipa: "/ˈlʌɡɪdʒ/", pos: "noun", level: "travel", definition: "Bags and suitcases you take when traveling.", example: "Please keep your luggage with you at all times." },
  { id: "tr-04", word: "departure", ipa: "/dɪˈpɑrtʃər/", pos: "noun", level: "travel", definition: "The act of leaving, especially the start of a journey.", example: "Check the board for your departure gate." },
  { id: "tr-05", word: "customs", ipa: "/ˈkʌstəmz/", pos: "noun", level: "travel", definition: "The place at a border where officials check what you bring into a country.", example: "We waited an hour to get through customs." },
  { id: "tr-06", word: "souvenir", ipa: "/ˌsuvəˈnɪr/", pos: "noun", level: "travel", definition: "Something you keep or buy to remember a place you visited.", example: "I bought a tiny Eiffel Tower as a souvenir." },
  { id: "tr-07", word: "reservation", ipa: "/ˌrɛzərˈveɪʃən/", pos: "noun", level: "travel", definition: "An arrangement to have a room, table, or seat kept for you.", example: "I have a reservation under the name Ortiz." },
  { id: "tr-08", word: "detour", ipa: "/ˈdiˌtʊr/", pos: "noun", level: "travel", definition: "A longer route taken to avoid something or to see something else.", example: "Roadworks forced us to take a detour through the hills." },
  { id: "tr-09", word: "jet lag", ipa: "/ˈdʒɛt læɡ/", pos: "noun", level: "travel", definition: "Tiredness after a long flight across time zones.", example: "The jet lag hit me hard on the second day." },
  { id: "tr-10", word: "aisle", ipa: "/aɪl/", pos: "noun", level: "travel", definition: "The walkway between rows of seats on a plane or in a store.", example: "I'd prefer an aisle seat, please." },
  { id: "tr-11", word: "fare", ipa: "/fɛr/", pos: "noun", level: "travel", definition: "The money you pay for a journey on a bus, train, or taxi.", example: "The bus fare is two dollars each way." },
  { id: "tr-12", word: "landmark", ipa: "/ˈlændˌmɑrk/", pos: "noun", level: "travel", definition: "A famous building or place that is easy to recognize.", example: "The clock tower is the city's best-known landmark." },
  { id: "tr-13", word: "vacancy", ipa: "/ˈveɪkənsi/", pos: "noun", level: "travel", definition: "A room that is available at a hotel.", example: "The sign outside said 'no vacancy'." },
  { id: "tr-14", word: "currency", ipa: "/ˈkɜrənsi/", pos: "noun", level: "travel", definition: "The money used in a particular country.", example: "What's the local currency in Hungary?" },
  { id: "tr-15", word: "boarding pass", ipa: "/ˈbɔrdɪŋ pæs/", pos: "noun", level: "travel", definition: "The ticket you show to get on a plane.", example: "Have your boarding pass and ID ready." },
  { id: "tr-16", word: "scenic", ipa: "/ˈsinɪk/", pos: "adjective", level: "travel", definition: "Having beautiful natural views.", example: "We took the scenic route along the coast." },
  { id: "tr-17", word: "delayed", ipa: "/dɪˈleɪd/", pos: "adjective", level: "travel", definition: "Happening later than planned.", example: "Our flight was delayed by two hours." },
  { id: "tr-18", word: "backpack", ipa: "/ˈbækˌpæk/", pos: "noun", level: "travel", definition: "A bag carried on your back with two straps.", example: "Everything I need for the week fits in one backpack." },
  { id: "tr-19", word: "amenities", ipa: "/əˈmɛnətiz/", pos: "noun", level: "travel", definition: "Useful features that make a place more comfortable, such as a pool or Wi-Fi.", example: "The hotel's amenities include a gym and free breakfast." },
  { id: "tr-20", word: "destination", ipa: "/ˌdɛstəˈneɪʃən/", pos: "noun", level: "travel", definition: "The place you are traveling to.", example: "Our final destination is a small village near the lake." },
  { id: "tr-21", word: "wander off", ipa: "/ˈwɑndər ɔf/", pos: "phrase", level: "travel", definition: "To walk away from a group without telling anyone.", example: "Don't wander off — the tour leaves in ten minutes." },
  { id: "tr-22", word: "turbulence", ipa: "/ˈtɜrbjələns/", pos: "noun", level: "travel", definition: "Sudden, rough movement of air that shakes a plane.", example: "The captain warned of turbulence over the mountains." },
  { id: "tr-23", word: "check in", ipa: "/tʃɛk ɪn/", pos: "phrase", level: "travel", definition: "To report your arrival at a hotel or airport.", example: "We can check in at the hotel after two o'clock." },
  { id: "tr-24", word: "roundabout", ipa: "/ˈraʊndəˌbaʊt/", pos: "noun", level: "travel", definition: "A circular junction where traffic goes around a central island.", example: "Take the second exit at the roundabout." },
  { id: "tr-25", word: "cuisine", ipa: "/kwɪˈzin/", pos: "noun", level: "travel", definition: "A style of cooking from a particular country or region.", example: "Thai cuisine is known for its balance of sweet, sour, and spicy." },
  { id: "tr-26", word: "hostel", ipa: "/ˈhɑstəl/", pos: "noun", level: "travel", definition: "A cheap place to stay, often with shared rooms, popular with young travelers.", example: "We stayed in a hostel near the station." },
  { id: "tr-27", word: "excursion", ipa: "/ɪkˈskɜrʒən/", pos: "noun", level: "travel", definition: "A short trip, usually for pleasure, often as a group.", example: "The hotel organizes a boat excursion every morning." },
  { id: "tr-28", word: "pedestrian", ipa: "/pəˈdɛstriən/", pos: "noun", level: "travel", definition: "A person walking rather than driving.", example: "The old town is for pedestrians only." },
  { id: "tr-29", word: "shuttle", ipa: "/ˈʃʌtəl/", pos: "noun", level: "travel", definition: "A bus or train that travels regularly between two places.", example: "A free shuttle runs from the airport to the hotel." },
  { id: "tr-30", word: "overbooked", ipa: "/ˌoʊvərˈbʊkt/", pos: "adjective", level: "travel", definition: "Having sold more tickets or rooms than are actually available.", example: "The flight was overbooked, so they offered vouchers to volunteers." },
  { id: "tr-31", word: "voucher", ipa: "/ˈvaʊtʃər/", pos: "noun", level: "travel", definition: "A ticket or document that can be exchanged for goods or services.", example: "The airline gave us a meal voucher during the delay." },
  { id: "tr-32", word: "nearby", ipa: "/ˌnɪrˈbaɪ/", pos: "adverb", level: "travel", definition: "A short distance away.", example: "Is there a pharmacy nearby?" },
  { id: "tr-33", word: "sightseeing", ipa: "/ˈsaɪtˌsiɪŋ/", pos: "noun", level: "travel", definition: "Visiting interesting places as a tourist.", example: "We spent the whole afternoon sightseeing." },
  { id: "tr-34", word: "stopover", ipa: "/ˈstɑpˌoʊvər/", pos: "noun", level: "travel", definition: "A short stay somewhere during a longer journey.", example: "We planned a two-night stopover in Singapore." },
  { id: "tr-35", word: "carry-on", ipa: "/ˈkɛri ˌɑn/", pos: "noun", level: "travel", definition: "A small bag you are allowed to take onto the plane with you.", example: "Only one carry-on per passenger, please." },
  { id: "tr-36", word: "platform", ipa: "/ˈplætˌfɔrm/", pos: "noun", level: "travel", definition: "The raised area at a station where you get on a train.", example: "The train to Boston leaves from platform nine." },
  { id: "tr-37", word: "lost and found", ipa: "/lɔst ənd faʊnd/", pos: "noun", level: "travel", definition: "The office where things people have lost are kept.", example: "Try the lost and found — someone may have handed in your scarf." },
  { id: "tr-38", word: "picturesque", ipa: "/ˌpɪktʃəˈrɛsk/", pos: "adjective", level: "travel", definition: "Pretty in a charming, old-fashioned way, like a painting.", example: "The harbor is picturesque at sunset." },
  { id: "tr-39", word: "immigration", ipa: "/ˌɪməˈɡreɪʃən/", pos: "noun", level: "travel", definition: "The desk at a border where your passport is checked.", example: "The line at immigration moved quickly." },
  { id: "tr-40", word: "get around", ipa: "/ɡɛt əˈraʊnd/", pos: "phrase", level: "travel", definition: "To travel from place to place within a city or area.", example: "It's easy to get around by bike here." },

  // --- Big ideas -------------------------------------------------------------
  { id: "id-01", word: "perspective", ipa: "/pərˈspɛktɪv/", pos: "noun", level: "ideas", definition: "A particular way of seeing or thinking about something.", example: "Living abroad gave me a new perspective on home." },
  { id: "id-02", word: "nevertheless", ipa: "/ˌnɛvərðəˈlɛs/", pos: "adverb", level: "ideas", definition: "In spite of that; however.", example: "It was raining; nevertheless, we went for a walk." },
  { id: "id-03", word: "ambiguous", ipa: "/æmˈbɪɡjuəs/", pos: "adjective", level: "ideas", definition: "Having more than one possible meaning; unclear.", example: "His answer was ambiguous, so nobody knew if he agreed." },
  { id: "id-04", word: "elaborate", ipa: "/ɪˈlæbəˌreɪt/", pos: "verb", level: "ideas", definition: "To explain something in more detail.", example: "Could you elaborate on what you mean by 'risky'?" },
  { id: "id-05", word: "assume", ipa: "/əˈsum/", pos: "verb", level: "ideas", definition: "To accept something as true without proof.", example: "I assumed the store would be open on Sunday." },
  { id: "id-06", word: "inevitable", ipa: "/ɪnˈɛvətəbəl/", pos: "adjective", level: "ideas", definition: "Certain to happen; impossible to avoid.", example: "With no rain for months, water restrictions were inevitable." },
  { id: "id-07", word: "compromise", ipa: "/ˈkɑmprəˌmaɪz/", pos: "noun", level: "ideas", definition: "An agreement where each side gives up part of what it wanted.", example: "We reached a compromise: pizza tonight, sushi tomorrow." },
  { id: "id-08", word: "reluctant", ipa: "/rɪˈlʌktənt/", pos: "adjective", level: "ideas", definition: "Unwilling and hesitant to do something.", example: "He was reluctant to lend his car to anyone." },
  { id: "id-09", word: "contradict", ipa: "/ˌkɑntrəˈdɪkt/", pos: "verb", level: "ideas", definition: "To say the opposite of what someone else has said.", example: "The new data contradicts last year's findings." },
  { id: "id-10", word: "subtle", ipa: "/ˈsʌtəl/", pos: "adjective", level: "ideas", definition: "Small and not obvious; hard to notice.", example: "There's a subtle difference between the two shades of blue." },
  { id: "id-11", word: "crucial", ipa: "/ˈkruʃəl/", pos: "adjective", level: "ideas", definition: "Extremely important; decisive.", example: "Sleep is crucial for memory." },
  { id: "id-12", word: "consequence", ipa: "/ˈkɑnsəˌkwɛns/", pos: "noun", level: "ideas", definition: "A result or effect of an action, often a bad one.", example: "Skipping breakfast had consequences by mid-morning." },
  { id: "id-13", word: "persuade", ipa: "/pərˈsweɪd/", pos: "verb", level: "ideas", definition: "To make someone agree to do or believe something by giving reasons.", example: "She persuaded me to try the spicy option." },
  { id: "id-14", word: "bias", ipa: "/ˈbaɪəs/", pos: "noun", level: "ideas", definition: "An unfair preference for or against something, often without realizing it.", example: "Everyone has some bias toward ideas they already hold." },
  { id: "id-15", word: "genuine", ipa: "/ˈdʒɛnjuɪn/", pos: "adjective", level: "ideas", definition: "Real and sincere; not fake.", example: "Her surprise was genuine — nobody had told her." },
  { id: "id-16", word: "whereas", ipa: "/wɛrˈæz/", pos: "adverb", level: "ideas", definition: "Used to compare two different facts or situations.", example: "I like early mornings, whereas my brother sleeps till noon." },
  { id: "id-17", word: "hindsight", ipa: "/ˈhaɪndˌsaɪt/", pos: "noun", level: "ideas", definition: "Understanding something only after it has happened.", example: "In hindsight, we should have left earlier." },
  { id: "id-18", word: "trade-off", ipa: "/ˈtreɪd ˌɔf/", pos: "noun", level: "ideas", definition: "A balance where you accept less of one thing to get more of another.", example: "There's a trade-off between speed and quality." },
  { id: "id-19", word: "skeptical", ipa: "/ˈskɛptɪkəl/", pos: "adjective", level: "ideas", definition: "Doubting that something is true or will work.", example: "I'm skeptical of any diet that promises fast results." },
  { id: "id-20", word: "vague", ipa: "/veɪɡ/", pos: "adjective", level: "ideas", definition: "Not clear or specific.", example: "He gave a vague answer about when he'd be back." },
  { id: "id-21", word: "assumption", ipa: "/əˈsʌmpʃən/", pos: "noun", level: "ideas", definition: "Something believed to be true without checking.", example: "Our plan rests on the assumption that prices stay flat." },
  { id: "id-22", word: "coincidence", ipa: "/koʊˈɪnsədəns/", pos: "noun", level: "ideas", definition: "Two things happening at the same time by chance.", example: "What a coincidence — we were on the same flight!" },
  { id: "id-23", word: "emphasize", ipa: "/ˈɛmfəˌsaɪz/", pos: "verb", level: "ideas", definition: "To give special importance to something.", example: "The coach emphasized rest as much as training." },
  { id: "id-24", word: "plausible", ipa: "/ˈplɔzəbəl/", pos: "adjective", level: "ideas", definition: "Seeming likely to be true or reasonable.", example: "That's a plausible explanation, but let's check." },
  { id: "id-25", word: "overwhelming", ipa: "/ˌoʊvərˈwɛlmɪŋ/", pos: "adjective", level: "ideas", definition: "So great or strong that it is hard to deal with.", example: "The amount of choice on the menu was overwhelming." },
  { id: "id-26", word: "dilemma", ipa: "/dɪˈlɛmə/", pos: "noun", level: "ideas", definition: "A difficult choice between two options.", example: "I'm in a dilemma — stay for the party or catch the last train." },
  { id: "id-27", word: "nuance", ipa: "/ˈnuˌɑns/", pos: "noun", level: "ideas", definition: "A small, subtle difference in meaning or feeling.", example: "Translation loses a lot of nuance." },
  { id: "id-28", word: "justify", ipa: "/ˈdʒʌstəˌfaɪ/", pos: "verb", level: "ideas", definition: "To show that something is right or reasonable.", example: "How do you justify spending that much on a chair?" },
  { id: "id-29", word: "insight", ipa: "/ˈɪnˌsaɪt/", pos: "noun", level: "ideas", definition: "A clear and deep understanding of something.", example: "The interview gave us real insight into how people use the app." },
  { id: "id-30", word: "controversial", ipa: "/ˌkɑntrəˈvɜrʃəl/", pos: "adjective", level: "ideas", definition: "Causing strong disagreement between people.", example: "The new parking rules are controversial." },
  { id: "id-31", word: "underestimate", ipa: "/ˌʌndərˈɛstəˌmeɪt/", pos: "verb", level: "ideas", definition: "To think something is smaller or less important than it really is.", example: "Never underestimate how long a move takes." },
  { id: "id-32", word: "ultimately", ipa: "/ˈʌltəmətli/", pos: "adverb", level: "ideas", definition: "In the end; finally, after everything else.", example: "Ultimately, it's your decision." },
  { id: "id-33", word: "resilient", ipa: "/rɪˈzɪljənt/", pos: "adjective", level: "ideas", definition: "Able to recover quickly from difficulties.", example: "Kids are more resilient than we give them credit for." },
  { id: "id-34", word: "convey", ipa: "/kənˈveɪ/", pos: "verb", level: "ideas", definition: "To communicate an idea or feeling.", example: "A single photo conveyed more than the whole article." },
  { id: "id-35", word: "irony", ipa: "/ˈaɪrəni/", pos: "noun", level: "ideas", definition: "A situation that is the opposite of what you would expect, often in a funny way.", example: "The irony is that the fire station burned down." },
  { id: "id-36", word: "meanwhile", ipa: "/ˈminˌwaɪl/", pos: "adverb", level: "ideas", definition: "At the same time as something else is happening.", example: "I'll set the table; meanwhile, you finish the sauce." },
  { id: "id-37", word: "hesitate", ipa: "/ˈhɛzəˌteɪt/", pos: "verb", level: "ideas", definition: "To pause before doing something because you are unsure.", example: "Don't hesitate to ask if anything is unclear." },
  { id: "id-38", word: "feasible", ipa: "/ˈfizəbəl/", pos: "adjective", level: "ideas", definition: "Possible and practical to do.", example: "Finishing by Friday is feasible if nothing else comes up." },
  { id: "id-39", word: "acknowledge", ipa: "/ækˈnɑlɪdʒ/", pos: "verb", level: "ideas", definition: "To accept or admit that something is true or exists.", example: "He acknowledged that the plan had flaws." },
  { id: "id-40", word: "paradox", ipa: "/ˈpærəˌdɑks/", pos: "noun", level: "ideas", definition: "A statement that seems to contradict itself but may still be true.", example: "It's a paradox: the more choices we have, the less happy we are." },
];

const BY_ID = new Map(VOCABULARY.map((entry) => [entry.id, entry]));

export function vocabById(id: string): VocabWord | undefined {
  return BY_ID.get(id);
}

export function vocabForLevel(level: VocabLevel): VocabWord[] {
  return VOCABULARY.filter((entry) => entry.level === level);
}
