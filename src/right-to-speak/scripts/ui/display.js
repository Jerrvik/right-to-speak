// Earlier three-client test runs placed a diagnostic marker in the message body.
// Keep stored payloads unchanged so existing IDs, retries and receipts still match.
export function displayContent(value) {
  return String(value ?? "").replace(/^(?:RTS_[A-Z][A-Z0-9_]*?_[0-9]{10,}_|RTS_REDUCED_MOTION_?)/, "");
}

export function displayUserName(user, mode = "player", fallback = "") {
  const playerName = typeof user?.name === "string" ? user.name.trim() : "";
  const characterName = typeof user?.character?.name === "string" ? user.character.name.trim() : "";
  return (mode === "character" && characterName) || playerName || fallback;
}
