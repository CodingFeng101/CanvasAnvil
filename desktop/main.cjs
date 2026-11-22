// CanvasAnvil for Windows: runs the same API server the web deployment uses, on this computer, and
// opens the app in a window. Built by desktop/build.mjs; see deploy/README.zh-CN.md (桌面版).
//
// The server runs as a child process of this executable in Node mode (ELECTRON_RUN_AS_NODE), with the
// app folder as its working directory, because the routes resolve resources/ and skill/ from process.cwd().
// The port is fixed: the page's works and settings live in the browser storage of its origin, so a new
// port every launch would show an empty app.

const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const PORTS = [38001, 38002, 38003, 38004, 38005];
const ROOT = __dirname;
let server = null;
let win = null;
let quitting = false;

const logFile = () => path.join(app.getPath("userData"), "server.log");

function portFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
}

function healthy(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/healthz", timeout: 1000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

async function startServer() {
  let port = null;
  for (const candidate of PORTS) if (await portFree(candidate)) { port = candidate; break; }
  if (!port) throw new Error(`Ports ${PORTS.join(", ")} are all in use.`);

  fs.mkdirSync(path.dirname(logFile()), { recursive: true });
  const log = fs.openSync(logFile(), "w");
  server = spawn(process.execPath, [path.join(ROOT, "server.mjs")], {
    cwd: ROOT,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      LISTEN_HOST: "127.0.0.1",
      WEB_DIST_DIR: path.join(ROOT, "dist"),
      CANVASANVIL_DESKTOP: "1",
    },
    stdio: ["ignore", log, log],
    windowsHide: true,
  });
  server.on("exit", (code) => {
    server = null;
    if (quitting) return;
    dialog.showErrorBox("CanvasAnvil", `The local server stopped (exit ${code}).\n\nLog: ${logFile()}`);
    app.quit();
  });

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (!server) throw new Error(`The local server did not start.\n\nLog: ${logFile()}`);
    if (await healthy(port)) return port;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`The local server did not answer within 30 seconds.\n\nLog: ${logFile()}`);
}

function createWindow(port) {
  const origin = `http://127.0.0.1:${port}`;
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    autoHideMenuBar: true,
    show: false,
    title: "CanvasAnvil",
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.once("ready-to-show", () => win.show());
  // Links to other sites open in the user's browser; the app's own pages stay in the window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(origin)) return { action: "allow" };
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(origin)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) void shell.openExternal(url);
  });
  win.on("closed", () => { win = null; });
  void win.loadURL(origin);
}

function stopServer() {
  quitting = true;
  if (server && !server.killed) server.kill();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.on("before-quit", stopServer);
  app.on("window-all-closed", () => app.quit());
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    try {
      createWindow(await startServer());
    } catch (error) {
      dialog.showErrorBox("CanvasAnvil", String(error && error.message ? error.message : error));
      stopServer();
      app.quit();
    }
  });
}
