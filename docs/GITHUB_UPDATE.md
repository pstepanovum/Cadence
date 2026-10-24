# GitHub update (draft)

A short roadmap and a draft post for GitHub Discussions (Announcements). Not
posted; the owner edits and posts it.

## Roadmap

**Now (1.0)**
- The learning platform on web, desktop and iPhone from one content model:
  pronunciation, grammar by CEFR level, sentence building, matching, quizzes,
  flashcards with spaced repetition, the coach.
- The mouth map: a parametric side view of the mouth for every English sound,
  ported from the VocalTract LaTeX package.
- Accounts on Firebase, Cadence Plus for cloud AI, and an MCP connector.
- Your own Cadence stays free: pair the phone with the desktop app or a
  server at home.

**Next**
- The adaptive daily plan on screen (the shared algorithm exists; no screen
  uses it yet).
- Hand-tuned mouth-map targets reviewed (13 are marked `needsReview`).
- More content packs, and an Android build.

## Draft announcement

**Title:** Cadence 1.0: a learning platform, Firebase accounts, and your own Cadence for free

Cadence started as a pronunciation trainer. With 1.0 it becomes an
advanced-English platform you can run yourself.

**What's new**

- **Learning platform.** Grammar lessons from A1 to C2, sentence building,
  matching, quizzes and flashcards with spaced repetition, all from one
  content model shared by the web, the desktop app and the iPhone app. The
  content is our own, checked by validators, with openly licensed example
  sentences from Tatoeba.
- **Mouth map.** Every English sound has a side view of the mouth and a
  front view of the lips. It is a TypeScript port of the VocalTract LaTeX
  package (Ververidis, Schneider and Koehler, Maeda's articulatory model), so
  moving from one sound to the next is an animation of seven parameters, not
  a swap of pictures. Credits are in `NOTICE` and `CREDITS.md`.
- **Moving to Firebase.** Accounts and progress moved from Supabase to
  Firebase Authentication and Firestore. Nothing was migrated: hosted
  accounts start fresh. If you self-host, nothing changes for you; local mode
  never needed an account.
- **Your own Cadence, free.** Scoring, voices, transcription and the coach
  run on your own computer through the desktop app or `docker compose`, and
  the phone pairs with it over your Wi-Fi with a QR code. No account, no
  subscription, no cloud.
- **The iPhone app.** Practice works offline. Connect it to your own Cadence
  for free AI at home, or sign in for synced progress. Cadence Plus adds the
  hosted cloud AI anywhere and full sync across devices.
- **Connector.** An MCP endpoint at `https://cadence.pstepanov.dev/api/mcp`
  (OAuth 2.1) lets an assistant read your progress, look up grammar, quiz
  you and add flashcards.

**Self-hosting**

`docs/CONNECT_YOUR_PHONE.md` covers pairing, `docs/DEPLOY.md` covers running
the cloud pieces on your own Google Cloud project, and `docs/PLATFORM.md` is
the architecture. Issues and pull requests are welcome, especially for the
mouth-map targets marked `needsReview` and for new content packs.

**Feedback**

Tell us here what you would like next, or open an issue.
