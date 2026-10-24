// FILE: src/lib/server/email/templates/security.ts
//
// Security notices. Transactional, never optional: a learner should always
// hear about a new connection to their account.
import { appUrl, button, cleanText, compose, detailRows, escapeHtml, formatDateTime, heading, paragraph, type RenderedEmail } from "../layout";

const SECURITY_REASON = "You're getting this because we tell you about every new connection to your Cadence account.";

export interface McpAuthorizedProps {
  /** The client's own name, as it registered. Shown as data, never trusted. */
  clientName: string;
  /** Where its codes go: the host of its redirect URI. */
  destination: string;
  scopes: string[];
  at: number;
}

export function renderMcpAuthorized(props: McpAuthorizedProps): RenderedEmail {
  const name = cleanText(props.clientName, 80) || "An app";
  const destination = cleanText(props.destination, 120);
  const access = props.scopes.includes("cadence:write") ? "Read your progress, add flashcards and log practice" : "Read your progress";
  const when = formatDateTime(props.at);
  const revoke = "Didn't connect this? Disconnect it now from Connected apps in your account, then change your password.";
  return compose({
    subject: `${name} can now use your Cadence account`,
    preheader: `${access}. Disconnect it any time.`,
    body: [heading("New app connected"), paragraph(`${escapeHtml(name)} was connected to your Cadence account through the Cadence connector.`), detailRows([["App", name], ["Sends sign-ins to", destination], ["Access", access], ["When", when]]), paragraph(escapeHtml(revoke), { muted: true, spaceAfter: 20 }), button("Review connected apps", appUrl("/account/connections"))],
    text: ["New app connected", `${name} was connected to your Cadence account through the Cadence connector.`, [`App: ${name}`, destination && `Sends sign-ins to: ${destination}`, `Access: ${access}`, when && `When: ${when}`].filter(Boolean).join("\n"), revoke, `Review connected apps: ${appUrl("/account/connections")}`],
    footer: { category: "transactional", reason: SECURITY_REASON },
  });
}

export interface DevicePairedProps {
  device: string;
  platform: string;
  at: number;
}

export function renderDevicePaired(props: DevicePairedProps): RenderedEmail {
  const device = cleanText(props.device, 80) || "A new device";
  const when = formatDateTime(props.at);
  const notYou = "Don't recognise it? Remove it from Devices in your account and change your password.";
  return compose({
    subject: "A new device is syncing with your Cadence account",
    preheader: `${device} now syncs your progress.`,
    body: [heading("New device added"), paragraph("A device started syncing your Cadence progress."), detailRows([["Device", device], ["Platform", cleanText(props.platform, 40)], ["When", when]]), paragraph(escapeHtml(notYou), { muted: true, spaceAfter: 20 }), button("Review devices", appUrl("/account"))],
    text: ["New device added", "A device started syncing your Cadence progress.", [`Device: ${device}`, `Platform: ${cleanText(props.platform, 40)}`, when && `When: ${when}`].filter(Boolean).join("\n"), notYou, `Review devices: ${appUrl("/account")}`],
    footer: { category: "transactional", reason: SECURITY_REASON },
  });
}

export interface SuspiciousActivityProps {
  /** What we saw, in a few words: "12 failed sign-ins in an hour". */
  summary: string;
  at: number;
}

export function renderSuspiciousActivity(props: SuspiciousActivityProps): RenderedEmail {
  const summary = cleanText(props.summary, 140) || "Unusual sign-in attempts";
  const when = formatDateTime(props.at);
  const advice = "Your account is safe as long as your password is. If you didn't do this, choose a new, unique password now.";
  return compose({
    subject: "Unusual activity on your Cadence account",
    preheader: summary,
    body: [heading("We noticed unusual activity"), paragraph(`${escapeHtml(summary)}${when ? `, around ${escapeHtml(when)}` : ""}. We've slowed down further attempts.`), paragraph(escapeHtml(advice), { spaceAfter: 20 }), button("Change password", appUrl("/forgot-password"))],
    text: ["We noticed unusual activity", `${summary}${when ? `, around ${when}` : ""}. We've slowed down further attempts.`, advice, `Change password: ${appUrl("/forgot-password")}`],
    footer: { category: "transactional", reason: "You're getting this because we watch for attacks on Cadence accounts." },
  });
}
