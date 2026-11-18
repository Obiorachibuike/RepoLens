import { WatchlistView } from "@/components/watchlist/watchlist-view";
export const metadata = { title: "Watchtower", description: "Monitor changes in public GitHub repositories." };
export default async function WatchlistPage({ searchParams }: { searchParams: Promise<{ repository?: string }> }) {
  const { repository } = await searchParams;
  return <WatchlistView initial={typeof repository === "string" ? repository.slice(0, 240) : ""} />;
}
