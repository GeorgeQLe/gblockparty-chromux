const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
execFileSync(path.join(root, "scripts", "build-website.sh"), { stdio: "inherit" });

function verifyLocalGallery(indexPath, expectedCount) {
  const sourcePath = path.join(root, indexPath);
  const gallery = fs.readFileSync(sourcePath, "utf8");
  const links = [...gallery.matchAll(/<a class="card" href="([^"]+)">/g)].map((match) => match[1]);

  assert.equal(links.length, expectedCount, `${indexPath} should contain all ${expectedCount} local links`);

  for (const link of links) {
    assert.match(link, /^[a-z0-9-]+\.html$/, `${link} should be a relative HTML file`);
    assert.ok(fs.statSync(path.resolve(path.dirname(sourcePath), link)).isFile(), `${link} should exist beside the gallery`);
  }
}

function verifyGallery(indexPath, prefix, expectedCount) {
  const gallery = fs.readFileSync(path.join(root, "dist-site", indexPath), "utf8");
  const routes = [...gallery.matchAll(/<a class="card" href="([^"]+)">/g)].map((match) => match[1]);

  assert.equal(routes.length, expectedCount, `${indexPath} should contain all ${expectedCount} ${prefix} routes`);

  for (const route of routes) {
    assert.match(route, new RegExp(`^/${prefix}/[a-z0-9-]+$`), `${route} should use a clean absolute URL`);
    assert.ok(!route.endsWith(".html"), `${route} should not expose an HTML extension`);

    const generatedFile = path.join(root, "dist-site", `${route}.html`);
    assert.ok(fs.statSync(generatedFile).isFile(), `${route} should map to ${generatedFile}`);
  }

  return routes.length;
}

verifyLocalGallery(path.join("design-prototypes", "index.html"), 36);
const designCount = verifyGallery(path.join("designs", "index.html"), "designs", 36);
const mobileCount = verifyGallery(path.join("mobile", "index.html"), "mobile", 7);

console.log(`Verified ${designCount} clean design routes and ${mobileCount} clean mobile routes.`);
