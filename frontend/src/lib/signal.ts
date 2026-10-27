// A tiny mutable store shared between the audio pipeline and the WebGL scene.
// It is read every animation frame, so it deliberately bypasses React state.
export const signal = {
  /** raw mic/tab loudness, 0..1 */
  level: 0,
  /** 1 while capturing audio */
  recording: 0,
  /** 1 while Gemini is generating */
  thinking: 0,
  /** bumps whenever a transcript segment lands; the scene flashes on change */
  pulse: 0,
};
