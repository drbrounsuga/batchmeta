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
*
* FilePermissions: "rw-rw-rw-"
*================
*/

/*
*================
* TO DO LIST
*================
* troubleshoot xslt (can't write)
* check that all met is written
* test for broken paths
* capture all errors
* write to the info bar
* ...
*/

//requires
//================================
const { ipcRenderer, shell } = require('electron');
const csv = require('csvtojson');
const Vue = require('../node_modules/vue/dist/vue.js');
let vueContainer;

//electron process event listeners
//================================
ipcRenderer.on('exiftool-read-reply', (event, res) => {
  if(res.error){
    vueContainer.updateErrorMessage(res.error);
  }else{
    console.log(res.data[0]);
  }
});

ipcRenderer.on('exiftool-write-reply', (event, res, indx) => {
  if(res.error && res.error !== '1 image files updated'){
    vueContainer.updateErrorMessage(res.error);
    vueContainer.updateListItemStatus(indx, false);
  }else{
    vueContainer.updateListItemStatus(indx, true);
  }
});

ipcRenderer.on('reload-reply', (event, res) => {
  if(res.error){
    vueContainer.updateErrorMessage(res.error);
  }
});

ipcRenderer.on('get-title-reply', (event, res) => {
  if(res.error){
    vueContainer.updateErrorMessage(res.error);
  }else{
    vueContainer.setTitle(res);
  }
});

//Vue Components
//================================
vueContainer = new Vue({
  el: '.container',
  data: {
    state: {
      title: '...',
      csvObj: null,
      csvCache: null,
      csvMaxSizeMB: 25,
      errorMessage: '',
      step: 0,
      page: {
        showImporter: false,
        showFileList: false,
        showHelp: true
      },
      data: []
    },
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
    //saves a copy of the data from the selected csv to state
    cacheFile(data){
      this.state.csvCache = data;
    },
    //routing. determines what info to display
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
    //gets the extension of imported files
    getExtension(fileName){
      if(!fileName){
        return null;
      }
      return fileName.split('.').pop().substr(0, 3).toLowerCase();
    },
    //generates an icon for imported files
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
          case null:
           fileType = 'chain-broken';
           break;
          default:
            fileType = 'file-o';
      }

      return `
      <i class="fa fa-${fileType} fa-3x row-icon"><i class="fa fa-check"></i></i>`;
    },
    //reads the selected csv in as an object then updates the view
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
    //handles/routes clicks on the nav bar
    handleButtonClicks(action){
      if(action === 'upload'){
        this.state.step = 1;
        document.getElementById('file-input').click();
      }else if(action === 'clear'){
        ipcRenderer.send('reload');
      }else if(action === 'help'){
        console.log('help button clicked');
        this.readMetaAsync('./test/test.pdf');
        //this.readMetaAsync('../pdf-meta-test.pdf');
      }
    },
    //translates the selected csv into a file list preview
    importFile(){
      let errorMessage = '';     
      let { path, name, size } = this.state.csvObj;

      if(!path){
        errorMessage = "File required: You must select a file";
      }else if(!name.endsWith('.csv')){
        errorMessage = `Invalid extension: File must end with ".csv"`;
      }else if(size > this.state.csvMaxSizeMB * 1000000){
        errorMessage = `File too big: Please limit files to ${this.state.csvMaxSizeMB}MB`;
      }

      this.updateErrorMessage(errorMessage);

      if(!errorMessage){
        this.readCsvData(csv, path)
          .then((data) => this.cacheFile(data))
          .then(() => this.processCache())
          .then(() => this.listFiles());
      }
    },
    //updates the view to show the file list
    listFiles(){
      this.state.step = 2;
      this.changePage('showFileList');
    },
    //opens non-pdf files with the OS's defaul app
    openWithShell(path, extension){
      shell.openItem(path);
    },
    //mutates a copy of the selected csv's data for use in processing
    processCache(){
      this.state.data = this.state.csvCache.map((doc, indx) => {
        //let name = doc['-Path'].replace(/\\/g, "/");
        //let path = this.state.csvObj.dir.replace(/\\/g, "/");
        let name = doc['Path'];
        delete doc['Path'];
        let path = this.state.csvObj.dir;
        let extension = this.getExtension(name);

        doc['zzz_id'] = indx;
        doc['zzz_path'] = name;
        doc['zzz_fullPath'] = `${path}${name}`;
        if(name){
          doc['zzz_fileLink'] = `<a href="file://${path}${name}" target="_blank">${name}</a>`;
        }else{
          doc['zzz_fileLink'] = `<a class="bad-link">${name}</a>`;
        }
        doc['zzz_extension'] = extension;
        doc['zzz_icon'] = this.getIcon(extension);
        doc['zzz_processedStatus'] = null;
        return doc;
      });

      return true;
    },
    //reads the csv file in as a json object
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
    //read file with exiftool
    readMetaAsync(filePath){
      ipcRenderer.send('exiftool-read', filePath);
      return true;
    },
    //sets the title of the application
    setTitle(str){
      this.state.title = str;
      let title = document.getElementById('app-title').innerText = str
    },
    //updates the error message display
    updateErrorMessage(err){
      err = err ? `<strong>Error:</strong> ${err}` : err;
      this.state.errorMessage = err;
    },
    //modifies the metadata of all files in the list
    updateFiles(){
      let data;
      let filePath;
      let arr = this.state.data;

      for(let i = 0, len = arr.length; i < len; i++){
        data = {};
        filePath = arr[i]['zzz_fullPath']; //icon to empty file if this is empty

        if(!filePath){ continue; }

        Object.keys(arr[i]).forEach((key) => {
          if(key.includes(':')){
            /* 
            * if the key contains a : then its an array prop:
            * Tags:ROBOTS: "FOLLOW" => Tags['ROBOTS:FOLLOW']
            */
            let [ arrKey, propName ] = key.split(':');

            if(!data[arrKey]){
              data[arrKey] = [];
            }

            data[arrKey].push(`${propName}:${arr[i][key]}`);

          }else if(!key.startsWith('zzz_') && arr[i][key]){
            data[key] = arr[i][key];
          }else if(arr[i][key] === 'DELETE'){
            data[key] = '';
          }
        });

        this.state.step = 3;
        this.updateMeta(filePath, data, i);
      }
    },
    //update the status flag of items that were updated
    updateListItemStatus(indx, updateStatus){
      let itemToUpdate = Object.assign({}, this.state.data[indx]);
      itemToUpdate.zzz_processedStatus = updateStatus;
      vueContainer.$set(this.state.data, indx, itemToUpdate);
    },
    //write to file with exiftool
    updateMeta(filePath, data, indx){
      ipcRenderer.send('exiftool-write', filePath, data, indx);
      return true;
    }
  }
});

ipcRenderer.send('get-title');