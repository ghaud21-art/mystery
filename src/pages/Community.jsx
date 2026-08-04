import { Card, EmptyState, PageHeader } from "../components/ui.jsx";

export default function Community() {
  return (
    <div className="fade-in">
      <PageHeader eyebrow="BULLETIN BOARD" title="커뮤니티" />
      <Card>
        <EmptyState>
          후기·모집 게시판은 곧 열립니다. 📋
          <br />
          다음 단계에서 함께 만들어요.
        </EmptyState>
      </Card>
    </div>
  );
}
