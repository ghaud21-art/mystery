// Date -> "YYYY-MM-DD" (로컬 타임존 기준). toISOString()은 UTC로 변환하기 때문에
// 한국시간(UTC+9) 자정이 전날로 밀려 찍히는 버그가 생겨 반드시 이 함수를 써야 함.
export function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// "YYYY-MM-DDTHH:mm" ~ "YYYY-MM-DDTHH:mm" 사이의 모든 날짜를 "YYYY-MM-DD" 문자열 배열로 펼침.
export function expandDateRange(startIso, endIso) {
  const start = startIso.slice(0, 10);
  const end = endIso ? endIso.slice(0, 10) : start;
  const keys = [];
  let cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) {
    keys.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}
