import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase.js";
import { displayName } from "../lib/profileDisplay.js";
import { AI_FREE_LIMIT } from "../lib/ai.js";
import Avatar from "../components/Avatar.jsx";
import { Card, EmptyState, PageHeader } from "../components/ui.jsx";

export default function Admin() {
  const [users, setUsers] = useState(null);
  const [busyId, setBusyId] = useState(null);

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
  }, []);

  async function toggleUnlimited(user) {
    setBusyId(user.id);
    const next = !user.aiUnlimited;
    await updateDoc(doc(db, "users", user.id), { aiUnlimited: next });
    setUsers((list) => list.map((u) => (u.id === user.id ? { ...u, aiUnlimited: next } : u)));
    setBusyId(null);
  }

  async function deleteUser(user) {
    if (!window.confirm(`${displayName(user)}(${user.email}) 계정을 정말 삭제할까요? 되돌릴 수 없어요.`)) return;
    setBusyId(user.id);
    await deleteDoc(doc(db, "users", user.id));
    setUsers((list) => list.filter((u) => u.id !== user.id));
    setBusyId(null);
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

      <Card style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>Gemini 연동 상태</div>
        <div style={{ fontSize: 12, color: "var(--text-sub)" }}>
          Firebase AI Logic(Gemini Developer API 백엔드)을 사용해서, API 키가 클라이언트에
          노출되지 않아요. Firebase 콘솔 → Build → AI Logic에서 활성화 여부를 확인할 수 있어요.
        </div>
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
                display: "flex", alignItems: "center", gap: 12, padding: "10px 0", flexWrap: "wrap",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <Avatar profile={u} size={34} style={{ fontSize: 15 }} />
              <div style={{ flex: "1 1 140px", minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ overflowWrap: "break-word" }}>{displayName(u)}</span>
                  {u.isAdmin && <span style={{ fontSize: 10, color: "var(--accent)", whiteSpace: "nowrap" }}>ADMIN</span>}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-sub)", overflowWrap: "break-word" }}>{u.email}</div>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-sub)", flex: "none", whiteSpace: "nowrap" }}>
                AI {u.aiUsageCount ?? 0}회
              </div>
              <button
                onClick={() => toggleUnlimited(u)}
                disabled={busyId === u.id}
                style={{
                  flex: "none", height: 30, padding: "0 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap",
                  border: `1px solid ${u.aiUnlimited ? "var(--success)" : "var(--border)"}`,
                  background: u.aiUnlimited ? "var(--success)" : "transparent",
                  color: u.aiUnlimited ? "var(--bg)" : "var(--text-sub)",
                }}
              >
                무제한 {u.aiUnlimited ? "ON" : "OFF"}
              </button>
              {!u.isAdmin && (
                <button
                  onClick={() => deleteUser(u)}
                  disabled={busyId === u.id}
                  style={{
                    flex: "none", height: 30, padding: "0 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap",
                    border: "1px solid var(--danger)", background: "transparent", color: "var(--danger)",
                  }}
                >
                  삭제
                </button>
              )}
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
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, overflowWrap: "break-word" }}>{s.title}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-sub)", overflowWrap: "break-word" }}>
                  {[s.publisher, s.playerCount, s.duration].filter(Boolean).join(" · ") || "추가 정보 없음"} · 요청자 {s.submittedByName}
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
