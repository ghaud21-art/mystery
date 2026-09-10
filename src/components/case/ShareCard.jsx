import { forwardRef } from "react";

// 결과 공유 이미지. 스포일러 유출을 원천 차단하기 위해 의도적으로 아래 8개 prop만 받는다 —
// result/season 객체를 통째로 넘기지 말 것. 다크/라이트 테마와 무관하게 항상 동일하게 보여야
// 해서 CSS 변수 대신 하드코딩 hex를 쓴다.
const ShareCard = forwardRef(function ShareCard(
  { seriesName, seasonName, nickname, tierName, percent, grid, modeBadge, url },
  ref
) {
  return (
    <div
      ref={ref}
      style={{
        width: 540, height: 540, background: "#1c2740", color: "#e8ecf5",
        fontFamily: "'Noto Serif KR', serif", padding: 36, boxSizing: "border-box",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
      }}
    >
      <div>
        <div style={{ fontSize: 12, letterSpacing: 3, color: "#a3401f", fontWeight: 700 }}>{seriesName}</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{seasonName}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 13, color: "#9aa4bf" }}>수사관 {nickname}</div>
        <div style={{ fontSize: 24, fontWeight: 800 }}>{tierName}</div>
        <div style={{ fontSize: 14, color: "#c7cee0" }}>기억 복원률 {percent}%</div>
        <div
          style={{
            marginTop: 4, alignSelf: "flex-start", fontSize: 11, fontWeight: 700, padding: "4px 10px",
            borderRadius: 999, background: "rgba(163,64,31,.25)", color: "#e8a985",
          }}
        >
          {modeBadge}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(grid || []).map((correct, i) => (
          <div
            key={i}
            style={{
              width: 34, height: 34, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 800, fontSize: 16,
              background: correct ? "rgba(90,168,120,.2)" : "rgba(196,72,60,.2)",
              color: correct ? "#7fc99a" : "#e08277",
              border: `1.5px solid ${correct ? "#5aa878" : "#c4483c"}`,
            }}
          >
            {correct ? "○" : "✕"}
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, color: "#8a93ad", textAlign: "center", borderTop: "1px solid #313d5c", paddingTop: 14 }}>
        당신에게도 사건이 도착합니다
        <br />
        {url}
      </div>
    </div>
  );
});

export default ShareCard;
