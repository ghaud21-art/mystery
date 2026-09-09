import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase.js";

// 나와 같은 모임 일정에 "참석(yes)"으로 함께 표시된 적 있는 사람들을 집계.
// 이미 끝난(지난) 일정만 세어서 "실제로 같이 플레이한 횟수"에 가깝게 만듦.
// 반환값: { [uid]: 함께한 횟수 }
export async function computeCoAttendanceCounts(uid) {
  const groupSnap = await getDocs(query(collection(db, "groups"), where("memberIds", "array-contains", uid)));
  const groupIds = groupSnap.docs.map((d) => d.id).slice(0, 10);
  if (groupIds.length === 0) return {};

  const schedSnap = await getDocs(query(collection(db, "schedules"), where("groupId", "in", groupIds)));
  const now = new Date().toISOString();
  const counts = {};
  schedSnap.docs.forEach((d) => {
    const s = d.data();
    const endsAt = s.endDatetime || s.datetime;
    if (!endsAt || endsAt >= now) return;
    if (s.attendees?.[uid] !== "yes") return;
    Object.entries(s.attendees || {}).forEach(([otherUid, status]) => {
      if (otherUid === uid || status !== "yes") return;
      counts[otherUid] = (counts[otherUid] || 0) + 1;
    });
  });
  return counts;
}
