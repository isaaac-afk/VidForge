import type { Clip, Effect, EffectType } from './models';

export const COLOR_EFFECT_TYPES = [
  'brightness',
  'contrast',
  'saturation',
  'exposure',
  'temperature',
  'tint'
] as const satisfies readonly EffectType[];

export type ColorEffectType = (typeof COLOR_EFFECT_TYPES)[number];

/** Read the value (-100..100) for a color effect on a clip. Missing/absent = 0. */
export function getColorValue(clip: Clip, type: ColorEffectType): number {
  const e = clip.effects.find((eff) => eff.type === type);
  if (!e || !e.enabled) return 0;
  const v = e.params['value'];
  return typeof v === 'number' ? v : 0;
}

/**
 * Return a new effects array with the value for a color type set.
 * Removing entries with value 0 keeps the schema tidy.
 */
export function withColorValue(effects: Effect[], type: ColorEffectType, value: number, idGen: () => string): Effect[] {
  const idx = effects.findIndex((e) => e.type === type);
  if (Math.abs(value) < 0.001) {
    if (idx < 0) return effects;
    return effects.filter((_, i) => i !== idx);
  }
  if (idx < 0) {
    return [
      ...effects,
      { id: idGen(), type, enabled: true, params: { value } }
    ];
  }
  return effects.map((e, i) => (i === idx ? { ...e, enabled: true, params: { ...e.params, value } } : e));
}

/**
 * Build a CSS filter string for live preview. Temperature/tint are approximated as
 * a hue rotation so the slider feels responsive even though it isn't physically accurate —
 * the export uses FFmpeg's colorbalance which IS accurate.
 */
export function cssFilterFor(clip: Clip): string {
  const parts: string[] = [];
  const b = getColorValue(clip, 'brightness');
  const c = getColorValue(clip, 'contrast');
  const s = getColorValue(clip, 'saturation');
  const e = getColorValue(clip, 'exposure');
  const t = getColorValue(clip, 'temperature');
  const tn = getColorValue(clip, 'tint');
  if (b !== 0 || e !== 0) {
    // brightness range maps -100..100 to 0..2; exposure stacks at half the strength.
    parts.push(`brightness(${(1 + b / 100 + e / 200).toFixed(3)})`);
  }
  if (c !== 0) parts.push(`contrast(${(1 + c / 100).toFixed(3)})`);
  if (s !== 0) parts.push(`saturate(${(1 + s / 100).toFixed(3)})`);
  if (t !== 0) parts.push(`hue-rotate(${(-t / 10).toFixed(2)}deg)`);
  if (tn !== 0) parts.push(`hue-rotate(${(tn / 10).toFixed(2)}deg)`);
  return parts.length ? parts.join(' ') : 'none';
}

/**
 * Build the `eq=...,colorbalance=...` filter chain for FFmpeg export. Empty string if no
 * color effects are active (caller should omit it from the graph in that case).
 */
export function ffmpegColorFilter(clip: Clip): string {
  const b = getColorValue(clip, 'brightness');
  const c = getColorValue(clip, 'contrast');
  const s = getColorValue(clip, 'saturation');
  const e = getColorValue(clip, 'exposure');
  const t = getColorValue(clip, 'temperature');
  const tn = getColorValue(clip, 'tint');
  if ([b, c, s, e, t, tn].every((v) => v === 0)) return '';
  const parts: string[] = [];
  // eq: brightness -1..1, contrast -2..2 (default 1; we map 0 → 1), saturation 0..3 (default 1).
  // exposure stacks into brightness via the 1/200 ratio used in CSS.
  const eqBrightness = (b + e / 2) / 100; // -1.5..1.5 clamped naturally
  const eqContrast = 1 + c / 100; // 0..2
  const eqSaturation = 1 + s / 100; // 0..2
  parts.push(
    `eq=brightness=${eqBrightness.toFixed(4)}:contrast=${eqContrast.toFixed(4)}:saturation=${eqSaturation.toFixed(4)}`
  );
  if (t !== 0 || tn !== 0) {
    // colorbalance midtone shifts. Warm (+t) shifts toward red, cool (-t) toward blue.
    // Tint shifts magenta (+tn) vs green (-tn).
    const rm = (t / 200).toFixed(4);
    const gm = (-tn / 200).toFixed(4);
    const bm = (-t / 200).toFixed(4);
    parts.push(`colorbalance=rm=${rm}:gm=${gm}:bm=${bm}`);
  }
  return parts.join(',');
}

/** Convenience: drop all color effects from a clip's effect list. */
export function withoutColorEffects(effects: Effect[]): Effect[] {
  return effects.filter((e) => !(COLOR_EFFECT_TYPES as readonly string[]).includes(e.type));
}
