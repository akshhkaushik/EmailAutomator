import assert from "node:assert/strict";
import test from "node:test";
import { extractHttpLinks, markdownToHtml } from "../lib/markdown.ts";

test("extracts unique markdown and plain links for click tracking", () => {
  assert.deepEqual(extractHttpLinks("See [demo](https://demo.example/x) and https://repo.example/a, then [demo](https://demo.example/x)."), [
    "https://demo.example/x",
    "https://repo.example/a",
  ]);
});

test("rewrites HTML link targets without changing their labels", () => {
  const html = markdownToHtml("Open [the demo](https://demo.example/x)", (url) => `https://track.example/click?url=${encodeURIComponent(url)}`);
  assert.match(html, /href="https:\/\/track\.example\/click\?url=https%3A%2F%2Fdemo\.example%2Fx"/);
  assert.match(html, />the demo<\/a>/);
  assert.doesNotMatch(html, /href="https:\/\/demo\.example\/x"/);
});
