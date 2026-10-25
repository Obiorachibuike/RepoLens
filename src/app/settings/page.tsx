import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = {
  title: "Settings",
  description: "Appearance, search defaults and integration status.",
};

export default function SettingsPage() {
  return <SettingsView />;
}
