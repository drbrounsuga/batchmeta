const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const exiftool = require('node-exiftool');
const version = require('./package.json').version;
const path = require('path');
const url = require('url');
var json2csv = require('json2csv');
const fs = require('fs');

let mainWindow;
const ep = new exiftool.ExiftoolProcess(path.join(__dirname, 'src', 'assets', 'exiftool'));
const isDevelopment = process.env.NODE_ENV && process.env.NODE_ENV.trim() !== 'production';

// headers for csv templates
const csvErrorFields = ['Error'];
const csvFields = ['Path', 'Title', 'Description', 'Tags:ROBOTS', 'Tags:publishing_entity', 'Tags::1', 'Tags::2', 'Creator', 'Contributor', 'Language', 'Rights', 'Owner', 'ExpirationDate'];

// default content for csv templates
let csvErrorData;
const csvData = [{
  "Path": "path\\from\\this\\file.csv", 
  "Title": "My File", 
  "Description": "This is a description in 160 characters or less", 
  "Tags:ROBOTS": "FOLLOW", 
  "Tags:publishing_entity": "PT", 
  "Tags::1": "membership:PT", 
  "Tags::2": "ROBOTS:INDEX", 
  "Creator": "Von Haynes", 
  "Contributor": "ABA IPL", 
  "Language": "en", 
  "Rights": "Copyright \u00A9 2017", 
  "Owner": "American Bar Association", 
  "ExpirationDate": "2017:07:29 03:15"
}];

// create csv data
let csvErrorContent;
const csvContent = json2csv({ data: csvData, fields: csvFields });

// application menu template
const mainMenuTemplate = [
  {
    label: 'File',
    submenu: [
      {
        label: 'CSV Template',
        submenu: [
          { 
            label: 'Download Default',
            click(){ 
              dialog.showSaveDialog(null, 
                { 
                  defaultPath: 'batch-template.csv',
                  filters: [
                    { name: 'CSV Files', extensions: ['csv'] }
                  ] 
                }, (fileName) => {
                if(fileName === undefined){
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
          {
            label: 'Generate from Folder',
            click(){
              dialog.showOpenDialog(null,{
                title: 'Generate template from directory',
                properties: ['openDirectory']
              }, (filePath) => {
                if(filePath === undefined){
                  return;
                }

                console.log('use fs to walk directory ' + filePath);
              });
            }
          }
        ]
      },
      {type: 'separator'},
      {
        label: 'Reset',
        accelerator: 'CommandOrControl+Z',
        click(){
          ep.close();
          app.relaunch({args: process.argv.slice(1)});
          app.exit(0);
        }
      },
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

// Add development menu if testing
if(isDevelopment){
  mainMenuTemplate.push({
    label: 'Development',
    submenu: [
      {
        label: 'Read File Test',
        click(){ mainWindow.webContents.send('test-read-file'); }
      },
      {type: 'separator'},
      {role: 'toggledevtools'},
      {type: 'separator'},
      {role: 'reload'}
    ]
  });
}

// Create error Menu
const errorMenuTemplate = [...mainMenuTemplate];

errorMenuTemplate.push({
  label: 'Show Errors',
  click(){ 
    dialog.showSaveDialog(null, 
      { 
        defaultPath: 'error-log.csv',
        filters: [
          { name: 'CSV Files', extensions: ['csv'] }
        ] 
      }, (fileName) => {
      if (fileName === undefined){
        return;
      }else if(!fileName.endsWith('.csv')){
        fileName = fileName + '.csv';
      }

      fs.writeFile(fileName, csvErrorContent, (err) => {
        if(err){
          dialog.showErrorBox('Log Error', "An error ocurred creating the error log " + err.message);
        } 
      });
    });
  }
});

const errMenu = Menu.buildFromTemplate(errorMenuTemplate);

// IPC Events
// ipc - write metadata
ipcMain.on('exiftool-write', (event, filePath, data, indx) => {

  //check data before written
  //console.log(data);

  if(fs.existsSync(filePath)){
    ep.writeMetadata(filePath, data, ['ignoreMinorErrors','preserve','htmlFormat','overwrite_original'])
    .then((res) => {
      event.sender.send('exiftool-write-reply', res, indx);
    })
    .catch(console.error);
  }else{
    event.sender.send('exiftool-write-reply', { error: 'File Not Found' }, indx);
  }
});

// ipc - read metadata
ipcMain.on('exiftool-read', (event, filePath, indx) => {
  ep.readMetadata(filePath, [])
    .then((res) => {
      event.sender.send('exiftool-read-reply', res, indx);
    })
    .catch(console.error);
});

// ipc - show file in explorer
ipcMain.on('show-file', (event, filePath) => {
  if( !shell.showItemInFolder(filePath) ){
    dialog.showErrorBox('Show File Error', 'Problems were encountered showing file');
  }
});

// ipc - open error dialog window
ipcMain.on('show-error', (event, title, content) => {
  dialog.showErrorBox(title, content);
});

// ipc - show log error menu option
ipcMain.on('log-errors', (event, errorsArr) => {
  if(errorsArr && errorsArr.length >= 1){
    csvErrorData = errorsArr.map((err, indx) => {
      return { 
        "Error": err
      };
    });
    csvErrorContent = json2csv({ data: csvErrorData, fields: csvErrorFields });
    Menu.setApplicationMenu(errMenu);
  }
});

// ipc - get title from package.json
ipcMain.on('get-title', (event) => {
  let res = `${name} -v ${version}`;
  event.sender.send('get-title-reply', res);
});

// ipc - write backup to file
ipcMain.on('save-backup', (event, data, filePath) => {

  // convert data to csv
  let fields = Object.keys(data[0]);
  let csv = json2csv({ data: data, fields: fields });

  //get date for timestamp
  let today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth() <= 8 ? '0' + (today.getMonth() + 1) : today.getMonth() + 1;
  let day = today.getDate() <= 8 ? '0' + today.getDate() : today.getDate();
  let hours = today.getHours() <= 8 ? '0' + today.getHours() : today.getHours();
  let mins = today.getMinutes() <= 8 ? '0' + today.getMinutes() : today.getMinutes();
  let seconds = today.getSeconds() <= 8 ? '0' + today.getSeconds() : today.getSeconds(); 

  // create path for new file
  let fileName = path.join(filePath, 'reversion-file-' + year + month + day + hours + mins + seconds + '.csv');

  // write file
  fs.writeFile(fileName, csv, (err) => {
    if(err){
      dialog.showErrorBox('Backup Save Error', "An error ocurred creating the file " + err.message);
      event.sender.send('save-backup-reply', false);
    }else{
      event.sender.send('save-backup-reply', true);
    }
  });

});

// create new window
app.on('ready', () => {
  
  mainWindow = new BrowserWindow({
    width: 850, 
    minWidth: 850,
    height: 550, 
    minHeight: 550,
    backgroundColor: '#333333',
    webPreferences: { backgroundThrottling: false },
    icon: path.join(__dirname, 'src', 'assets', 'icons', 'ICO', 'icon.ico'),
    title: app.getName()
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

  // require vue dev-tools
  if(isDevelopment){
    require('vue-devtools').install();
  }

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
