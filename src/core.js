'use strict';
/* =========================================================
 * core.js — ข้อมูล (Store) และสูตรคำนวณต้นทุน/กำไรทั้งหมด
 * ข้อมูลเก็บใน localStorage ของเบราว์เซอร์ (ไม่ต้องมีเซิร์ฟเวอร์)
 * ========================================================= */

/* ---------- Utilities ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const round2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;
const fmt = (n, d = 2) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d });
const baht = (n) => (num(n) < -0.004 ? '-฿' : '฿') + fmt(Math.abs(num(n)));
const baht0 = (n) => (num(n) < -0.5 ? '-฿' : '฿') + fmt(Math.abs(num(n)), 0);
/** ราคาต่อหน่วยเล็ก (เช่น ต่อกรัม) แสดงทศนิยม 4 ตำแหน่งเมื่อต่ำกว่า 1 บาท */
const bahtU = (n) => (num(n) && Math.abs(num(n)) < 1 ? '฿' + fmt(n, 4) : baht(n));
const pct = (n) => fmt(n, 1) + '%';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const byId = (arr, id) => arr.find((x) => x.id === id);

const toISO = (d) => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
const today = () => toISO(new Date());
const nowTime = () => new Date().toTimeString().slice(0, 5);
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return toISO(d); };
const monthStart = (iso) => iso.slice(0, 8) + '01';
const monthEnd = (iso) => { const d = new Date(iso.slice(0, 8) + '01T00:00:00'); d.setMonth(d.getMonth() + 1); d.setDate(0); return toISO(d); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000) + 1;
const thDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
const thDay = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
const thMonth = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

/* ---------- Store ---------- */
const DB_KEY = 'thai-delivery-rms-v1';
const VAT = 0.07;

function defaultData() {
  return {
    version: 1,
    settings: {
      shopName: 'ร้านของฉัน',
      dishesPerMonth: 1500, // จำนวนจานที่คาดว่าขายได้ต่อเดือน ใช้ปันส่วนค่าใช้จ่ายรายเดือนเข้าเมนู
      targetFoodCost: 35, // % ต้นทุนอาหารเป้าหมาย
      targetMargin: 20, // % กำไรเป้าหมายหลังหัก GP
    },
    channels: [
      { id: 'walkin', name: 'หน้าร้าน', gp: 0, vatOnGp: false, gpBeforeDiscount: false, active: true },
      { id: 'grab', name: 'GrabFood', gp: 30, vatOnGp: true, gpBeforeDiscount: true, active: true },
      { id: 'lineman', name: 'LINE MAN', gp: 30, vatOnGp: true, gpBeforeDiscount: true, active: true },
      { id: 'shopee', name: 'ShopeeFood', gp: 30, vatOnGp: true, gpBeforeDiscount: true, active: true },
      { id: 'robinhood', name: 'Robinhood', gp: 0, vatOnGp: false, gpBeforeDiscount: true, active: true },
    ],
    ingredients: [],
    preps: [], // ส่วนผสมทำเอง (สูตรย่อย) เช่น ซอสกะเพรา น้ำจิ้ม หมูหมัก
    productions: [], // บันทึกการทำส่วนผสม (ตัดวัตถุดิบ เพิ่มสต็อกส่วนผสม)
    purchases: [],
    expenses: [],
    menus: [],
    orders: [],
    ads: [],
  };
}

let DB;
const Store = {
  load() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(DB_KEY)); } catch (e) { data = null; }
    DB = Store.normalize(data);
  },
  normalize(data) {
    const def = defaultData();
    if (!data || typeof data !== 'object') return def;
    for (const k of Object.keys(def)) if (data[k] == null) data[k] = def[k];
    data.settings = { ...def.settings, ...data.settings };
    return data;
  },
  save() {
    // โหมดออนไลน์: ส่งเฉพาะส่วนที่เปลี่ยนขึ้น Firebase (Firestore มีแคชออฟไลน์ของตัวเอง)
    if (typeof Sync !== 'undefined' && Sync.cfg) { if (Sync.active) Sync.push(); return true; }
    try { localStorage.setItem(DB_KEY, JSON.stringify(DB)); return true; }
    catch (e) { if (typeof toast === 'function') toast('บันทึกไม่สำเร็จ: พื้นที่จัดเก็บของเบราว์เซอร์เต็ม', 'error'); return false; }
  },
  replace(data) { DB = Store.normalize(data); Store.save(); },
  reset() { DB = defaultData(); Store.save(); },
};

/* ---------- Cost calculations ---------- */

/** ต้นทุนต่อ 1 หน่วยใช้งาน (เช่น ต่อกรัม) หลังหัก % สูญเสีย (yield) */
function ingUnitCost(ing) {
  const usable = num(ing.packSize) * (num(ing.yield || 100) / 100);
  return usable > 0 ? num(ing.packPrice) / usable : 0;
}

/** ค่าใช้จ่ายต่อ 1 หน่วยที่ใส่ในเมนู: แบบต่อชิ้น = ราคาต่อชิ้น, แบบรายเดือน = ปันส่วนต่อจาน */
function expUnitCost(exp) {
  if (exp.type === 'monthly') {
    const d = num(DB.settings.dishesPerMonth);
    return d > 0 ? num(exp.amount) / d : 0;
  }
  return num(exp.amount);
}

/* ---------- ส่วนผสมทำเอง (สูตรย่อย) ---------- */
const PREP_MAX_DEPTH = 6; // กันวนซ้ำไม่รู้จบ กรณีสูตรอ้างถึงกันเอง
const prepById = (id) => byId(DB.preps || [], id);
/** วัตถุดิบ หรือ ส่วนผสมทำเอง ตาม id (ใช้ในสูตรเมนู/สูตรส่วนผสม) */
const stockItemById = (id) => byId(DB.ingredients, id) || prepById(id);

/** ต้นทุนต่อ 1 หน่วยของรายการในสูตร (วัตถุดิบ หรือ ส่วนผสมทำเอง) */
function itemUnitCost(id, depth = 0) {
  const i = byId(DB.ingredients, id);
  if (i) return ingUnitCost(i);
  const p = prepById(id);
  return p ? prepUnitCost(p, depth) : 0;
}
/** ต้นทุนการทำ 1 ครั้ง (1 สูตร) */
function prepBatchCost(p, depth = 0) {
  if (depth > PREP_MAX_DEPTH) return 0;
  return (p.items || []).reduce((s, r) => s + itemUnitCost(r.id, depth + 1) * num(r.qty), 0);
}
/** ต้นทุนต่อ 1 หน่วยของส่วนผสม = ต้นทุนทั้งสูตร ÷ ปริมาณที่ได้ */
function prepUnitCost(p, depth = 0) {
  const y = num(p.yieldQty);
  return y > 0 ? prepBatchCost(p, depth) / y : 0;
}
/** สูตร p ใช้ targetId อยู่ (ทั้งทางตรงและทางอ้อม) หรือไม่ */
function prepUses(p, targetId, depth = 0) {
  if (!p || depth > PREP_MAX_DEPTH) return false;
  return (p.items || []).some((r) => r.id === targetId || prepUses(prepById(r.id), targetId, depth + 1));
}
/**
 * แปลงสูตรเป็นรายการตัดสต็อก: วัตถุดิบตัดตรงๆ, ส่วนผสมที่ติดตามสต็อกตัดที่ตัวส่วนผสม,
 * ส่วนผสมที่ไม่ติดตามสต็อกแตกเป็นวัตถุดิบตามสัดส่วนที่ใช้
 */
function stockUsage(rows, mult = 1, depth = 0, out = []) {
  if (depth > PREP_MAX_DEPTH) return out;
  (rows || []).forEach((r) => {
    const q = num(r.qty) * mult;
    if (!q) return;
    if (byId(DB.ingredients, r.id)) { out.push({ id: r.id, qty: q }); return; }
    const p = prepById(r.id);
    if (!p) return;
    if (p.trackStock || !(num(p.yieldQty) > 0)) out.push({ id: p.id, qty: q });
    else stockUsage(p.items, q / num(p.yieldQty), depth + 1, out);
  });
  return out;
}
/** ตัด/คืนสต็อกตามรายการ usage (sign = 1 ตัด, -1 คืน) */
function applyUsage(usage, sign, mult = 1) {
  (usage || []).forEach((u) => {
    const i = stockItemById(u.id);
    if (i && i.trackStock) i.stock = Math.round((num(i.stock) - sign * num(u.qty) * mult) * 10000) / 10000;
  });
}

function fixedMonthlyTotal() {
  return DB.expenses.filter((e) => e.type === 'monthly').reduce((s, e) => s + num(e.amount), 0);
}
/** ค่าใช้จ่ายคงที่เฉลี่ยต่อวัน (รายเดือน × 12 ÷ 365) */
function dailyFixed() { return fixedMonthlyTotal() * 12 / 365; }

/** สรุปต้นทุนของเมนู */
function menuCost(m) {
  let ing = 0, unitExp = 0, overhead = 0;
  const lines = [];
  (m.ingredients || []).forEach((r) => {
    const i = stockItemById(r.id);
    if (!i) return;
    const isPrep = !byId(DB.ingredients, r.id);
    const c = itemUnitCost(r.id) * num(r.qty);
    ing += c;
    lines.push({ kind: isPrep ? 'prep' : 'ing', name: i.name, qty: num(r.qty), unit: i.unit, cost: c });
  });
  (m.expenses || []).forEach((r) => {
    const e = byId(DB.expenses, r.id);
    if (!e) return;
    const c = expUnitCost(e) * num(r.qty);
    if (e.type === 'monthly') overhead += c; else unitExp += c;
    lines.push({ kind: e.type === 'monthly' ? 'overhead' : 'exp', name: e.name, qty: num(r.qty), unit: e.type === 'monthly' ? 'จาน' : (e.unit || 'หน่วย'), cost: c });
  });
  return { ing, unitExp, overhead, variable: ing + unitExp, full: ing + unitExp + overhead, lines };
}

function channelById(id) { return byId(DB.channels, id) || { id, name: '(ช่องทางถูกลบ)', gp: 0, vatOnGp: false, gpBeforeDiscount: false }; }
/** อัตรา GP จริง (รวม VAT ถ้ามี) เป็นทศนิยม เช่น 0.321 */
function gpRateEff(ch) { return num(ch.gp) / 100 * (ch.vatOnGp ? 1 + VAT : 1); }
/** ราคาขายของเมนูในช่องทางนั้น (ถ้าไม่ได้ตั้งราคาเฉพาะช่องทาง ใช้ราคาหลัก) */
function menuPrice(m, chId) {
  const p = m.channelPrices ? num(m.channelPrices[chId]) : 0;
  return p > 0 ? p : num(m.price);
}

/** วิเคราะห์ราคาเมนูในแต่ละช่องทาง */
function menuChannelAnalysis(m, ch, cost) {
  cost = cost || menuCost(m);
  const price = menuPrice(m, ch.id);
  const gp = price * gpRateEff(ch);
  const net = price - gp;
  const profit = net - cost.variable;
  const profitFull = net - cost.full;
  // ราคาแนะนำ: ให้ (ราคา - GP - ต้นทุนรวม) = ราคา × กำไรเป้าหมาย
  const denom = 1 - gpRateEff(ch) - num(DB.settings.targetMargin) / 100;
  const suggested = denom > 0 ? cost.full / denom : 0;
  return {
    price, gp, net, profit, profitFull, suggested,
    foodCostPct: price > 0 ? cost.variable / price * 100 : 0,
    marginPct: price > 0 ? profitFull / price * 100 : 0,
  };
}

/** คำนวณตัวเลขทั้งหมดของ 1 ออเดอร์ (ใช้ค่าที่ snapshot ไว้ตอนบันทึก) */
function orderCalc(o) {
  const subtotal = o.items.reduce((s, it) => s + num(it.price) * num(it.qty), 0);
  const qty = o.items.reduce((s, it) => s + num(it.qty), 0);
  let disc = o.discountType === 'pct' ? subtotal * num(o.discountValue) / 100 : num(o.discountValue);
  disc = Math.min(Math.max(disc, 0), subtotal);
  const shopDisc = o.discountBy === 'platform' ? 0 : disc;
  const platDisc = disc - shopDisc;
  const gpBase = o.gpBeforeDiscount ? subtotal : subtotal - shopDisc;
  const gp = gpBase * num(o.gp) / 100 * (o.vatOnGp ? 1 + VAT : 1);
  const netRevenue = subtotal - shopDisc - gp;
  const varCost = o.items.reduce((s, it) => s + num(it.varCost) * num(it.qty), 0);
  const extra = num(o.extraCost);
  const profit = netRevenue - varCost - extra;
  return { subtotal, qty, disc, shopDisc, platDisc, customerPays: subtotal - disc, gpBase, gp, netRevenue, varCost, extra, profit };
}

/** สร้าง snapshot ของรายการในออเดอร์ (ราคา ต้นทุน วัตถุดิบที่ใช้) */
function snapshotItem(menuId, qty, price) {
  const m = byId(DB.menus, menuId);
  const c = m ? menuCost(m) : { variable: 0, full: 0 };
  return {
    menuId, name: m ? m.name : '(เมนูถูกลบ)', qty: num(qty), price: num(price),
    varCost: round2(c.variable), fullCost: round2(c.full),
    usage: m ? stockUsage(m.ingredients) : [],
  };
}

/** ตัด/คืนสต็อกวัตถุดิบตามออเดอร์ (sign = 1 ตัด, -1 คืน) */
function applyStock(order, sign) {
  order.items.forEach((it) => applyUsage(it.usage, sign, num(it.qty)));
}

/** รวมข้อมูลรายงานช่วงวันที่ from..to */
function aggregate(from, to, { includeFixed = true } = {}) {
  const blank = () => ({ orders: 0, qty: 0, subtotal: 0, disc: 0, shopDisc: 0, platDisc: 0, gp: 0, netRevenue: 0, varCost: 0, extra: 0, profit: 0, ads: 0 });
  const add = (t, c) => { for (const k of ['qty', 'subtotal', 'disc', 'shopDisc', 'platDisc', 'gp', 'netRevenue', 'varCost', 'extra', 'profit']) t[k] += c[k]; t.orders += 1; };
  const nDays = Math.max(0, daysBetween(from, to));
  const fixedPerDay = includeFixed ? dailyFixed() : 0;

  const days = {};
  for (let i = 0; i < Math.min(nDays, 1000); i++) { const d = addDays(from, i); days[d] = { date: d, ...blank() }; }
  const channels = {};
  const menus = {};
  const total = blank();

  DB.orders.forEach((o) => {
    if (o.date < from || o.date > to) return;
    const c = orderCalc(o);
    add(total, c);
    if (days[o.date]) add(days[o.date], c);
    channels[o.channelId] = channels[o.channelId] || blank();
    add(channels[o.channelId], c);
    // แบ่ง GP/ส่วนลดเข้าแต่ละเมนูตามสัดส่วนยอดขาย
    o.items.forEach((it) => {
      const sales = num(it.price) * num(it.qty);
      const share = c.subtotal > 0 ? sales / c.subtotal : 0;
      const key = it.menuId;
      const m = menus[key] = menus[key] || { menuId: key, name: (byId(DB.menus, key) || it).name, qty: 0, sales: 0, net: 0, varCost: 0, contribution: 0 };
      m.qty += num(it.qty);
      m.sales += sales;
      m.net += c.netRevenue * share;
      m.varCost += num(it.varCost) * num(it.qty);
      m.contribution = m.net - m.varCost;
    });
  });

  DB.ads.forEach((a) => {
    if (a.date < from || a.date > to) return;
    total.ads += num(a.amount);
    if (days[a.date]) days[a.date].ads += num(a.amount);
    channels[a.channelId] = channels[a.channelId] || blank();
    channels[a.channelId].ads += num(a.amount);
  });

  Object.values(days).forEach((d) => { d.fixed = fixedPerDay; d.net = d.profit - d.ads - d.fixed; });
  Object.values(channels).forEach((c) => { c.net = c.profit - c.ads; });
  total.fixed = fixedPerDay * nDays;
  total.net = total.profit - total.ads - total.fixed;
  total.nDays = nDays;

  return {
    total,
    days: Object.values(days),
    channels: Object.entries(channels).map(([id, v]) => ({ id, name: channelById(id).name, ...v })).sort((a, b) => b.subtotal - a.subtotal),
    menus: Object.values(menus).sort((a, b) => b.qty - a.qty),
  };
}

/** จุดคุ้มทุน: ต้องขายกี่ออเดอร์/วันถึงจะไม่ขาดทุน (อิงกำไรต่อออเดอร์เฉลี่ยหลังหักโฆษณา) */
function breakEven(agg) {
  const t = agg.total;
  if (!t.orders) return null;
  const perOrder = (t.profit - t.ads) / t.orders;
  const fixed = dailyFixed();
  return { perOrder, fixed, ordersPerDay: perOrder > 0 ? fixed / perOrder : Infinity, actualPerDay: t.orders / Math.max(1, t.nDays) };
}

/** สร้างไฟล์ CSV (มี BOM เพื่อให้ Excel อ่านภาษาไทยได้) */
function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function toCSV(rows) {
  const cell = (v) => { let s = String(v ?? ''); if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\n');
}
