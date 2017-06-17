const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const exiftool = require('node-exiftool');
const version = require('./package.json').version;
const name = require('./package.json').displayName;
const path = require('path');
const url = require('url');

let mainWindow;
let ep = new exiftool.ExiftoolProcess('./src/assets/exiftool');
const mainMenuTemplate = [
  {
    label: 'File',
    submenu:[
      {
        label: 'Import CSV',
        click(){ mainWindow.webContents.send('import-csv') }
      }
    ]
  },
  {
    role: 'window',
    submenu: [
      {role: 'togglefullscreen'},
      {role: 'minimize'},
      {type: 'separator'},
      {role: 'reload'},
      {type: 'separator'},
      {role: 'close'}
    ]
  },
  {
    role: 'help',
    submenu: [
      {
        label: 'Learn More',
        click(){ require('electron').shell.openExternal('https://electron.atom.io') }
      }
    ]
  }
];

if(process.env.NODE_ENV !== 'production'){
  mainMenuTemplate.push({
    label: 'Development',
    submenu: [
      {role: 'toggledevtools'}
    ]
  });
}

//events
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


//app
app.on('ready', () => {
  
  mainWindow = new BrowserWindow({
    width: 850, 
    minWidth: 850,
    height: 550, 
    minHeight: 550,
    backgroundColor: '#333333'
  });

  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }));

  const menu = Menu.buildFromTemplate(mainMenuTemplate);
  Menu.setApplicationMenu(menu);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin'){
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
