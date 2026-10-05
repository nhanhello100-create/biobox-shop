const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const SELLER_PIN = process.env.SELLER_PIN || '2468';
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DB_FILE = path.join(ROOT, 'data', 'db.json');

function loadDB(){
  try { return JSON.parse(fs.readFileSync(DB_FILE,'utf8')); }
  catch { return {orders:[], messages:[]}; }
}
function saveDB(db){
  fs.writeFileSync(DB_FILE, JSON.stringify(db,null,2));
}
function id(){ return crypto.randomUUID(); }
function json(res, code, data){
  const body = JSON.stringify(data);
  res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});
  res.end(body);
}
function body(req){
  return new Promise((resolve,reject)=>{
    let s='';
    req.on('data',c=>{s+=c; if(s.length>2e6) req.destroy();});
    req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch(e){reject(e)}});
    req.on('error',reject);
  });
}
function sellerOK(req){ return req.headers['x-seller-pin'] === SELLER_PIN; }
const products = [
 {id:'tray', name:'BIOBOX TRAY', subtitle:'Khay nông sản sinh học', price:12000, image:'/assets/tray.jpg', tags:['Nông sản','Đồ khô','Quà tặng']},
 {id:'box', name:'BIOBOX BOX', subtitle:'Hộp quà sinh học', price:18000, image:'/assets/box.jpg', tags:['Quà tặng','Hộp sản phẩm']},
 {id:'custom', name:'BIOBOX CUSTOM', subtitle:'Khay/hộp thiết kế theo yêu cầu', price:null, image:'/assets/custom.jpg', tags:['Theo yêu cầu','Logo thương hiệu']}
];

function serveFile(res, file){
  const ext = path.extname(file).toLowerCase();
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
  fs.readFile(file,(err,data)=>{ if(err){res.writeHead(404);return res.end('Not found')} res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':ext.match(/jpg|png|css|js/) ? 'public,max-age=3600':'no-cache'});res.end(data);});
}

const server=http.createServer(async (req,res)=>{
  const u=new URL(req.url,`http://${req.headers.host}`);
  try{
    if(req.method==='GET' && u.pathname==='/api/products') return json(res,200,products);
    if(req.method==='POST' && u.pathname==='/api/orders'){
      const b=await body(req);
      if(!b.customer?.name || !b.customer?.phone || !b.customer?.address || !Array.isArray(b.items) || !b.items.length) return json(res,400,{error:'Thiếu thông tin đặt hàng'});
      const db=loadDB();
      const order={id:id(),createdAt:new Date().toISOString(),status:'Mới',customer:b.customer,items:b.items,total:Number(b.total||0),note:String(b.note||''),conversationId:b.conversationId||id()};
      db.orders.unshift(order); saveDB(db);
      db.messages.push({id:id(),conversationId:order.conversationId,sender:'system',text:`Đơn ${order.id.slice(0,8).toUpperCase()} đã được tạo. BIOBOX sẽ phản hồi sớm.`,createdAt:new Date().toISOString()}); saveDB(db);
      return json(res,201,order);
    }
    if(req.method==='GET' && u.pathname==='/api/orders'){
      if(!sellerOK(req)) return json(res,401,{error:'Không có quyền'});
      return json(res,200,loadDB().orders);
    }
    if(req.method==='PATCH' && u.pathname.startsWith('/api/orders/')){
      if(!sellerOK(req)) return json(res,401,{error:'Không có quyền'});
      const oid=u.pathname.split('/').pop(); const b=await body(req); const db=loadDB(); const o=db.orders.find(x=>x.id===oid); if(!o)return json(res,404,{error:'Không tìm thấy đơn'}); o.status=b.status||o.status; saveDB(db); return json(res,200,o);
    }
    if(req.method==='GET' && u.pathname==='/api/messages'){
      const cid=u.searchParams.get('conversationId'); if(!cid) return json(res,400,{error:'Thiếu conversationId'}); return json(res,200,loadDB().messages.filter(m=>m.conversationId===cid));
    }
    if(req.method==='GET' && u.pathname==='/api/conversations'){
      if(!sellerOK(req)) return json(res,401,{error:'Không có quyền'});
      const db=loadDB(); const map={}; db.orders.forEach(o=>{map[o.conversationId]={conversationId:o.conversationId,customer:o.customer,order:o,lastMessage:null}}); db.messages.forEach(m=>{if(map[m.conversationId])map[m.conversationId].lastMessage=m}); return json(res,200,Object.values(map));
    }
    if(req.method==='POST' && u.pathname==='/api/messages'){
      const b=await body(req); if(!b.conversationId||!b.text) return json(res,400,{error:'Thiếu nội dung'}); if(b.sender==='seller'&&!sellerOK(req)) return json(res,401,{error:'Không có quyền'});
      const db=loadDB(); const m={id:id(),conversationId:b.conversationId,sender:b.sender==='seller'?'seller':'customer',text:String(b.text).slice(0,2000),createdAt:new Date().toISOString()}; db.messages.push(m); saveDB(db); return json(res,201,m);
    }
    if(req.method==='GET'){
      let file;
      if(u.pathname==='/') file=path.join(PUBLIC,'customer.html');
      else if(u.pathname==='/seller') file=path.join(PUBLIC,'seller.html');
      else file=path.join(PUBLIC,decodeURIComponent(u.pathname));
      if(!file.startsWith(PUBLIC)) return res.writeHead(403).end();
      return serveFile(res,file);
    }
    res.writeHead(405);res.end('Method not allowed');
  }catch(e){ console.error(e); json(res,500,{error:'Lỗi máy chủ'}); }
});
server.listen(PORT,()=>console.log(`BIOBOX running on http://localhost:${PORT}`));
