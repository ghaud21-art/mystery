// 일회성: 사용자가 준 "현재 크라임씬 테마 목록"에 해당하는데 장르가 크라임씬으로 안 돼 있는 시나리오를
// 찾아서 genre를 "크라임씬"으로 바꿈. APPLY=1이 아니면 바꾸지 않고 결과만 출력(드라이런).
// GitHub Actions workflow_dispatch로 수동 실행 (.github/workflows/fix-crime-genre.yml).
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const LIST = `여배우 살인사건(퍼즐팩토리 홍대)
카지노 살인사건(퍼즐팩토리 홍대)
백설공주 살인사건(퍼즐팩토리 홍대)
산중호걸 살호사건(퍼즐팩토리 홍대)
호텔 살인사건(크라임씬 서면)
대저택 살인사건(크라임씬 서면)
미술실 살인사건(크라임씬 서면)
석고상 살인사건(퍼즐팩토리 홍대)
검은나비 살인사건(퍼즐팩토리 홍대)
산장 살인사건(퍼즐팩토리 홍대)
산장 살인사건(크라임씬 서면)
피의 결혼식(코드네임블랙 남포)
교도소 살인사건(크라임씬 서면)
십자가 살인사건(크라임씬 서면)
퍼팩성 살인사건(퍼즐팩토리 분당)
가면파티 살인사건(퍼즐팩토리 분당)
아파트 살인사건(퍼즐팩토리 분당)
최진사댁 살인사건(퍼즐팩토리 홍대)
민트카페 살인사건(퍼즐팩토리 홍대)
신입생 오티 살인사건(크라임씬 서면)
유튜버 살인사건(크라임씬 서면)
최피디 살인사건(트릭 크라임씬 대전)
폐정신병원 살인사건(퍼즐팩토리 홍대)
중전마마 살인사건(퍼즐팩토리 홍대)
그믐달 살인사건(엑스크라임 건대)
호그와트 살인사건(퍼즐팩토리 강남)
경성호텔 살인사건(퍼즐팩토리 강남)
인형저택 살인사건(퍼즐팩토리 홍대)
역병마을 살인사건(퍼즐팩토리 동성로)
베이커가 살인사건(퍼즐팩토리 동성로)
코가학원 살인사건(코티지가든 합정)
퍼팩공작 살인사건(퍼즐팩토리 홍대)
타짜 살인사건(퍼즐팩토리 강남)
하얀방 살인사건(퍼즐팩토리 강남)
나무꾼 살인사건(퍼즐팩토리 강남)
코가사 살인사건(코티지가든 합정)
홀덤펍 살인사건(미스터리 크라임씬 대구)
도깨비마을 살인사건(퍼즐팩토리 분당)
성균관 살인사건(퍼즐팩토리 강남)
퍼펙예고 살인사건(퍼즐팩토리 강남)
경성도박장 살인사건(엑스크라임 건대)
산장 살인사건(퍼즐팩토리 홍대)
벚꽃축제 살인사건(퍼즐팩토리 홍대)
노트르담 살인사건(퍼즐팩토리 홍대)
제5수감동 살인사건(엑스크라임 강남)
다나아 종합병원 살인사건(엑스크라임 강남)
폐가 살인사건(퍼즐팩토리 강남)
하와이 살인사건(퍼즐팩토리 강남)
장화홍련 살인사건(퍼즐팩토리 홍대)
잔혹동화(크라임챔버)
서울의 봄(크라임챔버)
103호(크라임챔버)
2008 살인사건(퍼즐팩토리 강남)
매향루 살인사건(퍼즐팩토리 성수)
그랜드퍼펙호텔 살인사건(퍼즐팩토리 성수)
폐공장 살인사건(퍼즐팩토리 성수)
연애프로 살인사건(퍼즐팩토리 부평)
분신사바 살인사건(퍼즐팩토리 부평)`.split("\n");

const norm = (t) => (t || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const stripParen = (t) => (t || "").replace(/\s*\([^)]*\)\s*$/, "");

const wanted = new Map(); // 정규화한 제목 -> 원본 목록 표기들
for (const line of LIST) {
  const key = norm(stripParen(line));
  if (!wanted.has(key)) wanted.set(key, []);
  wanted.get(key).push(line.trim());
}

const apply = process.env.APPLY === "1";
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) }));
const snap = await db.collection("scenarios").get();
const scenarios = snap.docs.map((d) => ({ ref: d.ref, id: d.id, ...d.data() }));

const matchedKeys = new Set();
const toChange = [];
let alreadyCrime = 0;
for (const s of scenarios) {
  const keys = [norm(s.title), norm(stripParen(s.title))];
  const key = keys.find((k) => wanted.has(k));
  if (!key) continue;
  matchedKeys.add(key);
  if (s.genre === "크라임씬") alreadyCrime++;
  else toChange.push(s);
}

console.log(`목록 ${LIST.length}줄 (고유 제목 ${wanted.size}개)`);
console.log(`DB 시나리오 총 ${scenarios.length}개 / 현재 크라임씬 장르 ${scenarios.filter((s) => s.genre === "크라임씬").length}개`);
console.log(`목록과 일치하는 DB 시나리오: 이미 크라임씬 ${alreadyCrime}개, 바꿔야 할 것 ${toChange.length}개`);
for (const s of toChange) console.log(`  변경 대상: "${s.title}" (현재 장르: ${s.genre || "없음(=머더미스터리)"}, 상태: ${s.status}, 제작사: ${s.publisher || "-"})`);
const unmatched = [...wanted.entries()].filter(([k]) => !matchedKeys.has(k)).flatMap(([, v]) => v);
console.log(`DB에서 못 찾은 목록 항목 ${unmatched.length}개:`);
for (const u of unmatched) console.log(`  - ${u}`);
const extra = scenarios.filter((s) => s.genre === "크라임씬" && !keysIn(s));
function keysIn(s) { return [norm(s.title), norm(stripParen(s.title))].some((k) => wanted.has(k)); }
console.log(`DB엔 크라임씬인데 목록에 없는 것 ${extra.length}개:`);
for (const s of extra) console.log(`  + "${s.title}" (${s.publisher || "-"})`);

if (apply) {
  for (const s of toChange) await s.ref.update({ genre: "크라임씬" });
  console.log(`적용 완료: ${toChange.length}개를 크라임씬으로 변경`);
} else {
  console.log("드라이런이라 아무것도 바꾸지 않았어요 (APPLY=1로 실행하면 적용).");
}
