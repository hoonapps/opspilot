import { UsageGuide } from "../usage-guide";

export default function UsagePage() {
  return (
    <main className="usagePageShell">
      <header className="usagePageHeader">
        <a href="/" className="backLink">
          OpsPilot 콘솔로 돌아가기
        </a>
        <p className="eyebrow">OpsPilot 가이드</p>
        <h1>사용법</h1>
        <p>
          로컬 실행, 문서 색인, RAG 검색 검증, 권한 경계, 도구 호출, 품질 게이트까지 제품을 확인하는 순서대로
          정리했습니다.
        </p>
      </header>
      <UsageGuide mode="page" />
    </main>
  );
}
