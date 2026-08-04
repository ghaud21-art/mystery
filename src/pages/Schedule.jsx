import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { addDoc, collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, where } from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { displayAvatar, displayName } from "../lib/profileDisplay.js";
import { Card, EmptyState, PageHeader, PrimaryButton } from "../components/ui.jsx";

export default function Schedule() {
  const { profile } = useAuth();
  const [groups, setGroups] = useState(null);
  const [friends, setFriends] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [memberIds, setMemberIds] = useState([]);

  async function loadGroups() {
    const snap = await getDocs(query(collection(db, "groups"), where("memberIds", "array-contains", profile.id)));
    setGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  useEffect(() => {
    if (!profile?.id) return;
    loadGroups();
    (async () => {
      if (!profile?.friends?.length) return;
      const docs = await Promise.all(profile.friends.map((uid) => getDoc(doc(db, "users", uid))));
      setFriends(docs.filter((d) => d.exists()).map((d) => ({ id: d.id, ...d.data() })));
    })();
  }, [profile?.id, profile?.friends]);

  function toggleMember(uid) {
    setMemberIds((ids) => (ids.includes(uid) ? ids.filter((x) => x !== uid) : [...ids, uid]));
  }

  async function createGroup(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await addDoc(collection(db, "groups"), {
      name: name.trim(),
      memberIds: [profile.id, ...memberIds],
      hostId: profile.id,
      hostName: displayName(profile),
      availability: {},
      createdAt: serverTimestamp(),
    });
    setName("");
    setMemberIds([]);
    setShowForm(false);
    loadGroups();
  }

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="MEETUPS"
        title="모임"
        action={<PrimaryButton onClick={() => setShowForm((s) => !s)}>{showForm ? "닫기" : "+ 모임 만들기"}</PrimaryButton>}
      />

      {showForm && (
        <Card style={{ marginBottom: 20 }}>
          <form onSubmit={createGroup} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              required
              placeholder="모임 이름 (예: 홍대 탐정단)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-sub)", display: "block", marginBottom: 6 }}>
                멤버 선택 (친구 중에서)
              </label>
              {friends.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-sub)" }}>
                  먼저 <Link to="/friends" style={{ textDecoration: "underline" }}>친구를 추가</Link>해주세요.
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {friends.map((f) => (
                    <button
                      type="button"
                      key={f.id}
                      onClick={() => toggleMember(f.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, fontSize: 12.5,
                        border: `1.5px solid ${memberIds.includes(f.id) ? "var(--accent)" : "var(--border)"}`,
                        background: memberIds.includes(f.id) ? "var(--accent-dim)" : "transparent",
                        color: memberIds.includes(f.id) ? "var(--accent)" : "var(--text)",
                      }}
                    >
                      {displayAvatar(f) || "🕵️"} {displayName(f)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <PrimaryButton type="submit">모임 만들기</PrimaryButton>
          </form>
        </Card>
      )}

      {groups === null ? (
        <span style={{ color: "var(--text-sub)", fontSize: 13 }}>불러오는 중…</span>
      ) : groups.length === 0 ? (
        <Card><EmptyState>아직 모임이 없어요. 친구들과 새 모임을 만들어보세요.</EmptyState></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {groups.map((g) => (
            <Link key={g.id} to={`/schedule/${g.id}`}>
              <Card style={{ display: "flex", flexDirection: "column", gap: 8, cursor: "pointer" }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{g.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-sub)" }}>멤버 {g.memberIds.length}명</div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  padding: "10px 14px", borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 13,
};
