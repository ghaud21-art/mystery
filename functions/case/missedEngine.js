// 놓친 장면 엔진(순수 로직): 플레이어 행동 판정(applyAction)과 단계별 화면 데이터 생성(buildView).
// Firestore/Functions 의존성이 없어서 로컬에서 시뮬레이션 테스트가 가능하다.
import { HttpsError } from "firebase-functions/v2/https";
import * as R from "./missedRules.js";

export const cleanRun = (run) => {
  const { uid, gameId, completed, updatedAt, startedAt, ...rest } = run; // eslint-disable-line no-unused-vars
  return rest;
};

// ---------------------------------------------------------------- 보여줄 내용 만들기

function makeViewer(scenario, mediaUrls, run) {
  const U = (f) => (f ? (/^https?:\/\//.test(f) ? f : mediaUrls[f] ?? null) : null);
  const clueMap = R.allClues(scenario);
  const card = (id) => {
    const c = clueMap[id];
    if (!c) return null;
    return {
      id: c.id, kind: c.kind ?? "card", title: c.title, text: R.clueText(scenario, run, c) ?? "",
      image: U(c.image), start: !!c.start, locationName: c.locationName ?? null,
    };
  };
  const call = (c) => (c ? { who: c.who ?? "전화", text: c.text, image: U(c.image), audio: U(c.audio) } : null);
  const decisionNoEvidence = (chId) =>
    (scenario.decisions ?? []).some((d) => {
      const opt = d.options?.find((o) => o.id === run.decisions?.[d.id]);
      return opt?.effect?.flip === chId && (opt.effect.noEvidence === true || (d.id === "d2" && opt.id === "promise"));
    });
  const person = (ch) => {
    const flipped = !!run.flipped[ch.id];
    const lim = R.wrongLimitOf(scenario, run);
    return {
      id: ch.id, name: ch.name, age: ch.age, role: ch.role,
      statement1: { text: ch.statement1?.text, video: U(ch.statement1?.video) },
      statement2: flipped ? { text: ch.statement2?.text, video: U(ch.statement2?.video) } : null,
      flipped,
      locked: !flipped && R.statementLocked(scenario, run, ch),
      wrongLeft: lim != null ? Math.max(0, lim - (run.wrong?.[ch.id] ?? 0)) : null,
      noEvidence: flipped && decisionNoEvidence(ch.id),
    };
  };
  const decisionView = (d) => {
    const notVisited = d.visitLoc && !run.visited.includes(d.visitLoc);
    return {
      id: d.id, label: d.label,
      call: call(notVisited && d.callIfNotVisited ? d.callIfNotVisited : d.call),
      situation: notVisited && d.situationIfNotVisited ? d.situationIfNotVisited : d.situation,
      options: d.options.map((o) => ({ id: o.id, label: o.label })),
    };
  };
  return { U, card, call, person, decisionView, clueMap };
}

function notebookOf(scenario, run, V) {
  const lim = R.linkLimitOf(scenario, run);
  const videos = [];
  run.visited.forEach((lid) => {
    const l = scenario.locations.find((x) => x.id === lid);
    if (l?.video && V.U(l.video)) videos.push({ title: l.name, src: V.U(l.video) });
  });
  scenario.characters.filter((c) => run.met[c.id]).forEach((c) => {
    if (c.statement1?.video) videos.push({ title: `${c.name} 진술`, src: V.U(c.statement1.video) });
    if (run.flipped[c.id] && c.statement2?.video) videos.push({ title: `${c.name} 두 번째 진술`, src: V.U(c.statement2.video) });
  });
  return {
    clues: run.found.map(V.card).filter(Boolean),
    people: scenario.characters.filter((c) => run.met[c.id]).map((c) => ({ ...V.person(c), locationName: scenario.locations.find((l) => l.id === c.locationId)?.name ?? null })),
    links: run.links.map((id) => {
      const l = scenario.links.find((x) => x.id === id);
      return { id, titles: l.clues.map((c) => V.clueMap[c]?.title), text: l.text };
    }),
    linkTries: run.linkTries,
    linkLeft: lim != null ? Math.max(0, lim - run.linkTries) : null,
    linkTotal: (scenario.links ?? []).length,
    videos,
  };
}

export async function buildView({ gameId, scenario, mediaUrls, run, statsFn }) {
  const V = makeViewer(scenario, mediaUrls, run);
  const days = R.daysOf(scenario);
  const visitsLeftToday = (days[run.day - 1] ?? 0) - run.visitsToday;
  const lv = R.levelOf(scenario, run);
  const base = {
    gameId,
    meta: { title: scenario.meta.title, series: scenario.meta.series ?? "놓친 장면", subtitle: scenario.meta.subtitle ?? "" },
    level: { key: run.level, label: lv.label ?? run.level },
    step: run.step, day: run.day, totalDays: days.length,
    visitsLeftToday: Math.max(0, visitsLeftToday), visitedCount: run.visited.length, visitLimit: R.visitLimitOf(scenario),
    playerName: run.playerName,
    notebook: notebookOf(scenario, run, V),
  };
  const data = {};

  if (run.step === "brief") {
    const b = scenario.briefing ?? {};
    data.briefing = { kicker: b.kicker ?? "사건 브리핑", title: b.title ?? scenario.meta.title, video: V.U(b.video), lines: b.lines ?? [] };
    data.startClues = (scenario.startClues ?? []).map((c) => V.card(c.id));
    data.rules = scenario.rules ?? [];
  } else if (run.step === "map") {
    const dayDone = visitsLeftToday <= 0;
    data.dayDone = dayDone;
    const nextDecision = R.pendingDayDecision(scenario, run);
    const last = run.day >= days.length;
    data.endDayLabel = nextDecision ? `${run.day}일 차 저녁으로 →` : last ? "시간표를 맞추러 간다 →" : `${run.day + 1}일 차로 →`;
    data.locations = scenario.locations.map((l) => {
      const open = R.locationOpen(scenario, run, l);
      const visited = run.visited.includes(l.id);
      return {
        id: l.id, order: l.order, name: l.name, open, visited,
        text: open || visited ? l.blurb : l.lockedHint ?? "아직 갈 이유를 찾지 못했다.",
        foundCount: run.inspect?.[l.id]?.found?.length ?? 0,
        canVisit: open && !visited && !dayDone && run.visited.length < R.visitLimitOf(scenario),
      };
    });
  } else if (run.step === "location") {
    const loc = scenario.locations.find((l) => l.id === run.current);
    const insp = run.inspect?.[loc.id] ?? { used: 0, found: [], decoys: [], misses: [] };
    const limit = R.inspectLimitOf(scenario, run, loc);
    const mode = R.inspectModeOf(scenario, run);
    const spots = R.spotsOf(scenario, run, loc);
    const inspected = new Set([...(insp.found ?? []), ...(insp.decoys ?? [])]);
    const rectsOf = (s) => (R.isTimed(s) ? s.at : s.x != null ? [{ x: s.x, y: s.y, w: s.w, h: s.h }] : []);
    const ch = loc.character ? scenario.characters.find((c) => c.id === loc.character) : null;
    data.location = {
      id: loc.id, order: loc.order, name: loc.name,
      video: V.U(loc.video), poster: V.U(loc.poster),
      hasPlaced: spots.some(R.isPlaced), timed: spots.some(R.isTimed),
      mode, limit, left: Math.max(0, limit - insp.used),
      clueTotal: R.cluesOf(scenario, run, loc).length,
      found: (insp.found ?? []).map(V.card),
      // 찾은 단서의 자리(✓ 표시용)와, 입문 난이도(돋보기)에서만 아직 못 찾은 자리를 보여 줌
      foundRects: spots.filter((s) => (insp.found ?? []).includes(s.id)).map((s) => ({ id: s.id, rects: rectsOf(s) })),
      hintRects: mode === "marker" ? spots.filter((s) => R.isPlaced(s) && !inspected.has(s.id)).map((s) => ({ key: s.key, rects: rectsOf(s) })) : [],
      // 영상 위 위치가 없는 후보만 버튼으로 노출(위치가 있는 후보의 key는 절대 내려주지 않음 — 열거 방지)
      unplaced: spots.filter((s) => !R.isPlaced(s) && !inspected.has(s.id)).map((s) => ({ key: s.key, label: s.label })),
      person: ch ? V.person(ch) : null,
    };
    data.present = ch ? { clueChoices: run.found.map(V.card).filter(Boolean) } : null;
  } else if (run.step === "decision") {
    const d = scenario.decisions.find((x) => x.id === run.pendingDecision);
    data.decision = V.decisionView(d);
  } else if (run.step === "timeline") {
    data.timeline = {
      intro: scenario.timeline.intro ?? "그날 밤 일어난 일을 시간 순서대로 놓아 보자. 단서로 확인한 카드에만 시각이 적혀 있다.",
      cards: [...scenario.timeline.cards]
        .sort((a, b) => (a.shuffle ?? 0) - (b.shuffle ?? 0))
        .map((c) => ({ id: c.id, text: c.text, time: R.timelineCardTime(scenario, run, c) })),
    };
  } else if (run.step === "report") {
    data.report = {
      intro: scenario.report.intro ?? "",
      questions: scenario.report.questions.map((q) => ({ id: q.id, q: q.q, options: q.options.map((o) => ({ id: o.id, label: o.label })) })),
    };
  } else if (run.step === "report2") {
    data.reportDecisions = (scenario.decisions ?? []).filter((d) => d.when === "report" && R.decisionAvailable(scenario, run, d)).map(V.decisionView);
  } else if (["ending", "missed", "story", "ended"].includes(run.step)) {
    const e = scenario.endings.find((x) => x.id === run.endingId);
    const d4 = (scenario.decisions ?? []).find((x) => x.id === "d4")?.options?.find((o) => o.id === run.decisions.d4);
    data.ending = {
      title: e.title, video: V.U(e.video), text: e.text, gain: e.gain, loss: e.loss,
      extraLine: e.useD4Line && d4?.endingLine ? d4.endingLine : null,
    };
    if (run.step === "missed") {
      const unvisited = scenario.locations.filter((l) => !run.visited.includes(l.id));
      data.missed = {
        title: scenario.missed?.title ?? "당신이 보지 못한 것",
        question: scenario.missed?.question ?? "이것을 알았다면 보고서가 달라졌을까요?",
        unvisited: unvisited.map((l) => l.name),
        missedClues: scenario.locations.flatMap((l) =>
          R.cluesOf(scenario, run, l).filter((c) => c.difficulty !== "fake" && !run.found.includes(c.id)).map((c) => ({ title: c.title, locationName: l.name }))
        ),
        hasStory: !!scenario.hiddenStory,
        stats: await statsFn(),
      };
    }
    if (run.step === "story" && scenario.hiddenStory) {
      const st = scenario.hiddenStory;
      const reached = new Set(R.layersReached(scenario, run).map((l) => l.id));
      data.story = {
        kicker: st.kicker ?? "사건의 전모", title: st.title, video: V.U(st.video), intro: st.intro ?? "",
        chapters: (st.chapters ?? []).map((c, i) => ({ kicker: c.kicker ?? `${i + 1}`, heading: c.heading, text: c.text, reached: c.layer ? reached.has(c.layer) : null })),
        timelineTitle: st.timelineTitle ?? "그날 밤 실제 시간표",
        timeline: st.timeline ?? [],
        closing: st.closing ?? "",
      };
    }
    if (run.step === "ended") {
      const label = (qid, v) => scenario.report.questions.find((q) => q.id === qid)?.options.find((o) => o.id === v)?.label ?? "-";
      const decLabel = (d) => d.options.find((o) => o.id === run.decisions[d.id])?.label;
      data.summary = {
        playerName: run.playerName, levelLabel: lv.label ?? run.level, endingTitle: e.title,
        visited: run.visited.map((id) => scenario.locations.find((l) => l.id === id)?.name),
        foundCount: run.found.length - (scenario.startClues?.length ?? 0),
        linksOpened: run.links.length, linksTotal: (scenario.links ?? []).length,
        layers: R.layersReached(scenario, run).map((l) => l.name),
        report: { who: label("who", run.report.who), when: label("when", run.report.when), why: label("why", run.report.why) },
        decisions: (scenario.decisions ?? []).map((d) => decLabel(d) && `${d.short ?? d.label}: ${decLabel(d)}`).filter(Boolean),
        timelineScore: run.timelineScore ?? 0, timelineTotal: scenario.timeline.cards.length,
        reflectionPrompts: scenario.reflectionPrompts ?? [],
      };
    }
  }
  return { ...base, data };
}

// ---------------------------------------------------------------- 행동 처리

export const need = (cond, msg) => { if (!cond) throw new HttpsError("failed-precondition", msg); };
export const bad = (cond, msg) => { if (!cond) throw new HttpsError("invalid-argument", msg); };
const locOf = (scenario, id) => scenario.locations.find((l) => l.id === id);

export function applyAction({ scenario, run, action, p }) {
  const extra = {};
  const days = R.daysOf(scenario);

  switch (action) {
    case "state":
      break;

    case "begin":
      need(run.step === "brief", "이미 조사를 시작했어요.");
      run.step = "map";
      break;

    case "visit": {
      need(["map", "location"].includes(run.step), "지금은 장소를 고를 수 없어요.");
      const loc = locOf(scenario, p.locId);
      bad(loc, "없는 장소예요.");
      if (run.visited.includes(loc.id)) {
        run.step = "location"; run.current = loc.id;
      } else {
        need(run.step === "map", "지금은 새 장소로 갈 수 없어요.");
        need(R.locationOpen(scenario, run, loc), "아직 갈 수 없는 장소예요.");
        need((days[run.day - 1] ?? 0) - run.visitsToday > 0, "오늘 조사할 수 있는 곳은 다 다녀왔어요.");
        need(run.visited.length < R.visitLimitOf(scenario), "더 이상 새 장소를 조사할 수 없어요.");
        run.visited.push(loc.id);
        run.visitsToday += 1;
        run.step = "location"; run.current = loc.id;
        run.inspect[loc.id] = run.inspect[loc.id] ?? { used: 0, found: [], decoys: [], misses: [] };
      }
      if (loc.character) run.met[loc.character] = true;
      break;
    }

    case "leave":
      need(run.step === "location", "장소를 조사하는 중이 아니에요.");
      run.step = "map"; run.current = null;
      break;

    case "inspect": {
      need(run.step === "location" && run.current === p.locId, "이 장소를 조사하는 중이 아니에요.");
      const loc = locOf(scenario, p.locId);
      const insp = run.inspect[loc.id] ?? (run.inspect[loc.id] = { used: 0, found: [], decoys: [], misses: [] });
      const limit = R.inspectLimitOf(scenario, run, loc);
      if (limit - insp.used <= 0) { extra.message = "이 장소에서는 더 지목할 수 없다."; break; }
      const spots = R.spotsOf(scenario, run, loc);
      const inspected = new Set([...(insp.found ?? []), ...(insp.decoys ?? [])]);
      let spot = null;
      let point = null;
      if (p.key != null) {
        spot = spots.find((s) => s.key === String(p.key));
        bad(spot && !R.isPlaced(spot), "고를 수 없는 곳이에요.");
      } else {
        const fx = Number(p.fx), fy = Number(p.fy);
        bad(Number.isFinite(fx) && Number.isFinite(fy) && fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1, "클릭 위치가 올바르지 않아요.");
        const t = p.t == null ? null : Number(p.t);
        spot = R.hitSpot(spots.filter(R.isPlaced), fx, fy, Number.isFinite(t) ? t : null) ?? null;
        point = { x: fx, y: fy, t: Number.isFinite(t) ? t : null };
      }
      if (spot && inspected.has(spot.id)) { extra.message = "이미 살펴본 곳이다."; break; }
      insp.used += 1;
      if (spot?.kind === "clue") {
        insp.found.push(spot.id);
        if (!run.found.includes(spot.id)) run.found.push(spot.id);
        extra.justFound = spot.id;
      } else if (spot?.kind === "decoy") {
        insp.decoys = [...(insp.decoys ?? []), spot.id];
        extra.message = spot.text ?? "자세히 살펴봤지만 사건과 관련된 것은 없었다.";
      } else {
        insp.misses = [...(insp.misses ?? []), point ?? { x: null, y: null, t: null }].slice(-30);
        extra.message = point?.t != null && spots.some(R.isTimed) ? "그 순간 그곳에서는 아무것도 찾지 못했다." : R.MISS_TEXT;
      }
      break;
    }

    case "present": {
      need(run.step === "location", "장소를 조사하는 중이 아니에요.");
      const loc = locOf(scenario, run.current);
      const ch = loc.character ? scenario.characters.find((c) => c.id === loc.character) : null;
      bad(ch && ch.id === p.charId, "이 장소에서 만날 수 있는 사람이 아니에요.");
      need(!run.flipped[ch.id], "이미 두 번째 진술을 들었어요.");
      need(!R.statementLocked(scenario, run, ch), `${ch.name}은(는) 더 이상 말하지 않는다.`);
      const ids = Array.isArray(p.clueIds) ? [...new Set(p.clueIds)] : [];
      bad(ids.length >= 1 && ids.length <= 2 && ids.every((id) => run.found.includes(id)), "내밀 단서를 1~2장 골라주세요.");
      if (R.presentWorks(ch, ids)) {
        run.flipped[ch.id] = true;
        extra.flipped = true;
      } else {
        run.wrong[ch.id] = (run.wrong[ch.id] ?? 0) + 1;
        extra.reply = ch.wrongReply ?? "그게 무슨 상관입니까.";
      }
      break;
    }

    case "link": {
      const lim = R.linkLimitOf(scenario, run);
      bad(p.a && p.b && p.a !== p.b && run.found.includes(p.a) && run.found.includes(p.b), "서로 다른 단서 두 장을 골라주세요.");
      need(lim == null || run.linkTries < lim, "단서 잇기 시도를 모두 썼어요.");
      const l = R.findLink(scenario, p.a, p.b);
      run.linkTries += 1;
      if (l && !run.links.includes(l.id)) { run.links.push(l.id); extra.linked = l.id; }
      else if (!l) extra.message = scenario.linkWrongText ?? "이 두 단서는 이어지지 않습니다.";
      else extra.message = "이미 열린 추론이에요.";
      break;
    }

    case "endday": {
      need(run.step === "map", "지금은 하루를 마칠 수 없어요.");
      need((days[run.day - 1] ?? 0) - run.visitsToday <= 0, "오늘 조사할 곳이 남아 있어요.");
      const d = R.pendingDayDecision(scenario, run);
      if (d) { run.step = "decision"; run.pendingDecision = d.id; }
      else Object.assign(run, R.afterDay(scenario, run));
      break;
    }

    case "decide": {
      need(run.step === "decision", "지금은 결정할 때가 아니에요.");
      const d = scenario.decisions.find((x) => x.id === run.pendingDecision);
      const opt = d.options.find((o) => o.id === p.optionId);
      bad(opt, "없는 선택지예요.");
      run.decisions[d.id] = opt.id;
      const fl = opt.effect?.flip;
      if (fl) {
        run.flipped[fl] = true;
        run.met[fl] = true;
        const ch = scenario.characters.find((c) => c.id === fl);
        extra.heard = { name: ch.name, statement2: { text: ch.statement2?.text, video: p._U(ch.statement2?.video) }, noEvidence: opt.effect.noEvidence === true || (d.id === "d2" && opt.id === "promise") };
      }
      run.pendingDecision = null;
      Object.assign(run, R.afterDay(scenario, run));
      break;
    }

    case "timeline": {
      need(run.step === "timeline", "지금은 시간표를 맞출 때가 아니에요.");
      const ids = scenario.timeline.cards.map((c) => c.id).sort();
      bad(Array.isArray(p.order) && [...p.order].sort().join("|") === ids.join("|"), "카드를 모두 놓아주세요.");
      run.timeline = p.order;
      run.timelineScore = R.timelineScoreOf(scenario, p.order);
      run.step = "report";
      break;
    }

    case "report": {
      need(run.step === "report", "지금은 보고서를 쓸 때가 아니에요.");
      const report = {};
      for (const q of scenario.report.questions) {
        bad(q.options.some((o) => o.id === p[q.id]), `${q.id} 문항에 답해주세요.`);
        report[q.id] = p[q.id];
      }
      run.report = report;
      const rest = (scenario.decisions ?? []).filter((d) => d.when === "report" && R.decisionAvailable(scenario, run, d));
      if (rest.length) run.step = "report2";
      else { run.endingId = R.decideEnding(scenario, run); run.step = "ending"; }
      break;
    }

    case "report2": {
      need(run.step === "report2", "지금은 결정할 때가 아니에요.");
      const rest = (scenario.decisions ?? []).filter((d) => d.when === "report" && R.decisionAvailable(scenario, run, d));
      for (const d of rest) {
        const choice = p.decisions?.[d.id];
        bad(d.options.some((o) => o.id === choice), `${d.label} 결정을 선택해주세요.`);
        run.decisions[d.id] = choice;
      }
      run.endingId = R.decideEnding(scenario, run);
      run.step = "ending";
      break;
    }

    case "next": {
      const order = ["ending", "missed", "story", "ended"];
      const i = order.indexOf(run.step);
      need(i >= 0 && i < order.length - 1, "다음 단계가 없어요.");
      let nextStep = order[i + 1];
      if (nextStep === "story" && !scenario.hiddenStory) nextStep = "ended";
      run.step = nextStep;
      break;
    }

    default:
      throw new HttpsError("invalid-argument", "알 수 없는 행동이에요.");
  }
  return extra;
}

