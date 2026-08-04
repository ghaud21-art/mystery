// 관리자가 시나리오를 엑셀로 대량 등록할 때 쓰는 일회성 스크립트.
// GitHub Actions에서 workflow_dispatch로 수동 실행 (.github/workflows/import-scenarios.yml).
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const SCENARIOS = [
  { title: "동자", publisher: "ACHILL STUDIO", playerCount: "2", duration: "60분" },
  { title: "구제역 그리고 매몰", publisher: "히든케이스", playerCount: "4", duration: "180분" },
  { title: "머더 미스터리 오브 더 데드", publisher: "Groups SNE", playerCount: "7~8", duration: "180분" },
  { title: "알바트로스의 황금비", publisher: "Groups SNE", playerCount: "5~6", duration: "150분" },
  { title: "별빛 하늘에 소망을", publisher: "Groups SNE", playerCount: "6~7", duration: "150분" },
  { title: "흑백해로", publisher: "Groups SNE", playerCount: "2", duration: "150분" },
  { title: "삿포로 이세계 투어", publisher: "Groups SNE", playerCount: "4", duration: "100분" },
  { title: "은현군일기", publisher: "이원남", playerCount: "4", duration: "240분" },
  { title: "셜록 Ep.04: 공포의 계곡", publisher: "Studio NG", playerCount: "3~5", duration: "90분" },
  { title: "셜록 Ep.01: 주홍색 연구", publisher: "Studio NG", playerCount: "3~5", duration: "90분" },
  { title: "셜록 Ep.03: 바스커빌 가의 개", publisher: "Studio NG", playerCount: "3~5", duration: "90분" },
  { title: "셜록 Ep.02: 네 사람의 서명", publisher: "Studio NG", playerCount: "3~5", duration: "90분" },
  { title: "웬디, 어른이 되렴", publisher: "Groups SNE", playerCount: "4~5", duration: "120분" },
  { title: "몇번이고 푸른달에 불을 붙였다", publisher: "Groups SNE", playerCount: "6~7", duration: "150분" },
  { title: "괴조는 깊은 탄식의 끝에", publisher: "미스터리 게임즈", playerCount: "4", duration: "120분" },
  { title: "탁상탐정단: 황혼에 웃는 소녀", publisher: "Groups SNE", playerCount: "1~4", duration: "120분" },
  { title: "탁상탐정단: 그랜드 호텔 듀엣", publisher: "Groups SNE", playerCount: "1~4", duration: "120분" },
  { title: "라이노 교수가 아는 다가올 오늘 중의 죽음", publisher: "Groups SNE", playerCount: "5", duration: "150분" },
];

const existingSnap = await db.collection("scenarios").where("status", "==", "approved").get();
const existingTitles = new Set(existingSnap.docs.map((d) => d.data().title?.trim().toLowerCase()));

let added = 0;
for (const s of SCENARIOS) {
  const key = s.title.trim().toLowerCase();
  if (existingTitles.has(key)) {
    console.log(`- 스킵(이미 있음): ${s.title}`);
    continue;
  }
  await db.collection("scenarios").add({
    ...s,
    description: "",
    status: "approved",
    submittedBy: "admin-import",
    submittedByName: "관리자 (일괄 등록)",
  });
  added++;
  console.log(`+ 등록: ${s.title}`);
}
console.log(`완료. ${added}/${SCENARIOS.length}건 신규 등록.`);
