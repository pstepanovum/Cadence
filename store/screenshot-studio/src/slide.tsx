// FILE: store/screenshot-studio/src/slide.tsx
//
// One store slide: a cream or hunter-green wallpaper with soft lime glows and
// the Cadence mark drawn large and faint, a Sour Gummy kicker, a Funnel
// Display caption with a lime marker under the key words, an optional
// illustration beside the frame's corner, and the real capture in a slim
// frame that runs off the bottom edge. A missing capture shows a labelled
// placeholder, never a mock of the app.
import type { CSSProperties, ReactNode } from "react";

import type { RawManifest } from "./config-io";
import type { Slide } from "./config";
import { CAPTURE, layoutFor, type Device } from "./devices";
import { fonts, groundColors, palette } from "./theme";

/** "*word*" becomes the marked span. */
function Caption({ text, marker }: { text: string; marker: string }) {
  const parts: ReactNode[] = [];
  text.split(/(\*[^*]+\*)/).forEach((part, index) => {
    if (part.startsWith("*") && part.endsWith("*")) {
      parts.push(
        <span key={index} style={{ background: `linear-gradient(transparent 52%, ${marker} 52%, ${marker} 92%, transparent 92%)`, padding: "0 0.06em", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>
          {part.slice(1, -1)}
        </span>,
      );
    } else if (part) {
      parts.push(<span key={index}>{part}</span>);
    }
  });
  return <>{parts}</>;
}

function Wallpaper({ W, H, ground, seed }: { W: number; H: number; ground: Slide["ground"]; seed: number }) {
  const g = groundColors(ground);
  const flip = seed % 2 === 1;
  const glow = (x: number, y: number, r: number, color: string): CSSProperties => ({
    position: "absolute",
    left: x - r,
    top: y - r,
    width: r * 2,
    height: r * 2,
    borderRadius: "50%",
    background: `radial-gradient(circle, ${color} 0%, rgba(255,255,255,0) 68%)`,
  });
  const markW = W * 1.25;
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", background: `linear-gradient(${flip ? 205 : 155}deg, ${g.from} 0%, ${g.base} 50%, ${g.to} 100%)` }}>
      <div style={glow(flip ? W * 0.92 : W * 0.08, H * 0.1, W * 0.7, g.glow)} />
      <div style={glow(flip ? W * 0.05 : W * 0.95, H * 0.62, W * 0.8, g.glow)} />
      <img
        src="/brand/mark.svg"
        alt=""
        style={{ position: "absolute", width: markW, left: flip ? W - markW * 0.55 : -markW * 0.45, top: H * 0.42, opacity: ground === "hunter" ? 0.07 : 0.06, filter: ground === "hunter" ? "brightness(0) invert(1)" : "none" }}
      />
    </div>
  );
}

function Screen({ slug, raw, width, height }: { slug: string; raw: RawManifest; width: number; height: number }) {
  const file = raw[`${slug}.png`];
  const ok = file && file.width === CAPTURE.width && file.height === CAPTURE.height;
  if (ok) return <img src={`/__raw/${slug}.png?v=${file.mtime}`} alt="" style={{ display: "block", width, height }} />;
  return (
    <div style={{ width, height, background: palette.creamSoft, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontFamily: fonts.text, color: palette.iron, fontSize: width * 0.05, padding: width * 0.1, boxSizing: "border-box" }}>
      {file ? `raw/${slug}.png is ${file.width} x ${file.height}; capture it at ${CAPTURE.width} x ${CAPTURE.height}` : `Capture raw/${slug}.png`}
    </div>
  );
}

export function SlideCanvas({ device, slide, raw, index }: { device: Device; slide: Slide; raw: RawManifest; index: number }) {
  const L = layoutFor(device);
  const g = groundColors(slide.ground);
  const size = L.captionSize;
  const illustrationH = L.frameTop - L.captionTop - size * 3.2;
  return (
    <div data-slide-canvas="" style={{ position: "relative", width: L.W, height: L.H, overflow: "hidden", flexShrink: 0 }}>
      <Wallpaper W={L.W} H={L.H} ground={slide.ground} seed={index} />

      <div style={{ position: "absolute", top: L.captionTop, left: (L.W - L.captionWidth) / 2, width: L.captionWidth, display: "flex", flexDirection: "column", alignItems: "center", gap: size * 0.3, textAlign: "center" }}>
        {slide.kicker ? (
          <span style={{ fontFamily: fonts.kicker, fontWeight: 700, fontSize: size * 0.36, letterSpacing: "0.02em", color: g.kicker, textTransform: "uppercase" }}>{slide.kicker}</span>
        ) : null}
        <h1 style={{ margin: 0, fontFamily: fonts.text, fontWeight: 700, fontSize: size, lineHeight: 1.06, letterSpacing: "-0.03em", color: g.text, textWrap: "balance" }}>
          <Caption text={slide.caption} marker={slide.ground === "hunter" ? "rgba(167,201,87,0.55)" : g.marker} />
        </h1>
        {slide.subtitle ? (
          <p style={{ margin: 0, maxWidth: slide.illustration ? L.captionWidth * 0.72 : L.captionWidth, fontFamily: fonts.text, fontWeight: 500, fontSize: size * 0.4, lineHeight: 1.3, color: g.muted, textWrap: "balance" }}>{slide.subtitle}</p>
        ) : null}
      </div>

      {slide.illustration && illustrationH > 40 ? (
        <img
          src={`/illustration/${slide.illustration}.svg`}
          alt=""
          style={{ position: "absolute", height: Math.min(illustrationH, L.W * 0.3), right: index % 2 === 0 ? L.frameLeft * 0.2 : undefined, left: index % 2 === 1 ? L.frameLeft * 0.2 : undefined, top: L.frameTop - Math.min(illustrationH, L.W * 0.3) * 1.04, zIndex: 2 }}
        />
      ) : null}

      <div
        style={{
          position: "absolute",
          top: L.frameTop,
          left: L.frameLeft,
          width: L.frameW,
          padding: L.bezel,
          boxSizing: "border-box",
          borderRadius: L.radius,
          background: palette.carbon,
          boxShadow: `0 ${L.W * 0.03}px ${L.W * 0.08}px rgba(33,37,41,0.28), inset 0 0 0 ${Math.max(1, L.bezel * 0.18)}px #3a4046`,
        }}
      >
        <div style={{ borderRadius: L.radius - L.bezel, overflow: "hidden", width: L.screenW, height: L.screenH }}>
          <Screen slug={slide.slug} raw={raw} width={L.screenW} height={L.screenH} />
        </div>
      </div>
    </div>
  );
}

/** The subscription review screenshot: the paywall capture itself, unframed. */
export function IapReviewCanvas({ slug, raw, width, height }: { slug: string; raw: RawManifest; width: number; height: number }) {
  return (
    <div style={{ width, height }}>
      <Screen slug={slug} raw={raw} width={width} height={height} />
    </div>
  );
}
