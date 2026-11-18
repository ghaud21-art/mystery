// "사건" 탭의 게임 종류(type) 공통 목록 + 놓친 장면 관리자 callable.
// 게임 공개 정보는 caseGames/{id}, 정답/단서/결말이 담긴 전체 시나리오는 caseGameContent/{id}에 따로
// 저장하고(둘 다 Firestore 규칙으로 클라이언트 접근 차단), 진행 상태는 caseRuns/{uid}_{id}에 저장한다.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
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

// 업로드한 영상/이미지의 다운로드 주소를 파일명에 연결. 파일명은 시나리오 안에서 video/image 등으로 참조함.
export const caseGameAdminSetMedia = onCall(async (request) => {
  await requireAdmin(request);
  const { gameId, mediaUrls } = request.data || {};
  checkGameId(gameId);
  if (!mediaUrls || typeof mediaUrls !== "object") throw new HttpsError("invalid-argument", "mediaUrls가 필요해요.");
  const db = getFirestore();
  const contentRef = db.doc(`caseGameContent/${gameId}`);
  const contentSnap = await contentRef.get();
  if (!contentSnap.exists) throw new HttpsError("not-found", "게임을 찾을 수 없어요.");
  const merged = { ...(contentSnap.data().mediaUrls ?? {}) };
  for (const [file, url] of Object.entries(mediaUrls)) {
    if (url === null) delete merged[file];
    else if (typeof url === "string" && /^https:\/\//.test(url)) merged[file] = url;
  }
  const scenario = contentSnap.data().scenario;
  await contentRef.update({ mediaUrls: merged });
  await db.doc(`caseGames/${gameId}`).update({ thumbnailUrl: mediaOf(merged, scenario.meta.thumbnail), updatedAt: new Date().toISOString() });
  return { gameId, count: Object.keys(merged).length };
});

// 플레이형 편집기가 보내는 부분 수정: 단서/혼란 지점의 제목·문구·영상 속 위치만 바꾼다. 나머지 시나리오는 그대로.
// patch = { clues: { [clueId]: { title?, text?, textNoSkew?, hotspot?: {label?, x,y,w,h} | {label?, at:[{t,tw?,x,y,w,h}]} | {label?} } },
//           decoys: { [decoyId]: { label?, text?, x?,y?,w?,h? } (좌표를 null로 보내면 위치 해제) } }
const num01 = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, Math.round(v * 10000) / 10000)) : null);
const str = (v, max = 600) => (typeof v === "string" ? v.slice(0, max) : undefined);
function cleanRect(r) {
  const x = num01(r?.x), y = num01(r?.y), w = num01(r?.w), h = num01(r?.h);
  if (x == null || y == null || w == null || h == null || w < 0.01 || h < 0.01) return null;
  return { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
}

export const caseGameAdminPatch = onCall(async (request) => {
  await requireAdmin(request);
  const { gameId, patch } = request.data || {};
  checkGameId(gameId);
  if (!patch || typeof patch !== "object") throw new HttpsError("invalid-argument", "수정 내용이 없어요.");
  const db = getFirestore();
  const ref = db.doc(`caseGameContent/${gameId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "게임을 찾을 수 없어요.");
  const scenario = snap.data().scenario;
  let changed = 0;

  for (const loc of scenario.locations ?? []) {
    for (const clue of loc.clues ?? []) {
      const p = patch.clues?.[clue.id];
      if (!p) continue;
      changed++;
      for (const k of ["title", "text", "textNoSkew"]) {
        const v = str(p[k]);
        if (v !== undefined) { if (v === "" && k === "textNoSkew") delete clue[k]; else clue[k] = v; }
      }
      if (p.hotspot && typeof p.hotspot === "object") {
        const label = str(p.hotspot.label, 80) ?? clue.hotspot?.label ?? clue.title;
        if (Array.isArray(p.hotspot.at) && p.hotspot.at.length) {
          const at = [];
          for (const a of p.hotspot.at.slice(0, 20)) {
            const r = cleanRect(a);
            const t = typeof a?.t === "number" && Number.isFinite(a.t) ? Math.max(0, Math.round(a.t * 100) / 100) : null;
            if (!r || t == null) throw new HttpsError("invalid-argument", `${clue.id}: 시각이나 영역이 올바르지 않아요.`);
            const tw = typeof a.tw === "number" && a.tw > 0 && a.tw <= 10 ? Math.round(a.tw * 100) / 100 : undefined;
            at.push({ t, ...(tw ? { tw } : {}), ...r });
          }
          clue.hotspot = { label, at };
        } else if (p.hotspot.x != null) {
          const r = cleanRect(p.hotspot);
          if (!r) throw new HttpsError("invalid-argument", `${clue.id}: 영역이 올바르지 않아요.`);
          clue.hotspot = { label, ...r };
        } else {
          clue.hotspot = { label }; // 위치 해제 → 플레이어에게 버튼 방식으로 보임
        }
      }
    }
    for (const d of loc.decoyHotspots ?? []) {
      const p = patch.decoys?.[d.id];
      if (!p) continue;
      changed++;
      const label = str(p.label, 80); if (label !== undefined) d.label = label;
      const text = str(p.text); if (text !== undefined) d.text = text;
      if ("x" in p) {
        const r = cleanRect(p);
        for (const k of ["x", "y", "w", "h"]) delete d[k];
        if (r) Object.assign(d, r);
      }
    }
  }
  if (!changed) throw new HttpsError("invalid-argument", "수정할 단서를 찾지 못했어요.");

  const { errors, warnings } = validateScenario(scenario);
  if (errors.length) throw new HttpsError("invalid-argument", `검증 실패: ${errors.slice(0, 4).join(" / ")}`);
  await ref.update({ scenario });
  await db.doc(`caseGames/${gameId}`).update({ updatedAt: new Date().toISOString() });
  return { gameId, changed, warnings };
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

