import { useEffect, useState } from "react";
import { arrayUnion, collection, doc, getDoc, getDocs, query, updateDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { compat, compatLabel } from "../lib/personality.js";
import { displayName } from "../lib/profileDisplay.js";
import Avatar from "../components/Avatar.jsx";
import { Card, EmptyState, PageHeader } from "../components/ui.jsx";

export default function Friends() {
  const { profile, setProfile } = useAuth();
  const [friends, setFriends] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    (async () => {
      if (!profile?.friends?.length) {
        setFriends([]);
        return;
      }
      const docs = await Promise.all(profile.friends.map((uid) => getDoc(doc(db, "users", uid))));
      setFriends(docs.filter((d) => d.exists()).map((d) => ({ id: d.id, ...d.data() })));
    })();
  }, [profile?.friends]);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(query(collection(db, "users")));
      setAllUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    })();
  }, []);

  const suggestions = (() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return [];
    return allUsers
      .filter((u) => u.id !== profile?.id && !(profile?.friends || []).includes(u.id))
      .filter((u) => (u.nickname || u.name || "").toLowerCase().includes(q))
      .slice(0, 6);
  })();

  async function addFriend(target) {
    setStatus("");
    await updateDoc(doc(db, "users", profile.id), { friends: arrayUnion(target.id) });
    setProfile((p) => ({ ...p, friends: [...(p.friends || []), target.id] }));
    setSearchTerm("");
    setShowSuggestions(false);
    setStatus(`${displayName(target)}님을 친구로 추가했어요.`);
  }

  return (
    <div className="fade-in">
      <PageHeader title="친구 &amp; 궁합" />

      <Card style={{ marginBottom: 20 }}>
        <div style={{ position: "relative" }}>
          <input
            placeholder="닉네임으로 친구 검색"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 8,
              border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13,
            }}
          />
          {showSuggestions && searchTerm.trim() && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 10,
              background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,.15)", overflow: "hidden",
            }}>
              {suggestions.length === 0 ? (
                <div style={{ padding: "10px 14px", fontSize: 12.5, color: "var(--text-sub)" }}>
                  일치하는 닉네임의 탐정이 없어요.
                </div>
              ) : (
                suggestions.map((u) => (
                  <button
                    type="button"
                    key={u.id}
                    onMouseDown={() => addFriend(u)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                      padding: "9px 14px", background: "none", border: "none", borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <Avatar profile={u} size={28} style={{ fontSize: 13 }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{displayName(u)}</span>
                    {u.style && <span style={{ fontSize: 11, color: "var(--text-sub)" }}>{u.style}</span>}
                    <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--accent)", whiteSpace: "nowrap" }}>+ 추가</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        {status && <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-sub)" }}>{status}</div>}
      </Card>

      {!profile?.style && (
        <Card style={{ marginBottom: 20 }}>
          <EmptyState>궁합을 보려면 먼저 성향 테스트를 완료해주세요.</EmptyState>
        </Card>
      )}

      {friends.length === 0 ? (
        <Card><EmptyState>아직 추가한 친구가 없어요.</EmptyState></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {friends.map((f) => {
            const score = profile?.style && f.style ? compat(profile.style, f.style) : null;
            const label = score !== null ? compatLabel(score) : null;
            return (
              <Card key={f.id}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Avatar profile={f} size={40} style={{ fontSize: 18 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{displayName(f)}</div>
                      <div style={{ fontSize: 12, color: "var(--text-sub)" }}>{f.style ?? "성향 미측정"}</div>
                    </div>
                  </div>
                  {score !== null ? (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ font: "700 20px ui-monospace,monospace", color: "var(--accent)" }}>{score}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>{label.label}</div>
                    </div>
                  ) : (
                    <span style={{ fontSize: 11.5, color: "var(--text-sub)" }}>성향 미측정</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
