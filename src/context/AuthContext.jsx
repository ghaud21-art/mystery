import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "../lib/firebase";

const AuthContext = createContext(null);

// 이 이메일로 로그인하면 가입과 동시에 관리자 권한이 부여됨
const ADMIN_EMAILS = ["ghaud21@gmail.com"];

const DEFAULT_PROFILE_FIELDS = {
  nickname: null,
  avatarEmoji: null,
  style: null,
  style2: null,
  friends: [],
  styleAnalysis: null,
  aiUsageCount: 0,
  aiUnlimited: false,
  availableDates: [],
  playedTitles: [],
  wishlist: [],
};

async function ensureUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      name: user.displayName || "이름 없는 탐정",
      email: user.email,
      photoURL: user.photoURL || null,
      isAdmin: ADMIN_EMAILS.includes(user.email),
      createdAt: serverTimestamp(),
      ...DEFAULT_PROFILE_FIELDS,
    });
  } else {
    // 예전 계정에 새 필드가 없으면 기본값으로 채워줌 (기존 값은 덮어쓰지 않음)
    const data = snap.data();
    const missing = {};
    for (const [key, value] of Object.entries(DEFAULT_PROFILE_FIELDS)) {
      if (!(key in data)) missing[key] = value;
    }
    if (!("isAdmin" in data) && ADMIN_EMAILS.includes(user.email)) missing.isAdmin = true;
    if (Object.keys(missing).length > 0) {
      await setDoc(ref, missing, { merge: true });
    }
  }
  const fresh = await getDoc(ref);
  return { id: fresh.id, ...fresh.data() };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      if (fbUser) {
        const p = await ensureUserProfile(fbUser);
        setProfile(p);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
  const signOut = () => fbSignOut(auth);

  return (
    <AuthContext.Provider value={{ user, profile, setProfile, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
