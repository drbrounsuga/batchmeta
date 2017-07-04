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
* troubleshoot xslt (can't write)
* test for broken paths
*/

//requires
//================================
const { ipcRenderer } = require('electron');
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
  revertFile: [],
  conversionStarted: false,
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
  importCount: 0,
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
      data = data.filter((val, indx) => {
        return val.hasOwnProperty('Path');
      });

      this.csvCache = data;
      this.csvFileCount = data.length;
    },
    //*
    createBackup(){
      ipcRenderer.send('save-backup', this.revertFile);
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
      <i class="fa fa-${fileType} fa-2x row-icon"><i class="fa fa-check"></i></i>`;
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
    //*
    importFile(){
      this.page = 4;

      this.processCache()
        .then((data) => this.data = data)
        .then(() => this.readImportedFiles());
    },
    //*opens non-pdf files with the OS's defaul app
    openWithShell(filePath){
      ipcRenderer.send('show-file', filePath);
    },
    //*
    preview(){
      this.page++;
      let errorMessage = '';

      if(!this.csvPath){
        errorMessage = "File required: You must select a file";
      }else if(!this.csvName.endsWith('.csv')){
        errorMessage = `Invalid extension: File must end with ".csv"`;
      }else if(this.csvSize > this.csvMaxSizeMB * 1000000){
        errorMessage = `File too big: Please limit files to ${this.csvMaxSizeMB}MB`;
      }

      if(!errorMessage){
        this.readCsvData(csv, this.csvPath)
          .then((data) => this.cacheFile(data));
      }else{
        this.updateErrorMessage('Preview Error', errorMessage);
      }
    },
    //*mutates a copy of the selected csv's data for use in processing
    processCache(){
      return new Promise((resolve, reject) => {
        let result;

        try{
          result = this.csvCache.map((doc, indx) => {
            let name;
            let path;
            let extension;

            name = doc['Path'];
            delete doc['Path'];
            path = this.csvDir;
            extension = this.getExtension(name);

            doc['zzz_id'] = indx;
            doc['zzz_path'] = name;
            doc['zzz_fullPath'] = `${path}${name}`;
            doc['zzz_extension'] = extension;
            doc['zzz_icon'] = this.getIcon(extension);
            doc['zzz_processedStatus'] = null;
            doc['zzz_original'] = null;
            doc['zzz_showDetails'] = false;

            /* 
            * if the key contains a : then its an array prop:
            * Tags:ROBOTS: "FOLLOW" => Tags['ROBOTS:FOLLOW']
            */
            Object.keys(doc).map((key, n) => {
              if(key.includes(':')){
                let [ baseKey, propName ] = key.split(':');

                if(!doc[baseKey]){
                  doc[baseKey] = [];
                }

                doc[baseKey].push(`${propName ? propName + ':' : ''}${doc[key]}`);
                delete doc[key];
              }
            });

            return doc;
          });

          resolve(result);
        }catch(e){
          reject(e);
        }

      });
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
    //*
    readImportedFiles(){
      return new Promise((resolve, reject) => {
        let data = this.data;
        let filePath;

        try{
          for(let i = 0, len = data.length; i < len; i++){
            filePath = data[i]['zzz_fullPath'];
            this.readMetaAsync('exiftool-read', filePath, i);
          };
          resolve(true);
        }catch(e){
          reject(e);
        }
      });
    },
    //read file with exiftool
    readMetaAsync(channel, filePath, indx){
      ipcRenderer.send(channel, filePath, indx);
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
    //*sets the title of the application
    setTitle(str){
      this.title = str;
      let title = document.getElementById('app-title').innerText = str
    },
    //*
    toggleDetails(e, indx){
      let obj = Object.assign({}, this.data);
      let bool = !obj[indx]['zzz_showDetails'];

      if (e.ctrlKey){;
        for(let i = 0, len = Object.keys(obj).length; i < len; i++){
          obj[i]['zzz_showDetails'] = bool;
        }
      }else{
        obj[indx]['zzz_showDetails'] = bool;
      }

      this.data = obj;
    },
    //updates the error message display
    updateErrorMessage(title, err){
      ipcRenderer.send('show-error', title, err);
    },
    //modifies the metadata of all files in the list
    updateFiles(){
      let data;
      let filePath;
      let len = Object.keys(this.data).length;
      let arr = Object.assign({}, this.data);

      for(let i = 0; i < len; i++){
        data = {};
        filePath = arr[i]['zzz_fullPath']; //icon to empty file if this is empty

        if(!filePath){ continue; }

        Object.keys(arr[i]).forEach((key) => {
          if(!key.startsWith('zzz_') && arr[i][key]){
            data[key] = arr[i][key];
          }else if(arr[i][key] === 'DELETE'){
            data[key] = '';
          }
        });

        this.updateMeta(filePath, data, i);
      }
    },
    //update the status flag of items that were updated
    updateListItemStatus(indx, updateStatus){
      let itemToUpdate = Object.assign({}, this.data[indx]);
      itemToUpdate.zzz_processedStatus = updateStatus;
      $vm.$set(this.data, indx, itemToUpdate);
      if(updateStatus){
        this.csvFilesProcessed++;
      }else{
        this.csvFilesProcessed--;
      }
    },
    //write to file with exiftool
    updateMeta(filePath, data, indx){
      ipcRenderer.send('exiftool-write', filePath, data, indx);
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
          value: this.conversionStarted ? this.csvFileCount - this.csvFilesProcessed : 0
        }
      };
    }
  }
});


//electron process event listeners
//================================
ipcRenderer.on('exiftool-read-reply', (event, res, indx) => {
  let result;
  let keys;
  let key;
  let backup = {};
  let oldData = {};

  if(res.error && indx !== -1 || indx >= 0){
    result = Object.assign({}, $vm.data);

    if(res.error){
      oldData['title'] = res.error;
      $vm.importCount++;
    }else{
      keys = Object.keys(result[indx]);
      keys = keys.filter((key) => {
        return !key.startsWith('zzz_');
      });

      for(let i = 0, len = keys.length; i < len; i++){

        key = keys[i].split(':')[0];
        if(res.data[0].hasOwnProperty(key)){
          if(Array.isArray(res.data[0][key])){
            let arr = res.data[0][key];

            for(let i = 0, len = arr.length; i < len; i++){
              let [ k, v ] = arr[i].split(':');
              backup[`${key}:${k}`] = v;
            }

            oldData[key] = res.data[0][key];
          }else{
            oldData[key] = res.data[0][key];
            backup[key] = res.data[0][key];
          }
        }
      }
    }

    result[indx]['zzz_original'] = oldData;
    $vm.data = result;
    $vm.revertFile.push( Object.assign({}, backup, { Path: result[indx]['zzz_path'] }) );
    $vm.importCount++;
  }else if(res.error){
    $vm.updateErrorMessage('Read Reply Error', res.error);
  }else{
    console.log(res.data[0]);
  }
});

ipcRenderer.on('exiftool-write-reply', (event, res, indx) => {
  if(res.error && res.error !== '1 image files updated'){
    $vm.updateErrorMessage('Write Reply Error', res.error);
    $vm.updateListItemStatus(indx, false);
  }else{
    $vm.updateListItemStatus(indx, true);
  }
});

ipcRenderer.on('test-read-file', (event) => {
  console.log('Test file being read...');
  $vm.readMetaAsync('exiftool-read', './test/test.pdf', -1);
});

ipcRenderer.on('reload-reply', (event, res) => {
  if(res.error){
    $vm.updateErrorMessage('Reload Reply Error', res.error);
  }
});

ipcRenderer.on('save-backup-reply', (event, res) => {
  if(!res.error && res){
    $vm.updateFiles();
  }
});

ipcRenderer.on('get-title-reply', (event, res) => {
  if(res.error){
    $vm.updateErrorMessage('Get Title Error', res.error);
  }else{
    $vm.setTitle(res);
  }
});

ipcRenderer.send('get-title');