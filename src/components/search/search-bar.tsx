"use client";

import * as React from "react";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder,
  loading,
  disabled,
  inputRef,
  ariaLabel,
  id = "repolens-search",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  loading: boolean;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  ariaLabel: string;
  id?: string;
}) {
  const [error, setError] = React.useState<string | null>(null);

  const submit = React.useCallback(() => {
    if (loading) return; // blocks duplicate submissions of the same in-flight request
    if (!value.trim()) {
      setError("Enter something to search for.");
      inputRef?.current?.focus();
      return;
    }
    setError(null);
    onSubmit();
  }, [loading, value, onSubmit, inputRef]);

  return (
    <div className="w-full">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="relative mx-auto flex w-full max-w-[720px] items-center"
      >
        <label htmlFor={id} className="sr-only">
          {ariaLabel}
        </label>
        <div
          className={cn(
            "relative flex w-full items-center rounded-lg border bg-[color-mix(in_srgb,var(--background-secondary)_88%,transparent)] backdrop-blur-sm transition-all",
            "focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/20",
            error ? "border-danger/60" : "border-border",
          )}
        >
          <Search
            className="pointer-events-none absolute left-3.5 size-4 text-text-muted"
            aria-hidden="true"
          />
          <input
            id={id}
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            value={value}
            disabled={disabled}
            onChange={(event) => {
              onChange(event.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && value) {
                event.preventDefault();
                onChange("");
              }
            }}
            placeholder={placeholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className={cn(
              "h-[52px] w-full appearance-none rounded-lg bg-transparent pl-10 pr-[124px] text-[15px] text-text-primary",
              "placeholder:text-text-muted focus:outline-none",
              "[&::-webkit-search-cancel-button]:appearance-none",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          />
          {value ? (
            <button
              type="button"
              onClick={() => {
                onChange("");
                inputRef?.current?.focus();
              }}
              aria-label="Clear search text"
              className="absolute right-[104px] rounded-md p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            disabled={loading || disabled}
            className="absolute right-1.5 h-[42px] rounded-md px-4 text-sm"
          >
            {loading ? <Loader2 className="size-4 animate-spin-slow" aria-hidden="true" /> : null}
            <span>{loading ? "Searching" : "Search"}</span>
          </Button>
        </div>
      </form>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mx-auto mt-2 max-w-[720px] text-left text-[11px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
