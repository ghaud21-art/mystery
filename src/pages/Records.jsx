import { useEffect, useState } from "react";
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp, where } from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { Card, EmptyState, PageHeader, PrimaryButton } from "../components/ui.jsx";

const EMPTY_FORM = { scenarioName: "", character: "", rating: 5, note: "", spoiler: true };

export default function Records() {
  const { profile } = useAuth();
  const [records, setRecords] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [revealed, setRevealed] = useState({});

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

  async function addRecord(e) {
    e.preventDefault();
    await addDoc(collection(db, "records"), {
      ...form,
      rating: Number(form.rating),
      userId: profile.id,
      date: new Date().toISOString().slice(0, 10),
      createdAt: serverTimestamp(),
    });
    setForm(EMPTY_FORM);
    setShowForm(false);
    load();
  }

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="CASE LOG"
        title="플레이 기록"
        action={<PrimaryButton onClick={() => setShowForm((s) => !s)}>{showForm ? "닫기" : "+ 기록 추가"}</PrimaryButton>}
      />

      {showForm && (
        <Card style={{ marginBottom: 20 }}>
          <form onSubmit={addRecord} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input required placeholder="시나리오 이름" value={form.scenarioName}
              onChange={(e) => setForm({ ...form, scenarioName: e.target.value })} style={inputStyle} />
            <input placeholder="맡은 캐릭터/역할 (예: 탐정, 범인, 홍설록)" value={form.character}
              onChange={(e) => setForm({ ...form, character: e.target.value })} style={inputStyle} />
            <textarea placeholder="후기 메모" value={form.note} rows={3}
              onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ ...inputStyle, resize: "vertical" }} />
            <label style={{ fontSize: 12.5, color: "var(--text-sub)", display: "flex", alignItems: "center", gap: 8 }}>
              별점
              <select value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} style={{ ...inputStyle, width: 80 }}>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12.5, color: "var(--text-sub)", display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.spoiler} onChange={(e) => setForm({ ...form, spoiler: e.target.checked })} />
              역할/캐릭터를 스포일러로 블러 처리
            </label>
            <PrimaryButton type="submit">기록 저장</PrimaryButton>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {records.map((r) => (
            <Card key={r.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{r.scenarioName}</div>
                <span style={{ fontSize: 12, color: "var(--accent)", letterSpacing: 1 }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
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
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  padding: "10px 14px", borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 13,
};
