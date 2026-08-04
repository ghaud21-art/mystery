// 업로드 전 정사각형으로 잘라 리사이즈 + 압축한 뒤 base64 data URL로 반환.
// Firebase Storage는 무료(Spark) 요금제에서 쓸 수 없어서, 대신 작게 압축한 이미지를
// Firestore 문서 필드에 문자열로 직접 저장한다 (문서 용량 제한 1MB 대비 충분히 작게 유지).
const MAX_DATA_URL_BYTES = 250 * 1024;

export function resizeImageToDataUrl(file, size = 200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      URL.revokeObjectURL(objectUrl);

      let q = quality;
      let dataUrl = canvas.toDataURL("image/jpeg", q);
      // 그래도 너무 크면 화질을 낮춰가며 재시도
      while (dataUrl.length > MAX_DATA_URL_BYTES && q > 0.3) {
        q -= 0.15;
        dataUrl = canvas.toDataURL("image/jpeg", q);
      }
      if (dataUrl.length > MAX_DATA_URL_BYTES) {
        reject(new Error("이미지가 너무 커요. 다른 사진을 시도해주세요."));
        return;
      }
      resolve(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("이미지를 읽지 못했어요."));
    };
    img.src = objectUrl;
  });
}
