// "사건이 도착했습니다" 콘텐츠 시딩 — 재해복구용 폴백 스크립트 (기본 경로는 어드민 CMS의
// "JSON 가져오기"). 이 스크립트 자체엔 스포일러가 전혀 없음 — 콘텐츠는 CASE_SEED_JSON
// 환경변수로 실행 시점에만 주입되고, 이 파일이나 이 저장소 어디에도 커밋되지 않는다.
// 사용법: CASE_SEED_JSON="$(cat season.json)" FIREBASE_SERVICE_ACCOUNT_JSON="..." node scripts/import-case-season.mjs season1
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const seasonId = process.argv[2];
if (!seasonId) {
  console.error("사용법: node scripts/import-case-season.mjs <seasonId>  (CASE_SEED_JSON 환경변수 필요)");
  process.exit(1);
}

const raw = process.env.CASE_SEED_JSON;
if (!raw) {
  console.error("CASE_SEED_JSON 환경변수가 없어요.");
  process.exit(1);
}
const { season, days } = JSON.parse(raw);
if (!season || !days) {
  console.error('JSON은 {"season": {...}, "days": {"1": {...}, ...}} 형태여야 해요.');
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const batch = db.batch();
batch.set(db.doc(`caseSeasons/${seasonId}`), { ...season, published: !!season.published, createdAt: new Date().toISOString() });
for (const [day, patch] of Object.entries(days)) {
  batch.set(db.doc(`caseSeasons/${seasonId}/days/${day}`), { ...patch, day: Number(day) });
}
await batch.commit();

console.log(`완료: caseSeasons/${seasonId} + ${Object.keys(days).length}개 일차 저장됨.`);
