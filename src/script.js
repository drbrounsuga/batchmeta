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
*================
* TO DO LIST
*================
* add a broken file image
* make sure the additional meta can be added
* test for broken paths
* ...
*/

//requires
$ = require('jquery');
const { ipcRenderer, shell } = require('electron');
const csv = require('csvtojson');
const Vue = require('../node_modules/vue/dist/vue.js');

//cache elements
let $processFileButton = $('#processFileButton');
let $closeError = $('#close-error');
let $errorMessage = $('.error-message');
let $list = $('#list');

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

const updateMeta = (filePath, data) => {
  //I need to see if I need to return the result
  let response = ipcRenderer.send('exiftool-write', filePath, data);
  return true;
};

const readMetaAsync = (filePath) => {
  let files = ipcRenderer.send('exiftool-read', filePath);
  return true;
};

//Vue Components
let vueContainer = new Vue({
  el: '.container',
  data: {
    state: {
      csvObj: null,
      csvCache: null,
      errorMessage: '',
      step: 0,
      page: {
        showImporter: false,
        showFileList: false,
        showHelp: true
      },
      data: []
    },
    defaultState: null,
    buttons: [
      {
        id: 'uploadFileButton',
        title: 'Choose File',
        class: 'fa fa-plus',
        action: 'upload',
        displayOnStep: 0
      },
      {
        id: 'restartButton',
        title: 'Clear Selections',
        class: 'fa fa-refresh',
        action: 'clear',
        displayOnStep: 1
      },
      {
        id: 'helpButton',
        title: 'Help',
        class: 'fa fa-question',
        action: 'help',
        displayOnStep: 0
      }
    ]
  },
  methods: {
    cacheFile(data){
      this.state.csvCache = data;
    },
    changePage(selection){
      let keys = Object.keys(this.state.page);
      let newPage = {};

      keys.forEach(function(key, indx){
        if(key === selection){
          newPage[key] = true;
        }else{
          newPage[key] = false;
        }
      });

      this.state.page = newPage;
    },
    getDefaultState(){
      this.defaultState = Object.assign({}, this.state);
    },
    getExtension(fileName){
      return fileName.split('.').pop().substr(0, 3).toLowerCase();
    },
    getIcon(extension){
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
    },
    getInputFile(e){
      if(e.target.files.length < 1){
        return;
      }
      let { name, path, size } = e.target.files[0];
      let pathLength = path.length - name.length;
      let dir = path.slice(0, pathLength);
      this.state.csvObj = {
         name: name,
         path: path,
         dir: dir,
         size: size
       };

      this.changePage('showImporter');
    },
    handleButtonClicks(action){
      if(action === 'upload'){
        this.state.step = 1;
        document.getElementById('file-input').click();
      }else if(action === 'clear'){
        this.state = Object.assign({}, this.defaultState);
      }else if(action === 'help'){
        console.log('help button clicked');
        readMetaAsync('./test/test.pdf');
        //readMetaAsync('../pdf-meta-test.pdf');
      }
    },
    importFile(){
      let errorMessage = '';     
      let { path, name, size } = this.state.csvObj;

      if(!path){
        errorMessage = "File required: You must select a file";
      }else if(!name.endsWith('.csv')){
        errorMessage = `Invalid extension: File must end with ".csv"`;
      }else if(size > 25000000){
        errorMessage = "File too big: Please limit files to 25MB";
      }

      this.updateErrorMessage(errorMessage);

      if(!errorMessage){
        this.readCsvData(csv, path)
          .then((data) => this.cacheFile(data))
          .then(() => this.processCache())
          .then(() => this.listFiles());
      }
    },
    listFiles(){
      this.state.step = 2;
      this.changePage('showFileList');
    },
    openWithShell(path, extension){
      shell.openItem(path);
    },
    processCache(){
      this.state.data = this.state.csvCache.map((doc, indx) => {
        //let name = doc['-Path'].replace(/\\/g, "/");
        //let path = this.state.csvObj.dir.replace(/\\/g, "/");
        let name = doc['-Path'];
        let path = this.state.csvObj.dir;
        let extension = this.getExtension(name);

        doc['-id'] = indx;
        doc['-Path'] = name;
        doc['-fullPath'] = `${path}${name}`;
        doc['-fileLink'] = `<a href="file://${path}${name}" target="_blank">${name}</a>`;
        doc['-extension'] = extension;
        doc['-icon'] = this.getIcon(extension);
        return doc;
      });

      return true;
    },
    readCsvData(npmModule, csvFilePath){
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
    },
    updateErrorMessage(err){
      err = err ? `<strong>Error:</strong> ${err}` : err;
      this.state.errorMessage = err;
    }
  }
});


vueContainer.getDefaultState();

//==========================================================================
//functions
// const readCsvData = (npmModule, csvFilePath) => {
//   return new Promise((resolve, reject) => {
//     let result = [];

//     npmModule()
//       .fromFile(csvFilePath)
//       .on('json', (jsonObj) => {
//         result.push(jsonObj);
//       })
//       .on('done', (error) => {
//         if(error){
//           reject(error);
//         }
//         resolve(result);
//       });
//   });
// };


// const processCache = () => {
//   state.data = state.csvCache.map((doc, indx) => {
//     //let name = doc['-Path'].replace(/\\/g, "/");
//     //let path = state.csvObj.dir.replace(/\\/g, "/");
//     let name = doc['-Path'];
//     let path = state.csvObj.dir;

//     doc['-id'] = indx;
//     doc['-Path'] = name;
//     doc['-fullPath'] = `${path}${name}`;
//     return doc;
//   });

//   console.log('processing...');
//   console.log(state.data);
//   console.log('...done');
//   return true;
// };


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


// const getExtension = (fileName) => {
//   return fileName.split('.').pop().substr(0, 3).toLowerCase();
// };


// const getIcon = (extension) => {
//   let fileType;

//   switch(extension){
//       case 'pdf':
//         fileType = 'file-pdf-o';
//         break;
//       case 'xls':
//         fileType = 'file-excel-o';
//         break;
//       case 'doc':
//         fileType = 'file-word-o';
//         break;
//       case 'ppt':
//         fileType = 'file-powerpoint-o';
//         break;
//       default:
//         fileType = 'file-o';
//   }

//   return `<i class="fa fa-${fileType} fa-3x row-icon"><i class="fa fa-check"></i></i>`;
// };


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
console.log(state.data);
  $list.html(`
    <li class="chosen-file">Process "${state.csvObj.name}"?</li>
    <li class="chosen-file">
      <a href="#" id="processFileButton" title="Process Tags">
        <i class="fa fa-play"></i>
      </a>
    </li>
    ${list}`);
};


// const updateErrorMessage = (err) => {
//   $errorMessage.find('.message').html(`<strong>Error:</strong> ${err}`);
//   if(err){
//       $errorMessage.removeClass('hide');
//   }else{
//       $errorMessage.addClass('hide');
//   }
// };



// $list.on('click', '#importFileButton', (e) => {
//   e.preventDefault();
//   let errorMessage = '';     
//   let { path, name, size } = state.csvObj;

//   if(!path){
//     errorMessage = "File required: You must select a file";
//   }else if(!name.endsWith('.csv')){
//     errorMessage = `Invalid extension: File must end with ".csv"`;
//   }else if(size > 25000000){
//     errorMessage = "File too big: Please limit files to 25MB";
//   }

//   updateErrorMessage(errorMessage);

//   if(!errorMessage){
//     readCsvData(csv, path)
//       .then((data) => cacheFile(data))
//       .then(() => processCache())
//       .then(() => listFiles());
//   }
  
// });

// $list.on('click', '.link', function(e){
//   e.preventDefault();
//   let path = $(this).attr('href');
//   shell.openItem(path);
// });
