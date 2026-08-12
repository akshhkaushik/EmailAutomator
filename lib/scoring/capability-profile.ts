import { RESEARCHED_PROJECTS } from "../personal-profile.ts";
import type { CapabilityProject } from "./types.ts";

type ProjectMetadata = Pick<CapabilityProject, "technologies" | "problemDomains" | "capabilitiesDemonstrated">;

const PROJECT_METADATA: Record<string, ProjectMetadata> = {
  "Signal Personal Outreach": { technologies: ["TypeScript", "Next.js", "React", "OAuth", "Redis"], problemDomains: ["AI workflows", "sales operations"], capabilitiesDemonstrated: ["workflow automation", "human approval", "public research", "full-stack product engineering"] },
  "Transcript Registry": { technologies: ["TypeScript", "Next.js", "Python", "Postgres", "Whisper"], problemDomains: ["developer tools", "media data"], capabilitiesDemonstrated: ["data ingestion", "background jobs", "public APIs", "local-first processing"] },
  "Transcript Commons": { technologies: ["Python", "Whisper", "Postgres"], problemDomains: ["media data", "AI workflows"], capabilitiesDemonstrated: ["data ingestion", "local-first processing", "dataset curation"] },
  Veritas: { technologies: ["TypeScript", "Python", "Postgres", "Docker"], problemDomains: ["trust and safety", "evidence systems"], capabilitiesDemonstrated: ["evidence provenance", "data ingestion", "explainable AI", "distributed systems"] },
  "CEO Voice Platform": { technologies: ["TypeScript", "Next.js", "Python"], problemDomains: ["AI workflows", "content operations"], capabilitiesDemonstrated: ["governed generation", "evaluation", "human approval", "full-stack product engineering"] },
  "CA-OS": { technologies: ["TypeScript", "Python"], problemDomains: ["fintech", "compliance", "vertical SaaS"], capabilitiesDemonstrated: ["workflow automation", "human approval", "audit trails", "multi-agent systems"] },
  VAYU: { technologies: ["Python", "machine learning", "geospatial"], problemDomains: ["climate", "environmental intelligence"], capabilitiesDemonstrated: ["applied ML", "data fusion", "data visualization"] },
  EvoComb: { technologies: ["TypeScript", "Next.js", "React", "MapLibre", "deck.gl"], problemDomains: ["climate", "environmental intelligence"], capabilitiesDemonstrated: ["geospatial systems", "data visualization", "full-stack product engineering"] },
  "Project Kalam": { technologies: ["TypeScript", "AI"], problemDomains: ["civic tech", "eligibility systems"], capabilitiesDemonstrated: ["explainable rules", "document workflows", "conservative AI", "full-stack product engineering"] },
  "Mifos X AI Suite": { technologies: ["Python", "OCR", "Docker", "REST APIs"], problemDomains: ["fintech", "banking"], capabilitiesDemonstrated: ["document intelligence", "data migration", "human approval", "API integration"] },
  "Credit Card Fraud Detection": { technologies: ["Python", "machine learning", "Flask", "React"], problemDomains: ["fintech", "fraud detection"], capabilitiesDemonstrated: ["applied ML", "risk scoring", "API development"] },
  "CB-ILD": { technologies: ["Java", "Spring Boot", "Angular", "MySQL", "Docker"], problemDomains: ["fintech", "credit operations"], capabilitiesDemonstrated: ["RBAC", "audit trails", "data migration", "enterprise full-stack"] },
  "PeeDF / CtrlP": { technologies: ["web application"], problemDomains: ["marketplaces", "logistics"], capabilitiesDemonstrated: ["workflow automation", "operations tooling", "product prototyping"] },
  NetShaper: { technologies: ["Rust", "Tokio", "Tauri", "mTLS"], problemDomains: ["networking", "developer tools"], capabilitiesDemonstrated: ["systems programming", "security boundaries", "performance engineering"] },
  "BITS Wi-Fi Keepalive": { technologies: ["Bash", "CLI"], problemDomains: ["developer tools", "networking"], capabilitiesDemonstrated: ["workflow automation", "credential hygiene", "diagnostics"] },
  "Derivative Risk Management Analysis": { technologies: ["Python", "spreadsheets"], problemDomains: ["fintech", "quantitative finance"], capabilitiesDemonstrated: ["financial modeling", "data analysis", "reproducible research"] },
  "Transparent Fest DApp": { technologies: ["TypeScript", "React", "Ethereum"], problemDomains: ["Web3", "payments"], capabilitiesDemonstrated: ["wallet integration", "product prototyping", "transparent workflows"] },
  "Fair Pay for Every Play": { technologies: ["smart contracts", "Web3"], problemDomains: ["creator economy", "payments"], capabilitiesDemonstrated: ["marketplace design", "transparent workflows", "product research"] },
  "Web3 Todo DApp": { technologies: ["React", "Solidity", "Ethereum"], problemDomains: ["Web3", "developer tools"], capabilitiesDemonstrated: ["wallet integration", "CRUD interfaces"] },
  "Portfolio Website": { technologies: ["TypeScript", "web application"], problemDomains: ["developer tools"], capabilitiesDemonstrated: ["frontend engineering", "static deployment"] },
  "Market Micro-Burst Detector UI": { technologies: ["TypeScript", "React"], problemDomains: ["fintech", "market data"], capabilitiesDemonstrated: ["data visualization", "product prototyping"] },
  UniDex: { technologies: ["TypeScript", "React", "Supabase"], problemDomains: ["SaaS"], capabilitiesDemonstrated: ["frontend engineering", "form workflows", "product prototyping"] },
  "UP-14": { technologies: ["TypeScript", "React Native", "Expo"], problemDomains: ["mobile applications"], capabilitiesDemonstrated: ["mobile prototyping", "frontend engineering"] },
  "Competitive Programming Solutions": { technologies: ["algorithms"], problemDomains: ["developer tools"], capabilitiesDemonstrated: ["problem solving", "debugging"] },
  "mlr3hf Submission Research": { technologies: ["Python", "Hugging Face", "machine learning"], problemDomains: ["developer tools", "AI workflows"], capabilitiesDemonstrated: ["open-source collaboration", "technical writing", "ML tooling"] },
  "Postman React Task": { technologies: ["JavaScript", "React"], problemDomains: ["web applications"], capabilitiesDemonstrated: ["frontend engineering", "API integration"] },
  "Project Red": { technologies: ["C++"], problemDomains: ["developer tools"], capabilitiesDemonstrated: ["systems fundamentals", "problem solving"] },
  "Project Chocolate": { technologies: ["CSS", "web application"], problemDomains: ["web applications"], capabilitiesDemonstrated: ["frontend fundamentals", "responsive design"] },
};

function projectId(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const AKSH_CAPABILITY_PROFILE: CapabilityProject[] = RESEARCHED_PROJECTS.map((project) => {
  const metadata = PROJECT_METADATA[project.title];
  if (!metadata) throw new Error(`Structured capability metadata is missing for ${project.title}.`);
  return {
    id: projectId(project.title),
    name: project.title,
    description: project.description,
    ...metadata,
    repositoryUrl: project.repoUrl,
    demoUrl: project.liveUrl,
    maturity: project.maturity,
  };
});
