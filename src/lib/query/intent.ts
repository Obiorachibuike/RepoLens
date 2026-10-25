/**
 * Deterministic natural-language → GitHub query interpretation.
 *
 * RepoLens' "Find Repo" and "Project Idea" modes translate plain English into
 * real GitHub search qualifiers *without* an AI service, so discovery always
 * works offline and the transformation is fully explainable to the user.
 * Every field below is derived only from the user's text and this dictionary.
 */

export interface TechnologyEntry {
  /** Canonical display name. */
  name: string;
  /** Strings that map to this technology (lowercase). */
  aliases: string[];
  /** GitHub `language:` qualifier, when the technology implies one. */
  language?: string;
  /** GitHub topics strongly associated with the technology. */
  topics: string[];
}

export interface DetectedTechnology {
  term: string;
  name: string;
  language: string | null;
  topics: string[];
}

export interface IntentSignals {
  lightweight: boolean;
  beginnerFriendly: boolean;
  popular: boolean;
  activelyMaintained: boolean;
  selfHosted: boolean;
  productionReady: boolean;
  /** Set when the user asks for an "alternative to <product>". */
  alternativeTo: string | null;
}

export interface ExtractedIntent {
  rawText: string;
  /** Meaningful free-text words left after qualifier/technology extraction. */
  keywords: string[];
  technologies: DetectedTechnology[];
  topics: string[];
  /** GitHub qualifiers typed by the user, preserved verbatim. */
  qualifiers: string[];
  signals: IntentSignals;
  /** Words removed as noise, shown in the explanation panel. */
  ignored: string[];
}

/* -------------------------------------------------------------------------- */
/* Knowledge base                                                             */
/* -------------------------------------------------------------------------- */

const TECHNOLOGIES: TechnologyEntry[] = [
  { name: "React", aliases: ["react", "reactjs", "react.js"], language: "TypeScript", topics: ["react", "reactjs"] },
  { name: "Next.js", aliases: ["nextjs", "next.js", "next js"], language: "TypeScript", topics: ["nextjs"] },
  { name: "Remix", aliases: ["remix"], topics: ["remix"] },
  { name: "Astro", aliases: ["astro"], topics: ["astro"] },
  { name: "Vue", aliases: ["vue", "vuejs", "vue.js", "vue 3"], topics: ["vue", "vuejs"] },
  { name: "Nuxt", aliases: ["nuxt", "nuxtjs"], topics: ["nuxt"] },
  { name: "Svelte", aliases: ["svelte", "sveltekit"], topics: ["svelte", "sveltekit"] },
  { name: "Angular", aliases: ["angular", "angularjs"], topics: ["angular"] },
  { name: "Solid", aliases: ["solidjs", "solid.js"], topics: ["solid"] },
  { name: "Preact", aliases: ["preact"], topics: ["preact"] },
  { name: "TypeScript", aliases: ["typescript", "ts"], language: "TypeScript", topics: ["typescript"] },
  { name: "JavaScript", aliases: ["javascript", "vanilla js", "vanillajs"], language: "JavaScript", topics: ["javascript"] },
  { name: "Node.js", aliases: ["nodejs", "node.js", "node"], language: "JavaScript", topics: ["nodejs"] },
  { name: "Deno", aliases: ["deno"], topics: ["deno"] },
  { name: "Bun", aliases: ["bun"], topics: ["bun"] },
  { name: "Express", aliases: ["express", "expressjs"], topics: ["express"] },
  { name: "Fastify", aliases: ["fastify"], topics: ["fastify"] },
  { name: "NestJS", aliases: ["nestjs", "nest.js"], topics: ["nestjs"] },
  { name: "tRPC", aliases: ["trpc"], topics: ["trpc"] },
  { name: "Tailwind CSS", aliases: ["tailwind", "tailwindcss", "tailwind css"], topics: ["tailwindcss"] },
  { name: "shadcn/ui", aliases: ["shadcn", "shadcn-ui", "shadcn/ui"], topics: ["shadcn"] },
  { name: "Radix UI", aliases: ["radix", "radix ui"], topics: ["radix-ui"] },
  { name: "Material UI", aliases: ["material ui", "mui", "material-ui"], topics: ["material-ui"] },
  { name: "Chakra UI", aliases: ["chakra", "chakra ui"], topics: ["chakra-ui"] },
  { name: "Mantine", aliases: ["mantine"], topics: ["mantine"] },
  { name: "Redux", aliases: ["redux"], topics: ["redux"] },
  { name: "Zustand", aliases: ["zustand"], topics: ["zustand"] },
  { name: "TanStack Query", aliases: ["react query", "tanstack query", "tanstack"], topics: ["react-query"] },
  { name: "GraphQL", aliases: ["graphql", "apollo"], topics: ["graphql"] },
  { name: "Prisma", aliases: ["prisma"], topics: ["prisma"] },
  { name: "Drizzle", aliases: ["drizzle"], topics: ["drizzle"] },
  { name: "Vite", aliases: ["vite"], topics: ["vite"] },
  { name: "Webpack", aliases: ["webpack"], topics: ["webpack"] },
  { name: "Electron", aliases: ["electron"], language: "JavaScript", topics: ["electron"] },
  { name: "Tauri", aliases: ["tauri"], language: "Rust", topics: ["tauri"] },
  { name: "Python", aliases: ["python", "python3"], language: "Python", topics: ["python"] },
  { name: "Django", aliases: ["django"], language: "Python", topics: ["django"] },
  { name: "Flask", aliases: ["flask"], language: "Python", topics: ["flask"] },
  { name: "FastAPI", aliases: ["fastapi", "fast api"], language: "Python", topics: ["fastapi"] },
  { name: "Streamlit", aliases: ["streamlit"], language: "Python", topics: ["streamlit"] },
  { name: "Rust", aliases: ["rust", "rustlang"], language: "Rust", topics: ["rust"] },
  { name: "Go", aliases: ["golang", "go lang", " go "], language: "Go", topics: ["go", "golang"] },
  { name: "Java", aliases: ["java"], language: "Java", topics: ["java"] },
  { name: "Spring Boot", aliases: ["spring boot", "springboot", "spring"], language: "Java", topics: ["spring-boot"] },
  { name: "Kotlin", aliases: ["kotlin"], language: "Kotlin", topics: ["kotlin"] },
  { name: "Swift", aliases: ["swift", "swiftui"], language: "Swift", topics: ["swift", "swiftui"] },
  { name: "C++", aliases: ["c++", "cpp"], language: "C++", topics: ["cpp"] },
  { name: "C#", aliases: ["c#", "csharp", "dotnet", ".net"], language: "C#", topics: ["dotnet", "csharp"] },
  { name: "Ruby", aliases: ["ruby"], language: "Ruby", topics: ["ruby"] },
  { name: "Ruby on Rails", aliases: ["rails", "ruby on rails"], language: "Ruby", topics: ["rails"] },
  { name: "PHP", aliases: ["php"], language: "PHP", topics: ["php"] },
  { name: "Laravel", aliases: ["laravel"], language: "PHP", topics: ["laravel"] },
  { name: "Elixir", aliases: ["elixir", "phoenix framework"], language: "Elixir", topics: ["elixir", "phoenix"] },
  { name: "Dart", aliases: ["dart"], language: "Dart", topics: ["dart"] },
  { name: "Flutter", aliases: ["flutter"], language: "Dart", topics: ["flutter"] },
  { name: "React Native", aliases: ["react native", "react-native"], topics: ["react-native"] },
  { name: "Zig", aliases: ["zig"], language: "Zig", topics: ["zig"] },
  { name: "PostgreSQL", aliases: ["postgres", "postgresql", "postgre"], topics: ["postgresql", "postgres"] },
  { name: "MySQL", aliases: ["mysql", "mariadb"], topics: ["mysql"] },
  { name: "SQLite", aliases: ["sqlite"], topics: ["sqlite"] },
  { name: "MongoDB", aliases: ["mongodb", "mongo"], topics: ["mongodb"] },
  { name: "Redis", aliases: ["redis"], topics: ["redis"] },
  { name: "Supabase", aliases: ["supabase"], topics: ["supabase"] },
  { name: "Firebase", aliases: ["firebase"], topics: ["firebase"] },
  { name: "Kafka", aliases: ["kafka"], topics: ["kafka"] },
  { name: "RabbitMQ", aliases: ["rabbitmq"], topics: ["rabbitmq"] },
  { name: "Docker", aliases: ["docker", "container"], topics: ["docker"] },
  { name: "Kubernetes", aliases: ["kubernetes", "k8s"], topics: ["kubernetes"] },
  { name: "Terraform", aliases: ["terraform"], topics: ["terraform"] },
  { name: "Ansible", aliases: ["ansible"], topics: ["ansible"] },
  { name: "GitHub Actions", aliases: ["github actions", "gh actions"], topics: ["github-actions"] },
  { name: "TensorFlow", aliases: ["tensorflow"], language: "Python", topics: ["tensorflow"] },
  { name: "PyTorch", aliases: ["pytorch", "torch"], language: "Python", topics: ["pytorch"] },
  { name: "scikit-learn", aliases: ["scikit-learn", "sklearn", "scikit learn"], language: "Python", topics: ["scikit-learn"] },
  { name: "LangChain", aliases: ["langchain"], language: "Python", topics: ["langchain"] },
  { name: "LlamaIndex", aliases: ["llamaindex", "llama index"], topics: ["llamaindex"] },
  { name: "Ollama", aliases: ["ollama"], topics: ["ollama"] },
  { name: "Hugging Face", aliases: ["hugging face", "huggingface", "transformers"], topics: ["huggingface", "transformers"] },
  { name: "OpenAI", aliases: ["openai", "gpt", "chatgpt"], topics: ["openai", "gpt"] },
  { name: "LLM", aliases: ["llm", "llms", "large language model"], topics: ["llm"] },
  { name: "OpenCV", aliases: ["opencv", "computer vision"], language: "Python", topics: ["opencv", "computer-vision"] },
  { name: "pandas", aliases: ["pandas"], language: "Python", topics: ["pandas"] },
  { name: "Whisper", aliases: ["whisper", "speech recognition", "speech-to-text"], topics: ["whisper", "speech-to-text"] },
  { name: "Stable Diffusion", aliases: ["stable diffusion", "comfyui", "diffusion model"], topics: ["stable-diffusion"] },
  { name: "Solidity", aliases: ["solidity"], language: "Solidity", topics: ["solidity"] },
  { name: "Ethereum", aliases: ["ethereum", "eth", "evm"], topics: ["ethereum"] },
  { name: "Hardhat", aliases: ["hardhat"], topics: ["hardhat"] },
  { name: "Solana", aliases: ["solana"], topics: ["solana"] },
  { name: "web3", aliases: ["web3", "web 3"], topics: ["web3"] },
  { name: "Three.js", aliases: ["threejs", "three.js", "webgl"], topics: ["threejs", "webgl"] },
  { name: "D3", aliases: ["d3", "d3js", "d3.js"], topics: ["d3"] },
  { name: "Socket.IO", aliases: ["socket.io", "socketio", "websockets", "websocket"], topics: ["websocket"] },
  { name: "gRPC", aliases: ["grpc"], topics: ["grpc"] },
  { name: "Playwright", aliases: ["playwright"], topics: ["playwright"] },
  { name: "Cypress", aliases: ["cypress"], topics: ["cypress"] },
  { name: "Vitest", aliases: ["vitest"], topics: ["vitest"] },
  { name: "Jest", aliases: ["jest"], topics: ["jest"] },
  { name: "Storybook", aliases: ["storybook"], topics: ["storybook"] },
  { name: "Zod", aliases: ["zod"], topics: ["zod"] },
  { name: "Godot", aliases: ["godot"], topics: ["godot"] },
  { name: "Bevy", aliases: ["bevy"], language: "Rust", topics: ["bevy"] },
  { name: "n8n", aliases: ["n8n"], topics: ["n8n"] },
  { name: "Temporal", aliases: ["temporal"], topics: ["temporal"] },
  { name: "Airflow", aliases: ["airflow"], topics: ["airflow"] },
  { name: "dbt", aliases: ["dbt"], topics: ["dbt"] },
  { name: "Strapi", aliases: ["strapi"], topics: ["strapi"] },
  { name: "Payload", aliases: ["payload cms", "payload"], topics: ["payload"] },
  { name: "Medusa", aliases: ["medusa"], topics: ["medusa"] },
  { name: "Stripe", aliases: ["stripe"], topics: ["stripe"] },
  { name: "Clerk", aliases: ["clerk"], topics: ["clerk"] },
  { name: "Auth.js", aliases: ["next-auth", "authjs", "auth.js"], topics: ["next-auth"] },
  { name: "Keycloak", aliases: ["keycloak"], topics: ["keycloak"] },
  { name: "Grafana", aliases: ["grafana"], topics: ["grafana"] },
  { name: "Prometheus", aliases: ["prometheus"], topics: ["prometheus"] },
  { name: "Nginx", aliases: ["nginx"], topics: ["nginx"] },
  { name: "Traefik", aliases: ["traefik"], topics: ["traefik"] },
  { name: "Home Assistant", aliases: ["home assistant", "homeassistant"], topics: ["home-assistant"] },
  { name: "VS Code", aliases: ["vscode", "vs code"], topics: ["vscode", "vscode-extension"] },
];

/** Phrase → topic/keyword mapping for common intents. */
const CATEGORY_RULES: Array<{ phrases: string[]; topics: string[]; keywords?: string[] }> = [
  { phrases: ["component library", "component libraries", "ui library", "ui kit", "design system", "widget library"], topics: ["ui", "components"], keywords: ["ui"] },
  { phrases: ["command palette", "command menu", "cmdk", "fuzzy finder"], topics: ["command-palette"] },
  { phrases: ["starter", "starter kit", "boilerplate", "template", "scaffold"], topics: ["template", "starter", "boilerplate"] },
  { phrases: ["cli tool", "cli", "command line", "terminal tool"], topics: ["cli"], keywords: ["cli"] },
  { phrases: ["api", "rest api", "backend api", "microservice"], topics: ["api"], keywords: ["api"] },
  { phrases: ["authentication", "auth", "login", "oauth", "sso", "single sign on"], topics: ["authentication"] },
  { phrases: ["authorization", "rbac", "permissions"], topics: ["authorization", "rbac"] },
  { phrases: ["dashboard", "admin panel", "admin dashboard"], topics: ["dashboard"] },
  { phrases: ["landing page", "marketing site"], topics: ["landing-page"] },
  { phrases: ["e-commerce", "ecommerce", "online store", "shopping cart", "storefront"], topics: ["e-commerce"] },
  { phrases: ["cms", "content management"], topics: ["cms"] },
  { phrases: ["blog", "static site", "static blog"], topics: ["blog"] },
  { phrases: ["documentation", "docs site", "doc site"], topics: ["documentation"] },
  { phrases: ["chat app", "chatbot", "messaging", "realtime chat", "real-time chat"], topics: ["chat"] },
  { phrases: ["saas", "saas template", "saas starter"], topics: ["saas"] },
  { phrases: ["portfolio"], topics: ["portfolio"] },
  { phrases: ["resume", "cv builder"], topics: ["resume"] },
  { phrases: ["todo", "task manager", "kanban", "project management", "issue tracker"], topics: ["task-management"] },
  { phrases: ["monitoring", "observability", "metrics", "apm"], topics: ["monitoring"] },
  { phrases: ["logging", "log management"], topics: ["logging"] },
  { phrases: ["testing", "test framework", "unit test"], topics: ["testing"] },
  { phrases: ["scraper", "web scraping", "crawler", "spider"], topics: ["scraper", "web-scraping"] },
  { phrases: ["proxy", "reverse proxy"], topics: ["proxy"] },
  { phrases: ["vpn", "wireguard", "tunnel"], topics: ["vpn"] },
  { phrases: ["password manager", "secrets", "vault", "credential"], topics: ["security"] },
  { phrases: ["security", "penetration testing", "pentest", "exploit", "ctf"], topics: ["security"] },
  { phrases: ["devops", "ci/cd", "ci cd", "continuous integration", "deployment pipeline"], topics: ["devops", "ci-cd"] },
  { phrases: ["self-hosted", "self hosted", "selfhosted"], topics: ["self-hosted"] },
  { phrases: ["ai agent", "autonomous agent", "agent framework", "multi-agent", "agents"], topics: ["ai", "agent"] },
  { phrases: ["rag", "retrieval augmented", "vector search", "vector database", "embeddings"], topics: ["rag", "vector-database"] },
  { phrases: ["machine learning", "ml", "deep learning", "neural network"], topics: ["machine-learning", "deep-learning"] },
  { phrases: ["data science", "analytics", "data analysis", "business intelligence"], topics: ["data-science", "analytics"] },
  { phrases: ["automation", "workflow automation", "no-code", "low-code"], topics: ["automation"] },
  { phrases: ["browser extension", "chrome extension", "firefox extension"], topics: ["browser-extension"] },
  { phrases: ["mobile app", "ios app", "android app"], topics: ["mobile"] },
  { phrases: ["desktop app", "desktop application"], topics: ["desktop"] },
  { phrases: ["game", "game engine", "game development"], topics: ["game"] },
  { phrases: ["bot", "discord bot", "telegram bot", "slack bot"], topics: ["bot"] },
  { phrases: ["blockchain", "defi", "nft", "smart contract", "wallet"], topics: ["blockchain"] },
  { phrases: ["iot", "embedded", "raspberry pi", "arduino", "esp32"], topics: ["iot"] },
  { phrases: ["robotics", "ros "], topics: ["robotics"] },
  { phrases: ["ocr", "document parsing", "pdf extraction"], topics: ["ocr"] },
  { phrases: ["email", "smtp", "newsletter"], topics: ["email"] },
  { phrases: ["notifications", "push notifications"], topics: ["notifications"] },
  { phrases: ["payments", "billing", "subscription"], topics: ["payments"] },
  { phrases: ["search engine", "full-text search", "fuzzy search"], topics: ["search"] },
  { phrases: ["database", "orm", "query builder", "migration"], topics: ["database"] },
  { phrases: ["queue", "job queue", "background jobs", "worker"], topics: ["queue"] },
  { phrases: ["cache", "caching"], topics: ["cache"] },
  { phrases: ["storage", "s3", "object storage", "file storage"], topics: ["storage"] },
  { phrases: ["webhook", "webhooks"], topics: ["webhooks"] },
  { phrases: ["cron", "scheduler", "job scheduling"], topics: ["scheduler"] },
  { phrases: ["forms", "form builder"], topics: ["forms"] },
  { phrases: ["table", "data grid", "datatable", "spreadsheet"], topics: ["table"] },
  { phrases: ["charts", "charting", "data visualization", "visualization", "graph visualization"], topics: ["data-visualization"] },
  { phrases: ["maps", "gis", "geospatial"], topics: ["maps"] },
  { phrases: ["video", "streaming", "media player", "transcoding"], topics: ["video"] },
  { phrases: ["audio", "music", "podcast"], topics: ["audio"] },
  { phrases: ["image processing", "image editor", "photo"], topics: ["image-processing"] },
  { phrases: ["3d", "3d printing", "cad", "modeling"], topics: ["3d"] },
  { phrases: ["ar", "augmented reality", "vr", "virtual reality", "xr"], topics: ["xr"] },
  { phrases: ["accessibility", "a11y", "screen reader"], topics: ["accessibility"] },
  { phrases: ["i18n", "internationalization", "translation", "localization", "l10n"], topics: ["i18n"] },
  { phrases: ["markdown", "mdx", "rich text editor", "wysiwyg"], topics: ["markdown"] },
  { phrases: ["icons", "svg icons", "icon set"], topics: ["icons"] },
  { phrases: ["fonts", "typography"], topics: ["fonts"] },
  { phrases: ["seo", "meta tags", "sitemap"], topics: ["seo"] },
  { phrases: ["crypto", "cryptography", "encryption"], topics: ["cryptography"] },
  { phrases: ["compiler", "parser", "interpreter", "language server", "linter"], topics: ["compiler"] },
  { phrases: ["terminal emulator", "shell", "zsh", "bash"], topics: ["terminal"] },
  { phrases: ["ssh", "remote access"], topics: ["ssh"] },
  { phrases: ["backup", "sync", "rsync"], topics: ["backup"] },
  { phrases: ["learning", "tutorial", "course", "cheatsheet", "roadmap", "interview questions", "beginner projects"], topics: ["learning-resources", "documentation"] },
  { phrases: ["awesome list", "curated list", "resources list"], topics: ["awesome"] },
  { phrases: ["hacktoberfest", "good first issue", "contribute", "open source contribution"], topics: ["hacktoberfest"] },
];

const STOPWORDS = new Set([
  "a","an","and","any","are","as","at","be","best","build","building","can","could","create","creating",
  "do","does","find","for","from","get","give","good","great","has","have","how","i","in","into","is",
  "it","its","just","like","looking","make","me","more","most","much","my","need","new","of","on","or","our","out",
  "please","popular","search","should","show","some","that","the","their","them","there","to","top",
  "us","want","we","what","where","which","will","with","would","you","your","using","use","used",
  "project","projects","app","apps","application","applications","open","source","opensource","github",
  "repository","repositories","repo","repos","library","libraries","tool","tools","example","examples",
  "something","thing","things","way","kind","type","sort","one","also","very","really","simple",
]);

const QUALIFIER_PATTERN =
  /\b(language|topic|user|org|repo|in|stars|forks|created|pushed|updated|license|archived|is|size|extension|path|followers|repositories|location|type)\s*:\s*("([^"]+)"|[^\s]+)/gi;

const SIGNAL_PATTERNS: Array<{ test: RegExp; key: keyof Omit<IntentSignals, "alternativeTo"> }> = [
  { test: /\b(lightweight|minimal|tiny|small footprint|zero[- ]dependency|no dependencies)\b/i, key: "lightweight" },
  { test: /\b(beginner|beginner[- ]friendly|easy to learn|simple to start|first project|learning)\b/i, key: "beginnerFriendly" },
  { test: /\b(popular|trending|most starred|widely used|production[- ]grade|enterprise)\b/i, key: "popular" },
  { test: /\b(actively maintained|maintained|recently updated|up to date|active development)\b/i, key: "activelyMaintained" },
  { test: /\b(self[- ]?hosted|on[- ]premise|on prem|local only|runs locally)\b/i, key: "selfHosted" },
  { test: /\b(production ready|production-ready|battle tested|stable release)\b/i, key: "productionReady" },
];

/**
 * Extracts technologies, topics, keywords, user qualifiers and intent signals
 * from free text. Pure, deterministic, and unit-tested.
 */
export function extractIntent(text: string): ExtractedIntent {
  const rawText = text.trim();
  const qualifiers: string[] = [];
  const technologies: DetectedTechnology[] = [];
  const topics: string[] = [];

  // 1. Preserve explicit GitHub qualifiers typed by the user, keeping the
  //    original casing (language:Rust stays language:Rust).
  const stripped = rawText.replace(QUALIFIER_PATTERN, (_match, key: string, full: string, quoted?: string) => {
    const value = (quoted ?? full).trim();
    qualifiers.push(`${key.toLowerCase()}:${value}`);
    return " ";
  });

  let working = ` ${stripped.toLowerCase()} `;

  // 2. Detect technologies (longest alias first so "react native" beats "react").
  const ordered = [...TECHNOLOGIES].sort(
    (a, b) => maxAliasLength(b.aliases) - maxAliasLength(a.aliases),
  );
  for (const entry of ordered) {
    for (const alias of entry.aliases) {
      const pattern = new RegExp(`(^|[^a-z0-9+#.])${escapeRegExp(alias.trim())}($|[^a-z0-9+#.])`, "i");
      if (pattern.test(working)) {
        if (!technologies.some((tech) => tech.name === entry.name)) {
          technologies.push({
            term: alias.trim(),
            name: entry.name,
            language: entry.language ?? null,
            topics: entry.topics,
          });
          for (const topic of entry.topics) pushUnique(topics, topic);
        }
        working = working.replace(phrasePattern(alias), " ");
        break;
      }
    }
  }

  // 3. Detect intent categories from phrases.
  //    Whole-word matching only. Short phrases such as "ar" or "ml" must never
  //    match inside unrelated words ("library", "html"): doing so added a bogus
  //    topic *and* deleted letters from the user's text.
  const categoryKeywords: string[] = [];
  for (const rule of CATEGORY_RULES) {
    const matched = rule.phrases.filter((phrase) => phrasePattern(phrase).test(working));
    if (matched.length === 0) continue;
    for (const topic of rule.topics) pushUnique(topics, topic);
    for (const keyword of rule.keywords ?? []) pushUnique(categoryKeywords, keyword);
    for (const phrase of matched) {
      working = working.replace(phrasePattern(phrase), " ");
    }
  }

  // 4. "alternative to <product>"
  let alternativeTo: string | null = null;
  const alternativeMatch = working.match(/\b(?:alternative|alternatives|replacement|open source version)\s+(?:to|for)\s+([a-z0-9 .+#_-]{2,40})/i);
  if (alternativeMatch?.[1]) {
    alternativeTo = alternativeMatch[1].trim();
    pushUnique(topics, "alternative");
    working = working.replace(new RegExp(escapeRegExp(alternativeMatch[0]), "gi"), " ");
  }

  // 5. Signals
  const signals: IntentSignals = {
    lightweight: false,
    beginnerFriendly: false,
    popular: false,
    activelyMaintained: false,
    selfHosted: false,
    productionReady: false,
    alternativeTo,
  };
  for (const { test, key } of SIGNAL_PATTERNS) {
    if (test.test(rawText)) {
      signals[key] = true;
      working = working.replace(new RegExp(test.source, "gi"), " ");
    }
  }
  if (signals.selfHosted) pushUnique(topics, "self-hosted");
  if (signals.beginnerFriendly) pushUnique(topics, "good-first-issue");

  // 6. Remaining meaningful keywords.
  const ignored: string[] = [];
  const keywords: string[] = [];
  for (const token of working.split(/[^a-z0-9+#.]+/i)) {
    const word = token.trim().toLowerCase();
    if (word.length < 3) continue;
    if (STOPWORDS.has(word)) {
      ignored.push(word);
      continue;
    }
    if (categoryKeywords.includes(word)) continue;
    pushUnique(keywords, word);
  }

  // Category keywords rank above leftover words (they came from real phrases).
  const orderedKeywords = [...new Set([...categoryKeywords, ...keywords])].slice(0, 8);

  return {
    rawText,
    keywords: orderedKeywords,
    technologies,
    topics: topics.slice(0, 6),
    qualifiers: qualifiers.slice(0, 8),
    signals,
    ignored: [...new Set(ignored)].slice(0, 12),
  };
}

/* -------------------------------------------------------------------------- */

function maxAliasLength(aliases: string[]): number {
  return aliases.reduce((max, alias) => Math.max(max, alias.length), 0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Matches a phrase as a whole word and removes every occurrence.
 *
 * - Lookarounds keep the surrounding delimiters, so adjacent matches still match.
 * - Spaces inside a phrase also match hyphens ("command-palette").
 * - A trailing "s" is optional, so plurals ("command palettes") still match.
 */
function phrasePattern(phrase: string): RegExp {
  const body = phrase
    .trim()
    .split(/\s+/)
    .map((word) => escapeRegExp(word))
    .join("[ \\t-]+");
  return new RegExp(`(?<![a-z0-9+#.])${body}s?(?![a-z0-9+#.])`, "gi");
}

function pushUnique(target: string[], value: string): void {
  const normalized = value.trim().toLowerCase();
  if (normalized && !target.includes(normalized)) target.push(normalized);
}
