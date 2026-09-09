const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

function backendPaths() {
  return {
    server: path.join(__dirname, "..", "dist", "server.cjs"),
    dist: path.join(__dirname, "..", "dist"),
  };
}

function settingsFile() {
  return path.join(app.getPath("userData"), "crate-config", "settings.json");
}

function defaultSettings() {
  return {
    port: 3001,
    APP_SECRET: "",
    SQL_HOST: "localhost",
    SQL_PORT: "5432",
    SQL_USER: "postgres",
    SQL_PASSWORD: "",
    SQL_DB_NAME: "crate_db",
    FIREBASE_PROJECT_ID: "",
    FIREBASE_CLIENT_EMAIL: "",
    FIREBASE_PRIVATE_KEY: "",
    SPOTIFY_CLIENT_ID: "",
    SPOTIFY_CLIENT_SECRET: "",
  };
}

function loadSettings() {
  try {
    const file = settingsFile();
    if (fs.existsSync(file)) {
      return Object.assign(defaultSettings(), JSON.parse(fs.readFileSync(file, "utf8")));
    }
  } catch (err) {
    console.error("[desktop] settings read failed: " + err);
  }
  return defaultSettings();
}

function saveSettings(settings) {
  const file = settingsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(settings, null, 2), "utf8");
  return settings;
}

function settingsComplete(s) {
  const required = ["APP_SECRET", "SQL_PASSWORD", "FIREBASE_PROJECT_ID", "SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"];
  return required.every((k) => s[k] && String(s[k]).trim().length > 0);
}

function applyEnv(s) {
  process.env.NODE_ENV = "production";
  process.env.PORT = String(s.port);
  process.env.APP_URL = "http://127.0.0.1:" + s.port;
  process.env.APP_SECRET = String(s.APP_SECRET || "");
  process.env.SQL_HOST = String(s.SQL_HOST || "localhost");
  process.env.SQL_PORT = String(s.SQL_PORT || "5432");
  process.env.SQL_USER = String(s.SQL_USER || "postgres");
  process.env.SQL_PASSWORD = String(s.SQL_PASSWORD || "");
  process.env.SQL_DB_NAME = String(s.SQL_DB_NAME || "crate_db");
  process.env.FIREBASE_PROJECT_ID = String(s.FIREBASE_PROJECT_ID || "");
  process.env.FIREBASE_CLIENT_EMAIL = String(s.FIREBASE_CLIENT_EMAIL || "");
  process.env.FIREBASE_PRIVATE_KEY = String(s.FIREBASE_PRIVATE_KEY || "");
  process.env.SPOTIFY_CLIENT_ID = String(s.SPOTIFY_CLIENT_ID || "");
  process.env.SPOTIFY_CLIENT_SECRET = String(s.SPOTIFY_CLIENT_SECRET || "");
  process.env.ALLOWED_ORIGINS = "http://127.0.0.1:" + s.port;
}

function settingsHtml() {
  const file = path.join(__dirname, "settings.html");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "<h1>settings.html missing</h1>";
}

function htmlDataUrl(html) {
  return "data:text/html;charset=utf-8," + encodeURIComponent(html);
}

let mainWindow = null;

function openWindow(url, options) {
  const opts = options || {};
  mainWindow = new BrowserWindow(Object.assign({
    width: 1280,
    height: 840,
    title: "Crate",
    backgroundColor: "#1a1514",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      // Only the trusted, local first-run settings screen may call the IPC
      // bridge; it is opened with nodeIntegration enabled below. The app
      // window (game/app content) stays with nodeIntegration off.
      nodeIntegration: !!opts.settingsScreen,
    },
  }, opts));
  mainWindow.loadURL(url);
}

function showSettingsScreen() {
  openWindow(htmlDataUrl(settingsHtml()), { width: 720, height: 920, settingsScreen: true });
}

async function startApp() {
  const s = loadSettings();
  if (!settingsComplete(s)) {
    showSettingsScreen();
    return;
  }
  const paths = backendPaths();
  if (!fs.existsSync(paths.server)) {
    showSettingsScreen();
    return;
  }
  applyEnv(s);
  try {
    require(paths.server);
  } catch (err) {
    console.error("[desktop] backend failed to start: " + err);
    const msg = String(err).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    openWindow(htmlDataUrl("<h1>Crate backend failed to start</h1><pre>" + msg + "</pre>"));
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 1200));
  openWindow("http://127.0.0.1:" + s.port);
}

ipcMain.handle("settings:get", () => {
  const s = loadSettings();
  return { complete: settingsComplete(s), settings: s, defaultPort: s.port };
});
ipcMain.handle("settings:save", (_e, settings) => {
  const s = saveSettings(Object.assign(defaultSettings(), settings || {}));
  return { complete: settingsComplete(s) };
});
ipcMain.handle("settings:relaunch", async () => {
  try { if (mainWindow) mainWindow.destroy(); } catch (_) {}
  await startApp();
});

app.whenReady().then(async () => {
  await startApp();
});
app.on("window-all-closed", () => app.quit());

