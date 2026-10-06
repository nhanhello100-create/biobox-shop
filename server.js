const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const SELLER_PIN = process.env.SELLER_PIN || '2468';

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

function emptyDB() {
  return {
    orders: [],
    messages: [],
    conversations: []
  };
}

function loadDB() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db.orders = Array.isArray(db.orders) ? db.orders : [];
    db.messages = Array.isArray(db.messages) ? db.messages : [];
    db.conversations = Array.isArray(db.conversations) ? db.conversations : [];
    return db;
  } catch {
    return emptyDB();
  }
}

function saveDB(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function id() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(body);
}

function body(req) {
  return new Promise((resolve, reject) => {
    let s = '';

    req.on('data', chunk => {
      s += chunk;
      if (s.length > 2e6) req.destroy();
    });

    req.on('end', () => {
      try {
        resolve(s ? JSON.parse(s) : {});
      } catch (e) {
        reject(e);
      }
    });

    req.on('error', reject);
  });
}

function sellerOK(req) {
  return req.headers['x-seller-pin'] === SELLER_PIN;
}

const products = [
  {
    id: 'tray',
    name: 'BIOBOX TRAY',
    subtitle: 'Khay nông sản sinh học',
    price: 12000,
    image: '/assets/tray.jpg',
    tags: ['Nông sản', 'Đồ khô', 'Quà tặng']
  },
  {
    id: 'box',
    name: 'BIOBOX BOX',
    subtitle: 'Hộp quà sinh học',
    price: 18000,
    image: '/assets/box.jpg',
    tags: ['Quà tặng', 'Hộp sản phẩm']
  },
  {
    id: 'custom',
    name: 'BIOBOX CUSTOM',
    subtitle: 'Khay/hộp thiết kế theo yêu cầu',
    price: null,
    image: '/assets/custom.jpg',
    tags: ['Theo yêu cầu', 'Logo thương hiệu']
  }
];

function serveFile(res, file) {
  const ext = path.extname(file).toLowerCase();

  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8'
  };

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }

    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Cache-Control': /jpg|jpeg|png|css|js/.test(ext)
        ? 'public,max-age=3600'
        : 'no-cache'
    });

    res.end(data);
  });
}

function getConversation(db, conversationId) {
  return db.conversations.find(c => c.conversationId === conversationId);
}

function ensureConversation(db, conversationId, customer = {}) {
  let c = getConversation(db, conversationId);

  if (!c) {
    c = {
      conversationId,
      customer: {
        name: String(customer.name || 'Khách hàng'),
        phone: String(customer.phone || ''),
        address: String(customer.address || '')
      },
      createdAt: now(),
      updatedAt: now(),
      readBySellerAt: null,
      readByCustomerAt: null
    };

    db.conversations.unshift(c);
  } else {
    c.updatedAt = now();

    if (customer.name) c.customer.name = String(customer.name);
    if (customer.phone) c.customer.phone = String(customer.phone);
    if (customer.address) c.customer.address = String(customer.address);
  }

  return c;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);

  try {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Seller-Pin'
      });
      return res.end();
    }

    // PRODUCTS
    if (req.method === 'GET' && u.pathname === '/api/products') {
      return json(res, 200, products);
    }

    // CREATE / GET CONVERSATION
    if (req.method === 'POST' && u.pathname === '/api/conversations') {
      const b = await body(req);

      const db = loadDB();
      const conversationId = String(b.conversationId || id());

      const c = ensureConversation(db, conversationId, {
        name: b.name,
        phone: b.phone,
        address: b.address
      });

      saveDB(db);
      return json(res, 201, c);
    }

    if (req.method === 'GET' && u.pathname === '/api/conversations') {
      if (!sellerOK(req)) {
        return json(res, 401, { error: 'Không có quyền' });
      }

      const db = loadDB();

      const list = db.conversations
        .map(c => {
          const msgs = db.messages
            .filter(m => m.conversationId === c.conversationId)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

          const lastMessage = msgs[msgs.length - 1] || null;

          const unreadCount = msgs.filter(m =>
            m.sender === 'customer' &&
            (!c.readBySellerAt || new Date(m.createdAt) > new Date(c.readBySellerAt))
          ).length;

          return {
            ...c,
            lastMessage,
            unreadCount
          };
        })
        .sort((a, b) => {
          const da = new Date(a.lastMessage?.createdAt || a.updatedAt);
          const dbb = new Date(b.lastMessage?.createdAt || b.updatedAt);
          return dbb - da;
        });

      return json(res, 200, list);
    }

    // MARK CONVERSATION AS READ
    if (
      req.method === 'PATCH' &&
      u.pathname.startsWith('/api/conversations/') &&
      u.pathname.endsWith('/read')
    ) {
      const parts = u.pathname.split('/');
      const conversationId = parts[3];

      const db = loadDB();
      const c = getConversation(db, conversationId);

      if (!c) {
        return json(res, 404, { error: 'Không tìm thấy cuộc trò chuyện' });
      }

      const b = await body(req);
      const reader = b.reader === 'seller' ? 'seller' : 'customer';

      if (reader === 'seller') {
        if (!sellerOK(req)) {
          return json(res, 401, { error: 'Không có quyền' });
        }
        c.readBySellerAt = now();
      } else {
        c.readByCustomerAt = now();
      }

      c.updatedAt = now();
      saveDB(db);

      return json(res, 200, c);
    }

    // MESSAGES
    if (req.method === 'GET' && u.pathname === '/api/messages') {
      const conversationId = u.searchParams.get('conversationId');

      if (!conversationId) {
        return json(res, 400, { error: 'Thiếu conversationId' });
      }

      const db = loadDB();

      const messages = db.messages
        .filter(m => m.conversationId === conversationId)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      return json(res, 200, messages);
    }

    if (req.method === 'POST' && u.pathname === '/api/messages') {
      const b = await body(req);

      if (!b.conversationId || !b.text) {
        return json(res, 400, { error: 'Thiếu nội dung' });
      }

      const sender = b.sender === 'seller' ? 'seller' : 'customer';

      if (sender === 'seller' && !sellerOK(req)) {
        return json(res, 401, { error: 'Không có quyền' });
      }

      const db = loadDB();

      const conversation = ensureConversation(db, b.conversationId, {
        name: b.customerName,
        phone: b.customerPhone,
        address: b.customerAddress
      });

      const message = {
        id: id(),
        conversationId: b.conversationId,
        sender,
        senderName: sender === 'seller' ? 'biobox.vn' : String(b.customerName || conversation.customer.name || 'Khách hàng'),
        text: String(b.text).slice(0, 2000),
        createdAt: now()
      };

      db.messages.push(message);
      conversation.updatedAt = message.createdAt;

      saveDB(db);

      return json(res, 201, message);
    }

    // ORDERS
    if (req.method === 'POST' && u.pathname === '/api/orders') {
      const b = await body(req);

      if (
        !b.customer?.name ||
        !b.customer?.phone ||
        !b.customer?.address ||
        !Array.isArray(b.items) ||
        !b.items.length
      ) {
        return json(res, 400, { error: 'Thiếu thông tin đặt hàng' });
      }

      const db = loadDB();

      const conversationId = b.conversationId || id();

      ensureConversation(db, conversationId, b.customer);

      const order = {
        id: id(),
        createdAt: now(),
        status: 'Mới',
        customer: b.customer,
        items: b.items,
        total: Number(b.total || 0),
        note: String(b.note || ''),
        conversationId
      };

      db.orders.unshift(order);

      db.messages.push({
        id: id(),
        conversationId,
        sender: 'seller',
        senderName: 'biobox.vn',
        text: `Đơn ${order.id.slice(0, 8).toUpperCase()} đã được tạo. BIOBOX sẽ phản hồi sớm.`,
        createdAt: now()
      });

      saveDB(db);

      return json(res, 201, order);
    }

    if (req.method === 'GET' && u.pathname === '/api/orders') {
      if (!sellerOK(req)) {
        return json(res, 401, { error: 'Không có quyền' });
      }

      return json(res, 200, loadDB().orders);
    }

    if (
      req.method === 'PATCH' &&
      u.pathname.startsWith('/api/orders/')
    ) {
      if (!sellerOK(req)) {
        return json(res, 401, { error: 'Không có quyền' });
      }

      const orderId = u.pathname.split('/').pop();
      const b = await body(req);
      const db = loadDB();

      const order = db.orders.find(x => x.id === orderId);

      if (!order) {
        return json(res, 404, { error: 'Không tìm thấy đơn' });
      }

      order.status = b.status || order.status;
      saveDB(db);

      return json(res, 200, order);
    }

    // STATIC FILES
    if (req.method === 'GET') {
      let file;

      if (u.pathname === '/') {
        file = path.join(PUBLIC, 'customer.html');
      } else if (u.pathname === '/seller') {
        file = path.join(PUBLIC, 'seller.html');
      } else {
        file = path.join(PUBLIC, decodeURIComponent(u.pathname));
      }

      const normalizedPublic = path.resolve(PUBLIC);
      const normalizedFile = path.resolve(file);

      if (
        normalizedFile !== normalizedPublic &&
        !normalizedFile.startsWith(normalizedPublic + path.sep)
      ) {
        res.writeHead(403);
        return res.end();
      }

      return serveFile(res, normalizedFile);
    }

    res.writeHead(405);
    res.end('Method not allowed');

  } catch (e) {
    console.error(e);
    return json(res, 500, {
      error: 'Lỗi máy chủ',
      detail: process.env.NODE_ENV === 'production' ? undefined : e.message
    });
  }
});

server.listen(PORT, () => {
  console.log(`BIOBOX running on http://localhost:${PORT}`);
});
