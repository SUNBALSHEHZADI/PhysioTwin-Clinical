/* motionAnalyzer.ts
   Computes movement metrics for real-time guidance:
   - EMA FPS estimate
   - Speed (deg/sec)
   - Jerky movement detection
*/

export type FpsTracker = {
  lastFrameAt: number;
  ema: number;
};

export function updateFps(tracker: FpsTracker, nowMs: number): number | null {
  if (!tracker.lastFrameAt) {
    tracker.lastFrameAt = nowMs;
    return null;
  }
  const dt = (nowMs - tracker.lastFrameAt) / 1000;
  tracker.lastFrameAt = nowMs;
  if (dt <= 0) return null;
  const inst = 1 / dt;
  tracker.ema = tracker.ema ? tracker.ema * 0.85 + inst * 0.15 : inst;
  return tracker.ema;
}

export type AngleSpeedState = {
  last: { ts: number; angle: number } | null;
};

export function angleSpeedDegPerSec(state: AngleSpeedState, nowMs: number, angleDeg: number): number | null {
  const last = state.last;
  state.last = { ts: nowMs, angle: angleDeg };
  if (!last) return null;
  const dtSec = (nowMs - last.ts) / 1000;
  if (dtSec <= 0.05 || dtSec > 1.0) return null;
  // Signed speed: positive when angle increases, negative when decreases.
  return (angleDeg - last.angle) / dtSec;
}

export function isJerky(speedDegPerSec: number | null, threshold = 160): boolean {
  if (speedDegPerSec == null) return false;
  return Math.abs(speedDegPerSec) > threshold;
}


