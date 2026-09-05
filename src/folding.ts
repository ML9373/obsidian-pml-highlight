/**
 * Pure PML block-folding logic. Like `tokenizer.ts`, this module deliberately imports
 * neither Obsidian nor CodeMirror: the depth-matching algorithm is the riskiest part of
 * the plugin and the only way to guard it against regressions is to test it standalone.
 * `main.ts` adapts a CodeMirror document to the plain string array this module expects.
 *
 * Block pairs are deliberately scoped to the unambiguous ones: `if/endif`, `do/enddo`,
 * `define method|function|object/end...`, `setup form/endsetup`, `handle/endhandle`.
 * `elseif`/`else`/`elsehandle` are continuations, not openers or closers (excluded by
 * the leading anchor `^` - they never start with "if"/"handle").
 *
 * `setup command ... exit` and gadget blocks (`view ... exit`, `frame ... exit`) are
 * deliberately NOT folded: `exit` is a generic terminator shared by several different
 * openers, so matching it correctly would need full construct-tracking, and a wrong
 * fold range is worse than no fold.
 *
 * In practice this also limits `setup form` folding: a form with nested gadget
 * containers (view/frame/container) commonly closes the outer `setup form` with `exit`
 * too, not `endsetup` (confirmed in this repo's own TestHighlighting.pmlfrm fixture) -
 * only `endsetup`-terminated forms fold. `define method`/`function`/`object` inside
 * such a file are unaffected and still fold normally.
 */

export const FOLD_OPEN_RE = /^(if|do|define\s+(method|function|object)|setup\s+form|handle)\b/i;
export const FOLD_CLOSE_RE = /^(endif|enddo|endmethod|endfunction|endobject|endsetup|endhandle)\b/i;
export const FOLD_CLOSE_ANYWHERE_RE = /\b(endif|enddo|endmethod|endfunction|endobject|endsetup|endhandle)\b/i;

export function isPmlFenceStart(text: string): boolean {
	return /^```+\s*pml\s*$/i.test(text.trim());
}

export function isPmlFenceEnd(text: string): boolean {
	return /^```+\s*$/.test(text.trim());
}

/**
 * Whether the 1-based `lineNumber` sits inside a ```pml fence, scanning from the top.
 * Mirrors the fence tracking in `buildPmlDecorations` so folding and highlighting always
 * agree on what counts as PML.
 */
export function isInsidePmlFence(lines: readonly string[], lineNumber: number): boolean {
	let inBlock = false;
	for (let i = 1; i < lineNumber; i++) {
		const text = lines[i - 1] ?? "";
		if (!inBlock) {
			if (isPmlFenceStart(text)) inBlock = true;
		} else if (isPmlFenceEnd(text)) {
			inBlock = false;
		}
	}
	return inBlock;
}

/** A foldable region, expressed as inclusive 1-based line numbers. */
export interface FoldLineRange {
	/** Line carrying the opener; the fold starts at its end. */
	startLine: number;
	/** Last line included in the fold (the line before the matching closer). */
	endLine: number;
}

/**
 * Given the document as lines and a 1-based `startNumber`, return the region the opener
 * on that line folds, or null when it does not open a foldable block.
 *
 * `wholeFile` false means we are inside a Markdown note: folding only applies within a
 * ```pml fence, and a fence that ends before the matching closer is treated as malformed.
 */
export function computeFoldRange(
	lines: readonly string[],
	startNumber: number,
	wholeFile: boolean
): FoldLineRange | null {
	const startText = lines[startNumber - 1];
	if (startText === undefined) return null;
	if (!wholeFile && !isInsidePmlFence(lines, startNumber)) return null;

	const trimmed = startText.trim();
	if (!FOLD_OPEN_RE.test(trimmed)) return null;
	// opener and closer on the same line - nothing to fold
	if (FOLD_CLOSE_ANYWHERE_RE.test(trimmed)) return null;

	let depth = 1;
	for (let n = startNumber + 1; n <= lines.length; n++) {
		const t = (lines[n - 1] ?? "").trim();
		// fence ended before a matching closer - malformed, don't fold
		if (!wholeFile && isPmlFenceEnd(t)) return null;
		if (FOLD_OPEN_RE.test(t) && !FOLD_CLOSE_ANYWHERE_RE.test(t)) {
			depth++;
		} else if (FOLD_CLOSE_RE.test(t)) {
			depth--;
			if (depth === 0) {
				// nothing but the closer between opener and closer
				if (n <= startNumber + 1) return null;
				return { startLine: startNumber, endLine: n - 1 };
			}
		}
	}
	return null;
}
