import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { enableReminderNotifications } from "../lib/notifications.js";
import { expandDateRange } from "../lib/dateUtils.js";
import { Card, EmptyState, OutlineButton, PageHeader, PrimaryButton, ScrollBox } from "../components/ui.jsx";
import MonthCalendar from "../components/MonthCalendar.jsx";
import { PRESET_COLORS } from "../lib/colors.js";

const PERSONAL_CATEGORIES = ["머더미스터리", "크라임씬", "방탈출", "보드게임", "기타"];
const ALL_CATEGORIES = ["all", ...PERSONAL_CATEGORIES];
const EMPTY_PERSONAL_FORM = {
  category: PERSONAL_CATEGORIES[0], title: "", location: "", datetime: "", endDatetime: "", color: PRESET_COLORS[1],
};

export default function Agenda() {
  const { profile, setProfile } = useAuth();
  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [notifStatus, setNotifStatus] = useState("");
  const [testStatus, setTestStatus] = useState("");
  const [personalSchedules, setPersonalSchedules] = useState(null);
  const [showPersonalForm, setShowPersonalForm] = useState(false);
  const [personalForm, setPersonalForm] = useState(EMPTY_PERSONAL_FORM);
  const [editingPersonalId, setEditingPersonalId] = useState(null);
  const [personalBusy, setPersonalBusy] = useState(false);
  const [personalTitleQueue, setPersonalTitleQueue] = useState([]);
  const [personalCategoryFilter, setPersonalCategoryFilter] = useState("all");
  const [upcomingCategoryFilter, setUpcomingCategoryFilter] = useState("all");
  const [scenarios, setScenarios] = useState([]);
  const [showTitleSuggestions, setShowTitleSuggestions] = useState(false);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(query(collection(db, "scenarios"), where("status", "==", "approved")));
      setScenarios(snap.docs.map((d) => d.data()));
    })();
  }, []);

  const titleSuggestions = (() => {
    if (personalForm.category !== "머더미스터리" && personalForm.category !== "크라임씬") return [];
    const q = personalForm.title.trim().toLowerCase();
    if (!q) return [];
    return scenarios.filter((sc) => sc.title.toLowerCase().includes(q)).slice(0, 6);
  })();

  const notifEnabled = (profile?.fcmTokens?.length || 0) > 0;

  async function handleEnableNotifications() {
    setNotifStatus("설정 중…");
    try {
      const token = await enableReminderNotifications(profile.id);
      setProfile((p) => ({ ...p, fcmTokens: [...new Set([...(p.fcmTokens || []), token])] }));
      setNotifStatus("알림이 켜졌어요 ✓");
    } catch (err) {
      setNotifStatus(err.message || "알림 설정에 실패했어요.");
    }
  }

  async function sendTestNotification() {
    setTestStatus("요청 중…");
    try {
      const token = await enableReminderNotifications(profile.id);
      await addDoc(collection(db, "testNotifications"), {
        uid: profile.id,
        token,
        status: "pending",
        requestedAt: serverTimestamp(),
      });
      setTestStatus("요청했어요! 잠시 후 이 기기로 알림이 바로 도착해요.");
    } catch (err) {
      setTestStatus(err.message || "요청에 실패했어요.");
    }
  }

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      try {
        setLoadError("");
        const groupSnap = await getDocs(
          query(collection(db, "groups"), where("memberIds", "array-contains", profile.id))
        );
        const groupIds = groupSnap.docs.map((d) => d.id).slice(0, 10);
        const groupNames = Object.fromEntries(groupSnap.docs.map((d) => [d.id, d.data().name]));
        const groupColors = Object.fromEntries(groupSnap.docs.map((d) => [d.id, d.data().color || PRESET_COLORS[0]]));
        if (groupIds.length === 0) {
          setItems([]);
          return;
        }
        const schedSnap = await getDocs(
          query(collection(db, "schedules"), where("groupId", "in", groupIds), orderBy("datetime", "asc"))
        );
        setItems(schedSnap.docs.map((d) => ({
          id: d.id, ...d.data(),
          groupName: groupNames[d.data().groupId],
          groupColor: groupColors[d.data().groupId],
        })));
      } catch (err) {
        console.error(err);
        setLoadError("일정을 불러오지 못했어요.");
        setItems([]);
      }
    })();
  }, [profile?.id]);

  async function loadPersonalSchedules() {
    try {
      const snap = await getDocs(
        query(collection(db, "personalSchedules"), where("userId", "==", profile.id), orderBy("datetime", "asc"))
      );
      setPersonalSchedules(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
      setPersonalSchedules([]);
    }
  }

  useEffect(() => { if (profile?.id) loadPersonalSchedules(); }, [profile?.id]);

  function startCreatePersonal() {
    setEditingPersonalId(null);
    setPersonalForm(EMPTY_PERSONAL_FORM);
    setPersonalTitleQueue([]);
    setShowPersonalForm(true);
  }

  function startEditPersonal(s) {
    setEditingPersonalId(s.id);
    setPersonalForm({
      category: s.category || PERSONAL_CATEGORIES[0], title: s.title || "",
      location: s.location || "", datetime: s.datetime || "", endDatetime: s.endDatetime || "",
      color: s.color || PRESET_COLORS[1],
    });
    setPersonalTitleQueue([]);
    setShowPersonalForm(true);
  }

  // 같은 날 여러 작품을 한 날짜/장소로 한 번에 등록할 수 있도록, 입력 중인 제목을
  // 목록에 쌓아뒀다가 등록 시 한꺼번에 각각 별도 일정으로 만든다.
  function queueTitle() {
    const t = personalForm.title.trim();
    if (!t) return;
    if (!personalTitleQueue.includes(t)) setPersonalTitleQueue((q) => [...q, t]);
    setPersonalForm((f) => ({ ...f, title: "" }));
  }
  function removeQueuedTitle(t) {
    setPersonalTitleQueue((q) => q.filter((x) => x !== t));
  }

  async function submitPersonalForm(e) {
    e.preventDefault();

    if (editingPersonalId) {
      setPersonalBusy(true);
      await updateDoc(doc(db, "personalSchedules", editingPersonalId), personalForm);
    } else {
      const titles = [...personalTitleQueue, ...(personalForm.title.trim() ? [personalForm.title.trim()] : [])];
      if (titles.length === 0) return;
      setPersonalBusy(true);
      for (const title of titles) {
        await addDoc(collection(db, "personalSchedules"), {
          ...personalForm, title, userId: profile.id, createdAt: serverTimestamp(),
        });
      }
    }

    // 가능일 연동: 새로 등록한 일정 날짜는 더 이상 "가능한 날"이 아니므로 자동으로 뺌
    const busyDates = expandDateRange(personalForm.datetime, personalForm.endDatetime);
    const availableDates = profile.availableDates || [];
    const nextAvailable = availableDates.filter((d) => !busyDates.includes(d));
    if (nextAvailable.length !== availableDates.length) {
      await updateDoc(doc(db, "users", profile.id), { availableDates: nextAvailable });
      setProfile((p) => ({ ...p, availableDates: nextAvailable }));
    }

    setPersonalForm(EMPTY_PERSONAL_FORM);
    setPersonalTitleQueue([]);
    setEditingPersonalId(null);
    setShowPersonalForm(false);
    setPersonalBusy(false);
    loadPersonalSchedules();
  }

  async function removePersonal(id) {
    if (!window.confirm("이 개인 일정을 삭제할까요?")) return;
    await deleteDoc(doc(db, "personalSchedules", id));
    loadPersonalSchedules();
  }

  const markedDates = useMemo(() => {
    const set = new Set();
    (items || []).forEach((s) => {
      if (s.attendees?.[profile.id] !== "yes" || !s.datetime) return;
      expandDateRange(s.datetime, s.endDatetime).forEach((k) => set.add(k));
    });
    (personalSchedules || []).forEach((s) => {
      if (!s.datetime) return;
      expandDateRange(s.datetime, s.endDatetime).forEach((k) => set.add(k));
    });
    return set;
  }, [items, personalSchedules, profile?.id]);

  const eventsByDate = useMemo(() => {
    const map = {};
    (items || []).forEach((s) => {
      if (s.attendees?.[profile.id] !== "yes" || !s.datetime) return;
      expandDateRange(s.datetime, s.endDatetime).forEach((k) => {
        (map[k] = map[k] || []).push({ label: s.title, color: s.groupColor || PRESET_COLORS[0], type: "group", detail: s });
      });
    });
    (personalSchedules || []).forEach((s) => {
      if (!s.datetime) return;
      expandDateRange(s.datetime, s.endDatetime).forEach((k) => {
        (map[k] = map[k] || []).push({ label: s.title, color: s.color || PRESET_COLORS[1], type: "personal", detail: s });
      });
    });
    return map;
  }, [items, personalSchedules, profile?.id]);

  const [selectedDate, setSelectedDate] = useState(null);
  const selectedEvents = selectedDate ? eventsByDate[selectedDate] || [] : [];

  // "다가오는 일정"에는 내가 참석하기로 한 모임 일정 + 개인 일정만 모아서 보여줌.
  // 지난 일정도 목록에 남기되(흐리게 표시), 맨 아래로 내려가도록 정렬
  const sortedAgendaItems = useMemo(() => {
    const now = new Date().toISOString();
    const attendingGroup = (items || [])
      .filter((s) => s.attendees?.[profile.id] === "yes")
      .map((s) => ({ ...s, kind: "group" }));
    const personal = (personalSchedules || []).map((s) => ({ ...s, kind: "personal" }));
    return [...attendingGroup, ...personal]
      .map((s) => ({ ...s, isPast: !!((s.endDatetime || s.datetime) && (s.endDatetime || s.datetime) < now) }))
      .sort((a, b) => {
        if (a.isPast !== b.isPast) return a.isPast ? 1 : -1;
        return (a.datetime || "").localeCompare(b.datetime || "");
      });
  }, [items, personalSchedules, profile.id]);

  const displayAgendaItems = useMemo(() => {
    if (upcomingCategoryFilter === "all") return sortedAgendaItems;
    return sortedAgendaItems.filter((s) => (s.category || "머더미스터리") === upcomingCategoryFilter);
  }, [sortedAgendaItems, upcomingCategoryFilter]);

  const upcomingPersonal = useMemo(() => {
    const now = new Date().toISOString();
    return (personalSchedules || [])
      .filter((s) => s.datetime >= now)
      .filter((s) => personalCategoryFilter === "all" || s.category === personalCategoryFilter);
  }, [personalSchedules, personalCategoryFilter]);

  return (
    <div className="fade-in">
      <PageHeader eyebrow="MY AGENDA" title="일정" />

      <Card style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>일정 알림</div>
        <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>참석하기로 한 모임 일정 전날, 그리고 시작 1시간 전에 알림이 가요.</div>
        {notifEnabled && <div style={{ fontSize: 13, color: "var(--success)" }}>알림이 켜져 있어요 ✓</div>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <OutlineButton style={{ flex: "1 1 160px" }} onClick={handleEnableNotifications} disabled={notifStatus === "설정 중…"}>
            {notifStatus === "설정 중…" ? "설정 중…" : notifEnabled ? "알림 다시 설정" : "일정 알림 받기"}
          </OutlineButton>
          {notifEnabled && (
            <OutlineButton style={{ flex: "1 1 160px" }} onClick={sendTestNotification} disabled={testStatus === "요청 중…"}>
              {testStatus === "요청 중…" ? "요청 중…" : "테스트 알림 보내기"}
            </OutlineButton>
          )}
        </div>
        {notifStatus && notifStatus !== "설정 중…" && (
          <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>{notifStatus}</div>
        )}
        {testStatus && testStatus !== "요청 중…" && (
          <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>{testStatus}</div>
        )}
      </Card>

      <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start", marginBottom: 20 }}>
        <Card>
          <MonthCalendar
            markedDates={markedDates}
            eventsByDate={eventsByDate}
            selectedDate={selectedDate}
            onSelectDate={(key) => setSelectedDate((d) => (d === key ? null : key))}
          />
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-sub)" }}>
            모임 일정은 모임 색깔로, 개인 일정은 등록할 때 고른 색으로 표시돼요.
            모임 색깔은 모임 페이지 "편집"에서 바꿀 수 있어요.
          </div>

          {selectedDate && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{selectedDate}</div>
              {selectedEvents.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-sub)" }}>이 날짜엔 일정이 없어요.</div>
              ) : (
                selectedEvents.map((e, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 3, background: e.color, marginTop: 4, flex: "none" }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflowWrap: "break-word" }}>{e.detail.title}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>
                        {formatDate(e.detail.datetime)}{e.detail.endDatetime ? ` ~ ${formatDate(e.detail.endDatetime)}` : ""} · {e.detail.location}
                        {e.type === "group" && ` · ${e.detail.groupName}`}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </Card>

        <Card style={{ position: "sticky", top: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>다가오는 일정</div>
          {items && sortedAgendaItems.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ALL_CATEGORIES.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setUpcomingCategoryFilter(c)}
                  style={{
                    padding: "5px 10px", borderRadius: 999, fontSize: 11.5, cursor: "pointer",
                    border: `1.5px solid ${upcomingCategoryFilter === c ? "var(--accent)" : "var(--border)"}`,
                    background: upcomingCategoryFilter === c ? "var(--accent-dim)" : "transparent",
                    color: upcomingCategoryFilter === c ? "var(--accent)" : "var(--text-sub)",
                  }}
                >
                  {c === "all" ? "전체" : c}
                </button>
              ))}
            </div>
          )}
          {items === null ? (
            <span style={{ fontSize: 13, color: "var(--text-sub)" }}>불러오는 중…</span>
          ) : displayAgendaItems.length === 0 ? (
            <EmptyState>
              예정된 일정이 없어요.
              <br />
              <Link to="/schedule" style={{ textDecoration: "underline" }}>모임에서 일정 만들러 가기 →</Link>
            </EmptyState>
          ) : (
            <ScrollBox maxHeight="clamp(280px, calc(100vh - 460px), 520px)">
              {displayAgendaItems.map((s) => {
                const row = (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--accent)" }}>{s.kind === "group" ? s.groupName : `개인 · ${s.category}`}</div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{s.title}</div>
                      <div style={{ fontSize: 12, color: "var(--text-sub)" }}>{formatDate(s.datetime)} · {s.location}</div>
                    </div>
                    <span style={{ fontSize: 11.5, color: s.isPast ? "var(--text-sub)" : "var(--success)" }}>
                      {s.isPast ? "종료" : "참석 예정"}
                    </span>
                  </div>
                );
                return s.kind === "group" ? (
                  <Link key={s.id} to={`/schedule/${s.groupId}`} style={{ opacity: s.isPast ? 0.5 : 1 }}>{row}</Link>
                ) : (
                  <div key={s.id} style={{ opacity: s.isPast ? 0.5 : 1 }}>{row}</div>
                );
              })}
            </ScrollBox>
          )}
        </Card>
      </div>

      {loadError && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 12 }}>{loadError}</div>}

      <Card style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>내 개인 일정</div>
          <PrimaryButton
            style={{ height: 34, padding: "0 14px", fontSize: 12.5 }}
            onClick={() => (showPersonalForm ? setShowPersonalForm(false) : startCreatePersonal())}
          >
            {showPersonalForm ? "닫기" : "+ 개인 일정 추가"}
          </PrimaryButton>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-sub)" }}>
          모임 없이 혼자(또는 그냥 기록용으로) 등록하는 일정이에요. 등록하면 그 날짜는 자동으로 가능일에서 빠져요.
        </div>

        {showPersonalForm && (
          <form onSubmit={submitPersonalForm} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 10, background: "var(--bg-sub)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {PERSONAL_CATEGORIES.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setPersonalForm({ ...personalForm, category: c })}
                  style={{
                    padding: "6px 12px", borderRadius: 999, fontSize: 12.5,
                    border: `1.5px solid ${personalForm.category === c ? "var(--accent)" : "var(--border)"}`,
                    background: personalForm.category === c ? "var(--accent-dim)" : "transparent",
                    color: personalForm.category === c ? "var(--accent)" : "var(--text)",
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  required={personalTitleQueue.length === 0}
                  placeholder="이름 (시나리오/테마/게임 등)"
                  value={personalForm.title}
                  onChange={(e) => { setPersonalForm({ ...personalForm, title: e.target.value }); setShowTitleSuggestions(true); }}
                  onFocus={() => setShowTitleSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowTitleSuggestions(false), 150)}
                  style={{ ...inputStyle, flex: 1 }}
                />
                {!editingPersonalId && (
                  <OutlineButton type="button" style={{ flex: "none", padding: "0 12px", fontSize: 12 }} onClick={queueTitle}>
                    + 목록에 추가
                  </OutlineButton>
                )}
              </div>
              {showTitleSuggestions && titleSuggestions.length > 0 && (
                <div style={{
                  position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 10,
                  background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: 8,
                  boxShadow: "0 4px 16px rgba(0,0,0,.15)", overflow: "hidden",
                }}>
                  {titleSuggestions.map((sc) => (
                    <button
                      type="button"
                      key={sc.title}
                      onMouseDown={() => { setPersonalForm({ ...personalForm, title: sc.title }); setShowTitleSuggestions(false); }}
                      style={{
                        display: "block", width: "100%", textAlign: "left", padding: "9px 14px",
                        background: "none", border: "none", borderBottom: "1px solid var(--border)", fontSize: 13,
                      }}
                    >
                      {sc.title}
                      {sc.publisher && <span style={{ color: "var(--text-sub)", fontSize: 11.5 }}> · {sc.publisher}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {personalTitleQueue.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {personalTitleQueue.map((t) => (
                  <span key={t} style={{
                    display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 6px 4px 10px",
                    borderRadius: 999, background: "var(--accent-dim)", color: "var(--accent)",
                  }}>
                    {t}
                    <button
                      type="button"
                      onClick={() => removeQueuedTitle(t)}
                      style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            {!editingPersonalId && (
              <div style={{ fontSize: 10.5, color: "var(--text-sub)" }}>
                같은 날 여러 작품을 했다면, 제목을 입력하고 "+ 목록에 추가"를 눌러서 한 번에 등록할 수 있어요. (날짜·장소·카테고리는 전부 동일하게 적용돼요)
              </div>
            )}
            <input required placeholder="장소" value={personalForm.location}
              onChange={(e) => setPersonalForm({ ...personalForm, location: e.target.value })} style={inputStyle} />
            <label style={{ fontSize: 11.5, color: "var(--text-sub)" }}>
              시작 시각
              <input required type="datetime-local" value={personalForm.datetime}
                onChange={(e) => setPersonalForm({ ...personalForm, datetime: e.target.value })} style={{ ...inputStyle, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 11.5, color: "var(--text-sub)" }}>
              종료 시각 (1박2일 등 여러 날이면 입력, 선택)
              <input type="datetime-local" value={personalForm.endDatetime} min={personalForm.datetime}
                onChange={(e) => setPersonalForm({ ...personalForm, endDatetime: e.target.value })} style={{ ...inputStyle, marginTop: 4 }} />
            </label>
            <div>
              <div style={{ fontSize: 11.5, color: "var(--text-sub)", marginBottom: 6 }}>캘린더 색깔</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPersonalForm({ ...personalForm, color: c })}
                    style={{
                      width: 26, height: 26, borderRadius: "50%", background: c, padding: 0,
                      border: personalForm.color === c ? "3px solid var(--text)" : "2px solid transparent",
                    }}
                  />
                ))}
              </div>
            </div>
            <PrimaryButton type="submit" disabled={personalBusy}>
              {personalBusy
                ? "저장 중…"
                : editingPersonalId
                ? "수정 저장"
                : (() => {
                    const count = personalTitleQueue.length + (personalForm.title.trim() ? 1 : 0);
                    return count > 1 ? `${count}개 작품 한 번에 등록하기` : "등록하기";
                  })()}
            </PrimaryButton>
          </form>
        )}

        {personalSchedules && personalSchedules.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ALL_CATEGORIES.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setPersonalCategoryFilter(c)}
                style={{
                  padding: "5px 10px", borderRadius: 999, fontSize: 11.5, cursor: "pointer",
                  border: `1.5px solid ${personalCategoryFilter === c ? "var(--accent)" : "var(--border)"}`,
                  background: personalCategoryFilter === c ? "var(--accent-dim)" : "transparent",
                  color: personalCategoryFilter === c ? "var(--accent)" : "var(--text-sub)",
                }}
              >
                {c === "all" ? "전체" : c}
              </button>
            ))}
          </div>
        )}

        {personalSchedules === null ? (
          <span style={{ fontSize: 13, color: "var(--text-sub)" }}>불러오는 중…</span>
        ) : upcomingPersonal.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-sub)" }}>등록된 개인 일정이 없어요.</div>
        ) : (
          upcomingPersonal.map((s) => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)", flexWrap: "wrap", gap: 8 }}>
              <div>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--accent)", background: "var(--accent-dim)", padding: "2px 8px", borderRadius: 999 }}>
                  {s.category}
                </span>
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-sub)" }}>
                  {formatDate(s.datetime)}{s.endDatetime ? ` ~ ${formatDate(s.endDatetime)}` : ""} · {s.location}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <OutlineButton style={{ height: 32, padding: "0 12px", fontSize: 12 }} onClick={() => startEditPersonal(s)}>수정</OutlineButton>
                <OutlineButton
                  style={{ height: 32, padding: "0 12px", fontSize: 12, borderColor: "var(--danger)", color: "var(--danger)" }}
                  onClick={() => removePersonal(s.id)}
                >
                  삭제
                </OutlineButton>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
}

const inputStyle = {
  padding: "10px 14px", borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 13, width: "100%", boxSizing: "border-box",
};
