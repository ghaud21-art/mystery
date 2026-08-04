import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  addDoc, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { compat, compatLabel, TYPE_META } from "../lib/personality.js";
import { displayAvatar, displayName } from "../lib/profileDisplay.js";
import { Card, EmptyState, OutlineButton, PageHeader, PrimaryButton } from "../components/ui.jsx";
import MonthCalendar from "../components/MonthCalendar.jsx";

const TABS = [
  { id: "schedules", label: "일정" },
  { id: "availability", label: "가능일" },
  { id: "compat", label: "궁합" },
];

const CATEGORIES = ["머더미스터리", "방탈출", "보드게임", "기타"];
const EMPTY_FORM = { category: CATEGORIES[0], title: "", location: "", datetime: "" };

export default function GroupDetail() {
  const { groupId } = useParams();
  const { profile } = useAuth();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [tab, setTab] = useState("schedules");

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "groups", groupId), (snap) => {
      setGroup(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
    return unsub;
  }, [groupId]);

  useEffect(() => {
    if (!group?.memberIds) return;
    (async () => {
      const docs = await Promise.all(group.memberIds.map((uid) => getDoc(doc(db, "users", uid))));
      setMembers(docs.filter((d) => d.exists()).map((d) => ({ id: d.id, ...d.data() })));
    })();
  }, [group?.memberIds]);

  if (group === null) {
    return <div className="fade-in" style={{ color: "var(--text-sub)", fontSize: 13 }}>불러오는 중…</div>;
  }
  if (!group) {
    return (
      <div className="fade-in">
        <Card><EmptyState>모임을 찾을 수 없어요.</EmptyState></Card>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <Link to="/schedule" style={{ fontSize: 12.5, color: "var(--text-sub)" }}>← 모임 목록</Link>
      <PageHeader
        eyebrow="MEETUP"
        title={group.name}
        action={
          <div style={{ display: "flex", gap: -6 }}>
            {members.map((m) => (
              <div key={m.id} title={displayName(m)} style={{
                width: 32, height: 32, borderRadius: "50%", background: "var(--accent-dim)",
                border: "2px solid var(--bg)", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, marginLeft: -8,
              }}>
                {displayAvatar(m) || "🕵️"}
              </div>
            ))}
          </div>
        }
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid var(--border)" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "8px 4px", marginBottom: -1, background: "none", border: "none",
              borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
              color: tab === t.id ? "var(--accent)" : "var(--text-sub)",
              fontWeight: tab === t.id ? 700 : 500, fontSize: 13.5, marginRight: 16,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "schedules" && <SchedulesTab group={group} profile={profile} />}
      {tab === "availability" && <AvailabilityTab group={group} members={members} profile={profile} />}
      {tab === "compat" && <CompatTab members={members} />}
    </div>
  );
}

function SchedulesTab({ group, profile }) {
  const [items, setItems] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const snap = await getDocs(
      query(collection(db, "schedules"), where("groupId", "==", group.id), orderBy("datetime", "asc"))
    );
    setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  useEffect(() => { load(); }, [group.id]);

  const markedDates = useMemo(() => {
    const set = new Set();
    (items || []).forEach((s) => {
      if (s.attendees?.[profile.id] === "yes" && s.datetime) set.add(s.datetime.slice(0, 10));
    });
    return set;
  }, [items, profile.id]);

  async function createSchedule(e) {
    e.preventDefault();
    await addDoc(collection(db, "schedules"), {
      ...form,
      groupId: group.id,
      hostId: profile.id,
      hostName: displayName(profile),
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
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card>
        <MonthCalendar markedDates={markedDates} />
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-sub)", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
          내가 참석하는 일정
        </div>
      </Card>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <PrimaryButton onClick={() => setShowForm((s) => !s)}>{showForm ? "닫기" : "+ 일정 추가"}</PrimaryButton>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={createSchedule} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {CATEGORIES.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setForm({ ...form, category: c })}
                  style={{
                    padding: "6px 12px", borderRadius: 999, fontSize: 12.5,
                    border: `1.5px solid ${form.category === c ? "var(--accent)" : "var(--border)"}`,
                    background: form.category === c ? "var(--accent-dim)" : "transparent",
                    color: form.category === c ? "var(--accent)" : "var(--text)",
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
            <input required placeholder="이름 (시나리오/테마/게임 등)" value={form.title}
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
        <Card><EmptyState>아직 등록된 일정이 없어요.</EmptyState></Card>
      ) : (
        items.map((s) => {
          const yesCount = Object.values(s.attendees || {}).filter((v) => v === "yes").length;
          const mine = s.attendees?.[profile.id];
          return (
            <Card key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div>
                {s.category && (
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--accent)", background: "var(--accent-dim)", padding: "2px 8px", borderRadius: 999 }}>
                    {s.category}
                  </span>
                )}
                <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>{s.title}</div>
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
        })
      )}
    </div>
  );
}

function AvailabilityTab({ group, members, profile }) {
  const myDates = useMemo(() => new Set(group.availability?.[profile.id]?.dates || []), [group.availability, profile.id]);
  const [selected, setSelected] = useState(myDates);
  const [saving, setSaving] = useState(false);

  useEffect(() => setSelected(myDates), [myDates]);

  function toggle(dateKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(dateKey) ? next.delete(dateKey) : next.add(dateKey);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    const nextAvailability = {
      ...(group.availability || {}),
      [profile.id]: { dates: Array.from(selected) },
    };
    await updateDoc(doc(db, "groups", group.id), { availability: nextAvailability });
    setSaving(false);
  }

  const candidates = useMemo(() => {
    const counts = {};
    Object.values(group.availability || {}).forEach(({ dates }) => {
      (dates || []).forEach((d) => { counts[d] = (counts[d] || 0) + 1; });
    });
    return Object.entries(counts)
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5);
  }, [group.availability]);

  const totalMembers = members.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>내가 가능한 날짜를 선택하세요</div>
        <MonthCalendar markedDates={selected} onSelectDate={toggle} />
        <PrimaryButton style={{ marginTop: 14, width: "100%" }} onClick={save} disabled={saving}>
          {saving ? "저장 중…" : "가능일 저장"}
        </PrimaryButton>
      </Card>

      <Card>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>추천 후보 날짜</div>
        {candidates.length === 0 ? (
          <EmptyState>멤버 2명 이상이 겹치는 날짜가 아직 없어요.</EmptyState>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {candidates.map(([date, count]) => (
              <div key={date} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 8, background: "var(--bg-sub)" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{formatDateOnly(date)}</span>
                <span style={{ fontSize: 12, color: count === totalMembers ? "var(--success)" : "var(--text-sub)" }}>
                  {count}/{totalMembers}명 가능{count === totalMembers ? " · 전원 가능! 🎉" : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function CompatTab({ members }) {
  const pairs = useMemo(() => {
    const list = [];
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i], b = members[j];
        if (!a.style || !b.style) continue;
        list.push({ a, b, score: compat(a.style, b.style) });
      }
    }
    return list.sort((x, y) => y.score - x.score);
  }, [members]);

  const avg = pairs.length ? Math.round(pairs.reduce((s, p) => s + p.score, 0) / pairs.length) : null;
  const missing = members.filter((m) => !m.style);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {avg !== null && (
        <Card style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "var(--text-sub)", marginBottom: 4 }}>모임 평균 궁합</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "var(--accent)" }}>{avg}</div>
        </Card>
      )}

      {missing.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--text-sub)" }}>
          성향 테스트 전인 멤버: {missing.map((m) => displayName(m)).join(", ")}
        </div>
      )}

      {pairs.length === 0 ? (
        <Card><EmptyState>궁합을 보려면 멤버들이 먼저 성향 테스트를 완료해야 해요.</EmptyState></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pairs.map(({ a, b, score }) => {
            const label = compatLabel(score);
            return (
              <Card key={`${a.id}-${b.id}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span>{displayAvatar(a) || TYPE_META[a.style].icon} {displayName(a)}</span>
                  <span style={{ color: "var(--text-sub)" }}>×</span>
                  <span>{displayAvatar(b) || TYPE_META[b.style].icon} {displayName(b)}</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ font: "700 18px ui-monospace,monospace", color: "var(--accent)" }}>{score}</div>
                  <div style={{ fontSize: 11, color: "var(--text-sub)" }}>{label.label}</div>
                </div>
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

function formatDateOnly(key) {
  const d = new Date(key + "T00:00:00");
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
}

const inputStyle = {
  padding: "10px 14px", borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 13,
};
