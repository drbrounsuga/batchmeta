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
    .then(() => ep.writeMetadata(filePath, data, ['overwrite_original']))
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

function createWindow(){
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 850, 
    minWidth: 850,
    height: 550, 
    minHeight: 550,
    backgroundColor: '#333333',
    autoHideMenuBar: true,
    title: `${name} -v ${version}`
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
