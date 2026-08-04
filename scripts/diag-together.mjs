import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function normalizeTitle(t) {
  return (t || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}
function parsePlayerRange(str) {
  if (!str) return null;
  const m = String(str).match(/(\d+)(?:\s*[~\-]\s*(\d+))?/);
  if (!m) return null;
  const min = parseInt(m[1], 10);
  const max = m[2] ? parseInt(m[2], 10) : min;
  return { min, max };
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const usersSnap = await db.collection("users").get();
const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

const me = users.find((u) => u.email === "ghaud21@gmail.com");
const friend = users.find((u) => (u.nickname || u.name || "").includes("챙"));

console.log("me:", me?.email, "playedTitles:", me?.playedTitles?.length ?? "N/A", "records-field-missing?", !me?.playedTitles);
console.log("friend nickname match:", friend?.nickname || friend?.name, friend?.email, "playedTitles:", friend?.playedTitles?.length ?? "N/A");

if (!me || !friend) {
  console.log("USERS FOUND:", users.map((u) => `${u.nickname || u.name}(${u.email})`).join(", "));
  process.exit(0);
}

const [meRecSnap, friendRecSnap] = await Promise.all([
  db.collection("records").where("userId", "==", me.id).get(),
  db.collection("records").where("userId", "==", friend.id).get(),
]);
console.log("me actual records count:", meRecSnap.size);
console.log("friend actual records count:", friendRecSnap.size);

const scenariosSnap = await db.collection("scenarios").where("status", "==", "approved").get();
const scenarios = scenariosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
console.log("total approved scenarios:", scenarios.length);

const groupSize = 2;
const mePlayed = new Set(me.playedTitles || []);
const friendPlayed = new Set(friend.playedTitles || []);

const eligible = scenarios.filter((s) => {
  const range = parsePlayerRange(s.playerCount);
  if (!range || groupSize < range.min || groupSize > range.max) return false;
  const key = normalizeTitle(s.title);
  return !mePlayed.has(key) && !friendPlayed.has(key);
});
console.log("scenarios where playerCount fits 2:", scenarios.filter((s) => {
  const r = parsePlayerRange(s.playerCount);
  return r && groupSize >= r.min && groupSize <= r.max;
}).length);
console.log("eligible (fits 2 AND neither played):", eligible.length);
