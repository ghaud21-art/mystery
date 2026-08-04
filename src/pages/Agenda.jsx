import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { enableReminderNotifications } from "../lib/notifications.js";
import { expandDateRange } from "../lib/dateUtils.js";
import { Card, EmptyState, OutlineButton, PageHeader, PrimaryButton } from "../components/ui.jsx";
import MonthCalendar from "../components/MonthCalendar.jsx";

const PERSONAL_CATEGORIES = ["머더미스터리", "방탈출", "보드게임", "기타"];
const EMPTY_PERSONAL_FORM = { category: PERSONAL_CATEGORIES[0], title: "", location: "", datetime: "", endDatetime: "" };

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
      setTestStatus("요청했어요! 최대 5분 안에 이 기기로 알림이 도착해요.");
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
        if (groupIds.length === 0) {
          setItems([]);
          return;
        }
        const schedSnap = await getDocs(
          query(collection(db, "schedules"), where("groupId", "in", groupIds), orderBy("datetime", "asc"))
        );
        setItems(schedSnap.docs.map((d) => ({ id: d.id, ...d.data(), groupName: groupNames[d.data().groupId] })));
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
    setShowPersonalForm(true);
  }

  function startEditPersonal(s) {
    setEditingPersonalId(s.id);
    setPersonalForm({
      category: s.category || PERSONAL_CATEGORIES[0], title: s.title || "",
      location: s.location || "", datetime: s.datetime || "", endDatetime: s.endDatetime || "",
    });
    setShowPersonalForm(true);
  }

  async function submitPersonalForm(e) {
    e.preventDefault();
    setPersonalBusy(true);
    if (editingPersonalId) {
      await updateDoc(doc(db, "personalSchedules", editingPersonalId), personalForm);
    } else {
      await addDoc(collection(db, "personalSchedules"), {
        ...personalForm, userId: profile.id, createdAt: serverTimestamp(),
      });
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

  const upcoming = useMemo(() => {
    const now = new Date().toISOString();
    return (items || []).filter((s) => s.datetime >= now);
  }, [items]);

  const upcomingPersonal = useMemo(() => {
    const now = new Date().toISOString();
    return (personalSchedules || []).filter((s) => s.datetime >= now);
  }, [personalSchedules]);

  return (
    <div className="fade-in">
      <PageHeader eyebrow="MY AGENDA" title="일정" />

      <Card style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>일정 전날 알림</div>
        {notifEnabled && <div style={{ fontSize: 13, color: "var(--success)" }}>알림이 켜져 있어요 ✓</div>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <OutlineButton style={{ flex: "1 1 160px" }} onClick={handleEnableNotifications} disabled={notifStatus === "설정 중…"}>
            {notifStatus === "설정 중…" ? "설정 중…" : notifEnabled ? "알림 다시 설정" : "일정 전날 알림 받기"}
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

      <Card style={{ marginBottom: 20 }}>
        <MonthCalendar markedDates={markedDates} />
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-sub)", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
          내가 참석하는 모임 일정 + 개인 일정
        </div>
      </Card>

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
            <input required placeholder="이름 (시나리오/테마/게임 등)" value={personalForm.title}
              onChange={(e) => setPersonalForm({ ...personalForm, title: e.target.value })} style={inputStyle} />
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
            <PrimaryButton type="submit" disabled={personalBusy}>
              {personalBusy ? "저장 중…" : editingPersonalId ? "수정 저장" : "등록하기"}
            </PrimaryButton>
          </form>
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

      {loadError && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 12 }}>{loadError}</div>}

      <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>다가오는 일정</div>
        {items === null ? (
          <span style={{ fontSize: 13, color: "var(--text-sub)" }}>불러오는 중…</span>
        ) : upcoming.length === 0 ? (
          <EmptyState>
            예정된 일정이 없어요.
            <br />
            <Link to="/schedule" style={{ textDecoration: "underline" }}>모임에서 일정 만들러 가기 →</Link>
          </EmptyState>
        ) : (
          upcoming.map((s) => (
            <Link key={s.id} to={`/schedule/${s.groupId}`}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--accent)" }}>{s.groupName}</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: "var(--text-sub)" }}>{formatDate(s.datetime)} · {s.location}</div>
                </div>
                <span style={{ fontSize: 11.5, color: s.attendees?.[profile.id] === "yes" ? "var(--success)" : "var(--text-sub)" }}>
                  {s.attendees?.[profile.id] === "yes" ? "참석 예정" : "미정"}
                </span>
              </div>
            </Link>
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
