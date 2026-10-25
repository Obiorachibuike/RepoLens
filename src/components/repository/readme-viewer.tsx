"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { FileText } from "lucide-react";
import { Notice } from "@/components/ui/state";
import { Button } from "@/components/ui/button";

/**
 * Safe Markdown rendering for README content.
 *
 * - react-markdown never executes HTML from the source
 * - rehype-sanitize strips scripts, event handlers and javascript: URLs
 * - relative links/images are resolved against github.com / raw.githubusercontent.com
 */
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^language-./]],
    span: [...(defaultSchema.attributes?.span ?? []), ["className"]],
    li: [...(defaultSchema.attributes?.li ?? []), ["className"]],
    input: [["type", "checkbox"], ["disabled", true], ["checked", true]],
    img: [...(defaultSchema.attributes?.img ?? []), ["align"], ["width"], ["height"]],
  },
  tagNames: [...(defaultSchema.tagNames ?? []), "input"],
};

const PREVIEW_LINES = 120;

export function ReadmeViewer({
  content,
  missing,
  truncated,
  owner,
  repo,
  branch,
}: {
  content: string | null;
  missing: boolean;
  truncated: boolean;
  owner: string;
  repo: string;
  branch: string;
}) {
  const [expanded, setExpanded] = React.useState(false);

  if (missing || !content) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <FileText className="size-5 text-text-muted" />
        <p className="text-sm font-medium text-text-primary">No README available</p>
        <p className="max-w-md text-xs leading-relaxed text-text-muted">
          GitHub did not return a README for this repository (404). It may be empty, or the documentation may
          live elsewhere.
        </p>
        <a href={`https://github.com/${owner}/${repo}`} target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="secondary" className="mt-2">
            Open on GitHub
          </Button>
        </a>
      </div>
    );
  }

  const lines = content.split("\n");
  const visible = expanded ? content : lines.slice(0, PREVIEW_LINES).join("\n");
  const hasMore = lines.length > PREVIEW_LINES;

  const resolveUrl = (url: string | undefined, base: string): string => {
    if (!url) return "#";
    if (/^(https?:|mailto:|#)/i.test(url)) return url;
    const clean = url.replace(/^\.\//, "").replace(/^\//, "");
    return `${base}/${clean}`;
  };

  return (
    <div className="relative">
      <div className="markdown-body px-5 py-4">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[[rehypeSanitize, schema]]}
          components={{
            a: ({ href, children, ...props }) => (
              <a
                href={resolveUrl(href, `https://github.com/${owner}/${repo}/blob/${branch}`)}
                target="_blank"
                rel="noopener noreferrer nofollow"
                {...props}
              >
                {children}
              </a>
            ),
            img: ({ src, alt, ...props }) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolveUrl(typeof src === "string" ? src : undefined, `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`)}
                alt={alt ?? ""}
                loading="lazy"
                referrerPolicy="no-referrer"
                {...props}
              />
            ),
          }}
        >
          {visible}
        </ReactMarkdown>
      </div>

      {hasMore ? (
        <div className="sticky bottom-0 flex justify-center bg-gradient-to-t from-surface via-surface/95 to-transparent px-4 pb-4 pt-8">
          <Button size="sm" variant="secondary" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Collapse README" : `Show full README (${lines.length} lines)`}
          </Button>
        </div>
      ) : null}

      {truncated ? (
        <div className="px-5 pb-4">
          <Notice tone="info">
            This README is larger than 512 KB, so only the first part was fetched for the preview.
          </Notice>
        </div>
      ) : null}
    </div>
  );
}
