# Cadence — Product Form

## What It Is

Cadence is a pronunciation coach that listens to you speak and tells you exactly what to fix, phoneme by phoneme. It runs locally on your machine or in the cloud. No tutor required.

## The Problem

Non-native speakers know their accent is off but cannot pinpoint why. Language apps grade fluency but do not show which sound is wrong or how to fix it. Human coaches are expensive and hard to schedule.

## How It Works

The user speaks a word, phrase, or sentence into the microphone. The AI Engine scores each phoneme against a native reference recording. The Coach Engine explains what is wrong in plain language and demonstrates correct pronunciation via synthesized audio. The user repeats, the score improves, and progress is saved across sessions.

## User Journey

On first visit the user chooses between running the app locally with no account or using the cloud with a login. Local mode downloads the AI models to the device and launches the Python backends. Cloud mode signs the user in and routes requests to hosted services.

Once inside the app the user picks from three experiences. Learn presents structured lessons organized by sound — the user reads a prompt, records themselves, and receives per-phoneme feedback with a coaching note. Conversation puts the user in a back-and-forth dialogue with an AI coach who scores each reply and responds naturally. AI Coach is freeform practice where the user speaks on any topic and gets running feedback.

## What the User Does (script)

The user opens the app and sees their streak and a prompt to continue the last lesson. They tap the microphone button and say the target phrase. A few seconds later they see which sounds passed and which did not, hear the reference audio, and read a one-sentence tip from the coach. They try again. After three attempts the lesson advances. At the end of a session the user sees their overall score and how it changed from last time.

## Data That Drives the App

Each session stores the lesson or topic, every phoneme score per attempt, and a timestamp. The user profile holds their native language and target accent so the coach can tailor feedback. A phoneme reference table maps each IPA symbol to a native audio sample and a short articulatory hint.

## Success Metric

A user can hear the difference between their pronunciation and the reference recording, and their phoneme scores measurably improve across five sessions.
