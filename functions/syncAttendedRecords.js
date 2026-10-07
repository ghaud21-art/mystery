// 끝난 "머더미스터리"/"크라임씬" 일정(모임 일정 + 개인 일정)을 참석/등록한 사람의 플레이 기록으로
// 자동 연동. 예전엔 GitHub Actions 크론(scripts/sync-attended-records.mjs)이었는데, 예약 실행이
// 몇 시간씩 밀려서(그래서 어제 플레이가 오늘 오전까지 기록으로 안 넘어감) Cloud Scheduler로 옮김.
// 한 번 처리한 일정은 recordSynced:true로 표시해 다음 실행에서 건너뜀.
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const RECORD_CATEGORIES = ["머더미스터리", "크라임씬"];

function normalizeTitle(t) {
  return (t || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

// 한국시간 09:10, 00:10 (UTC 00:10, 15:10)에 실행.
export const syncAttendedRecords = onSchedule(
  { schedule: "10 0,15 * * *", timeZone: "UTC", timeoutSeconds: 300 },
  async () => {
    const db = getFirestore();
    // s.datetime/endDatetime은 타임존 없는 "한국 시간 그대로"의 문자열이라, 현재 시각도 한국시간 문자열로
    // 맞춰서 비교해야 함(UTC로 비교하면 일정이 실제보다 9시간 늦게 "끝난 것"으로 처리됨).
    const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);

    // uid별 기존 기록을 한 번만 불러와 재사용. 같은 작품(normalizeTitle 기준) 기록이 이미 있으면 새로
    // 만들지 않고, 그 기록이 손으로 적은 것(source가 auto-schedule이 아님)이면 날짜만 일정 날짜로 보정.
    const existingByUid = new Map();
    async function loadExisting(uid) {
      if (existingByUid.has(uid)) return existingByUid.get(uid);
      const snap = await db.collection("records").where("userId", "==", uid).get();
      const map = new Map();
      snap.docs.forEach((d) => {
        const data = d.data();
        map.set(normalizeTitle(data.scenarioName), { date: data.date, source: data.source || null, ref: d.ref });
      });
      existingByUid.set(uid, map);
      return map;
    }

    async function createRecordIfMissing(uid, title, date, asGm) {
      const key = normalizeTitle(title);
      const existing = await loadExisting(uid);
      const found = existing.get(key);

      if (found) {
        if (found.date !== date && found.source !== "auto-schedule") {
          await found.ref.update({ date, source: "auto-schedule" });
          found.date = date;
          found.source = "auto-schedule";
        }
        return false;
      }

      const ref = await db.collection("records").add({
        userId: uid,
        scenarioName: title,
        character: "",
        rating: null,
        note: "",
        spoiler: true,
        favorite: false,
        role: asGm ? "gm" : "player",
        date,
        source: "auto-schedule",
        createdAt: FieldValue.serverTimestamp(),
      });
      existing.set(key, { date, source: "auto-schedule", ref });
      await db.collection("users").doc(uid).update({ playedTitles: FieldValue.arrayUnion(key) });
      return true;
    }

    const isDue = (s) => {
      if (s.recordSynced) return false;
      const endsAt = s.endDatetime || s.datetime;
      return !!endsAt && endsAt < nowKst;
    };

    let created = 0;

    const groupSnap = await db.collection("schedules").where("category", "in", RECORD_CATEGORIES).get();
    for (const doc of groupSnap.docs.filter((d) => isDue(d.data()))) {
      const s = doc.data();
      const date = s.datetime.slice(0, 10);
      const attendeeIds = Object.entries(s.attendees || {}).filter(([, v]) => v === "yes").map(([uid]) => uid);
      for (const uid of attendeeIds) {
        if (await createRecordIfMissing(uid, s.title, date, !!s.gms?.[uid])) created++;
      }
      await doc.ref.update({ recordSynced: true });
    }

    const personalSnap = await db.collection("personalSchedules").where("category", "in", RECORD_CATEGORIES).get();
    for (const doc of personalSnap.docs.filter((d) => isDue(d.data()))) {
      const s = doc.data();
      if (await createRecordIfMissing(s.userId, s.title, s.datetime.slice(0, 10), !!s.asGm)) created++;
      await doc.ref.update({ recordSynced: true });
    }

    console.log(`syncAttendedRecords 완료: 기록 ${created}건 자동 생성 (기준 시각 ${nowKst} KST)`);
  }
);
