import { useState } from "react";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function toKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// markedDates: Set<"YYYY-MM-DD"> — highlighted days (e.g. 내가 참석하는 일정)
// eventsByDate (선택): { "YYYY-MM-DD": [{ label, color }] } — 넘기면 칸 안에 제목 칩을 보여줌
export default function MonthCalendar({ markedDates = new Set(), onSelectDate, selectedDate, eventsByDate }) {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate());

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const showEvents = !!eventsByDate;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          style={{ background: "none", border: "none", color: "var(--text-sub)", fontSize: 16, padding: 4 }}
        >
          ‹
        </button>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{year}년 {month + 1}월</span>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          style={{ background: "none", border: "none", color: "var(--text-sub)", fontSize: 16, padding: 4 }}
        >
          ›
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ textAlign: "center", fontSize: 10.5, color: "var(--text-sub)", padding: "2px 0" }}>{w}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map((d, i) => {
          if (d === null) return <div key={`empty-${i}`} />;
          const key = toKey(year, month, d);
          const marked = markedDates.has(key);
          const isToday = key === todayKey;
          const isSelected = key === selectedDate;
          const events = eventsByDate?.[key] || [];

          if (!showEvents) {
            return (
              <button
                type="button"
                key={key}
                onClick={() => onSelectDate?.(key)}
                style={{
                  aspectRatio: "1",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: marked ? 700 : 400,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                  border: isSelected ? "1.5px solid var(--accent)" : isToday ? "1px solid var(--border)" : "1px solid transparent",
                  background: isSelected ? "var(--accent-dim)" : marked ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent",
                  color: marked ? "var(--accent)" : "var(--text)",
                }}
              >
                <span>{d}</span>
                <span style={{
                  width: marked ? 8 : 8,
                  height: 8,
                  borderRadius: "50%",
                  background: marked ? "var(--accent)" : "transparent",
                  boxShadow: marked ? "0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent)" : "none",
                }} />
              </button>
            );
          }

          const visible = events.slice(0, 2);
          const overflow = events.length - visible.length;
          return (
            <button
              type="button"
              key={key}
              onClick={() => onSelectDate?.(key)}
              style={{
                minHeight: 80,
                width: "100%",
                minWidth: 0,
                boxSizing: "border-box",
                borderRadius: 8,
                padding: "4px 3px",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 2,
                overflow: "hidden",
                border: isSelected ? "1.5px solid var(--accent)" : isToday ? "1px solid var(--border)" : "1px solid transparent",
                background: isSelected ? "var(--accent-dim)" : "transparent",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: marked ? 700 : 400, color: marked ? "var(--accent)" : "var(--text)" }}>{d}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, width: "100%" }}>
                {visible.map((e, idx) => (
                  <span
                    key={idx}
                    style={{
                      fontSize: 9, fontWeight: 600, padding: "1px 4px", borderRadius: 4,
                      background: e.color || "var(--accent)", color: "#fff",
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      overflow: "hidden", wordBreak: "break-all", lineHeight: 1.2, minWidth: 0,
                    }}
                  >
                    {e.label}
                  </span>
                ))}
                {overflow > 0 && (
                  <span style={{ fontSize: 9, color: "var(--text-sub)" }}>+{overflow}개 더</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
