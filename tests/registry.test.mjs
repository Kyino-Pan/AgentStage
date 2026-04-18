import assert from "node:assert/strict";
import test from "node:test";

import { removePageFromRegistry } from "../lib/registry.mjs";

test("removePageFromRegistry removes target page and keeps latest remaining page as next target", () => {
  const registry = {
    version: 1,
    updatedAt: "2026-04-18T00:00:00.000Z",
    users: [
      {
        id: "demo-user",
        name: "Demo User",
        description: "",
        pages: [
          {
            id: "older-page",
            title: "Older Page",
            createdAt: "2026-04-17T00:00:00.000Z",
            updatedAt: "2026-04-17T00:00:00.000Z"
          },
          {
            id: "newer-page",
            title: "Newer Page",
            createdAt: "2026-04-18T00:00:00.000Z",
            updatedAt: "2026-04-18T00:00:00.000Z"
          }
        ]
      }
    ]
  };

  const removed = removePageFromRegistry(registry, "demo-user", "older-page");

  assert(removed);
  assert.equal(removed.page.id, "older-page");
  assert.equal(removed.removedUser, false);
  assert.equal(removed.nextPage?.id, "newer-page");
  assert.equal(registry.users[0].pages.length, 1);
  assert.equal(registry.users[0].pages[0].id, "newer-page");
});

test("removePageFromRegistry removes empty user when deleting its final page", () => {
  const registry = {
    version: 1,
    updatedAt: "2026-04-18T00:00:00.000Z",
    users: [
      {
        id: "solo-user",
        name: "Solo User",
        description: "",
        pages: [
          {
            id: "only-page",
            title: "Only Page",
            createdAt: "2026-04-18T00:00:00.000Z",
            updatedAt: "2026-04-18T00:00:00.000Z"
          }
        ]
      }
    ]
  };

  const removed = removePageFromRegistry(registry, "solo-user", "only-page");

  assert(removed);
  assert.equal(removed.page.id, "only-page");
  assert.equal(removed.removedUser, true);
  assert.equal(removed.nextPage, null);
  assert.equal(registry.users.length, 0);
});
