#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "design-prototypes");
const outputDir = path.join(root, "dist-site", "designs");
const rawDir = path.join(outputDir, "raw");
const templatePath = path.join(sourceDir, "viewer.html");
const configMarker = "window.CHROMUX_DESIGN = null;";
const designPattern = /^\d{2}-[a-z0-9-]+\.html$/;

const designs = fs.readdirSync(sourceDir).filter((name) => designPattern.test(name)).sort();
if (designs.length !== 36) {
  throw new Error(`Expected 36 desktop prototypes, found ${designs.length}.`);
}

const template = fs.readFileSync(templatePath, "utf8");
if (!template.includes(configMarker)) {
  throw new Error(`Viewer template is missing configuration marker: ${configMarker}`);
}

fs.mkdirSync(rawDir, { recursive: true });
fs.copyFileSync(templatePath, path.join(outputDir, "viewer.html"));

for (const filename of designs) {
  const prototype = fs.readFileSync(path.join(sourceDir, filename), "utf8");
  const titleMatch = prototype.match(/<title>([^<]+)<\/title>/i);
  if (!titleMatch) throw new Error(`${filename} is missing a page title.`);

  fs.copyFileSync(path.join(sourceDir, filename), path.join(rawDir, filename));

  const slug = filename.replace(/\.html$/, "");
  const config = {
    filename,
    src: `/designs/raw/${filename}`,
    title: titleMatch[1],
  };
  const wrapper = template
    .replace("<title>Chromux — Design Viewer</title>", `<title>${titleMatch[1]}</title>`)
    .replace(configMarker, `window.CHROMUX_DESIGN = ${JSON.stringify(config)};`);
  fs.writeFileSync(path.join(outputDir, `${slug}.html`), wrapper);
}

const gallerySource = fs.readFileSync(path.join(sourceDir, "index.html"), "utf8");
const gallery = gallerySource.replace(
  /href="viewer\.html\?design=(\d{2}-[a-z0-9-]+)\.html"/g,
  'href="/designs/$1"',
);
fs.writeFileSync(path.join(outputDir, "index.html"), gallery);

console.log(`Generated ${designs.length} responsive desktop design viewers.`);
