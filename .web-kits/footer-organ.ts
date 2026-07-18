import type { Layer, SoundDefinition } from "@web-kits/audio";
import { organ } from "./synths";

// Footer-only rescore of the project's Tom glyph roll. It keeps the exact
// fast-to-slow hit grid and final echo, but every hit uses the Synths Organ
// oscillator identity. A percussive envelope lets the Organ articulate the
// burst without turning the footer interaction into a sustained chord.
const organLayer = organ as Layer;
const FOOTER_ORGAN_HIT_DELAYS = [
  0,
  0.05,
  0.101,
  0.154,
  0.21,
  0.27,
  0.338,
  0.416,
  0.508,
] as const;

const footerOrganHit: Layer = {
  ...organLayer,
  source: { ...organLayer.source },
  envelope: {
    attack: 0.006,
    decay: 0.18,
    sustain: 0,
    release: 0.08,
  },
  gain: 0.062,
};

export const footerOrganGlyphRhythm: SoundDefinition = {
  layers: FOOTER_ORGAN_HIT_DELAYS.map((delay, index) => ({
    ...footerOrganHit,
    source: { ...footerOrganHit.source },
    envelope: { ...footerOrganHit.envelope },
    delay,
    ...(index === FOOTER_ORGAN_HIT_DELAYS.length - 1
      ? {
          effects: [
            {
              type: "delay" as const,
              time: 0.18,
              feedback: 0.24,
              mix: 0.14,
            },
          ],
        }
      : {}),
  })),
  effects: [
    {
      type: "compressor",
      threshold: -18,
      knee: 10,
      ratio: 8,
      attack: 0.003,
      release: 0.14,
    },
  ],
};
