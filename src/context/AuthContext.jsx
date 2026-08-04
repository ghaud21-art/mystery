import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "../lib/firebase";

const AuthContext = createContext(null);

async function ensureUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      name: user.displayName || "이름 없는 탐정",
      email: user.email,
      photoURL: user.photoURL || null,
      style: null,
      style2: null,
      friends: [],
      createdAt: serverTimestamp(),
    });
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
