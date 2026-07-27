import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const destination = process.cwd();
const requestedSource = process.argv[2] ?? "";
const manifestOnly = requestedSource === "--manifest-only";
const source = path.resolve(manifestOnly ? "" : requestedSource);
const manifest = JSON.parse(await readFile(path.join(destination, "atlas-hub-source.json"), "utf8"));
if (!manifestOnly && (!source || !existsSync(path.join(source, ".git")))) throw new Error("Informe o caminho de um checkout atlas-impact.");
const sourceSha = manifestOnly ? manifest.commit : execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (sourceSha !== manifest.commit) throw new Error(`SHA fonte inesperado: ${sourceSha}; esperado ${manifest.commit}`);

const hash = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
let compared = 0;
for (const relative of manifest.corePaths) {
  if (manifestOnly) {
    if (!existsSync(path.join(destination, relative))) throw new Error(`Namespace ausente: ${relative}`);
    continue;
  }
  const sourceRoot = path.join(source, relative);
  const destinationRoot = path.join(destination, relative);
  const sourceFiles = new Set();
  async function walk(dir, prefix = "") {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const rel = path.join(prefix, entry.name);
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), rel);
      else {
        const from = path.join(dir, entry.name);
        const to = path.join(destinationRoot, rel);
        const manifestRelative = path.join(relative, rel).replaceAll(path.sep, "/");
        sourceFiles.add(rel);
        if (manifest.coreAdaptations?.includes(manifestRelative)) { compared++; continue; }
        if (!existsSync(to) || await hash(from) !== await hash(to)) throw new Error(`Arquivo core divergente: ${path.join(relative, rel)}`);
        compared++;
      }
    }
  }
  await walk(sourceRoot);
  async function walkDestination(dir, prefix = "") {
    if (!existsSync(dir)) throw new Error(`Namespace ausente: ${relative}`);
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const rel = path.join(prefix, entry.name);
      if (entry.isDirectory()) await walkDestination(path.join(dir, entry.name), rel);
      else if (!sourceFiles.has(rel)) throw new Error(`Arquivo de negócio não presente na fonte: ${path.join(relative, rel)}`);
    }
  }
  await walkDestination(destinationRoot);
}

const forbidden = [
  ["src", "app", "stu" + "dies"].join("/"),
  ["src", "app", "field"].join("/"),
  ["src", "app", "data-collect"].join("/"),
  ["src", "lib", "stu" + "dies"].join("/"),
  ["src", "eng" + "ine"].join("/"),
  ["src", "app", "api", "stu" + "dies"].join("/"),
  ["src", "app", "api", "public"].join("/"),
];
for (const relative of forbidden) if (existsSync(path.join(destination, relative))) throw new Error(`Caminho proibido presente: ${relative}`);
async function listFiles(dir, prefix = "") {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".next") continue;
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path.join(dir, entry.name), relative));
    else files.push(relative.replaceAll(path.sep, "/"));
  }
  return files;
}
const tracked = manifestOnly
  ? (await listFiles(destination)).join("\n")
  : execFileSync("git", ["ls-files"], { cwd: destination, encoding: "utf8" });
const oldIdentity = ["Open " + "Impact EJ", "open-" + "impact-ej", "open_" + "impact_ej", "Open" + "Impact"];
if (oldIdentity.some((token) => tracked.includes(token))) throw new Error("Identidade antiga presente em arquivos versionados.");
const forbiddenSourceImports = new RegExp([
  ["src", "lib", "stu" + "dies"].join("/"),
  ["src", "eng" + "ine"].join("/"),
  "@/lib/" + "auth",
  "@/lib/" + "workspace-permissions",
].join("|"));
for (const relative of tracked.split(/\r?\n/).filter((item) => item && existsSync(path.join(destination, item)))) {
  if (!/\.(ts|tsx|mjs|json|md|css)$/.test(relative)) continue;
  const content = await readFile(path.join(destination, relative), "utf8");
  if (forbiddenSourceImports.test(content) && !relative.startsWith("docs/atlas-hub-source-manifest.md")) throw new Error(`Dependência proibida em ${relative}`);
}
const pkg = JSON.parse(await readFile(path.join(destination, "package.json"), "utf8"));
if (pkg.name !== "atlas-hub") throw new Error("package name inválido");
console.log(JSON.stringify({ commit: sourceSha, compared, status: "ok" }, null, 2));
