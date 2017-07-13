/*
================
 CQ5 properties
================
 .data["0"].Title (String)
 .data["0"].Description (String)
 .data["0"].Tags (Array)
 .data["0"].Creator (String)
 .data["0"].Contributor (String)
 .data["0"].Language (String)
 .data["0"]["Rights-x-repair"] (String)
 .data["0"].Owner (String)
 .data["0"].ExpirationDate (2017:05:19 03:15-05:00) => (5/19/17 3:15 AM)
================
*/

// variables
const isDevelopment = process.env.NODE_ENV && `${process.env.NODE_ENV}`.trim() !== 'production';
const vueModule = isDevelopment ? '../node_modules/vue/dist/vue.js' : '../node_modules/vue/dist/vue.min.js'

const { ipcRenderer } = require('electron');
const csv = require('csvtojson');
const Vue = require(vueModule);

let $vm;

// options for vue instance
function getInitialData(){
  return {
    revertFile: [],
    conversionStarted: false,
    csvCache: null,
    csvDir: null,
    csvFileCount: 0,
    csvFilesProcessed: 0,
    csvFilesSeen: 0,
    csvMaxSizeMB: 30,
    csvName: null,
    csvPath: null,
    csvSize: null,
    data: [],
    errorLog: [],
    filesSkipped: 0,
    hovering: false,
    importCount: 0,
    message: '',
    page: 1,
    title: '...',
    validFileCount: 0
  };
}

// set up drag and drop functionality
window.addEventListener('dragover', e =>  $vm.dragcheck(e) );
window.addEventListener('dragenter', e =>  $vm.dragcheck(e) );
window.addEventListener('dragleave', e =>  $vm.dragcheck(e) );
window.addEventListener('dragend', e =>  $vm.dragcheck(e) );

window.addEventListener('drop', (e) => { 
  $vm.dragcheck(e);
  $vm.hovering = false;
});


// vue instance
$vm = new Vue({
  el: '.container',
  data: getInitialData(),
  methods: {
    // saves a copy of the data from the selected csv to state
    cacheFile(data){
      // remove items with no Path property
      data = data.filter((val, indx) => {
        return val.hasOwnProperty('Path');
      });

      this.csvCache = data;
      this.csvFileCount = data.length;
    },
    // creates a backup of current files metadata before editing them
    createBackup(){
      this.conversionStarted = true;
      ipcRenderer.send('save-backup', this.revertFile, this.csvDir);
    },
    // drag and drop visual feedback
    dragcheck(e){
      if(e.target.type === 'file'){
        this.hovering = true;
      }else{
        e.preventDefault();
        this.hovering = false;
      }
    },
    // gets the extension of files
    getExtension(fileName){
      if(!fileName){
        return null;
      }
      return fileName.split('.').pop().substr(0, 3).toLowerCase();
    },
    // generates html for file icon
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
    // validates the csv and then caches it
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
    // process cached csv data and then read in the files
    importFile(){
      this.page = 4;

      this.processCache()
        .then((data) => this.data = data)
        .then(() => this.readImportedFiles());
    },
    // reveals the file in the explorer
    openWithShell(filePath){
      ipcRenderer.send('show-file', filePath);
    },
    // validate csv and then cache it
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
        this.showErrorMessage('Preview Error', errorMessage);
      }
    },
    // mutates and returns a copy of the selected csv's data for use in processing
    processCache(){
      return new Promise((resolve, reject) => {
        let result;

        try{
          result = this.csvCache.map((doc, indx) => {
            let name;
            let path;
            let extension;
            let val;

            name = doc['Path'];
            delete doc['Path'];
            path = this.csvDir;
            extension = this.getExtension(name);

            doc['zzz_id'] = indx;
            doc['zzz_path'] = name;
            doc['zzz_fullPath'] = `${path}${name}`;
            doc['zzz_extension'] = extension;
            doc['zzz_icon'] = this.getIcon(extension);
            doc['zzz_processedStatus'] = extension === 'pdf' ? null : false;
            doc['zzz_original'] = null;
            doc['zzz_showDetails'] = false;

            /* 
            * if the key contains a : then its an array prop:
            * Tags::1: "ONE", Tags::2: "TWO", Tags::3: "THREE" => Tags["ONE", "TWO", "THREE"]
            * Tags:ROBOTS: "FOLLOW" => Tags['ROBOTS:FOLLOW']
            */
            Object.keys(doc).map((key, n) => {
              val = '';

              if(key.includes(':')){
                let baseKey = key.substr(0, key.indexOf(':'));
                let propName = key.substr(key.indexOf(':') + 1);

                if(!doc[baseKey]){
                  doc[baseKey] = [];
                }

                if(propName && propName.startsWith(':')){
                  propName = '';
                }

                if(doc[key] !== 'DELETE' && `${doc[key]}`.trim()){
                  val = `${propName ? propName + ':' : ''}${doc[key]}`;
                }

                if(val){
                  doc[baseKey].push(val);
                }
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
    // reads the csv file in as a json object
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
    // reads meta from the files listed in the csv
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
    // make an asynchronus request 
    readMetaAsync(channel, filePath, indx){
      ipcRenderer.send(channel, filePath, indx);
    },
    // reset app to default state
    reset(){
      Object.assign(this.$data, getInitialData());
    },
    // toggles display of file details
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
    // show and error message
    showErrorMessage(title, err){
      ipcRenderer.send('show-error', title, err);
    },
    // modifies the metadata of all files in the list
    updateFiles(){
      let data;
      let filePath;
      let status;
      let len = Object.keys(this.data).length;
      let arr = Object.assign({}, this.data);
      let val;

      for(let i = 0; i < len; i++){
        data = {};
        filePath = arr[i]['zzz_fullPath'];
        processedStatus = arr[i]['zzz_processedStatus'];

        if(!filePath || processedStatus === false){ 
          this.filesSkipped++;
          this.csvFilesSeen++;
          continue; 
        }

        Object.keys(arr[i]).forEach((key) => {
          val = arr[i][key];
          if((typeof val == 'string' || val instanceof String) && val === 'DELETE'){
            data[key] = ' ';
          }else if(val && !key.toLowerCase().startsWith('zzz_')){
            data[key] = val;
          }
        });

        this.updateMeta(filePath, data, i);
      }
    },
    // update the status flag of items that were reviewed and updated or skipped
    updateListItemStatus(indx, updateStatus){
      let itemToUpdate = Object.assign({}, this.data[indx]);
      itemToUpdate.zzz_processedStatus = updateStatus;
      $vm.$set(this.data, indx, itemToUpdate);
      if(updateStatus){
        this.csvFilesProcessed++; 
      }else{
        this.filesSkipped++;
      }

      this.csvFilesSeen++;
    },
    // write to file with exiftool
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
          value: this.filesSkipped
        }
      };
    },
    isDone: function(){
      let isDone = this.conversionStarted && this.csvFilesSeen && this.csvFilesSeen === this.csvFileCount;

      if(isDone && this.errorLog.length){
        ipcRenderer.send('log-errors', this.errorLog);
      }

      return isDone;
    }
  }
});


// electron process event listeners
// once file is read, check it and update the array
ipcRenderer.on('exiftool-read-reply', (event, res, indx) => {
  let result;
  let keys;
  let key;
  let backup = {};
  let oldData = {};

  if(res.error && indx !== -1 || indx >= 0){
    // get the data for all files
    result = Object.assign({}, $vm.data);

    if(res.error){
      // update problem file with error info
      result[indx]['zzz_path'] = res.error;
      result[indx]['zzz_icon'] = $vm.getIcon(null);
      $vm.errorLog.push(res.error);
    }else{
      // if pdf, mark as valid
      if(result[indx]['zzz_extension'] === 'pdf'){
        $vm.validFileCount++;
      }

      // get keys and remove zzz keys
      keys = Object.keys(result[indx]);
      keys = keys.filter((key) => {
        return !key.startsWith('zzz_');
      });

      // for all keys in stored data...
      // (if the value is not present it should be set to DELETE in the backup file)
      for(let i = 0, len = keys.length; i < len; i++){

        key = keys[i];

        // if the file to be edited has the key...
        if(res.data[0].hasOwnProperty(key)){

          // ... and the value is an array...
          if(Array.isArray(res.data[0][key])){
            let arr = res.data[0][key];
            let num = 1;

            // loop through each array item and parse out the values for the backup file
            for(let i = 0, len = arr.length; i < len; i++){
              
              // Case 1 = Tags::1: "ROBOTS:FOLLOW", Tags::2: "FOO:BAR" => Tags['ROBOTS:FOLLOW', 'FOO:BAR']
              // Case 2 = Tags:ROBOTS: "FOLLOW", Tags:FOO: "BAR" => Tags['ROBOTS:FOLLOW', 'FOO:BAR']
              let k = arr[i].substr(0, arr[i].indexOf(':'));
              let v = arr[i].substr(arr[i].indexOf(':') + 1);
              
              if(v && v.startsWith(':')){
                // case 1
                backup[`${key}::${num}`] = k;
                num++;
              }else{
                // case 2
                backup[`${key}:${k}`] = v ? v : 'DELETE';
              }
            }

            // save the file to be edited array data
            oldData[key] = res.data[0][key];
          }else{
            // save the file to be edited non-array data and back it up
            oldData[key] = res.data[0][key];
            backup[key] = `${res.data[0][key]}`.trim() ? res.data[0][key] : 'DELETE';
          }
        }else{
          backup[key] = 'DELETE';
        }
      }
    }

    // add the file to be edited data to our file data
    result[indx]['zzz_original'] = oldData;
    $vm.data = result;

    // push the file to be edited data to our file data's revertFile property array
    $vm.revertFile.push( Object.assign({}, backup, { Path: result[indx]['zzz_path'] }) );
    $vm.importCount++;
  }else if(res.error){
    // there was an error, show it
    $vm.showErrorMessage('Read Reply Error', res.error);
  }else{
    // this was a test, log it
    console.log(res.data[0]);
  }
});

// once a file has been written update the status regarding wether the operation was successful
ipcRenderer.on('exiftool-write-reply', (event, res, indx) => {
  if(res.error && res.error !== '1 image files updated'){
    //$vm.showErrorMessage('Write Reply Error', res.error);
    $vm.errorLog.push(res.error);
    $vm.updateListItemStatus(indx, false);
  }else{
    $vm.updateListItemStatus(indx, true);
  }
});

// test read file
ipcRenderer.on('test-read-file', (event) => {
  console.log('Test file being read...');
  $vm.readMetaAsync('exiftool-read', './test/test.pdf', -1);
});

// if the backup was successful then update the files
ipcRenderer.on('save-backup-reply', (event, res) => {
  if(!res.error && res){
    $vm.updateFiles();
  }
});
