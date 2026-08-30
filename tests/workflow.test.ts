import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("trusted MCP main verification uses one dynamically labeled ephemeral runner", () => {
  const workflow = source(".github/workflows/ci.yml");

  assert.match(
    workflow,
    /runs-on: \[self-hosted, linux, x64, jit-runner, "jit-run-\$\{\{ github\.run_id \}\}"\]/,
  );
  assert.match(workflow, /github\.repository == 'Arnon-hs\/atlasrepo-mcp'/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /timeout-minutes: 45/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /docker build --tag "\$image" \./);
  assert.match(workflow, /docker image inspect "\$image"/);
  assert.doesNotMatch(workflow, /actions\/(provision|destroy)@/);
  assert.doesNotMatch(workflow, /needs\.provision\.outputs\.runner-label/);
  assert.doesNotMatch(workflow, /environment: production/);
  assert.doesNotMatch(workflow, /Zeabur|redeployService|\/livez|\/readyz|release=\$\{GITHUB_RUN_ID\}/);
  assert.match(workflow, /Public PR quality gates[\s\S]+runs-on: ubuntu-24\.04/);
  assert.match(workflow, /persist-credentials: false/);
});

test("production releases are delegated to the Schema contract", () => {
  const readme = source("README.md");

  assert.match(
    readme,
    /Arnon-hs\/atlasrepo-schema\/\.github\/workflows\/release\.yml/,
  );
});

test("npm publishing stays on a pinned hosted OIDC workflow", () => {
  const workflow = source(".github/workflows/publish.yml");

  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.doesNotMatch(workflow, /uses: actions\/(checkout|setup-node)@v/);
  assert.match(workflow, /persist-credentials: false/);
});
