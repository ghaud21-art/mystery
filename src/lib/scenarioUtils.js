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

export const PLAYER_TABS = [
  { key: "all", label: "전체", test: () => true },
  { key: "2", label: "2인", test: (r) => r.min <= 2 && r.max >= 2 },
  { key: "3", label: "3인", test: (r) => r.min <= 3 && r.max >= 3 },
  { key: "4", label: "4인", test: (r) => r.min <= 4 && r.max >= 4 },
  { key: "5", label: "5인", test: (r) => r.min <= 5 && r.max >= 5 },
  { key: "6+", label: "6인+", test: (r) => r.max >= 6 },
];
