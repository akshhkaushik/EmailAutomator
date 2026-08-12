export type AcceleratorCatalogEntry = {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4;
  aliases: string[];
  focus: string[];
};

const entry = (id: string, name: string, tier: 1 | 2 | 3 | 4, focus: string[], aliases: string[] = []): AcceleratorCatalogEntry => ({ id, name, tier, aliases, focus });

// User-curated catalog. Duplicate mentions are represented as aliases/focus tags,
// not additional accelerator records. Public portfolio URLs remain user-confirmed.
export const ACCELERATOR_CATALOG: AcceleratorCatalogEntry[] = [
  entry("accel", "Accel", 1, ["early-stage", "global"]),
  entry("y-combinator", "Y Combinator", 1, ["large-public-portfolio", "early-stage"], ["YC"]),
  entry("techstars", "Techstars", 1, ["global", "specialized-programs"]),
  entry("500-global", "500 Global", 1, ["global", "international"]),
  entry("antler", "Antler", 1, ["very-early-stage", "small-teams"]),
  entry("entrepreneur-first", "Entrepreneur First", 1, ["technical-founders", "europe"], ["EF", "Entrepreneur First London"]),
  entry("a16z-speedrun", "a16z Speedrun", 1, ["ai", "consumer", "technical"]),
  entry("sequoia-arc", "Sequoia Arc", 1, ["technical", "early-stage"]),
  entry("south-park-commons", "South Park Commons", 1, ["technical-founders"], ["SPC"]),
  entry("hf0", "HF0", 1, ["small-teams", "highly-technical"]),
  entry("neo", "Neo", 1, ["technical", "ai"], ["NEO"]),
  entry("pearx", "PearX", 1, ["early-stage"]),
  entry("sosv-hax", "SOSV / HAX", 1, ["deep-tech", "hardware", "technical"], ["SOSV", "HAX", "Deep Tech / HAX"]),
  entry("seedcamp", "Seedcamp", 1, ["europe", "early-stage"]),
  entry("berkeley-skydeck", "Berkeley SkyDeck", 1, ["technical", "academic"]),
  entry("alchemist", "Alchemist Accelerator", 1, ["b2b", "deep-tech"], ["Alchemist"]),
  entry("launch", "LAUNCH Accelerator", 1, ["early-stage", "technology"]),
  entry("betaworks-camp", "Betaworks Camp", 1, ["ai", "consumer", "internet"]),
  entry("ai2-incubator", "AI2 Incubator", 1, ["ai-native"]),
  entry("founders-inc", "Founders, Inc.", 1, ["technical", "defense", "ai"]),
  entry("conviction-embed", "Conviction Embed", 1, ["ai", "technical"]),

  entry("soma-capital", "SOMA Capital", 2, ["technical", "ai"]),
  entry("ai-grant", "AI Grant", 2, ["ai-native"]),
  entry("startup-wise-guys", "Startup Wise Guys", 2, ["europe", "b2b"]),
  entry("apx", "APX", 2, ["europe", "early-stage"]),
  entry("founders-factory", "Founders Factory", 2, ["europe", "corporate-programs"]),
  entry("hexa", "Hexa", 2, ["europe", "startup-studio"]),
  entry("station-f", "Station F / Founders Program", 2, ["europe", "founder-program"]),
  entry("techstars-europe", "Techstars Europe", 2, ["europe", "regional-program"]),
  entry("accel-atoms", "Accel Atoms", 2, ["india", "very-early-stage"]),
  entry("antler-india", "Antler India", 2, ["india", "very-early-stage"]),
  entry("peak-xv-surge", "Peak XV Surge", 2, ["india", "early-stage"]),
  entry("100x-vc", "100X.VC", 2, ["india", "early-stage"]),
  entry("india-accelerator", "India Accelerator", 2, ["india"]),
  entry("venture-catalysts", "Venture Catalysts", 2, ["india"]),
  entry("c-camp", "C-CAMP", 2, ["india", "deep-tech", "biotech"]),
  entry("nsrcel", "NSRCEL", 2, ["india", "academic"]),
  entry("t-hub", "T-Hub", 2, ["india", "technology"]),
  entry("kerala-startup-mission", "Kerala Startup Mission", 2, ["india", "regional"]),
  entry("iim-calcutta-innovation-park", "IIM Calcutta Innovation Park", 2, ["india", "academic"]),
  entry("nasscom-10000", "NASSCOM 10,000 Startups", 2, ["india", "technology"]),

  entry("plug-and-play", "Plug and Play", 3, ["global", "corporate-network"]),
  entry("masschallenge", "MassChallenge", 3, ["global", "large-network"]),
  entry("startupbootcamp", "Startupbootcamp", 3, ["global", "industry-programs"]),
  entry("google-for-startups", "Google for Startups", 3, ["global", "corporate-program"]),
  entry("microsoft-for-startups", "Microsoft for Startups", 3, ["global", "corporate-program"]),
  entry("nvidia-inception", "NVIDIA Inception", 3, ["ai", "deep-tech", "corporate-program"]),
  entry("aws-activate", "AWS Activate", 3, ["cloud", "corporate-program"]),
  entry("oracle-for-startups", "Oracle for Startups", 3, ["enterprise", "corporate-program"]),
  entry("sap-io", "SAP.iO", 3, ["enterprise", "corporate-program"]),
  entry("barclays-accelerator", "Barclays Accelerator", 3, ["fintech", "corporate-program"]),
  entry("comcast-lift-labs", "Comcast NBCUniversal LIFT Labs", 3, ["media", "corporate-program"]),
  entry("lufthansa-innovation-hub", "Lufthansa Innovation Hub", 3, ["travel", "corporate-program"]),
  entry("techstars-corporate", "Techstars Corporate Programs", 3, ["global", "corporate-programs"]),

  entry("pioneer", "Pioneer", 4, ["small-teams", "hidden-gems"]),
  entry("on-deck", "On Deck", 4, ["founder-community"]),
  entry("forum-ventures", "Forum Ventures", 4, ["b2b", "early-stage"]),
  entry("iterative", "Iterative", 4, ["southeast-asia", "early-stage"]),
  entry("village-global", "Village Global", 4, ["early-stage", "founder-network"]),
  entry("the-mint", "The Mint", 4, ["small-teams"]),
  entry("muckerlab", "MuckerLab", 4, ["early-stage"]),
  entry("indie-hackers", "Indie Hackers", 4, ["bootstrapped", "small-teams"]),
  entry("tinyseed", "TinySeed", 4, ["saas", "bootstrapped"]),
  entry("launch-house", "Launch House", 4, ["founder-community"]),
  entry("contrary", "Contrary", 4, ["early-stage", "founder-network"]),
  entry("susa-founder-programs", "Susa Ventures founder programs", 4, ["founder-program"]),
  entry("weekend-fund", "Weekend Fund", 4, ["small-teams", "early-stage"]),
  entry("chapter-one", "Chapter One", 4, ["early-stage"]),
  entry("lunar-ventures", "Lunar Ventures", 4, ["europe", "deep-tech"]),
  entry("speedinvest-programs", "Speedinvest programs", 4, ["europe", "early-stage"]),
  entry("creative-destruction-lab", "Creative Destruction Lab", 4, ["deep-tech", "academic"]),
  entry("indie-vc", "Indie.vc", 4, ["bootstrapped", "small-teams"]),
  entry("reaktor-ventures", "Reaktor Ventures programs", 4, ["europe", "technical"]),
];

export const ACCELERATOR_TIERS = [1, 2, 3, 4] as const;
