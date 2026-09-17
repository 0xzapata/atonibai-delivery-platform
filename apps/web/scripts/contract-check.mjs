// Contract check for the shapes the web client depends on (issue #14).
// Dependency-free: runs on plain node >= 18 against a live API + seeded DB.
// Usage: npm run contract [-- http://localhost:3001]
// Read-only: no rows are created, updated, or deleted.
const BASE = process.argv[2] ?? process.env.API_URL ?? 'http://localhost:3001';

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`PASS ${name}`);
  else {
    failures++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function get(path, persona) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'x-persona': persona } });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
}

const health = await get('/health', 'buyer');
check('health ok', health?.ok === true, JSON.stringify(health));

const stores = await get('/api/stores', 'buyer');
check('stores list shape', Array.isArray(stores?.stores) && stores.stores.length > 0);
check(
  'store has id+name',
  typeof stores.stores[0]?.id === 'string' && typeof stores.stores[0]?.name === 'string',
);
const storeId = stores.stores[0].id;

const menu = await get(`/api/stores/${storeId}/menu`, 'buyer');
check('menu categories shape', Array.isArray(menu?.categories) && menu.categories.length > 0);
const firstCat = menu.categories.find((c) => Array.isArray(c.items) && c.items.length > 0);
check('menu category has items array', !!firstCat);
if (firstCat) {
  const it = firstCat.items[0];
  check(
    'menu item has name/price/is_available',
    typeof it?.name === 'string' && typeof it?.price === 'number' && typeof it?.is_available === 'boolean',
    JSON.stringify(it),
  );
}

const OWNER = 'owner1@example.com';
const list = await get(`/api/store/orders?ownerEmail=${OWNER}`, 'store_owner');
check('store orders list shape', Array.isArray(list?.orders) && list.orders.length > 0);
const first = list.orders[0];
check('list row has buyer_name + items_count', typeof first?.buyer_name === 'string' && typeof first?.items_count === 'number', JSON.stringify(first));
const orderId = first.id;

const detail = await get(`/api/store/orders/${orderId}?ownerEmail=${OWNER}`, 'store_owner');
const d = detail?.order;
check('store detail wraps order', !!d && d.id === orderId);
check('detail items shape', Array.isArray(d?.items) && d.items.length > 0 && typeof d.items[0]?.name === 'string' && typeof d.items[0]?.qty === 'number' && typeof d.items[0]?.unit_price === 'number');
check('detail payment shape', !!d?.payment && typeof d.payment?.method === 'string' && typeof d.payment?.status === 'string');
check('detail timeline shape', Array.isArray(d?.timeline) && (d.timeline.length === 0 || typeof d.timeline[0]?.status === 'string'));
check('detail buyer_name', typeof d?.buyer_name === 'string');

const buyerView = await get(`/api/orders/${orderId}`, 'buyer');
check('buyer detail same shape', Array.isArray(buyerView?.order?.items) && !!buyerView?.order?.payment);

const stats = await get(`/api/store/stats?ownerEmail=${OWNER}`, 'store_owner');
check(
  'stats shape',
  typeof stats?.revenue_today === 'number' && typeof stats?.active_count === 'number' && typeof stats?.delivered_today === 'number',
  JSON.stringify(stats),
);

if (failures > 0) {
  console.log(`CONTRACT FAILURES: ${failures}`);
  process.exit(1);
}
console.log('CONTRACT OK');
