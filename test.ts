#!/usr/bin/env npx tsx

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import plugin from "./index.js";
import { MetasearchService } from "./service.js";

const fakeInput = {
  client: {} as any,
  project: {} as any,
  directory: "/tmp",
  worktree: "/tmp",
  serverUrl: new URL("http://localhost:0"),
  $: (() => {}) as any,
  experimental_workspace: { register: () => {} } as any,
};

const fakeContext = {
  sessionID: "test",
  messageID: "test",
  agent: "test",
  directory: "/tmp",
  worktree: "/tmp",
  abort: new AbortController().signal,
  metadata: () => {},
  ask: (() => {}) as any,
};

describe("web_search tool", () => {
  let hooks: Awaited<ReturnType<typeof plugin>>;

  it("plugin registers web_search tool with type arg", async () => {
    hooks = await plugin(fakeInput);
    assert.ok(hooks.tool?.web_search);
    assert.ok(hooks.tool.web_search.args.query);
    assert.ok(hooks.tool.web_search.args.type);
  });

  it("returns raw JSON for web search", async () => {
    const result = await hooks.tool!.web_search.execute(
      { query: "node.js", type: "all" },
      fakeContext,
    );
    const parsed = JSON.parse(result);
    assert.ok(Array.isArray(parsed), "response should be an array");
    assert.ok(parsed[0].search_results, "should have search_results");
    assert.ok(parsed[0].search_results.length > 0, "should have at least one result");

    const first = parsed[0].search_results[0];
    assert.ok(first.result.url, "result should have a url");
    assert.ok(first.result.title, "result should have a title");
    assert.ok(first.engines.length > 0, "result should have engine sources");
    assert.ok(typeof first.score === "number", "result should have a score");
  });

  it("returns raw JSON for image search", async () => {
    const result = await hooks.tool!.web_search.execute(
      { query: "golden retriever", type: "images" },
      fakeContext,
    );
    const parsed = JSON.parse(result);
    assert.ok(Array.isArray(parsed), "response should be an array");
    assert.ok(parsed.length > 0, "response should have at least one tab");
    assert.ok("image_results" in parsed[0], "should have image_results field");
    assert.ok(Array.isArray(parsed[0].image_results), "image_results should be an array");
  });
});

describe("MetasearchService.resolveBin", () => {
  it("finds the bundled binary", () => {
    const bin = MetasearchService.resolveBin();
    assert.ok(bin, "should resolve a binary path");
    assert.match(bin, /metasearch/, "path should contain 'metasearch'");
  });
});
