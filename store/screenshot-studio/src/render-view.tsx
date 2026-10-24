// FILE: store/screenshot-studio/src/render-view.tsx
//
// Export mode (?render=1): one canvas at its natural size, no dashboard.
//   ?render=1&device=iphone-6.9&slide=0
//   ?render=1&device=iap-review
import { useEffect, useRef, useState } from "react";

import { loadConfig, loadRawManifest, markReadyWhenPainted, type RawManifest } from "./config-io";
import type { StudioConfig } from "./config";
import { IAP_REVIEW, deviceById } from "./devices";
import { IapReviewCanvas, SlideCanvas } from "./slide";

export function RenderView({ deviceId, slideIndex }: { deviceId: string; slideIndex: number }) {
  const [state, setState] = useState<{ config: StudioConfig; raw: RawManifest } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void Promise.all([loadConfig(), loadRawManifest()]).then(([config, raw]) => setState({ config, raw }));
  }, []);

  useEffect(() => {
    if (state && ref.current) void markReadyWhenPainted(ref.current);
  }, [state]);

  if (!state) return null;
  if (deviceId === IAP_REVIEW.id) {
    return (
      <div ref={ref}>
        <IapReviewCanvas slug={state.config.iapReviewSlug} raw={state.raw} width={IAP_REVIEW.width / IAP_REVIEW.exportScale} height={IAP_REVIEW.height / IAP_REVIEW.exportScale} />
      </div>
    );
  }
  const slide = state.config.slides[slideIndex];
  if (!slide) throw new Error(`No slide ${slideIndex}`);
  return (
    <div ref={ref}>
      <SlideCanvas device={deviceById(deviceId)} slide={slide} raw={state.raw} index={slideIndex} />
    </div>
  );
}
