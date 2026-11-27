const NOTIF_SOUND_URL = '/api/remote/notif-sound';
const NOTIF_SOUND_FALLBACK_URL = '/sounds/cpgp-notif.mp3';
const SOUND_ENABLED_STORAGE_KEY = 'cpgp.notifSound.enabled.v1';
const VIBRATE_ENABLED_STORAGE_KEY = 'cpgp.notifVibrate.enabled.v1';

let sharedAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;
let lastPlayedAt = 0;

function getOrCreateAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    return null;
  }
  if (!sharedAudio) {
    sharedAudio = new Audio(NOTIF_SOUND_URL);
    sharedAudio.preload = 'auto';
    sharedAudio.addEventListener(
      'error',
      () => {
        if (sharedAudio && sharedAudio.src.includes('/api/remote/notif-sound')) {
          sharedAudio.src = NOTIF_SOUND_FALLBACK_URL;
        }
      },
      { once: true }
    );
  }
  return sharedAudio;
}

export function isNotifSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(SOUND_ENABLED_STORAGE_KEY);
    if (raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function setNotifSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      SOUND_ENABLED_STORAGE_KEY,
      enabled ? 'true' : 'false'
    );
  } catch {
    // ignore storage errors
  }
}

export function isNotifVibrateEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(VIBRATE_ENABLED_STORAGE_KEY);
    if (raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function setNotifVibrateEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      VIBRATE_ENABLED_STORAGE_KEY,
      enabled ? 'true' : 'false'
    );
  } catch {
    // ignore storage errors
  }
}

export function isAudioUnlocked(): boolean {
  return audioUnlocked;
}

/**
 * Unlocks HTMLAudioElement playback inside a user gesture (tap/click) on iOS Safari & Chrome Android.
 */
export async function unlockNotifAudio(playSample = false): Promise<boolean> {
  const audio = getOrCreateAudio();
  if (!audio) return false;

  try {
    if (playSample) {
      audio.volume = 1;
      audio.currentTime = 0;
      await audio.play();
      audioUnlocked = true;
      lastPlayedAt = Date.now();
      return true;
    }

    const prevVolume = audio.volume;
    audio.volume = 0.01;
    audio.currentTime = 0;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    audio.volume = prevVolume || 1;
    audioUnlocked = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * Plays `cpgp-notif.mp3` and optionally vibrates mobile devices.
 * Coalesces bursts within 800ms so simultaneous multi-platform completions chime once cleanly.
 */
export async function playCpgpNotifSound(options?: {
  force?: boolean;
  vibrate?: boolean;
}): Promise<boolean> {
  const force = options?.force ?? false;
  if (!force && !isNotifSoundEnabled()) {
    return false;
  }

  const now = Date.now();
  if (!force && now - lastPlayedAt < 800) {
    return true;
  }
  lastPlayedAt = now;

  if ((options?.vibrate ?? true) && isNotifVibrateEnabled()) {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate([180, 70, 220]);
      }
    } catch {
      // ignore vibration errors on unsupported browsers
    }
  }

  const audio = getOrCreateAudio();
  if (!audio) return false;

  try {
    audio.volume = 1;
    audio.currentTime = 0;
    await audio.play();
    audioUnlocked = true;
    return true;
  } catch {
    // Fallback: clone a fresh Audio instance in case the shared element was mid-seek
    try {
      const fallback = new Audio(NOTIF_SOUND_URL);
      fallback.volume = 1;
      await fallback.play();
      audioUnlocked = true;
      return true;
    } catch {
      return false;
    }
  }
}
