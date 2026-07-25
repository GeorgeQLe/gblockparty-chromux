'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-browser-isolation-'));
const home = path.join(temp, 'home');
const userData = path.join(temp, 'user-data');
const partitions = path.join(userData, 'Partitions');
const e2ePath = path.join(temp, 'e2e.js');
const outputPath = path.join(temp, 'result.json');
const packagedExecutable = process.env.CHROMUX_PACKAGED_EXECUTABLE || '';
fs.mkdirSync(home, { recursive: true });
fs.mkdirSync(path.join(partitions, 'chromux', 'Cache'), { recursive: true });
fs.writeFileSync(path.join(partitions, 'chromux', 'Cache', 'stale-entry'), 'stale');
fs.mkdirSync(path.join(partitions, 'unrelated-profile'), { recursive: true });
fs.mkdirSync(path.join(home, '.chromux'), { recursive: true });
fs.writeFileSync(path.join(home, '.chromux', 'signal-0123456789abcdef01234567.json'), '{}');

const server = http.createServer((request, response) => {
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(`<!doctype html><html><head><title>${request.url}</title></head><body><input id="field"><div id="route">${request.url}</div></body></html>`);
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  fs.writeFileSync(e2ePath, `
(async () => {
  const b = window.chromuxTestBrowser;
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (fn, message) => {
    const started = Date.now();
    while (Date.now() - started < 8000) {
      try { const value = await fn(); if (value) return value; } catch {}
      await wait(50);
    }
    throw new Error(message);
  };
  const first = b.addSession({ name: 'parallel-browser-a' });
  const second = b.addSession({ name: 'parallel-browser-b' });
  b.open(first, ${JSON.stringify(origin + '/one')});
  b.open(second, ${JSON.stringify(origin + '/two')});
  const one = await waitFor(() => b.webview(first), 'first target missing');
  const two = await waitFor(() => b.webview(second), 'second target missing');
  await waitFor(async () => (await one.executeJavaScript('document.readyState')) === 'complete', 'first target not ready');
  await waitFor(async () => (await two.executeJavaScript('document.readyState')) === 'complete', 'second target not ready');
  await one.executeJavaScript("document.cookie='chromuxTarget=one'; localStorage.setItem('target','one'); document.querySelector('#field').value='alpha'");
  await two.executeJavaScript("document.cookie='chromuxTarget=two'; localStorage.setItem('target','two'); document.querySelector('#field').value='bravo'");
  const oneState = await one.executeJavaScript("({cookie:document.cookie,storage:localStorage.getItem('target'),input:document.querySelector('#field').value,path:location.pathname})");
  const twoState = await two.executeJavaScript("({cookie:document.cookie,storage:localStorage.getItem('target'),input:document.querySelector('#field').value,path:location.pathname})");
  expect(oneState.cookie.includes('chromuxTarget=one') && !oneState.cookie.includes('chromuxTarget=two'), 'first cookies crossed');
  expect(twoState.cookie.includes('chromuxTarget=two') && !twoState.cookie.includes('chromuxTarget=one'), 'second cookies crossed');
  expect(oneState.storage === 'one' && twoState.storage === 'two', 'local storage crossed');
  expect(oneState.input === 'alpha' && twoState.input === 'bravo', 'typed state crossed');
  const screenshots = [];
  if (${JSON.stringify(!packagedExecutable)}) {
    b.focus(first);
    await wait(80);
    const shotOne = await one.capturePage();
    b.focus(second);
    await wait(80);
    const shotTwo = await two.capturePage();
    screenshots.push(shotOne.toPNG().length, shotTwo.toPNG().length);
    expect(screenshots.every((bytes) => bytes > 100), 'screenshots missing');
  }
  await one.loadURL(${JSON.stringify(origin + '/one-next')});
  await waitFor(async () => (await one.executeJavaScript('location.pathname')) === '/one-next', 'first navigation failed');
  expect(await two.executeJavaScript('location.pathname') === '/two', 'tab selection/navigation crossed');
  return JSON.stringify({ ok: true, oneState, twoState, screenshots });
})()
`);

  const electron = path.join(appDir, 'node_modules', '.bin', 'electron');
  const executable = packagedExecutable || process.execPath;
  const args = packagedExecutable
    ? ['--smoke', `--user-data-dir=${userData}`]
    : [electron, '.', '--smoke', `--user-data-dir=${userData}`];
  const child = spawn(executable, args, {
    cwd: appDir,
    env: {
      ...process.env,
      HOME: home,
      PATH: '/usr/bin:/bin',
      CHROMUX_E2E: e2ePath,
      CHROMUX_E2E_OUT: outputPath,
      CHROMUX_KEEP_USER_DATA: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const timeout = setTimeout(() => child.kill('SIGTERM'), 30000);
  child.on('close', (code, signal) => {
    clearTimeout(timeout);
    server.close();
    const output = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
    const stalePartitionRemoved = !fs.existsSync(path.join(partitions, 'chromux'));
    const staleSignalRemoved = !fs.existsSync(path.join(home, '.chromux', 'signal-0123456789abcdef01234567.json'));
    const unrelatedPartitionRetained = fs.existsSync(path.join(partitions, 'unrelated-profile'));
    const newPartitions = fs.existsSync(partitions)
      ? fs.readdirSync(partitions).filter((name) => (
        /^chromux-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(name)
      ))
      : [];
    fs.rmSync(temp, { recursive: true, force: true });
    if (code !== 0 || signal || !output.includes('"ok":true')
      || !stalePartitionRemoved || !staleSignalRemoved || !unrelatedPartitionRetained
      || new Set(newPartitions).size < 2) {
      console.error('BROWSER_ISOLATION_SMOKE_FAIL', {
        code,
        signal,
        output,
        stalePartitionRemoved,
        staleSignalRemoved,
        unrelatedPartitionRetained,
        newPartitions,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
      process.exitCode = 1;
      return;
    }
    console.log('BROWSER_ISOLATION_SMOKE_OK');
  });
});
