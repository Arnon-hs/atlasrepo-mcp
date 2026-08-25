import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("trusted MCP releases use one dynamically labeled ephemeral runner", () => {
  const workflow = source(".github/workflows/ci.yml");
  const pin = "96807f37c85f7f6f6b5743e305e6385157fafd4d";

  assert.match(workflow, new RegExp(`actions/provision@${pin}`));
  assert.match(workflow, new RegExp(`actions/destroy@${pin}`));
  assert.match(workflow, /needs\.provision\.outputs\.runner-label/);
  assert.match(workflow, /retention-days: 1/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.doesNotMatch(workflow, /runs-on: \[self-hosted, linux, x64, jit-runner\]/);
  assert.match(workflow, /Public PR quality gates[\s\S]+runs-on: ubuntu-24\.04/);
  assert.match(workflow, /persist-credentials: false/);
});

test("npm publishing stays on a pinned hosted OIDC workflow", () => {
  const workflow = source(".github/workflows/publish.yml");

  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.doesNotMatch(workflow, /uses: actions\/(checkout|setup-node)@v/);
  assert.match(workflow, /persist-credentials: false/);
});
