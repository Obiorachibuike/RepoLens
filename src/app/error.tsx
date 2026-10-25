"use client";

import * as React from "react";
import { ErrorState } from "@/components/ui/state";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Surface the failure for debugging without leaking it to the client bundle.
    console.error("[repolens] page error:", error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <ErrorState
        title="Something broke on this page"
        message={error.message || "An unexpected error occurred while rendering this page."}
        hint={error.digest ? `Error reference: ${error.digest}` : null}
        onRetry={reset}
        retryLabel="Try again"
      />
    </div>
  );
}
