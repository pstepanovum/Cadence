// FILE: src/app/(landing)/connector/page.tsx
//
// How to add Cadence to an AI app as a connector (MCP, docs/PLATFORM.md
// section 8). Product names are deliberately left out: the steps are the same
// in any app that accepts a custom connector URL.
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { CopyField } from "@/components/ui/copy-field";
import { PageIntro, PageShell } from "@/components/ui/page-shell";

export const metadata: Metadata = {
  title: "Connect an AI app",
  description: "Add Cadence to an AI app as a connector: see your progress, look up grammar, take quizzes and add flashcards from a chat.",
};

const CONNECTOR_URL = `${(process.env.NEXT_PUBLIC_APP_URL ?? "https://cadence.pstepanov.dev").replace(/\/$/, "")}/api/mcp`;

const FREE_TOOLS = [
  ["Progress overview", "Streak, minutes, lessons per level and recent results."],
  ["Streak", "Your current and best streak, and whether you practised today."],
  ["Grammar lookup", "Find a grammar topic with patterns, examples and common mistakes."],
  ["Quizzes", "Start a short quiz on a level or topic and get it graded."],
  ["Add flashcards", "Send new cards to your deck; they arrive the next time you open Cadence."],
  ["Log practice", "Record practice you did elsewhere so the streak counts it."],
];

const PLUS_TOOLS = [
  ["Weak areas", "The sounds and grammar points that need the most work."],
  ["Due flashcards", "What is due today across all your devices."],
  ["Practice history", "Every attempt, filtered by date or kind."],
  ["Quiz history", "Past quizzes and their scores."],
];

const STEPS = [
  "In your AI app, open the settings for connectors (sometimes called integrations or tools) and choose to add a custom one.",
  "Paste the Cadence connector address below and save.",
  "The app opens a Cadence sign-in page. Sign in and check what it asks for, then approve.",
  "Back in the chat, ask something like “What should I practise today on Cadence?”",
];

export default function ConnectorPage() {
  return (
    <PageShell>
      <PageIntro eyebrow="Connector" title="Use Cadence from your AI app.">
        Many AI apps can connect to other services. Add Cadence and ask about your progress, practise grammar
        in a chat, or turn a conversation into flashcards.
      </PageIntro>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="min-w-0 bg-white">
          <h2 className="font-kicker text-2xl text-hunter-green">Add it in four steps</h2>
          <ol className="mt-4 space-y-3">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-3 text-sm leading-7 text-iron-grey">
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-yellow-green text-sm font-semibold text-hunter-green">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5">
            <CopyField value={CONNECTOR_URL} label="Cadence connector address" />
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-grey">
            It uses the standard connector protocol (MCP) with secure sign-in (OAuth). The AI app never sees your password.
          </p>
        </Card>
        <Card className="bg-hunter-green text-white">
          <h2 className="font-kicker text-2xl">You stay in control</h2>
          <ul className="mt-3 space-y-2 text-sm leading-7 text-white/85">
            <li>Nothing is shared until you sign in and approve.</li>
            <li>Read-only access unless you also allow adding cards and logging practice.</li>
            <li>Disconnect from the AI app at any time; access ends right away. Access also expires after 180 days.</li>
            <li>Free accounts get 30 requests an hour; Plus gets 120.</li>
          </ul>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="bg-white">
          <h2 className="font-kicker text-xl text-hunter-green">With any account</h2>
          <dl className="mt-3 space-y-3">
            {FREE_TOOLS.map(([name, text]) => (
              <div key={name}>
                <dt className="text-sm font-semibold text-hunter-green">{name}</dt>
                <dd className="text-sm leading-6 text-iron-grey">{text}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card className="bg-white">
          <h2 className="font-kicker text-xl text-hunter-green">With Cadence Plus</h2>
          <p className="mt-1 text-sm text-iron-grey">These read the detailed history that only Plus keeps on our servers.</p>
          <dl className="mt-3 space-y-3">
            {PLUS_TOOLS.map(([name, text]) => (
              <div key={name}>
                <dt className="text-sm font-semibold text-hunter-green">{name}</dt>
                <dd className="text-sm leading-6 text-iron-grey">{text}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </section>
    </PageShell>
  );
}
