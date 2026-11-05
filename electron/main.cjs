const { app, BrowserWindow, ipcMain, Menu, Notification, shell, Tray } = require('electron');
const path = require('node:path');

const APP_ID = 'com.wonnote.desktop';
const ICON_PATH = path.join(__dirname, '..', 'assets', 'app.ico');
let mainWindow;
let tray;
let isQuitting = false;

app.setAppUserModelId(APP_ID);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);
  app.on('before-quit', () => {
    isQuitting = true;
  });

  ipcMain.handle('notification:send', (_event, title, body = '') => {
    if (typeof title !== 'string' || typeof body !== 'string') return;
    const notification = new Notification({
      title: title.slice(0, 500),
      body: body.slice(0, 2000),
      icon: ICON_PATH,
    });
    notification.on('click', showMainWindow);
    notification.show();
  });

  app.whenReady().then(() => {
    createMainWindow();
    createTray();

    app.on('activate', showMainWindow);
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  tray = new Tray(ICON_PATH);
  tray.setToolTip('WON 노트 - 일정 알림 실행 중');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'WON 노트 열기', click: showMainWindow },
    { type: 'separator' },
    { label: '앱 종료 (알림 중지)', click: () => app.quit() },
  ]));
  tray.on('click', showMainWindow);
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
