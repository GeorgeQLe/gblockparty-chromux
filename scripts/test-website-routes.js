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
  const localLinks = cardLinks(sourceGallery);
  const routes = cardLinks(generatedGallery);

  assert.equal(localLinks.length, 7, "local mobile gallery should retain all seven routes");
  assert.equal(routes.length, 7, "production mobile gallery should retain all seven routes");
  assert.deepEqual(routes, localLinks, "mobile gallery routing should remain unchanged by the desktop viewer build");
  for (const route of routes) {
    assert.match(route, /^\/mobile\/[a-z0-9-]+$/, `${route} should remain a clean mobile URL`);
    assert.ok(fs.statSync(path.join(root, "dist-site", `${route}.html`)).isFile());
  }

  return routes.length;
}

const designs = desktopDesigns();
assert.equal(designs.length, 36, "desktop prototype allowlist should contain 36 files");
verifyLocalDesignGallery(designs);
const designCount = verifyGeneratedDesigns(designs);
const mobileCount = verifyMobileGallery();

console.log(`Verified ${designCount} responsive design routes and ${mobileCount} unchanged mobile routes.`);
