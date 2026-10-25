// The persistent errors the plateau track (docs/PLATFORM.md section 18)
// knows how to find and drill. Our own selection of the errors that most
// often survive into C1 and C2 speech: they are understood, so nobody corrects
// them, so they set. Each one names the grammar points and sounds whose
// feedback counts as evidence for it, so spoken-grammar feedback and phoneme
// scores can be mapped back to it.
//
// [id slug, area, title, what goes wrong, grammarPointIds, soundIds]
// area: grammar | word-choice | pronunciation | stress | intonation

export const FOSSIL_ERRORS = [
  ["present-perfect-duration", "grammar", "Present perfect for duration", "using the present simple or continuous for something that started in the past and continues ('I live here since 2019', 'I am working here for five years')", ["gp.present-perfect-for-and-since", "gp.present-perfect-continuous"], []],
  ["present-perfect-vs-past", "grammar", "Present perfect or past simple", "using the present perfect with a finished time ('I have seen him yesterday') or the past simple for life experience and recent news", ["gp.present-perfect-vs-past-simple"], []],
  ["articles-general", "grammar", "Articles with general and abstract nouns", "adding 'the' to general statements ('The life is hard', 'I like the music') or dropping 'a/the' with singular countable nouns ('She is engineer')", ["gp.articles-in-general-statements", "gp.articles-with-abstract-nouns"], []],
  ["third-person-s", "grammar", "Third-person -s in fast speech", "dropping the -s on he/she/it verbs when speaking quickly ('She work in finance', 'It depend on the client')", [], []],
  ["uncountable-nouns", "grammar", "Uncountable nouns", "pluralising or counting uncountable nouns ('informations', 'advices', 'a feedback', 'researches', 'equipments')", [], []],
  ["question-word-order", "grammar", "Word order in indirect questions", "keeping question order inside indirect questions ('Can you tell me where is the station?', 'I wonder what does it mean')", ["gp.indirect-questions", "gp.reported-questions"], []],
  ["conditionals-will", "grammar", "'Will' in if- and time clauses", "putting 'will' or 'would' in the if-clause or time clause ('If it will rain, we stay inside', 'When I will arrive, I call you', 'If I would know')", ["gp.first-conditional", "gp.second-conditional", "gp.time-clauses", "gp.third-conditional", "gp.mixed-conditionals"], []],
  ["gerund-infinitive", "grammar", "Gerund or infinitive after verbs", "choosing the wrong pattern after common verbs ('I suggest to meet', 'We look forward to hear from you', 'avoid to say', 'used to working' for past habits)", ["gp.gerund-or-infinitive", "gp.remember-stop-try-forget", "gp.be-used-to-and-get-used-to", "gp.verb-object-ing-patterns"], []],
  ["prepositions-dependent", "word-choice", "Dependent prepositions", "the wrong or an extra preposition with verbs and adjectives ('discuss about', 'depend of', 'married with', 'responsible of', 'explain me')", ["gp.complex-prepositions"], []],
  ["despite-of", "grammar", "Despite, although and however", "mixing up concession linkers ('despite of', 'although the rain', 'however' used like 'but' mid-sentence)", ["gp.despite-and-in-spite-of", "gp.although-however-though", "gp.concession-clauses"], []],
  ["make-do", "word-choice", "Make, do, take, have", "translated verb-noun collocations ('make a photo', 'do a mistake', 'make sport', 'take a decision' in American English, 'make a party')", ["gp.intensifying-collocations"], []],
  ["false-friends", "word-choice", "False friends", "words that look like a word in another language but mean something else ('actual' for current, 'eventually' for possibly, 'sympathetic' for nice, 'propose' for suggest, 'control' for check)", [], []],
  ["say-tell-explain", "grammar", "Say, tell, explain and suggest", "the wrong pattern after reporting verbs ('He said me that', 'She told that she was late', 'Can you explain me', 'He suggested me to wait')", ["gp.reported-statements", "gp.reporting-verbs", "gp.nuanced-reporting-verbs"], []],
  ["since-for-ago", "grammar", "For, since, ago and during", "mixing up time words ('since three years', 'before two weeks' for 'two weeks ago', 'during three hours')", ["gp.present-perfect-for-and-since"], []],
  ["would-for-wishes", "grammar", "Wish, if only and regrets", "using 'would' or the simple past wrongly after 'wish' ('I wish I would have more time', 'I wish I didn't say that')", ["gp.wish-and-if-only", "gp.regrets-and-hypothetical-past", "gp.should-have-and-could-have"], []],
  ["th-sounds", "pronunciation", "The two TH sounds", "replacing /θ/ and /ð/ with /t/, /d/, /s/, /z/ or /f/ ('tink', 'dis', 'sink' for think)", [], ["sound.th", "sound.dh"]],
  ["ship-sheep", "pronunciation", "Short and long i (ship and sheep)", "merging /ɪ/ and /iː/, so 'live' and 'leave', 'fit' and 'feet' sound the same", [], ["sound.ih", "sound.iy"]],
  ["v-w", "pronunciation", "V and W", "swapping or merging /v/ and /w/ ('wery well', 'vine' for 'wine')", [], ["sound.v", "sound.w"]],
  ["r-l", "pronunciation", "R and L", "confusing /r/ and /l/, or using a tapped or rolled r where English has an approximant", [], ["sound.r", "sound.l"]],
  ["final-devoicing", "pronunciation", "Voiced final consonants", "devoicing final consonants, so 'bed' sounds like 'bet', 'eyes' like 'ice', 'prize' like 'price'", [], ["sound.d", "sound.z", "sound.v", "sound.b", "sound.g"]],
  ["schwa", "pronunciation", "The weak vowel schwa", "giving every vowel its full value, so function words and unstressed syllables are never reduced ('to', 'for', 'can', 'of', the second syllable of 'problem')", [], ["sound.ax", "sound.axr"]],
  ["cup-cat-cot", "pronunciation", "Cup, cat and cot", "merging /ʌ/, /æ/ and /ɑ/ or /ɒ/, so 'cup', 'cap' and 'cop' sound alike", [], ["sound.ah", "sound.ae", "sound.aa", "sound.oh"]],
  ["word-stress", "stress", "Word stress in long words", "stressing the wrong syllable in long or related words ('deVElopment' right, 'DEvelopment' wrong; 'PHOtograph', 'phoTOgraphy', 'photoGRAphic')", [], []],
  ["noun-verb-stress", "stress", "Stress that changes the word", "the same stress for noun and verb pairs ('a REcord' and 'to reCORD', 'an INcrease' and 'to inCREASE')", [], []],
  ["sentence-stress", "stress", "Sentence stress and rhythm", "stressing every word evenly instead of the content words, so speech sounds flat and hard to follow", [], []],
  ["contrastive-stress", "intonation", "Stress for contrast and focus", "not moving the main stress to the new or contrasted word ('I said TUESday, not Thursday'; 'It's not MY problem')", [], []],
  ["question-intonation", "intonation", "Intonation in questions and tags", "rising on every question, or not using a fall on question tags that ask for agreement ('It's cold, isn't it?')", ["gp.question-tags"], []],
  ["linking", "intonation", "Linking and connected speech", "pronouncing every word separately instead of linking ('turn_it_off', 'an_apple', 'what do you' as 'whaddya' in casual speech)", [], []],
];
