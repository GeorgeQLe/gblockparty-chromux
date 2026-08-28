const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
execFileSync(path.join(root, "scripts", "build-website.sh"), { stdio: "inherit" });

function cardLinks(contents) {
  return [...contents.matchAll(/<a class="card" href="([^"]+)">/g)].map((match) => match[1]);
}

function desktopDesigns() {
  return fs.readdirSync(path.join(root, "design-prototypes"))
    .filter((name) => /^\d{2}-[a-z0-9-]+\.html$/.test(name))
    .sort();
}

function verifyLocalDesignGallery(designs) {
  const gallery = fs.readFileSync(path.join(root, "design-prototypes", "index.html"), "utf8");
  const viewer = fs.readFileSync(path.join(root, "design-prototypes", "viewer.html"), "utf8");
  const links = cardLinks(gallery);

  assert.equal(links.length, designs.length, "local desktop gallery should contain all designs");
  assert.deepEqual(
    links,
    designs.map((filename) => `viewer.html?design=${filename}`),
    "local desktop gallery should route every allowlisted file through the shared viewer",
  );
  assert.ok(fs.statSync(path.join(root, "design-prototypes", "viewer.html")).isFile());
  const allowlist = [...viewer.matchAll(/'(\d{2}-[a-z0-9-]+\.html)'/g)].map((match) => match[1]);
  assert.deepEqual(allowlist, designs, "viewer allowlist should exactly match existing desktop prototypes");
}

function verifyGeneratedDesigns(designs) {
  const outputDir = path.join(root, "dist-site", "designs");
  const gallery = fs.readFileSync(path.join(outputDir, "index.html"), "utf8");
  const routes = cardLinks(gallery);

  assert.equal(routes.length, designs.length, "production desktop gallery should contain all designs");

  for (const filename of designs) {
    const slug = filename.replace(/\.html$/, "");
    const route = `/designs/${slug}`;
    const wrapperPath = path.join(outputDir, `${slug}.html`);
    const rawPath = path.join(outputDir, "raw", filename);
    const wrapper = fs.readFileSync(wrapperPath, "utf8");
    const source = fs.readFileSync(path.join(root, "design-prototypes", filename), "utf8");
    const title = source.match(/<title>([^<]+)<\/title>/i)[1];

    assert.ok(routes.includes(route), `${route} should remain a clean public route`);
    assert.match(wrapper, /<iframe|createElement\('iframe'\)/, `${route} should use the viewer canvas`);
    assert.ok(
      wrapper.includes(`"src":"/designs/raw/${filename}"`),
      `${route} should reference its matching raw prototype`,
    );
    assert.ok(wrapper.includes(`<title>${title}</title>`), `${route} should preserve its prototype page title`);
    assert.equal(
      fs.readFileSync(rawPath, "utf8"),
      source,
      `${filename} should be copied unchanged into designs/raw`,
    );
  }

  assert.ok(fs.statSync(path.join(outputDir, "viewer.html")).isFile(), "generic viewer should be generated");
  return routes.length;
}

function verifyMobileGallery() {
  const sourceGallery = fs.readFileSync(path.join(root, "mobile-prototypes", "index.html"), "utf8");
  const generatedGallery = fs.readFileSync(path.join(root, "dist-site", "mobile", "index.html"), "utf8");
  const sourceArchive = fs.readFileSync(path.join(root, "mobile-prototypes", "archive", "index.html"), "utf8");
  const generatedArchive = fs.readFileSync(path.join(root, "dist-site", "mobile", "archive", "index.html"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "mobile-prototypes", "routes.json"), "utf8"));
  const generatedManifest = JSON.parse(fs.readFileSync(path.join(root, "dist-site", "mobile", "routes.json"), "utf8"));
  const labRoutes = cardLinks(sourceGallery);
  const builtLabRoutes = cardLinks(generatedGallery);
  const historicalRoutes = cardLinks(sourceArchive);
  const builtHistoricalRoutes = cardLinks(generatedArchive);

  assert.equal(labRoutes.length, 3, "mobile lab should contain exactly three MVP cards");
  assert.deepEqual(labRoutes, manifest.lab, "lab cards should match the route manifest");
  assert.deepEqual(builtLabRoutes, labRoutes, "production mobile lab should preserve all MVP routes");
  assert.equal(manifest.archive, "/mobile/archive/", "manifest should expose the archive index");
  assert.equal(historicalRoutes.length, 7, "archive should retain all seven historical routes");
  assert.deepEqual(historicalRoutes, manifest.historical, "archive cards should match the historical manifest");
  assert.deepEqual(builtHistoricalRoutes, historicalRoutes, "production archive should preserve historical routes");
  assert.deepEqual(generatedManifest, manifest, "generated route manifest should be byte-equivalent JSON data");

  for (const route of [...labRoutes, ...historicalRoutes]) {
    assert.match(route, /^\/mobile\/[a-z0-9-]+$/, `${route} should remain a clean mobile URL`);
    const source = path.join(root, "mobile-prototypes", `${route.split("/").pop()}.html`);
    const output = path.join(root, "dist-site", `${route}.html`);
    assert.ok(fs.statSync(output).isFile(), `${route} should be built`);
    assert.equal(fs.readFileSync(output, "utf8"), fs.readFileSync(source, "utf8"), `${route} should be copied byte-identically`);
  }

  assert.equal(generatedGallery, sourceGallery, "mobile lab index should be copied byte-identically");
  assert.equal(generatedArchive, sourceArchive, "archive index should be copied byte-identically");

  const forbidden = [
    "browser evidence", "project navigation", "file navigation", "alignment", "deck", "canvas",
    "repository", "local pty", "launch session", "stop session", "package scripts", "voice", "camera",
    "timeline branch", "dashboard",
  ];
  for (const route of labRoutes) {
    const content = fs.readFileSync(path.join(root, "dist-site", `${route}.html`), "utf8").toLowerCase();
    for (const phrase of forbidden) assert.ok(!content.includes(phrase), `${route} should exclude ${phrase}`);
    assert.match(content, /← mobile lab/i, `${route} should have a clearly labeled lab back control`);
    assert.match(content, /data-attach/, `${route} should support read-only attachment`);
    assert.match(content, /data-confirm/, `${route} should require control confirmation`);
    assert.match(content, /data-release/, `${route} should support explicit control release`);
  }

  return labRoutes.length + historicalRoutes.length;
}

const designs = desktopDesigns();
assert.equal(designs.length, 36, "desktop prototype allowlist should contain 36 files");
verifyLocalDesignGallery(designs);
const designCount = verifyGeneratedDesigns(designs);
const mobileCount = verifyMobileGallery();

console.log(`Verified ${designCount} responsive design routes, 3 mobile MVP routes, and ${mobileCount - 3} archived mobile routes.`);
