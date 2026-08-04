import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase.js";
import { displayAvatar, displayName } from "../lib/profileDisplay.js";
import { AI_FREE_LIMIT } from "../lib/ai.js";
import { Card, EmptyState, PageHeader, PrimaryButton } from "../components/ui.jsx";

export default function Admin() {
  const [users, setUsers] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const [apiKey, setApiKey] = useState("");
  const [keyLoaded, setKeyLoaded] = useState(false);
  const [keyStatus, setKeyStatus] = useState("");

  const [pendingScenarios, setPendingScenarios] = useState(null);
  const [scenarioBusyId, setScenarioBusyId] = useState(null);

  async function loadUsers() {
    const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
    setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadPendingScenarios() {
    const snap = await getDocs(query(collection(db, "scenarios"), where("status", "==", "pending")));
    setPendingScenarios(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  useEffect(() => {
    loadUsers();
    loadPendingScenarios();
    (async () => {
      const snap = await getDoc(doc(db, "config", "gemini"));
      if (snap.exists()) setApiKey(snap.data().apiKey || "");
      setKeyLoaded(true);
    })();
  }, []);

  async function toggleUnlimited(user) {
    setBusyId(user.id);
    const next = !user.aiUnlimited;
    await updateDoc(doc(db, "users", user.id), { aiUnlimited: next });
    setUsers((list) => list.map((u) => (u.id === user.id ? { ...u, aiUnlimited: next } : u)));
    setBusyId(null);
  }

  async function saveKey(e) {
    e.preventDefault();
    setKeyStatus("저장 중…");
    await setDoc(doc(db, "config", "gemini"), { apiKey: apiKey.trim() }, { merge: true });
    setKeyStatus("저장됨 ✓");
    setTimeout(() => setKeyStatus(""), 2000);
  }

  async function approveScenario(s) {
    setScenarioBusyId(s.id);
    await updateDoc(doc(db, "scenarios", s.id), { status: "approved" });
    setPendingScenarios((list) => list.filter((x) => x.id !== s.id));
    setScenarioBusyId(null);
  }

  async function rejectScenario(s) {
    setScenarioBusyId(s.id);
    await deleteDoc(doc(db, "scenarios", s.id));
    setPendingScenarios((list) => list.filter((x) => x.id !== s.id));
    setScenarioBusyId(null);
  }

  return (
    <div className="fade-in">
      <PageHeader eyebrow="ADMIN" title="관리자 페이지" />

      <Card style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>Gemini API 키</div>
        <div style={{ fontSize: 12, color: "var(--text-sub)" }}>
          이 키는 Firestore의 관리자 전용 문서에만 저장돼요. 일반 유저의 AI 사용은 아직 Cloud
          Functions 연동 전이라 실제로 이 키를 쓰지 않습니다 (연동 전까지는 저장만 해둘 수 있어요).
        </div>
        {!keyLoaded ? (
          <span style={{ fontSize: 12, color: "var(--text-sub)" }}>불러오는 중…</span>
        ) : (
          <form onSubmit={saveKey} style={{ display: "flex", gap: 10 }}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza..."
              style={{
                flex: 1, padding: "10px 14px", borderRadius: 8, border: "1.5px solid var(--border)",
                background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "monospace",
              }}
            />
            <PrimaryButton type="submit" style={{ height: "auto" }}>저장</PrimaryButton>
          </form>
        )}
        {keyStatus && <div style={{ fontSize: 12, color: "var(--success)" }}>{keyStatus}</div>}
      </Card>

      <Card style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>
          전체 유저 ({users?.length ?? "…"}명) · 무료 {AI_FREE_LIMIT}회 이후 AI 사용 제한
        </div>
        {users === null ? (
          <span style={{ fontSize: 12, color: "var(--text-sub)" }}>불러오는 중…</span>
        ) : users.length === 0 ? (
          <EmptyState>가입한 유저가 없어요.</EmptyState>
        ) : (
          users.map((u) => (
            <div
              key={u.id}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div style={{
                width: 34, height: 34, borderRadius: "50%", background: "var(--accent-dim)",
                border: "1px solid var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flex: "none",
              }}>
                {displayAvatar(u) || "🕵️"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  {displayName(u)}
                  {u.isAdmin && <span style={{ fontSize: 10, color: "var(--accent)" }}>ADMIN</span>}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>{u.email}</div>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-sub)", flex: "none", width: 70, textAlign: "right" }}>
                AI {u.aiUsageCount ?? 0}회
              </div>
              <button
                onClick={() => toggleUnlimited(u)}
                disabled={busyId === u.id}
                style={{
                  flex: "none", height: 30, padding: "0 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 600,
                  border: `1px solid ${u.aiUnlimited ? "var(--success)" : "var(--border)"}`,
                  background: u.aiUnlimited ? "var(--success)" : "transparent",
                  color: u.aiUnlimited ? "var(--bg)" : "var(--text-sub)",
                }}
              >
                무제한 {u.aiUnlimited ? "ON" : "OFF"}
              </button>
            </div>
          ))
        )}
      </Card>

      <Card style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>
          시나리오 등록 승인 대기 ({pendingScenarios?.length ?? "…"}건)
        </div>
        {pendingScenarios === null ? (
          <span style={{ fontSize: 12, color: "var(--text-sub)" }}>불러오는 중…</span>
        ) : pendingScenarios.length === 0 ? (
          <EmptyState>대기 중인 요청이 없어요.</EmptyState>
        ) : (
          pendingScenarios.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.title}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>
                  {[s.publisher, s.playerCount].filter(Boolean).join(" · ") || "추가 정보 없음"} · 요청자 {s.submittedByName}
                </div>
              </div>
              <button
                onClick={() => approveScenario(s)}
                disabled={scenarioBusyId === s.id}
                style={{ flex: "none", height: 30, padding: "0 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, border: "1px solid var(--success)", background: "var(--success)", color: "var(--bg)" }}
              >
                승인
              </button>
              <button
                onClick={() => rejectScenario(s)}
                disabled={scenarioBusyId === s.id}
                style={{ flex: "none", height: 30, padding: "0 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, border: "1px solid var(--danger)", background: "transparent", color: "var(--danger)" }}
              >
                거절
              </button>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
