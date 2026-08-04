import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase.js";
import { displayName } from "../lib/profileDisplay.js";
import { AI_FREE_LIMIT } from "../lib/ai.js";
import Avatar from "../components/Avatar.jsx";
import { Card, EmptyState, PageHeader, ScrollBox } from "../components/ui.jsx";

const SCENARIO_EMPTY_FORM = { title: "", publisher: "", playerCount: "", duration: "", description: "", category: "offline" };
const CATEGORY_LABEL = { offline: "오프라인", online: "온라인" };

export default function Admin() {
  const [users, setUsers] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const [pendingScenarios, setPendingScenarios] = useState(null);
  const [scenarioBusyId, setScenarioBusyId] = useState(null);

  const [approvedScenarios, setApprovedScenarios] = useState(null);
  const [scenarioSearch, setScenarioSearch] = useState("");
  const [editingScenarioId, setEditingScenarioId] = useState(null);
  const [scenarioForm, setScenarioForm] = useState(SCENARIO_EMPTY_FORM);

  async function loadUsers() {
    const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
    setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadPendingScenarios() {
    const snap = await getDocs(query(collection(db, "scenarios"), where("status", "==", "pending")));
    setPendingScenarios(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadApprovedScenarios() {
    const snap = await getDocs(query(collection(db, "scenarios"), where("status", "==", "approved")));
    setApprovedScenarios(
      snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.title.localeCompare(b.title, "ko"))
    );
  }

  useEffect(() => {
    loadUsers();
    loadPendingScenarios();
    loadApprovedScenarios();
  }, []);

  function startEditScenario(s) {
    setEditingScenarioId(s.id);
    setScenarioForm({
      title: s.title || "", publisher: s.publisher || "", playerCount: s.playerCount || "",
      duration: s.duration || "", description: s.description || "", category: s.category || "offline",
    });
  }

  async function saveScenario(e, { approve } = {}) {
    e.preventDefault();
    setScenarioBusyId(editingScenarioId);
    const payload = approve ? { ...scenarioForm, status: "approved" } : { ...scenarioForm };
    await updateDoc(doc(db, "scenarios", editingScenarioId), payload);

    setPendingScenarios((list) => {
      if (!list) return list;
      if (approve) return list.filter((x) => x.id !== editingScenarioId);
      return list.map((s) => (s.id === editingScenarioId ? { ...s, ...payload } : s));
    });
    setApprovedScenarios((list) => {
      if (!list) return list;
      if (approve) {
        const original = pendingScenarios?.find((s) => s.id === editingScenarioId) || {};
        const merged = { ...original, ...payload, id: editingScenarioId };
        return [...list, merged].sort((a, b) => a.title.localeCompare(b.title, "ko"));
      }
      return list
        .map((s) => (s.id === editingScenarioId ? { ...s, ...payload } : s))
        .sort((a, b) => a.title.localeCompare(b.title, "ko"));
    });

    setEditingScenarioId(null);
    setScenarioBusyId(null);
  }

  async function deleteApprovedScenario(s) {
    if (!window.confirm(`"${s.title}" 시나리오를 정말 삭제할까요? 되돌릴 수 없어요.`)) return;
    setScenarioBusyId(s.id);
    await deleteDoc(doc(db, "scenarios", s.id));
    setApprovedScenarios((list) => list.filter((x) => x.id !== s.id));
    setScenarioBusyId(null);
  }

  const filteredApprovedScenarios = (approvedScenarios || []).filter((s) =>
    s.title.toLowerCase().includes(scenarioSearch.trim().toLowerCase())
  );

  function renderScenarioForm(s, { showApprove }) {
    return (
      <form
        key={s.id}
        onSubmit={(e) => saveScenario(e)}
        style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 0", borderBottom: "1px solid var(--border)" }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          {Object.entries(CATEGORY_LABEL).map(([key, label]) => (
            <button
              type="button"
              key={key}
              onClick={() => setScenarioForm({ ...scenarioForm, category: key })}
              style={{
                flex: 1, height: 30, borderRadius: 8, fontSize: 11.5, fontWeight: 600,
                border: `1.5px solid ${scenarioForm.category === key ? "var(--accent)" : "var(--border)"}`,
                background: scenarioForm.category === key ? "var(--accent-dim)" : "transparent",
                color: scenarioForm.category === key ? "var(--accent)" : "var(--text-sub)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <input required placeholder="시나리오 이름" value={scenarioForm.title}
          onChange={(e) => setScenarioForm({ ...scenarioForm, title: e.target.value })} style={scenarioInputStyle} />
        <input placeholder="제작사" value={scenarioForm.publisher}
          onChange={(e) => setScenarioForm({ ...scenarioForm, publisher: e.target.value })} style={scenarioInputStyle} />
        <div style={{ display: "flex", gap: 8 }}>
          <input placeholder="인원수" value={scenarioForm.playerCount}
            onChange={(e) => setScenarioForm({ ...scenarioForm, playerCount: e.target.value })} style={{ ...scenarioInputStyle, flex: 1 }} />
          <input placeholder="플레이 시간" value={scenarioForm.duration}
            onChange={(e) => setScenarioForm({ ...scenarioForm, duration: e.target.value })} style={{ ...scenarioInputStyle, flex: 1 }} />
        </div>
        <textarea placeholder="설명" rows={2} value={scenarioForm.description}
          onChange={(e) => setScenarioForm({ ...scenarioForm, description: e.target.value })} style={{ ...scenarioInputStyle, resize: "vertical" }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setEditingScenarioId(null)}
            style={{ height: 30, padding: "0 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, border: "1px solid var(--border)", background: "transparent", color: "var(--text-sub)" }}
          >
            취소
          </button>
          <button
            type="submit"
            disabled={scenarioBusyId === s.id}
            style={{ height: 30, padding: "0 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--bg)" }}
          >
            {scenarioBusyId === s.id ? "저장 중…" : showApprove ? "저장만" : "저장"}
          </button>
          {showApprove && (
            <button
              type="button"
              onClick={(e) => saveScenario(e, { approve: true })}
              disabled={scenarioBusyId === s.id}
              style={{ height: 30, padding: "0 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, border: "1px solid var(--success)", background: "var(--success)", color: "var(--bg)" }}
            >
              {scenarioBusyId === s.id ? "처리 중…" : "수정 후 승인"}
            </button>
          )}
        </div>
      </form>
    );
  }

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
    setApprovedScenarios((list) =>
      [...(list || []), { ...s, status: "approved" }].sort((a, b) => a.title.localeCompare(b.title, "ko"))
    );
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
          <ScrollBox maxHeight={300}>
          {users.map((u) => (
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
          ))}
          </ScrollBox>
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
          <ScrollBox maxHeight={300}>
          {pendingScenarios.map((s) =>
            editingScenarioId === s.id ? (
              renderScenarioForm(s, { showApprove: true })
            ) : (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
                <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, overflowWrap: "break-word", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 999, padding: "1px 7px" }}>
                      {CATEGORY_LABEL[s.category || "offline"]}
                    </span>
                    {s.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-sub)", overflowWrap: "break-word" }}>
                    {[s.publisher, s.playerCount, s.duration].filter(Boolean).join(" · ") || "추가 정보 없음"} · 요청자 {s.submittedByName}
                  </div>
                </div>
                <button
                  onClick={() => startEditScenario(s)}
                  disabled={scenarioBusyId === s.id}
                  style={{ flex: "none", height: 30, padding: "0 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, border: "1px solid var(--border)", background: "transparent", color: "var(--text)" }}
                >
                  확인/수정
                </button>
                <button
                  onClick={() => approveScenario(s)}
                  disabled={scenarioBusyId === s.id}
                  style={{ flex: "none", height: 30, padding: "0 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, border: "1px solid var(--success)", background: "var(--success)", color: "var(--bg)" }}
                >
                  바로 승인
                </button>
                <button
                  onClick={() => rejectScenario(s)}
                  disabled={scenarioBusyId === s.id}
                  style={{ flex: "none", height: 30, padding: "0 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, border: "1px solid var(--danger)", background: "transparent", color: "var(--danger)" }}
                >
                  거절
                </button>
              </div>
            )
          )}
          </ScrollBox>
        )}
      </Card>

      <Card style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>
          승인된 시나리오 관리 ({approvedScenarios?.length ?? "…"}건)
        </div>
        {approvedScenarios === null ? (
          <span style={{ fontSize: 12, color: "var(--text-sub)" }}>불러오는 중…</span>
        ) : approvedScenarios.length === 0 ? (
          <EmptyState>승인된 시나리오가 없어요.</EmptyState>
        ) : (
          <>
            <input
              placeholder="시나리오 이름으로 검색"
              value={scenarioSearch}
              onChange={(e) => setScenarioSearch(e.target.value)}
              style={{ ...scenarioInputStyle, marginBottom: 8 }}
            />
            <ScrollBox maxHeight={300}>
              {filteredApprovedScenarios.map((s) =>
                editingScenarioId === s.id ? (
                  renderScenarioForm(s, { showApprove: false })
                ) : (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, overflowWrap: "break-word", display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 999, padding: "1px 7px" }}>
                          {CATEGORY_LABEL[s.category || "offline"]}
                        </span>
                        {s.title}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-sub)", overflowWrap: "break-word" }}>
                        {[s.publisher, s.playerCount, s.duration].filter(Boolean).join(" · ") || "추가 정보 없음"}
                      </div>
                    </div>
                    <button
                      onClick={() => startEditScenario(s)}
                      disabled={scenarioBusyId === s.id}
                      style={{ flex: "none", height: 30, padding: "0 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, border: "1px solid var(--border)", background: "transparent", color: "var(--text)" }}
                    >
                      수정
                    </button>
                    <button
                      onClick={() => deleteApprovedScenario(s)}
                      disabled={scenarioBusyId === s.id}
                      style={{ flex: "none", height: 30, padding: "0 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, border: "1px solid var(--danger)", background: "transparent", color: "var(--danger)" }}
                    >
                      삭제
                    </button>
                  </div>
                )
              )}
            </ScrollBox>
          </>
        )}
      </Card>
    </div>
  );
}

const scenarioInputStyle = {
  padding: "9px 12px", borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 12.5,
};
