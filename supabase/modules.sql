-- ============================================================
-- Cadence — modules (Learn): schema + lesson catalog seed
-- Cloud: seed with `pnpm db:cloud` or `pnpm db:cloud:modules`; wipe-only `pnpm db:cloud:clear`;
-- wipe+reseed `pnpm db:cloud:reset`; nuclear public wipe `pnpm db:cloud:clear-force`.
-- Local: Next.js reads this file from disk (no Supabase required for catalog).
-- ============================================================

-- ── Tables ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.modules (
  id            smallint PRIMARY KEY,
  slug          text     NOT NULL UNIQUE,
  title         text     NOT NULL,
  description   text     NOT NULL,
  phoneme_focus text[]   NOT NULL,
  sort_order    smallint NOT NULL,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lessons (
  id            uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id     smallint NOT NULL REFERENCES public.modules(id),
  slug          text     NOT NULL UNIQUE,
  title         text     NOT NULL,
  lesson_type   text     NOT NULL CHECK (lesson_type IN ('theory','practice','exam')),
  sort_order    smallint NOT NULL,
  theory_html   text,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (module_id, sort_order)
);

CREATE TABLE IF NOT EXISTS public.lesson_words (
  id            uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id     uuid     NOT NULL REFERENCES public.lessons(id),
  word          text     NOT NULL,
  ipa           text     NOT NULL,
  sort_order    smallint NOT NULL,
  UNIQUE (lesson_id, sort_order)
);

CREATE TABLE IF NOT EXISTS public.user_progress (
  id              uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id       smallint NOT NULL REFERENCES public.modules(id),
  is_unlocked     boolean  NOT NULL DEFAULT false,
  is_completed    boolean  NOT NULL DEFAULT false,
  best_exam_score smallint,
  unlocked_at     timestamptz,
  completed_at    timestamptz,
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, module_id)
);

CREATE TABLE IF NOT EXISTS public.lesson_attempts (
  id              uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id       uuid     NOT NULL REFERENCES public.lessons(id),
  lesson_word_id  uuid     NOT NULL REFERENCES public.lesson_words(id),
  word            text     NOT NULL,
  score           smallint NOT NULL,
  ipa_target      text     NOT NULL,
  ipa_transcript  text,
  phoneme_detail  jsonb,
  attempt_number  smallint NOT NULL DEFAULT 1,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lesson_sessions (
  id          uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id   uuid     NOT NULL REFERENCES public.lessons(id),
  module_id   smallint NOT NULL REFERENCES public.modules(id),
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  word_count  smallint DEFAULT 0,
  avg_score   smallint,
  passed      boolean
);

-- ── Row-level security ────────────────────────────────────────

ALTER TABLE public.modules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_words   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_sessions ENABLE ROW LEVEL SECURITY;

-- Static tables: public read only
CREATE POLICY "public_read_modules"      ON public.modules      FOR SELECT USING (true);
CREATE POLICY "public_read_lessons"      ON public.lessons      FOR SELECT USING (true);
CREATE POLICY "public_read_lesson_words" ON public.lesson_words FOR SELECT USING (true);

-- User-owned tables
CREATE POLICY "owner_select_progress"   ON public.user_progress  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "owner_insert_progress"   ON public.user_progress  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner_update_progress"   ON public.user_progress  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "owner_select_attempts"   ON public.lesson_attempts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "owner_insert_attempts"   ON public.lesson_attempts FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "owner_select_sessions"   ON public.lesson_sessions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "owner_insert_sessions"   ON public.lesson_sessions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner_update_sessions"   ON public.lesson_sessions FOR UPDATE USING (user_id = auth.uid());

-- ── Module seed data ─────────────────────────────────────────

INSERT INTO public.modules (id, slug, title, description, phoneme_focus, sort_order) VALUES
  (1,  'basic-short-vowels',   'Basic Short Vowels',     'Master the five core short vowel sounds: /æ/, /ɛ/, /ɪ/, /ɒ/, /ʌ/.',        ARRAY['/æ/', '/ɛ/', '/ɪ/', '/ɒ/', '/ʌ/'],                     1),
  (2,  'basic-long-vowels',    'Basic Long Vowels',      'Command the five long vowel sounds: /iː/, /ɑː/, /ɔː/, /uː/, /ɜː/.',        ARRAY['/iː/', '/ɑː/', '/ɔː/', '/uː/', '/ɜː/'],                2),
  (3,  'th-sounds',            'TH Sounds',              'Distinguish the voiced /ð/ and voiceless /θ/ — the classic English TH.',    ARRAY['/θ/', '/ð/'],                                          3),
  (4,  'v-w-distinction',      'V / W Distinction',      'Separate the /v/ and /w/ — two sounds that trip up many learners.',         ARRAY['/v/', '/w/'],                                          4),
  (5,  'r-l-distinction',      'R / L Distinction',      'Nail the /ɹ/ and /l/ contrast — a key clarity marker in English.',         ARRAY['/ɹ/', '/l/'],                                          5),
  (6,  'diphthongs',           'Diphthongs',             'Glide smoothly through the five main English diphthongs.',                  ARRAY['/eɪ/', '/aɪ/', '/ɔɪ/', '/aʊ/', '/oʊ/'],               6),
  (7,  'consonant-pairs',      'Consonant Pairs',        'Sharpen voiced/voiceless pairs: P/B, T/D, K/G.',                           ARRAY['/p/-/b/', '/t/-/d/', '/k/-/ɡ/'],                       7),
  (8,  'consonant-clusters',   'Consonant Clusters',     'Produce 3-consonant onsets: str-, spl-, scr-, spr- without insertion.',    ARRAY['/str/', '/spl/', '/skr/', '/spr/'],                     8),
  (9,  'flap-t-linking',       'Flap T & Linking',       'Smooth out the American flap-T and linking patterns in natural speech.',    ARRAY['/ɾ/', '/t/', '/ə/'],                                   9),
  (10, 'schwa-reduction',      'Schwa & Reduction',      'Reduce unstressed syllables to /ə/ for natural connected-speech rhythm.',   ARRAY['/ə/'],                                                10)
ON CONFLICT (id) DO NOTHING;

-- ── Lesson seed data ─────────────────────────────────────────
-- UUID scheme: 00000000-0000-0000-{module:04d}-{sort:012d}
-- lesson_type: theory (no words), practice (5 words), exam (5 words)

INSERT INTO public.lessons (id, module_id, slug, title, lesson_type, sort_order, theory_html) VALUES

-- Module 1: Basic Short Vowels
('00000000-0000-0000-0001-000000000001', 1, 'm1-theory',     'Short Vowels — How They Work',    'theory',   1,
 '<h2>Short Vowels</h2><p>English has five core short vowels. Each lives in a different part of your mouth.</p><ul><li><strong>/æ/</strong> — <em>cat</em>. Jaw drops, tongue flat and forward.</li><li><strong>/ɛ/</strong> — <em>bed</em>. Mid-front, relaxed.</li><li><strong>/ɪ/</strong> — <em>sit</em>. High-front, lax.</li><li><strong>/ɒ/</strong> — <em>hot</em>. Low-back, rounded lips.</li><li><strong>/ʌ/</strong> — <em>cup</em>. Central, neutral lips.</li></ul><p>The key is <strong>not</strong> to extend these sounds into diphthongs — keep them short and crisp.</p>'),
('00000000-0000-0000-0001-000000000002', 1, 'm1-practice-a', 'Practice A — /æ/, /ɛ/, /ɪ/','practice', 2, NULL),
('00000000-0000-0000-0001-000000000003', 1, 'm1-practice-b', 'Practice B — /ɒ/ and /ʌ/','practice', 3, NULL),
('00000000-0000-0000-0001-000000000004', 1, 'm1-exam',       'Module Exam',                   'exam',     4, NULL),

-- Module 2: Basic Long Vowels
('00000000-0000-0000-0002-000000000001', 2, 'm2-theory',     'Long Vowels — Length Matters',   'theory',   1,
 '<h2>Long Vowels</h2><p>Long vowels are held roughly twice as long as short ones — that length is meaningful in English.</p><ul><li><strong>/iː/</strong> — <em>feet</em>. High-front, tense lips.</li><li><strong>/ɑː/</strong> — <em>card</em>. Low-back, open jaw.</li><li><strong>/ɔː/</strong> — <em>law</em>. Mid-back, rounded lips.</li><li><strong>/uː/</strong> — <em>food</em>. High-back, rounded lips.</li><li><strong>/ɜː/</strong> — <em>bird</em>. Central, lips neutral or slightly spread.</li></ul><p>Hold each sound for a full beat — cutting it short collapses the contrast with the short vowel pair.</p>'),
('00000000-0000-0000-0002-000000000002', 2, 'm2-practice-a', 'Practice A — /iː/, /ɑː/, /uː/','practice', 2, NULL),
('00000000-0000-0000-0002-000000000003', 2, 'm2-practice-b', 'Practice B — /ɔː/ and /ɜː/','practice', 3, NULL),
('00000000-0000-0000-0002-000000000004', 2, 'm2-exam',       'Module Exam',                   'exam',     4, NULL),

-- Module 3: TH Sounds
('00000000-0000-0000-0003-000000000001', 3, 'm3-theory',     'TH — Voiced vs. Voiceless',     'theory',   1,
 '<h2>The TH Sounds</h2><p>English uses two unique dental fricatives that most languages lack entirely.</p><ul><li><strong>/θ/</strong> (voiceless) — <em>think, three, thank</em>. Place the tongue tip lightly between or just behind the upper front teeth. Push air through without vibrating your vocal cords.</li><li><strong>/ð/</strong> (voiced) — <em>the, this, that</em>. Same tongue position, but add vocal cord vibration. Feel the buzz on your throat.</li></ul><p><strong>Common mistake:</strong> replacing TH with /s/, /z/, /t/, or /d/. Keep that tongue forward!</p>'),
('00000000-0000-0000-0003-000000000002', 3, 'm3-practice-a', 'Practice A — Voiceless /θ/','practice', 2, NULL),
('00000000-0000-0000-0003-000000000003', 3, 'm3-practice-b', 'Practice B — Voiced /ð/','practice', 3, NULL),
('00000000-0000-0000-0003-000000000004', 3, 'm3-exam',       'Module Exam',                   'exam',     4, NULL),

-- Module 4: V/W
('00000000-0000-0000-0004-000000000001', 4, 'm4-theory',     'V and W — Two Very Different Sounds', 'theory', 1,
 '<h2>V vs. W</h2><p>These are frequently confused but are produced in completely different places.</p><ul><li><strong>/v/</strong> — Upper front teeth rest on lower lip. Force voiced air through that narrow gap. (<em>vine, vet, vote</em>)</li><li><strong>/w/</strong> — Lips round tightly, tongue rises toward the back. No teeth contact at all. (<em>wine, wet, walk</em>)</li></ul><p><strong>Test:</strong> Say <em>vine</em> vs. <em>wine</em> — feel the teeth on the lip for /v/ and the rounded lips for /w/.</p>'),
('00000000-0000-0000-0004-000000000002', 4, 'm4-practice-a', 'Practice A — /v/ words','practice', 2, NULL),
('00000000-0000-0000-0004-000000000003', 4, 'm4-practice-b', 'Practice B — /w/ words','practice', 3, NULL),
('00000000-0000-0000-0004-000000000004', 4, 'm4-exam',       'Module Exam',                   'exam',     4, NULL),

-- Module 5: R/L
('00000000-0000-0000-0005-000000000001', 5, 'm5-theory',     'R and L — A Critical Distinction', 'theory', 1,
 '<h2>R vs. L</h2><p>These two sounds have distinct tongue placements — mixing them changes meaning.</p><ul><li><strong>/ɹ/</strong> (American R) — Tongue tip curls back or bunches in the middle. Sides of tongue touch upper back teeth. Lips may round slightly. (<em>red, right, rice</em>)</li><li><strong>/l/</strong> — Tongue tip touches the ridge just behind your upper front teeth (alveolar ridge). (<em>led, light, lane</em>)</li></ul><p><strong>Key difference:</strong> /l/ has tongue-tip contact with the roof of the mouth; /ɹ/ does not.</p>'),
('00000000-0000-0000-0005-000000000002', 5, 'm5-practice-a', 'Practice A — R/L minimal pairs','practice', 2, NULL),
('00000000-0000-0000-0005-000000000003', 5, 'm5-practice-b', 'Practice B — More R/L words','practice', 3, NULL),
('00000000-0000-0000-0005-000000000004', 5, 'm5-exam',       'Module Exam',                   'exam',     4, NULL),

-- Module 6: Diphthongs
('00000000-0000-0000-0006-000000000001', 6, 'm6-theory',     'Diphthongs — Gliding Vowels',   'theory',   1,
 '<h2>Diphthongs</h2><p>A diphthong starts at one vowel position and glides smoothly to another within a single syllable.</p><ul><li><strong>/eɪ/</strong> — <em>face, day</em>. Starts at /ɛ/, glides to /ɪ/.</li><li><strong>/aɪ/</strong> — <em>night, fire</em>. Starts at /a/, glides to /ɪ/.</li><li><strong>/ɔɪ/</strong> — <em>boy, coin</em>. Starts at /ɔ/, glides to /ɪ/.</li><li><strong>/aʊ/</strong> — <em>mouth, town</em>. Starts at /a/, glides to /ʊ/.</li><li><strong>/oʊ/</strong> — <em>note, home</em>. Starts at /o/, glides to /ʊ/.</li></ul><p>The glide must be smooth — both parts belong in one syllable.</p>'),
('00000000-0000-0000-0006-000000000002', 6, 'm6-practice-a', 'Practice A — /eɪ/, /aɪ/, /ɔɪ/','practice', 2, NULL),
('00000000-0000-0000-0006-000000000003', 6, 'm6-practice-b', 'Practice B — /aʊ/ and /oʊ/','practice', 3, NULL),
('00000000-0000-0000-0006-000000000004', 6, 'm6-exam',       'Module Exam',                   'exam',     4, NULL),

-- Module 7: Consonant Pairs
('00000000-0000-0000-0007-000000000001', 7, 'm7-theory',     'Voiced & Voiceless Pairs',      'theory',   1,
 '<h2>Consonant Pairs</h2><p>English has three major stop consonant pairs where the only difference is voicing.</p><ul><li><strong>P/B</strong> — Both are bilabial stops. /p/ is voiceless (air only), /b/ adds vocal vibration.</li><li><strong>T/D</strong> — Both are alveolar stops. /t/ is voiceless, /d/ is voiced.</li><li><strong>K/G</strong> — Both are velar stops. /k/ is voiceless, /g/ is voiced.</li></ul><p><strong>Aspiration:</strong> In English, voiceless stops at the start of a stressed syllable get a puff of air — <em>pat</em> = /pʰæt/. Put your hand in front of your mouth to feel it.</p>'),
('00000000-0000-0000-0007-000000000002', 7, 'm7-practice-a', 'Practice A — P/B and T/D','practice', 2, NULL),
('00000000-0000-0000-0007-000000000003', 7, 'm7-practice-b', 'Practice B — K/G and mixed','practice', 3, NULL),
('00000000-0000-0000-0007-000000000004', 7, 'm7-exam',       'Module Exam',                   'exam',     4, NULL),

-- Module 8: Consonant Clusters
('00000000-0000-0000-0008-000000000001', 8, 'm8-theory',     'Consonant Clusters — No Shortcuts','theory', 1,
 '<h2>Consonant Clusters</h2><p>English allows up to three consonants before the vowel in a syllable. Every consonant must be audible.</p><ul><li><strong>str-</strong> — <em>street, strong, stream</em>. Three distinct sounds: /s/ + /t/ + /ɹ/.</li><li><strong>spl-</strong> — <em>splash, split</em>. /s/ + /p/ + /l/.</li><li><strong>scr-</strong> — <em>screen, scroll</em>. /s/ + /k/ + /ɹ/.</li><li><strong>spr-</strong> — <em>spring, spread</em>. /s/ + /p/ + /ɹ/.</li></ul><p><strong>Common error:</strong> inserting a vowel between consonants (<em>e-street</em> → /ɪstriːt/). Practise slowly, then speed up.</p>'),
('00000000-0000-0000-0008-000000000002', 8, 'm8-practice-a', 'Practice A — str- and spl-','practice', 2, NULL),
('00000000-0000-0000-0008-000000000003', 8, 'm8-practice-b', 'Practice B — scr- and spr-','practice', 3, NULL),
('00000000-0000-0000-0008-000000000004', 8, 'm8-exam',       'Module Exam',                   'exam',     4, NULL),

-- Module 9: Flap T & Linking
('00000000-0000-0000-0009-000000000001', 9, 'm9-theory',     'Flap T — The Heart of American English','theory', 1,
 '<h2>Flap T &amp; Linking</h2><p>In American English, the /t/ between two vowels (especially unstressed ones) becomes a rapid tap — almost like a /d/. This is called the <strong>flap-T</strong> (/ɾ/).</p><ul><li><em>butter</em> → /ˈbʌɾər/ (sounds like "budder")</li><li><em>water</em> → /ˈwɔːɾər/</li><li><em>better</em> → /ˈbɛɾər/</li></ul><p>The flap is produced with a single very quick tongue tap against the alveolar ridge. This is what makes American English sound fluid rather than clipped.</p><p>In words ending in unstressed <strong>-ty</strong>, the same flap applies: <em>city</em> → /ˈsɪɾi/, <em>pretty</em> → /ˈpɹɪɾi/.</p>'),
('00000000-0000-0000-0009-000000000002', 9, 'm9-practice-a', 'Practice A — -tter words','practice', 2, NULL),
('00000000-0000-0000-0009-000000000003', 9, 'm9-practice-b', 'Practice B — -ty words','practice', 3, NULL),
('00000000-0000-0000-0009-000000000004', 9, 'm9-exam',       'Module Exam',                   'exam',     4, NULL),

-- Module 10: Schwa & Reduction
('00000000-0000-0000-0010-000000000001', 10, 'm10-theory',    'The Schwa — English Most Common Sound','theory', 1,
 '<h2>Schwa /ə/ — The Unstressed Vowel</h2><p>The schwa is the most frequent vowel in English. Any vowel letter can reduce to /ə/ in an unstressed syllable.</p><ul><li><em>about</em> → /əˈbaʊt/ — the first "a" is a schwa</li><li><em>support</em> → /səˈpɔːt/ — "su" reduces</li><li><em>correct</em> → /kəˈɹɛkt/ — "co" reduces</li></ul><p>The key is <strong>reducing</strong> unstressed syllables, not pronouncing every letter fully. English rhythm is stress-timed — stressed syllables are strong and clear, unstressed ones are quick and reduced to /ə/.</p><p>This reduction is what makes native English sound flowing, not robotic.</p>'),
('00000000-0000-0000-0010-000000000002', 10, 'm10-practice-a','Practice A — Initial schwa','practice', 2, NULL),
('00000000-0000-0000-0010-000000000003', 10, 'm10-practice-b','Practice B — Mid-word schwa','practice', 3, NULL),
('00000000-0000-0000-0010-000000000004', 10, 'm10-exam',      'Module Exam',                  'exam',     4, NULL)

ON CONFLICT (id) DO NOTHING;

-- ── Lesson words seed data ────────────────────────────────────

INSERT INTO public.lesson_words (lesson_id, word, ipa, sort_order) VALUES
-- M1 Practice A: /æ/ /ɛ/ /ɪ/
('00000000-0000-0000-0001-000000000002','cat', 'k æ t',   1),
('00000000-0000-0000-0001-000000000002','bed', 'b ɛ d',   2),
('00000000-0000-0000-0001-000000000002','sit', 's ɪ t',   3),
('00000000-0000-0000-0001-000000000002','pen', 'p ɛ n',   4),
('00000000-0000-0000-0001-000000000002','bit', 'b ɪ t',   5),
-- M1 Practice B: /ɒ/ /ʌ/
('00000000-0000-0000-0001-000000000003','hot', 'h ɒ t',   1),
('00000000-0000-0000-0001-000000000003','cup', 'k ʌ p',   2),
('00000000-0000-0000-0001-000000000003','dot', 'd ɒ t',   3),
('00000000-0000-0000-0001-000000000003','bus', 'b ʌ s',   4),
('00000000-0000-0000-0001-000000000003','bat', 'b æ t',   5),
-- M1 Exam
('00000000-0000-0000-0001-000000000004','cat', 'k æ t',   1),
('00000000-0000-0000-0001-000000000004','bed', 'b ɛ d',   2),
('00000000-0000-0000-0001-000000000004','hot', 'h ɒ t',   3),
('00000000-0000-0000-0001-000000000004','cup', 'k ʌ p',   4),
('00000000-0000-0000-0001-000000000004','sit', 's ɪ t',   5),

-- M2 Practice A: /iː/ /ɑː/ /uː/
('00000000-0000-0000-0002-000000000002','feet','f iː t',  1),
('00000000-0000-0000-0002-000000000002','card','k ɑː d',  2),
('00000000-0000-0000-0002-000000000002','food','f uː d',  3),
('00000000-0000-0000-0002-000000000002','keep','k iː p',  4),
('00000000-0000-0000-0002-000000000002','dark','d ɑː k',  5),
-- M2 Practice B: /ɔː/ /ɜː/
('00000000-0000-0000-0002-000000000003','law', 'l ɔː',    1),
('00000000-0000-0000-0002-000000000003','bird','b ɜː d',  2),
('00000000-0000-0000-0002-000000000003','more','m ɔː',    3),
('00000000-0000-0000-0002-000000000003','turn','t ɜː n',  4),
('00000000-0000-0000-0002-000000000003','cool','k uː l',  5),
-- M2 Exam
('00000000-0000-0000-0002-000000000004','feet','f iː t',  1),
('00000000-0000-0000-0002-000000000004','card','k ɑː d',  2),
('00000000-0000-0000-0002-000000000004','food','f uː d',  3),
('00000000-0000-0000-0002-000000000004','bird','b ɜː d',  4),
('00000000-0000-0000-0002-000000000004','turn','t ɜː n',  5),

-- M3 Practice A: voiceless /θ/
('00000000-0000-0000-0003-000000000002','think','θ ɪ ŋ k', 1),
('00000000-0000-0000-0003-000000000002','three','θ ɹ iː',  2),
('00000000-0000-0000-0003-000000000002','thank','θ æ ŋ k', 3),
('00000000-0000-0000-0003-000000000002','thin', 'θ ɪ n',   4),
('00000000-0000-0000-0003-000000000002','throw','θ ɹ oʊ',  5),
-- M3 Practice B: voiced /ð/
('00000000-0000-0000-0003-000000000003','the',  'ð ə',     1),
('00000000-0000-0000-0003-000000000003','this', 'ð ɪ s',   2),
('00000000-0000-0000-0003-000000000003','that', 'ð æ t',   3),
('00000000-0000-0000-0003-000000000003','them', 'ð ɛ m',   4),
('00000000-0000-0000-0003-000000000003','those','ð oʊ z',  5),
-- M3 Exam
('00000000-0000-0000-0003-000000000004','think','θ ɪ ŋ k', 1),
('00000000-0000-0000-0003-000000000004','three','θ ɹ iː',  2),
('00000000-0000-0000-0003-000000000004','this', 'ð ɪ s',   3),
('00000000-0000-0000-0003-000000000004','that', 'ð æ t',   4),
('00000000-0000-0000-0003-000000000004','thank','θ æ ŋ k', 5),

-- M4 Practice A: /v/ words
('00000000-0000-0000-0004-000000000002','vine', 'v aɪ n',  1),
('00000000-0000-0000-0004-000000000002','vet',  'v ɛ t',   2),
('00000000-0000-0000-0004-000000000002','van',  'v æ n',   3),
('00000000-0000-0000-0004-000000000002','very', 'v ɛ ɹ i', 4),
('00000000-0000-0000-0004-000000000002','vote', 'v oʊ t',  5),
-- M4 Practice B: /w/ words
('00000000-0000-0000-0004-000000000003','wine', 'w aɪ n',  1),
('00000000-0000-0000-0004-000000000003','wet',  'w ɛ t',   2),
('00000000-0000-0000-0004-000000000003','walk', 'w ɔː k',  3),
('00000000-0000-0000-0004-000000000003','voice','v ɔɪ s',  4),
('00000000-0000-0000-0004-000000000003','worry','w ɜː ɹ i',5),
-- M4 Exam
('00000000-0000-0000-0004-000000000004','vine', 'v aɪ n',  1),
('00000000-0000-0000-0004-000000000004','wine', 'w aɪ n',  2),
('00000000-0000-0000-0004-000000000004','very', 'v ɛ ɹ i', 3),
('00000000-0000-0000-0004-000000000004','walk', 'w ɔː k',  4),
('00000000-0000-0000-0004-000000000004','voice','v ɔɪ s',  5),

-- M5 Practice A: R/L minimal pairs
('00000000-0000-0000-0005-000000000002','red',  'ɹ ɛ d',   1),
('00000000-0000-0000-0005-000000000002','led',  'l ɛ d',   2),
('00000000-0000-0000-0005-000000000002','right','ɹ aɪ t',  3),
('00000000-0000-0000-0005-000000000002','light','l aɪ t',  4),
('00000000-0000-0000-0005-000000000002','rice', 'ɹ aɪ s',  5),
-- M5 Practice B: more R/L
('00000000-0000-0000-0005-000000000003','read', 'ɹ iː d',  1),
('00000000-0000-0000-0005-000000000003','road', 'ɹ oʊ d',  2),
('00000000-0000-0000-0005-000000000003','load', 'l oʊ d',  3),
('00000000-0000-0000-0005-000000000003','rain', 'ɹ eɪ n',  4),
('00000000-0000-0000-0005-000000000003','lane', 'l eɪ n',  5),
-- M5 Exam
('00000000-0000-0000-0005-000000000004','red',  'ɹ ɛ d',   1),
('00000000-0000-0000-0005-000000000004','led',  'l ɛ d',   2),
('00000000-0000-0000-0005-000000000004','right','ɹ aɪ t',  3),
('00000000-0000-0000-0005-000000000004','light','l aɪ t',  4),
('00000000-0000-0000-0005-000000000004','rain', 'ɹ eɪ n',  5),

-- M6 Practice A: /eɪ/ /aɪ/ /ɔɪ/
('00000000-0000-0000-0006-000000000002','face', 'f eɪ s',  1),
('00000000-0000-0000-0006-000000000002','fire', 'f aɪ ɹ',  2),
('00000000-0000-0000-0006-000000000002','boy',  'b ɔɪ',    3),
('00000000-0000-0000-0006-000000000002','night','n aɪ t',  4),
('00000000-0000-0000-0006-000000000002','day',  'd eɪ',    5),
-- M6 Practice B: /aʊ/ /oʊ/
('00000000-0000-0000-0006-000000000003','mouth','m aʊ θ',  1),
('00000000-0000-0000-0006-000000000003','town', 't aʊ n',  2),
('00000000-0000-0000-0006-000000000003','note', 'n oʊ t',  3),
('00000000-0000-0000-0006-000000000003','home', 'h oʊ m',  4),
('00000000-0000-0000-0006-000000000003','coin', 'k ɔɪ n',  5),
-- M6 Exam
('00000000-0000-0000-0006-000000000004','face', 'f eɪ s',  1),
('00000000-0000-0000-0006-000000000004','fire', 'f aɪ ɹ',  2),
('00000000-0000-0000-0006-000000000004','mouth','m aʊ θ',  3),
('00000000-0000-0000-0006-000000000004','night','n aɪ t',  4),
('00000000-0000-0000-0006-000000000004','coin', 'k ɔɪ n',  5),

-- M7 Practice A: P/B and T/D
('00000000-0000-0000-0007-000000000002','pat', 'p æ t',    1),
('00000000-0000-0000-0007-000000000002','bat', 'b æ t',    2),
('00000000-0000-0000-0007-000000000002','top', 't ɒ p',    3),
('00000000-0000-0000-0007-000000000002','dog', 'd ɒ ɡ',    4),
('00000000-0000-0000-0007-000000000002','tin', 't ɪ n',    5),
-- M7 Practice B: K/G and mixed
('00000000-0000-0000-0007-000000000003','cap', 'k æ p',    1),
('00000000-0000-0000-0007-000000000003','gap', 'ɡ æ p',    2),
('00000000-0000-0000-0007-000000000003','pie', 'p aɪ',     3),
('00000000-0000-0000-0007-000000000003','buy', 'b aɪ',     4),
('00000000-0000-0000-0007-000000000003','din', 'd ɪ n',    5),
-- M7 Exam
('00000000-0000-0000-0007-000000000004','pat', 'p æ t',    1),
('00000000-0000-0000-0007-000000000004','bat', 'b æ t',    2),
('00000000-0000-0000-0007-000000000004','top', 't ɒ p',    3),
('00000000-0000-0000-0007-000000000004','cap', 'k æ p',    4),
('00000000-0000-0000-0007-000000000004','gap', 'ɡ æ p',    5),

-- M8 Practice A: str- and spl-
('00000000-0000-0000-0008-000000000002','street','s t ɹ iː t', 1),
('00000000-0000-0000-0008-000000000002','strong','s t ɹ ɒ ŋ', 2),
('00000000-0000-0000-0008-000000000002','strap', 's t ɹ æ p', 3),
('00000000-0000-0000-0008-000000000002','splash','s p l æ ʃ', 4),
('00000000-0000-0000-0008-000000000002','split', 's p l ɪ t', 5),
-- M8 Practice B: scr- and spr-
('00000000-0000-0000-0008-000000000003','screen','s k ɹ iː n', 1),
('00000000-0000-0000-0008-000000000003','scroll','s k ɹ oʊ l', 2),
('00000000-0000-0000-0008-000000000003','spring','s p ɹ ɪ ŋ', 3),
('00000000-0000-0000-0008-000000000003','spread','s p ɹ ɛ d',  4),
('00000000-0000-0000-0008-000000000003','stream','s t ɹ iː m', 5),
-- M8 Exam
('00000000-0000-0000-0008-000000000004','street','s t ɹ iː t', 1),
('00000000-0000-0000-0008-000000000004','splash','s p l æ ʃ',  2),
('00000000-0000-0000-0008-000000000004','strong','s t ɹ ɒ ŋ',  3),
('00000000-0000-0000-0008-000000000004','spring','s p ɹ ɪ ŋ',  4),
('00000000-0000-0000-0008-000000000004','screen','s k ɹ iː n', 5),

-- M9 Practice A: -tter words
('00000000-0000-0000-0009-000000000002','butter','b ʌ t ə',  1),
('00000000-0000-0000-0009-000000000002','water', 'w ɔː t ə', 2),
('00000000-0000-0000-0009-000000000002','better','b ɛ t ə',  3),
('00000000-0000-0000-0009-000000000002','matter','m æ t ə',  4),
('00000000-0000-0000-0009-000000000002','letter','l ɛ t ə',  5),
-- M9 Practice B: -ty words
('00000000-0000-0000-0009-000000000003','city',  's ɪ t i',  1),
('00000000-0000-0000-0009-000000000003','party', 'p ɑː t i', 2),
('00000000-0000-0000-0009-000000000003','dirty', 'd ɜː t i', 3),
('00000000-0000-0000-0009-000000000003','thirty','θ ɜː t i', 4),
('00000000-0000-0000-0009-000000000003','pretty','p ɹ ɪ t i',5),
-- M9 Exam
('00000000-0000-0000-0009-000000000004','butter','b ʌ t ə',  1),
('00000000-0000-0000-0009-000000000004','water', 'w ɔː t ə', 2),
('00000000-0000-0000-0009-000000000004','better','b ɛ t ə',  3),
('00000000-0000-0000-0009-000000000004','city',  's ɪ t i',  4),
('00000000-0000-0000-0009-000000000004','pretty','p ɹ ɪ t i',5),

-- M10 Practice A: initial schwa
('00000000-0000-0000-0010-000000000002','about',  'ə b aʊ t',   1),
('00000000-0000-0000-0010-000000000002','above',  'ə b ʌ v',    2),
('00000000-0000-0000-0010-000000000002','ago',    'ə ɡ oʊ',     3),
('00000000-0000-0000-0010-000000000002','occur',  'ə k ɜː',     4),
('00000000-0000-0000-0010-000000000002','suppose','s ə p oʊ z', 5),
-- M10 Practice B: mid-word schwa
('00000000-0000-0000-0010-000000000003','suggest','s ə dʒ ɛ s t',1),
('00000000-0000-0000-0010-000000000003','collect','k ə l ɛ k t', 2),
('00000000-0000-0000-0010-000000000003','correct','k ə ɹ ɛ k t', 3),
('00000000-0000-0000-0010-000000000003','connect','k ə n ɛ k t', 4),
('00000000-0000-0000-0010-000000000003','support','s ə p ɔː t',  5),
-- M10 Exam
('00000000-0000-0000-0010-000000000004','about',  'ə b aʊ t',   1),
('00000000-0000-0000-0010-000000000004','above',  'ə b ʌ v',    2),
('00000000-0000-0000-0010-000000000004','suppose','s ə p oʊ z', 3),
('00000000-0000-0000-0010-000000000004','correct','k ə ɹ ɛ k t',4),
('00000000-0000-0000-0010-000000000004','connect','k ə n ɛ k t',5)

ON CONFLICT DO NOTHING;
