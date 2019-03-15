import path from 'path';
import { app, BrowserWindow, ipcMain } from 'electron';
import url from 'url';
import { showOpenDialog } from './dialogs';
import { processFile } from "./utils/processItems";

import * as Sentry from '@sentry/electron';

Sentry.init({dsn: 'https://80ff89d351dc4f15b106bfa127c66da1@sentry.io/1362252'});

let win;

const createWindow = () => {
  // Create the browser window.
  win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false
  });

  // and load the index.html of the app.
  win.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }));

  win.on('ready-to-show', () => {
    win.show();
  });

  // Open the DevTools during development.
  if(process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }

  // Emitted when the window is closed.
  win.on('closed', () => {
    win = null;
  });
};

app.on('ready', () => {
  createWindow();
  ipcMain.on('file-dropped', (event, filePath) => {
    showOpenDialog(win, filePath, processFile);
  })
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (win === null) {
    createWindow();
  }
});
