const fs = require("node:fs");

const scenarioPath = process.env.CHROMUX_NEXT_FIXTURE_SCENARIO;
const scenario = scenarioPath ? JSON.parse(fs.readFileSync(scenarioPath, "utf8")) : {};
const log = (entry) => {
  if (scenario.logPath) fs.appendFileSync(scenario.logPath, `${JSON.stringify({ at: Date.now(), pid: process.pid, ...entry })}\n`);
};
const write = (value, key = "") => {
  let line = typeof value === "string" ? value : JSON.stringify(value);
  if (scenario.malformedOn === key) line = "{malformed";
  if (scenario.oversizeOn === key) line = JSON.stringify({ padding: "x".repeat(scenario.oversizeBytes || 2 * 1024 * 1024) });
  line += "\n";
  const fragments = scenario.fragments || [line.length];
  let offset = 0;
  let index = 0;
  while (offset < line.length) {
    const size = Math.max(1, Number(fragments[index++ % fragments.length] || line.length));
    process.stdout.write(line.slice(offset, offset + size));
    offset += size;
  }
};

process.on("SIGTERM", () => {
  log({ event: "signal", signal: "SIGTERM" });
  if (!scenario.ignoreTerm) process.exit(0);
});
process.on("exit", (code) => log({ event: "exit", code }));

if (process.argv.includes("--version")) {
  if (scenario.hangVersion) {
    setInterval(() => undefined, 10_000);
    return;
  }
  process.stdout.write(`codex-cli ${scenario.version || "0.146.0"}\n`);
  process.exit(0);
}

if (process.argv.includes("app-server")) {
  let startIndex = 1;
  if (scenario.logPath && fs.existsSync(scenario.logPath)) {
    startIndex += fs.readFileSync(scenario.logPath, "utf8").split("\n")
      .filter((line) => line.includes('"event":"start"') && line.includes('"mode":"app-server"')).length;
  }
  log({ event: "start", mode: "app-server", startIndex });
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    while (buffer.includes("\n")) {
      const newline = buffer.indexOf("\n");
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      log({ event: "request", message });
      if (message.id === undefined) continue;
      const crashMethod = scenario.crashOnByStart?.[String(startIndex)] || scenario.crashOn;
      if (crashMethod === message.method) return process.exit(scenario.crashCode || 17);
      if (scenario.noResponseOn === message.method) continue;
      const act = () => {
        if (scenario.partialOversizeOn === message.method) {
          process.stdout.write("x".repeat(scenario.oversizeBytes || 2 * 1024 * 1024));
          return;
        }
        if (scenario.schemaInvalidOn === message.method) {
          write({ unexpected: true }, message.method);
          return;
        }
        if (scenario.errorOn === message.method) {
          write({ id: message.id, error: { code: -1, message: scenario.errorMessage || "authentication failed sk-supersecret123456" } }, message.method);
          return;
        }
        if (message.method === "initialize") {
          write({ id: scenario.wrongIdOn === "initialize" ? 999999 : message.id, result: scenario.initializeResult ?? { userAgent: "fixture/0.146.0" } }, "initialize");
        } else if (message.method === "model/list") {
          write({ id: message.id, result: { data: scenario.models || [{ id: "fixture-model", isDefault: true }] } }, "model/list");
        } else if (message.method === "thread/start") {
          scenario.threadCounter = (scenario.threadCounter || 0) + 1;
          write({ id: message.id, result: { thread: { id: `fixture-thread-${scenario.threadCounter}` } } }, "thread/start");
        } else if (message.method === "thread/fork") {
          if ((scenario.failForkThreadIds || []).includes(message.params?.threadId)) {
            write({ id: message.id, error: { message: "fork rejected" } }, "thread/fork");
          } else {
            scenario.threadCounter = (scenario.threadCounter || 0) + 1;
            const turns = scenario.forkHistoryBytes && !message.params?.excludeTurns
              ? [{ items: [{ type: "agentMessage", text: "x".repeat(scenario.forkHistoryBytes) }] }]
              : [];
            write({ id: message.id, result: { thread: { id: `fixture-fork-${scenario.threadCounter}`, turns } } }, "thread/fork");
          }
        } else if (message.method === "thread/resume") {
          if ((scenario.failResumeThreadIds || []).includes(message.params?.threadId)) {
            write({ id: message.id, error: { message: "resume rejected" } }, "thread/resume");
          } else {
            const turns = scenario.resumeHistoryBytes && !message.params?.excludeTurns
              ? [{ items: [{ type: "agentMessage", text: "x".repeat(scenario.resumeHistoryBytes) }] }]
              : [];
            write({ id: message.id, result: { thread: { id: message.params?.threadId, turns } } }, "thread/resume");
          }
        } else if (message.method === "thread/turns/list") {
          const pages = scenario.turnPages || {};
          const key = message.params?.cursor || "first";
          write({ id: message.id, result: pages[key] || { data: [], nextCursor: null } }, "thread/turns/list");
        } else if (message.method === "turn/start") {
          write({ id: message.id, result: { turn: { id: "fixture-turn" } } }, "turn/start");
        } else {
          write({ id: message.id, result: {} }, message.method || "response");
        }
        if (scenario.notificationAfter === message.method) {
          write({ method: "item/agentMessage/delta", params: { threadId: scenario.notificationThreadId, delta: "fragmented" } }, "notification");
        }
        if (scenario.requestAfter === message.method) {
          write({
            id: "server-request",
            method: scenario.requestMethod || "item/commandExecution/requestApproval",
            params: { threadId: scenario.requestThreadId, command: "npm test" }
          }, "server-request");
        }
      };
      setTimeout(act, Number(scenario.delays?.[message.method] || 0));
    }
  });
  process.stdin.resume();
} else if (process.argv.includes("exec")) {
  log({ event: "start", mode: "exec" });
  let prompt = "";
  process.stdin.resume();
  process.stdin.on("data", (chunk) => prompt += chunk);
  process.stdin.on("end", () => {
    log({ event: "prompt", args: process.argv.slice(2), prompt });
    if (scenario.lunaDelayMs) {
      setTimeout(runLuna, scenario.lunaDelayMs);
    } else runLuna();
  });
  function runLuna() {
    if (scenario.lunaMalformed) return write("{bad", "luna");
    if (scenario.lunaOversize) return write(JSON.stringify({ padding: "x".repeat(scenario.oversizeBytes || 2 * 1024 * 1024) }), "luna");
    if (scenario.lunaExitCode) {
      process.stderr.write(scenario.lunaStderr || "authentication failed sk-supersecret123456");
      process.exit(scenario.lunaExitCode);
    }
    const analysis = scenario.lunaResult || {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      recommendations: []
    };
    write({ type: "turn.completed", result: analysis, ...(scenario.lunaUsage ? { usage: scenario.lunaUsage } : {}) }, "luna");
  }
} else {
  process.stderr.write("Unknown fixture mode");
  process.exit(2);
}
