// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
const exiftool = require('node-exiftool');
const ep = new exiftool.ExiftoolProcess('./exiftool');
const csv = require('csvtojson');
//const axios = require('axios'); == no need for axios



const f = './batch-template.csv';


function readCsvData(npmModule, csvFilePath){
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
}

function processFiles(npmModule, arr){
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

    updateMeta(npmModule, filePath, data);
  }

  console.log('done!!');
}

function updateMeta(npmModule, filePath, data){
  console.log(`Starting ${filePath}...`);

  npmModule
  .open()
  .then(() => npmModule.writeMetadata(filePath, data, ['overwrite_original']))
  .then(() => npmModule.close())
  .catch(console.error);

  console.log('DONE!');

  return true;
}

/*let testString = "Jumoke K Hodari";
let data = {
  Author: testString,
  Creator: testString
};*/


readCsvData(csv, f).then((data) => processFiles(ep, data));

//updateMeta(ep, './pdf-meta-test.pdf', data);






















/*ep
  .open()

  //read
  .then((pid) => console.log('Started exiftool process %s', pid))
  .then(() => ep.readMetadata('./pdf-meta-test.pdf', ['-File:all']))
  .then(console.log, console.error)

  // //update
  // .then(() => console.log('Updating Meta...'), console.error)
  // .then(() => ep.writeMetadata('./pdf-meta-test.pdf', data, ['overwrite_original']))
  // .then(console.log, console.error)

  // //re-read
  // .then(() => ep.readMetadata('./pdf-meta-test.pdf', ['-File:all']))
  // .then(console.log, console.error)

  //close
  .then(() => ep.close())
  .then(console.log, console.error)
  .then(() => console.log('Closed exiftool'), console.error)
  .catch(console.error);*/



