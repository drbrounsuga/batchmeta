const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const exiftool = require('node-exiftool');
const version = require('./package.json').version;
const name = require('./package.json').displayName;
const path = require('path');
const url = require('url');
var json2csv = require('json2csv');
const fs = require('fs');

let mainWindow;
let ep = new exiftool.ExiftoolProcess('./src/assets/exiftool');

const csvFields = ['Path', 'Title', 'Description', 'Tags:ROBOTS', 'Tags:publishing_entity', 'Creator', 'Contributor', 'Language', 'Rights', 'Owner', 'ExpirationDate'];

const csvData = [{
  "Path": "path\\from\\this\\file.csv", 
  "Title": "My File", 
  "Description": "This is a description in 160 characters or less", 
  "Tags:ROBOTS": "FOLLOW", 
  "Tags:publishing_entity": "PT", 
  "Creator": "Von Haynes", 
  "Contributor": "ABA IPL", 
  "Language": "en", 
  "Rights": "Copyright \u00A9 2017", 
  "Owner": "American Bar Association", 
  "ExpirationDate": "2017:07:29 03:15"
}];

const csvContent = json2csv({ data: csvData, fields: csvFields });

const mainMenuTemplate = [
  {
    label: 'File',
    submenu: [
      { 
        label: 'Download CSV Template',
        click(){ 
          dialog.showSaveDialog(null, 
            { 
              defaultPath: 'batch-template.csv',
              filters: [
                { name: 'CSV Files', extensions: ['csv'] }
              ] 
            }, (fileName) => {
            if (fileName === undefined){
              return;
            }else if(!fileName.endsWith('.csv')){
              fileName = fileName + '.csv';
            }

            fs.writeFile(fileName, csvContent, (err) => {
              if(err){
                console.log("An error ocurred creating the file " + err.message);
              } 
            });
          }); 
        }
      }
    ]
  },
  {
    label: 'View',
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
        click(){ mainWindow.webContents.send('help-show'); }
      }
    ]
  }
];

if(process.env.NODE_ENV !== 'production'){
  mainMenuTemplate.push({
    label: 'Development',
    submenu: [
      {
        label: 'Read File Test',
        click(){ mainWindow.webContents.send('test-read-file'); }
      },
      {type: 'separator'},
      {role: 'toggledevtools'}
    ]
  });
}

//events
ipcMain.on('exiftool-write', (event, filePath, data, indx) => {
  ep.writeMetadata(filePath, data, ['ignoreMinorErrors','preserve','overwrite_original'])
    .then((res) => {
      event.sender.send('exiftool-write-reply', res, indx);
    })
    .catch(console.error);
});

ipcMain.on('exiftool-read', (event, filePath, indx) => {
  ep.readMetadata(filePath, [])
    .then((res) => {
      event.sender.send('exiftool-read-reply', res, indx);
    })
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
    backgroundColor: '#333333',
    webPreferences: { backgroundThrottling: false }
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

  ep.open();

});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin'){
    ep.close();
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
