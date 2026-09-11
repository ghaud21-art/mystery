// "사건이 도착했습니다" — 플레이어용 callable 함수들. 모든 콘텐츠 접근은 여기를 거치고,
// Firestore 클라이언트 직접 읽기는 firestore.rules에서 전면 차단돼 있음.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireAuth } from "./auth.js";
import {
  SEASON_ID_RE,
  publicSeasonView,
  publicDayView,
  submittedDayView,
} from "./content.js";
import { judgeSeason } from "./grade.js";
import { GEMINI_API_KEY } from "./gemini.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function progressId(uid, seasonId) {
  return `${uid}_${seasonId}`;
}
function submissionId(uid, seasonId, day) {
  return `${uid}_${seasonId}_${day}`;
}

function checkSeasonId(seasonId) {
  if (typeof seasonId !== "string" || !SEASON_ID_RE.test(seasonId)) {
    throw new HttpsError("invalid-argument", "잘못된 시즌 id예요.");
  }
}

async function isAdminUid(db, uid) {
  if (!uid) return false;
  const snap = await db.doc(`users/${uid}`).get();
  return snap.exists && snap.data()?.isAdmin === true;
}

// 일반 플레이어는 공개(published)된 시즌만 볼 수 있지만, 관리자는 비공개(테스트 중) 시즌도
// 미리 플레이해볼 수 있게 예외를 둔다 — 어드민 페이지에서 "테스트 플레이" 하려면 필요함.
async function loadSeasonForPlay(db, seasonId, uid) {
  checkSeasonId(seasonId);
  const snap = await db.doc(`caseSeasons/${seasonId}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "시즌을 찾을 수 없어요.");
  const season = snap.data();
  if (season.published !== true && !(await isAdminUid(db, uid))) {
    throw new HttpsError("not-found", "시즌을 찾을 수 없어요.");
  }
  return season;
}

// 서버시각(now) + 시작시각(startTime, 서버가 기록) 기준으로 "시간상 몇 일차까지 허용되는지"와
// "제출 순서상 다음이 몇 일차인지"를 둘 다 계산해서 합쳐야 함 — 시간만 보면 순서를 건너뛸 수 있고,
// 순서만 보면 24시간 대기가 사라짐. 밤샘모드면 시간 게이트를 아예 뺀다.
function unlockState({ startTime, mode, totalDays, submittedCount }) {
  const now = Date.now();
  const startMs = new Date(startTime).getTime();
  const timeAllowedDay = Math.min(totalDays, Math.floor((now - startMs) / DAY_MS) + 1);
  const nextDay = submittedCount + 1;
  const canSubmitNow = nextDay <= totalDays && (mode === "night" || nextDay <= timeAllowedDay);
  const nextUnlockAt =
    mode === "night" || canSubmitNow || nextDay > totalDays
      ? null
      : new Date(startMs + (nextDay - 1) * DAY_MS).toISOString();
  return { nextDay, canSubmitNow, nextUnlockAt };
}

export const caseListSeasons = onCall(async (request) => {
  const uid = requireAuth(request);
  const db = getFirestore();
  const isAdmin = await isAdminUid(db, uid);
  const [seasonsSnap, progressSnap] = await Promise.all([
    isAdmin ? db.collection("caseSeasons").get() : db.collection("caseSeasons").where("published", "==", true).get(),
    db.collection("caseProgress").where("uid", "==", uid).get(),
  ]);
  const progressBySeason = Object.fromEntries(progressSnap.docs.map((d) => [d.data().seasonId, d.data()]));
  return {
    seasons: seasonsSnap.docs.map((d) => {
      const p = progressBySeason[d.id];
      return {
        seasonId: d.id,
        ...publicSeasonView(d.data()),
        myState: p ? { started: true, completed: !!p.completed, mode: p.mode } : { started: false },
      };
    }),
  };
});

// 비로그인 사용자도 호출 가능(공유 링크로 들어온 사람이 랜딩 카피만 보게). 이 경로는 admin
// 우회가 필요 없음 — 비공개 시즌 링크는 어차피 관리자 본인에게만 공유되므로 로그인 후
// caseGetPlayState/caseStart에서 관리자 우회가 적용된다.
export const caseGetSeasonPublic = onCall(async (request) => {
  const { seasonId } = request.data || {};
  const db = getFirestore();
  const season = await loadSeasonForPlay(db, seasonId, request.auth?.uid);
  return { seasonId, ...publicSeasonView(season) };
});

export const caseGetPlayState = onCall(async (request) => {
  const uid = requireAuth(request);
  const { seasonId } = request.data || {};
  const db = getFirestore();
  const season = await loadSeasonForPlay(db, seasonId, uid);
  const totalDays = season.totalDays || 7;

  const progressSnap = await db.doc(`caseProgress/${progressId(uid, seasonId)}`).get();
  if (!progressSnap.exists) {
    return { seasonId, season: publicSeasonView(season), started: false };
  }
  const progress = progressSnap.data();

  const submissionsSnap = await db
    .collection("caseSubmissions")
    .where("uid", "==", uid)
    .where("seasonId", "==", seasonId)
    .get();
  const submissionByDay = Object.fromEntries(submissionsSnap.docs.map((d) => [d.data().day, d.data()]));
  const submittedCount = submissionsSnap.size;

  const { nextDay, canSubmitNow, nextUnlockAt } = unlockState({
    startTime: progress.startTime,
    mode: progress.mode,
    totalDays,
    submittedCount,
  });

  const history = [];
  for (let day = 1; day < nextDay; day++) {
    const dayDoc = (await db.doc(`caseSeasons/${seasonId}/days/${day}`).get()).data();
    if (dayDoc && submissionByDay[day]) history.push({ day, ...submittedDayView(dayDoc, submissionByDay[day]) });
  }

  let current = null;
  if (canSubmitNow) {
    const dayDoc = (await db.doc(`caseSeasons/${seasonId}/days/${nextDay}`).get()).data();
    if (dayDoc) current = { day: nextDay, isFinal: nextDay === totalDays, ...publicDayView(dayDoc) };
  }

  return {
    seasonId,
    season: publicSeasonView(season),
    started: true,
    mode: progress.mode,
    completed: !!progress.completed,
    history,
    current,
    nextUnlockAt,
    totalDays,
  };
});

export const caseStart = onCall(async (request) => {
  const uid = requireAuth(request);
  const { seasonId } = request.data || {};
  const db = getFirestore();
  await loadSeasonForPlay(db, seasonId, uid);

  const ref = db.doc(`caseProgress/${progressId(uid, seasonId)}`);
  const snap = await ref.get();
  if (snap.exists) return { startTime: snap.data().startTime, mode: snap.data().mode };

  const startTime = new Date().toISOString();
  await ref.set({ uid, seasonId, startTime, mode: "realtime", completed: false, badge: null });
  return { startTime, mode: "realtime" };
});

export const caseSetNightMode = onCall(async (request) => {
  const uid = requireAuth(request);
  const { seasonId } = request.data || {};
  const db = getFirestore();
  checkSeasonId(seasonId);

  const ref = db.doc(`caseProgress/${progressId(uid, seasonId)}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("failed-precondition", "먼저 수사를 시작해주세요.");
    const p = snap.data();
    if (p.completed) throw new HttpsError("failed-precondition", "이미 완료된 수사예요.");
    if (p.mode === "night") return; // 이미 밤샘모드 — 조용히 통과(idempotent)
    tx.update(ref, { mode: "night", badge: "night" });
  });
  return { mode: "night" };
});

export const caseSubmitDay = onCall(async (request) => {
  const uid = requireAuth(request);
  const { seasonId, day, choice, essay } = request.data || {};
  const db = getFirestore();
  const season = await loadSeasonForPlay(db, seasonId, uid);
  const totalDays = season.totalDays || 7;

  if (!Number.isInteger(day) || day < 1 || day >= totalDays) {
    throw new HttpsError("invalid-argument", "이 경로로는 마지막 일차를 제출할 수 없어요.");
  }
  if (!Number.isInteger(choice) || choice < 0 || choice > 3) {
    throw new HttpsError("invalid-argument", "보기를 선택해주세요.");
  }
  const essayText = String(essay || "").slice(0, 4000);

  const progressRef = db.doc(`caseProgress/${progressId(uid, seasonId)}`);
  const submissionRef = db.doc(`caseSubmissions/${submissionId(uid, seasonId, day)}`);
  const dayDoc = (await db.doc(`caseSeasons/${seasonId}/days/${day}`).get()).data();
  if (!dayDoc) throw new HttpsError("not-found", "일차 콘텐츠를 찾을 수 없어요.");

  const result = await db.runTransaction(async (tx) => {
    const [progressSnap, submissionSnap, countSnap] = await Promise.all([
      tx.get(progressRef),
      tx.get(submissionRef),
      tx.get(db.collection("caseSubmissions").where("uid", "==", uid).where("seasonId", "==", seasonId)),
    ]);
    if (!progressSnap.exists) throw new HttpsError("failed-precondition", "먼저 수사를 시작해주세요.");
    if (submissionSnap.exists) throw new HttpsError("already-exists", "이미 제출한 일차예요.");

    const progress = progressSnap.data();
    const { nextDay, canSubmitNow, nextUnlockAt } = unlockState({
      startTime: progress.startTime,
      mode: progress.mode,
      totalDays,
      submittedCount: countSnap.size,
    });
    if (day !== nextDay) throw new HttpsError("failed-precondition", "제출 순서가 맞지 않아요.");
    if (!canSubmitNow) throw new HttpsError("failed-precondition", "아직 이 일차가 열리지 않았어요.");

    const correct = choice === dayDoc.correctIndex;
    tx.set(submissionRef, {
      uid,
      seasonId,
      day,
      choice,
      correct,
      essay: essayText,
      submittedAt: new Date().toISOString(),
    });

    const after = unlockState({
      startTime: progress.startTime,
      mode: progress.mode,
      totalDays,
      submittedCount: countSnap.size + 1,
    });
    return { correct, nextUnlockAt: after.nextUnlockAt };
  });

  return {
    correct: result.correct,
    fragment: result.correct ? dayDoc.memoryFragment || "" : null,
    wrongMessage: !result.correct ? dayDoc.wrongMessage || "" : null,
    nextUnlockAt: result.nextUnlockAt,
  };
});

export const caseSubmitFinal = onCall(
  { timeoutSeconds: 300, memory: "512MiB", secrets: [GEMINI_API_KEY] },
  async (request) => {
    const uid = requireAuth(request);
    const { seasonId, choice, essay, finalEssay, finalChoiceId } = request.data || {};
    const db = getFirestore();
    const season = await loadSeasonForPlay(db, seasonId, uid);
    const totalDays = season.totalDays || 7;
    // finalChoiceScored===false인 시즌은 마지막 날이 점수 없는 "분위기용" 선택이라 정답 검증이 없음.
    const scored = season.finalChoiceScored !== false;

    const progressRef = db.doc(`caseProgress/${progressId(uid, seasonId)}`);
    const submissionRef = db.doc(`caseSubmissions/${submissionId(uid, seasonId, totalDays)}`);
    const dayDoc = (await db.doc(`caseSeasons/${seasonId}/days/${totalDays}`).get()).data();
    if (!dayDoc) throw new HttpsError("not-found", "마지막 일차 콘텐츠를 찾을 수 없어요.");

    let resolvedChoice = null;
    let correct = false;
    let finalChoiceLabel = null;
    if (scored) {
      if (!Number.isInteger(choice) || choice < 0 || choice > 3) {
        throw new HttpsError("invalid-argument", "범인을 선택해주세요.");
      }
      resolvedChoice = choice;
      correct = choice === dayDoc.correctIndex;
    } else {
      const options = dayDoc.finalChoice?.options || [];
      const picked = options.find((o) => o.id === finalChoiceId);
      if (!picked) throw new HttpsError("invalid-argument", "선택지를 골라주세요.");
      resolvedChoice = finalChoiceId;
      finalChoiceLabel = picked.text;
    }

    const essayText = String(essay || "").slice(0, 4000);
    const finalEssayText = finalEssay ? String(finalEssay).slice(0, 4000) : null;

    await db.runTransaction(async (tx) => {
      const [progressSnap, submissionSnap, countSnap] = await Promise.all([
        tx.get(progressRef),
        tx.get(submissionRef),
        tx.get(db.collection("caseSubmissions").where("uid", "==", uid).where("seasonId", "==", seasonId)),
      ]);
      if (!progressSnap.exists) throw new HttpsError("failed-precondition", "먼저 수사를 시작해주세요.");
      if (submissionSnap.exists) throw new HttpsError("already-exists", "이미 최종 제출했어요.");
      if (countSnap.size !== totalDays - 1) {
        throw new HttpsError("failed-precondition", "아직 이전 일차를 다 제출하지 않았어요.");
      }
      tx.set(submissionRef, {
        uid,
        seasonId,
        day: totalDays,
        choice: resolvedChoice,
        correct,
        finalChoiceLabel,
        essay: essayText,
        finalEssay: finalEssayText,
        submittedAt: new Date().toISOString(),
      });
      tx.update(progressRef, { completed: true });
    });

    return await judgeSeason({ uid, seasonId });
  }
);

export const caseGetResult = onCall(async (request) => {
  const uid = requireAuth(request);
  const { seasonId } = request.data || {};
  const db = getFirestore();
  const season = await loadSeasonForPlay(db, seasonId, uid);

  const [snap, progressSnap] = await Promise.all([
    db.doc(`caseResults/${progressId(uid, seasonId)}`).get(),
    db.doc(`caseProgress/${progressId(uid, seasonId)}`).get(),
  ]);
  if (!snap.exists) return { status: "none" };
  const r = snap.data();
  if (r.status !== "complete") return { status: r.status };

  return {
    status: "complete",
    seasonTitle: season.title || "",
    totalScore: r.totalScore,
    maxScore: r.maxScore,
    percent: r.percent,
    tier: r.tier,
    checkpointsResult: r.checkpointsResult,
    finalLetter: r.finalLetter,
    grid: r.grid || [],
    mode: progressSnap.exists ? progressSnap.data().mode : "realtime",
    truthExplanation: season.truthExplanation || "",
    finalChoiceScored: season.finalChoiceScored !== false,
  };
});

export const caseRetryJudge = onCall({ timeoutSeconds: 300, memory: "512MiB", secrets: [GEMINI_API_KEY] }, async (request) => {
  const uid = requireAuth(request);
  const { seasonId } = request.data || {};
  const db = getFirestore();
  await loadSeasonForPlay(db, seasonId, uid);

  const ref = db.doc(`caseResults/${progressId(uid, seasonId)}`);
  const snap = await ref.get();
  if (snap.exists && snap.data().status === "complete") {
    throw new HttpsError("failed-precondition", "이미 판정이 끝났어요.");
  }
  if (snap.exists && (snap.data().retryCount || 0) >= 3) {
    throw new HttpsError("resource-exhausted", "재시도 횟수를 다 썼어요. 문의해주세요.");
  }
  return await judgeSeason({ uid, seasonId, isRetry: true });
});
