import { useEffect, useState } from "react";

function formatRemaining(ms) {
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export default function CountdownTimer({ targetIso, onArrive }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const targetMs = new Date(targetIso).getTime();
  const remaining = targetMs - now;

  useEffect(() => {
    if (remaining <= 0) onArrive?.();
  }, [remaining <= 0]);

  return (
    <div style={{ textAlign: "center", padding: "24px 0" }}>
      <div style={{ fontSize: 11.5, color: "var(--text-sub)", marginBottom: 8 }}>다음 보고서 도착까지</div>
      <div style={{ font: "700 32px ui-monospace,monospace", color: "var(--accent)" }}>{formatRemaining(remaining)}</div>
    </div>
  );
}
