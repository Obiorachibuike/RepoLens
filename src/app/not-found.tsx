import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <span className="rounded-full border border-border bg-surface-elevated p-3 text-text-muted">
        <SearchX className="size-6" />
      </span>
      <h1 className="mt-4 text-xl font-semibold text-text-primary">Page not found</h1>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">
        That route does not exist. If you followed a repository link, the project may have been renamed,
        made private or deleted on GitHub.
      </p>
      <div className="mt-5 flex gap-2">
        <Link href="/">
          <Button variant="primary" size="sm">
            Back to search
          </Button>
        </Link>
        <Link href="/discover">
          <Button variant="secondary" size="sm">
            Browse discovery
          </Button>
        </Link>
      </div>
    </div>
  );
}
