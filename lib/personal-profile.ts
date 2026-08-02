export type ResearchedProject = {
  title: string;
  description: string;
  liveUrl: string;
  repoUrl: string;
  maturity: "live" | "substantial" | "prototype" | "learning";
  startupValue: string;
};

const github = (repo: string) => `https://github.com/akshhkaushik/${repo}`;

export const PERSONAL_RESEARCH_SUMMARY = [
  "Aksh Kaushik is a third-year BITS Pilani student and product-minded engineer who works across AI systems, full-stack products, data pipelines, fintech, developer tools, geospatial ML, workflow automation, and Web3 prototypes.",
  "His strongest pattern is turning ambiguous operational problems into inspectable products: deterministic workflows around AI, human approval gates, evidence and audit trails, typed APIs, background workers, and usable interfaces.",
  "For startups he can contribute to zero-to-one product builds, AI workflow automation, internal operations tooling, ingestion and migration pipelines, evaluation and provenance systems, developer-facing utilities, applied ML prototypes, and production hardening.",
  "Project maturity varies. Live and substantial projects are preferred as email evidence; prototypes are used only when they directly match the startup, and learning/template repositories must never be presented as production systems.",
].join(" ");

export const STARTUP_CAPABILITIES = [
  "Zero-to-one product engineering: scope an unclear workflow, build the backend and UI, and ship an inspectable proof of concept.",
  "AI workflow automation: multi-step agents, deterministic orchestration, human approval gates, retries, audit trails, structured output, and provider boundaries.",
  "Evidence and trust systems: provenance, claim history, citation-constrained retrieval, explainable assessment, and evaluation/regression tooling.",
  "Data operations: OCR, document extraction, schema mapping, local/private processing, background workers, migrations, and API integrations.",
  "Full-stack and platform work: Next.js/React, Python/FastAPI, Java/Spring, REST APIs, Postgres, Docker, CI/CD, observability, and responsive product interfaces.",
  "Fintech and compliance: fraud detection, core-banking migration, credit-bureau workflows, accounting automation, role-based access, and human-signature boundaries.",
  "Applied ML and data products: graph and sequence models, geospatial/environmental analysis, remote-sensing pipelines, and interactive visualization.",
  "Developer and local-first tools: public text/JSON surfaces for agents, CLI/worker workflows, browser extensions, offline/local inference, and privacy-aware processing.",
  "Web3 transparency prototypes: smart-contract workflows, traceable payments, wallet-connected interfaces, and transparent allocation concepts.",
  "Open-source collaboration: Mifos-related work, modular repository design, documentation, tests, and contribution-oriented delivery.",
];

export const RESEARCHED_PROJECTS: ResearchedProject[] = [
  {
    title: "Signal Personal Outreach",
    description: "A Next.js outreach product that researches company sites, matches Aksh's experience, drafts editable personalized email, embeds project links, attaches a résumé, and sends through Gmail only after approval.",
    liveUrl: "https://signal-personal-outreach.vercel.app/",
    repoUrl: github("EmailAutomator"), maturity: "live",
    startupValue: "AI-assisted workflow products, company research, safe email automation, OAuth, and polished review-first interfaces.",
  },
  {
    title: "Transcript Registry",
    description: "A live public, agent-readable YouTube transcript library with search, on-demand jobs, channel ingestion, Neon persistence, HTML/text/JSON outputs, resumable browser-local Whisper, and distributed contribution workers.",
    liveUrl: "https://transcript-registry.vercel.app", repoUrl: github("transcript-registry"), maturity: "live",
    startupValue: "Agent-facing APIs, background jobs, local/private compute, ingestion pipelines, public data products, and resilient workflow design.",
  },
  {
    title: "Transcript Commons",
    description: "The local-compute and discovery companion to Transcript Registry: captions-first discovery, permission-aware Whisper fallback, topic backfills, dataset research, and publication into a shared transcript database.",
    liveUrl: "https://transcript-commons.vercel.app", repoUrl: github("transcript-commons"), maturity: "substantial",
    startupValue: "Python workers, content ingestion, policy-aware processing, local ASR, dataset curation, and hybrid cloud/local architecture.",
  },
  {
    title: "Veritas",
    description: "An evidence-intelligence platform for public claims with provenance, history, normalization, claim/event intelligence, deterministic assessment, ingestion workers, hybrid retrieval, graph relationships, and production infrastructure.",
    liveUrl: "https://veritas-virid.vercel.app", repoUrl: github("veritas"), maturity: "substantial",
    startupValue: "Trust and safety, evidence lineage, explainable AI, event/claim data models, distributed services, and auditable decision systems.",
  },
  {
    title: "CEO Voice Platform",
    description: "An evidence-backed executive content system that separates measured voice, content structure, source authority, retrieval, generation, human edits, re-voice, and independent evaluation with immutable releases and reports.",
    liveUrl: github("ceo-voice-platform"), repoUrl: github("ceo-voice-platform"), maturity: "substantial",
    startupValue: "Governed AI generation, deterministic retrieval, evaluation, editorial workflows, typed Python systems, and Next.js product interfaces.",
  },
  {
    title: "CA-OS",
    description: "A multi-agent operating system prototype for Indian CA firms with deterministic GST/TDS/ITR workflows, human approval gates, client channels, autopilot scheduling, deliverable packs, and hash-chained audit logs.",
    liveUrl: github("CAI"), repoUrl: github("CAI"), maturity: "substantial",
    startupValue: "Vertical AI, regulated workflows, back-office automation, human-in-the-loop agents, compliance scheduling, and operational SaaS.",
  },
  {
    title: "VAYU",
    description: "A satellite remote-sensing and ML system for daily surface AQI estimation and HCHO hotspot detection over India, combining satellite, station, weather, fire, land-cover, spatial modeling, and a unified web application.",
    liveUrl: github("vayu-aqi-hcho"), repoUrl: github("vayu-aqi-hcho"), maturity: "substantial",
    startupValue: "Geospatial ML, scientific data fusion, environmental intelligence, spatial pipelines, model-backed maps, and research-to-product delivery.",
  },
  {
    title: "EvoComb",
    description: "An urban environmental stress mapping platform organized as a Turborepo with a Next.js interface, typed shared packages, MapLibre/deck.gl geospatial layers, 3D visualization, query state, and deployment infrastructure.",
    liveUrl: "https://evo-comb-web.vercel.app", repoUrl: github("EvoComb"), maturity: "substantial",
    startupValue: "Geospatial dashboards, complex interactive visualization, monorepos, typed frontend architecture, and environmental data products.",
  },
  {
    title: "Project Kalam",
    description: "A government-scheme eligibility assistant using natural-language profile extraction, deterministic rule matching, ambiguity handling, gap analysis, document checklists, adversarial profiles, and an AI-assisted scheme ingestion pipeline.",
    liveUrl: github("Project-Kalam"), repoUrl: github("Project-Kalam"), maturity: "substantial",
    startupValue: "Civic-tech onboarding, eligibility engines, explainable rules, document workflows, multilingual interfaces, and conservative AI decisions.",
  },
  {
    title: "Mifos X AI Suite",
    description: "A modular AI suite for digitizing paper financial records, generating Mifos/Fineract reports, and migrating legacy core-banking data using OCR, validation, human review, schema mapping, audit logs, APIs, and Dockerized workflows.",
    liveUrl: github("Mifos-Ai-Suite"), repoUrl: github("Mifos-Ai-Suite"), maturity: "substantial",
    startupValue: "Fintech migration, OCR, document intelligence, legacy modernization, human review, core-banking APIs, and batch operations.",
  },
  {
    title: "Credit Card Fraud Detection",
    description: "An applied fraud-detection pipeline combining graph attention, a continuous-time Transformer, learned fusion, synthetic-data filtering, a Flask prediction API, and a Manifest V3 browser-extension demonstration.",
    liveUrl: github("Credit-Card-Fraud-Detection--GAT-Transformer-Pipeline"), repoUrl: github("Credit-Card-Fraud-Detection--GAT-Transformer-Pipeline"), maturity: "substantial",
    startupValue: "Risk scoring, graph/sequential ML, model APIs, browser-integrated ML demonstrations, and fintech experimentation.",
  },
  {
    title: "CB-ILD",
    description: "A credit-bureau operations prototype with Spring Boot, Angular, MySQL, JWT/RBAC, audit logging, data migrations, Docker orchestration, credit/KYC workflows, and a responsive operational dashboard.",
    liveUrl: "https://cb-ild.vercel.app", repoUrl: github("cb-ild"), maturity: "prototype",
    startupValue: "Enterprise full-stack systems, credit operations, RBAC, auditability, Java APIs, Angular dashboards, and containerized delivery.",
  },
  {
    title: "PeeDF / CtrlP",
    description: "A college printing and delivery product concept for PDF upload, print configuration, automatic pricing, vendor order management, hostel delivery, and real-time order tracking during exam peaks.",
    liveUrl: github("PeeDF"), repoUrl: github("PeeDF"), maturity: "prototype",
    startupValue: "Marketplace operations, file workflows, pricing, order queues, vendor dashboards, and campus logistics.",
  },
  {
    title: "NetShaper",
    description: "An early Rust/Windows bandwidth-control system design using a Tokio daemon, token-bucket scheduling, WFP packet interception, typed IPC, mTLS enrollment, Tauri UI, and cross-platform CI boundaries.",
    liveUrl: github("Wifly"), repoUrl: github("Wifly"), maturity: "prototype",
    startupValue: "Systems programming, networking, security boundaries, IPC contracts, cross-platform tooling, and performance-aware design.",
  },
  {
    title: "BITS Wi-Fi Keepalive",
    description: "A small Bash utility that automates an authorized campus portal keepalive, with one-time local credential setup, restricted file permissions, reset/once modes, and background operation.",
    liveUrl: github("BitsPilaniAuthScript"), repoUrl: github("BitsPilaniAuthScript"), maturity: "substantial",
    startupValue: "Practical automation, CLI ergonomics, credential hygiene, diagnostics, and solving repetitive user pain with a narrow tool.",
  },
  {
    title: "Derivative Risk Management Analysis",
    description: "A quantitative analysis project covering futures pricing, margin simulation, statistics, term structure, sensitivity analysis, notebooks, spreadsheets, and a documented report for JSW Steel and RateGain instruments.",
    liveUrl: github("DRM_Project"), repoUrl: github("DRM_Project"), maturity: "substantial",
    startupValue: "Quantitative analysis, financial modeling, reproducible notebooks, spreadsheet deliverables, and risk/sensitivity workflows.",
  },
  {
    title: "Transparent Fest DApp",
    description: "A React/TypeScript prototype for transparent festival operations with wallet and Ethereum-oriented dependencies. Its README remains starter content, so it is treated as an experimental Web3 interface rather than a production claim.",
    liveUrl: github("DApp-for-fests-transparency"), repoUrl: github("DApp-for-fests-transparency"), maturity: "prototype",
    startupValue: "Wallet-connected interfaces, transparent allocation concepts, React product prototyping, and Web3 experimentation.",
  },
  {
    title: "Fair Pay for Every Play",
    description: "A researched Web3 music-royalty concept proposing smart-contract revenue splits, transparent payments, artist-owned rights, off-chain media storage, and direct artist/fan economics.",
    liveUrl: github("Fair-Pay-For-every-pay-"), repoUrl: github("Fair-Pay-For-every-pay-"), maturity: "prototype",
    startupValue: "Marketplace economics, transparent payments, smart-contract product design, creator tools, and Web3 business research.",
  },
  {
    title: "Web3 Todo DApp",
    description: "A React and Solidity learning project for wallet-connected task creation, completion, deletion, prioritization, filtering, and on-chain state.",
    liveUrl: github("postmanTask-TodoList-solidity-"), repoUrl: github("postmanTask-TodoList-solidity-"), maturity: "learning",
    startupValue: "Solidity fundamentals, wallet integration, CRUD interaction patterns, and responsive Web3 interfaces.",
  },
  {
    title: "Portfolio Website",
    description: "Aksh's TypeScript portfolio and public web presence.",
    liveUrl: "https://akshhkaushik.github.io/", repoUrl: github("akshhkaushik.github.io"), maturity: "live",
    startupValue: "Frontend delivery, personal presentation, and static deployment.",
  },
  {
    title: "Market Micro-Burst Detector UI",
    description: "A React/TypeScript market-analysis interface prototype. The repository currently carries starter documentation, so only its UI-prototyping evidence should be used.",
    liveUrl: github("MarketMicroBurstDetector"), repoUrl: github("MarketMicroBurstDetector"), maturity: "prototype",
    startupValue: "Rapid data-interface prototyping and modern React component systems.",
  },
  {
    title: "UniDex",
    description: "A React/TypeScript/Supabase product-interface prototype with forms, validation, responsive components, navigation, and broad UI primitives; the public README is still the starter template.",
    liveUrl: github("UniDex"), repoUrl: github("UniDex"), maturity: "prototype",
    startupValue: "Fast SaaS interface prototyping, Supabase integration, form-heavy UX, and reusable component composition.",
  },
  {
    title: "UP-14",
    description: "An Expo/React Native experimental application with file-based routing, mobile navigation, NativeWind, web views, and a small server surface; its README is still starter documentation.",
    liveUrl: github("UP-14"), repoUrl: github("UP-14"), maturity: "learning",
    startupValue: "Cross-platform mobile prototyping and React Native fundamentals.",
  },
  {
    title: "Competitive Programming Solutions",
    description: "A repository of Codeforces problem-solving work used as supporting evidence of algorithms and implementation practice, not as a shipped product.",
    liveUrl: github("Codeforces"), repoUrl: github("Codeforces"), maturity: "learning",
    startupValue: "Algorithms, debugging, implementation speed, and structured problem solving.",
  },
  {
    title: "mlr3hf Submission Research",
    description: "A GSoC contributor-test workspace containing easy/hard reports, Hugging Face task-conversion material, documentation, and mentor communication templates.",
    liveUrl: github("mlr3hf_submission_template"), repoUrl: github("mlr3hf_submission_template"), maturity: "learning",
    startupValue: "ML tooling research, technical reporting, open-source contribution preparation, and clear documentation.",
  },
  {
    title: "Postman React Task",
    description: "A small Create React App learning repository; use only as supporting evidence of frontend fundamentals.",
    liveUrl: github("postman_task"), repoUrl: github("postman_task"), maturity: "learning",
    startupValue: "React fundamentals and API-task practice.",
  },
  {
    title: "Project Red",
    description: "An early C++ learning repository; it should never be described as a production project.",
    liveUrl: github("Project-red"), repoUrl: github("Project-red"), maturity: "learning",
    startupValue: "C++ fundamentals and early programming practice.",
  },
  {
    title: "Project Chocolate",
    description: "An early CSS/web learning repository; it should never be described as a production project.",
    liveUrl: github("Project-Chocolate"), repoUrl: github("Project-Chocolate"), maturity: "learning",
    startupValue: "CSS and early web-development fundamentals.",
  },
];

