type UsageGuideProps = {
  mode?: "panel" | "page";
};

const usageSteps = [
  {
    title: "로컬 인프라 준비",
    body: "PostgreSQL과 Redis를 실행하고 최신 마이그레이션을 적용합니다. Elasticsearch는 하이브리드 검색을 보여줄 때만 선택적으로 켭니다.",
    commands: ["pnpm install", "cp .env.example apps/api/.env", "docker compose up -d postgres redis", "pnpm --filter @opspilot/api db:migrate"]
  },
  {
    title: "기본 문서 색인",
    body: "seed/documents의 Markdown 운영 문서, 정책, 에러 코드, 장애 대응 문서를 청킹하고 임베딩을 저장합니다.",
    commands: ["pnpm ingest", "문서 화면 > 색인 새로고침"]
  },
  {
    title: "API와 웹 콘솔 실행",
    body: "API와 Next.js 콘솔을 각각 실행한 뒤 브라우저에서 한국어 콘솔을 확인합니다.",
    commands: ["pnpm dev:api", "pnpm dev:web", "http://localhost:3001", "API 문서: http://localhost:3000/docs"]
  },
  {
    title: "새 문서 등록 검증",
    body: "문서 화면에서 Markdown을 등록하면 저장, 청킹, 임베딩, 검색 미리보기, 답변 일치율 검증을 한 번에 실행합니다.",
    commands: ["문서 화면 > Markdown 등록", "등록하고 RAG 검증", "출처 적중 / 문서 일치율 확인"]
  },
  {
    title: "청킹과 검색 품질 확인",
    body: "검색 화면에서 답변 생성 전에 후보 청크, 점수 격차, 출처 다양성, 컨텍스트 예산 포함 여부를 확인합니다.",
    commands: ["검색 화면 > 검색 미리보기", "권한 감사 허용/차단 후보 확인", "검색 품질 진단 확인"]
  },
  {
    title: "질문과 권한 경계 확인",
    body: "일반 질문은 출처와 함께 자동 답변하고, 운영 DB 수정 같은 민감 작업은 사람 승인 요청으로 분리합니다.",
    commands: ["질문 화면 > OpsPilot에 질문", "문서 일치율 / 출처 / 도구 호출 확인", "승인 화면 > 민감 작업 승인 또는 반려"]
  },
  {
    title: "품질 게이트 확인",
    body: "평가, 문서 일치율, SLO, 배포 게이트, API 요청 성공률을 확인해 현재 지식 베이스가 배포 가능한지 판단합니다.",
    commands: [
      "pnpm eval",
      "pnpm freshness:smoke",
      "pnpm release-gate:smoke",
      "pnpm evidence-bundle:smoke",
      "품질 화면 > 평가 불러오기 / 운영 지표 불러오기"
    ]
  },
  {
    title: "포트폴리오 데모 리포트 생성",
    body: "터미널에서 핵심 증거를 JSON/Markdown 리포트로 만들고, 웹 스모크 테스트로 화면까지 검증합니다.",
    commands: ["pnpm portfolio:demo", "pnpm portfolio:report", "pnpm web:smoke"]
  }
];

const checklist = [
  {
    title: "데모에서 보여줄 핵심 증거",
    body: "문서 출처, 문서 일치율, 답변 변경 감지, 증거 번들 해시, 권한 차단 후보, 도구 호출, 승인 요청, 평가 결과, 배포 게이트, API 성공률을 순서대로 보여주면 됩니다."
  },
  {
    title: "문서를 어디서 관리하나?",
    body: "로컬 샘플은 seed/documents, 앱에서 추가하는 문서는 문서 화면, GitHub 문서는 GitHub 문서 동기화로 관리합니다. 같은 경로로 다시 등록하면 새 버전과 변경 차이가 남습니다."
  },
  {
    title: "청킹과 RAG 검색은 어디서 보나?",
    body: "문서 화면의 청크 미리보기와 검색 화면의 후보 청크 순위에서 실제 청크, 점수, 권한 차단 결과, 컨텍스트 예산 포함 여부를 확인합니다."
  },
  {
    title: "문서 일치율은 어디서 보나?",
    body: "질문 화면 답변 상단, 추적, 증명 패킷, 증거 번들, 품질 화면 평가 지표에서 답변과 근거 문서의 일치율을 확인합니다."
  },
  {
    title: "권한 경계는 어떻게 설명하나?",
    body: "문서 권한은 검색 SQL과 Elasticsearch 결과 재검사 단계에서 적용됩니다. 접근 불가 청크는 답변 생성 프롬프트에 들어가기 전에 제거됩니다."
  },
  {
    title: "도구 호출은 어떻게 증명하나?",
    body: "감사 화면에서 search_documents, create_runbook_checklist, request_human_approval 호출 이력과 상태를 확인하고, 증거 번들에서 같은 내용을 다시 검증합니다."
  }
];

export function UsageGuide({ mode = "panel" }: UsageGuideProps) {
  return (
    <section className={mode === "page" ? "usagePanel usagePage" : "usagePanel"} aria-label="OpsPilot 사용법">
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">사용법</p>
          <h2>로컬 데모 실행 순서</h2>
        </div>
        <span className="badge">10분 데모</span>
      </div>
      <div className="usageGrid">
        {usageSteps.map((step, index) => (
          <article key={step.title}>
            <span>{index + 1}</span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.body}</p>
              {step.commands.map((command) => (
                <code key={command}>{command}</code>
              ))}
            </div>
          </article>
        ))}
      </div>
      <div className="usageChecklist">
        {checklist.map((item) => (
          <div key={item.title}>
            <strong>{item.title}</strong>
            <p>{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
