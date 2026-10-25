import { Code2, Lightbulb, Telescope } from "lucide-react";
import type { SearchMode } from "@/lib/validation/search";

export interface ModeConfig {
  id: SearchMode;
  label: string;
  icon: typeof Code2;
  placeholder: string;
  helper: string;
  /** Short description used in tooltips and the interpretation panel. */
  purpose: string;
}

export const SEARCH_MODES_CONFIG: Record<SearchMode, ModeConfig> = {
  repository: {
    id: "repository",
    label: "Repository",
    icon: Code2,
    placeholder: "Search repositories by name or keywords...",
    helper: "Search for specific GitHub repositories by name or keywords.",
    purpose: "Direct GitHub repository search. Qualifiers such as language:Rust or stars:>500 are passed through.",
  },
  "find-repo": {
    id: "find-repo",
    label: "Find Repo",
    icon: Telescope,
    placeholder: "Describe the repository or technology you're looking for...",
    helper: "Find relevant open-source repositories for your next project.",
    purpose: "Describe what you need in plain language; RepoLens converts it into real GitHub qualifiers.",
  },
  "project-idea": {
    id: "project-idea",
    label: "Project Idea",
    icon: Lightbulb,
    placeholder: "Describe your project idea or the problem you want to solve...",
    helper: "Discover existing projects, libraries, and useful starting points.",
    purpose: "Research existing projects related to an idea before you start building.",
  },
};

export const MODE_ORDER: SearchMode[] = ["repository", "find-repo", "project-idea"];
