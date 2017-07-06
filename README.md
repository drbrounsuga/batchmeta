# PDF Metadata Batch Processor

This is an Electron application used to batch edit metadata for PDF files.

The user should select an index csv file that contains case sensitive columns and values for the metada that should be updated (e.g., Title, Description, Creator, ExpirationDate)

If the field contains a `:` then it's treated as an array 

- Tags: "One", Tags: "Two", Tags: "Three" => Tags["One", "Two", "Three"]
- Tags:ROBOTS: "FOLLOW" => Tags['ROBOTS:FOLLOW']

The only column that is required is a `Path` column which should contain a relative path to a PDF file from the index csv. A template can be generated from the File menu.

<img src="http://www.portfolio.bonvon.com/demo/pdf/menu.png" alt="Menu" />

Things to note:
- The application can only edit PDF metada
- The application will edit locked PDF metada
- The application will NOT edit non-PDF files with a PDF extension

<img src="http://www.portfolio.bonvon.com/demo/pdf/list.png" alt="List" />

Before editing metadata, the app will generate a timestamped csv of the current state all PDFs in the index csv which can be used to "undo" the edits. It is still advised to edit copies and not the original files.

## CQ5 Tags
```bash
.data["0"].Title (String)
.data["0"].Description (String)
.data["0"].Tags (Array)
.data["0"].Creator (String)
.data["0"].Contributor (String)
.data["0"].Language (String)
.data["0"]["Rights-x-repair"] (String)
.data["0"].Owner (String)
.data["0"].ExpirationDate (2017:05:19 03:15-05:00) => (5/19/17 3:15 AM)
```


## Resources

- [electron.atom.io](https://electron.atom.io/) - Electron
- [npmjs.com/package/node-exiftool](https://www.npmjs.com/package/node-exiftool) - Exiftool
- [sno.phy.queensu.ca/~phil/exiftool/config.html](http://www.sno.phy.queensu.ca/~phil/exiftool/config.html) - Exiftool Config
- [npmjs.com/package/csv2json](https://www.npmjs.com/package/csv2json) - csv2json
- [vuejs.org](https://vuejs.org/) - Vue


## License

[CC0 1.0 (Public Domain)](LICENSE.md)
