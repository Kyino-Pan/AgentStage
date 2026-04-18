import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUpdateViewModel,
  normalizeUpdateState,
  parseLsRemoteHeadOutput,
  shouldShowUpdateBadge
} from "../lib/update.mjs";

test("parseLsRemoteHeadOutput extracts the HEAD sha", () => {
  const commit = parseLsRemoteHeadOutput("0123456789abcdef0123456789abcdef01234567\tHEAD\n");
  assert.equal(commit, "0123456789abcdef0123456789abcdef01234567");
});

test("normalizeUpdateState falls back to manual mode for unsupported values", () => {
  const state = normalizeUpdateState({ mode: "unexpected" });
  assert.equal(state.mode, "manual");
});

test("shouldShowUpdateBadge hides dismissed updates until a newer remote commit appears", () => {
  assert.equal(
    shouldShowUpdateBadge({
      hasUpdate: true,
      remoteCommit: "remote-a",
      dismissedRemoteCommit: "remote-a"
    }),
    false
  );

  assert.equal(
    shouldShowUpdateBadge({
      hasUpdate: true,
      remoteCommit: "remote-b",
      dismissedRemoteCommit: "remote-a"
    }),
    true
  );
});

test("buildUpdateViewModel exposes computed showBadge state", () => {
  const view = buildUpdateViewModel({
    mode: "manual",
    hasUpdate: true,
    remoteCommit: "remote-b",
    dismissedRemoteCommit: "remote-a"
  });

  assert.equal(view.mode, "manual");
  assert.equal(view.showBadge, true);
});
