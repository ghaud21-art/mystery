import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase.js";
import { normalizeTitle } from "./scenarioUtils.js";

// 내가 "참석하기"를 누른 모임 일정 + 등록해둔 개인 일정의 제목들(정규화됨)을 모아옴.
// 이미 일정이 잡혀있는 작품은 "함께 안 한 머미" 추천에서 다시 보여줄 필요가 없어서 제외하는 데 씀.
export async function fetchScheduledTitles(uid) {
  const groupSnap = await getDocs(query(collection(db, "groups"), where("memberIds", "array-contains", uid)));
  const groupIds = groupSnap.docs.map((d) => d.id).slice(0, 10);

  const [schedSnap, personalSnap] = await Promise.all([
    groupIds.length > 0
      ? getDocs(query(collection(db, "schedules"), where("groupId", "in", groupIds)))
      : Promise.resolve({ docs: [] }),
    getDocs(query(collection(db, "personalSchedules"), where("userId", "==", uid))),
  ]);

  const titles = new Set();
  schedSnap.docs.forEach((d) => {
    const s = d.data();
    if (s.attendees?.[uid] === "yes" && s.title) titles.add(normalizeTitle(s.title));
  });
  personalSnap.docs.forEach((d) => {
    const s = d.data();
    if (s.title) titles.add(normalizeTitle(s.title));
  });
  return titles;
}
