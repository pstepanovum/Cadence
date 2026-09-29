// FILE: src/lib/pairing/qr.ts
//
// QR rendering, server side only. The pairing page and the terminal script both
// go through here so they cannot drift in what they encode.
import "server-only";

import QRCode from "qrcode";

/**
 * Error correction level M: the payload is around 200 characters, and M keeps
 * the module count low enough to scan comfortably off a laptop screen while
 * still tolerating glare and a bit of camera blur.
 */
const OPTIONS = { errorCorrectionLevel: "M" } as const;

export async function renderQrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    ...OPTIONS,
    type: "svg",
    margin: 1,
    width: 320,
    color: { dark: "#212529", light: "#ffffff" },
  });
}

/** Block-character QR for `pnpm serve`. */
export async function renderQrTerminal(text: string): Promise<string> {
  return QRCode.toString(text, { ...OPTIONS, type: "terminal", small: true });
}
