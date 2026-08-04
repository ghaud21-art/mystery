import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, doc, getDocs, limit, orderBy, query, updateDoc, where } from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { Card, EmptyState, OutlineButton, PageHeader, PrimaryButton } from "../components/ui.jsx";
import { displayName } from "../lib/profileDisplay.js";

export default function Dashboard() {
  const { profile, setProfile } = useAuth();
  const [upcoming, setUpcoming] = useState(null);
  const [records, setRecords] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [votingId, setVotingId] = useState(null);

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      try {
        const groupSnap = await getDocs(
          query(collection(db, "groups"), where("memberIds", "array-contains", profile.id))
        );
        setAnnouncements(
          groupSnap.docs
            .map((d) => ({ groupId: d.id, groupName: d.data().name, announcement: d.data().announcement }))
            .filter((g) => g.announcement)
        );
        const groupIds = groupSnap.docs.map((d) => d.id).slice(0, 10);
        const groupNames = Object.fromEntries(groupSnap.docs.map((d) => [d.id, d.data().name]));
        if (groupIds.length === 0) {
          setUpcoming([]);
        } else {
          const now = new Date().toISOString();
          const schedSnap = await getDocs(
            query(
              collection(db, "schedules"),
              where("groupId", "in", groupIds),
              where("datetime", ">=", now),
              orderBy("datetime", "asc"),
              limit(20)
            )
          );
          const items = schedSnap.docs.map((d) => ({ id: d.id, ...d.data(), groupName: groupNames[d.data().groupId] }));
          // 내가 참석하기로 한 일정을 먼저 보여주고, 날짜순은 그 안에서 유지
          items.sort((a, b) => {
            const aMine = a.attendees?.[profile.id] === "yes" ? 0 : 1;
            const bMine = b.attendees?.[profile.id] === "yes" ? 0 : 1;
            return aMine !== bMine ? aMine - bMine : a.datetime.localeCompare(b.datetime);
          });
          setUpcoming(items.slice(0, 5));
        }
      } catch {
        setUpcoming([]);
      }
      try {
        const recSnap = await getDocs(
          query(collection(db, "records"), where("userId", "==", profile.id), orderBy("date", "desc"), limit(4))
        );
        setRecords(recSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch {
        setRecords([]);
      }
    })();
  }, [profile?.id]);

  async function toggleAttend(schedule) {
    const mine = schedule.attendees?.[profile.id];
    const next = mine === "yes" ? "no" : "yes";
    setVotingId(schedule.id);
    await updateDoc(doc(db, "schedules", schedule.id), { [`attendees.${profile.id}`]: next });
    setUpcoming((list) =>
      list
        .map((s) => (s.id === schedule.id ? { ...s, attendees: { ...s.attendees, [profile.id]: next } } : s))
        .sort((a, b) => {
          const aMine = a.attendees?.[profile.id] === "yes" ? 0 : 1;
          const bMine = b.attendees?.[profile.id] === "yes" ? 0 : 1;
          return aMine !== bMine ? aMine - bMine : a.datetime.localeCompare(b.datetime);
        })
    );
    if (next === "yes" && schedule.datetime) {
      const dateKey = schedule.datetime.slice(0, 10);
      const availableDates = profile.availableDates || [];
      if (availableDates.includes(dateKey)) {
        const nextDates = availableDates.filter((d) => d !== dateKey);
        await updateDoc(doc(db, "users", profile.id), { availableDates: nextDates });
        setProfile((p) => ({ ...p, availableDates: nextDates }));
      }
    }
    setVotingId(null);
  }

  return (
    <div className="fade-in">
      <PageHeader eyebrow="DETECTIVE OFFICE" title={`안녕하세요, ${displayName(profile)} 님`} />

      {announcements.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {announcements.map((a) => (
            <Link key={a.groupId} to={`/schedule/${a.groupId}`}>
              <div style={{
                padding: "14px 18px", borderRadius: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                background: "linear-gradient(135deg, var(--accent-dim), transparent)", border: "1.5px solid var(--accent)",
              }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--accent)", flex: "none" }}>📢 {a.groupName}</span>
                <span style={{ fontSize: 13.5, fontWeight: 600, overflowWrap: "break-word" }}>{a.announcement.text}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!profile?.style && (
        <Card accent style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <span style={{ fontSize: 13.5 }}>아직 추리 성향 테스트를 하지 않으셨네요. 3분이면 끝나요.</span>
          <Link to="/style-test"><PrimaryButton>테스트 시작하기</PrimaryButton></Link>
        </Card>
      )}

      <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 20 }}>
        <Card accent style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ font: "500 11px ui-monospace,monospace", letterSpacing: 1.5, color: "var(--text-sub)" }}>
            다가오는 모임
          </div>
          {upcoming === null ? (
            <span style={{ color: "var(--text-sub)", fontSize: 13 }}>불러오는 중…</span>
          ) : upcoming.length === 0 ? (
            <EmptyState>
              아직 예정된 일정이 없어요.
              <br />
              <Link to="/schedule" style={{ textDecoration: "underline" }}>모임 만들러 가기 →</Link>
            </EmptyState>
          ) : (
            upcoming.map((s) => {
              const mine = s.attendees?.[profile.id];
              return (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <Link to={`/schedule/${s.groupId}`} style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: "var(--accent)" }}>{s.groupName}</div>
                    <div style={{ fontSize: 17, fontWeight: 700 }}>{s.title}</div>
                    <div style={{ fontSize: 12.5, color: "var(--text-sub)", marginTop: 4 }}>
                      {formatDate(s.datetime)} · {s.location}
                    </div>
                  </Link>
                  <OutlineButton
                    style={{ height: 38, fontSize: 13, flex: "none", borderColor: mine === "yes" ? "var(--success)" : undefined, color: mine === "yes" ? "var(--success)" : undefined }}
                    disabled={votingId === s.id}
                    onClick={() => toggleAttend(s)}
                  >
                    {mine === "yes" ? "참석 취소" : "참석하기"}
                  </OutlineButton>
                </div>
              );
            })
          )}
        </Card>

        <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>빠른 이동</div>
          <Link to="/scenarios"><OutlineButton style={{ width: "100%" }}>🔍 시나리오 찾기</OutlineButton></Link>
          <Link to="/agenda"><OutlineButton style={{ width: "100%" }}>📅 내 일정 전체 보기</OutlineButton></Link>
        </Card>
      </div>

      <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>최근 플레이 기록</div>
        {records === null ? (
          <span style={{ color: "var(--text-sub)", fontSize: 13 }}>불러오는 중…</span>
        ) : records.length === 0 ? (
          <EmptyState>
            아직 기록이 없어요.
            <br />
            <Link to="/records" style={{ textDecoration: "underline" }}>첫 기록 남기러 가기 →</Link>
          </EmptyState>
        ) : (
          <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {records.map((r) => (
              <div key={r.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{r.scenarioName}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-sub)", marginTop: 3 }}>{r.date}</div>
              </div>
            ))}
          </div>
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
