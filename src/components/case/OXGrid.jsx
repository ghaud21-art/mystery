// grid: boolean[] — 1~(N-1)일차 정오 + 마지막 칸은 최종 지목 정오.
export default function OXGrid({ grid, size = 32 }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {(grid || []).map((correct, i) => {
        const isLast = i === grid.length - 1;
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div
              style={{
                width: size, height: size, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: size * 0.5,
                background: correct ? "color-mix(in srgb, var(--success) 18%, transparent)" : "color-mix(in srgb, var(--danger) 15%, transparent)",
                color: correct ? "var(--success)" : "var(--danger)",
                border: `1.5px solid ${correct ? "var(--success)" : "var(--danger)"}`,
              }}
            >
              {correct ? "○" : "✕"}
            </div>
            <span style={{ fontSize: 9.5, color: "var(--text-sub)" }}>{isLast ? "최종" : i + 1}</span>
          </div>
        );
      })}
    </div>
  );
}
