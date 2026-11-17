// "놓친 장면" 게임의 규칙(순수 함수). Firestore/네트워크 호출 없음 — 서버(functions/case/missed.js)가
// 플레이어의 행동을 판정할 때만 쓰고, 정답/단서 위치/진술 조건은 절대 클라이언트로 내려가지 않는다.
// 규칙 자체는 ethicsmystery(윤리미스터리)의 조사 모드와 같은 구조를 따른다.

export const DEFAULT_TW = 1.5; // 영상 속 단서가 "보이는" 시간 폭(± 초)
export const MISS_TEXT = "그곳에서는 아무것도 찾지 못했다.";

export function newRun(scenario, level, playerName = "") {
  return {
    level,
    playerName,
    step: "brief", // brief -> map -> location -> decision -> timeline -> report -> report2 -> ending -> missed -> story -> ended
    day: 1,
    visitsToday: 0,
    visited: [],
    current: null,
    inspect: {}, // { [locId]: { used, found: [clueId], decoys: [spotId], misses: [{x,y,t}] } }
    found: (scenario.startClues ?? []).map((c) => c.id),
    flipped: {},
    wrong: {},
    met: {},
    links: [],
    linkTries: 0,
    decisions: {},
    pendingDecision: null,
    timeline: null,
    timelineScore: null,
    report: {},
    endingId: null,
  };
}

export function levelOf(scenario, run) {
  return scenario.levels?.[run?.level] ?? scenario.levels?.standard ?? {};
}

export function daysOf(scenario) {
  return scenario.settings?.days ?? [2, 2, 1];
}

export function visitLimitOf(scenario) {
  return scenario.settings?.visitLimit ?? 5;
}

// 난이도에 따라 보이는 단서 (입문은 가짜 단서를 뺀다)
export function cluesOf(scenario, run, loc) {
  const lv = levelOf(scenario, run);
  return (loc.clues ?? []).filter((c) => !(lv.fakeClues === false && c.difficulty === "fake"));
}

export function allClues(scenario) {
  const map = {};
  (scenario.startClues ?? []).forEach((c) => (map[c.id] = { ...c, start: true }));
  (scenario.locations ?? []).forEach((l) =>
    (l.clues ?? []).forEach((c) => (map[c.id] = { ...c, locationId: l.id, locationName: l.name }))
  );
  return map;
}

// 시계 오차를 끈 난이도에서는 단서 글에 다른 문구(textNoSkew)를 쓴다.
export function clueText(scenario, run, clue) {
  const lv = levelOf(scenario, run);
  if (lv.clockSkew === false && clue.textNoSkew) return clue.textNoSkew;
  return clue.text;
}

export function locationOpen(scenario, run, loc) {
  const lv = levelOf(scenario, run);
  if (lv.fixedLocations) return lv.fixedLocations.includes(loc.id);
  const u = loc.unlock ?? { start: true };
  if (u.start) return true;
  const found = new Set(run.found);
  if (u.anyClue?.some((id) => found.has(id))) return true;
  if (u.anyClueFrom && (scenario.locations.find((l) => l.id === u.anyClueFrom)?.clues ?? []).some((c) => found.has(c.id))) return true;
  if (u.visited?.some((id) => run.visited.includes(id))) return true;
  return false;
}

// 결정의 선택 효과(effect.inspectLimit)로 특정 장소의 지목 횟수가 줄어들 수 있음
export function inspectLimitOf(scenario, run, loc) {
  const base = scenario.settings?.inspectLimitPerLocation ?? 7;
  for (const d of scenario.decisions ?? []) {
    const opt = d.options?.find((o) => o.id === run.decisions?.[d.id]);
    if (opt?.effect?.inspectLimit?.[loc.id] != null) return opt.effect.inspectLimit[loc.id];
  }
  return base;
}

export function inspectModeOf(scenario, run) {
  const lv = levelOf(scenario, run);
  if (lv.hints) return "marker";
  return scenario.settings?.inspectMode === "marker" ? "marker" : "freeclick";
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
const pick = (h) => ({
  x: h?.x ?? null,
  y: h?.y ?? null,
  w: h?.w ?? null,
  h: h?.h ?? null,
  at: (h?.at ?? []).filter((a) => a.x != null),
});

// 지목 후보: 단서 + 혼란 지점. 순서는 장소 id 기반 해시로 고정(새로고침해도 같은 key 순서).
export function spotsOf(scenario, run, loc) {
  const clues = cluesOf(scenario, run, loc).map((c) => ({
    id: c.id, kind: "clue", label: c.hotspot?.label ?? c.title, ...pick(c.hotspot),
  }));
  const decoys = (loc.decoyHotspots ?? []).map((d, i) => ({
    id: d.id ?? `${loc.id}_d${i}`, kind: "decoy", label: d.label, text: d.text, ...pick(d),
  }));
  return [...clues, ...decoys]
    .sort((a, b) => hash(loc.id + a.id) - hash(loc.id + b.id))
    .map((s, i) => ({ ...s, key: String(i) }));
}

export const isTimed = (spot) => spot.at?.length > 0;
export const isPlaced = (spot) => isTimed(spot) || spot.x != null;
export const inRect = (r, fx, fy) => fx >= r.x && fx <= r.x + (r.w ?? 0.12) && fy >= r.y && fy <= r.y + (r.h ?? 0.12);

export function activeRects(spot, t) {
  if (isTimed(spot)) return spot.at.filter((a) => t != null && Math.abs(t - a.t) <= (a.tw ?? DEFAULT_TW));
  return spot.x != null ? [spot] : [];
}

export function hitSpot(spots, fx, fy, t = null) {
  return spots.find((s) => activeRects(s, t).some((r) => inRect(r, fx, fy)));
}

// flip.anyOf = [{clues:[a]}, {clues:[b, c]}] 중 한 묶음을 전부 포함하면 두 번째 진술이 열림
export function presentWorks(ch, clueIds) {
  const set = new Set(clueIds);
  return (ch.flip?.anyOf ?? []).some((group) => (Array.isArray(group) ? group : group.clues ?? []).every((id) => set.has(id)));
}

const WRONG_DEFAULT = { intro: null, standard: 3, advanced: 2 };
export function wrongLimitOf(scenario, run) {
  const v = levelOf(scenario, run).wrongPresentLimit;
  if (v === 0 || v === null) return null;
  if (v != null) return v;
  return run?.level in WRONG_DEFAULT ? WRONG_DEFAULT[run.level] : scenario.settings?.wrongPresentLimit ?? 3;
}

export function statementLocked(scenario, run, ch) {
  for (const d of scenario.decisions ?? []) {
    const opt = d.options?.find((o) => o.id === run.decisions?.[d.id]);
    if (opt?.effect?.lockStatement === ch.id) return true;
  }
  const lim = wrongLimitOf(scenario, run);
  return lim != null && (run.wrong?.[ch.id] ?? 0) >= lim;
}

export function findLink(scenario, a, b) {
  return (scenario.links ?? []).find((l) => (l.clues[0] === a && l.clues[1] === b) || (l.clues[0] === b && l.clues[1] === a)) ?? null;
}

export function linkLimitOf(scenario, run) {
  return levelOf(scenario, run).linkLimit ?? null;
}

// 도달한 진실의 겹
export function layersReached(scenario, run) {
  const links = new Set(run.links);
  return (scenario.layers ?? []).filter(
    (ly, i) => i === 0 || (ly.byLinks ?? []).some((id) => links.has(id)) || (ly.byFlip ?? []).some((id) => run.flipped[id])
  );
}

export function decisionAvailable(scenario, run, d) {
  if (d.requiresClue && !run.found.includes(d.requiresClue)) return false;
  if (d.skipIfFlipped && run.flipped[d.skipIfFlipped]) return false;
  if (d.requiresAnswer) {
    const [k, v] = Object.entries(d.requiresAnswer)[0];
    if (Array.isArray(v) ? !v.includes(run.report?.[k]) : run.report?.[k] !== v) return false;
  }
  return true;
}

export function timelineCardTime(scenario, run, card) {
  const knows = (ids) => (ids ?? []).some((id) => run.found.includes(id) || run.flipped[id]);
  const lv = levelOf(scenario, run);
  if (knows(card.revealBy)) return lv.clockSkew === false && card.timeNoSkew ? card.timeNoSkew : card.time;
  if (knows(card.altBy)) return lv.clockSkew === false ? card.timeNoSkew ?? card.time : card.timeAlt ?? null;
  return null;
}

export function timelineScoreOf(scenario, order) {
  const correct = [...(scenario.timeline?.cards ?? [])].sort((a, b) => a.order - b.order).map((c) => c.id);
  return (order ?? []).filter((id, i) => correct[i] === id).length;
}

// 보고서 → 결말 (엔진에 고정된 5가지 조건)
export function decideEnding(scenario, run) {
  const q = Object.fromEntries((scenario.report?.questions ?? []).map((x) => [x.id, x]));
  const who = run.report.who;
  if (who === q.who?.machineOption) return "machine";
  if (who !== q.who?.answer) return "convenient";
  const allRight = ["who", "when", "why"].every((k) => run.report[k] === q[k]?.answer);
  if (allRight && run.decisions.d5 === "disclose") return "whole";
  if (run.decisions.d3 === "anonymous") return "anonymous";
  return "half";
}

// 하루를 마친 뒤 어디로 갈지 (결정 → 다음 날, 마지막 날은 시간표)
export function afterDay(scenario, run) {
  if (run.day >= daysOf(scenario).length) return { step: "timeline" };
  return { step: "map", day: run.day + 1, visitsToday: 0 };
}

export function pendingDayDecision(scenario, run) {
  return (scenario.decisions ?? []).find((x) => x.when === `day${run.day}` && !run.decisions[x.id] && decisionAvailable(scenario, run, x)) ?? null;
}

// 업로드/가져오기 시 구조 검증. errors가 있으면 저장하지 않고, warnings는 알려만 줌.
export function validateScenario(s) {
  const errors = [];
  const warnings = [];
  const must = (cond, msg) => { if (!cond) errors.push(msg); };
  must(s && typeof s === "object", "시나리오 객체가 아니에요.");
  if (errors.length) return { errors, warnings };
  must(s.meta?.title, "meta.title이 필요해요.");
  must(s.levels && Object.keys(s.levels).length > 0, "levels(난이도)가 필요해요.");
  must(Array.isArray(s.locations) && s.locations.length > 0, "locations(장소)가 필요해요.");
  must(Array.isArray(s.characters) && s.characters.length > 0, "characters(인물)가 필요해요.");
  must(Array.isArray(s.decisions), "decisions(결정)가 필요해요.");
  must(s.timeline?.cards?.length > 0, "timeline.cards가 필요해요.");
  must(s.report?.questions?.length > 0, "report.questions가 필요해요.");
  must(Array.isArray(s.endings) && s.endings.length > 0, "endings(결말)가 필요해요.");
  if (errors.length) return { errors, warnings };

  const clueIds = [];
  (s.startClues ?? []).forEach((c) => clueIds.push(c.id));
  s.locations.forEach((l) => {
    must(l.id && l.name, `장소에 id/name이 필요해요: ${l.id}`);
    (l.clues ?? []).forEach((c) => {
      clueIds.push(c.id);
      must(c.hotspot?.label, `단서 ${c.id}에 hotspot.label이 필요해요.`);
    });
  });
  const dup = clueIds.filter((id, i) => clueIds.indexOf(id) !== i);
  must(dup.length === 0, `단서 id가 중복돼요: ${[...new Set(dup)].join(", ")}`);
  const clueSet = new Set(clueIds);
  const locIds = new Set(s.locations.map((l) => l.id));
  const charIds = new Set(s.characters.map((c) => c.id));

  s.locations.forEach((l) => {
    if (l.character) must(charIds.has(l.character), `장소 ${l.id}의 character(${l.character})가 인물 목록에 없어요.`);
    (l.unlock?.anyClue ?? []).forEach((id) => must(clueSet.has(id), `장소 ${l.id}의 unlock 단서 ${id}가 없어요.`));
  });
  s.characters.forEach((c) => {
    must(c.statement1?.text && c.statement2?.text, `인물 ${c.id}에 statement1/statement2 text가 필요해요.`);
    (c.flip?.anyOf ?? []).forEach((g) => (g.clues ?? []).forEach((id) => must(clueSet.has(id), `인물 ${c.id}의 flip 단서 ${id}가 없어요.`)));
  });
  (s.links ?? []).forEach((l) => {
    must(l.clues?.length === 2, `단서 잇기 ${l.id}는 단서 2개가 필요해요.`);
    (l.clues ?? []).forEach((id) => must(clueSet.has(id), `단서 잇기 ${l.id}의 단서 ${id}가 없어요.`));
  });
  (s.layers ?? []).forEach((ly) => {
    (ly.byLinks ?? []).forEach((id) => must((s.links ?? []).some((l) => l.id === id), `겹 ${ly.id}의 byLinks ${id}가 없어요.`));
    (ly.byFlip ?? []).forEach((id) => must(charIds.has(id), `겹 ${ly.id}의 byFlip ${id}가 인물에 없어요.`));
  });
  const qs = Object.fromEntries(s.report.questions.map((q) => [q.id, q]));
  ["who", "when", "why"].forEach((k) => {
    must(qs[k]?.options?.length > 0, `report.questions에 ${k} 문항이 필요해요.`);
    must(qs[k]?.options?.some((o) => o.id === qs[k]?.answer), `${k} 문항의 answer가 선택지에 없어요.`);
  });
  must(qs.who?.options?.some((o) => o.id === qs.who?.machineOption), "who 문항의 machineOption이 선택지에 없어요.");
  const endIds = new Set(s.endings.map((e) => e.id));
  ["convenient", "machine", "half", "anonymous", "whole"].forEach((id) => must(endIds.has(id), `endings에 ${id}가 필요해요.`));
  const orders = s.timeline.cards.map((c) => c.order);
  must(new Set(orders).size === orders.length, "timeline.cards의 order가 중복돼요.");
  (s.decisions ?? []).forEach((d) => {
    must(d.id && d.options?.length > 0, `결정 ${d.id}에 options가 필요해요.`);
    d.options?.forEach((o) => {
      if (o.effect?.flip) must(charIds.has(o.effect.flip), `결정 ${d.id}의 flip 인물 ${o.effect.flip}이 없어요.`);
      if (o.effect?.lockStatement) must(charIds.has(o.effect.lockStatement), `결정 ${d.id}의 lockStatement 인물이 없어요.`);
      Object.keys(o.effect?.inspectLimit ?? {}).forEach((id) => must(locIds.has(id), `결정 ${d.id}의 inspectLimit 장소 ${id}가 없어요.`));
    });
  });

  // 중첩 배열은 Firestore에 저장할 수 없음
  const hasNested = (v) => Array.isArray(v) ? v.some((x) => Array.isArray(x) || hasNested(x)) : v && typeof v === "object" ? Object.values(v).some(hasNested) : false;
  must(!hasNested(s), "배열 안에 배열이 있어요. { clues: [...] } 같은 객체로 감싸주세요.");

  if (s.locations.length !== 7) warnings.push(`장소가 ${s.locations.length}곳이에요 (표준은 7곳).`);
  if (s.characters.length !== 6) warnings.push(`인물이 ${s.characters.length}명이에요 (표준은 6명).`);
  if ((s.links ?? []).length !== 8) warnings.push(`단서 잇기가 ${(s.links ?? []).length}쌍이에요 (표준은 8쌍).`);
  s.locations.forEach((l) => {
    if ((l.clues ?? []).length !== 4) warnings.push(`장소 ${l.id}의 단서가 ${(l.clues ?? []).length}개예요 (표준은 4개).`);
  });
  if (s.timeline.cards.length !== 12) warnings.push(`시간표 카드가 ${s.timeline.cards.length}장이에요 (표준은 12장).`);
  return { errors, warnings };
}
