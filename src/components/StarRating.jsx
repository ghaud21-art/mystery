import { useId } from "react";

// 텍스트 "★" 글리프를 겹쳐서 반쪽만 보이게 자르는 방식은 폰트마다 별 모양의 좌우 여백이
// 달라서 클리핑 경계가 별의 실제 뾰족한 꼭짓점과 안 맞아 지저분하게 보이는 문제가 있었음
// (별 안에 별이 어긋나 보이는 등). 그래서 별 모양 자체를 SVG path로 직접 그리고, 반쪽 채움은
// linearGradient로 정확히 그 도형 안에서만 색이 나뉘게 해서 어떤 기기·브라우저에서도 항상
// 똑같이 깔끔한 반쪽 별로 보이게 함.
const STAR_PATH = "M12 1.5l3.09 6.26 6.91 1-5 4.87 1.18 6.88L12 17.27l-6.18 3.24L7 13.63l-5-4.87 6.91-1L12 1.5z";

export default function StarRating({ value, max = 5, size = 14, color = "var(--accent)", emptyColor = "var(--border)" }) {
  const rating = Math.max(0, Math.min(max, Number(value) || 0));
  const uid = useId();

  return (
    <span style={{ display: "inline-flex", gap: 1, verticalAlign: "middle" }}>
      {Array.from({ length: max }, (_, i) => {
        const fill = Math.max(0, Math.min(1, rating - i));
        const gradId = `star-${uid}-${i}`;
        const isPartial = fill > 0 && fill < 1;
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24" style={{ flex: "none", display: "block" }}>
            {isPartial && (
              <defs>
                <linearGradient id={gradId}>
                  <stop offset={`${fill * 100}%`} stopColor={color} />
                  <stop offset={`${fill * 100}%`} stopColor={emptyColor} />
                </linearGradient>
              </defs>
            )}
            <path d={STAR_PATH} fill={fill >= 1 ? color : fill <= 0 ? emptyColor : `url(#${gradId})`} />
          </svg>
        );
      })}
    </span>
  );
}
