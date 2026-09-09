import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { expandDateRange } from "../lib/dateUtils.js";
import { syncPlayedTitles } from "../lib/records.js";
import { normalizeTitle } from "../lib/scenarioUtils.js";
import { canUseAI, KAKAO_CONTACT_URL, matchRecordsToCanonicalTitles } from "../lib/ai.js";
import { AILimitNotice, Card, EmptyState, OutlineButton, PageHeader, PrimaryButton, ScrollBox } from "../components/ui.jsx";
import MonthCalendar from "../components/MonthCalendar.jsx";

const EMPTY_FORM = { scenarioName: "", character: "", rating: 0, note: "", spoiler: true, favorite: false, public: false };
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
  const [aiCleanupBusy, setAiCleanupBusy] = useState(false);
  const [aiCleanupStatus, setAiCleanupStatus] = useState("");
  const [aiCleanupSuggestions, setAiCleanupSuggestions] = useState(null);
  const [aiCleanupApplying, setAiCleanupApplying] = useState(false);

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
      note: r.note || "", spoiler: r.spoiler !== false, favorite: !!r.favorite, public: !!r.public,
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

  // 예전에 직접 입력해서 정식 시나리오 DB 표기와 달라진(오타·띄어쓰기·줄임말 등) 기록 제목을
  // AI로 찾아서 정식 제목으로 맞출 수 있게 제안. 실제 반영은 사용자가 확인 후 "적용"할 때만.
  async function runAiCleanup() {
    setAiCleanupStatus("");
    setAiCleanupSuggestions(null);
    if (!canUseAI(profile)) return;

    const canonicalTitles = scenarios.map((s) => s.title);
    const canonicalKeys = new Set(canonicalTitles.map((t) => normalizeTitle(t)));
    const candidates = (records || []).filter((r) => !canonicalKeys.has(normalizeTitle(r.scenarioName)));

    if (candidates.length === 0) {
      setAiCleanupStatus("이미 다 정식 제목과 일치해요. 정리할 게 없어요!");
      return;
    }

    setAiCleanupBusy(true);
    try {
      const items = candidates.map((r) => ({ id: r.id, scenarioName: r.scenarioName }));
      const matches = await matchRecordsToCanonicalTitles(profile, items, canonicalTitles);
      if (matches.length === 0) {
        setAiCleanupStatus("확실하게 매칭되는 게 없었어요. (오타가 너무 크거나 목록에 없는 작품일 수 있어요)");
      } else {
        setAiCleanupSuggestions(
          matches.map((m) => ({
            id: m.id,
            oldTitle: candidates.find((r) => r.id === m.id)?.scenarioName || "",
            newTitles: m.matchedTitles,
            apply: true,
          }))
        );
      }
    } catch (err) {
      setAiCleanupStatus(err.message || "정리에 실패했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setAiCleanupBusy(false);
    }
  }

  function toggleAiSuggestion(id) {
    setAiCleanupSuggestions((list) => list.map((s) => (s.id === id ? { ...s, apply: !s.apply } : s)));
  }

  async function applyAiCleanup() {
    const toApply = (aiCleanupSuggestions || []).filter((s) => s.apply);
    if (toApply.length === 0) {
      setAiCleanupSuggestions(null);
      return;
    }
    setAiCleanupApplying(true);
    let splitCount = 0;
    for (const s of toApply) {
      const [firstTitle, ...restTitles] = s.newTitles;
      await updateDoc(doc(db, "records", s.id), { scenarioName: firstTitle });
      if (restTitles.length > 0) {
        const original = (records || []).find((r) => r.id === s.id);
        splitCount++;
        for (const title of restTitles) {
          await addDoc(collection(db, "records"), {
            userId: profile.id,
            scenarioName: title,
            character: original?.character || "",
            rating: original?.rating ?? null,
            note: original?.note || "",
            date: original?.date || new Date().toISOString().slice(0, 10),
            spoiler: original?.spoiler !== false,
            favorite: !!original?.favorite,
            public: !!original?.public,
            createdAt: serverTimestamp(),
          });
        }
      }
    }
    await syncPlayedTitles(profile.id);
    setAiCleanupApplying(false);
    setAiCleanupSuggestions(null);
    setAiCleanupStatus(
      splitCount > 0
        ? `${toApply.length}건 정리했어요! (그중 ${splitCount}건은 여러 편으로 나눠서 기록을 추가했어요)`
        : `${toApply.length}건 정리했어요!`
    );
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

      <Card style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>✨ AI 정리</div>
            <div style={{ fontSize: 11, color: "var(--text-sub)" }}>
              옛날에 직접 적어둔 제목이 정식 시나리오 DB 표기랑 달라졌으면(오타·줄임말 등) 찾아서 맞춰드려요.
            </div>
          </div>
          <OutlineButton style={{ height: 32, padding: "0 14px", fontSize: 12 }} onClick={runAiCleanup} disabled={aiCleanupBusy || !canUseAI(profile)}>
            {aiCleanupBusy ? "확인 중…" : "AI 정리 실행"}
          </OutlineButton>
        </div>
        {!canUseAI(profile) && <AILimitNotice kakaoUrl={KAKAO_CONTACT_URL} />}
        {aiCleanupStatus && <div style={{ fontSize: 12, color: "var(--text-sub)" }}>{aiCleanupStatus}</div>}

        {aiCleanupSuggestions && aiCleanupSuggestions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>
              아래 제안 중 맞는 것만 체크하고 적용하세요. (다른 작품이면 체크 해제)
            </div>
            {aiCleanupSuggestions.map((s) => (
              <label key={s.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", borderRadius: 8, background: "var(--bg-sub)" }}>
                <input type="checkbox" checked={s.apply} onChange={() => toggleAiSuggestion(s.id)} style={{ marginTop: 3 }} />
                <div style={{ fontSize: 12.5 }}>
                  <span style={{ color: "var(--text-sub)", textDecoration: "line-through" }}>{s.oldTitle}</span>
                  {" → "}
                  <span style={{ fontWeight: 600 }}>{s.newTitles.join(", ")}</span>
                  {s.newTitles.length > 1 && (
                    <div style={{ fontSize: 11, color: "var(--text-sub)", marginTop: 2 }}>
                      기록 1건이 {s.newTitles.length}편으로 나눠져요 (캐릭터·별점·메모는 그대로 복사돼요).
                    </div>
                  )}
                </div>
              </label>
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <OutlineButton style={{ flex: "none" }} onClick={() => setAiCleanupSuggestions(null)}>취소</OutlineButton>
              <PrimaryButton style={{ flex: 1 }} onClick={applyAiCleanup} disabled={aiCleanupApplying}>
                {aiCleanupApplying ? "적용 중…" : `선택한 ${aiCleanupSuggestions.filter((s) => s.apply).length}건 적용`}
              </PrimaryButton>
            </div>
          </div>
        )}
      </Card>

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
            <label style={{ fontSize: 12.5, color: "var(--text-sub)", display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.public} onChange={(e) => setForm({ ...form, public: e.target.checked })} />
              이 감상평을 같은 작품을 찾는 다른 사람도 볼 수 있게 공개 (기본은 비공개예요)
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
      {r.note && (
        <div
          className={!revealed[r.id] ? "spoiler" : ""}
          onClick={() => setRevealed((v) => ({ ...v, [r.id]: true }))}
          style={{ marginTop: 6, fontSize: 12.5, color: "var(--text-sub)" }}
        >
          {r.note}
        </div>
      )}
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
