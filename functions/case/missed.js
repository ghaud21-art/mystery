// "놓친 장면" — 플레이어용 callable. 정답/단서 위치/두 번째 진술/결말/숨겨진 이야기는 Firestore 규칙으로
// 클라이언트 읽기가 전면 차단돼 있고, 여기서 플레이어의 행동(지목·진술에 단서 내밀기·단서 잇기·결정·
// 보고서)을 판정해 "지금 단계에서 보여도 되는 것"만 만들어 내려준다.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { requireAuth } from "./auth.js";
import * as R from "./missedRules.js";
import { applyAction, buildView, cleanRun, bad, need } from "./missedEngine.js";

const GAME_ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;

function checkGameId(gameId) {
  if (typeof gameId !== "string" || !GAME_ID_RE.test(gameId)) throw new HttpsError("invalid-argument", "잘못된 게임 id예요.");
}
const runId = (uid, gameId) => `${uid}_${gameId}`;

async function isAdminUid(db, uid) {
  if (!uid) return false;
  const snap = await db.doc(`users/${uid}`).get();
  return snap.exists && snap.data()?.isAdmin === true;
}

// 공개된 게임만 플레이할 수 있고, 관리자는 비공개(테스트 중) 게임도 미리 플레이해볼 수 있다.
async function loadGame(db, gameId, uid) {
  checkGameId(gameId);
  const [pubSnap, contentSnap] = await Promise.all([
    db.doc(`caseGames/${gameId}`).get(),
    db.doc(`caseGameContent/${gameId}`).get(),
  ]);
  if (!pubSnap.exists || !contentSnap.exists) throw new HttpsError("not-found", "게임을 찾을 수 없어요.");
  const pub = pubSnap.data();
  if (pub.published !== true && !(await isAdminUid(db, uid))) throw new HttpsError("not-found", "게임을 찾을 수 없어요.");
  const content = contentSnap.data();
  return { pub, scenario: content.scenario, mediaUrls: content.mediaUrls ?? {} };
}

// 완주한 플레이어들이 각 장소를 간 비율 — 결과 화면에서 "사람마다 간 곳이 다르다"를 보여 주는 용도.
async function locationStats(db, gameId, scenario) {
  const snap = await db.collection("caseRuns").where("gameId", "==", gameId).where("completed", "==", true).limit(500).get();
  const total = snap.size;
  const out = {};
  scenario.locations.forEach((l) => { out[l.id] = { name: l.name, percent: 0 }; });
  if (total === 0) return { total, locations: out };
  snap.docs.forEach((d) => (d.data().visited ?? []).forEach((lid) => { if (out[lid]) out[lid].percent += 1; }));
  Object.values(out).forEach((o) => { o.percent = Math.round((o.percent / total) * 100); });
  return { total, locations: out };
}

export const missedGetPublic = onCall(async (request) => {
  const db = getFirestore();
  const { gameId } = request.data || {};
  const { pub, scenario } = await loadGame(db, gameId, request.auth?.uid);
  return {
    gameId,
    title: pub.title, subtitle: pub.subtitle, series: pub.series, notice: pub.notice ?? "",
    thumbnailUrl: pub.thumbnailUrl ?? null, published: !!pub.published, estimatedMinutes: pub.estimatedMinutes ?? null,
    levels: Object.entries(scenario.levels).map(([key, lv]) => ({ key, label: lv.label ?? key, minutes: lv.minutes ?? "", desc: lv.desc ?? "" })),
    defaultLevel: scenario.settings?.defaultLevel ?? "standard",
  };
});

// 모든 플레이 행동의 단일 진입점. 매 호출마다 트랜잭션으로 진행 상태를 읽고 → 규칙대로 판정 → 저장하고,
// 그 단계에서 보여도 되는 화면 데이터만 돌려준다.
export const missedPlay = onCall(async (request) => {
  const uid = requireAuth(request);
  const db = getFirestore();
  const { gameId, action, ...payload } = request.data || {};
  const { pub, scenario, mediaUrls } = await loadGame(db, gameId, uid);
  const ref = db.doc(`caseRuns/${runId(uid, gameId)}`);
  const U = (f) => (f ? (/^https?:\/\//.test(f) ? f : mediaUrls[f] ?? null) : null);

  if (action === "restart") {
    await ref.delete();
    return { restarted: true };
  }

  let outRun;
  let extra = {};
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (action === "start") {
      if (snap.exists) { outRun = snap.data(); return; }
      const level = payload.level in scenario.levels ? payload.level : scenario.settings?.defaultLevel ?? "standard";
      bad(level in scenario.levels, "난이도를 선택해주세요.");
      const run = R.newRun(scenario, level, String(payload.name ?? "").trim().slice(0, 20));
      outRun = { uid, gameId, ...run, completed: false, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      tx.set(ref, outRun);
      return;
    }
    need(snap.exists, "먼저 조사를 시작해주세요.");
    const run = snap.data();
    extra = applyAction({ scenario, run, action, p: { ...payload, _U: U } });
    run.completed = ["ending", "missed", "story", "ended"].includes(run.step);
    run.updatedAt = new Date().toISOString();
    if (action !== "state") tx.set(ref, run);
    outRun = run;
  });

  const view = await buildView({ gameId, scenario, mediaUrls, run: cleanRun(outRun), statsFn: () => locationStats(db, gameId, scenario) });
  return { view, extra };
});
