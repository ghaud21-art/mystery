import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { compat, compatLabel, TYPE_META } from "../lib/personality.js";
import { displayAvatar, displayName } from "../lib/profileDisplay.js";
import { Card, EmptyState, OutlineButton, PageHeader, PrimaryButton, ScrollBox } from "../components/ui.jsx";
import MonthCalendar from "../components/MonthCalendar.jsx";
import Avatar from "../components/Avatar.jsx";

const TABS = [
  { id: "schedules", label: "일정" },
  { id: "availability", label: "가능일" },
  { id: "compat", label: "궁합" },
  { id: "unplayed", label: "같이 안한 머미" },
];

const CATEGORIES = ["머더미스터리", "방탈출", "보드게임", "기타"];
const EMPTY_FORM = { category: CATEGORIES[0], title: "", location: "", datetime: "", endDatetime: "" };

export default function GroupDetail() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [tab, setTab] = useState("schedules");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [friends, setFriends] = useState([]);

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

  useEffect(() => {
    (async () => {
      if (!profile?.friends?.length) return;
      const docs = await Promise.all(profile.friends.map((uid) => getDoc(doc(db, "users", uid))));
      setFriends(docs.filter((d) => d.exists()).map((d) => ({ id: d.id, ...d.data() })));
    })();
  }, [profile?.friends]);

  async function addMember(uid) {
    await updateDoc(doc(db, "groups", groupId), { memberIds: [...group.memberIds, uid] });
  }

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

  async function saveName() {
    const name = nameDraft.trim();
    if (!name) return;
    await updateDoc(doc(db, "groups", group.id), { name });
    setEditingName(false);
  }

  async function deleteGroup() {
    if (!window.confirm(`"${group.name}" 모임을 삭제할까요? 모임 안의 모든 일정도 함께 삭제돼요.`)) return;
    const schedSnap = await getDocs(query(collection(db, "schedules"), where("groupId", "==", group.id)));
    await Promise.all(schedSnap.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(doc(db, "groups", group.id));
    navigate("/schedule");
  }

  return (
    <div className="fade-in">
      <Link to="/schedule" style={{ fontSize: 12.5, color: "var(--text-sub)" }}>← 모임 목록</Link>

      {!editingName ? (
        <PageHeader
          eyebrow="MEETUP"
          title={group.name}
          action={
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", maxWidth: "100%" }}>
              <div style={{ display: "flex" }}>
                {members.slice(0, 6).map((m) => (
                  <div key={m.id} title={displayName(m)} style={{ marginLeft: -8 }}>
                    <Avatar profile={m} size={32} style={{ fontSize: 14, border: "2px solid var(--bg)" }} />
                  </div>
                ))}
                {members.length > 6 && (
                  <div style={{
                    marginLeft: -8, width: 32, height: 32, borderRadius: "50%", background: "var(--bg-sub)",
                    border: "2px solid var(--bg)", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, color: "var(--text-sub)", flex: "none",
                  }}>
                    +{members.length - 6}
                  </div>
                )}
              </div>
              <OutlineButton
                style={{ height: 32, padding: "0 12px", fontSize: 12, whiteSpace: "nowrap" }}
                onClick={() => { setNameDraft(group.name); setEditingName(true); }}
              >
                편집
              </OutlineButton>
            </div>
          }
        />
      ) : (
        <Card style={{ margin: "16px 0 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              style={{ ...inputStyle, flex: "1 1 160px", fontSize: 16, fontWeight: 700 }}
              autoFocus
            />
            <PrimaryButton style={{ height: 40 }} onClick={saveName}>이름 저장</PrimaryButton>
            <OutlineButton style={{ height: 40 }} onClick={() => setEditingName(false)}>닫기</OutlineButton>
            <OutlineButton style={{ height: 40, borderColor: "var(--danger)", color: "var(--danger)" }} onClick={deleteGroup}>
              모임 삭제
            </OutlineButton>
          </div>

          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-sub)", marginBottom: 8 }}>멤버 추가</div>
            {friends.filter((f) => !group.memberIds.includes(f.id)).length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-sub)" }}>추가할 수 있는 친구가 없어요 (이미 전부 모임에 있거나, 친구가 없어요).</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {friends.filter((f) => !group.memberIds.includes(f.id)).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => addMember(f.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, fontSize: 12.5,
                      border: "1.5px solid var(--border)", background: "transparent", color: "var(--text)",
                    }}
                  >
                    + {displayAvatar(f) || "🕵️"} {displayName(f)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      <AnnouncementBanner group={group} profile={profile} />

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

      {tab === "schedules" && <SchedulesTab group={group} profile={profile} members={members} />}
      {tab === "availability" && <AvailabilityTab members={members} profile={profile} />}
      {tab === "compat" && <CompatTab members={members} />}
      {tab === "unplayed" && <UnplayedTab members={members} />}
    </div>
  );
}

export function AnnouncementBanner({ group, profile }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.announcement?.text || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const text = draft.trim();
    await updateDoc(doc(db, "groups", group.id), {
      announcement: text
        ? { text, authorName: displayName(profile), updatedAt: new Date().toISOString() }
        : null,
    });
    setSaving(false);
    setEditing(false);
  }

  if (!editing && !group.announcement) {
    return (
      <button
        onClick={() => { setDraft(""); setEditing(true); }}
        style={{
          width: "100%", textAlign: "left", marginBottom: 20, padding: "12px 16px", borderRadius: 10,
          border: "1.5px dashed var(--border)", background: "transparent", color: "var(--text-sub)", fontSize: 12.5,
        }}
      >
        📢 모임 공지사항을 등록해보세요 (모임원 누구나 가능)
      </button>
    );
  }

  return (
    <div style={{
      marginBottom: 20, padding: "14px 18px", borderRadius: 12,
      background: "linear-gradient(135deg, var(--accent-dim), transparent)", border: "1.5px solid var(--accent)",
    }}>
      {!editing ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--accent)", letterSpacing: 1 }}>📢 공지사항</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4, whiteSpace: "pre-wrap" }}>{group.announcement.text}</div>
            <div style={{ fontSize: 11, color: "var(--text-sub)", marginTop: 6 }}>{group.announcement.authorName}</div>
          </div>
          <OutlineButton style={{ height: 30, padding: "0 12px", fontSize: 11.5, flex: "none" }} onClick={() => { setDraft(group.announcement.text); setEditing(true); }}>
            수정
          </OutlineButton>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea
            autoFocus
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="모임원들에게 알릴 내용을 적어주세요 (비우고 저장하면 공지가 사라져요)"
            style={{ ...inputStyle, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <OutlineButton style={{ height: 32, padding: "0 12px", fontSize: 12 }} onClick={() => setEditing(false)}>취소</OutlineButton>
            <PrimaryButton style={{ height: 32, padding: "0 14px", fontSize: 12 }} disabled={saving} onClick={save}>
              {saving ? "저장 중…" : "저장"}
            </PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}

function SchedulesTab({ group, profile, members }) {
  const { setProfile } = useAuth();
  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [candidatesFor, setCandidatesFor] = useState(null);

  async function load() {
    try {
      setLoadError("");
      const snap = await getDocs(
        query(collection(db, "schedules"), where("groupId", "==", group.id), orderBy("datetime", "asc"))
      );
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
      setLoadError("일정을 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
      setItems([]);
    }
  }

  useEffect(() => { load(); }, [group.id]);

  const markedDates = useMemo(() => {
    const set = new Set();
    (items || []).forEach((s) => {
      if (s.attendees?.[profile.id] === "yes" && s.datetime) set.add(s.datetime.slice(0, 10));
    });
    return set;
  }, [items, profile.id]);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function startEdit(s) {
    setEditingId(s.id);
    setForm({
      category: s.category || CATEGORIES[0], title: s.title, location: s.location,
      datetime: s.datetime, endDatetime: s.endDatetime || "",
    });
    setShowForm(true);
  }

  async function submitForm(e) {
    e.preventDefault();
    if (editingId) {
      await updateDoc(doc(db, "schedules", editingId), { ...form });
    } else {
      await addDoc(collection(db, "schedules"), {
        ...form,
        groupId: group.id,
        hostId: profile.id,
        hostName: displayName(profile),
        attendees: { [profile.id]: "yes" },
        createdAt: serverTimestamp(),
      });
    }
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    load();
  }

  async function removeSchedule(id) {
    if (!window.confirm("이 일정을 삭제할까요?")) return;
    await deleteDoc(doc(db, "schedules", id));
    load();
  }

  async function vote(schedule, currentStatus) {
    const next = currentStatus === "yes" ? "no" : "yes";
    await updateDoc(doc(db, "schedules", schedule.id), { [`attendees.${profile.id}`]: next });

    // 참석하기로 하면, 겹치는 날짜를 "가능일"에서 자동으로 빼서 다른 모임 후보에 안 잡히게 함
    if (next === "yes" && schedule.datetime) {
      const dateKey = schedule.datetime.slice(0, 10);
      const availableDates = profile.availableDates || [];
      if (availableDates.includes(dateKey)) {
        const nextDates = availableDates.filter((d) => d !== dateKey);
        await updateDoc(doc(db, "users", profile.id), { availableDates: nextDates });
        setProfile((p) => ({ ...p, availableDates: nextDates }));
      }
    }
    load();
  }

  function attendeeCandidates(schedule) {
    const attendeeIds = Object.entries(schedule.attendees || {})
      .filter(([, v]) => v === "yes")
      .map(([uid]) => uid);
    const attendeeMembers = members.filter((m) => attendeeIds.includes(m.id));
    const counts = {};
    attendeeMembers.forEach((m) => {
      (m.availableDates || []).forEach((d) => { counts[d] = (counts[d] || 0) + 1; });
    });
    const candidates = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5);
    return { candidates, total: attendeeMembers.length };
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card>
        <MonthCalendar markedDates={markedDates} />
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-sub)", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
          내가 참석하는 일정
        </div>
      </Card>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <PrimaryButton onClick={() => (showForm ? setShowForm(false) : startCreate())}>
          {showForm ? "닫기" : "+ 일정 추가"}
        </PrimaryButton>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={submitForm} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
            <Fld label="시작 시각">
              <input required type="datetime-local" value={form.datetime}
                onChange={(e) => setForm({ ...form, datetime: e.target.value })} style={inputStyle} />
            </Fld>
            <Fld label="종료 시각 (1박2일 등 여러 날 일정이면 입력, 선택)">
              <input type="datetime-local" value={form.endDatetime} min={form.datetime}
                onChange={(e) => setForm({ ...form, endDatetime: e.target.value })} style={inputStyle} />
            </Fld>
            <PrimaryButton type="submit">{editingId ? "수정 저장" : "등록하기"}</PrimaryButton>
          </form>
        </Card>
      )}

      {loadError && (
        <div style={{ fontSize: 12.5, color: "var(--danger)" }}>{loadError}</div>
      )}
      {items === null ? (
        <span style={{ color: "var(--text-sub)", fontSize: 13 }}>불러오는 중…</span>
      ) : items.length === 0 ? (
        <Card><EmptyState>아직 등록된 일정이 없어요.</EmptyState></Card>
      ) : (
      <ScrollBox maxHeight={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {items.map((s) => {
          const yesCount = Object.values(s.attendees || {}).filter((v) => v === "yes").length;
          const mine = s.attendees?.[profile.id];
          const isHost = s.hostId === profile.id;
          const candidatesOpen = candidatesFor === s.id;
          const { candidates, total } = candidatesOpen ? attendeeCandidates(s) : { candidates: [], total: 0 };
          return (
            <Card key={s.id} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div>
                  {s.category && (
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--accent)", background: "var(--accent-dim)", padding: "2px 8px", borderRadius: 999 }}>
                      {s.category}
                    </span>
                  )}
                  <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>{s.title}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-sub)", marginTop: 4 }}>
                    {formatDate(s.datetime)}{s.endDatetime && ` ~ ${formatDate(s.endDatetime)}`} · {s.location} · 주최 {s.hostName}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-sub)", marginTop: 2 }}>참석 {yesCount}명</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <OutlineButton onClick={() => vote(s, mine)}>
                    {mine === "yes" ? "참석 취소" : "참석하기"}
                  </OutlineButton>
                  <OutlineButton style={{ height: 44, padding: "0 14px" }} onClick={() => startEdit(s)}>수정</OutlineButton>
                  {isHost && (
                    <OutlineButton
                      style={{ height: 44, padding: "0 14px", borderColor: "var(--danger)", color: "var(--danger)" }}
                      onClick={() => removeSchedule(s.id)}
                    >
                      삭제
                    </OutlineButton>
                  )}
                </div>
              </div>

              {yesCount >= 2 && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => setCandidatesFor(candidatesOpen ? null : s.id)}
                    style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", padding: 0 }}
                  >
                    {candidatesOpen ? "참석자 날짜 후보 접기 ▲" : "참석자 기준 날짜 후보 보기 ▼"}
                  </button>
                  {candidatesOpen && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                      {candidates.length === 0 ? (
                        <div style={{ fontSize: 12, color: "var(--text-sub)" }}>
                          참석자들이 아직 &ldquo;가능일&rdquo;을 설정하지 않았어요.
                        </div>
                      ) : (
                        candidates.map(([date, count]) => (
                          <div key={date} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 8, background: "var(--bg-sub)" }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{formatDateOnly(date)}</span>
                            <span style={{ fontSize: 12, color: count === total ? "var(--success)" : "var(--text-sub)" }}>
                              참석자 {count}/{total}명 가능{count === total ? " · 전원 가능! 🎉" : ""}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
        </div>
      </ScrollBox>
      )}
    </div>
  );
}

function AvailabilityTab({ members, profile }) {
  const { setProfile } = useAuth();
  const myDates = useMemo(() => new Set(profile.availableDates || []), [profile.availableDates]);
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
    const dates = Array.from(selected);
    await updateDoc(doc(db, "users", profile.id), { availableDates: dates });
    setProfile((p) => ({ ...p, availableDates: dates }));
    setSaving(false);
  }

  const candidates = useMemo(() => {
    const counts = {};
    members.forEach((m) => {
      (m.availableDates || []).forEach((d) => { counts[d] = (counts[d] || 0) + 1; });
    });
    return Object.entries(counts)
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5);
  }, [members]);

  const totalMembers = members.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>내가 가능한 날짜를 선택하세요</div>
        <div style={{ fontSize: 11.5, color: "var(--text-sub)", marginBottom: 10 }}>
          한 번 설정하면 내가 속한 모든 모임에 공통으로 적용돼요. 참석하기로 한 일정은 자동으로 빠져요.
        </div>
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

function UnplayedTab({ members }) {
  const [scenarios, setScenarios] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(query(collection(db, "scenarios"), where("status", "==", "approved")));
      setScenarios(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    })();
  }, []);

  async function findUnplayed() {
    setLoading(true);
    const playedSets = await Promise.all(
      members.map(async (m) => {
        const snap = await getDocs(query(collection(db, "records"), where("userId", "==", m.id)));
        return new Set(snap.docs.map((d) => (d.data().scenarioName || "").trim().toLowerCase()));
      })
    );
    const unplayed = scenarios
      .filter((s) => {
        const key = s.title.trim().toLowerCase();
        return playedSets.some((set) => !set.has(key));
      })
      .sort((a, b) => a.title.localeCompare(b.title, "ko"));
    setResults(unplayed);
    setLoading(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 13, color: "var(--text-sub)" }}>
          이 모임 멤버({members.map((m) => displayName(m)).join(", ")}) 중 한 명이라도 안 해본
          시나리오를 우리 DB에서 찾아드려요.
        </div>
        <PrimaryButton onClick={findUnplayed} disabled={loading || !scenarios}>
          {loading ? "찾는 중…" : "같이 안 한 머미 찾기"}
        </PrimaryButton>
      </Card>

      {results !== null && (
        results.length === 0 ? (
          <Card><EmptyState>이 모임은 우리 DB에 있는 시나리오를 전부 해봤어요! 🎉</EmptyState></Card>
        ) : (
          <>
            <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>총 {results.length}개 (가나다순)</div>
            <ScrollBox maxHeight={480}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {results.map((s) => (
                  <Card key={s.id} style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.title}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>
                        {[s.publisher, s.playerCount, s.duration].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <Link to="/records" state={{ scenarioName: s.title }}>
                      <OutlineButton style={{ height: 32, padding: "0 12px", fontSize: 12 }}>+ 기록에 추가</OutlineButton>
                    </Link>
                  </Card>
                ))}
              </div>
            </ScrollBox>
          </>
        )
      )}
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function formatDateOnly(key) {
  const d = new Date(key + "T00:00:00");
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
}

function Fld({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-sub)", display: "block", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  padding: "10px 14px", borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 13, width: "100%",
};
