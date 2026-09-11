// 앱 일정(모임 일정 참석 확정 / 개인 일정) → 그 사람 본인의 구글 캘린더에 자동으로 추가/수정/삭제.
// 구글 캘린더 "기존" 일정은 이 앱이 절대 읽지 않음(그래서 섞일 방법이 없음) — 여기 있는 함수들은
// 전부 "쓰기(create/update/delete)" API만 호출하고, 캘린더 조회(list/get) API는 아예 안 씀.
//
// 인증: Firebase 로그인에 쓰는 구글 계정에 캘린더 쓰기 스코프(calendar.events)를 추가로 동의받아서
// 얻은 구글 OAuth 액세스 토큰을 그대로 구글 캘린더 REST API에 직접 사용함(자체 백엔드 없음).
// 이 토큰은 보통 1시간 정도만 유효하고, Firebase가 자동으로 갱신해주지 않아서 만료되면
// connectGoogleCalendar()로 사용자가 다시 한 번 눌러줘야 함 — 그래서 완전 무인 백그라운드
// 동기화는 아니고, "앱을 쓰는 동안 자동으로" 동기화되는 방식.
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "./firebase.js";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const EVENTS_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const TOKEN_STORAGE_KEY = "mm_google_calendar_token";
const TIME_ZONE = "Asia/Seoul";

let cachedToken = null; // { accessToken, expiresAt }

function loadCachedToken() {
  if (cachedToken) return cachedToken;
  try {
    const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (raw) cachedToken = JSON.parse(raw);
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

function saveToken(accessToken) {
  cachedToken = { accessToken, expiresAt: Date.now() + 55 * 60 * 1000 };
  try {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(cachedToken));
  } catch {
    // 세션 스토리지를 못 쓰는 환경이면 메모리 캐시만으로 동작(새로고침하면 다시 연결 필요)
  }
}

// 캐시된 액세스 토큰이 있고 아직 안 만료됐으면 반환, 아니면 null(연결/재연결 필요).
export function getValidCalendarToken() {
  const t = loadCachedToken();
  if (t && t.expiresAt > Date.now()) return t.accessToken;
  return null;
}

// 구글 캘린더 쓰기 권한을 새로 요청(최초 연결 또는 토큰 만료 후 재연결). 항상 구글 팝업이 뜸.
export async function connectGoogleCalendar(uid) {
  const provider = new GoogleAuthProvider();
  provider.addScope(CALENDAR_SCOPE);
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error("구글 캘린더 쓰기 권한을 받지 못했어요. 다시 시도해주세요.");
  }
  saveToken(credential.accessToken);
  await updateDoc(doc(db, "users", uid), { googleCalendarSync: true });
  return credential.accessToken;
}

// 연동 해제 — 이미 만들어진 구글 캘린더 이벤트는 지우지 않고 그대로 둠(사용자가 원하면 구글
// 캘린더에서 직접 지우면 됨). 이후 자동 동기화만 멈춤.
export async function disconnectGoogleCalendar(uid) {
  cachedToken = null;
  try {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // no-op
  }
  await updateDoc(doc(db, "users", uid), { googleCalendarSync: false });
}

async function apiFetch(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${EVENTS_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    const err = new Error("구글 캘린더 연결이 만료됐어요. 프로필에서 다시 연결해주세요.");
    err.code = "calendar-auth-expired";
    throw err;
  }
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const err = new Error(`구글 캘린더 동기화에 실패했어요 (${res.status})`);
    err.code = "calendar-api-error";
    throw err;
  }
  if (res.status === 204 || res.status === 404 || res.status === 410) return null;
  return res.json();
}

function syncDocRef(uid, localKey) {
  return doc(db, "users", uid, "calendarSync", localKey);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

// "YYYY-MM-DDTHH:mm" 시작시각 기준으로 종료시각이 없을 때 기본 길이(3시간)를 더해줌.
function defaultEnd(startLocal) {
  const d = new Date(startLocal);
  d.setHours(d.getHours() + 3);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 앱 일정 하나를 이 사람의 구글 캘린더에 생성하거나(처음) 갱신(이후 수정)함.
// localKey는 이 앱 안에서 이 일정을 가리키는 고유 키 — 예: "personal_{docId}", "group_{scheduleId}".
// 캘린더 연동이 꺼져 있거나 토큰이 없으면 조용히 건너뜀(에러 아님) — 호출부에서 매번 연동 여부를
// 체크하지 않아도 되게 하기 위함.
export async function upsertCalendarEvent(uid, localKey, { title, location, startLocal, endLocal }) {
  const token = getValidCalendarToken();
  if (!token || !startLocal) return { skipped: true };

  const body = {
    summary: `[머더미스터리] ${title}`,
    location: location || undefined,
    description: "머더미스터리.com 앱에서 자동으로 동기화된 일정이에요.",
    start: { dateTime: `${startLocal}:00`, timeZone: TIME_ZONE },
    end: { dateTime: `${endLocal || defaultEnd(startLocal)}:00`, timeZone: TIME_ZONE },
  };

  const ref = syncDocRef(uid, localKey);
  const existing = await getDoc(ref);
  const existingEventId = existing.exists() ? existing.data().googleEventId : null;

  if (existingEventId) {
    const updated = await apiFetch(`/${existingEventId}`, { method: "PATCH", token, body });
    if (updated) return { eventId: existingEventId };
    // 여기 도달하면 404/410 — 사용자가 구글 캘린더 쪽에서 직접 지운 경우라 아래에서 새로 만듦
  }

  const created = await apiFetch("", { method: "POST", token, body });
  await setDoc(ref, { googleEventId: created.id, syncedAt: Date.now() });
  return { eventId: created.id };
}

// 이 앱에서 일정이 삭제되거나(개인 일정 삭제, 모임 참석 취소 등) 구글 캘린더에도 반영.
export async function deleteCalendarEvent(uid, localKey) {
  const ref = syncDocRef(uid, localKey);
  const existing = await getDoc(ref);
  if (!existing.exists()) return;

  const token = getValidCalendarToken();
  const eventId = existing.data().googleEventId;
  if (token && eventId) {
    await apiFetch(`/${eventId}`, { method: "DELETE", token }).catch(() => {
      // 토큰 만료/이미 지워짐 등으로 실패해도 매핑 문서는 정리한다(재시도는 다음 upsert가 새로 생성).
    });
  }
  await deleteDoc(ref);
}
