import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { expandDateRange } from "../lib/dateUtils.js";
import { syncPlayedTitles } from "../lib/records.js";
import { Card, EmptyState, OutlineButton, PageHeader, PrimaryButton, ScrollBox } from "../components/ui.jsx";
import MonthCalendar from "../components/MonthCalendar.jsx";

const EMPTY_FORM = { scenarioName: "", character: "", rating: 0, note: "", spoiler: true, favorite: false };
const VIEW_TABS = [
  { key: "list", label: "목록 (가나다순)" },
  { key: "calendar", label: "캘린더로 보기" },
];

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
  const [view, setView] = useState("list");
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [attendedByDate, setAttendedByDate] = useState({});

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

  // 캘린더 보기에서 그 날짜에 참석한 모임 일정도 함께 보여주기 위해 불러옴
  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      try {
        const groupSnap = await getDocs(
          query(collection(db, "groups"), where("memberIds", "array-contains", profile.id))
        );
        const groupIds = groupSnap.docs.map((d) => d.id).slice(0, 10);
        const groupNames = Object.fromEntries(groupSnap.docs.map((d) => [d.id, d.data().name]));
        if (groupIds.length === 0) return;
        const schedSnap = await getDocs(query(collection(db, "schedules"), where("groupId", "in", groupIds)));
        const map = {};
        schedSnap.docs.forEach((d) => {
          const s = d.data();
          if (s.attendees?.[profile.id] !== "yes" || !s.datetime) return;
          expandDateRange(s.datetime, s.endDatetime).forEach((key) => {
            (map[key] = map[key] || []).push({ title: s.title, groupName: groupNames[s.groupId] });
          });
        });
        setAttendedByDate(map);
      } catch (err) {
        console.error(err);
      }
    })();
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
        date: view === "calendar" ? selectedDate : new Date().toISOString().slice(0, 10),
        createdAt: serverTimestamp(),
      });
    }
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    await syncPlayedTitles(profile.id);
    load();
  }

  async function removeRecord(id) {
    if (!window.confirm("이 기록을 삭제할까요?")) return;
    await deleteDoc(doc(db, "records", id));
    await syncPlayedTitles(profile.id);
    load();
  }

  const sortedRecords = useMemo(() => {
    if (!records) return [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? records.filter((r) =>
          r.scenarioName.toLowerCase().includes(q) ||
          (r.character || "").toLowerCase().includes(q) ||
          (r.note || "").toLowerCase().includes(q)
        )
      : records;
    return [...filtered].sort((a, b) => a.scenarioName.localeCompare(b.scenarioName, "ko"));
  }, [records, search]);

  const recordsByDate = useMemo(() => {
    const map = {};
    (records || []).forEach((r) => { (map[r.date] = map[r.date] || []).push(r); });
    return map;
  }, [records]);

  const markedDates = useMemo(() => new Set(Object.keys(recordsByDate)), [recordsByDate]);

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="CASE LOG"
        title="플레이 기록"
        action={<PrimaryButton onClick={() => (showForm ? setShowForm(false) : startCreate())}>{showForm ? "닫기" : "+ 기록 추가"}</PrimaryButton>}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {VIEW_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setView(t.key)}
            style={{
              flex: 1, height: 36, borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: `1.5px solid ${view === t.key ? "var(--accent)" : "var(--border)"}`,
              background: view === t.key ? "var(--accent-dim)" : "transparent",
              color: view === t.key ? "var(--accent)" : "var(--text-sub)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

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
            {view === "calendar" && !editingId && (
              <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>
                📅 선택한 날짜({selectedDate})로 기록돼요.
              </div>
            )}
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
      ) : view === "list" ? (
        <>
          <input
            placeholder="시나리오 이름·캐릭터·메모로 내 기록 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginBottom: 14 }}
          />
          {sortedRecords.length === 0 ? (
            <Card><EmptyState>{search ? "검색 결과가 없어요." : "아직 기록이 없어요."}</EmptyState></Card>
          ) : (
            <ScrollBox maxHeight={640}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
                {sortedRecords.map((r) => (
                  <RecordCard key={r.id} r={r} revealed={revealed} setRevealed={setRevealed} startEdit={startEdit} removeRecord={removeRecord} />
                ))}
              </div>
            </ScrollBox>
          )}
        </>
      ) : (
        <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "minmax(280px,380px) 1fr", gap: 20 }}>
          <Card>
            <MonthCalendar markedDates={markedDates} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-sub)", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
              플레이 기록이 있는 날
            </div>
          </Card>

          <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{selectedDate}</div>

            {attendedByDate[selectedDate]?.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {attendedByDate[selectedDate].map((a, i) => (
                  <div key={i} style={{ fontSize: 11.5, color: "var(--accent)" }}>
                    📅 모임 일정: {a.title} ({a.groupName})
                  </div>
                ))}
              </div>
            )}

            {(recordsByDate[selectedDate] || []).length === 0 ? (
              <EmptyState>
                이 날짜 기록이 없어요.
                <div style={{ marginTop: 12 }}>
                  <PrimaryButton onClick={startCreate}>+ 이 날짜로 기록 추가</PrimaryButton>
                </div>
              </EmptyState>
            ) : (
              <ScrollBox maxHeight="clamp(240px, calc(100vh - 420px), 560px)">
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {recordsByDate[selectedDate].map((r) => (
                    <RecordCard key={r.id} r={r} revealed={revealed} setRevealed={setRevealed} startEdit={startEdit} removeRecord={removeRecord} compact />
                  ))}
                </div>
              </ScrollBox>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function RecordCard({ r, revealed, setRevealed, startEdit, removeRecord, compact }) {
  return (
    <Card style={compact ? { padding: "12px 14px" } : undefined}>
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
      <div style={{ fontSize: 11.5, color: "var(--text-sub)", marginTop: 4 }}>
        {r.date}
        {r.source === "auto-schedule" && (
          <span style={{ marginLeft: 6, fontSize: 10, color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 999, padding: "1px 6px" }}>
            모임 일정 자동 연동
          </span>
        )}
      </div>
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
  );
}

const inputStyle = {
  padding: "10px 14px", borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 13,
};
