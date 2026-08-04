import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  addDoc, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, query, updateDoc, where,
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { compatLabel, compatWithReason, TYPE_META } from "../lib/personality.js";
import { displayName } from "../lib/profileDisplay.js";
import { normalizeTitle, parsePlayerRange } from "../lib/scenarioUtils.js";
import Avatar from "../components/Avatar.jsx";
import { Card, EmptyState, OutlineButton, PageHeader, PrimaryButton } from "../components/ui.jsx";

const PAGE_SIZE = 10;

export default function Friends() {
  const { profile, setProfile } = useAuth();
  const [friends, setFriends] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [selectedFriendIds, setSelectedFriendIds] = useState(new Set());

  function toggleFriendSelect(id) {
    setSelectedFriendIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

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

  async function loadRequests() {
    if (!profile?.id) return;
    const [inSnap, outSnap] = await Promise.all([
      getDocs(query(collection(db, "friendRequests"), where("toUid", "==", profile.id), where("status", "==", "pending"))),
      getDocs(query(collection(db, "friendRequests"), where("fromUid", "==", profile.id))),
    ]);
    const inReqs = inSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const outReqs = outSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const uids = [...new Set([...inReqs.map((r) => r.fromUid), ...outReqs.map((r) => r.toUid)])];
    const userDocs = await Promise.all(uids.map((uid) => getDoc(doc(db, "users", uid))));
    const usersById = Object.fromEntries(userDocs.filter((d) => d.exists()).map((d) => [d.id, { id: d.id, ...d.data() }]));

    setIncoming(inReqs.map((r) => ({ ...r, user: usersById[r.fromUid] })).filter((r) => r.user));

    // 내가 보낸 요청이 수락됐으면, 내 친구 목록에도 반영하고 요청 문서는 정리(삭제)
    const accepted = outReqs.filter((r) => r.status === "accepted");
    if (accepted.length > 0) {
      await Promise.all(
        accepted.map(async (r) => {
          if (!(profile.friends || []).includes(r.toUid)) {
            await updateDoc(doc(db, "users", profile.id), { friends: arrayUnion(r.toUid) });
          }
          await deleteDoc(doc(db, "friendRequests", r.id));
        })
      );
      setProfile((p) => ({ ...p, friends: [...new Set([...(p.friends || []), ...accepted.map((r) => r.toUid)])] }));
    }
    setOutgoing(
      outReqs
        .filter((r) => r.status === "pending")
        .map((r) => ({ ...r, user: usersById[r.toUid] }))
        .filter((r) => r.user)
    );
  }

  useEffect(() => { loadRequests(); }, [profile?.id]);

  const suggestions = (() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return [];
    return allUsers
      .filter((u) => u.id !== profile?.id && !(profile?.friends || []).includes(u.id))
      .filter((u) => (u.nickname || u.name || "").toLowerCase().includes(q))
      .slice(0, 6);
  })();

  function requestStateFor(uid) {
    if (incoming.some((r) => r.fromUid === uid)) return "incoming";
    if (outgoing.some((r) => r.toUid === uid)) return "outgoing";
    return null;
  }

  async function sendRequest(target) {
    setStatus("");
    const reverse = incoming.find((r) => r.fromUid === target.id);
    if (reverse) {
      await acceptRequest(reverse);
      setSearchTerm("");
      setShowSuggestions(false);
      return;
    }
    if (outgoing.some((r) => r.toUid === target.id)) {
      setStatus("이미 친구 요청을 보냈어요.");
      return;
    }
    await addDoc(collection(db, "friendRequests"), {
      fromUid: profile.id, toUid: target.id, status: "pending",
    });
    setSearchTerm("");
    setShowSuggestions(false);
    setStatus(`${displayName(target)}님에게 친구 요청을 보냈어요.`);
    loadRequests();
  }

  async function acceptRequest(req) {
    setBusyId(req.id);
    await updateDoc(doc(db, "friendRequests", req.id), { status: "accepted" });
    await updateDoc(doc(db, "users", profile.id), { friends: arrayUnion(req.fromUid) });
    setProfile((p) => ({ ...p, friends: [...new Set([...(p.friends || []), req.fromUid])] }));
    setIncoming((list) => list.filter((r) => r.id !== req.id));
    setBusyId(null);
  }

  async function rejectRequest(req) {
    setBusyId(req.id);
    await deleteDoc(doc(db, "friendRequests", req.id));
    setIncoming((list) => list.filter((r) => r.id !== req.id));
    setBusyId(null);
  }

  async function cancelRequest(req) {
    setBusyId(req.id);
    await deleteDoc(doc(db, "friendRequests", req.id));
    setOutgoing((list) => list.filter((r) => r.id !== req.id));
    setBusyId(null);
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
                suggestions.map((u) => {
                  const reqState = requestStateFor(u.id);
                  return (
                    <button
                      type="button"
                      key={u.id}
                      onMouseDown={() => sendRequest(u)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                        padding: "9px 14px", background: "none", border: "none", borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <Avatar profile={u} size={28} style={{ fontSize: 13 }} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{displayName(u)}</span>
                      {u.style && <span style={{ fontSize: 11, color: "var(--text-sub)" }}>{u.style}</span>}
                      <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--accent)", whiteSpace: "nowrap" }}>
                        {reqState === "incoming" ? "수락하기" : reqState === "outgoing" ? "요청됨" : "+ 요청"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
        {status && <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-sub)" }}>{status}</div>}
      </Card>

      {incoming.length > 0 && (
        <Card style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>받은 친구 요청 ({incoming.length})</div>
          {incoming.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Avatar profile={r.user} size={32} style={{ fontSize: 15 }} />
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0 }}>{displayName(r.user)}</span>
              <PrimaryButton style={{ height: 32, padding: "0 12px", fontSize: 12 }} disabled={busyId === r.id} onClick={() => acceptRequest(r)}>
                수락
              </PrimaryButton>
              <OutlineButton style={{ height: 32, padding: "0 12px", fontSize: 12 }} disabled={busyId === r.id} onClick={() => rejectRequest(r)}>
                거절
              </OutlineButton>
            </div>
          ))}
        </Card>
      )}

      {outgoing.length > 0 && (
        <Card style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>보낸 친구 요청 ({outgoing.length})</div>
          {outgoing.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Avatar profile={r.user} size={32} style={{ fontSize: 15 }} />
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0 }}>{displayName(r.user)}</span>
              <span style={{ fontSize: 11.5, color: "var(--text-sub)" }}>수락 대기 중</span>
              <OutlineButton style={{ height: 32, padding: "0 12px", fontSize: 12 }} disabled={busyId === r.id} onClick={() => cancelRequest(r)}>
                취소
              </OutlineButton>
            </div>
          ))}
        </Card>
      )}

      {!profile?.style && (
        <Card style={{ marginBottom: 20 }}>
          <EmptyState>궁합을 보려면 먼저 성향 테스트를 완료해주세요.</EmptyState>
        </Card>
      )}

      {friends.length === 0 ? (
        <Card><EmptyState>아직 친구가 없어요.</EmptyState></Card>
      ) : (
        <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {friends.map((f) => {
              const canCompat = profile?.style && f.style;
              const result = canCompat ? compatWithReason(profile, f) : null;
              const label = result ? compatLabel(result.score) : null;
              const myMeta = profile?.style ? TYPE_META[profile.style] : null;
              const friendMeta = f.style ? TYPE_META[f.style] : null;
              return (
                <Card key={f.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <input
                        type="checkbox"
                        checked={selectedFriendIds.has(f.id)}
                        onChange={() => toggleFriendSelect(f.id)}
                        title="함께 안 한 머미 추천에 포함"
                      />
                      <Avatar profile={f} size={40} style={{ fontSize: 18 }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{displayName(f)}</div>
                        <div style={{ fontSize: 12, color: "var(--text-sub)" }}>{f.style ?? "성향 미측정"}</div>
                      </div>
                    </div>
                    {result ? (
                      <div style={{ textAlign: "right" }}>
                        <div style={{ font: "700 20px ui-monospace,monospace", color: "var(--accent)" }}>{result.score}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>
                          {label.label}{result.bonus > 0 && ` (기본 ${result.base} +${result.bonus})`}
                        </div>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11.5, color: "var(--text-sub)" }}>성향 미측정</span>
                    )}
                  </div>

                  {result && (myMeta || friendMeta) && (
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                      {myMeta && (
                        <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>
                          나 · 💪 {myMeta.strength} / ⚠️ {myMeta.weakness}
                        </div>
                      )}
                      {friendMeta && (
                        <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>
                          {displayName(f)} · 💪 {friendMeta.strength} / ⚠️ {friendMeta.weakness}
                        </div>
                      )}
                      {result.reasons.map((r, i) => (
                        <div key={i} style={{ fontSize: 11.5, color: "var(--success)" }}>✓ {r}</div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          <TogetherRecommend profile={profile} friends={friends} selectedIds={selectedFriendIds} />
        </div>
      )}
    </div>
  );
}

function TogetherRecommend({ profile, friends, selectedIds }) {
  const [scenarios, setScenarios] = useState(null);
  const [results, setResults] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(query(collection(db, "scenarios"), where("status", "==", "approved")));
      setScenarios(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    })();
  }, []);

  const selectedFriends = friends.filter((f) => selectedIds.has(f.id));
  const groupSize = 1 + selectedFriends.length;

  function findRecommendations() {
    setLoading(true);
    setResults(null);
    setVisibleCount(PAGE_SIZE);
    // records 컬렉션은 본인만 읽을 수 있어서 친구 기록을 직접 조회할 수 없음 —
    // 대신 각자 users 문서에 함께 저장해둔 playedTitles(정규화된 제목 목록)를 사용.
    const people = [profile, ...selectedFriends];
    const eligible = scenarios.filter((s) => {
      const range = parsePlayerRange(s.playerCount);
      if (!range || groupSize < range.min || groupSize > range.max) return false;
      const key = normalizeTitle(s.title);
      return people.every((p) => !(p.playedTitles || []).includes(key));
    });

    // 전원이 동시에 위시리스트에 담아뒀을 필요는 없음 — 한 명이라도 담아둔 작품이면 상단에 노출
    const withWish = eligible.map((s) => ({
      ...s,
      wishedBy: people.filter((p) => (p.wishlist || []).includes(s.id)).map((p) => (p.id === profile.id ? "나" : displayName(p))),
    }));
    withWish.sort((a, b) => {
      const aw = a.wishedBy.length > 0 ? 0 : 1;
      const bw = b.wishedBy.length > 0 ? 0 : 1;
      return aw !== bw ? aw - bw : a.title.localeCompare(b.title, "ko");
    });

    setResults(withWish);
    setLoading(false);
  }

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 20 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>함께 안 한 머미 추천</div>
      {selectedFriends.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-sub)" }}>
          왼쪽 친구 목록에서 체크박스로 함께 플레이할 친구를 골라주세요. 인원수에 맞고,
          아직 다 같이 안 해본 작품을 우리 DB에서 찾아드려요.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: "var(--text-sub)" }}>
            나 + {selectedFriends.map((f) => displayName(f)).join(", ")} · 총 {groupSize}명
          </div>
          <div style={{ fontSize: 11, color: "var(--text-sub)" }}>
            나나 선택한 친구 중 한 명이라도 위시리스트에 담아둔 작품이 있으면 맨 위로 올려서 보여줘요.
          </div>
          <PrimaryButton onClick={findRecommendations} disabled={loading || !scenarios}>
            {loading ? "찾는 중…" : "추천 받기"}
          </PrimaryButton>
        </>
      )}
      {results !== null && (
        results.length === 0 ? (
          <EmptyState>{groupSize}명 인원에 맞고 다 같이 안 해본 작품을 못 찾았어요.</EmptyState>
        ) : (
          <>
            <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>
              총 {results.length}개 중 {Math.min(visibleCount, results.length)}개 표시 (가나다순, 위시리스트 우선)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {results.slice(0, visibleCount).map((s) => (
                <div key={s.id} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, overflowWrap: "break-word" }}>{s.title}</span>
                    {s.wishedBy.length > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--danger)" }}>
                        ♥ {s.wishedBy.join(", ")}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-sub)" }}>
                    {[s.publisher, s.playerCount, s.duration].filter(Boolean).join(" · ")}
                  </div>
                  <Link to="/records" state={{ scenarioName: s.title }}>
                    <OutlineButton style={{ width: "100%", height: 30, fontSize: 11.5, marginTop: 6 }}>+ 기록에 추가</OutlineButton>
                  </Link>
                </div>
              ))}
            </div>
            {visibleCount < results.length && (
              <OutlineButton onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}>
                더 보기 ({results.length - visibleCount}개 더)
              </OutlineButton>
            )}
          </>
        )
      )}
    </Card>
  );
}
