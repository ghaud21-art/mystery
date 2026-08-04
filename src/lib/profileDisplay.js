export const AVATAR_EMOJIS = [
  "🔍", "🕵️", "🎩", "🔦", "🗝️", "📖",
  "🧐", "🖋️", "🎭", "🃏", "🔮", "🐈‍⬛",
  "🌙", "🕯️", "🧣", "☕",
];

export function displayName(profile) {
  return profile?.nickname?.trim() || profile?.name || "이름 없는 탐정";
}

export function displayAvatar(profile) {
  return profile?.avatarEmoji || null;
}
