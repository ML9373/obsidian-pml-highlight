#!/usr/bin/env node
/**
 * Copies the production build into the vault's local plugin folder.
 *
 * Why this exists: the deployed copy used to be produced by hand, and drifted from the
 * production build (it carried esbuild's dev-mode `/* nosourcemap *\/` marker, so the
 * running plugin was not byte-identical to `npm run build`'s output). Run `npm run deploy`
 * instead of copying files manually, so what runs in Obsidian is always reproducible from
 * the committed source.
 *
 * The vault path is read from PML_VAULT_PLUGIN_DIR when set, so this stays portable
 * across machines (macOS and Windows) and never hardcodes a home directory.
 */
import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_VAULT_PLUGIN_DIR = join(
	homedir(),
	"SYDRVAULT",
	".obsidian",
	"plugins",
	"syd-pml-highlight"
);
const target = process.env.PML_VAULT_PLUGIN_DIR
	? resolve(process.env.PML_VAULT_PLUGIN_DIR)
	: DEFAULT_VAULT_PLUGIN_DIR;

const ARTIFACTS = ["main.js", "manifest.json", "styles.css"];

async function main() {
	for (const f of ARTIFACTS) {
		const src = join(repoRoot, f);
		try {
			await stat(src);
		} catch {
			console.error(`Missing build artifact: ${f}. Run "npm run build" first.`);
			process.exit(1);
		}
	}

	await mkdir(target, { recursive: true });
	for (const f of ARTIFACTS) {
		await copyFile(join(repoRoot, f), join(target, f));
		console.log(`copied ${f} -> ${join(target, f)}`);
	}
	console.log("\nReload Obsidian (or toggle the plugin off/on) to pick up the new build.");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
