// FILE: store/screenshot-studio/src/dashboard.tsx
//
// Every slide side by side at preview scale, with its fields: kicker,
// caption (*asterisks* mark the lime words), subtitle, ground and
// illustration. Save writes config/slides.config.json; the export reads it.
// Captures are picked up again every few seconds.
import { useEffect, useState } from "react";

import { loadConfig, loadRawManifest, saveConfig, type RawManifest } from "./config-io";
import type { Slide, StudioConfig } from "./config";
import { CAPTURE, DEVICES, layoutFor } from "./devices";
import { SlideCanvas } from "./slide";
import { ILLUSTRATIONS } from "./theme";

const PREVIEW_WIDTH = 260;

export function Dashboard() {
  const [config, setConfig] = useState<StudioConfig | null>(null);
  const [raw, setRaw] = useState<RawManifest>({});
  const [deviceId, setDeviceId] = useState(DEVICES[0].id);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void loadConfig().then(setConfig);
    const refresh = () => void loadRawManifest().then(setRaw);
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, []);

  if (!config) return <p className="dash-note">Loading…</p>;
  const device = DEVICES.find((d) => d.id === deviceId) ?? DEVICES[0];
  const scale = PREVIEW_WIDTH / layoutFor(device).W;

  const update = (index: number, patch: Partial<Slide>) => {
    setConfig({ ...config, slides: config.slides.map((slide, i) => (i === index ? { ...slide, ...patch } : slide)) });
    setStatus("Unsaved changes");
  };

  return (
    <main className="dash">
      <header className="dash-head">
        <h1>Cadence screenshots</h1>
        <label>
          Size{" "}
          <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>
            {DEVICES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void saveConfig(config).then((ok) => setStatus(ok ? "Saved" : "Save failed"))}>
          Save
        </button>
        <span className="dash-note">{status}</span>
      </header>
      <p className="dash-note">
        Captures: store/screenshots/raw/&lt;slug&gt;.png at {CAPTURE.width} x {CAPTURE.height}. Export with <code>npm run export</code>.
      </p>
      <section className="dash-grid">
        {config.slides.map((slide, index) => {
          const file = raw[`${slide.slug}.png`];
          const state = !file ? "missing" : file.width === CAPTURE.width && file.height === CAPTURE.height ? "capture" : `wrong size ${file.width} x ${file.height}`;
          return (
            <article key={slide.slug} className="dash-card">
              <div className="dash-preview" style={{ width: PREVIEW_WIDTH, height: layoutFor(device).H * scale }}>
                <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
                  <SlideCanvas device={device} slide={slide} raw={raw} index={index} />
                </div>
              </div>
              <p className={`dash-state dash-${state === "capture" ? "ok" : "warn"}`}>
                {index + 1}. {slide.slug}: {state}
              </p>
              <label>
                Kicker
                <input value={slide.kicker} onChange={(event) => update(index, { kicker: event.target.value })} />
              </label>
              <label>
                Caption
                <input value={slide.caption} onChange={(event) => update(index, { caption: event.target.value })} />
              </label>
              <label>
                Subtitle
                <input value={slide.subtitle} onChange={(event) => update(index, { subtitle: event.target.value })} />
              </label>
              <label>
                Ground
                <select value={slide.ground} onChange={(event) => update(index, { ground: event.target.value as Slide["ground"] })}>
                  <option value="cream">Cream</option>
                  <option value="hunter">Hunter green</option>
                </select>
              </label>
              <label>
                Illustration
                <select value={slide.illustration} onChange={(event) => update(index, { illustration: event.target.value })}>
                  <option value="">None</option>
                  {ILLUSTRATIONS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </article>
          );
        })}
      </section>
    </main>
  );
}
