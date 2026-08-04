import { useEffect, useState } from "react";
import { arrayUnion, collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { compat, compatLabel } from "../lib/personality.js";
import { displayName } from "../lib/profileDisplay.js";
import Avatar from "../components/Avatar.jsx";
import { Card, EmptyState, OutlineButton, PageHeader, PrimaryButton } from "../components/ui.jsx";

export default function Friends() {
  const { profile, setProfile } = useAuth();
  const [friends, setFriends] = useState([]);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [openNoteFor, setOpenNoteFor] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);

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
    const term = email.trim();
    const isEmail = term.includes("@");
    const snap = await getDocs(
      query(collection(db, "users"), where(isEmail ? "email" : "nickname", "==", term))
    );
    if (snap.empty) {
      setStatus(isEmail ? "해당 이메일의 탐정을 찾을 수 없어요." : "해당 닉네임의 탐정을 찾을 수 없어요.");
      return;
    }
    if (snap.docs.length > 1 && !isEmail) {
      setStatus("같은 닉네임을 쓰는 탐정이 여러 명이에요. 이메일로 검색해주세요.");
      return;
    }
    const target = snap.docs[0];
    if (target.id === profile.id) {
      setStatus("본인은 추가할 수 없어요.");
      return;
    }
    if ((profile.friends || []).includes(target.id)) {
      setStatus("이미 친구예요.");
      return;
    }
    await updateDoc(doc(db, "users", profile.id), { friends: arrayUnion(target.id) });
    setProfile((p) => ({ ...p, friends: [...(p.friends || []), target.id] }));
    setEmail("");
    setStatus("친구로 추가했어요.");
  }

  function openNote(friendId) {
    setNoteDraft(profile?.compatNotes?.[friendId]?.text || "");
    setOpenNoteFor(friendId);
  }

  async function saveNote(friendId) {
    setSavingNote(true);
    const nextNotes = {
      ...(profile.compatNotes || {}),
      [friendId]: { text: noteDraft.trim(), updatedAt: new Date().toISOString() },
    };
    await updateDoc(doc(db, "users", profile.id), { compatNotes: nextNotes });
    setProfile((p) => ({ ...p, compatNotes: nextNotes }));
    setSavingNote(false);
    setOpenNoteFor(null);
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
            const noteText = profile?.compatNotes?.[f.id]?.text;
            const noteOpen = openNoteFor === f.id;
            return (
              <Card key={f.id} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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

                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  {!noteOpen ? (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ fontSize: 12.5, color: "var(--text-sub)", flex: 1 }}>
                        {noteText || "이 친구와 왜 잘 맞는지/안 맞는지 메모해두면, AI 성향 분석에 반영돼요."}
                      </div>
                      <OutlineButton style={{ height: 32, padding: "0 12px", fontSize: 12, flex: "none" }} onClick={() => openNote(f.id)}>
                        {noteText ? "메모 수정" : "메모 남기기"}
                      </OutlineButton>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <textarea
                        autoFocus
                        rows={3}
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="예: 얘랑 같이 하면 항상 손발이 잘 맞아. 근데 얘는 너무 진지해서 텐션이 안 맞을 때도 있어."
                        style={{
                          padding: "10px 12px", borderRadius: 8, border: "1.5px solid var(--border)",
                          background: "var(--bg)", color: "var(--text)", fontSize: 13, resize: "vertical",
                        }}
                      />
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <OutlineButton style={{ height: 32, padding: "0 12px", fontSize: 12 }} onClick={() => setOpenNoteFor(null)}>취소</OutlineButton>
                        <PrimaryButton
                          style={{ height: 32, padding: "0 14px", fontSize: 12 }}
                          disabled={savingNote}
                          onClick={() => saveNote(f.id)}
                        >
                          {savingNote ? "저장 중…" : "저장"}
                        </PrimaryButton>
                      </div>
                    </div>
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
