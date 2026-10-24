// FILE: store/screenshot-studio/src/devices.ts
//
// Pixel sizes (shared with the export through device-sizes.json) and the
// layout maths: a slide is drawn in CSS pixels at width / exportScale and
// screenshotted at exportScale, so every size is exact.
import sizes from "./device-sizes.json";

export interface Device {
  id: string;
  label: string;
  width: number;
  height: number;
  exportScale: number;
}

export const DEVICES: Device[] = sizes.devices;
export const CAPTURE = sizes.capture;
export const IAP_REVIEW = sizes.iapReview;

export function deviceById(id: string): Device {
  const device = DEVICES.find((d) => d.id === id);
  if (!device) throw new Error(`Unknown device ${id}`);
  return device;
}

export function layoutFor(device: Device) {
  const W = device.width / device.exportScale;
  const H = device.height / device.exportScale;
  const captionTop = H * 0.06;
  const frameW = W * 0.8;
  const bezel = frameW * 0.028;
  const screenW = frameW - bezel * 2;
  const screenH = (screenW * CAPTURE.height) / CAPTURE.width;
  const frameTop = H * 0.33;
  return {
    W,
    H,
    captionTop,
    captionWidth: W * 0.84,
    captionSize: W * 0.088,
    frameW,
    frameTop,
    frameLeft: (W - frameW) / 2,
    bezel,
    screenW,
    screenH,
    radius: frameW * 0.13,
  };
}
