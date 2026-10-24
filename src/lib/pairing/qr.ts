// FILE: src/lib/pairing/qr.ts
//
// QR rendering for the pairing page, server side only. `pnpm serve` draws its
// terminal QR in scripts/serve.mjs, which cannot import this TypeScript module.
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
