import { beforeEach, describe, expect, it } from "vitest";
import {
  addLocalHistory,
  clearAllLocalData,
  clearLocalHistory,
  collectionCounts,
  createLocalCollection,
  deleteLocalCollection,
  isSavedLocally,
  listLocalCollections,
  listLocalHistory,
  listLocalSaved,
  moveLocalToCollection,
  removeLocally,
  renameLocalCollection,
  saveLocally,
  updateLocalNote,
} from "./local";

const seed = {
  owner: "facebook",
  name: "react",
  fullName: "facebook/react",
  url: "https://github.com/facebook/react",
  description: "The library for web and native user interfaces.",
  language: "JavaScript",
  stars: 231000,
};

beforeEach(() => {
  clearAllLocalData();
});

describe("browser-local saved repositories", () => {
  it("saves, lists and detects a saved repository", () => {
    const saved = saveLocally(seed);
    expect(saved.id).toBeTruthy();
    expect(listLocalSaved()).toHaveLength(1);
    expect(isSavedLocally("facebook/react")).toBe(true);
    expect(isSavedLocally("facebook/REACT")).toBe(true);
    expect(isSavedLocally("vuejs/core")).toBe(false);
  });

  it("does not duplicate an existing save", () => {
    saveLocally(seed);
    saveLocally(seed);
    expect(listLocalSaved()).toHaveLength(1);
  });

  it("stores and clears notes", () => {
    const saved = saveLocally(seed);
    expect(updateLocalNote(saved.id, "Best UI library")?.note).toBe("Best UI library");
    expect(listLocalSaved()[0]?.note).toBe("Best UI library");
    expect(updateLocalNote(saved.id, null)?.note).toBeNull();
  });

  it("removes a saved repository", () => {
    const saved = saveLocally(seed);
    removeLocally(saved.id);
    expect(listLocalSaved()).toHaveLength(0);
  });
});

describe("browser-local collections", () => {
  it("creates, counts, renames and deletes collections", () => {
    const collection = createLocalCollection("AI Projects", "Everything agent related");
    expect(listLocalCollections()).toHaveLength(1);

    const saved = saveLocally(seed);
    moveLocalToCollection(saved.id, collection.id);
    expect(collectionCounts()[collection.id]).toBe(1);
    expect(listLocalSaved()[0]?.collectionId).toBe(collection.id);

    renameLocalCollection(collection.id, "Agents", null);
    expect(listLocalCollections()[0]?.name).toBe("Agents");

    deleteLocalCollection(collection.id);
    expect(listLocalCollections()).toHaveLength(0);
    // The repository survives, only the assignment is cleared.
    expect(listLocalSaved()[0]?.collectionId).toBeNull();
  });

  it("rejects duplicate collection names", () => {
    createLocalCollection("React Libraries", null);
    expect(() => createLocalCollection("react libraries", null)).toThrow(/already exists/);
  });
});

describe("browser-local search history", () => {
  it("records, de-duplicates and clears searches", () => {
    addLocalHistory({ query: "react", mode: "repository", sort: "best-match", filters: {}, resultCount: 10 });
    addLocalHistory({ query: "rust cli", mode: "find-repo", sort: "stars", filters: {}, resultCount: 3 });
    expect(listLocalHistory()).toHaveLength(2);

    // Re-running the same query moves it to the top instead of duplicating.
    addLocalHistory({ query: "react", mode: "repository", sort: "stars", filters: {}, resultCount: 12 });
    const entries = listLocalHistory();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.query).toBe("react");
    expect(entries[0]?.sort).toBe("stars");

    clearLocalHistory();
    expect(listLocalHistory()).toHaveLength(0);
  });
});
