export default function ChoiceList({ question, options, selected, onSelect, disabled }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {question && <div style={{ fontSize: 14, fontWeight: 700 }}>{question}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(options || []).map((opt, i) => (
          <button
            key={i}
            type="button"
            disabled={disabled}
            onClick={() => onSelect?.(i)}
            style={{
              textAlign: "left", padding: "12px 14px", borderRadius: 10, fontSize: 13.5,
              border: `1.5px solid ${selected === i ? "var(--accent)" : "var(--border)"}`,
              background: selected === i ? "var(--accent-dim)" : "var(--bg)",
              color: "var(--text)", cursor: disabled ? "default" : "pointer",
              display: "flex", alignItems: "center", gap: 10,
            }}
          >
            <span
              style={{
                flex: "none", width: 20, height: 20, borderRadius: "50%", fontSize: 11, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: `1.5px solid ${selected === i ? "var(--accent)" : "var(--border)"}`,
                color: selected === i ? "var(--accent)" : "var(--text-sub)",
              }}
            >
              {String.fromCharCode(65 + i)}
            </span>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
