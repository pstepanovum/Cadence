// FILE: src/lib/server/email/templates/support.ts
//
// Support mail. `support-request` carries a message from the contact form to
// the support inbox, with the writer as reply-to, so answering it in the inbox
// answers them. `support-reply` is an answer written on the owner's dashboard,
// sent to the writer with the support inbox as reply-to.
//
// Everything the writer typed is escaped and cleaned like any other prop, and
// the request's subject carries only the topic, never their words, so nothing
// they write can reach a header.
import { cleanText, compose, detailRows, escapeHtml, formatDateTime, heading, paragraph, type RenderedEmail } from "../layout";

export interface SupportRequestProps {
  /** The request's id in supportRequests. */
  requestId: string;
  topic: string;
  email: string;
  name?: string;
  message: string;
  uid?: string;
  platform?: string;
  userAgent?: string;
  at: number;
}

export interface SupportReplyProps {
  name?: string;
  /** The answer, as typed on the dashboard. */
  message: string;
  /** The first lines of what they wrote, quoted under the answer. */
  original?: string;
  topic: string;
}

const TOPICS: Record<string, string> = {
  help: "Something isn't working",
  billing: "Cadence Plus or billing",
  account: "Account or data",
  content: "A lesson, answer or sound",
  idea: "An idea",
};

/** Line breaks are kept: the text is split into paragraphs and each one is cleaned on its own. */
function paragraphsOf(text: unknown, max = 8000): string[] {
  if (typeof text !== "string") return [];
  return text
    .slice(0, max)
    .split(/\r?\n\s*\r?\n/)
    .map((part) => cleanText(part, 4000))
    .filter(Boolean);
}

export function renderSupportRequest(props: SupportRequestProps): RenderedEmail {
  const topic = TOPICS[props.topic] ?? "Support";
  const name = cleanText(props.name, 80);
  const email = cleanText(props.email, 254);
  const from = name ? `${name} <${email}>` : email;
  const paragraphs = paragraphsOf(props.message);
  const when = formatDateTime(props.at);
  const rows: [string, string][] = [
    ["From", from],
    ["Account", cleanText(props.uid, 128) || "Not signed in"],
    ["Platform", cleanText(props.platform, 20)],
    ["Request", cleanText(props.requestId, 64)],
    ["Device", cleanText(props.userAgent, 200)],
    ["Received", when],
  ];
  return compose({
    subject: `Support: ${topic}`,
    preheader: cleanText(props.message, 110) || topic,
    body: [heading(topic), ...paragraphs.map((text) => paragraph(escapeHtml(text))), detailRows(rows), paragraph("Reply to this email, or answer it from the dashboard.", { muted: true, small: true, spaceAfter: 0 })],
    text: [topic, ...paragraphs, rows.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join("\n")],
    footer: { category: "transactional", reason: "Sent from the contact form on cadence.pstepanov.dev." },
  });
}

export function renderSupportReply(props: SupportReplyProps): RenderedEmail {
  const topic = TOPICS[props.topic] ?? "your message";
  const greeting = cleanText(props.name, 40).split(" ")[0];
  const paragraphs = paragraphsOf(props.message);
  const original = cleanText(props.original, 400);
  return compose({
    subject: `Re: ${topic}`,
    preheader: cleanText(props.message, 110) || "An answer from Cadence support.",
    body: [
      greeting ? paragraph(`Hi ${escapeHtml(greeting)},`) : false,
      ...paragraphs.map((text) => paragraph(escapeHtml(text))),
      paragraph("Cadence support", { spaceAfter: 20 }),
      original ? paragraph(`You wrote: “${escapeHtml(original)}”`, { muted: true, small: true, spaceAfter: 0 }) : false,
    ],
    text: [greeting ? `Hi ${greeting},` : false, ...paragraphs, "Cadence support", original ? `You wrote: "${original}"` : false],
    footer: { category: "transactional", reason: "You're getting this because you wrote to Cadence support. Reply to this email to continue." },
  });
}
