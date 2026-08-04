export function Card({ children, style, accent }) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: `1px solid ${accent ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 14,
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Badge({ children, tone = "accent" }) {
  const colors = {
    accent: { fg: "var(--accent)", bg: "var(--accent-dim)" },
    success: { fg: "var(--success)", bg: "color-mix(in srgb, var(--success) 15%, transparent)" },
    danger: { fg: "var(--danger)", bg: "color-mix(in srgb, var(--danger) 15%, transparent)" },
    neutral: { fg: "var(--text-sub)", bg: "var(--bg-sub)" },
  };
  const c = colors[tone] || colors.accent;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        color: c.fg,
        background: c.bg,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function PrimaryButton({ children, ...rest }) {
  return (
    <button
      {...rest}
      style={{
        height: 44,
        padding: "0 20px",
        borderRadius: 10,
        border: "1px solid var(--accent)",
        background: "var(--accent)",
        color: "var(--bg)",
        fontWeight: 700,
        fontSize: 13.5,
        ...rest.style,
      }}
    >
      {children}
    </button>
  );
}

export function OutlineButton({ children, ...rest }) {
  return (
    <button
      {...rest}
      style={{
        height: 44,
        padding: "0 20px",
        borderRadius: 10,
        border: "1px solid var(--accent)",
        background: "transparent",
        color: "var(--accent)",
        fontWeight: 600,
        fontSize: 13.5,
        ...rest.style,
      }}
    >
      {children}
    </button>
  );
}

export function PageHeader({ eyebrow, title, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
      <div>
        {eyebrow && (
          <div style={{ font: "500 10px ui-monospace,monospace", letterSpacing: 2.5, color: "var(--accent)" }}>
            {eyebrow}
          </div>
        )}
        <h2 style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 700 }}>{title}</h2>
      </div>
      {action}
    </div>
  );
}

// 항목이 많아질 수 있는 목록을 감싸서 페이지 전체가 무한정 길어지지 않게 함
export function ScrollBox({ children, maxHeight = 480, style }) {
  return (
    <div style={{ maxHeight, overflowY: "auto", paddingRight: 4, ...style }}>
      {children}
    </div>
  );
}

export function EmptyState({ children }) {
  return (
    <div style={{ textAlign: "center", color: "var(--text-sub)", padding: "48px 0", fontSize: 13.5 }}>
      {children}
    </div>
  );
}

export function AILimitNotice({ kakaoUrl }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 8, padding: 16,
      borderRadius: 10, border: "1px solid var(--danger)", background: "color-mix(in srgb, var(--danger) 8%, transparent)",
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--danger)" }}>무료 AI 사용 횟수를 모두 썼어요</div>
      <div style={{ fontSize: 12.5, color: "var(--text-sub)" }}>
        가입 후 10회까지 무료로 제공돼요. 더 사용하시려면 관리자에게 문의해주세요.
      </div>
      <a
        href={kakaoUrl}
        target="_blank"
        rel="noreferrer"
        style={{
          alignSelf: "flex-start", fontSize: 12.5, fontWeight: 600, color: "var(--accent)",
          textDecoration: "underline",
        }}
      >
        💬 오픈채팅으로 문의하기
      </a>
    </div>
  );
}
