// 0.5점 단위(또는 평균처럼 임의의 소수)까지 실제로 "반쪽만 채워진 별"로 보여주는 컴포넌트.
// 유니코드 반쪽 별 글리프는 기기/폰트마다 렌더링이 다르거나 아예 안 보이는 경우가 많아서,
// 별 하나마다 빈 별(배경) 위에 꽉 찬 별(전경)을 채움 비율만큼 잘라 겹쳐서 항상 똑같이 보이게 함.
export default function StarRating({ value, max = 5, size = 14, color = "var(--accent)", emptyColor = "var(--border)" }) {
  const rating = Math.max(0, Math.min(max, Number(value) || 0));
  return (
    <span style={{ display: "inline-flex", gap: 1, verticalAlign: "middle" }}>
      {Array.from({ length: max }, (_, i) => {
        const fill = Math.max(0, Math.min(1, rating - i));
        return (
          <span key={i} style={{ position: "relative", display: "inline-block", width: size, height: size, lineHeight: 1, flex: "none" }}>
            <span style={{ position: "absolute", inset: 0, fontSize: size, color: emptyColor }}>★</span>
            {fill > 0 && (
              <span style={{ position: "absolute", inset: 0, width: `${fill * 100}%`, overflow: "hidden", whiteSpace: "nowrap" }}>
                <span style={{ fontSize: size, color }}>★</span>
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
