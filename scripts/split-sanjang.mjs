// 일회성: "산장 살인사건" 시나리오 1개를 지점별(퍼즐팩토리 홍대 / 크라임씬 서면) 2개로 나눔.
// 기존 문서(id 유지 → 위시리스트 등 보존)는 홍대로 이름을 바꾸고, 서면용 문서를 새로 복제해 만든다.
// 기존에 "산장 살인사건" 제목으로 남은 기록은 제목은 그대로 두고 장르만 크라임씬으로 고정해 집계를 유지.
// APPLY=1이 아니면 드라이런. (.github/workflows/split-sanjang.yml)
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const norm = (t) => (t || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const KEY = norm("산장 살인사건");
const apply = process.env.APPLY === "1";
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) }));

const scen = (await db.collection("scenarios").get()).docs.filter((d) => norm(d.data().title) === KEY);
console.log(`"산장 살인사건" 시나리오 ${scen.length}개`);
scen.forEach((d) => console.log(`  ${d.id}: ${JSON.stringify(d.data())}`));

const records = (await db.collection("records").get()).docs.filter((d) => norm(d.data().scenarioName) === KEY);
const sched = (await db.collection("schedules").get()).docs.filter((d) => norm(d.data().title) === KEY);
const personal = (await db.collection("personalSchedules").get()).docs.filter((d) => norm(d.data().title) === KEY);
console.log(`기록 ${records.length}건, 모임 일정 ${sched.length}건, 개인 일정 ${personal.length}건이 "산장 살인사건" 제목을 쓰는 중`);

if (scen.length !== 1) { console.log("시나리오가 정확히 1개가 아니라서 중단"); process.exit(0); }
const base = scen[0];

if (apply) {
  const data = base.data();
  await base.ref.update({ title: "산장 살인사건(퍼즐팩토리 홍대)", genre: "크라임씬" });
  await db.collection("scenarios").doc().set({ ...data, title: "산장 살인사건(크라임씬 서면)", genre: "크라임씬", createdAt: FieldValue.serverTimestamp() });
  for (const r of records) await r.ref.update({ genre: "크라임씬" });
  console.log("적용 완료");
} else {
  console.log("드라이런이라 아무것도 바꾸지 않았어요.");
}
