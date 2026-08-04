import { useEffect, useState } from "react";
import { arrayUnion, collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { compat, compatLabel, TYPE_META } from "../lib/personality.js";
import { Card, EmptyState, PageHeader, PrimaryButton } from "../components/ui.jsx";

export default function Friends() {
  const { profile, setProfile } = useAuth();
  const [friends, setFriends] = useState([]);
  const [email, setEmail] = useState("");
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

  async function addFriend(e) {
    e.preventDefault();
    setStatus("");
    const snap = await getDocs(query(collection(db, "users"), where("email", "==", email.trim())));
    if (snap.empty) {
      setStatus("해당 이메일의 탐정을 찾을 수 없어요.");
      return;
    }
    const target = snap.docs[0];
    if (target.id === profile.id) {
      setStatus("본인은 추가할 수 없어요.");
      return;
    }
    await updateDoc(doc(db, "users", profile.id), { friends: arrayUnion(target.id) });
    setProfile((p) => ({ ...p, friends: [...(p.friends || []), target.id] }));
    setEmail("");
    setStatus("친구로 추가했어요.");
  }

  return (
    <div className="fade-in">
      <PageHeader title="친구 &amp; 궁합" />

      <Card style={{ marginBottom: 20 }}>
        <form onSubmit={addFriend} style={{ display: "flex", gap: 10 }}>
          <input
            type="email"
            required
            placeholder="친구 가입 이메일로 추가"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              flex: 1, padding: "10px 14px", borderRadius: 8,
              border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13,
            }}
          />
          <PrimaryButton type="submit" style={{ height: "auto" }}>추가</PrimaryButton>
        </form>
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
              <Card key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%", background: "var(--accent-dim)",
                    border: "1px solid var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                  }}>
                    {f.style ? TYPE_META[f.style].icon : "🕵️"}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{f.name}</div>
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
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
