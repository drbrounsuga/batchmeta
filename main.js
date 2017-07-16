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


/*
======================
headers for csv templates
====================== */
// csv headers as arrays
const csvErrorFields = ['Error'];
const csvFields = ['Path', 'Title', 'Description', 'Creator', 'Contributor', 'tags:ROBOTS', 'tags:publishing_entity', 'tags:membership', 'tags:content_type', 'tags:professional_interests', 'Language', 'Rights', 'Owner', 'ExpirationDate'];

// csv headers as objects
let generatedFields;


/*
======================
content for csv templates
====================== */
// logging errors
let csvErrorData;

/* #template with default values for saving an example template to start from scratch
------------------------------------------------------------------------------------- */
const csvData = [{
  "Path": "path\\from\\this\\file.csv", 
  "Title": "My File", 
  "Description": "This is a description in 160 characters or less. See CQ5 for available tags", 
  "Creator": "Von Haynes", 
  "Contributor": "ABA-IPL", 
  "tags:ROBOTS": "INDEX", 
  "tags:publishing_entity": "PT", 
  "tags:membership": "PT", 
  "tags:content_type": "article",
  "tags:professional_interests": "intellectual_property_technology_law",
  "Language": "en-US", 
  "Rights": "Copyright 2017", 
  "Owner": "American Bar Association", 
  "ExpirationDate": "2017:07:29 03:15"
}];


/* #empty template for generating a template from actual user files
------------------------------------------------------------------ */
let generatedCSVTemplate = {
  "Title": "", 
  "Description": "", 
  "Creator": "", 
  "Contributor": "", 
  "tags:ROBOTS": "", 
  "tags:publishing_entity": "",
  "tags:membership": "",
  "tags:content_type": "",
  "tags:professional_interests": "",
  "Language": "", 
  "Rights": "", 
  "Owner": "", 
  "ExpirationDate": ""
};


// #init object template to hold data from actual user files
let generatedCache;

// init object template to hold errors from the actual user files
let csvErrorContent;


/*
======================
csv variables 
====================== */
// read only these fields from PDFs
const readOnlyFields = ['Title', 'Description', 'Creator', 'Contributor', 'tags', 'Language', 'Rights', 'Owner', 'ExpirationDate', 'Keywords'];
  
// a counter unsed to calculate how many files are left to process
let generatedUnprocessed;

// indicates the total number of files
let fileTotal;

// create the csv content for the default csv template
const csvContent = json2csv({ data: csvData, fields: csvFields });


/*
======================
functions
====================== */
/* #get date object 
-------------------- */
function getAppDateObject(){
  //get date for timestamp
  const today = new Date(),
      year = today.getFullYear(),
      month = today.getMonth() <= 8 ? '0' + (today.getMonth() + 1) : today.getMonth() + 1,
      day = today.getDate() <= 8 ? '0' + today.getDate() : today.getDate(),
      hours = today.getHours() <= 8 ? '0' + today.getHours() : today.getHours(),
      mins = today.getMinutes() <= 8 ? '0' + today.getMinutes() : today.getMinutes(),
      seconds = today.getSeconds() <= 8 ? '0' + today.getSeconds() : today.getSeconds(); 

  return { year, month, day, hours, mins, seconds };
}


/* #download the default csv
---------------------------- */
function downloadDefaultCSV(){

  dialog.showSaveDialog(mainWindow, 
    { 
      defaultPath: 'batch-template.csv',
      filters: [
        { name: 'CSV Files', extensions: ['csv'] }
      ] 
    }, 
    (fileName) => {

      // make sure we have a valid name
      if(fileName === undefined){
        return;
      }else if(!fileName.endsWith('.csv')){
        fileName = fileName + '.csv';
      }

      // write the file
      fs.writeFile(fileName, csvContent, (err) => {
        if(err){
          dialog.showErrorBox('Download CSV Error', "An error ocurred creating the file " + err.message);
        }
      });

    }
  );

}


/* #read directory files to generate CSV
---------------------------------------- */
function processDirToObj(){

  // reset generated data
  generatedUnprocessed = 0;
  generatedFields = { "Path": 0 };
  generatedCache = {};
  fileTotal = 0;

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
      
      // let the renderer know that we've started processing the files
      mainWindow.webContents.send('generate-started');

      // ignore files that are not pdf
      recursive(filePath[0], ["!*.pdf"], (err, files) => {
        if(err){
          // let the renderer know that we've stopped processing the files
          mainWindow.webContents.send('generate-ended');
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

      // set the counter for processed files to the number of files
      generatedUnprocessed = files.length;
      fileTotal = files.length;

      // object to pass to next part of promise
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


/* #save the csv for file
------------------------- */
 function generateCSV(filePath){
  let data = [],
      fields = Object.keys(generatedFields),
      keys = Object.keys(generatedCache);

  // converting our object to an array: { 0: object1, 1: object2 } = [ object1, object2 ]
  // each key in our generatedCache represents a file, like an array index
  // loop through them and add them to the data array 
  for(let i = 0, len = keys.length; i < len; i++){
    data.push(generatedCache[keys[i]]);
  }

  // testing generated csv output
  // console.log(data);

  // create the csv content for the generated csv template
  const generatedContent = json2csv({ data: data, fields: fields });

  // create path for new file
  let fileName = path.join(filePath, 'batch-index.csv');

  // write the file file
  fs.writeFile(fileName, generatedContent, (err) => {

    if(err){
      dialog.showErrorBox('CSV Generation Error', "An error ocurred creating the file " + err.message);
    }else{
      dialog.showMessageBox(mainWindow, {
        message: 'A batch import template has been created from the directory that you selected!'
      });
    }

    // reset the progress bar
    mainWindow.webContents.send('generate-updated', '1%');

  });

};


/* #read a file and save it to our generatedCache object using a unique id as the key
------------------------------------------------------------------------------------- */
function readFile(files, id, keys, filePath){

  // files = an array of all of the files 
  // id = the unique id (key) of the file being processed, { 0: object1 } = id of 0
  // keys = an array of the keys for the default template
  // filePath = root directory for all of the files

  ep
  .readMetadata(files[id].zzz_path, [])
  .then((res) => {
    let data = res.data[0],
        key,
        arr,
        count,
        props = {},
        propKeys,
        filteredData = {};

    // filteredData is a modified version of the object represents the file.
    // we start by saving the path of the file to it
    filteredData.Path = files[id].Path;

    // process non-arrays:
    // loop through the keys of the default template...
    for(let i = 0, len = keys.length; i < len; i++){
      key = keys[i];

      // if not array, save it, else add it to the props object.
      // the props object will used to process array keys later.
      // by using an object we avoid duplicates as duplicate keys overwrite each other
      if(!key.includes(':')){
        filteredData[key] = data[key] ? data[key] : '';
      }else{
        props[key.substr(0, key.indexOf(':'))] = 1;
      }
      
    }

    // process arrays:
    // here we get the keys of the props object to process the arrays
    propKeys = Object.keys(props);
    // for each key...
    for(let p = 0, plen = propKeys.length; p < plen; p++){

      // save the array property of the data passed in as "arr"
      // example: 'tags:ROBOTS': 'INDEX' or 'tags::1': 'FOO'
      arr = data[propKeys[p]];

      // start a counter for properties in the format tags::[[counter]]
      count = 1;

      // if the array is not empty...
      if(arr && arr.length){
        // loop through each element...
        for(let a = 0, alen = arr.length; a < alen; a++){
          // if the element includes a colon...
          if(arr[a].includes(':')){
            // format is 'ROBOTS:INDEX' so save as 'tags:ROBOTS': "INDEX"
            // lets split the element value into two parts
            let a1 = arr[a].substr(0, arr[a].indexOf(':'));
            let a2 = arr[a].substr(arr[a].indexOf(':') + 1);

            if(`${a1}`.trim() && `${a2}`.trim()){

              // the csv key should be the array key + colon + the first half of the split
              let tempKey = `${propKeys[p]}:${a1}`;

              // add the key to the field object
              generatedFields[tempKey] = 1;

              // add the data to filteredData
              filteredData[tempKey] = a2;
            }else{
              // the key is invalid. Example: 'ROBOTS:'
              console.log('the key is invalid');
            }

          }else if(`${arr[a]}`.trim()){

            // else format is 'FOO' so save as 'tags::1': 'FOO'
            // the csv key should be the array key + colon + colon + the count
            let tempKey = `${propKeys[p]}::${count}`;

            // add the key to the field object
            generatedFields[tempKey] = 1;

            // add the data to filteredData
            filteredData[tempKey] = arr[a];

            // increment the count
            count++;

          }

        }
      }

    }

    // save a new object to our generatedCache and update the counter
    generatedCache[id] = Object.assign({}, generatedCache[id], filteredData);
    generatedUnprocessed--;
   
    return filePath;
  })
  .then((filePath) => {
    
    // if all files have been processed save the csv
    if(generatedUnprocessed === 0){

      // let the renderer know that we've stopped processing the files
      mainWindow.webContents.send('generate-ended');

      generateCSV(filePath);
    }else{
      // get the percent complete
      let percent = Math.floor(((fileTotal - generatedUnprocessed) / fileTotal) * 100);

      // return feedback on the status of the generating the csv
      if(percent <= 25){
        mainWindow.webContents.send('generate-updated', '25%');
      }else if(percent <= 50 ){
        mainWindow.webContents.send('generate-updated', '50%');
      }else if(percent <= 75 ){
        mainWindow.webContents.send('generate-updated', '75%');
      }else{
        mainWindow.webContents.send('generate-updated', '95%');
      }
    }
    
  })
  .catch(console.error);

}


/*
======================
Menu Template
====================== */
/* #application menu template
------------------------------ */
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
              downloadDefaultCSV(); 
            }
          },
          {
            label: 'Generate from Folder',
            click(){
              processDirToObj();
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


/* #Add development menu if testing
------------------------------------ */
if(isDevelopment){
  mainMenuTemplate.push({
    label: 'Development',
    submenu: [
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
    let { year, month, day, hours, mins, seconds } = getAppDateObject();

    dialog.showSaveDialog(mainWindow, 
      { 
        defaultPath: 'error-log-' + year + month + day + hours + mins + seconds + '.csv',
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


/*
======================
IPC Events
====================== */
/* #exiftool-read = ipc - read metadata
---------------------------------------- */
ipcMain.on('exiftool-read', (event, filePath, indx) => {
  ep.readMetadata(filePath, readOnlyFields)
    .then((res) => {
      event.sender.send('exiftool-read-reply', res, indx);
    })
    .catch(console.error);
});


/* #exiftool-write = ipc - write metadata
----------------------------------------- */
ipcMain.on('exiftool-write', (event, filePath, data, indx) => {

  // erase all data before updating with 'all' = ""
  data = Object.assign({}, { all: '' }, data);

  // check data before written
  // console.log(data); 
  // return false;

  if(fs.existsSync(filePath)){
    ep.writeMetadata(filePath, data, ['ignoreMinorErrors','preserve','htmlFormat','overwrite_original','-duplicates'])
    .then((res) => {
      event.sender.send('exiftool-write-reply', res, indx);
    })
    .catch(console.error);
  }else{
    event.sender.send('exiftool-write-reply', { error: 'File Not Found' }, indx);
  }
}); 


/* #get-title = ipc - get title from package.json
-------------------------------------------------- */
ipcMain.on('get-title', (event) => {
  let res = `${name} -v ${version}`;
  event.sender.send('get-title-reply', res);
});


/* #log-errors = ipc - show log error menu option
-------------------------------------------------- */
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


/* #save-backup = ipc - write backup to file
-------------------------------------------- */
ipcMain.on('save-backup', (event, data, filePath) => {

  // convert data to csv
  let fields = Object.keys(data[0]),
      csv = json2csv({ data: data, fields: fields }),
      { year, month, day, hours, mins, seconds } = getAppDateObject();

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


/* #show-error = ipc - open error dialog window
------------------------------------------------- */
ipcMain.on('show-error', (event, title, content) => {
  dialog.showErrorBox(title, content);
});


/* #show-file = ipc - show file in explorer
------------------------------------------------- */
ipcMain.on('show-file', (event, filePath) => {
  if( !shell.showItemInFolder(filePath) ){
    dialog.showErrorBox('Show File Error', 'Problems were encountered showing file');
  }
});



/*
======================
App settings
====================== */
/* #create new window
---------------------- */
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
