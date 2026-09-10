// 지금까지 지나온 일차를 가로 탭으로 보여줌. 제출 완료한 일차만 클릭해서 다시 열람 가능
// (5일차 문제가 2일차 재열람을 요구하는 등, 과거 전체 재독이 게임 규칙상 필수).
export default function DayTimeline({ totalDays, unlockedThrough, selectedDay, onSelect }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
        const available = day <= unlockedThrough;
        const active = day === selectedDay;
        return (
          <button
            key={day}
            type="button"
            disabled={!available}
            onClick={() => available && onSelect?.(day)}
            style={{
              flex: "1 1 34px", height: 34, minWidth: 34, borderRadius: 8, fontSize: 12.5, fontWeight: 600,
              border: `1.5px solid ${active ? "var(--accent)" : "var(--border)"}`,
              background: active ? "var(--accent-dim)" : "transparent",
              color: available ? (active ? "var(--accent)" : "var(--text)") : "var(--text-sub)",
              opacity: available ? 1 : 0.4, cursor: available ? "pointer" : "default",
            }}
          >
            {day}
          </button>
        );
      })}
    </div>
  );
}
