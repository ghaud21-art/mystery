import { Link } from "react-router-dom";
import { Card } from "../components/ui.jsx";

export default function Terms() {
  return (
    <div className="fade-in" style={{ maxWidth: 640, margin: "0 auto", padding: "48px 20px" }}>
      <Link to="/" style={{ fontSize: 12.5, color: "var(--text-sub)" }}>← 돌아가기</Link>
      <h1 style={{ marginTop: 16, marginBottom: 20, fontSize: 22 }}>이용약관</h1>
      <Card style={{ display: "flex", flexDirection: "column", gap: 16, fontSize: 13.5, lineHeight: 1.7, color: "var(--text-sub)" }}>
        <section>
          <h2 style={{ color: "var(--text)", fontSize: 14, marginBottom: 6 }}>1. 서비스 소개</h2>
          <p>머더미스터리(이하 "서비스")는 추리게임·방탈출을 좋아하는 사람들이 모임 일정을 공유하고, 플레이 기록을 남기고, 성향 궁합을 확인할 수 있도록 제공하는 커뮤니티 서비스입니다.</p>
        </section>
        <section>
          <h2 style={{ color: "var(--text)", fontSize: 14, marginBottom: 6 }}>2. 가입 및 이용</h2>
          <p>서비스는 Google 계정을 통한 로그인만 지원합니다. 가입 시 이름, 이메일, 프로필 사진이 수집되며, 이는 서비스 이용을 위한 최소한의 정보입니다.</p>
        </section>
        <section>
          <h2 style={{ color: "var(--text)", fontSize: 14, marginBottom: 6 }}>3. 이용자의 책임</h2>
          <p>이용자는 본인이 작성한 모임 정보, 기록, 후기 등 게시물에 대해 스스로 책임집니다. 타인에게 불쾌감을 주는 게시물, 허위 정보는 통보 없이 삭제될 수 있습니다.</p>
        </section>
        <section>
          <h2 style={{ color: "var(--text)", fontSize: 14, marginBottom: 6 }}>4. 서비스 변경 및 중단</h2>
          <p>서비스는 무료로 운영되는 개인 프로젝트로, 운영 사정에 따라 기능이 변경되거나 서비스가 중단될 수 있습니다.</p>
        </section>
        <section>
          <h2 style={{ color: "var(--text)", fontSize: 14, marginBottom: 6 }}>5. 문의</h2>
          <p>이용 중 문의사항은 서비스 운영자에게 이메일로 연락해주세요.</p>
        </section>
      </Card>
    </div>
  );
}
