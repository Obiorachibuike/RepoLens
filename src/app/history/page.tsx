import type { Metadata } from "next";
import { HistoryView } from "@/components/history/history-view";

export const metadata: Metadata = {
  title: "Search history",
  description: "Review, repeat and clear your RepoLens searches.",
};

export default function HistoryPage() {
  return <HistoryView />;
}
