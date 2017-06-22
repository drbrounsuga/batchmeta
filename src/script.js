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


window.addEventListener('dragover', e =>  $vm.dragcheck(e) );
window.addEventListener('dragenter', e =>  $vm.dragcheck(e) );
window.addEventListener('dragleave', e =>  $vm.dragcheck(e) );
window.addEventListener('dragend', e =>  $vm.dragcheck(e) );

window.addEventListener('drop', (e) => { 
  $vm.dragcheck(e);
  $vm.hovering = false;
});


let $vm;

const vmOptions = {
  errorMessage: '',
  csvCache: null,
  csvDir: null,
  csvFileCount: 0,
  csvFilesProcessed: 0,
  csvMaxSizeMB: 30,
  csvName: null,
  csvPath: null,
  csvSize: null,
  data: [],
  hovering: false,
  message: '',
  page: 1,
  title: '...'
};

const vmBackup = Object.assign({}, vmOptions);


//Vue Components
//================================
$vm = new Vue({
  el: '.container',
  data: vmOptions,
  methods: {
    //saves a copy of the data from the selected csv to state
    cacheFile(data){
      this.csvCache = data;
      this.info.fileCount.value = data.length;//###############
    },
    //*drag and drop field validation
    dragcheck(e){
      if(e.target.type === 'file'){
        this.hovering = true;
      }else{
        e.preventDefault();
        this.hovering = false;
      }
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
          case null:
           fileType = 'chain-broken';
           break;
          default:
            fileType = 'file-o';
      }

      return `
      <i class="fa fa-${fileType} fa-3x row-icon"><i class="fa fa-check"></i></i>`;
    },
    //*reads the selected csv in as an object then updates the view
    getInputFile(e){
      let { name, path, size } = e.target.files[0];
      let message;
      let pathLength;
      let dir;

      if(!name.endsWith('.csv')){
        message = 'file must be a csv';
      }else if(size >= this.csvMaxSizeMB * 1000000){
        message = `file must be less than ${this.csvMaxSizeMB}MB`;
      }

      if(message){
        this.message = message;
        document.querySelector('.drop-box').reset();
        this.csvName = null;
        this.csvPath = null;
        this.csvDir = null;
        this.csvSize = null;
        return false;
      }

      pathLength = path.length - name.length;
      dir = path.slice(0, pathLength);

      this.csvName = name;
      this.csvPath = path;
      this.csvDir = dir;
      this.csvSize = size;
      this.message = `"${name}" has been selected!`;
      this.page = 2;
    },
    //translates the selected csv into a file list preview
    importFile(){
      let errorMessage = '';

      if(!this.csvPath){
        errorMessage = "File required: You must select a file";
      }else if(!this.csvName.endsWith('.csv')){
        errorMessage = `Invalid extension: File must end with ".csv"`;
      }else if(this.csvSize > this.csvMaxSizeMB * 1000000){
        errorMessage = `File too big: Please limit files to ${this.csvMaxSizeMB}MB`;
      }

      this.updateErrorMessage(errorMessage);

      if(!errorMessage){
        this.readCsvData(csv, this.csvPath)
          .then((data) => this.cacheFile(data));
      }
    },
    //updates the view to show the file list
    listFiles(){
      this.page = 2;
      this.changePage('showFileList');
    },
    //opens non-pdf files with the OS's defaul app
    openWithShell(path, extension){
      shell.openItem(path);
    },
    //
    preview(){
      this.page++;
      this.importFile();
    },
    //mutates a copy of the selected csv's data for use in processing
    processCache(){
      this.data = this.csvCache.map((doc, indx) => {
        //let name = doc['-Path'].replace(/\\/g, "/");
        //let path = this.csvDir.replace(/\\/g, "/");
        let name = doc['Path'];
        delete doc['Path'];
        let path = this.csvDir;
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
    //*reset app to default state
    reset(){
      let keys = Object.keys(vmBackup);
      let key;

      for(let i = 0, len = keys.length; i < len; i++){
        key = keys[i];
        this[key] = vmBackup[key];
      }
    },
    //sets the title of the application
    setTitle(str){
      this.title = str;
      let title = document.getElementById('app-title').innerText = str
    },
    //updates the error message display
    updateErrorMessage(err){
      err = err ? `<strong>Error:</strong> ${err}` : err;
      this.errorMessage = err;
    },
    //modifies the metadata of all files in the list
    updateFiles(){
      let data;
      let filePath;
      let arr = this.data;

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

        this.page = 3;
        this.updateMeta(filePath, data, i);
      }
    },
    //update the status flag of items that were updated
    updateListItemStatus(indx, updateStatus){
      let itemToUpdate = Object.assign({}, this.data[indx]);
      itemToUpdate.zzz_processedStatus = updateStatus;
      $vm.$set(this.data, indx, itemToUpdate);
      if(updateStatus){
        this.info.filesProcessed.value++;//#############
      }else{
        this.info.filesProcessed.value--;//#############
      }
    },
    //write to file with exiftool
    updateMeta(filePath, data, indx){
      ipcRenderer.send('exiftool-write', filePath, data, indx);
      return true;
    }
  },
  computed: {
    info: function(){
      return {
        sourceFile: { 
          name: 'Source', 
          value: this.csvName || 'No file selected' 
        },
        fileCount: { 
          name: 'File Count', 
          value: this.csvFileCount || 0 
        },
        filesProcessed: { 
          name: 'Files Updated', 
          value: this.csvFilesProcessed || 0 
        },
        filesSkipped: { 
          name: 'Files Skipped', 
          value: this.csvFileCount - this.csvFilesProcessed 
        }
      };
    }
  }
});


//electron process event listeners
//================================
ipcRenderer.on('exiftool-read-reply', (event, res) => {
  if(res.error){
    $vm.updateErrorMessage(res.error);
  }else{
    console.log(res.data[0]);
  }
});

ipcRenderer.on('exiftool-write-reply', (event, res, indx) => {
  if(res.error && res.error !== '1 image files updated'){
    $vm.updateErrorMessage(res.error);
    $vm.updateListItemStatus(indx, false);
  }else{
    $vm.updateListItemStatus(indx, true);
  }
});

ipcRenderer.on('test-read-file', (event) => {
  console.log('Test file being read...');
  $vm.readMetaAsync('./test/test.pdf');
});

ipcRenderer.on('help-show', (event) => {
  alert('show help files');
});

ipcRenderer.on('download-template', (event) => {
  alert('download template');
});

ipcRenderer.on('reload-reply', (event, res) => {
  if(res.error){
    $vm.updateErrorMessage(res.error);
  }
});

ipcRenderer.on('get-title-reply', (event, res) => {
  if(res.error){
    $vm.updateErrorMessage(res.error);
  }else{
    $vm.setTitle(res);
  }
});

ipcRenderer.send('get-title');