import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModeTabs } from "./mode-tabs";
import { SEARCH_MODES_CONFIG } from "./modes";
import { SearchBar } from "./search-bar";

describe("search mode selector", () => {
  it("renders the three modes with the selected one marked", () => {
    render(<ModeTabs value="repository" onChange={() => {}} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
    expect(tabs[2]).toHaveAttribute("aria-selected", "false");
  });

  it("switches mode when a tab is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ModeTabs value="repository" onChange={onChange} />);
    await user.click(screen.getByRole("tab", { name: /project idea mode/i }));
    expect(onChange).toHaveBeenCalledWith("project-idea");
  });

  it("exposes a distinct placeholder and helper text for every mode", () => {
    const { rerender } = render(
      <SearchBar
        value=""
        onChange={() => {}}
        onSubmit={() => {}}
        placeholder={SEARCH_MODES_CONFIG.repository.placeholder}
        loading={false}
        ariaLabel="Repository search"
      />,
    );
    expect(screen.getByPlaceholderText("Search repositories by name or keywords...")).toBeInTheDocument();

    rerender(
      <SearchBar
        value=""
        onChange={() => {}}
        onSubmit={() => {}}
        placeholder={SEARCH_MODES_CONFIG["find-repo"].placeholder}
        loading={false}
        ariaLabel="Find Repo search"
      />,
    );
    expect(
      screen.getByPlaceholderText("Describe the repository or technology you're looking for..."),
    ).toBeInTheDocument();

    rerender(
      <SearchBar
        value=""
        onChange={() => {}}
        onSubmit={() => {}}
        placeholder={SEARCH_MODES_CONFIG["project-idea"].placeholder}
        loading={false}
        ariaLabel="Project Idea search"
      />,
    );
    expect(
      screen.getByPlaceholderText("Describe your project idea or the problem you want to solve..."),
    ).toBeInTheDocument();

    // Helper texts are distinct per mode and match the specification.
    expect(SEARCH_MODES_CONFIG.repository.helper).toBe(
      "Search for specific GitHub repositories by name or keywords.",
    );
    expect(SEARCH_MODES_CONFIG["find-repo"].helper).toBe(
      "Find relevant open-source repositories for your next project.",
    );
    expect(SEARCH_MODES_CONFIG["project-idea"].helper).toBe(
      "Discover existing projects, libraries, and useful starting points.",
    );
  });
});

describe("search bar behaviour", () => {
  it("refuses to submit an empty query and explains why", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SearchBar value="" onChange={() => {}} onSubmit={onSubmit} placeholder="Search..." loading={false} ariaLabel="Search" />,
    );
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText("Enter something to search for.")).toBeInTheDocument();
  });

  it("submits on Enter", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SearchBar
        value="react hooks"
        onChange={() => {}}
        onSubmit={onSubmit}
        placeholder="Search..."
        loading={false}
        ariaLabel="Search"
      />,
    );
    const input = screen.getByRole("searchbox");
    await user.type(input, "{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("does not submit again while a request is in flight", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SearchBar
        value="react"
        onChange={() => {}}
        onSubmit={onSubmit}
        placeholder="Search..."
        loading
        ariaLabel="Search"
      />,
    );
    const button = screen.getByRole("button", { name: /searching/i });
    expect(button).toBeDisabled();
    await user.click(button).catch(() => undefined);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("clears the query with the clear button", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SearchBar value="react" onChange={onChange} onSubmit={() => {}} placeholder="Search..." loading={false} ariaLabel="Search" />,
    );
    await user.click(screen.getByLabelText("Clear search text"));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
