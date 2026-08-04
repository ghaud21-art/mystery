import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp, where } from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { enableReminderNotifications } from "../lib/notifications.js";
import { Card, EmptyState, OutlineButton, PageHeader } from "../components/ui.jsx";
import MonthCalendar from "../components/MonthCalendar.jsx";

export default function Agenda() {
  const { profile, setProfile } = useAuth();
  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [notifStatus, setNotifStatus] = useState("");
  const [testStatus, setTestStatus] = useState("");

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

  const markedDates = useMemo(() => {
    const set = new Set();
    (items || []).forEach((s) => {
      if (s.attendees?.[profile.id] !== "yes" || !s.datetime) return;
      const start = s.datetime.slice(0, 10);
      const end = s.endDatetime ? s.endDatetime.slice(0, 10) : start;
      let cursor = new Date(`${start}T00:00:00`);
      const last = new Date(`${end}T00:00:00`);
      while (cursor <= last) {
        set.add(toDateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    return set;
  }, [items, profile?.id]);

  const upcoming = useMemo(() => {
    const now = new Date().toISOString();
    return (items || []).filter((s) => s.datetime >= now);
  }, [items]);

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
          내가 참석하는 일정
        </div>
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

function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
}
