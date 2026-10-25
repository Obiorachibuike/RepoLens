import type { Metadata } from "next";
import { CollectionsView } from "@/components/collections/collections-view";

export const metadata: Metadata = {
  title: "Collections",
  description: "Group your saved repositories into collections.",
};

export default function CollectionsPage() {
  return <CollectionsView />;
}
