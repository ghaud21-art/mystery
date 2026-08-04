import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { addDoc, collection, getDocs, query, where } from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { displayName } from "../lib/profileDisplay.js";
import { Card, EmptyState, OutlineButton, PageHeader, PrimaryButton, ScrollBox } from "../components/ui.jsx";

const EMPTY_FORM = { title: "", publisher: "", playerCount: "", duration: "", description: "", category: "offline" };
const CATEGORY_TABS = [
  { key: "offline", label: "오프라인" },
  { key: "online", label: "온라인" },
];

export default function ScenarioSearch() {
  const { profile } = useAuth();
  const [scenarios, setScenarios] = useState(null);
  const [category, setCategory] = useState("offline");
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
    const list = scenarios
      .filter((s) => (s.category || "offline") === category)
      .filter((s) => !q || s.title.toLowerCase().includes(q) || (s.publisher || "").toLowerCase().includes(q));
    return [...list].sort((a, b) => a.title.localeCompare(b.title, "ko"));
  }, [scenarios, search, category]);

  async function submitRequest(e) {
    e.preventDefault();
    setSubmitStatus("등록 요청 중…");
    await addDoc(collection(db, "scenarios"), {
      ...form,
      status: "pending",
      submittedBy: profile.id,
      submittedByName: displayName(profile),
    });
    setForm({ ...EMPTY_FORM, category });
    setShowForm(false);
    setSubmitStatus("관리자 승인 후 목록에 추가돼요. 요청 감사해요!");
    setTimeout(() => setSubmitStatus(""), 4000);
  }

  return (
    <div className="fade-in">
      <PageHeader eyebrow="SCENARIO DB" title="시나리오 찾기" />

      <Card style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>머더미스터리 시나리오 검색</div>
          <PrimaryButton
            style={{ height: 36, padding: "0 14px", fontSize: 12.5, whiteSpace: "nowrap" }}
            onClick={() => {
              if (!showForm) setForm({ ...EMPTY_FORM, category });
              setShowForm((s) => !s);
            }}
          >
            {showForm ? "닫기" : "+ 목록에 없는 작품 등록 요청"}
          </PrimaryButton>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {CATEGORY_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setCategory(t.key)}
              style={{
                flex: 1, height: 36, borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: `1.5px solid ${category === t.key ? "var(--accent)" : "var(--border)"}`,
                background: category === t.key ? "var(--accent-dim)" : "transparent",
                color: category === t.key ? "var(--accent)" : "var(--text-sub)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <input
          placeholder="시나리오 이름으로 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={inputStyle}
        />

        {showForm && (
          <form onSubmit={submitRequest} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 10, background: "var(--bg-sub)" }}>
            <div style={{ display: "flex", gap: 8 }}>
              {CATEGORY_TABS.map((t) => (
                <button
                  type="button"
                  key={t.key}
                  onClick={() => setForm({ ...form, category: t.key })}
                  style={{
                    flex: 1, height: 34, borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                    border: `1.5px solid ${form.category === t.key ? "var(--accent)" : "var(--border)"}`,
                    background: form.category === t.key ? "var(--accent-dim)" : "transparent",
                    color: form.category === t.key ? "var(--accent)" : "var(--text-sub)",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <input required placeholder="시나리오 이름" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} style={inputStyle} />
            <input placeholder="제작사 (선택)" value={form.publisher}
              onChange={(e) => setForm({ ...form, publisher: e.target.value })} style={inputStyle} />
            <div style={{ display: "flex", gap: 8 }}>
              <input placeholder="인원수 (예: 4-6인)" value={form.playerCount}
                onChange={(e) => setForm({ ...form, playerCount: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
              <input placeholder="플레이 시간 (예: 3시간)" value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
            </div>
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
          <>
            <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>총 {filtered.length}개 (가나다순)</div>
            <ScrollBox maxHeight={560}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
                {filtered.map((s) => (
                  <div key={s.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.35, overflowWrap: "break-word" }}>{s.title}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <InfoRow icon="🏢" value={s.publisher || "제작사 미상"} />
                      <InfoRow icon="👥" value={s.playerCount ? `${s.playerCount} 인원` : "인원 미상"} />
                      <InfoRow icon="⏱️" value={s.duration ? `${s.duration} 소요` : "시간 미상"} />
                    </div>
                    <Link to="/records" state={{ scenarioName: s.title }}>
                      <OutlineButton style={{ width: "100%", height: 32, fontSize: 12 }}>+ 기록에 추가</OutlineButton>
                    </Link>
                  </div>
                ))}
              </div>
            </ScrollBox>
          </>
        )}
      </Card>
    </div>
  );
}

function InfoRow({ icon, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-sub)" }}>
      <span style={{ flex: "none" }}>{icon}</span>
      <span style={{ overflowWrap: "break-word" }}>{value}</span>
    </div>
  );
}

const inputStyle = {
  padding: "10px 14px", borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 13,
};
