import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { compatLabel, compatWithReason, TYPE_META } from "../lib/personality.js";
import { displayAvatar, displayName } from "../lib/profileDisplay.js";
import { expandDateRange } from "../lib/dateUtils.js";
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
const EMPTY_FORM = { category: CATEGORIES[0], title: "", location: "", datetime: "", endDatetime: "", negotiating: false };

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
  const [scenarios, setScenarios] = useState([]);
  const [showTitleSuggestions, setShowTitleSuggestions] = useState(false);

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

  useEffect(() => {
    (async () => {
      const snap = await getDocs(query(collection(db, "scenarios"), where("status", "==", "approved")));
      setScenarios(snap.docs.map((d) => d.data()));
    })();
  }, []);

  const titleSuggestions = (() => {
    if (form.category !== "머더미스터리") return [];
    const q = form.title.trim().toLowerCase();
    if (!q) return [];
    return scenarios.filter((sc) => sc.title.toLowerCase().includes(q)).slice(0, 6);
  })();

  const markedDates = useMemo(() => {
    const set = new Set();
    (items || []).forEach((s) => {
      if (s.attendees?.[profile.id] === "yes" && s.datetime) {
        expandDateRange(s.datetime, s.endDatetime).forEach((k) => set.add(k));
      }
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
      datetime: s.datetime || "", endDatetime: s.endDatetime || "",
      negotiating: (s.status || "confirmed") === "negotiating",
    });
    setShowForm(true);
  }

  function confirmWithDate(schedule, dateKey) {
    setEditingId(schedule.id);
    setForm({
      category: schedule.category || CATEGORIES[0], title: schedule.title, location: schedule.location,
      datetime: `${dateKey}T19:00`, endDatetime: "", negotiating: false,
    });
    setShowForm(true);
    setCandidatesFor(null);
  }

  async function submitForm(e) {
    e.preventDefault();
    const payload = {
      category: form.category,
      title: form.title,
      location: form.location,
      datetime: form.negotiating ? "" : form.datetime,
      endDatetime: form.negotiating ? "" : form.endDatetime,
      status: form.negotiating ? "negotiating" : "confirmed",
    };
    if (editingId) {
      await updateDoc(doc(db, "schedules", editingId), payload);
    } else {
      await addDoc(collection(db, "schedules"), {
        ...payload,
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
            <div style={{ position: "relative" }}>
              <input
                required
                placeholder={form.category === "머더미스터리" ? "이름 (입력하면 시나리오 목록에서 찾아드려요)" : "이름 (테마/게임 등)"}
                value={form.title}
                onChange={(e) => { setForm({ ...form, title: e.target.value }); setShowTitleSuggestions(true); }}
                onFocus={() => setShowTitleSuggestions(true)}
                onBlur={() => setTimeout(() => setShowTitleSuggestions(false), 150)}
                style={inputStyle}
              />
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
                      onMouseDown={() => { setForm({ ...form, title: sc.title }); setShowTitleSuggestions(false); }}
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
            <input required placeholder="장소" value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })} style={inputStyle} />

            <label style={{
              display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-sub)",
              padding: "10px 12px", borderRadius: 8, background: "var(--bg-sub)",
            }}>
              <input
                type="checkbox"
                checked={form.negotiating}
                onChange={(e) => setForm({ ...form, negotiating: e.target.checked, datetime: "", endDatetime: "" })}
              />
              일정 협의로 등록 (날짜는 나중에 정해요) — 사람들 참여 의향과 가능일을 모아서 확정할 수 있어요
            </label>

            {!form.negotiating && (
              <>
                <Fld label="시작 시각">
                  <input required type="datetime-local" value={form.datetime}
                    onChange={(e) => setForm({ ...form, datetime: e.target.value })} style={inputStyle} />
                </Fld>
                <Fld label="종료 시각 (1박2일 등 여러 날 일정이면 입력, 선택)">
                  <input type="datetime-local" value={form.endDatetime} min={form.datetime}
                    onChange={(e) => setForm({ ...form, endDatetime: e.target.value })} style={inputStyle} />
                </Fld>
              </>
            )}
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
          const isNegotiating = (s.status || "confirmed") === "negotiating";
          const yesCount = Object.values(s.attendees || {}).filter((v) => v === "yes").length;
          const mine = s.attendees?.[profile.id];
          const isHost = s.hostId === profile.id;
          const candidatesOpen = isNegotiating || candidatesFor === s.id;
          const { candidates, total } = candidatesOpen ? attendeeCandidates(s) : { candidates: [], total: 0 };
          return (
            <Card key={s.id} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div>
                  {isNegotiating ? (
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-sub)", background: "var(--bg-sub)", padding: "2px 8px", borderRadius: 999 }}>
                      📋 일정 협의 중
                    </span>
                  ) : s.category && (
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--accent)", background: "var(--accent-dim)", padding: "2px 8px", borderRadius: 999 }}>
                      {s.category}
                    </span>
                  )}
                  <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>{s.title}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-sub)", marginTop: 4 }}>
                    {isNegotiating
                      ? `날짜 미정 · ${s.location} · 주최 ${s.hostName}`
                      : `${formatDate(s.datetime)}${s.endDatetime ? ` ~ ${formatDate(s.endDatetime)}` : ""} · ${s.location} · 주최 ${s.hostName}`}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-sub)", marginTop: 2 }}>
                    {isNegotiating ? "참여 의향" : "참석"} {yesCount}명
                  </div>
                  {yesCount > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                      {Object.entries(s.attendees || {})
                        .filter(([, v]) => v === "yes")
                        .map(([uid]) => {
                          const m = members.find((mm) => mm.id === uid);
                          return (
                            <span key={uid} style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 999,
                              background: "var(--bg-sub)", color: "var(--text-sub)", whiteSpace: "nowrap",
                            }}>
                              {m ? displayName(m) : "탈퇴한 유저"}
                            </span>
                          );
                        })}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <OutlineButton onClick={() => vote(s, mine)}>
                    {mine === "yes" ? (isNegotiating ? "의향 취소" : "참석 취소") : (isNegotiating ? "참여 의향 있어요" : "참석하기")}
                  </OutlineButton>
                  <OutlineButton style={{ height: 44, padding: "0 14px" }} onClick={() => startEdit(s)}>
                    {isNegotiating ? "날짜 확정/수정" : "수정"}
                  </OutlineButton>
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

              {(isNegotiating || yesCount >= 2) && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  {!isNegotiating && (
                    <button
                      type="button"
                      onClick={() => setCandidatesFor(candidatesFor === s.id ? null : s.id)}
                      style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", padding: 0 }}
                    >
                      {candidatesFor === s.id ? "참석자 날짜 후보 접기 ▲" : "참석자 기준 날짜 후보 보기 ▼"}
                    </button>
                  )}
                  {isNegotiating && (
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-sub)", marginBottom: 6 }}>
                      참여 의향을 표시한 사람들의 날짜 후보
                    </div>
                  )}
                  {candidatesOpen && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: isNegotiating ? 0 : 8 }}>
                      {candidates.length === 0 ? (
                        <div style={{ fontSize: 12, color: "var(--text-sub)" }}>
                          참여 의향을 표시한 사람들이 아직 &ldquo;가능일&rdquo;을 설정하지 않았어요.
                        </div>
                      ) : (
                        candidates.map(([date, count]) => (
                          <div key={date} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 8, background: "var(--bg-sub)", flexWrap: "wrap", gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{formatDateOnly(date)}</span>
                            <span style={{ fontSize: 12, color: count === total ? "var(--success)" : "var(--text-sub)" }}>
                              {count}/{total}명 가능{count === total ? " · 전원 가능! 🎉" : ""}
                            </span>
                            {isNegotiating && (
                              <OutlineButton style={{ height: 28, padding: "0 10px", fontSize: 11.5, flex: "none" }} onClick={() => confirmWithDate(s, date)}>
                                이 날짜로 확정
                              </OutlineButton>
                            )}
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
  const [openPair, setOpenPair] = useState(null);

  const pairs = useMemo(() => {
    const list = [];
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i], b = members[j];
        if (!a.style || !b.style) continue;
        list.push({ a, b, ...compatWithReason(a, b) });
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
          {pairs.map(({ a, b, score, base, bonus, reasons }) => {
            const label = compatLabel(score);
            const pairKey = `${a.id}-${b.id}`;
            const open = openPair === pairKey;
            return (
              <Card key={pairKey} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setOpenPair(open ? null : pairKey)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", padding: 0, width: "100%" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <span>{displayAvatar(a) || TYPE_META[a.style].icon} {displayName(a)}</span>
                    <span style={{ color: "var(--text-sub)" }}>×</span>
                    <span>{displayAvatar(b) || TYPE_META[b.style].icon} {displayName(b)}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ font: "700 18px ui-monospace,monospace", color: "var(--accent)" }}>{score}</div>
                    <div style={{ fontSize: 11, color: "var(--text-sub)" }}>
                      {label.label}{bonus > 0 && ` (기본 ${base} +${bonus})`}
                    </div>
                  </div>
                </button>
                {open && (
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                    <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>
                      {displayName(a)} · 💪 {TYPE_META[a.style].strength} / ⚠️ {TYPE_META[a.style].weakness}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>
                      {displayName(b)} · 💪 {TYPE_META[b.style].strength} / ⚠️ {TYPE_META[b.style].weakness}
                    </div>
                    {reasons.map((r, i) => (
                      <div key={i} style={{ fontSize: 11.5, color: "var(--success)" }}>✓ {r}</div>
                    ))}
                  </div>
                )}
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
        return playedSets.every((set) => !set.has(key));
      })
      .sort((a, b) => a.title.localeCompare(b.title, "ko"));
    setResults(unplayed);
    setLoading(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 13, color: "var(--text-sub)" }}>
          이 모임 멤버({members.map((m) => displayName(m)).join(", ")}) 전원이 아직 안 해본
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
