#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const siteRoot = path.join(root, "dist-site");
const viewports = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1100, height: 800 },
  { width: 768, height: 1024 },
];
const mobileViewports = [
  { width: 393, height: 852, mobile: true },
  { width: 1280, height: 900, mobile: false },
];
const mobileSlugs = ["mvp-signal-inbox", "mvp-session-relay", "mvp-command-lens"];

function findChromium() {
  if (process.env.CHROMUX_CHROME && fs.existsSync(process.env.CHROMUX_CHROME)) {
    return process.env.CHROMUX_CHROME;
  }

  const installedBrowsers = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  const installedBrowser = installedBrowsers.find((candidate) => fs.existsSync(candidate));
  if (installedBrowser) return installedBrowser;

  const cache = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  if (!fs.existsSync(cache)) return null;
  const releases = fs.readdirSync(cache)
    .filter((name) => name.startsWith("chromium_headless_shell-"))
    .sort().reverse();

  for (const release of releases) {
    const directory = path.join(cache, release);
    for (const platform of fs.readdirSync(directory)) {
      const candidate = path.join(directory, platform, "chrome-headless-shell");
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function serveStatic() {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      let candidate = path.join(siteRoot, pathname === "/" ? "index.html" : pathname);
      if (!path.extname(candidate) && fs.existsSync(`${candidate}.html`)) candidate += ".html";
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) candidate = path.join(candidate, "index.html");
      if (!candidate.startsWith(siteRoot + path.sep) || !fs.existsSync(candidate)) {
        response.writeHead(404).end("Not found");
        return;
      }
      const extension = path.extname(candidate);
      const type = extension === ".html" ? "text/html; charset=utf-8" : "application/octet-stream";
      response.writeHead(200, { "Content-Type": type });
      fs.createReadStream(candidate).pipe(response);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

class CdpSession {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      const listeners = this.listeners.get(message.method) || [];
      this.listeners.delete(message.method);
      for (const listener of listeners) listener(message.params);
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method) {
    return new Promise((resolve) => {
      const listeners = this.listeners.get(method) || [];
      listeners.push(resolve);
      this.listeners.set(method, listeners);
    });
  }
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return new CdpSession(socket);
}

function launchChromium(executable) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chromux-viewer-chrome-"));
  const child = spawn(executable, [
    "--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=0", `--user-data-dir=${userDataDir}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });

  return new Promise((resolve, reject) => {
    let stderr = "";
    const timeout = setTimeout(() => reject(new Error(`Chromium did not expose DevTools. ${stderr}`)), 10000);
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve({ child, userDataDir, browserWs: match[1] });
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code && !stderr.includes("DevTools listening")) reject(new Error(`Chromium exited ${code}: ${stderr}`));
    });
  });
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitForViewer(cdp) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ready = await evaluate(cdp, `(() => {
      const frame = document.getElementById('design-canvas');
      return Boolean(frame && frame.contentDocument && frame.contentDocument.readyState === 'complete');
    })()`);
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for the design iframe.");
}

async function navigate(cdp, url) {
  const loaded = cdp.once("Page.loadEventFired");
  await cdp.send("Page.navigate", { url });
  await loaded;
  await waitForViewer(cdp);
}

async function navigateDocument(cdp, url) {
  const loaded = cdp.once("Page.loadEventFired");
  await cdp.send("Page.navigate", { url });
  await loaded;
}

async function verifyViewport(cdp, filename, viewport) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const expected = Math.min(1, viewport.width / 1440, viewport.height / 900);
  let state;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    state = await evaluate(cdp, `(() => {
      const frame = document.getElementById('design-canvas');
      const rect = frame.getBoundingClientRect();
      return {
        scale: Number(frame.dataset.scale),
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        viewport: { width: innerWidth, height: innerHeight },
        scroll: {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        },
      };
    })()`);
    if (state.viewport.width === viewport.width && state.viewport.height === viewport.height &&
        Math.abs(state.scale - expected) < 1e-9) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  assert.ok(Math.abs(state.scale - expected) < 1e-9, `${filename} should scale to ${expected}`);
  assert.ok(state.rect.left >= -0.01 && state.rect.top >= -0.01, `${filename} should start inside viewport`);
  assert.ok(state.rect.right <= state.viewport.width + 0.01, `${filename} should fit viewport width`);
  assert.ok(state.rect.bottom <= state.viewport.height + 0.01, `${filename} should fit viewport height`);
  assert.ok(state.scroll.width <= state.viewport.width, `${filename} host should not overflow horizontally`);
  assert.ok(state.scroll.height <= state.viewport.height, `${filename} host should not overflow vertically`);
}

async function verifyModal(cdp) {
  const opened = await evaluate(cdp, `(() => {
    const doc = document.getElementById('design-canvas').contentDocument;
    doc.getElementById('btn-capture').click();
    const note = doc.querySelector('textarea');
    note.focus();
    return { visible: !doc.getElementById('overlay').classList.contains('hidden'), focused: doc.activeElement === note };
  })()`);
  assert.deepEqual(opened, { visible: true, focused: true }, "Capture modal should open and accept focus");

  assert.equal(await evaluate(cdp, `(() => {
    const doc = document.getElementById('design-canvas').contentDocument;
    doc.getElementById('modal-close').click();
    return doc.getElementById('overlay').classList.contains('hidden');
  })()`), true, "Capture modal close control should close the modal");

  assert.equal(await evaluate(cdp, `(() => {
    const doc = document.getElementById('design-canvas').contentDocument;
    doc.getElementById('btn-capture').click();
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return doc.getElementById('overlay').classList.contains('hidden');
  })()`), true, "Escape should close the Capture modal inside the iframe");
}

async function verifyMobileFlow(cdp, origin, slug, viewport) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  });
  await navigateDocument(cdp, `${origin}/mobile/${slug}`);

  const initial = await evaluate(cdp, `(() => {
    const command = document.querySelector('[data-command]');
    const send = document.querySelector('[data-send]');
    const back = document.querySelector('.lab-link').getBoundingClientRect();
    const first = document.querySelector('[data-open="session"]');
    first.focus();
    const focus = getComputedStyle(first);
    return {
      overflow: document.documentElement.scrollWidth <= innerWidth,
      inputDisabled: command.disabled,
      sendDisabled: send.disabled,
      homeActive: document.getElementById('home').classList.contains('active'),
      backInsideViewport: back.left >= 0 && back.top >= 0 && back.right <= innerWidth && back.bottom <= innerHeight,
      focused: document.activeElement === first,
      visibleFocus: focus.outlineStyle !== 'none' && focus.outlineWidth !== '0px',
    };
  })()`);
  assert.deepEqual(initial, {
    overflow: true, inputDisabled: true, sendDisabled: true, homeActive: true,
    backInsideViewport: true, focused: true, visibleFocus: true,
  }, `${slug} should fit ${viewport.width}px, expose focus, and fail closed`);

  assert.equal(await evaluate(cdp, `(() => {
    document.querySelector('[data-open="session"]').click();
    return location.hash === '#session' && document.getElementById('session').classList.contains('active');
  })()`), true, `${slug} attention item should deep-link to its session`);
  await evaluate(cdp, "document.querySelector('[data-attach]').click()");
  assert.deepEqual(await evaluate(cdp, `(() => ({
    terminal: document.getElementById('terminal').classList.contains('active'),
    hash: location.hash,
    inputDisabled: document.querySelector('[data-command]').disabled,
    replayed: /replay|retained/i.test(document.getElementById('terminal').textContent),
  }))()`), { terminal: true, hash: "#terminal", inputDisabled: true, replayed: true }, `${slug} should attach read-only with replay`);

  await evaluate(cdp, "document.querySelector('[data-request]').click()");
  assert.equal(await evaluate(cdp, "document.querySelector('dialog').open"), true, `${slug} should confirm control in a modal`);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  assert.equal(await evaluate(cdp, "document.querySelector('dialog').open"), false, `${slug} modal should dismiss with Escape`);
  assert.equal(await evaluate(cdp, "document.querySelector('[data-command]').disabled"), true, `${slug} dismissal should not grant control`);

  await evaluate(cdp, "document.querySelector('[data-request]').click(); document.querySelector('[data-confirm]').click()");
  assert.deepEqual(await evaluate(cdp, `(() => ({
    inputDisabled: document.querySelector('[data-command]').disabled,
    sendDisabled: document.querySelector('[data-send]').disabled,
    releaseDisabled: document.querySelector('[data-release]').disabled,
  }))()`), { inputDisabled: false, sendDisabled: false, releaseDisabled: false }, `${slug} should enable input only after confirmed lease`);
  await evaluate(cdp, "document.querySelector('[data-send]').click()");
  assert.match(await evaluate(cdp, "document.querySelector('[data-output]').textContent"), /MOBILE_OK/, `${slug} should append bounded command output`);
  await evaluate(cdp, "document.querySelector('[data-release]').click()");
  assert.deepEqual(await evaluate(cdp, `(() => ({
    inputDisabled: document.querySelector('[data-command]').disabled,
    sendDisabled: document.querySelector('[data-send]').disabled,
  }))()`), { inputDisabled: true, sendDisabled: true }, `${slug} should fail closed after release`);

  await evaluate(cdp, "location.hash = '#offline'");
  assert.deepEqual(await evaluate(cdp, `(() => ({
    offline: document.getElementById('offline').classList.contains('active'),
    noInput: !document.querySelector('#offline [data-command]'),
  }))()`), { offline: true, noInput: true }, `${slug} should restore offline recovery from its hash without input`);
  await evaluate(cdp, "location.hash = '#reconnect'");
  await evaluate(cdp, "document.querySelector('[data-resume]').click()");
  assert.match(await evaluate(cdp, "document.querySelector('[data-output]').textContent"), /41/, `${slug} should resume replay after the displayed cursor`);
}

async function main() {
  execFileSync(path.join(root, "scripts", "build-website.sh"), { stdio: "inherit" });
  const chromium = findChromium();
  if (!chromium) throw new Error("Chromium headless shell not found. Set CHROMUX_CHROME to its executable path.");

  const server = await serveStatic();
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const launched = await launchChromium(chromium);
  let browserCdp;
  let pageCdp;

  try {
    browserCdp = await connect(launched.browserWs);
    const target = await browserCdp.send("Target.createTarget", { url: "about:blank" });
    const targets = await browserCdp.send("Target.getTargets");
    const page = targets.targetInfos.find((item) => item.targetId === target.targetId);
    pageCdp = await connect(page.webSocketDebuggerUrl || launched.browserWs.replace(/\/devtools\/browser\/.+$/, `/devtools/page/${target.targetId}`));
    await pageCdp.send("Page.enable");
    await pageCdp.send("Runtime.enable");

    const designs = fs.readdirSync(path.join(siteRoot, "designs", "raw"))
      .filter((name) => /^\d{2}-[a-z0-9-]+\.html$/.test(name)).sort();
    const mobileOnly = process.argv.includes("--mobile-only");

    if (!mobileOnly) {
      for (const filename of designs) {
        const slug = filename.replace(/\.html$/, "");
        await navigate(pageCdp, `${origin}/designs/${slug}`);
        for (const viewport of viewports) await verifyViewport(pageCdp, filename, viewport);
      }

      await navigate(pageCdp, `${origin}/designs/14-streak`);
      await verifyViewport(pageCdp, "14-streak.html", viewports[2]);
      await verifyModal(pageCdp);

      await navigate(pageCdp, `${origin}/designs/viewer?design=33-japanese-station.html`);
      assert.equal(
        await evaluate(pageCdp, "document.getElementById('design-canvas').getAttribute('src')"),
        "raw/33-japanese-station.html",
        "generic viewer should resolve an allowlisted filename",
      );
      await navigateDocument(pageCdp, `${origin}/designs/viewer?design=https://example.com/not-allowed`);
      assert.deepEqual(await evaluate(pageCdp, `(() => ({
        errorVisible: !document.getElementById('viewer-error').hidden,
        iframeCount: document.querySelectorAll('iframe').length,
      }))()`), { errorVisible: true, iframeCount: 0 }, "invalid viewer input should show an error without creating an iframe");
    }

    for (const viewport of mobileViewports) {
      await pageCdp.send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile,
      });
      await navigateDocument(pageCdp, `${origin}/mobile/?viewport=${viewport.width}`);
      assert.deepEqual(await evaluate(pageCdp, `(() => ({
        cards: document.querySelectorAll('a.card').length,
        overflow: document.documentElement.scrollWidth <= innerWidth,
        archive: document.querySelector('a.archive').getAttribute('href'),
      }))()`), { cards: 3, overflow: true, archive: "/mobile/archive/" }, `mobile lab should fit ${viewport.width}px and expose three directions`);
    }

    for (const slug of mobileSlugs) {
      for (const viewport of mobileViewports) await verifyMobileFlow(pageCdp, origin, slug, viewport);
    }

    if (process.argv.includes("--screenshots")) {
      const outputDir = path.join(os.tmpdir(), "chromux-viewer-visuals");
      fs.mkdirSync(outputDir, { recursive: true });
      for (const slug of ["14-streak", "33-japanese-station"]) {
        await navigate(pageCdp, `${origin}/designs/${slug}`);
        await new Promise((resolve) => setTimeout(resolve, 750));
        for (const viewport of viewports.slice(0, 3)) {
          await verifyViewport(pageCdp, `${slug}.html`, viewport);
          const image = await pageCdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
          fs.writeFileSync(path.join(outputDir, `${slug}-${viewport.width}x${viewport.height}.png`), image.data, "base64");
        }
      }
      for (const slug of mobileSlugs) {
        for (const state of ["home", "session", "terminal", "offline"]) {
          await pageCdp.send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 1, mobile: true });
          await navigateDocument(pageCdp, `${origin}/mobile/${slug}?capture=${state}#${state}`);
          const image = await pageCdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
          fs.writeFileSync(path.join(outputDir, `${slug}-${state}-393x852.png`), image.data, "base64");
        }
      }
      for (const viewport of mobileViewports) {
        await pageCdp.send("Emulation.setDeviceMetricsOverride", {
          width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile,
        });
        await navigateDocument(pageCdp, `${origin}/mobile/?capture=${viewport.width}`);
        const image = await pageCdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
        fs.writeFileSync(path.join(outputDir, `mobile-lab-${viewport.width}x${viewport.height}.png`), image.data, "base64");
      }
      console.log(`Captured representative visual checks in ${outputDir}`);
    }

    console.log(`Verified all 36 desktop viewers and 3 interactive mobile MVP variants at phone and desktop sizes.`);
  } finally {
    if (browserCdp) await browserCdp.send("Browser.close").catch(() => {});
    server.close();
    if (launched.child.exitCode === null) {
      launched.child.kill();
      await Promise.race([
        new Promise((resolve) => launched.child.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    }
    fs.rmSync(launched.userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
