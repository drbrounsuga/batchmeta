const { app, BrowserWindow, ipcMain } = require('electron');
const exiftool = require('node-exiftool');
const path = require('path');
const url = require('url');

let mainWindow;
let ep;

ipcMain.on('exiftool-request', (event, arg) => {
  ep = new exiftool.ExiftoolProcess('./src/assets/exiftool');
  event.returnValue = ep;
});

function createWindow(){
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 850, 
    minWidth: 850,
    height: 450, 
    minHeight: 450,
    backgroundColor: '#333333',
    autoHideMenuBar: true
  });

  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }));

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', function () {
    mainWindow = null
    //ep.quit();
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', function(){
  if (process.platform !== 'darwin'){
    app.quit();
    //ep.quit();
  }
});

app.on('activate', function (){
  if (mainWindow === null) {
    createWindow();
  }
});
