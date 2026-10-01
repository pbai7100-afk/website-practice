const http = require('node:http');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const port = Number(process.env.PORT || 3000);
const password = process.env.ADMIN_PASSWORD || 'practice-only';
const filename = path.join(__dirname, 'data.json');
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(filename)) fs.writeFileSync(filename, JSON.stringify({products:[], inquiries:[]}));
const read = () => JSON.parse(fs.readFileSync(filename, 'utf8'));
const save = x => fs.writeFileSync(filename, JSON.stringify(x, null, 2));
const sessions = new Set();
const send = (res, status, x) => {res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(x));};
const auth = req => sessions.has((req.headers.cookie || '').match(/session=([^;]+)/)?.[1]);
async function input(req) {let s='';for await(const c of req){s+=c;if(s.length>100000)throw Error('请求过大');}return JSON.parse(s||'{}');}
async function imageInput(req) {const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>5*1024*1024)throw Error('图片不能超过 5 MB');parts.push(part);}return Buffer.concat(parts);}
const trim = x => String(x ?? '').trim().slice(0, 1000);
http.createServer(async(req,res)=>{try{
  const u = new URL(req.url,'http://localhost'); const d=read();
  if(req.method==='POST'&&u.pathname==='/api/login'){if((await input(req)).password!==password)return send(res,401,{error:'密码错误'});const token=crypto.randomBytes(32).toString('hex');sessions.add(token);res.setHeader('Set-Cookie','session='+token+'; HttpOnly; SameSite=Lax; Path=/');return send(res,200,{ok:true});}
  if(req.method==='GET'&&u.pathname==='/api/products')return send(res,200,d.products.filter(x=>x.status==='published'));
  if(req.method==='POST'&&u.pathname==='/api/inquiries'){const x=await input(req);if(!trim(x.name)||!trim(x.contact)||!d.products.some(p=>p.id===x.productId&&p.status==='published'))return send(res,400,{error:'请填写姓名、联系方式并选择产品'});d.inquiries.push({id:crypto.randomUUID(),name:trim(x.name),contact:trim(x.contact),message:trim(x.message),productId:x.productId});save(d);return send(res,201,{ok:true});}
  if(req.method==='POST'&&u.pathname==='/api/upload'){if(!auth(req))return send(res,401,{error:'请先登录'});if(req.headers['content-type']!=='image/jpeg')return send(res,400,{error:'请选择 JPG 图片'});const bytes=await imageInput(req);if(bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)return send(res,400,{error:'文件不是有效 JPG'});fs.mkdirSync(uploadDir,{recursive:true});const name=crypto.randomUUID()+'.jpg';fs.writeFileSync(path.join(uploadDir,name),bytes);return send(res,201,{url:'/uploads/'+name});}
  if(u.pathname.startsWith('/api/admin/')){if(!auth(req))return send(res,401,{error:'请先登录'});if(req.method==='GET'&&u.pathname==='/api/admin/inquiries')return send(res,200,d.inquiries);if(req.method==='POST'&&u.pathname==='/api/admin/products'){const x=await input(req);if(!trim(x.name))return send(res,400,{error:'产品名称必填'});const p={id:crypto.randomUUID(),name:trim(x.name),summary:trim(x.summary),price:trim(x.price),industry:trim(x.industry),specs:trim(x.specs),image:trim(x.image),status:'draft'};d.products.push(p);save(d);return send(res,201,p);}const m=u.pathname.match(new RegExp(' ^/api/admin/products/([^/]+)$'.trim()));if(m){const i=d.products.findIndex(x=>x.id===m[1]);if(i<0)return send(res,404,{error:'找不到产品'});if(req.method==='DELETE'){d.products.splice(i,1);save(d);return send(res,200,{ok:true});}if(req.method==='PUT'){const x=await input(req);if(!trim(x.name))return send(res,400,{error:'产品名称必填'});d.products[i]={...d.products[i],name:trim(x.name),summary:trim(x.summary),price:trim(x.price),industry:trim(x.industry),specs:trim(x.specs),image:trim(x.image),status:x.status==='published'?'published':'draft'};save(d);return send(res,200,d.products[i]);}}}
  if(req.method!=='GET')return send(res,404,{error:'路径不存在'});if(u.pathname.startsWith("/uploads/") && path.basename(u.pathname)===u.pathname.slice(9) && u.pathname.endsWith(".jpg")){const file=path.join(uploadDir,path.basename(u.pathname));if(!fs.existsSync(file))return send(res,404,{error:'图片不存在'});res.writeHead(200,{'Content-Type':'image/jpeg'});return fs.createReadStream(file).pipe(res);}const file=u.pathname==='/'?'index.html':u.pathname==='/admin'?'admin.html':null;if(!file)return send(res,404,{error:'页面不存在'});res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});fs.createReadStream(path.join(__dirname,'public',file)).pipe(res);
}catch(e){send(res,400,{error:e.message});}}).listen(port,()=>console.log('网站已启动：http://localhost:'+port));


