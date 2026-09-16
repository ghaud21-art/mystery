// "5명", "4~5명", "1~8명" 같은 인원수 문자열에서 최소/최대 인원을 뽑아냄.
export function parsePlayerRange(str) {
  if (!str) return null;
  const m = String(str).match(/(\d+)(?:\s*[~\-]\s*(\d+))?/);
  if (!m) return null;
  const min = parseInt(m[1], 10);
  const max = m[2] ? parseInt(m[2], 10) : min;
  return { min, max };
}

// 띄어쓰기·특수문자 차이는 무시하고 글자(한글/영문/숫자)만 남겨서 같은 작품인지 비교.
export function normalizeTitle(t) {
  return (t || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

// 컨텐츠 장르(머더미스터리 / 크라임씬 / 스크립트킬). 기존 시나리오는 genre 필드가 없을 수 있어서
// 이 배열의 첫 값(머더미스터리)을 기본값으로 취급한다.
export const GENRES = ["머더미스터리", "크라임씬", "스크립트킬"];
export function scenarioGenre(s) {
  return s?.genre || GENRES[0];
}

// 0.5점 단위 별점을 별 문자열로 표시. 정수면 "★★★★☆"처럼 별만, 0.5가 끼면 소수점 값을
// 괄호로 덧붙임(반쪽 별 글리프는 기기/폰트마다 다르게 보이거나 아예 안 보이는 경우가 많아서).
export function formatStars(rating, max = 5) {
  if (!rating) return "";
  const floor = Math.floor(rating);
  const stars = "★".repeat(floor) + "☆".repeat(Math.max(0, max - floor));
  return Number.isInteger(rating) ? stars : `${stars} (${rating})`;
}

export const PLAYER_TABS = [
  { key: "all", label: "전체", test: () => true },
  { key: "2", label: "2인", test: (r) => r.min <= 2 && r.max >= 2 },
  { key: "3", label: "3인", test: (r) => r.min <= 3 && r.max >= 3 },
  { key: "4", label: "4인", test: (r) => r.min <= 4 && r.max >= 4 },
  { key: "5", label: "5인", test: (r) => r.min <= 5 && r.max >= 5 },
  { key: "6+", label: "6인+", test: (r) => r.max >= 6 },
];
