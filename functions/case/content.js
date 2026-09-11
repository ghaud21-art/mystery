// 순수 함수만 모아둔 파일 (Firestore/Gemini 호출 없음). "사건이 도착했습니다" 기능에서
// 스포일러 필터링이 실제로 일어나는 유일한 관문 — 플레이어에게 나가는 응답은 전부
// 여기의 publicXxxView()를 거쳐야 한다. 직접 doc.data()를 그대로 반환하지 말 것.

export const SEASON_ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;

// 시즌 문서에서 랜딩/목록에 노출해도 되는 필드만 추림.
// judgePrompt/letterPrompt/checkpoints/truthExplanation/gradeTable은 절대 포함하지 않는다.
export function publicSeasonView(season) {
  return {
    title: season.title || "",
    landingCopy: season.landingCopy || {},
    totalDays: season.totalDays || 7,
    published: !!season.published,
  };
}

// 등급표는 결과 화면에 등급명/한줄평 정도는 보여줘야 하므로, 점수 구간(min/max) 없이
// 이름/설명만 살짝 다른 경로(caseGetResult)에서 별도로 노출한다. 여기서는 다루지 않음.

// day 문서에서 플레이어에게 보여줘도 되는 필드만 추림.
// includeQuestion=false면 문제/보기까지도 감춤(예: 아직 제출 전인데 목록에만 걸릴 때 등 방어적으로).
// finalChoice가 있는 날(점수 없는 마지막 날, season.finalChoiceScored===false)은 채점되는
// question/options 대신 finalChoice(정답 없는 4지선다형 "선택")를 내려준다.
export function publicDayView(dayDoc, { includeQuestion = true } = {}) {
  const view = {
    day: dayDoc.day,
    reportTitle: dayDoc.reportTitle || "",
    reportBody: dayDoc.reportBody || "",
  };
  if (includeQuestion) {
    if (dayDoc.finalChoice) {
      view.finalChoice = {
        question: dayDoc.finalChoice.question || "",
        options: Array.isArray(dayDoc.finalChoice.options) ? dayDoc.finalChoice.options : [],
      };
    } else {
      view.question = dayDoc.question || "";
      view.options = Array.isArray(dayDoc.options) ? dayDoc.options.slice(0, 4) : [];
    }
    view.replyPrompt = dayDoc.replyPrompt || "";
  }
  return view;
  // 절대 포함 금지: correctIndex, explanation, memoryFragment(정답 맞혔을 때만 별도 반환),
  // wrongMessage(오답일 때만 별도 반환)
}

// 이미 제출을 완료한 일차는 본인 제출 내역(선택/정오/에세이) + 획득한 기억 조각까지 포함해서
// 돌려준다 (5일차 문제가 2일차 재열람을 요구하는 등, 과거 전체 재독이 게임 규칙상 필수).
export function submittedDayView(dayDoc, submission) {
  return {
    ...publicDayView(dayDoc, { includeQuestion: true }),
    myChoice: submission.choice,
    myCorrect: !!submission.correct,
    myEssay: submission.essay || "",
    myFinalEssay: submission.finalEssay || null,
    fragment: submission.correct ? dayDoc.memoryFragment || "" : null,
    wrongMessage: !submission.correct ? dayDoc.wrongMessage || "" : null,
  };
}

// 체크포인트 개수 기반으로 만점을 계산 — 절대 24를 하드코딩하지 않는다(어드민이
// 체크포인트를 추가/삭제할 수 있으므로). 객관식은 최종일을 제외한 (totalDays-1)일 각 1점 +
// 체크포인트 각 2점. season.finalChoiceScored가 false가 아니면(기본값) 최종일이 곧 범인 지목
// 객관식이라는 뜻이라 4점을 더 더한다 — false인 시즌은 최종일이 점수에 안 들어가는 분위기용
// 선택(finalChoice)이라 이 보너스가 없다.
export const CULPRIT_POINTS = 4;
export function computeMaxScore(season) {
  const totalDays = season.totalDays || 7;
  const checkpointCount = Array.isArray(season.checkpoints) ? season.checkpoints.length : 0;
  const culpritBonus = season.finalChoiceScored === false ? 0 : CULPRIT_POINTS;
  return (totalDays - 1) * 1 + checkpointCount * 2 + culpritBonus;
}

// 점수 → 등급. 구간 매칭 실패(어드민이 등급표에 빈 구간을 남긴 경우) 시 최하위 등급으로 폴백 —
// 7일을 기다린 플레이어에게 절대 undefined를 보여주지 않는다.
export function resolveTier(score, gradeTable) {
  if (!Array.isArray(gradeTable) || gradeTable.length === 0) {
    return { name: "수사관", blurb: "" };
  }
  const sorted = [...gradeTable].sort((a, b) => (b.min ?? 0) - (a.min ?? 0));
  const hit = sorted.find((t) => score >= (t.min ?? 0) && score <= (t.max ?? Infinity));
  if (hit) return { name: hit.name, blurb: hit.blurb || "" };
  const lowest = sorted[sorted.length - 1];
  return { name: lowest.name, blurb: lowest.blurb || "" };
}

// 등급표 구간이 0..maxScore를 빈틈없이 덮는지 검증 (어드민 저장 시 재검증용).
export function validateGradeTableCoverage(gradeTable, maxScore) {
  if (!Array.isArray(gradeTable) || gradeTable.length === 0) {
    return "등급표가 비어있어요.";
  }
  const sorted = [...gradeTable].sort((a, b) => (a.min ?? 0) - (b.min ?? 0));
  if (sorted[0].min > 0) return "등급표가 0점부터 시작하지 않아요.";
  if (sorted[sorted.length - 1].max < maxScore) return `등급표가 만점(${maxScore})까지 안 덮여요.`;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].min !== sorted[i - 1].max + 1) {
      return `등급표 구간에 틈이나 겹침이 있어요 (${sorted[i - 1].max} → ${sorted[i].min}).`;
    }
  }
  return null;
}

export function validateSeasonPatch(patch) {
  if (!patch.title || !patch.title.trim()) return "제목을 입력해주세요.";
  if (!Array.isArray(patch.checkpoints) || patch.checkpoints.length === 0) {
    return "체크포인트를 1개 이상 등록해주세요.";
  }
  for (const cp of patch.checkpoints) {
    if (!cp.id || !cp.description) return "체크포인트마다 id와 설명이 필요해요.";
  }
  const ids = patch.checkpoints.map((c) => c.id);
  if (new Set(ids).size !== ids.length) return "체크포인트 id가 중복돼요.";
  if (!patch.judgePrompt || !patch.judgePrompt.trim()) return "판정 프롬프트를 입력해주세요.";
  if (!patch.letterPrompt || !patch.letterPrompt.trim()) return "편지 프롬프트를 입력해주세요.";
  const maxScore = computeMaxScore(patch);
  const coverageError = validateGradeTableCoverage(patch.gradeTable, maxScore);
  if (coverageError) return coverageError;
  return null;
}

// isFinalUnscored: 이 날이 시즌의 마지막 날이면서 season.finalChoiceScored===false인 경우.
// 이때는 채점되는 문제(question/options/correctIndex/memoryFragment/wrongMessage) 대신
// 점수 없는 finalChoice(질문+선택지, 정답 없음)를 요구한다.
export function validateDayPatch(patch, { isFinalUnscored = false } = {}) {
  if (!patch.reportBody || !patch.reportBody.trim()) return "보고서 본문을 입력해주세요.";

  if (isFinalUnscored) {
    if (!patch.replyPrompt || !patch.replyPrompt.trim()) return "최종 에세이 프롬프트를 입력해주세요.";
    const fc = patch.finalChoice;
    if (!fc || !fc.question || !fc.question.trim()) return "마지막 선택지 질문을 입력해주세요.";
    if (!Array.isArray(fc.options) || fc.options.length < 2) return "마지막 선택지를 2개 이상 입력해주세요.";
    if (fc.options.some((o) => !o.id || !o.id.trim() || !o.text || !o.text.trim())) {
      return "마지막 선택지마다 id와 문구를 입력해주세요.";
    }
    const optionIds = fc.options.map((o) => o.id);
    if (new Set(optionIds).size !== optionIds.length) return "마지막 선택지 id가 중복돼요.";
    return null;
  }

  if (!patch.question || !patch.question.trim()) return "문제를 입력해주세요.";
  if (!Array.isArray(patch.options) || patch.options.length !== 4 || patch.options.some((o) => !o || !o.trim())) {
    return "보기 4개를 전부 입력해주세요.";
  }
  if (!Number.isInteger(patch.correctIndex) || patch.correctIndex < 0 || patch.correctIndex > 3) {
    return "정답 보기를 하나 선택해주세요.";
  }
  if (!patch.memoryFragment || !patch.memoryFragment.trim()) return "기억 조각(정답 시 보상)을 입력해주세요.";
  if (!patch.wrongMessage || !patch.wrongMessage.trim()) return "오답 문구를 입력해주세요.";
  if (!patch.replyPrompt || !patch.replyPrompt.trim()) return "답장 주제를 입력해주세요.";
  return null;
}
