// 일회성 정리 스크립트: 모든 유저의 기록(records) 중, 같은 작품을 여러 번 "빈 스텁"으로
// 중복 등록한 것들을 제거한다. 실제 내용(캐릭터/별점/메모/인생머미 표시)이 있는 기록은
// 절대 건드리지 않는다 — 진짜 재플레이 기록을 보호하기 위함.
//
// 규칙 (userId + normalizeTitle(scenarioName) 기준으로 그룹핑):
//   - 내용 있는 기록(rich)이 하나라도 있으면 → 내용 없는 빈 스텁(empty)은 전부 삭제
//   - 전부 빈 스텁이면 → 가장 먼저 만들어진 것 하나만 남기고 나머지 삭제
//
// DRY_RUN=true(기본)면 삭제 없이 로그만 출력. DRY_RUN=false면 실제 삭제 + 영향받은
// 유저의 playedTitles/favoriteTitles/playedCount를 남은 기록 기준으로 재계산한다.
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { normalizeTitle } from "../src/lib/scenarioUtils.js";

const DRY_RUN = process.env.DRY_RUN !== "false";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// AI 일괄 등록이 note 필드에 장소/인원수 같은 메타데이터를 채워넣는 경우가 많아서
// (예: "퍼즐팩토리 홍대", "5인, 추리는 어느") note만으로는 "진짜 내용"인지 판단 불가.
// 그래서 캐릭터/별점/인생머미 표시처럼 사용자가 직접 남긴 확실한 신호만 높게 치고,
// note는 충분히 길 때만(짧은 장소·인원 메모가 아닐 가능성이 높을 때) 약하게 인정한다.
function completeness(r) {
  let score = 0;
  if (r.character && String(r.character).trim()) score += 2;
  if (r.rating) score += 2;
  if (r.favorite) score += 1;
  if (r.note && String(r.note).trim().length >= 15) score += 1;
  return score;
}

function createdAtMs(r) {
  return r.createdAt?.toMillis ? r.createdAt.toMillis() : 0;
}

console.log(`모드: ${DRY_RUN ? "DRY RUN (미삭제)" : "실제 삭제"}`);

const snap = await db.collection("records").get();
console.log(`전체 기록 ${snap.size}건 로드`);

const byUser = {};
snap.docs.forEach((d) => {
  const r = d.data();
  if (!r.userId || !r.scenarioName) return;
  (byUser[r.userId] ||= []).push({ id: d.id, ref: d.ref, ...r });
});

let groupsWithDup = 0;
let toDeleteTotal = 0;
const affectedUsers = new Set();
const perUserSummary = {};

for (const [uid, records] of Object.entries(byUser)) {
  const groups = {};
  records.forEach((r) => {
    const key = normalizeTitle(r.scenarioName);
    if (!key) return;
    (groups[key] ||= []).push(r);
  });

  for (const [title, group] of Object.entries(groups)) {
    if (group.length < 2) continue;

    const rich = group.filter((r) => completeness(r) > 0);
    const empty = group.filter((r) => completeness(r) === 0);
    if (empty.length === 0) continue; // 전부 내용 있는 기록 → 손대지 않음(진짜 여러 번 플레이일 수 있음)

    let toDelete;
    if (rich.length > 0) {
      toDelete = empty; // 내용 있는 기록이 있으니 빈 스텁은 전부 중복
    } else {
      const sorted = [...empty].sort((a, b) => createdAtMs(a) - createdAtMs(b));
      toDelete = sorted.slice(1); // 전부 빈 스텁이면 가장 오래된 것 하나만 남김
    }
    if (toDelete.length === 0) continue;

    groupsWithDup++;
    toDeleteTotal += toDelete.length;
    affectedUsers.add(uid);
    perUserSummary[uid] = (perUserSummary[uid] || 0) + toDelete.length;

    console.log(
      `[dup] uid=${uid} title="${group[0].scenarioName}" 총${group.length}건(내용있음${rich.length}/빈스텁${empty.length}) → 삭제 ${toDelete.length}건: ${toDelete.map((r) => r.id).join(",")}`
    );

    if (!DRY_RUN) {
      for (const r of toDelete) {
        await r.ref.delete();
      }
    }
  }
}

console.log(`\n중복 그룹 ${groupsWithDup}건, 삭제 대상 ${toDeleteTotal}건, 영향받은 유저 ${affectedUsers.size}명`);
console.log("유저별 삭제 건수:", JSON.stringify(perUserSummary, null, 2));

if (!DRY_RUN && affectedUsers.size > 0) {
  for (const uid of affectedUsers) {
    const recSnap = await db.collection("records").where("userId", "==", uid).get();
    const recs = recSnap.docs.map((d) => d.data());
    const playedTitles = [...new Set(recs.map((r) => normalizeTitle(r.scenarioName)))];
    const favoriteTitles = [...new Set(recs.filter((r) => r.favorite && r.scenarioName).map((r) => r.scenarioName.trim()))];
    await db.collection("users").doc(uid).update({
      playedTitles,
      favoriteTitles,
      playedCount: recs.length,
    });
  }
  console.log(`유저 ${affectedUsers.size}명 playedTitles/favoriteTitles/playedCount 재동기화 완료.`);
}

console.log("완료.");
