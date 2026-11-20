import { getPreferences, type ChimeKind } from "@/shared/preferences";

/**
 * "The AI has finished": a desktop notification while the page is in the
 * background, and/or a soft chime, as the user chose in Settings. Called by
 * the works shell when a canvas stops reporting busy.
 */

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Asks the browser for permission; resolves to whether notifications may be shown. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

let audio: AudioContext | null = null;

type Note = { freq: number; at: number; length: number; type?: OscillatorType; gain?: number; glideTo?: number };

/** Each chime is a few synthesized notes: nothing to download. */
const CHIMES: Record<ChimeKind, Note[]> = {
  // Two soft sine notes, a fifth apart: a page turning, not an alarm.
  soft: [
    { freq: 659.25, at: 0, length: 0.6 },
    { freq: 987.77, at: 0.12, length: 0.6 },
  ],
  // One struck bell: a fundamental and its bright, quickly fading partial.
  bell: [
    { freq: 880, at: 0, length: 1.4 },
    { freq: 880 * 2.76, at: 0, length: 0.5, gain: 0.35 },
    { freq: 880 * 5.4, at: 0, length: 0.25, gain: 0.15 },
  ],
  // Three wooden notes going up.
  marimba: [
    { freq: 523.25, at: 0, length: 0.32, type: "triangle" },
    { freq: 659.25, at: 0.1, length: 0.32, type: "triangle" },
    { freq: 783.99, at: 0.2, length: 0.45, type: "triangle" },
  ],
  // A major chord, rolled.
  chord: [
    { freq: 523.25, at: 0, length: 1.1, gain: 0.7 },
    { freq: 659.25, at: 0.05, length: 1.1, gain: 0.7 },
    { freq: 783.99, at: 0.1, length: 1.1, gain: 0.7 },
    { freq: 1046.5, at: 0.15, length: 1.2, gain: 0.6 },
  ],
  // A short bubble.
  pop: [{ freq: 520, glideTo: 880, at: 0, length: 0.14 }],
  // A water drop: a quick rise, gone.
  drop: [{ freq: 600, glideTo: 1500, at: 0, length: 0.22 }],
};

const VOLUME = { quiet: 0.04, normal: 0.08, loud: 0.16 } as const;

export const CHIME_KINDS = Object.keys(CHIMES) as ChimeKind[];

/** Plays a chime (the chosen one when none is named). */
export function playChime(kind: ChimeKind = getPreferences().chime, volume: keyof typeof VOLUME = getPreferences().chimeVolume) {
  try {
    audio ??= new AudioContext();
    const now = audio.currentTime;
    const peak = VOLUME[volume] ?? VOLUME.normal;
    for (const note of CHIMES[kind] ?? CHIMES.soft) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = note.type ?? "sine";
      const start = now + note.at;
      osc.frequency.setValueAtTime(note.freq, start);
      if (note.glideTo) osc.frequency.exponentialRampToValueAtTime(note.glideTo, start + note.length * 0.6);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(peak * (note.gain ?? 1), start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.length);
      osc.connect(gain).connect(audio.destination);
      osc.start(start);
      osc.stop(start + note.length + 0.05);
    }
  } catch {
    /* no audio: nothing to do */
  }
}

export function announceTaskDone(title: string, body: string) {
  const prefs = getPreferences();
  if (prefs.soundDone) playChime();
  if (prefs.notifyDone && notificationsSupported() && Notification.permission === "granted" && document.hidden) {
    try {
      const note = new Notification(title, { body, tag: "canvasanvil-done" });
      note.onclick = () => {
        window.focus();
        note.close();
      };
    } catch {
      /* some browsers only allow notifications from a service worker */
    }
  }
}
