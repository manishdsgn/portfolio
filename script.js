import gsap from "gsap";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { slotText } from "slot-text";
import "slot-text/style.css";
import {
  defineSound,
  ensureReady as ensureWebKitsAudioReady,
  getDestination as getWebKitsAudioDestination,
  getMasterBus as getWebKitsAudioMasterBus,
  setMasterVolume as setWebKitsMasterVolume,
} from "@web-kits/audio";
import { pop as minimalPop, tap as minimalTap } from "./.web-kits/minimal.ts";
import { swoosh as organicSwoosh } from "./.web-kits/organic.ts";
import { keyPress as softKeyPress } from "./.web-kits/soft.ts";
import { tomGlyphRhythm } from "./.web-kits/drums.ts";
import { footerOrganGlyphRhythm } from "./.web-kits/footer-organ.ts";
import { noiseFiltered as synthNoiseFiltered } from "./.web-kits/synths.ts";
import { notification as mechanicalNotification } from "./.web-kits/mechanical.ts";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CustomEase } from "gsap/CustomEase";
import { SplitText } from "gsap/SplitText";

// Vercel provides the first-party collection route at deployment time. Keep
// local animation profiling free of observability requests and collect from
// both Vercel preview and production builds.
if (import.meta.env.PROD) {
  const startSpeedInsights = () => {
    import("@vercel/speed-insights")
      .then(({ injectSpeedInsights }) => injectSpeedInsights())
      .catch(() => {});
  };

  if (document.readyState === "complete") {
    window.setTimeout(startSpeedInsights, 0);
  } else {
    window.addEventListener("load", startSpeedInsights, { once: true });
  }
}

gsap.registerPlugin(ScrollTrigger, CustomEase, SplitText);
const IS_SAFARI_BROWSER =
  navigator.vendor === "Apple Computer, Inc." &&
  /Safari/.test(navigator.userAgent) &&
  !/(CriOS|FxiOS|EdgiOS|OPiOS)/.test(navigator.userAgent);
const DEV_SCROLL_ENGINE_OVERRIDE = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get("scroll-engine")
  : null;
const FORCE_NATIVE_SCROLL = DEV_SCROLL_ENGINE_OVERRIDE === "native";

function removeDefinitionEffects(definition) {
  const { effects: _effects, ...effectSafeDefinition } = definition;
  return Object.freeze(effectSafeDefinition);
}

const playGlyphSplashSound = defineSound(tomGlyphRhythm);
// @web-kits/audio 0.1 leaves definition-level effect chains connected after a
// voice ends. The shared project limiter already provides the same peak
// protection, so keep this recurring rhythm free of persistent effect nodes.
const playFooterOrganGlyphSound = defineSound(
  removeDefinitionEffects(footerOrganGlyphRhythm),
);
const playMinimalPopSound = defineSound(minimalPop);
const playMinimalTapSound = defineSound(minimalTap);
// Keep the high-frequency micro-cues dry and deterministic. Per-voice effect
// chains made overlapping Safari voices pump at different levels, while the
// project-wide limiter already provides peak control.
const introKeyPressSound = removeDefinitionEffects(softKeyPress);
const introHighlightSwoosh = removeDefinitionEffects(organicSwoosh);
const playOrganicSwooshSound = defineSound(introHighlightSwoosh);
const playSoftKeyPressSound = defineSound(introKeyPressSound);
const playMechanicalNotificationSound = defineSound(mechanicalNotification);
const playPageTransitionNoiseSound = defineSound(synthNoiseFiltered);
// Keep the authored ascending colour-note relationship, but constrain it to
// one stable register. The former octave accumulation eventually pushed the
// FM voice into a harsh/loud Safari range.
const INTRO_HIGHLIGHT_SWOOSH_SCALE = Object.freeze([
  0,
  160,
  320,
  480,
  640,
  480,
  320,
]);
const INTRO_HIGHLIGHT_SWOOSH_VOLUME = 0.28;
const INTRO_HIGHLIGHT_SWOOSH_MIN_INTERVAL_MS = 88;
const INTRO_HIGHLIGHT_SWOOSH_MAX_VOICES = 2;
const INTRO_HIGHLIGHT_SWOOSH_VOICE_LIFETIME_MS = 620;
const INTRO_HIGHLIGHT_SWOOSH_RELEASE = 0.04;
const INTRO_KEY_PRESS_VOLUME = 0.32;
const INTRO_KEY_PRESS_OVERLAP_VOLUME_SCALE = 0.5;
const INTRO_KEY_PRESS_MAX_VOICES = 2;
const INTRO_KEY_PRESS_VOICE_LIFETIME_MS = 120;
const INTRO_KEY_PRESS_RELEASE = 0.018;
const GLYPH_SPLASH_VOLUME = 0.35;
const FOOTER_ORGAN_GLYPH_VOLUME = 0.9;
const DOT_GLITCH_NOTIFICATION_VOLUME = 0.2;
const DOT_GLITCH_NOTIFICATION_MIN_INTERVAL_MS = 84;
const CAPABILITY_HIGHLIGHT_INITIAL_TAP_VOLUME = 0.62;
const CAPABILITY_HIGHLIGHT_TAP_CARD_OFFSET = 0.045;
const PAGE_TRANSITION_NOISE_VOLUME = 0.16;
const PAGE_TRANSITION_NOISE_FADE_OUT_DURATION = 0.48;
const PROJECT_AUDIO_MASTER_VOLUME = 0.5;
const PROJECT_AUDIO_UNLOCK_TIMEOUT_MS = 1400;
const GALLERY_POP_MIN_INTERVAL_MS = 110;
const CAPABILITY_TAP_MIN_INTERVAL_MS = 90;
const INTRO_KEY_PRESS_MIN_INTERVAL_MS = 28;
const INTRO_KEY_PRESS_DETUNE_PATTERN = Object.freeze([0]);
const CAMERA_AMBIENT_SOUND_PATH = "/audio/hero-ambient-swell.mp3";
const CAMERA_AMBIENT_RISE_VOLUME = 0.09;
const CAMERA_AMBIENT_PEAK_VOLUME = 0.2;
const FOOTER_AMBIENT_START_TIME = 0.55;
const FOOTER_AMBIENT_VOLUME = 0.18;
const FOOTER_AMBIENT_DURATION = 2.28;
const FOOTER_AMBIENT_FADE_OUT_DURATION = 0.86;
const AMBIENT_RELEASE_DURATION = 0.035;
let projectSoundEnabled = false;
let webKitsAudioReady = false;
let webKitsAudioUnlockPromise = null;
let projectAudioContext = null;
let projectAudioLimiter = null;
let projectAudioCeiling = null;
let ambientEncodedAudioPromise = null;
let ambientAudioBufferPromise = null;
let ambientAudioBuffer = null;
let ambientAudioBufferContext = null;
let cameraAmbientVoice = null;
let footerAmbientVoice = null;
let cameraAmbientAttempt = 0;
let footerAmbientAttempt = 0;
let pendingClickStatePop = false;
let pendingGlyphSplash = false;
let glyphSplashSampleReady = false;
let glyphSplashSampleLoadPromise = null;
let glyphSplashVoice = null;
let glyphSplashVoiceCleanupTimer = 0;
let cameraAmbientArmed = false;
let cameraAmbientPlayPending = false;
let footerAmbientPlayPending = false;
let footerAmbientEpoch = 0;
let footerAmbientRequestedEpoch = -1;
let footerAmbientPlayedEpoch = -1;
let audioNeedsTrustedUnlock = false;
let introKeyPressLastPlayedAt = Number.NEGATIVE_INFINITY;
let introKeyPressStep = 0;
const introKeyPressVoices = [];
let introHighlightSwooshLastPlayedAt = Number.NEGATIVE_INFINITY;
let introHighlightSwooshDrainTimer = 0;
let introHighlightSwooshPlayedWords = new WeakSet();
const introHighlightSwooshQueue = [];
const introHighlightSwooshVoices = [];
let pageTransitionNoiseVoice = null;
let galleryPopLastPlayedAt = Number.NEGATIVE_INFINITY;
let capabilityTapLastPlayedAt = Number.NEGATIVE_INFINITY;
let dotGlitchNotificationLastPlayedAt = Number.NEGATIVE_INFINITY;

function configureProjectAudioGraph() {
  const masterBus = getWebKitsAudioMasterBus();
  const context = masterBus.context;

  if (projectAudioContext !== context || projectAudioLimiter === null) {
    cameraAmbientVoice = null;
    footerAmbientVoice = null;
    ambientAudioBuffer = null;
    ambientAudioBufferPromise = null;
    ambientAudioBufferContext = null;
    projectAudioContext = context;
    projectAudioLimiter = context.createDynamicsCompressor();
    projectAudioCeiling = context.createGain();
    projectAudioLimiter.threshold.value = -16;
    projectAudioLimiter.knee.value = 6;
    projectAudioLimiter.ratio.value = 14;
    projectAudioLimiter.attack.value = 0.001;
    projectAudioLimiter.release.value = 0.14;
    projectAudioCeiling.gain.value = 0.82;

    try {
      masterBus.disconnect();
    } catch {
      // A newly-created bus may not have an active connection yet.
    }
    masterBus.connect(projectAudioLimiter);
    projectAudioLimiter.connect(projectAudioCeiling);
    projectAudioCeiling.connect(context.destination);

    context.addEventListener("statechange", () => {
      webKitsAudioReady = context.state === "running";
      audioNeedsTrustedUnlock = !webKitsAudioReady;
      if (webKitsAudioReady) {
        queueMicrotask(drainPendingLandmarkAudio);
      }
    });
  }

  setWebKitsMasterVolume(PROJECT_AUDIO_MASTER_VOLUME);
  if (import.meta.env.DEV) {
    window.__portfolioAudioContext = context;
  }

  return context;
}

function isProjectAudioRunning() {
  return (
    projectSoundEnabled &&
    projectAudioContext !== null &&
    projectAudioContext.state === "running"
  );
}

function preloadAmbientEncodedAudio() {
  if (ambientEncodedAudioPromise !== null) return ambientEncodedAudioPromise;

  ambientEncodedAudioPromise = fetch(CAMERA_AMBIENT_SOUND_PATH)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Unable to load ambient audio: ${response.status}`);
      }
      return response.arrayBuffer();
    })
    .catch((error) => {
      ambientEncodedAudioPromise = null;
      throw error;
    });

  return ambientEncodedAudioPromise;
}

function ensureAmbientAudioBuffer() {
  if (projectAudioContext === null) {
    return Promise.reject(new Error("AudioContext is not ready"));
  }
  if (
    ambientAudioBuffer !== null &&
    ambientAudioBufferContext === projectAudioContext
  ) {
    return Promise.resolve(ambientAudioBuffer);
  }
  if (ambientAudioBufferPromise !== null) return ambientAudioBufferPromise;

  const context = projectAudioContext;
  ambientAudioBufferPromise = preloadAmbientEncodedAudio()
    .then((encodedAudio) => context.decodeAudioData(encodedAudio.slice(0)))
    .then((decodedAudio) => {
      if (projectAudioContext !== context) {
        throw new Error("AudioContext changed while decoding ambience");
      }
      ambientAudioBuffer = decodedAudio;
      ambientAudioBufferContext = context;
      ambientAudioBufferPromise = null;
      return decodedAudio;
    })
    .catch((error) => {
      ambientAudioBufferPromise = null;
      throw error;
    });

  return ambientAudioBufferPromise;
}

function holdAndReleaseGain(gainNode, duration = AMBIENT_RELEASE_DURATION) {
  const now = gainNode.context.currentTime;
  if (typeof gainNode.gain.cancelAndHoldAtTime === "function") {
    gainNode.gain.cancelAndHoldAtTime(now);
  } else {
    const currentValue = gainNode.gain.value;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(currentValue, now);
  }
  gainNode.gain.linearRampToValueAtTime(0, now + duration);
  return now + duration;
}

function stopAmbientVoice(voice, duration = AMBIENT_RELEASE_DURATION) {
  if (voice === null) return;

  if (voice.gain.context.currentTime < voice.startTime) {
    const now = voice.gain.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(0, now);
    try {
      voice.source.stop(now);
    } catch {
      // The source may already have been stopped by route cleanup.
    }
    return;
  }

  const stopAt = holdAndReleaseGain(voice.gain, duration);
  try {
    voice.source.stop(stopAt + 0.01);
  } catch {
    // The source may already have reached its scheduled end.
  }
}

function scheduleAmbientGainEnvelope(gainNode, startTime, points) {
  gainNode.gain.cancelScheduledValues(startTime);
  gainNode.gain.setValueAtTime(0, startTime);
  let elapsed = 0;

  points.forEach(({ value, duration }) => {
    elapsed += duration;
    gainNode.gain.linearRampToValueAtTime(value, startTime + elapsed);
  });

  return elapsed;
}

async function ensureProjectAudioRunning() {
  await ensureWebKitsAudioReady();
  const context = configureProjectAudioGraph();

  if (context.state !== "running") {
    await context.resume();
  }

  webKitsAudioReady = context.state === "running";
  if (!webKitsAudioReady) {
    throw new Error(`AudioContext is ${context.state}`);
  }

  audioNeedsTrustedUnlock = false;
  ensureAmbientAudioBuffer().catch(() => {
    // Landmark cues retain their pending intent and retry on interaction.
  });
  // The UI timeout releases the startup screen, but the underlying Safari
  // resume may still complete later. Drain here as well as on statechange so
  // that late success cannot strand a requested landmark cue.
  queueMicrotask(drainPendingLandmarkAudio);
  return context;
}

function withProjectAudioTimeout(promise) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("Audio unlock timed out"));
    }, PROJECT_AUDIO_UNLOCK_TIMEOUT_MS);

    Promise.resolve(promise).then(resolve, reject).finally(() => {
      window.clearTimeout(timeoutId);
    });
  });
}

function playClickStatePop() {
  if (!projectSoundEnabled) return;

  if (!isProjectAudioRunning()) {
    pendingClickStatePop = true;
    return;
  }

  pendingClickStatePop = false;
  playMinimalPopSound();
}

function playSingleGlyphSplashVoice() {
  window.clearTimeout(glyphSplashVoiceCleanupTimer);
  glyphSplashVoiceCleanupTimer = 0;
  glyphSplashVoice?.stop(0.025);

  const voice = playGlyphSplashSound({ volume: GLYPH_SPLASH_VOLUME });
  glyphSplashVoice = voice ?? null;

  if (glyphSplashVoice === null) return;

  glyphSplashVoiceCleanupTimer = window.setTimeout(() => {
    if (glyphSplashVoice === voice) glyphSplashVoice = null;
    glyphSplashVoiceCleanupTimer = 0;
  }, 1100);
}

function primeGlyphSplashSample() {
  if (glyphSplashSampleReady) {
    if (pendingGlyphSplash && isProjectAudioRunning()) {
      pendingGlyphSplash = false;
      playSingleGlyphSplashVoice();
    }
    return Promise.resolve();
  }
  if (glyphSplashSampleLoadPromise !== null) {
    return glyphSplashSampleLoadPromise;
  }

  const sampleSource = "source" in tomGlyphRhythm
    ? tomGlyphRhythm.source
    : null;
  if (
    sampleSource === null
    || sampleSource.type !== "sample"
    || typeof sampleSource.url !== "string"
  ) {
    glyphSplashSampleReady = true;

    if (pendingGlyphSplash && isProjectAudioRunning()) {
      pendingGlyphSplash = false;
      playSingleGlyphSplashVoice();
    }

    return Promise.resolve();
  }

  const audioContext = getWebKitsAudioDestination().context;
  glyphSplashSampleLoadPromise = fetch(sampleSource.url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Unable to load glyph splash: ${response.status}`);
      }
      return response.arrayBuffer();
    })
    .then((encodedAudio) => audioContext.decodeAudioData(encodedAudio))
    .then((decodedAudio) => {
      sampleSource.buffer = decodedAudio;
      glyphSplashSampleReady = true;
      glyphSplashSampleLoadPromise = null;

      if (pendingGlyphSplash && isProjectAudioRunning()) {
        pendingGlyphSplash = false;
        playSingleGlyphSplashVoice();
      }
    })
    .catch((error) => {
      glyphSplashSampleLoadPromise = null;
      console.error("Unable to prepare the glyph splash sample.", error);
    });

  return glyphSplashSampleLoadPromise;
}

function playGlyphSplash() {
  if (!projectSoundEnabled) return;

  if (!isProjectAudioRunning() || !glyphSplashSampleReady) {
    pendingGlyphSplash = true;
    if (isProjectAudioRunning()) primeGlyphSplashSample();
    return;
  }

  playSingleGlyphSplashVoice();
}

function playFooterOrganGlyphSplash() {
  if (!isProjectAudioRunning()) return;

  playFooterOrganGlyphSound({ volume: FOOTER_ORGAN_GLYPH_VOLUME });
}

function playGalleryPop() {
  if (!isProjectAudioRunning()) return;

  const now = performance.now();
  if (now - galleryPopLastPlayedAt < GALLERY_POP_MIN_INTERVAL_MS) return;
  galleryPopLastPlayedAt = now;

  playMinimalPopSound({ volume: 0.72 });
}

function playCapabilityHighlightTap(volume = CAPABILITY_HIGHLIGHT_INITIAL_TAP_VOLUME) {
  if (
    !isProjectAudioRunning()
    || document.body.dataset.currentPage !== "work"
  ) return;

  const hasVisibleCard = capabilityCards.some((card) => {
    if (!(card instanceof HTMLElement)) return false;

    const bounds = card.getBoundingClientRect();
    return bounds.bottom > 0 && bounds.top < window.innerHeight;
  });
  if (!hasVisibleCard) return;

  const now = performance.now();
  if (now - capabilityTapLastPlayedAt < CAPABILITY_TAP_MIN_INTERVAL_MS) return;
  capabilityTapLastPlayedAt = now;

  playMinimalTapSound({ volume });
}

function playDotGlitchNotification() {
  if (!isProjectAudioRunning()) return;

  const now = performance.now();
  if (
    now - dotGlitchNotificationLastPlayedAt <
    DOT_GLITCH_NOTIFICATION_MIN_INTERVAL_MS
  ) return;
  dotGlitchNotificationLastPlayedAt = now;

  playMechanicalNotificationSound({ volume: DOT_GLITCH_NOTIFICATION_VOLUME });
}

function startPageTransitionNoise() {
  if (!isProjectAudioRunning()) return;

  pageTransitionNoiseVoice?.stop(PAGE_TRANSITION_NOISE_FADE_OUT_DURATION);
  pageTransitionNoiseVoice = playPageTransitionNoiseSound({
    volume: PAGE_TRANSITION_NOISE_VOLUME,
  });
}

function fadeOutPageTransitionNoise() {
  if (pageTransitionNoiseVoice === null) return;

  pageTransitionNoiseVoice.stop(PAGE_TRANSITION_NOISE_FADE_OUT_DURATION);
  pageTransitionNoiseVoice = null;
}

function getIntroHighlightSwooshDetune(word) {
  const highlightWords = getIntroHighlightWords();
  const wordIndex = Math.max(0, highlightWords.indexOf(word));

  return INTRO_HIGHLIGHT_SWOOSH_SCALE[
    wordIndex % INTRO_HIGHLIGHT_SWOOSH_SCALE.length
  ];
}

function removeIntroHighlightSwooshVoice(entry) {
  const entryIndex = introHighlightSwooshVoices.indexOf(entry);
  if (entryIndex !== -1) {
    introHighlightSwooshVoices.splice(entryIndex, 1);
  }
}

function stopIntroHighlightSwooshVoice(entry) {
  window.clearTimeout(entry.cleanupTimer);
  entry.voice.stop(INTRO_HIGHLIGHT_SWOOSH_RELEASE);
  removeIntroHighlightSwooshVoice(entry);
}

function playQueuedIntroHighlightSwoosh({ detune }) {
  while (
    introHighlightSwooshVoices.length >=
    INTRO_HIGHLIGHT_SWOOSH_MAX_VOICES
  ) {
    stopIntroHighlightSwooshVoice(introHighlightSwooshVoices[0]);
  }

  const entry = {
    voice: playOrganicSwooshSound({
      detune,
      volume: INTRO_HIGHLIGHT_SWOOSH_VOLUME,
    }),
    cleanupTimer: 0,
  };

  entry.cleanupTimer = window.setTimeout(() => {
    removeIntroHighlightSwooshVoice(entry);
  }, INTRO_HIGHLIGHT_SWOOSH_VOICE_LIFETIME_MS);
  introHighlightSwooshVoices.push(entry);
}

function drainIntroHighlightSwooshQueue() {
  if (introHighlightSwooshDrainTimer !== 0) return;
  if (introHighlightSwooshQueue.length === 0) return;

  if (!projectSoundEnabled) {
    introHighlightSwooshQueue.length = 0;
    return;
  }

  // Never backlog micro-cues across a Safari interruption. Releasing several
  // queued voices together on resume is perceived as a sudden loud jump.
  if (!isProjectAudioRunning()) {
    introHighlightSwooshQueue.length = 0;
    return;
  }

  const elapsed = performance.now() - introHighlightSwooshLastPlayedAt;
  const wait = Math.max(0, INTRO_HIGHLIGHT_SWOOSH_MIN_INTERVAL_MS - elapsed);

  if (wait > 0) {
    introHighlightSwooshDrainTimer = window.setTimeout(() => {
      introHighlightSwooshDrainTimer = 0;
      drainIntroHighlightSwooshQueue();
    }, Math.ceil(wait));
    return;
  }

  const nextSwoosh = introHighlightSwooshQueue.shift();
  introHighlightSwooshLastPlayedAt = performance.now();
  playQueuedIntroHighlightSwoosh(nextSwoosh);

  if (introHighlightSwooshQueue.length > 0) {
    introHighlightSwooshDrainTimer = window.setTimeout(() => {
      introHighlightSwooshDrainTimer = 0;
      drainIntroHighlightSwooshQueue();
    }, INTRO_HIGHLIGHT_SWOOSH_MIN_INTERVAL_MS);
  }
}

function playIntroHighlightSwoosh(word) {
  if (!isProjectAudioRunning()) return;
  if (!(word instanceof HTMLElement)) return;
  if (introHighlightSwooshPlayedWords.has(word)) return;

  introHighlightSwooshPlayedWords.add(word);
  introHighlightSwooshQueue.push({
    detune: getIntroHighlightSwooshDetune(word),
  });
  drainIntroHighlightSwooshQueue();
}

function resetIntroHighlightSwooshRhythm() {
  window.clearTimeout(introHighlightSwooshDrainTimer);
  introHighlightSwooshDrainTimer = 0;
  introHighlightSwooshQueue.length = 0;
  introHighlightSwooshLastPlayedAt = Number.NEGATIVE_INFINITY;
  introHighlightSwooshPlayedWords = new WeakSet();

  while (introHighlightSwooshVoices.length > 0) {
    stopIntroHighlightSwooshVoice(introHighlightSwooshVoices[0]);
  }
}

function resetIntroKeyPressRhythm() {
  introKeyPressLastPlayedAt = Number.NEGATIVE_INFINITY;
  introKeyPressStep = 0;

  while (introKeyPressVoices.length > 0) {
    stopIntroKeyPressVoice(introKeyPressVoices[0]);
  }
}

function removeIntroKeyPressVoice(entry) {
  const entryIndex = introKeyPressVoices.indexOf(entry);
  if (entryIndex !== -1) {
    introKeyPressVoices.splice(entryIndex, 1);
  }
}

function stopIntroKeyPressVoice(entry) {
  window.clearTimeout(entry.cleanupTimer);
  entry.voice.stop(INTRO_KEY_PRESS_RELEASE);
  removeIntroKeyPressVoice(entry);
}

function playIntroKeyPressRhythm() {
  if (!isProjectAudioRunning()) return;

  const now = performance.now();
  if (now - introKeyPressLastPlayedAt < INTRO_KEY_PRESS_MIN_INTERVAL_MS) return;

  const detune = INTRO_KEY_PRESS_DETUNE_PATTERN[
    introKeyPressStep % INTRO_KEY_PRESS_DETUNE_PATTERN.length
  ];
  introKeyPressLastPlayedAt = now;
  introKeyPressStep += 1;

  while (introKeyPressVoices.length >= INTRO_KEY_PRESS_MAX_VOICES) {
    stopIntroKeyPressVoice(introKeyPressVoices[0]);
  }

  const overlapScale = introKeyPressVoices.length > 0
    ? INTRO_KEY_PRESS_OVERLAP_VOLUME_SCALE
    : 1;
  const voice = playSoftKeyPressSound({
    detune,
    volume: INTRO_KEY_PRESS_VOLUME * overlapScale,
  });
  if (voice === undefined) return;

  const entry = {
    voice,
    cleanupTimer: 0,
  };
  entry.cleanupTimer = window.setTimeout(() => {
    removeIntroKeyPressVoice(entry);
  }, INTRO_KEY_PRESS_VOICE_LIFETIME_MS);
  introKeyPressVoices.push(entry);
}

function createAmbientVoice({
  buffer,
  offset,
  envelope,
  onEnded,
}) {
  if (projectAudioContext === null) return null;

  const context = projectAudioContext;
  const masterBus = getWebKitsAudioMasterBus();
  const source = context.createBufferSource();
  const gain = context.createGain();
  const startTime = context.currentTime + 0.008;
  const safeOffset = clamp(offset, 0, Math.max(0, buffer.duration - 0.001));
  source.buffer = buffer;
  // A GainNode defaults to unity. Set it silent immediately so cancelling a
  // just-scheduled cue before `startTime` can never expose a one-frame burst.
  gain.gain.setValueAtTime(0, context.currentTime);
  source.connect(gain);
  gain.connect(masterBus);
  const envelopeDuration = scheduleAmbientGainEnvelope(gain, startTime, envelope);
  const availableDuration = Math.max(0.01, buffer.duration - safeOffset);
  const stopTime = startTime + Math.min(availableDuration, envelopeDuration + 0.04);
  const voice = { source, gain, startTime, stopTime };

  source.onended = () => {
    try {
      source.disconnect();
      gain.disconnect();
    } catch {
      // Nodes may already be disconnected during route cleanup.
    }
    onEnded?.(voice);
  };
  source.start(startTime, safeOffset);
  source.stop(stopTime);
  return voice;
}

async function startCameraAmbientSwell() {
  if (
    !projectSoundEnabled ||
    !cameraAmbientArmed ||
    cameraAmbientPlayPending ||
    cameraAmbientVoice !== null
  ) return;

  if (!isProjectAudioRunning()) {
    audioNeedsTrustedUnlock = true;
    return;
  }

  cameraAmbientPlayPending = true;
  const attempt = ++cameraAmbientAttempt;

  try {
    const buffer = await ensureAmbientAudioBuffer();
    if (
      attempt !== cameraAmbientAttempt ||
      !cameraAmbientArmed ||
      !isProjectAudioRunning() ||
      !isCameraAmbientContextActive()
    ) {
      return;
    }

    cameraAmbientArmed = false;
    cameraAmbientVoice = createAmbientVoice({
      buffer,
      offset: 0,
      envelope: [
        { value: CAMERA_AMBIENT_RISE_VOLUME, duration: 0.45 },
        { value: CAMERA_AMBIENT_PEAK_VOLUME, duration: 0.75 },
        { value: 0, duration: 1.75 },
      ],
      onEnded(voice) {
        if (cameraAmbientVoice === voice) cameraAmbientVoice = null;
      },
    });
  } catch {
    if (attempt === cameraAmbientAttempt && cameraAmbientArmed) {
      audioNeedsTrustedUnlock = true;
    }
  } finally {
    if (attempt === cameraAmbientAttempt) cameraAmbientPlayPending = false;
  }
}

function isCameraAmbientContextActive() {
  if (
    !projectSoundEnabled ||
    activePageId !== "work" ||
    document.body.dataset.currentPage !== "work" ||
    !(stage instanceof HTMLElement)
  ) return false;

  const stageBounds = stage.getBoundingClientRect();
  return stageBounds.bottom > 0 && stageBounds.top < window.innerHeight;
}

function playCameraRenderAmbient() {
  if (!isCameraAmbientContextActive()) {
    return;
  }

  cameraAmbientArmed = true;
  startCameraAmbientSwell().catch(() => {});
}

function stopCameraAmbientSwell() {
  cameraAmbientAttempt += 1;
  cameraAmbientArmed = false;
  cameraAmbientPlayPending = false;
  const voice = cameraAmbientVoice;
  cameraAmbientVoice = null;
  stopAmbientVoice(voice);
}

async function playRequestedFooterAmbient(epoch) {
  if (
    !projectSoundEnabled ||
    document.body.dataset.currentPage !== "work" ||
    footerAmbientRequestedEpoch !== epoch ||
    epoch !== footerAmbientEpoch ||
    footerAmbientPlayedEpoch === epoch ||
    footerAmbientPlayPending ||
    footerAmbientVoice !== null
  ) return;

  if (!isProjectAudioRunning()) {
    audioNeedsTrustedUnlock = true;
    return;
  }

  footerAmbientPlayPending = true;
  const attempt = ++footerAmbientAttempt;

  try {
    const buffer = await ensureAmbientAudioBuffer();
    if (
      attempt !== footerAmbientAttempt ||
      footerAmbientRequestedEpoch !== epoch ||
      epoch !== footerAmbientEpoch ||
      !isProjectAudioRunning() ||
      document.body.dataset.currentPage !== "work"
    ) {
      return;
    }

    const holdDuration = Math.max(
      0,
      FOOTER_AMBIENT_DURATION - 0.12 - FOOTER_AMBIENT_FADE_OUT_DURATION,
    );
    footerAmbientVoice = createAmbientVoice({
      buffer,
      offset: FOOTER_AMBIENT_START_TIME,
      envelope: [
        { value: FOOTER_AMBIENT_VOLUME, duration: 0.12 },
        { value: FOOTER_AMBIENT_VOLUME, duration: holdDuration },
        { value: 0, duration: FOOTER_AMBIENT_FADE_OUT_DURATION },
      ],
      onEnded(voice) {
        if (footerAmbientVoice === voice) footerAmbientVoice = null;
      },
    });
    if (footerAmbientVoice !== null) {
      footerAmbientPlayedEpoch = epoch;
    }
  } catch {
    if (
      attempt === footerAmbientAttempt &&
      footerAmbientRequestedEpoch === epoch
    ) {
      audioNeedsTrustedUnlock = true;
    }
  } finally {
    if (attempt === footerAmbientAttempt) footerAmbientPlayPending = false;
  }
}

function startFooterAmbientOutro() {
  if (
    !projectSoundEnabled ||
    document.body.dataset.currentPage !== "work" ||
    footerAmbientRequestedEpoch === footerAmbientEpoch ||
    footerAmbientPlayedEpoch === footerAmbientEpoch
  ) return;

  footerAmbientRequestedEpoch = footerAmbientEpoch;
  playRequestedFooterAmbient(footerAmbientEpoch).catch(() => {});
}

function stopFooterAmbientOutro() {
  footerAmbientAttempt += 1;
  footerAmbientPlayPending = false;
  footerAmbientRequestedEpoch = -1;
  const voice = footerAmbientVoice;
  footerAmbientVoice = null;
  stopAmbientVoice(voice);
}

function beginFooterAmbientEpoch() {
  stopFooterAmbientOutro();
  footerAmbientEpoch += 1;
  footerAmbientPlayedEpoch = -1;
}

function drainPendingLandmarkAudio() {
  if (!isProjectAudioRunning()) return;

  primeGlyphSplashSample();
  drainIntroHighlightSwooshQueue();
  if (pendingClickStatePop) {
    pendingClickStatePop = false;
    playMinimalPopSound();
  }
  if (cameraAmbientArmed && isCameraAmbientContextActive()) {
    startCameraAmbientSwell().catch(() => {});
  }
  if (footerAmbientRequestedEpoch === footerAmbientEpoch) {
    playRequestedFooterAmbient(footerAmbientEpoch).catch(() => {});
  }
}

function isTrustedAudioUnlockEvent(event) {
  return (
    event instanceof Event &&
    event.isTrusted &&
    ["pointerdown", "touchstart", "mousedown", "click", "keydown"].includes(
      event.type,
    )
  );
}

function markProjectAudioForTrustedRecovery() {
  if (!projectSoundEnabled || isProjectAudioRunning()) return;

  webKitsAudioReady = false;
  audioNeedsTrustedUnlock = true;
}

function unlockProjectAudio(event) {
  if (!projectSoundEnabled) return Promise.resolve();

  if (isProjectAudioRunning()) {
    webKitsAudioReady = true;
    audioNeedsTrustedUnlock = false;
    drainPendingLandmarkAudio();
    return Promise.resolve(projectAudioContext);
  }

  if (!isTrustedAudioUnlockEvent(event)) {
    markProjectAudioForTrustedRecovery();
    return Promise.resolve(null);
  }
  if (webKitsAudioUnlockPromise !== null) return webKitsAudioUnlockPromise;

  webKitsAudioUnlockPromise = withProjectAudioTimeout(ensureProjectAudioRunning())
    .then((context) => {
      drainPendingLandmarkAudio();
      return context;
    })
    .catch(() => {
      webKitsAudioReady = false;
      audioNeedsTrustedUnlock = true;
      return null;
    })
    .finally(() => {
      webKitsAudioUnlockPromise = null;
    });

  return webKitsAudioUnlockPromise;
}

function setupProjectAudioUnlock() {
  const options = { capture: true, passive: true };
  window.addEventListener("pointerdown", unlockProjectAudio, options);
  window.addEventListener("touchstart", unlockProjectAudio, options);
  window.addEventListener("mousedown", unlockProjectAudio, options);
  window.addEventListener("click", unlockProjectAudio, options);
  window.addEventListener("keydown", unlockProjectAudio, { capture: true });
  window.addEventListener("pageshow", markProjectAudioForTrustedRecovery, {
    passive: true,
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) markProjectAudioForTrustedRecovery();
  });
}

function setupClickStateAudio() {
  document.addEventListener("click", (event) => {
    if (event instanceof MouseEvent && event.button !== 0) return;

    const target = event.target instanceof Element
      ? event.target.closest("button, a[href], [role='button']")
      : null;
    if (!(target instanceof HTMLElement)) return;
    if (
      target.matches("[data-startup-enter-sound], [data-startup-enter-silent]")
      || target.matches("[data-nav-target]")
      || target.matches(":disabled")
      || target.getAttribute("aria-disabled") === "true"
    ) return;

    playClickStatePop();
  });
}

setupProjectAudioUnlock();
setupClickStateAudio();
CustomEase.create(
  "appleNative",
  "M0,0 C0.25,0.1 0.25,1 1,1",
);
CustomEase.create(
  "cameraGlyphSnap",
  "M0,0 C0.045,0.82 0.22,1 1,1",
);
CustomEase.create(
  "projectFolderSnap",
  "M0,0 C0.08,0.78 0.28,1.08 0.72,1.08 0.9,1.08 0.96,1 1,1",
);
CustomEase.create(
  "caseStudyExit",
  "M0,0 C0.08,0.72 0.32,1.04 0.72,1.01 0.88,1 0.96,1 1,1",
);
CustomEase.create(
  "capabilityMagnetPull",
  "M0,0 C0.12,0.72 0.22,1 1,1",
);
CustomEase.create(
  "capabilityMagnetSettle",
  "M0,0 C0.08,0.86 0.24,1.12 0.48,1.04 0.72,0.98 0.88,1 1,1",
);
CustomEase.create(
  "capabilityOwlPeek",
  "M0,0 C0.08,0.72 0.22,1 1,1",
);
CustomEase.create(
  "capabilityOwlReveal",
  "M0,0 C0.12,0.42 0.26,1 1,1",
);
CustomEase.create(
  "footerOwlExplosion",
  "M0,0 C0.055,0 0.085,0.025 0.13,0.1 C0.19,0.64 0.31,0.93 0.58,0.988 C0.76,0.998 0.9,1 1,1",
);
CustomEase.create(
  "footerWordArc",
  "M0,0 C0.07,0 0.11,0.035 0.16,0.12 C0.24,0.62 0.37,0.9 0.62,0.985 C0.78,0.997 0.92,1 1,1",
);
CustomEase.create(
  "footerSoftSettle",
  "M0,0 C0.12,0.04 0.2,0.78 0.42,0.96 C0.62,0.995 0.84,1 1,1",
);
if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

function forceNativeScrollToHero() {
  ScrollTrigger.clearScrollMemory?.();
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

forceNativeScrollToHero();
window.addEventListener("pageshow", forceNativeScrollToHero, { once: true });
window.addEventListener("load", forceNativeScrollToHero, { once: true });

const glyphMeasureContext = (() => {
  if ("OffscreenCanvas" in window) {
    return new OffscreenCanvas(1, 1).getContext("2d");
  }

  return document.createElement("canvas").getContext("2d");
})();

function measureAverageGlyphWidth(text, font) {
  if (glyphMeasureContext === null) return 0;

  glyphMeasureContext.font = font;
  return glyphMeasureContext.measureText(text).width / Math.max(1, text.length);
}

function clearOwlRasterCache(cache) {
  cache.frames.length = 0;
  cache.layoutCacheKey = "";
  cache.currentIndex = -1;
  cache.ready = false;
}

function cloneCanvasRaster(sourceCanvas) {
  const raster = document.createElement("canvas");
  raster.width = sourceCanvas.width;
  raster.height = sourceCanvas.height;
  const rasterCtx = raster.getContext("2d", { alpha: true });
  rasterCtx?.drawImage(sourceCanvas, 0, 0);
  return raster;
}

function drawCachedOwlRaster({
  cache,
  targetCanvas,
  targetCtx,
  renderState,
  framePosition,
  frameCount,
}) {
  if (
    !IS_SAFARI_BROWSER ||
    !cache.ready ||
    cache.layoutCacheKey !== renderState.layoutCacheKey ||
    cache.frames.length === 0 ||
    targetCtx === null
  ) {
    return false;
  }

  const normalizedFrame = clamp(
    framePosition / Math.max(1, frameCount - 1),
    0,
    1,
  );
  const rasterIndex = Math.round(
    normalizedFrame * Math.max(0, cache.frames.length - 1),
  );

  if (cache.currentIndex !== rasterIndex || !renderState.rendered) {
    targetCtx.save();
    targetCtx.setTransform(1, 0, 0, 1, 0, 0);
    targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    targetCtx.drawImage(cache.frames[rasterIndex], 0, 0);
    targetCtx.restore();
    cache.currentIndex = rasterIndex;
  }

  renderState.currentFramePosition = framePosition;
  renderState.currentFrameBucket = Math.round(
    framePosition * INTRO_OWL_FRAME_BLEND_PRECISION,
  );
  renderState.rendered = true;
  return true;
}

const GLYPH_FAMILIES = [
  "1I7",
  "LTV",
  "XYZ",
  "ACS",
  "EPR",
  "NQ25",
  "6893",
  "0ABG",
  "8QMW",
  "WM80",
];
const SCRAMBLE_INTERVAL = IS_SAFARI_BROWSER ? 0.11 : 0.075;
const BLUE_LIGHT = { r: 78, g: 124, b: 255 };
const BLUE_DARK = { r: 25, g: 67, b: 245 };
const COVER_SCALE_BOOST = 1.08;
const CAMERA_MOBILE_BREAKPOINT = 620;
const CAMERA_MOBILE_SCALE_BOOST = 1.02;
const CAPABILITY_OWL_READY_PROGRESS = 0.74;
const CAPABILITY_GLYPH_BURST_TRIGGER_PROGRESS = 0.585;
const CAPABILITY_GLYPH_BURST_DURATION = 0.76;
const CAPABILITY_GLYPH_BURST_MAX_DPR = IS_SAFARI_BROWSER ? 1 : 1.5;
const FOOTER_GLYPH_BURST_MAX_DPR = 1;
const CAPABILITY_GLYPH_BURST_CELL_SIZE = 16;
const CAPABILITY_GLYPH_BURST_FRONT_FEATHER_CELLS = 2.8;
const CAPABILITY_GLYPH_BURST_DRIFT_CELLS = 1.8;
const CAPABILITY_GLYPH_BURST_INNER_DELAY = 0.18;
const CAPABILITY_GLYPH_BURST_INNER_FEATHER_CELLS = 2.2;
const CAPABILITY_GLYPH_BURST_INNER_PUSH_CELLS = 0.9;
const PROJECT_SKILL_TAG_REVEAL_DURATION = 1.05;
const FOOTER_WORD_EXPLOSION_DURATION = 0.54;
const CELL_PADDING_RATIO = 0.07;
const GLYPH_FONT_WEIGHT = 420;
const FONT_SIZE_MULTIPLIER = 2.46;
const CAMERA_MAX_DPR = 1.5;
// WebKit's Canvas 2D text rasterization is substantially more expensive than
// Chromium's at Retina scale. Safari's cached glyph atlas removes that text
// cost, so these smaller owl canvases can retain native Retina sharpness.
const INTRO_OWL_MAX_DPR = 2;
const WORK_OWL_MAX_DPR = 2;
const CAMERA_MASK_THRESHOLD = 220;
const CAMERA_MASK_FEATHER = 26;
// Preserve the authored sub-frame interpolation in every browser. Reducing
// WebKit to two buckets made Lenis move smoothly while the camera itself
// visibly stepped between coarse raster states.
const CAMERA_FRAME_BLEND_PRECISION = 24;
const CAMERA_GLYPH_CACHE_LIMIT = 18;
const CAMERA_TEMPORAL_BLEND_ALPHA = 0.045;
const CAMERA_GLYPH_ATLAS_TONE_STEPS = 16;
const CAMERA_GLYPH_ATLAS_ALPHA_STEPS = 16;
const CAMERA_GLYPH_ATLAS_COLUMNS = 64;
const EYPIECE_FRAME_INDEX = 46;
const TUNNEL_FRAME_INDEX = 61;
const EYPIECE_START_PROGRESS = 0.79;
const TUNNEL_END_PROGRESS = 0.92;
const WHITE_HOLE_REVEAL_START = TUNNEL_END_PROGRESS;
const WHITE_HOLE_REVEAL_END = 0.995;
const WHITE_HOLE_APERTURE_POWER = 1.6;
const WHITE_HOLE_PAGE_FADE_START = 0.94;
const CAMERA_SCROLL_LENGTH_VH = 190;
const CAMERA_HANDOFF_PROGRESS_PER_SECOND = 0.17;
const CAMERA_HANDOFF_WHITE_HOLD_SECONDS = 0.1;
const EYEPIECE_OPENING_CENTER = { x: 0.4772, y: 0.5067 };
const CAMERA_ASSEMBLY_BLANK_HOLD = 0;
const CAMERA_ASSEMBLY_MOVE_DURATION = 0.95;
const CAMERA_ASSEMBLY_STAGGER = 0.25;
const CAMERA_ASSEMBLY_SIDE_JITTER_RATIO = 0.42;
const CAMERA_ASSEMBLY_EDGE_MARGIN_RATIO = 0.18;
const CAMERA_ASSEMBLY_EASE = gsap.parseEase("cameraGlyphSnap");
const INTRO_OWL_ASSEMBLY_MOVE_DURATION = 0.78;
const INTRO_OWL_ASSEMBLY_STAGGER = 0.18;
const INTRO_REVEAL_FRONT_SPREAD_RATIO = 0.12;
const INTRO_REVEAL_FIRST_STAGGER = 0.105;
const INTRO_REVEAL_FINAL_STAGGER = 0.014;
const INTRO_REVEAL_STAGGER_CURVE = 2.35;
const INTRO_REVEAL_FIRST_DURATION = 0.42;
const INTRO_REVEAL_FINAL_DURATION = 0.2;
const INTRO_REVEAL_DURATION_CURVE = 1.55;
const INTRO_REVEAL_END_HOLD = 0.46;
const INTRO_REVEAL_BLANK_LEAD = 0.18;
const INTRO_REVEAL_VISIBILITY_DURATION = 0.001;
const INTRO_REVEAL_SCROLL_LEAD_VH = 18;
const INTRO_REVEAL_TRAILING_SCROLL_VH = 100;
const INTRO_REVEAL_SEQUENCED_LINE_COUNT = 1;
const INTRO_TYPER_FPS = 23;
const INTRO_TYPER_CYCLES = 4;
const INTRO_TYPER_CYCLE_LENGTH = 0.5;
const INTRO_TYPER_LINE_STAGGER = 0.15;
const INTRO_TYPER_OWL_START_RATIO = 0.5;
const INTRO_TYPER_VARIATIONS = [
  "charFill",
  "charInverse",
  "charAccent",
  "charAccentInverse",
  "charAccentFill",
  "charBorder",
];
const INTRO_OWL_GLYPHS = "017ILTVXYZACSEPRNQ256893GMW";
const INTRO_OWL_FONT_WEIGHT = 540;
const INTRO_OWL_FONT_SIZE_MULTIPLIER = 1.14;
const INTRO_OWL_CELL_PADDING_RATIO = 0.06;
const INTRO_OWL_DRAW_SCALE = 1.14;
const INTRO_OWL_DRAW_OFFSET_X_RATIO = 0.14;
const INTRO_OWL_DRAW_OFFSET_Y_RATIO = 0;
const INTRO_OWL_FINAL_OPACITY = 1;
const INTRO_OWL_ASSEMBLY_TRIGGER_WORD = "22";
const INTRO_OWL_TRIGGER_TWEEN_PROGRESS = 0.9;
const INTRO_OWL_LOOP_DURATION = 8;
const INTRO_OWL_LOOP_END_FRAME = Number.POSITIVE_INFINITY;
const INTRO_OWL_GLYPH_CACHE_LIMIT = 24;
const INTRO_OWL_CLIP_MASK_CACHE_LIMIT = 24;
const INTRO_OWL_FRAME_BLEND_PRECISION = 512;
const INTRO_OWL_TARGET_FPS = IS_SAFARI_BROWSER ? 60 : 30;
const INTRO_OWL_TEMPORAL_BLEND_ALPHA = 0.025;
const INTRO_OWL_BLUE_LIGHT = { r: 60, g: 102, b: 255 };
const INTRO_OWL_BLUE_MID = { r: 25, g: 67, b: 245 };
const INTRO_OWL_BLUE_DARK = { r: 4, g: 25, b: 150 };
const INTRO_OWL_EXIT_X_OVERFLOW_RATIO = 0.3;
const INTRO_OWL_EXIT_Y_VH = 58;
const INTRO_OWL_CURSOR_LABEL_TEXT = "owl of wisdom";
const CAMERA_CURSOR_LABEL_TEXT = "scroll through my lens";
const CAMERA_CURSOR_HERO_PROGRESS_MAX = 0.003;
const INTRO_OWL_CURSOR_SCRAMBLE_CHARS = "017ILTVXYZACSEPRNQ256893GMW";
const INTRO_OWL_CURSOR_OFFSET_X = 18;
const INTRO_OWL_CURSOR_OFFSET_Y = 18;
const INTRO_OWL_CURSOR_EDGE_PADDING = 12;
const WORK_OWL_SCENE_ENTER_DURATION = 0.9;
const WORK_OWL_SCENE_START_MARGIN_RATIO = 0.62;
const WORK_OWL_SCENE_START_FRAME_RATIO = 0.28;
const WORK_OWL_TARGET_FPS = IS_SAFARI_BROWSER ? 60 : 30;
// Disabled until a dense cropped atlas can preserve the source cadence. A
// sparse full-canvas cache made the owl visibly step between frames.
const SAFARI_INTRO_OWL_RASTER_FRAME_COUNT = 0;
const SAFARI_WORK_OWL_RASTER_FRAME_COUNT = 0;
const FOOTER_GLITCH_DOT_HOLD = 0.15;
const FOOTER_GLITCH_STEP_TWO = 0.082;
const FOOTER_GLITCH_STEP_THREE = 0.148;
const FOOTER_GLITCH_STEP_FOUR = 0.218;
const FOOTER_GLITCH_CLEANUP = 0.286;
const FOOTER_GLITCH_WORD_GAP = 0.12;
const FOOTER_COPY_RESET_MS = 1600;
const FOOTER_MONO_GLOW_CONFIG = Object.freeze({
  bars: 9,
  blur: 11,
  peak: 0.4,
  valley: 0.4,
  opacity: 0.58,
  riseDuration: 0.88,
  stops: [
    { offset: 0, color: "#2f63ff" },
    { offset: 0.38, color: "#4f79ff" },
    { offset: 0.62, color: "#8eaefe" },
    { offset: 0.82, color: "rgba(218, 228, 255, 0.78)" },
    { offset: 1, color: "rgba(255, 255, 255, 0)" },
  ],
});
const FOOTER_MONO_GLOW_VIEWBOX_WIDTH = 1271;
const FOOTER_MONO_GLOW_VIEWBOX_HEIGHT = 599;
const INTRO_HIGHLIGHT_BASE_COLOR = "#050505";
const INTRO_HIGHLIGHT_COLOR = "#ffffff";
const INTRO_COPY_FONT_FAMILY =
  '"Geist", "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif';
const INTRO_HIGHLIGHT_FONT_FAMILY = INTRO_COPY_FONT_FAMILY;
const INTRO_HIGHLIGHT_SETTLE_DELAY = 0.04;
const INTRO_HIGHLIGHT_DURATION = 0.24;
const INTRO_HIGHLIGHT_STAGGER = 0.038;
const WORK_WAVE_CONFIG = {
  waves: {
    base: { amp: 0.1, freq: 1.0, speed: 1.0, phase: 5.0 },
    flow: { amp: 0.15, freq: 5.0, speed: 5.0, phase: 10.0 },
    detail: { amp: 0.025, freq: 5.0, speed: 1.5, phase: 2.5 },
  },
  clipMax: 20,
  clipPower: 2,
};
const WORK_WAVE_TOTAL_IMAGES = 12;
const WORK_WAVE_NAMES = [
  "tidal caravan",
  "cloudbound kin",
  "river communion",
  "ember shore",
  "violet thunder",
  "shoreline ritual",
  "lunar grove",
  "tidal wanderer",
  "twilight sentinel",
  "ocean witness",
  "pastoral dawn",
  "feline reverie",
];
const WORK_WAVE_IMAGE_BASE_HEIGHT = 375;
const WORK_WAVE_ASPECT_RATIOS = [
  "16/9",
  "4/3",
  "16/9",
  "4/3",
  "4/3",
  "16/9",
  "3/2",
  "16/9",
  "3/2",
  "16/9",
  "3/2",
  "3/2",
];

function getWorkWaveSourceIndex(displayIndex) {
  return WORK_WAVE_TOTAL_IMAGES - 1 - displayIndex;
}

const WORK_WAVE_DIAGONAL_X_DRIFT_RATIO = 0.7;
const WORK_WAVE_START_RIGHT_OFFSET_RATIO = 0.18;
const WORK_WAVE_RIGHT_SHIFT_RATIO = 0.055;
const WORK_FOOTER_SCENE_MAX_DPR = IS_SAFARI_BROWSER ? 1 : 1.5;
const WORK_FOOTER_SCENE_FONT_WEIGHT = 480;
const WORK_FOOTER_SCENE_FONT_SIZE_MULTIPLIER = 1.16;
const WORK_FOOTER_SCENE_CELL_PADDING_RATIO = 0.19;
const WORK_FOOTER_SCENE_FONT_FIT_SAMPLE = "WMWM8888QQ";
const WORK_FOOTER_SCENE_MASK_FEATHER_START = 0.018;
const WORK_FOOTER_SCENE_MASK_FEATHER_END = 0.82;
const WORK_FOOTER_SCENE_ASSEMBLY_MOVE_DURATION = 0.16;
const WORK_FOOTER_SCENE_ASSEMBLY_STAGGER = 1.75;
const WORK_FOOTER_SCENE_PREWARM_BATCH_SIZE = 380;
const WORK_FOOTER_SCENE_CELL_RECORD_BYTES = 13;
const PAGE_TRANSITION_CELL_SIZE = 16;
const PAGE_TRANSITION_CELL_SIZE_MOBILE = 14;
const PAGE_TRANSITION_CANVAS_MAX_DPR = 2;
const PAGE_TRANSITION_SPREAD = 0.26;
const PAGE_TRANSITION_TRAIL_FADE = 0.11;
const PAGE_TRANSITION_SCATTER_INTENSITY = 0.13;
const PAGE_TRANSITION_SOLID_CORE_RADIUS = 0.028;
const PAGE_TRANSITION_MIN_SCATTER_AT_FRONT = 0.28;
const PAGE_TRANSITION_VISIBILITY_THRESHOLD = 0.66;
const PAGE_TRANSITION_COVER_DURATION = 0.68;
const PAGE_TRANSITION_UNCOVER_DURATION = 0.92;
const PAGE_TRANSITION_HOLD_DURATION = 0;
const PAGE_TRANSITION_ROUTE_SETTLE_DURATION = 0.12;
const PAGE_TRANSITION_ROUTE_PAINT_HOLD = 0.05;
const PAGE_TRANSITION_UNCOVER_SOLID_RELEASE = 0.12;
const PAGE_TRANSITION_ABOUT_REVEAL_START = 0.78;
const PAGE_TRANSITION_DRIFT_RATIO = 0.72;
const PAGE_TRANSITION_FONT_RATIO = 0.68;
const PAGE_TRANSITION_CHARACTERS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@$%&*+=?!<>{}[]";
const BACKGROUND_COLOR = "#fdfcf8";
const BACKGROUND_COLOR_TRANSPARENT = "rgba(253, 252, 248, 0)";
const CAMERA_BACKGROUND_COLOR = "#ffffff";
const CAMERA_BACKGROUND_COLOR_TRANSPARENT = "rgba(255, 255, 255, 0)";
const CAMERA_CANVAS_BACKGROUND_COLOR = BACKGROUND_COLOR;
const CASE_STUDY_PROJECTS = Object.freeze({
  "project-one": {
    eyebrow: "Project one · Placeholder case study",
    title: "Parallea website",
    summary:
      "In this project, I explored how far motion and interaction could shape the personality of a website.\n\nI was just starting out as a design engineer, learning by studying and recreating effects from Awwwards websites and creators I admired. With the freedom to go rogue, the project became a space to experiment, challenge myself and turn inspiration into something of my own.",
    intro: "",
    role: "Design engineer",
    focus: "Product systems",
    year: "2026",
    website: "https://paralleatech.com",
    navigation: {
      overview: "Opening sequence",
      challenge: "Scroll interactions",
      system: "Visual experiment",
      outcome: "Reflection",
    },
    navigationVideoTargets: {
      challenge: 2,
      system: 9,
    },
    overviewOne: "",
    overviewTwo: "",
    challengeOne: "",
    challengeTwo: "",
    systemOne: "",
    systemTwo: "",
    outcomeOne:
      "This project was less about following a polished process and more about learning by building. I studied effects from designers and the Codrops community, recreated them, broke them apart and gradually understood how they worked.\n\nLooking back, some interactions were more experimental than necessary. But that freedom taught me the difference between adding an effect and making it belong through timing, performance and the way one moment connects to the next. It was an important step in becoming a more thoughtful design engineer.",
    outcomeTwo: "",
    endnote: "",
    videoBasePath: "/media/parallea/optimized/parallea",
    media: [
      {
        label: "Early direction and product framing",
        caption: "Placeholder for discovery notes, sketches, or an opening product film.",
        videos: [1, 2, 3],
        videoCopy: {
          1: "The most expressive moments on a website often happen immediately, before the user has fully arrived. Instead of treating the loader as an empty waiting state, I used it to capture attention and build anticipation. Inspired by [https://www.maxmilkin.com/](https://www.maxmilkin.com/), the animation gives users a moment to settle in, allowing the opening effects to land with greater impact.",
          2: "The hero animation is not a traditional video. It is built from a sequence of stacked images that update as the user scrolls.\n\nConnecting each frame to the scroll position gives users control over the pace, making the hero feel responsive rather than simply playing in front of them.",
          3: "Revealing the idea gradually",
        },
      },
      {
        label: "Interaction prototype and decision points",
        caption: "Placeholder for a wide prototype recording or side-by-side flow comparison.",
        videos: [4, 5, 6],
        videoCopy: {
          4: "Using an effect shared by the [Codrops Creative Hub](https://tympanus.net/Tutorials/Cinematic3DScroll/) as a starting point, I adapted it to create a more unexpected and memorable interaction. It became one of the website’s “wow” moments, something designed to briefly interrupt the familiar and leave a lasting impression.",
          5: "Inspired by [https://elliott.mangham.dev/](https://elliott.mangham.dev/), I paired a text reveal with a marquee that moves in response to the user’s scroll. The effect turns the message into part of the interaction, creating a sense of momentum while revealing the content progressively.",
          6: "I animated the SVG on two layers at once, scaling the logo while interpolating its viewBox. This makes the transition feel like travelling through the mark rather than simply zooming into it.\n\nOn the other side, images scatter from a shared origin across a CSS perspective scene. Their position, depth, scale, opacity and stagger are tied to the user’s scroll using [GSAP](https://www.linkedin.com/company/greensock/) and ScrollTrigger.\n\nI also preloaded and decoded the images beforehand to keep the sequence smooth and responsive.",
        },
      },
      {
        label: "Reusable interface system",
        caption: "Placeholder for component behavior, motion studies, and final interface details.",
        videos: [7, 8, 9],
        videoCopy: {
          7: "The SVG trail effect",
          8: "I paired a scroll-driven shader transition with a 3D founder-card reveal built using [GSAP](https://www.linkedin.com/company/greensock/) and ScrollTrigger.\n\nThe shader already looked striking, but the section needed something to land on. As the distortion fades, two founder cards rotate into view along the Y-axis.\n\nMost of the work went into the handoff, a Three.js exit flowing into a GSAP entrance. It is a small detail visually, but the timing makes both effects feel like one continuous motion rather than two animations placed together.",
          9: "It is 2026. A footer does not have to be a static row of links. Using a 3D metallic sphere from the [Codrops Creative Hub](https://r3f-rapier-ball-of-glass.vercel.app/), I turned the end of the page into one final interactive moment. It gives the experience a memorable ending instead of letting it simply fade out.",
        },
      },
    ],
  },
  "project-two": {
    eyebrow: "Project two · Placeholder case study",
    title: "Dashboard prototype",
    summary:
      "Early-stage products often need to communicate a vision before the product exists.\n\nI designed and built Parallea’s first dashboard prototype, focusing on AI-powered education. It gave investors a tangible view of how the product could look, feel and work.",
    intro: "",
    role: "Designer & builder",
    focus: "Research workflow",
    year: "2026",
    website: "https://parallea-prototype-v1.vercel.app",
    navigation: {
      overview: "Educator flow",
      challenge: "Dashboard motion",
      system: "AI interactions",
      outcome: "Reflection",
    },
    overviewOne:
      "Choosing an educator could have been a dropdown or a conventional list of profile cards. It would have worked, but it would not have communicated much about the experience Parallea wanted to create. I built a 3D carousel with React Three Fiber, where portraits bend in space as users move between educators. It made the experience feel playful while bringing the selected person into focus. When I shared the interaction on LinkedIn, it became one of the details people responded to most. It was a useful reminder that a small interaction can do more than decorate an interface: it can help communicate the character of the product.",
    overviewTwo: "",
    challengeOne:
      "Page transitions are useful when they help users understand that the context has changed. After selecting an educator, the user can click anywhere to continue into the dashboard. The founder wanted this moment to feel unfamiliar, so I designed the dashboard to enter along a curved path instead of using a conventional fade or slide. The motion gradually settles into place, making the transition feel smooth while revealing the next environment. Once the dashboard is stable, the remaining interface elements appear in a staggered sequence. This prevents everything from competing for attention at once and gives the user a clearer path into the experience.",
    challengeTwo: "",
    systemOne:
      "A chat box felt like the most familiar way to interact with the AI, but keeping it visible at all times introduced unnecessary visual noise. Instead, it remains hidden until the cursor moves toward the lower part of the screen. This keeps the interface calm while making the chat easy to access when needed. I also created a custom loading animation to make the waiting state feel intentional and consistent with the rest of the prototype.",
    systemTwo: "",
    outcomeOne:
      "Prototypes are most useful when they explore questions that static screens cannot answer. Because this was Parallea’s first expression as a product, I had room to experiment with how an AI learning experience could move, respond and feel. The response on social media showed that these details could make an early idea feel distinctive. At the same time, a production version would need further usability and accessibility testing. The prototype was not a final answer. It was a way to make the vision tangible and discover which ideas were worth developing further.",
    outcomeTwo: "",
    endnote: "",
    videoBasePath: "/media/dashboard/optimized/dashboard",
    media: [
      {
        label: "Research archive and emerging themes",
        caption: "Placeholder for source material, field notes, and thematic clusters.",
        videos: [1, 2, 3],
        videoCopy: {
          2: "Selecting an educator should feel like the beginning of a lesson, not just another click. When a user chooses an educator, a small WebGL sphere emerges as they introduce the topic. This creates a clear transition between browsing and learning, while reassuring the user that their selection has been made. Instead of using a conventional loading screen or modal, I wanted the moment to feel more personal and alive. The sphere responds like a visual presence, but remains abstract enough to keep the focus on the educator’s voice and the lesson ahead.",
          3: "Login buttons are usually treated as purely functional. For Parallea’s entry page, I used this familiar action as an opportunity to introduce the product’s personality. I placed the login button in the corner and gave it a playful, experimental microinteraction. Its purpose remained immediately clear, but the unexpected behavior made the entry experience feel more distinctive. When I shared it on social media, it became one of the most well-received interactions from the prototype. It showed that even a small, familiar control can become memorable when functionality and personality work together.",
        },
      },
      {
        label: "Visual rules tested across formats",
        caption: "Placeholder for a wide system map, motion reel, or comparative layout study.",
        videos: [4, 5, 6],
        videoCopy: {
          5: "Lessons, language and settings use smooth hover transitions, giving every navigation action a soft and responsive feel.",
        },
        continuationVideos: [6],
      },
      {
        label: "A flexible publishing framework",
        caption: "Placeholder for responsive compositions, media sequences, and final build notes.",
        videos: [7, 8, 9],
        videoCopy: {
          8: "Holding the space bar activates voice input and brings back the same WebGL form, this time responding to the user’s microphone. The press-and-hold interaction makes speaking feel deliberate, while the animated form provides immediate feedback that the system is listening. Reusing the visual also connects the educator’s introduction with the user’s own voice.",
          9: "The sidebar can be hidden whenever the user wants to focus on the full video or topic render, giving the content as much space as possible. When the sidebar opens or closes, its elements transition in a staggered sequence rather than moving as a single block. This makes the change easier to follow and keeps the interaction consistent with the motion language used throughout the prototype.",
        },
      },
    ],
  },
});
const HERO_TEXT_REVEAL_DURATION = 1;
const HERO_TEXT_REVEAL_STAGGER = 0.1;
const HERO_TEXT_CHARACTER_REVEAL_DURATION = 0.44;
const HERO_TEXT_REVEAL_EASE = "power4.out";
const HERO_STATEMENT_HTML =
  '<span class="hero-intro__name">Manish Kr.</span><span class="hero-intro__dash">–</span><span class="hero-intro__description">creating seamless experiences through design and development</span>';
const INTRO_ARCH_LAYOUT_MEMORY = Object.freeze([
  {
    key: "age",
    text: "I'm a 22 year old",
    left: 0,
    top: 0,
    fontFamily: "Helvetica-Bold, Helvetica, system-ui, sans-serif",
    fontSize: 52,
    fontWeight: 700,
    lineHeight: 64,
  },
  {
    key: "designer",
    text: "Design enginner,",
    left: 202,
    top: 64,
    fontFamily: "Instrument Serif, system-ui, sans-serif",
    fontSize: 52,
    fontWeight: 400,
    lineHeight: 64,
    textStroke: 2,
  },
  {
    key: "photographer",
    text: "Photographer,",
    left: 346,
    top: 128,
    fontFamily: "Instrument Serif, system-ui, sans-serif",
    fontSize: 52,
    fontWeight: 400,
    lineHeight: 64,
    textStroke: 2,
  },
  {
    key: "multi",
    text: "multidisciplinary",
    left: 469,
    top: 192,
    fontFamily: "Trattatello, system-ui, sans-serif",
    fontSize: 40,
    fontWeight: 400,
    lineHeight: 48,
  },
  {
    key: "creative",
    text: "creative,",
    left: 652,
    top: 240,
    fontFamily: "Trattatello, system-ui, sans-serif",
    fontSize: 40,
    fontWeight: 400,
    lineHeight: 48,
  },
  {
    key: "working",
    text: "working",
    left: 702,
    top: 288,
    fontFamily: "HelveticaNeue-Medium, Helvetica Neue, system-ui, sans-serif",
    fontSize: 36,
    fontWeight: 500,
    lineHeight: 44,
  },
  {
    key: "across",
    text: "across",
    left: 769,
    top: 332,
    fontFamily: "HelveticaNeue-Medium, Helvetica Neue, system-ui, sans-serif",
    fontSize: 36,
    fontWeight: 500,
    lineHeight: 44,
  },
  {
    key: "visuals",
    text: "visuals",
    left: 835,
    top: 376,
    fontFamily: '"Gambarino", Georgia, serif',
    fontSize: 32,
    fontWeight: 400,
    lineHeight: 40,
  },
  {
    key: "motion",
    text: "motion",
    left: 880,
    top: 416,
    fontFamily: '"Gambarino", Georgia, serif',
    fontSize: 32,
    fontWeight: 400,
    lineHeight: 40,
  },
  {
    key: "code",
    text: "code.",
    left: 926,
    top: 456,
    fontFamily: '"Gambarino", Georgia, serif',
    fontSize: 32,
    fontWeight: 400,
    lineHeight: 40,
  },
]);
const sceneCanvas = document.querySelector("#scene");
const experience = document.querySelector("#experience");
const stage = document.querySelector("#stage");
const introSection = document.querySelector("#intro");
const introFrame = document.querySelector(".intro-frame");
const introCard = document.querySelector(".intro-card");
const introCopy = document.querySelector("[data-intro-copy]");
const introOwlFlightLayer = document.querySelector(".intro-owl-flight-layer");
const introOwlCanvas = document.querySelector("#intro-owl");
const introOwlCursorLabel = document.querySelector("[data-intro-owl-cursor-label]");
const workSection = document.querySelector("#work");
const aboutPage = document.querySelector("#about");
const emptyRoutePage = document.querySelector("[data-empty-page]");
const playgroundVideos = Array.from(
  document.querySelectorAll("[data-playground-video]"),
);
const playgroundItems = Array.from(document.querySelectorAll(".playground-item"));
const startupLoader = document.querySelector("[data-startup-loader]");
const startupEntry = document.querySelector("[data-startup-entry]");
const startupEntryLogo = document.querySelector("[data-startup-entry-logo]");
const startupEntryMessage = document.querySelector("[data-startup-entry-message]");
const startupEnterSoundButton = document.querySelector("[data-startup-enter-sound]");
const startupEnterSilentButton = document.querySelector("[data-startup-enter-silent]");
const siteHeader = document.querySelector("[data-site-header]");
const siteLogo = document.querySelector(".site-logo");
const sectionNav = document.querySelector("[data-section-nav]");
const navSelection = document.querySelector(".section-nav__selection");
const navButtons = Array.from(document.querySelectorAll("[data-nav-target]"));
const sectionNavButtons = Array.from(document.querySelectorAll(".section-nav__button"));
const contactLink = document.querySelector(".contact-link");
const heroIntro = document.querySelector("[data-hero-intro]");
const heroStatement = document.querySelector("[data-hero-statement]");
const cameraCursorLabel = document.querySelector("[data-camera-cursor-label]");
const workWave = document.querySelector(".work-wave");
const workWaveImagesContainer = document.querySelector("[data-work-wave-images]");
const workWaveCaption = document.querySelector("[data-work-wave-caption]");
const workWaveName = document.querySelector("[data-work-wave-name]");
const capabilityCardsSection = document.querySelector("[data-capability-cards]");
const capabilityGlyphBurstCanvas = document.querySelector(
  "[data-capability-glyph-burst]",
);
const capabilityGlyphBurstState = createGlyphBurstState(capabilityGlyphBurstCanvas);
const capabilityCards = Array.from(
  document.querySelectorAll("[data-capability-card]"),
);
const capabilityCardImages = capabilityCards.flatMap((card) =>
  Array.from(card.querySelectorAll("img")),
);
const capabilityCardInners = Array.from(
  document.querySelectorAll("[data-capability-card-inner]"),
);
const capabilityCardMagnets = Array.from(
  document.querySelectorAll("[data-capability-card-magnet]"),
);
const capabilityCardHoverLabels = capabilityCards.map((card) =>
  card.querySelector("[data-capability-hover-label]"),
);
const capabilityCardKeywordFields = capabilityCards.map((card) =>
  card.querySelector("[data-capability-keyword-field]"),
);
const capabilityCardKeywords = capabilityCards.map((card) =>
  Array.from(card.querySelectorAll("[data-capability-keyword]")),
);
const capabilityOwlPeek = document.querySelector("[data-capability-owl-peek]");
const workFooterSceneCanvas = document.querySelector("[data-work-footer-scene]");
const workOwlScene = document.querySelector("[data-work-owl-scene]");
const footerStage = document.querySelector("[data-footer-stage]");
const footerGlyphBurstCanvas = document.querySelector("[data-footer-glyph-burst]");
const footerGlyphBurstState = createGlyphBurstState(footerGlyphBurstCanvas);
const footerWords = Array.from(document.querySelectorAll("[data-footer-word]"));
const footerDesignWord = document.querySelector("[data-footer-word-role='design']");
const footerEngineerWord = document.querySelector("[data-footer-word-role='engineer']");
const footerMonoGlow = document.querySelector("[data-footer-mono-glow]");
const aboutQuote = document.querySelector("[data-about-quote]");
const aboutQuoteWords = Array.from(
  document.querySelectorAll("[data-about-quote-word]"),
).filter((element) => element instanceof HTMLElement);
const aboutStory = document.querySelector("[data-about-story]");
const aboutStoryItems = Array.from(
  document.querySelectorAll("[data-about-story-item]"),
).filter((element) => element instanceof HTMLElement);
const footerCopyButton = document.querySelector("[data-copy-email]");
const footerSocials = document.querySelector("[data-footer-socials]");
const footerSocialLinks = Array.from(document.querySelectorAll("[data-footer-social]"));
const workOwlLayer = document.querySelector("[data-work-owl-layer]");
const workOwlCanvas = document.querySelector("[data-work-owl-canvas]");
const projectFileButtons = Array.from(document.querySelectorAll("[data-project-file]"));
const projectGlyphBurstCanvas = document.querySelector("[data-project-glyph-burst]");
const projectGlyphBurstState = createGlyphBurstState(projectGlyphBurstCanvas);
const caseStudyLayer = document.querySelector("[data-case-study-layer]");
const caseStudyPage = document.querySelector("[data-case-study-page]");
const caseStudyCloseButton = document.querySelector("[data-case-study-close]");
const caseStudyContent = document.querySelector("[data-case-study-content]");
const caseStudyProgress = document.querySelector("[data-case-study-progress]");
const caseStudyProgressButtons = Array.from(
  document.querySelectorAll("[data-case-study-jump]"),
);
const caseStudySections = Array.from(
  document.querySelectorAll("[data-case-study-section]"),
);
const projectSkillTagStates = new WeakMap();
const projectSkillTagRevealTweens = new WeakMap();
let introWords = Array.from(document.querySelectorAll(".intro-word"));
let introHighlightWords = Array.from(document.querySelectorAll("[data-intro-highlight='true']"));
if (!(sceneCanvas instanceof HTMLCanvasElement)) {
  throw new Error("Canvas element not found.");
}

if (!(experience instanceof HTMLElement) || !(stage instanceof HTMLElement)) {
  throw new Error("Required stage elements not found.");
}

const ctx = sceneCanvas.getContext("2d");
if (ctx === null) {
  throw new Error("2D context unavailable.");
}

const introOwlCtx = introOwlCanvas instanceof HTMLCanvasElement
  ? introOwlCanvas.getContext("2d")
  : null;
const workFooterSceneCtx = workFooterSceneCanvas instanceof HTMLCanvasElement
  ? workFooterSceneCanvas.getContext("2d", { desynchronized: true })
  : null;
const workOwlCtx = workOwlCanvas instanceof HTMLCanvasElement
  ? workOwlCanvas.getContext("2d")
  : null;

const state = {
  metadata: null,
  density: null,
  silhouette: null,
  cols: 0,
  rows: 0,
  maskCols: 0,
  maskRows: 0,
  frameCount: 0,
  sourceWidth: 0,
  sourceHeight: 0,
  currentFrameBucket: -1,
  currentProgressBucket: -1,
  currentScrambleBucket: -1,
  scrambleTime: 0,
  dpr: 1,
  canvasWidth: 0,
  canvasHeight: 0,
  offsetX: 0,
  offsetY: 0,
  drawWidth: 0,
  drawHeight: 0,
  cellWidth: 0,
  cellHeight: 0,
  cellPadding: 0,
  fontSize: 0,
  fontFamily: '"SF Mono", Menlo, Monaco, Consolas, monospace',
  activeFont: "",
  progress: 0,
  glyphCellCache: new Map(),
  cameraActive: true,
};

const introOwlState = {
  metadata: null,
  luma: null,
  edge: null,
  mask: null,
  repairMask: null,
  bodyCoreMask: null,
  bodyLockMask: null,
  bodyAnchors: [],
  cols: 0,
  rows: 0,
  frameCount: 0,
  frameSize: 0,
  currentFrameIndex: 0,
  currentFramePosition: 0,
  currentFrameBucket: -1,
  currentScrambleBucket: -1,
  scrambleTime: 0,
  lastRenderTime: -Infinity,
  dpr: 1,
  canvasWidth: 0,
  canvasHeight: 0,
  cellWidth: 0,
  cellHeight: 0,
  drawWidth: 0,
  drawHeight: 0,
  offsetX: 0,
  offsetY: 0,
  fontSize: 0,
  fontFamily: '"SF Mono", Menlo, Monaco, Consolas, monospace',
  activeFont: "",
  rendered: false,
  scrambleBucket: -1,
  loopStartTime: null,
  renderCanvas: null,
  renderCtx: null,
  maskCanvas: null,
  maskCtx: null,
  temporalCanvas: null,
  temporalCtx: null,
  temporalReady: false,
  glyphCellCache: new Map(),
  clipMaskCache: new Map(),
  layoutCacheKey: "",
};

const workOwlRenderState = {
  currentFramePosition: 0,
  currentFrameBucket: -1,
  currentScrambleBucket: -1,
  scrambleTime: 0,
  lastRenderTime: -Infinity,
  dpr: 1,
  canvasWidth: 0,
  canvasHeight: 0,
  cellWidth: 0,
  cellHeight: 0,
  drawWidth: 0,
  drawHeight: 0,
  offsetX: 0,
  offsetY: 0,
  fontSize: 0,
  fontFamily: '"SF Mono", Menlo, Monaco, Consolas, monospace',
  activeFont: "",
  rendered: false,
  renderCanvas: null,
  renderCtx: null,
  temporalCanvas: null,
  temporalCtx: null,
  temporalReady: false,
  glyphCellCache: new Map(),
  clipMaskCache: new Map(),
  layoutCacheKey: "",
};

const safariIntroOwlRasterCache = {
  frames: [],
  layoutCacheKey: "",
  currentIndex: -1,
  ready: false,
};

const safariWorkOwlRasterCache = {
  frames: [],
  layoutCacheKey: "",
  currentIndex: -1,
  ready: false,
};

const introOwlAssemblyState = {
  active: false,
  complete: false,
  elapsed: 0,
  glyphs: [],
};

const workFooterSceneState = {
  metadata: null,
  luma: null,
  edge: null,
  mask: null,
  weight: null,
  pole: null,
  separatorStrength: null,
  cellData: null,
  cellCount: 0,
  cols: 0,
  rows: 0,
  frameSize: 0,
  dpr: 1,
  canvasWidth: 0,
  canvasHeight: 0,
  cellWidth: 0,
  cellHeight: 0,
  drawWidth: 0,
  drawHeight: 0,
  offsetX: 0,
  offsetY: 0,
  fontSize: 0,
  fontFamily: '"SF Mono", Menlo, Monaco, Consolas, monospace',
  activeFont: "",
  assemblyActive: false,
  assemblyComplete: false,
  assemblyElapsed: 0,
  assemblyGlyphs: [],
  assemblySettledGlyphs: [],
  assemblySettledIndex: 0,
  assemblySettledCanvas: null,
  assemblySettledCtx: null,
  assemblySettledCacheKey: "",
  cells: [],
  glyphSpriteCache: new Map(),
  finalCanvas: null,
  finalCtx: null,
  finalCacheKey: "",
  separatorCanvas: null,
  separatorCtx: null,
  separatorCacheKey: "",
  prewarmCanvas: null,
  prewarmCtx: null,
  prewarmCells: [],
  prewarmIndex: 0,
  prewarmCacheKey: "",
  assemblyGlyphCache: [],
  assemblyGlyphCacheKey: "",
  spriteWarmCacheKey: "",
  lineWidth: 0,
  layoutCacheKey: "",
};

const cameraAssemblyState = {
  active: false,
  complete: false,
  elapsed: 0,
  glyphs: [],
  timeline: null,
};

const cameraPlaybackState = {
  targetProgress: 0,
  renderRequested: true,
  handoffPrimed: false,
  finishing: false,
  whiteHoldUntil: 0,
};

const cameraGlyphAtlasState = {
  canvas: null,
  ctx: null,
  key: "",
  ready: false,
  tileWidth: 0,
  tileHeight: 0,
  sourceTileWidth: 0,
  sourceTileHeight: 0,
  dpr: 1,
  columns: 0,
  characters: Array.from(new Set(GLYPH_FAMILIES.join(""))),
  characterIndexes: new Map(),
};

cameraGlyphAtlasState.characters.forEach((character, index) => {
  cameraGlyphAtlasState.characterIndexes.set(character, index);
});

function createOwlGlyphAtlasState() {
  return {
    canvas: null,
    ctx: null,
    key: "",
    ready: false,
    tileWidth: 0,
    tileHeight: 0,
    sourceTileWidth: 0,
    sourceTileHeight: 0,
    dpr: 1,
    columns: 0,
    characters: cameraGlyphAtlasState.characters,
    characterIndexes: cameraGlyphAtlasState.characterIndexes,
  };
}

const introOwlGlyphAtlasState = createOwlGlyphAtlasState();
const workOwlGlyphAtlasState = createOwlGlyphAtlasState();

let introRevealTimeline = null;
let introRevealScrollTrigger = null;
let introOwlDataPromise = null;
let capabilityCardAssetWarmupPromise = null;
let workWaveAssetWarmupPromise = null;
let postStartupAssetWarmupTimer = 0;
let introOwlAssemblyPending = false;
let introOwlAssemblyTimeline = null;
let introOwlExitTimeline = null;
let introOwlExitScrollTrigger = null;
let introOwlPresenceScrollTrigger = null;
let introOwlExitSuspendedForWork = false;
let introOwlLoopVisible = false;
let introOwlCursorVisible = false;
let introOwlCursorXTo = null;
let introOwlCursorYTo = null;
let introOwlCursorScrambleUpdate = null;
let introOwlCursorLastX = window.innerWidth * 0.5;
let introOwlCursorLastY = window.innerHeight * 0.5;
let cameraCursorVisible = false;
let cameraCursorXTo = null;
let cameraCursorYTo = null;
let cameraCursorScrambleUpdate = null;
let cameraCursorLastX = window.innerWidth * 0.5;
let cameraCursorLastY = window.innerHeight * 0.5;
let smoothScroller = null;
let smoothScrollTickerCallback = null;
let cameraRenderTick = null;
let introOwlRenderTick = null;
let workOwlRenderTick = null;
let smoothScrollReconcileFrame = 0;
let smoothScrollLockObserver = null;
let lastObservedScrollLockState = null;
let nativeScrollTrackingActive = false;
let scrollEngineMode = "native";
let lenisInputWatchdogTimer = 0;
let lenisRecoveryAttempts = 0;
let workScrollVelocity = 0;
let workScrollFast = false;
let workScrollSettleTimer = 0;
let criticalSceneSyncPending = true;
let syncCapabilityCardsFromScroll = null;
let syncFooterFromScroll = null;
let cameraScrollTrigger = null;
let cameraTemporalCanvas = null;
let cameraTemporalCtx = null;
let cameraTemporalReady = false;
let cameraHandoffCanvas = null;
let cameraHandoffCtx = null;
let cameraHandoffReady = false;
let heroStatementSplit = null;
let heroIntroHasPlayed = false;
let heroIntroHidden = false;
let heroIntroScrollTrigger = null;
let heroIntroTimeline = null;
let heroTyperGroup = null;
let heroIntroLastScrollY = window.scrollY;
let heroScrollGateActive = false;
let heroScrollGateFailsafeTimer = 0;
let heroTextRevealComplete = false;
let introTyperGroup = null;
let introTyperHasPlayed = false;
let introRevealLockActive = false;
let introRevealTextComplete = false;
let introRevealOwlComplete = false;
let introRevealOwlTimer = null;
let introRevealUnlockTimer = null;
let introRevealFailsafeTimer = null;
let introRevealStartRetryTimer = null;
let navSelectionTimeline = null;
let workWaveImageItems = [];
let workWaveImageFrames = [];
let workWaveImages = [];
let workWaveImageMetrics = [];
let workWaveImageProgress = [];
let workWaveImageRenderStates = [];
let workWaveItemPositions = [];
let workWaveContainerPosition = { top: 0, bottom: 0 };
let workWaveScrollTriggers = [];
let workWaveViewportWidth = 0;
let workWaveViewportHeight = 0;
let workWaveActiveIndex = -1;
let workWaveCaptionPending = false;
let workWaveCaptionDirection = 1;
let workWaveCaptionVelocity = 0;
let workWaveNameSlot = null;
let capabilityCardsMatchMedia = null;
let capabilityCardsAreAssembled = false;
let workFooterSceneAssemblyScrollTrigger = null;
let workFooterSceneAssemblyTween = null;
let workFooterScenePrewarmHandle = null;
let workOwlScenePresenceScrollTrigger = null;
let workOwlSceneEnterTween = null;
let footerInteractionTimeline = null;
let footerInteractionTimelinePrepared = false;
let footerInteractionCompletionFallback = null;
let footerInteractionStartRetry = null;
let footerInteractionState = "idle";
let workOwlSceneEntryY = Number.POSITIVE_INFINITY;
let aboutQuoteTimeline = null;
let aboutStoryObserver = null;
let footerCopyResetTimer = 0;
let footerCopyScrambleTween = null;
let workOwlSceneActive = false;
let workOwlSceneRendering = false;
let workOwlSceneHasEntered = false;
let workOwlSceneHasLanded = false;
let workOwlSceneEnterPending = false;
let workOwlSceneParkHandle = null;
let workOwlSceneProgress = 0;
let workOwlLoopStartTime = null;
let workOwlLastRenderTime = -Infinity;
let projectFolderRevealScrollTriggers = [];
const projectTitleTyperGroups = new Map();
let activeProjectFileButton = null;
let projectCaseStudyTimeline = null;
let caseStudyRevealTimeline = null;
let caseStudyChromeTimeline = null;
let caseStudyChromeScrollTrigger = null;
let caseStudySplits = [];
let caseStudySectionScrollTriggers = [];
let caseStudyScrollTween = null;
let caseStudyVideoObserver = null;
let playgroundVideoObserver = null;
let playgroundRevealTimeline = null;
let playgroundRevealHasPlayed = false;
let currentNavigationTarget = "work";
let activePageId = "work";
let pageTransitionTimeline = null;
let pageTransitionRoot = null;
let pageTransitionCanvas = null;
let pageTransitionCtx = null;
let pageTransitionCells = [];
let pageTransitionColumns = 0;
let pageTransitionRows = 0;
let pageTransitionCellSize = 0;
let pageTransitionDpr = 1;
let pageTransitionWidth = 0;
let pageTransitionHeight = 0;
let pageTransitionActive = false;
let pageTransitionFailsafeTimer = 0;
let routeTransitionSnapshot = null;
let startupEntryTimeline = null;
let startupEntryResolved = false;
let startupExperienceReady = false;
let resolveStartupEntryChoice = null;
const startupEntryChoice = new Promise((resolve) => {
  resolveStartupEntryChoice = resolve;
});
let startupCameraRevealReady = false;
let startupCameraAssemblyComplete = false;
let cameraAssemblyCompleteCallback = null;

function setActiveNavigation(targetId, shouldAnimate = true) {
  if (!(sectionNav instanceof HTMLElement) || !(navSelection instanceof HTMLElement)) return;

  const activeButton = sectionNavButtons.find(
    (button) => button.dataset.navTarget === targetId,
  );
  if (!(activeButton instanceof HTMLButtonElement)) return;

  currentNavigationTarget = targetId;

  sectionNavButtons.forEach((button) => {
    const isActive = button === activeButton;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  const navBounds = sectionNav.getBoundingClientRect();
  const buttonBounds = activeButton.getBoundingClientRect();
  const x = buttonBounds.left - navBounds.left;
  const width = buttonBounds.width;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  navSelectionTimeline?.kill();

  if (!shouldAnimate || reduceMotion) {
    gsap.set(navSelection, {
      x,
      width,
      scaleX: 1,
      skewX: 0,
      transformOrigin: "center center",
    });
  } else {
    const currentBounds = navSelection.getBoundingClientRect();
    const currentWidth = currentBounds.width || width;
    const currentX = currentBounds.width > 0
      ? currentBounds.left - navBounds.left
      : x;
    const currentCenter = currentX + currentWidth / 2;
    const targetCenter = x + width / 2;
    const delta = targetCenter - currentCenter;
    const direction = delta >= 0 ? 1 : -1;
    const bridgeX = Math.min(currentX, x);
    const bridgeRight = Math.max(currentX + currentWidth, x + width);
    const bridgeWidth = Math.max(width, bridgeRight - bridgeX);
    const overshoot = direction * clamp(Math.abs(delta) * 0.08, 4, 12);

    navSelectionTimeline = gsap.timeline();

    if (Math.abs(delta) < 0.5 && Math.abs(currentWidth - width) < 0.5) {
      navSelectionTimeline
        .to(navSelection, {
          scaleX: 1.06,
          duration: 0.16,
          ease: "power2.out",
        })
        .to(navSelection, {
          scaleX: 1,
          duration: 0.3,
          ease: "elastic.out(1, 0.74)",
        });
    } else {
      navSelectionTimeline
        .set(navSelection, {
          transformOrigin: direction > 0 ? "right center" : "left center",
        })
        .to(navSelection, {
          x: bridgeX,
          width: bridgeWidth,
          scaleX: 1.015,
          skewX: direction * 4,
          duration: 0.18,
          ease: "appleNative",
        })
        .to(navSelection, {
          x: x + overshoot,
          width: Math.max(18, width - 3),
          scaleX: 0.985,
          skewX: direction * -2,
          duration: 0.26,
          ease: "power3.inOut",
        }, ">-0.04")
        .to(navSelection, {
          x,
          width,
          scaleX: 1,
          skewX: 0,
          duration: 0.36,
          ease: "elastic.out(1, 0.72)",
        });
    }
  }

  if (shouldAnimate) {
    gsap.fromTo(
      activeButton,
      { scale: 0.96 },
      { scale: 1, duration: 0.44, ease: "back.out(2.2)", overwrite: true },
    );
  }
}

function getShellRevealTargets() {
  return [
    siteLogo,
    ...sectionNavButtons,
    contactLink,
  ].filter((target) => target instanceof HTMLElement);
}

function releaseHeroScrollGate() {
  const root = document.documentElement;
  const wasLocked =
    heroScrollGateActive || root.classList.contains("is-camera-intro-locked");

  heroScrollGateActive = false;
  window.clearTimeout(heroScrollGateFailsafeTimer);
  heroScrollGateFailsafeTimer = 0;
  root.classList.remove("is-camera-intro-locked");
  if (!wasLocked) return;
  resetRouteScrollToTop();
  reconcileSmoothScrollAfterLockChange();
}

function maybeReleaseHeroScrollGate() {
  if (
    !heroScrollGateActive ||
    !heroTextRevealComplete
  ) return;

  releaseHeroScrollGate();
}

function beginHeroScrollGate() {
  window.clearTimeout(heroScrollGateFailsafeTimer);
  heroScrollGateActive = true;
  heroTextRevealComplete = false;
  document.documentElement.classList.add("is-camera-intro-locked");
  resetRouteScrollToTop();
  reconcileSmoothScrollAfterLockChange();
  // A text-animation callback must never be the only way to restore page
  // input. WebKit may suspend timers/tickers during power or tab transitions.
  heroScrollGateFailsafeTimer = window.setTimeout(() => {
    releaseHeroScrollGate();
  }, 5200);
}

function markHeroTextRevealComplete() {
  heroTextRevealComplete = true;
  maybeReleaseHeroScrollGate();
}

function setupHeroIntro() {
  if (
    !(heroIntro instanceof HTMLElement) ||
    !(heroStatement instanceof HTMLElement)
  ) return;

  heroStatementSplit?.revert();
  heroStatementSplit = null;
  heroTyperGroup?.destroy();
  heroStatement.innerHTML = HERO_STATEMENT_HTML;
  heroTyperGroup = new HeroTyperGroup(heroStatement, {
    fps: INTRO_TYPER_FPS,
    cycles: INTRO_TYPER_CYCLES,
    cycleLength: INTRO_TYPER_CYCLE_LENGTH,
    variations: INTRO_TYPER_VARIATIONS,
  });
  heroIntroHasPlayed = false;
  heroIntroHidden = false;
  heroIntroTimeline?.kill();
  heroIntroTimeline = null;

  gsap.set(heroIntro, {
    xPercent: 0,
    autoAlpha: 0,
  });
  gsap.set(heroStatement, { autoAlpha: 1 });
}

function animateHeroIntroOut() {
  if (
    heroIntroHidden ||
    !heroIntroHasPlayed ||
    !(heroIntro instanceof HTMLElement)
  ) return;

  heroIntroHidden = true;
  heroIntroTimeline?.kill();
  gsap.set(heroIntro, {
    autoAlpha: 0,
  });
}

function replayHeroIntroIn(onComplete = null) {
  if (
    !heroIntroHasPlayed ||
    !(heroIntro instanceof HTMLElement)
  ) return;

  heroIntroHidden = false;
  heroIntroTimeline?.kill();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion) {
    heroTyperGroup?.final();
    gsap.set(heroIntro, { autoAlpha: 1 });
    onComplete?.();
    return;
  }

  heroTyperGroup?.reset();
  gsap.set(heroIntro, { autoAlpha: 1 });
  heroTyperGroup?.in(onComplete);
}

function ensureWorkReturnHeroReveal() {
  if (activePageId !== "work" || !heroScrollGateActive) return;

  const revealState = heroStatement instanceof HTMLElement
    ? heroStatement.dataset.heroTyperType
    : "";

  if (revealState === "done") {
    markHeroTextRevealComplete();
  } else if (revealState === "in") {
    heroTyperGroup?.in(markHeroTextRevealComplete);
  } else {
    replayHeroIntroIn(markHeroTextRevealComplete);
  }
}

function animateHeroIntroIn() {
  if (
    !heroIntroHidden ||
    !heroIntroHasPlayed ||
    !(heroIntro instanceof HTMLElement)
  ) return;

  replayHeroIntroIn();
}

function playHeroIntro() {
  if (
    heroIntroHasPlayed ||
    !(heroIntro instanceof HTMLElement) ||
    !(heroStatement instanceof HTMLElement)
  ) return;

  heroIntroHasPlayed = true;
  heroIntroHidden = false;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  gsap.set(heroIntro, {
    xPercent: 0,
    autoAlpha: 1,
  });

  if (reduceMotion) {
    heroTyperGroup?.final();
    markHeroTextRevealComplete();
    return;
  }

  heroTyperGroup?.reset();
  heroTyperGroup?.in(markHeroTextRevealComplete);
}

function maybeReplayHeroIntroOnScrollReturn() {
  const currentScrollY = window.scrollY;
  const returnedToTop = heroIntroLastScrollY > 2 && currentScrollY <= 2;

  heroIntroLastScrollY = currentScrollY;
  if (
    !returnedToTop ||
    !heroIntroHasPlayed ||
    !(heroIntro instanceof HTMLElement) ||
    document.body.dataset.currentPage !== "work"
  ) return;

  const heroTyperType = heroStatement instanceof HTMLElement
    ? heroStatement.dataset.heroTyperType
    : "";

  if (heroTyperType !== "in") {
    replayHeroIntroIn();
  }
}

function setupShellInteractions() {
  if (!(siteHeader instanceof HTMLElement)) return;

  setupHeroIntro();

  gsap.set(siteHeader, { autoAlpha: 1 });
  setActiveNavigation("work", false);
  gsap.set(getShellRevealTargets(), {
    y: -14,
    autoAlpha: 0,
    filter: "blur(4px)",
  });
  if (navSelection instanceof HTMLElement) {
    gsap.set(navSelection, { autoAlpha: 0, scaleX: 0.84 });
  }

  sectionNavButtons.forEach((button) => {
    button.addEventListener("pointerenter", () => {
      gsap.to(button, {
        y: -1,
        duration: 0.22,
        ease: "power2.out",
        overwrite: true,
      });
    });
    button.addEventListener("pointerleave", () => {
      gsap.to(button, {
        y: 0,
        scale: 1,
        duration: 0.28,
        ease: "power2.out",
        overwrite: true,
      });
    });
    button.addEventListener("pointerdown", () => {
      gsap.to(button, {
        scale: 0.95,
        duration: 0.12,
        ease: "power2.out",
        overwrite: true,
      });
    });
    button.addEventListener("pointerup", () => {
      gsap.to(button, {
        scale: 1,
        duration: 0.34,
        ease: "back.out(2.2)",
        overwrite: true,
      });
    });
  });

  sectionNavButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const targetId = button.dataset.navTarget;
      if (targetId === undefined) return;

      navigateToSection(targetId);
    });
  });

  navButtons
    .filter((button) => button.classList.contains("site-logo"))
    .forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();

        if (activePageId !== "work") {
          navigateToSection("work");
          return;
        }

        const returnToHero = () => scrollWorkRouteToHero();
        if (
          caseStudyLayer?.classList.contains("is-active") ||
          projectCaseStudyTimeline !== null
        ) {
          closeProjectCaseStudy(false, returnToHero);
          return;
        }

        returnToHero();
      });
  });

  const resizeNavigation = () => setActiveNavigation(
    document.querySelector(".section-nav__button.is-active")?.dataset.navTarget ?? "work",
    false,
  );
  window.addEventListener("resize", resizeNavigation);
}

function buildStartupEntryMessage() {
  if (!(startupEntryMessage instanceof HTMLElement)) return [];

  const message = startupEntryMessage.textContent?.trim()
    || startupEntryMessage.getAttribute("aria-label")?.trim()
    || "";
  startupEntryMessage.textContent = "";

  return message.split(/\s+/).reduce((wordElements, word, wordIndex, words) => {
    const wordElement = document.createElement("span");
    const copy = document.createElement("span");
    wordElement.className = "startup-entry__word footer-glitch-word";
    wordElement.dataset.footerOrigin = "left";
    copy.className = "footer-glitch-word__copy";
    copy.textContent = word;
    wordElement.appendChild(copy);

    startupEntryMessage.appendChild(wordElement);
    if (wordIndex < words.length - 1) {
      startupEntryMessage.appendChild(
        wordIndex === 3 ? document.createElement("br") : document.createTextNode(" "),
      );
    }
    wordElements.push(wordElement);
    return wordElements;
  }, []);
}

function animateStartupEntry() {
  if (
    !(startupEntry instanceof HTMLElement) ||
    !(startupEntryLogo instanceof HTMLImageElement) ||
    !(startupEnterSoundButton instanceof HTMLButtonElement) ||
    !(startupEnterSilentButton instanceof HTMLButtonElement)
  ) return;

  const words = buildStartupEntryMessage();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  startupEntryTimeline?.kill();
  if (reduceMotion) {
    words.forEach(setFooterGlitchWordFinal);
    gsap.set(
      [startupEntry, startupEntryLogo, startupEnterSoundButton, startupEnterSilentButton],
      { autoAlpha: 1, x: 0, y: 0, scale: 1 },
    );
    return;
  }

  gsap.set(startupEntryLogo, {
    autoAlpha: 0,
    y: 42,
    scale: 1.12,
    transformOrigin: "50% 50%",
  });
  words.forEach(resetFooterGlitchWord);
  gsap.set([startupEnterSoundButton, startupEnterSilentButton], {
    autoAlpha: 0,
    y: 7,
  });
  gsap.set(startupEntry, { autoAlpha: 1 });

  const wordStart = 0.18;
  const wordStagger = 0.062;
  const controlsStart = wordStart + words.length * wordStagger + 0.34;
  startupEntryTimeline = gsap.timeline({
    defaults: { ease: "power3.out" },
    onComplete() {
      startupEntryTimeline = null;
    },
  });

  startupEntryTimeline.to(startupEntryLogo, {
    autoAlpha: 1,
    y: 0,
    scale: 1,
    duration: 0.52,
    ease: "back.out(1.45)",
  }, 0);

  words.forEach((word, index) => {
    addFooterGlitchWordSteps(startupEntryTimeline, word, wordStart + index * wordStagger);
  });

  startupEntryTimeline
    .to(startupEnterSoundButton, {
      autoAlpha: 1,
      y: 0,
      duration: 0.32,
    }, controlsStart)
    .to(startupEnterSilentButton, {
      autoAlpha: 1,
      y: 0,
      duration: 0.3,
    }, controlsStart + 0.08);

  startupEntryTimeline.timeScale(1.12);
}

function chooseStartupEntry(soundEnabled, event) {
  if (startupEntryResolved) return;
  startupEntryResolved = true;
  projectSoundEnabled = soundEnabled;
  startupEnterSoundButton?.setAttribute("disabled", "");
  startupEnterSilentButton?.setAttribute("disabled", "");
  startupLoader?.setAttribute("aria-busy", "true");

  const finishStartupChoice = () => {
    resolveStartupEntryChoice?.(soundEnabled);
    resolveStartupEntryChoice = null;
  };

  if (soundEnabled) {
    // The first Web Audio call stays inside the trusted click stack. Fetching
    // and decoding the tiny ambient file happens through that one context;
    // there is no separate HTMLMediaElement path that can jump to unity gain.
    const unlockAttempt = unlockProjectAudio(event);
    preloadAmbientEncodedAudio().catch(() => {});
    playClickStatePop();
    Promise.resolve(unlockAttempt).finally(finishStartupChoice);
    return;
  } else {
    pendingClickStatePop = false;
    pendingGlyphSplash = false;
    stopCameraAmbientSwell();
    stopFooterAmbientOutro();
  }

  finishStartupChoice();
}

function setupStartupEntry() {
  if (!(startupLoader instanceof HTMLElement)) {
    startupEntryResolved = true;
    projectSoundEnabled = false;
    resolveStartupEntryChoice?.(false);
    resolveStartupEntryChoice = null;
    return;
  }

  startupLoader.classList.remove("is-hidden");
  startupLoader.setAttribute("aria-hidden", "false");
  startupLoader.focus({ preventScroll: true });
  startupEnterSoundButton?.addEventListener(
    "click",
    (event) => chooseStartupEntry(true, event),
    { once: true },
  );
  startupEnterSilentButton?.addEventListener(
    "click",
    (event) => chooseStartupEntry(false, event),
    { once: true },
  );
  animateStartupEntry();
}

function hideStartupLoader() {
  if (!(startupLoader instanceof HTMLElement)) return;

  if (startupLoader.contains(document.activeElement)) {
    document.activeElement?.blur?.();
  }
  startupLoader.classList.add("is-hidden");
  startupLoader.setAttribute("aria-hidden", "true");
  startupLoader.removeAttribute("aria-busy");
  gsap.set(startupLoader, { autoAlpha: 0 });
}

function playStartupGlyphTransition(onRevealStart = null) {
  const revealStart = typeof onRevealStart === "function" ? onRevealStart : null;
  let hasStartedReveal = false;
  const startReveal = () => {
    if (hasStartedReveal) return;
    hasStartedReveal = true;
    revealStart?.();
  };

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    hideStartupLoader();
    startReveal();
    return Promise.resolve();
  }

  buildPageTransitionGrid();
  if (
    !(pageTransitionRoot instanceof HTMLElement) ||
    pageTransitionCells.length === 0
  ) {
    hideStartupLoader();
    startReveal();
    return Promise.resolve();
  }

  pageTransitionTimeline?.kill();
  pageTransitionTimeline = null;
  pageTransitionActive = true;
  document.documentElement.classList.add("is-startup-transitioning");
  reconcileSmoothScrollAfterLockChange();
  pageTransitionRoot.classList.add("is-active");
  pageTransitionRoot.classList.remove("is-covered");
  pageTransitionRoot.setAttribute("aria-hidden", "false");
  clearPageTransitionCanvas();

  const motion = {
    cover: 0,
    uncover: 0,
  };

  return new Promise((resolve) => {
    let hasFinished = false;
    const finish = () => {
      if (hasFinished) return;
      hasFinished = true;
      window.clearTimeout(pageTransitionFailsafeTimer);
      pageTransitionFailsafeTimer = 0;
      pageTransitionTimeline = null;
      pageTransitionActive = false;
      document.documentElement.classList.remove("is-startup-transitioning");
      reconcileSmoothScrollAfterLockChange();
      pageTransitionRoot.classList.remove("is-active");
      pageTransitionRoot.classList.remove("is-covered");
      pageTransitionRoot.setAttribute("aria-hidden", "true");
      gsap.set(pageTransitionRoot, { autoAlpha: 0 });
      clearPageTransitionCanvas();
      resolve();
    };

    pageTransitionTimeline = gsap.timeline({
      defaults: { ease: "none" },
      onComplete: finish,
      onInterrupt: finish,
    });

    pageTransitionTimeline
      .set(pageTransitionRoot, { autoAlpha: 1 }, 0)
      .to(
        motion,
        {
          cover: 1,
          duration: PAGE_TRANSITION_COVER_DURATION,
          onStart() {
            renderPageTransition(0, "cover");
          },
          onUpdate() {
            renderPageTransition(motion.cover, "cover");
          },
        },
        0,
      )
      .call(() => {
        renderPageTransition(1, "cover");
        pageTransitionRoot.classList.add("is-covered");
        hideStartupLoader();
        renderPageTransition(1, "cover");
      })
      .to({}, { duration: PAGE_TRANSITION_HOLD_DURATION })
      .to(
        motion,
        {
          uncover: 1,
          duration: PAGE_TRANSITION_UNCOVER_DURATION,
          onStart() {
            renderPageTransition(0, "uncover");
            pageTransitionRoot.classList.add("is-covered");
          },
          onUpdate() {
            if (motion.uncover > PAGE_TRANSITION_UNCOVER_SOLID_RELEASE) {
              pageTransitionRoot.classList.remove("is-covered");
            }
            renderPageTransition(motion.uncover, "uncover");
          },
          onComplete() {
            finish();
            startReveal();
          },
        },
        ">",
      );

    // Safari may pause a GSAP ticker while its tab or compositor changes
    // state. A transient cover must never remain the document's scroll lock.
    const startupTransition = pageTransitionTimeline;
    pageTransitionFailsafeTimer = window.setTimeout(() => {
      if (hasFinished || pageTransitionTimeline !== startupTransition) return;
      startupTransition.kill();
      hideStartupLoader();
      finish();
      startReveal();
    }, 3200);
  });
}

function revealStartupShell() {
  if (!(siteHeader instanceof HTMLElement)) {
    document.body.classList.remove("is-startup-loading");
    return Promise.resolve();
  }

  const shellTargets = getShellRevealTargets();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  setActiveNavigation(activePageId, false);
  document.body.classList.remove("is-startup-loading");
  gsap.set(siteHeader, { autoAlpha: 1 });

  if (reduceMotion) {
    gsap.set(shellTargets, {
      y: 0,
      autoAlpha: 1,
      filter: "blur(0px)",
      clearProps: "transform,opacity,visibility,filter",
    });
    if (navSelection instanceof HTMLElement) {
      gsap.set(navSelection, {
        autoAlpha: 1,
        scaleX: 1,
        clearProps: "opacity,visibility,transform",
      });
    }
    return Promise.resolve();
  }

  gsap.set(shellTargets, {
    y: -14,
    autoAlpha: 0,
    filter: "blur(4px)",
  });
  if (navSelection instanceof HTMLElement) {
    gsap.set(navSelection, { autoAlpha: 0, scaleX: 0.84 });
  }

  return new Promise((resolve) => {
    const shellTimeline = gsap.timeline({
      defaults: { ease: "power3.out" },
      onComplete: resolve,
    });

    shellTimeline
      .to(shellTargets, {
        y: 0,
        autoAlpha: 1,
        filter: "blur(0px)",
        duration: 0.66,
        stagger: { each: 0.14, from: "start" },
        clearProps: "transform,opacity,visibility,filter",
      })
      .to(
        navSelection,
        {
          autoAlpha: 1,
          scaleX: 1,
          duration: 0.4,
          ease: "power3.out",
          clearProps: "opacity,visibility,transform",
        },
        0.16,
      )
  });
}

function getPageTransitionCellSize() {
  return window.innerWidth < 620
    ? PAGE_TRANSITION_CELL_SIZE_MOBILE
    : PAGE_TRANSITION_CELL_SIZE;
}

function getPageTransitionHash(row, column, seed) {
  const raw = Math.sin(row * seed + column * (seed * 2.45)) * 43758.5453;
  return raw - Math.floor(raw);
}

function getPageTransitionCharacter(cell) {
  const characterIndex = Math.floor(
    getPageTransitionHash(
      cell.row,
      cell.column,
      419.7,
    ) * PAGE_TRANSITION_CHARACTERS.length,
  );

  return PAGE_TRANSITION_CHARACTERS[
    clamp(characterIndex, 0, PAGE_TRANSITION_CHARACTERS.length - 1)
  ];
}

function ensurePageTransitionOverlay() {
  if (
    pageTransitionRoot instanceof HTMLElement &&
    pageTransitionCanvas instanceof HTMLCanvasElement &&
    pageTransitionCtx !== null
  ) {
    return;
  }

  pageTransitionRoot = document.createElement("div");
  pageTransitionRoot.className = "page-transition";
  pageTransitionRoot.setAttribute("aria-hidden", "true");

  pageTransitionCanvas = document.createElement("canvas");
  pageTransitionCanvas.className = "page-transition__canvas";
  pageTransitionCtx = pageTransitionCanvas.getContext("2d");

  pageTransitionRoot.appendChild(pageTransitionCanvas);
  document.body.appendChild(pageTransitionRoot);
}

function buildPageTransitionGrid() {
  ensurePageTransitionOverlay();
  if (
    !(pageTransitionCanvas instanceof HTMLCanvasElement) ||
    pageTransitionCtx === null
  ) {
    return;
  }

  const cellSize = getPageTransitionCellSize();
  const columns = Math.ceil(window.innerWidth / cellSize) + 1;
  const rows = Math.ceil(window.innerHeight / cellSize) + 1;
  const dpr = Math.min(window.devicePixelRatio || 1, PAGE_TRANSITION_CANVAS_MAX_DPR);
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);

  if (
    pageTransitionCellSize === cellSize &&
    pageTransitionColumns === columns &&
    pageTransitionRows === rows &&
    pageTransitionDpr === dpr &&
    pageTransitionWidth === width &&
    pageTransitionHeight === height &&
    pageTransitionCells.length === columns * rows
  ) {
    return;
  }

  pageTransitionCellSize = cellSize;
  pageTransitionColumns = columns;
  pageTransitionRows = rows;
  pageTransitionDpr = dpr;
  pageTransitionWidth = width;
  pageTransitionHeight = height;
  pageTransitionCells = [];

  pageTransitionCanvas.width = Math.round(width * dpr);
  pageTransitionCanvas.height = Math.round(height * dpr);
  pageTransitionCanvas.style.width = `${width}px`;
  pageTransitionCanvas.style.height = `${height}px`;

  const maxProjection = Math.max(1, columns + rows - 2);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = column * cellSize + cellSize * 0.5;
      const y = row * cellSize + cellSize * 0.5;

      pageTransitionCells.push({
        row,
        column,
        x: Math.round(x * dpr) / dpr,
        y: Math.round(y * dpr) / dpr,
        projection: ((columns - 1 - column) + (rows - 1 - row)) / maxProjection,
        visibilityRandom: getPageTransitionHash(row, column, 127.1),
        scatterOffset:
          (getPageTransitionHash(row, column, 269.3) - 0.5) *
          PAGE_TRANSITION_SCATTER_INTENSITY,
        glyph: getPageTransitionCharacter({ row, column }),
      });
    }
  }
}

function clearPageTransitionCanvas() {
  if (
    !(pageTransitionCanvas instanceof HTMLCanvasElement) ||
    pageTransitionCtx === null
  ) {
    return;
  }

  pageTransitionCtx.save();
  pageTransitionCtx.setTransform(1, 0, 0, 1, 0, 0);
  pageTransitionCtx.clearRect(
    0,
    0,
    pageTransitionCanvas.width,
    pageTransitionCanvas.height,
  );
  pageTransitionCtx.restore();
}

function easePageTransitionProgress(progress, mode) {
  const clampedProgress = clamp(progress, 0, 1);

  if (mode === "uncover") {
    return 1 - Math.pow(1 - clampedProgress, 2.25);
  }

  return smoothstep(0, 1, clampedProgress);
}

function renderPageTransition(progress, mode) {
  buildPageTransitionGrid();

  if (
    !(pageTransitionRoot instanceof HTMLElement) ||
    pageTransitionCtx === null
  ) {
    return;
  }

  const clampedProgress = clamp(progress, 0, 1);
  const easedProgress = easePageTransitionProgress(clampedProgress, mode);
  const front = -PAGE_TRANSITION_SPREAD +
    easedProgress * (1 + PAGE_TRANSITION_SPREAD * 2);
  const fontSize = Math.max(
    9,
    Math.round(pageTransitionCellSize * PAGE_TRANSITION_FONT_RATIO),
  );

  pageTransitionCtx.save();
  pageTransitionCtx.setTransform(pageTransitionDpr, 0, 0, pageTransitionDpr, 0, 0);
  pageTransitionCtx.clearRect(0, 0, pageTransitionWidth, pageTransitionHeight);
  pageTransitionCtx.imageSmoothingEnabled = false;

  const shouldHoldSolidCover =
    (mode === "cover" && clampedProgress >= 0.999) ||
    (mode === "uncover" && clampedProgress <= 0.001);

  if (shouldHoldSolidCover) {
    pageTransitionCtx.fillStyle = BACKGROUND_COLOR;
    pageTransitionCtx.fillRect(0, 0, pageTransitionWidth, pageTransitionHeight);
  }

  pageTransitionCtx.font =
    `650 ${fontSize}px "SF Mono", Menlo, Monaco, Consolas, monospace`;
  pageTransitionCtx.textAlign = "center";
  pageTransitionCtx.textBaseline = "middle";

  for (let index = 0; index < pageTransitionCells.length; index += 1) {
    const cell = pageTransitionCells[index];
    const rawDistance = Math.abs(cell.projection - front);
    const scatterStrength = clamp(
      rawDistance / PAGE_TRANSITION_SOLID_CORE_RADIUS,
      PAGE_TRANSITION_MIN_SCATTER_AT_FRONT,
      1,
    );
    const signedDistance = mode === "cover"
      ? front - cell.projection + cell.scatterOffset * scatterStrength
      : cell.projection - front + cell.scatterOffset * scatterStrength;

    if (signedDistance <= -PAGE_TRANSITION_TRAIL_FADE) {
      continue;
    }

    const coverAlpha = smoothstep(
      -PAGE_TRANSITION_TRAIL_FADE,
      PAGE_TRANSITION_SPREAD * 0.72,
      signedDistance,
    );
    const density = smoothstep(
      -PAGE_TRANSITION_TRAIL_FADE * 0.38,
      PAGE_TRANSITION_SPREAD,
      signedDistance,
    );

    if (coverAlpha > 0.01) {
      pageTransitionCtx.globalAlpha = coverAlpha;
      pageTransitionCtx.fillStyle = BACKGROUND_COLOR;
      pageTransitionCtx.fillRect(
        Math.round((cell.x - pageTransitionCellSize * 0.54) * pageTransitionDpr) /
          pageTransitionDpr,
        Math.round((cell.y - pageTransitionCellSize * 0.54) * pageTransitionDpr) /
          pageTransitionDpr,
        Math.ceil(pageTransitionCellSize * 1.12 * pageTransitionDpr) /
          pageTransitionDpr,
        Math.ceil(pageTransitionCellSize * 1.12 * pageTransitionDpr) /
          pageTransitionDpr,
      );
    }

    const isVisible =
      density > cell.visibilityRandom *
        PAGE_TRANSITION_VISIBILITY_THRESHOLD;

    if (!isVisible) {
      continue;
    }

    const localProgress = smoothstep(0, 1, density);
    const drift = (1 - localProgress) *
      pageTransitionCellSize *
      PAGE_TRANSITION_DRIFT_RATIO;
    const direction = mode === "cover" ? 1 : -1;

    pageTransitionCtx.globalAlpha = clamp(
      coverAlpha * (0.36 + localProgress * 0.64),
      0,
      1,
    );
    pageTransitionCtx.fillStyle = "rgb(25, 67, 245)";
    pageTransitionCtx.fillText(
      cell.glyph,
      Math.round((cell.x + direction * drift) * pageTransitionDpr) /
        pageTransitionDpr,
      Math.round((cell.y + direction * drift) * pageTransitionDpr) /
        pageTransitionDpr,
    );
  }

  pageTransitionCtx.globalAlpha = 1;
  pageTransitionCtx.restore();
}

function copySnapshotCanvases(sourceRoot, cloneRoot) {
  const sourceCanvases = Array.from(sourceRoot.querySelectorAll("canvas"));
  const cloneCanvases = Array.from(cloneRoot.querySelectorAll("canvas"));

  sourceCanvases.forEach((sourceCanvas, index) => {
    const cloneCanvas = cloneCanvases[index];

    if (
      !(sourceCanvas instanceof HTMLCanvasElement) ||
      !(cloneCanvas instanceof HTMLCanvasElement) ||
      sourceCanvas.width === 0 ||
      sourceCanvas.height === 0
    ) {
      return;
    }

    cloneCanvas.width = sourceCanvas.width;
    cloneCanvas.height = sourceCanvas.height;

    const cloneContext = cloneCanvas.getContext("2d");

    if (cloneContext === null) return;

    cloneContext.clearRect(0, 0, cloneCanvas.width, cloneCanvas.height);
    cloneContext.drawImage(sourceCanvas, 0, 0);
  });
}

function removeRouteTransitionSnapshot() {
  if (!(routeTransitionSnapshot instanceof HTMLElement)) return;

  const snapshot = routeTransitionSnapshot;
  routeTransitionSnapshot = null;
  gsap.killTweensOf(snapshot);
  snapshot.remove();
}

function captureCapabilityCardsRouteTransitionSnapshot() {
  if (
    activePageId !== "work" ||
    !(capabilityCardsSection instanceof HTMLElement)
  ) {
    return null;
  }

  const stage = capabilityCardsSection.querySelector(".capability-cards__stage");
  if (!(stage instanceof HTMLElement)) return null;

  const stageBounds = stage.getBoundingClientRect();
  const hasVisibleCard = capabilityCards.some((card) => {
    if (!(card instanceof HTMLElement)) return false;

    const bounds = card.getBoundingClientRect();
    return bounds.bottom > 0 && bounds.top < window.innerHeight;
  });

  if (
    !hasVisibleCard ||
    stageBounds.width <= 0 ||
    stageBounds.height <= 0 ||
    window.getComputedStyle(capabilityCardsSection).display === "none"
  ) {
    return null;
  }

  const snapshot = document.createElement("div");
  const stageClone = stage.cloneNode(true);
  if (!(stageClone instanceof HTMLElement)) return null;

  snapshot.className =
    "route-transition-snapshot route-transition-snapshot--capability";
  snapshot.setAttribute("aria-hidden", "true");
  if ("inert" in snapshot) {
    snapshot.inert = true;
  }

  stageClone.classList.add("route-transition-snapshot__capability-stage");
  stageClone.querySelectorAll("[id]").forEach((element) => {
    element.removeAttribute("id");
  });
  stageClone
    .querySelectorAll("a, button, input, select, textarea, [tabindex]")
    .forEach((element) => {
      element.setAttribute("tabindex", "-1");
    });
  Object.assign(stageClone.style, {
    left: `${stageBounds.left}px`,
    top: `${stageBounds.top}px`,
    width: `${stageBounds.width}px`,
    height: `${stageBounds.height}px`,
  });

  copySnapshotCanvases(stage, stageClone);
  snapshot.appendChild(stageClone);
  document.body.appendChild(snapshot);
  gsap.set(snapshot, { autoAlpha: 1 });
  routeTransitionSnapshot = snapshot;

  return snapshot;
}

function captureFooterRouteTransitionSnapshot() {

  if (
    activePageId !== "work" ||
    !(workOwlScene instanceof HTMLElement) ||
    !(footerStage instanceof HTMLElement)
  ) {
    return null;
  }

  const footerBounds = workOwlScene.getBoundingClientRect();
  const stageBounds = footerStage.getBoundingClientRect();
  const isFooterVisible =
    footerBounds.bottom > 0 &&
    footerBounds.top < window.innerHeight &&
    stageBounds.bottom > 0 &&
    stageBounds.top < window.innerHeight &&
    stageBounds.width > 0 &&
    stageBounds.height > 0 &&
    window.getComputedStyle(workOwlScene).display !== "none";

  if (!isFooterVisible) return null;

  const snapshot = document.createElement("div");
  const stageClone = footerStage.cloneNode(true);
  const footerStyles = window.getComputedStyle(workOwlScene);

  snapshot.className = "route-transition-snapshot";
  snapshot.setAttribute("aria-hidden", "true");

  if ("inert" in snapshot) {
    snapshot.inert = true;
  }

  if (!(stageClone instanceof HTMLElement)) return null;

  stageClone.classList.add("route-transition-snapshot__stage");
  stageClone.querySelectorAll("[id]").forEach((element) => {
    element.removeAttribute("id");
  });
  stageClone
    .querySelectorAll("a, button, input, select, textarea, [tabindex]")
    .forEach((element) => {
      element.setAttribute("tabindex", "-1");
    });
  stageClone.style.left = `${stageBounds.left}px`;
  stageClone.style.top = `${stageBounds.top}px`;
  stageClone.style.width = `${stageBounds.width}px`;
  stageClone.style.height = `${stageBounds.height}px`;
  stageClone.style.minHeight = `${stageBounds.height}px`;
  stageClone.style.setProperty(
    "--footer-owl-size",
    footerStyles.getPropertyValue("--footer-owl-size"),
  );
  stageClone.style.setProperty(
    "--footer-word-gap",
    footerStyles.getPropertyValue("--footer-word-gap"),
  );
  stageClone.style.setProperty(
    "--footer-edge-padding",
    footerStyles.getPropertyValue("--footer-edge-padding"),
  );

  copySnapshotCanvases(footerStage, stageClone);
  snapshot.appendChild(stageClone);
  document.body.appendChild(snapshot);
  gsap.set(snapshot, { autoAlpha: 1 });
  routeTransitionSnapshot = snapshot;

  return snapshot;
}

function captureCurrentRouteTransitionSnapshot() {
  removeRouteTransitionSnapshot();

  return captureCapabilityCardsRouteTransitionSnapshot() ??
    captureFooterRouteTransitionSnapshot();
}

function finishPageTransition() {
  window.clearTimeout(pageTransitionFailsafeTimer);
  pageTransitionFailsafeTimer = 0;
  fadeOutPageTransitionNoise();
  pageTransitionTimeline = null;
  pageTransitionActive = false;
  document.documentElement.classList.remove("is-page-transitioning");
  pageTransitionRoot?.classList.remove("is-active");
  pageTransitionRoot?.classList.remove("is-covered");
  pageTransitionRoot?.setAttribute("aria-hidden", "true");
  if (pageTransitionRoot instanceof HTMLElement) {
    gsap.set(pageTransitionRoot, { autoAlpha: 0 });
  }
  clearPageTransitionCanvas();
  removeRouteTransitionSnapshot();

  if (activePageId === "work") {
    refreshWorkCameraHeroFrame();
    playCameraRenderAmbient();
    ensureWorkReturnHeroReveal();
  }

  reconcileSmoothScrollAfterLockChange({ resize: true });

  playActiveRouteReveal();
}

function resetRouteScrollToTop() {
  if (smoothScroller) {
    smoothScroller.scrollTo(0, {
      immediate: true,
      force: true,
    });
  }

  window.scrollTo(0, 0);
}

function scrollWorkRouteToHero() {
  if (activePageId !== "work") return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    resetRouteScrollToTop();
    return;
  }

  if (smoothScroller) {
    reconcileSmoothScrollAfterLockChange();
    smoothScroller.scrollTo(0, {
      duration: 1.25,
      easing: (progress) => 1 - Math.pow(1 - progress, 4),
      force: true,
    });
    return;
  }

  window.scrollTo({
    top: 0,
    left: 0,
    behavior: "smooth",
  });
}

function updateVisibleScrollTriggers(scrollState = null) {
  if (activePageId !== "work") return;

  if (scrollState && Number.isFinite(scrollState.velocity)) {
    workScrollVelocity = Math.abs(scrollState.velocity);
    workScrollFast = workScrollVelocity >= 22;

    window.clearTimeout(workScrollSettleTimer);
    workScrollSettleTimer = window.setTimeout(() => {
      workScrollVelocity = 0;
      workScrollFast = false;
      requestCameraRender();
      syncWorkWaveGalleryToScroll();
      ScrollTrigger.update();
      scheduleCriticalSceneSync();
      window.dispatchEvent(new CustomEvent("workScrollSettled"));
    }, 120);
  }

  ScrollTrigger.update();
  // ScrollTrigger has already reconciled every active scene in this frame.
  // Scheduling the same card/footer transaction again made WebKit perform a
  // second geometry pass for each Lenis event. Explicit route/settle paths
  // still request a critical sync when one is actually needed.
}

function scheduleCriticalSceneSync() {
  criticalSceneSyncPending = true;
}

function runWorkRenderScheduler(time, deltaTime) {
  if (activePageId !== "work" || document.hidden) return;

  // One authoritative frame transaction keeps ScrollTrigger-derived DOM
  // state and Canvas 2D rasters on the same paint. WebKit is particularly
  // sensitive to independent rAF/ticker callbacks racing each other.
  if (criticalSceneSyncPending) {
    criticalSceneSyncPending = false;
    syncCapabilityCardsFromScroll?.();
    syncFooterFromScroll?.();
  }

  // WebKit can coalesce an entire fast wheel gesture into a final scroll
  // position without delivering the intermediate ScrollTrigger boundary.
  // The cached threshold avoids a per-frame layout read while guaranteeing
  // that the footer's one-shot entrance receives its first handoff.
  if (
    footerInteractionState === "idle" &&
    window.scrollY >= workOwlSceneEntryY
  ) {
    syncFooterFromScroll?.();
  }

  if (workWaveCaptionPending) {
    renderWorkWaveCaption();
  }

  cameraRenderTick?.(time, deltaTime);
  introOwlRenderTick?.(time, deltaTime);
  workOwlRenderTick?.(time, deltaTime);
}

function installRenderSchedulerTicker() {
  if (smoothScrollTickerCallback !== null) {
    gsap.ticker.remove(smoothScrollTickerCallback);
  }

  smoothScrollTickerCallback = runWorkRenderScheduler;
  gsap.ticker.add(smoothScrollTickerCallback, false, true);
}

function suspendWorkRouteScene() {
  hideIntroOwlCursorLabel();
  hideCameraCursorLabel();
  if (workOwlSceneActive) {
    workOwlSceneRendering = false;
    workOwlLastRenderTime = -Infinity;
  }
}

function resumeWorkRouteScene() {
  if (activePageId !== "work") return;

  if (
    workOwlSceneActive ||
    workOwlScenePresenceScrollTrigger?.isActive ||
    workOwlSceneHasEntered ||
    workOwlSceneHasLanded ||
    workOwlLayer?.dataset.workOwlHasEntered === "true"
  ) {
    setWorkOwlSceneActive(true, true);
  }
}

function restoreFooterForCurrentWorkScroll() {
  if (
    activePageId !== "work" ||
    !(workOwlScene instanceof HTMLElement) ||
    !(workOwlScenePresenceScrollTrigger?.isActive)
  ) {
    return;
  }

  playFooterInteraction();
}

function refreshCurrentRouteAfterSwitch() {
  if (activePageId !== "work") return;

  updateLayout();
  updateIntroOwlLayout();
  updateWorkWaveImageSizes();
  ScrollTrigger.refresh();
  updateVisibleScrollTriggers();
  syncWorkWaveGalleryToScroll();
  restoreFooterForCurrentWorkScroll();
  refreshWorkCameraHeroFrame();
}

function refreshWorkCameraHeroFrame() {
  if (activePageId !== "work") return;

  updateLayout();
  resetCameraFrameCaches();
  requestCameraRender();
  renderCurrentProgress();
}

function restoreWorkRouteHero() {
  if (activePageId !== "work") return;

  cancelCameraHandoff();
  setCameraActive(true);

  setCameraTargetProgress(0);
  refreshWorkCameraHeroFrame();
  window.requestAnimationFrame(refreshWorkCameraHeroFrame);

  if (heroIntroHasPlayed && heroIntro instanceof HTMLElement) {
    heroIntroTimeline?.kill();
    if (pageTransitionActive) {
      heroIntroHidden = false;
      heroTyperGroup?.reset();
      gsap.set(heroIntro, { xPercent: 0, autoAlpha: 1 });
    } else {
      replayHeroIntroIn(heroScrollGateActive ? markHeroTextRevealComplete : null);
    }
  }
}

function resetAboutQuoteReveal() {
  aboutQuoteTimeline?.kill();
  aboutQuoteTimeline = null;

  resetAboutStoryReveal();

  if (!(aboutQuote instanceof HTMLElement)) return;

  aboutQuoteWords.forEach(resetFooterGlitchWord);
  gsap.killTweensOf([aboutQuote, ...aboutQuoteWords]);
  gsap.set(aboutQuote, {
    autoAlpha: 1,
    clearProps: "transform",
  });
  gsap.set(aboutQuoteWords, {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    autoAlpha: 1,
    force3D: true,
  });
}

function resetAboutStoryReveal() {
  aboutStoryObserver?.disconnect();
  aboutStoryObserver = null;
  document.documentElement.classList.remove("is-about-story-ready");

  if (aboutStory instanceof HTMLElement) {
    aboutStory.setAttribute("aria-hidden", "true");
  }

  if (aboutStoryItems.length > 0) {
    gsap.killTweensOf(aboutStoryItems);
    gsap.set(aboutStoryItems, { clearProps: "transform,opacity,visibility" });
    aboutStoryItems.forEach((item) => {
      item.classList.remove("is-visible");
      item.style.transitionDelay = "";
    });
  }
}

function playAboutStoryReveal() {
  if (activePageId !== "about" || !(aboutStory instanceof HTMLElement)) return;

  cancelIntroRevealLock();
  aboutStoryObserver?.disconnect();
  aboutStoryObserver = null;
  document.documentElement.classList.add("is-about-story-ready");
  aboutStory.setAttribute("aria-hidden", "false");
  reconcileSmoothScrollAfterLockChange({ resize: true });

  if (aboutStoryItems.length === 0) {
    smoothScroller?.resize?.();
    ScrollTrigger.refresh();
    return;
  }

  aboutStoryItems.forEach((item) => {
    item.classList.remove("is-visible");
    item.style.transitionDelay = "";
  });

  window.requestAnimationFrame(() => {
    if (activePageId !== "about") return;
    smoothScroller?.resize?.();
    ScrollTrigger.refresh();
  });
  window.setTimeout(() => {
    if (activePageId !== "about") return;
    smoothScroller?.resize?.();
  }, 120);

  if (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    !("IntersectionObserver" in window)
  ) {
    aboutStoryItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  aboutStoryObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const item = entry.target;
      if (!(item instanceof HTMLElement)) return;

      const index = aboutStoryItems.indexOf(item);
      item.style.transitionDelay = `${Math.min(index % 3, 2) * 60}ms`;
      item.classList.add("is-visible");
      aboutStoryObserver?.unobserve(item);
    });
  }, {
    root: null,
    rootMargin: "0px 0px -12% 0px",
    threshold: 0.08,
  });

  aboutStoryItems.forEach((item) => aboutStoryObserver?.observe(item));
}

function playAboutQuoteReveal() {
  if (activePageId !== "about" || !(aboutQuote instanceof HTMLElement)) return;

  resetAboutQuoteReveal();
  if (aboutQuoteWords.length === 0) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    aboutQuoteWords.forEach(setFooterGlitchWordFinal);
    aboutQuoteTimeline = gsap.timeline({
      onComplete() {
        aboutQuoteTimeline = null;
        playAboutStoryReveal();
      },
    });
    aboutQuoteTimeline
      .to({}, { duration: 1.1 })
      .to(aboutQuoteWords, {
        autoAlpha: 0,
        duration: 0.28,
        stagger: 0.035,
        ease: "power1.out",
      });
    return;
  }

  aboutQuoteTimeline = gsap.timeline({
    defaults: {
      overwrite: "auto",
    },
    onComplete() {
      aboutQuoteTimeline = null;
      playAboutStoryReveal();
    },
  });

  aboutQuoteWords.forEach((word, index) => {
    addFooterGlitchWordSteps(aboutQuoteTimeline, word, 0.02 + index * 0.085);
  });
  aboutQuoteTimeline
    .to({}, { duration: 0.32 })
    .to(aboutQuoteWords, {
      autoAlpha: 0,
      duration: 0.18,
      stagger: 0.018,
      ease: "power1.out",
    });
}

function playActiveRouteReveal() {
  if (activePageId === "about") {
    if (aboutQuoteTimeline !== null) return;
    playAboutQuoteReveal();
  } else if (activePageId === "experience") {
    playPlaygroundRouteReveal();
  }
}

function resetPlaygroundRouteReveal(prepareForTransition = false) {
  playgroundRevealTimeline?.kill();
  playgroundRevealTimeline = null;
  playgroundRevealHasPlayed = false;

  if (playgroundItems.length === 0) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prepareForTransition && !reduceMotion) {
    gsap.set(playgroundItems, { autoAlpha: 0, y: 28 });
  } else {
    gsap.set(playgroundItems, { clearProps: "opacity,visibility,transform" });
  }
}

function playPlaygroundRouteReveal() {
  if (activePageId !== "experience" || playgroundRevealHasPlayed) return;

  playgroundRevealHasPlayed = true;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    gsap.set(playgroundItems, { clearProps: "opacity,visibility,transform" });
    return;
  }

  playgroundRevealTimeline = gsap.timeline({
    defaults: { overwrite: "auto" },
    onComplete() {
      playgroundRevealTimeline = null;
      gsap.set(playgroundItems, { clearProps: "opacity,visibility,transform" });
    },
  });

  playgroundRevealTimeline.to(playgroundItems, {
    autoAlpha: 1,
    y: 0,
    duration: 0.58,
    stagger: 0.14,
    ease: "power3.out",
  });
}

function loadDeferredVideo(video) {
  if (!(video instanceof HTMLVideoElement) || video.hasAttribute("src")) return;

  const source = video.dataset.src;
  if (typeof source !== "string" || source === "") return;

  video.src = source;
  video.load();
}

function releaseDeferredVideo(video) {
  if (!(video instanceof HTMLVideoElement)) return;

  video.pause();
  if (!video.hasAttribute("src")) return;

  video.removeAttribute("src");
  video.load();
}

function setupPlaygroundVideos() {
  playgroundVideoObserver?.disconnect();
  playgroundVideoObserver = null;

  if (!("IntersectionObserver" in window)) return;

  playgroundVideoObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!(entry.target instanceof HTMLVideoElement)) return;
        if (entry.isIntersecting && activePageId === "experience") {
          loadDeferredVideo(entry.target);
          entry.target.play().catch(() => {});
        } else {
          entry.target.pause();
        }
      });
    },
    {
      root: null,
      rootMargin: "20% 0px",
      threshold: 0.05,
    },
  );

  playgroundVideos.forEach((video) => playgroundVideoObserver?.observe(video));
}

function setCurrentPage(targetId, shouldRefresh = true) {
  const previousPageId = activePageId;
  const isReturningToWork = targetId === "work" && previousPageId !== "work";

  if (targetId !== "work") {
    // The camera intro belongs only to Work. Never carry its input lock into
    // About or Playground if the user navigates before the typer completes.
    releaseHeroScrollGate();
    stopCameraAmbientSwell();
    stopFooterAmbientOutro();
  }

  activePageId = targetId;
  document.body.dataset.currentPage = targetId;
  if (isReturningToWork) {
    beginHeroScrollGate();
  }
  emptyRoutePage?.setAttribute("aria-hidden", String(targetId !== "experience"));
  resetPlaygroundRouteReveal(targetId === "experience" && pageTransitionActive);
  if (targetId === "experience") {
    window.requestAnimationFrame(() => {
      if (activePageId !== "experience") return;
      playgroundVideos.forEach((video) => loadDeferredVideo(video));
    });
  } else {
    playgroundVideos.forEach((video) => video.pause());
  }

  if (targetId !== "work") {
    cancelIntroRevealLock();
    cancelCameraHandoff();
    setCameraActive(false);
    if (previousPageId === "work") {
      resetFooterInteraction();
      suspendWorkRouteScene();
    }
  }

  resetRouteScrollToTop();

  reconcileSmoothScrollAfterLockChange({ resize: true });

  if (targetId === "work") {
    resetAboutQuoteReveal();
    restoreWorkRouteHero();
    resumeWorkRouteScene();
    if (!pageTransitionActive) {
      playCameraRenderAmbient();
      ensureWorkReturnHeroReveal();
    }
  } else if (targetId === "about") {
    if (!pageTransitionActive) {
      playActiveRouteReveal();
    }
  } else {
    resetAboutQuoteReveal();
    if (!pageTransitionActive) {
      playActiveRouteReveal();
    }
  }

  if (shouldRefresh) {
    refreshCurrentRouteAfterSwitch();
  }
}

function navigateToSection(targetId) {
  const targetButton = sectionNavButtons.find(
    (button) => button.dataset.navTarget === targetId,
  );

  if (!(targetButton instanceof HTMLButtonElement)) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isAlreadyThere = targetId === activePageId;
  const hasActiveCaseStudy = () =>
    caseStudyLayer?.classList.contains("is-active") ||
    projectCaseStudyTimeline !== null;
  const closeCaseStudyForRouteSwitch = () => {
    if (hasActiveCaseStudy()) {
      closeProjectCaseStudy(true);
    }
  };

  setActiveNavigation(targetId, true);

  if (isAlreadyThere) {
    if (hasActiveCaseStudy()) {
      closeProjectCaseStudy(false);
    }
    return;
  }

  if (reduceMotion) {
    closeCaseStudyForRouteSwitch();
    setCurrentPage(targetId, true);
    return;
  }

  buildPageTransitionGrid();
  if (
    !(pageTransitionRoot instanceof HTMLElement) ||
    pageTransitionCells.length === 0
  ) {
    closeCaseStudyForRouteSwitch();
    setCurrentPage(targetId, true);
    return;
  }

  pageTransitionTimeline?.kill();
  pageTransitionTimeline = null;
  captureCurrentRouteTransitionSnapshot();
  pageTransitionActive = true;
  document.documentElement.classList.add("is-page-transitioning");
  reconcileSmoothScrollAfterLockChange();
  pageTransitionRoot.classList.add("is-active");
  pageTransitionRoot.classList.remove("is-covered");
  pageTransitionRoot.setAttribute("aria-hidden", "false");
  clearPageTransitionCanvas();

  // This route-only trigger intentionally stays out of
  // playStartupGlyphTransition(), which reveals the hero on first entry.
  startPageTransitionNoise();

  const motion = {
    cover: 0,
    uncover: 0,
  };
  let hasStartedRouteReveal = false;
  const startRouteRevealDuringTransition = () => {
    if (hasStartedRouteReveal) return;
    hasStartedRouteReveal = true;
    if (targetId === "about") {
      playAboutQuoteReveal();
    } else if (targetId === "work") {
      ensureWorkReturnHeroReveal();
    } else if (targetId === "experience") {
      playPlaygroundRouteReveal();
    }
  };

  pageTransitionTimeline = gsap.timeline({
    defaults: { ease: "none" },
    onComplete: finishPageTransition,
    onInterrupt: finishPageTransition,
  });

  pageTransitionTimeline
    .set(pageTransitionRoot, { autoAlpha: 1 }, 0)
    .to(
      motion,
      {
        cover: 1,
        duration: PAGE_TRANSITION_COVER_DURATION,
        ease: "none",
        onStart() {
          renderPageTransition(0, "cover");
        },
        onUpdate() {
          renderPageTransition(motion.cover, "cover");
        },
      },
      0,
    )
    .call(() => {
      renderPageTransition(1, "cover");
      pageTransitionRoot.classList.add("is-covered");
    })
    .to({}, { duration: PAGE_TRANSITION_ROUTE_PAINT_HOLD })
    .call(() => {
      // Keep the current case-study viewport intact beneath the glyph cover.
      // Only tear it down after the canvas is fully opaque, so navigation
      // never exposes the underlying project-folder scroll position.
      closeCaseStudyForRouteSwitch();
      setCurrentPage(targetId, true);
      setActiveNavigation(targetId, false);
      renderPageTransition(1, "cover");
      removeRouteTransitionSnapshot();
    })
    .to({}, { duration: PAGE_TRANSITION_ROUTE_SETTLE_DURATION })
    .to(
      motion,
      {
        uncover: 1,
        duration: PAGE_TRANSITION_UNCOVER_DURATION,
        ease: "none",
        onStart() {
          renderPageTransition(0, "uncover");
          pageTransitionRoot.classList.add("is-covered");
        },
        onUpdate() {
          if (motion.uncover > PAGE_TRANSITION_UNCOVER_SOLID_RELEASE) {
            pageTransitionRoot.classList.remove("is-covered");
          }
          if (motion.uncover >= PAGE_TRANSITION_ABOUT_REVEAL_START) {
            startRouteRevealDuringTransition();
          }
          renderPageTransition(motion.uncover, "uncover");
        },
        onComplete() {
          startRouteRevealDuringTransition();
        },
      },
      ">",
    )
    .addLabel("routeTransitionFade", ">-0.06")
    .to(
      pageTransitionRoot,
      {
        opacity: 0,
        duration: 0.16,
        ease: "power2.out",
      },
      "routeTransitionFade",
    );

  const routeTransition = pageTransitionTimeline;
  pageTransitionFailsafeTimer = window.setTimeout(() => {
    if (!pageTransitionActive || pageTransitionTimeline !== routeTransition) return;

    // Complete the requested navigation even when WebKit suspended the visual
    // transition before its route-switch callback was reached.
    closeCaseStudyForRouteSwitch();
    if (activePageId !== targetId) {
      setCurrentPage(targetId, true);
      setActiveNavigation(targetId, false);
    }
    startRouteRevealDuringTransition();
    routeTransition.kill();
  }, 3200);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundToStep(value, step) {
  return Math.round(value / step) * step;
}

function remap(value, inMin, inMax, outMin, outMax) {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

function bezierEase(x, x1, y1, x2, y2, epsilon = 1e-6) {
  const sampleX = (t) =>
    3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t ** 2 * x2 + t ** 3;
  const sampleY = (t) =>
    3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3;
  const sampleXDerivative = (t) =>
    3 * (1 - t) ** 2 * x1 +
    6 * (1 - t) * t * (x2 - x1) +
    3 * t ** 2 * (1 - x2);

  let t = x;
  for (let index = 0; index < 8; index += 1) {
    const delta = sampleX(t) - x;
    if (Math.abs(delta) < epsilon) return sampleY(t);
    const derivative = sampleXDerivative(t);
    if (Math.abs(derivative) < 1e-6) break;
    t -= delta / derivative;
  }

  let low = 0;
  let high = 1;
  t = x;
  for (let index = 0; index < 24; index += 1) {
    const currentX = sampleX(t);
    if (Math.abs(currentX - x) < epsilon) return sampleY(t);
    if (currentX < x) low = t;
    else high = t;
    t = (low + high) / 2;
  }

  return sampleY(t);
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function easeOutQuart(value) {
  return 1 - Math.pow(1 - value, 4);
}

function mixChannel(light, dark, amount) {
  return Math.round(light + (dark - light) * amount);
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function catmullRom(p0, p1, p2, p3, amount) {
  const t2 = amount * amount;
  const t3 = t2 * amount;

  return 0.5 * (
    2 * p1 +
      (-p0 + p2) * amount +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

function circlePath(x, y, radius) {
  ctx.beginPath();
  ctx.ellipse(x, y, radius, radius, 0, 0, Math.PI * 2);
}

function getGlyph(column, row, ink) {
  const familyIndex = Math.min(
    GLYPH_FAMILIES.length - 1,
    Math.floor(ink * GLYPH_FAMILIES.length),
  );
  const family = GLYPH_FAMILIES[familyIndex];
  const scrambleBucket = Math.floor(
    state.scrambleTime / (SCRAMBLE_INTERVAL + ((column * 7 + row * 11) % 5) * 0.008),
  );
  let hash =
    column * 73856093 ^
    row * 19349663 ^
    familyIndex * 2654435761 ^
    scrambleBucket * 374761393;

  hash ^= hash >>> 13;
  hash = Math.imul(hash, 1274126177);
  hash ^= hash >>> 16;

  return family[Math.abs(hash) % family.length];
}

function getBlendedByte(frame, nextFrame, frameMix, index, previousFrame = null, afterFrame = null) {
  if (nextFrame === null || frameMix <= 0) {
    return frame[index];
  }

  const p0 = previousFrame === null ? frame[index] : previousFrame[index];
  const p1 = frame[index];
  const p2 = nextFrame[index];
  const p3 = afterFrame === null ? nextFrame[index] : afterFrame[index];

  return clamp(catmullRom(p0, p1, p2, p3, frameMix), 0, 255);
}

function getBlendedDensity(
  frame,
  nextFrame,
  frameMix,
  index,
  previousFrame = null,
  afterFrame = null,
) {
  return 1 - getBlendedByte(
    frame,
    nextFrame,
    frameMix,
    index,
    previousFrame,
    afterFrame,
  ) / 255;
}

function getDensityStats(
  frame,
  nextFrame,
  frameMix,
  index,
  column,
  row,
  previousFrame = null,
  afterFrame = null,
) {
  const center = getBlendedDensity(frame, nextFrame, frameMix, index, previousFrame, afterFrame);
  let minNeighbor = center;
  let maxNeighbor = center;
  let neighborSum = 0;
  let neighborCount = 0;

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    const sampleRow = row + rowOffset;
    if (sampleRow < 0 || sampleRow >= state.rows) continue;

    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      const sampleColumn = column + columnOffset;
      if (
        (rowOffset === 0 && columnOffset === 0) ||
        sampleColumn < 0 ||
        sampleColumn >= state.cols
      ) {
        continue;
      }

      const sampleValue = getBlendedDensity(
        frame,
        nextFrame,
        frameMix,
        sampleRow * state.cols + sampleColumn,
        previousFrame,
        afterFrame,
      );
      minNeighbor = Math.min(minNeighbor, sampleValue);
      maxNeighbor = Math.max(maxNeighbor, sampleValue);
      neighborSum += sampleValue;
      neighborCount += 1;
    }
  }

  const average = neighborCount > 0 ? neighborSum / neighborCount : center;

  return {
    value: center,
    edge: clamp(center - average + (maxNeighbor - minNeighbor) * 0.16, 0, 1),
    average,
    span: clamp(maxNeighbor - minNeighbor, 0, 1),
  };
}

function getGlyphStyle(densityStats, normalizedY, opacityMultiplier = 1) {
  const fill = smoothstep(0.03, 0.9, densityStats.value);
  const edge = smoothstep(0.012, 0.16, densityStats.edge + densityStats.span * 0.16);
  const lowerBaseBoost = smoothstep(0.72, 0.98, normalizedY) * fill * 0.05;
  const ink = clamp(fill + edge * 0.16, 0, 1);
  const alpha = clamp(
    fill * 0.72 +
      edge * 0.2 +
      lowerBaseBoost * 0.8,
    0,
    0.86,
  ) * clamp(opacityMultiplier, 0, 1);
  const tone = clamp(0.08 + fill * 0.86 + edge * 0.14, 0, 1);
  const r = mixChannel(BLUE_LIGHT.r, BLUE_DARK.r, tone);
  const g = mixChannel(BLUE_LIGHT.g, BLUE_DARK.g, tone);
  const b = mixChannel(BLUE_LIGHT.b, BLUE_DARK.b, tone);

  return {
    ink,
    alpha,
    tone,
    visible: alpha > 0.018,
    fill: `rgba(${r}, ${g}, ${b}, ${alpha})`,
  };
}

function ensureCameraGlyphAtlas() {
  if (!IS_SAFARI_BROWSER || state.activeFont === "") return false;

  const atlasKey = [
    state.activeFont,
    state.cellWidth,
    state.cellHeight,
    state.dpr,
  ].join("|");
  if (
    cameraGlyphAtlasState.ready &&
    cameraGlyphAtlasState.key === atlasKey &&
    cameraGlyphAtlasState.canvas instanceof HTMLCanvasElement
  ) {
    return true;
  }

  cameraGlyphAtlasState.canvas ??= document.createElement("canvas");
  cameraGlyphAtlasState.ctx ??=
    cameraGlyphAtlasState.canvas.getContext("2d", { alpha: true });
  if (cameraGlyphAtlasState.ctx === null) return false;

  const requestedTileWidth = Math.ceil(Math.max(
    state.cellWidth + 4,
    state.fontSize * 0.9 + 4,
  ));
  const requestedTileHeight = Math.ceil(Math.max(
    state.cellHeight + 4,
    state.fontSize * 1.3 + 4,
  ));
  const sourceTileWidth = Math.max(
    1,
    Math.ceil(requestedTileWidth * state.dpr),
  );
  const sourceTileHeight = Math.max(
    1,
    Math.ceil(requestedTileHeight * state.dpr),
  );
  // Make every logical atlas tile resolve to an exact device-pixel rectangle.
  // At fractional DPR, multiplying an integer CSS tile by 1.5 produced
  // half-pixel sprite boundaries and WebKit bilinearly softened each glyph.
  const tileWidth = sourceTileWidth / state.dpr;
  const tileHeight = sourceTileHeight / state.dpr;
  const spriteCount =
    CAMERA_GLYPH_ATLAS_TONE_STEPS *
    CAMERA_GLYPH_ATLAS_ALPHA_STEPS *
    cameraGlyphAtlasState.characters.length;
  const columns = Math.min(CAMERA_GLYPH_ATLAS_COLUMNS, spriteCount);
  const rows = Math.ceil(spriteCount / columns);
  const atlas = cameraGlyphAtlasState.canvas;
  const atlasCtx = cameraGlyphAtlasState.ctx;

  atlas.width = columns * sourceTileWidth;
  atlas.height = rows * sourceTileHeight;
  atlasCtx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  atlasCtx.clearRect(0, 0, atlas.width / state.dpr, atlas.height / state.dpr);
  atlasCtx.font = state.activeFont;
  atlasCtx.textAlign = "center";
  atlasCtx.textBaseline = "middle";

  for (
    let toneIndex = 0;
    toneIndex < CAMERA_GLYPH_ATLAS_TONE_STEPS;
    toneIndex += 1
  ) {
    const tone = toneIndex / (CAMERA_GLYPH_ATLAS_TONE_STEPS - 1);
    const red = mixChannel(BLUE_LIGHT.r, BLUE_DARK.r, tone);
    const green = mixChannel(BLUE_LIGHT.g, BLUE_DARK.g, tone);
    const blue = mixChannel(BLUE_LIGHT.b, BLUE_DARK.b, tone);

    for (
      let alphaIndex = 1;
      alphaIndex < CAMERA_GLYPH_ATLAS_ALPHA_STEPS;
      alphaIndex += 1
    ) {
      const alpha = alphaIndex / (CAMERA_GLYPH_ATLAS_ALPHA_STEPS - 1);
      atlasCtx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;

      cameraGlyphAtlasState.characters.forEach((character, characterIndex) => {
        const spriteIndex = (
          toneIndex * CAMERA_GLYPH_ATLAS_ALPHA_STEPS + alphaIndex
        ) * cameraGlyphAtlasState.characters.length + characterIndex;
        const column = spriteIndex % columns;
        const row = Math.floor(spriteIndex / columns);

        atlasCtx.fillText(
          character,
          column * tileWidth + tileWidth * 0.5,
          row * tileHeight + tileHeight * 0.5,
        );
      });
    }
  }

  cameraGlyphAtlasState.key = atlasKey;
  cameraGlyphAtlasState.ready = true;
  cameraGlyphAtlasState.tileWidth = tileWidth;
  cameraGlyphAtlasState.tileHeight = tileHeight;
  cameraGlyphAtlasState.sourceTileWidth = sourceTileWidth;
  cameraGlyphAtlasState.sourceTileHeight = sourceTileHeight;
  cameraGlyphAtlasState.dpr = state.dpr;
  cameraGlyphAtlasState.columns = columns;
  return true;
}

function ensureOwlGlyphAtlas(atlasState, renderState) {
  if (!IS_SAFARI_BROWSER || renderState.activeFont === "") return false;

  const atlasKey = [
    renderState.activeFont,
    renderState.cellWidth,
    renderState.cellHeight,
    renderState.dpr,
  ].join("|");
  if (
    atlasState.ready &&
    atlasState.key === atlasKey &&
    atlasState.canvas instanceof HTMLCanvasElement
  ) {
    return true;
  }

  atlasState.canvas ??= document.createElement("canvas");
  atlasState.ctx ??= atlasState.canvas.getContext("2d", { alpha: true });
  if (atlasState.ctx === null) return false;

  const requestedTileWidth = Math.ceil(Math.max(
    renderState.cellWidth + 4,
    renderState.fontSize * 0.9 + 4,
  ));
  const requestedTileHeight = Math.ceil(Math.max(
    renderState.cellHeight + 4,
    renderState.fontSize * 1.3 + 4,
  ));
  const sourceTileWidth = Math.max(
    1,
    Math.ceil(requestedTileWidth * renderState.dpr),
  );
  const sourceTileHeight = Math.max(
    1,
    Math.ceil(requestedTileHeight * renderState.dpr),
  );
  const tileWidth = sourceTileWidth / renderState.dpr;
  const tileHeight = sourceTileHeight / renderState.dpr;
  const spriteCount =
    CAMERA_GLYPH_ATLAS_TONE_STEPS *
    CAMERA_GLYPH_ATLAS_ALPHA_STEPS *
    atlasState.characters.length;
  const columns = Math.min(CAMERA_GLYPH_ATLAS_COLUMNS, spriteCount);
  const rows = Math.ceil(spriteCount / columns);
  const atlas = atlasState.canvas;
  const atlasCtx = atlasState.ctx;

  atlas.width = columns * sourceTileWidth;
  atlas.height = rows * sourceTileHeight;
  atlasCtx.setTransform(renderState.dpr, 0, 0, renderState.dpr, 0, 0);
  atlasCtx.clearRect(
    0,
    0,
    atlas.width / renderState.dpr,
    atlas.height / renderState.dpr,
  );
  atlasCtx.font = renderState.activeFont;
  atlasCtx.textAlign = "center";
  atlasCtx.textBaseline = "middle";

  for (
    let toneIndex = 0;
    toneIndex < CAMERA_GLYPH_ATLAS_TONE_STEPS;
    toneIndex += 1
  ) {
    const tone = toneIndex / (CAMERA_GLYPH_ATLAS_TONE_STEPS - 1);
    const color = tone < 0.58
      ? mixIntroOwlColor(
        INTRO_OWL_BLUE_LIGHT,
        INTRO_OWL_BLUE_MID,
        tone / 0.58,
      )
      : mixIntroOwlColor(
        INTRO_OWL_BLUE_MID,
        INTRO_OWL_BLUE_DARK,
        (tone - 0.58) / 0.42,
      );

    for (
      let alphaIndex = 1;
      alphaIndex < CAMERA_GLYPH_ATLAS_ALPHA_STEPS;
      alphaIndex += 1
    ) {
      const alpha = alphaIndex / (CAMERA_GLYPH_ATLAS_ALPHA_STEPS - 1);
      atlasCtx.fillStyle =
        `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;

      atlasState.characters.forEach((character, characterIndex) => {
        const spriteIndex = (
          toneIndex * CAMERA_GLYPH_ATLAS_ALPHA_STEPS + alphaIndex
        ) * atlasState.characters.length + characterIndex;
        const column = spriteIndex % columns;
        const row = Math.floor(spriteIndex / columns);

        atlasCtx.fillText(
          character,
          column * tileWidth + tileWidth * 0.5,
          row * tileHeight + tileHeight * 0.5,
        );
      });
    }
  }

  atlasState.key = atlasKey;
  atlasState.ready = true;
  atlasState.tileWidth = tileWidth;
  atlasState.tileHeight = tileHeight;
  atlasState.sourceTileWidth = sourceTileWidth;
  atlasState.sourceTileHeight = sourceTileHeight;
  atlasState.dpr = renderState.dpr;
  atlasState.columns = columns;
  return true;
}

function drawOwlGlyphFromAtlas(
  atlasState,
  renderCtx,
  glyphCell,
  glyph,
) {
  if (
    !atlasState.ready ||
    !(atlasState.canvas instanceof HTMLCanvasElement)
  ) {
    return false;
  }

  const characterIndex = atlasState.characterIndexes.get(glyph) ?? 0;
  const toneIndex = Math.round(
    clamp(glyphCell.tone, 0, 1) * (CAMERA_GLYPH_ATLAS_TONE_STEPS - 1),
  );
  const alphaIndex = Math.max(1, Math.round(
    clamp(glyphCell.alpha, 0, 1) * (CAMERA_GLYPH_ATLAS_ALPHA_STEPS - 1),
  ));
  const spriteIndex = (
    toneIndex * CAMERA_GLYPH_ATLAS_ALPHA_STEPS + alphaIndex
  ) * atlasState.characters.length + characterIndex;
  const sourceX =
    (spriteIndex % atlasState.columns) * atlasState.sourceTileWidth;
  const sourceY =
    Math.floor(spriteIndex / atlasState.columns) * atlasState.sourceTileHeight;
  const destinationX = Math.round(
    (glyphCell.x - atlasState.tileWidth * 0.5) * atlasState.dpr,
  ) / atlasState.dpr;
  const destinationY = Math.round(
    (glyphCell.y - atlasState.tileHeight * 0.5) * atlasState.dpr,
  ) / atlasState.dpr;

  renderCtx.drawImage(
    atlasState.canvas,
    sourceX,
    sourceY,
    atlasState.sourceTileWidth,
    atlasState.sourceTileHeight,
    destinationX,
    destinationY,
    atlasState.tileWidth,
    atlasState.tileHeight,
  );
  return true;
}

function getCameraCellAlpha(
  maskFrame,
  nextMaskFrame,
  frameMix,
  column,
  row,
  previousMaskFrame = null,
  afterMaskFrame = null,
) {
  if (maskFrame === null) {
    return 1;
  }

  const maskColumn = Math.floor(((column + 0.5) / state.cols) * state.maskCols);
  const maskRow = Math.floor(((row + 0.5) / state.rows) * state.maskRows);
  const index =
    clamp(maskRow, 0, state.maskRows - 1) * state.maskCols +
    clamp(maskColumn, 0, state.maskCols - 1);
  const maskValue = getBlendedByte(
    maskFrame,
    nextMaskFrame,
    frameMix,
    index,
    previousMaskFrame,
    afterMaskFrame,
  );

  return smoothstep(
    CAMERA_MASK_THRESHOLD - CAMERA_MASK_FEATHER,
    CAMERA_MASK_THRESHOLD + CAMERA_MASK_FEATHER,
    maskValue,
  );
}

function updateLayout() {
  if (state.cols === 0 || state.rows === 0) return;

  state.dpr = Math.min(window.devicePixelRatio || 1, CAMERA_MAX_DPR);
  const viewportWidth = Math.max(
    1,
    window.visualViewport?.width ?? window.innerWidth,
  );
  const viewportHeight = Math.max(
    1,
    window.visualViewport?.height ?? window.innerHeight,
  );
  const cssWidth = sceneCanvas.clientWidth || (
    activePageId === "work" ? viewportWidth : 1
  );
  const cssHeight = sceneCanvas.clientHeight || (
    activePageId === "work" ? viewportHeight : 1
  );
  const width = Math.max(1, Math.round(cssWidth * state.dpr));
  const height = Math.max(1, Math.round(cssHeight * state.dpr));

  if (sceneCanvas.width !== width || sceneCanvas.height !== height) {
    sceneCanvas.width = width;
    sceneCanvas.height = height;
  }

  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

  state.canvasWidth = cssWidth;
  state.canvasHeight = cssHeight;

  const cameraScaleBoost = viewportWidth <= CAMERA_MOBILE_BREAKPOINT
    ? CAMERA_MOBILE_SCALE_BOOST
    : COVER_SCALE_BOOST;
  const scale = Math.max(
    state.canvasWidth / state.sourceWidth,
    state.canvasHeight / state.sourceHeight,
  ) * cameraScaleBoost;

  const rawCellSize = Math.min(
    (state.sourceWidth * scale) / state.cols,
    (state.sourceHeight * scale) / state.rows,
  );
  const snappedCellSize = Math.max(
    1 / state.dpr,
    Math.round(rawCellSize * state.dpr) / state.dpr,
  );

  state.cellWidth = snappedCellSize;
  state.cellHeight = snappedCellSize;
  state.drawWidth = state.cellWidth * state.cols;
  state.drawHeight = state.cellHeight * state.rows;
  state.offsetX = Math.round(((state.canvasWidth - state.drawWidth) / 2) * state.dpr) / state.dpr;
  state.offsetY = Math.round(((state.canvasHeight - state.drawHeight) / 2) * state.dpr) / state.dpr;
  state.cellPadding = state.cellWidth * CELL_PADDING_RATIO;

  const availableWidth = Math.max(1, state.cellWidth - state.cellPadding * 2);
  const targetFontSize = Math.floor(state.cellHeight * FONT_SIZE_MULTIPLIER);
  const testFont = `${GLYPH_FONT_WEIGHT} ${targetFontSize}px ${state.fontFamily}`;
  const measuredWidth = measureAverageGlyphWidth("0000000000", testFont);
  const fittedFontSize = measuredWidth > availableWidth
    ? Math.floor(targetFontSize * (availableWidth / measuredWidth))
    : targetFontSize;

  state.fontSize = Math.max(6, fittedFontSize);
  state.activeFont = `${GLYPH_FONT_WEIGHT} ${state.fontSize}px ${state.fontFamily}`;
  ensureCameraGlyphAtlas();
}

function updateIntroOwlLayout() {
  if (
    !(introOwlCanvas instanceof HTMLCanvasElement) ||
    introOwlCtx === null ||
    introOwlState.cols === 0 ||
    introOwlState.rows === 0 ||
    introOwlCanvas.clientWidth === 0 ||
    introOwlCanvas.clientHeight === 0
  ) {
    return;
  }

  introOwlState.dpr = Math.min(
    window.devicePixelRatio || 1,
    INTRO_OWL_MAX_DPR,
  );
  const width = Math.round(introOwlCanvas.clientWidth * introOwlState.dpr);
  const height = Math.round(introOwlCanvas.clientHeight * introOwlState.dpr);

  if (introOwlCanvas.width !== width || introOwlCanvas.height !== height) {
    introOwlCanvas.width = width;
    introOwlCanvas.height = height;
  }

  introOwlCtx.setTransform(introOwlState.dpr, 0, 0, introOwlState.dpr, 0, 0);

  introOwlState.canvasWidth = introOwlCanvas.clientWidth;
  introOwlState.canvasHeight = introOwlCanvas.clientHeight;

  const fitCellSize = Math.max(
    1 / introOwlState.dpr,
    Math.floor(
      Math.min(
        introOwlState.canvasWidth / introOwlState.cols,
        introOwlState.canvasHeight / introOwlState.rows,
      ) * introOwlState.dpr,
    ) / introOwlState.dpr,
  );
  const snappedCellSize = Math.max(
    1 / introOwlState.dpr,
    Math.round(fitCellSize * INTRO_OWL_DRAW_SCALE * introOwlState.dpr) / introOwlState.dpr,
  );

  introOwlState.cellWidth = snappedCellSize;
  introOwlState.cellHeight = snappedCellSize;
  introOwlState.drawWidth = introOwlState.cellWidth * introOwlState.cols;
  introOwlState.drawHeight = introOwlState.cellHeight * introOwlState.rows;
  const centerIntroOwlOnMobile =
    window.innerWidth <= CAMERA_MOBILE_BREAKPOINT;
  const drawOffsetXRatio =
    introOwlCanvas.classList.contains("is-work-owl") || centerIntroOwlOnMobile
      ? 0
      : INTRO_OWL_DRAW_OFFSET_X_RATIO;
  introOwlState.offsetX = Math.round(
    (
      (introOwlState.canvasWidth - introOwlState.drawWidth) / 2 +
      introOwlState.canvasWidth * drawOffsetXRatio
    ) * introOwlState.dpr,
  ) / introOwlState.dpr;
  introOwlState.offsetY = Math.round(
    (
      (introOwlState.canvasHeight - introOwlState.drawHeight) / 2 +
      introOwlState.canvasHeight * INTRO_OWL_DRAW_OFFSET_Y_RATIO
    ) * introOwlState.dpr,
  ) / introOwlState.dpr;

  const availableWidth = Math.max(
    1,
    introOwlState.cellWidth - introOwlState.cellWidth * INTRO_OWL_CELL_PADDING_RATIO * 2,
  );
  const targetFontSize = Math.max(
    6,
    Math.floor(introOwlState.cellHeight * INTRO_OWL_FONT_SIZE_MULTIPLIER),
  );
  const testFont = `${INTRO_OWL_FONT_WEIGHT} ${targetFontSize}px ${introOwlState.fontFamily}`;
  const measuredWidth = measureAverageGlyphWidth("0000000000", testFont);
  const fittedFontSize = measuredWidth > availableWidth
    ? Math.floor(targetFontSize * (availableWidth / measuredWidth))
    : targetFontSize;

  introOwlState.fontSize = Math.max(5, fittedFontSize);
  introOwlState.activeFont =
    `${INTRO_OWL_FONT_WEIGHT} ${introOwlState.fontSize}px ${introOwlState.fontFamily}`;

  const layoutCacheKey = [
    introOwlState.canvasWidth,
    introOwlState.canvasHeight,
    introOwlState.cellWidth,
    introOwlState.cellHeight,
    introOwlState.offsetX,
    introOwlState.offsetY,
    introOwlState.drawWidth,
    introOwlState.drawHeight,
    introOwlState.activeFont,
  ].join("|");

  if (introOwlState.layoutCacheKey !== layoutCacheKey) {
    clearOwlRasterCache(safariIntroOwlRasterCache);
    introOwlState.glyphCellCache.clear();
    introOwlState.clipMaskCache.clear();
    introOwlState.currentFrameBucket = -1;
    introOwlState.temporalReady = false;
    introOwlState.layoutCacheKey = layoutCacheKey;
  }
  ensureOwlGlyphAtlas(introOwlGlyphAtlasState, introOwlState);
}

function updateWorkFooterSceneLayout() {
  if (
    !(workFooterSceneCanvas instanceof HTMLCanvasElement) ||
    workFooterSceneCtx === null ||
    workFooterSceneState.cols === 0 ||
    workFooterSceneState.rows === 0 ||
    workFooterSceneCanvas.clientWidth === 0 ||
    workFooterSceneCanvas.clientHeight === 0
  ) {
    return;
  }

  workFooterSceneState.dpr = Math.min(
    window.devicePixelRatio || 1,
    WORK_FOOTER_SCENE_MAX_DPR,
  );
  const width = Math.round(workFooterSceneCanvas.clientWidth * workFooterSceneState.dpr);
  const height = Math.round(workFooterSceneCanvas.clientHeight * workFooterSceneState.dpr);

  if (workFooterSceneCanvas.width !== width || workFooterSceneCanvas.height !== height) {
    workFooterSceneCanvas.width = width;
    workFooterSceneCanvas.height = height;
  }

  workFooterSceneCtx.setTransform(
    workFooterSceneState.dpr,
    0,
    0,
    workFooterSceneState.dpr,
    0,
    0,
  );

  workFooterSceneState.canvasWidth = workFooterSceneCanvas.clientWidth;
  workFooterSceneState.canvasHeight = workFooterSceneCanvas.clientHeight;

  const fitCellSize = Math.max(
    1 / workFooterSceneState.dpr,
    Math.floor(
      Math.min(
        workFooterSceneState.canvasWidth / workFooterSceneState.cols,
        workFooterSceneState.canvasHeight / workFooterSceneState.rows,
      ) * workFooterSceneState.dpr,
    ) / workFooterSceneState.dpr,
  );

  workFooterSceneState.cellWidth = fitCellSize;
  workFooterSceneState.cellHeight = fitCellSize;
  workFooterSceneState.drawWidth = workFooterSceneState.cellWidth * workFooterSceneState.cols;
  workFooterSceneState.drawHeight = workFooterSceneState.cellHeight * workFooterSceneState.rows;
  workFooterSceneState.offsetX = Math.round(
    ((workFooterSceneState.canvasWidth - workFooterSceneState.drawWidth) / 2) *
      workFooterSceneState.dpr,
  ) / workFooterSceneState.dpr;
  workFooterSceneState.offsetY = Math.round(
    ((workFooterSceneState.canvasHeight - workFooterSceneState.drawHeight) / 2) *
      workFooterSceneState.dpr,
  ) / workFooterSceneState.dpr;

  const availableWidth = Math.max(
    1,
    workFooterSceneState.cellWidth -
      workFooterSceneState.cellWidth * WORK_FOOTER_SCENE_CELL_PADDING_RATIO * 2,
  );
  const targetFontSize = Math.max(
    4,
    Math.floor(workFooterSceneState.cellHeight * WORK_FOOTER_SCENE_FONT_SIZE_MULTIPLIER),
  );
  const testFont = `${WORK_FOOTER_SCENE_FONT_WEIGHT} ${targetFontSize}px ${workFooterSceneState.fontFamily}`;
  const measuredWidth = measureAverageGlyphWidth(
    WORK_FOOTER_SCENE_FONT_FIT_SAMPLE,
    testFont,
  );
  const fittedFontSize = measuredWidth > availableWidth
    ? Math.floor(targetFontSize * (availableWidth / measuredWidth))
    : targetFontSize;

  workFooterSceneState.fontSize = Math.max(4, fittedFontSize);
  workFooterSceneState.activeFont =
    `${WORK_FOOTER_SCENE_FONT_WEIGHT} ${workFooterSceneState.fontSize}px ${workFooterSceneState.fontFamily}`;
  workFooterSceneState.lineWidth = 0;

  const layoutCacheKey = [
    workFooterSceneState.canvasWidth,
    workFooterSceneState.canvasHeight,
    workFooterSceneState.cellWidth,
    workFooterSceneState.cellHeight,
    workFooterSceneState.offsetX,
    workFooterSceneState.offsetY,
    workFooterSceneState.activeFont,
  ].join("|");

  if (workFooterSceneState.layoutCacheKey !== layoutCacheKey) {
    workFooterSceneState.cells = [];
    resetWorkFooterSceneRenderCaches(true);
    workFooterSceneState.layoutCacheKey = layoutCacheKey;
  }
}

function getIntroOwlHash(column, row, salt = 0) {
  let hash =
    column * 73856093 ^
    row * 19349663 ^
    salt * 83492791;

  hash ^= hash >>> 13;
  hash = Math.imul(hash, 1274126177);
  hash ^= hash >>> 16;

  return hash >>> 0;
}

function getIntroOwlGlyph(column, row, tone, salt = 0, preserveIdentity = false) {
  const hash = getIntroOwlHash(
    column,
    row,
    (preserveIdentity ? 0 : Math.floor(tone * 255)) ^ Math.max(0, salt) * 37,
  );

  return INTRO_OWL_GLYPHS[Math.abs(hash) % INTRO_OWL_GLYPHS.length];
}

function getIntroOwlFrameValue(data, frameOffset, column, row) {
  if (
    data === null ||
    column < 0 ||
    row < 0 ||
    column >= introOwlState.cols ||
    row >= introOwlState.rows
  ) {
    return 0;
  }

  return data[frameOffset + row * introOwlState.cols + column] / 255;
}

function getIntroOwlRawMaskAlpha(frameOffset, column, row) {
  return getIntroOwlFrameValue(introOwlState.mask, frameOffset, column, row);
}

function getIntroOwlBodyCoreAlpha(frameOffset, column, row) {
  return getIntroOwlFrameValue(introOwlState.bodyCoreMask, frameOffset, column, row);
}

function getIntroOwlBodyLockAlpha(frameOffset, column, row) {
  return getIntroOwlFrameValue(introOwlState.bodyLockMask, frameOffset, column, row);
}

function getIntroOwlMaskAlpha(frameOffset, column, row) {
  const bodyCoreAlpha = getIntroOwlBodyCoreAlpha(frameOffset, column, row);

  if (bodyCoreAlpha > 0.025) {
    return bodyCoreAlpha;
  }

  const rawMaskAlpha = getIntroOwlRawMaskAlpha(frameOffset, column, row);
  const shadowSuppression = getIntroOwlBodyLockAlpha(frameOffset, column, row);

  return rawMaskAlpha * (1 - shadowSuppression);
}

function getIntroOwlLightRepairAlpha(frameOffset, column, row) {
  if (getIntroOwlMaskAlpha(frameOffset, column, row) > 0.025) {
    return 0;
  }

  if (getIntroOwlBodyLockAlpha(frameOffset, column, row) > 0.42) {
    return 0;
  }

  if (introOwlState.repairMask === null) {
    return 0;
  }

  const repairValue = introOwlState.repairMask[frameOffset + row * introOwlState.cols + column];

  return repairValue / 255;
}

function getIntroOwlBorderStrength(frameOffset, column, row, maskAlpha) {
  let borderStrength = clamp((1 - maskAlpha) * 0.16, 0, 1);

  for (let radius = 1; radius <= 3; radius += 1) {
    let openSamples = 0;
    let totalSamples = 0;

    for (let yOffset = -radius; yOffset <= radius; yOffset += 1) {
      for (let xOffset = -radius; xOffset <= radius; xOffset += 1) {
        const isRadiusEdge =
          xOffset === -radius ||
          xOffset === radius ||
          yOffset === -radius ||
          yOffset === radius;

        if (!isRadiusEdge) {
          continue;
        }

        totalSamples += 1;

        if (getIntroOwlMaskAlpha(frameOffset, column + xOffset, row + yOffset) <= 0.025) {
          openSamples += 1;
        }
      }
    }

    if (openSamples === 0) continue;

    const radiusWeight = radius === 1
      ? 0.52
      : radius === 2
        ? 0.13
        : 0.04;
    borderStrength = Math.max(borderStrength, (openSamples / totalSamples) * radiusWeight);
  }

  const grain = getIntroOwlHash(column, row, 937) / 0xffffffff;
  const naturalBreakup = 0.72 + grain * 0.42;

  return clamp(borderStrength * 1.08 * naturalBreakup, 0, 1);
}

function getIntroOwlOutlineStrength(frameOffset, column, row, maskAlpha) {
  let openSamples = 0;
  let totalSamples = 0;

  for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
    for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
      if (xOffset === 0 && yOffset === 0) continue;

      totalSamples += 1;

      if (getIntroOwlMaskAlpha(frameOffset, column + xOffset, row + yOffset) <= 0.025) {
        openSamples += 1;
      }
    }
  }

  const edgeTouch = openSamples / Math.max(1, totalSamples);
  const featherEdge = smoothstep(0.58, 0.98, 1 - maskAlpha) * 0.34;
  const grain = getIntroOwlHash(column, row, 1733) / 0xffffffff;
  const naturalBreakup = 0.88 + grain * 0.2;

  return clamp(Math.max(edgeTouch * 2.15, featherEdge) * naturalBreakup, 0, 1);
}

function getIntroOwlContourCluster(column, row, tone, edge, outlineBand) {
  const fine = getIntroOwlHash(column, row, 2081) / 0xffffffff;
  const medium = getIntroOwlHash(Math.floor(column / 2), Math.floor(row / 2), 2083) / 0xffffffff;
  const broad = getIntroOwlHash(Math.floor((column + 1) / 4), Math.floor((row + 3) / 3), 2087) / 0xffffffff;
  const detail = smoothstep(0.18, 0.86, tone * 0.68 + edge * 0.74);

  return clamp(
    fine * 0.34 +
      medium * 0.34 +
      broad * 0.18 +
      detail * 0.26 +
      outlineBand * 0.12,
    0,
    1,
  );
}

function getIntroOwlInsidePush(frameOffset, column, row, outlineBand) {
  if (outlineBand <= 0.08) {
    return { x: 0, y: 0 };
  }

  let outsideX = 0;
  let outsideY = 0;

  for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
    for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
      if (xOffset === 0 && yOffset === 0) continue;

      if (getIntroOwlMaskAlpha(frameOffset, column + xOffset, row + yOffset) <= 0.025) {
        outsideX += xOffset;
        outsideY += yOffset;
      }
    }
  }

  const length = Math.hypot(outsideX, outsideY);
  if (length <= 0.001) {
    return { x: 0, y: 0 };
  }

  return {
    x: -(outsideX / length) * outlineBand,
    y: -(outsideY / length) * outlineBand,
  };
}

function getIntroOwlEdgeDistance(frameOffset, column, row) {
  for (let radius = 1; radius <= 5; radius += 1) {
    for (let yOffset = -radius; yOffset <= radius; yOffset += 1) {
      for (let xOffset = -radius; xOffset <= radius; xOffset += 1) {
        const isRadiusEdge =
          xOffset === -radius ||
          xOffset === radius ||
          yOffset === -radius ||
          yOffset === radius;

        if (!isRadiusEdge) continue;

        if (getIntroOwlMaskAlpha(frameOffset, column + xOffset, row + yOffset) <= 0.025) {
          return radius;
        }
      }
    }
  }

  return 6;
}

function shouldDrawIntroOwlCell(
  column,
  row,
  maskAlpha,
  tone,
  edge,
  borderStrength,
  outlineStrength,
  contourCluster,
  contourBand,
) {
  const sample = getIntroOwlHash(column, row, 191) / 0xffffffff;
  const featherDetail = smoothstep(0.24, 0.9, edge);
  const outlineBand = smoothstep(0.06, 0.52, outlineStrength);
  const softOuterBand = clamp(borderStrength - outlineBand * 0.48, 0, 1);
  const outerFade = 1 - smoothstep(0.035, 0.24, softOuterBand);
  const interiorDetail = featherDetail * (outlineBand < 0.16 ? 0.26 : 0.12);
  const contourBreakup = smoothstep(0.32, 0.82, contourCluster);
  const naturalScatter = 0.86 + (getIntroOwlHash(column, row, 421) / 0xffffffff) * 0.28;
  const density = clamp(
    (
      0.16 +
      (1 - outlineBand) * 0.32 +
      outlineBand * 0.025 +
      contourBand * (0.15 + contourBreakup * 0.54) +
      borderStrength * 0.08 +
      interiorDetail +
      tone * 0.12
    ) * naturalScatter * (0.18 + outerFade * 0.82),
    0.08,
    0.82,
  );

  if (sample <= density) {
    return true;
  }

  const structuralSample = getIntroOwlHash(column, row, 719) / 0xffffffff;
  const structuralDensity = clamp(
    0.045 + tone * 0.09 + featherDetail * 0.12 + (1 - borderStrength) * 0.045,
    0.045,
    0.24,
  );

  return (
    maskAlpha > 0.28 &&
    softOuterBand < 0.12 &&
    (tone > 0.22 || featherDetail > 0.18) &&
    structuralSample <= structuralDensity
  );
}

function shouldDrawIntroOwlInteriorCell(column, row, maskAlpha, tone, edge, borderStrength) {
  if (maskAlpha <= 0.26 || borderStrength > 0.28) {
    return false;
  }

  const sample = getIntroOwlHash(column, row, 1187) / 0xffffffff;
  const density = clamp(0.28 + tone * 0.14 + edge * 0.16, 0.24, 0.52);

  return sample <= density;
}

function mixIntroOwlColor(light, dark, amount) {
  return {
    r: Math.round(lerp(light.r, dark.r, amount)),
    g: Math.round(lerp(light.g, dark.g, amount)),
    b: Math.round(lerp(light.b, dark.b, amount)),
  };
}

function getIntroOwlColor(tone, edge) {
  const depth = clamp(tone * 0.64 + edge * 0.52, 0, 1);

  if (depth < 0.58) {
    return mixIntroOwlColor(INTRO_OWL_BLUE_LIGHT, INTRO_OWL_BLUE_MID, depth / 0.58);
  }

  return mixIntroOwlColor(INTRO_OWL_BLUE_MID, INTRO_OWL_BLUE_DARK, (depth - 0.58) / 0.42);
}

function trimIntroOwlCache(cache, limit) {
  while (cache.size > limit) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

function getIntroOwlGlyphCells(frameIndex, frameOffset) {
  const cachedGlyphCells = introOwlState.glyphCellCache.get(frameIndex);

  if (cachedGlyphCells !== undefined) {
    return cachedGlyphCells;
  }

  const glyphCells = [];
  const bodyAnchor = introOwlState.bodyAnchors[frameIndex] ?? [0, 0];

  for (let row = 0; row < introOwlState.rows; row += 1) {
    for (let column = 0; column < introOwlState.cols; column += 1) {
      const index = frameOffset + row * introOwlState.cols + column;
      const bodyCoreAlpha = getIntroOwlBodyCoreAlpha(frameOffset, column, row);
      const effectiveMaskAlpha = getIntroOwlMaskAlpha(frameOffset, column, row);
      const repairAlpha = getIntroOwlLightRepairAlpha(frameOffset, column, row);
      const isLightRepairGlyph = effectiveMaskAlpha <= 0.025 && repairAlpha > 0.025;
      const maskAlpha = Math.max(effectiveMaskAlpha, repairAlpha);

      if (maskAlpha <= 0.025) continue;

      if (isLightRepairGlyph) {
        const repairSample = getIntroOwlHash(column, row, 3137) / 0xffffffff;
        const repairCluster =
          (getIntroOwlHash(column, row, 3161) / 0xffffffff) * 0.55 +
          (getIntroOwlHash(Math.floor(column / 2), Math.floor(row / 2), 3163) / 0xffffffff) * 0.45;
        const repairDensity = clamp(0.68 + repairAlpha * 0.16 + repairCluster * 0.1, 0.72, 0.92);

        if (repairSample > repairDensity) continue;

        const repairTone = 0.1 + repairCluster * 0.1;
        const repairColor = getIntroOwlColor(repairTone, 0.035);
        const repairAlphaValue = clamp(0.1 + repairAlpha * 0.08 + repairCluster * 0.045, 0.12, 0.22);
        const jitterSeedX = getIntroOwlHash(column, row, 3149) / 0xffffffff - 0.5;
        const jitterSeedY = getIntroOwlHash(column, row, 3151) / 0xffffffff - 0.5;
        const x = introOwlState.offsetX +
          (column + 0.5 + jitterSeedX * 0.04) * introOwlState.cellWidth;
        const y = introOwlState.offsetY +
          (row + 0.5 + jitterSeedY * 0.04) * introOwlState.cellHeight;

        glyphCells.push({
          column,
          row,
          glyphColumn: column,
          glyphRow: row,
          preserveIdentity: false,
          tone: repairTone,
          x,
          y,
          fillStyle: `rgba(${repairColor.r}, ${repairColor.g}, ${repairColor.b}, ${repairAlphaValue})`,
        });
        continue;
      }

      const darkness = 1 - introOwlState.luma[index] / 255;
      const edge = introOwlState.edge[index] / 255;
      const borderStrength = getIntroOwlBorderStrength(frameOffset, column, row, maskAlpha);
      const outlineStrength = getIntroOwlOutlineStrength(frameOffset, column, row, maskAlpha);
      const outlineBand = smoothstep(0.06, 0.52, outlineStrength);
      const edgeDistance = getIntroOwlEdgeDistance(frameOffset, column, row);
      const inwardContourBand = edgeDistance <= 5
        ? clamp(1 - Math.abs(edgeDistance - 2.7) / 2.9, 0, 1)
        : 0;
      const contourBand = Math.max(clamp(inwardContourBand * 1.28, 0, 1), outlineBand * 0.18);
      const softOuterBand = clamp(borderStrength - outlineBand * 0.48, 0, 1);
      const outerOpacity = 1 - smoothstep(0.02, 0.18, softOuterBand);
      const tone = clamp(darkness * 0.62 + edge * 0.46, 0, 1);
      const contourCluster = getIntroOwlContourCluster(column, row, tone, edge, contourBand);
      const contourBreakup = smoothstep(0.32, 0.82, contourCluster);
      const contourWeight = clamp(
        0.24 +
          contourBand * (0.12 + contourBreakup * 0.36) +
          smoothstep(0.28, 0.92, edge) * 0.38 +
          tone * 0.2,
        0.22,
        0.92,
      );
      const drawPrimaryGlyph = shouldDrawIntroOwlCell(
        column,
        row,
        maskAlpha,
        tone,
        edge,
        borderStrength,
        outlineStrength,
        contourCluster,
        contourBand,
      );
      const drawInteriorGlyph = !drawPrimaryGlyph && shouldDrawIntroOwlInteriorCell(
        column,
        row,
        maskAlpha,
        tone,
        edge,
        borderStrength,
      );

      if (!drawPrimaryGlyph && !drawInteriorGlyph) continue;

      const edgeLineDamp = edgeDistance <= 1 ? 0.36 : 1;
      const contourAccent = contourBand *
        contourBreakup *
        smoothstep(0.22, 0.82, tone + edge * 0.86) *
        edgeLineDamp;
      const alpha = drawInteriorGlyph
        ? clamp(maskAlpha * (0.13 + tone * 0.13 + edge * 0.07), 0.07, 0.28)
        : clamp(
          maskAlpha *
            contourWeight *
            (0.16 + tone * 0.28 + edge * 0.32 + contourAccent * 0.18) *
            Math.max(0.04, outerOpacity),
          0.025,
          0.62,
        );
      const color = drawInteriorGlyph
        ? getIntroOwlColor(tone, edge)
        : getIntroOwlColor(
          clamp(tone + contourAccent * 0.34 + borderStrength * 0.04, 0, 1),
          clamp(edge + contourAccent * 0.28 + borderStrength * 0.04, 0, 1),
        );
      const insidePush = getIntroOwlInsidePush(frameOffset, column, row, outlineBand);
      const jitterSeedX = getIntroOwlHash(column, row, 2309) / 0xffffffff - 0.5;
      const jitterSeedY = getIntroOwlHash(column, row, 2311) / 0xffffffff - 0.5;
      const jitterAmount = drawInteriorGlyph ? 0.035 : 0.06 + outlineBand * 0.055;
      const x = introOwlState.offsetX +
        (column + 0.5) * introOwlState.cellWidth +
        (insidePush.x * 0.22 + jitterSeedX * jitterAmount) * introOwlState.cellWidth;
      const y = introOwlState.offsetY +
        (row + 0.5) * introOwlState.cellHeight +
        (insidePush.y * 0.22 + jitterSeedY * jitterAmount) * introOwlState.cellHeight;

      glyphCells.push({
        column,
        row,
        glyphColumn: bodyCoreAlpha > 0.025
          ? Math.round(column - bodyAnchor[0])
          : column,
        glyphRow: bodyCoreAlpha > 0.025
          ? Math.round(row - bodyAnchor[1])
          : row,
        preserveIdentity: bodyCoreAlpha > 0.025,
        tone,
        x,
        y,
        fillStyle: `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`,
      });
    }
  }

  introOwlState.glyphCellCache.set(frameIndex, glyphCells);
  trimIntroOwlCache(introOwlState.glyphCellCache, INTRO_OWL_GLYPH_CACHE_LIMIT);

  return glyphCells;
}

function ensureIntroOwlRenderLayers() {
  if (!(introOwlCanvas instanceof HTMLCanvasElement)) return false;

  if (introOwlState.renderCanvas === null) {
    introOwlState.renderCanvas = document.createElement("canvas");
    introOwlState.renderCtx = introOwlState.renderCanvas.getContext("2d");
  }

  if (introOwlState.maskCanvas === null) {
    introOwlState.maskCanvas = document.createElement("canvas");
    introOwlState.maskCtx = introOwlState.maskCanvas.getContext("2d");
  }

  if (introOwlState.renderCtx === null || introOwlState.maskCtx === null) {
    return false;
  }

  if (
    introOwlState.renderCanvas.width !== introOwlCanvas.width ||
    introOwlState.renderCanvas.height !== introOwlCanvas.height
  ) {
    introOwlState.renderCanvas.width = introOwlCanvas.width;
    introOwlState.renderCanvas.height = introOwlCanvas.height;
  }

  if (
    introOwlState.maskCanvas.width !== introOwlState.cols ||
    introOwlState.maskCanvas.height !== introOwlState.rows
  ) {
    introOwlState.maskCanvas.width = introOwlState.cols;
    introOwlState.maskCanvas.height = introOwlState.rows;
  }

  return true;
}

function getIntroOwlClipMaskCanvas(frameIndex, frameOffset) {
  if (introOwlState.mask === null) {
    return null;
  }

  const cachedClipMask = introOwlState.clipMaskCache.get(frameIndex);

  if (cachedClipMask !== undefined) {
    return cachedClipMask;
  }

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = introOwlState.cols;
  maskCanvas.height = introOwlState.rows;
  const maskCtx = maskCanvas.getContext("2d");

  if (maskCtx === null) {
    return null;
  }

  const imageData = maskCtx.createImageData(introOwlState.cols, introOwlState.rows);

  for (let index = 0; index < introOwlState.frameSize; index += 1) {
    const dataIndex = index * 4;
    const column = index % introOwlState.cols;
    const row = Math.floor(index / introOwlState.cols);
    imageData.data[dataIndex] = 255;
    imageData.data[dataIndex + 1] = 255;
    imageData.data[dataIndex + 2] = 255;
    const repairAlpha = getIntroOwlLightRepairAlpha(frameOffset, column, row);
    const maskValue = Math.max(
      Math.round(getIntroOwlMaskAlpha(frameOffset, column, row) * 255),
      repairAlpha > 0.025 ? 255 : 0,
    );
    imageData.data[dataIndex + 3] = maskValue <= 6
      ? 0
      : Math.min(255, Math.round(maskValue * 1.12));
  }

  maskCtx.putImageData(imageData, 0, 0);
  introOwlState.clipMaskCache.set(frameIndex, maskCanvas);
  trimIntroOwlCache(introOwlState.clipMaskCache, INTRO_OWL_CLIP_MASK_CACHE_LIMIT);

  return maskCanvas;
}

function getIntroOwlFrameSlice(buffer, frameIndex) {
  const offset = frameIndex * introOwlState.frameSize;
  return buffer.subarray(offset, offset + introOwlState.frameSize);
}

function getIntroOwlFrameLayers(framePosition) {
  const clampedPosition = clamp(
    framePosition,
    0,
    Math.max(0, introOwlState.frameCount - 1),
  );
  const frameIndex = Math.floor(clampedPosition);
  const previousFrameIndex = Math.max(0, frameIndex - 1);
  const nextFrameIndex = Math.min(introOwlState.frameCount - 1, frameIndex + 1);
  const afterFrameIndex = Math.min(introOwlState.frameCount - 1, nextFrameIndex + 1);
  const frameMix = nextFrameIndex === frameIndex ? 0 : clampedPosition - frameIndex;

  const makeLayers = (buffer) => ({
    previous: previousFrameIndex === frameIndex
      ? null
      : getIntroOwlFrameSlice(buffer, previousFrameIndex),
    current: getIntroOwlFrameSlice(buffer, frameIndex),
    next: nextFrameIndex === frameIndex
      ? null
      : getIntroOwlFrameSlice(buffer, nextFrameIndex),
    after: afterFrameIndex === nextFrameIndex
      ? null
      : getIntroOwlFrameSlice(buffer, afterFrameIndex),
  });

  return {
    frameMix,
    luma: makeLayers(introOwlState.luma),
    edge: makeLayers(introOwlState.edge),
    mask: makeLayers(introOwlState.mask),
  };
}

function getIntroOwlBlendedLayerValue(layer, frameMix, index) {
  return getBlendedByte(
    layer.current,
    layer.next,
    frameMix,
    index,
    layer.previous,
    layer.after,
  ) / 255;
}

function getIntroOwlSoftMaskAlpha(layers, column, row) {
  if (
    column < 0 ||
    row < 0 ||
    column >= introOwlState.cols ||
    row >= introOwlState.rows
  ) {
    return 0;
  }

  const index = row * introOwlState.cols + column;
  const value = getIntroOwlBlendedLayerValue(layers.mask, layers.frameMix, index);
  return smoothstep(0.025, 0.78, value);
}

function getIntroOwlToneGlyph(column, row, ink) {
  const familyIndex = Math.min(
    GLYPH_FAMILIES.length - 1,
    Math.floor(clamp(ink, 0, 0.9999) * GLYPH_FAMILIES.length),
  );
  const family = GLYPH_FAMILIES[familyIndex];
  const scrambleBucket = Math.floor(
    introOwlState.scrambleTime /
      (SCRAMBLE_INTERVAL + ((column * 5 + row * 7) % 4) * 0.009),
  );
  const hash = getIntroOwlHash(
    column,
    row,
    familyIndex * 101 + scrambleBucket * 307,
  );

  return family[hash % family.length];
}

function getWorkFooterSceneValue(buffer, column, row) {
  if (
    buffer === null ||
    column < 0 ||
    row < 0 ||
    column >= workFooterSceneState.cols ||
    row >= workFooterSceneState.rows
  ) {
    return 0;
  }

  return buffer[row * workFooterSceneState.cols + column] / 255;
}

function getWorkFooterSceneMaskAlpha(column, row) {
  return smoothstep(
    WORK_FOOTER_SCENE_MASK_FEATHER_START,
    WORK_FOOTER_SCENE_MASK_FEATHER_END,
    getWorkFooterSceneValue(workFooterSceneState.mask, column, row),
  );
}

function getWorkFooterSceneGlyph(column, row, ink) {
  const familyIndex = Math.min(
    GLYPH_FAMILIES.length - 1,
    Math.floor(clamp(ink, 0, 0.9999) * GLYPH_FAMILIES.length),
  );
  const family = GLYPH_FAMILIES[familyIndex];
  const hash = getIntroOwlHash(column, row, familyIndex * 173 + 5021);

  return family[hash % family.length];
}

function getWorkFooterSceneColor(depth, regionWeight, edgeDetail) {
  const tone = clamp(0.1 + depth * 0.76 + regionWeight * 0.1 + edgeDetail * 0.08, 0, 1);

  return mixIntroOwlColor(
    BLUE_LIGHT,
    BLUE_DARK,
    tone,
  );
}

function computeWorkFooterSceneSeparatorStrength(column, row, maskAlpha) {
  const index = row * workFooterSceneState.cols + column;
  const darkness = 1 - workFooterSceneState.luma[index] / 255;
  const sourceEdge = workFooterSceneState.edge[index] / 255;
  let neighborDarkness = 0;
  let neighborCount = 0;
  let maxDarkness = darkness;
  let minDarkness = darkness;
  let strongMaskNeighbors = 0;
  let maxNeighborMask = maskAlpha;

  for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
    const sampleRow = row + rowOffset;
    if (sampleRow < 0 || sampleRow >= workFooterSceneState.rows) continue;

    for (let columnOffset = -2; columnOffset <= 2; columnOffset += 1) {
      const sampleColumn = column + columnOffset;
      if (
        (rowOffset === 0 && columnOffset === 0) ||
        sampleColumn < 0 ||
        sampleColumn >= workFooterSceneState.cols
      ) {
        continue;
      }

      const sampleIndex = sampleRow * workFooterSceneState.cols + sampleColumn;
      const sampleDarkness = 1 - workFooterSceneState.luma[sampleIndex] / 255;
      const sampleMask = getWorkFooterSceneMaskAlpha(sampleColumn, sampleRow);
      neighborDarkness += sampleDarkness;
      neighborCount += 1;
      minDarkness = Math.min(minDarkness, sampleDarkness);
      maxDarkness = Math.max(maxDarkness, sampleDarkness);
      maxNeighborMask = Math.max(maxNeighborMask, sampleMask);

      if (sampleMask > 0.24) {
        strongMaskNeighbors += 1;
      }
    }
  }

  const averageDarkness = neighborCount > 0
    ? neighborDarkness / neighborCount
    : darkness;
  const localContrast = clamp(
    Math.abs(darkness - averageDarkness) + (maxDarkness - minDarkness) * 0.24,
    0,
    1,
  );

  const brightGap = 1 - smoothstep(0.16, 0.56, darkness);
  const interiorEdge = smoothstep(0.18, 0.68, sourceEdge + localContrast * 0.34) *
    smoothstep(0.04, 0.32, maskAlpha) *
    brightGap;
  const surroundedGap = smoothstep(0.16, 0.5, maxNeighborMask) *
    smoothstep(2, 9, strongMaskNeighbors) *
    (1 - smoothstep(0.1, 0.38, maskAlpha)) *
    clamp(0.58 + sourceEdge * 0.62 + localContrast * 0.34, 0, 1) *
    brightGap;

  return Math.max(interiorEdge, surroundedGap);
}

function getWorkFooterSceneSeparatorStrength(column, row, maskAlpha) {
  const index = row * workFooterSceneState.cols + column;

  if (workFooterSceneState.separatorStrength !== null) {
    return workFooterSceneState.separatorStrength[index] ?? 0;
  }

  return computeWorkFooterSceneSeparatorStrength(column, row, maskAlpha);
}

function getWorkFooterSceneCells() {
  if (workFooterSceneState.cells.length > 0) {
    return workFooterSceneState.cells;
  }

  const cells = [];

  if (workFooterSceneState.cellData !== null) {
    const cellData = workFooterSceneState.cellData;

    for (
      let offset = 0;
      offset + WORK_FOOTER_SCENE_CELL_RECORD_BYTES <= cellData.byteLength;
      offset += WORK_FOOTER_SCENE_CELL_RECORD_BYTES
    ) {
      const column = cellData.getUint16(offset, true);
      const row = cellData.getUint16(offset + 2, true);
      const ink = cellData.getFloat32(offset + 4, true);
      const red = cellData.getUint8(offset + 8);
      const green = cellData.getUint8(offset + 9);
      const blue = cellData.getUint8(offset + 10);
      const alpha = cellData.getUint8(offset + 11) / 100;
      const glyph = String.fromCharCode(cellData.getUint8(offset + 12));

      cells.push({
        column,
        row,
        ink,
        glyph,
        fillStyle: `rgba(${red}, ${green}, ${blue}, ${alpha})`,
        x: workFooterSceneState.offsetX +
          (column + 0.5) * workFooterSceneState.cellWidth,
        y: workFooterSceneState.offsetY +
          (row + 0.5) * workFooterSceneState.cellHeight,
      });
    }

    workFooterSceneState.cells = cells;
    return cells;
  }

  for (let row = 0; row < workFooterSceneState.rows; row += 1) {
    for (let column = 0; column < workFooterSceneState.cols; column += 1) {
      const index = row * workFooterSceneState.cols + column;
      const luma = workFooterSceneState.luma[index] / 255;
      const sourceEdge = workFooterSceneState.edge[index] / 255;
      const regionWeight = workFooterSceneState.weight === null
        ? 1
        : workFooterSceneState.weight[index] / 255;
      const isPole = workFooterSceneState.pole !== null &&
        workFooterSceneState.pole[index] > 0;
      const maskAlpha = getWorkFooterSceneMaskAlpha(column, row);

      if (maskAlpha <= (isPole ? 0.04 : 0.075)) continue;

      const darkness = 1 - luma;
      let neighborDarkness = 0;
      let neighborCount = 0;
      let minMaskAlpha = maskAlpha;
      let maxDarkness = darkness;
      let minDarkness = darkness;

      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        const sampleRow = row + rowOffset;
        if (sampleRow < 0 || sampleRow >= workFooterSceneState.rows) continue;

        for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
          const sampleColumn = column + columnOffset;
          if (
            (rowOffset === 0 && columnOffset === 0) ||
            sampleColumn < 0 ||
            sampleColumn >= workFooterSceneState.cols
          ) {
            continue;
          }

          const sampleIndex = sampleRow * workFooterSceneState.cols + sampleColumn;
          const sampleDarkness = 1 - workFooterSceneState.luma[sampleIndex] / 255;
          neighborDarkness += sampleDarkness;
          neighborCount += 1;
          minDarkness = Math.min(minDarkness, sampleDarkness);
          maxDarkness = Math.max(maxDarkness, sampleDarkness);
          minMaskAlpha = Math.min(
            minMaskAlpha,
            getWorkFooterSceneMaskAlpha(sampleColumn, sampleRow),
          );
        }
      }

      const averageDarkness = neighborCount > 0
        ? neighborDarkness / neighborCount
        : darkness;
      const localContrast = clamp(
        Math.abs(darkness - averageDarkness) + (maxDarkness - minDarkness) * 0.24,
        0,
        1,
      );
      const edgeDetail = smoothstep(0.02, 0.72, sourceEdge * 0.78 + localContrast * 0.72);
      const boundary = smoothstep(0.035, 0.74, maskAlpha - minMaskAlpha);
      const fill = smoothstep(0.035, 0.82, darkness);
      const separator = isPole
        ? 0
        : getWorkFooterSceneSeparatorStrength(column, row, maskAlpha);

      if (separator > 0.34) continue;

      const contourStrength = Math.max(
        boundary,
        edgeDetail * 0.74,
        smoothstep(0.08, 0.42, maskAlpha) *
          smoothstep(0.22, 0.62, localContrast),
      );

      if (
        !isPole &&
        maskAlpha < 0.16 &&
        contourStrength < 0.34
      ) {
        continue;
      }

      const ink = clamp(fill * 0.78 + edgeDetail * 0.26 + boundary * 0.12, 0, 1);

      const rawAlpha = isPole
        ? maskAlpha * 0.98
        : maskAlpha *
          (0.58 + fill * 0.28 + edgeDetail * 0.14 + boundary * 0.1) *
          clamp(0.92 + regionWeight * 0.12, 0.92, 1.04) *
          (1 - separator * 0.86);

      if (rawAlpha <= 0.035) continue;

      const alphaFloor = isPole
        ? 0.18
        : 0.09 + contourStrength * 0.15;
      const alpha = Math.round(clamp(rawAlpha, alphaFloor, 0.96) * 100) / 100;
      const depth = isPole
        ? 0.94
        : clamp(
          ink * 0.82 +
            edgeDetail * 0.1 +
            boundary * 0.08 +
            contourStrength * 0.04,
          0,
          1,
        );
      const color = getWorkFooterSceneColor(
        depth,
        isPole ? 1 : regionWeight,
        isPole ? 1 : edgeDetail,
      );

      cells.push({
        column,
        row,
        ink,
        glyph: isPole ? "I" : getWorkFooterSceneGlyph(column, row, ink),
        fillStyle: `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`,
        x: workFooterSceneState.offsetX +
          (column + 0.5) * workFooterSceneState.cellWidth,
        y: workFooterSceneState.offsetY +
          (row + 0.5) * workFooterSceneState.cellHeight,
      });
    }
  }

  workFooterSceneState.cells = cells;
  return cells;
}

function clearWorkFooterSceneCanvas() {
  if (
    !(workFooterSceneCanvas instanceof HTMLCanvasElement) ||
    workFooterSceneCtx === null
  ) {
    return;
  }

  workFooterSceneCtx.save();
  workFooterSceneCtx.setTransform(1, 0, 0, 1, 0, 0);
  workFooterSceneCtx.clearRect(
    0,
    0,
    workFooterSceneCanvas.width,
    workFooterSceneCanvas.height,
  );
  workFooterSceneCtx.restore();
}

function createWorkFooterSceneCanvas(width, height) {
  if (typeof OffscreenCanvas === "function") {
    return new OffscreenCanvas(width, height);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getWorkFooterSceneContext(canvas) {
  try {
    return canvas.getContext("2d", { desynchronized: true });
  } catch (_error) {
    return canvas.getContext("2d");
  }
}

function resetWorkFooterSceneSettledLayer() {
  workFooterSceneState.assemblySettledIndex = 0;
  workFooterSceneState.assemblySettledCacheKey = "";

  if (workFooterSceneState.assemblySettledCtx !== null) {
    workFooterSceneState.assemblySettledCtx.save();
    workFooterSceneState.assemblySettledCtx.setTransform(1, 0, 0, 1, 0, 0);
    workFooterSceneState.assemblySettledCtx.clearRect(
      0,
      0,
      workFooterSceneState.assemblySettledCanvas?.width ?? 0,
      workFooterSceneState.assemblySettledCanvas?.height ?? 0,
    );
    workFooterSceneState.assemblySettledCtx.restore();
  }
}

function resetWorkFooterSceneRenderCaches(clearSprites = false) {
  cancelWorkFooterScenePrewarm();
  workFooterSceneState.finalCacheKey = "";
  workFooterSceneState.finalCanvas = null;
  workFooterSceneState.finalCtx = null;
  workFooterSceneState.separatorCacheKey = "";
  workFooterSceneState.separatorCanvas = null;
  workFooterSceneState.separatorCtx = null;
  workFooterSceneState.prewarmCacheKey = "";
  workFooterSceneState.prewarmCanvas = null;
  workFooterSceneState.prewarmCtx = null;
  workFooterSceneState.prewarmCells = [];
  workFooterSceneState.prewarmIndex = 0;
  workFooterSceneState.assemblyGlyphCache = [];
  workFooterSceneState.assemblyGlyphCacheKey = "";
  workFooterSceneState.spriteWarmCacheKey = "";
  resetWorkFooterSceneSettledLayer();

  if (clearSprites) {
    workFooterSceneState.glyphSpriteCache.clear();
  }
}

function getWorkFooterSceneSpriteKey(cell) {
  const glyph = cell.glyph ?? getWorkFooterSceneGlyph(cell.column, cell.row, cell.ink);

  return [
    workFooterSceneState.activeFont,
    workFooterSceneState.lineWidth.toFixed(3),
    workFooterSceneState.dpr.toFixed(3),
    glyph,
    cell.fillStyle,
  ].join("|");
}

function getWorkFooterSceneSprite(cell) {
  const glyph = cell.glyph ?? getWorkFooterSceneGlyph(cell.column, cell.row, cell.ink);
  const key = getWorkFooterSceneSpriteKey(cell);
  const cached = workFooterSceneState.glyphSpriteCache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const cssSize = Math.ceil(Math.max(
    workFooterSceneState.fontSize * 1.72,
    workFooterSceneState.cellWidth * 2.6,
    workFooterSceneState.cellHeight * 2.6,
    8,
  ));
  const pixelSize = Math.max(1, Math.ceil(cssSize * workFooterSceneState.dpr));
  const canvas = createWorkFooterSceneCanvas(pixelSize, pixelSize);
  const spriteCtx = getWorkFooterSceneContext(canvas);

  if (spriteCtx === null) {
    return null;
  }

  spriteCtx.setTransform(
    workFooterSceneState.dpr,
    0,
    0,
    workFooterSceneState.dpr,
    0,
    0,
  );
  spriteCtx.font = workFooterSceneState.activeFont;
  spriteCtx.textAlign = "center";
  spriteCtx.textBaseline = "middle";
  spriteCtx.fillStyle = cell.fillStyle;
  spriteCtx.fillText(glyph, cssSize / 2, cssSize / 2);

  const sprite = {
    canvas,
    cssSize,
  };
  workFooterSceneState.glyphSpriteCache.set(key, sprite);
  return sprite;
}

function drawWorkFooterSceneGlyph(renderCtx, cell, x = cell.x, y = cell.y, alpha = 1) {
  if (renderCtx === null || alpha <= 0) return;

  const sprite = getWorkFooterSceneSprite(cell);

  if (sprite === null) {
    return;
  }

  const dpr = workFooterSceneState.dpr;
  const drawX = Math.round((x - sprite.cssSize / 2) * dpr) / dpr;
  const drawY = Math.round((y - sprite.cssSize / 2) * dpr) / dpr;
  renderCtx.globalAlpha = clamp(alpha, 0, 1);
  renderCtx.drawImage(
    sprite.canvas,
    drawX,
    drawY,
    sprite.cssSize,
    sprite.cssSize,
  );
}

function getWorkFooterSceneFinalCacheKey() {
  return [
    workFooterSceneState.layoutCacheKey,
    workFooterSceneState.metadata?.version ?? "",
    workFooterSceneCanvas?.width ?? 0,
    workFooterSceneCanvas?.height ?? 0,
  ].join("|");
}

function getWorkFooterSceneFinalCanvas() {
  const cacheKey = getWorkFooterSceneFinalCacheKey();

  if (
    workFooterSceneState.finalCanvas !== null &&
    workFooterSceneState.finalCtx !== null &&
    workFooterSceneState.finalCacheKey === cacheKey
  ) {
    return workFooterSceneState.finalCanvas;
  }

  if (!(workFooterSceneCanvas instanceof HTMLCanvasElement)) {
    return null;
  }

  const canvas = createWorkFooterSceneCanvas(
    workFooterSceneCanvas.width,
    workFooterSceneCanvas.height,
  );
  const finalCtx = getWorkFooterSceneContext(canvas);

  if (finalCtx === null) {
    return null;
  }

  finalCtx.save();
  finalCtx.setTransform(1, 0, 0, 1, 0, 0);
  finalCtx.clearRect(0, 0, canvas.width, canvas.height);
  finalCtx.setTransform(
    workFooterSceneState.dpr,
    0,
    0,
    workFooterSceneState.dpr,
    0,
    0,
  );

  for (const cell of getWorkFooterSceneCells()) {
    drawWorkFooterSceneGlyph(finalCtx, cell);
  }

  finalCtx.globalAlpha = 1;
  finalCtx.restore();
  workFooterSceneState.finalCanvas = canvas;
  workFooterSceneState.finalCtx = finalCtx;
  workFooterSceneState.finalCacheKey = cacheKey;
  return canvas;
}

function getWorkFooterSceneSeparatorCanvas() {
  const cacheKey = getWorkFooterSceneFinalCacheKey();

  if (
    workFooterSceneState.separatorCanvas !== null &&
    workFooterSceneState.separatorCtx !== null &&
    workFooterSceneState.separatorCacheKey === cacheKey
  ) {
    return workFooterSceneState.separatorCanvas;
  }

  if (
    !(workFooterSceneCanvas instanceof HTMLCanvasElement) ||
    workFooterSceneState.luma === null ||
    workFooterSceneState.edge === null ||
    workFooterSceneState.mask === null
  ) {
    return null;
  }

  const canvas = createWorkFooterSceneCanvas(
    workFooterSceneCanvas.width,
    workFooterSceneCanvas.height,
  );
  const separatorCtx = getWorkFooterSceneContext(canvas);

  if (separatorCtx === null) {
    return null;
  }

  separatorCtx.save();
  separatorCtx.setTransform(1, 0, 0, 1, 0, 0);
  separatorCtx.clearRect(0, 0, canvas.width, canvas.height);
  separatorCtx.setTransform(
    workFooterSceneState.dpr,
    0,
    0,
    workFooterSceneState.dpr,
    0,
    0,
  );
  separatorCtx.fillStyle = BACKGROUND_COLOR;

  const rectWidth = Math.max(
    workFooterSceneState.cellWidth * 1.65,
    workFooterSceneState.fontSize * 0.86,
  );
  const rectHeight = Math.max(
    workFooterSceneState.cellHeight * 1.45,
    workFooterSceneState.fontSize * 0.7,
  );

  for (let row = 0; row < workFooterSceneState.rows; row += 1) {
    for (let column = 0; column < workFooterSceneState.cols; column += 1) {
      const strength = workFooterSceneState.separatorStrength === null
        ? getWorkFooterSceneSeparatorStrength(
          column,
          row,
          getWorkFooterSceneMaskAlpha(column, row),
        )
        : workFooterSceneState.separatorStrength[
          row * workFooterSceneState.cols + column
        ];
      if (strength <= 0.2) continue;

      const x = workFooterSceneState.offsetX +
        (column + 0.5) * workFooterSceneState.cellWidth;
      const y = workFooterSceneState.offsetY +
        (row + 0.5) * workFooterSceneState.cellHeight;

      separatorCtx.globalAlpha = clamp((strength - 0.08) / 0.42, 0, 1);
      separatorCtx.fillRect(
        x - rectWidth / 2,
        y - rectHeight / 2,
        rectWidth,
        rectHeight,
      );
    }
  }

  separatorCtx.globalAlpha = 1;
  separatorCtx.restore();
  workFooterSceneState.separatorCanvas = canvas;
  workFooterSceneState.separatorCtx = separatorCtx;
  workFooterSceneState.separatorCacheKey = cacheKey;
  return canvas;
}

function renderWorkFooterSceneSeparators() {
  const separatorCanvas = getWorkFooterSceneSeparatorCanvas();

  if (separatorCanvas === null || workFooterSceneCtx === null) {
    return;
  }

  workFooterSceneCtx.save();
  workFooterSceneCtx.globalAlpha = 1;
  workFooterSceneCtx.globalCompositeOperation = "destination-out";
  workFooterSceneCtx.drawImage(
    separatorCanvas,
    0,
    0,
    workFooterSceneState.canvasWidth,
    workFooterSceneState.canvasHeight,
  );
  workFooterSceneCtx.globalCompositeOperation = "source-over";
  workFooterSceneCtx.drawImage(
    separatorCanvas,
    0,
    0,
    workFooterSceneState.canvasWidth,
    workFooterSceneState.canvasHeight,
  );
  workFooterSceneCtx.restore();
}

function requestWorkFooterSceneIdleCallback(callback) {
  if ("requestIdleCallback" in window) {
    return {
      type: "idle",
      id: window.requestIdleCallback(callback, { timeout: 900 }),
    };
  }

  return {
    type: "timeout",
    id: window.setTimeout(
      () => callback({ didTimeout: true, timeRemaining: () => 12 }),
      80,
    ),
  };
}

function cancelWorkFooterScenePrewarm(discardPartial = false) {
  if (workFooterScenePrewarmHandle !== null) {
    if (
      workFooterScenePrewarmHandle.type === "idle" &&
      "cancelIdleCallback" in window
    ) {
      window.cancelIdleCallback(workFooterScenePrewarmHandle.id);
    } else {
      window.clearTimeout(workFooterScenePrewarmHandle.id);
    }

    workFooterScenePrewarmHandle = null;
  }

  if (discardPartial) {
    workFooterSceneState.prewarmCacheKey = "";
    workFooterSceneState.prewarmCanvas = null;
    workFooterSceneState.prewarmCtx = null;
    workFooterSceneState.prewarmCells = [];
    workFooterSceneState.prewarmIndex = 0;
  }
}

function resetWorkFooterScenePrewarmLayer(cacheKey) {
  if (!(workFooterSceneCanvas instanceof HTMLCanvasElement)) {
    return false;
  }

  const canvas = createWorkFooterSceneCanvas(
    workFooterSceneCanvas.width,
    workFooterSceneCanvas.height,
  );
  const prewarmCtx = getWorkFooterSceneContext(canvas);

  if (prewarmCtx === null) {
    return false;
  }

  prewarmCtx.setTransform(1, 0, 0, 1, 0, 0);
  prewarmCtx.clearRect(0, 0, canvas.width, canvas.height);
  prewarmCtx.setTransform(
    workFooterSceneState.dpr,
    0,
    0,
    workFooterSceneState.dpr,
    0,
    0,
  );

  workFooterSceneState.prewarmCanvas = canvas;
  workFooterSceneState.prewarmCtx = prewarmCtx;
  workFooterSceneState.prewarmCells = getWorkFooterSceneCells();
  workFooterSceneState.prewarmIndex = 0;
  workFooterSceneState.prewarmCacheKey = cacheKey;
  return true;
}

function runWorkFooterScenePrewarm(deadline) {
  workFooterScenePrewarmHandle = null;

  if (
    !(workFooterSceneCanvas instanceof HTMLCanvasElement) ||
    workFooterSceneCtx === null ||
    workFooterSceneState.luma === null ||
    workFooterSceneState.mask === null ||
    workFooterSceneState.frameSize === 0 ||
    workFooterSceneState.assemblyActive
  ) {
    return;
  }

  updateWorkFooterSceneLayout();

  if (
    workFooterSceneState.canvasWidth === 0 ||
    workFooterSceneState.canvasHeight === 0
  ) {
    return;
  }

  const cacheKey = getWorkFooterSceneFinalCacheKey();

  if (
    workFooterSceneState.finalCanvas !== null &&
    workFooterSceneState.finalCacheKey === cacheKey
  ) {
    return;
  }

  if (
    workFooterSceneState.prewarmCacheKey !== cacheKey ||
    workFooterSceneState.prewarmCanvas === null ||
    workFooterSceneState.prewarmCtx === null
  ) {
    if (!resetWorkFooterScenePrewarmLayer(cacheKey)) {
      return;
    }
  }

  const prewarmCtx = workFooterSceneState.prewarmCtx;
  const cells = workFooterSceneState.prewarmCells;
  let processed = 0;

  while (workFooterSceneState.prewarmIndex < cells.length) {
    drawWorkFooterSceneGlyph(
      prewarmCtx,
      cells[workFooterSceneState.prewarmIndex],
    );
    workFooterSceneState.prewarmIndex += 1;
    processed += 1;

    if (
      processed >= WORK_FOOTER_SCENE_PREWARM_BATCH_SIZE ||
      (!deadline.didTimeout && deadline.timeRemaining() < 4)
    ) {
      break;
    }
  }

  if (workFooterSceneState.prewarmIndex >= cells.length) {
    prewarmCtx.globalAlpha = 1;
    workFooterSceneState.finalCanvas = workFooterSceneState.prewarmCanvas;
    workFooterSceneState.finalCtx = prewarmCtx;
    workFooterSceneState.finalCacheKey = cacheKey;
    workFooterSceneState.prewarmCanvas = null;
    workFooterSceneState.prewarmCtx = null;
    workFooterSceneState.prewarmCells = [];
    workFooterSceneState.prewarmIndex = 0;
    workFooterSceneState.prewarmCacheKey = "";
    return;
  }

  scheduleWorkFooterScenePrewarm();
}

function scheduleWorkFooterScenePrewarm() {
  if (
    workFooterScenePrewarmHandle !== null ||
    workFooterSceneState.assemblyActive
  ) {
    return;
  }

  workFooterScenePrewarmHandle = requestWorkFooterSceneIdleCallback(
    runWorkFooterScenePrewarm,
  );
}

function ensureWorkFooterSceneSettledCanvas() {
  if (!(workFooterSceneCanvas instanceof HTMLCanvasElement)) {
    return null;
  }

  const cacheKey = [
    workFooterSceneCanvas.width,
    workFooterSceneCanvas.height,
    workFooterSceneState.layoutCacheKey,
  ].join("|");

  if (
    workFooterSceneState.assemblySettledCanvas !== null &&
    workFooterSceneState.assemblySettledCtx !== null &&
    workFooterSceneState.assemblySettledCacheKey === cacheKey
  ) {
    return workFooterSceneState.assemblySettledCanvas;
  }

  const canvas = createWorkFooterSceneCanvas(
    workFooterSceneCanvas.width,
    workFooterSceneCanvas.height,
  );
  const settledCtx = getWorkFooterSceneContext(canvas);

  if (settledCtx === null) {
    return null;
  }

  settledCtx.setTransform(1, 0, 0, 1, 0, 0);
  settledCtx.clearRect(0, 0, canvas.width, canvas.height);
  settledCtx.setTransform(
    workFooterSceneState.dpr,
    0,
    0,
    workFooterSceneState.dpr,
    0,
    0,
  );

  workFooterSceneState.assemblySettledCanvas = canvas;
  workFooterSceneState.assemblySettledCtx = settledCtx;
  workFooterSceneState.assemblySettledCacheKey = cacheKey;
  workFooterSceneState.assemblySettledIndex = 0;
  return canvas;
}

function stampWorkFooterSceneSettledGlyphs(elapsed) {
  const settledCanvas = ensureWorkFooterSceneSettledCanvas();
  const settledCtx = workFooterSceneState.assemblySettledCtx;
  const settledGlyphs = workFooterSceneState.assemblySettledGlyphs;

  if (settledCanvas === null || settledCtx === null) {
    return null;
  }

  while (
    workFooterSceneState.assemblySettledIndex < settledGlyphs.length
  ) {
    const settledCell = settledGlyphs[workFooterSceneState.assemblySettledIndex];
    const settledTime = settledCell.delay + settledCell.duration;

    if (settledTime > elapsed) {
      break;
    }

    drawWorkFooterSceneGlyph(settledCtx, settledCell, settledCell.x, settledCell.y, 1);
    workFooterSceneState.assemblySettledIndex += 1;
  }

  settledCtx.globalAlpha = 1;
  return settledCanvas;
}

function renderWorkFooterSceneCells() {
  const finalCanvas = getWorkFooterSceneFinalCanvas();

  if (finalCanvas !== null && workFooterSceneCtx !== null) {
    workFooterSceneCtx.drawImage(
      finalCanvas,
      0,
      0,
      workFooterSceneState.canvasWidth,
      workFooterSceneState.canvasHeight,
    );
  }

  workFooterSceneCtx.globalAlpha = 1;
}

function getWorkFooterSceneAssemblyLaunch(cell) {
  const jitterY = (getCameraAssemblyRandom(cell.column, cell.row, 6043) - 0.5) *
    workFooterSceneState.canvasHeight * 0.16;
  const marginX = Math.max(
    workFooterSceneState.cellWidth * 12,
    workFooterSceneState.canvasWidth * (
      CAMERA_ASSEMBLY_EDGE_MARGIN_RATIO +
      getCameraAssemblyRandom(cell.column, cell.row, 6047) * 0.24
    ),
  );
  const normalizedX = clamp(
    cell.x / Math.max(1, workFooterSceneState.canvasWidth),
    0,
    1,
  );
  const normalizedY = clamp(
    cell.y / Math.max(1, workFooterSceneState.canvasHeight),
    0,
    1,
  );
  const randomJitter = getCameraAssemblyRandom(cell.column, cell.row, 6059);
  const delayMix = clamp(
    normalizedX * 0.88 +
      normalizedY * 0.06 +
      randomJitter * 0.06,
    0,
    1,
  );
  const durationMix = getCameraAssemblyRandom(cell.column, cell.row, 6067);

  return {
    startX: -marginX + normalizedX * workFooterSceneState.cellWidth * 8,
    startY: cell.y + jitterY,
    delay: delayMix * WORK_FOOTER_SCENE_ASSEMBLY_STAGGER,
    duration: WORK_FOOTER_SCENE_ASSEMBLY_MOVE_DURATION * (0.78 + durationMix * 0.22),
  };
}

function getWorkFooterSceneAssemblyCacheKey() {
  return [
    workFooterSceneState.layoutCacheKey,
    workFooterSceneState.metadata?.version ?? "",
    workFooterSceneCanvas?.width ?? 0,
    workFooterSceneCanvas?.height ?? 0,
    WORK_FOOTER_SCENE_ASSEMBLY_MOVE_DURATION,
    WORK_FOOTER_SCENE_ASSEMBLY_STAGGER,
  ].join("|");
}

function buildWorkFooterSceneAssemblyGlyphs() {
  const cacheKey = getWorkFooterSceneAssemblyCacheKey();

  if (
    workFooterSceneState.assemblyGlyphCacheKey === cacheKey &&
    workFooterSceneState.assemblyGlyphCache.length > 0
  ) {
    return workFooterSceneState.assemblyGlyphCache;
  }

  const glyphs = getWorkFooterSceneCells()
    .map((cell) => ({
      ...cell,
      ...getWorkFooterSceneAssemblyLaunch(cell),
    }))
    .sort((a, b) => a.delay - b.delay);

  workFooterSceneState.assemblyGlyphCache = glyphs;
  workFooterSceneState.assemblyGlyphCacheKey = cacheKey;
  return glyphs;
}

function warmWorkFooterSceneGlyphSprites() {
  const cacheKey = getWorkFooterSceneFinalCacheKey();

  if (workFooterSceneState.spriteWarmCacheKey === cacheKey) {
    return;
  }

  const warmedSpriteKeys = new Set();

  for (const cell of getWorkFooterSceneCells()) {
    const spriteKey = getWorkFooterSceneSpriteKey(cell);

    if (warmedSpriteKeys.has(spriteKey)) {
      continue;
    }

    warmedSpriteKeys.add(spriteKey);
    getWorkFooterSceneSprite(cell);
  }

  workFooterSceneState.spriteWarmCacheKey = cacheKey;
}

function primeWorkFooterSceneAssembly() {
  if (
    !(workFooterSceneCanvas instanceof HTMLCanvasElement) ||
    workFooterSceneCtx === null ||
    workFooterSceneState.luma === null ||
    workFooterSceneState.mask === null ||
    workFooterSceneState.frameSize === 0
  ) {
    return;
  }

  updateWorkFooterSceneLayout();

  if (
    workFooterSceneState.canvasWidth === 0 ||
    workFooterSceneState.canvasHeight === 0
  ) {
    return;
  }

  buildWorkFooterSceneAssemblyGlyphs();
  warmWorkFooterSceneGlyphSprites();
}

function setWorkFooterSceneAssemblyGlyphs(glyphs) {
  workFooterSceneState.assemblyGlyphs = glyphs;
  workFooterSceneState.assemblySettledGlyphs = [...glyphs].sort(
    (a, b) => (a.delay + a.duration) - (b.delay + b.duration),
  );
  resetWorkFooterSceneSettledLayer();
}

function refreshWorkFooterSceneAssemblyGlyphs() {
  if (!workFooterSceneState.assemblyActive) return;
  setWorkFooterSceneAssemblyGlyphs(buildWorkFooterSceneAssemblyGlyphs());
}

function getWorkFooterSceneAssemblyTotalDuration() {
  return workFooterSceneState.assemblyGlyphs.reduce(
    (duration, cell) => Math.max(duration, cell.delay + cell.duration),
    0,
  );
}

function getWorkFooterSceneAssemblyDelayUpperBound(glyphs, delay) {
  let low = 0;
  let high = glyphs.length;

  while (low < high) {
    const middle = (low + high) >>> 1;

    if (glyphs[middle].delay <= delay) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function renderWorkFooterSceneAssembly() {
  if (!workFooterSceneState.assemblyActive || workFooterSceneCtx === null) {
    return;
  }

  const settledCanvas = stampWorkFooterSceneSettledGlyphs(
    workFooterSceneState.assemblyElapsed,
  );

  if (settledCanvas !== null) {
    workFooterSceneCtx.globalAlpha = 1;
    workFooterSceneCtx.drawImage(
      settledCanvas,
      0,
      0,
      workFooterSceneState.canvasWidth,
      workFooterSceneState.canvasHeight,
    );
  }

  const glyphs = workFooterSceneState.assemblyGlyphs;
  const firstActiveIndex = getWorkFooterSceneAssemblyDelayUpperBound(
    glyphs,
    workFooterSceneState.assemblyElapsed - WORK_FOOTER_SCENE_ASSEMBLY_MOVE_DURATION,
  );
  const activeEndIndex = getWorkFooterSceneAssemblyDelayUpperBound(
    glyphs,
    workFooterSceneState.assemblyElapsed,
  );

  for (let index = firstActiveIndex; index < activeEndIndex; index += 1) {
    const cell = glyphs[index];

    const rawProgress = clamp(
      (workFooterSceneState.assemblyElapsed - cell.delay) / cell.duration,
      0,
      1,
    );

    if (rawProgress <= 0 || rawProgress >= 1) continue;

    const easedProgress = CAMERA_ASSEMBLY_EASE(rawProgress);
    const x = lerp(cell.startX, cell.x, easedProgress);
    const y = lerp(cell.startY, cell.y, easedProgress);
    const alpha = smoothstep(0, 0.22, rawProgress);

    drawWorkFooterSceneGlyph(workFooterSceneCtx, cell, x, y, alpha);
  }

  workFooterSceneCtx.globalAlpha = 1;
}

function renderWorkFooterScene() {
  if (
    !(workFooterSceneCanvas instanceof HTMLCanvasElement) ||
    workFooterSceneCtx === null ||
    workFooterSceneState.luma === null ||
    workFooterSceneState.edge === null ||
    workFooterSceneState.mask === null ||
    workFooterSceneState.frameSize === 0
  ) {
    return;
  }

  updateWorkFooterSceneLayout();

  if (
    workFooterSceneState.canvasWidth === 0 ||
    workFooterSceneState.canvasHeight === 0
  ) {
    return;
  }

  clearWorkFooterSceneCanvas();

  workFooterSceneCtx.save();
  workFooterSceneCtx.setTransform(
    workFooterSceneState.dpr,
    0,
    0,
    workFooterSceneState.dpr,
    0,
    0,
  );
  workFooterSceneCtx.font = workFooterSceneState.activeFont;
  workFooterSceneCtx.textAlign = "center";
  workFooterSceneCtx.textBaseline = "middle";
  workFooterSceneCtx.lineJoin = "round";
  workFooterSceneCtx.lineWidth = workFooterSceneState.lineWidth;

  if (workFooterSceneState.assemblyComplete) {
    renderWorkFooterSceneCells();
  } else {
    renderWorkFooterSceneAssembly();
  }

  renderWorkFooterSceneSeparators();

  workFooterSceneCtx.restore();
}

function getIntroOwlCameraStyleCells(framePosition, cacheKey) {
  const cached = introOwlState.glyphCellCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const layers = getIntroOwlFrameLayers(framePosition);
  const cells = [];

  for (let row = 0; row < introOwlState.rows; row += 1) {
    for (let column = 0; column < introOwlState.cols; column += 1) {
      const index = row * introOwlState.cols + column;
      const maskAlpha = getIntroOwlSoftMaskAlpha(layers, column, row);
      if (maskAlpha <= 0.012) continue;

      const luma = getIntroOwlBlendedLayerValue(layers.luma, layers.frameMix, index);
      const sourceEdge = getIntroOwlBlendedLayerValue(layers.edge, layers.frameMix, index);
      const darkness = 1 - luma;
      let neighborDarkness = 0;
      let neighborCount = 0;
      let minMask = maskAlpha;
      let maxDarkness = darkness;
      let minDarkness = darkness;

      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        const sampleRow = row + rowOffset;
        if (sampleRow < 0 || sampleRow >= introOwlState.rows) continue;

        for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
          const sampleColumn = column + columnOffset;
          if (
            (rowOffset === 0 && columnOffset === 0) ||
            sampleColumn < 0 ||
            sampleColumn >= introOwlState.cols
          ) {
            continue;
          }

          const sampleIndex = sampleRow * introOwlState.cols + sampleColumn;
          const sampleLuma = getIntroOwlBlendedLayerValue(
            layers.luma,
            layers.frameMix,
            sampleIndex,
          );
          const sampleDarkness = 1 - sampleLuma;
          neighborDarkness += sampleDarkness;
          neighborCount += 1;
          minDarkness = Math.min(minDarkness, sampleDarkness);
          maxDarkness = Math.max(maxDarkness, sampleDarkness);
          minMask = Math.min(
            minMask,
            getIntroOwlSoftMaskAlpha(layers, sampleColumn, sampleRow),
          );
        }
      }

      const averageDarkness = neighborCount > 0
        ? neighborDarkness / neighborCount
        : darkness;
      const localContrast = clamp(
        Math.abs(darkness - averageDarkness) + (maxDarkness - minDarkness) * 0.22,
        0,
        1,
      );
      const featherEdge = smoothstep(
        0.025,
        0.7,
        sourceEdge * 0.78 + localContrast * 0.7,
      );
      const boundary = smoothstep(0.04, 0.82, maskAlpha - minMask);
      const fill = smoothstep(0.018, 0.84, darkness);
      const ink = clamp(fill * 0.84 + featherEdge * 0.2 + boundary * 0.08, 0, 1);
      const alpha = clamp(
        maskAlpha * (
          0.28 +
          fill * 0.55 +
          featherEdge * 0.26 +
          boundary * 0.14
        ),
        0,
        0.94,
      );

      if (alpha <= 0.015) continue;

      const depth = clamp(
        fill * 0.7 + featherEdge * 0.22 + boundary * 0.08,
        0,
        1,
      );
      const color = depth < 0.58
        ? mixIntroOwlColor(
          INTRO_OWL_BLUE_LIGHT,
          INTRO_OWL_BLUE_MID,
          depth / 0.58,
        )
        : mixIntroOwlColor(
          INTRO_OWL_BLUE_MID,
          INTRO_OWL_BLUE_DARK,
          (depth - 0.58) / 0.42,
        );

      cells.push({
        column,
        row,
        ink,
        alpha,
        tone: depth,
        fillStyle: `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`,
        x: introOwlState.offsetX + (column + 0.5) * introOwlState.cellWidth,
        y: introOwlState.offsetY + (row + 0.5) * introOwlState.cellHeight,
      });
    }
  }

  introOwlState.glyphCellCache.set(cacheKey, cells);
  trimIntroOwlCache(introOwlState.glyphCellCache, INTRO_OWL_GLYPH_CACHE_LIMIT);

  return cells;
}

function getIntroOwlInterpolatedClipMask(layers, cacheKey) {
  const cached = introOwlState.clipMaskCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = introOwlState.cols;
  maskCanvas.height = introOwlState.rows;
  const maskCtx = maskCanvas.getContext("2d");
  if (maskCtx === null) return null;

  const imageData = maskCtx.createImageData(introOwlState.cols, introOwlState.rows);

  for (let index = 0; index < introOwlState.frameSize; index += 1) {
    const dataIndex = index * 4;
    const alpha = getIntroOwlBlendedLayerValue(layers.mask, layers.frameMix, index);
    imageData.data[dataIndex] = 255;
    imageData.data[dataIndex + 1] = 255;
    imageData.data[dataIndex + 2] = 255;
    imageData.data[dataIndex + 3] = Math.round(smoothstep(0.015, 0.88, alpha) * 255);
  }

  maskCtx.putImageData(imageData, 0, 0);
  introOwlState.clipMaskCache.set(cacheKey, maskCanvas);
  trimIntroOwlCache(introOwlState.clipMaskCache, INTRO_OWL_CLIP_MASK_CACHE_LIMIT);

  return maskCanvas;
}

function ensureIntroOwlTemporalLayer() {
  if (introOwlState.temporalCanvas === null) {
    introOwlState.temporalCanvas = document.createElement("canvas");
    introOwlState.temporalCtx = introOwlState.temporalCanvas.getContext("2d");
  }

  if (
    introOwlState.temporalCanvas.width !== introOwlCanvas.width ||
    introOwlState.temporalCanvas.height !== introOwlCanvas.height
  ) {
    introOwlState.temporalCanvas.width = introOwlCanvas.width;
    introOwlState.temporalCanvas.height = introOwlCanvas.height;
    introOwlState.temporalReady = false;
  }
}

function renderIntroOwl(framePosition = introOwlState.currentFramePosition) {
  if (
    introOwlCtx === null ||
    introOwlState.luma === null ||
    introOwlState.edge === null ||
    introOwlState.mask === null ||
    introOwlState.frameSize === 0 ||
    introOwlState.canvasWidth === 0 ||
    introOwlState.canvasHeight === 0
  ) {
    return;
  }

  const clampedFramePosition = clamp(
    framePosition,
    0,
    Math.max(0, introOwlState.frameCount - 1),
  );
  const frameBucket = Math.round(
    clampedFramePosition * INTRO_OWL_FRAME_BLEND_PRECISION,
  );
  const layers = getIntroOwlFrameLayers(clampedFramePosition);

  if (!ensureIntroOwlRenderLayers()) return;
  ensureIntroOwlTemporalLayer();

  const renderCtx = introOwlState.renderCtx;
  const renderCanvas = introOwlState.renderCanvas;

  renderCtx.setTransform(1, 0, 0, 1, 0, 0);
  renderCtx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
  renderCtx.save();
  renderCtx.setTransform(introOwlState.dpr, 0, 0, introOwlState.dpr, 0, 0);
  renderCtx.font = introOwlState.activeFont;
  renderCtx.textAlign = "center";
  renderCtx.textBaseline = "middle";

  if (
    introOwlState.temporalReady &&
    introOwlState.temporalCanvas !== null
  ) {
    renderCtx.save();
    renderCtx.globalAlpha = INTRO_OWL_TEMPORAL_BLEND_ALPHA;
    renderCtx.setTransform(1, 0, 0, 1, 0, 0);
    renderCtx.drawImage(introOwlState.temporalCanvas, 0, 0);
    renderCtx.restore();
  }

  const glyphCells = getIntroOwlCameraStyleCells(
    clampedFramePosition,
    frameBucket,
  );
  const useGlyphAtlas =
    IS_SAFARI_BROWSER &&
    ensureOwlGlyphAtlas(introOwlGlyphAtlasState, introOwlState);
  if (useGlyphAtlas) {
    renderCtx.imageSmoothingEnabled = false;
  }

  for (const glyphCell of glyphCells) {
    const glyph = getIntroOwlToneGlyph(
      glyphCell.column,
      glyphCell.row,
      glyphCell.ink,
    );
    if (
      !useGlyphAtlas ||
      !drawOwlGlyphFromAtlas(
        introOwlGlyphAtlasState,
        renderCtx,
        glyphCell,
        glyph,
      )
    ) {
      renderCtx.fillStyle = glyphCell.fillStyle;
      renderCtx.fillText(glyph, glyphCell.x, glyphCell.y);
    }
  }

  renderCtx.restore();

  const clipLeft = clamp(introOwlState.offsetX, 0, introOwlState.canvasWidth);
  const clipTop = clamp(introOwlState.offsetY, 0, introOwlState.canvasHeight);
  const clipRight = clamp(
    introOwlState.offsetX + introOwlState.drawWidth,
    0,
    introOwlState.canvasWidth,
  );
  const clipBottom = clamp(
    introOwlState.offsetY + introOwlState.drawHeight,
    0,
    introOwlState.canvasHeight,
  );

  renderCtx.save();
  renderCtx.setTransform(introOwlState.dpr, 0, 0, introOwlState.dpr, 0, 0);
  renderCtx.clearRect(0, 0, introOwlState.canvasWidth, clipTop);
  renderCtx.clearRect(0, clipBottom, introOwlState.canvasWidth, introOwlState.canvasHeight - clipBottom);
  renderCtx.clearRect(0, clipTop, clipLeft, clipBottom - clipTop);
  renderCtx.clearRect(clipRight, clipTop, introOwlState.canvasWidth - clipRight, clipBottom - clipTop);
  renderCtx.restore();

  const clipMaskCanvas = getIntroOwlInterpolatedClipMask(layers, frameBucket);

  if (clipMaskCanvas !== null) {
    renderCtx.save();
    renderCtx.globalCompositeOperation = "destination-in";
    renderCtx.setTransform(introOwlState.dpr, 0, 0, introOwlState.dpr, 0, 0);
    renderCtx.imageSmoothingEnabled = true;
    renderCtx.drawImage(
      clipMaskCanvas,
      introOwlState.offsetX,
      introOwlState.offsetY,
      introOwlState.drawWidth,
      introOwlState.drawHeight,
    );
    renderCtx.restore();
  }

  if (
    introOwlState.temporalCtx !== null &&
    introOwlState.temporalCanvas !== null
  ) {
    introOwlState.temporalCtx.setTransform(1, 0, 0, 1, 0, 0);
    introOwlState.temporalCtx.clearRect(
      0,
      0,
      introOwlState.temporalCanvas.width,
      introOwlState.temporalCanvas.height,
    );
    introOwlState.temporalCtx.drawImage(renderCanvas, 0, 0);
    introOwlState.temporalReady = true;
  }

  introOwlCtx.save();
  introOwlCtx.setTransform(1, 0, 0, 1, 0, 0);
  introOwlCtx.clearRect(0, 0, introOwlCanvas.width, introOwlCanvas.height);
  introOwlCtx.drawImage(renderCanvas, 0, 0);
  introOwlCtx.restore();
  introOwlState.currentFramePosition = clampedFramePosition;
  introOwlState.currentFrameIndex = Math.floor(clampedFramePosition);
  introOwlState.currentFrameBucket = frameBucket;
  introOwlState.rendered = true;
}

function getIntroOwlAssemblyTotalDuration() {
  return INTRO_OWL_ASSEMBLY_MOVE_DURATION + INTRO_OWL_ASSEMBLY_STAGGER;
}

function clearIntroOwlCanvas() {
  if (
    !(introOwlCanvas instanceof HTMLCanvasElement) ||
    introOwlCtx === null
  ) {
    return;
  }

  introOwlCtx.save();
  introOwlCtx.setTransform(1, 0, 0, 1, 0, 0);
  introOwlCtx.clearRect(0, 0, introOwlCanvas.width, introOwlCanvas.height);
  introOwlCtx.restore();
  safariIntroOwlRasterCache.currentIndex = -1;
}

function resetIntroOwlTemporalLayer() {
  introOwlState.temporalReady = false;

  if (
    introOwlState.temporalCtx === null ||
    introOwlState.temporalCanvas === null
  ) {
    return;
  }

  introOwlState.temporalCtx.save();
  introOwlState.temporalCtx.setTransform(1, 0, 0, 1, 0, 0);
  introOwlState.temporalCtx.clearRect(
    0,
    0,
    introOwlState.temporalCanvas.width,
    introOwlState.temporalCanvas.height,
  );
  introOwlState.temporalCtx.restore();
}

function getIntroOwlAssemblyLaunch(cell) {
  const direction = getIntroOwlHash(cell.column, cell.row, 3301) % 4;
  const jitterX = (
    getIntroOwlHash(cell.column, cell.row, 3307) / 0xffffffff - 0.5
  ) * introOwlState.canvasWidth * CAMERA_ASSEMBLY_SIDE_JITTER_RATIO;
  const jitterY = (
    getIntroOwlHash(cell.column, cell.row, 3313) / 0xffffffff - 0.5
  ) * introOwlState.canvasHeight * CAMERA_ASSEMBLY_SIDE_JITTER_RATIO;
  const marginX = Math.max(
    introOwlState.cellWidth * 12,
    introOwlState.canvasWidth * (
      CAMERA_ASSEMBLY_EDGE_MARGIN_RATIO +
      getIntroOwlHash(cell.column, cell.row, 3319) / 0xffffffff * 0.24
    ),
  );
  const marginY = Math.max(
    introOwlState.cellHeight * 12,
    introOwlState.canvasHeight * (
      CAMERA_ASSEMBLY_EDGE_MARGIN_RATIO +
      getIntroOwlHash(cell.column, cell.row, 3323) / 0xffffffff * 0.24
    ),
  );
  let startX = cell.x;
  let startY = cell.y;

  if (direction === 0) {
    startX = cell.x + jitterX;
    startY = -marginY;
  } else if (direction === 1) {
    startX = introOwlState.canvasWidth + marginX;
    startY = cell.y + jitterY;
  } else if (direction === 2) {
    startX = cell.x + jitterX;
    startY = introOwlState.canvasHeight + marginY;
  } else {
    startX = -marginX;
    startY = cell.y + jitterY;
  }

  const centerX = introOwlState.canvasWidth * 0.5;
  const centerY = introOwlState.canvasHeight * 0.5;
  const normalizedDistance = clamp(
    Math.hypot(
      (cell.x - centerX) / Math.max(1, introOwlState.canvasWidth),
      (cell.y - centerY) / Math.max(1, introOwlState.canvasHeight),
    ) * 1.45,
    0,
    1,
  );
  const delayMix =
    getIntroOwlHash(cell.column, cell.row, 3329) / 0xffffffff * 0.74 +
    normalizedDistance * 0.26;
  const durationMix =
    getIntroOwlHash(cell.column, cell.row, 3331) / 0xffffffff;

  return {
    startX,
    startY,
    delay: delayMix * INTRO_OWL_ASSEMBLY_STAGGER,
    duration: INTRO_OWL_ASSEMBLY_MOVE_DURATION * (0.78 + durationMix * 0.22),
  };
}

function buildIntroOwlAssemblyGlyphs() {
  return getIntroOwlCameraStyleCells(0, 0).map((cell) => ({
    ...cell,
    ...getIntroOwlAssemblyLaunch(cell),
  }));
}

function prepareIntroOwlAssembly() {
  introOwlAssemblyState.active = true;
  introOwlAssemblyState.complete = false;
  introOwlAssemblyState.elapsed = 0;
  introOwlAssemblyState.glyphs = buildIntroOwlAssemblyGlyphs();
  introOwlState.loopStartTime = null;
  introOwlState.lastRenderTime = -Infinity;
  introOwlState.rendered = false;
  resetIntroOwlTemporalLayer();
  clearIntroOwlCanvas();
}

function refreshIntroOwlAssemblyGlyphs() {
  if (!introOwlAssemblyState.active) return;
  introOwlAssemblyState.glyphs = buildIntroOwlAssemblyGlyphs();
}

function renderIntroOwlAssembly(elapsed = introOwlAssemblyState.elapsed) {
  if (
    !introOwlAssemblyState.active ||
    !(introOwlCanvas instanceof HTMLCanvasElement) ||
    introOwlCtx === null
  ) {
    return;
  }

  introOwlAssemblyState.elapsed = elapsed;
  introOwlState.scrambleTime = performance.now() / 1000;
  clearIntroOwlCanvas();

  introOwlCtx.save();
  introOwlCtx.setTransform(
    introOwlState.dpr,
    0,
    0,
    introOwlState.dpr,
    0,
    0,
  );
  introOwlCtx.font = introOwlState.activeFont;
  introOwlCtx.textAlign = "center";
  introOwlCtx.textBaseline = "middle";

  for (const cell of introOwlAssemblyState.glyphs) {
    const rawProgress = clamp((elapsed - cell.delay) / cell.duration, 0, 1);
    if (rawProgress <= 0) continue;

    const easedProgress = CAMERA_ASSEMBLY_EASE(rawProgress);
    const x = lerp(cell.startX, cell.x, easedProgress);
    const y = lerp(cell.startY, cell.y, easedProgress);

    introOwlCtx.globalAlpha = smoothstep(0, 0.22, rawProgress);
    introOwlCtx.fillStyle = cell.fillStyle;
    introOwlCtx.fillText(
      getIntroOwlToneGlyph(cell.column, cell.row, cell.ink),
      x,
      y,
    );
  }

  introOwlCtx.globalAlpha = 1;
  introOwlCtx.restore();
}

function updateIntroOwlAssembly(elapsed) {
  const totalDuration = getIntroOwlAssemblyTotalDuration();

  if (
    introOwlAssemblyState.complete &&
    elapsed >= totalDuration - 0.0001
  ) {
    return;
  }

  if (
    !introOwlAssemblyState.active ||
    introOwlAssemblyState.complete
  ) {
    prepareIntroOwlAssembly();
  }

  introOwlAssemblyState.complete = false;
  renderIntroOwlAssembly(elapsed);
}

function isWorkOwlSceneBlockingIntro() {
  return (
    activePageId === "work" &&
    workOwlSceneActive &&
    Boolean(workOwlScenePresenceScrollTrigger?.isActive)
  );
}

function isIntroSectionVisibleForOwlLoop() {
  if (!(introSection instanceof HTMLElement)) return false;

  const rect = introSection.getBoundingClientRect();
  return rect.top < window.innerHeight && rect.bottom > 0;
}

function activateIntroOwlLoopNow() {
  if (
    !(introOwlCanvas instanceof HTMLCanvasElement) ||
    !(introOwlFlightLayer instanceof HTMLElement) ||
    isWorkOwlSceneBlockingIntro() ||
    !isIntroSectionVisibleForOwlLoop()
  ) {
    introOwlLoopVisible = false;
    return;
  }

  introOwlLoopVisible = true;
  introOwlState.loopStartTime = null;
  introOwlState.lastRenderTime = -Infinity;
  introOwlState.currentFrameBucket = -1;
  introOwlState.currentScrambleBucket = -1;

  if (introFrame instanceof HTMLElement) {
    gsap.set(introFrame, { y: 0, autoAlpha: 1 });
  }
  gsap.set(introOwlFlightLayer, { opacity: 1 });
  introOwlCanvas.classList.remove("is-work-owl");
  gsap.set(introOwlCanvas, {
    autoAlpha: INTRO_OWL_FINAL_OPACITY,
    "--intro-owl-x": "0px",
    "--intro-owl-scale-x": "1",
  });
}

function finishIntroOwlAssembly() {
  introOwlAssemblyState.active = false;
  introOwlAssemblyState.complete = true;
  introOwlAssemblyState.elapsed = getIntroOwlAssemblyTotalDuration();
  introOwlAssemblyState.glyphs = [];
  introOwlState.loopStartTime = null;
  introOwlState.lastRenderTime = -Infinity;
  introOwlState.currentFrameBucket = -1;
  introOwlState.currentScrambleBucket = -1;
  resetIntroOwlTemporalLayer();
  activateIntroOwlLoopNow();
  renderIntroOwl(0);
}

function playIntroOwlAssembly(onComplete = null) {
  if (
    !(introOwlCanvas instanceof HTMLCanvasElement) ||
    introOwlAssemblyState.active
  ) {
    onComplete?.();
    return;
  }

  if (introOwlAssemblyState.complete) {
    onComplete?.();
    return;
  }

  if (!isIntroOwlDataReady()) {
    if (!introOwlAssemblyPending) {
      introOwlAssemblyPending = true;
      loadIntroOwlData()
        .then(() => {
          introOwlAssemblyPending = false;
          playIntroOwlAssembly(onComplete);
        })
        .catch((error) => {
          introOwlAssemblyPending = false;
          console.error("Unable to load intro owl data.", error);
          onComplete?.();
        });
    }

    return;
  }

  introOwlAssemblyTimeline?.kill();
  if (introFrame instanceof HTMLElement) {
    gsap.set(introFrame, { y: 0, autoAlpha: 1 });
  }
  if (introOwlFlightLayer instanceof HTMLElement) {
    gsap.set(introOwlFlightLayer, { opacity: 1 });
  }
  gsap.set(introOwlCanvas, {
    opacity: INTRO_OWL_FINAL_OPACITY,
    visibility: "visible",
    "--intro-owl-x": "0px",
    "--intro-owl-scale-x": "1",
  });

  prepareIntroOwlAssembly();

  const motion = { elapsed: 0 };
  const totalDuration = getIntroOwlAssemblyTotalDuration();

  introOwlAssemblyTimeline = gsap.timeline({
    defaults: { ease: "none" },
    onComplete() {
      finishIntroOwlAssembly();
      introOwlAssemblyTimeline = null;
      onComplete?.();
    },
  });
  introOwlAssemblyTimeline.to(motion, {
    elapsed: totalDuration,
    duration: totalDuration,
    onStart() {
      renderIntroOwlAssembly(0);
    },
    onUpdate() {
      updateIntroOwlAssembly(motion.elapsed);
    },
  });
}

function resetIntroOwlAssembly() {
  introOwlAssemblyTimeline?.kill();
  introOwlAssemblyTimeline = null;
  introOwlAssemblyState.active = false;
  introOwlAssemblyState.complete = false;
  introOwlAssemblyState.elapsed = 0;
  introOwlAssemblyState.glyphs = [];
  introOwlState.loopStartTime = null;
  introOwlState.lastRenderTime = -Infinity;
  introOwlState.rendered = false;
  introOwlLoopVisible = false;
  resetIntroOwlTemporalLayer();
  clearIntroOwlCanvas();

  if (introOwlFlightLayer instanceof HTMLElement) {
    gsap.set(introOwlFlightLayer, { opacity: 0 });
  }

  if (introOwlCanvas instanceof HTMLCanvasElement) {
    introOwlCanvas.classList.remove("is-work-owl");
    gsap.set(introOwlCanvas, {
      autoAlpha: 0,
      "--intro-owl-x": "0px",
      "--intro-owl-scale-x": "1",
    });
  }
}

class IntroTyperRun {
  constructor(nodes, opts = {}) {
    this.nodes = nodes;
    this.fps = opts.fps ?? INTRO_TYPER_FPS;
    this.cycles = opts.cycles ?? INTRO_TYPER_CYCLES;
    this.cycleLength = opts.cycleLength ?? INTRO_TYPER_CYCLE_LENGTH;
    this.delay = opts.delay ?? 0;
    this.variations = (opts.variations ?? INTRO_TYPER_VARIATIONS).slice();
    this.onComplete = typeof opts.onComplete === "function" ? opts.onComplete : null;
    this.onRevealPulse = typeof opts.onRevealPulse === "function"
      ? opts.onRevealPulse
      : null;
    this.charClass = opts.charClass ?? "intro-typer-char";
    this.frame = 0;
    this.loop = null;
    this.delayTimer = null;
    this.type = "initial";
    this.length = this.nodes.length;
    this.frames = this.length ? this.fps * (1 + this.length * 0.01) : 0;
    this.denominator = this.frames - this.frames * this.cycleLength || 1;
    this.shuffle();
  }

  reset() {
    this.stopLoop();
    this.frame = 0;
    this.type = "initial";
    this.applyFrame();
  }

  in() {
    if (this.type === "in") return;
    this.type = "in";
    this.stopLoop();
    this.frame = 0;
    this.applyFrame();
    this.startLoop();
  }

  startLoop() {
    if (this.loop || this.delayTimer || !this.nodes.length) return;

    this.shuffle();
    const begin = () => {
      this.delayTimer = null;
      if (this.loop || this.type !== "in") return;
      this.applyFrame();
      this.loop = window.setInterval(() => this.tick(), 1000 / this.fps);
    };

    if (this.delay > 0) {
      this.delayTimer = window.setTimeout(begin, this.delay * 1000);
      return;
    }

    begin();
  }

  stopLoop() {
    if (this.delayTimer !== null) {
      window.clearTimeout(this.delayTimer);
      this.delayTimer = null;
    }

    if (this.loop !== null) {
      window.clearInterval(this.loop);
      this.loop = null;
    }
  }

  tick() {
    this.frame += 1;
    this.frame = clamp(this.frame, 0, this.frames);
    this.applyFrame();

    if (this.frame >= this.frames) {
      this.stopLoop();
      this.type = "done";
      this.nodes.forEach((node) => this.setClass(node, this.getClassName()));
      this.onComplete?.();
    }
  }

  applyFrame() {
    if (!this.nodes.length) return;

    if (this.type === "initial") {
      this.nodes.forEach((node) => {
        this.setClass(node, this.getClassName("charInit"));
      });
      return;
    }

    const progress = this.frame / this.denominator;

    let revealedCharacterCount = 0;

    this.nodes.forEach((node) => {
      const wasHidden = node.currentClass.includes("charInit");
      let localProgress = progress - node.cp;
      localProgress = roundToStep(localProgress, 0.1);
      localProgress = clamp(localProgress, 0, 1);

      let variation = "charInit";
      if (localProgress > 0) {
        const variationIndex = Math.round(
          remap(localProgress, 0, 1, 0, this.cycles),
        );
        variation = this.variations[variationIndex % this.variations.length];
      }
      if (localProgress >= 1) variation = "";

      const className = localProgress <= 0
        ? this.getClassName("charInit")
        : localProgress >= 1
          ? this.getClassName()
          : this.getClassName(variation);

      this.setClass(node, className);

      if (wasHidden && !className.includes("charInit")) {
        revealedCharacterCount += 1;
      }
    });

    if (revealedCharacterCount > 0) {
      this.onRevealPulse?.(revealedCharacterCount);
    }
  }

  getClassName(variation = "") {
    return variation === ""
      ? `${this.charClass} char`
      : `${this.charClass} char ${variation}`;
  }

  setClass(node, className) {
    if (node.currentClass === className) return;
    node.currentClass = className;
    node.el.className = className;
  }

  shuffle() {
    this.variations.sort(() => 0.5 - Math.random());
  }

  destroy() {
    this.stopLoop();
  }

  getTotalDuration() {
    return this.delay + this.frames / this.fps;
  }
}

class IntroTyperGroup {
  constructor(words, opts = {}, lineStagger = INTRO_TYPER_LINE_STAGGER) {
    this.words = words.filter((word) => word instanceof HTMLElement);
    this.opts = {
      ...opts,
      onRevealPulse: opts.onRevealPulse ?? playIntroKeyPressRhythm,
    };
    this.lineStagger = lineStagger;
    this.runs = [];
    this.started = false;
    this.completedRuns = 0;
    this.onComplete = null;
    this.completionSettleDuration = 0;
    this.completionTimer = null;
    this.onComplete = null;
    this.wordRecords = this.words.map((word) => buildIntroTyperWordRecord(word));
    this.recordByWord = new Map(
      this.wordRecords.map((record) => [record.word, record]),
    );
    this.refresh();
    this.reset();
  }

  refresh() {
    if (this.started) return;

    this.runs.forEach((run) => run.destroy());
    const lineGroups = getIntroLineGroups(this.words);
    this.runs = lineGroups.map((lineGroup, lineIndex) => {
      const records = lineGroup.words
        .map((word) => this.recordByWord.get(word))
        .filter(Boolean);
      const nodes = records.flatMap((record) => record.chars);
      const divisor = nodes.length > 1 ? nodes.length - 1 : 1;

      nodes.forEach((node, index) => {
        const position = index / divisor;
        node.cp = roundToStep(bezierEase(position, 0, 0.75, 0.75, 0), 0.05);
      });

      return new IntroTyperRun(nodes, {
        ...this.opts,
        delay: lineIndex * this.lineStagger,
        onComplete: () => this.completeRun(records),
      });
    });
  }

  reset() {
    this.clearCompletionTimer();
    this.started = false;
    this.completedRuns = 0;
    this.completionSettleDuration = 0;
    this.onComplete = null;
    this.wordRecords.forEach(resetIntroTyperRecord);
    this.refresh();
    this.runs.forEach((run) => run.reset());
  }

  in(onComplete = null) {
    if (this.started) {
      if (typeof onComplete === "function") {
        this.onComplete = onComplete;
      }
      return;
    }

    this.started = true;
    this.completedRuns = 0;
    this.completionSettleDuration = 0;
    this.onComplete = typeof onComplete === "function" ? onComplete : null;

    if (this.runs.length === 0) {
      this.onComplete?.();
      return;
    }

    this.runs.forEach((run) => run.in());
  }

  final() {
    this.clearCompletionTimer();
    this.started = true;
    this.runs.forEach((run) => run.destroy());
    this.wordRecords.forEach((record) => {
      record.chars.forEach((node) => {
        node.currentClass = "intro-typer-char char";
        node.el.className = "intro-typer-char char";
      });
    });
    settleIntroTyperRecords(this.wordRecords, true);
  }

  destroy() {
    this.clearCompletionTimer();
    this.runs.forEach((run) => run.destroy());
    this.runs = [];
  }

  clearCompletionTimer() {
    if (this.completionTimer !== null) {
      window.clearTimeout(this.completionTimer);
      this.completionTimer = null;
    }
  }

  completeRun(records) {
    const settleDuration = settleIntroTyperRecords(records);

    this.completedRuns += 1;
    this.completionSettleDuration = Math.max(
      this.completionSettleDuration,
      settleDuration,
    );

    if (this.completedRuns < this.runs.length) return;

    this.clearCompletionTimer();
    this.completionTimer = window.setTimeout(() => {
      this.completionTimer = null;
      this.onComplete?.();
    }, Math.round(this.completionSettleDuration * 1000));
  }

  getRevealDuration() {
    return this.runs.reduce(
      (duration, run) => Math.max(duration, run.getTotalDuration()),
      0,
    );
  }
}

class HeroTyperGroup {
  constructor(root, opts = {}, lineStagger = 0.08, classes = {}) {
    this.root = root;
    this.charClass = classes.charClass ?? "hero-typer-char";
    this.wordClass = classes.wordClass ?? "hero-typer-word";
    this.readyDatasetKey = classes.readyDatasetKey ?? "heroTyper";
    this.typeDatasetKey = classes.typeDatasetKey ?? "heroTyperType";
    this.opts = {
      ...opts,
      charClass: this.charClass,
    };
    this.lineStagger = lineStagger;
    this.nodes = [];
    this.runs = [];
    this.started = false;
    this.completedRuns = 0;
    this.build();
    this.refresh();
    this.reset();
  }

  build() {
    this.nodes = [];
    const textNodes = [];
    const walker = document.createTreeWalker(
      this.root,
      NodeFilter.SHOW_TEXT,
    );

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    textNodes.forEach((textNode) => {
      const source = textNode.nodeValue ?? "";
      const fragment = document.createDocumentFragment();
      const parts = source.split(/(\s+)/);

      parts.forEach((part) => {
        if (part === "") return;
        if (/^\s+$/.test(part)) {
          fragment.appendChild(document.createTextNode(part));
          return;
        }

        const word = document.createElement("span");
        word.className = this.wordClass;

        Array.from(part).forEach((char) => {
          const charElement = document.createElement("span");
          const node = {
            el: charElement,
            cp: 0,
            currentClass: this.getClassName("charInit"),
          };

          charElement.className = node.currentClass;
          charElement.textContent = char;
          this.nodes.push(node);
          word.appendChild(charElement);
        });

        fragment.appendChild(word);
      });

      textNode.parentNode?.replaceChild(fragment, textNode);
    });

    this.root.dataset[this.readyDatasetKey] = "true";
  }

  getClassName(variation = "") {
    return variation === ""
      ? `${this.charClass} char`
      : `${this.charClass} char ${variation}`;
  }

  getLineGroups() {
    const orderedNodes = [...this.nodes].sort((first, second) => {
      const firstTop = first.el.offsetTop;
      const secondTop = second.el.offsetTop;
      const topDifference = firstTop - secondTop;

      if (Math.abs(topDifference) > 3) return topDifference;
      return first.el.offsetLeft - second.el.offsetLeft;
    });
    const lineGroups = [];

    orderedNodes.forEach((node) => {
      const previousLine = lineGroups[lineGroups.length - 1];

      if (
        previousLine !== undefined &&
        Math.abs(node.el.offsetTop - previousLine.top) <= 3
      ) {
        previousLine.nodes.push(node);
        return;
      }

      lineGroups.push({
        top: node.el.offsetTop,
        nodes: [node],
      });
    });

    lineGroups.forEach((lineGroup) => {
      lineGroup.nodes.sort(
        (first, second) => first.el.offsetLeft - second.el.offsetLeft,
      );
    });

    return lineGroups;
  }

  refresh() {
    if (this.started) return;

    this.runs.forEach((run) => run.destroy());
    this.runs = this.getLineGroups().map((lineGroup, lineIndex) => {
      const divisor = lineGroup.nodes.length > 1 ? lineGroup.nodes.length - 1 : 1;

      lineGroup.nodes.forEach((node, index) => {
        const position = index / divisor;
        node.cp = roundToStep(bezierEase(position, 0, 0.75, 0.75, 0), 0.05);
      });

      return new IntroTyperRun(lineGroup.nodes, {
        ...this.opts,
        delay: lineIndex * this.lineStagger,
        onComplete: () => this.completeRun(lineGroup.nodes),
      });
    });
  }

  reset() {
    this.started = false;
    this.completedRuns = 0;
    this.onComplete = null;
    this.refresh();
    this.nodes.forEach((node) => {
      node.currentClass = this.getClassName("charInit");
      node.el.className = node.currentClass;
    });
    this.runs.forEach((run) => run.reset());
    this.root.dataset[this.typeDatasetKey] = "initial";
  }

  in(onComplete = null) {
    if (this.started) {
      if (typeof onComplete === "function") {
        if (this.root.dataset[this.typeDatasetKey] === "done") {
          onComplete();
        } else {
          this.onComplete = onComplete;
        }
      }
      return;
    }

    this.started = true;
    this.completedRuns = 0;
    this.onComplete = typeof onComplete === "function" ? onComplete : null;
    this.root.dataset[this.typeDatasetKey] = "in";

    if (this.runs.length === 0) {
      this.final();
      const complete = this.onComplete;
      this.onComplete = null;
      complete?.();
      return;
    }

    this.runs.forEach((run) => run.in());
  }

  completeRun(nodes) {
    nodes.forEach((node) => {
      node.currentClass = this.getClassName();
      node.el.className = node.currentClass;
    });

    this.completedRuns += 1;
    if (this.completedRuns >= this.runs.length) {
      this.root.dataset[this.typeDatasetKey] = "done";
      const complete = this.onComplete;
      this.onComplete = null;
      complete?.();
    }
  }

  final() {
    this.started = true;
    this.runs.forEach((run) => run.destroy());
    this.nodes.forEach((node) => {
      node.currentClass = this.getClassName();
      node.el.className = node.currentClass;
    });
    this.root.dataset[this.typeDatasetKey] = "done";
  }

  destroy() {
    this.onComplete = null;
    this.runs.forEach((run) => run.destroy());
    this.runs = [];
  }
}

function buildIntroTyperWordRecord(word) {
  const source = word.dataset.introTypableText ?? word.textContent ?? "";
  const punctuation = word.dataset.introPunctuation ?? "";
  const chars = [];

  word.dataset.introTyper = "true";
  word.dataset.introTyperType = "initial";
  word.textContent = "";

  Array.from(source).forEach((char) => {
    const charElement = document.createElement("span");
    const node = {
      el: charElement,
      cp: 0,
      currentClass: "intro-typer-char char charInit",
    };

    charElement.className = node.currentClass;
    charElement.textContent = char;
    chars.push(node);
    word.appendChild(charElement);
  });

  if (punctuation !== "") {
    const punctuationElement = document.createElement("span");
    punctuationElement.className = "intro-punctuation";
    punctuationElement.textContent = punctuation;
    word.appendChild(punctuationElement);
  }

  return {
    word,
    chars,
    settled: false,
  };
}

function resetIntroTyperRecord(record) {
  record.settled = false;
  record.word.dataset.introTyperType = "initial";
  record.chars.forEach((node) => {
    node.currentClass = "intro-typer-char char charInit";
    node.el.className = node.currentClass;
  });
}

function setIntroWordsInitial(words = splitIntroCopyIntoWords()) {
  if (!words.length) return;

  gsap.killTweensOf(words);
  gsap.set(words, {
    x: 0,
    y: 0,
    autoAlpha: 1,
    color: INTRO_HIGHLIGHT_BASE_COLOR,
    fontFamily: INTRO_COPY_FONT_FAMILY,
    "--intro-highlight-alpha": 0,
    "--intro-highlight-scale-x": 0.92,
    "--intro-highlight-scale-y": 0.82,
    "--intro-punctuation-alpha": 0,
  });
}

function settleIntroTyperRecords(records, immediate = false) {
  let settleDuration = 0;

  records.forEach((record, index) => {
    if (!immediate && record.settled) return;

    const highlighted = record.word.dataset.introHighlight === "true";
    const vars = {
      color: highlighted ? INTRO_HIGHLIGHT_COLOR : INTRO_HIGHLIGHT_BASE_COLOR,
      fontFamily: highlighted ? INTRO_HIGHLIGHT_FONT_FAMILY : INTRO_COPY_FONT_FAMILY,
      "--intro-highlight-alpha": 1,
      "--intro-highlight-scale-x": 1,
      "--intro-highlight-scale-y": 1,
      "--intro-punctuation-alpha": 1,
      overwrite: "auto",
    };

    record.settled = true;
    record.word.dataset.introTyperType = "done";
    record.chars.forEach((node) => {
      node.currentClass = "intro-typer-char char";
      node.el.className = node.currentClass;
    });

    if (immediate) {
      gsap.set(record.word, vars);
      return;
    }

    const delay = index * INTRO_HIGHLIGHT_STAGGER;
    settleDuration = Math.max(
      settleDuration,
      delay + INTRO_HIGHLIGHT_DURATION,
    );

    gsap.to(record.word, {
      ...vars,
      duration: INTRO_HIGHLIGHT_DURATION,
      ease: "power2.out",
      delay,
      onStart: highlighted
        ? () => playIntroHighlightSwoosh(record.word)
        : undefined,
    });
  });

  return immediate ? 0 : settleDuration;
}

function shouldResumeSmoothScroll() {
  const root = document.documentElement;

  return (
    !document.body.classList.contains("is-startup-loading") &&
    !root.classList.contains("is-startup-transitioning") &&
    !root.classList.contains("is-camera-intro-locked") &&
    !root.classList.contains("is-intro-reveal-locked") &&
    !root.classList.contains("is-case-study-open") &&
    !root.classList.contains("is-case-study-transitioning") &&
    !root.classList.contains("is-page-transitioning")
  );
}

function reconcileSmoothScrollAfterLockChange({ resize = false } = {}) {
  if (smoothScrollReconcileFrame !== 0) {
    window.cancelAnimationFrame(smoothScrollReconcileFrame);
  }

  smoothScrollReconcileFrame = window.requestAnimationFrame(() => {
    smoothScrollReconcileFrame = 0;
    if (!smoothScroller) return;

    if (resize) {
      smoothScroller.resize?.();
    }

    const isLocked = !shouldResumeSmoothScroll();
    const autoToggleEnabled = smoothScroller.options?.autoToggle === true;

    // Modern Safari observes CSS overflow through Lenis autoToggle. Older
    // engines keep the same centralized behaviour through this fallback.
    if (!autoToggleEnabled) {
      if (isLocked) {
        smoothScroller.stop?.();
      } else {
        smoothScroller.start?.();
      }
      return;
    }

    // A delayed WebKit transition event must never leave Lenis stopped once
    // every authored CSS lock has been removed.
    if (!isLocked && smoothScroller.isStopped) {
      smoothScroller.start?.();
    }
  });
}

function setupNativeScrollTracking() {
  if (nativeScrollTrackingActive) return;

  nativeScrollTrackingActive = true;
  let previousScrollY = window.scrollY;
  window.addEventListener("scroll", () => {
    if (scrollEngineMode !== "native") {
      previousScrollY = window.scrollY;
      scheduleCriticalSceneSync();
      gsap.ticker.wake();
      return;
    }

    const nextScrollY = window.scrollY;
    const velocity = nextScrollY - previousScrollY;
    previousScrollY = nextScrollY;
    updateVisibleScrollTriggers({ velocity });
  }, { passive: true });
}

function activateNativeScrollFallback(reason = "runtime-recovery") {
  if (scrollEngineMode === "native") return;

  const currentScrollY = window.scrollY;
  window.clearTimeout(lenisInputWatchdogTimer);
  lenisInputWatchdogTimer = 0;

  if (smoothScrollTickerCallback !== null) {
    gsap.ticker.remove(smoothScrollTickerCallback);
    smoothScrollTickerCallback = null;
  }

  smoothScrollLockObserver?.disconnect();
  smoothScrollLockObserver = null;
  smoothScroller?.destroy?.();
  smoothScroller = null;
  scrollEngineMode = "native";
  installRenderSchedulerTicker();
  gsap.ticker.lagSmoothing(500, 33);
  setupNativeScrollTracking();
  window.scrollTo(0, currentScrollY);
  ScrollTrigger.update();

  console.warn(`Lenis switched to native scrolling for this session: ${reason}.`);
}

function armLenisInputWatchdog(event) {
  if (
    scrollEngineMode !== "lenis" ||
    !smoothScroller ||
    !shouldResumeSmoothScroll() ||
    !Number.isFinite(event.deltaY) ||
    Math.abs(event.deltaY) < 1
  ) {
    return;
  }

  const startScrollY = window.scrollY;
  const maxScrollY = Math.max(
    0,
    document.documentElement.scrollHeight - window.innerHeight,
  );
  const pointsPastBoundary =
    (event.deltaY < 0 && startScrollY <= 1) ||
    (event.deltaY > 0 && startScrollY >= maxScrollY - 1);
  if (pointsPastBoundary) return;

  if (smoothScroller.isStopped) {
    smoothScroller.start?.();
  }

  window.clearTimeout(lenisInputWatchdogTimer);
  lenisInputWatchdogTimer = window.setTimeout(() => {
    lenisInputWatchdogTimer = 0;
    if (
      scrollEngineMode !== "lenis" ||
      !smoothScroller ||
      !shouldResumeSmoothScroll() ||
      Math.abs(window.scrollY - startScrollY) >= 0.5
    ) {
      lenisRecoveryAttempts = 0;
      return;
    }

    if (lenisRecoveryAttempts === 0) {
      lenisRecoveryAttempts = 1;
      smoothScroller.resize?.();
      smoothScroller.start?.();
      return;
    }

    activateNativeScrollFallback("unresponsive-wheel-input");
  }, 420);
}

function getIntroRevealStartScrollY() {
  if (!(introSection instanceof HTMLElement)) return window.scrollY;

  return Math.max(
    0,
    Math.round(introSection.getBoundingClientRect().top + window.scrollY),
  );
}

function pinScrollToIntroRevealStart() {
  const targetY = getIntroRevealStartScrollY();

  smoothScroller?.scrollTo?.(targetY, {
    immediate: true,
    force: true,
  });
  window.scrollTo(0, targetY);
}

function settleSmoothScrollAtCurrentPosition() {
  const targetY = window.scrollY;

  smoothScroller?.scrollTo?.(targetY, {
    immediate: true,
    force: true,
  });
  window.scrollTo(0, targetY);
}

function lockIntroRevealScroll() {
  if (activePageId !== "work" || document.body.dataset.currentPage !== "work") return;

  introRevealLockActive = true;
  introRevealTextComplete = false;
  introRevealOwlComplete = false;
  pinScrollToIntroRevealStart();
  document.documentElement.classList.add("is-intro-reveal-locked");
  reconcileSmoothScrollAfterLockChange();
}

function unlockIntroRevealScroll() {
  const wasLocked = introRevealLockActive ||
    document.documentElement.classList.contains("is-intro-reveal-locked");

  introRevealLockActive = false;
  document.documentElement.classList.remove("is-intro-reveal-locked");

  if (introRevealFailsafeTimer !== null) {
    window.clearTimeout(introRevealFailsafeTimer);
    introRevealFailsafeTimer = null;
  }

  if (!wasLocked) return;

  settleSmoothScrollAtCurrentPosition();
  reconcileSmoothScrollAfterLockChange();
}

function clearIntroRevealTimers() {
  if (introRevealOwlTimer !== null) {
    window.clearTimeout(introRevealOwlTimer);
    introRevealOwlTimer = null;
  }

  if (introRevealUnlockTimer !== null) {
    window.clearTimeout(introRevealUnlockTimer);
    introRevealUnlockTimer = null;
  }

  if (introRevealFailsafeTimer !== null) {
    window.clearTimeout(introRevealFailsafeTimer);
    introRevealFailsafeTimer = null;
  }

  if (introRevealStartRetryTimer !== null) {
    window.clearTimeout(introRevealStartRetryTimer);
    introRevealStartRetryTimer = null;
  }
}

function cancelIntroRevealLock() {
  clearIntroRevealTimers();
  resetIntroHighlightSwooshRhythm();
  introRevealTextComplete = false;
  introRevealOwlComplete = false;
  unlockIntroRevealScroll();
}

function maybeUnlockIntroRevealScroll() {
  if (
    !introRevealLockActive ||
    !introRevealTextComplete ||
    !introRevealOwlComplete
  ) {
    return;
  }

  if (introRevealUnlockTimer !== null) {
    window.clearTimeout(introRevealUnlockTimer);
  }

  introRevealUnlockTimer = window.setTimeout(() => {
    introRevealUnlockTimer = null;
    if (introRevealTextComplete && introRevealOwlComplete) {
      unlockIntroRevealScroll();
    }
  }, 80);
}

function forceCompleteIntroReveal() {
  const words = splitIntroCopyIntoWords();

  introTyperGroup?.final();
  setIntroWordsFinal({ finishHighlightAudioSequence: true });

  if (introOwlAssemblyState.active) {
    finishIntroOwlAssembly();
    introOwlAssemblyTimeline?.kill();
    introOwlAssemblyTimeline = null;
  } else if (
    !introOwlAssemblyState.complete &&
    isIntroOwlDataReady() &&
    introOwlCanvas instanceof HTMLCanvasElement
  ) {
    finishIntroOwlAssembly();
    gsap.set(introOwlCanvas, {
      autoAlpha: INTRO_OWL_FINAL_OPACITY,
      "--intro-owl-x": "0px",
      "--intro-owl-scale-x": "1",
    });
    if (introOwlFlightLayer instanceof HTMLElement) {
      gsap.set(introOwlFlightLayer, { opacity: 1 });
    }
    if (introFrame instanceof HTMLElement) {
      gsap.set(introFrame, { y: 0, autoAlpha: 1 });
    }
  }

  gsap.set(words, {
    autoAlpha: 1,
    "--intro-punctuation-alpha": 1,
  });

  introRevealTextComplete = true;
  introRevealOwlComplete = true;
  maybeUnlockIntroRevealScroll();
}

function armIntroRevealFailsafe() {
  const revealDuration = introTyperGroup?.getRevealDuration() ?? 1.4;
  const owlDelay = Math.max(
    0.18,
    revealDuration * INTRO_TYPER_OWL_START_RATIO,
  );
  const totalDuration = Math.max(
    revealDuration + 0.9,
    owlDelay + getIntroOwlAssemblyTotalDuration() + 0.7,
  );

  if (introRevealFailsafeTimer !== null) {
    window.clearTimeout(introRevealFailsafeTimer);
  }

  introRevealFailsafeTimer = window.setTimeout(() => {
    introRevealFailsafeTimer = null;
    if (introRevealLockActive) {
      forceCompleteIntroReveal();
    }
  }, Math.round(totalDuration * 1000));
}

function markIntroRevealTextComplete() {
  introRevealTextComplete = true;
  maybeUnlockIntroRevealScroll();
}

function markIntroRevealOwlComplete() {
  introRevealOwlComplete = true;
  maybeUnlockIntroRevealScroll();
}

function scheduleIntroOwlMidwayReveal() {
  const revealDuration = introTyperGroup?.getRevealDuration() ?? 0;
  const delay = Math.max(
    0.18,
    revealDuration * INTRO_TYPER_OWL_START_RATIO,
  );

  if (introRevealOwlTimer !== null) {
    window.clearTimeout(introRevealOwlTimer);
  }

  introRevealOwlTimer = window.setTimeout(() => {
    introRevealOwlTimer = null;
    playIntroOwlAssembly(markIntroRevealOwlComplete);
  }, Math.round(delay * 1000));
}

function isCameraCoveringIntroReveal() {
  return (
    state.cameraActive ||
    cameraPlaybackState.finishing ||
    stage.classList.contains("is-camera-handoff")
  );
}

function requestIntroTyperRevealAfterCamera() {
  if (activePageId !== "work" || document.body.dataset.currentPage !== "work") return;
  if (!startupCameraAssemblyComplete) return;
  if (introTyperHasPlayed) return;

  if (introRevealStartRetryTimer !== null) {
    window.clearTimeout(introRevealStartRetryTimer);
    introRevealStartRetryTimer = null;
  }

  if (isCameraCoveringIntroReveal()) {
    introRevealStartRetryTimer = window.setTimeout(
      requestIntroTyperRevealAfterCamera,
      80,
    );
    return;
  }

  // The text and owl are one reveal. On a cold Safari visit the 5.4 MB owl
  // data used to begin loading from an idle callback, so the failsafe could
  // finish the text and unlock scrolling before the owl existed.
  if (!isIntroOwlDataReady()) {
    loadIntroOwlData()
      .then(requestIntroTyperRevealAfterCamera)
      .catch((error) => {
        console.error("Unable to prepare the intro owl reveal.", error);
        playIntroTyperReveal();
      });
    return;
  }

  playIntroTyperReveal();
}

function resetIntroTyperReveal({ resetOwl = true } = {}) {
  const words = splitIntroCopyIntoWords();

  if (!words.length) return;

  cancelIntroRevealLock();
  resetIntroKeyPressRhythm();
  introTyperHasPlayed = false;
  if (introTyperGroup === null) {
    introTyperGroup = new IntroTyperGroup(
      words,
      {
        fps: INTRO_TYPER_FPS,
        cycles: INTRO_TYPER_CYCLES,
        cycleLength: INTRO_TYPER_CYCLE_LENGTH,
        variations: INTRO_TYPER_VARIATIONS,
      },
      INTRO_TYPER_LINE_STAGGER,
    );
  } else {
    introTyperGroup.reset();
  }
  setIntroWordsInitial(words);

  if (resetOwl) {
    resetIntroOwlAssembly();
  }
}

function playIntroTyperReveal() {
  if (activePageId !== "work" || document.body.dataset.currentPage !== "work") return;
  if (!startupCameraAssemblyComplete) return;
  if (introTyperHasPlayed) return;

  const words = splitIntroCopyIntoWords();
  if (!words.length) return;

  // The fixed intro frame replaces Safari's independently composited sticky
  // release. Make its required baseline visible at the exact camera handoff;
  // ScrollTrigger considers that boundary progress 0 until the next pixel.
  if (introFrame instanceof HTMLElement) {
    gsap.set(introFrame, { y: 0, autoAlpha: 1 });
  }

  introTyperHasPlayed = true;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setIntroWordsFinal();
    return;
  }

  if (introTyperGroup === null) {
    introTyperGroup = new IntroTyperGroup(
      words,
      {
        fps: INTRO_TYPER_FPS,
        cycles: INTRO_TYPER_CYCLES,
        cycleLength: INTRO_TYPER_CYCLE_LENGTH,
        variations: INTRO_TYPER_VARIATIONS,
      },
      INTRO_TYPER_LINE_STAGGER,
    );
    setIntroWordsInitial(words);
  } else {
    introTyperGroup.refresh();
  }

  clearIntroRevealTimers();
  lockIntroRevealScroll();
  resetIntroKeyPressRhythm();
  introTyperGroup.in(markIntroRevealTextComplete);
  scheduleIntroOwlMidwayReveal();
  armIntroRevealFailsafe();
}

function updateIntroScale() {
  introTyperGroup?.refresh();
  introRevealTimeline?.invalidate();
}

function getIntroCurvedValue(firstValue, finalValue, curve, index, maxIndex) {
  const progress = maxIndex === 0 ? 1 : index / maxIndex;
  const curvedProgress = 1 - Math.pow(1 - progress, curve);

  return firstValue + (finalValue - firstValue) * curvedProgress;
}

function normalizeIntroHighlightWord(word) {
  return word.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
}

function getIntroHighlightIndexes(words) {
  const normalizedWords = words.map(normalizeIntroHighlightWord);
  const highlightIndexes = new Set();
  const targetPhrases = [
    ["design", "engineer"],
  ];
  const targetWords = new Set([
    "photographer",
    "visuals",
    "motion",
    "interface",
    "camera",
    "code",
  ]);

  targetPhrases.forEach((phrase) => {
    for (let index = 0; index <= normalizedWords.length - phrase.length; index += 1) {
      const matchesPhrase = phrase.every(
        (phraseWord, phraseIndex) => normalizedWords[index + phraseIndex] === phraseWord,
      );

      if (matchesPhrase) {
        phrase.forEach((_, phraseIndex) => {
          highlightIndexes.add(index + phraseIndex);
        });
      }
    }
  });

  normalizedWords.forEach((word, index) => {
    if (targetWords.has(word)) {
      highlightIndexes.add(index);
    }
  });

  return highlightIndexes;
}

function getIntroHighlightWords(words = introWords) {
  introHighlightWords = words.filter(
    (word) => word instanceof HTMLElement && word.dataset.introHighlight === "true",
  );

  return introHighlightWords;
}

function shouldBreakIntroLineAfterWord(words, index) {
  const currentWord = normalizeIntroHighlightWord(words[index] ?? "");
  const nextWord = normalizeIntroHighlightWord(words[index + 1] ?? "");

  return currentWord === "code" && nextWord === "i";
}

function splitIntroCopyIntoWords() {
  if (!(introCopy instanceof HTMLElement)) return [];

  if (introCopy.dataset.split === "true") {
    introWords = Array.from(introCopy.querySelectorAll(".intro-word"));
    getIntroHighlightWords(introWords);
    return introWords;
  }

  const text = (introCopy.textContent ?? "").replace(/\s+/g, " ").trim();
  const words = text.split(" ").filter(Boolean);
  const highlightIndexes = getIntroHighlightIndexes(words);

  introCopy.setAttribute("aria-label", text);
  introCopy.textContent = "";

  words.forEach((word, index) => {
    const wordElement = document.createElement("span");
    const highlighted = highlightIndexes.has(index);
    const punctuationMatch = word.match(/^(.+?)([,.]+)$/);
    const typableText = punctuationMatch?.[1] ?? word;
    const trailing = punctuationMatch?.[2] ?? "";

    wordElement.className = "intro-word";
    wordElement.textContent = typableText;
    wordElement.dataset.wordIndex = String(index);
    wordElement.dataset.introTypableText = typableText;

    if (highlighted) {
      wordElement.classList.add("is-intro-highlight");
      wordElement.dataset.introHighlight = "true";
      wordElement.style.fontFamily = INTRO_HIGHLIGHT_FONT_FAMILY;
    }

    if (trailing !== "") {
      const punctuationElement = document.createElement("span");
      wordElement.classList.add("has-intro-punctuation");
      wordElement.dataset.introPunctuation = trailing;
      punctuationElement.className = "intro-punctuation";
      punctuationElement.textContent = trailing;
      punctuationElement.style.color = INTRO_HIGHLIGHT_BASE_COLOR;
      punctuationElement.style.fontFamily = INTRO_COPY_FONT_FAMILY;
      wordElement.appendChild(punctuationElement);
    }

    introCopy.appendChild(wordElement);

    if (index < words.length - 1) {
      if (shouldBreakIntroLineAfterWord(words, index)) {
        introCopy.appendChild(document.createElement("br"));
      } else {
        introCopy.appendChild(document.createTextNode(" "));
      }
    }
  });

  introCopy.dataset.split = "true";
  introWords = Array.from(introCopy.querySelectorAll(".intro-word"));
  getIntroHighlightWords(introWords);

  return introWords;
}

function getIntroViewportWidth() {
  return Math.max(1, window.visualViewport?.width ?? window.innerWidth);
}

function getIntroWordInitialX(index, total, word, enterFromViewportRight = false) {
  const viewportWidth = getIntroViewportWidth();
  const cardRect = introCard instanceof HTMLElement ? introCard.getBoundingClientRect() : null;
  const cardWidth = cardRect?.width ?? viewportWidth;
  const maxIndex = Math.max(total - 1, 1);

  const progress = (index + 1) / (maxIndex + 1);
  const baseStep = viewportWidth < 620 ? 21 : 34;
  const spreadCap = Math.min(viewportWidth * 0.76, cardWidth * 1.02);
  const frontSpread = viewportWidth * INTRO_REVEAL_FRONT_SPREAD_RATIO;
  const curvedSpread = Math.pow(progress, 0.74) * spreadCap;
  const sequentialSpread = index * baseStep;
  const initialX = Math.round(frontSpread + sequentialSpread + curvedSpread);

  if (!enterFromViewportRight || !(word instanceof HTMLElement)) {
    return initialX;
  }

  const copyLeft = introCopy instanceof HTMLElement
    ? introCopy.getBoundingClientRect().left
    : 0;
  const wordLeft = copyLeft + word.offsetLeft;
  const offscreenX = viewportWidth + Math.max(24, viewportWidth * 0.035) - wordLeft;

  return Math.max(initialX, Math.round(offscreenX));
}

function getIntroWordInitialY(index) {
  const viewportWidth = getIntroViewportWidth();
  const drift = viewportWidth < 620 ? 4 : 7;

  return Math.round(Math.sin(index * 1.47) * drift);
}

function getIntroRevealGap(index, total) {
  const gapCount = Math.max(total - 1, 1);

  return getIntroCurvedValue(
    INTRO_REVEAL_FIRST_STAGGER,
    INTRO_REVEAL_FINAL_STAGGER,
    INTRO_REVEAL_STAGGER_CURVE,
    index,
    gapCount - 1,
  );
}

function sortIntroWordsTopToBottom(firstWord, secondWord) {
  const firstTop = firstWord.offsetTop;
  const secondTop = secondWord.offsetTop;
  const topDifference = firstTop - secondTop;

  if (Math.abs(topDifference) > 3) {
    return topDifference;
  }

  return firstWord.offsetLeft - secondWord.offsetLeft;
}

function getIntroLineGroups(words) {
  const lineGroups = [];
  const orderedWords = [...words].sort(sortIntroWordsTopToBottom);

  orderedWords.forEach((word) => {
    const previousLine = lineGroups[lineGroups.length - 1];

    if (previousLine !== undefined && Math.abs(word.offsetTop - previousLine.top) <= 3) {
      previousLine.words.push(word);
      return;
    }

    lineGroups.push({
      top: word.offsetTop,
      words: [word],
    });
  });

  lineGroups.forEach((lineGroup) => {
    lineGroup.words.sort((firstWord, secondWord) => firstWord.offsetLeft - secondWord.offsetLeft);
  });

  return lineGroups;
}

function getIntroLineSettleTime(lineGroup, wordSettleTimes) {
  return lineGroup.words.reduce(
    (settleAt, word) => Math.max(settleAt, wordSettleTimes.get(word) ?? 0),
    0,
  );
}

function getIntroLineFinalTime(lineGroup, wordSettleTimes) {
  const lineSettleAt = getIntroLineSettleTime(lineGroup, wordSettleTimes);
  const highlightedWordCount = lineGroup.words.filter(
    (word) => word instanceof HTMLElement && word.dataset.introHighlight === "true",
  ).length;

  if (highlightedWordCount === 0) {
    return lineSettleAt;
  }

  return (
    lineSettleAt +
    INTRO_HIGHLIGHT_SETTLE_DELAY +
    INTRO_HIGHLIGHT_DURATION +
    Math.max(0, highlightedWordCount - 1) * INTRO_HIGHLIGHT_STAGGER +
    0.001
  );
}

function maybePlayIntroOwlAssembly(words, wordTimings, timelineTime) {
  if (
    introOwlAssemblyState.active ||
    introOwlAssemblyState.complete ||
    words.length === 0
  ) {
    return;
  }

  const triggerWord = words.find(
    (word) =>
      normalizeIntroHighlightWord(word.textContent ?? "") ===
      INTRO_OWL_ASSEMBLY_TRIGGER_WORD,
  );
  const timing = triggerWord === undefined
    ? undefined
    : wordTimings.get(triggerWord);

  if (timing === undefined) return;

  if (
    timelineTime >=
    timing.start + timing.duration * INTRO_OWL_TRIGGER_TWEEN_PROGRESS
  ) {
    playIntroOwlAssembly();
  }
}

function getIntroOwlAssemblyTriggerTime(words, wordTimings) {
  const triggerWord = words.find(
    (word) =>
      normalizeIntroHighlightWord(word.textContent ?? "") ===
      INTRO_OWL_ASSEMBLY_TRIGGER_WORD,
  );
  const timing = triggerWord === undefined
    ? undefined
    : wordTimings.get(triggerWord);

  if (timing === undefined) return Number.POSITIVE_INFINITY;

  return timing.start + timing.duration * INTRO_OWL_TRIGGER_TWEEN_PROGRESS;
}

function syncIntroOwlAssemblyToReveal(words, wordTimings, timelineTime) {
  const triggerTime = getIntroOwlAssemblyTriggerTime(words, wordTimings);

  if (timelineTime < triggerTime - 0.001) {
    if (introOwlAssemblyState.active || introOwlAssemblyState.complete) {
      resetIntroOwlAssembly();
    }
    return;
  }

  maybePlayIntroOwlAssembly(words, wordTimings, timelineTime);
}

function addIntroLineHighlightTweens(timeline, lineGroups, wordSettleTimes) {
  lineGroups.forEach((lineGroup) => {
    lineGroup.words.forEach((word, index) => {
      const settleAt = wordSettleTimes.get(word);
      if (settleAt === undefined) return;

      timeline.to(
        word,
        {
          "--intro-highlight-alpha": 1,
          "--intro-highlight-scale-x": 1,
          "--intro-highlight-scale-y": 1,
          color: word.dataset.introHighlight === "true"
            ? INTRO_HIGHLIGHT_COLOR
            : INTRO_HIGHLIGHT_BASE_COLOR,
          fontFamily: word.dataset.introHighlight === "true"
            ? INTRO_HIGHLIGHT_FONT_FAMILY
            : INTRO_COPY_FONT_FAMILY,
          duration: INTRO_HIGHLIGHT_DURATION,
          ease: "power2.out",
        },
        settleAt + INTRO_HIGHLIGHT_SETTLE_DELAY + index * INTRO_HIGHLIGHT_STAGGER,
      );
    });
  });
}

function setIntroWordsFinal({ finishHighlightAudioSequence = false } = {}) {
  const words = splitIntroCopyIntoWords();
  const highlightWords = getIntroHighlightWords(words);

  if (introTyperGroup === null && words.length > 0) {
    introTyperGroup = new IntroTyperGroup(
      words,
      {
        fps: INTRO_TYPER_FPS,
        cycles: INTRO_TYPER_CYCLES,
        cycleLength: INTRO_TYPER_CYCLE_LENGTH,
        variations: INTRO_TYPER_VARIATIONS,
      },
      INTRO_TYPER_LINE_STAGGER,
    );
  }
  introTyperGroup?.final();
  introTyperHasPlayed = true;
  gsap.killTweensOf(words);

  if (finishHighlightAudioSequence) {
    // A loading stall may force the visual reveal to its final frame before
    // every delayed tween starts. Queue only the notes that have not already
    // played so the progressive sequence still completes exactly once.
    highlightWords.forEach(playIntroHighlightSwoosh);
  } else {
    resetIntroHighlightSwooshRhythm();
  }

  gsap.set(words, {
    x: 0,
    y: 0,
    autoAlpha: 1,
    color: INTRO_HIGHLIGHT_BASE_COLOR,
    fontFamily: INTRO_COPY_FONT_FAMILY,
    "--intro-highlight-alpha": 1,
    "--intro-highlight-scale-x": 1,
    "--intro-highlight-scale-y": 1,
    "--intro-punctuation-alpha": 1,
  });

  gsap.set(highlightWords, {
    color: INTRO_HIGHLIGHT_COLOR,
    fontFamily: INTRO_HIGHLIGHT_FONT_FAMILY,
  });

  if (introOwlCanvas instanceof HTMLCanvasElement) {
    finishIntroOwlAssembly();
    gsap.set(introOwlCanvas, {
      autoAlpha: INTRO_OWL_FINAL_OPACITY,
      "--intro-owl-x": "0px",
      "--intro-owl-scale-x": "1",
    });
  }
}

function buildIntroRevealTimeline() {
  const words = splitIntroCopyIntoWords();
  getIntroHighlightWords(words);
  const timeline = gsap.timeline({
    paused: true,
    defaults: { overwrite: "auto" },
    onUpdate() {
      syncIntroOwlAssemblyToReveal(words, wordTimings, timeline.time());
    },
  });
  const total = words.length;
  const maxIndex = Math.max(total - 1, 0);
  const lineGroups = getIntroLineGroups(words);
  const firstLineWords = new Set(lineGroups[0]?.words ?? []);
  const wordTimings = new Map();
  const wordSettleTimes = new Map();
  const wordIndexes = new Map(
    words.map((word, index) => [word, index]),
  );

  resetIntroOwlAssembly();

  if (introOwlCanvas instanceof HTMLCanvasElement) {
    gsap.set(introOwlCanvas, {
      opacity: 0,
      visibility: "hidden",
      "--intro-owl-x": "0px",
      "--intro-owl-scale-x": "1",
    });
  }

  timeline.set(
    words,
    {
      autoAlpha: 0,
      color: INTRO_HIGHLIGHT_BASE_COLOR,
      fontFamily: INTRO_COPY_FONT_FAMILY,
      "--intro-highlight-alpha": 0,
      "--intro-highlight-scale-x": 0.92,
      "--intro-highlight-scale-y": 0.82,
    },
    0,
  );

  let revealCursor = INTRO_REVEAL_BLANK_LEAD;
  const sequencedLineGroups = lineGroups.slice(
    0,
    INTRO_REVEAL_SEQUENCED_LINE_COUNT,
  );
  const flowingWords = lineGroups
    .slice(INTRO_REVEAL_SEQUENCED_LINE_COUNT)
    .flatMap((lineGroup) => lineGroup.words);

  sequencedLineGroups.forEach((lineGroup) => {
    let wordOffset = 0;
    let lineSettleAt = revealCursor;

    lineGroup.words.forEach((word, lineWordIndex) => {
      const index = wordIndexes.get(word) ?? 0;
      const duration = getIntroCurvedValue(
        INTRO_REVEAL_FIRST_DURATION,
        INTRO_REVEAL_FINAL_DURATION,
        INTRO_REVEAL_DURATION_CURVE,
        index,
        maxIndex,
      );
      const start = revealCursor + wordOffset;
      const settleAt = start + duration;

      wordTimings.set(word, { start, duration });
      wordSettleTimes.set(word, settleAt);
      lineSettleAt = Math.max(lineSettleAt, settleAt);

      if (lineWordIndex < lineGroup.words.length - 1) {
        wordOffset += getIntroRevealGap(index, total);
      }
    });

    revealCursor = lineSettleAt;
  });

  let flowingWordOffset = 0;

  flowingWords.forEach((word, flowingWordIndex) => {
    const index = wordIndexes.get(word) ?? 0;
    const duration = getIntroCurvedValue(
      INTRO_REVEAL_FIRST_DURATION,
      INTRO_REVEAL_FINAL_DURATION,
      INTRO_REVEAL_DURATION_CURVE,
      index,
      maxIndex,
    );
    const start = revealCursor + flowingWordOffset;

    wordTimings.set(word, { start, duration });
    wordSettleTimes.set(word, start + duration);

    if (flowingWordIndex < flowingWords.length - 1) {
      flowingWordOffset += getIntroRevealGap(index, total);
    }
  });

  words.forEach((word, index) => {
    const timing = wordTimings.get(word);
    if (timing === undefined) return;

    timeline.fromTo(
      word,
      {
        x: () =>
          getIntroWordInitialX(
            index,
            total,
            word,
            firstLineWords.has(word),
          ),
        y: () => getIntroWordInitialY(index),
        autoAlpha: 0,
      },
      {
        autoAlpha: 1,
        duration: INTRO_REVEAL_VISIBILITY_DURATION,
        ease: "none",
      },
      timing.start,
    );

    timeline.to(
      word,
      {
        x: 0,
        y: 0,
        duration: timing.duration,
        ease: "power3.out",
        force3D: true,
      },
      timing.start,
    );
  });

  addIntroLineHighlightTweens(timeline, lineGroups, wordSettleTimes);

  timeline.to({}, { duration: INTRO_REVEAL_END_HOLD });

  return timeline;
}

function getFrameSlice(buffer, frameIndex, columns = state.cols, rows = state.rows) {
  const frameSize = columns * rows;
  const start = frameIndex * frameSize;
  const end = start + frameSize;
  return buffer.subarray(start, end);
}

function renderWhiteHole() {
  const revealStart = WHITE_HOLE_REVEAL_START;
  const handoffProgress = state.progress;
  if (handoffProgress <= revealStart) return;

  const reveal = smoothstep(
    0,
    1,
    clamp(
      (handoffProgress - revealStart) / (WHITE_HOLE_REVEAL_END - revealStart),
      0,
      1,
    ),
  );
  const aperture = Math.pow(reveal, WHITE_HOLE_APERTURE_POWER);
  const pageFade = smoothstep(WHITE_HOLE_PAGE_FADE_START, 1, reveal);
  const minDimension = Math.min(state.canvasWidth, state.canvasHeight);
  const centerX = state.offsetX + EYEPIECE_OPENING_CENTER.x * state.drawWidth;
  const centerY = state.offsetY + EYEPIECE_OPENING_CENTER.y * state.drawHeight;
  const radius = minDimension * (0.016 + aperture * 1.24);
  const halo = radius * (1.1 + aperture * 0.1);
  const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.52, centerX, centerY, halo);

  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.72, "rgba(255, 255, 255, 0.94)");
  gradient.addColorStop(1, CAMERA_BACKGROUND_COLOR_TRANSPARENT);

  ctx.save();
  ctx.fillStyle = gradient;
  circlePath(centerX, centerY, halo);
  ctx.fill();

  ctx.fillStyle = CAMERA_BACKGROUND_COLOR;
  circlePath(centerX, centerY, radius);
  ctx.fill();

  if (pageFade > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${pageFade * 0.92})`;
    ctx.fillRect(0, 0, state.canvasWidth, state.canvasHeight);
  }

  if (handoffProgress >= WHITE_HOLE_REVEAL_END) {
    ctx.fillRect(0, 0, state.canvasWidth, state.canvasHeight);
  }
  ctx.restore();
}

function getFramePositionForProgress(progress) {
  const eyepieceFrame = Math.min(EYPIECE_FRAME_INDEX, state.frameCount - 1);
  const tunnelFrame = Math.min(TUNNEL_FRAME_INDEX, state.frameCount - 1);

  if (progress < EYPIECE_START_PROGRESS) {
    const normalized = clamp(progress / EYPIECE_START_PROGRESS, 0, 1);
    return progress > 0 ? lerp(1, eyepieceFrame, normalized) : 0;
  }

  if (progress < TUNNEL_END_PROGRESS) {
    const normalized = clamp(
      (progress - EYPIECE_START_PROGRESS) / (TUNNEL_END_PROGRESS - EYPIECE_START_PROGRESS),
      0,
      1,
    );
    return lerp(eyepieceFrame, tunnelFrame, easeOutCubic(normalized));
  }

  const tailNormalized = clamp((progress - TUNNEL_END_PROGRESS) / (1 - TUNNEL_END_PROGRESS), 0, 1);
  return lerp(tunnelFrame, Math.min(tunnelFrame + 3, state.frameCount - 1), tailNormalized);
}

function getCameraFrameLayers(framePosition) {
  if (state.density === null) {
    return null;
  }

  const clampedFramePosition = clamp(framePosition, 0, Math.max(0, state.frameCount - 1));
  const frameIndex = Math.floor(clampedFramePosition);
  const previousFrameIndex = Math.max(frameIndex - 1, 0);
  const nextFrameIndex = Math.min(frameIndex + 1, state.frameCount - 1);
  const afterFrameIndex = Math.min(nextFrameIndex + 1, state.frameCount - 1);
  const frameMix = nextFrameIndex === frameIndex ? 0 : clampedFramePosition - frameIndex;
  const previousDensityFrame =
    previousFrameIndex === frameIndex ? null : getFrameSlice(state.density, previousFrameIndex);
  const densityFrame = getFrameSlice(state.density, frameIndex);
  const nextDensityFrame =
    nextFrameIndex === frameIndex ? null : getFrameSlice(state.density, nextFrameIndex);
  const afterDensityFrame =
    afterFrameIndex === nextFrameIndex ? null : getFrameSlice(state.density, afterFrameIndex);
  const previousMaskFrame =
    state.silhouette === null || previousFrameIndex === frameIndex
      ? null
      : getFrameSlice(state.silhouette, previousFrameIndex, state.maskCols, state.maskRows);
  const maskFrame =
    state.silhouette === null
      ? null
      : getFrameSlice(state.silhouette, frameIndex, state.maskCols, state.maskRows);
  const nextMaskFrame =
    state.silhouette === null || nextFrameIndex === frameIndex
      ? null
      : getFrameSlice(state.silhouette, nextFrameIndex, state.maskCols, state.maskRows);
  const afterMaskFrame =
    state.silhouette === null || afterFrameIndex === nextFrameIndex
      ? null
      : getFrameSlice(state.silhouette, afterFrameIndex, state.maskCols, state.maskRows);

  return {
    frameMix,
    previousDensityFrame,
    densityFrame,
    nextDensityFrame,
    afterDensityFrame,
    previousMaskFrame,
    maskFrame,
    nextMaskFrame,
    afterMaskFrame,
  };
}

function getCameraGlyphCells(framePosition, cacheKey = null) {
  if (cacheKey !== null && state.glyphCellCache.has(cacheKey)) {
    return state.glyphCellCache.get(cacheKey);
  }

  const layers = getCameraFrameLayers(framePosition);
  if (layers === null) {
    return [];
  }

  const glyphs = [];

  for (let row = 0; row < state.rows; row += 1) {
    for (let column = 0; column < state.cols; column += 1) {
      const index = row * state.cols + column;
      const maskAlpha = getCameraCellAlpha(
        layers.maskFrame,
        layers.nextMaskFrame,
        layers.frameMix,
        column,
        row,
        layers.previousMaskFrame,
        layers.afterMaskFrame,
      );
      if (maskAlpha <= 0.018) continue;

      const normalizedY = (row + 0.5) / state.rows;
      const borderDistance = Math.min(
        column,
        row,
        state.cols - 1 - column,
        state.rows - 1 - row,
      );
      const densityStats = getDensityStats(
        layers.densityFrame,
        layers.nextDensityFrame,
        layers.frameMix,
        index,
        column,
        row,
        layers.previousDensityFrame,
        layers.afterDensityFrame,
      );
      if (borderDistance < 1) {
        densityStats.edge = 0;
      }

      const { ink, alpha, tone, visible, fill } = getGlyphStyle(
        densityStats,
        normalizedY,
        maskAlpha,
      );
      if (!visible) continue;

      glyphs.push({
        column,
        row,
        ink,
        alpha,
        tone,
        fill,
        x: state.offsetX + (column + 0.5) * state.cellWidth,
        y: state.offsetY + (row + 0.5) * state.cellHeight,
      });
    }
  }

  if (cacheKey !== null) {
    state.glyphCellCache.set(cacheKey, glyphs);

    while (state.glyphCellCache.size > CAMERA_GLYPH_CACHE_LIMIT) {
      state.glyphCellCache.delete(state.glyphCellCache.keys().next().value);
    }
  }

  return glyphs;
}

function drawCameraGlyphCell(cell, x = cell.x, y = cell.y, opacity = 1) {
  if (opacity <= 0) return;

  const glyph = getGlyph(cell.column, cell.row, cell.ink);
  if (
    IS_SAFARI_BROWSER &&
    cameraGlyphAtlasState.ready &&
    cameraGlyphAtlasState.canvas instanceof HTMLCanvasElement
  ) {
    const characterIndex =
      cameraGlyphAtlasState.characterIndexes.get(glyph) ?? 0;
    const toneIndex = Math.round(
      clamp(cell.tone, 0, 1) * (CAMERA_GLYPH_ATLAS_TONE_STEPS - 1),
    );
    const alphaIndex = Math.max(1, Math.round(
      clamp(cell.alpha, 0, 1) * (CAMERA_GLYPH_ATLAS_ALPHA_STEPS - 1),
    ));
    const spriteIndex = (
      toneIndex * CAMERA_GLYPH_ATLAS_ALPHA_STEPS + alphaIndex
    ) * cameraGlyphAtlasState.characters.length + characterIndex;
    const sourceX =
      (spriteIndex % cameraGlyphAtlasState.columns) *
      cameraGlyphAtlasState.sourceTileWidth;
    const sourceY =
      Math.floor(spriteIndex / cameraGlyphAtlasState.columns) *
      cameraGlyphAtlasState.sourceTileHeight;
    const destinationX = Math.round(
      (x - cameraGlyphAtlasState.tileWidth * 0.5) * state.dpr,
    ) / state.dpr;
    const destinationY = Math.round(
      (y - cameraGlyphAtlasState.tileHeight * 0.5) * state.dpr,
    ) / state.dpr;

    ctx.globalAlpha = clamp(opacity, 0, 1);
    ctx.drawImage(
      cameraGlyphAtlasState.canvas,
      sourceX,
      sourceY,
      cameraGlyphAtlasState.sourceTileWidth,
      cameraGlyphAtlasState.sourceTileHeight,
      destinationX,
      destinationY,
      cameraGlyphAtlasState.tileWidth,
      cameraGlyphAtlasState.tileHeight,
    );
    return;
  }

  ctx.globalAlpha = clamp(opacity, 0, 1);
  ctx.fillStyle = cell.fill;
  ctx.fillText(glyph, x, y);
}

function ensureCameraTemporalCanvas() {
  if (cameraTemporalCanvas === null) {
    cameraTemporalCanvas = document.createElement("canvas");
    cameraTemporalCtx = cameraTemporalCanvas.getContext("2d");
  }

  if (
    cameraTemporalCanvas.width !== sceneCanvas.width ||
    cameraTemporalCanvas.height !== sceneCanvas.height
  ) {
    cameraTemporalCanvas.width = sceneCanvas.width;
    cameraTemporalCanvas.height = sceneCanvas.height;
    cameraTemporalReady = false;
  }
}

function ensureCameraHandoffCanvas() {
  if (cameraHandoffCanvas === null) {
    cameraHandoffCanvas = document.createElement("canvas");
    cameraHandoffCtx = cameraHandoffCanvas.getContext("2d");
  }

  if (
    cameraHandoffCanvas.width !== sceneCanvas.width ||
    cameraHandoffCanvas.height !== sceneCanvas.height
  ) {
    cameraHandoffCanvas.width = sceneCanvas.width;
    cameraHandoffCanvas.height = sceneCanvas.height;
    cameraHandoffReady = false;
  }
}

function captureCameraHandoffFrame() {
  if (sceneCanvas.width <= 0 || sceneCanvas.height <= 0) {
    cameraHandoffReady = false;
    return;
  }

  ensureCameraHandoffCanvas();
  if (cameraHandoffCtx === null || cameraHandoffCanvas === null) return;

  cameraHandoffCtx.setTransform(1, 0, 0, 1, 0, 0);
  cameraHandoffCtx.clearRect(0, 0, cameraHandoffCanvas.width, cameraHandoffCanvas.height);
  cameraHandoffCtx.drawImage(sceneCanvas, 0, 0);
  cameraHandoffReady = true;
}

function drawCameraHandoffFrame() {
  if (!cameraHandoffReady || cameraHandoffCanvas === null) return false;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, sceneCanvas.width, sceneCanvas.height);
  ctx.drawImage(cameraHandoffCanvas, 0, 0);
  ctx.restore();
  renderWhiteHole();
  return true;
}

function resetCameraFrameCaches(resetTemporal = true) {
  state.currentFrameBucket = -1;
  state.currentProgressBucket = -1;
  state.currentScrambleBucket = -1;
  state.glyphCellCache.clear();
  cameraHandoffReady = false;

  if (resetTemporal) {
    cameraTemporalReady = false;
  }
}

function drawTemporalCameraFrame() {
  if (sceneCanvas.width <= 0 || sceneCanvas.height <= 0) return;

  ensureCameraTemporalCanvas();
  if (!cameraTemporalReady || cameraTemporalCanvas === null) return;

  const fadeOut = 1 - smoothstep(
    WHITE_HOLE_REVEAL_START,
    WHITE_HOLE_REVEAL_END,
    state.progress,
  );
  const alpha = CAMERA_TEMPORAL_BLEND_ALPHA * fadeOut;
  if (alpha <= 0.001) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(cameraTemporalCanvas, 0, 0, state.canvasWidth, state.canvasHeight);
  ctx.restore();
}

function captureTemporalCameraFrame() {
  if (sceneCanvas.width <= 0 || sceneCanvas.height <= 0) {
    cameraTemporalReady = false;
    return;
  }

  ensureCameraTemporalCanvas();
  if (cameraTemporalCtx === null || cameraTemporalCanvas === null) return;

  cameraTemporalCtx.setTransform(1, 0, 0, 1, 0, 0);
  cameraTemporalCtx.clearRect(0, 0, cameraTemporalCanvas.width, cameraTemporalCanvas.height);
  cameraTemporalCtx.drawImage(sceneCanvas, 0, 0);
  cameraTemporalReady = true;
}

function renderFrame(framePosition) {
  if (state.density === null) {
    return;
  }

  const clampedFramePosition = clamp(framePosition, 0, Math.max(0, state.frameCount - 1));
  const frameIndex = Math.floor(clampedFramePosition);
  const frameBucket = Math.round(clampedFramePosition * CAMERA_FRAME_BLEND_PRECISION);
  const progressBucket = Math.round(state.progress * 960);
  const scrambleBucket = Math.floor(state.scrambleTime / SCRAMBLE_INTERVAL);
  if (
    frameBucket === state.currentFrameBucket &&
    progressBucket === state.currentProgressBucket &&
    scrambleBucket === state.currentScrambleBucket
  ) {
    return;
  }

  state.currentFrameBucket = frameBucket;
  state.currentProgressBucket = progressBucket;
  state.currentScrambleBucket = scrambleBucket;

  if (
    state.progress > WHITE_HOLE_REVEAL_START &&
    drawCameraHandoffFrame()
  ) {
    return;
  }

  const glyphs = getCameraGlyphCells(clampedFramePosition, frameBucket);

  ctx.clearRect(0, 0, state.canvasWidth, state.canvasHeight);
  ctx.fillStyle = CAMERA_CANVAS_BACKGROUND_COLOR;
  ctx.fillRect(0, 0, state.canvasWidth, state.canvasHeight);
  // The preceding frame is part of the camera's authored softness. Keeping
  // it active in Safari also masks source-frame boundaries without changing
  // the actual motion, timing, glyph field, or colour treatment.
  drawTemporalCameraFrame();

  ctx.save();
  ctx.font = state.activeFont;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (IS_SAFARI_BROWSER && cameraGlyphAtlasState.ready) {
    ctx.imageSmoothingEnabled = false;
  }

  for (const cell of glyphs) {
    drawCameraGlyphCell(cell);
  }

  ctx.globalAlpha = 1;
  ctx.restore();

  if (
    !cameraHandoffReady &&
    state.progress >= WHITE_HOLE_REVEAL_START
  ) {
    captureCameraHandoffFrame();
  }

  renderWhiteHole();
  captureTemporalCameraFrame();
}

function renderCurrentProgress() {
  if (
    state.frameCount === 0 ||
    activePageId !== "work" ||
    !state.cameraActive ||
    cameraAssemblyState.active ||
    !startupCameraRevealReady
  ) {
    return;
  }

  const framePosition = getFramePositionForProgress(state.progress);
  renderFrame(framePosition);
  cameraPlaybackState.renderRequested = false;
}

function renderBlankScene() {
  ctx.clearRect(0, 0, state.canvasWidth, state.canvasHeight);
  ctx.fillStyle = CAMERA_CANVAS_BACKGROUND_COLOR;
  ctx.fillRect(0, 0, state.canvasWidth, state.canvasHeight);
}

function getCameraAssemblyHash(column, row, salt = 0) {
  let hash =
    column * 73856093 ^
    row * 19349663 ^
    salt * 83492791;

  hash ^= hash >>> 13;
  hash = Math.imul(hash, 1274126177);
  hash ^= hash >>> 16;

  return hash >>> 0;
}

function getCameraAssemblyRandom(column, row, salt = 0) {
  return getCameraAssemblyHash(column, row, salt) / 0xffffffff;
}

function getCameraAssemblyLaunch(cell) {
  const direction = getCameraAssemblyHash(cell.column, cell.row, 3) % 4;
  const jitterX = (getCameraAssemblyRandom(cell.column, cell.row, 7) - 0.5) *
    state.canvasWidth * CAMERA_ASSEMBLY_SIDE_JITTER_RATIO;
  const jitterY = (getCameraAssemblyRandom(cell.column, cell.row, 11) - 0.5) *
    state.canvasHeight * CAMERA_ASSEMBLY_SIDE_JITTER_RATIO;
  const marginX = Math.max(
    state.cellWidth * 12,
    state.canvasWidth * (
      CAMERA_ASSEMBLY_EDGE_MARGIN_RATIO +
      getCameraAssemblyRandom(cell.column, cell.row, 13) * 0.24
    ),
  );
  const marginY = Math.max(
    state.cellHeight * 12,
    state.canvasHeight * (
      CAMERA_ASSEMBLY_EDGE_MARGIN_RATIO +
      getCameraAssemblyRandom(cell.column, cell.row, 17) * 0.24
    ),
  );
  let startX = cell.x;
  let startY = cell.y;

  if (direction === 0) {
    startX = cell.x + jitterX;
    startY = -marginY;
  } else if (direction === 1) {
    startX = state.canvasWidth + marginX;
    startY = cell.y + jitterY;
  } else if (direction === 2) {
    startX = cell.x + jitterX;
    startY = state.canvasHeight + marginY;
  } else {
    startX = -marginX;
    startY = cell.y + jitterY;
  }

  const centerX = state.canvasWidth * 0.5;
  const centerY = state.canvasHeight * 0.5;
  const normalizedDistance = clamp(
    Math.hypot(
      (cell.x - centerX) / Math.max(1, state.canvasWidth),
      (cell.y - centerY) / Math.max(1, state.canvasHeight),
    ) * 1.45,
    0,
    1,
  );
  const delayMix =
    getCameraAssemblyRandom(cell.column, cell.row, 23) * 0.74 +
    normalizedDistance * 0.26;
  const durationMix = getCameraAssemblyRandom(cell.column, cell.row, 29);

  return {
    startX,
    startY,
    delay: delayMix * CAMERA_ASSEMBLY_STAGGER,
    duration: CAMERA_ASSEMBLY_MOVE_DURATION * (0.78 + durationMix * 0.22),
  };
}

function buildCameraAssemblyGlyphs() {
  return getCameraGlyphCells(0).map((cell) => ({
    ...cell,
    ...getCameraAssemblyLaunch(cell),
  }));
}

function refreshCameraAssemblyGlyphs() {
  if (!cameraAssemblyState.active) return;
  cameraAssemblyState.glyphs = buildCameraAssemblyGlyphs();
}

function renderCameraAssembly(elapsed = cameraAssemblyState.elapsed) {
  if (!cameraAssemblyState.active) return;

  cameraAssemblyState.elapsed = elapsed;
  state.scrambleTime = performance.now() / 1000;

  renderBlankScene();

  ctx.save();
  ctx.font = state.activeFont;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const cell of cameraAssemblyState.glyphs) {
    const rawProgress = clamp((elapsed - cell.delay) / cell.duration, 0, 1);
    if (rawProgress <= 0) continue;

    const easedProgress = CAMERA_ASSEMBLY_EASE(rawProgress);
    const x = lerp(cell.startX, cell.x, easedProgress);
    const y = lerp(cell.startY, cell.y, easedProgress);
    const opacity = smoothstep(0, 0.22, rawProgress);

    drawCameraGlyphCell(cell, x, y, opacity);
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

function finishCameraAssemblyIntro() {
  cameraAssemblyState.active = false;
  cameraAssemblyState.complete = true;
  startupCameraAssemblyComplete = true;
  cameraAssemblyState.elapsed = 0;
  cameraAssemblyState.glyphs = [];
  cameraAssemblyState.timeline = null;
  resetRouteScrollToTop();
  resetCameraFrameCaches();
  renderCurrentProgress();
  sceneCanvas.classList.add("is-intro-ready");

  const onComplete = cameraAssemblyCompleteCallback;
  cameraAssemblyCompleteCallback = null;
  onComplete?.();
}

function playCameraAssemblyIntro(onComplete = null) {
  cameraAssemblyState.timeline?.kill();
  beginHeroScrollGate();
  startupCameraAssemblyComplete = false;
  resetRouteScrollToTop();
  hideCameraCursorLabel();
  startupCameraRevealReady = true;
  resetCameraFrameCaches();
  cameraAssemblyCompleteCallback = typeof onComplete === "function" ? onComplete : null;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    cameraAssemblyState.active = false;
    cameraAssemblyState.complete = true;
    startupCameraAssemblyComplete = true;
    renderFrame(0);
    playCameraRenderAmbient();
    sceneCanvas.classList.add("is-intro-ready");
    const complete = cameraAssemblyCompleteCallback;
    cameraAssemblyCompleteCallback = null;
    complete?.();
    return;
  }

  cameraAssemblyState.active = true;
  cameraAssemblyState.complete = false;
  cameraAssemblyState.elapsed = 0;
  cameraAssemblyState.glyphs = buildCameraAssemblyGlyphs();

  if (cameraAssemblyState.glyphs.length === 0) {
    startupCameraAssemblyComplete = true;
    playCameraRenderAmbient();
    finishCameraAssemblyIntro();
    return;
  }

  const motion = { elapsed: 0 };
  const totalDuration = CAMERA_ASSEMBLY_MOVE_DURATION + CAMERA_ASSEMBLY_STAGGER;
  const timeline = gsap.timeline({
    defaults: { ease: "none" },
    onComplete: finishCameraAssemblyIntro,
  });

  cameraAssemblyState.timeline = timeline;
  timeline.call(renderBlankScene, [], 0);
  if (CAMERA_ASSEMBLY_BLANK_HOLD > 0) {
    timeline.to({}, { duration: CAMERA_ASSEMBLY_BLANK_HOLD });
  }
  timeline.to(
    motion,
    {
      elapsed: totalDuration,
      duration: totalDuration,
      onStart() {
        renderCameraAssembly(0.001);
        playCameraRenderAmbient();
      },
      onUpdate() {
        renderCameraAssembly(motion.elapsed);
      },
    },
    ">",
  );
}

function resize() {
  updateIntroScale();

  if (pageTransitionRoot instanceof HTMLElement) {
    buildPageTransitionGrid();
    if (pageTransitionActive) {
      renderPageTransition(1, "cover");
    }
  }

  if (activePageId !== "work") return;

  updateLayout();
  updateIntroOwlLayout();
  updateWorkWaveImageSizes();

  if (introOwlAssemblyState.active) {
    refreshIntroOwlAssemblyGlyphs();
    renderIntroOwlAssembly();
  } else if (introOwlAssemblyState.complete) {
    renderIntroOwl();
  } else {
    clearIntroOwlCanvas();
  }

  if (workOwlSceneActive && footerInteractionState === "complete") {
    setFooterInteractionFinal();
  } else if (
    workOwlSceneActive &&
    footerInteractionState !== "playing"
  ) {
    // The footer timeline is the sole transform/visibility owner while the
    // owl is entering. Re-applying the legacy progress state here would reset
    // its opacity to zero during a resize or Safari viewport update.
    applyWorkOwlSceneProgress(workOwlSceneProgress);
  }

  resetCameraFrameCaches();

  if (cameraAssemblyState.active) {
    refreshCameraAssemblyGlyphs();
    renderCameraAssembly();
    return;
  }

  renderCurrentProgress();
}

function requestCameraRender() {
  cameraPlaybackState.renderRequested = true;
}

function setCameraActive(isActive) {
  stage.style.visibility = isActive ? "visible" : "hidden";
  sceneCanvas.style.visibility = isActive ? "visible" : "hidden";

  if (!isActive) {
    hideCameraCursorLabel();
  }

  if (state.cameraActive === isActive) return;

  state.cameraActive = isActive;

  if (isActive) {
    resetCameraFrameCaches();
    requestCameraRender();
    renderCurrentProgress();
  }
}

function pinCameraHandoff() {
  cameraPlaybackState.finishing = true;
  cameraPlaybackState.whiteHoldUntil = 0;
  stage.classList.add("is-camera-handoff");
  setCameraActive(true);
}

function releaseCameraHandoff() {
  cameraPlaybackState.finishing = false;
  cameraPlaybackState.whiteHoldUntil = 0;
  stage.classList.remove("is-camera-handoff");
  setCameraActive(false);
  playIntroTyperReveal();
}

function cancelCameraHandoff() {
  cameraPlaybackState.finishing = false;
  cameraPlaybackState.whiteHoldUntil = 0;
  stage.classList.remove("is-camera-handoff");
}

function setCameraTargetProgress(progress) {
  const targetProgress = clamp(progress, 0, 1);
  cameraPlaybackState.targetProgress = targetProgress;

  if (targetProgress > CAMERA_CURSOR_HERO_PROGRESS_MAX) {
    hideCameraCursorLabel();
  }

  if (targetProgress < WHITE_HOLE_REVEAL_START) {
    cameraPlaybackState.handoffPrimed = false;
    cameraHandoffReady = false;
    state.progress = targetProgress;
    requestCameraRender();
    return;
  }

  if (
    state.progress < WHITE_HOLE_REVEAL_START &&
    targetProgress > WHITE_HOLE_REVEAL_START
  ) {
    state.progress = WHITE_HOLE_REVEAL_START;
    cameraPlaybackState.handoffPrimed = true;
    requestCameraRender();
    return;
  }

  requestCameraRender();
}

function setupCameraRenderLoop() {
  cameraRenderTick = (time, deltaTime) => {
    if (
      cameraAssemblyState.active ||
      !state.cameraActive ||
      document.hidden
    ) {
      return;
    }

    state.scrambleTime = time;
    const targetProgress = cameraPlaybackState.targetProgress;
    let progressChanged = false;

    if (cameraPlaybackState.handoffPrimed) {
      cameraPlaybackState.handoffPrimed = false;
    } else if (
      targetProgress >= WHITE_HOLE_REVEAL_START ||
      state.progress >= WHITE_HOLE_REVEAL_START
    ) {
      const progressDelta = targetProgress - state.progress;
      const maxStep =
        CAMERA_HANDOFF_PROGRESS_PER_SECOND *
        Math.min(Math.max(deltaTime, 0) / 1000, 0.05);

      if (Math.abs(progressDelta) <= maxStep) {
        state.progress = targetProgress;
      } else {
        state.progress += Math.sign(progressDelta) * maxStep;
      }

      progressChanged = Math.abs(progressDelta) > 0.00001;
    } else if (state.progress !== targetProgress) {
      state.progress = targetProgress;
      progressChanged = true;
    }

    const scrambleChanged =
      !workScrollFast &&
      Math.floor(time / SCRAMBLE_INTERVAL) !== state.currentScrambleBucket;
    if (
      cameraPlaybackState.renderRequested ||
      progressChanged ||
      scrambleChanged
    ) {
      renderCurrentProgress();
    }

    if (
      cameraPlaybackState.finishing &&
      state.progress >= 0.9999
    ) {
      if (cameraPlaybackState.whiteHoldUntil === 0) {
        cameraPlaybackState.whiteHoldUntil =
          time + CAMERA_HANDOFF_WHITE_HOLD_SECONDS;
      } else if (
        time >= cameraPlaybackState.whiteHoldUntil &&
        cameraScrollTrigger &&
        window.scrollY >= cameraScrollTrigger.end - 1
      ) {
        releaseCameraHandoff();
      }
    }
  };
}

function getIntroOwlFrameIndex(loopProgress, frameCount) {
  const frameProgressStops = introOwlState.metadata?.frameProgressStops;

  if (!Array.isArray(frameProgressStops) || frameProgressStops.length < frameCount + 1) {
    return Math.floor(loopProgress * frameCount) % frameCount;
  }

  const loopEndProgress = Math.max(0.001, frameProgressStops[frameCount] ?? 1);
  const targetProgress = loopProgress * loopEndProgress;
  let low = 0;
  let high = frameCount - 1;

  while (low < high) {
    const midpoint = Math.floor((low + high + 1) / 2);

    if (frameProgressStops[midpoint] <= targetProgress) {
      low = midpoint;
    } else {
      high = midpoint - 1;
    }
  }

  return clamp(low, 0, frameCount - 1);
}

function getIntroOwlLoopFrameCount() {
  return Math.max(
    1,
    Math.min(introOwlState.frameCount, INTRO_OWL_LOOP_END_FRAME + 1),
  );
}

function getIntroOwlLoopDuration(frameCount) {
  const baseDuration = introOwlState.metadata?.durationSeconds ?? INTRO_OWL_LOOP_DURATION;
  const frameProgressStops = introOwlState.metadata?.frameProgressStops;

  if (Array.isArray(frameProgressStops) && frameProgressStops.length >= frameCount + 1) {
    return Math.max(0.1, baseDuration * Math.max(0.001, frameProgressStops[frameCount]));
  }

  return Math.max(
    0.1,
    baseDuration * frameCount / Math.max(1, introOwlState.frameCount),
  );
}

function setupIntroOwlScramble() {
  if (!(introOwlCanvas instanceof HTMLCanvasElement)) return;

  introOwlRenderTick = (time) => {
    if (document.hidden || introOwlState.mask === null) return;
    if (
      introOwlAssemblyState.active ||
      !introOwlAssemblyState.complete ||
      !introOwlLoopVisible ||
      isWorkOwlSceneBlockingIntro()
    ) {
      return;
    }

    // Preserve the most recently rendered raster while WebKit handles a fast
    // scroll. The owl layer still moves on the compositor; only the expensive
    // thousands-of-glyph Canvas 2D repaint waits for scroll settle.
    if (introOwlState.loopStartTime === null) {
      introOwlState.loopStartTime = time;
    }

    const minimumFrameInterval = 1 / INTRO_OWL_TARGET_FPS;
    if (time - introOwlState.lastRenderTime < minimumFrameInterval) return;

    const frameCount = getIntroOwlLoopFrameCount();
    const loopDuration = getIntroOwlLoopDuration(frameCount);
    const loopProgress =
      ((time - introOwlState.loopStartTime) % loopDuration) /
      loopDuration;
    const framePosition = loopProgress * Math.max(0, frameCount - 1);
    if (drawCachedOwlRaster({
      cache: safariIntroOwlRasterCache,
      targetCanvas: introOwlCanvas,
      targetCtx: introOwlCtx,
      renderState: introOwlState,
      framePosition,
      frameCount,
    })) {
      introOwlState.lastRenderTime = time;
      return;
    }
    const frameBucket = Math.round(
      framePosition * INTRO_OWL_FRAME_BLEND_PRECISION,
    );
    const scrambleBucket = workScrollFast && introOwlState.currentScrambleBucket >= 0
      ? introOwlState.currentScrambleBucket
      : Math.floor(time / SCRAMBLE_INTERVAL);

    if (
      frameBucket === introOwlState.currentFrameBucket &&
      scrambleBucket === introOwlState.currentScrambleBucket &&
      introOwlState.rendered
    ) {
      return;
    }

    introOwlState.lastRenderTime = time;
    introOwlState.scrambleTime = time;
    introOwlState.scrambleBucket = scrambleBucket;
    introOwlState.currentScrambleBucket = scrambleBucket;
    renderIntroOwl(framePosition);
  };
}

function setupSmoothScroll() {
  ScrollTrigger.config({ ignoreMobileResize: true });

  if (FORCE_NATIVE_SCROLL) {
    scrollEngineMode = "native";
    setupNativeScrollTracking();
    installRenderSchedulerTicker();
    gsap.ticker.lagSmoothing(500, 33);
    return;
  }

  const supportsAutoToggle =
    typeof CSS !== "undefined" &&
    CSS.supports?.("transition-behavior", "allow-discrete") === true;
  const lenis = new Lenis({
    autoRaf: true,
    autoToggle: supportsAutoToggle,
    wheelMultiplier: 1,
    touchMultiplier: 1,
    touchInertiaExponent: 1.7,
    syncTouchLerp: 0.075,
    // A lower interpolation factor restores the deliberate Lenis glide in
    // both Chromium and WebKit. Lenis' time-corrected lerp keeps this stable
    // when Safari misses an animation frame instead of jumping to the target.
    lerp: IS_SAFARI_BROWSER ? 0.115 : 0.12,
    smoothWheel: true,
    // Mac trackpads arrive as wheel input and remain fully smoothed. Keeping
    // WebKit touch momentum native avoids a second inertia model on iOS while
    // Lenis still owns scroll synchronization and programmatic scrolls.
    syncTouch: !IS_SAFARI_BROWSER,
    stopInertiaOnNavigate: true,
  });

  smoothScroller = lenis;
  if (import.meta.env.DEV) {
    window.__portfolioLenis = lenis;
  }
  scrollEngineMode = "lenis";
  lenis.on("scroll", updateVisibleScrollTriggers);
  // Lenis owns its interpolation clock. Heavy Canvas 2D frames must not alter
  // Lenis' delta time or make a missed GSAP frame turn into a scroll jump.
  // DOM/canvas effects still share one GSAP scheduler of their own.
  installRenderSchedulerTicker();
  gsap.ticker.lagSmoothing(500, 33);

  window.addEventListener("wheel", armLenisInputWatchdog, { passive: true });
  smoothScrollLockObserver?.disconnect();
  lastObservedScrollLockState = !shouldResumeSmoothScroll();
  smoothScrollLockObserver = new MutationObserver(() => {
    const nextLockState = !shouldResumeSmoothScroll();
    if (nextLockState === lastObservedScrollLockState) return;
    lastObservedScrollLockState = nextLockState;
    reconcileSmoothScrollAfterLockChange();
  });
  smoothScrollLockObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  smoothScrollLockObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || scrollEngineMode !== "lenis") return;
    lenisRecoveryAttempts = 0;
    lenis.resize();
    lenis.scrollTo(window.scrollY, {
      immediate: true,
      force: true,
    });
    reconcileSmoothScrollAfterLockChange();
    ScrollTrigger.update();
  });

  reconcileSmoothScrollAfterLockChange({ resize: true });
}

function setupScroll() {
  experience.style.minHeight = `${CAMERA_SCROLL_LENGTH_VH}vh`;

  heroIntroScrollTrigger?.kill();
  heroIntroScrollTrigger = ScrollTrigger.create({
    trigger: experience,
    start: "top top",
    end: "top+=1 top",
    onLeave: animateHeroIntroOut,
    onEnterBack: replayHeroIntroIn,
    onLeaveBack: replayHeroIntroIn,
  });

  heroIntroLastScrollY = window.scrollY;
  gsap.ticker.add(maybeReplayHeroIntroOnScrollReturn);

  cameraScrollTrigger = ScrollTrigger.create({
    trigger: experience,
    start: "top 1px",
    end: "bottom top",
    pin: stage,
    pinSpacing: false,
    scrub: true,
    anticipatePin: 1,
    onEnter() {
      cancelCameraHandoff();
      resetIntroTyperReveal();
      setCameraActive(true);
    },
    onEnterBack() {
      cancelCameraHandoff();
      resetIntroTyperReveal();
      setCameraActive(true);
    },
    onLeave() {
      setCameraTargetProgress(1);
      pinCameraHandoff();
    },
    onLeaveBack() {
      cancelCameraHandoff();
      resetIntroTyperReveal();
      setCameraActive(false);
    },
    onUpdate(self) {
      setCameraTargetProgress(self.progress);
    },
  });
}

function setupIntroReveal() {
  const words = splitIntroCopyIntoWords();

  if (
    !(introSection instanceof HTMLElement) ||
    !(introFrame instanceof HTMLElement) ||
    words.length === 0
  ) {
    return;
  }

  introRevealTimeline?.kill();
  introRevealScrollTrigger?.kill();
  introRevealTimeline = null;
  introRevealScrollTrigger = null;
  introTyperGroup?.destroy();
  introTyperGroup = new IntroTyperGroup(
    words,
    {
      fps: INTRO_TYPER_FPS,
      cycles: INTRO_TYPER_CYCLES,
      cycleLength: INTRO_TYPER_CYCLE_LENGTH,
      variations: INTRO_TYPER_VARIATIONS,
    },
    INTRO_TYPER_LINE_STAGGER,
  );
  introTyperHasPlayed = false;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setIntroWordsFinal();
    return;
  }

  setIntroWordsInitial(words);
  resetIntroOwlAssembly();

  introRevealScrollTrigger = ScrollTrigger.create({
    trigger: introSection,
    start: "top top",
    end: "bottom top",
    onEnter() {
      requestIntroTyperRevealAfterCamera();
    },
    onRefresh(self) {
      if (self.isActive && !introTyperHasPlayed) {
        requestIntroTyperRevealAfterCamera();
      }
    },
  });
}

function setCursorLabelNaturalWidth(label, text) {
  if (!(label instanceof HTMLElement)) return;

  const measurement = label.cloneNode(false);
  if (!(measurement instanceof HTMLElement)) return;

  measurement.removeAttribute("data-camera-cursor-label");
  measurement.removeAttribute("data-intro-owl-cursor-label");
  measurement.removeAttribute("data-split");
  measurement.removeAttribute("aria-hidden");
  measurement.textContent = text;
  Object.assign(measurement.style, {
    width: "auto",
    opacity: "0",
    visibility: "hidden",
    transform: "none",
    pointerEvents: "none",
  });
  document.body.appendChild(measurement);
  label.style.width = `${Math.ceil(measurement.getBoundingClientRect().width) + 4}px`;
  measurement.remove();
}

function getCursorLabelChars(label, text) {
  if (!(label instanceof HTMLElement)) return [];

  setCursorLabelNaturalWidth(label, text);

  if (label.dataset.split === "true") {
    return Array.from(
      label.querySelectorAll("[data-cursor-label-char]"),
    );
  }

  label.textContent = "";
  label.setAttribute("aria-label", text);

  Array.from(text).forEach((char) => {
    const charElement = document.createElement("span");
    charElement.className = "intro-owl-cursor-label__char";
    charElement.dataset.cursorLabelChar = "true";
    charElement.dataset.finalChar = char;

    if (char === " ") {
      charElement.classList.add("is-space");
    } else {
      charElement.textContent = char;
    }

    label.appendChild(charElement);
  });

  label.dataset.split = "true";

  return Array.from(
    label.querySelectorAll("[data-cursor-label-char]"),
  );
}

function getIntroOwlCursorLabelChars() {
  return getCursorLabelChars(introOwlCursorLabel, INTRO_OWL_CURSOR_LABEL_TEXT);
}

function getIntroOwlCursorRandomChar() {
  return INTRO_OWL_CURSOR_SCRAMBLE_CHARS[
    Math.floor(Math.random() * INTRO_OWL_CURSOR_SCRAMBLE_CHARS.length)
  ] ?? "0";
}

function stopCursorLabelScramble(label, tickerUpdate, setTickerUpdate, finalize = false) {
  if (tickerUpdate !== null) {
    gsap.ticker.remove(tickerUpdate);
    setTickerUpdate(null);
  }

  if (!finalize) return;

  getCursorLabelChars(
    label,
    label === cameraCursorLabel
      ? CAMERA_CURSOR_LABEL_TEXT
      : INTRO_OWL_CURSOR_LABEL_TEXT,
  ).forEach((charElement) => {
    charElement.textContent = charElement.dataset.finalChar === " "
      ? ""
      : charElement.dataset.finalChar ?? "";
  });
}

function playCursorLabelScramble(
  label,
  text,
  setTickerUpdate,
  currentTickerUpdate,
  {
    initialDelay = 0.12,
    letterStagger = 0.065,
    settleHold = 0.2,
    scrambleInterval = 0.065,
  } = {},
) {
  const charElements = getCursorLabelChars(label, text);
  if (charElements.length === 0) return;

  stopCursorLabelScramble(label, currentTickerUpdate, setTickerUpdate, false);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    stopCursorLabelScramble(label, null, setTickerUpdate, true);
    return;
  }

  let revealIndex = 0;
  const revealDelays = charElements.map((charElement) => {
    if (charElement.dataset.finalChar === " ") return 0;
    const delay = initialDelay + revealIndex * letterStagger;
    revealIndex += 1;
    charElement.textContent = getIntroOwlCursorRandomChar();
    charElement.dataset.scrambleBucket = "-1";
    return delay;
  });
  const startedAt = performance.now();
  const totalDuration = Math.max(...revealDelays) + settleHold;

  const updateScramble = () => {
    const elapsed = (performance.now() - startedAt) / 1000;
    const bucket = Math.floor(elapsed / scrambleInterval);
    let done = elapsed >= totalDuration;

    charElements.forEach((charElement, index) => {
      const finalChar = charElement.dataset.finalChar ?? "";
      if (finalChar === " ") {
        charElement.textContent = "";
        return;
      }

      if (elapsed >= revealDelays[index]) {
        charElement.textContent = finalChar;
        return;
      }

      done = false;
      if (charElement.dataset.scrambleBucket !== String(bucket)) {
        charElement.dataset.scrambleBucket = String(bucket);
        charElement.textContent = getIntroOwlCursorRandomChar();
      }
    });

    if (done) {
      stopCursorLabelScramble(label, updateScramble, setTickerUpdate, true);
    }
  };

  setTickerUpdate(updateScramble);
  gsap.ticker.add(updateScramble);
  updateScramble();
}

function stopIntroOwlCursorScramble(finalize = false) {
  stopCursorLabelScramble(
    introOwlCursorLabel,
    introOwlCursorScrambleUpdate,
    (update) => {
      introOwlCursorScrambleUpdate = update;
    },
    finalize,
  );
}

function playIntroOwlCursorScramble() {
  playCursorLabelScramble(
    introOwlCursorLabel,
    INTRO_OWL_CURSOR_LABEL_TEXT,
    (update) => {
      introOwlCursorScrambleUpdate = update;
    },
    introOwlCursorScrambleUpdate,
  );
}

function setIntroOwlCursorLabelPosition(x, y, immediate = false) {
  if (!(introOwlCursorLabel instanceof HTMLElement)) return;

  const labelWidth = introOwlCursorLabel.offsetWidth || 116;
  const labelHeight = introOwlCursorLabel.offsetHeight || 28;
  const edgePadding = INTRO_OWL_CURSOR_EDGE_PADDING;
  const offsetX = x + INTRO_OWL_CURSOR_OFFSET_X + labelWidth + edgePadding > window.innerWidth
    ? -(labelWidth + INTRO_OWL_CURSOR_OFFSET_X)
    : INTRO_OWL_CURSOR_OFFSET_X;
  const targetX = clamp(
    x + offsetX,
    edgePadding,
    Math.max(edgePadding, window.innerWidth - labelWidth - edgePadding),
  );
  const targetY = clamp(
    y + INTRO_OWL_CURSOR_OFFSET_Y,
    edgePadding,
    Math.max(edgePadding, window.innerHeight - labelHeight - edgePadding),
  );

  if (immediate || introOwlCursorXTo === null || introOwlCursorYTo === null) {
    gsap.set(introOwlCursorLabel, {
      x: targetX,
      y: targetY,
      force3D: true,
    });
    return;
  }

  introOwlCursorXTo(targetX);
  introOwlCursorYTo(targetY);
}

function isPointerOnIntroOwlSide(x) {
  if (!(introOwlCanvas instanceof HTMLCanvasElement)) {
    return x >= window.innerWidth * 0.5;
  }

  const owlRect = introOwlCanvas.getBoundingClientRect();
  const owlCenterX = owlRect.left + owlRect.width * 0.5;
  const viewportCenterX = window.innerWidth * 0.5;

  return owlCenterX >= viewportCenterX
    ? x >= viewportCenterX
    : x <= viewportCenterX;
}

function shouldShowIntroOwlCursorLabel(x) {
  if (
    !(introOwlCursorLabel instanceof HTMLElement) ||
    !(introOwlCanvas instanceof HTMLCanvasElement) ||
    !introOwlLoopVisible ||
    window.matchMedia("(pointer: coarse)").matches
  ) {
    return false;
  }

  return isPointerOnIntroOwlSide(x);
}

function showIntroOwlCursorLabel() {
  if (!(introOwlCursorLabel instanceof HTMLElement)) return;

  setIntroOwlCursorLabelPosition(
    introOwlCursorLastX,
    introOwlCursorLastY,
    !introOwlCursorVisible,
  );

  if (introOwlCursorVisible) return;

  introOwlCursorVisible = true;
  playIntroOwlCursorScramble();
  gsap.killTweensOf(introOwlCursorLabel, "autoAlpha,opacity,visibility");
  gsap.to(introOwlCursorLabel, {
    autoAlpha: 1,
    duration: 0.18,
    ease: "power2.out",
    overwrite: "auto",
    force3D: true,
  });
}

function hideIntroOwlCursorLabel() {
  if (!(introOwlCursorLabel instanceof HTMLElement)) return;

  stopIntroOwlCursorScramble(false);

  if (!introOwlCursorVisible) {
    gsap.set(introOwlCursorLabel, { autoAlpha: 0 });
    return;
  }

  introOwlCursorVisible = false;
  gsap.killTweensOf(introOwlCursorLabel, "autoAlpha,opacity,visibility");
  gsap.to(introOwlCursorLabel, {
    autoAlpha: 0,
    duration: 0.14,
    ease: "power2.out",
    overwrite: "auto",
    force3D: true,
  });
}

function syncIntroOwlCursorLabel() {
  if (shouldShowIntroOwlCursorLabel(introOwlCursorLastX)) {
    showIntroOwlCursorLabel();
    return;
  }

  hideIntroOwlCursorLabel();
}

function setupIntroOwlCursorLabel() {
  if (!(introOwlCursorLabel instanceof HTMLElement)) return;

  getIntroOwlCursorLabelChars();
  gsap.set(introOwlCursorLabel, {
    autoAlpha: 0,
    x: introOwlCursorLastX,
    y: introOwlCursorLastY,
    force3D: true,
  });
  introOwlCursorXTo = gsap.quickTo(introOwlCursorLabel, "x", {
    duration: 0.32,
    ease: "power3.out",
  });
  introOwlCursorYTo = gsap.quickTo(introOwlCursorLabel, "y", {
    duration: 0.32,
    ease: "power3.out",
  });

  const handlePointerMove = (event) => {
    introOwlCursorLastX = event.clientX;
    introOwlCursorLastY = event.clientY;
    setIntroOwlCursorLabelPosition(
      event.clientX,
      event.clientY,
      !introOwlCursorVisible,
    );

    if (shouldShowIntroOwlCursorLabel(event.clientX)) {
      showIntroOwlCursorLabel();
      return;
    }

    hideIntroOwlCursorLabel();
  };

  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  window.addEventListener("mousemove", handlePointerMove, { passive: true });
  window.addEventListener("pointerleave", hideIntroOwlCursorLabel);
  window.addEventListener("blur", hideIntroOwlCursorLabel);
  window.addEventListener("scroll", syncIntroOwlCursorLabel, { passive: true });
}

function getCameraCursorLabelChars() {
  return getCursorLabelChars(cameraCursorLabel, CAMERA_CURSOR_LABEL_TEXT);
}

function stopCameraCursorScramble(finalize = false) {
  stopCursorLabelScramble(
    cameraCursorLabel,
    cameraCursorScrambleUpdate,
    (update) => {
      cameraCursorScrambleUpdate = update;
    },
    finalize,
  );
}

function playCameraCursorScramble() {
  playCursorLabelScramble(
    cameraCursorLabel,
    CAMERA_CURSOR_LABEL_TEXT,
    (update) => {
      cameraCursorScrambleUpdate = update;
    },
    cameraCursorScrambleUpdate,
    {
      initialDelay: 0.08,
      letterStagger: 0.034,
      settleHold: 0.12,
      scrambleInterval: 0.045,
    },
  );
}

function setCameraCursorLabelPosition(x, y, immediate = false) {
  if (!(cameraCursorLabel instanceof HTMLElement)) return;

  const labelWidth = cameraCursorLabel.offsetWidth || 172;
  const labelHeight = cameraCursorLabel.offsetHeight || 28;
  const edgePadding = INTRO_OWL_CURSOR_EDGE_PADDING;
  const offsetX = x + INTRO_OWL_CURSOR_OFFSET_X + labelWidth + edgePadding > window.innerWidth
    ? -(labelWidth + INTRO_OWL_CURSOR_OFFSET_X)
    : INTRO_OWL_CURSOR_OFFSET_X;
  const targetX = clamp(
    x + offsetX,
    edgePadding,
    Math.max(edgePadding, window.innerWidth - labelWidth - edgePadding),
  );
  const targetY = clamp(
    y + INTRO_OWL_CURSOR_OFFSET_Y,
    edgePadding,
    Math.max(edgePadding, window.innerHeight - labelHeight - edgePadding),
  );

  if (immediate || cameraCursorXTo === null || cameraCursorYTo === null) {
    gsap.set(cameraCursorLabel, {
      x: targetX,
      y: targetY,
      force3D: true,
    });
    return;
  }

  cameraCursorXTo(targetX);
  cameraCursorYTo(targetY);
}

function isPointerNearCameraMask(x, y) {
  if (
    state.frameCount === 0 ||
    state.silhouette === null ||
    state.cellWidth <= 0 ||
    state.cellHeight <= 0
  ) {
    return false;
  }

  const localX = x - state.offsetX;
  const localY = y - state.offsetY;
  const column = Math.floor(localX / state.cellWidth);
  const row = Math.floor(localY / state.cellHeight);
  const hoverRadiusPx = Math.max(34, Math.min(window.innerWidth, window.innerHeight) * 0.045);
  const columnRadius = Math.max(1, Math.ceil(hoverRadiusPx / state.cellWidth));
  const rowRadius = Math.max(1, Math.ceil(hoverRadiusPx / state.cellHeight));
  const framePosition = getFramePositionForProgress(state.progress);
  const layers = getCameraFrameLayers(framePosition);

  if (layers === null) return false;

  for (let rowOffset = -rowRadius; rowOffset <= rowRadius; rowOffset += 1) {
    const sampleRow = row + rowOffset;
    if (sampleRow < 0 || sampleRow >= state.rows) continue;

    for (let columnOffset = -columnRadius; columnOffset <= columnRadius; columnOffset += 1) {
      const sampleColumn = column + columnOffset;
      if (sampleColumn < 0 || sampleColumn >= state.cols) continue;

      const distance = Math.hypot(
        columnOffset * state.cellWidth,
        rowOffset * state.cellHeight,
      );
      if (distance > hoverRadiusPx) continue;

      const maskAlpha = getCameraCellAlpha(
        layers.maskFrame,
        layers.nextMaskFrame,
        layers.frameMix,
        sampleColumn,
        sampleRow,
        layers.previousMaskFrame,
        layers.afterMaskFrame,
      );

      if (maskAlpha > 0.018) {
        return true;
      }
    }
  }

  return false;
}

function isCameraCursorInHeroState() {
  const scrollProgress = cameraScrollTrigger?.progress ?? 0;

  return (
    state.cameraActive &&
    startupCameraRevealReady &&
    cameraAssemblyState.complete &&
    !cameraAssemblyState.active &&
    heroIntroHasPlayed &&
    !heroIntroHidden &&
    !document.body.classList.contains("is-startup-loading") &&
    !document.documentElement.classList.contains("is-startup-transitioning") &&
    window.scrollY <= 2 &&
    state.progress <= CAMERA_CURSOR_HERO_PROGRESS_MAX &&
    scrollProgress <= CAMERA_CURSOR_HERO_PROGRESS_MAX &&
    !cameraPlaybackState.finishing &&
    !stage.classList.contains("is-camera-handoff")
  );
}

function shouldShowCameraCursorLabel(x, y) {
  if (
    !(cameraCursorLabel instanceof HTMLElement) ||
    !(sceneCanvas instanceof HTMLCanvasElement) ||
    activePageId !== "work" ||
    !isCameraCursorInHeroState() ||
    window.matchMedia("(pointer: coarse)").matches
  ) {
    return false;
  }

  const stageStyle = getComputedStyle(stage);
  if (stageStyle.visibility === "hidden") return false;

  const canvasRect = sceneCanvas.getBoundingClientRect();
  const localX = x - canvasRect.left;
  const localY = y - canvasRect.top;

  if (
    localX < 0 ||
    localY < 0 ||
    localX > canvasRect.width ||
    localY > canvasRect.height
  ) {
    return false;
  }

  return isPointerNearCameraMask(localX, localY);
}

function showCameraCursorLabel() {
  if (!(cameraCursorLabel instanceof HTMLElement)) return;

  setCameraCursorLabelPosition(
    cameraCursorLastX,
    cameraCursorLastY,
    !cameraCursorVisible,
  );

  if (cameraCursorVisible) return;

  cameraCursorVisible = true;
  playCameraCursorScramble();
  gsap.killTweensOf(cameraCursorLabel, "autoAlpha,opacity,visibility");
  gsap.to(cameraCursorLabel, {
    autoAlpha: 1,
    duration: 0.18,
    ease: "power2.out",
    overwrite: "auto",
    force3D: true,
  });
}

function hideCameraCursorLabel() {
  if (!(cameraCursorLabel instanceof HTMLElement)) return;

  stopCameraCursorScramble(false);

  if (!cameraCursorVisible) {
    gsap.set(cameraCursorLabel, { autoAlpha: 0 });
    return;
  }

  cameraCursorVisible = false;
  gsap.killTweensOf(cameraCursorLabel, "autoAlpha,opacity,visibility");
  gsap.to(cameraCursorLabel, {
    autoAlpha: 0,
    duration: 0.14,
    ease: "power2.out",
    overwrite: "auto",
    force3D: true,
  });
}

function syncCameraCursorLabel() {
  if (shouldShowCameraCursorLabel(cameraCursorLastX, cameraCursorLastY)) {
    showCameraCursorLabel();
    return;
  }

  hideCameraCursorLabel();
}

function setupCameraCursorLabel() {
  if (!(cameraCursorLabel instanceof HTMLElement)) return;

  getCameraCursorLabelChars();
  gsap.set(cameraCursorLabel, {
    autoAlpha: 0,
    x: cameraCursorLastX,
    y: cameraCursorLastY,
    force3D: true,
  });
  cameraCursorXTo = gsap.quickTo(cameraCursorLabel, "x", {
    duration: 0.32,
    ease: "power3.out",
  });
  cameraCursorYTo = gsap.quickTo(cameraCursorLabel, "y", {
    duration: 0.32,
    ease: "power3.out",
  });

  const handlePointerMove = (event) => {
    cameraCursorLastX = event.clientX;
    cameraCursorLastY = event.clientY;
    setCameraCursorLabelPosition(
      event.clientX,
      event.clientY,
      !cameraCursorVisible,
    );

    if (shouldShowCameraCursorLabel(event.clientX, event.clientY)) {
      showCameraCursorLabel();
      return;
    }

    hideCameraCursorLabel();
  };

  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  window.addEventListener("mousemove", handlePointerMove, { passive: true });
  window.addEventListener("pointerleave", hideCameraCursorLabel);
  window.addEventListener("blur", hideCameraCursorLabel);
  window.addEventListener("scroll", syncCameraCursorLabel, { passive: true });
}

function getIntroOwlExitX() {
  const owlWidth = introOwlCanvas instanceof HTMLCanvasElement
    ? introOwlCanvas.clientWidth
    : 0;

  return -(
    window.innerWidth +
    owlWidth * INTRO_OWL_EXIT_X_OVERFLOW_RATIO
  );
}

function getIntroOwlExitY() {
  return window.innerHeight * INTRO_OWL_EXIT_Y_VH / 100;
}

function setIntroOwlExitSuspendedForWork(isSuspended) {
  if (introOwlExitSuspendedForWork === isSuspended) return;

  introOwlExitSuspendedForWork = isSuspended;

  if (isSuspended) {
    introOwlExitScrollTrigger?.disable(false);
    introOwlExitTimeline?.pause();

    if (introOwlFlightLayer instanceof HTMLElement) {
      gsap.set(introOwlFlightLayer, { x: 0, y: 0 });
    }
    if (introFrame instanceof HTMLElement) {
      gsap.set(introFrame, { y: 0 });
    }

    return;
  }

  introOwlExitScrollTrigger?.enable(false);
  introOwlExitScrollTrigger?.update();
}

function setIntroOwlFlightLayerActive(isActive) {
  if (!(introOwlFlightLayer instanceof HTMLElement)) return;
  const workOwlBlocksIntro = isWorkOwlSceneBlockingIntro();

  if (isActive && introFrame instanceof HTMLElement) {
    gsap.set(introFrame, { autoAlpha: 1 });
  }

  if (!isActive && workOwlBlocksIntro) {
    introOwlLoopVisible = false;
    return;
  }

  const shouldShow =
    isActive &&
    (introOwlAssemblyState.active || introOwlAssemblyState.complete);
  introOwlLoopVisible = shouldShow && !workOwlBlocksIntro;

  gsap.set(introOwlFlightLayer, {
    opacity: shouldShow ? 1 : 0,
  });

  if (!introOwlLoopVisible) {
    hideIntroOwlCursorLabel();
  }

  if (
    shouldShow &&
    !workOwlBlocksIntro &&
    introOwlCanvas instanceof HTMLCanvasElement &&
    (introOwlAssemblyState.active || introOwlAssemblyState.complete)
  ) {
    introOwlCanvas.classList.remove("is-work-owl");
    gsap.set(introOwlCanvas, {
      autoAlpha: INTRO_OWL_FINAL_OPACITY,
      "--intro-owl-x": "0px",
      "--intro-owl-scale-x": "1",
    });
  }
}

function setupIntroOwlExit() {
  if (
    !(introSection instanceof HTMLElement) ||
    !(introFrame instanceof HTMLElement) ||
    !(introOwlFlightLayer instanceof HTMLElement) ||
    !(introOwlCanvas instanceof HTMLCanvasElement)
  ) {
    return;
  }

  introOwlExitTimeline?.kill();
  introOwlExitScrollTrigger?.kill();
  introOwlPresenceScrollTrigger?.kill();
  gsap.set(introOwlFlightLayer, { x: 0, y: 0 });
  gsap.set(introFrame, { y: 0, autoAlpha: 0 });
  setIntroOwlFlightLayerActive(false);

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  introOwlExitTimeline = gsap.timeline({ paused: true });
  introOwlExitTimeline.to(
    introFrame,
    {
      y: () => -window.innerHeight,
      duration: 1,
      ease: "none",
      force3D: true,
    },
    0,
  );
  introOwlExitTimeline.to(
    introOwlFlightLayer,
    {
      x: getIntroOwlExitX,
      duration: 1,
      ease: "none",
      force3D: true,
    },
    0,
  );
  introOwlExitTimeline.to(
    introOwlFlightLayer,
    {
      y: reduceMotion ? 0 : getIntroOwlExitY,
      duration: 1,
      ease: reduceMotion ? "none" : "power1.in",
      force3D: true,
    },
    0,
  );

  introOwlExitScrollTrigger = ScrollTrigger.create({
    trigger: introSection,
    start: "bottom bottom",
    end: "bottom top",
    // The sticky text releases at this same scroll boundary. A numeric scrub
    // deliberately trails the scrollbar and made Safari move the text first,
    // then let the owl catch up. Direct binding keeps both departures locked.
    scrub: true,
    animation: introOwlExitTimeline,
    invalidateOnRefresh: true,
    onScrubComplete(self) {
      if (self.progress >= 0.999) {
        setIntroOwlFlightLayerActive(false);
      }
    },
  });

  introOwlPresenceScrollTrigger = ScrollTrigger.create({
    trigger: introSection,
    start: "top top",
    end: "bottom top",
    onEnter() {
      gsap.set(introFrame, { autoAlpha: 1 });
      setIntroOwlFlightLayerActive(true);
    },
    onEnterBack() {
      gsap.set(introFrame, { autoAlpha: 1 });
      setIntroOwlFlightLayerActive(true);
    },
    onLeave() {
      gsap.set(introFrame, { autoAlpha: 0 });
      setIntroOwlFlightLayerActive(false);
    },
    onLeaveBack() {
      gsap.set(introFrame, { autoAlpha: 0 });
      setIntroOwlFlightLayerActive(false);
    },
    onRefresh(self) {
      const bounds = introSection.getBoundingClientRect();
      const isAtIntroStart = bounds.top <= 1 && bounds.bottom > 1;
      const shouldBeActive = self.isActive || isAtIntroStart;
      gsap.set(introFrame, { autoAlpha: shouldBeActive ? 1 : 0 });
      setIntroOwlFlightLayerActive(shouldBeActive);
    },
  });
}

function getWorkOwlSceneStartX() {
  const owlWidth = workOwlCanvas instanceof HTMLCanvasElement
    ? workOwlCanvas.clientWidth
    : 0;

  return -(
    window.innerWidth * 0.5 +
    owlWidth * WORK_OWL_SCENE_START_MARGIN_RATIO
  );
}

function getWorkOwlInitialFramePosition() {
  const frameCount = getIntroOwlLoopFrameCount();
  const lastFrame = Math.max(0, frameCount - 1);

  if (lastFrame === 0) return 0;

  return clamp(
    Math.round(lastFrame * WORK_OWL_SCENE_START_FRAME_RATIO),
    0,
    lastFrame,
  );
}

function getWorkOwlLoopStartTime(time, framePosition, frameCount, loopDuration) {
  const lastFrame = Math.max(0, frameCount - 1);

  if (lastFrame === 0) return time;

  return time - clamp(framePosition / lastFrame, 0, 1) * loopDuration;
}

function getFooterAnimationWords() {
  return footerWords.filter((word) => word instanceof HTMLElement);
}

function getFooterGlitchCopy(word) {
  return word.querySelector(".footer-glitch-word__copy");
}

function getFooterFinalText(word) {
  const copy = getFooterGlitchCopy(word);

  if (!(copy instanceof HTMLElement)) return "";

  if (word.dataset.finalText === undefined) {
    word.dataset.finalText = copy.textContent ?? "";
  }

  return word.dataset.finalText;
}

function restoreFooterFinalText(word) {
  const copy = getFooterGlitchCopy(word);

  if (copy instanceof HTMLElement) {
    copy.textContent = getFooterFinalText(word);
  }
}

function getFooterClip(origin, reveal) {
  const hidden = `${(100 - reveal).toFixed(2)}%`;

  return origin === "right"
    ? { left: hidden, right: "0%" }
    : { left: "0%", right: hidden };
}

function setFooterClip(word, origin, reveal) {
  const clip = getFooterClip(origin, reveal);

  word.style.setProperty("--clip-left", clip.left);
  word.style.setProperty("--clip-right", clip.right);
}

function setFooterWordStep(
  word,
  origin,
  scale,
  reveal,
  shift,
  opacity = 1,
  pixelJitter = 0,
  pixelContrast = 0,
) {
  if (pixelJitter > 0 || pixelContrast > 0) {
    word.classList.add("is-pixelating");
  } else {
    word.classList.remove("is-pixelating");
  }

  word.style.setProperty("--copy-opacity", String(opacity));
  word.style.setProperty("--step-scale", String(scale));
  word.style.setProperty("--shift", `${shift}px`);
  word.style.setProperty("--pixel-jitter", `${pixelJitter}px`);
  word.style.setProperty("--pixel-contrast", `${pixelContrast}px`);
  setFooterClip(word, origin, reveal);
}

function setFooterGlitchWordFinal(word) {
  restoreFooterFinalText(word);
  word.classList.remove("is-pixelating");
  word.style.setProperty("--copy-opacity", "1");
  word.style.setProperty("--dot-opacity", "0");
  word.style.setProperty("--dot-scale", "0.78");
  word.style.setProperty("--step-scale", "1");
  word.style.setProperty("--shift", "0px");
  word.style.setProperty("--pixel-jitter", "0px");
  word.style.setProperty("--pixel-contrast", "0px");
  word.style.setProperty("--clip-left", "0%");
  word.style.setProperty("--clip-right", "0%");
}

function resetFooterGlitchWord(word) {
  const origin = word.dataset.footerOrigin === "right" ? "right" : "left";

  word.classList.remove("is-pixelating");
  word.dataset.origin = origin;
  word.style.setProperty("--origin-x", origin === "right" ? "100%" : "0%");
  word.style.setProperty("--dot-x", origin === "right" ? "100%" : "0%");
  restoreFooterFinalText(word);
  word.style.setProperty("--copy-opacity", "0");
  word.style.setProperty("--dot-opacity", "0");
  word.style.setProperty("--dot-scale", "0.78");
  word.style.setProperty("--step-scale", "0.18");
  word.style.setProperty("--shift", "0px");
  word.style.setProperty("--pixel-jitter", "0px");
  word.style.setProperty("--pixel-contrast", "0px");
  setFooterClip(word, origin, 0);
}

function getFooterMonoGlowHeights() {
  const { bars, peak, valley } = FOOTER_MONO_GLOW_CONFIG;
  const mid = (bars - 1) / 2;

  return Array.from({ length: bars }, (_, index) => {
    const t = mid === 0 ? 0 : Math.abs(index - mid) / mid;
    const eased = 1 - Math.pow(t, 1.24);
    return FOOTER_MONO_GLOW_VIEWBOX_HEIGHT * peak * (valley + (1 - valley) * eased);
  });
}

function setupFooterMonoGlow() {
  if (!(footerMonoGlow instanceof HTMLElement) || footerMonoGlow.dataset.ready === "true") {
    return;
  }

  const svgNamespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNamespace, "svg");
  const defs = document.createElementNS(svgNamespace, "defs");
  const gradient = document.createElementNS(svgNamespace, "linearGradient");
  const filter = document.createElementNS(svgNamespace, "filter");
  const blur = document.createElementNS(svgNamespace, "feGaussianBlur");
  const colWidth = FOOTER_MONO_GLOW_VIEWBOX_WIDTH / FOOTER_MONO_GLOW_CONFIG.bars;

  svg.setAttribute(
    "viewBox",
    `0 0 ${FOOTER_MONO_GLOW_VIEWBOX_WIDTH} ${FOOTER_MONO_GLOW_VIEWBOX_HEIGHT}`,
  );
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("fill", "none");

  gradient.id = "footer-mono-glow-gradient";
  gradient.setAttribute("x1", "0");
  gradient.setAttribute("y1", "1");
  gradient.setAttribute("x2", "0");
  gradient.setAttribute("y2", "0");

  FOOTER_MONO_GLOW_CONFIG.stops.forEach(({ offset, color }) => {
    const stop = document.createElementNS(svgNamespace, "stop");
    stop.setAttribute("offset", `${offset}`);
    stop.setAttribute("stop-color", color);
    gradient.append(stop);
  });

  filter.id = "footer-mono-glow-blur";
  filter.setAttribute("x", "-50%");
  filter.setAttribute("y", "-50%");
  filter.setAttribute("width", "200%");
  filter.setAttribute("height", "200%");
  blur.setAttribute("stdDeviation", `${FOOTER_MONO_GLOW_CONFIG.blur}`);
  filter.append(blur);
  defs.append(gradient, filter);
  svg.append(defs);

  getFooterMonoGlowHeights().forEach((height, index) => {
    const group = document.createElementNS(svgNamespace, "g");
    const rect = document.createElementNS(svgNamespace, "rect");

    group.dataset.footerMonoGlowTile = "true";
    group.setAttribute("filter", "url(#footer-mono-glow-blur)");
    rect.setAttribute("x", `${index * colWidth}`);
    rect.setAttribute("y", `${FOOTER_MONO_GLOW_VIEWBOX_HEIGHT - height}`);
    rect.setAttribute("width", `${colWidth * 1.23}`);
    rect.setAttribute("height", `${height}`);
    rect.setAttribute("fill", "url(#footer-mono-glow-gradient)");
    group.append(rect);
    svg.append(group);
  });

  footerMonoGlow.append(svg);
  footerMonoGlow.dataset.ready = "true";
}

function getFooterMonoGlowTiles() {
  if (!(footerMonoGlow instanceof HTMLElement)) return [];

  return Array.from(
    footerMonoGlow.querySelectorAll("[data-footer-mono-glow-tile]"),
  );
}

function setFooterMonoGlowVisible(visible, { immediate = false } = {}) {
  if (!(footerMonoGlow instanceof HTMLElement)) return;

  setupFooterMonoGlow();
  gsap.killTweensOf(footerMonoGlow);
  const tiles = getFooterMonoGlowTiles();
  gsap.killTweensOf(tiles);

  const vars = {
    scaleY: 1,
    autoAlpha: visible ? FOOTER_MONO_GLOW_CONFIG.opacity : 0,
    transformOrigin: "50% 100%",
    force3D: true,
  };

  if (immediate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.set(footerMonoGlow, vars);
    gsap.set(tiles, {
      scaleY: visible ? 1 : 0,
      autoAlpha: visible ? 1 : 0,
      transformOrigin: "50% 100%",
      force3D: true,
    });
    return;
  }

  gsap.set(tiles, {
    scaleY: visible ? 0 : 1,
    autoAlpha: visible ? 0 : 1,
    transformOrigin: "50% 100%",
    force3D: true,
  });
  gsap.to(footerMonoGlow, {
    ...vars,
    duration: visible ? FOOTER_MONO_GLOW_CONFIG.riseDuration : 0.24,
    ease: visible ? "footerSoftSettle" : "power2.out",
  });
  gsap.to(tiles, {
    scaleY: visible ? 1 : 0,
    autoAlpha: visible ? 1 : 0,
    transformOrigin: "50% 100%",
    duration: 0.52,
    ease: visible ? "footerSoftSettle" : "power2.out",
    stagger: {
      each: 0.045,
      from: "start",
    },
    force3D: true,
  });
}

function addFooterMonoGlowReveal(timeline, position) {
  if (!(footerMonoGlow instanceof HTMLElement)) return;

  setupFooterMonoGlow();
  const tiles = getFooterMonoGlowTiles();

  timeline.set(
    footerMonoGlow,
    {
      autoAlpha: FOOTER_MONO_GLOW_CONFIG.opacity,
      transformOrigin: "50% 100%",
      scaleY: 1,
      force3D: true,
    },
    position,
  );
  timeline.fromTo(
    tiles,
    {
      scaleY: 0,
      autoAlpha: 0,
      transformOrigin: "50% 100%",
    },
    {
      scaleY: 1,
      autoAlpha: 1,
      transformOrigin: "50% 100%",
      duration: 0.52,
      ease: "footerSoftSettle",
      stagger: {
        each: 0.045,
        from: "start",
      },
      force3D: true,
    },
    position,
  );
}

function addFooterGlitchWordSteps(timeline, word, start) {
  if (!(word instanceof HTMLElement)) return;

  const origin = word.dataset.footerOrigin === "right" ? "right" : "left";
  const direction = origin === "right" ? 1 : -1;
  const ladderStart = start + FOOTER_GLITCH_DOT_HOLD;

  timeline.call(() => {
    word.style.setProperty("--dot-opacity", "1");
    word.style.setProperty("--dot-scale", "1.18");
    setFooterWordStep(word, origin, 0.14, 0, 0, 0, 0, 0);
  }, [], start);

  timeline.call(() => {
    word.style.setProperty("--dot-opacity", "0");
    word.style.setProperty("--dot-scale", "0.78");
    setFooterWordStep(word, origin, 0.22, 18, direction * 14, 1, 2, 1);
    playDotGlitchNotification();
  }, [], ladderStart);

  timeline.call(() => {
    setFooterWordStep(word, origin, 0.46, 42, direction * -8, 1, 3, 2);
    playDotGlitchNotification();
  }, [], ladderStart + FOOTER_GLITCH_STEP_TWO);

  timeline.call(() => {
    setFooterWordStep(word, origin, 0.78, 76, direction * 5, 1, 1, 1);
    playDotGlitchNotification();
  }, [], ladderStart + FOOTER_GLITCH_STEP_THREE);

  timeline.call(() => {
    restoreFooterFinalText(word);
    setFooterWordStep(word, origin, 1, 100, 0, 1, 0, 0);
    word.style.setProperty("--dot-opacity", "0");
    word.style.setProperty("--dot-scale", "0.78");
    playDotGlitchNotification();
  }, [], ladderStart + FOOTER_GLITCH_STEP_FOUR);

  timeline.call(() => setFooterGlitchWordFinal(word), [], ladderStart + FOOTER_GLITCH_CLEANUP);
}

function getFooterGlyphBurstOrigin() {
  if (
    !(footerGlyphBurstCanvas instanceof HTMLCanvasElement) ||
    !(footerDesignWord instanceof HTMLElement) ||
    !(footerEngineerWord instanceof HTMLElement)
  ) {
    return null;
  }

  const canvasBounds = footerGlyphBurstCanvas.getBoundingClientRect();
  const designBounds = footerDesignWord.getBoundingClientRect();
  const engineerBounds = footerEngineerWord.getBoundingClientRect();
  const groupLeft = Math.min(designBounds.left, engineerBounds.left);
  const groupRight = Math.max(designBounds.right, engineerBounds.right);
  const groupTop = Math.min(designBounds.top, engineerBounds.top);
  const groupBottom = Math.max(designBounds.bottom, engineerBounds.bottom);

  return {
    x: (groupLeft + groupRight) * 0.5 - canvasBounds.left,
    y: (groupTop + groupBottom) * 0.5 - canvasBounds.top,
  };
}

function prepareFooterGlyphBurst() {
  const origin = getFooterGlyphBurstOrigin();
  if (origin === null) return false;

  footerGlyphBurstState.maxDpr = FOOTER_GLYPH_BURST_MAX_DPR;
  return buildGlyphBurst(footerGlyphBurstState, origin);
}

function playFooterGlyphBurst() {
  const origin = getFooterGlyphBurstOrigin();
  if (origin === null) return;

  const didStart = playGlyphBurst(footerGlyphBurstState, {
    duration: FOOTER_WORD_EXPLOSION_DURATION,
    origin,
    coverageScale: 1.12,
    preserveTrailingCoverage: true,
    maxDpr: FOOTER_GLYPH_BURST_MAX_DPR,
  });
  if (didStart) playFooterOrganGlyphSplash();
}

function resetFooterInteractionVisuals({ includeOwl = true } = {}) {
  const words = getFooterAnimationWords();

  stopGlyphBurst(footerGlyphBurstState);
  setFooterMonoGlowVisible(false, { immediate: true });
  words.forEach(resetFooterGlitchWord);
  gsap.set(words, {
    xPercent: -50,
    yPercent: -50,
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    autoAlpha: 1,
    force3D: true,
  });

  if (footerCopyButton instanceof HTMLButtonElement) {
    window.clearTimeout(footerCopyResetTimer);
    footerCopyResetTimer = 0;
    gsap.killTweensOf(footerCopyButton);
    setFooterCopyButtonLabel("copy email");
    footerCopyButton.dataset.copyState = "idle";
    gsap.set(footerCopyButton, {
      clearProps: "transform",
      "--footer-copy-y": "24px",
      "--footer-copy-scale": 0.92,
      "--footer-copy-magnet-x": "0px",
      "--footer-copy-magnet-y": "0px",
      autoAlpha: 0,
    });
  }

  if (footerSocials instanceof HTMLElement) {
    gsap.set(footerSocials, {
      y: 16,
      autoAlpha: 0,
      force3D: true,
    });
  }

  gsap.set(
    footerSocialLinks.filter((link) => link instanceof HTMLElement),
    {
      y: 12,
      autoAlpha: 0,
      force3D: true,
    },
  );

  if (includeOwl && workOwlLayer instanceof HTMLElement) {
    parkWorkOwlSceneAtStart();
    gsap.set(workOwlLayer, {
      y: 4,
      scale: 0.96,
      rotation: -2,
      force3D: true,
    });
  }
}

function getFooterWordMotionTargets() {
  if (
    !(footerStage instanceof HTMLElement) ||
    !(footerDesignWord instanceof HTMLElement) ||
    !(footerEngineerWord instanceof HTMLElement)
  ) {
    return {
      design: { x: -72, y: 0, liftY: -72, scale: 1, travel: 72 },
      engineer: { x: 72, y: 0, liftY: 72, scale: 1, travel: 72 },
    };
  }

  const stageBounds = footerStage.getBoundingClientRect();
  const designBounds = footerDesignWord.getBoundingClientRect();
  const engineerBounds = footerEngineerWord.getBoundingClientRect();
  const centerX = stageBounds.left + stageBounds.width / 2;
  const centerY = stageBounds.top + stageBounds.height / 2;
  const owlWidth = workOwlCanvas instanceof HTMLCanvasElement
    ? workOwlCanvas.clientWidth
    : Math.min(stageBounds.width * 0.36, 360);
  const owlHeight = workOwlCanvas instanceof HTMLCanvasElement
    ? workOwlCanvas.clientHeight
    : owlWidth * (157 / 167);
  const compact = stageBounds.width < 700;
  const owlHalf = owlWidth * (compact ? 0.36 : 0.42);
  const gap = clamp(stageBounds.width * (compact ? 0.01 : 0.014), 8, 24);
  const edgePadding = compact ? 14 : 32;
  const leftAvailable = Math.max(
    1,
    centerX - stageBounds.left - owlHalf - gap - edgePadding,
  );
  const rightAvailable = Math.max(
    1,
    stageBounds.right - centerX - owlHalf - gap - edgePadding,
  );
  const widestWordWidth = Math.max(designBounds.width, engineerBounds.width);
  const sideAvailable = Math.min(leftAvailable, rightAvailable);
  const finalScale = clamp(
    Math.min(1, sideAvailable / Math.max(1, widestWordWidth)),
    compact ? 0.52 : 0.62,
    1,
  );
  const designCurrentCenter = {
    x: designBounds.left + designBounds.width / 2,
    y: designBounds.top + designBounds.height / 2,
  };
  const engineerCurrentCenter = {
    x: engineerBounds.left + engineerBounds.width / 2,
    y: engineerBounds.top + engineerBounds.height / 2,
  };
  const sideTravel = owlHalf + gap + (widestWordWidth * finalScale) / 2;
  const verticalEdgePadding = compact ? 16 : 24;
  const liftedWordHalfHeight =
    (Math.max(designBounds.height, engineerBounds.height) * 0.985) / 2;
  const owlHalfHeight = owlHeight / 2;
  const stackTravel = owlHalfHeight + gap + liftedWordHalfHeight;
  const verticalTravelLimit = Math.max(
    1,
    Math.min(
      centerY - stageBounds.top - liftedWordHalfHeight - verticalEdgePadding,
      stageBounds.bottom - centerY - liftedWordHalfHeight - verticalEdgePadding,
    ),
  );
  const stackedTravel = Math.min(stackTravel, verticalTravelLimit);
  const designTargetCenterX = centerX - sideTravel;
  const engineerTargetCenterX = centerX + sideTravel;
  const designTargetY = centerY - designCurrentCenter.y;
  const engineerTargetY = centerY - engineerCurrentCenter.y;

  return {
    design: {
      x: designTargetCenterX - designCurrentCenter.x,
      y: designTargetY,
      liftY: designTargetY - stackedTravel,
      scale: finalScale,
      travel: Math.max(sideTravel, stackedTravel),
    },
    engineer: {
      x: engineerTargetCenterX - engineerCurrentCenter.x,
      y: engineerTargetY,
      liftY: engineerTargetY + stackedTravel,
      scale: finalScale,
      travel: Math.max(sideTravel, stackedTravel),
    },
  };
}

function getQuadraticBezierValue(start, control, end, progress) {
  const inverseProgress = 1 - progress;
  return (
    inverseProgress * inverseProgress * start +
    2 * inverseProgress * progress * control +
    progress * progress * end
  );
}

function addFooterWordSideArc(timeline, word, target, direction, position) {
  if (!(word instanceof HTMLElement)) return;

  const motion = { progress: 0 };
  const setX = gsap.quickSetter(word, "x", "px");
  const setY = gsap.quickSetter(word, "y", "px");
  // GSAP expands the `scale` alias to the literal string `scaleX,scaleY` in
  // quickSetter. WebKit treats that as an invalid CSS property and aborts the
  // timeline, so drive the two transform components explicitly.
  const setScaleX = gsap.quickSetter(word, "scaleX");
  const setScaleY = gsap.quickSetter(word, "scaleY");
  const setScale = (value) => {
    setScaleX(value);
    setScaleY(value);
  };
  const setRotation = gsap.quickSetter(word, "rotation", "deg");
  const arcLift = clamp((target.travel ?? Math.abs(target.liftY)) * 0.16, 10, 26);
  const control = {
    x: target.x * 0.42,
    y: target.liftY + direction * arcLift,
  };

  gsap.set(word, {
    force3D: true,
  });

  timeline.to(
    motion,
    {
      progress: 1,
      duration: 0.96,
      ease: "footerWordArc",
      onUpdate() {
        const progress = motion.progress;
        const rotation = direction * 0.34 * Math.sin(Math.PI * progress);

        setX(getQuadraticBezierValue(0, control.x, target.x, progress));
        setY(getQuadraticBezierValue(target.liftY, control.y, target.y, progress));
        setScale(lerp(0.985, target.scale, progress));
        setRotation(rotation);
      },
      onComplete() {
        setX(target.x);
        setY(target.y);
        setScale(target.scale);
        setRotation(0);
      },
    },
    position,
  );
}

function setFooterWordsFinal() {
  getFooterAnimationWords().forEach(setFooterGlitchWordFinal);
}

function showFooterOwlFinal() {
  if (!(workOwlLayer instanceof HTMLElement)) return;

  workOwlLayer.dataset.workOwlVisible = "true";
  markWorkOwlSceneLanded();
  workOwlSceneProgress = 1;
  // The owl's slide and its canvas frame loop have separate lifecycles. A
  // very fast scroll can complete the slide after a transient refresh paused
  // the frame loop, so explicitly keep rendering alive at the settled frame.
  setWorkOwlSceneActive(true, true);
  gsap.set(workOwlLayer, {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    autoAlpha: 1,
    force3D: true,
  });
}

function showFooterFinalGlow({ immediate = false } = {}) {
  setFooterMonoGlowVisible(true, { immediate });
}

function setFooterInteractionState(nextState) {
  footerInteractionState = nextState;

  if (workOwlScene instanceof HTMLElement) {
    workOwlScene.dataset.footerInteractionState = nextState;
  }
}

function clearFooterInteractionCompletionFallback() {
  footerInteractionCompletionFallback?.kill();
  footerInteractionCompletionFallback = null;
}

function clearFooterInteractionStartRetry() {
  footerInteractionStartRetry?.kill();
  footerInteractionStartRetry = null;
}

function isFooterInteractionStartBlocked() {
  const root = document.documentElement;

  return (
    !startupExperienceReady ||
    introRevealLockActive ||
    pageTransitionActive ||
    root.classList.contains("is-intro-reveal-locked") ||
    root.classList.contains("is-page-transitioning")
  );
}

function isFooterSceneVisible() {
  if (!(workOwlScene instanceof HTMLElement)) return false;

  const bounds = workOwlScene.getBoundingClientRect();
  return bounds.top < window.innerHeight && bounds.bottom > 0;
}

function setFooterInteractionFinal() {
  clearFooterInteractionStartRetry();
  clearFooterInteractionCompletionFallback();
  footerInteractionTimeline?.kill();
  footerInteractionTimeline = null;
  footerInteractionTimelinePrepared = false;
  setFooterInteractionState("complete");
  resetFooterInteractionVisuals({ includeOwl: false });
  setFooterWordsFinal();

  const targets = getFooterWordMotionTargets();

  if (footerDesignWord instanceof HTMLElement) {
    gsap.set(footerDesignWord, {
      x: targets.design.x,
      y: targets.design.y,
      scale: targets.design.scale,
      rotation: 0,
      autoAlpha: 1,
      force3D: true,
    });
  }

  if (footerEngineerWord instanceof HTMLElement) {
    gsap.set(footerEngineerWord, {
      x: targets.engineer.x,
      y: targets.engineer.y,
      scale: targets.engineer.scale,
      rotation: 0,
      autoAlpha: 1,
      force3D: true,
    });
  }

  if (footerCopyButton instanceof HTMLButtonElement) {
    gsap.set(footerCopyButton, {
      clearProps: "transform",
      "--footer-copy-y": "0px",
      "--footer-copy-scale": 1,
      "--footer-copy-magnet-x": "0px",
      "--footer-copy-magnet-y": "0px",
      autoAlpha: 1,
    });
  }

  if (footerSocials instanceof HTMLElement) {
    gsap.set(footerSocials, {
      y: 0,
      autoAlpha: 1,
      force3D: true,
    });
  }

  gsap.set(
    footerSocialLinks.filter((link) => link instanceof HTMLElement),
    {
      y: 0,
      autoAlpha: 1,
      force3D: true,
    },
  );

  showFooterOwlFinal();
  showFooterFinalGlow({ immediate: true });
}

function buildFooterInteractionTimeline() {
  resetFooterInteractionVisuals();
  prepareFooterGlyphBurst();

  const targets = getFooterWordMotionTargets();
  const socialTargets = footerSocialLinks.filter((link) => link instanceof HTMLElement);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion) {
    setFooterInteractionFinal();
    return null;
  }

  const timeline = gsap.timeline({
    paused: true,
    defaults: {
      overwrite: "auto",
    },
    onStart() {
      footerInteractionTimelinePrepared = false;
      // Always restart the canvas loop with the footer timeline. This closes
      // the fast-scroll race where the transform tween runs while the owl's
      // internal frames remain paused.
      setWorkOwlSceneActive(true, true);
      renderWorkOwlInitialFrameIfNeeded();
      if (workOwlLayer instanceof HTMLElement) {
        // Establish visibility before the delayed entrance tween. If WebKit
        // misses the exact label frame, the owl still interpolates from its
        // parked transform instead of flashing in at the destination.
        workOwlLayer.dataset.workOwlVisible = "true";
      }
      setFooterInteractionState("playing");
      workOwlSceneHasEntered = true;
      workOwlSceneHasLanded = false;
    },
    onComplete() {
      setFooterInteractionFinal();
    },
  });

  const wordRevealStart = 0;
  timeline.addLabel("wordReveal", wordRevealStart);
  addFooterGlitchWordSteps(timeline, footerDesignWord, wordRevealStart);
  addFooterGlitchWordSteps(
    timeline,
    footerEngineerWord,
    wordRevealStart + FOOTER_GLITCH_WORD_GAP,
  );

  timeline.addLabel("owlBurst", 1.12);
  timeline.call(playFooterGlyphBurst, [], "owlBurst-=0.04");
  timeline.call(() => {
    setWorkOwlSceneActive(true, true);
    if (workOwlLayer instanceof HTMLElement) {
      workOwlLayer.dataset.workOwlVisible = "true";
    }
  }, [], "owlBurst");

  timeline.to(
    footerDesignWord,
    {
      y: targets.design.liftY,
      scale: 0.985,
      duration: FOOTER_WORD_EXPLOSION_DURATION,
      ease: "footerWordArc",
      force3D: true,
    },
    "owlBurst-=0.04",
  );
  timeline.to(
    footerEngineerWord,
    {
      y: targets.engineer.liftY,
      scale: 0.985,
      duration: FOOTER_WORD_EXPLOSION_DURATION,
      ease: "footerWordArc",
      force3D: true,
    },
    "owlBurst-=0.04",
  );
  timeline.to(
    workOwlLayer,
    {
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      autoAlpha: 1,
      duration: 0.98,
      ease: "footerOwlExplosion",
      force3D: true,
    },
    "owlBurst",
  );

  timeline.addLabel("wordSplit", "owlBurst+=1.08");
  addFooterWordSideArc(timeline, footerDesignWord, targets.design, -1, "wordSplit");
  addFooterWordSideArc(timeline, footerEngineerWord, targets.engineer, 1, "wordSplit");
  timeline.addLabel("footerGlow", "wordSplit+=0.92");
  timeline.call(startFooterAmbientOutro, [], "footerGlow");
  addFooterMonoGlowReveal(timeline, "footerGlow");
  timeline.to(
    footerSocials,
    {
      y: 0,
      autoAlpha: 1,
      duration: 0.46,
      ease: "footerSoftSettle",
      force3D: true,
    },
    "footerGlow+=0.48",
  );
  timeline.to(
    socialTargets,
    {
      y: 0,
      autoAlpha: 1,
      stagger: 0.055,
      duration: 0.42,
      ease: "power3.out",
      force3D: true,
    },
    "footerGlow+=0.54",
  );
  timeline.to(
    footerCopyButton,
    {
      "--footer-copy-y": "0px",
      "--footer-copy-scale": 1,
      "--footer-copy-magnet-x": "0px",
      "--footer-copy-magnet-y": "0px",
      autoAlpha: 1,
      duration: 0.52,
      ease: "footerSoftSettle",
    },
    "footerGlow+=0.9",
  );

  return timeline;
}

function prepareFooterInteractionTimeline() {
  if (
    !(workOwlScene instanceof HTMLElement) ||
    footerInteractionState !== "idle" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }

  footerInteractionTimeline?.kill();
  footerInteractionTimeline = buildFooterInteractionTimeline();
  footerInteractionTimelinePrepared = footerInteractionTimeline !== null;
}

function playFooterInteraction() {
  if (document.body.dataset.currentPage !== "work") return;
  if (!(workOwlScene instanceof HTMLElement)) return;

  // ScrollTrigger may report multiple boundary updates in one WebKit paint.
  // Once the entrance owns the scene, those updates must never resolve it to
  // the final frame before the first visible animation frame is painted.
  if (footerInteractionState === "playing") {
    setWorkOwlSceneActive(true, true);
    if (footerInteractionTimeline?.paused()) {
      footerInteractionTimeline.resume();
    }
    return;
  }

  if (footerInteractionTimeline?.isActive()) {
    // The timeline can remain active while a ScrollTrigger refresh has
    // temporarily suspended only the canvas renderer. Resume it before the
    // active-timeline guard returns.
    setWorkOwlSceneActive(true, true);
    return;
  }

  // This state is the sole authority for the authored footer sequence. The
  // owl renderer can land independently and must never suppress the words,
  // glyph burst, glow, or socials timeline.
  const hasCompleted = footerInteractionState === "complete";

  if (hasCompleted) {
    setFooterInteractionState("complete");
    setWorkOwlSceneActive(true, true);
    return;
  }

  // A fast wheel gesture can momentarily cross this trigger while the intro
  // lock is pinning the page back to its reveal. Starting in that transient
  // frame makes the footer finish off-screen, so only an unlocked first
  // arrival is allowed to create the timeline.
  if (isFooterInteractionStartBlocked()) {
    // Safari can cross the footer trigger while the startup/intro lock is
    // clearing, then stop producing scroll events. Retry while the footer is
    // actually visible so its first entrance cannot remain stranded in idle.
    if (footerInteractionStartRetry === null) {
      footerInteractionStartRetry = gsap.delayedCall(0.12, () => {
        footerInteractionStartRetry = null;
        if (
          document.body.dataset.currentPage === "work" &&
          footerInteractionState === "idle" &&
          isFooterSceneVisible()
        ) {
          playFooterInteraction();
        }
      });
    }
    return;
  }

  clearFooterInteractionStartRetry();

  if (!isIntroOwlDataReady()) {
    if (!workOwlSceneEnterPending) {
      workOwlSceneEnterPending = true;
      loadIntroOwlData()
        .then(() => {
          workOwlSceneEnterPending = false;
          if (
            document.body.dataset.currentPage === "work" &&
            (workOwlScenePresenceScrollTrigger?.isActive ||
              isFooterSceneVisible())
          ) {
            playFooterInteraction();
          }
        })
        .catch((error) => {
          workOwlSceneEnterPending = false;
          console.error("Unable to load footer owl data.", error);
        });
    }

    return;
  }

  if (!workOwlSceneActive) {
    setWorkOwlSceneActive(true);
  } else {
    renderWorkOwlInitialFrameIfNeeded();
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    startFooterAmbientOutro();
    setFooterInteractionFinal();
    return;
  }

  if (!footerInteractionTimelinePrepared) {
    footerInteractionTimeline?.kill();
    footerInteractionTimeline = buildFooterInteractionTimeline();
  }
  footerInteractionTimelinePrepared = false;
  setFooterInteractionState("playing");
  footerInteractionTimeline?.play(0);

  clearFooterInteractionCompletionFallback();
  const expectedDuration = footerInteractionTimeline?.duration() ?? 0;
  if (expectedDuration > 0) {
    footerInteractionCompletionFallback = gsap.delayedCall(
      expectedDuration + 0.35,
      () => {
        footerInteractionCompletionFallback = null;
        if (
          document.body.dataset.currentPage === "work" &&
          footerInteractionState === "playing"
        ) {
          setFooterInteractionFinal();
        }
      },
    );
  }
}

function resetFooterInteraction() {
  beginFooterAmbientEpoch();
  clearFooterInteractionStartRetry();
  clearFooterInteractionCompletionFallback();
  footerInteractionTimeline?.kill();
  footerInteractionTimeline = null;
  footerInteractionTimelinePrepared = false;
  setFooterInteractionState("idle");
  workOwlSceneHasEntered = false;
  workOwlSceneHasLanded = false;
  workOwlSceneProgress = 0;
  setWorkOwlSceneLanded(false);
  resetFooterInteractionVisuals();
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  Object.assign(textarea.style, {
    position: "fixed",
    left: "-9999px",
    top: "0",
  });
  document.body.appendChild(textarea);
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
  }

  return copied;
}

function setFooterCopyButtonLabel(text) {
  if (!(footerCopyButton instanceof HTMLButtonElement)) return;

  footerCopyScrambleTween?.kill();
  footerCopyScrambleTween = null;
  footerCopyButton.textContent = text;
  footerCopyButton.setAttribute("aria-label", text);
}

function scrambleFooterCopyButtonLabel(text) {
  if (!(footerCopyButton instanceof HTMLButtonElement)) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion) {
    setFooterCopyButtonLabel(text);
    return;
  }

  const finalChars = Array.from(text);
  const scrambleChars = INTRO_OWL_CURSOR_SCRAMBLE_CHARS;
  const state = { progress: 0 };

  footerCopyScrambleTween?.kill();
  footerCopyScrambleTween = gsap.to(state, {
    progress: 1,
    duration: 0.36,
    ease: "power3.out",
    onUpdate() {
      const settledCount = Math.floor(state.progress * (finalChars.length + 1));
      const bucket = Math.floor(state.progress * 18);

      footerCopyButton.textContent = finalChars
        .map((char, index) => {
          if (char === " ") return " ";
          if (index < settledCount) return char;

          const charIndex = (bucket + index * 7) % scrambleChars.length;
          return scrambleChars[charIndex].toLowerCase();
        })
        .join("");
    },
    onComplete() {
      footerCopyScrambleTween = null;
      setFooterCopyButtonLabel(text);
    },
  });
}

function setupFooterCopyMagneticEffect() {
  if (
    !(footerCopyButton instanceof HTMLButtonElement) ||
    !(footerStage instanceof HTMLElement) ||
    footerCopyButton.dataset.magnetReady === "true"
  ) {
    return;
  }

  footerCopyButton.dataset.magnetReady = "true";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion) return;

  let currentX = 0;
  let currentY = 0;
  let targetX = 0;
  let targetY = 0;
  let isPulled = false;
  let isTicking = false;

  const renderMagnet = () => {
    const copyButtonStyles = window.getComputedStyle(footerCopyButton);
    const shouldRelease =
      document.body.dataset.currentPage !== "work" ||
      copyButtonStyles.visibility === "hidden" ||
      Number(copyButtonStyles.opacity) <= 0.05;

    if (shouldRelease) {
      isPulled = false;
      targetX = 0;
      targetY = 0;
    }

    const lerpAmount = isPulled ? 0.22 : 0.16;

    currentX += (targetX - currentX) * lerpAmount;
    currentY += (targetY - currentY) * lerpAmount;

    if (
      Math.abs(currentX - targetX) < 0.02 &&
      Math.abs(currentY - targetY) < 0.02
    ) {
      currentX = targetX;
      currentY = targetY;
    }

    footerCopyButton.style.setProperty(
      "--footer-copy-magnet-x",
      `${currentX.toFixed(3)}px`,
    );
    footerCopyButton.style.setProperty(
      "--footer-copy-magnet-y",
      `${currentY.toFixed(3)}px`,
    );

    if (
      currentX === 0 &&
      currentY === 0 &&
      targetX === 0 &&
      targetY === 0
    ) {
      isTicking = false;
      gsap.ticker.remove(renderMagnet);
    }
  };

  const startMagnetTicker = () => {
    if (isTicking) return;

    isTicking = true;
    gsap.ticker.add(renderMagnet);
  };

  const resetMagnet = () => {
    if (!isPulled) return;

    isPulled = false;
    targetX = 0;
    targetY = 0;
    startMagnetTicker();
  };

  const moveMagnet = (event) => {
    if (document.body.dataset.currentPage !== "work") {
      resetMagnet();
      return;
    }

    const copyButtonStyles = window.getComputedStyle(footerCopyButton);
    const isVisible =
      copyButtonStyles.visibility !== "hidden" &&
      Number(copyButtonStyles.opacity) > 0.45;

    if (!isVisible) {
      resetMagnet();
      return;
    }

    const bounds = footerCopyButton.getBoundingClientRect();

    if (bounds.width === 0 || bounds.height === 0) {
      resetMagnet();
      return;
    }

    const centerX = bounds.left + bounds.width / 2 - currentX;
    const centerY = bounds.top + bounds.height / 2 - currentY;
    const deltaX = event.clientX - centerX;
    const deltaY = event.clientY - centerY;
    const distance = Math.hypot(deltaX, deltaY);
    const radius = clamp(Math.max(bounds.width, bounds.height) * 5.4, 112, 190);

    if (distance > radius) {
      resetMagnet();
      return;
    }

    const strength = Math.pow(clamp(1 - distance / radius, 0, 1), 1.25);
    const pullX = clamp(deltaX * 0.26 * strength, -14, 14);
    const pullY = clamp(deltaY * 0.3 * strength, -11, 11);

    isPulled = true;
    targetX = pullX;
    targetY = pullY;
    startMagnetTicker();
  };

  footerStage.addEventListener("pointermove", moveMagnet, { passive: true });
  footerStage.addEventListener("mousemove", moveMagnet, { passive: true });
  footerStage.addEventListener("pointerleave", resetMagnet);
  footerStage.addEventListener("mouseleave", resetMagnet);
  footerStage.addEventListener("pointercancel", resetMagnet);
  footerCopyButton.addEventListener("pointerenter", moveMagnet, { passive: true });
  footerCopyButton.addEventListener("pointerleave", resetMagnet);
  footerCopyButton.addEventListener("pointercancel", resetMagnet);
}

function setupFooterCopyEmail() {
  if (!(footerCopyButton instanceof HTMLButtonElement)) return;

  setupFooterCopyMagneticEffect();

  if (footerCopyButton.dataset.copyReady === "true") return;

  footerCopyButton.dataset.copyReady = "true";
  footerCopyButton.addEventListener("click", async () => {
    const email = footerCopyButton.dataset.email ?? "";
    if (email.length === 0) return;

    window.clearTimeout(footerCopyResetTimer);

    try {
      const copied = await copyTextToClipboard(email);
      if (!copied) {
        throw new Error("Clipboard write failed.");
      }
      scrambleFooterCopyButtonLabel("copied");
      footerCopyButton.dataset.copyState = "copied";
    } catch (_error) {
      scrambleFooterCopyButtonLabel("copy failed");
      footerCopyButton.dataset.copyState = "error";
    }

    footerCopyResetTimer = window.setTimeout(() => {
      scrambleFooterCopyButtonLabel("copy email");
      footerCopyButton.dataset.copyState = "idle";
      footerCopyResetTimer = 0;
    }, FOOTER_COPY_RESET_MS);
  });
}

function parkWorkOwlSceneAtStart() {
  if (
    !(workOwlLayer instanceof HTMLElement) ||
    !(workOwlCanvas instanceof HTMLCanvasElement)
  ) {
    return;
  }

  gsap.set(workOwlLayer, {
    x: getWorkOwlSceneStartX(),
    autoAlpha: 0,
    force3D: true,
  });
  delete workOwlLayer.dataset.workOwlVisible;
}

function clearWorkOwlCanvas() {
  if (!(workOwlCanvas instanceof HTMLCanvasElement) || workOwlCtx === null) return;

  workOwlCtx.setTransform(1, 0, 0, 1, 0, 0);
  workOwlCtx.clearRect(0, 0, workOwlCanvas.width, workOwlCanvas.height);
  workOwlRenderState.temporalReady = false;
  safariWorkOwlRasterCache.currentIndex = -1;
}

function updateWorkOwlCanvasSize() {
  if (
    !(workOwlCanvas instanceof HTMLCanvasElement) ||
    workOwlCtx === null ||
    introOwlState.cols === 0 ||
    introOwlState.rows === 0 ||
    workOwlCanvas.clientWidth === 0 ||
    workOwlCanvas.clientHeight === 0
  ) {
    return;
  }

  workOwlRenderState.dpr = Math.min(
    window.devicePixelRatio || 1,
    WORK_OWL_MAX_DPR,
  );
  const width = Math.max(
    1,
    Math.round(workOwlCanvas.clientWidth * workOwlRenderState.dpr),
  );
  const height = Math.max(
    1,
    Math.round(workOwlCanvas.clientHeight * workOwlRenderState.dpr),
  );

  if (workOwlCanvas.width !== width || workOwlCanvas.height !== height) {
    workOwlCanvas.width = width;
    workOwlCanvas.height = height;
  }

  workOwlRenderState.canvasWidth = workOwlCanvas.clientWidth;
  workOwlRenderState.canvasHeight = workOwlCanvas.clientHeight;
  workOwlCtx.setTransform(
    workOwlRenderState.dpr,
    0,
    0,
    workOwlRenderState.dpr,
    0,
    0,
  );

  const fitCellSize = Math.max(
    1 / workOwlRenderState.dpr,
    Math.floor(
      Math.min(
        workOwlRenderState.canvasWidth / introOwlState.cols,
        workOwlRenderState.canvasHeight / introOwlState.rows,
      ) * workOwlRenderState.dpr,
    ) / workOwlRenderState.dpr,
  );
  const snappedCellSize = Math.max(
    1 / workOwlRenderState.dpr,
    Math.round(fitCellSize * INTRO_OWL_DRAW_SCALE * workOwlRenderState.dpr) /
      workOwlRenderState.dpr,
  );

  workOwlRenderState.cellWidth = snappedCellSize;
  workOwlRenderState.cellHeight = snappedCellSize;
  workOwlRenderState.drawWidth = workOwlRenderState.cellWidth * introOwlState.cols;
  workOwlRenderState.drawHeight = workOwlRenderState.cellHeight * introOwlState.rows;
  workOwlRenderState.offsetX = Math.round(
    ((workOwlRenderState.canvasWidth - workOwlRenderState.drawWidth) / 2) *
      workOwlRenderState.dpr,
  ) / workOwlRenderState.dpr;
  workOwlRenderState.offsetY = Math.round(
    ((workOwlRenderState.canvasHeight - workOwlRenderState.drawHeight) / 2) *
      workOwlRenderState.dpr,
  ) / workOwlRenderState.dpr;

  const availableWidth = Math.max(
    1,
    workOwlRenderState.cellWidth -
      workOwlRenderState.cellWidth * INTRO_OWL_CELL_PADDING_RATIO * 2,
  );
  const targetFontSize = Math.max(
    6,
    Math.floor(workOwlRenderState.cellHeight * INTRO_OWL_FONT_SIZE_MULTIPLIER),
  );
  const testFont =
    `${INTRO_OWL_FONT_WEIGHT} ${targetFontSize}px ${workOwlRenderState.fontFamily}`;
  const measuredWidth = measureAverageGlyphWidth("0000000000", testFont);
  const fittedFontSize = measuredWidth > availableWidth
    ? Math.floor(targetFontSize * (availableWidth / measuredWidth))
    : targetFontSize;

  workOwlRenderState.fontSize = Math.max(5, fittedFontSize);
  workOwlRenderState.activeFont =
    `${INTRO_OWL_FONT_WEIGHT} ${workOwlRenderState.fontSize}px ${workOwlRenderState.fontFamily}`;

  const layoutCacheKey = [
    workOwlRenderState.canvasWidth,
    workOwlRenderState.canvasHeight,
    workOwlRenderState.cellWidth,
    workOwlRenderState.cellHeight,
    workOwlRenderState.offsetX,
    workOwlRenderState.offsetY,
    workOwlRenderState.drawWidth,
    workOwlRenderState.drawHeight,
    workOwlRenderState.activeFont,
  ].join("|");

  if (workOwlRenderState.layoutCacheKey !== layoutCacheKey) {
    clearOwlRasterCache(safariWorkOwlRasterCache);
    workOwlRenderState.glyphCellCache.clear();
    workOwlRenderState.clipMaskCache.clear();
    workOwlRenderState.temporalReady = false;
    workOwlRenderState.rendered = false;
    workOwlRenderState.currentFrameBucket = -1;
    workOwlRenderState.layoutCacheKey = layoutCacheKey;
  }
  ensureOwlGlyphAtlas(workOwlGlyphAtlasState, workOwlRenderState);
}

function ensureWorkOwlRenderLayers() {
  if (!(workOwlCanvas instanceof HTMLCanvasElement)) return false;

  if (workOwlRenderState.renderCanvas === null) {
    workOwlRenderState.renderCanvas = document.createElement("canvas");
    workOwlRenderState.renderCtx = workOwlRenderState.renderCanvas.getContext("2d");
  }

  if (workOwlRenderState.temporalCanvas === null) {
    workOwlRenderState.temporalCanvas = document.createElement("canvas");
    workOwlRenderState.temporalCtx =
      workOwlRenderState.temporalCanvas.getContext("2d");
  }

  if (
    workOwlRenderState.renderCtx === null ||
    workOwlRenderState.temporalCtx === null
  ) {
    return false;
  }

  if (
    workOwlRenderState.renderCanvas.width !== workOwlCanvas.width ||
    workOwlRenderState.renderCanvas.height !== workOwlCanvas.height
  ) {
    workOwlRenderState.renderCanvas.width = workOwlCanvas.width;
    workOwlRenderState.renderCanvas.height = workOwlCanvas.height;
  }

  if (
    workOwlRenderState.temporalCanvas.width !== workOwlCanvas.width ||
    workOwlRenderState.temporalCanvas.height !== workOwlCanvas.height
  ) {
    workOwlRenderState.temporalCanvas.width = workOwlCanvas.width;
    workOwlRenderState.temporalCanvas.height = workOwlCanvas.height;
    workOwlRenderState.temporalReady = false;
  }

  return true;
}

function getWorkOwlToneGlyph(column, row, ink) {
  const familyIndex = Math.min(
    GLYPH_FAMILIES.length - 1,
    Math.floor(clamp(ink, 0, 0.9999) * GLYPH_FAMILIES.length),
  );
  const family = GLYPH_FAMILIES[familyIndex];
  const scrambleBucket = Math.floor(
    workOwlRenderState.scrambleTime /
      (SCRAMBLE_INTERVAL + ((column * 5 + row * 7) % 4) * 0.009),
  );
  const hash = getIntroOwlHash(
    column,
    row,
    familyIndex * 101 + scrambleBucket * 307,
  );

  return family[hash % family.length];
}

function getWorkOwlCameraStyleCells(framePosition, cacheKey) {
  const cached = workOwlRenderState.glyphCellCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const layers = getIntroOwlFrameLayers(framePosition);
  const cells = [];

  for (let row = 0; row < introOwlState.rows; row += 1) {
    for (let column = 0; column < introOwlState.cols; column += 1) {
      const index = row * introOwlState.cols + column;
      const maskAlpha = getIntroOwlSoftMaskAlpha(layers, column, row);
      if (maskAlpha <= 0.012) continue;

      const luma = getIntroOwlBlendedLayerValue(layers.luma, layers.frameMix, index);
      const sourceEdge = getIntroOwlBlendedLayerValue(layers.edge, layers.frameMix, index);
      const darkness = 1 - luma;
      let neighborDarkness = 0;
      let neighborCount = 0;
      let minMask = maskAlpha;
      let maxDarkness = darkness;
      let minDarkness = darkness;

      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        const sampleRow = row + rowOffset;
        if (sampleRow < 0 || sampleRow >= introOwlState.rows) continue;

        for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
          const sampleColumn = column + columnOffset;
          if (
            (rowOffset === 0 && columnOffset === 0) ||
            sampleColumn < 0 ||
            sampleColumn >= introOwlState.cols
          ) {
            continue;
          }

          const sampleIndex = sampleRow * introOwlState.cols + sampleColumn;
          const sampleLuma = getIntroOwlBlendedLayerValue(
            layers.luma,
            layers.frameMix,
            sampleIndex,
          );
          const sampleDarkness = 1 - sampleLuma;
          neighborDarkness += sampleDarkness;
          neighborCount += 1;
          minDarkness = Math.min(minDarkness, sampleDarkness);
          maxDarkness = Math.max(maxDarkness, sampleDarkness);
          minMask = Math.min(
            minMask,
            getIntroOwlSoftMaskAlpha(layers, sampleColumn, sampleRow),
          );
        }
      }

      const averageDarkness = neighborCount > 0
        ? neighborDarkness / neighborCount
        : darkness;
      const localContrast = clamp(
        Math.abs(darkness - averageDarkness) + (maxDarkness - minDarkness) * 0.22,
        0,
        1,
      );
      const featherEdge = smoothstep(
        0.025,
        0.7,
        sourceEdge * 0.78 + localContrast * 0.7,
      );
      const boundary = smoothstep(0.04, 0.82, maskAlpha - minMask);
      const fill = smoothstep(0.018, 0.84, darkness);
      const ink = clamp(fill * 0.84 + featherEdge * 0.2 + boundary * 0.08, 0, 1);
      const alpha = clamp(
        maskAlpha * (
          0.28 +
          fill * 0.55 +
          featherEdge * 0.26 +
          boundary * 0.14
        ),
        0,
        0.94,
      );

      if (alpha <= 0.015) continue;

      const depth = clamp(
        fill * 0.7 + featherEdge * 0.22 + boundary * 0.08,
        0,
        1,
      );
      const color = depth < 0.58
        ? mixIntroOwlColor(
          INTRO_OWL_BLUE_LIGHT,
          INTRO_OWL_BLUE_MID,
          depth / 0.58,
        )
        : mixIntroOwlColor(
          INTRO_OWL_BLUE_MID,
          INTRO_OWL_BLUE_DARK,
          (depth - 0.58) / 0.42,
        );

      cells.push({
        column,
        row,
        ink,
        alpha,
        tone: depth,
        fillStyle: `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`,
        x: workOwlRenderState.offsetX +
          (column + 0.5) * workOwlRenderState.cellWidth,
        y: workOwlRenderState.offsetY +
          (row + 0.5) * workOwlRenderState.cellHeight,
      });
    }
  }

  workOwlRenderState.glyphCellCache.set(cacheKey, cells);
  trimIntroOwlCache(workOwlRenderState.glyphCellCache, INTRO_OWL_GLYPH_CACHE_LIMIT);

  return cells;
}

function getWorkOwlInterpolatedClipMask(layers, cacheKey) {
  const cached = workOwlRenderState.clipMaskCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = introOwlState.cols;
  maskCanvas.height = introOwlState.rows;
  const maskCtx = maskCanvas.getContext("2d");
  if (maskCtx === null) return null;

  const imageData = maskCtx.createImageData(introOwlState.cols, introOwlState.rows);

  for (let index = 0; index < introOwlState.frameSize; index += 1) {
    const dataIndex = index * 4;
    const alpha = getIntroOwlBlendedLayerValue(layers.mask, layers.frameMix, index);
    imageData.data[dataIndex] = 255;
    imageData.data[dataIndex + 1] = 255;
    imageData.data[dataIndex + 2] = 255;
    imageData.data[dataIndex + 3] = Math.round(smoothstep(0.015, 0.88, alpha) * 255);
  }

  maskCtx.putImageData(imageData, 0, 0);
  workOwlRenderState.clipMaskCache.set(cacheKey, maskCanvas);
  trimIntroOwlCache(workOwlRenderState.clipMaskCache, INTRO_OWL_CLIP_MASK_CACHE_LIMIT);

  return maskCanvas;
}

function renderWorkOwlFrame(framePosition = workOwlRenderState.currentFramePosition) {
  if (
    !(workOwlCanvas instanceof HTMLCanvasElement) ||
    workOwlCtx === null ||
    introOwlState.luma === null ||
    introOwlState.edge === null ||
    introOwlState.mask === null ||
    introOwlState.frameSize === 0 ||
    introOwlState.frameCount === 0
  ) {
    return;
  }

  updateWorkOwlCanvasSize();

  if (
    workOwlRenderState.canvasWidth === 0 ||
    workOwlRenderState.canvasHeight === 0
  ) {
    return;
  }

  const clampedFramePosition = clamp(
    framePosition,
    0,
    Math.max(0, introOwlState.frameCount - 1),
  );
  const frameBucket = Math.round(
    clampedFramePosition * INTRO_OWL_FRAME_BLEND_PRECISION,
  );
  const layers = getIntroOwlFrameLayers(clampedFramePosition);

  if (!ensureWorkOwlRenderLayers()) return;

  const renderCtx = workOwlRenderState.renderCtx;
  const renderCanvas = workOwlRenderState.renderCanvas;

  renderCtx.setTransform(1, 0, 0, 1, 0, 0);
  renderCtx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
  renderCtx.save();
  renderCtx.setTransform(
    workOwlRenderState.dpr,
    0,
    0,
    workOwlRenderState.dpr,
    0,
    0,
  );
  renderCtx.font = workOwlRenderState.activeFont;
  renderCtx.textAlign = "center";
  renderCtx.textBaseline = "middle";

  if (
    workOwlRenderState.temporalReady &&
    workOwlRenderState.temporalCanvas !== null
  ) {
    renderCtx.save();
    renderCtx.globalAlpha = INTRO_OWL_TEMPORAL_BLEND_ALPHA;
    renderCtx.setTransform(1, 0, 0, 1, 0, 0);
    renderCtx.drawImage(workOwlRenderState.temporalCanvas, 0, 0);
    renderCtx.restore();
  }

  const glyphCells = getWorkOwlCameraStyleCells(
    clampedFramePosition,
    frameBucket,
  );
  const useGlyphAtlas =
    IS_SAFARI_BROWSER &&
    ensureOwlGlyphAtlas(workOwlGlyphAtlasState, workOwlRenderState);
  if (useGlyphAtlas) {
    renderCtx.imageSmoothingEnabled = false;
  }

  for (const glyphCell of glyphCells) {
    const glyph = getWorkOwlToneGlyph(
      glyphCell.column,
      glyphCell.row,
      glyphCell.ink,
    );
    if (
      !useGlyphAtlas ||
      !drawOwlGlyphFromAtlas(
        workOwlGlyphAtlasState,
        renderCtx,
        glyphCell,
        glyph,
      )
    ) {
      renderCtx.fillStyle = glyphCell.fillStyle;
      renderCtx.fillText(glyph, glyphCell.x, glyphCell.y);
    }
  }

  renderCtx.restore();

  const clipLeft = clamp(workOwlRenderState.offsetX, 0, workOwlRenderState.canvasWidth);
  const clipTop = clamp(workOwlRenderState.offsetY, 0, workOwlRenderState.canvasHeight);
  const clipRight = clamp(
    workOwlRenderState.offsetX + workOwlRenderState.drawWidth,
    0,
    workOwlRenderState.canvasWidth,
  );
  const clipBottom = clamp(
    workOwlRenderState.offsetY + workOwlRenderState.drawHeight,
    0,
    workOwlRenderState.canvasHeight,
  );

  renderCtx.save();
  renderCtx.setTransform(
    workOwlRenderState.dpr,
    0,
    0,
    workOwlRenderState.dpr,
    0,
    0,
  );
  renderCtx.clearRect(0, 0, workOwlRenderState.canvasWidth, clipTop);
  renderCtx.clearRect(
    0,
    clipBottom,
    workOwlRenderState.canvasWidth,
    workOwlRenderState.canvasHeight - clipBottom,
  );
  renderCtx.clearRect(0, clipTop, clipLeft, clipBottom - clipTop);
  renderCtx.clearRect(
    clipRight,
    clipTop,
    workOwlRenderState.canvasWidth - clipRight,
    clipBottom - clipTop,
  );
  renderCtx.restore();

  const clipMaskCanvas = getWorkOwlInterpolatedClipMask(layers, frameBucket);

  if (clipMaskCanvas !== null) {
    renderCtx.save();
    renderCtx.globalCompositeOperation = "destination-in";
    renderCtx.setTransform(
      workOwlRenderState.dpr,
      0,
      0,
      workOwlRenderState.dpr,
      0,
      0,
    );
    renderCtx.imageSmoothingEnabled = true;
    renderCtx.drawImage(
      clipMaskCanvas,
      workOwlRenderState.offsetX,
      workOwlRenderState.offsetY,
      workOwlRenderState.drawWidth,
      workOwlRenderState.drawHeight,
    );
    renderCtx.restore();
  }

  if (
    workOwlRenderState.temporalCtx !== null &&
    workOwlRenderState.temporalCanvas !== null
  ) {
    workOwlRenderState.temporalCtx.setTransform(1, 0, 0, 1, 0, 0);
    workOwlRenderState.temporalCtx.clearRect(
      0,
      0,
      workOwlRenderState.temporalCanvas.width,
      workOwlRenderState.temporalCanvas.height,
    );
    workOwlRenderState.temporalCtx.drawImage(renderCanvas, 0, 0);
    workOwlRenderState.temporalReady = true;
  }

  workOwlCtx.save();
  workOwlCtx.setTransform(1, 0, 0, 1, 0, 0);
  workOwlCtx.clearRect(0, 0, workOwlCanvas.width, workOwlCanvas.height);
  workOwlCtx.drawImage(renderCanvas, 0, 0);
  workOwlCtx.restore();
  workOwlRenderState.currentFramePosition = clampedFramePosition;
  workOwlRenderState.currentFrameBucket = frameBucket;
  workOwlRenderState.rendered = true;
}

async function buildSafariOwlRasterCache({
  cache,
  frameTotal,
  targetCanvas,
  targetCtx,
  renderState,
  updateLayout,
  renderFrame,
}) {
  if (
    !IS_SAFARI_BROWSER ||
    !isIntroOwlDataReady() ||
    !(targetCanvas instanceof HTMLCanvasElement) ||
    targetCtx === null
  ) {
    return;
  }

  updateLayout();
  if (
    targetCanvas.width === 0 ||
    targetCanvas.height === 0 ||
    renderState.layoutCacheKey === ""
  ) {
    return;
  }

  clearOwlRasterCache(cache);
  const originalFramePosition = renderState.currentFramePosition;
  const sourceFrameCount = getIntroOwlLoopFrameCount();
  const rasterCount = Math.min(frameTotal, sourceFrameCount);
  renderState.temporalReady = false;

  for (let index = 0; index < rasterCount; index += 1) {
    const framePosition = rasterCount <= 1
      ? 0
      : (index / (rasterCount - 1)) * (sourceFrameCount - 1);
    renderState.scrambleTime = index * (SCRAMBLE_INTERVAL + 0.001);
    renderFrame(framePosition);
    cache.frames.push(cloneCanvasRaster(targetCanvas));

    // WebKit performs the expensive Canvas 2D text upload here. Yielding one
    // paint between snapshots keeps startup responsive and ensures the first
    // user scroll only performs cheap drawImage calls.
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
  }

  cache.layoutCacheKey = renderState.layoutCacheKey;
  cache.ready = cache.frames.length > 0;
  cache.currentIndex = -1;
  drawCachedOwlRaster({
    cache,
    targetCanvas,
    targetCtx,
    renderState,
    framePosition: originalFramePosition,
    frameCount: sourceFrameCount,
  });
}

async function prewarmSafariOwlRasterCaches() {
  if (!IS_SAFARI_BROWSER || !isIntroOwlDataReady()) return;

  await buildSafariOwlRasterCache({
    cache: safariIntroOwlRasterCache,
    frameTotal: SAFARI_INTRO_OWL_RASTER_FRAME_COUNT,
    targetCanvas: introOwlCanvas,
    targetCtx: introOwlCtx,
    renderState: introOwlState,
    updateLayout: updateIntroOwlLayout,
    renderFrame: renderIntroOwl,
  });

  await buildSafariOwlRasterCache({
    cache: safariWorkOwlRasterCache,
    frameTotal: SAFARI_WORK_OWL_RASTER_FRAME_COUNT,
    targetCanvas: workOwlCanvas,
    targetCtx: workOwlCtx,
    renderState: workOwlRenderState,
    updateLayout: updateWorkOwlCanvasSize,
    renderFrame: renderWorkOwlFrame,
  });
}

function setupWorkOwlRenderLoop() {
  if (!(workOwlCanvas instanceof HTMLCanvasElement)) return;

  workOwlRenderTick = (time) => {
    if (
      !workOwlSceneRendering ||
      document.hidden ||
      introOwlState.mask === null
    ) {
      return;
    }

    // Keep the last footer owl raster composited during a fast Safari scroll;
    // resume its internal frame animation as soon as scrolling settles.
    const minimumFrameInterval = 1 / WORK_OWL_TARGET_FPS;
    if (time - workOwlLastRenderTime < minimumFrameInterval) return;

    const frameCount = getIntroOwlLoopFrameCount();
    const loopDuration = getIntroOwlLoopDuration(frameCount);

    if (workOwlLoopStartTime === null) {
      const startFramePosition = workOwlRenderState.rendered
        ? workOwlRenderState.currentFramePosition
        : getWorkOwlInitialFramePosition();
      workOwlLoopStartTime = getWorkOwlLoopStartTime(
        time,
        startFramePosition,
        frameCount,
        loopDuration,
      );
    }

    const loopProgress =
      ((time - workOwlLoopStartTime) % loopDuration) /
      loopDuration;
    const framePosition = loopProgress * Math.max(0, frameCount - 1);
    if (drawCachedOwlRaster({
      cache: safariWorkOwlRasterCache,
      targetCanvas: workOwlCanvas,
      targetCtx: workOwlCtx,
      renderState: workOwlRenderState,
      framePosition,
      frameCount,
    })) {
      workOwlLastRenderTime = time;
      return;
    }
    const frameBucket = Math.round(
      framePosition * INTRO_OWL_FRAME_BLEND_PRECISION,
    );
    const scrambleBucket = workScrollFast && workOwlRenderState.currentScrambleBucket >= 0
      ? workOwlRenderState.currentScrambleBucket
      : Math.floor(time / SCRAMBLE_INTERVAL);

    if (
      frameBucket === workOwlRenderState.currentFrameBucket &&
      scrambleBucket === workOwlRenderState.currentScrambleBucket &&
      workOwlRenderState.rendered
    ) {
      return;
    }

    workOwlLastRenderTime = time;
    workOwlRenderState.scrambleTime = time;
    workOwlRenderState.currentScrambleBucket = scrambleBucket;
    renderWorkOwlFrame(framePosition);
  };
}

function applyWorkOwlSceneProgress(progress) {
  workOwlSceneProgress = clamp(progress, 0, 1);

  if (
    !workOwlSceneActive ||
    !(workOwlLayer instanceof HTMLElement) ||
    !(workOwlCanvas instanceof HTMLCanvasElement)
  ) {
    return;
  }

  const easedProgress = easeOutCubic(workOwlSceneProgress);
  const x = lerp(getWorkOwlSceneStartX(), 0, easedProgress);
  const alpha = introOwlState.mask === null
    ? 0
    : smoothstep(0.02, 0.24, workOwlSceneProgress);
  const shouldShow = alpha > 0.001 && workOwlRenderState.rendered;

  if (shouldShow) {
    workOwlLayer.dataset.workOwlVisible = "true";
  }

  gsap.set(workOwlLayer, {
    x,
    autoAlpha: shouldShow ? alpha : 0,
    force3D: true,
  });

  if (!shouldShow) {
    delete workOwlLayer.dataset.workOwlVisible;
  }
}

function setWorkOwlSceneLanded(isLanded) {
  if (!(workOwlLayer instanceof HTMLElement)) return;

  if (!isLanded && workOwlSceneParkHandle !== null) {
    window.cancelAnimationFrame(workOwlSceneParkHandle);
    workOwlSceneParkHandle = null;
  }

  if (!isLanded) {
    workOwlSceneHasLanded = false;
    delete workOwlLayer.dataset.workOwlHasEntered;
  }

  workOwlLayer.classList.toggle("is-landed", isLanded);
}

function markWorkOwlSceneLanded() {
  if (!(workOwlLayer instanceof HTMLElement)) return;

  workOwlSceneHasEntered = true;
  workOwlSceneHasLanded = true;
  workOwlLayer.dataset.workOwlHasEntered = "true";
}

function scheduleWorkOwlSceneLanded() {
  if (!(workOwlLayer instanceof HTMLElement)) return;

  if (workOwlSceneParkHandle !== null) {
    window.cancelAnimationFrame(workOwlSceneParkHandle);
  }

  workOwlSceneParkHandle = window.requestAnimationFrame(() => {
    workOwlSceneParkHandle = null;

    if (
      workOwlSceneActive &&
      workOwlSceneHasLanded
    ) {
      setWorkOwlSceneLanded(true);
    }
  });
}

function playWorkOwlSceneEnter(reduceMotion = false) {
  if (!isIntroOwlDataReady()) {
    if (!workOwlSceneEnterPending) {
      workOwlSceneEnterPending = true;
      loadIntroOwlData()
        .then(() => {
          workOwlSceneEnterPending = false;

          if (
            document.body.dataset.currentPage === "work" &&
            workOwlScenePresenceScrollTrigger?.isActive &&
            !workOwlSceneHasEntered &&
            workOwlSceneEnterTween === null
          ) {
            playWorkOwlSceneEnter(reduceMotion);
          }
        })
        .catch((error) => {
          workOwlSceneEnterPending = false;
          console.error("Unable to load footer owl data.", error);
        });
    }

    return;
  }

  if (workOwlSceneEnterTween !== null) return;

  if (!workOwlSceneActive) {
    setWorkOwlSceneActive(true);
  }

  const hasEntered =
    workOwlSceneHasLanded ||
    workOwlLayer?.dataset.workOwlHasEntered === "true";

  if (reduceMotion || hasEntered) {
    markWorkOwlSceneLanded();
    setWorkOwlSceneActive(true, true);
    applyWorkOwlSceneProgress(1);
    scheduleWorkOwlSceneLanded();
    return;
  }

  setWorkOwlSceneLanded(false);
  workOwlSceneHasEntered = true;
  const motion = { progress: 0 };
  applyWorkOwlSceneProgress(0);

  workOwlSceneEnterTween = gsap.to(motion, {
    progress: 1,
    duration: WORK_OWL_SCENE_ENTER_DURATION,
    ease: "power3.out",
    overwrite: "auto",
    onUpdate() {
      applyWorkOwlSceneProgress(motion.progress);
    },
    onComplete() {
      workOwlSceneEnterTween = null;
      markWorkOwlSceneLanded();
      applyWorkOwlSceneProgress(1);
      scheduleWorkOwlSceneLanded();
    },
  });
}

function renderWorkOwlInitialFrameIfNeeded() {
  if (workOwlRenderState.rendered || introOwlState.mask === null) return;

  const framePosition =
    Number.isFinite(workOwlRenderState.currentFramePosition)
      ? workOwlRenderState.currentFramePosition
      : getWorkOwlInitialFramePosition();

  renderWorkOwlFrame(
    framePosition > 0 ? framePosition : getWorkOwlInitialFramePosition(),
  );
}

function setWorkOwlSceneActive(isActive, shouldRender = isActive) {
  if (
    !(workOwlLayer instanceof HTMLElement) ||
    !(workOwlCanvas instanceof HTMLCanvasElement)
  ) {
    return;
  }

  if (isActive) {
    const wasRendering = workOwlSceneRendering;
    const hasAlreadyEntered = workOwlLayer.dataset.workOwlHasEntered === "true";

    if (!hasAlreadyEntered && !workOwlSceneHasEntered) {
      parkWorkOwlSceneAtStart();
    }

    workOwlSceneActive = true;
    workOwlSceneRendering = shouldRender;
    updateWorkOwlCanvasSize();
    if (shouldRender && !wasRendering) {
      workOwlLoopStartTime = null;
      workOwlLastRenderTime = -Infinity;
      if (!workOwlRenderState.rendered) {
        workOwlRenderState.currentFramePosition = getWorkOwlInitialFramePosition();
        workOwlRenderState.currentFrameBucket = -1;
        workOwlRenderState.currentScrambleBucket = -1;
        workOwlRenderState.temporalReady = false;
      }
    }
    if (hasAlreadyEntered) {
      workOwlSceneProgress = 1;
    }
    renderWorkOwlInitialFrameIfNeeded();
    // ScrollTrigger calls this method repeatedly while scrolling. During the
    // authored entrance those calls may resume the canvas renderer, but they
    // must not overwrite the timeline's transform or visibility state.
    if (footerInteractionState !== "playing") {
      applyWorkOwlSceneProgress(workOwlSceneProgress);
    }
    return;
  }

  if (!workOwlSceneActive) return;

  workOwlSceneEnterTween?.kill();
  workOwlSceneEnterTween = null;
  workOwlSceneActive = false;
  workOwlSceneRendering = false;
  workOwlSceneProgress = 0;
  workOwlLoopStartTime = null;
  setWorkOwlSceneLanded(false);
  workOwlSceneHasEntered = false;
  parkWorkOwlSceneAtStart();
  clearWorkOwlCanvas();
  workOwlRenderState.rendered = false;
  workOwlRenderState.currentFramePosition = getWorkOwlInitialFramePosition();
  workOwlRenderState.currentFrameBucket = -1;
  workOwlRenderState.currentScrambleBucket = -1;
}

function setupWorkOwlScene() {
  workOwlScenePresenceScrollTrigger?.kill();
  workOwlSceneEnterTween?.kill();
  footerInteractionTimeline?.kill();
  workOwlScenePresenceScrollTrigger = null;
  workOwlSceneEnterTween = null;
  footerInteractionTimeline = null;
  footerInteractionTimelinePrepared = false;
  setFooterInteractionState("idle");
  workOwlSceneActive = false;
  workOwlSceneRendering = false;
  workOwlSceneHasEntered = false;
  workOwlSceneHasLanded = false;
  workOwlSceneProgress = 0;
  workOwlSceneEnterPending = false;
  syncFooterFromScroll = null;
  workOwlSceneEntryY = Number.POSITIVE_INFINITY;
  setWorkOwlSceneLanded(false);
  setupFooterCopyEmail();

  if (
    !(workOwlScene instanceof HTMLElement) ||
    !(workOwlLayer instanceof HTMLElement) ||
    !(workOwlCanvas instanceof HTMLCanvasElement)
  ) {
    return;
  }

  parkWorkOwlSceneAtStart();
  clearWorkOwlCanvas();
  workOwlRenderState.rendered = false;
  workOwlRenderState.currentFramePosition = getWorkOwlInitialFramePosition();
  workOwlRenderState.currentFrameBucket = -1;
  workOwlRenderState.currentScrambleBucket = -1;

  resetFooterInteraction();

  const updateWorkOwlSceneEntryY = () => {
    workOwlSceneEntryY = Math.max(
      0,
      workOwlScene.offsetTop - window.innerHeight * 0.5,
    );
  };

  updateWorkOwlSceneEntryY();

  const reconcileFooterInteraction = () => {
    if (document.body.dataset.currentPage !== "work") return;
    if (window.scrollY < workOwlSceneEntryY) return;

    const bounds = workOwlScene.getBoundingClientRect();
    const hasReachedFooter = bounds.bottom > 0;
    if (!hasReachedFooter) return;

    if (footerInteractionState === "complete") {
      setWorkOwlSceneActive(true, true);
      return;
    }

    // A first fast arrival can occur while startup/intro state is finishing.
    // Every trigger callback retries this idempotent start, so that transient
    // frame cannot leave the footer permanently blank.
    playFooterInteraction();
  };

  syncFooterFromScroll = reconcileFooterInteraction;

  workOwlScenePresenceScrollTrigger = ScrollTrigger.create({
    trigger: workOwlScene,
    // Begin when the footer's centre line enters the viewport. Starting at
    // `top bottom` played the authored opening below the fold, so visitors
    // only encountered its final state.
    start: "top 50%",
    end: "bottom bottom",
    invalidateOnRefresh: true,
    onEnter: reconcileFooterInteraction,
    onEnterBack: reconcileFooterInteraction,
    onUpdate: reconcileFooterInteraction,
    onLeave() {
      // `bottom bottom` is the maximum scroll position. The sticky footer is
      // still visible here, so its time-based choreography must keep playing.
      reconcileFooterInteraction();
    },
    onLeaveBack() {
      if (document.body.dataset.currentPage !== "work") return;
      // The time-based one-shot keeps advancing offscreen. WebKit can report
      // a transient backward boundary while reconciling a sticky layer; that
      // must not snap a visible entrance straight to its final frame.
      suspendWorkRouteScene();
    },
    onRefresh(self) {
      if (document.body.dataset.currentPage !== "work") return;

      updateWorkOwlSceneEntryY();

      if (isFooterSceneVisible()) {
        reconcileFooterInteraction();
        return;
      }

      if (self.progress <= 0) {
        suspendWorkRouteScene();
      }
    },
  });
}

function getWorkWaveImageHeight(index, sizeFactor) {
  const shrinkStartIndex = Math.floor(WORK_WAVE_TOTAL_IMAGES * 0.75);
  const shrinkFactor = index >= shrinkStartIndex
    ? (index - shrinkStartIndex + 1) / (WORK_WAVE_TOTAL_IMAGES - shrinkStartIndex)
    : 0;

  return Math.round(
    WORK_WAVE_IMAGE_BASE_HEIGHT * sizeFactor * (1 - shrinkFactor * 0.5),
  );
}

function setWorkWaveStaticFrame() {
  workWaveImageItems.forEach((imageItem, index) => {
    const imageFrame = workWaveImageFrames[index];
    const image = workWaveImages[index];
    const metric = workWaveImageMetrics[index];
    if (!(imageFrame instanceof HTMLElement) || !(image instanceof HTMLImageElement)) return;

    const imageWidth = metric?.width ?? 0;
    const translateX =
      (workWaveViewportWidth - imageWidth) / 2 +
      workWaveViewportWidth * WORK_WAVE_RIGHT_SHIFT_RATIO;
    const frameTransform = `translate3d(${translateX}px, 0px, 0) scaleX(1)`;
    const previousState = workWaveImageRenderStates[index];
    if (
      previousState?.mode === "static" &&
      previousState.frameTransform === frameTransform
    ) {
      return;
    }

    imageFrame.style.transform = frameTransform;
    image.style.transform = "scaleX(1)";
    imageFrame.style.opacity = "1";
    imageFrame.style.visibility = "visible";
    imageFrame.classList.add("is-render-active");
    workWaveImageRenderStates[index] = {
      mode: "static",
      frameTransform,
      imageTransform: "scaleX(1)",
      isVisible: true,
    };
  });
}

function measureWorkWaveGalleryGeometry() {
  if (!(workWaveImagesContainer instanceof HTMLElement)) return;

  const scrollTop = window.scrollY;
  const containerRect = workWaveImagesContainer.getBoundingClientRect();
  workWaveContainerPosition = {
    top: containerRect.top + scrollTop,
    bottom: containerRect.bottom + scrollTop,
  };
  workWaveItemPositions = workWaveImageItems.map((item) => {
    const rect = item.getBoundingClientRect();
    return {
      top: rect.top + scrollTop,
      height: rect.height,
    };
  });
}

function updateWorkWaveImageSizes() {
  if (activePageId !== "work" || workWaveImageItems.length === 0) return;

  workWaveViewportWidth = window.innerWidth;
  workWaveViewportHeight = window.innerHeight;
  const sizeFactor = Math.min(workWaveViewportWidth / 750, 1);
  workWaveImageMetrics = [];

  workWaveImageItems.forEach((imageItem, index) => {
    const height = getWorkWaveImageHeight(index, sizeFactor);
    const sourceIndex = getWorkWaveSourceIndex(index);
    const [ratioWidth, ratioHeight] =
      WORK_WAVE_ASPECT_RATIOS[sourceIndex % WORK_WAVE_ASPECT_RATIOS.length]
        .split("/")
        .map(Number);
    const width = Math.round(height * ratioWidth / ratioHeight);

    imageItem.style.height = `${height}px`;
    workWaveImageMetrics[index] = { width, height };
  });

  measureWorkWaveGalleryGeometry();

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setWorkWaveStaticFrame();
  }
}

function updateWorkWaveImageFrame(
  imageFrame,
  image,
  normalizedIndex,
  progress,
  metric,
  forceVisible = false,
  renderIndex = -1,
) {
  const { base, flow, detail } = WORK_WAVE_CONFIG.waves;
  const viewportWidth = workWaveViewportWidth || window.innerWidth;
  const viewportHeight = workWaveViewportHeight || window.innerHeight;
  const imageWidth = metric?.width ?? 0;
  const imageHeight = metric?.height ?? 0;
  const previousState = workWaveImageRenderStates[renderIndex];

  if (
    previousState?.mode === "animated" &&
    previousState.progress === progress &&
    previousState.forceVisible === forceVisible &&
    previousState.viewportWidth === viewportWidth &&
    previousState.viewportHeight === viewportHeight &&
    previousState.imageWidth === imageWidth &&
    previousState.imageHeight === imageHeight
  ) {
    return;
  }

  const baseWave = Math.sin(
    normalizedIndex * base.freq + (1 - progress) * base.speed + base.phase,
  );
  const flowWave =
    0.5 +
    Math.sin(
      normalizedIndex * flow.freq + flow.phase + progress * flow.speed,
    );
  const detailWave =
    0.5 +
    Math.sin(
      normalizedIndex * detail.freq +
        detail.phase +
        progress * detail.speed,
    );
  const translateX =
    (viewportWidth - imageWidth) / 2 -
    viewportWidth * 0.1 +
    viewportWidth * WORK_WAVE_RIGHT_SHIFT_RATIO +
    (1 - progress) * viewportWidth * WORK_WAVE_START_RIGHT_OFFSET_RATIO +
    (0.5 - progress) * viewportWidth * WORK_WAVE_DIAGONAL_X_DRIFT_RATIO +
    baseWave * viewportWidth * base.amp +
    flowWave * viewportWidth * flow.amp +
    detailWave * viewportWidth * detail.amp;
  const translateY =
    (progress * 2 - 1) * (viewportHeight + imageHeight);
  const centerOffset = Math.abs(progress - 0.5) * 2;
  const clipAmount =
    Math.pow(centerOffset, WORK_WAVE_CONFIG.clipPower) * WORK_WAVE_CONFIG.clipMax;
  const cropScale = Math.max(0.55, 1 - clipAmount * 0.02);
  const isVisible = forceVisible || (progress > 0.001 && progress < 0.999);
  const frameTransform =
    `translate3d(${translateX}px, ${translateY}px, 0) scaleX(${cropScale})`;
  const imageTransform = `scaleX(${1 / cropScale})`;

  if (previousState?.frameTransform !== frameTransform) {
    imageFrame.style.transform = frameTransform;
  }
  if (previousState?.imageTransform !== imageTransform) {
    image.style.transform = imageTransform;
  }
  if (previousState?.isVisible !== isVisible) {
    imageFrame.style.opacity = isVisible ? "1" : "0";
    imageFrame.style.visibility = isVisible ? "visible" : "hidden";
    imageFrame.classList.toggle("is-render-active", isVisible);
  }

  workWaveImageRenderStates[renderIndex] = {
    mode: "animated",
    progress,
    forceVisible,
    viewportWidth,
    viewportHeight,
    imageWidth,
    imageHeight,
    frameTransform,
    imageTransform,
    isVisible,
  };
}

function syncWorkWaveGalleryToScroll(direction = 1, velocity = workScrollVelocity) {
  if (activePageId !== "work" || workWaveScrollTriggers.length === 0) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    setWorkWaveStaticFrame();
    return;
  }

  // Geometry is cached during refresh/resize. Scroll frames only perform
  // arithmetic and compositor writes, so Safari never pays for 13 live rect
  // reads while the gallery is moving.
  const viewportHeight = workWaveViewportHeight || window.innerHeight;
  const scrollTop = window.scrollY;
  const galleryVisible =
    workWaveContainerPosition.bottom > scrollTop &&
    workWaveContainerPosition.top < scrollTop + viewportHeight;
  let canonicalIndex = -1;
  let canonicalDistance = Number.POSITIVE_INFINITY;

  workWaveItemPositions.forEach((position, index) => {
    const rectTop = position.top - scrollTop;
    const progress = clamp(
      (viewportHeight - rectTop) /
        Math.max(1, viewportHeight + position.height),
      0,
      1,
    );
    workWaveImageProgress[index] = progress;

    const distance = Math.abs(
      rectTop + position.height * 0.5 - viewportHeight * 0.5,
    );
    if (distance < canonicalDistance) {
      canonicalDistance = distance;
      canonicalIndex = index;
    }
  });

  if (galleryVisible && canonicalIndex >= 0) {
    workWaveImageProgress[canonicalIndex] = clamp(
      workWaveImageProgress[canonicalIndex],
      0.002,
      0.998,
    );
  }

  workWaveImageFrames.forEach((imageFrame, index) => {
    const image = workWaveImages[index];
    if (!(imageFrame instanceof HTMLElement) || !(image instanceof HTMLImageElement)) return;

    updateWorkWaveImageFrame(
      imageFrame,
      image,
      index / (WORK_WAVE_TOTAL_IMAGES - 1),
      workWaveImageProgress[index],
      workWaveImageMetrics[index],
      galleryVisible && index === canonicalIndex,
      index,
    );
  });

  scheduleWorkWaveCaption(direction, velocity);
}

function setupWorkWaveCaption() {
  if (
    !(workWaveCaption instanceof HTMLElement) ||
    !(workWaveName instanceof HTMLElement)
  ) {
    return;
  }

  workWaveNameSlot ??= slotText(
    workWaveName,
    WORK_WAVE_NAMES[getWorkWaveSourceIndex(0)],
    {
      stagger: 14,
      duration: 320,
      bounce: 0.22,
      skipUnchanged: true,
    },
  );
}

function getWorkWaveCaptionTiming(index) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return { duration: 0, nameStagger: 0 };
  }

  const velocity = Math.abs(workWaveCaptionVelocity);
  const imageHeight =
    workWaveImageMetrics[index]?.height ?? WORK_WAVE_IMAGE_BASE_HEIGHT;
  const duration = velocity > 40
    ? Math.round(clamp((imageHeight / velocity) * 650, 120, 480))
    : 360;

  return {
    duration,
    nameStagger: Math.round(clamp(duration * 0.045, 6, 20)),
  };
}

function renderWorkWaveCaption() {
  workWaveCaptionPending = false;
  if (!(workWaveCaption instanceof HTMLElement)) return;
  if (activePageId !== "work") {
    workWaveCaption.classList.remove("is-visible");
    return;
  }

  let closestIndex = -1;
  let closestDistance = Infinity;

  workWaveImageProgress.forEach((progress, index) => {
    if (!Number.isFinite(progress) || progress <= 0.001 || progress >= 0.999) {
      return;
    }

    const distance = Math.abs(progress - 0.5);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  workWaveCaption.classList.toggle("is-visible", closestIndex >= 0);
  if (closestIndex < 0 || closestIndex === workWaveActiveIndex) return;

  workWaveActiveIndex = closestIndex;
  const direction = workWaveCaptionDirection >= 0 ? "up" : "down";
  const timing = getWorkWaveCaptionTiming(closestIndex);
  const sourceIndex = getWorkWaveSourceIndex(closestIndex);
  const name = WORK_WAVE_NAMES[sourceIndex] ?? "image";

  playGalleryPop();

  workWaveNameSlot?.set(name, {
    direction,
    duration: timing.duration,
    stagger: timing.nameStagger,
    interrupt: true,
  });
}

function scheduleWorkWaveCaption(direction, velocity) {
  workWaveCaptionDirection = direction || workWaveCaptionDirection;
  workWaveCaptionVelocity = velocity;
  workWaveCaptionPending = true;
}

function setupWorkWaveGallery() {
  if (!(workWaveImagesContainer instanceof HTMLElement)) return;

  workWaveScrollTriggers.forEach((trigger) => trigger.kill());
  workWaveScrollTriggers = [];
  workWaveImageItems = [];
  workWaveImageFrames = [];
  workWaveImages = [];
  workWaveImageMetrics = [];
  workWaveImageProgress = Array(WORK_WAVE_TOTAL_IMAGES).fill(0);
  workWaveImageRenderStates = Array(WORK_WAVE_TOTAL_IMAGES).fill(null);
  workWaveItemPositions = [];
  workWaveContainerPosition = { top: 0, bottom: 0 };
  workWaveActiveIndex = -1;
  workWaveImagesContainer.textContent = "";
  setupWorkWaveCaption();

  for (let index = 0; index < WORK_WAVE_TOTAL_IMAGES; index += 1) {
    const sourceIndex = getWorkWaveSourceIndex(index);
    const imageItem = document.createElement("div");
    imageItem.className = "work-wave-image";
    imageItem.style.aspectRatio = WORK_WAVE_ASPECT_RATIOS[sourceIndex];

    const imageFrame = document.createElement("div");
    imageFrame.className = "work-wave-image__frame";

    const image = document.createElement("img");
    image.src = `/work-wave/img${sourceIndex + 1}.webp`;
    image.alt = "";
    image.loading = "eager";
    image.decoding = "async";
    image.setAttribute("fetchpriority", "low");

    imageFrame.appendChild(image);
    imageItem.appendChild(imageFrame);
    workWaveImagesContainer.appendChild(imageItem);
    workWaveImageItems.push(imageItem);
    workWaveImageFrames.push(imageFrame);
    workWaveImages.push(image);
  }

  updateWorkWaveImageSizes();

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const galleryTrigger = ScrollTrigger.create({
    trigger: workWaveImagesContainer,
    start: "top bottom",
    end: "bottom top",
    invalidateOnRefresh: true,
    onUpdate: (self) => {
      if (activePageId !== "work") return;
      syncWorkWaveGalleryToScroll(self.direction, self.getVelocity());
    },
    onRefresh: (self) => {
      if (activePageId !== "work") return;
      updateWorkWaveImageSizes();
      syncWorkWaveGalleryToScroll(self.direction, self.getVelocity());
    },
    onLeave: () => syncWorkWaveGalleryToScroll(1, 0),
    onLeaveBack: () => syncWorkWaveGalleryToScroll(-1, 0),
  });
  workWaveScrollTriggers.push(galleryTrigger);

  if (!reduceMotion) {
    syncWorkWaveGalleryToScroll(1, 0);
  }
}

function createGlyphBurstState(canvas) {
  return {
    canvas,
    ctx: canvas instanceof HTMLCanvasElement ? canvas.getContext("2d") : null,
    timeline: null,
    glyphs: [],
    width: 0,
    height: 0,
    dpr: 1,
    maxDpr: CAPABILITY_GLYPH_BURST_MAX_DPR,
    originX: Number.NaN,
    originY: Number.NaN,
    coverageScale: 1,
    preserveTrailingCoverage: false,
    opacityScale: 1,
    coreOpacity: 1,
    outerOpacity: 1,
    originProvider: null,
  };
}

function buildGlyphBurst(state, origin = null) {
  if (
    !(state?.canvas instanceof HTMLCanvasElement) ||
    state.ctx === null
  ) {
    return false;
  }

  const bounds = state.canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));
  const dpr = Math.min(
    window.devicePixelRatio || 1,
    state.maxDpr,
  );
  const originX = Number.isFinite(origin?.x) ? origin.x : width * 0.5;
  const originY = Number.isFinite(origin?.y) ? origin.y : height * 0.5;

  if (
    state.width === width &&
    state.height === height &&
    state.dpr === dpr &&
    Math.abs(state.originX - originX) < 0.5 &&
    Math.abs(state.originY - originY) < 0.5 &&
    state.glyphs.length > 0
  ) {
    return true;
  }

  state.width = width;
  state.height = height;
  state.dpr = dpr;
  state.originX = originX;
  state.originY = originY;
  state.canvas.width = Math.round(width * dpr);
  state.canvas.height = Math.round(height * dpr);

  const cellSize = CAPABILITY_GLYPH_BURST_CELL_SIZE;
  const columns = Math.ceil(width / cellSize) + 1;
  const rows = Math.ceil(height / cellSize) + 1;
  state.glyphs = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = column * cellSize + cellSize * 0.5;
      const y = row * cellSize + cellSize * 0.5;
      const deltaX = x - originX;
      const deltaY = y - originY;
      const distance = Math.hypot(deltaX, deltaY);
      const seedIndex = row * columns + column;
      const characterIndex = Math.floor(
        getPageTransitionHash(seedIndex, 13, 431.9) *
        PAGE_TRANSITION_CHARACTERS.length,
      );

      state.glyphs.push({
        x,
        y,
        distance,
        directionX: distance > 0 ? deltaX / distance : 0,
        directionY: distance > 0 ? deltaY / distance : 0,
        scatterOffset: (
          getPageTransitionHash(seedIndex, 29, 347.5) - 0.5
        ) * cellSize * 1.3,
        visibilityRandom: getPageTransitionHash(seedIndex, 31, 563.3),
        glyph: PAGE_TRANSITION_CHARACTERS[
          clamp(characterIndex, 0, PAGE_TRANSITION_CHARACTERS.length - 1)
        ],
      });
    }
  }

  return true;
}

function isGlyphBurstPrepared(state, origin = null) {
  if (
    !(state?.canvas instanceof HTMLCanvasElement) ||
    state.ctx === null ||
    state.glyphs.length === 0
  ) {
    return false;
  }

  const bounds = state.canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));
  const dpr = Math.min(window.devicePixelRatio || 1, state.maxDpr);
  const originX = Number.isFinite(origin?.x) ? origin.x : width * 0.5;
  const originY = Number.isFinite(origin?.y) ? origin.y : height * 0.5;

  return (
    state.width === width &&
    state.height === height &&
    state.dpr === dpr &&
    Math.abs(state.originX - originX) < 0.5 &&
    Math.abs(state.originY - originY) < 0.5
  );
}

function clearGlyphBurst(state) {
  if (
    !(state?.canvas instanceof HTMLCanvasElement) ||
    state.ctx === null
  ) {
    return;
  }

  state.ctx.save();
  state.ctx.setTransform(1, 0, 0, 1, 0, 0);
  state.ctx.clearRect(
    0,
    0,
    state.canvas.width,
    state.canvas.height,
  );
  state.ctx.restore();
}

function renderGlyphBurst(state, progress) {
  if (
    state?.ctx === null ||
    state.glyphs.length === 0
  ) {
    return;
  }

  const liveOrigin = state.originProvider?.();

  const clampedProgress = clamp(progress, 0, 1);
  // A moving interaction origin must not overwrite the origin used to prove
  // that the reusable field is prepared. Doing so made the second project
  // hover fail `isGlyphBurstPrepared()` even though the canvas was valid.
  const originX = Number.isFinite(liveOrigin?.x)
    ? liveOrigin.x
    : state.originX;
  const originY = Number.isFinite(liveOrigin?.y)
    ? liveOrigin.y
    : state.originY;
  const cellSize = CAPABILITY_GLYPH_BURST_CELL_SIZE;
  const maxRadius = Math.max(
    Math.hypot(originX, originY),
    Math.hypot(state.width - originX, originY),
    Math.hypot(originX, state.height - originY),
    Math.hypot(state.width - originX, state.height - originY),
  ) * state.coverageScale + cellSize * 2;
  const expansion = 1 - Math.pow(1 - clampedProgress, 2.35);
  const frontRadius = expansion * maxRadius;
  const frontFeather = cellSize * CAPABILITY_GLYPH_BURST_FRONT_FEATHER_CELLS;
  const driftDistance = cellSize * CAPABILITY_GLYPH_BURST_DRIFT_CELLS;
  const innerProgress = state.preserveTrailingCoverage
    ? clamp(
      clampedProgress - CAPABILITY_GLYPH_BURST_INNER_DELAY * 1.35,
      0,
      1,
    )
    : clamp(
      (clampedProgress - CAPABILITY_GLYPH_BURST_INNER_DELAY) /
        (1 - CAPABILITY_GLYPH_BURST_INNER_DELAY),
      0,
      1,
    );
  const innerExpansion = 1 - Math.pow(1 - innerProgress, 2.35);
  const innerRadius = innerExpansion * maxRadius;
  const innerFeather = cellSize * CAPABILITY_GLYPH_BURST_INNER_FEATHER_CELLS;
  const innerPushDistance = cellSize * CAPABILITY_GLYPH_BURST_INNER_PUSH_CELLS;
  const fade = 1 - smoothstep(
    state.preserveTrailingCoverage ? 0.94 : 0.86,
    1,
    clampedProgress,
  );
  const fontSize = Math.round(cellSize * 0.74);

  state.ctx.save();
  state.ctx.setTransform(
    state.dpr,
    0,
    0,
    state.dpr,
    0,
    0,
  );
  state.ctx.clearRect(
    0,
    0,
    state.width,
    state.height,
  );
  state.ctx.font =
    `650 ${fontSize}px "SF Mono", Menlo, Monaco, Consolas, monospace`;
  state.ctx.textAlign = "center";
  state.ctx.textBaseline = "middle";
  state.ctx.fillStyle = "rgb(25, 67, 245)";

  const dynamicOrigin = typeof state.originProvider === "function";

  for (const glyph of state.glyphs) {
    const deltaX = dynamicOrigin ? glyph.x - originX : 0;
    const deltaY = dynamicOrigin ? glyph.y - originY : 0;
    const distance = dynamicOrigin ? Math.hypot(deltaX, deltaY) : glyph.distance;
    const directionX = dynamicOrigin && distance > 0
      ? deltaX / distance
      : glyph.directionX;
    const directionY = dynamicOrigin && distance > 0
      ? deltaY / distance
      : glyph.directionY;
    const distanceBehindFront = frontRadius - distance +
      glyph.scatterOffset;
    if (distanceBehindFront <= -frontFeather) continue;

    const localProgress = smoothstep(
      -frontFeather,
      frontFeather * 0.72,
      distanceBehindFront,
    );
    const density = clamp(localProgress * 1.48, 0, 1);
    if (glyph.visibilityRandom > density) continue;

    const innerVisibility = innerProgress > 0
      ? smoothstep(
        -innerFeather,
        innerFeather,
        distance - innerRadius + glyph.scatterOffset * 0.28,
      )
      : 1;
    if (innerVisibility <= 0.01) continue;

    const drift = (1 - localProgress) * driftDistance;
    const innerPush = (1 - innerVisibility) * innerPushDistance;
    const x = glyph.x - directionX * drift + directionX * innerPush;
    const y = glyph.y - directionY * drift + directionY * innerPush;

    const coreBlend = lerp(
      1,
      state.coreOpacity,
      smoothstep(0.3, 1, localProgress),
    );
    const outerBlend = lerp(
      state.outerOpacity,
      1,
      smoothstep(0.42, 0.92, localProgress),
    );
    state.ctx.globalAlpha = fade * innerVisibility *
      (0.34 + localProgress * 0.66) *
      state.opacityScale *
      coreBlend *
      outerBlend;
    state.ctx.fillText(
      glyph.glyph,
      Math.round(x * state.dpr) / state.dpr,
      Math.round(y * state.dpr) / state.dpr,
    );
  }

  state.ctx.globalAlpha = 1;
  state.ctx.restore();
}

function stopGlyphBurst(state) {
  if (state === null || state === undefined) return;

  state.timeline?.kill();
  state.timeline = null;
  clearGlyphBurst(state);

  if (state.canvas instanceof HTMLCanvasElement) {
    gsap.set(state.canvas, { autoAlpha: 0 });
  }
}

function playGlyphBurst(
  state,
  {
    duration = CAPABILITY_GLYPH_BURST_DURATION,
    origin = null,
    coverageScale = 1,
    preserveTrailingCoverage = false,
    opacityScale = 1,
    coreOpacity = 1,
    outerOpacity = 1,
    originProvider = null,
    maxDpr = CAPABILITY_GLYPH_BURST_MAX_DPR,
    onFinish = null,
  } = {},
) {
  state.coverageScale = coverageScale;
  state.preserveTrailingCoverage = preserveTrailingCoverage;
  state.opacityScale = opacityScale;
  state.coreOpacity = coreOpacity;
  state.outerOpacity = outerOpacity;
  state.originProvider = originProvider;
  state.maxDpr = maxDpr;

  const initialOrigin = originProvider?.() ?? origin;
  const preparationOrigin = typeof originProvider === "function"
    ? null
    : initialOrigin;

  // Never allocate a full-screen glyph field on a scroll callback. A cold
  // Safari visit can otherwise spend its first section frame building and
  // uploading thousands of glyphs while the underlying content is hidden.
  // The burst is decorative: if idle-time preparation missed its deadline,
  // skip it for this pass and keep the cards/footer responsive.
  if (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    !isGlyphBurstPrepared(state, preparationOrigin) ||
    !(state.canvas instanceof HTMLCanvasElement)
  ) {
    onFinish?.();
    return false;
  }

  state.timeline?.kill();
  clearGlyphBurst(state);

  const motion = { progress: 0 };
  let hasFinished = false;
  const finish = () => {
    if (hasFinished) return;
    hasFinished = true;
    state.timeline = null;
    clearGlyphBurst(state);
    gsap.set(state.canvas, { autoAlpha: 0 });
    onFinish?.();
  };

  state.timeline = gsap.timeline({
    defaults: { ease: "none" },
    onComplete: finish,
    onInterrupt: finish,
  });
  state.timeline
    .set(state.canvas, { autoAlpha: 1 }, 0)
    .to(motion, {
      progress: 1,
      duration,
      onUpdate() {
        renderGlyphBurst(state, motion.progress);
      },
    }, 0);

  return true;
}

function stopCapabilityGlyphBurst() {
  stopGlyphBurst(capabilityGlyphBurstState);
}

function playCapabilityGlyphBurst() {
  if (playGlyphBurst(capabilityGlyphBurstState)) {
    playGlyphSplash();
  }
}

function setupCapabilityCards() {
  if (
    !(capabilityCardsSection instanceof HTMLElement) ||
    capabilityCards.length !== 3 ||
    capabilityCardInners.length !== 3
  ) {
    return;
  }

  capabilityCardsMatchMedia?.revert();
  capabilityCardsMatchMedia = gsap.matchMedia();
  syncCapabilityCardsFromScroll = null;

  const highlightRevealStates = capabilityCardKeywords.map(() => false);
  const blueRunnerStates = capabilityCardKeywords.map(() => ({
    calls: [],
    isMoving: false,
    runners: [],
    targets: [],
    revealTweens: [],
  }));
  const runnerIndexes = [0, 1];

  const killBlueRunnerState = (cardIndex) => {
    const state = blueRunnerStates[cardIndex];
    if (!state) return;

    state.calls.forEach((call) => call?.kill?.());
    state.revealTweens.forEach((tween) => tween?.kill?.());
    state.runners.forEach((runner) => {
      gsap.killTweensOf(runner);
      runner.remove();
    });
    state.calls = [];
    state.isMoving = false;
    state.runners = [];
    state.targets = [];
    state.revealTweens = [];
  };

  const cleanupBlueRunners = () => {
    blueRunnerStates.forEach((_, cardIndex) => killBlueRunnerState(cardIndex));
  };

  const cleanupCapabilityCards = () => {
    document.body.classList.remove("capability-cards-active");
    cleanupBlueRunners();
    stopCapabilityGlyphBurst();
  };

  const setKeywordHighlightsHidden = (cardIndex) => {
    const keywords = capabilityCardKeywords[cardIndex] ?? [];
    if (keywords.length === 0) return;

    highlightRevealStates[cardIndex] = false;
    killBlueRunnerState(cardIndex);
    gsap.killTweensOf(keywords);
    gsap.set(keywords, {
      "--capability-highlight-alpha": 0,
      "--capability-highlight-scale-x": 0.76,
      "--capability-highlight-scale-y": 0.68,
      clearProps: "color",
      force3D: true,
    });
  };

  const setKeywordHighlightsFinal = (cardIndex, { withBlue = true } = {}) => {
    const keywords = capabilityCardKeywords[cardIndex] ?? [];
    if (keywords.length === 0) return;

    highlightRevealStates[cardIndex] = true;
    gsap.killTweensOf(keywords);
    gsap.set(keywords, {
      "--capability-highlight-alpha": 1,
      "--capability-highlight-scale-x": 1,
      "--capability-highlight-scale-y": 1,
      clearProps: "color",
      force3D: true,
    });

    if (withBlue) {
      startBlueRunners(cardIndex, { staticOnly: true });
    }
  };

  const setAllKeywordHighlightsHidden = () => {
    capabilityCardKeywords.forEach((_, cardIndex) => {
      setKeywordHighlightsHidden(cardIndex);
    });
  };

  const setAllKeywordHighlightsFinal = () => {
    capabilityCardKeywords.forEach((_, cardIndex) => {
      setKeywordHighlightsFinal(cardIndex);
    });
  };

  const getKeywordRunnerMetrics = (cardIndex, keyword) => {
    const field = capabilityCardKeywordFields[cardIndex];
    if (
      !(field instanceof HTMLElement) ||
      !(keyword instanceof HTMLElement)
    ) {
      return null;
    }

    const fieldRect = field.getBoundingClientRect();
    const keywordRect = keyword.getBoundingClientRect();

    return {
      x: keywordRect.left - fieldRect.left,
      y: keywordRect.top - fieldRect.top,
      width: Math.max(1, keywordRect.width + 1),
      height: Math.max(1, keywordRect.height),
      fieldWidth: Math.max(1, fieldRect.width),
      fieldHeight: Math.max(1, fieldRect.height),
    };
  };

  const chooseRunnerTarget = (cardIndex, runnerIndex) => {
    const keywords = capabilityCardKeywords[cardIndex] ?? [];
    const state = blueRunnerStates[cardIndex];
    const currentTarget = state?.targets?.[runnerIndex] ?? -1;
    const blockedTarget = state?.targets?.[runnerIndex === 0 ? 1 : 0] ?? -1;

    if (keywords.length <= 1) return 0;

    let nextTarget = currentTarget;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = Math.floor(Math.random() * keywords.length);
      if (candidate !== currentTarget && candidate !== blockedTarget) {
        nextTarget = candidate;
        break;
      }
    }

    if (nextTarget === currentTarget || nextTarget === blockedTarget) {
      nextTarget = (currentTarget + runnerIndex + 3) % keywords.length;
    }

    return nextTarget;
  };

  const moveBlueRunner = (
    cardIndex,
    runnerIndex,
    {
      immediate = false,
      tapVolume = CAPABILITY_HIGHLIGHT_INITIAL_TAP_VOLUME,
    } = {},
  ) => {
    const state = blueRunnerStates[cardIndex];
    const runner = state?.runners?.[runnerIndex];
    const keywords = capabilityCardKeywords[cardIndex] ?? [];
    if (!(runner instanceof HTMLElement) || keywords.length === 0) return;

    const copy = runner.querySelector(".capability-card__blue-copy");
    if (!(copy instanceof HTMLElement)) return;

    const targetIndex = chooseRunnerTarget(cardIndex, runnerIndex);
    const metrics = getKeywordRunnerMetrics(cardIndex, keywords[targetIndex]);
    if (metrics === null) return;

    const runnerVars = {
      x: metrics.x,
      y: metrics.y,
      width: metrics.width,
      height: metrics.height,
      autoAlpha: 1,
      scaleX: 1,
      scaleY: 1,
      overwrite: true,
      force3D: true,
    };
    const copyVars = {
      x: -metrics.x,
      y: -metrics.y,
      width: metrics.fieldWidth,
      height: metrics.fieldHeight,
      overwrite: true,
      force3D: true,
    };

    if (immediate) {
      state.targets[runnerIndex] = targetIndex;
      gsap.set(runner, runnerVars);
      gsap.set(copy, copyVars);
      return;
    }

    state.targets[runnerIndex] = targetIndex;

    const timeline = gsap.timeline({
      onStart: () => playCapabilityHighlightTap(tapVolume),
      onComplete: () => {
        state.calls[runnerIndex]?.kill?.();
        state.calls[runnerIndex] = gsap.delayedCall(
          1.15 + Math.random() * 1.55,
          () => moveBlueRunner(cardIndex, runnerIndex, {
            tapVolume: CAPABILITY_HIGHLIGHT_INITIAL_TAP_VOLUME,
          }),
        );
      },
    });

    timeline.to(runner, {
      ...runnerVars,
      duration: 0.48,
      ease: "back.out(1.34)",
    }, 0);
    timeline.to(copy, {
      ...copyVars,
      duration: 0.48,
      ease: "back.out(1.34)",
    }, 0);
  };

  const createBlueRunnerCopy = (keywords) => {
    const copy = document.createElement("span");
    copy.className = "capability-card__blue-copy";
    copy.setAttribute("aria-hidden", "true");

    keywords.forEach((keyword) => {
      const clone = keyword.cloneNode(true);
      clone.removeAttribute("data-capability-keyword");
      copy.append(clone);
    });

    return copy;
  };

  const startBlueRunnerMotion = (cardIndex) => {
    const state = blueRunnerStates[cardIndex];
    const keywords = capabilityCardKeywords[cardIndex] ?? [];
    if (!state || keywords.length === 0 || state.isMoving) return;

    if (state.runners.length === 0) {
      startBlueRunners(cardIndex, { staticOnly: true });
    }

    if (state.runners.length === 0) return;

    state.isMoving = true;
    runnerIndexes.forEach((_, runnerIndex) => {
      state.calls[runnerIndex]?.kill?.();
      state.calls[runnerIndex] = gsap.delayedCall(
        0.58
          + runnerIndex * 0.24
          + cardIndex * CAPABILITY_HIGHLIGHT_TAP_CARD_OFFSET,
        () => moveBlueRunner(cardIndex, runnerIndex, {
          tapVolume: CAPABILITY_HIGHLIGHT_INITIAL_TAP_VOLUME,
        }),
      );
    });
  };

  function startBlueRunners(cardIndex, { staticOnly = false } = {}) {
    const field = capabilityCardKeywordFields[cardIndex];
    const keywords = capabilityCardKeywords[cardIndex] ?? [];
    if (!(field instanceof HTMLElement) || keywords.length === 0) return;

    killBlueRunnerState(cardIndex);

    const occupiedTargets = new Set();
    runnerIndexes.forEach((_, runnerIndex) => {
      const runner = document.createElement("span");
      runner.className = "capability-card__blue-runner";
      runner.dataset.runnerIndex = String(runnerIndex);
      runner.setAttribute("aria-hidden", "true");
      runner.append(createBlueRunnerCopy(keywords));
      field.prepend(runner);
      blueRunnerStates[cardIndex].runners[runnerIndex] = runner;

      let initialTarget = Math.floor(Math.random() * keywords.length);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        if (!occupiedTargets.has(initialTarget)) break;
        initialTarget = Math.floor(Math.random() * keywords.length);
      }
      if (occupiedTargets.has(initialTarget)) {
        initialTarget = (runnerIndex * 4 + cardIndex + 1) % keywords.length;
      }
      occupiedTargets.add(initialTarget);
      blueRunnerStates[cardIndex].targets[runnerIndex] = initialTarget;

      const metrics = getKeywordRunnerMetrics(
        cardIndex,
        keywords[initialTarget],
      );

      if (metrics === null) {
        runner.remove();
        delete blueRunnerStates[cardIndex].runners[runnerIndex];
        return;
      }

      const copy = runner.querySelector(".capability-card__blue-copy");
      gsap.set(runner, {
        x: metrics.x,
        y: metrics.y,
        width: metrics.width,
        height: metrics.height,
        autoAlpha: 0,
        scaleX: 0.78,
        scaleY: 0.92,
        force3D: true,
      });
      if (copy instanceof HTMLElement) {
        gsap.set(copy, {
          x: -metrics.x,
          y: -metrics.y,
          width: metrics.fieldWidth,
          height: metrics.fieldHeight,
          force3D: true,
        });
      }
    });

    const visibleRunners = blueRunnerStates[cardIndex].runners.filter(
      (runner) => runner instanceof HTMLElement,
    );
    if (visibleRunners.length === 0) return;

    const revealTween = gsap.to(visibleRunners, {
      autoAlpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 0.28,
      ease: "back.out(1.22)",
      stagger: 0.07,
      overwrite: true,
      force3D: true,
    });
    blueRunnerStates[cardIndex].revealTweens.push(revealTween);

    if (staticOnly) return;
    startBlueRunnerMotion(cardIndex);
  }

  const revealKeywordHighlights = (cardIndex) => {
    const keywords = capabilityCardKeywords[cardIndex] ?? [];
    if (keywords.length === 0 || highlightRevealStates[cardIndex]) return;

    highlightRevealStates[cardIndex] = true;
    gsap.killTweensOf(keywords);
    gsap.to(keywords, {
      "--capability-highlight-alpha": 1,
      "--capability-highlight-scale-x": 1,
      "--capability-highlight-scale-y": 1,
      clearProps: "color",
      duration: 0.38,
      ease: "power3.out",
      stagger: {
        each: 0.026,
        from: "start",
      },
      overwrite: true,
      force3D: true,
    });
  };

  capabilityCardsMatchMedia.add(
    {
      animate: "(prefers-reduced-motion: no-preference)",
      static: "(prefers-reduced-motion: reduce)",
    },
    (context) => {
      if (context.conditions?.static) {
        stopCapabilityGlyphBurst();
        capabilityCardsAreAssembled = true;
        document.body.classList.add("capability-cards-assembled");
        gsap.set(capabilityCards, {
          clearProps: "transform,opacity,visibility",
        });
        gsap.set(capabilityCardInners, { rotationY: 180 });
        setAllKeywordHighlightsFinal();

        return cleanupCapabilityCards;
      }

      let previousCardsProgress = 0;
      let glyphBurstArmed = true;
      let glyphBurstPending = false;
      let renderedCardsProgress = Number.NaN;
      let cardHeights = capabilityCards.map((card) => card.offsetHeight);
      let cardsViewportHeight = window.innerHeight;

      const attemptCapabilityGlyphBurst = () => {
        if (!glyphBurstPending || !glyphBurstArmed) return;

        const sectionBounds = capabilityCardsSection.getBoundingClientRect();
        const sectionIsVisible =
          sectionBounds.bottom > 0 && sectionBounds.top < window.innerHeight;
        if (!sectionIsVisible) {
          glyphBurstPending = false;
          stopCapabilityGlyphBurst();
          return;
        }

        glyphBurstPending = false;
        glyphBurstArmed = false;
        playCapabilityGlyphBurst();
      };

      const refreshCardMetrics = () => {
        cardsViewportHeight = window.innerHeight;
        cardHeights = capabilityCards.map((card) => card.offsetHeight);
      };

      const updateCards = (progress, force = false) => {
        if (
          !force &&
          Number.isFinite(renderedCardsProgress) &&
          Math.abs(renderedCardsProgress - progress) < 0.00005
        ) {
          return;
        }
        renderedCardsProgress = progress;

        if (progress <= CAPABILITY_GLYPH_BURST_TRIGGER_PROGRESS - 0.055) {
          glyphBurstArmed = true;
          glyphBurstPending = false;
        } else if (
          glyphBurstArmed &&
          previousCardsProgress < CAPABILITY_GLYPH_BURST_TRIGGER_PROGRESS &&
          progress >= CAPABILITY_GLYPH_BURST_TRIGGER_PROGRESS
        ) {
          glyphBurstPending = true;
          attemptCapabilityGlyphBurst();
        }
        previousCardsProgress = progress;

        const wasAssembled = capabilityCardsAreAssembled;
        capabilityCardsAreAssembled = progress >= CAPABILITY_OWL_READY_PROGRESS;
        document.body.classList.toggle(
          "capability-cards-assembled",
          capabilityCardsAreAssembled,
        );
        if (!wasAssembled && capabilityCardsAreAssembled) {
          window.dispatchEvent(new CustomEvent("capabilityCardsAssembled"));
        }

        capabilityCards.forEach((card, index) => {
          const delay = index * 0.5;
          const cardProgress = clamp(
            (progress - delay * 0.1) / (0.9 - delay * 0.1),
            0,
            1,
          );

          let y = 0;
          let scale = 1;
          const cardHeight = cardHeights[index] ?? 0;
          const offscreenY = -(
            cardsViewportHeight * 0.5 +
            cardHeight * 0.125 +
            4
          );

          if (cardProgress < 0.4) {
            const arrivalProgress = smoothstep(0, 1, cardProgress / 0.4);
            y = lerp(offscreenY, cardHeight * 0.5, arrivalProgress);
            scale = lerp(0.25, 0.75, arrivalProgress);
          } else if (cardProgress < 0.6) {
            const settleProgress = smoothstep(
              0,
              1,
              (cardProgress - 0.4) / 0.2,
            );
            y = lerp(cardHeight * 0.5, 0, settleProgress);
            scale = lerp(0.75, 1, settleProgress);
          }

          const stackX = index === 0 ? 100 : index === 2 ? -100 : 0;
          const stackRotation = index === 0 ? -5 : index === 2 ? 5 : 0;
          const fanProgress = cardProgress < 0.6
            ? 0
            : smoothstep(0, 1, (cardProgress - 0.6) / 0.4);

          gsap.set(card, {
            xPercent: lerp(stackX, 0, fanProgress),
            y,
            yPercent: 0,
            rotation: lerp(stackRotation, 0, fanProgress),
            scale,
            autoAlpha: 1,
            force3D: true,
          });
          gsap.set(capabilityCardInners[index], {
            rotationY: fanProgress * 180,
            force3D: true,
          });

          if (fanProgress >= 0.08) {
            revealKeywordHighlights(index);
          } else if (!capabilityCardsAreAssembled && highlightRevealStates[index]) {
            setKeywordHighlightsHidden(index);
          }

          if (progress >= 0.88 && fanProgress >= 0.94) {
            startBlueRunnerMotion(index);
          }
        });

        if (progress >= 0.68) {
          capabilityCards.forEach((_, index) => {
            revealKeywordHighlights(index);
          });
        }

        if (progress >= 0.88) {
          capabilityCards.forEach((_, index) => startBlueRunnerMotion(index));
        }
      };

      setAllKeywordHighlightsHidden();
      updateCards(0);

      const cardsScrollTrigger = ScrollTrigger.create({
        trigger: capabilityCardsSection,
        start: "top top",
        end: "bottom bottom",
        // Lenis already smooths the scroll. A second one-second scrub can
        // leave the cards catching up after Safari has moved the sticky stage
        // out of view, so bind this choreography directly to scroll progress.
        scrub: true,
        invalidateOnRefresh: true,
        onUpdate: (self) => updateCards(self.progress),
        onEnter: (self) => {
          document.body.classList.add("capability-cards-active");
          updateCards(self.progress);
        },
        onEnterBack: (self) => {
          document.body.classList.add("capability-cards-active");
          updateCards(self.progress);
        },
        onLeave: () => {
          updateCards(1);
          // The section remains visible for one viewport after its sticky
          // range ends. Keep the blue runners, their audio, and compositor
          // hints alive until the cards themselves have cleared the viewport.
          if (glyphBurstPending) attemptCapabilityGlyphBurst();
        },
        onLeaveBack: () => {
          updateCards(0);
          glyphBurstPending = false;
          document.body.classList.remove("capability-cards-active");
          cleanupBlueRunners();
          stopCapabilityGlyphBurst();
        },
        onRefresh: (self) => {
          refreshCardMetrics();
          updateCards(self.progress, true);
          if (!self.isActive) {
            const bounds = capabilityCardsSection.getBoundingClientRect();
            const sectionIsVisible =
              bounds.bottom > 0 && bounds.top < window.innerHeight;
            document.body.classList.toggle(
              "capability-cards-active",
              sectionIsVisible,
            );
            if (!sectionIsVisible) {
              cleanupBlueRunners();
              glyphBurstPending = false;
              stopCapabilityGlyphBurst();
            }
          } else {
            document.body.classList.add("capability-cards-active");
          }
        },
      });

      // The progress trigger ends when the sticky range releases, one
      // viewport before the cards have visually left. This presence trigger
      // owns teardown so blue highlights remain visible and audible during
      // the handoff to the first project folder.
      const cardsPresenceTrigger = ScrollTrigger.create({
        trigger: capabilityCardsSection,
        start: "top bottom",
        end: "bottom top",
        onEnter: () => {
          document.body.classList.add("capability-cards-active");
        },
        onEnterBack: () => {
          document.body.classList.add("capability-cards-active");
        },
        onLeave: () => {
          document.body.classList.remove("capability-cards-active");
          cleanupBlueRunners();
          stopCapabilityGlyphBurst();
        },
        onLeaveBack: () => {
          document.body.classList.remove("capability-cards-active");
          cleanupBlueRunners();
          stopCapabilityGlyphBurst();
        },
      });

      const syncCards = () => {
        updateCards(cardsScrollTrigger.progress);
        document.body.classList.toggle(
          "capability-cards-active",
          cardsPresenceTrigger.isActive,
        );
      };
      syncCapabilityCardsFromScroll = syncCards;
      syncCards();

      return () => {
        cardsPresenceTrigger.kill();
        if (syncCapabilityCardsFromScroll === syncCards) {
          syncCapabilityCardsFromScroll = null;
        }
        cleanupCapabilityCards();
      };
    },
  );
}

function setupCapabilityCardHoverEffects() {
  if (
    capabilityCards.length !== 3 ||
    capabilityCardMagnets.length !== 3 ||
    capabilityCardHoverLabels.some((label) => !(label instanceof HTMLElement))
  ) {
    return;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const owlShowDuration = reduceMotion ? 0.01 : 0.3;
  const owlHideDuration = reduceMotion ? 0.01 : 0.3;
  const magnetPullDuration = reduceMotion ? 0.01 : 0.46;
  const magnetRotationDuration = reduceMotion ? 0.01 : 0.5;
  const magnetScaleDuration = reduceMotion ? 0.01 : 0.28;
  const magnetSettleDuration = reduceMotion ? 0.01 : 0.58;
  const canPeekOwl = capabilityOwlPeek instanceof HTMLElement;
  const owlPeekStates = [
    {
      left: "0",
      right: "auto",
      xPercent: -42,
      yPercent: 30,
      hiddenX: -150,
      hiddenY: 150,
      rotation: 45,
      transformOrigin: "50% 100%",
    },
    {
      left: "50%",
      right: "auto",
      xPercent: -50,
      yPercent: 46,
      hiddenX: 0,
      hiddenY: 150,
      rotation: 0,
      transformOrigin: "50% 100%",
    },
    {
      left: "auto",
      right: "0",
      xPercent: 42,
      yPercent: 30,
      hiddenX: 150,
      hiddenY: 150,
      rotation: -45,
      transformOrigin: "50% 100%",
    },
  ];
  let activeOwlPeekIndex = -1;
  let queuedOwlPeekIndex = -1;
  let pendingOwlHoverIndex = -1;
  let owlPeekTween = null;
  let owlPeekIsHiding = false;
  let lastPointerX = window.innerWidth * 0.5;
  let lastPointerY = window.innerHeight * 0.5;
  let hoverSyncFrame = 0;
  const capabilityLabelTimelines = capabilityCardHoverLabels.map(() => null);

  const showCapabilityCardLabel = (index) => {
    const label = capabilityCardHoverLabels[index];
    if (!(label instanceof HTMLElement)) return;

    capabilityLabelTimelines[index]?.kill();
    gsap.killTweensOf(label);
    resetFooterGlitchWord(label);
    gsap.set(label, { autoAlpha: 1 });

    if (reduceMotion) {
      setFooterGlitchWordFinal(label);
      return;
    }

    const timeline = gsap.timeline({
      onComplete() {
        if (capabilityLabelTimelines[index] === timeline) {
          capabilityLabelTimelines[index] = null;
        }
      },
    });
    addFooterGlitchWordSteps(timeline, label, 0);
    timeline.timeScale(
      (FOOTER_GLITCH_DOT_HOLD + FOOTER_GLITCH_CLEANUP) / owlShowDuration,
    );
    capabilityLabelTimelines[index] = timeline;
  };

  const hideCapabilityCardLabel = (index) => {
    const label = capabilityCardHoverLabels[index];
    if (!(label instanceof HTMLElement)) return;

    capabilityLabelTimelines[index]?.kill();
    capabilityLabelTimelines[index] = null;
    gsap.killTweensOf(label);
    gsap.to(label, {
      autoAlpha: 0,
      duration: owlHideDuration,
      ease: "capabilityOwlReveal",
      overwrite: true,
      onComplete: () => resetFooterGlitchWord(label),
    });
  };

  capabilityCardHoverLabels.forEach((label) => {
    resetFooterGlitchWord(label);
    gsap.set(label, { autoAlpha: 0 });
  });

  if (canPeekOwl) {
    gsap.set(capabilityOwlPeek, {
      autoAlpha: 0,
      yPercent: 112,
      xPercent: -50,
      rotation: 0,
      force3D: true,
    });
  }

  const canRevealCapabilityOwl = () => capabilityCardsAreAssembled ||
    document.body.classList.contains("capability-cards-assembled");

  const getHoveredCapabilityIndex = (x = lastPointerX, y = lastPointerY) => {
    const cssHoveredCard = document.querySelector("[data-capability-card]:hover");
    const cssHoveredIndex = capabilityCards.indexOf(cssHoveredCard);
    if (cssHoveredIndex >= 0) return cssHoveredIndex;

    const hoveredElement = document.elementFromPoint(x, y);
    const hoveredCard = hoveredElement?.closest?.("[data-capability-card]");
    return capabilityCards.indexOf(hoveredCard);
  };

  const showCapabilityOwlFromOrigin = (index) => {
    const state = owlPeekStates[index];
    if (!state) return;

    activeOwlPeekIndex = index;
    owlPeekIsHiding = false;
    showCapabilityCardLabel(index);
    owlPeekTween?.kill();
    gsap.set(capabilityOwlPeek, {
      left: state.left,
      right: state.right,
      xPercent: state.xPercent,
      yPercent: state.yPercent,
      x: state.hiddenX,
      y: state.hiddenY,
      rotation: state.rotation,
      transformOrigin: state.transformOrigin,
    });
    owlPeekTween = gsap.to(capabilityOwlPeek, {
      autoAlpha: 1,
      x: 0,
      y: 0,
      duration: owlShowDuration,
      ease: "capabilityOwlReveal",
      overwrite: true,
      force3D: true,
      onComplete: () => {
        owlPeekTween = null;
        if (
          queuedOwlPeekIndex >= 0 &&
          queuedOwlPeekIndex !== activeOwlPeekIndex
        ) {
          const nextIndex = queuedOwlPeekIndex;
          queuedOwlPeekIndex = -1;
          hideCapabilityOwl(activeOwlPeekIndex, {
            clearQueue: false,
            nextIndex,
          });
        }
      },
    });
  };

  const hideCapabilityOwl = (
    index,
    { clearQueue = true, nextIndex = -1 } = {},
  ) => {
    if (!canPeekOwl || activeOwlPeekIndex !== index) return;

    if (clearQueue) {
      queuedOwlPeekIndex = -1;
    } else if (nextIndex >= 0) {
      queuedOwlPeekIndex = nextIndex;
    }

    const state = owlPeekStates[index];
    owlPeekIsHiding = true;
    hideCapabilityCardLabel(index);
    owlPeekTween?.kill();
    owlPeekTween = gsap.to(capabilityOwlPeek, {
      autoAlpha: 0,
      x: state?.hiddenX ?? 0,
      y: state?.hiddenY ?? 150,
      duration: owlHideDuration,
      ease: "capabilityOwlReveal",
      overwrite: true,
      force3D: true,
      onComplete: () => {
        owlPeekTween = null;
        activeOwlPeekIndex = -1;
        owlPeekIsHiding = false;

        const pendingIndex = queuedOwlPeekIndex;
        queuedOwlPeekIndex = -1;
        if (pendingIndex >= 0 && canRevealCapabilityOwl()) {
          showCapabilityOwlFromOrigin(pendingIndex);
        }
      },
    });
  };

  const showCapabilityOwl = (index) => {
    if (!canPeekOwl) return;
    if (!canRevealCapabilityOwl()) {
      pendingOwlHoverIndex = index;
      return;
    }
    pendingOwlHoverIndex = -1;
    if (activeOwlPeekIndex === index) {
      if (owlPeekIsHiding) {
        queuedOwlPeekIndex = index;
      }
      return;
    }

    if (activeOwlPeekIndex >= 0) {
      queuedOwlPeekIndex = index;
      if (!owlPeekIsHiding) {
        hideCapabilityOwl(activeOwlPeekIndex, {
          clearQueue: false,
          nextIndex: index,
        });
      }
      return;
    }

    queuedOwlPeekIndex = -1;
    showCapabilityOwlFromOrigin(index);
  };

  capabilityCards.forEach((card, index) => {
    const magnet = capabilityCardMagnets[index];
    if (!(card instanceof HTMLElement) || !(magnet instanceof HTMLElement)) {
      return;
    }
    let hoverTarget = card.querySelector(".capability-card__hover-target");
    if (!(hoverTarget instanceof HTMLElement)) {
      hoverTarget = document.createElement("div");
      hoverTarget.className = "capability-card__hover-target";
      hoverTarget.setAttribute("aria-hidden", "true");
      card.append(hoverTarget);
    }

    let xTo = null;
    let yTo = null;
    let rotationTo = null;
    let cardRect = null;

    const createMagnetSetters = () => {
      xTo = gsap.quickTo(magnet, "x", {
        duration: magnetPullDuration,
        ease: "capabilityMagnetPull",
      });
      yTo = gsap.quickTo(magnet, "y", {
        duration: magnetPullDuration,
        ease: "capabilityMagnetPull",
      });
      rotationTo = gsap.quickTo(magnet, "rotation", {
        duration: magnetRotationDuration,
        ease: "capabilityMagnetPull",
      });
    };

    createMagnetSetters();

    const startMagnet = () => {
      cardRect = card.getBoundingClientRect();
      showCapabilityOwl(index);
      gsap.killTweensOf(magnet);
      createMagnetSetters();
      gsap.to(magnet, {
        scale: 1.002,
        duration: magnetScaleDuration,
        ease: "capabilityMagnetPull",
        overwrite: "auto",
        force3D: true,
      });
    };

    const moveMagnet = (event) => {
      cardRect ??= card.getBoundingClientRect();
      const localX = (event.clientX - cardRect.left) / cardRect.width - 0.5;
      const localY = (event.clientY - cardRect.top) / cardRect.height - 0.5;
      xTo?.(localX * 28);
      yTo?.(localY * 22);
      rotationTo?.(localX * 1.4);
    };

    const resetMagnet = (event) => {
      cardRect = null;
      const relatedCard = event?.relatedTarget?.closest?.("[data-capability-card]");
      const isMovingToAnotherCard = relatedCard instanceof HTMLElement &&
        relatedCard !== card;
      if (
        !canRevealCapabilityOwl() &&
        pendingOwlHoverIndex === index &&
        !isMovingToAnotherCard
      ) {
        pendingOwlHoverIndex = -1;
      }
      hideCapabilityOwl(index, { clearQueue: !isMovingToAnotherCard });
      gsap.killTweensOf(magnet);
      gsap.to(magnet, {
        x: 0,
        y: 0,
        rotation: 0,
        scale: 1,
        duration: magnetSettleDuration,
        ease: "capabilityMagnetSettle",
        overwrite: "auto",
        force3D: true,
        onComplete: createMagnetSetters,
      });
    };

    hoverTarget.addEventListener("pointerenter", startMagnet);
    hoverTarget.addEventListener("mouseenter", startMagnet);
    hoverTarget.addEventListener("pointermove", moveMagnet);
    hoverTarget.addEventListener("mousemove", moveMagnet);
    hoverTarget.addEventListener("pointerleave", resetMagnet);
    hoverTarget.addEventListener("mouseleave", resetMagnet);
    hoverTarget.addEventListener("pointercancel", resetMagnet);
  });

  if (canPeekOwl) {
    const syncOwlWithCurrentHover = () => {
      const hoveredIndex = getHoveredCapabilityIndex();
      if (!canRevealCapabilityOwl()) {
        if (hoveredIndex >= 0) {
          pendingOwlHoverIndex = hoveredIndex;
        }
        if (activeOwlPeekIndex >= 0) {
          hideCapabilityOwl(activeOwlPeekIndex);
        }
        return;
      }

      if (hoveredIndex >= 0) {
        showCapabilityOwl(hoveredIndex);
        return;
      }

      if (activeOwlPeekIndex >= 0) {
        hideCapabilityOwl(activeOwlPeekIndex);
      }
    };

    const requestHoverSync = () => {
      if (hoverSyncFrame) return;
      hoverSyncFrame = requestAnimationFrame(() => {
        hoverSyncFrame = 0;
        syncOwlWithCurrentHover();
      });
    };

    const syncOwlWithPointer = (event) => {
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      syncOwlWithCurrentHover();
    };

    window.addEventListener("pointermove", syncOwlWithPointer, { passive: true });
    window.addEventListener("mousemove", syncOwlWithPointer, { passive: true });
    window.addEventListener("capabilityCardsAssembled", () => {
      const hoveredIndex = getHoveredCapabilityIndex();
      const targetIndex = hoveredIndex >= 0 ? hoveredIndex : pendingOwlHoverIndex;
      if (targetIndex >= 0) {
        showCapabilityOwl(targetIndex);
      }
    });
    window.addEventListener("scroll", () => {
      requestHoverSync();
    }, { passive: true });
  }
}

function setupProjectGlyphBurst(button, showcase) {
  if (
    !(button instanceof HTMLButtonElement) ||
    !(showcase instanceof HTMLElement) ||
    button.dataset.projectGlyphBurstReady === "true"
  ) {
    return;
  }

  if (!(projectGlyphBurstCanvas instanceof HTMLCanvasElement)) return;

  button.dataset.projectGlyphBurstReady = "true";
  button.addEventListener("pointerenter", () => {
    const getFolderCenter = () => {
      const bounds = button.getBoundingClientRect();
      return {
        x: bounds.left + bounds.width * 0.5,
        y: bounds.top + bounds.height * 0.5,
      };
    };
    playGlyphSplash();
    playGlyphBurst(projectGlyphBurstState, {
      duration: PROJECT_SKILL_TAG_REVEAL_DURATION,
      originProvider: getFolderCenter,
      coverageScale: 1.12,
      preserveTrailingCoverage: true,
      opacityScale: 0.68,
      coreOpacity: 0.52,
      outerOpacity: 1.28,
    });
  });
}

function setupProjectFolderReveals() {
  projectFolderRevealScrollTriggers.forEach((trigger) => trigger.kill());
  projectFolderRevealScrollTriggers = [];

  projectFileButtons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    const showcase = button.closest(".project-showcase");
    const title = showcase?.querySelector(".project-copy h2");

    gsap.set(button, {
      x: 0,
      autoAlpha: 1,
      clearProps: "transform,opacity,visibility",
    });

    setupProjectSkillTags(button);
    setupProjectGlyphBurst(button, showcase);

    if (title instanceof HTMLElement) {
      resetProjectTitleTyper(title);

      const trigger = ScrollTrigger.create({
        trigger: button,
        start: "top 82%",
        end: "bottom 18%",
        onEnter: () => playProjectTitleTyper(title),
        onEnterBack: () => playProjectTitleTyper(title),
      });
      projectFolderRevealScrollTriggers.push(trigger);
    }
  });
}

function getProjectTitleTyperGroup(title) {
  if (!(title instanceof HTMLElement)) return null;

  let group = projectTitleTyperGroups.get(title);
  if (group === undefined) {
    group = new HeroTyperGroup(
      title,
      {
        fps: INTRO_TYPER_FPS,
        cycles: INTRO_TYPER_CYCLES,
        cycleLength: INTRO_TYPER_CYCLE_LENGTH,
        variations: INTRO_TYPER_VARIATIONS,
      },
      0,
      {
        charClass: "project-title-typer-char",
        wordClass: "project-title-typer-word",
        readyDatasetKey: "projectTitleTyper",
        typeDatasetKey: "projectTitleTyperType",
      },
    );
    projectTitleTyperGroups.set(title, group);
  }

  return group;
}

function resetProjectTitleTyper(title) {
  getProjectTitleTyperGroup(title)?.reset();
}

function playProjectTitleTyper(title) {
  const group = getProjectTitleTyperGroup(title);
  if (group === null) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    group.final();
    return;
  }

  group.reset();
  group.in();
}

function getProjectSkillTags(button) {
  return Array.from(button.querySelectorAll("[data-project-skill-tag]"))
    .filter((tag) => tag instanceof HTMLElement);
}

function getProjectSkillTagLayout(index, count, side, width, height) {
  const compact = window.matchMedia("(max-width: 620px)").matches;
  const layouts = compact
    ? [
      { x: 0.56, y: -0.54, rotation: -5 },
      { x: 0.68, y: -0.42, rotation: 3 },
      { x: 0.56, y: -0.3, rotation: 6 },
    ]
    : [
      { x: 0.68, y: -0.58, rotation: -6 },
      { x: 0.84, y: -0.45, rotation: 3 },
      { x: 0.7, y: -0.32, rotation: 6 },
    ];
  const layout = layouts[index % layouts.length];
  const countOffset = count > layouts.length ? (index - (count - 1) / 2) * 0.035 : 0;

  return {
    x: side * width * layout.x,
    y: height * (layout.y + countOffset),
    rotation: side * layout.rotation,
  };
}

function smoothProjectSkillTagProgress(progress) {
  const clampedProgress = clamp(progress, 0, 1);
  return clampedProgress * clampedProgress * (3 - 2 * clampedProgress);
}

function mixProjectSkillTagValue(start, end, progress) {
  return start + (end - start) * progress;
}

function getProjectSkillTagCurvePoint(curve, progress) {
  const t = smoothProjectSkillTagProgress(progress);
  const inverse = 1 - t;
  const inverseSquared = inverse * inverse;
  const tSquared = t * t;

  return {
    x:
      inverseSquared * inverse * curve.origin.x +
      3 * inverseSquared * t * curve.controlA.x +
      3 * inverse * tSquared * curve.controlB.x +
      tSquared * t * curve.target.x,
    y:
      inverseSquared * inverse * curve.origin.y +
      3 * inverseSquared * t * curve.controlA.y +
      3 * inverse * tSquared * curve.controlB.y +
      tSquared * t * curve.target.y,
  };
}

function getProjectSkillTagCurve(target, side, width, height) {
  return {
    origin: { x: 0, y: 0 },
    controlA: {
      x: -side * width * 0.26,
      y: -height * 0.08,
    },
    controlB: {
      x: target.x * 0.38,
      y: target.y - height * 0.22,
    },
    target,
  };
}

function renderProjectSkillTags(state) {
  const progress = clamp(state.progress, 0, 1);
  const easedProgress = smoothProjectSkillTagProgress(progress);
  const visibleProgress = clamp((progress - 0.18) / 0.36, 0, 1);
  const alpha = smoothProjectSkillTagProgress(visibleProgress);

  state.items.forEach((item) => {
    const point = getProjectSkillTagCurvePoint(item.curve, progress);
    const arcLift = Math.sin(easedProgress * Math.PI);

    gsap.set(item.tag, {
      x: point.x,
      y: point.y,
      scale: mixProjectSkillTagValue(0.72, 1, easedProgress),
      rotation: mixProjectSkillTagValue(0, item.target.rotation, easedProgress) +
        item.side * arcLift * 4,
      autoAlpha: alpha,
    });
  });
}

function createProjectSkillTagState(button) {
  const icon = button.querySelector(".project-folder-icon");
  const tags = getProjectSkillTags(button);
  if (!(icon instanceof HTMLElement) || tags.length === 0) return null;

  const { width, height } = icon.getBoundingClientRect();
  const sideCounts = tags.reduce((counts, tag) => {
    const sideName = tag.dataset.projectSkillSide === "left" ? "left" : "right";
    counts[sideName] += 1;
    return counts;
  }, { left: 0, right: 0 });
  const sideIndexes = { left: 0, right: 0 };
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  gsap.killTweensOf(tags);
  gsap.set(tags, {
    xPercent: -50,
    yPercent: -50,
    x: 0,
    y: 0,
    scale: 0.72,
    rotation: 0,
    autoAlpha: 0,
  });

  const items = tags.map((tag) => {
    const sideName = tag.dataset.projectSkillSide === "left" ? "left" : "right";
    const side = sideName === "left" ? -1 : 1;
    const sideIndex = sideIndexes[sideName];
    sideIndexes[sideName] += 1;

    const target = getProjectSkillTagLayout(
      sideIndex,
      sideCounts[sideName],
      side,
      width,
      height,
    );

    return {
      tag,
      side,
      target,
      curve: getProjectSkillTagCurve(target, side, width, height),
    };
  });
  const state = { progress: 0, items, reduceMotion };
  renderProjectSkillTags(state);

  return state;
}

function showProjectSkillTags(button) {
  if (!(button instanceof HTMLButtonElement)) return;

  let state = projectSkillTagStates.get(button);
  if (state === undefined) {
    state = createProjectSkillTagState(button);
    if (state === null) return;
    projectSkillTagStates.set(button, state);
  }

  const existingTween = projectSkillTagRevealTweens.get(button);
  existingTween?.kill();

  if (state.reduceMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    state.progress = 1;
    renderProjectSkillTags(state);
    return;
  }

  const tween = gsap.to(state, {
    progress: 1,
    duration: Math.max(
      0.34,
      (1 - state.progress) * PROJECT_SKILL_TAG_REVEAL_DURATION,
    ),
    ease: "power2.out",
    overwrite: true,
    onUpdate() {
      renderProjectSkillTags(state);
    },
    onComplete() {
      projectSkillTagRevealTweens.delete(button);
    },
  });
  projectSkillTagRevealTweens.set(button, tween);
}

function hideProjectSkillTags(button, immediate = false) {
  if (!(button instanceof HTMLButtonElement)) return;
  if (!immediate && button.classList.contains("is-opening")) return;

  const state = projectSkillTagStates.get(button);
  const tags = getProjectSkillTags(button);
  const existingTween = projectSkillTagRevealTweens.get(button);
  existingTween?.kill();
  projectSkillTagRevealTweens.delete(button);

  if (state === undefined) {
    if (immediate && tags.length > 0) {
      gsap.set(tags, { autoAlpha: 0, x: 0, y: 0, scale: 0.72, rotation: 0 });
    }
    return;
  }

  if (
    immediate ||
    state.reduceMotion ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    state.progress = 0;
    renderProjectSkillTags(state);
    if (tags.length > 0) {
      gsap.set(tags, { autoAlpha: 0, x: 0, y: 0, scale: 0.72, rotation: 0 });
    }
    return;
  }

  const tween = gsap.to(state, {
    progress: 0,
    duration: Math.max(0.26, state.progress * 0.68),
    ease: "power2.inOut",
    overwrite: true,
    onUpdate() {
      renderProjectSkillTags(state);
    },
    onComplete() {
      projectSkillTagRevealTweens.delete(button);
      state.progress = 0;
      renderProjectSkillTags(state);
      if (tags.length > 0) {
        gsap.set(tags, { autoAlpha: 0, x: 0, y: 0, scale: 0.72, rotation: 0 });
      }
    },
  });
  projectSkillTagRevealTweens.set(button, tween);
}

function pinProjectSkillTagsOpen(button) {
  if (!(button instanceof HTMLButtonElement)) return;

  let state = projectSkillTagStates.get(button);
  if (state === undefined) {
    state = createProjectSkillTagState(button);
    if (state === null) return;
    projectSkillTagStates.set(button, state);
  }

  const existingTween = projectSkillTagRevealTweens.get(button);
  existingTween?.kill();
  projectSkillTagRevealTweens.delete(button);
  state.progress = 1;
  renderProjectSkillTags(state);
}

function setupProjectSkillTags(button) {
  if (button.dataset.projectSkillTagsReady === "true") return;

  const tags = getProjectSkillTags(button);
  if (tags.length === 0) return;

  button.dataset.projectSkillTagsReady = "true";
  gsap.set(tags, {
    xPercent: -50,
    yPercent: -50,
    x: 0,
    y: 0,
    scale: 0.72,
    rotation: 0,
    autoAlpha: 0,
  });

  button.addEventListener("pointerenter", () => showProjectSkillTags(button));
  button.addEventListener("pointerleave", () => hideProjectSkillTags(button));
  button.addEventListener("focus", () => showProjectSkillTags(button));
  button.addEventListener("blur", () => hideProjectSkillTags(button));
}

function resetWorkFooterSceneAssembly() {
  workFooterSceneAssemblyTween?.kill();
  workFooterSceneAssemblyTween = null;
  workFooterSceneState.assemblyActive = false;
  workFooterSceneState.assemblyComplete = false;
  workFooterSceneState.assemblyElapsed = 0;
  workFooterSceneState.assemblyGlyphs = [];
  workFooterSceneState.assemblySettledGlyphs = [];
  resetWorkFooterSceneSettledLayer();
  renderWorkFooterScene();
}

function finishWorkFooterSceneAssembly() {
  const totalDuration = getWorkFooterSceneAssemblyTotalDuration();
  workFooterSceneState.assemblyElapsed = totalDuration;

  if (workFooterSceneState.assemblySettledGlyphs.length > 0) {
    const settledCanvas = stampWorkFooterSceneSettledGlyphs(totalDuration);

    if (
      settledCanvas !== null &&
      workFooterSceneState.assemblySettledCtx !== null
    ) {
      workFooterSceneState.finalCanvas = settledCanvas;
      workFooterSceneState.finalCtx = workFooterSceneState.assemblySettledCtx;
      workFooterSceneState.finalCacheKey = getWorkFooterSceneFinalCacheKey();
    }
  }

  workFooterSceneState.assemblyActive = false;
  workFooterSceneState.assemblyComplete = true;
  workFooterSceneState.assemblyGlyphs = [];
  workFooterSceneState.assemblySettledGlyphs = [];
  renderWorkFooterScene();
}

function playWorkFooterSceneAssembly() {
  if (
    !(workFooterSceneCanvas instanceof HTMLCanvasElement) ||
    workFooterSceneCtx === null ||
    workFooterSceneState.luma === null ||
    workFooterSceneState.mask === null
  ) {
    return;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finishWorkFooterSceneAssembly();
    return;
  }

  if (workFooterSceneState.assemblyActive) {
    workFooterSceneAssemblyTween?.resume();
    return;
  }

  if (workFooterSceneState.assemblyComplete) {
    return;
  }

  workFooterSceneAssemblyTween?.kill();
  cancelWorkFooterScenePrewarm(true);
  primeWorkFooterSceneAssembly();
  workFooterSceneState.assemblyActive = true;
  workFooterSceneState.assemblyComplete = false;
  workFooterSceneState.assemblyElapsed = 0;
  setWorkFooterSceneAssemblyGlyphs(buildWorkFooterSceneAssemblyGlyphs());

  if (workFooterSceneState.assemblyGlyphs.length === 0) {
    finishWorkFooterSceneAssembly();
    return;
  }

  const motion = { elapsed: 0 };
  const totalDuration = getWorkFooterSceneAssemblyTotalDuration();
  renderWorkFooterScene();

  workFooterSceneAssemblyTween = gsap.to(motion, {
    elapsed: totalDuration,
    duration: totalDuration,
    ease: "none",
    overwrite: "auto",
    onUpdate() {
      workFooterSceneState.assemblyElapsed = motion.elapsed;
      renderWorkFooterScene();
    },
    onComplete() {
      workFooterSceneAssemblyTween = null;
      finishWorkFooterSceneAssembly();
    },
  });
}

function setupWorkFooterSceneAssembly() {
  workFooterSceneAssemblyScrollTrigger?.kill();
  workFooterSceneAssemblyScrollTrigger = null;

  if (!(workFooterSceneCanvas instanceof HTMLCanvasElement)) {
    return;
  }

  const trigger = workFooterSceneCanvas.closest(".work-footer-scene") ??
    workFooterSceneCanvas;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finishWorkFooterSceneAssembly();
    return;
  }

  resetWorkFooterSceneAssembly();

  workFooterSceneAssemblyScrollTrigger = ScrollTrigger.create({
    trigger,
    start: "top 86%",
    end: "bottom top",
    invalidateOnRefresh: true,
    onEnter() {
      if (activePageId === "work") playWorkFooterSceneAssembly();
    },
    onEnterBack() {
      if (activePageId === "work") playWorkFooterSceneAssembly();
    },
    onUpdate(self) {
      if (activePageId === "work" && self.progress > 0) {
        playWorkFooterSceneAssembly();
      }
    },
    onRefresh(self) {
      if (activePageId === "work" && (self.isActive || self.progress > 0)) {
        playWorkFooterSceneAssembly();
      }
    },
    onLeaveBack() {
      if (activePageId === "work") {
        workFooterSceneAssemblyTween?.pause();
      }
    },
  });
}

function getCaseStudyViewport() {
  return {
    width: Math.max(1, window.innerWidth),
    height: Math.max(1, window.innerHeight),
  };
}

function getCaseStudyPaperPath(state) {
  const height = Math.max(1, state.bottomY - state.topY);
  const topWidth = Math.max(1, state.topWidth);
  const bottomWidth = Math.max(1, state.bottomWidth);
  const lowerSpread = Math.max(0, (bottomWidth - topWidth) / 2);
  const curve = clamp(state.curve ?? 0, 0, 1);
  const radius = clamp(
    state.radius,
    0,
    Math.min(height * 0.34, topWidth * 0.18, bottomWidth * 0.18),
  );
  const topLeft = state.centerX - topWidth / 2;
  const topRight = state.centerX + topWidth / 2;
  const bottomLeft = state.centerX - bottomWidth / 2;
  const bottomRight = state.centerX + bottomWidth / 2;
  const sideControlOffset = lowerSpread * curve;
  const sideUpperY = state.topY + height * 0.42;
  const sideLowerY = state.topY + height * 0.8;

  return [
    `M ${topLeft + radius} ${state.topY}`,
    `L ${topRight - radius} ${state.topY}`,
    `Q ${topRight} ${state.topY} ${topRight} ${state.topY + radius}`,
    `C ${topRight + sideControlOffset * 0.04} ${sideUpperY} ${bottomRight - sideControlOffset * 0.12} ${sideLowerY} ${bottomRight} ${state.bottomY - radius}`,
    `Q ${bottomRight} ${state.bottomY} ${bottomRight - radius} ${state.bottomY}`,
    `L ${bottomLeft + radius} ${state.bottomY}`,
    `Q ${bottomLeft} ${state.bottomY} ${bottomLeft} ${state.bottomY - radius}`,
    `C ${bottomLeft + sideControlOffset * 0.12} ${sideLowerY} ${topLeft - sideControlOffset * 0.04} ${sideUpperY} ${topLeft} ${state.topY + radius}`,
    `Q ${topLeft} ${state.topY} ${topLeft + radius} ${state.topY}`,
    "Z",
  ].join(" ");
}

function createCaseStudyPaperWarp({ paperBounds, viewportWidth, viewportHeight }) {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const element = document.createElement("div");
  const svg = document.createElementNS(svgNamespace, "svg");
  const defs = document.createElementNS(svgNamespace, "defs");
  const gradient = document.createElementNS(svgNamespace, "linearGradient");
  const stopTop = document.createElementNS(svgNamespace, "stop");
  const stopBottom = document.createElementNS(svgNamespace, "stop");
  const path = document.createElementNS(svgNamespace, "path");
  const paperHeight = Math.max(1, paperBounds.height);
  const initialRadius = Math.min(12, paperHeight * 0.24);
  const state = {
    centerX: paperBounds.left + paperBounds.width / 2,
    topY: paperBounds.top,
    bottomY: paperBounds.bottom,
    topWidth: paperBounds.width,
    bottomWidth: paperBounds.width,
    radius: initialRadius,
    curve: 0,
  };

  element.className = "case-study-paper-warp";
  element.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", `0 0 ${viewportWidth} ${viewportHeight}`);
  svg.setAttribute("preserveAspectRatio", "none");
  gradient.id = "case-study-paper-gradient";
  gradient.setAttribute("x1", "0");
  gradient.setAttribute("x2", "0");
  gradient.setAttribute("y1", "0");
  gradient.setAttribute("y2", "1");
  stopTop.setAttribute("offset", "0");
  stopTop.setAttribute("stop-color", BACKGROUND_COLOR);
  stopBottom.setAttribute("offset", "1");
  stopBottom.setAttribute("stop-color", "#f8f9f9");
  gradient.append(stopTop, stopBottom);
  defs.append(gradient);
  path.classList.add("case-study-paper-warp__sheet");
  path.setAttribute("fill", "url(#case-study-paper-gradient)");
  path.setAttribute("d", getCaseStudyPaperPath(state));
  svg.append(defs, path);
  element.append(svg);

  const render = () => {
    path.setAttribute("d", getCaseStudyPaperPath(state));
  };

  return {
    element,
    state,
    render,
  };
}

function setActiveCaseStudySection(sectionId) {
  caseStudyProgressButtons.forEach((button) => {
    const isActive = button.dataset.caseStudyJump === sectionId;
    button.classList.toggle("is-active", isActive);
    if (isActive) {
      button.setAttribute("aria-current", "step");
    } else {
      button.removeAttribute("aria-current");
    }
  });
}

function cleanupCaseStudyExperience() {
  caseStudyVideoObserver?.disconnect();
  caseStudyVideoObserver = null;
  caseStudyPage?.querySelectorAll("video[data-case-study-video]")
    .forEach((video) => releaseDeferredVideo(video));
  caseStudyRevealTimeline?.kill();
  caseStudyRevealTimeline = null;
  caseStudyChromeTimeline?.kill();
  caseStudyChromeTimeline = null;
  caseStudyChromeScrollTrigger?.kill();
  caseStudyChromeScrollTrigger = null;
  caseStudyScrollTween?.kill();
  caseStudyScrollTween = null;
  caseStudySectionScrollTriggers.forEach((trigger) => trigger.kill());
  caseStudySectionScrollTriggers = [];
  caseStudySplits.reverse().forEach((split) => split.revert());
  caseStudySplits = [];

  if (caseStudyProgress instanceof HTMLElement) {
    gsap.set(caseStudyProgress, {
      autoAlpha: 0,
      pointerEvents: "none",
    });
  }
  gsap.set([caseStudyCloseButton, ...caseStudyProgressButtons], {
    y: 8,
    autoAlpha: 0,
  });
}

function setCaseStudyCopyContent(element, value) {
  element.replaceChildren();
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let cursor = 0;
  let match;

  while ((match = linkPattern.exec(value)) !== null) {
    if (match.index > cursor) {
      element.append(document.createTextNode(value.slice(cursor, match.index)));
    }
    const link = document.createElement("a");
    link.href = match[2];
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = match[1];
    element.append(link);
    cursor = linkPattern.lastIndex;
  }

  if (cursor < value.length) {
    element.append(document.createTextNode(value.slice(cursor)));
  }
}

function populateCaseStudy(projectId) {
  if (!(caseStudyPage instanceof HTMLElement)) return;

  cleanupCaseStudyExperience();
  const project = CASE_STUDY_PROJECTS[projectId] ?? CASE_STUDY_PROJECTS["project-one"];
  caseStudyPage.dataset.projectId = projectId;
  caseStudyPage.setAttribute("aria-label", `${project.title} Case study`);
  caseStudyPage.scrollTop = 0;

  caseStudyPage.querySelectorAll("[data-case-field]").forEach((element) => {
    const field = element.dataset.caseField;
    if (field === undefined || !(field in project)) return;
    const value = String(project[field]);
    element.textContent = value;
    element.hidden = value.trim() === "";
  });

  caseStudyProgressButtons.forEach((button) => {
    const sectionId = button.dataset.caseStudyJump;
    if (sectionId === undefined) return;
    const defaultLabels = {
      overview: "Intro",
      challenge: "Challenge",
      system: "Learnings",
      outcome: "Reflection",
    };
    button.textContent = project.navigation?.[sectionId] ?? defaultLabels[sectionId] ?? sectionId;
  });

  const websiteLink = caseStudyPage.querySelector("[data-case-website]");
  if (websiteLink instanceof HTMLAnchorElement) {
    const website = typeof project.website === "string" ? project.website : "";
    websiteLink.href = website || "#";
    websiteLink.hidden = website === "";
  }

  caseStudyPage.querySelectorAll("[data-case-media]").forEach((figure) => {
    const mediaIndex = Number.parseInt(figure.dataset.caseMedia ?? "", 10);
    const media = project.media[mediaIndex];
    if (media === undefined) return;

    const label = figure.querySelector("[data-case-media-label]");
    const caption = figure.querySelector("[data-case-media-caption]");
    const surface = figure.querySelector(".case-study-media__surface");
    const index = figure.querySelector(".case-study-media__index");
    figure.querySelector(".case-study-media__videos")?.remove();
    surface?.classList.remove("has-videos");
    if (index instanceof HTMLElement) index.hidden = false;
    if (label instanceof HTMLElement) label.hidden = false;
    if (label instanceof HTMLElement) label.textContent = media.label;
    if (caption instanceof HTMLElement) caption.textContent = media.caption;

    if (!(surface instanceof HTMLElement) || !Array.isArray(media.videos)) return;

    const videoStack = document.createElement("div");
    videoStack.className = "case-study-media__videos";
    media.videos.forEach((videoNumber) => {
      const continuesPrevious = media.continuationVideos?.includes(videoNumber) === true;
      const previousItem = videoStack.lastElementChild;
      const videoItem =
        continuesPrevious && previousItem instanceof HTMLElement
          ? previousItem
          : document.createElement("div");
      videoItem.classList.add("case-study-media__video-item");
      const videoCopy = media.videoCopy?.[videoNumber];
      if (typeof videoCopy === "string" && videoCopy.trim() !== "") {
        const copy = document.createElement("p");
        copy.className = "case-study-media__video-copy";
        setCaseStudyCopyContent(copy, videoCopy);
        videoItem.append(copy);
      }

      const video = document.createElement("video");
      video.dataset.src = `${project.videoBasePath}-${videoNumber}.mp4`;
      video.loop = true;
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.preload = "none";
      video.dataset.caseStudyVideo = "";
      video.dataset.caseStudyVideoNumber = String(videoNumber);
      video.setAttribute("aria-label", `${project.title} recording ${videoNumber}`);
      if (continuesPrevious) video.classList.add("case-study-media__continued-video");
      videoItem.append(video);
      if (!continuesPrevious) videoStack.append(videoItem);
    });

    surface.classList.add("has-videos");
    if (index instanceof HTMLElement) index.hidden = true;
    if (label instanceof HTMLElement) label.hidden = true;
    if (caption instanceof HTMLElement) caption.textContent = "";
    surface.append(videoStack);
  });

  setActiveCaseStudySection("overview");
}

function setupCaseStudyProgress() {
  if (
    !(caseStudyPage instanceof HTMLElement) ||
    !(caseStudyContent instanceof HTMLElement)
  ) {
    return;
  }

  caseStudySectionScrollTriggers.forEach((trigger) => trigger.kill());
  caseStudySectionScrollTriggers = [];

  caseStudySections.forEach((section) => {
    if (!(section instanceof HTMLElement)) return;
    const sectionId = section.dataset.caseStudySection;
    if (sectionId === undefined) return;
    const project = CASE_STUDY_PROJECTS[caseStudyPage.dataset.projectId];
    const targetVideoNumber = project?.navigationVideoTargets?.[sectionId];
    const targetVideo = Number.isInteger(targetVideoNumber)
      ? caseStudyPage.querySelector(
          `video[data-case-study-video-number="${targetVideoNumber}"]`,
        )
      : null;
    const triggerTarget = targetVideo?.closest(".case-study-media__video-item") ?? section;

    const trigger = ScrollTrigger.create({
      trigger: triggerTarget,
      scroller: caseStudyPage,
      start: sectionId === "outcome" ? "top 85%" : "top 48%",
      end: sectionId === "outcome" ? "max" : "bottom 48%",
      onEnter: () => setActiveCaseStudySection(sectionId),
      onEnterBack: () => setActiveCaseStudySection(sectionId),
    });
    caseStudySectionScrollTriggers.push(trigger);
  });
}

function showCaseStudyIndex() {
  if (
    !(caseStudyProgress instanceof HTMLElement) ||
    !(caseStudyCloseButton instanceof HTMLElement)
  ) {
    return;
  }

  caseStudyChromeTimeline?.kill();
  caseStudyChromeTimeline = gsap.timeline({
    defaults: {
      duration: 0.24,
      ease: "power3.out",
      overwrite: "auto",
    },
    onStart() {
      gsap.set(caseStudyProgress, { pointerEvents: "auto" });
    },
  });
  caseStudyChromeTimeline
    .to(caseStudyProgress, { autoAlpha: 1, duration: 0.12 })
    .to(
      [caseStudyCloseButton, ...caseStudyProgressButtons],
      {
        y: 0,
        autoAlpha: 1,
        stagger: 0.035,
      },
      0,
    );
}

function hideCaseStudyIndex(immediate = false) {
  if (!(caseStudyProgress instanceof HTMLElement)) return;

  caseStudyChromeTimeline?.kill();
  if (immediate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.set(caseStudyProgress, { autoAlpha: 0, pointerEvents: "none" });
    gsap.set([caseStudyCloseButton, ...caseStudyProgressButtons], {
      y: 8,
      autoAlpha: 0,
    });
    return;
  }

  caseStudyChromeTimeline = gsap.timeline({
    defaults: {
      duration: 0.16,
      ease: "power2.in",
      overwrite: "auto",
    },
    onComplete() {
      gsap.set(caseStudyProgress, { pointerEvents: "none" });
    },
  });
  caseStudyChromeTimeline
    .to(
      [caseStudyCloseButton, ...caseStudyProgressButtons],
      {
        y: 8,
        autoAlpha: 0,
        stagger: {
          each: 0.018,
          from: "end",
        },
      },
    )
    .to(caseStudyProgress, { autoAlpha: 0, duration: 0.08 }, "<");
}

function setupCaseStudyIndexReveal() {
  if (!(caseStudyPage instanceof HTMLElement) || !(caseStudyContent instanceof HTMLElement)) {
    return;
  }

  caseStudyChromeScrollTrigger?.kill();
  hideCaseStudyIndex(true);
  caseStudyChromeScrollTrigger = ScrollTrigger.create({
    trigger: caseStudyContent,
    scroller: caseStudyPage,
    start: "top top-=24",
    onEnter: showCaseStudyIndex,
    onLeaveBack: () => hideCaseStudyIndex(false),
  });
}

function prepareCaseStudyReveal() {
  if (!(caseStudyPage instanceof HTMLElement)) return;

  caseStudyRevealTimeline?.kill();
  caseStudySplits.reverse().forEach((split) => split.revert());
  caseStudySplits = [];

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const textTargets = Array.from(
    caseStudyPage.querySelectorAll(
      ".case-study-hero__title, .case-study-hero__summary, .case-study-hero__intro, .case-study-hero__website, .case-study-meta dt, .case-study-meta dd, .case-study-section h2, .case-study-section p, .case-study-media__label, .case-study-media figcaption",
    ),
  );
  const mark = caseStudyPage.querySelector(".case-study-hero__mark");
  const media = Array.from(caseStudyPage.querySelectorAll(".case-study-media"));

  if (reduceMotion) {
    const reducedMotionTargets = [...textTargets, ...media];
    if (mark instanceof Element) reducedMotionTargets.push(mark);
    gsap.set(reducedMotionTargets, {
      clearProps: "opacity,visibility,transform",
    });
    return;
  }

  const revealItems = [];
  textTargets.forEach((element) => {
    if (
      !(element instanceof HTMLElement) ||
      element.hidden ||
      window.getComputedStyle(element).display === "none" ||
      element.textContent?.trim() === ""
    ) return;
    const split = new SplitText(element, {
      type: "lines",
      linesClass: "case-study-split-line",
    });
    caseStudySplits.push(split);
    revealItems.push(...split.lines);
  });

  if (mark instanceof Element) {
    revealItems.push(mark);
  }
  revealItems.push(...media);

  const orderedItems = revealItems
    .map((element, index) => {
      const bounds = element.getBoundingClientRect();
      return {
        element,
        index,
        left: bounds.left,
        top: bounds.top,
      };
    })
    .sort((a, b) => {
      const verticalDifference = a.top - b.top;
      if (Math.abs(verticalDifference) > 20) return verticalDifference;
      const horizontalDifference = a.left - b.left;
      return Math.abs(horizontalDifference) > 2
        ? horizontalDifference
        : a.index - b.index;
    })
    .map(({ element }) => element);
  const mediaSet = new Set(media);

  gsap.set(orderedItems, {
    x: (index, element) => mediaSet.has(element) ? 0 : -6,
    y: (index, element) => mediaSet.has(element) ? 16 : 12,
    autoAlpha: 0,
    scale: (index, element) => mediaSet.has(element) ? 0.988 : 1,
  });

  caseStudyRevealTimeline = gsap.timeline({
    paused: true,
    defaults: {
      ease: "power4.out",
      overwrite: "auto",
    },
  });
  caseStudyRevealTimeline.to(orderedItems, {
    x: 0,
    y: 0,
    scale: 1,
    autoAlpha: 1,
    duration: 0.58,
    stagger: 0.045,
    onComplete() {
      gsap.set(orderedItems, {
        clearProps: "transform,opacity,visibility",
      });
      window.requestAnimationFrame(() => {
        ScrollTrigger.refresh();
      });
    },
  });
}

function playCaseStudyReveal() {
  if (caseStudyRevealTimeline !== null) {
    caseStudyRevealTimeline.play(0);
    return;
  }

  ScrollTrigger.refresh();
}

function activateCaseStudyExperience() {
  if (!(caseStudyPage instanceof HTMLElement)) return;

  caseStudyPage.scrollTop = 0;
  const videos = caseStudyPage.querySelectorAll("video[data-case-study-video]");
  caseStudyVideoObserver?.disconnect();

  if (!("IntersectionObserver" in window)) {
    videos.forEach((video) => {
      loadDeferredVideo(video);
      video.play().catch(() => {});
    });
    setupCaseStudyProgress();
    setupCaseStudyIndexReveal();
    window.requestAnimationFrame(() => {
      playCaseStudyReveal();
    });
    return;
  }

  caseStudyVideoObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!(entry.target instanceof HTMLVideoElement)) return;
        if (entry.isIntersecting) {
          loadDeferredVideo(entry.target);
          entry.target.play().catch(() => {});
        } else {
          entry.target.pause();
        }
      });
    },
    {
      root: caseStudyPage,
      rootMargin: "20% 0px",
      threshold: 0.05,
    },
  );
  videos.forEach((video) => caseStudyVideoObserver?.observe(video));
  setupCaseStudyProgress();
  setupCaseStudyIndexReveal();
  window.requestAnimationFrame(() => {
    playCaseStudyReveal();
  });
}

function scrollToCaseStudySection(sectionId) {
  if (!(caseStudyPage instanceof HTMLElement)) return;

  const section = caseStudySections.find(
    (candidate) => candidate.dataset.caseStudySection === sectionId,
  );
  if (!(section instanceof HTMLElement)) return;
  const project = CASE_STUDY_PROJECTS[caseStudyPage.dataset.projectId];
  const targetVideoNumber = project?.navigationVideoTargets?.[sectionId];
  const targetVideo = Number.isInteger(targetVideoNumber)
    ? caseStudyPage.querySelector(
        `video[data-case-study-video-number="${targetVideoNumber}"]`,
      )
    : null;
  const scrollTarget = targetVideo?.closest(".case-study-media__video-item") ?? section;

  const pageBounds = caseStudyPage.getBoundingClientRect();
  const sectionBounds = scrollTarget.getBoundingClientRect();
  const targetScrollTop = Math.max(
    0,
    caseStudyPage.scrollTop + sectionBounds.top - pageBounds.top - 96,
  );
  const scrollState = { value: caseStudyPage.scrollTop };

  caseStudyScrollTween?.kill();
  caseStudyScrollTween = gsap.to(scrollState, {
    value: targetScrollTop,
    duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 0.55,
    ease: "power3.inOut",
    overwrite: true,
    onUpdate() {
      caseStudyPage.scrollTop = scrollState.value;
    },
    onComplete() {
      caseStudyScrollTween = null;
    },
  });
}

function resumeSmoothScrollAfterCaseStudy() {
  reconcileSmoothScrollAfterLockChange({ resize: true });
}

function resetCaseStudyLayer() {
  if (!(caseStudyLayer instanceof HTMLElement) || !(caseStudyPage instanceof HTMLElement)) {
    return;
  }

  caseStudyLayer.classList.remove("is-active");
  caseStudyLayer.setAttribute("aria-hidden", "true");
  caseStudyPage.classList.remove("is-open");
  document.documentElement.classList.remove(
    "is-case-study-open",
    "is-case-study-transitioning",
  );
  reconcileSmoothScrollAfterLockChange({ resize: true });
  gsap.set(caseStudyLayer, { clearProps: "backgroundColor" });
  gsap.set(caseStudyPage, { clearProps: "visibility,transform" });
  gsap.set(caseStudyCloseButton, { clearProps: "visibility" });
  caseStudyPage.scrollTop = 0;
  activeProjectFileButton?.classList.remove("is-opening");
  activeProjectFileButton = null;
}

function closeProjectCaseStudy(immediate = false, onComplete = null) {
  if (!(caseStudyLayer instanceof HTMLElement) || !(caseStudyPage instanceof HTMLElement)) {
    return;
  }

  if (
    !caseStudyLayer.classList.contains("is-active") &&
    projectCaseStudyTimeline === null
  ) {
    return;
  }

  const finishClose = () => {
    const projectTrigger = activeProjectFileButton;
    caseStudyLayer
      .querySelectorAll(".case-study-paper-warp, .case-study-sheet-genie, .case-study-genie, .case-study-folder-mask, .case-study-warp")
      .forEach((element) => {
        element.remove();
      });
    projectCaseStudyTimeline?.kill();
    projectCaseStudyTimeline = null;
    cleanupCaseStudyExperience();
    resetCaseStudyLayer();
    resumeSmoothScrollAfterCaseStudy();
    projectTrigger?.focus({ preventScroll: true });
    onComplete?.();
  };

  if (immediate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finishClose();
    return;
  }

  if (!caseStudyPage.classList.contains("is-open")) {
    finishClose();
    return;
  }

  projectCaseStudyTimeline?.kill();
  projectCaseStudyTimeline = null;
  gsap.killTweensOf(caseStudyPage);
  gsap.set(caseStudyCloseButton, { visibility: "hidden" });
  gsap.set(caseStudyPage, { visibility: "visible", xPercent: 0 });
  caseStudyPage.classList.remove("is-open");
  document.documentElement.classList.remove("is-case-study-open");
  document.documentElement.classList.add("is-case-study-transitioning");
  reconcileSmoothScrollAfterLockChange();

  gsap.to(caseStudyPage, {
    xPercent: 104,
    duration: 0.56,
    ease: "caseStudyExit",
    overwrite: true,
    onComplete: finishClose,
  });
}

function openProjectCaseStudy(projectFileButton) {
  if (
    !(projectFileButton instanceof HTMLButtonElement) ||
    !(caseStudyLayer instanceof HTMLElement) ||
    !(caseStudyPage instanceof HTMLElement)
  ) {
    return;
  }

  if (
    projectCaseStudyTimeline !== null ||
    caseStudyLayer.classList.contains("is-active")
  ) {
    return;
  }

  const paper = projectFileButton.querySelector(".project-file__paper");
  const folderFront = projectFileButton.querySelector(".project-file__folder-front");
  if (!(paper instanceof HTMLElement)) return;
  if (!(folderFront instanceof HTMLElement)) return;

  const paperBounds = paper.getBoundingClientRect();
  const frontBounds = folderFront.getBoundingClientRect();
  const { width: viewportWidth, height: viewportHeight } = getCaseStudyViewport();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const projectId =
    projectFileButton.dataset.projectId ??
    projectFileButton.closest(".project-showcase")?.id ??
    "project-one";

  activeProjectFileButton = projectFileButton;
  populateCaseStudy(projectId);
  pinProjectSkillTagsOpen(projectFileButton);
  projectFileButton.classList.add("is-opening");
  caseStudyLayer.classList.add("is-active");
  caseStudyLayer.setAttribute("aria-hidden", "false");
  caseStudyPage.classList.remove("is-open");
  document.documentElement.classList.add("is-case-study-transitioning");
  reconcileSmoothScrollAfterLockChange();
  gsap.set(caseStudyPage, { visibility: "hidden", xPercent: 0 });
  prepareCaseStudyReveal();

  if (reduceMotion) {
    projectFileButton.classList.remove("is-opening");
    caseStudyPage.classList.add("is-open");
    gsap.set(caseStudyCloseButton, { visibility: "visible" });
    gsap.set(caseStudyPage, {
      visibility: "visible",
      clearProps: "transform",
    });
    document.documentElement.classList.remove("is-case-study-transitioning");
    document.documentElement.classList.add("is-case-study-open");
    reconcileSmoothScrollAfterLockChange();
    activateCaseStudyExperience();
    return;
  }

  const paperWarp = createCaseStudyPaperWarp({
    paperBounds,
    viewportWidth,
    viewportHeight,
  });
  const folderFrontMask = document.createElement("div");
  const folderFrontStyles = getComputedStyle(folderFront);

  folderFrontMask.className = "case-study-folder-mask";
  folderFrontMask.setAttribute("aria-hidden", "true");
  Object.assign(folderFrontMask.style, {
    left: `${frontBounds.left}px`,
    top: `${frontBounds.top}px`,
    width: `${frontBounds.width}px`,
    height: `${frontBounds.height}px`,
    border: folderFrontStyles.border,
    borderRadius: folderFrontStyles.borderRadius,
    background: folderFrontStyles.background,
    boxShadow: folderFrontStyles.boxShadow,
    backdropFilter: folderFrontStyles.backdropFilter,
    WebkitBackdropFilter: folderFrontStyles.webkitBackdropFilter,
  });

  caseStudyLayer.append(paperWarp.element, folderFrontMask);

  gsap.set(caseStudyLayer, {
    backgroundColor: BACKGROUND_COLOR_TRANSPARENT,
  });

  const paperState = paperWarp.state;
  const liftedTop = clamp(viewportHeight * 0.1, 70, 98);
  const liftedBottom = liftedTop + paperBounds.height;
  const finalWidth = viewportWidth * 1.02;
  const finalBottom = viewportHeight + 8;

  paperWarp.render();

  projectCaseStudyTimeline = gsap.timeline({
    defaults: {
      overwrite: "auto",
    },
    onComplete() {
      projectFileButton.classList.remove("is-opening");
      caseStudyPage.classList.add("is-open");
      gsap.set(caseStudyPage, { clearProps: "transform" });
      gsap.set(paperWarp.element, { visibility: "hidden" });
      gsap.set(folderFrontMask, { visibility: "hidden" });
      gsap.set(caseStudyPage, { visibility: "visible" });
      gsap.set(caseStudyCloseButton, { visibility: "visible" });
      gsap.set(caseStudyLayer, { backgroundColor: BACKGROUND_COLOR });
      document.documentElement.classList.remove("is-case-study-transitioning");
      document.documentElement.classList.add("is-case-study-open");
      reconcileSmoothScrollAfterLockChange();
      activateCaseStudyExperience();
    },
  });

  projectCaseStudyTimeline.to(
    paperState,
    {
      centerX: viewportWidth / 2,
      topY: liftedTop,
      bottomY: liftedBottom,
      duration: 0.36,
      ease: "projectFolderSnap",
      onUpdate: paperWarp.render,
    },
    0,
  );
  projectCaseStudyTimeline.to(
    paperState,
    {
      bottomWidth: finalWidth,
      bottomY: finalBottom,
      radius: Math.min(7, paperBounds.height * 0.16),
      curve: 1,
      duration: 0.5,
      ease: "power3.inOut",
      onUpdate: paperWarp.render,
    },
    0.36,
  );
  projectCaseStudyTimeline.to(
    paperState,
    {
      topWidth: finalWidth,
      topY: -4,
      bottomWidth: finalWidth,
      bottomY: finalBottom,
      radius: 0,
      curve: 0,
      duration: 0.42,
      ease: "power4.out",
      onUpdate: paperWarp.render,
    },
    0.78,
  );
  projectCaseStudyTimeline.set(
    caseStudyLayer,
    {
      backgroundColor: BACKGROUND_COLOR,
    },
    0.98,
  );
  projectCaseStudyTimeline.to(
    folderFrontMask,
    {
      y: 10,
      duration: 0.2,
      ease: "power2.out",
    },
    0.46,
  );
  projectCaseStudyTimeline.set(
    folderFrontMask,
    {
      visibility: "hidden",
    },
    0.72,
  );
}

function setupProjectCaseStudies() {
  projectFileButtons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;

    button.addEventListener("click", (event) => {
      event.preventDefault();
      openProjectCaseStudy(button);
    });
  });

  caseStudyProgressButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const sectionId = button.dataset.caseStudyJump;
      if (sectionId === undefined) return;
      scrollToCaseStudySection(sectionId);
    });
  });

  caseStudyCloseButton?.addEventListener("click", () => {
    closeProjectCaseStudy(false);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeProjectCaseStudy(false);
  });
}

function isIntroOwlDataReady() {
  return (
    introOwlState.luma !== null &&
    introOwlState.edge !== null &&
    introOwlState.mask !== null &&
    introOwlState.frameSize > 0 &&
    introOwlState.frameCount > 0
  );
}

function refreshIntroOwlDataDependents() {
  if (activePageId !== "work") return;

  updateIntroOwlLayout();

  if (introOwlAssemblyState.active) {
    refreshIntroOwlAssemblyGlyphs();
    renderIntroOwlAssembly();
  } else if (introOwlAssemblyState.complete) {
    renderIntroOwl(introOwlState.currentFramePosition);
  }

  if (workOwlSceneActive) {
    updateWorkOwlCanvasSize();
    renderWorkOwlFrame(
      workOwlRenderState.rendered
        ? workOwlRenderState.currentFramePosition
        : getWorkOwlInitialFramePosition(),
    );
    if (footerInteractionState !== "playing") {
      applyWorkOwlSceneProgress(workOwlSceneProgress);
    }
  }

  // Loading the canvas data does not change document geometry. Refreshing all
  // triggers here could interrupt a first Safari scroll while the data was
  // finishing in the background.
  ScrollTrigger.update();
}

function waitForCapabilityCardImage(image) {
  if (image.complete) return Promise.resolve();

  return new Promise((resolve) => {
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", resolve, { once: true });
  });
}

async function decodeImageAsset(image) {
  await waitForCapabilityCardImage(image);
  if (typeof image.decode === "function" && image.naturalWidth > 0) {
    await image.decode().catch(() => {});
  }
  // Yield between texture uploads so WebKit never receives one large decode
  // completion burst on the frame that first reveals a section.
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
}

async function decodeImageAssets(images, concurrency = 2) {
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, images.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < images.length) {
      const image = images[nextIndex];
      nextIndex += 1;
      if (image instanceof HTMLImageElement) {
        await decodeImageAsset(image);
      }
    }
  });

  await Promise.all(workers);
}

function warmCapabilityCardAssets(priority = "auto") {
  capabilityCardImages.forEach((image) => {
    image.loading = "eager";
    image.fetchPriority = priority;
  });

  if (capabilityCardAssetWarmupPromise !== null) {
    return capabilityCardAssetWarmupPromise;
  }

  capabilityCardAssetWarmupPromise = (async () => {
    await decodeImageAssets(capabilityCardImages, 2);
  })();

  return capabilityCardAssetWarmupPromise;
}

function warmWorkWaveAssets(priority = "auto") {
  workWaveImages.forEach((image) => {
    image.loading = "eager";
    image.fetchPriority = priority;
  });

  if (workWaveAssetWarmupPromise !== null) {
    return workWaveAssetWarmupPromise;
  }

  workWaveAssetWarmupPromise = (async () => {
    await decodeImageAssets(workWaveImages, 2);
  })();

  return workWaveAssetWarmupPromise;
}

function beginPostStartupAssetWarmup(priority = "auto") {
  window.clearTimeout(postStartupAssetWarmupTimer);
  postStartupAssetWarmupTimer = 0;

  return Promise.all([
    warmCapabilityCardAssets(priority),
    warmWorkWaveAssets(priority),
  ]);
}

function schedulePostStartupAssetWarmup() {
  window.clearTimeout(postStartupAssetWarmupTimer);
  // Keep the startup logo, type and camera data uncontested for the first
  // paint. The deterministic delay still begins card/gallery decoding while
  // the entry screen is visible, well before either section can be reached.
  postStartupAssetWarmupTimer = window.setTimeout(() => {
    postStartupAssetWarmupTimer = 0;
    beginPostStartupAssetWarmup("auto").catch((error) => {
      console.error("Unable to warm post-startup image assets.", error);
    });
  }, 900);
}

function waitForVisualWarmupOpportunity() {
  if (!startupExperienceReady || !workScrollFast) {
    return new Promise((resolve) => window.requestAnimationFrame(resolve));
  }

  return new Promise((resolve) => {
    let checkTimer = 0;
    const finish = () => {
      window.clearTimeout(checkTimer);
      if (workScrollFast) {
        checkTimer = window.setTimeout(finish, 120);
        return;
      }

      window.removeEventListener("workScrollSettled", finish);
      window.requestAnimationFrame(resolve);
    };
    window.addEventListener("workScrollSettled", finish, { once: true });
    checkTimer = window.setTimeout(finish, 140);
  });
}

async function prewarmSafariCameraGlyphPipeline() {
  if (
    !IS_SAFARI_BROWSER ||
    state.frameCount <= 0 ||
    state.density === null
  ) {
    return;
  }

  // WebKit otherwise compiles the density/mask interpolation pipeline during
  // the visitor's first wheel gesture. Exercise representative source frames
  // while the startup cover still owns the screen, then discard the temporary
  // arrays so the authored camera starts from a completely clean state.
  ensureCameraGlyphAtlas();
  const sampleCount = Math.min(16, Math.max(1, state.frameCount));

  for (let index = 0; index < sampleCount; index += 1) {
    const framePosition = sampleCount === 1
      ? 0
      : (index / (sampleCount - 1)) * (state.frameCount - 1);
    const glyphCells = getCameraGlyphCells(framePosition);

    // Include the deterministic glyph lookup in the warm path; drawImage is
    // already exercised when the Safari atlas is prepared by updateLayout().
    for (const glyphCell of glyphCells) {
      getGlyph(glyphCell.column, glyphCell.row, glyphCell.ink);
    }

    if (index % 2 === 1 && index < sampleCount - 1) {
      await waitForVisualWarmupOpportunity();
    }
  }

  state.glyphCellCache.clear();
  state.currentFrameBucket = -1;
  state.currentProgressBucket = -1;
  state.currentScrambleBucket = -1;
}

async function prewarmDeferredCanvasEffects() {
  await prewarmSafariCameraGlyphPipeline();
  await waitForVisualWarmupOpportunity();
  capabilityGlyphBurstState.maxDpr = CAPABILITY_GLYPH_BURST_MAX_DPR;
  buildGlyphBurst(capabilityGlyphBurstState);
  clearGlyphBurst(capabilityGlyphBurstState);

  await waitForVisualWarmupOpportunity();

  projectGlyphBurstState.maxDpr = CAPABILITY_GLYPH_BURST_MAX_DPR;
  buildGlyphBurst(projectGlyphBurstState);
  clearGlyphBurst(projectGlyphBurstState);

  await waitForVisualWarmupOpportunity();

  prepareFooterGlyphBurst();
  clearGlyphBurst(footerGlyphBurstState);

  await waitForVisualWarmupOpportunity();

  if (isIntroOwlDataReady() && !workOwlRenderState.rendered) {
    updateWorkOwlCanvasSize();
    renderWorkOwlFrame(getWorkOwlInitialFramePosition());
  }

  await prewarmSafariOwlRasterCaches();
}

function settleWithTimeout(promise, timeoutMs) {
  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(resolve, timeoutMs);

    promise
      .then(resolve, resolve)
      .finally(() => {
        window.clearTimeout(timeoutId);
      });
  });
}

async function waitForCriticalFonts() {
  if (!document.fonts?.load) return;

  await settleWithTimeout(
    Promise.all([
      document.fonts.load('400 21px "Lay Grotesk"'),
      document.fonts.load('400 36px "Gambarino"'),
      document.fonts.load('700 36px "Satoshi"'),
      document.fonts.load('400 52px "Instrument Serif"'),
      document.fonts.load("400 40px Trattatello"),
      document.fonts.load('400 32px "Gambarino"'),
      document.fonts.load('400 128px "Geist Pixel Square"'),
    ]),
    900,
  );
}

async function loadFrameData() {
  const metadata = await fetch("/frame-data.json", { priority: "low" })
    .then((response) => response.json());
  const [densityBuffer, silhouetteBuffer] = await Promise.all([
    fetch("/frame-density.bin", { priority: "low" }).then((response) => {
      if (!response.ok) {
        throw new Error("Unable to load frame-density.bin");
      }
      return response.arrayBuffer();
    }),
    fetch("/frame-silhouette.bin", { priority: "low" }).then((response) => {
      if (!response.ok) {
        throw new Error("Unable to load frame-silhouette.bin");
      }
      return response.arrayBuffer();
    }),
  ]);
  const density = new Uint8Array(densityBuffer);
  const silhouette = new Uint8Array(silhouetteBuffer);
  const frameSize = density.length / metadata.frameCount;
  const maskFrameSize = silhouette.length / metadata.frameCount;
  const inferredRows = Math.round(Math.sqrt((frameSize * 9) / 16));
  const inferredCols = Math.round((inferredRows * 16) / 9);
  const inferredMaskRows = Math.round(Math.sqrt((maskFrameSize * 9) / 16));
  const inferredMaskCols = Math.round((inferredMaskRows * 16) / 9);

  if (inferredCols * inferredRows !== frameSize) {
    throw new Error("Unable to infer density grid dimensions.");
  }

  if (inferredMaskCols * inferredMaskRows !== maskFrameSize) {
    throw new Error("Unable to infer silhouette grid dimensions.");
  }

  state.metadata = metadata;
  state.cols = inferredCols;
  state.rows = inferredRows;
  state.maskCols = inferredMaskCols;
  state.maskRows = inferredMaskRows;
  state.frameCount = metadata.frameCount;
  state.sourceWidth = metadata.sourceWidth;
  state.sourceHeight = metadata.sourceHeight;
  state.density = density;
  state.silhouette = silhouette;
}

async function loadIntroOwlData() {
  if (!(introOwlCanvas instanceof HTMLCanvasElement) || introOwlCtx === null) return;
  if (isIntroOwlDataReady()) return;
  if (introOwlDataPromise !== null) return introOwlDataPromise;

  introOwlDataPromise = (async () => {
    const metadata = await fetch("/intro-owl-data.json", { priority: "low" }).then((response) => {
      if (!response.ok) {
        throw new Error("Unable to load intro-owl-data.json");
      }
      return response.json();
    });
    const [lumaBuffer, edgeBuffer, maskBuffer] = await Promise.all([
      fetch(metadata.lumaFile, { priority: "low" }).then((response) => {
        if (!response.ok) {
          throw new Error("Unable to load intro owl luma data.");
        }
        return response.arrayBuffer();
      }),
      fetch(metadata.edgeFile, { priority: "low" }).then((response) => {
        if (!response.ok) {
          throw new Error("Unable to load intro owl edge data.");
        }
        return response.arrayBuffer();
      }),
      fetch(metadata.maskFile, { priority: "low" }).then((response) => {
        if (!response.ok) {
          throw new Error("Unable to load intro owl mask data.");
        }
        return response.arrayBuffer();
      }),
    ]);
    const luma = new Uint8Array(lumaBuffer);
    const edge = new Uint8Array(edgeBuffer);
    const mask = new Uint8Array(maskBuffer);
    const frameSize = metadata.cols * metadata.rows;
    const frameCount = Math.max(1, metadata.frameCount ?? 1);
    const expectedSize = frameSize * frameCount;

    if (
      luma.length !== expectedSize ||
      edge.length !== expectedSize ||
      mask.length !== expectedSize
    ) {
      throw new Error("Intro owl data dimensions do not match metadata.");
    }

    introOwlState.metadata = metadata;
    introOwlState.cols = metadata.cols;
    introOwlState.rows = metadata.rows;
    introOwlState.frameCount = frameCount;
    introOwlState.frameSize = frameSize;
    introOwlState.currentFrameIndex = 0;
    introOwlState.currentFramePosition = 0;
    introOwlState.currentFrameBucket = -1;
    introOwlState.currentScrambleBucket = -1;
    introOwlState.scrambleTime = 0;
    introOwlState.lastRenderTime = -Infinity;
    introOwlState.loopStartTime = null;
    introOwlState.luma = luma;
    introOwlState.edge = edge;
    introOwlState.mask = mask;
    introOwlState.repairMask = null;
    introOwlState.bodyCoreMask = null;
    introOwlState.bodyLockMask = null;
    introOwlState.bodyAnchors = [];
    introOwlState.temporalReady = false;
    introOwlState.glyphCellCache.clear();
    introOwlState.clipMaskCache.clear();
    introOwlState.layoutCacheKey = "";

    refreshIntroOwlDataDependents();
  })();

  try {
    await introOwlDataPromise;
  } catch (error) {
    introOwlDataPromise = null;
    throw error;
  }
}

async function loadWorkFooterSceneData() {
  if (!(workFooterSceneCanvas instanceof HTMLCanvasElement) || workFooterSceneCtx === null) {
    return;
  }

  const metadata = await fetch("/work-footer-scene-data.json").then((response) => {
    if (!response.ok) {
      throw new Error("Unable to load work-footer-scene-data.json");
    }

    return response.json();
  });
  const assetVersion = encodeURIComponent(
    metadata.version ?? `${metadata.cols}x${metadata.rows}`,
  );
  const versionedAssetPath = (path) => `${path}?v=${assetVersion}`;
  const [
    lumaBuffer,
    edgeBuffer,
    maskBuffer,
    weightBuffer,
    poleBuffer,
    separatorBuffer,
    cellBuffer,
  ] = await Promise.all([
    fetch(versionedAssetPath(metadata.lumaFile), { cache: "no-store" }).then((response) => {
      if (!response.ok) {
        throw new Error("Unable to load work footer scene luma data.");
      }

      return response.arrayBuffer();
    }),
    fetch(versionedAssetPath(metadata.edgeFile), { cache: "no-store" }).then((response) => {
      if (!response.ok) {
        throw new Error("Unable to load work footer scene edge data.");
      }

      return response.arrayBuffer();
    }),
    fetch(versionedAssetPath(metadata.maskFile), { cache: "no-store" }).then((response) => {
      if (!response.ok) {
        throw new Error("Unable to load work footer scene mask data.");
      }

      return response.arrayBuffer();
    }),
    fetch(versionedAssetPath(metadata.weightFile), { cache: "no-store" }).then((response) => {
      if (!response.ok) {
        throw new Error("Unable to load work footer scene weight data.");
      }

      return response.arrayBuffer();
    }),
    metadata.poleFile
      ? fetch(versionedAssetPath(metadata.poleFile), { cache: "no-store" }).then((response) => {
        if (!response.ok) {
          throw new Error("Unable to load work footer scene pole data.");
        }

        return response.arrayBuffer();
      })
      : Promise.resolve(null),
    metadata.separatorFile
      ? fetch(versionedAssetPath(metadata.separatorFile), { cache: "no-store" }).then((response) => {
        if (!response.ok) {
          throw new Error("Unable to load work footer scene separator data.");
        }

        return response.arrayBuffer();
      })
      : Promise.resolve(null),
    metadata.cellFile
      ? fetch(versionedAssetPath(metadata.cellFile), { cache: "no-store" }).then((response) => {
        if (!response.ok) {
          throw new Error("Unable to load work footer scene cell data.");
        }

        return response.arrayBuffer();
      })
      : Promise.resolve(null),
  ]);
  const luma = new Uint8Array(lumaBuffer);
  const edge = new Uint8Array(edgeBuffer);
  const mask = new Uint8Array(maskBuffer);
  const weight = new Uint8Array(weightBuffer);
  const pole = poleBuffer === null ? null : new Uint8Array(poleBuffer);
  const separatorStrength = separatorBuffer === null
    ? null
    : new Float32Array(separatorBuffer);
  const cellData = cellBuffer === null
    ? null
    : new DataView(cellBuffer);
  const cellCount = Math.max(0, metadata.cellCount ?? 0);
  const frameSize = metadata.cols * metadata.rows;

  if (
    luma.length !== frameSize ||
    edge.length !== frameSize ||
    mask.length !== frameSize ||
    weight.length !== frameSize ||
    (pole !== null && pole.length !== frameSize) ||
    (separatorStrength !== null && separatorStrength.length !== frameSize) ||
    (
      cellData !== null &&
      cellData.byteLength !== cellCount * WORK_FOOTER_SCENE_CELL_RECORD_BYTES
    )
  ) {
    throw new Error("Work footer scene data dimensions do not match metadata.");
  }

  workFooterSceneState.metadata = metadata;
  workFooterSceneState.cols = metadata.cols;
  workFooterSceneState.rows = metadata.rows;
  workFooterSceneState.frameSize = frameSize;
  workFooterSceneState.luma = luma;
  workFooterSceneState.edge = edge;
  workFooterSceneState.mask = mask;
  workFooterSceneState.weight = weight;
  workFooterSceneState.pole = pole;
  workFooterSceneState.separatorStrength = separatorStrength;
  workFooterSceneState.cellData = cellData;
  workFooterSceneState.cellCount = cellCount;
  workFooterSceneState.cells = [];
  workFooterSceneState.assemblyActive = false;
  workFooterSceneState.assemblyComplete = false;
  workFooterSceneState.assemblyElapsed = 0;
  workFooterSceneState.assemblyGlyphs = [];
  workFooterSceneState.assemblySettledGlyphs = [];
  workFooterSceneState.assemblySettledIndex = 0;
  workFooterSceneState.assemblyGlyphCache = [];
  workFooterSceneState.assemblyGlyphCacheKey = "";
  workFooterSceneState.spriteWarmCacheKey = "";
  workFooterSceneState.layoutCacheKey = "";
  resetWorkFooterSceneRenderCaches(true);
}

let viewportResizeFrame = 0;
let viewportResizeTimer = 0;
let lastWindowViewportWidth = window.innerWidth;
let lastVisualViewportWidth = window.visualViewport?.width ?? window.innerWidth;

function scheduleViewportResize() {
  window.clearTimeout(viewportResizeTimer);
  viewportResizeTimer = window.setTimeout(() => {
    viewportResizeTimer = 0;
    if (viewportResizeFrame !== 0) return;

    viewportResizeFrame = window.requestAnimationFrame(() => {
      viewportResizeFrame = 0;
      resize();

      if (activePageId === "work") {
        ScrollTrigger.refresh();
        syncWorkWaveGalleryToScroll();
        scheduleCriticalSceneSync();
        prewarmDeferredCanvasEffects()
          .then(prepareFooterInteractionTimeline)
          .catch(() => {});
      }
    });
  }, 120);
}

function handleWindowResize() {
  const nextWidth = window.innerWidth;
  const widthChanged = Math.abs(nextWidth - lastWindowViewportWidth) >= 1;
  lastWindowViewportWidth = nextWidth;

  // Safari's collapsing browser chrome can emit height-only resize events on
  // touch devices while scrolling. Those events do not alter this layout and
  // must not refresh every ScrollTrigger in the middle of a scene.
  if (
    IS_SAFARI_BROWSER &&
    window.matchMedia("(pointer: coarse)").matches &&
    !widthChanged
  ) {
    return;
  }

  scheduleViewportResize();
}

function handleVisualViewportResize() {
  const nextWidth = window.visualViewport?.width ?? window.innerWidth;
  if (Math.abs(nextWidth - lastVisualViewportWidth) < 1) return;

  lastVisualViewportWidth = nextWidth;
  scheduleViewportResize();
}

async function boot() {
  setupStartupEntry();
  updateIntroScale();
  setupShellInteractions();
  // Give the browser one paint opportunity to commit the visible entry scene
  // before initiating the multi-megabyte canvas data streams. The animation
  // has already started; this only separates critical and background network
  // work by a single frame.
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
  // Fetch the intro owl in parallel with the camera data while the startup
  // cover is still visible. It must never be a first-scroll lazy dependency.
  const introOwlPreload = loadIntroOwlData().catch((error) => {
    console.error("Unable to preload the intro owl data.", error);
  });
  await loadFrameData();
  window.scrollTo(0, 0);
  updateIntroScale();
  updateLayout();
  updateIntroOwlLayout();
  clearIntroOwlCanvas();
  setupSmoothScroll();
  setCurrentPage("work", false);
  await waitForCriticalFonts();
  buildPageTransitionGrid();
  setupScroll();
  setupIntroReveal();
  setupIntroOwlExit();
  setupIntroOwlCursorLabel();
  setupCameraCursorLabel();
  setupWorkOwlScene();
  setupWorkWaveGallery();
  setupCapabilityCards();
  setupCapabilityCardHoverEffects();
  setupProjectFolderReveals();
  setupProjectCaseStudies();
  setupPlaygroundVideos();
  setupCameraRenderLoop();
  setupIntroOwlScramble();
  setupWorkOwlRenderLoop();

  // Begin image decoding after the startup's critical paint has had a clear
  // network window. The fixed schedule is deliberately not idle-only: Safari
  // must still prepare these sections before a fast first scroll reaches them.
  schedulePostStartupAssetWarmup();
  // Canvas preparation is intentionally independent from image decoding.
  // On a cold connection the card textures may take longer, but that must
  // never postpone burst/footer preparation until the user reaches them.
  const canvasEffectsReady = Promise.resolve(introOwlPreload)
    .then(() => prewarmDeferredCanvasEffects());

  window.addEventListener("resize", handleWindowResize, { passive: true });
  window.visualViewport?.addEventListener("resize", handleVisualViewportResize, {
    passive: true,
  });

  ScrollTrigger.refresh();
  resetIntroTyperReveal();
  resetRouteScrollToTop();
  ScrollTrigger.update();
  await startupEntryChoice;
  await introOwlPreload;
  // A user entry immediately promotes the already-scheduled image work. This
  // changes request priority only; authored timelines and reveal states remain
  // identical.
  const postStartupAssetsReady = beginPostStartupAssetWarmup("high").catch((error) => {
    console.error("Unable to warm post-startup image assets.", error);
  });
  // A cold Safari visit must not discover and decode the card/gallery
  // textures only after their ScrollTriggers have already been crossed.
  await settleWithTimeout(
    postStartupAssetsReady,
    3200,
  );
  await settleWithTimeout(canvasEffectsReady, IS_SAFARI_BROWSER ? 5200 : 1600);
  prepareFooterInteractionTimeline();
  resetIntroTyperReveal();
  resetRouteScrollToTop();
  ScrollTrigger.update();
  await playStartupGlyphTransition(() => {
    resetRouteScrollToTop();
    revealStartupShell();
    playCameraAssemblyIntro();
    window.setTimeout(playHeroIntro, 180);
  });
  resetRouteScrollToTop();
  startupExperienceReady = true;
  // The startup shell changes overflow and viewport ownership. Refreshing on
  // the next paint gives both Lenis and ScrollTrigger post-unlock geometry.
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
  smoothScroller?.resize?.();
  ScrollTrigger.refresh();
  syncWorkWaveGalleryToScroll();
  scheduleCriticalSceneSync();
}

function recoverDocumentAfterInterruptedBoot(error = null) {
  if (error) {
    console.error("The animated startup was interrupted; restoring the document.", error);
  }

  window.clearTimeout(pageTransitionFailsafeTimer);
  pageTransitionFailsafeTimer = 0;
  pageTransitionTimeline?.kill();
  pageTransitionTimeline = null;
  pageTransitionActive = false;
  document.documentElement.classList.remove(
    "is-startup-transitioning",
    "is-page-transitioning",
  );
  document.body.classList.remove("is-startup-loading");
  pageTransitionRoot?.classList.remove("is-active", "is-covered");
  pageTransitionRoot?.setAttribute("aria-hidden", "true");
  if (pageTransitionRoot instanceof HTMLElement) {
    gsap.set(pageTransitionRoot, { autoAlpha: 0 });
  }
  hideStartupLoader();
  if (heroIntro instanceof HTMLElement) {
    gsap.set(heroIntro, { xPercent: 0, autoAlpha: 1 });
  }
  releaseHeroScrollGate();
  cancelIntroRevealLock();
  startupExperienceReady = true;

  window.requestAnimationFrame(() => {
    ScrollTrigger.refresh();
    ScrollTrigger.update();
    scheduleCriticalSceneSync();
  });
}

// Safari restores pages aggressively from its back/forward cache. If the page
// was cached during a short animation lock, its timers do not necessarily
// resume in the same order; restore the document to an interactive state.
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  recoverDocumentAfterInterruptedBoot();
});

boot().catch(recoverDocumentAfterInterruptedBoot);
