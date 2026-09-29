# YouTube Video Description

**Title:** Cadence — AI Pronunciation Training for Non-Native English Speakers

---

Cadence is a pronunciation training platform built for non-native English speakers who want more than a score. It analyzes your speech at the phoneme level — identifying exactly which sound is off — and gives you a specific cue to fix it before your next attempt.

The platform ships as two products on a single codebase: a web app with cloud sync and subscription billing, and a native desktop app that runs entirely offline using local AI models. No internet required, no data sent anywhere.

This video walks through the full product — both the Desktop and Web sides — covering the core learning experience, the AI Coach, and the technical architecture behind it.

---

**Chapters**

00:00 — Introduction
00:30 — Mode selection: Local vs Cloud
01:15 — Dashboard and progress tracking
01:50 — Structured modules and Practice Studio
02:40 — Conversation practice (B1–C1 scenarios)
03:20 — AI Coach: freeform spoken sessions
04:10 — Just Speak and Explore
04:35 — Profile and Settings
05:00 — Tech stack and architecture

---

**How the feedback works**

After each recording, Cadence returns a full phoneme breakdown: an overall accuracy score, a transcription of what was heard versus the target, color-coded letter highlights per sound, individual phoneme cards showing expected vs. heard with accuracy percentages, and a next-step cue written in plain language. The loop is tight by design — record, see the gap, get the cue, go again.

---

**Architecture**

The frontend is built on Next.js 16 (App Router) with React 19 and Tailwind CSS 4, configured with standalone output so Electron can package it without a separate server. All pages are React Server Components — data is fetched server-side before the page renders.

The backend is split into two FastAPI services written in Python. The AI Engine handles pronunciation scoring using a fine-tuned phoneme model built on PyTorch and Hugging Face Transformers, speech transcription via Whisper, and reference audio generation via OmniVoice TTS. The Coach Engine runs a Qwen 2.5 language model for conversation turn generation.

Next.js API routes act as a typed proxy layer between the frontend and the Python services — the browser never calls the backends directly. Runtime detection inspects the User-Agent header to distinguish desktop from web and routes requests to the correct port accordingly.

Data storage is mode-dependent. Cloud mode uses Supabase (PostgreSQL with row-level security) for lesson sessions and user progress, and Stripe for subscription billing. Local mode stores progress in an httpOnly cookie and session history in localStorage — both modes share the same data-access interfaces, so UI components are storage-agnostic.

The desktop app is an Electron wrapper around the Next.js standalone build. A setup manager orchestrates first-run model downloads, service startup, and health polling, storing a manifest so subsequent launches skip the setup entirely.

---

**Stack**
- Next.js 16 · React 19 · Tailwind CSS 4 · TypeScript
- FastAPI · PyTorch · Hugging Face Transformers · Whisper · OmniVoice
- Qwen 2.5 (local LLM for AI Coach)
- Supabase (PostgreSQL + Auth)
- Stripe (billing)
- Electron (desktop app)
- Vercel (web deployment) · Docker (self-hosted)

---

#pronunciation #languagelearning #nextjs #electronapp #fastapi #buildinpublic #openSource #AI
