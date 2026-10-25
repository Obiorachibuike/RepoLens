import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReadmeViewer } from "./readme-viewer";

describe("README rendering safety", () => {
  const hostile = [
    "# Title",
    "",
    "Normal paragraph with a [safe link](https://example.com).",
    "",
    '<script>window.hacked = true</script>',
    "",
    '<img src="https://example.com/x.png" onerror="window.hacked = true" alt="x" />',
    "",
    '<a href="javascript:window.hacked = true">click me</a>',
    "",
    '<div onmouseover="window.hacked = true">hover</div>',
    "",
    "| a | b |",
    "| - | - |",
    "| 1 | 2 |",
  ].join("\n");

  it("never renders script elements from README markdown", () => {
    const { container } = render(
      <ReadmeViewer content={hostile} missing={false} truncated={false} owner="a" repo="b" branch="main" />,
    );
    expect(container.querySelectorAll("script")).toHaveLength(0);
    expect(container.innerHTML).not.toContain("window.hacked = true<");
  });

  it("strips inline event handlers", () => {
    const { container } = render(
      <ReadmeViewer content={hostile} missing={false} truncated={false} owner="a" repo="b" branch="main" />,
    );
    expect(container.querySelectorAll("[onerror]")).toHaveLength(0);
    expect(container.querySelectorAll("[onmouseover]")).toHaveLength(0);
  });

  it("removes javascript: URLs", () => {
    const { container } = render(
      <ReadmeViewer content={hostile} missing={false} truncated={false} owner="a" repo="b" branch="main" />,
    );
    const hrefs = [...container.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href") ?? "");
    expect(hrefs.some((href) => href.toLowerCase().startsWith("javascript:"))).toBe(false);
  });

  it("still renders normal markdown content", () => {
    render(
      <ReadmeViewer content={hostile} missing={false} truncated={false} owner="a" repo="b" branch="main" />,
    );
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "safe link" })).toHaveAttribute("href", "https://example.com");
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("opens external links in a new tab with a safe rel", () => {
    render(
      <ReadmeViewer content={hostile} missing={false} truncated={false} owner="a" repo="b" branch="main" />,
    );
    const link = screen.getByRole("link", { name: "safe link" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
  });

  it("resolves relative image paths against the raw GitHub host", () => {
    const { container } = render(
      <ReadmeViewer
        content={"![logo](./docs/logo.png)"}
        missing={false}
        truncated={false}
        owner="acme"
        repo="widget"
        branch="main"
      />,
    );
    const image = container.querySelector("img");
    expect(image?.getAttribute("src")).toBe(
      "https://raw.githubusercontent.com/acme/widget/main/docs/logo.png",
    );
  });

  it("shows a clear fallback when the README is missing", () => {
    render(<ReadmeViewer content={null} missing truncated={false} owner="a" repo="b" branch="main" />);
    expect(screen.getByText("No README available")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open on GitHub" })).toHaveAttribute("href", "https://github.com/a/b");
  });
});
