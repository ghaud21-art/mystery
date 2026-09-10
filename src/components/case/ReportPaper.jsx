// 보고서 본문을 "오래된 수사 파일" 톤의 편지지 카드로 보여줌.
// 마크다운은 굵게(**)/기울임(*)/인용(>)/빈줄 문단 구분만 지원하는 자체 경량 렌더러(의존성 없음).
function renderInline(text) {
  const parts = [];
  let rest = text;
  let key = 0;
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/;
  while (rest) {
    const m = rest.match(re);
    if (!m) {
      parts.push(rest);
      break;
    }
    if (m.index > 0) parts.push(rest.slice(0, m.index));
    if (m[1] !== undefined) parts.push(<strong key={key++}>{m[1]}</strong>);
    else parts.push(<em key={key++}>{m[2]}</em>);
    rest = rest.slice(m.index + m[0].length);
  }
  return parts;
}

function MiniMarkdown({ text }) {
  const blocks = String(text || "").split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (trimmed.startsWith(">")) {
          return (
            <blockquote
              key={i}
              style={{
                margin: "0 0 14px", padding: "6px 14px", borderLeft: "3px solid var(--case-accent)",
                color: "inherit", opacity: 0.85, fontStyle: "italic",
              }}
            >
              {renderInline(trimmed.replace(/^>\s?/gm, ""))}
            </blockquote>
          );
        }
        return (
          <p key={i} style={{ margin: "0 0 14px", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
            {renderInline(block)}
          </p>
        );
      })}
    </>
  );
}

export default function ReportPaper({ title, body, eyebrow }) {
  return (
    <div
      style={{
        background: "var(--case-paper)", color: "var(--case-paper-text)",
        border: "1px solid var(--case-paper-border)", borderRadius: 4,
        padding: "28px 26px", fontFamily: "'Noto Serif KR', serif",
        boxShadow: "0 2px 10px rgba(0,0,0,.15)",
      }}
    >
      {eyebrow && (
        <div style={{ fontSize: 11, letterSpacing: 2, opacity: 0.6, marginBottom: 10, fontFamily: "inherit" }}>
          {eyebrow}
        </div>
      )}
      {title && <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{title}</div>}
      <MiniMarkdown text={body} />
    </div>
  );
}
