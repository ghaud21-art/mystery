import { useEffect, useMemo, useState } from "react";
import { addDoc, arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { displayName } from "../lib/profileDisplay.js";
import { normalizeTitle, parsePlayerRange, PLAYER_TABS } from "../lib/scenarioUtils.js";
import { syncPlayedTitles } from "../lib/records.js";
import Avatar from "../components/Avatar.jsx";
import { Card, EmptyState, OutlineButton, PageHeader, PrimaryButton, ScrollBox } from "../components/ui.jsx";

const QUICK_FORM_EMPTY = { character: "", rating: 0, favorite: false };

const EMPTY_FORM = { title: "", publisher: "", playerCount: "", duration: "", description: "", category: "offline" };
const CATEGORY_TABS = [
  { key: "offline", label: "오프라인" },
  { key: "online", label: "온라인" },
];

export default function ScenarioSearch() {
  const { profile, setProfile } = useAuth();
  const [scenarios, setScenarios] = useState(null);
  const [category, setCategory] = useState("offline");
  const [playerTab, setPlayerTab] = useState("all");
  const [wishlistOnly, setWishlistOnly] = useState(false);
  const [unplayedOnly, setUnplayedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitStatus, setSubmitStatus] = useState("");
  const [playedTitles, setPlayedTitles] = useState(null);
  const [quickAddId, setQuickAddId] = useState(null);
  const [quickForm, setQuickForm] = useState(QUICK_FORM_EMPTY);
  const [savingId, setSavingId] = useState(null);
  const [openReviewsId, setOpenReviewsId] = useState(null);
  const [friends, setFriends] = useState([]);
  const [publicRatings, setPublicRatings] = useState({});

  async function loadScenarios() {
    const snap = await getDocs(query(collection(db, "scenarios"), where("status", "==", "approved")));
    setScenarios(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadPlayedTitles() {
    const snap = await getDocs(query(collection(db, "records"), where("userId", "==", profile.id)));
    setPlayedTitles(new Set(snap.docs.map((d) => normalizeTitle(d.data().scenarioName))));
  }

  useEffect(() => { loadScenarios(); }, []);
  useEffect(() => { if (profile?.id) loadPlayedTitles(); }, [profile?.id]);

  useEffect(() => {
    (async () => {
      if (!profile?.friends?.length) { setFriends([]); return; }
      const docs = await Promise.all(profile.friends.map((uid) => getDoc(doc(db, "users", uid))));
      setFriends(docs.filter((d) => d.exists()).map((d) => ({ id: d.id, ...d.data() })));
    })();
  }, [profile?.friends]);

  useEffect(() => {
    (async () => {
      // 공개(public) 감상평의 별점만 모아서 시나리오별 평균을 계산 (비공개 기록은 접근 불가)
      const snap = await getDocs(query(collection(db, "records"), where("public", "==", true)));
      const sums = {};
      snap.docs.forEach((d) => {
        const r = d.data();
        if (!r.rating || !r.scenarioName) return;
        const key = normalizeTitle(r.scenarioName);
        if (!sums[key]) sums[key] = { sum: 0, count: 0 };
        sums[key].sum += r.rating;
        sums[key].count += 1;
      });
      const avgMap = {};
      Object.entries(sums).forEach(([key, { sum, count }]) => { avgMap[key] = { avg: sum / count, count }; });
      setPublicRatings(avgMap);
    })();
  }, []);

  const selectedScenario = openReviewsId ? scenarios?.find((s) => s.id === openReviewsId) : null;

  function startQuickAdd(s) {
    setQuickAddId(s.id);
    setQuickForm(QUICK_FORM_EMPTY);
  }

  async function saveQuickAdd(s) {
    setSavingId(s.id);
    await addDoc(collection(db, "records"), {
      userId: profile.id,
      scenarioName: s.title,
      character: quickForm.character.trim(),
      rating: quickForm.rating > 0 ? Number(quickForm.rating) : null,
      note: "",
      date: new Date().toISOString().slice(0, 10),
      spoiler: true,
      favorite: quickForm.favorite,
      public: false,
      createdAt: serverTimestamp(),
    });
    await syncPlayedTitles(profile.id);
    setPlayedTitles((prev) => new Set(prev).add(normalizeTitle(s.title)));
    setQuickAddId(null);
    setSavingId(null);
  }

  async function toggleWishlist(s) {
    const has = (profile.wishlist || []).includes(s.id);
    await updateDoc(doc(db, "users", profile.id), { wishlist: has ? arrayRemove(s.id) : arrayUnion(s.id) });
    setProfile((p) => ({
      ...p,
      wishlist: has ? (p.wishlist || []).filter((id) => id !== s.id) : [...(p.wishlist || []), s.id],
    }));
  }

  const filtered = useMemo(() => {
    if (!scenarios) return [];
    const q = search.trim().toLowerCase();
    const tab = PLAYER_TABS.find((t) => t.key === playerTab);
    const list = scenarios
      .filter((s) => (s.category || "offline") === category)
      .filter((s) => {
        if (playerTab === "all") return true;
        const r = parsePlayerRange(s.playerCount);
        return r ? tab.test(r) : false;
      })
      .filter((s) => !wishlistOnly || (profile?.wishlist || []).includes(s.id))
      .filter((s) => !unplayedOnly || !playedTitles || !playedTitles.has(normalizeTitle(s.title)))
      .filter((s) => !q || s.title.toLowerCase().includes(q) || (s.publisher || "").toLowerCase().includes(q));
    return [...list].sort((a, b) => a.title.localeCompare(b.title, "ko"));
  }, [scenarios, search, category, playerTab, wishlistOnly, unplayedOnly, profile?.wishlist, playedTitles]);

  async function submitRequest(e) {
    e.preventDefault();
    setSubmitStatus("등록 요청 중…");
    await addDoc(collection(db, "scenarios"), {
      ...form,
      status: "pending",
      submittedBy: profile.id,
      submittedByName: displayName(profile),
    });
    setForm({ ...EMPTY_FORM, category });
    setShowForm(false);
    setSubmitStatus("관리자 승인 후 목록에 추가돼요. 요청 감사해요!");
    setTimeout(() => setSubmitStatus(""), 4000);
  }

  return (
    <div className="fade-in">
      <PageHeader eyebrow="SCENARIO DB" title="시나리오 찾기" />

      <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20, alignItems: "start" }}>
      <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>머더미스터리 시나리오 검색</div>
          <PrimaryButton
            style={{ height: 36, padding: "0 14px", fontSize: 12.5, whiteSpace: "nowrap" }}
            onClick={() => {
              if (!showForm) setForm({ ...EMPTY_FORM, category });
              setShowForm((s) => !s);
            }}
          >
            {showForm ? "닫기" : "+ 목록에 없는 작품 등록 요청"}
          </PrimaryButton>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {CATEGORY_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setCategory(t.key)}
              style={{
                flex: 1, height: 36, borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: `1.5px solid ${category === t.key ? "var(--accent)" : "var(--border)"}`,
                background: category === t.key ? "var(--accent-dim)" : "transparent",
                color: category === t.key ? "var(--accent)" : "var(--text-sub)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PLAYER_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setPlayerTab(t.key)}
              style={{
                flex: "1 1 60px", height: 32, borderRadius: 8, fontSize: 12,
                border: `1.5px solid ${playerTab === t.key ? "var(--accent)" : "var(--border)"}`,
                background: playerTab === t.key ? "var(--accent-dim)" : "transparent",
                color: playerTab === t.key ? "var(--accent)" : "var(--text-sub)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setWishlistOnly((v) => !v)}
            style={{
              flex: "1 1 140px", height: 34, borderRadius: 8, fontSize: 12.5, fontWeight: 600,
              border: `1.5px solid ${wishlistOnly ? "var(--danger)" : "var(--border)"}`,
              background: wishlistOnly ? "color-mix(in srgb, var(--danger) 12%, transparent)" : "transparent",
              color: wishlistOnly ? "var(--danger)" : "var(--text-sub)",
            }}
          >
            {wishlistOnly ? "♥" : "♡"} 위시리스트만 보기
          </button>
          <button
            type="button"
            onClick={() => setUnplayedOnly((v) => !v)}
            style={{
              flex: "1 1 140px", height: 34, borderRadius: 8, fontSize: 12.5, fontWeight: 600,
              border: `1.5px solid ${unplayedOnly ? "var(--accent)" : "var(--border)"}`,
              background: unplayedOnly ? "var(--accent-dim)" : "transparent",
              color: unplayedOnly ? "var(--accent)" : "var(--text-sub)",
            }}
          >
            내가 안 한 것만 보기
          </button>
        </div>

        <input
          placeholder="시나리오 이름으로 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={inputStyle}
        />

        {showForm && (
          <form onSubmit={submitRequest} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 10, background: "var(--bg-sub)" }}>
            <div style={{ display: "flex", gap: 8 }}>
              {CATEGORY_TABS.map((t) => (
                <button
                  type="button"
                  key={t.key}
                  onClick={() => setForm({ ...form, category: t.key })}
                  style={{
                    flex: 1, height: 34, borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                    border: `1.5px solid ${form.category === t.key ? "var(--accent)" : "var(--border)"}`,
                    background: form.category === t.key ? "var(--accent-dim)" : "transparent",
                    color: form.category === t.key ? "var(--accent)" : "var(--text-sub)",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <input required placeholder="시나리오 이름" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} style={inputStyle} />
            <input placeholder="제작사 (선택)" value={form.publisher}
              onChange={(e) => setForm({ ...form, publisher: e.target.value })} style={inputStyle} />
            <div style={{ display: "flex", gap: 8 }}>
              <input placeholder="인원수 (예: 4~6명)" value={form.playerCount}
                onChange={(e) => setForm({ ...form, playerCount: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
              <input placeholder="플레이 시간 (예: 3시간)" value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
            </div>
            <textarea placeholder="간단한 설명 (선택)" rows={2} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ ...inputStyle, resize: "vertical" }} />
            <PrimaryButton type="submit" style={{ height: 38, fontSize: 13 }}>등록 요청 보내기</PrimaryButton>
          </form>
        )}
        {submitStatus && <div style={{ fontSize: 12, color: "var(--accent)" }}>{submitStatus}</div>}

        {scenarios === null ? (
          <span style={{ color: "var(--text-sub)", fontSize: 13 }}>불러오는 중…</span>
        ) : filtered.length === 0 ? (
          <EmptyState>
            {wishlistOnly
              ? "위시리스트가 비어있어요. 하트를 눌러서 하고 싶은 머미를 담아보세요."
              : unplayedOnly
              ? "조건에 맞고 아직 안 한 작품이 없어요."
              : scenarios.length === 0
              ? "아직 등록된 시나리오가 없어요. 위에서 첫 작품을 등록 요청해보세요."
              : "검색 결과가 없어요."}
          </EmptyState>
        ) : (
          <>
            <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>총 {filtered.length}개 (가나다순)</div>
            <ScrollBox maxHeight="clamp(280px, calc(100vh - 380px), 640px)">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
                {filtered.map((s) => {
                  const played = playedTitles?.has(normalizeTitle(s.title));
                  const quickOpen = quickAddId === s.id;
                  const wished = (profile?.wishlist || []).includes(s.id);
                  const ratingInfo = publicRatings[normalizeTitle(s.title)];
                  return (
                    <div key={s.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => setOpenReviewsId((id) => (id === s.id ? null : s.id))}
                          title="다른 사람이 공개한 감상평 보기"
                          style={{
                            flex: 1, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer",
                            fontSize: 14.5, fontWeight: 700, lineHeight: 1.35, overflowWrap: "break-word", color: "var(--text)",
                          }}
                        >
                          {s.title}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleWishlist(s)}
                          title={wished ? "위시리스트에서 빼기" : "하고 싶은 머미로 표시"}
                          style={{ flex: "none", background: "none", border: "none", fontSize: 18, lineHeight: 1, cursor: "pointer", color: wished ? "var(--danger)" : "var(--text-sub)" }}
                        >
                          {wished ? "♥" : "♡"}
                        </button>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <InfoRow icon="🏢" value={s.publisher || "제작사 미상"} />
                        <InfoRow icon="👥" value={s.playerCount || "인원 미상"} />
                        <InfoRow icon="⏱️" value={s.duration ? `${s.duration} 소요` : "시간 미상"} />
                        <InfoRow
                          icon="⭐"
                          value={ratingInfo ? `평균 ${ratingInfo.avg.toFixed(1)} (${ratingInfo.count}명 평가)` : "아직 공개 평점 없음"}
                        />
                      </div>

                      {openReviewsId === s.id && <ScenarioReviews scenarioTitle={s.title} />}

                      {played ? (
                        <OutlineButton disabled style={{ width: "100%", height: 32, fontSize: 12, color: "var(--text-sub)" }}>
                          ✓ 이미 기록됨
                        </OutlineButton>
                      ) : quickOpen ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 10, borderRadius: 8, background: "var(--bg-sub)" }}>
                          <input
                            placeholder="맡은 캐릭터/역할 (선택)"
                            value={quickForm.character}
                            onChange={(e) => setQuickForm({ ...quickForm, character: e.target.value })}
                            style={{ ...inputStyle, padding: "7px 10px", fontSize: 12 }}
                          />
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <select
                              value={quickForm.rating}
                              onChange={(e) => setQuickForm({ ...quickForm, rating: e.target.value })}
                              style={{ ...inputStyle, padding: "7px 10px", fontSize: 12, flex: 1 }}
                            >
                              <option value={0}>평가 안 함</option>
                              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}
                            </select>
                            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--accent)", whiteSpace: "nowrap" }}>
                              <input type="checkbox" checked={quickForm.favorite} onChange={(e) => setQuickForm({ ...quickForm, favorite: e.target.checked })} />
                              ⭐ 인생머미
                            </label>
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <OutlineButton style={{ flex: 1, height: 30, fontSize: 11.5 }} onClick={() => setQuickAddId(null)}>취소</OutlineButton>
                            <PrimaryButton style={{ flex: 1, height: 30, fontSize: 11.5 }} disabled={savingId === s.id} onClick={() => saveQuickAdd(s)}>
                              {savingId === s.id ? "저장 중…" : "저장"}
                            </PrimaryButton>
                          </div>
                        </div>
                      ) : (
                        <OutlineButton style={{ width: "100%", height: 32, fontSize: 12 }} onClick={() => startQuickAdd(s)}>
                          + 기록에 추가
                        </OutlineButton>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollBox>
          </>
        )}
      </Card>

      <FriendsUnplayedPanel scenario={selectedScenario} friends={friends} />
      </div>
    </div>
  );
}

function FriendsUnplayedPanel({ scenario, friends }) {
  if (!scenario) {
    return (
      <Card style={{ position: "sticky", top: 20 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>친구 중 안 한 사람</div>
        <div style={{ fontSize: 12, color: "var(--text-sub)" }}>
          시나리오 제목을 누르면, 친구 중 누가 이 작품을 아직 안 했는지 여기에 보여드려요.
        </div>
      </Card>
    );
  }

  const key = normalizeTitle(scenario.title);
  const unplayedFriends = friends.filter((f) => !(f.playedTitles || []).includes(key));
  const playedFriends = friends.filter((f) => (f.playedTitles || []).includes(key));

  return (
    <Card style={{ position: "sticky", top: 20, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, overflowWrap: "break-word" }}>{scenario.title}</div>
      <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>
        친구 중 안 한 사람 ({unplayedFriends.length}/{friends.length})
      </div>
      {friends.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-sub)" }}>아직 추가한 친구가 없어요.</div>
      ) : unplayedFriends.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-sub)" }}>친구들 전부 이미 했어요! 🎉</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {unplayedFriends.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Avatar profile={f} size={28} style={{ fontSize: 13 }} />
              <span style={{ fontSize: 13 }}>{displayName(f)}</span>
            </div>
          ))}
        </div>
      )}
      {playedFriends.length > 0 && (
        <div style={{ fontSize: 11, color: "var(--text-sub)", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
          이미 함: {playedFriends.map((f) => displayName(f)).join(", ")}
        </div>
      )}
    </Card>
  );
}

function ScenarioReviews({ scenarioTitle }) {
  const [reviews, setReviews] = useState(null);
  const [revealed, setRevealed] = useState({});

  useEffect(() => {
    (async () => {
      const snap = await getDocs(
        query(collection(db, "records"), where("scenarioName", "==", scenarioTitle), where("public", "==", true))
      );
      const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const userIds = [...new Set(records.map((r) => r.userId))];
      const userDocs = await Promise.all(userIds.map((uid) => getDoc(doc(db, "users", uid))));
      const usersById = Object.fromEntries(userDocs.filter((d) => d.exists()).map((d) => [d.id, { id: d.id, ...d.data() }]));
      setReviews(records.map((r) => ({ ...r, user: usersById[r.userId] })).filter((r) => r.user));
    })();
  }, [scenarioTitle]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 10, borderRadius: 8, background: "var(--bg-sub)" }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-sub)" }}>다른 사람이 공개한 감상평</div>
      {reviews === null ? (
        <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>불러오는 중…</div>
      ) : reviews.length === 0 ? (
        <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>아직 공개된 감상평이 없어요.</div>
      ) : (
        reviews.map((r) => (
          <div key={r.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 6 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600 }}>
              {displayName(r.user)}
              {r.rating ? <span style={{ color: "var(--accent)" }}> · {"★".repeat(r.rating)}</span> : null}
            </div>
            {r.note && (
              <div
                className={!revealed[r.id] ? "spoiler" : ""}
                onClick={() => setRevealed((v) => ({ ...v, [r.id]: true }))}
                style={{ fontSize: 12, color: "var(--text-sub)", marginTop: 2 }}
              >
                {r.note}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function InfoRow({ icon, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-sub)" }}>
      <span style={{ flex: "none" }}>{icon}</span>
      <span style={{ overflowWrap: "break-word" }}>{value}</span>
    </div>
  );
}

const inputStyle = {
  padding: "10px 14px", borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 13,
};
