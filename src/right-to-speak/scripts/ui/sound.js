const TYPES = new Set(["word", "urgent", "personal", "floor"]);

export async function playSound(type, preferences) {
  if (!TYPES.has(type) || !preferences.sound || preferences.soundTypes?.[type] === false) return "disabled";
  if (!game.settings.get("right-to-speak", "allowSound")) return "disabled";
  try {
    const audio = new Audio(`modules/right-to-speak/sounds/${type}.wav`);
    audio.volume = Math.max(0, Math.min(1, Number(preferences.volume) || 0));
    await audio.play();
    return "played";
  } catch { return "blocked"; }
}
