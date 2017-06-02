/*
*================
* CQ5 properties
*================
* .data["0"].Title (String)
* .data["0"].Description (String)
* .data["0"].Tags (Array)
* .data["0"].Creator (String)
* .data["0"].Contributor (String)
* .data["0"].Language (String)
* .data["0"]["Rights-x-repair"] (String)
* .data["0"].Owner (String)
* .data["0"].ExpirationDate (2017:05:19 03:15-05:00) => (5/19/17 3:15 AM)
*================
*/


/*
* add a check mark for completed update
* add a broken file image
* make sure the additional meta can be added
* test for broken paths
* style the buttons
* ...
*/
//requires
$ = require('jquery');
const { ipcRenderer, shell } = require('electron');
const csv = require('csvtojson');

let state = {
  csvObj: null,
  csvCache: null,
  data: []
};


//cache elements
let $fileInput = $('#file-input');
let $uploadFileButton = $('#uploadFileButton');
let $importFileButton = $('#importFileButton');
let $processFileButton = $('#processFileButton');
let $restartButton = $('#restartButton');
let $closeError = $('#close-error');
let $chosenFile = $('#chosen-file');
let $errorMessage = $('.error-message');
let $list = $('#list');


//functions
const readCsvData = (npmModule, csvFilePath) => {
  return new Promise((resolve, reject) => {
    let result = [];

    npmModule()
      .fromFile(csvFilePath)
      .on('json', (jsonObj) => {
        result.push(jsonObj);
      })
      .on('done', (error) => {
        if(error){
          reject(error);
        }
        resolve(result);
      });
  });
};


const processCache = () => {
  state.data = state.csvCache.map((doc, indx) => {
    //let name = doc['-Path'].replace(/\\/g, "/");
    //let path = state.csvObj.dir.replace(/\\/g, "/");
    let name = doc['-Path'];
    let path = state.csvObj.dir;

    doc['-id'] = indx;
    doc['-Path'] = name;
    doc['-fullPath'] = `${path}${name}`;
    return doc;
  });

  console.log('processing...');
  console.log(state.data);
  console.log('...done');
  return true;
};


const updateFiles = (npmModule, arr) => {
  let data;
  let filePath;
  //maybe make a promise chain

  for(let i = 0, len = arr.length; i < len; i++){
    data = {};
    filePath = arr[i]['-File Path']; //should throw an error if this is empty

    Object.keys(arr[i]).forEach((key) => {
      if(!key.startsWith('-') && arr[i][key]){
        data[key] = arr[i][key];
      }else if(arr[i][key] === 'DELETE'){
        data[key] = '';
      }
    });

    updateMeta(filePath, data);
  }

  //console.log('done!!');
};


const updateMeta = (filePath, data) => {
  //I need to see if I need to return the result
  let response = ipcRenderer.send('exiftool-write', filePath, data);
  return true;
};


const readMetaAsync = (filePath) => {
  let files = ipcRenderer.send('exiftool-read', filePath);
  return true;
};


const cacheFile = (data) => {
  state.csvCache = data;
};


const getExtension = (fileName) => {
  return fileName.split('.').pop().substr(0, 3).toLowerCase();
};


const getIcon = (extension) => {
  let fileType;

  switch(extension){
      case 'pdf':
        fileType = 'file-pdf-o';
        break;
      case 'xls':
        fileType = 'file-excel-o';
        break;
      case 'doc':
        fileType = 'file-word-o';
        break;
      case 'ppt':
        fileType = 'file-powerpoint-o';
        break;
      default:
        fileType = 'file-o';
  }

  return `<i class="fa fa-${fileType} fa-3x row-icon"><i class="fa fa-check"></i></i>`;
};


const listFiles = () => {
  let extension;
  let fileLink;

  let list = state.data.map((doc, indx) => {
    extension = getExtension(doc['-Path']);
    fileLink = extension === 'pdf' ? `href="file://${doc['-fullPath']}"` : `href="${doc['-fullPath']}" class="link"`;
    return `
    <div class="row">
      ${getIcon(extension)}
      <ul>
        <li>
          <strong>Title (${Number.parseInt(doc['-id'], 10) + 1}):</strong> 
          ${doc.Title}
        </li>
        <li>
          <strong>Description:</strong> 
          ${doc.Description}
        </li>
        <li>
          <strong>Path from CSV:</strong> 
          <a ${fileLink} target="_blank">${doc['-Path']}</a>
        </li>
      </ul>
    </div>`;
  });

  $list.html(list);
};


const updateErrorMessage = (err) => {
  $errorMessage.find('.message').html(`<strong>Error:</strong> ${err}`);
  if(err){
      $errorMessage.removeClass('hide');
  }else{
      $errorMessage.addClass('hide');
  }
};


//electron process event listeners
ipcRenderer.on('exiftool-read-reply', (event, arg) => {
  if(arg.error){
    updateErrorMessage(arg.error);
  }else{
    console.log(arg);
  }
});

ipcRenderer.on('exiftool-write-reply', (event, arg) => {
  if(arg.error){
    updateErrorMessage(arg.error);
  }else{
    console.log(arg);
  }
});


//events
$closeError.on('click', (e) => {
  e.preventDefault();
  $errorMessage.addClass('hide');
});

$restartButton.on('click', (e) => {
  e.preventDefault();
  readMetaAsync('./test/test.pdf');
  //readMetaAsync('../pdf-meta-test.pdf');
});

$fileInput.on('change', (e) => {
  let { name, path, size } = e.target.files[0];
  let pathLength = path.length - name.length;
  let dir = path.slice(0, pathLength);
  state.csvObj = {
    name: name,
    path: path,
    dir: dir,
    size: size
  };

  $chosenFile.html(name);
});

$uploadFileButton.on('click', (e) => {
  e.preventDefault();
  $fileInput.trigger('click');
});

$importFileButton.on('click', (e) => {
  e.preventDefault();
  let errorMessage = '';     
  let { path, name, size } = state.csvObj;

  if(!path){
    errorMessage = "File required: You must select a file";
  }else if(!name.endsWith('.csv')){
    errorMessage = `Invalid extension: File must end with ".csv"`;
  }else if(size > 25000000){
    errorMessage = "File too big: Please limit files to 25MB";
  }

  updateErrorMessage(errorMessage);

  if(!errorMessage){
    readCsvData(csv, path)
      .then((data) => cacheFile(data))
      .then(() => processCache())
      .then(() => listFiles());
  }
  
});

$list.on('click', '.link', function(e){
  e.preventDefault();
  let path = $(this).attr('href');
  shell.openItem(path);
});
