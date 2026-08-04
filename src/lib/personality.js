// 추리 성향 테스트 — 이전 파일(murder_mystery_v4.jsx)의 SURVEY/SM/CS 로직을 이전.
// 색상은 하드코딩하지 않고 tokens.css의 --type-* 변수를 컴포넌트에서 참조한다.

export const SURVEY = [
  { q: "단서를 발견하면?", opts: [
    { l: "🔍 논리적으로 연결", s: "분석형" },
    { l: "⚡ 직감으로 범인 지목", s: "직관형" },
    { l: "🌸 팀원과 바로 공유", s: "감성형" },
    { l: "📐 노트에 체계 정리", s: "논리형" },
  ]},
  { q: "맡고 싶은 역할은?", opts: [
    { l: "🔍 탐정 — 수사 리더", s: "분석형" },
    { l: "🎭 범인 — 연기로 속임", s: "연기형" },
    { l: "🌸 조연 — 분위기 메이커", s: "감성형" },
    { l: "📐 목격자 — 정보 활용", s: "논리형" },
  ]},
  { q: "추리 방식은?", opts: [
    { l: "📐 증거 데이터 중심", s: "논리형" },
    { l: "🌸 표정·말투 관찰", s: "감성형" },
    { l: "🔍 여러 가설 검토", s: "분석형" },
    { l: "⚡ 직감을 믿는다", s: "직관형" },
  ]},
  { q: "팀에서 내 역할은?", opts: [
    { l: "🔍 수사 방향 리더", s: "분석형" },
    { l: "🌸 분위기 메이커", s: "감성형" },
    { l: "📐 조용한 정보 수집", s: "논리형" },
    { l: "🎭 극적 반전 연출", s: "연기형" },
  ]},
  { q: "게임 끝난 후?", opts: [
    { l: "🔍 트릭 구조 복기", s: "분석형" },
    { l: "🌸 캐릭터 감정 토론", s: "감성형" },
    { l: "📐 다음 전략 구상", s: "논리형" },
    { l: "🎭 인상 장면 재연", s: "연기형" },
  ]},
  { q: "정보를 처리할 때 나는?", opts: [
    { l: "📐 도표나 메모로 정리", s: "논리형" },
    { l: "🔍 패턴과 연결고리 탐색", s: "분석형" },
    { l: "⚡ 머릿속 직관적 그림", s: "직관형" },
    { l: "🌸 팀원과 함께 정리", s: "감성형" },
  ]},
  { q: "다른 플레이어와 대화할 때?", opts: [
    { l: "🌸 공감하며 감정을 읽는다", s: "감성형" },
    { l: "📐 팩트만 간결히 교환", s: "논리형" },
    { l: "🎭 역할에 완전히 몰입", s: "연기형" },
    { l: "🔍 정보 가치를 평가하며 듣는다", s: "분석형" },
  ]},
  { q: "시간 압박이 올 때?", opts: [
    { l: "⚡ 직관으로 빠르게 판단", s: "직관형" },
    { l: "📐 우선순위 리스트 정리", s: "논리형" },
    { l: "🔍 가장 강력한 증거에 집중", s: "분석형" },
    { l: "🌸 팀원과 빠르게 합의", s: "감성형" },
  ]},
  { q: "범인 역할을 맡았다면?", opts: [
    { l: "🎭 완벽한 연기로 의심 차단", s: "연기형" },
    { l: "📐 논리적 알리바이 설계", s: "논리형" },
    { l: "⚡ 즉흥 블러핑으로 혼선", s: "직관형" },
    { l: "🔍 다른 용의자에게 의심 유도", s: "분석형" },
  ]},
  { q: "게임이 끝나고 가장 기억에 남는 건?", opts: [
    { l: "🔍 핵심 트릭의 구조", s: "분석형" },
    { l: "🌸 팀원들의 반응과 감정", s: "감성형" },
    { l: "🎭 내가 연기한 장면", s: "연기형" },
    { l: "⚡ 예상 못한 반전 순간", s: "직관형" },
  ]},
];

// key ↔ tokens.css의 --type-{cssVar} 와 1:1 매칭
export const TYPE_META = {
  분석형: { icon: "🔍", cssVar: "analysis", title: "분석형 탐정", desc: "증거를 논리적으로 연결해 결론을 도출합니다.", strength: "단서 연결력", weakness: "직관 판단 느림", quote: "단서는 언제나 현장에 있다." },
  직관형: { icon: "⚡", cssVar: "intuition", title: "직관형 탐정", desc: "첫인상과 분위기로 빠르게 판단합니다.", strength: "빠른 판단력", weakness: "논리 설명 부족", quote: "설명할 순 없지만, 알 수 있다." },
  감성형: { icon: "🌸", cssVar: "emotion", title: "감성형 탐정", desc: "캐릭터에 몰입하고 팀 분위기를 살립니다.", strength: "팀 시너지", weakness: "객관 판단 어려움", quote: "사람을 보면 진실이 보인다." },
  논리형: { icon: "📐", cssVar: "logic", title: "논리형 탐정", desc: "정보를 체계적으로 정리하고 구조화합니다.", strength: "정보 정리력", weakness: "유연성 부족", quote: "모든 사실에는 자리가 있다." },
  연기형: { icon: "🎭", cssVar: "acting", title: "연기형 탐정", desc: "완벽한 연기력으로 상황을 주도합니다.", strength: "블러핑·연기력", weakness: "논리 추리 약함", quote: "무대 위에서는 내가 진실이다." },
};

export const TYPE_KEYS = Object.keys(TYPE_META);

const COMPAT_SCORES = {
  "분석형-분석형": 70, "분석형-직관형": 90, "분석형-감성형": 82,
  "분석형-논리형": 75, "분석형-연기형": 88, "직관형-감성형": 88,
  "직관형-논리형": 78, "직관형-연기형": 85, "감성형-논리형": 80,
  "감성형-연기형": 92, "논리형-연기형": 84, "직관형-직관형": 65,
  "감성형-감성형": 68, "논리형-논리형": 62, "연기형-연기형": 60,
};

export function calcStyles(answers) {
  const count = {};
  answers.forEach((a, qi) => {
    if (a !== null && a !== undefined) {
      const s = SURVEY[qi].opts[a].s;
      count[s] = (count[s] || 0) + 1;
    }
  });
  const sorted = Object.entries(count).sort((a, b) => b[1] - a[1]);
  return {
    style: sorted[0]?.[0] || "분석형",
    style2: sorted[1]?.[0] || null,
    scores: count,
  };
}

export function compat(a, b) {
  return COMPAT_SCORES[`${a}-${b}`] ?? COMPAT_SCORES[`${b}-${a}`] ?? 70;
}

export function compatLabel(score) {
  if (score >= 90) return { label: "환상의 콤비 ✨", tone: "success" };
  if (score >= 80) return { label: "좋은 호흡 👍", tone: "info" };
  if (score >= 70) return { label: "무난한 팀워크", tone: "neutral" };
  return { label: "도전적 조합 🔥", tone: "danger" };
}
