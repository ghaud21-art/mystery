// "사건" 탭의 게임 종류(type) 공통 목록 + 놓친 장면 관리자 callable.
// 게임 공개 정보는 caseGames/{id}, 정답/단서/결말이 담긴 전체 시나리오는 caseGameContent/{id}에 따로
// 저장하고(둘 다 Firestore 규칙으로 클라이언트 접근 차단), 진행 상태는 caseRuns/{uid}_{id}에 저장한다.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "node:crypto";
import { requireAuth, requireAdmin } from "./auth.js";
import { validateScenario } from "./missedRules.js";

const GAME_ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;

function checkGameId(gameId) {
  if (typeof gameId !== "string" || !GAME_ID_RE.test(gameId)) {
    throw new HttpsError("invalid-argument", "게임 id는 영소문자/숫자/하이픈만, 2~41자로 써주세요.");
  }
}

const mediaOf = (mediaUrls, f) => (f ? (/^https?:\/\//.test(f) ? f : mediaUrls?.[f] ?? null) : null);

function buildPublicDoc(scenario, mediaUrls, existing) {
  const now = new Date().toISOString();
  return {
    type: "missed",
    title: scenario.meta.title,
    subtitle: scenario.meta.subtitle ?? "",
    series: scenario.meta.series ?? "놓친 장면",
    notice: scenario.notice ?? "",
    levels: Object.entries(scenario.levels).map(([key, lv]) => ({ key, label: lv.label ?? key, minutes: lv.minutes ?? "" })),
    thumbnailUrl: mediaOf(mediaUrls, scenario.meta.thumbnail),
    published: existing?.published ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

async function activePlayers(db, gameId) {
  const snap = await db.collection("caseRuns").where("gameId", "==", gameId).where("completed", "==", false).get();
  return snap.size;
}

// 허브(사건 탭)가 게임 종류별 목록을 만들 때 쓰는 공통 목록. 일반 플레이어는 공개된 것만 본다.
export const caseGamesList = onCall(async (request) => {
  const uid = requireAuth(request);
  const db = getFirestore();
  const adminSnap = await db.doc(`users/${uid}`).get();
  const isAdmin = adminSnap.exists && adminSnap.data()?.isAdmin === true;
  const [gamesSnap, runsSnap] = await Promise.all([
    isAdmin ? db.collection("caseGames").get() : db.collection("caseGames").where("published", "==", true).get(),
    db.collection("caseRuns").where("uid", "==", uid).get(),
  ]);
  const runByGame = Object.fromEntries(runsSnap.docs.map((d) => [d.data().gameId, d.data()]));
  return {
    games: gamesSnap.docs.map((d) => {
      const g = d.data();
      const r = runByGame[d.id];
      return {
        gameId: d.id, type: g.type, title: g.title, subtitle: g.subtitle, series: g.series, notice: g.notice ?? "",
        thumbnailUrl: g.thumbnailUrl ?? null, levels: g.levels ?? [], published: !!g.published,
        myState: r ? { started: true, completed: !!r.completed } : { started: false },
      };
    }),
  };
});

export const caseGameAdminList = onCall(async (request) => {
  await requireAdmin(request);
  const db = getFirestore();
  const snap = await db.collection("caseGames").get();
  return {
    games: snap.docs.map((d) => ({ gameId: d.id, type: d.data().type, title: d.data().title, published: !!d.data().published })),
  };
});

export const caseGameAdminGet = onCall(async (request) => {
  await requireAdmin(request);
  const { gameId } = request.data || {};
  checkGameId(gameId);
  const db = getFirestore();
  const [pub, content] = await Promise.all([db.doc(`caseGames/${gameId}`).get(), db.doc(`caseGameContent/${gameId}`).get()]);
  if (!pub.exists || !content.exists) throw new HttpsError("not-found", "게임을 찾을 수 없어요.");
  return { gameId, published: !!pub.data().published, scenario: content.data().scenario, mediaUrls: content.data().mediaUrls ?? {} };
});

// 시나리오 JSON 전체를 검증해서 저장. 이미 있는 게임이면 내용만 바꾸고 공개 여부와 미디어 연결은 유지한다.
export const caseGameAdminImport = onCall(async (request) => {
  await requireAdmin(request);
  const { gameId, scenario } = request.data || {};
  checkGameId(gameId);
  if (!scenario || typeof scenario !== "object") throw new HttpsError("invalid-argument", "scenario 데이터가 없어요.");
  const { errors, warnings } = validateScenario(scenario);
  if (errors.length) throw new HttpsError("invalid-argument", `검증 실패 (${errors.length}건): ${errors.slice(0, 6).join(" / ")}`);
  if (JSON.stringify(scenario).length > 900000) throw new HttpsError("invalid-argument", "시나리오가 너무 커요(900KB 이하).");

  const db = getFirestore();
  const [pubSnap, contentSnap] = await Promise.all([db.doc(`caseGames/${gameId}`).get(), db.doc(`caseGameContent/${gameId}`).get()]);
  const existingMedia = contentSnap.exists ? contentSnap.data().mediaUrls ?? {} : {};
  const mediaUrls = { ...(scenario.mediaUrls ?? {}), ...existingMedia };
  const clean = { ...scenario };
  delete clean.mediaUrls;
  const batch = db.batch();
  batch.set(db.doc(`caseGames/${gameId}`), buildPublicDoc(clean, mediaUrls, pubSnap.exists ? pubSnap.data() : null));
  batch.set(db.doc(`caseGameContent/${gameId}`), { scenario: clean, mediaUrls });
  await batch.commit();
  return { gameId, warnings, activeCount: await activePlayers(db, gameId) };
});

// 브라우저가 Storage에 직접 올리려면 쓰기 규칙을 통과해야 한다. 규칙은 Firestore를 다시 읽는 대신 로그인 토큰의
// gameAdmin 표식만 본다 — 이 함수가 (Firestore의 isAdmin을 서버에서 확인한 뒤) 그 표식을 붙여 준다.
// 호출한 뒤 클라이언트가 ID 토큰을 새로 받아야 표식이 반영된다.
export const caseGameAdminUploadAccess = onCall(async (request) => {
  const uid = await requireAdmin(request);
  const user = await getAuth().getUser(uid);
  if (user.customClaims?.gameAdmin !== true) {
    await getAuth().setCustomUserClaims(uid, { ...(user.customClaims ?? {}), gameAdmin: true });
  }
  return { ok: true };
});

// 올라온 파일을 시나리오의 파일명에 연결. 다운로드 주소(토큰 포함)는 서버가 만든다 — Storage 읽기 규칙이 막혀 있어서
// 브라우저의 getDownloadURL()은 쓸 수 없기 때문. files = [시나리오가 쓰는 파일명, ...]
export const caseGameAdminSetMedia = onCall(async (request) => {
  await requireAdmin(request);
  const { gameId, files, remove } = request.data || {};
  checkGameId(gameId);
  if (!Array.isArray(files) && !Array.isArray(remove)) throw new HttpsError("invalid-argument", "files가 필요해요.");
  const db = getFirestore();
  const contentRef = db.doc(`caseGameContent/${gameId}`);
  const contentSnap = await contentRef.get();
  if (!contentSnap.exists) throw new HttpsError("not-found", "게임을 찾을 수 없어요.");
  const merged = { ...(contentSnap.data().mediaUrls ?? {}) };
  const bucket = getStorage().bucket();
  const added = {};
  for (const name of (files ?? []).slice(0, 60)) {
    if (typeof name !== "string" || !name || name.includes("/")) continue;
    const file = bucket.file(`case-games/${gameId}/${name}`);
    const [exists] = await file.exists();
    if (!exists) throw new HttpsError("not-found", `${name} 파일이 Storage에 아직 없어요. 업로드가 끝났는지 확인해 주세요.`);
    const [meta] = await file.getMetadata();
    let token = String(meta.metadata?.firebaseStorageDownloadTokens ?? "").split(",")[0];
    if (!token) {
      token = randomUUID();
      await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
    }
    added[name] = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${token}`;
  }
  Object.assign(merged, added);
  for (const name of remove ?? []) delete merged[name];
  const scenario = contentSnap.data().scenario;
  await contentRef.update({ mediaUrls: merged });
  await db.doc(`caseGames/${gameId}`).update({ thumbnailUrl: mediaOf(merged, scenario.meta.thumbnail), updatedAt: new Date().toISOString() });
  return { gameId, urls: added, count: Object.keys(merged).length };
});

export const caseGameAdminPublish = onCall(async (request) => {
  await requireAdmin(request);
  const { gameId, published } = request.data || {};
  checkGameId(gameId);
  const db = getFirestore();
  const ref = db.doc(`caseGames/${gameId}`);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "게임을 찾을 수 없어요.");
  await ref.update({ published: !!published });
  return { gameId, published: !!published };
});

// 게임 삭제 — 시나리오, 공개 정보, 그 게임의 모든 진행 상태까지 함께 지움.
export const caseGameAdminDelete = onCall(async (request) => {
  await requireAdmin(request);
  const { gameId } = request.data || {};
  checkGameId(gameId);
  const db = getFirestore();
  const runs = await db.collection("caseRuns").where("gameId", "==", gameId).get();
  const refs = [db.doc(`caseGames/${gameId}`), db.doc(`caseGameContent/${gameId}`), ...runs.docs.map((d) => d.ref)];
  for (let i = 0; i < refs.length; i += 450) {
    const batch = db.batch();
    refs.slice(i, i + 450).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  return { gameId, deletedRuns: runs.size };
});

export const caseGameAdminResetMyRun = onCall(async (request) => {
  const uid = await requireAdmin(request);
  const { gameId } = request.data || {};
  checkGameId(gameId);
  await getFirestore().doc(`caseRuns/${uid}_${gameId}`).delete();
  return { reset: true };
});

export const caseGameAdminStats = onCall(async (request) => {
  await requireAdmin(request);
  const { gameId } = request.data || {};
  checkGameId(gameId);
  const db = getFirestore();
  const [contentSnap, runsSnap] = await Promise.all([
    db.doc(`caseGameContent/${gameId}`).get(),
    db.collection("caseRuns").where("gameId", "==", gameId).get(),
  ]);
  if (!contentSnap.exists) throw new HttpsError("not-found", "게임을 찾을 수 없어요.");
  const scenario = contentSnap.data().scenario;
  const runs = runsSnap.docs.map((d) => d.data());
  const done = runs.filter((r) => r.completed);
  const endings = {};
  done.forEach((r) => { endings[r.endingId] = (endings[r.endingId] ?? 0) + 1; });
  const visits = {};
  scenario.locations.forEach((l) => { visits[l.id] = 0; });
  runs.forEach((r) => (r.visited ?? []).forEach((id) => { if (id in visits) visits[id] += 1; }));
  return {
    gameId, started: runs.length, completed: done.length,
    endings: scenario.endings.map((e) => ({ id: e.id, title: e.title, count: endings[e.id] ?? 0 })),
    locations: scenario.locations.map((l) => ({ id: l.id, name: l.name, visits: visits[l.id] })),
  };
});

