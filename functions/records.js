// 시나리오별 평균 별점 집계. records/{id}는 본인 것만(또는 public:true인 것만) 클라이언트가
// 직접 읽을 수 있어서(firestore.rules), 비공개로 남긴 별점까지 포함한 진짜 평균은 클라이언트
// 쿼리로는 못 만든다. 그래서 이 함수만 Admin SDK로 전체 records를 읽되, 시나리오별 합계/건수
// 숫자만 돌려주고 개별 기록(메모·역할·작성자 등 "후기" 내용)은 절대 포함하지 않는다 —
// 후기 공개 여부(public)는 여전히 그대로 존중되고, 별점 평균만 모두에게 공유되는 셈.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

function normalizeTitle(t) {
  return (t || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

export const getScenarioRatingSummary = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요해요.");

  const db = getFirestore();
  const snap = await db.collection("records").get();

  const sums = {};
  snap.docs.forEach((d) => {
    const r = d.data();
    if (!r.rating || !r.scenarioName) return;
    const key = normalizeTitle(r.scenarioName);
    if (!sums[key]) sums[key] = { sum: 0, count: 0 };
    sums[key].sum += r.rating;
    sums[key].count += 1;
  });

  const ratings = {};
  Object.entries(sums).forEach(([key, { sum, count }]) => {
    ratings[key] = { avg: sum / count, count };
  });

  return { ratings };
});
