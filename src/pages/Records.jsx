import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { Card, EmptyState, OutlineButton, PageHeader, PrimaryButton, ScrollBox } from "../components/ui.jsx";

const EMPTY_FORM = { scenarioName: "", character: "", rating: 0, note: "", spoiler: true, favorite: false };

export default function Records() {
  const { profile } = useAuth();
  const location = useLocation();
  const [records, setRecords] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(() =>
    location.state?.scenarioName ? { ...EMPTY_FORM, scenarioName: location.state.scenarioName } : EMPTY_FORM
  );
  const [showForm, setShowForm] = useState(!!location.state?.scenarioName);
  const [editingId, setEditingId] = useState(null);
  const [revealed, setRevealed] = useState({});
  const [scenarios, setScenarios] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(query(collection(db, "scenarios"), where("status", "==", "approved")));
      setScenarios(snap.docs.map((d) => d.data()));
    })();
  }, []);

  const suggestions = (() => {
    const q = form.scenarioName.trim().toLowerCase();
    if (!q) return [];
    return scenarios.filter((s) => s.title.toLowerCase().includes(q)).slice(0, 6);
  })();

  async function load() {
    try {
      setLoadError("");
      const snap = await getDocs(
        query(collection(db, "records"), where("userId", "==", profile.id), orderBy("date", "desc"))
      );
      setRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
      setLoadError("기록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
      setRecords([]);
    }
  }

  useEffect(() => {
    load();
  }, [profile?.id]);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function startEdit(r) {
    setEditingId(r.id);
    setForm({
      scenarioName: r.scenarioName, character: r.character || "", rating: r.rating || 0,
      note: r.note || "", spoiler: r.spoiler !== false, favorite: !!r.favorite,
    });
    setShowForm(true);
  }

  async function submitForm(e) {
    e.preventDefault();
    const rating = Number(form.rating);
    const payload = { ...form, rating: rating > 0 ? rating : null };
    if (editingId) {
      await updateDoc(doc(db, "records", editingId), payload);
    } else {
      await addDoc(collection(db, "records"), {
        ...payload,
        userId: profile.id,
        date: new Date().toISOString().slice(0, 10),
        createdAt: serverTimestamp(),
      });
    }
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    load();
  }

  async function removeRecord(id) {
    if (!window.confirm("이 기록을 삭제할까요?")) return;
    await deleteDoc(doc(db, "records", id));
    load();
  }

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="CASE LOG"
        title="플레이 기록"
        action={<PrimaryButton onClick={() => (showForm ? setShowForm(false) : startCreate())}>{showForm ? "닫기" : "+ 기록 추가"}</PrimaryButton>}
      />

      {showForm && (
        <Card style={{ marginBottom: 20 }}>
          <form onSubmit={submitForm} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ position: "relative" }}>
              <input
                required
                placeholder="시나리오 이름 (입력하면 목록에서 찾아드려요)"
                value={form.scenarioName}
                onChange={(e) => { setForm({ ...form, scenarioName: e.target.value }); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                style={inputStyle}
              />
              {showSuggestions && suggestions.length > 0 && (
                <div style={{
                  position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 10,
                  background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: 8,
                  boxShadow: "0 4px 16px rgba(0,0,0,.15)", overflow: "hidden",
                }}>
                  {suggestions.map((s) => (
                    <button
                      type="button"
                      key={s.title}
                      onMouseDown={() => { setForm({ ...form, scenarioName: s.title }); setShowSuggestions(false); }}
                      style={{
                        display: "block", width: "100%", textAlign: "left", padding: "9px 14px",
                        background: "none", border: "none", borderBottom: "1px solid var(--border)", fontSize: 13,
                      }}
                    >
                      {s.title}
                      {s.publisher && <span style={{ color: "var(--text-sub)", fontSize: 11.5 }}> · {s.publisher}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input placeholder="맡은 캐릭터/역할 (예: 탐정, 범인, 홍설록)" value={form.character}
              onChange={(e) => setForm({ ...form, character: e.target.value })} style={inputStyle} />
            <textarea placeholder="후기 메모" value={form.note} rows={3}
              onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ ...inputStyle, resize: "vertical" }} />
            <label style={{ fontSize: 12.5, color: "var(--text-sub)", display: "flex", alignItems: "center", gap: 8 }}>
              별점 (선택)
              <select value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} style={{ ...inputStyle, width: 100 }}>
                <option value={0}>평가 안 함</option>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12.5, color: "var(--text-sub)", display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.spoiler} onChange={(e) => setForm({ ...form, spoiler: e.target.checked })} />
              역할/캐릭터를 스포일러로 블러 처리
            </label>
            <label style={{ fontSize: 12.5, color: "var(--accent)", display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
              <input type="checkbox" checked={form.favorite} onChange={(e) => setForm({ ...form, favorite: e.target.checked })} />
              ⭐ 인생머미 (추천 카드에 이름이 표시돼요)
            </label>
            <PrimaryButton type="submit">{editingId ? "수정 저장" : "기록 저장"}</PrimaryButton>
          </form>
        </Card>
      )}

      {loadError && (
        <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 12 }}>{loadError}</div>
      )}
      {records === null ? (
        <span style={{ color: "var(--text-sub)", fontSize: 13 }}>불러오는 중…</span>
      ) : records.length === 0 ? (
        <Card><EmptyState>아직 기록이 없어요.</EmptyState></Card>
      ) : (
        <ScrollBox maxHeight={640}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {records.map((r) => (
            <Card key={r.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, overflowWrap: "break-word" }}>
                  {r.favorite && "⭐ "}{r.scenarioName}
                </div>
                {r.rating ? (
                  <span style={{ fontSize: 12, color: "var(--accent)", letterSpacing: 1, whiteSpace: "nowrap" }}>
                    {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: "var(--text-sub)", whiteSpace: "nowrap" }}>평가 안 함</span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-sub)", marginTop: 4 }}>{r.date}</div>
              {r.character && (
                <div
                  className={r.spoiler && !revealed[r.id] ? "spoiler" : ""}
                  onClick={() => setRevealed((v) => ({ ...v, [r.id]: true }))}
                  style={{ marginTop: 8, fontSize: 13 }}
                >
                  역할: {r.character}
                </div>
              )}
              {r.note && <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--text-sub)" }}>{r.note}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <OutlineButton style={{ flex: 1, height: 32, fontSize: 12 }} onClick={() => startEdit(r)}>수정</OutlineButton>
                <OutlineButton
                  style={{ flex: 1, height: 32, fontSize: 12, borderColor: "var(--danger)", color: "var(--danger)" }}
                  onClick={() => removeRecord(r.id)}
                >
                  삭제
                </OutlineButton>
              </div>
            </Card>
          ))}
        </div>
        </ScrollBox>
      )}
    </div>
  );
}

const inputStyle = {
  padding: "10px 14px", borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 13,
};
