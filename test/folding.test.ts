import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFoldRange, isInsidePmlFence } from "../src/folding.ts";

/**
 * The 11 cases the v0.5.0 changelog claimed were verified. They were run ad hoc and never
 * committed, so the folding algorithm shipped with no regression guard at all. This file
 * is that guard.
 *
 * `wholeFile` true = a raw .pml file opened in PmlFileView.
 * `wholeFile` false = a ```pml fence inside a Markdown note.
 */

const L = (s: string) => s.split("\n");

test("simple if/endif folds from the opener to the line before the closer", () => {
	const lines = L(`if (!x eq 1) then\n  !y = 2\n  !z = 3\nendif`);
	assert.deepEqual(computeFoldRange(lines, 1, true), { startLine: 1, endLine: 3 });
});

test("nested if inside do folds each level independently", () => {
	const lines = L(`do !i from 1 to 10\n  if (!i gt 5) then\n    !s = 'hi'\n  endif\nenddo`);
	assert.deepEqual(computeFoldRange(lines, 1, true), { startLine: 1, endLine: 4 });
	assert.deepEqual(computeFoldRange(lines, 2, true), { startLine: 2, endLine: 3 });
});

test("elseif is a continuation, neither opener nor closer", () => {
	const lines = L(`if (!a) then\n  !b = 1\nelseif (!c) then\n  !d = 2\nendif`);
	assert.deepEqual(computeFoldRange(lines, 1, true), { startLine: 1, endLine: 4 });
	assert.equal(computeFoldRange(lines, 3, true), null);
});

test("elsehandle is a continuation, not an opener", () => {
	const lines = L(`handle (1,2)\n  !x = 1\nelsehandle any\n  !x = 2\nendhandle`);
	assert.deepEqual(computeFoldRange(lines, 1, true), { startLine: 1, endLine: 4 });
	assert.equal(computeFoldRange(lines, 3, true), null);
});

test("single-line if with its own endif does not fold", () => {
	assert.equal(computeFoldRange(L(`if (!a) then !b = 1 endif`), 1, true), null);
});

test("opener immediately followed by its closer does not fold", () => {
	assert.equal(computeFoldRange(L(`if (!a) then\nendif`), 1, true), null);
});

test("define method / endmethod folds", () => {
	const lines = L(`define method .run(!arg is STRING)\n  !this.value = !arg\n  return\nendmethod`);
	assert.deepEqual(computeFoldRange(lines, 1, true), { startLine: 1, endLine: 3 });
});

test("setup command / exit is deliberately not folded", () => {
	const lines = L(`setup command 'FOO'\n  !x = 1\nexit`);
	assert.equal(computeFoldRange(lines, 1, true), null);
});

test("setup form folds only when terminated by endsetup", () => {
	const endsetup = L(`setup form !!myForm\n  !x = 1\n  !y = 2\nendsetup`);
	assert.deepEqual(computeFoldRange(endsetup, 1, true), { startLine: 1, endLine: 3 });
	// gadget-style form closed by a bare `exit`: no fold, by design
	const exitForm = L(`setup form !!myForm\n  frame .f\n  exit\nexit`);
	assert.equal(computeFoldRange(exitForm, 1, true), null);
});

test("an unterminated opener does not fold", () => {
	assert.equal(computeFoldRange(L(`if (!a) then\n  !b = 1\n  !c = 2`), 1, true), null);
});

test("inside a Markdown note, folding applies only within a pml fence", () => {
	const lines = L("Some prose\n\n```pml\nif (!a) then\n  !b = 1\nendif\n```\n\nMore prose");
	assert.equal(isInsidePmlFence(lines, 4), true);
	assert.deepEqual(computeFoldRange(lines, 4, false), { startLine: 4, endLine: 5 });
	// the very same opener outside any fence must not fold
	const bare = L(`if (!a) then\n  !b = 1\nendif`);
	assert.equal(computeFoldRange(bare, 1, false), null);
});

test("a fence that closes before the matching closer is malformed and does not fold", () => {
	const lines = L("```pml\nif (!a) then\n  !b = 1\n```\nendif");
	assert.equal(computeFoldRange(lines, 2, false), null);
});
