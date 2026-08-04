import { useEffect, useState } from "react";
import { addDoc, collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { Card, EmptyState, OutlineButton, PageHeader, PrimaryButton } from "../components/ui.jsx";

const EMPTY_FORM = { title: "", location: "", datetime: "" };

export default function Schedule() {
  const { profile } = useAuth();
  const [items, setItems] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const snap = await getDocs(query(collection(db, "schedules"), orderBy("datetime", "asc")));
    setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  useEffect(() => {
    load();
  }, []);

  async function createSchedule(e) {
    e.preventDefault();
    await addDoc(collection(db, "schedules"), {
      ...form,
      hostId: profile.id,
      hostName: profile.name,
      attendees: { [profile.id]: "yes" },
      createdAt: serverTimestamp(),
    });
    setForm(EMPTY_FORM);
    setShowForm(false);
    load();
  }

  async function vote(scheduleId, current) {
    const next = current === "yes" ? "no" : "yes";
    await updateDoc(doc(db, "schedules", scheduleId), { [`attendees.${profile.id}`]: next });
    load();
  }

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="MEETUPS"
        title="일정 · 모집"
        action={<PrimaryButton onClick={() => setShowForm((s) => !s)}>{showForm ? "닫기" : "+ 모임 만들기"}</PrimaryButton>}
      />

      {showForm && (
        <Card style={{ marginBottom: 20 }}>
          <form onSubmit={createSchedule} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input required placeholder="시나리오/모임 이름" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} style={inputStyle} />
            <input required placeholder="장소" value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })} style={inputStyle} />
            <input required type="datetime-local" value={form.datetime}
              onChange={(e) => setForm({ ...form, datetime: e.target.value })} style={inputStyle} />
            <PrimaryButton type="submit">등록하기</PrimaryButton>
          </form>
        </Card>
      )}

      {items === null ? (
        <span style={{ color: "var(--text-sub)", fontSize: 13 }}>불러오는 중…</span>
      ) : items.length === 0 ? (
        <Card><EmptyState>아직 등록된 일정이 없어요. 첫 모임을 만들어보세요.</EmptyState></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {items.map((s) => {
            const yesCount = Object.values(s.attendees || {}).filter((v) => v === "yes").length;
            const mine = s.attendees?.[profile.id];
            return (
              <Card key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{s.title}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-sub)", marginTop: 4 }}>
                    {formatDate(s.datetime)} · {s.location} · 주최 {s.hostName}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-sub)", marginTop: 2 }}>참석 {yesCount}명</div>
                </div>
                <OutlineButton onClick={() => vote(s.id, mine)}>
                  {mine === "yes" ? "참석 취소" : "참석하기"}
                </OutlineButton>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
}

const inputStyle = {
  padding: "10px 14px", borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 13,
};
