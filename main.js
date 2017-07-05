const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
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
                dialog.showErrorBox('Download CSV Error', "An error ocurred creating the file " + err.message);
              } 
            });
          }); 
        }
      },
      {type: 'separator'},
      {role: 'reload'},
      {type: 'separator'},
      {role: 'close'}
    ]
  },
  {
    label: 'View',
    submenu: [
      {role: 'togglefullscreen'},
      {role: 'minimize'}
    ]
  },
  {
    role: 'help',
    submenu: [
      {
        label: 'Learn More',
        click(){ 
          let url = 'https://github.com/drbrounsuga/pdfmetadata#readme';
          if( !shell.openExternal(url) ){
            dialog.showErrorBox('Show Help Error', 'Problems were encountered opening: ' + url);
          } 
        }
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
  if(fs.existsSync(filePath)){
    ep.writeMetadata(filePath, data, ['ignoreMinorErrors','preserve','overwrite_original'])
    .then((res) => {
      event.sender.send('exiftool-write-reply', res, indx);
    })
    .catch(console.error);
  }else{
    event.sender.send('exiftool-write-reply', { error: 'File Not Found' }, indx);
  }
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

ipcMain.on('show-file', (event, filePath) => {
  if( !shell.showItemInFolder(filePath) ){
    dialog.showErrorBox('Show File Error', 'Problems were encountered showing file');
  }
});

ipcMain.on('show-error', (event, title, content) => {
  dialog.showErrorBox(title, content);
});

ipcMain.on('get-title', (event) => {
  let res = `${name} -v ${version}`;
  event.sender.send('get-title-reply', res);
});

ipcMain.on('save-backup', (event, data, filePath) => {
  let fields = Object.keys(data[0]);
  let csv = json2csv({ data: data, fields: fields });
  let today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth() <= 8 ? '0' + (today.getMonth() + 1) : today.getMonth() + 1;
  let day = today.getDate() <= 8 ? '0' + today.getDate() : today.getDate();
  let hours = today.getHours() <= 8 ? '0' + today.getHours() : today.getHours();
  let mins = today.getMinutes() <= 8 ? '0' + today.getMinutes() : today.getMinutes();
  let seconds = today.getSeconds() <= 8 ? '0' + today.getSeconds() : today.getSeconds(); 
  let fileName = path.join(filePath, 'reversion-file-' + year + month + day + hours + mins + seconds + '.csv');

  fs.writeFile(fileName, csv, (err) => {
    if(err){
      dialog.showErrorBox('Backup Save Error', "An error ocurred creating the file " + err.message);
      event.sender.send('save-backup-reply', false);
    }else{
      event.sender.send('save-backup-reply', true);
    }
  });

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
