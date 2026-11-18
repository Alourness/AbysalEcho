// electron-main.cjs - Точка входа для сборки игры в автономный AbyssalEcho.exe
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 920,
    height: 740,
    useContentSize: true,
    resizable: false,
    title: "AbyssalEcho - Plasma Combat Arena",
    autoHideMenuBar: true,
    backgroundColor: '#050508',
    icon: path.join(__dirname, 'public', 'favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Загружаем скомпилированную игру из папки dist
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  win.loadFile(indexPath).catch(() => {
    // Если запущено в режиме разработки
    win.loadURL('http://localhost:3000');
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
