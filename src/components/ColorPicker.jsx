import { useRef } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase.js";
import { PRESET_COLORS } from "../lib/colors.js";

const MAX_CUSTOM_COLORS = 12;

// 직접 고른 색을 users/{uid}.customColors에 최근 사용순으로 저장해서, 다음엔 어디서(개인 일정,
// 모임 색상 등) 고르든 다시 꺼내 쓸 수 있게 한다. 프리셋 색은 항상 뜨니까 따로 안 저장함.
export async function saveCustomColor(profile, setProfile, hex) {
  if (!profile || !hex || PRESET_COLORS.includes(hex)) return;
  const existing = profile.customColors || [];
  if (existing[0] === hex) return;
  const next = [hex, ...existing.filter((c) => c !== hex)].slice(0, MAX_CUSTOM_COLORS);
  await updateDoc(doc(db, "users", profile.id), { customColors: next });
  setProfile((p) => ({ ...p, customColors: next }));
}

// 프리셋 스와치 + 내가 이전에 고른 색(customColors) + 완전 자유 선택(네이티브 컬러피커)을 모두 제공.
export default function ColorPicker({ value, onSelect, profile, setProfile, size = 28 }) {
  const pendingCustomRef = useRef(null);
  const customColors = (profile?.customColors || []).filter((c) => !PRESET_COLORS.includes(c));

  function handleNativeChange(e) {
    const hex = e.target.value;
    pendingCustomRef.current = hex;
    onSelect(hex);
  }

  async function handleNativeBlur() {
    if (pendingCustomRef.current) {
      await saveCustomColor(profile, setProfile, pendingCustomRef.current);
      pendingCustomRef.current = null;
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {PRESET_COLORS.map((c) => (
          <button key={c} type="button" onClick={() => onSelect(c)} style={swatchStyle(c, value === c, size)} />
        ))}
        <label
          title="색상 직접 선택"
          style={{
            position: "relative", width: size, height: size, borderRadius: "50%", overflow: "hidden",
            border: "2px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", flex: "none", background: "var(--bg-sub)",
          }}
        >
          <span style={{ fontSize: size * 0.55, color: "var(--text-sub)", lineHeight: 1 }}>+</span>
          <input
            type="color"
            value={value || PRESET_COLORS[0]}
            onChange={handleNativeChange}
            onBlur={handleNativeBlur}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", border: "none", padding: 0 }}
          />
        </label>
      </div>

      {customColors.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, color: "var(--text-sub)", marginBottom: 6 }}>내가 쓴 색</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {customColors.map((c) => (
              <button key={c} type="button" onClick={() => onSelect(c)} style={swatchStyle(c, value === c, size)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function swatchStyle(c, selected, size) {
  return {
    width: size, height: size, borderRadius: "50%", background: c, padding: 0, flex: "none",
    border: selected ? "3px solid var(--text)" : "2px solid transparent",
  };
}
