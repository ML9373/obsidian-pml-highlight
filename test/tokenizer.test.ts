import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenizePmlLine, parseExtraTypes } from "../src/tokenizer.ts";

/** Compact view of a tokenized line: only the classified tokens, whitespace dropped. */
const classified = (line: string, extra = new Set<string>()) =>
	tokenizePmlLine(line, extra)
		.filter((t) => t.cls !== null && t.text.trim() !== "")
		.map((t) => [t.text, t.cls]);

test("keywords are classified case-insensitively", () => {
	assert.deepEqual(classified("if"), [["if", "pml-keyword"]]);
	assert.deepEqual(classified("ENDIF"), [["ENDIF", "pml-keyword"]]);
});

test("local and global variables are distinguished", () => {
	assert.deepEqual(classified("!local !!global"), [
		["!local", "pml-var-local"],
		["!!global", "pml-var-global"],
	]);
});

test("UDA references are classified", () => {
	assert.deepEqual(classified(":Diameter"), [[":Diameter", "pml-uda"]]);
});

test("both string delimiters are supported", () => {
	assert.deepEqual(classified("'quoted'"), [["'quoted'", "pml-string"]]);
	assert.deepEqual(classified("|piped|"), [["|piped|", "pml-string"]]);
});

test("$* starts a comment that swallows the rest of the line", () => {
	const toks = tokenizePmlLine("!x = 1 $* if this were code it would be a keyword");
	const comment = toks.filter((t) => t.cls === "pml-comment");
	assert.equal(comment.length, 1);
	assert.match(comment[0].text, /^\$\*/);
	// nothing after $* is classified as a keyword
	assert.equal(toks.some((t) => t.cls === "pml-keyword"), false);
});

test("a keyword inside a string is not highlighted as a keyword", () => {
	assert.deepEqual(classified("'if then endif'"), [["'if then endif'", "pml-string"]]);
});

test("numbers, including decimals, are classified", () => {
	assert.deepEqual(classified("42 3.14"), [
		["42", "pml-number"],
		["3.14", "pml-number"],
	]);
});

test("extra types from settings are classified as types", () => {
	const extra = parseExtraTypes("PIPE, EQUI");
	assert.deepEqual(classified("PIPE", extra), [["PIPE", "pml-type"]]);
	// unknown words stay unclassified
	assert.deepEqual(classified("NOZZLE", extra), []);
});

test("parseExtraTypes normalizes case, trims, and drops empties", () => {
	assert.deepEqual([...parseExtraTypes(" pipe , equi ,,\n stru ")], ["PIPE", "EQUI", "STRU"]);
});

test("tokenizing is stateless across calls (the shared regex is reset)", () => {
	const first = classified("!a = 'x'");
	const second = classified("!a = 'x'");
	assert.deepEqual(first, second);
});
