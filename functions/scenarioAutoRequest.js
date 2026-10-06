// 일정(모임 일정/개인 일정)에 머더미스터리·크라임씬 작품을 넣었는데 그 제목이 시나리오 DB(승인됨·
// 대기 중 모두)에 없으면, 자동으로 "목록에 없는 작품 등록 요청"(status: pending)을 하나 만들어 둔다.
// 관리자가 승인 대기 목록에서 확인/수정 후 승인하면 그때부터 DB·찾기 탭에 정식으로 올라간다.
// 클라이언트에서는 다른 사람이 낸 대기 요청을 읽을 수 없어 중복 검사가 불가능하므로 서버(Admin SDK)에서 처리.
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const REQUEST_CATEGORIES = ["머더미스터리", "크라임씬"];

function normalizeTitle(t) {
  return (t || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

async function requestIfMissing({ title, category, submittedBy, submittedByName }) {
  const key = normalizeTitle(title);
  if (!key) return;

  const db = getFirestore();
  const all = await db.collection("scenarios").get();
  if (all.docs.some((d) => normalizeTitle(d.data().title) === key)) return;

  // 같은 제목 일정이 동시에 여러 개 만들어져도 요청이 하나만 생기도록 제목 기반 고정 id + create() 사용.
  try {
    await db.collection("scenarios").doc(`auto_${key}`).create({
      title: title.trim(),
      publisher: "",
      playerCount: "",
      duration: "",
      description: "",
      category: "offline",
      genre: category,
      status: "pending",
      submittedBy,
      submittedByName,
      autoRequested: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    if (err.code !== 6 /* ALREADY_EXISTS */) throw err;
  }
}

async function displayNameOf(uid) {
  const snap = await getFirestore().collection("users").doc(uid).get();
  const u = snap.data() || {};
  return u.nickname || u.name || "이름 없는 탐정";
}

// 일정이 새로 만들어지거나, 제목/카테고리가 바뀔 때만 검사 (참석 투표 등 다른 필드 변경은 무시).
function shouldCheck(before, after) {
  if (!after) return false;
  if (!REQUEST_CATEGORIES.includes(after.category) || !after.title?.trim()) return false;
  if (!before) return true;
  return before.title !== after.title || before.category !== after.category;
}

export const onGroupScheduleWritten = onDocumentWritten("schedules/{id}", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!shouldCheck(before, after)) return;
  await requestIfMissing({
    title: after.title,
    category: after.category,
    submittedBy: after.hostId,
    submittedByName: after.hostName || "이름 없는 탐정",
  });
});

export const onPersonalScheduleWritten = onDocumentWritten("personalSchedules/{id}", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!shouldCheck(before, after)) return;
  await requestIfMissing({
    title: after.title,
    category: after.category,
    submittedBy: after.userId,
    submittedByName: await displayNameOf(after.userId),
  });
});
