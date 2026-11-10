const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
http.createServer((req,res)=>{
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);return res.end('Não encontrado');}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(data);});
}).listen(Number(process.env.PORT || 4173),'127.0.0.1',()=>console.log('zapCaster em http://127.0.0.1:' + (process.env.PORT || 4173)));


