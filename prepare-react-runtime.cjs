const fs=require('node:fs');const path=require('node:path');
for(const folder of ['cmaps','standard_fonts','wasm']){const source=path.join(__dirname,'node_modules','pdfjs-dist',folder),target=path.join(__dirname,'public','pdf-assets',folder);fs.mkdirSync(target,{recursive:true});fs.cpSync(source,target,{recursive:true});}
