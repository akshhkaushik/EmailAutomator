const CONCEPT_ALIASES: Record<string, readonly string[]> = {
  "ai-workflows": ["ai", "artificial intelligence", "agent", "agents", "llm", "automation", "workflow"],
  "applied-ml": ["machine learning", "ml", "model", "prediction", "classification"],
  "full-stack": ["full-stack", "full stack", "saas", "web app", "web application", "platform"],
  frontend: ["frontend", "react", "next.js", "nextjs", "angular", "user interface", "ui"],
  typescript: ["typescript", "javascript", "node.js", "nodejs"],
  python: ["python", "fastapi", "flask"],
  java: ["java", "spring boot", "spring"],
  rust: ["rust", "tokio", "tauri"],
  data: ["data pipeline", "data ingestion", "etl", "dataset", "analytics", "database", "postgres", "redis", "supabase", "mysql"],
  "developer-tools": ["developer tool", "developer tools", "api", "sdk", "cli", "open source", "open-source"],
  evidence: ["evidence", "provenance", "trust", "audit", "explainable", "verification"],
  fintech: ["fintech", "finance", "banking", "credit", "fraud", "accounting", "payment", "payments", "risk"],
  compliance: ["compliance", "regulated", "tax", "gst", "tds", "itr", "kyc"],
  documents: ["document", "documents", "ocr", "pdf", "transcript", "extraction"],
  geospatial: ["geospatial", "satellite", "map", "mapping", "remote sensing", "climate", "environmental"],
  web3: ["web3", "blockchain", "ethereum", "solidity", "smart contract", "wallet"],
  security: ["security", "mtls", "authentication", "authorization", "rbac", "privacy"],
  systems: ["systems programming", "networking", "distributed", "performance", "infrastructure"],
  mobile: ["mobile", "react native", "expo", "android", "ios"],
  marketplaces: ["marketplace", "marketplaces", "logistics", "orders", "creator economy"],
  visualization: ["visualization", "dashboard", "map", "charts", "analytics interface"],
};

function escaped(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function extractCapabilityConcepts(parts: string[]) {
  const text = parts.join(" ").toLowerCase();
  return Object.entries(CONCEPT_ALIASES).flatMap(([concept, aliases]) =>
    aliases.some((alias) => new RegExp(`(^|[^a-z0-9])${escaped(alias)}([^a-z0-9]|$)`, "i").test(text)) ? [concept] : [],
  );
}

export function conceptLabel(concept: string) { return concept.replaceAll("-", " "); }
