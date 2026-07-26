#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const pngToIco = require('png-to-ico');

async function main() {
  const build = path.resolve(__dirname, '..', 'build');
  const svg = fs.readFileSync(path.join(build, 'icon.svg'));
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = sizes.map((size) => new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
  }).render().asPng());
  const ico = await pngToIco(images);
  fs.writeFileSync(path.join(build, 'icon.ico'), ico);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
