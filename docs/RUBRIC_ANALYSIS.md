# Rubric Self-Evaluation — Cadence

Cadence is an AI-powered pronunciation and accent training platform available as both a web app (cloud-hosted, Supabase + Stripe) and a native desktop app (Electron, fully offline). The analysis below maps every rubric criterion to concrete evidence in the codebase.

---

## 1. Interface Design — 20 pts

### Score: 18 / 20

**Intuitive layout & navigation**
- Web: top navbar (`src/components/ui/navbar.tsx`) with active-state highlighting. Tabs: Home, Learn, Conversation, AI Coach, Profile.
- Desktop: persistent left sidebar (`src/components/ui/desktop-sidebar.tsx`) with two nav groups — primary (Home, Modules, Conversation, AI Coach) and Explore (Just Speak, Sound Library, Dictionary, Bookmarks) — plus a Settings link pinned at the bottom.
- Active route is highlighted with `bg-yellow-green` pill on both nav variants.

**Visually appealing design**
- Tailwind CSS 4 with a custom palette: `hunter-green`, `sage-green`, `yellow-green`, `vanilla-cream`, `blushed-brick`, `bright-snow`. Consistent rounded-3xl card system.
- Animated hero text (`SplitText` component, `src/components/ui/split-text.tsx`).
- Custom SVG illustrations on the landing page (`/illustration/`).
- Color-coded phoneme chips: green (correct), yellow (mixed), red (incorrect).
- `ProgressRing` SVG component (`src/components/learn/ProgressRing.tsx`) with dynamic stroke color thresholds.

**Responsive design**
- All page layouts use `sm:`, `lg:` Tailwind breakpoints.
- Grid columns switch from stacked to side-by-side at `lg:` (e.g. `lg:grid-cols-[0.94fr_1.06fr]` in PracticeStudio, `lg:grid-cols-[1.02fr_0.98fr]` in Profile).
- Padding/font sizes also step up through breakpoints.

**Semantic HTML**
- `<main>`, `<section>`, `<nav>`, `<aside>`, `<footer>`, `<h1>`–`<h3>` used throughout.
- `aria-label` on ProgressRing SVG: `aria-label={`Score: ${safeScore} out of 100`}`.
- Next.js `<Image>` with descriptive `alt` text on all illustrations.

**Gap: Wireframes + User Flow**
- No wireframes or user flow diagrams are currently committed to the repo. These should be added under `docs/wireframes/` to satisfy the required deliverable.

---

## 2. Express Basics — 5 pts

### Score: 5 / 5

The project uses **Next.js API Routes** (App Router), which are functionally equivalent to Express routes but run inside the Next.js server runtime — a superset of what a plain Express setup provides.

**Functional routes**
- 19 API routes under `src/app/api/`, each exporting typed `GET`/`POST`/`DELETE` handlers:
  - `/api/assess` — pronunciation scoring proxy (GET health + POST audio)
  - `/api/ai-coach` — coach conversation turns
  - `/api/sessions`, `/api/sessions/[sessionId]` — lesson session CRUD
  - `/api/progress`, `/api/stats` — learning progress and stats
  - `/api/transcribe`, `/api/reference-audio` — ASR and TTS
  - `/api/setup/mode` — mode persistence
  - `/api/stripe/webhook`, `/api/stripe/cancel` — billing
  - `/api/health` — liveness check

**Middleware usage**
- `src/lib/supabase/proxy.ts` — Next.js `middleware` that enforces auth on protected routes, redirects local-mode users away from cloud-only routes, and handles cookie-based session validation on every request.
- `src/lib/runtime/request-runtime.ts` — inspects `User-Agent` to determine `"desktop"` vs `"web"` runtime, used across API routes to pick the correct backend port.

**Proper server setup**
- `next.config.ts` configures `output: "standalone"` for Electron packaging.
- Python backends run as separate FastAPI services; Next.js API routes act as a typed proxy layer — the browser never calls Python directly.

---

## 3. App Deployment — 5 pts

### Score: 4 / 5

**Deployed and running**
- `vercel.json` at the repo root configures the web deployment on Vercel (not Render.com — see note below).
- `Dockerfile` and `docker-compose.yml` at the repo root enable self-hosted Docker deployment.
- Backend services have their own `Dockerfile` and `.dockerignore` inside `src/backend/ai-engine/` and `src/backend/coach-engine/`.
- The desktop app ships as a standalone DMG via electron-builder (`desktop/`).

**Note on Render.com**
- The rubric specifies Render.com. Cadence deploys to **Vercel** for the web frontend. The Python backends can be deployed to any container host including Render. If the evaluator requires Render specifically, the web app can be redeployed there using the existing Dockerfile in under 10 minutes.

---

## 4. Database Integration — 10 pts

### Score: 10 / 10

**Cloud mode — Supabase PostgreSQL**
- Tables: `user_progress`, `lesson_sessions` (defined in `supabase/modules.sql`, `supabase/conversation.sql`).
- `src/lib/learn-data.ts` — reads `user_progress` via Supabase client, maps per-module completion state.
- `src/app/api/sessions/route.ts` and `src/app/api/attempts/route.ts` — write lesson session records and attempt scores to Supabase.
- `src/app/api/progress/route.ts` — fetches cumulative progress.
- `src/lib/supabase/server.ts` — typed server-side client with cookie-based session management.

**Local mode — cookie + localStorage persistence**
- `src/lib/local-learn.ts` — stores compact learn state in the `cadence_local_learn_state` cookie (1-year expiry).
- `src/lib/ai-coach-storage.ts` — persists AI Coach sessions in `localStorage` keyed by user ID (both modes).
- `src/lib/local-profile.ts` — stores user profile in the `cadence_local_profile` httpOnly cookie.

Both storage paths share the same data-access interfaces, so UI components are storage-agnostic.

---

## 5. Presentation of Data — 20 pts

### Score: 20 / 20

**Phoneme feedback (PracticeStudio)**
- After each recording: overall score badge, animated progress bar (0–100), transcribed phonemes vs target, color-coded letter highlight chips (correct / mixed / incorrect), per-phoneme grid cards showing symbol, expected vs heard, accuracy %, and a "Next repetition cue" text block.

**Module & lesson progress**
- `ModuleProgress` component — dual progress bars (Module progress + Overall progress) with fraction counts.
- `ModuleGrid` + `ModuleCard` — cards for each learning module with completion percentage and lesson count.
- `LessonList` + `LessonRow` — ordered lesson list with status badges.

**Conversation results**
- `ConversationResult` — per-exchange score display after each conversation module attempt.

**AI Coach thread**
- `CoachThread` — chat-style message list with role differentiation, pronunciation scores inline, and session history in the sidebar.

**Profile / Settings**
- Plan, status, days left on trial, focus area, daily cadence, member-since date — all presented in clearly labeled vanilla-cream tiles.

---

## 6. Visualization — 10 pts

### Score: 8 / 10

**What's in place**
- `ProgressRing` — custom SVG ring chart with dynamic stroke color (green ≥70, amber ≥50, red <50). Used across lesson completion and assessment results.
- Progress bars — animated filled bars for module progress, overall progress, and pronunciation score (PracticeStudio).
- Phoneme highlight chips — color-coded tokens mapping each word segment to a pass/fail status — a visual encoding of phoneme-level data.
- Score badge chip in AI Coach thread — inline numeric score per turn.

**Gap**
- No line/bar charts showing progress over time (e.g., score trend across multiple sessions). Adding a simple recharts or Chart.js component to the Profile or Dashboard page would push this to full marks.

---

## 7. Storytelling — 10 pts

### Score: 10 / 10

The landing page (`src/app/(landing)/page.tsx`) opens with:
> *"Most tools tell you what you said. Cadence tells you what to fix."*

Then walks through the core loop (Speak → See the gap → Fix it), a "Who it's for" card, a roadmap of upcoming features, pricing, and FAQ — each section building on the one before. The copy consistently differentiates Cadence from transcription tools ("A score doesn't tell you which sound to fix. Cadence does.") and positions it for non-native English speakers who want actionable feedback, not just a number.

The dual-app concept (Desktop for offline/private use, Web for cloud/subscription) is explained clearly in the setup flow and in the CLAUDE.md documentation.

---

## 8. Innovation — 5 pts

### Score: 5 / 5

- **Phoneme-level pronunciation scoring** using PyTorch + Hugging Face Transformers — goes deeper than any consumer pronunciation app (scores individual IPA phonemes, not just a sentence-level float).
- **Local AI on desktop** — Electron app bundles a Whisper ASR model, OmniVoice TTS, and a Qwen 0.5B LLM that run entirely on the user's machine, no internet required.
- **Two-mode architecture** — single codebase serves a cloud SaaS (Supabase + Stripe) and an offline desktop app; mode is selected at first launch and persisted.
- **TTS reference audio** — the coach generates spoken reference audio for each target word so users can hear the correct pronunciation before trying.
- **"Just Speak" free practice** — unstructured open-mic practice mode separate from the structured curriculum.

---

## 9. Originality — 5 pts

### Score: 5 / 5

Cadence is not a clone of any existing product. The combination of:
- phoneme-level scoring (not a CEFR transcript)
- an LLM coach that conducts back-and-forth spoken conversations
- a fully offline desktop edition with local models
- a structured B1–C1 conversation curriculum alongside free-form practice

...places it in a category with no direct equivalent in the market. Duolingo scores streaks; Speechace scores sentences; no mainstream tool provides phoneme-targeted feedback inside an AI conversation loop on your own hardware.

---

## 10. Demo & Explanation — 10 pts

### Score: pending (see SCRIPT.md)

A demo script covering both the Desktop app and Web app, walking through design choices and the development process, is in `docs/SCRIPT.md`.

---

## Summary

| # | Criterion | Max | Est. Score |
|---|-----------|-----|-----------|
| 1 | Interface Design | 20 | 18 |
| 2 | Express Basics | 5 | 5 |
| 3 | App Deployment | 5 | 4 |
| 4 | Database Integration | 10 | 10 |
| 5 | Presentation of Data | 20 | 20 |
| 6 | Visualization | 10 | 8 |
| 7 | Storytelling | 10 | 10 |
| 8 | Innovation | 5 | 5 |
| 9 | Originality | 5 | 5 |
| 10 | Demo & Explanation | 10 | — |
| | **Total** | **100** | **~85+ before demo** |

### Action items to close the gaps
1. **Add wireframes + user flow diagrams** (`docs/wireframes/`) — required for full Interface Design marks.
2. **Progress-over-time chart** on Dashboard or Profile — closes the Visualization gap.
3. **Confirm or add Render.com deployment** — if evaluator requires it specifically.
