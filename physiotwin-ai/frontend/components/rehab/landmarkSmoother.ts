/* landmarkSmoother.ts
   Lightweight smoothing for MediaPipe pose landmarks.
   - One Euro filter per landmark coordinate (x,y)
   - Helps reduce jitter without adding noticeable lag
*/

export type PoseLandmark = { x: number; y: number; z?: number; visibility?: number };

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

function alpha(cutoff: number, dt: number) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

class OneEuro1D {
  private xPrev: number | null = null;
  private dxPrev: number | null = null;
  private tPrev: number | null = null;

  constructor(
    private minCutoff = 1.2, // Hz
    private beta = 0.02,
    private dCutoff = 1.0 // Hz
  ) {}

  reset() {
    this.xPrev = null;
    this.dxPrev = null;
    this.tPrev = null;
  }

  filter(x: number, tMs: number) {
    if (this.tPrev == null || this.xPrev == null) {
      this.tPrev = tMs;
      this.xPrev = x;
      this.dxPrev = 0;
      return x;
    }

    const dt = clamp((tMs - this.tPrev) / 1000, 1 / 120, 1 / 5);
    this.tPrev = tMs;

    // Derivative
    const dx = (x - this.xPrev) / dt;
    const aD = alpha(this.dCutoff, dt);
    const dxHat = this.dxPrev == null ? dx : this.dxPrev + aD * (dx - this.dxPrev);
    this.dxPrev = dxHat;

    // Adaptive cutoff
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const aX = alpha(cutoff, dt);
    const xHat = this.xPrev + aX * (x - this.xPrev);
    this.xPrev = xHat;
    return xHat;
  }
}

export class LandmarkSmoother {
  private fx: OneEuro1D[] = [];
  private fy: OneEuro1D[] = [];

  constructor(private opts?: { minCutoff?: number; beta?: number; dCutoff?: number }) {}

  reset() {
    this.fx.forEach((f) => f.reset());
    this.fy.forEach((f) => f.reset());
  }

  smooth(landmarks: PoseLandmark[], tMs: number, minVis = 0.3): PoseLandmark[] {
    if (!landmarks?.length) return [];
    while (this.fx.length < landmarks.length) {
      const f = new OneEuro1D(this.opts?.minCutoff ?? 1.2, this.opts?.beta ?? 0.02, this.opts?.dCutoff ?? 1.0);
      const g = new OneEuro1D(this.opts?.minCutoff ?? 1.2, this.opts?.beta ?? 0.02, this.opts?.dCutoff ?? 1.0);
      this.fx.push(f);
      this.fy.push(g);
    }

    return landmarks.map((p, i) => {
      const vis = p.visibility ?? 1;
      // If visibility is low, keep the raw point (or previous smoothing state) to avoid "snapping".
      if (vis < minVis) return p;
      const x = this.fx[i]!.filter(p.x, tMs);
      const y = this.fy[i]!.filter(p.y, tMs);
      return { ...p, x, y };
    });
  }
}


