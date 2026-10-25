import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders, type AppConfig } from "@/components/app-providers";
import { Header } from "@/components/header";
import { isDatabaseConfigured } from "@/lib/db/client";
import { isGithubAuthenticated } from "@/lib/github/client";
import { Logo } from "@/components/logo";
import Link from "next/link";

export const metadata: Metadata = {
  metadataBase: new URL("https://repolens.dev"),
  title: {
    default: "RepoLens — Find Your Next Project",
    template: "%s · RepoLens",
  },
  description:
    "RepoLens searches the real GitHub API to help you discover, inspect, visualize and analyze open-source repositories before you build.",
  applicationName: "RepoLens",
  keywords: [
    "github search",
    "repository discovery",
    "open source",
    "repository analysis",
    "code exploration",
  ],
  openGraph: {
    title: "RepoLens — Find Your Next Project",
    description:
      "Discover, inspect, visualize and analyze open-source repositories using the official GitHub API.",
    type: "website",
    siteName: "RepoLens",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#05060a" },
    { media: "(prefers-color-scheme: light)", color: "#f7f8fb" },
  ],
  width: "device-width",
  initialScale: 1,
};

/** Sets the theme before first paint so there is no flash of the wrong theme. */
const themeInitScript = `(function(){try{var t=localStorage.getItem('repolens:theme')||'dark';var r=t==='system'?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):t;var e=document.documentElement;e.classList.remove('dark','light');e.classList.add(r);e.style.colorScheme=r;}catch(err){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const githubAuthenticated = isGithubAuthenticated();
  const config: AppConfig = {
    github: { authenticated: githubAuthenticated },
    database: isDatabaseConfigured(),
    ai: Boolean(process.env.AI_API_KEY),
    codeSearch: githubAuthenticated,
  };

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh bg-background text-text-primary antialiased">
        <AppProviders config={config}>
          <div className="relative z-10 flex min-h-dvh flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <Footer githubAuthenticated={githubAuthenticated} database={config.database} />
          </div>
        </AppProviders>
      </body>
    </html>
  );
}

function Footer({ githubAuthenticated, database }: { githubAuthenticated: boolean; database: boolean }) {
  return (
    <footer className="border-t border-border-subtle bg-background/60">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-3 px-4 py-6 text-[11px] text-text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2">
          <Logo className="size-4" />
          <span>
            RepoLens — repository discovery and intelligence built on the official{" "}
            <a
              className="text-text-secondary underline-offset-2 hover:underline"
              href="https://docs.github.com/en/rest"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub REST API
            </a>
            .
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href="/search/developers" className="hover:text-text-secondary">
            Developers
          </Link>
          <Link href="/search/code" className="hover:text-text-secondary">
            Code search
          </Link>
          <Link href="/discover" className="hover:text-text-secondary">
            Discover
          </Link>
          <Link href="/settings" className="hover:text-text-secondary">
            Settings
          </Link>
          <span className="text-text-muted">
            {githubAuthenticated ? "GitHub token active" : "Unauthenticated (60 req/h)"} ·{" "}
            {database ? "Database connected" : "Local storage"}
          </span>
        </div>
      </div>
    </footer>
  );
}
