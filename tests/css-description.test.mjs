import assert from "node:assert/strict";
import test from "node:test";
import { readCssDescription, writeCssDescription } from "../src/css-description.ts";

test("reads a standalone leading description and ignores unrelated leading comments", () => {
  const css = "/* License: Example */\n/* @description: Adds alternating row colors. */\nbody {}\n";
  assert.equal(readCssDescription(css), "Adds alternating row colors.");
});

test("adds metadata to an empty snippet without adding a final newline", () => {
  assert.equal(writeCssDescription("", "A short description"), "/* @description: A short description */");
});

test("adds metadata after leading comments and before the first CSS rule", () => {
  const css = "/* License */\n\nbody { color: red; }\n";
  const expected = "/* License */\n\n/* @description: Red body text */\nbody { color: red; }\n";
  assert.equal(writeCssDescription(css, "Red body text"), expected);
});

test("keeps an indented first rule byte-for-byte after adding and clearing a description", () => {
  const css = "\uFEFF/* License */\r\n\r\n\t  body { color: red; }";
  const withDescription = "\uFEFF/* License */\r\n\r\n/* @description: Red text */\r\n\t  body { color: red; }";
  assert.equal(writeCssDescription(css, "Red text"), withDescription);
  assert.equal(writeCssDescription(withDescription, ""), css);
});

test("updates metadata while preserving CSS, comments, indentation, CRLF, and the final newline", () => {
  const css = "/* License */\r\n\t/* @description: Old text */  \r\nbody { color: red; }\r\n";
  const expected = "/* License */\r\n\t/* @description: New text */  \r\nbody { color: red; }\r\n";
  assert.equal(writeCssDescription(css, "New text"), expected);
});

test("clears metadata and keeps unrelated bytes intact", () => {
  const css = "/* License */\n/* @description: Remove me */\nbody { color: red; }\n";
  const cleared = writeCssDescription(css, "   ");
  assert.equal(cleared, "/* License */\nbody { color: red; }\n");
  assert.equal(readCssDescription(cleared), undefined);
});

test("does not treat CSS strings or comments after a rule as header metadata", () => {
  const css = ".selector { content: \"/* @description: fake */\"; }\n/* @description: later */\n";
  assert.equal(readCssDescription(css), undefined);
  assert.equal(
    writeCssDescription(css, "Real description"),
    `/* @description: Real description */\n${css}`,
  );
});

test("updates every duplicate header comment and clears every duplicate", () => {
  const css = "/* @description: First */\n/* @description: Second */\nbody {}\n";
  assert.equal(readCssDescription(css), "First");
  const updated = writeCssDescription(css, "One current description");
  assert.equal(
    updated,
    "/* @description: One current description */\n/* @description: One current description */\nbody {}\n",
  );
  assert.equal(writeCssDescription(updated, ""), "body {}\n");
});

test("preserves a BOM, legal leading @charset position, CRLF, and unrelated comments", () => {
  const css = "\uFEFF@charset \"UTF-8\";\r\n/* License */\r\nbody {}\r\n";
  const expected = "\uFEFF@charset \"UTF-8\";\r\n/* License */\r\n/* @description: Encoded stylesheet */\r\nbody {}\r\n";
  assert.equal(writeCssDescription(css, "Encoded stylesheet"), expected);
  assert.equal(readCssDescription(expected), "Encoded stylesheet");
});

test("supports an @charset directive without a trailing line break", () => {
  assert.equal(
    writeCssDescription("@charset \"UTF-8\";body {}", "CSS snippet"),
    "@charset \"UTF-8\";\n/* @description: CSS snippet */\nbody {}",
  );
});

test("rejects multiline text and comment terminators without changing source", () => {
  const css = "body {}\n";
  assert.throws(() => writeCssDescription(css, "two\nlines"), /single line/);
  assert.throws(() => writeCssDescription(css, "close */ comment"), /cannot contain \*\//);
  assert.equal(css, "body {}\n");
});

test("does not match description-looking text inside a leading license comment", () => {
  const css = "/* License notes: @description: not metadata */\nbody {}\n";
  assert.equal(readCssDescription(css), undefined);
});

test("reads, updates, and clears a description sharing a line with a leading @charset", () => {
  const css = "@charset \"UTF-8\"; /* @description: x */\nbody {}\n";
  assert.equal(readCssDescription(css), "x");
  assert.equal(writeCssDescription(css, ""), "@charset \"UTF-8\";\nbody {}\n");
  const updated = writeCssDescription(css, "y");
  assert.equal(updated, "@charset \"UTF-8\"; /* @description: y */\nbody {}\n");
  assert.equal(updated.split("@description:").length - 1, 1);
});

test("reads, updates, and clears a description sharing a line with a rule", () => {
  const css = "/* @description: x */ body {}\n";
  assert.equal(readCssDescription(css), "x");
  assert.equal(writeCssDescription(css, ""), "body {}\n");
  const updated = writeCssDescription(css, "y");
  assert.equal(updated, "/* @description: y */ body {}\n");
  assert.equal(updated.split("@description:").length - 1, 1);
});
