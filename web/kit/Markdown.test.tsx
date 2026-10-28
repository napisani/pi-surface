import { cleanup, render, screen } from "@testing-library/react";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { Markdown } from "./Markdown.tsx";

afterEach(cleanup);

test("raw HTML renders as nothing, never as markup", () => {
  const { container } = render(<Markdown text={'<script>alert(1)</script> <img src=x onerror="alert(1)"> hello'} />);
  assert.equal(container.querySelector("script"), null);
  assert.equal(container.querySelector("img"), null);
  assert.match(container.textContent ?? "", /hello/);
});

test("a suggestion fence gets its label", () => {
  render(<Markdown text={"```suggestion\nreturn a === b;\n```"} />);
  assert.ok(screen.getByText("Suggested change"));
});

test("gfm tables render and links open in a new tab", () => {
  const { container } = render(<Markdown text={"| a | b |\n|---|---|\n| 1 | 2 |\n\n[docs](https://example.com)"} />);
  assert.equal(container.querySelectorAll("td").length, 2);
  const link = screen.getByRole("link", { name: "docs" });
  assert.equal(link.getAttribute("target"), "_blank");
  assert.equal(link.getAttribute("rel"), "noreferrer");
});
