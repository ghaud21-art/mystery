// "사건이 도착했습니다" 전용 API 레이어. 이 앱 나머지 기능은 대부분 Firestore를 클라이언트에서
// 직접 쿼리하는데, 이 기능만 예외적으로 Cloud Functions(onCall)를 거친다 — 정답/진상/판정기준이
// 문서 필드에 공개 정보와 섞여 있어 Firestore 규칙으로는 필드 단위로 숨길 방법이 없기 때문
// (firestore.rules의 caseSeasons/caseProgress/caseSubmissions/caseResults 규칙 주석 참고).
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase.js";

function call(name) {
  const fn = httpsCallable(functions, name);
  return async (data) => {
    try {
      const res = await fn(data);
      return res.data;
    } catch (err) {
      throw new Error(err?.message || "요청에 실패했어요. 잠시 후 다시 시도해주세요.");
    }
  };
}

export const caseListSeasons = call("caseListSeasons");
export const caseGetSeasonPublic = call("caseGetSeasonPublic");
export const caseGetPlayState = call("caseGetPlayState");
export const caseStart = call("caseStart");
export const caseSetNightMode = call("caseSetNightMode");
export const caseSubmitDay = call("caseSubmitDay");
export const caseSubmitFinal = call("caseSubmitFinal");
export const caseGetResult = call("caseGetResult");
export const caseRetryJudge = call("caseRetryJudge");

export const caseAdminListSeasons = call("caseAdminListSeasons");
export const caseAdminGetSeason = call("caseAdminGetSeason");
export const caseAdminSaveSeason = call("caseAdminSaveSeason");
export const caseAdminSaveDay = call("caseAdminSaveDay");
export const caseAdminCreateSeason = call("caseAdminCreateSeason");
export const caseAdminImportSeason = call("caseAdminImportSeason");
export const caseAdminGetStats = call("caseAdminGetStats");
export const caseAdminResetMyProgress = call("caseAdminResetMyProgress");
