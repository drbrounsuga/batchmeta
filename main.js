const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const exiftool = require('node-exiftool');
const version = require('./package.json').version;
const path = require('path');
const url = require('url');
var json2csv = require('json2csv');
const fs = require('fs');
const recursive = require('recursive-readdir');

let mainWindow;
const ep = new exiftool.ExiftoolProcess(path.join(__dirname, 'src', 'assets', 'exiftool'));
const isDevelopment = process.env.NODE_ENV && process.env.NODE_ENV.trim() !== 'production';

// headers for csv templates
const csvErrorFields = ['Error'];
const csvFields = ['Path', 'Title', 'Description', 'Creator', 'Contributor', 'Tags:ROBOTS', 'Tags:publishing_entity', 'Tags:membership', 'Tags:content_type', 'Tags:professional_interests', 'Language', 'Rights', 'Owner', 'ExpirationDate'];
let generatedFields;

// default content for csv templates
let csvErrorData;
const csvData = [{
  "Path": "path\\from\\this\\file.csv", 
  "Title": "My File", 
  "Description": "This is a description in 160 characters or less. See CQ5 for available tags", 
  "Creator": "Von Haynes", 
  "Contributor": "ABA-IPL", 
  "Tags:ROBOTS": "INDEX", 
  "Tags:publishing_entity": "PT", 
  "Tags:membership": "PT", 
  "Tags:content_type": "article",
  "Tags:professional_interests": "intellectual_property_technology_law",
  "Language": "en-US", 
  "Rights": "Copyright 2017", 
  "Owner": "American Bar Association", 
  "ExpirationDate": "2017:07:29 03:15"
}];
let generatedCSVTemplate = {
  "Title": "", 
  "Description": "", 
  "Creator": "", 
  "Contributor": "", 
  "Tags:ROBOTS": "", 
  "Tags:publishing_entity": "",
  "Tags:membership": "",
  "Tags:content_type": "",
  "Tags:professional_interests": "",
  "Language": "", 
  "Rights": "", 
  "Owner": "", 
  "ExpirationDate": ""
};
let generatedCache;
let generatedUnprocessed;

// create csv data
let csvErrorContent;
const csvContent = json2csv({ data: csvData, fields: csvFields });

// generate csv for user
 function generateCSV(filePath){
  let data = [];
  let fields = Object.keys(generatedFields);
  let keys = Object.keys(generatedCache);

  for(let i = 0, len = keys.length; i < len; i++){
    data.push(generatedCache[keys[i]]);
  }
  
  const generatedContent = json2csv({ data: data, fields: fields });

  // create path for new file
  let fileName = path.join(filePath, 'batch-index.csv');

  // write file
  fs.writeFile(fileName, generatedContent, (err) => {
    if(err){
      dialog.showErrorBox('CSV Generation Error', "An error ocurred creating the file " + err.message);
    }else{
      dialog.showMessageBox(mainWindow, {
        message: 'A batch import template has been created from the directory that you selected!'
      });
    }
  });

};


function readFile(files, id, keys, filePath){

  ep
  .readMetadata(files[id].zzz_path, [])
  .then((res) => {
    let data = res.data[0];
    let key;
    let arr;
    let count;
    let props = {};
    let propKeys;
    let filteredData = {};

    filteredData.Path = files[id].Path;

    for(let i = 0, len = keys.length; i < len; i++){
      key = keys[i];

      if(!key.includes(':')){
        filteredData[key] = data[key] ? data[key] : '';
      }else{
        props[key.substr(0, key.indexOf(':'))] = 1;
      }
      
    }

    propKeys = Object.keys(props);
    for(let p = 0, plen = propKeys.length; p < plen; p++){
      arr = data[propKeys[p]];
      count = 1;

      if(arr && arr.length){
        for(let a = 0, alen = arr.length; a < alen; a++){
          if(arr[a].includes(':')){
            // Tags:ROBOTS: "FOLLOW", Tags:FOO: "BAR" => Tags['ROBOTS:FOLLOW', 'FOO:BAR']
            let a1 = arr[a].substr(0, arr[a].indexOf(':'));
            let a2 = arr[a].substr(arr[a].indexOf(':') + 1);
            if(`${a2}`.trim()){
              let tempKey = `${propKeys[p]}:${a1}`;
              generatedFields[tempKey] = 1;
              filteredData[tempKey] = a2;
            }
          }else{
            // Tags::1: "ROBOTS:FOLLOW", Tags::2: "FOO:BAR" => Tags['ROBOTS:FOLLOW', 'FOO:BAR']
            if(`${arr[a]}`.trim()){
              let tempKey = `${propKeys[p]}::${count}`;
              generatedFields[tempKey] = 1;
              filteredData[tempKey] = arr[a];
            }
            count++;
          }

        }
      }

    }

    generatedCache[id] = Object.assign({}, generatedCache[id], filteredData);
    generatedUnprocessed--;

    return filePath;
  })
  .then((filePath) => {
    if(generatedUnprocessed === 0){
      generateCSV(filePath);
    }
  })
  .catch(console.error);

}


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
              dialog.showSaveDialog(mainWindow, 
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
              // reset generated data
              generatedUnprocessed = 0;
              generatedFields = { "Path": 0 };
              generatedCache = {};

              // open dialog for directory selection
              dialog.showOpenDialog(mainWindow,{
                title: 'Generate template from directory',
                properties: ['openDirectory']
              }, 
              (filePath) => {
                let localPath;

                if(filePath === undefined){
                  return;
                }
                
                // get the list of files
                let walk = new Promise((resolve, reject) => {
                  
                  recursive(filePath[0], ["!*.pdf"], (err, files) => {
                    if(err){
                      reject(err);
                    }else{
                      resolve(files);
                    }
                  });

                });
                
                walk
                .then( files => {
                  // start at 0, set total num of files
                  let count = 0;
                  generatedUnprocessed = files.length;

                  let result = {};

                  // loop through each file, cache object, send path data on for processing
                  files.map((file) => {
                    localPath = path.relative(filePath[0], file);
                    generatedCache[count] = Object.assign({}, generatedCSVTemplate, { "Path": localPath });
                    result[count] = Object.assign({}, { "zzz_path": file, "Path": localPath });
                    count++;
                  });

                  return result;
                  
                })
                .then( files => {
                  let key;
                  // files = { '0': object1, '1': object2 }
                  let keys = Object.keys(files);
                  let defaultKeys = Object.keys(generatedCSVTemplate);

                  // get template keys for header
                  defaultKeys.map((key) => {
                    generatedFields[key] = 0;
                  });


                  // for each object in files, read the file meta
                  for(let i = 0, len = keys.length; i < len; i++){
                    key = keys[i];

                    // note: func call prevents aync vars from being overriden
                    readFile(files, key, defaultKeys, filePath[0]);                 
                  }

                })
                .catch((error) => {
                  dialog.showErrorBox('Error generating template', error);
                });

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
    dialog.showSaveDialog(mainWindow, 
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
