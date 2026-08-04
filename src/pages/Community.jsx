import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { displayAvatar, displayName } from "../lib/profileDisplay.js";
import { Card, EmptyState, OutlineButton, PageHeader, PrimaryButton } from "../components/ui.jsx";

const EMPTY_FORM = { title: "", publisher: "", playerCount: "", description: "" };

export default function Community() {
  const { profile } = useAuth();
  const [scenarios, setScenarios] = useState(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitStatus, setSubmitStatus] = useState("");

  async function loadScenarios() {
    const snap = await getDocs(query(collection(db, "scenarios"), where("status", "==", "approved")));
    setScenarios(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  useEffect(() => { loadScenarios(); }, []);

  const filtered = useMemo(() => {
    if (!scenarios) return [];
    const q = search.trim().toLowerCase();
    if (!q) return scenarios;
    return scenarios.filter((s) => s.title.toLowerCase().includes(q) || (s.publisher || "").toLowerCase().includes(q));
  }, [scenarios, search]);

  async function submitRequest(e) {
    e.preventDefault();
    setSubmitStatus("등록 요청 중…");
    await addDoc(collection(db, "scenarios"), {
      ...form,
      status: "pending",
      submittedBy: profile.id,
      submittedByName: displayName(profile),
    });
    setForm(EMPTY_FORM);
    setShowForm(false);
    setSubmitStatus("관리자 승인 후 목록에 추가돼요. 요청 감사해요!");
    setTimeout(() => setSubmitStatus(""), 4000);
  }

  return (
    <div className="fade-in">
      <PageHeader eyebrow="BULLETIN BOARD" title="커뮤니티" />

      <Card style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>머더미스터리 시나리오 찾기</div>
          <PrimaryButton style={{ height: 36, padding: "0 14px", fontSize: 12.5 }} onClick={() => setShowForm((s) => !s)}>
            {showForm ? "닫기" : "+ 목록에 없는 작품 등록 요청"}
          </PrimaryButton>
        </div>

        <input
          placeholder="시나리오 이름으로 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={inputStyle}
        />

        {showForm && (
          <form onSubmit={submitRequest} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 10, background: "var(--bg-sub)" }}>
            <input required placeholder="시나리오 이름" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} style={inputStyle} />
            <input placeholder="제작사 (선택)" value={form.publisher}
              onChange={(e) => setForm({ ...form, publisher: e.target.value })} style={inputStyle} />
            <input placeholder="인원수 (선택, 예: 4-6인)" value={form.playerCount}
              onChange={(e) => setForm({ ...form, playerCount: e.target.value })} style={inputStyle} />
            <textarea placeholder="간단한 설명 (선택)" rows={2} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ ...inputStyle, resize: "vertical" }} />
            <PrimaryButton type="submit" style={{ height: 38, fontSize: 13 }}>등록 요청 보내기</PrimaryButton>
          </form>
        )}
        {submitStatus && <div style={{ fontSize: 12, color: "var(--accent)" }}>{submitStatus}</div>}

        {scenarios === null ? (
          <span style={{ color: "var(--text-sub)", fontSize: 13 }}>불러오는 중…</span>
        ) : filtered.length === 0 ? (
          <EmptyState>
            {scenarios.length === 0
              ? "아직 등록된 시나리오가 없어요. 위에서 첫 작품을 등록 요청해보세요."
              : "검색 결과가 없어요."}
          </EmptyState>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {filtered.map((s) => (
              <div key={s.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.title}</div>
                {s.publisher && <div style={{ fontSize: 11.5, color: "var(--text-sub)", marginTop: 2 }}>{s.publisher}</div>}
                {s.playerCount && <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>{s.playerCount}</div>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <NotPlayedTogetherFinder scenarios={scenarios || []} />
    </div>
  );
}

function NotPlayedTogetherFinder({ scenarios }) {
  const { profile } = useAuth();
  const [friends, setFriends] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (!profile?.friends?.length) return;
      const docs = await Promise.all(profile.friends.map((uid) => getDoc(doc(db, "users", uid))));
      setFriends(docs.filter((d) => d.exists()).map((d) => ({ id: d.id, ...d.data() })));
    })();
  }, [profile?.friends]);

  function toggle(uid) {
    setSelectedIds((ids) => (ids.includes(uid) ? ids.filter((x) => x !== uid) : [...ids, uid]));
  }

  async function findUnplayed() {
    setLoading(true);
    const participantIds = [profile.id, ...selectedIds];
    const playedSets = await Promise.all(
      participantIds.map(async (uid) => {
        const snap = await getDocs(query(collection(db, "records"), where("userId", "==", uid)));
        return new Set(snap.docs.map((d) => (d.data().scenarioName || "").trim().toLowerCase()));
      })
    );
    const unplayed = scenarios.filter((s) => {
      const key = s.title.trim().toLowerCase();
      return playedSets.some((set) => !set.has(key));
    });
    setResults(unplayed);
    setLoading(false);
  }

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>같이 안 한 머미 찾기</div>
      <div style={{ fontSize: 12, color: "var(--text-sub)" }}>
        같이 할 사람을 골라주세요. 그중 한 명이라도 안 해본 시나리오를 찾아드려요.
      </div>
      {friends.length === 0 ? (
        <EmptyState>친구를 먼저 추가해주세요.</EmptyState>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {friends.map((f) => (
              <button
                key={f.id}
                onClick={() => toggle(f.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, fontSize: 12.5,
                  border: `1.5px solid ${selectedIds.includes(f.id) ? "var(--accent)" : "var(--border)"}`,
                  background: selectedIds.includes(f.id) ? "var(--accent-dim)" : "transparent",
                  color: selectedIds.includes(f.id) ? "var(--accent)" : "var(--text)",
                }}
              >
                {displayAvatar(f) || "🕵️"} {displayName(f)}
              </button>
            ))}
          </div>
          <PrimaryButton onClick={findUnplayed} disabled={loading || selectedIds.length === 0}>
            {loading ? "찾는 중…" : "같이 안 한 머미 찾기"}
          </PrimaryButton>
        </>
      )}

      {results !== null && (
        results.length === 0 ? (
          <EmptyState>이 조합은 우리 DB에 있는 시나리오를 전부 해봤어요! 🎉</EmptyState>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {results.map((s) => (
              <div key={s.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.title}</div>
                {s.publisher && <div style={{ fontSize: 11, color: "var(--text-sub)" }}>{s.publisher}</div>}
              </div>
            ))}
          </div>
        )
      )}
    </Card>
  );
}

const inputStyle = {
  padding: "10px 14px", borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 13,
};
