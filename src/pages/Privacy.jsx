import { Link } from "react-router-dom";
import { Card } from "../components/ui.jsx";

export default function Privacy() {
  return (
    <div className="fade-in" style={{ maxWidth: 640, margin: "0 auto", padding: "48px 20px" }}>
      <Link to="/" style={{ fontSize: 12.5, color: "var(--text-sub)" }}>← 돌아가기</Link>
      <h1 style={{ marginTop: 16, marginBottom: 20, fontSize: 22 }}>개인정보처리방침</h1>
      <Card style={{ display: "flex", flexDirection: "column", gap: 16, fontSize: 13.5, lineHeight: 1.7, color: "var(--text-sub)" }}>
        <section>
          <h2 style={{ color: "var(--text)", fontSize: 14, marginBottom: 6 }}>1. 수집하는 개인정보</h2>
          <p>Google 로그인 시 이름, 이메일 주소, 프로필 사진을 수집합니다. 이후 이용자가 직접 입력하는 성향 테스트 결과, 모임 일정, 플레이 기록, 친구 목록도 저장됩니다.</p>
        </section>
        <section>
          <h2 style={{ color: "var(--text)", fontSize: 14, marginBottom: 6 }}>2. 개인정보의 이용 목적</h2>
          <p>수집된 정보는 로그인 식별, 성향 궁합 계산, 모임 참석 관리, 서비스 개선 목적으로만 사용되며 광고 목적으로 이용하지 않습니다.</p>
        </section>
        <section>
          <h2 style={{ color: "var(--text)", fontSize: 14, marginBottom: 6 }}>3. 개인정보의 보관 및 제3자 제공</h2>
          <p>모든 데이터는 Google Firebase(Firestore) 서버에 저장됩니다. 서비스 운영을 위해 이용하는 Google Firebase 외에는 제3자에게 개인정보를 제공하지 않습니다.</p>
        </section>
        <section>
          <h2 style={{ color: "var(--text)", fontSize: 14, marginBottom: 6 }}>4. 이용자의 권리</h2>
          <p>이용자는 언제든지 자신의 정보 삭제를 요청할 수 있습니다. 서비스 운영자에게 이메일로 요청해주시면 계정 및 관련 데이터를 삭제해드립니다.</p>
        </section>
        <section>
          <h2 style={{ color: "var(--text)", fontSize: 14, marginBottom: 6 }}>5. 문의</h2>
          <p>개인정보 관련 문의는 서비스 운영자에게 이메일로 연락해주세요.</p>
        </section>
      </Card>
    </div>
  );
}
