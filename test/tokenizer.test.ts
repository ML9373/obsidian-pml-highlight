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

test("a word after a dot is a member, not plain text", () => {
	assert.deepEqual(classified("!obj.method()"), [
		["!obj", "pml-var-local"],
		[".", "pml-operator"],
		["method", "pml-method"],
		["(", "pml-operator"],
		[")", "pml-operator"],
	]);
});

test("a member name wins over a keyword or type collision", () => {
	// `!part.delete` reads an attribute; DELETE the statement only exists at statement level.
	assert.deepEqual(classified("!part.delete"), [
		["!part", "pml-var-local"],
		[".", "pml-operator"],
		["delete", "pml-method"],
	]);
	assert.deepEqual(classified("!e.string"), [
		["!e", "pml-var-local"],
		[".", "pml-operator"],
		["string", "pml-method"],
	]);
});

test("a method declaration's name is a member", () => {
	assert.deepEqual(classified("define method .setLength(!len is REAL)"), [
		["define", "pml-keyword"],
		["method", "pml-keyword"],
		[".", "pml-operator"],
		["setLength", "pml-method"],
		["(", "pml-operator"],
		["!len", "pml-var-local"],
		["is", "pml-keyword"],
		["REAL", "pml-type"],
		[")", "pml-operator"],
	]);
});

test("chained members are all classified", () => {
	assert.deepEqual(classified("!!ce.owner.name"), [
		["!!ce", "pml-var-global"],
		[".", "pml-operator"],
		["owner", "pml-method"],
		[".", "pml-operator"],
		["name", "pml-method"],
	]);
});

test("a decimal number is not read as member access", () => {
	assert.deepEqual(classified("!x = 1.5"), [
		["!x", "pml-var-local"],
		["=", "pml-operator"],
		["1.5", "pml-number"],
	]);
});

test("a dot inside a string or comment does not classify a member", () => {
	assert.deepEqual(classified("'a.b'"), [["'a.b'", "pml-string"]]);
	assert.deepEqual(classified("$* see !obj.method"), [["$* see !obj.method", "pml-comment"]]);
});
