/* poseDetector.ts
   - Loads MediaPipe Pose (CDN pinned versions) and wires onResults callback.
   - Keeps this isolated from UI so PoseSession stays readable.
*/

"use client";

import type { Results as PoseResults } from "@mediapipe/pose";

type MediaPipeGlobals = {
  Pose?: any;
  Camera?: any;
  POSE_CONNECTIONS?: any;
  drawConnectors?: any;
  drawLandmarks?: any;
};

function mp(): MediaPipeGlobals {
  return globalThis as any;
}

async function loadScriptOnce(src: string): Promise<void> {
  if (typeof document === "undefined") return;
  const existing = document.querySelector(`script[data-mp-src="${src}"]`) as HTMLScriptElement | null;
  if (existing?.dataset.loaded === "true") return;

  await new Promise<void>((resolve, reject) => {
    const s = existing ?? document.createElement("script");
    s.src = src;
    s.async = true;
    s.defer = true;
    s.dataset.mpSrc = src;
    s.onload = () => {
      s.dataset.loaded = "true";
      resolve();
    };
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    if (!existing) document.head.appendChild(s);
  });
}

export const MEDIAPIPE_VERSIONS = {
  camera_utils: "0.3.1675466862",
  drawing_utils: "0.3.1675466124",
  pose: "0.5.1675469404"
} as const;

export async function loadMediaPipePose(): Promise<void> {
  await loadScriptOnce(`https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@${MEDIAPIPE_VERSIONS.camera_utils}/camera_utils.js`);
  await loadScriptOnce(`https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@${MEDIAPIPE_VERSIONS.drawing_utils}/drawing_utils.js`);
  await loadScriptOnce(`https://cdn.jsdelivr.net/npm/@mediapipe/pose@${MEDIAPIPE_VERSIONS.pose}/pose.js`);
}

export function getPoseConnections() {
  return mp().POSE_CONNECTIONS ?? null;
}

export function getDrawingFns() {
  return { drawConnectors: mp().drawConnectors, drawLandmarks: mp().drawLandmarks };
}

export function createPose(onResults: (r: PoseResults) => void) {
  const PoseCtor = mp().Pose;
  if (typeof PoseCtor !== "function") {
    throw new Error("MediaPipe Pose is not available. Ensure CDN scripts can be loaded.");
  }

  const pose = new PoseCtor({
    locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@${MEDIAPIPE_VERSIONS.pose}/${file}`
  });

  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  pose.onResults(onResults);
  return pose;
}

export function createCamera(videoEl: HTMLVideoElement, onFrame: () => Promise<void>, width = 720, height = 540) {
  const CameraCtor = mp().Camera;
  if (typeof CameraCtor !== "function") {
    throw new Error("MediaPipe Camera is not available. Ensure camera_utils CDN script can be loaded.");
  }
  return new CameraCtor(videoEl, { onFrame, width, height });
}

export type CameraFacingMode = "user" | "environment";

export function createCameraWithFacingMode(
  videoEl: HTMLVideoElement,
  onFrame: () => Promise<void>,
  opts: { width?: number; height?: number; facingMode?: CameraFacingMode } = {}
) {
  const CameraCtor = mp().Camera;
  if (typeof CameraCtor !== "function") {
    throw new Error("MediaPipe Camera is not available. Ensure camera_utils CDN script can be loaded.");
  }
  return new CameraCtor(videoEl, {
    onFrame,
    width: opts.width ?? 720,
    height: opts.height ?? 540,
    facingMode: opts.facingMode ?? "user"
  });
}


