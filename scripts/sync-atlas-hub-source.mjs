import { cp, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const destination = process.cwd();
const source = path.resolve(process.argv[2] ?? "");
const allowDirty = process.argv.includes("--allow-dirty");
if (!source || !existsSync(path.join(source, ".git"))) throw new Error("Informe o caminho de um checkout atlas-impact.");

const manifest = JSON.parse(await readFile(path.join(destination, "atlas-hub-source.json"), "utf8"));
const sourceSha = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (sourceSha !== manifest.commit) throw new Error(`SHA fonte inesperado: ${sourceSha}; esperado ${manifest.commit}`);
if (!allowDirty) {
  const status = execFileSync("git", ["-C", source, "status", "--porcelain"], { encoding: "utf8" }).trim();
  if (status) throw new Error("O checkout fonte está sujo; use --allow-dirty somente para verificação explícita.");
}

let added = 0, updated = 0, removed = 0;
for (const relative of manifest.corePaths) {
  const sourcePath = path.join(source, relative);
  const destinationPath = path.join(destination, relative);
  await mkdir(destinationPath, { recursive: true });
  const sourceFiles = new Set();
  async function collect(dir, prefix = "") {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const rel = path.join(prefix, entry.name);
      if (entry.isDirectory()) await collect(path.join(dir, entry.name), rel);
      else sourceFiles.add(rel);
    }
  }
  await collect(sourcePath);
  async function collectDestination(dir, prefix = "") {
    if (!existsSync(dir)) return;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const rel = path.join(prefix, entry.name);
      if (entry.isDirectory()) await collectDestination(path.join(dir, entry.name), rel);
      else if (!sourceFiles.has(rel)) { await rm(path.join(dir, entry.name)); removed++; }
    }
  }
  await collectDestination(destinationPath);
  for (const rel of sourceFiles) {
    const manifestRelative = path.join(relative, rel).replaceAll(path.sep, "/");
    if (manifest.coreAdaptations?.includes(manifestRelative)) continue;
    const from = path.join(sourcePath, rel);
    const to = path.join(destinationPath, rel);
    const before = existsSync(to) ? await readFile(to) : null;
    const after = await readFile(from);
    await cp(from, to, { force: true });
    if (!before) added++;
    else if (!before.equals(after)) updated++;
  }
}
console.log(JSON.stringify({ source, commit: sourceSha, added, updated, removed }, null, 2));
