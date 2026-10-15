const TYPES = new Set(["word", "urgent", "personal", "floor"]);

export async function playSound(type, preferences) {
  if (!TYPES.has(type) || !preferences.sound || preferences.soundTypes?.[type] === false) return "disabled";
  if (!game.settings.get("right-to-speak", "allowSound")) return "disabled";
  try {
    const audio = new Audio(`modules/right-to-speak/sounds/${type}.wav`);
    const requested = Math.max(0, Math.min(1, Number(preferences.volume) || 0));
    audio.volume = Math.min(type === "urgent" ? 0.75 : 0.65, requested);
    await audio.play();
    return "started";
  } catch (error) { return error?.name === "NotAllowedError" ? "blocked" : "failed"; }
}
