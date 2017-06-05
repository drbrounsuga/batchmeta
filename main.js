const { app, BrowserWindow, ipcMain } = require('electron');
const exiftool = require('node-exiftool');
const version = require('./package.json').version;
const name = require('./package.json').displayName;
const path = require('path');
const url = require('url');

console.log(version);

let mainWindow;
let ep = new exiftool.ExiftoolProcess('./src/assets/exiftool');

//verify request below. Cant pass main to renderer
ipcMain.on('exiftool-write', (event, filePath, data, indx) => {
  ep.open()
    .then(() => ep.writeMetadata(filePath, data, ['ignoreMinorErrors','preserve','overwrite_original']))
    .then((res) => {
      event.sender.send('exiftool-write-reply', res, indx);
    })
    .then(() => ep.close())
    .catch(console.error);
});

ipcMain.on('exiftool-read', (event, filePath) => {
  ep.open()
    .then(() => ep.readMetadata(filePath, []))
    .then((res) => {
      event.sender.send('exiftool-read-reply', res);
    })
    .then(() => ep.close())
    .catch(console.error);
});

ipcMain.on('reload', (event) => {
  mainWindow.webContents.reloadIgnoringCache();
  event.sender.send('reload-reply');
});

ipcMain.on('get-title', (event) => {
  let res = `${name} -v ${version}`;
  event.sender.send('get-title-reply', res);
});

function createWindow(){
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 850, 
    minWidth: 850,
    height: 550, 
    minHeight: 550,
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

  mainWindow.on('closed', function(){
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', function(){
  if (process.platform !== 'darwin'){
    app.quit();
  }
});

app.on('activate', function(){
  if (mainWindow === null) {
    createWindow();
  }
});
