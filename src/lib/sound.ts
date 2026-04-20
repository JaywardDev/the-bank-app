"use client";

export type SoundName = "diceRoll" | "coin" | "yourTurn" | "auctionTurn";

const SOUND_SOURCES: Record<SoundName, string> = {
  diceRoll: "/sounds/dice_roll.mp3",
  coin: "/sounds/coin.mp3",
  yourTurn: "/sounds/your_turn.mp3",
  auctionTurn: "/sounds/auction_turn.mp3",
};

const audioBySound = new Map<SoundName, HTMLAudioElement>();
let unlockBound = false;

const ensureAudio = (sound: SoundName) => {
  let audio = audioBySound.get(sound);
  if (!audio) {
    audio = new Audio(SOUND_SOURCES[sound]);
    audio.preload = "auto";
    audioBySound.set(sound, audio);
  }
  return audio;
};

const unlockAllSounds = () => {
  for (const sound of Object.keys(SOUND_SOURCES) as SoundName[]) {
    const audio = ensureAudio(sound);
    audio.load();
  }
};

export const initializeSoundManager = () => {
  if (typeof window === "undefined" || unlockBound) {
    return;
  }

  unlockBound = true;
  const unlock = () => {
    unlockAllSounds();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };

  window.addEventListener("pointerdown", unlock, { once: true, passive: true });
  window.addEventListener("keydown", unlock, { once: true });
};

export const playSound = async (sound: SoundName) => {
  if (typeof window === "undefined") {
    return;
  }

  const audio = ensureAudio(sound);
  try {
    audio.currentTime = 0;
    await audio.play();
  } catch {
    // Progressive enhancement only: ignore blocked autoplay/device failures.
  }
};
