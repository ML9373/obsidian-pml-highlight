/**
 * Pure PML lexer. No Obsidian and no CodeMirror imports on purpose: this module is the
 * one piece of the plugin that can be unit-tested outside the editor, so it must stay
 * free of any editor dependency.
 */

export interface Token {
	text: string;
	cls: string | null;
}

export const KEYWORDS = new Set([
	"DEFINE", "METHOD", "ENDMETHOD", "OBJECT", "ENDOBJECT", "FUNCTION", "ENDFUNCTION",
	"IF", "THEN", "ELSEIF", "ELSE", "ENDIF", "DO", "ENDDO", "WHILE", "VALUES", "INDICES",
	"FROM", "TO", "HANDLE", "ANY", "ELSEHANDLE", "ENDHANDLE", "SKIP", "BREAK", "EXIT",
	"GOLABEL", "LABEL", "RETURN", "MEMBER", "VAR", "NEW", "IMPORT", "USING", "NAMESPACE",
	"SETUP", "ENDSETUP", "COLLECT", "WITH", "FOR", "ALL", "NOT", "AND", "OR", "IS",
	"LOCAL", "GLOBAL", "DELETE", "CALL", "CALLBACK",
]);

export const TYPES = new Set([
	"STRING", "ARRAY", "REAL", "BOOLEAN", "DBREF", "FILE", "COLLECTION", "GADGET",
	"REF", "TEXT", "UDA", "DBWALK", "PMLOBJECT",
]);

export function parseExtraTypes(raw: string): Set<string> {
	return new Set(
		raw.split(/[,\n]/).map((s) => s.trim().toUpperCase()).filter(Boolean)
	);
}

// Order matters: strings, then !!global / !local, then :uda, then numbers, then words, then whitespace/other.
const TOKEN_RE = /'[^']*'|\|[^|]*\||!!\w+|!\w+|:\w+|\b\d+(?:\.\d+)?\b|[A-Za-z_]\w*|\s+|./g;

/**
 * PML has no multi-line strings or block comments (per pml-customization-guide):
 * `$*` starts a line comment, `'...'` / `|...|` are single-line string literals.
 * A per-line tokenizer is therefore sufficient - no cross-line state needed.
 */
export function tokenizePmlLine(line: string, extraTypes: Set<string> = new Set()): Token[] {
	const commentIdx = line.indexOf("$*");
	const code = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
	const comment = commentIdx >= 0 ? line.slice(commentIdx) : "";

	const tokens: Token[] = [];
	let m: RegExpExecArray | null;
	// Last non-whitespace token seen, so a word can tell whether it follows a `.`
	// (member access) — PML2 is heavily object-oriented and those names carry meaning.
	let prev: string | null = null;
	TOKEN_RE.lastIndex = 0;
	while ((m = TOKEN_RE.exec(code))) {
		const t = m[0];
		if (/^\s+$/.test(t)) {
			tokens.push({ text: t, cls: null });
			continue;
		}
		const afterDot = prev === ".";
		prev = t;
		if (t.startsWith("'") || t.startsWith("|")) {
			tokens.push({ text: t, cls: "pml-string" });
			continue;
		}
		if (t.startsWith("!!")) {
			tokens.push({ text: t, cls: "pml-var-global" });
			continue;
		}
		if (t.startsWith("!")) {
			tokens.push({ text: t, cls: "pml-var-local" });
			continue;
		}
		if (t.startsWith(":")) {
			tokens.push({ text: t, cls: "pml-uda" });
			continue;
		}
		if (/^\d/.test(t)) {
			tokens.push({ text: t, cls: "pml-number" });
			continue;
		}
		if (/^[A-Za-z_]/.test(t)) {
			const upper = t.toUpperCase();
			if (afterDot) {
				// `!obj.method()`, `!!ce.name` and a `define method .foo()` declaration all land
				// here. Methods and attributes are deliberately not distinguished: telling them
				// apart needs the object's type, which a single-line lexer cannot know, and an
				// attribute read looks exactly like a no-argument call. A word after a `.` is a
				// member name even when it collides with a keyword or a type: `!part.delete`
				// reads an attribute, it is not the DELETE statement.
				tokens.push({ text: t, cls: "pml-method" });
			} else if (KEYWORDS.has(upper)) {
				tokens.push({ text: t, cls: "pml-keyword" });
			} else if (TYPES.has(upper) || extraTypes.has(upper)) {
				tokens.push({ text: t, cls: "pml-type" });
			} else {
				tokens.push({ text: t, cls: null });
			}
			continue;
		}
		tokens.push({ text: t, cls: "pml-operator" });
	}
	if (comment) tokens.push({ text: comment, cls: "pml-comment" });
	return tokens;
}
