// records 컬렉션은 본인만 읽을 수 있어서(Firestore 규칙), 친구/모임 멤버가 어떤 작품을
// 플레이했는지는 직접 조회할 수 없음. 그래서 각자의 users/{uid} 문서에 정규화된 제목 목록을
// playedTitles로, 인생머미(즐겨찾기) 제목을 favoriteTitles로 함께 저장해두고
// "같이 안한 머미" 추천이나 친구 프로필 요약 등에서는 이 필드만 참고함.
import { collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "./firebase.js";
import { normalizeTitle } from "./scenarioUtils.js";

export async function syncPlayedTitles(uid) {
  const snap = await getDocs(query(collection(db, "records"), where("userId", "==", uid)));
  const records = snap.docs.map((d) => d.data());
  const playedTitles = [...new Set(records.map((r) => normalizeTitle(r.scenarioName)))];
  const favoriteTitles = [...new Set(records.filter((r) => r.favorite && r.scenarioName).map((r) => r.scenarioName.trim()))];
  await updateDoc(doc(db, "users", uid), {
    playedTitles,
    favoriteTitles,
    playedCount: records.length,
  });
}
