"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GITHUB_MAX_RESULT_WINDOW } from "@/lib/validation/search";
import { formatExact } from "@/lib/utils";

export function Pagination({
  page,
  perPage,
  totalCount,
  onPageChange,
  disabled,
}: {
  page: number;
  perPage: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  const reachable = Math.min(totalCount, GITHUB_MAX_RESULT_WINDOW);
  const totalPages = Math.max(1, Math.ceil(reachable / perPage));
  const from = totalCount === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, totalCount);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-4 py-3">
      <p className="text-[11px] text-text-muted">
        {totalCount === 0 ? (
          "No results"
        ) : (
          <>
            Showing <span className="text-text-secondary">{formatExact(from)}</span>–
            <span className="text-text-secondary">{formatExact(to)}</span> of{" "}
            <span className="text-text-secondary">{formatExact(totalCount)}</span>
            {totalCount > GITHUB_MAX_RESULT_WINDOW ? (
              <span className="ml-1 text-text-muted">
                (GitHub only returns the first {formatExact(GITHUB_MAX_RESULT_WINDOW)} — narrow the search to see
                more)
              </span>
            ) : null}
          </>
        )}
      </p>

      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-3.5" />
          Prev
        </Button>
        <span className="px-1 text-[11px] tabular-nums text-text-muted">
          Page {page} of {formatExact(totalPages)}
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
