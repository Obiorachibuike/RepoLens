import type { Metadata } from "next";
import { SavedView } from "@/components/saved/saved-view";

export const metadata: Metadata = {
  title: "Saved repositories",
  description: "Your saved GitHub repositories, notes and exports.",
};

export default function SavedPage() {
  return <SavedView />;
}
