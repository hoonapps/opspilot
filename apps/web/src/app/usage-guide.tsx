type UsageGuideProps = {
  mode?: "panel" | "page";
};

const usageSteps = [
  {
    title: "인프라와 API 실행",
    body: "PostgreSQL, Redis를 올리고 마이그레이션 후 API와 웹 콘솔을 실행합니다.",
    commands: ["docker compose up -d postgres redis", "pnpm --filter @opspilot/api db:migrate", "pnpm dev:api / pnpm dev:web"]
  },
  {
    title: "기본 문서 색인",
    body: "seed/documents의 Markdown 운영 문서, 정책, 에러 코드, 장애 대응 문서를 RAG 인덱스에 넣습니다.",
    commands: ["pnpm ingest", "문서 화면에서 색인 새로고침"]
  },
  {
    title: "새 문서 등록 검증",
    body: "문서 화면에서 Markdown을 등록하면 청킹, 버전 이력, 검색 미리보기, 답변 일치율까지 한 번에 검증합니다.",
    commands: ["문서 화면에서 등록하고 RAG 검증", "색인 문서 검색 성공 / 출처 적중 확인"]
  },
  {
    title: "질문과 권한 경계 확인",
    body: "일반 질문은 자동 답변하고, 운영 DB 수정 같은 민감 작업은 승인 요청으로 분리됩니다.",
    commands: ["질문 화면에서 OpsPilot에 질문", "검색 화면에서 권한 감사의 허용/차단 후보 확인"]
  },
  {
    title: "품질 게이트 확인",
    body: "평가, 문서 일치율, SLO, 배포 게이트를 확인해 RAG 품질이 현재 문서 상태와 맞는지 봅니다.",
    commands: [
      "pnpm eval",
      "pnpm freshness:smoke",
      "pnpm release-gate:smoke",
      "pnpm evidence-bundle:smoke",
      "품질 화면에서 평가 불러오기 / 운영 지표 불러오기"
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
    body: "문서 출처, 문서 일치율, 답변 변경 감지, 증거 번들 해시, 권한 차단 후보, 도구 호출, 승인 요청, 평가 결과, 배포 게이트 상태를 순서대로 보여주면 됩니다."
  },
  {
    title: "문서를 어디서 관리하나?",
    body: "로컬 샘플은 seed/documents, 앱에서 추가하는 문서는 문서 화면, GitHub 문서는 GitHub 문서 동기화로 관리합니다."
  },
  {
    title: "청킹과 RAG 검색은 어디서 보나?",
    body: "문서 화면의 청크 미리보기와 검색 화면의 후보 청크 순위에서 실제 청크, 점수, 권한 차단 결과를 확인합니다."
  },
  {
    title: "문서 일치율은 어디서 보나?",
    body: "질문 화면 답변 상단, 추적, 증명 패킷, 증거 번들, 품질 화면 평가 지표에서 답변과 근거 문서의 일치율을 확인합니다."
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
        <span className="badge">5분 데모</span>
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
