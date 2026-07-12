const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
execFileSync(path.join(root, "scripts", "build-website.sh"), { stdio: "inherit" });

const gallery = fs.readFileSync(path.join(root, "dist-site", "designs", "index.html"), "utf8");
const routes = [...gallery.matchAll(/<a class="card" href="([^"]+)">/g)].map((match) => match[1]);

assert.equal(routes.length, 16, "gallery should contain all 16 design routes");

for (const route of routes) {
  assert.match(route, /^\/designs\/[a-z0-9-]+$/, `${route} should use a clean absolute URL`);
  assert.ok(!route.endsWith(".html"), `${route} should not expose an HTML extension`);

  const generatedFile = path.join(root, "dist-site", `${route}.html`);
  assert.ok(fs.statSync(generatedFile).isFile(), `${route} should map to ${generatedFile}`);
}

console.log(`Verified ${routes.length} clean design routes.`);
