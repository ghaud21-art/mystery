// "사건이 도착했습니다" — 관리자용 callable 함수들. 전부 requireAdmin으로 서버에서
// 매번 관리자 여부를 재검증한다(클라이언트가 보낸 값은 신뢰하지 않음).
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { requireAdmin } from "./auth.js";
import { SEASON_ID_RE, validateSeasonPatch, validateDayPatch, computeMaxScore } from "./content.js";

function checkSeasonId(seasonId) {
  if (typeof seasonId !== "string" || !SEASON_ID_RE.test(seasonId)) {
    throw new HttpsError("invalid-argument", "시즌 id는 영소문자/숫자/하이픈만, 2~41자로 써주세요.");
  }
}

async function activePlayerCount(db, seasonId) {
  const snap = await db.collection("caseProgress").where("seasonId", "==", seasonId).where("completed", "==", false).get();
  return snap.size;
}

// 관리자가 어드민 페이지에서 직접 플레이해보고("테스트 플레이") 원하는 만큼 다시 시작할 수
// 있도록, 본인(호출한 관리자)의 진행/제출/결과만 지워준다. 다른 사람의 데이터는 건드리지 않음.
export const caseAdminResetMyProgress = onCall(async (request) => {
  const uid = await requireAdmin(request);
  const { seasonId } = request.data || {};
  checkSeasonId(seasonId);
  const db = getFirestore();

  const submissionsSnap = await db
    .collection("caseSubmissions")
    .where("uid", "==", uid)
    .where("seasonId", "==", seasonId)
    .get();

  const batch = db.batch();
  batch.delete(db.doc(`caseProgress/${uid}_${seasonId}`));
  batch.delete(db.doc(`caseResults/${uid}_${seasonId}`));
  submissionsSnap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();

  return { reset: true, deletedSubmissions: submissionsSnap.size };
});

export const caseAdminListSeasons = onCall(async (request) => {
  await requireAdmin(request);
  const db = getFirestore();
  const snap = await db.collection("caseSeasons").get();
  return {
    seasons: snap.docs.map((d) => ({
      seasonId: d.id,
      title: d.data().title,
      published: !!d.data().published,
      totalDays: d.data().totalDays,
    })),
  };
});

export const caseAdminGetSeason = onCall(async (request) => {
  await requireAdmin(request);
  const { seasonId } = request.data || {};
  checkSeasonId(seasonId);
  const db = getFirestore();

  const seasonSnap = await db.doc(`caseSeasons/${seasonId}`).get();
  if (!seasonSnap.exists) throw new HttpsError("not-found", "시즌을 찾을 수 없어요.");
  const daysSnap = await db.collection(`caseSeasons/${seasonId}/days`).get();
  const days = Object.fromEntries(daysSnap.docs.map((d) => [d.id, d.data()]));

  return { seasonId, season: seasonSnap.data(), days };
});

export const caseAdminSaveSeason = onCall(async (request) => {
  await requireAdmin(request);
  const { seasonId, patch } = request.data || {};
  checkSeasonId(seasonId);
  if (!patch || typeof patch !== "object") throw new HttpsError("invalid-argument", "저장할 내용이 없어요.");

  const error = validateSeasonPatch(patch);
  if (error) throw new HttpsError("invalid-argument", error);

  const db = getFirestore();
  const ref = db.doc(`caseSeasons/${seasonId}`);
  const exists = (await ref.get()).exists;
  // Firestore Admin SDK는 필드값으로 undefined를 거부하므로(예외 발생), 이미 있는 시즌을
  // 저장할 때는 createdAt 필드 자체를 아예 넣지 않는다(merge:true라 기존 값이 유지됨).
  const payload = {
    title: patch.title,
    landingCopy: patch.landingCopy || {},
    totalDays: patch.totalDays || 7,
    finalChoiceScored: patch.finalChoiceScored !== false,
    gradeTable: patch.gradeTable,
    checkpoints: patch.checkpoints,
    judgePrompt: patch.judgePrompt,
    letterPrompt: patch.letterPrompt,
    truthExplanation: patch.truthExplanation || "",
    published: !!patch.published,
  };
  if (!exists) payload.createdAt = new Date().toISOString();
  await ref.set(payload, { merge: true });

  return { seasonId, activeCount: await activePlayerCount(db, seasonId) };
});

export const caseAdminSaveDay = onCall(async (request) => {
  await requireAdmin(request);
  const { seasonId, day, patch } = request.data || {};
  checkSeasonId(seasonId);
  if (!Number.isInteger(day) || day < 1 || day > 7) throw new HttpsError("invalid-argument", "일차가 올바르지 않아요.");
  if (!patch || typeof patch !== "object") throw new HttpsError("invalid-argument", "저장할 내용이 없어요.");

  const db = getFirestore();
  const seasonSnap = await db.doc(`caseSeasons/${seasonId}`).get();
  if (!seasonSnap.exists) throw new HttpsError("not-found", "시즌을 찾을 수 없어요.");
  const season = seasonSnap.data();
  const isFinalUnscored = day === (season.totalDays || 7) && season.finalChoiceScored === false;

  const error = validateDayPatch(patch, { isFinalUnscored });
  if (error) throw new HttpsError("invalid-argument", error);

  const payload = isFinalUnscored
    ? {
        day,
        reportTitle: patch.reportTitle || "",
        reportBody: patch.reportBody,
        finalChoice: patch.finalChoice,
        replyPrompt: patch.replyPrompt,
      }
    : {
        day,
        reportTitle: patch.reportTitle || "",
        reportBody: patch.reportBody,
        question: patch.question,
        options: patch.options,
        correctIndex: patch.correctIndex,
        explanation: patch.explanation || "",
        memoryFragment: patch.memoryFragment,
        wrongMessage: patch.wrongMessage,
        replyPrompt: patch.replyPrompt,
      };
  await db.doc(`caseSeasons/${seasonId}/days/${day}`).set(payload, { merge: true });

  return { seasonId, day, activeCount: await activePlayerCount(db, seasonId) };
});

export const caseAdminCreateSeason = onCall(async (request) => {
  await requireAdmin(request);
  const { seasonId, title, cloneFrom } = request.data || {};
  checkSeasonId(seasonId);
  if (!title || !title.trim()) throw new HttpsError("invalid-argument", "제목을 입력해주세요.");

  const db = getFirestore();
  const ref = db.doc(`caseSeasons/${seasonId}`);
  if ((await ref.get()).exists) throw new HttpsError("already-exists", "이미 있는 시즌 id예요.");

  if (cloneFrom) {
    checkSeasonId(cloneFrom);
    const srcSnap = await db.doc(`caseSeasons/${cloneFrom}`).get();
    if (!srcSnap.exists) throw new HttpsError("not-found", "복제할 시즌을 찾을 수 없어요.");
    const src = srcSnap.data();
    await ref.set({ ...src, title, published: false, createdAt: new Date().toISOString() });

    const srcDaysSnap = await db.collection(`caseSeasons/${cloneFrom}/days`).get();
    const batch = db.batch();
    srcDaysSnap.docs.forEach((d) => batch.set(db.doc(`caseSeasons/${seasonId}/days/${d.id}`), d.data()));
    await batch.commit();
  } else {
    await ref.set({
      title,
      landingCopy: {},
      totalDays: 7,
      finalChoiceScored: true,
      gradeTable: [],
      checkpoints: [],
      judgePrompt: "",
      letterPrompt: "",
      truthExplanation: "",
      published: false,
      createdAt: new Date().toISOString(),
    });
  }

  return { seasonId };
});

// 콘텐츠 시딩 경로 — git을 거치지 않고 브라우저에서 바로 Firestore로 올림.
// 전체 시즌+일차 JSON을 한 번에 받아 그대로 upsert.
export const caseAdminImportSeason = onCall(async (request) => {
  await requireAdmin(request);
  const { seasonId, season, days } = request.data || {};
  checkSeasonId(seasonId);
  if (!season || typeof season !== "object") throw new HttpsError("invalid-argument", "season 데이터가 없어요.");
  if (!days || typeof days !== "object") throw new HttpsError("invalid-argument", "days 데이터가 없어요.");

  const seasonError = validateSeasonPatch(season);
  if (seasonError) throw new HttpsError("invalid-argument", `시즌: ${seasonError}`);
  const totalDays = season.totalDays || 7;
  for (const [day, patch] of Object.entries(days)) {
    const isFinalUnscored = Number(day) === totalDays && season.finalChoiceScored === false;
    const dayError = validateDayPatch(patch, { isFinalUnscored });
    if (dayError) throw new HttpsError("invalid-argument", `${day}일차: ${dayError}`);
  }

  const db = getFirestore();
  const batch = db.batch();
  batch.set(db.doc(`caseSeasons/${seasonId}`), {
    ...season,
    published: !!season.published,
    createdAt: new Date().toISOString(),
  });
  for (const [day, patch] of Object.entries(days)) {
    batch.set(db.doc(`caseSeasons/${seasonId}/days/${day}`), { ...patch, day: Number(day) });
  }
  await batch.commit();

  return { seasonId, dayCount: Object.keys(days).length };
});

export const caseAdminGetStats = onCall(async (request) => {
  await requireAdmin(request);
  const { seasonId } = request.data || {};
  checkSeasonId(seasonId);
  const db = getFirestore();

  const seasonSnap = await db.doc(`caseSeasons/${seasonId}`).get();
  if (!seasonSnap.exists) throw new HttpsError("not-found", "시즌을 찾을 수 없어요.");
  const season = seasonSnap.data();

  const [progressSnap, submissionsSnap, resultsSnap] = await Promise.all([
    db.collection("caseProgress").where("seasonId", "==", seasonId).get(),
    db.collection("caseSubmissions").where("seasonId", "==", seasonId).get(),
    db.collection("caseResults").where("seasonId", "==", seasonId).where("status", "==", "complete").get(),
  ]);

  const startedCount = progressSnap.size;
  const completedCount = progressSnap.docs.filter((d) => d.data().completed).length;

  const byDay = {};
  submissionsSnap.docs.forEach((d) => {
    const s = d.data();
    byDay[s.day] ||= { submitted: 0, correct: 0 };
    byDay[s.day].submitted++;
    if (s.correct) byDay[s.day].correct++;
  });
  const perDay = Object.entries(byDay)
    .map(([day, v]) => ({ day: Number(day), submitted: v.submitted, correctRate: v.submitted ? Math.round((v.correct / v.submitted) * 100) : 0 }))
    .sort((a, b) => a.day - b.day);

  const tierCounts = {};
  resultsSnap.docs.forEach((d) => {
    const name = d.data().tier?.name || "?";
    tierCounts[name] = (tierCounts[name] || 0) + 1;
  });

  return {
    seasonId,
    startedCount,
    completedCount,
    perDay,
    tierDistribution: Object.entries(tierCounts).map(([name, count]) => ({ name, count })),
    maxScore: computeMaxScore(season),
  };
});
