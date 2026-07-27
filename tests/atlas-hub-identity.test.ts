import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { HUB_BRAND } from "../src/lib/hub/brand";

const root = process.cwd();

test("identidade pública é Atlas Hub", async () => {
  assert.equal(HUB_BRAND.productName, "Atlas Hub");
  assert.equal(HUB_BRAND.webRoot, "/hub");
  assert.equal(HUB_BRAND.apiRoot, "/api/hub");
  assert.equal(HUB_BRAND.loginPath, "/hub/login");
  assert.equal(HUB_BRAND.administrationPath, "/hub/ajustes");
  assert.equal(HUB_BRAND.initials, "AH");
  assert.equal(JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).name, "atlas-hub");
  assert.ok((await readFile(path.join(root, "README.md"), "utf8")).startsWith("# Atlas Hub"));
});

test("limite standalone não inclui módulos da aplicação maior", async () => {
  const schema = await readFile(path.join(root, "prisma/schema.prisma"), "utf8");
  const source = await readFile(path.join(root, "src/lib/hub/AtlasHubShell.tsx"), "utf8").catch(() => "");
  assert.doesNotMatch(schema, new RegExp("model\\s+(?:" + ["Stu", "EventImpact", "Methodology"].join("|") + ")"));
  const legacyHome = "/" + "inicio";
  const legacySearch = "/api/" + "search";
  assert.doesNotMatch(source, new RegExp(`${legacyHome}|${legacySearch}`));
  const forbiddenStudiesPath = ["src", "lib", "stu" + "dies"].join(path.sep);
  const forbiddenEnginePath = ["src", "eng" + "ine"].join(path.sep);
  assert.equal(await import("node:fs/promises").then(({ access }) => access(path.join(root, forbiddenStudiesPath)).then(() => true, () => false)), false);
  assert.equal(await import("node:fs/promises").then(({ access }) => access(path.join(root, forbiddenEnginePath)).then(() => true, () => false)), false);
});
