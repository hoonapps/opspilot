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
    body: "문서 화면에서 Markdown을 등록하면 저장, 청킹, 임베딩, 색인 품질 리포트, 검색 미리보기, 답변 일치율 검증을 한 번에 실행합니다.",
    commands: ["문서 화면 > Markdown 등록", "등록하고 RAG 검증", "색인 품질 리포트 / 출처 적중 / 문서 일치율 확인", "문서 선택 > 색인 설명 / 영향 분석"]
  },
  {
    title: "청킹과 검색 품질 확인",
    body: "문서 화면에서 청크 커버리지, 헤딩 보존, 임베딩 커버리지, 검색 힌트를 확인하고, 검색 화면에서 답변 생성 전에 후보 청크, 점수 격차, 출처 다양성, 컨텍스트 예산, 질문 변형 안정성을 확인합니다.",
    commands: [
      "문서 화면 > 품질 검사",
      "문서 선택 > 색인 설명",
      "검색 화면 > 검색 미리보기",
      "권한 감사 허용/차단 후보 확인",
      "검색 품질 진단 확인",
      "질문 변형 안정성 진단",
      "pnpm index-explain:smoke",
      "pnpm retrieval-robustness:smoke"
    ]
  },
  {
    title: "장애 대응 플랜 생성",
    body: "대응 화면에서 장애 상황을 입력하면 운영 런북을 근거로 심각도, 단계별 조치, 승인 경계, 커뮤니케이션, 복구 검증 조건을 생성합니다.",
    commands: ["대응 화면 > 장애 대응 플랜 생성", "SEV / 승인 게이트 / 복구 검증 확인", "pnpm incident-plan:smoke"]
  },
  {
    title: "질문과 권한 경계 확인",
    body: "일반 질문은 출처와 함께 자동 답변하고, 운영 DB 수정 같은 민감 작업은 사람 승인 요청으로 분리합니다. 답변 신뢰 게이트에서 공유 가능/검토 후 공유/차단 판정을 확인합니다.",
    commands: ["질문 화면 > OpsPilot에 질문", "답변 신뢰 게이트 / 문서 일치율 / 출처 / 도구 호출 확인", "피드백 저장 후 게이트 재확인", "승인 화면 > 민감 작업 승인 또는 반려"]
  },
  {
    title: "평가와 배포 게이트 확인",
    body: "답변 단위 신뢰 게이트와 별도로, 평가, 문서 일치율, SLO, 배포 게이트, 운영 액션 플랜, API 요청 성공률을 확인해 현재 지식 베이스가 배포 가능한지 판단합니다.",
    commands: [
      "pnpm eval",
      "pnpm retrieval-robustness:smoke",
      "pnpm index-explain:smoke",
      "pnpm index-quality:smoke",
      "pnpm incident-plan:smoke",
      "pnpm freshness:smoke",
      "pnpm release-gate:smoke",
      "pnpm action-plan:smoke",
      "pnpm evidence-bundle:smoke",
      "pnpm quality-gate:smoke",
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
    body: "문서 출처, 문서 일치율, 답변 신뢰 게이트, 답변 변경 감지, 증거 번들 해시, 권한 차단 후보, 도구 호출, 승인 요청, 평가 결과, 배포 게이트, API 성공률을 순서대로 보여주면 됩니다."
  },
  {
    title: "문서를 어디서 관리하나?",
    body: "로컬 샘플은 seed/documents, 앱에서 추가하는 문서는 문서 화면, GitHub 문서는 GitHub 문서 동기화로 관리합니다. 같은 경로로 다시 등록하면 새 버전과 변경 차이, 과거 답변 영향 분석이 남습니다."
  },
  {
    title: "청킹과 RAG 검색은 어디서 보나?",
    body: "문서 화면의 색인 설명, 색인 품질 리포트와 청크 미리보기, 검색 화면의 후보 청크 순위와 검색 강건성 리포트에서 실제 청크, 점수, 권한 차단 결과, 컨텍스트 예산 포함 여부, 질문 변형별 1순위 출처 안정성을 확인합니다."
  },
  {
    title: "문서 일치율은 어디서 보나?",
    body: "질문 화면 답변 상단, 답변 신뢰 게이트, 추적, 증명 패킷, 증거 번들, 품질 화면 평가 지표에서 답변과 근거 문서의 일치율을 확인합니다."
  },
  {
    title: "권한 경계는 어떻게 설명하나?",
    body: "문서 권한은 검색 SQL과 Elasticsearch 결과 재검사 단계에서 적용됩니다. 접근 불가 청크는 답변 생성 프롬프트에 들어가기 전에 제거됩니다."
  },
  {
    title: "도구 호출은 어떻게 증명하나?",
    body: "감사 화면에서 도구 레지스트리를 확인하고, 대응 화면의 감사 번들에서 search_documents, create_runbook_checklist, create_incident_response_plan의 정책 통과 여부와 출처 계보를 다시 검증합니다."
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
