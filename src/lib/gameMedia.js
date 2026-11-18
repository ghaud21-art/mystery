// 놓친 장면의 영상·이미지·음성 업로드 공통 로직 (플레이형 편집기와 관리 목록이 같이 씀).
// 1) 관리자 표식을 받고 토큰 갱신 → 2) Storage에 직접 올림 → 3) 서버가 다운로드 주소를 만들어 시나리오 파일명에 연결.
import { ref, uploadBytes } from "firebase/storage";
import { auth, storage } from "./firebase.js";
import { caseGameAdminSetMedia, caseGameAdminUploadAccess } from "./caseApi.js";

let accessReady = null;
async function ensureAccess() {
  if (!accessReady) {
    accessReady = (async () => {
      await caseGameAdminUploadAccess({});
      await auth.currentUser?.getIdToken(true); // 새 표식이 담긴 토큰으로 교체
    })().catch((e) => { accessReady = null; throw e; });
  }
  return accessReady;
}

// name: 시나리오가 쓰는 파일명(Storage에도 이 이름으로 저장). 완료되면 연결된 다운로드 주소를 돌려줌.
export async function uploadGameMedia(gameId, name, file) {
  await ensureAccess();
  try {
    await uploadBytes(ref(storage, `case-games/${gameId}/${name}`), file, file.type ? { contentType: file.type } : undefined);
  } catch (err) {
    if (err.code === "storage/unauthorized") accessReady = null; // 다음 시도에서 표식을 다시 받음
    throw err;
  }
  const res = await caseGameAdminSetMedia({ gameId, files: [name] });
  return res.urls[name];
}
