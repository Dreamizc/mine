'use strict';
/* =========================================================
 * app.js — หน้าจอและการทำงานของแต่ละโมดูล
 * ========================================================= */

const main = $('#main');
const UI = {
  pos: null,
  ordersTab: 'pos',
  history: { from: today(), to: today(), channel: '' },
  menuFilter: { q: '', cat: '' },
  ingTab: 'list',
  ads: { month: today().slice(0, 7), channel: '' },
  report: { preset: 'month', from: monthStart(today()), to: today(), includeFixed: true },
};

/* ---------- Generic helpers ---------- */
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

const Modal = { onSave: null };
function openModal({ title, body, saveText = 'บันทึก', wide = false, onSave, onMount, hideSave = false }) {
  const dlg = $('#modal');
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = body;
  $('#modalSave').textContent = saveText;
  $('#modalSave').hidden = hideSave;
  dlg.classList.toggle('wide', wide);
  Modal.onSave = onSave;
  if (!dlg.open) dlg.showModal();
  if (onMount) onMount($('#modalBody'));
  const first = $('input:not([type=checkbox]), select', $('#modalBody'));
  if (first) first.focus();
}
function closeModal() { const dlg = $('#modal'); if (dlg.open) dlg.close(); Modal.onSave = null; }
$('#modalForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!Modal.onSave) return closeModal();
  if (Modal.onSave($('#modalBody')) !== false) closeModal();
});
$$('[data-close]').forEach((b) => b.addEventListener('click', closeModal));

const opt = (v, t, sel) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(t)}</option>`;
function fInput(name, label, value, o = {}) {
  const type = o.type || 'text';
  const isNum = type === 'number';
  return `<label class="field ${o.cls || ''}"><span>${label}</span>
    <input class="input ${isNum ? 'num' : ''}" name="${name}" type="${type}" value="${esc(value ?? '')}"
      ${isNum ? `step="${o.step || 'any'}" min="${o.min ?? 0}" inputmode="decimal"` : ''}
      ${o.placeholder ? `placeholder="${esc(o.placeholder)}"` : ''} ${o.required ? 'required' : ''} ${o.list ? `list="${o.list}"` : ''}>
    ${o.hint ? `<small>${o.hint}</small>` : ''}</label>`;
}
function fSelect(name, label, options, value, o = {}) {
  return `<label class="field ${o.cls || ''}"><span>${label}</span>
    <select class="input" name="${name}">${options.map(([v, t]) => opt(v, t, value)).join('')}</select>
    ${o.hint ? `<small>${o.hint}</small>` : ''}</label>`;
}
const fCheck = (name, label, checked, cls = '') => `<label class="check ${cls}"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}> ${label}</label>`;
function readForm(root) {
  const o = {};
  $$('[name]', root).forEach((el) => { o[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
  return o;
}
const datalist = (id, values) => `<datalist id="${id}">${[...new Set(values.filter(Boolean))].map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;
const signCls = (n) => (n < 0 ? 'neg' : n > 0 ? 'pos' : '');
const emptyState = (icon, text, extra = '') => `<div class="empty"><span class="big">${icon}</span>${text}${extra ? `<div class="mt">${extra}</div>` : ''}</div>`;
const activeChannels = () => DB.channels.filter((c) => c.active !== false);
const ingCategories = () => DB.ingredients.map((i) => i.category);
const menuCategories = () => [...new Set(DB.menus.map((m) => m.category).filter(Boolean))];
function commit(msg) { if (Store.save() && msg) toast(msg); render(); }

/* ---------- Tooltip (ใช้ textContent เพื่อความปลอดภัย) ---------- */
const tip = $('#tooltip');
function showTip(e, title, rows) {
  tip.replaceChildren();
  const t = document.createElement('div'); t.className = 't-title'; t.textContent = title; tip.appendChild(t);
  rows.forEach(([label, value, color]) => {
    const r = document.createElement('div'); r.className = 't-row';
    const l = document.createElement('span');
    if (color) { const k = document.createElement('i'); k.className = 't-key'; k.style.background = color; l.appendChild(k); }
    l.appendChild(document.createTextNode(label));
    const v = document.createElement('b'); v.textContent = value;
    if (value.startsWith('-')) v.className = 'neg';
    r.append(l, v); tip.appendChild(r);
  });
  tip.hidden = false;
  const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + w > innerWidth - 8) x = e.clientX - w - pad;
  if (y + h > innerHeight - 8) y = e.clientY - h - pad;
  tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
}
const hideTip = () => { tip.hidden = true; };

/* ---------- Chart: ยอดขาย vs กำไรสุทธิรายวัน ---------- */
const ChartData = {};
function chartSlot(id, days) { ChartData[id] = days; return `<div class="chart-slot" data-chart="${id}"></div>`; }
function drawCharts() {
  $$('.chart-slot', main).forEach((slot) => { slot.innerHTML = barChartSVG(ChartData[slot.dataset.chart], slot.clientWidth || 600); });
}
function barChartSVG(days, W) {
  const H = 260, padL = 52, padR = 8, padT = 12, padB = 28;
  if (!days || !days.length) return '';
  const vals = days.flatMap((d) => [d.subtotal, d.net]);
  let max = Math.max(0, ...vals), min = Math.min(0, ...vals);
  if (max === min) max = min + 100;
  const step = niceStep((max - min) / 4);
  max = Math.ceil(max / step) * step; min = Math.floor(min / step) * step;
  const y = (v) => padT + (max - v) / (max - min) * (H - padT - padB);
  const plotW = W - padL - padR;
  const band = plotW / days.length;
  const gap = 2;
  const bw = Math.max(2, Math.min(18, (band - 6) / 2 - gap / 2));
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="กราฟยอดขายและกำไรสุทธิรายวัน">`;
  for (let v = min; v <= max + 1e-9; v += step) {
    s += `<line class="${Math.abs(v) < 1e-9 ? 'zero-line' : 'grid-line'}" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/>`;
    s += `<text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v, 0)}</text>`;
  }
  const labelEvery = Math.max(1, Math.ceil(days.length / Math.max(1, Math.floor(plotW / 54))));
  const bar = (x, v, cls) => {
    const y0 = y(0), y1 = y(v), h = Math.abs(y0 - y1);
    if (h < 0.5) return '';
    const top = Math.min(y0, y1), r = Math.min(4, bw / 2, h);
    // มุมโค้งเฉพาะปลายแท่ง (ฝั่งที่ห่างจากเส้นฐาน)
    const path = v >= 0
      ? `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${top + h} Z`
      : `M${x},${top} V${top + h - r} Q${x},${top + h} ${x + r},${top + h} H${x + bw - r} Q${x + bw},${top + h} ${x + bw},${top + h - r} V${top} Z`;
    return `<path class="bar ${cls}" d="${path}"/>`;
  };
  days.forEach((d, i) => {
    const cx = padL + band * i + band / 2;
    s += bar(cx - bw - gap / 2, d.subtotal, 's1');
    s += bar(cx + gap / 2, d.net, 's2');
    if (i % labelEvery === 0) s += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${esc(thDay(d.date))}</text>`;
  });
  // พื้นที่รับเมาส์ทั้งคอลัมน์ (วางทับแท่ง เพื่อให้ชี้ตรงไหนของวันก็เห็น tooltip)
  days.forEach((d, i) => { s += `<rect class="hit" data-i="${i}" x="${padL + band * i}" y="${padT}" width="${band}" height="${H - padT - padB}"/>`; });
  s += '</svg>';
  return s;
}
function niceStep(raw) {
  if (raw <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
const chartLegend = () => `<div class="legend"><span><i style="background:var(--series-1)"></i>ยอดขาย</span><span><i style="background:var(--series-2)"></i>กำไรสุทธิ (หลังหักทุกอย่าง)</span></div>`;
main.addEventListener('pointermove', (e) => {
  const hit = e.target.closest('.hit');
  if (!hit) return hideTip();
  const slot = hit.closest('.chart-slot');
  const d = ChartData[slot.dataset.chart][+hit.dataset.i];
  const cs = getComputedStyle(document.documentElement);
  showTip(e, thDate(d.date) + ` · ${d.orders} ออเดอร์`, [
    ['ยอดขาย', baht(d.subtotal), cs.getPropertyValue('--series-1')],
    ['กำไรสุทธิ', baht(d.net), cs.getPropertyValue('--series-2')],
    ['GP', baht(d.gp)], ['ค่าโฆษณา', baht(d.ads)],
  ]);
});
main.addEventListener('pointerleave', hideTip);
let resizeT;
addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(drawCharts, 150); });

/* =========================================================
 * หน้า: ภาพรวม (Dashboard)
 * ========================================================= */
function renderDashboard() {
  const t = today();
  const ms = monthStart(t);
  const aT = aggregate(t, t);
  const aM = aggregate(ms, t);
  const a14 = aggregate(addDays(t, -13), t);
  const be = breakEven(aM);
  const isEmpty = !DB.menus.length && !DB.orders.length;

  const lowStock = DB.ingredients.filter((i) => i.trackStock && num(i.stock) <= num(i.minStock));
  const highCost = DB.menus.filter((m) => m.active !== false && num(m.price) > 0 && menuCost(m).variable / num(m.price) * 100 > num(DB.settings.targetFoodCost));
  const lossMenus = [];
  DB.menus.filter((m) => m.active !== false).forEach((m) => {
    const c = menuCost(m);
    activeChannels().forEach((ch) => { const a = menuChannelAnalysis(m, ch, c); if (a.profitFull < 0) lossMenus.push(`${m.name} (${ch.name})`); });
  });

  const kpi = (label, value, sub = '', cls = '') => `<div class="card kpi"><div class="label">${label}</div><div class="value ${cls}">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;

  main.innerHTML = `
  <div class="page-head">
    <div><h1>ภาพรวมร้าน</h1><p>${esc(new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</p></div>
    <div class="actions"><a class="btn primary lg" href="#orders">＋ รับออเดอร์ใหม่</a></div>
  </div>

  ${isEmpty ? `
  <div class="card">
    <h3>👋 ยินดีต้อนรับ! เริ่มต้นใช้งานใน 4 ขั้นตอน</h3>
    <ol class="small" style="margin:0 0 12px;padding-left:20px;line-height:1.9">
      <li><b>ตั้งค่าช่องทางขาย &amp; GP</b> — ใส่ % GP ของแต่ละแอพ (Grab, LINE MAN ฯลฯ) ที่หน้า <a href="#settings">ตั้งค่า</a></li>
      <li><b>บันทึกวัตถุดิบ</b> — ราคาที่ซื้อ ขนาด และ % ที่ใช้ได้จริง ที่หน้า <a href="#ingredients">วัตถุดิบ</a></li>
      <li><b>บันทึกค่าใช้จ่าย</b> — แพ็กเกจจิ้ง (ต่อชิ้น) และค่าแรง/ค่าไฟ/ค่าเช่า (รายเดือน) ที่หน้า <a href="#expenses">ค่าใช้จ่าย</a></li>
      <li><b>สร้างเมนู</b> — เลือกวัตถุดิบ + ค่าใช้จ่าย ระบบจะคำนวณต้นทุนและกำไรให้อัตโนมัติ ที่หน้า <a href="#menus">เมนู</a></li>
    </ol>
    <div class="actions"><button class="btn primary" id="loadDemo">ทดลองด้วยข้อมูลตัวอย่าง</button><a class="btn" href="#settings">ตั้งค่าร้าน</a></div>
  </div>` : ''}

  <div class="section-title">วันนี้</div>
  <div class="grid g4">
    ${kpi('ยอดขาย', baht(aT.total.subtotal), `${aT.total.orders} ออเดอร์ · ${fmt(aT.total.qty, 0)} จาน`)}
    ${kpi('รับจริงหลังหัก GP/ส่วนลด', baht(aT.total.netRevenue), `GP ${baht(aT.total.gp)} · ส่วนลดร้าน ${baht(aT.total.shopDisc)}`)}
    ${kpi('ค่าโฆษณาวันนี้', baht(aT.total.ads), aT.total.subtotal ? `${pct(aT.total.ads / aT.total.subtotal * 100)} ของยอดขาย` : '')}
    ${kpi('กำไรสุทธิวันนี้', baht(aT.total.net), `หลังหักต้นทุน โฆษณา และค่าคงที่ ${baht(aT.total.fixed)}`, signCls(aT.total.net))}
  </div>

  <div class="section-title">เดือนนี้ (${esc(thMonth(t))})</div>
  <div class="grid g4">
    ${kpi('ยอดขาย', baht0(aM.total.subtotal), `${aM.total.orders} ออเดอร์ · เฉลี่ย ${baht0(aM.total.orders ? aM.total.subtotal / aM.total.orders : 0)}/บิล`)}
    ${kpi('GP + ส่วนลดร้าน', baht0(aM.total.gp + aM.total.shopDisc), aM.total.subtotal ? `${pct((aM.total.gp + aM.total.shopDisc) / aM.total.subtotal * 100)} ของยอดขาย` : '')}
    ${kpi('ต้นทุนวัตถุดิบ+แพ็กเกจ', baht0(aM.total.varCost), aM.total.subtotal ? `Food cost ${pct(aM.total.varCost / aM.total.subtotal * 100)}` : '')}
    ${kpi('กำไรสุทธิ (ถึงวันนี้)', baht0(aM.total.net), `โฆษณา ${baht0(aM.total.ads)} · คงที่ ${baht0(aM.total.fixed)}`, signCls(aM.total.net))}
  </div>

  <div class="grid g-21" style="margin-top:16px">
    <div class="card">
      <h3>ยอดขาย &amp; กำไรสุทธิ 14 วันล่าสุด <small><a href="#reports">ดูรายงาน →</a></small></h3>
      ${chartLegend()}
      ${chartSlot('dash14', a14.days)}
    </div>
    <div class="card">
      <h3>แจ้งเตือน &amp; คำแนะนำ</h3>
      ${be ? (be.perOrder > 0
        ? `<div class="alert ${be.actualPerDay >= be.ordersPerDay ? 'good' : 'warn'}">🎯 <div>จุดคุ้มทุน: ต้องขาย <b>${fmt(Math.ceil(be.ordersPerDay), 0)} ออเดอร์/วัน</b> (ตอนนี้เฉลี่ย ${fmt(be.actualPerDay, 1)}) · กำไรต่อออเดอร์หลังโฆษณา ${baht(be.perOrder)}</div></div>`
        : `<div class="alert bad">⚠️ <div>เดือนนี้กำไรต่อออเดอร์ (หลังโฆษณา) ติดลบ ${baht(be.perOrder)} — ควรทบทวนราคา/ส่วนลด/ค่าโฆษณา</div></div>`) : ''}
      ${lowStock.length ? `<div class="alert warn">📦 <div>วัตถุดิบใกล้หมด: <b>${lowStock.map((i) => esc(i.name)).join(', ')}</b> <a href="#ingredients">ไปสั่งซื้อ →</a></div></div>` : ''}
      ${lossMenus.length ? `<div class="alert bad">🔻 <div>เมนูที่ขายแล้ว<b>ขาดทุน</b> (รวมค่าปันส่วน): ${esc(lossMenus.slice(0, 5).join(', '))}${lossMenus.length > 5 ? ` และอีก ${lossMenus.length - 5}` : ''} <a href="#menus">ปรับราคา →</a></div></div>` : ''}
      ${highCost.length ? `<div class="alert warn">🍳 <div>Food cost เกินเป้า ${pct(DB.settings.targetFoodCost)}: ${esc(highCost.map((m) => m.name).join(', '))}</div></div>` : ''}
      ${!be && !lowStock.length && !lossMenus.length && !highCost.length ? '<div class="alert info">✅ ยังไม่มีสิ่งที่ต้องแจ้งเตือน</div>' : ''}
      <div class="hint mt">💡 ทิป: ตั้งราคาบนแอพให้สูงกว่าหน้าร้านประมาณ 20–30% เพื่อชดเชย GP แล้วดูผลได้ทันทีในหน้า <a href="#menus">เมนู &amp; ต้นทุน</a></div>
    </div>
  </div>

  <div class="grid g2">
    <div class="card">
      <h3>เมนูขายดีเดือนนี้</h3>
      ${aM.menus.length ? `<div class="table-wrap"><table>
        <thead><tr><th>เมนู</th><th class="num">จำนวน</th><th class="num">ยอดขาย</th><th class="num">กำไรขั้นต้น</th></tr></thead>
        <tbody>${aM.menus.slice(0, 6).map((m) => `<tr><td>${esc(m.name)}</td><td class="num">${fmt(m.qty, 0)}</td><td class="num">${baht0(m.sales)}</td><td class="num ${signCls(m.contribution)}">${baht0(m.contribution)}</td></tr>`).join('')}</tbody>
      </table></div>` : emptyState('🍽️', 'ยังไม่มีออเดอร์เดือนนี้')}
    </div>
    <div class="card">
      <h3>แยกตามช่องทางขาย (เดือนนี้)</h3>
      ${aM.channels.length ? channelTable(aM) : emptyState('🛵', 'ยังไม่มีข้อมูล')}
    </div>
  </div>`;

  const demoBtn = $('#loadDemo');
  if (demoBtn) demoBtn.onclick = () => { Store.replace(buildDemoData()); toast('โหลดข้อมูลตัวอย่างแล้ว'); render(); };
  drawCharts();
}

function channelTable(agg) {
  const maxSales = Math.max(1, ...agg.channels.map((c) => c.subtotal));
  return `<div class="table-wrap"><table>
    <thead><tr><th>ช่องทาง</th><th>สัดส่วน</th><th class="num">ออเดอร์</th><th class="num">ยอดขาย</th><th class="num">GP</th><th class="num">โฆษณา</th><th class="num">กำไร*</th></tr></thead>
    <tbody>${agg.channels.map((c) => `<tr>
      <td>${esc(c.name)}</td>
      <td><div class="meter"><i style="width:${c.subtotal / maxSales * 100}%"></i></div></td>
      <td class="num">${fmt(c.orders, 0)}</td><td class="num">${baht0(c.subtotal)}</td><td class="num">${baht0(c.gp)}</td><td class="num">${baht0(c.ads)}</td>
      <td class="num ${signCls(c.net)}">${baht0(c.net)}</td></tr>`).join('')}</tbody>
  </table></div><p class="small muted" style="margin:8px 0 0">* กำไรหลังหัก GP ส่วนลด ต้นทุนวัตถุดิบ/แพ็กเกจ และค่าโฆษณาของช่องทางนั้น (ยังไม่หักค่าใช้จ่ายคงที่)</p>`;
}

/* =========================================================
 * หน้า: รับออเดอร์ (POS) + ประวัติออเดอร์
 * ========================================================= */
function newPos(keep = {}) {
  const ch = activeChannels()[0];
  return {
    date: keep.date || today(), time: nowTime(), channelId: keep.channelId || (ch ? ch.id : ''), ref: '',
    items: [], discountType: 'baht', discountValue: '', discountBy: 'shop', extraCost: '', note: '',
    editingId: null, q: '', cat: '',
  };
}
function draftOrder() {
  const P = UI.pos;
  const ch = channelById(P.channelId);
  return {
    date: P.date, time: P.time, channelId: P.channelId, ref: P.ref.trim(),
    items: P.items.map((l) => snapshotItem(l.menuId, l.qty, l.price)),
    discountType: P.discountType, discountValue: num(P.discountValue), discountBy: P.discountBy,
    extraCost: num(P.extraCost), note: P.note.trim(),
    gp: num(ch.gp), vatOnGp: !!ch.vatOnGp, gpBeforeDiscount: !!ch.gpBeforeDiscount,
  };
}

function renderOrders() {
  if (!UI.pos) UI.pos = newPos();
  const tabs = `<div class="seg" id="ordTabs">
    <button data-tab="pos" class="${UI.ordersTab === 'pos' ? 'on' : ''}">🧾 รับออเดอร์</button>
    <button data-tab="history" class="${UI.ordersTab === 'history' ? 'on' : ''}">📋 ประวัติออเดอร์</button></div>`;
  main.innerHTML = `<div class="page-head"><div><h1>ออเดอร์</h1><p>บันทึกออเดอร์ ใส่ส่วนลด ระบบหัก GP และคำนวณกำไรให้ทันที</p></div>${tabs}</div><div id="ordBody"></div>`;
  $$('#ordTabs button').forEach((b) => b.onclick = () => { UI.ordersTab = b.dataset.tab; renderOrders(); });
  if (UI.ordersTab === 'pos') renderPos(); else renderHistory();
}

function renderPos() {
  const P = UI.pos;
  const body = $('#ordBody');
  if (!DB.menus.length) {
    body.innerHTML = `<div class="card">${emptyState('🍛', 'ยังไม่มีเมนู — สร้างเมนูก่อนเพื่อเริ่มรับออเดอร์', '<a class="btn primary" href="#menus">ไปสร้างเมนู</a>')}</div>`;
    return;
  }
  if (!byId(DB.channels, P.channelId) && activeChannels()[0]) P.channelId = activeChannels()[0].id;
  const cats = menuCategories();
  const q = P.q.trim().toLowerCase();
  const menus = DB.menus.filter((m) => m.active !== false && (!P.cat || m.category === P.cat) && (!q || m.name.toLowerCase().includes(q)));
  const inCart = (id) => P.items.filter((l) => l.menuId === id).reduce((s, l) => s + num(l.qty), 0);
  const chOpts = activeChannels();

  body.innerHTML = `
  ${P.editingId ? `<div class="alert warn" style="margin-bottom:12px">✏️ <div>กำลังแก้ไขออเดอร์เดิม <button class="btn sm" id="cancelEdit">ยกเลิกการแก้ไข</button></div></div>` : ''}
  <div class="pos-layout">
    <div>
      <div class="card">
        <h3>1. เลือกช่องทางขาย</h3>
        <div class="chips" id="chChips">${chOpts.map((c) => `<button class="chip ${c.id === P.channelId ? 'on' : ''}" data-ch="${esc(c.id)}">${esc(c.name)} <small>${num(c.gp) ? `GP ${fmt(c.gp, 0)}%${c.vatOnGp ? '+VAT' : ''}` : 'ไม่มี GP'}</small></button>`).join('')}</div>
      </div>
      <div class="card">
        <h3>2. แตะเมนูเพื่อเพิ่มลงออเดอร์</h3>
        <div class="inline" style="margin-bottom:12px">
          <input class="input" id="posSearch" placeholder="🔍 ค้นหาเมนู..." value="${esc(P.q)}" style="max-width:260px">
          <div class="chips" id="catChips">
            <button class="chip ${!P.cat ? 'on' : ''}" data-cat="">ทั้งหมด</button>
            ${cats.map((c) => `<button class="chip ${P.cat === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
          </div>
        </div>
        <div class="menu-grid" id="menuGrid">
          ${menus.map((m) => { const n = inCart(m.id); return `<button class="menu-tile" data-add="${esc(m.id)}">
            ${n ? `<span class="mt-qty">${fmt(n, 0)}</span>` : ''}
            <span class="mt-name">${esc(m.name)}</span>
            <span class="small muted">${esc(m.category || '')}</span>
            <span class="mt-price">${baht(menuPrice(m, P.channelId))}</span></button>`; }).join('') || '<div class="muted small">ไม่พบเมนู</div>'}
        </div>
      </div>
    </div>

    <div class="card cart" id="cart">
      <h3>3. สรุปออเดอร์ <small>${esc(channelById(P.channelId).name)}</small></h3>
      <div class="form-grid">
        ${fInput('date', 'วันที่', P.date, { type: 'date' })}
        ${fInput('time', 'เวลา', P.time, { type: 'time' })}
        ${fInput('ref', 'เลขออเดอร์ (จากแอพ)', P.ref, { cls: 'full', placeholder: 'เช่น GF-123 (ไม่บังคับ)' })}
      </div>
      <div id="cartLines" class="mt">
        ${P.items.length ? P.items.map((l, idx) => { const m = byId(DB.menus, l.menuId); return `<div class="cart-line">
          <div class="cl-name">${esc(m ? m.name : '(เมนูถูกลบ)')}</div>
          <div class="num small muted" data-linetotal="${idx}">${baht(num(l.price) * num(l.qty))}</div>
          <div class="cl-controls">
            <div class="qty"><button type="button" data-dec="${idx}" aria-label="ลด">−</button><input data-qty="${idx}" value="${esc(l.qty)}" inputmode="numeric" aria-label="จำนวน"><button type="button" data-inc="${idx}" aria-label="เพิ่ม">＋</button></div>
            <label class="inline small muted">ราคา/จาน <input class="input num price-input" data-price="${idx}" value="${esc(l.price)}" inputmode="decimal"></label>
            <button class="icon-btn" data-del="${idx}" aria-label="ลบ">🗑️</button>
          </div></div>`; }).join('') : '<div class="empty small">ยังไม่มีรายการ — แตะเมนูทางซ้าย</div>'}
      </div>

      <div class="mt">
        <div class="field"><span>ส่วนลด</span>
          <div class="inline">
            <div class="seg" id="discType"><button type="button" data-v="baht" class="${P.discountType === 'baht' ? 'on' : ''}">บาท</button><button type="button" data-v="pct" class="${P.discountType === 'pct' ? 'on' : ''}">%</button></div>
            <input class="input num" name="discountValue" value="${esc(P.discountValue)}" inputmode="decimal" placeholder="0" style="width:100px">
          </div>
        </div>
        <div class="field mt"><span>ใครออกส่วนลด</span>
          <div class="seg" id="discBy"><button type="button" data-v="shop" class="${P.discountBy === 'shop' ? 'on' : ''}">ร้านออกเอง</button><button type="button" data-v="platform" class="${P.discountBy === 'platform' ? 'on' : ''}">แอพออกให้</button></div>
        </div>
        <div class="form-grid mt">
          ${fInput('extraCost', 'ค่าใช้จ่ายเพิ่มของบิลนี้', P.extraCost, { type: 'number', placeholder: '0', hint: 'เช่น ร้านช่วยค่าส่ง, ของแถม' })}
          ${fInput('note', 'หมายเหตุ', P.note, { placeholder: 'ไม่บังคับ' })}
        </div>
      </div>
      <div class="mt" id="cartSummary"></div>
      <div class="inline mt">
        <button class="btn" id="clearCart">ล้าง</button>
        <button class="btn primary lg" id="saveOrder" style="flex:1">${P.editingId ? 'บันทึกการแก้ไข' : '✓ บันทึกออเดอร์'}</button>
      </div>
    </div>
  </div>
  ${P.items.length ? `<button class="pos-mobile-bar" id="goCart"><span>🧾 ${fmt(P.items.reduce((t, l) => t + num(l.qty), 0), 0)} รายการ</span><b id="mobileTotal"></b><span>ดูออเดอร์ ↓</span></button>` : ''}`;

  updateCartSummary();

  $$('#chChips [data-ch]').forEach((b) => b.onclick = () => {
    P.channelId = b.dataset.ch;
    P.items.forEach((l) => { const m = byId(DB.menus, l.menuId); if (m) l.price = menuPrice(m, P.channelId); });
    renderPos();
  });
  $$('#catChips [data-cat]').forEach((b) => b.onclick = () => { P.cat = b.dataset.cat; renderPos(); });
  const search = $('#posSearch');
  search.oninput = () => { P.q = search.value; const pos = search.selectionStart; renderPos(); const s = $('#posSearch'); s.focus(); s.setSelectionRange(pos, pos); };
  $$('#menuGrid [data-add]').forEach((b) => b.onclick = () => {
    const m = byId(DB.menus, b.dataset.add);
    const price = menuPrice(m, P.channelId);
    const ex = P.items.find((l) => l.menuId === m.id && num(l.price) === price);
    if (ex) ex.qty = num(ex.qty) + 1; else P.items.push({ menuId: m.id, qty: 1, price });
    renderPos();
  });
  const cart = $('#cart');
  cart.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.inc != null) { P.items[+t.dataset.inc].qty = num(P.items[+t.dataset.inc].qty) + 1; renderPos(); }
    else if (t.dataset.dec != null) { const l = P.items[+t.dataset.dec]; l.qty = num(l.qty) - 1; if (l.qty <= 0) P.items.splice(+t.dataset.dec, 1); renderPos(); }
    else if (t.dataset.del != null) { P.items.splice(+t.dataset.del, 1); renderPos(); }
  });
  cart.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.qty != null) P.items[+el.dataset.qty].qty = el.value;
    else if (el.dataset.price != null) P.items[+el.dataset.price].price = el.value;
    else if (el.name && el.name in P) P[el.name] = el.value;
    if (el.dataset.qty != null || el.dataset.price != null) {
      const i = +(el.dataset.qty ?? el.dataset.price);
      const lt = $(`[data-linetotal="${i}"]`); if (lt) lt.textContent = baht(num(P.items[i].price) * num(P.items[i].qty));
    }
    updateCartSummary();
  });
  $$('#discType button').forEach((b) => b.onclick = () => { P.discountType = b.dataset.v; renderPos(); });
  $$('#discBy button').forEach((b) => b.onclick = () => { P.discountBy = b.dataset.v; renderPos(); });
  $('#clearCart').onclick = () => { UI.pos = newPos(P); renderPos(); };
  const ce = $('#cancelEdit'); if (ce) ce.onclick = () => { UI.pos = newPos(); UI.ordersTab = 'history'; renderOrders(); };
  $('#saveOrder').onclick = saveOrder;
  const gc = $('#goCart'); if (gc) gc.onclick = () => $('#cart').scrollIntoView({ behavior: 'smooth' });
}

function updateCartSummary() {
  const o = draftOrder();
  const c = orderCalc(o);
  const ch = channelById(o.channelId);
  const mt = $('#mobileTotal'); if (mt) mt.textContent = baht(c.customerPays);
  const row = (l, v, cls = '') => `<div class="sum-row ${cls}"><span>${l}</span><span>${v}</span></div>`;
  $('#cartSummary').innerHTML = `
    ${row('ยอดอาหาร', baht(c.subtotal))}
    ${c.disc ? row(`ส่วนลด (${o.discountBy === 'platform' ? 'แอพออก' : 'ร้านออก'})`, '−' + baht(c.disc)) : ''}
    ${row('<b>ลูกค้าจ่าย</b>', `<b>${baht(c.customerPays)}</b>`)}
    <hr style="border:0;border-top:1px dashed var(--border);margin:8px 0">
    ${c.shopDisc ? row('หักส่วนลดที่ร้านออก', '−' + baht(c.shopDisc)) : ''}
    ${row(`GP ${fmt(ch.gp, 0)}%${ch.vatOnGp ? ' + VAT 7%' : ''}`, '−' + baht(c.gp))}
    ${row('ร้านได้รับเงินจริง', baht(c.netRevenue))}
    ${row('ต้นทุนวัตถุดิบ + แพ็กเกจ', '−' + baht(c.varCost))}
    ${c.extra ? row('ค่าใช้จ่ายเพิ่ม', '−' + baht(c.extra)) : ''}
    ${row('กำไรขั้นต้นบิลนี้', `<span class="${signCls(c.profit)}">${baht(c.profit)}</span>`, 'big')}
    ${c.subtotal ? `<div class="small muted">คิดเป็น ${pct(c.profit / c.subtotal * 100)} ของยอดอาหาร · ยังไม่หักค่าโฆษณาและค่าคงที่</div>` : ''}`;
}

function saveOrder() {
  const P = UI.pos;
  const items = P.items.filter((l) => num(l.qty) > 0);
  if (!items.length) return toast('ยังไม่มีรายการอาหาร', 'error');
  if (!P.date) return toast('กรุณาเลือกวันที่', 'error');
  P.items = items;
  const o = draftOrder();
  if (P.editingId) {
    const old = byId(DB.orders, P.editingId);
    if (old) { applyStock(old, -1); Object.assign(old, o, { updatedAt: Date.now() }); applyStock(old, 1); }
  } else {
    const rec = { id: uid(), ...o, createdAt: Date.now() };
    DB.orders.push(rec);
    applyStock(rec, 1);
  }
  const c = orderCalc(o);
  const wasEdit = !!P.editingId;
  UI.pos = newPos(P);
  if (Store.save()) toast(`${wasEdit ? 'แก้ไข' : 'บันทึก'}ออเดอร์แล้ว · กำไรบิลนี้ ${baht(c.profit)}`);
  if (wasEdit) UI.ordersTab = 'history';
  renderOrders();
}

function renderHistory() {
  const H = UI.history;
  const list = DB.orders
    .filter((o) => o.date >= H.from && o.date <= H.to && (!H.channel || o.channelId === H.channel))
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const tot = { subtotal: 0, disc: 0, gp: 0, netRevenue: 0, varCost: 0, profit: 0 };
  const rows = list.map((o) => {
    const c = orderCalc(o);
    for (const k in tot) tot[k] += c[k];
    return `<tr>
      <td>${esc(thDate(o.date))}<div class="small muted">${esc(o.time || '')}</div></td>
      <td>${esc(channelById(o.channelId).name)}${o.ref ? `<div class="small muted">${esc(o.ref)}</div>` : ''}</td>
      <td class="small">${o.items.map((it) => `${esc(it.name)} ×${fmt(it.qty, 0)}`).join('<br>')}${o.note ? `<div class="muted">📝 ${esc(o.note)}</div>` : ''}</td>
      <td class="num">${baht(c.subtotal)}</td>
      <td class="num">${c.disc ? baht(c.disc) + `<div class="small muted">${o.discountBy === 'platform' ? 'แอพออก' : 'ร้านออก'}</div>` : '-'}</td>
      <td class="num">${baht(c.gp)}</td>
      <td class="num">${baht(c.netRevenue)}</td>
      <td class="num">${baht(c.varCost + c.extra)}</td>
      <td class="num ${signCls(c.profit)}"><b>${baht(c.profit)}</b></td>
      <td class="actions-cell"><button class="btn sm" data-edit="${esc(o.id)}">แก้ไข</button> <button class="btn sm danger" data-delorder="${esc(o.id)}">ลบ</button></td>
    </tr>`;
  }).join('');

  $('#ordBody').innerHTML = `
  <div class="filters" id="histFilters">
    ${fInput('from', 'ตั้งแต่', H.from, { type: 'date' })}
    ${fInput('to', 'ถึง', H.to, { type: 'date' })}
    ${fSelect('channel', 'ช่องทาง', [['', 'ทุกช่องทาง'], ...DB.channels.map((c) => [c.id, c.name])], H.channel)}
    <div class="seg" style="align-self:flex-end"><button data-r="0">วันนี้</button><button data-r="-1">เมื่อวาน</button><button data-r="7">7 วัน</button><button data-r="m">เดือนนี้</button></div>
    <button class="btn" id="exportOrders" style="align-self:flex-end">⬇️ CSV</button>
  </div>
  <div class="card">
    ${list.length ? `<div class="table-wrap"><table>
      <thead><tr><th>วันที่</th><th>ช่องทาง</th><th>รายการ</th><th class="num">ยอดอาหาร</th><th class="num">ส่วนลด</th><th class="num">GP</th><th class="num">ร้านได้รับ</th><th class="num">ต้นทุน</th><th class="num">กำไรขั้นต้น</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="3">รวม ${list.length} ออเดอร์</td><td class="num">${baht(tot.subtotal)}</td><td class="num">${baht(tot.disc)}</td><td class="num">${baht(tot.gp)}</td><td class="num">${baht(tot.netRevenue)}</td><td class="num">${baht(tot.varCost)}</td><td class="num ${signCls(tot.profit)}">${baht(tot.profit)}</td><td></td></tr></tfoot>
    </table></div>` : emptyState('🧾', 'ไม่มีออเดอร์ในช่วงที่เลือก')}
  </div>`;

  const f = $('#histFilters');
  f.addEventListener('change', () => { Object.assign(H, readForm(f)); renderHistory(); });
  $$('[data-r]', f).forEach((b) => b.onclick = () => {
    const r = b.dataset.r, t = today();
    if (r === '0') { H.from = H.to = t; } else if (r === '-1') { H.from = H.to = addDays(t, -1); }
    else if (r === '7') { H.from = addDays(t, -6); H.to = t; } else { H.from = monthStart(t); H.to = t; }
    renderHistory();
  });
  $('#exportOrders').onclick = () => {
    const rows = [['วันที่', 'เวลา', 'ช่องทาง', 'เลขออเดอร์', 'รายการ', 'ยอดอาหาร', 'ส่วนลด', 'ผู้ออกส่วนลด', 'GP', 'ร้านได้รับ', 'ต้นทุน', 'ค่าใช้จ่ายเพิ่ม', 'กำไรขั้นต้น', 'หมายเหตุ']];
    list.forEach((o) => { const c = orderCalc(o); rows.push([o.date, o.time, channelById(o.channelId).name, o.ref, o.items.map((i) => `${i.name} x${i.qty}`).join(' | '), round2(c.subtotal), round2(c.disc), o.discountBy === 'platform' ? 'แอพ' : 'ร้าน', round2(c.gp), round2(c.netRevenue), round2(c.varCost), round2(c.extra), round2(c.profit), o.note]); });
    downloadFile(`orders_${H.from}_${H.to}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
  };
  $('#ordBody').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.edit) {
      const o = byId(DB.orders, b.dataset.edit);
      UI.pos = { ...newPos(), date: o.date, time: o.time || '', channelId: o.channelId, ref: o.ref || '', items: o.items.map((it) => ({ menuId: it.menuId, qty: it.qty, price: it.price })), discountType: o.discountType || 'baht', discountValue: o.discountValue || '', discountBy: o.discountBy || 'shop', extraCost: o.extraCost || '', note: o.note || '', editingId: o.id };
      UI.ordersTab = 'pos';
      renderOrders();
    } else if (b.dataset.delorder) {
      if (!confirm('ลบออเดอร์นี้? (สต็อกวัตถุดิบจะถูกคืน)')) return;
      const o = byId(DB.orders, b.dataset.delorder);
      applyStock(o, -1);
      DB.orders = DB.orders.filter((x) => x !== o);
      commit('ลบออเดอร์แล้ว');
    }
  };
}

/* =========================================================
 * หน้า: เมนู & ต้นทุนต่อเมนู
 * ========================================================= */
function renderMenus() {
  const F = UI.menuFilter;
  const cats = menuCategories();
  const q = F.q.trim().toLowerCase();
  const list = DB.menus.filter((m) => (!F.cat || m.category === F.cat) && (!q || m.name.toLowerCase().includes(q)));
  const chs = activeChannels();
  const target = num(DB.settings.targetFoodCost);

  const card = (m) => {
    const c = menuCost(m);
    const base = num(m.price);
    const fc = base > 0 ? c.variable / base * 100 : 0;
    const seg = (v, color, label) => (c.full > 0 && v > 0 ? `<i style="width:${v / c.full * 100}%;background:${color}" title="${esc(label)}"></i>` : '');
    return `<div class="card menu-card">
      <div class="mc-head">
        <div><div class="mc-name">${esc(m.name)} ${m.active === false ? '<span class="badge">ปิดขาย</span>' : ''}</div><span class="badge">${esc(m.category || 'ไม่ระบุหมวด')}</span></div>
        <span class="badge ${fc > target ? 'bad' : 'good'}" title="ต้นทุนวัตถุดิบ+แพ็กเกจ ÷ ราคาหน้าร้าน">Food cost ${pct(fc)}</span>
      </div>
      <div>
        <div class="cost-bar">${seg(c.ing, 'var(--series-1)', 'วัตถุดิบ')}${seg(c.unitExp, 'var(--series-2)', 'แพ็กเกจ/ต่อหน่วย')}${seg(c.overhead, 'var(--muted)', 'ปันส่วนคงที่')}</div>
        <div class="legend small mt" style="margin-top:6px">
          <span><i style="background:var(--series-1)"></i>วัตถุดิบ ${baht(c.ing)}</span>
          <span><i style="background:var(--series-2)"></i>แพ็กเกจ ${baht(c.unitExp)}</span>
          <span><i style="background:var(--muted)"></i>ปันส่วน ${baht(c.overhead)}</span>
        </div>
        <div class="small mt" style="margin-top:4px">ต้นทุนรวม/จาน <b>${baht(c.full)}</b> <span class="muted">(ผันแปร ${baht(c.variable)})</span></div>
      </div>
      <div class="table-wrap"><table class="mini-table">
        <thead><tr><th>ช่องทาง</th><th class="num">ราคา</th><th class="num">GP</th><th class="num">กำไร/จาน</th><th class="num">%</th></tr></thead>
        <tbody>${chs.map((ch) => { const a = menuChannelAnalysis(m, ch, c); return `<tr title="ราคาแนะนำ ${baht(Math.ceil(a.suggested))}">
          <td>${esc(ch.name)}</td><td class="num">${fmt(a.price, 0)}</td><td class="num">${fmt(a.gp)}</td>
          <td class="num ${signCls(a.profitFull)}">${fmt(a.profitFull)}</td>
          <td class="num"><span class="badge ${a.marginPct < 0 ? 'bad' : a.marginPct < num(DB.settings.targetMargin) ? 'warn' : 'good'}">${fmt(a.marginPct, 0)}%</span></td></tr>`; }).join('')}</tbody>
      </table></div>
      <div class="actions" style="margin-top:auto">
        <button class="btn sm" data-editmenu="${esc(m.id)}">✏️ แก้ไขสูตร/ราคา</button>
        <button class="btn sm" data-dupmenu="${esc(m.id)}">คัดลอก</button>
        <button class="btn sm danger" data-delmenu="${esc(m.id)}">ลบ</button>
      </div>
    </div>`;
  };

  main.innerHTML = `
  <div class="page-head">
    <div><h1>เมนู &amp; ต้นทุนต่อเมนู</h1><p>กำหนดสูตร (วัตถุดิบ + ค่าใช้จ่าย) ของแต่ละเมนู ระบบคำนวณต้นทุนและกำไรต่อจานในทุกช่องทาง</p></div>
    <div class="actions"><button class="btn primary" id="addMenu">＋ เพิ่มเมนู</button></div>
  </div>
  <div class="filters">
    <input class="input" id="menuSearch" placeholder="🔍 ค้นหาเมนู..." value="${esc(F.q)}" style="max-width:260px">
    <div class="chips" id="menuCats"><button class="chip ${!F.cat ? 'on' : ''}" data-cat="">ทั้งหมด</button>${cats.map((c) => `<button class="chip ${F.cat === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  </div>
  <div class="hint" style="margin-bottom:16px">กำไร/จาน = ราคาขาย − GP − ต้นทุนรวม (รวมค่าใช้จ่ายรายเดือนที่ปันส่วนแล้ว) · ป้าย % สีเขียว = ถึงเป้ากำไร ${pct(DB.settings.targetMargin)} · ชี้ที่แถวเพื่อดูราคาแนะนำ</div>
  ${list.length ? `<div class="grid g3">${list.map(card).join('')}</div>` : `<div class="card">${emptyState('🍛', DB.menus.length ? 'ไม่พบเมนูที่ค้นหา' : 'ยังไม่มีเมนู', DB.ingredients.length ? '' : 'แนะนำให้เพิ่ม <a href="#ingredients">วัตถุดิบ</a> และ <a href="#expenses">ค่าใช้จ่าย</a> ก่อน')}</div>`}`;

  $('#addMenu').onclick = () => menuModal();
  const s = $('#menuSearch');
  s.oninput = () => { F.q = s.value; const p = s.selectionStart; renderMenus(); const n = $('#menuSearch'); n.focus(); n.setSelectionRange(p, p); };
  $$('#menuCats [data-cat]').forEach((b) => b.onclick = () => { F.cat = b.dataset.cat; renderMenus(); });
  main.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.editmenu) menuModal(byId(DB.menus, b.dataset.editmenu));
    else if (b.dataset.dupmenu) {
      const m = JSON.parse(JSON.stringify(byId(DB.menus, b.dataset.dupmenu)));
      m.id = uid(); m.name += ' (สำเนา)';
      DB.menus.push(m); commit('คัดลอกเมนูแล้ว');
    } else if (b.dataset.delmenu) {
      const m = byId(DB.menus, b.dataset.delmenu);
      if (!confirm(`ลบเมนู "${m.name}"? (ออเดอร์เก่ายังคงอยู่)`)) return;
      DB.menus = DB.menus.filter((x) => x !== m); commit('ลบเมนูแล้ว');
    }
  };
}

function menuModal(m) {
  const isNew = !m;
  m = m ? JSON.parse(JSON.stringify(m)) : { name: '', category: '', price: '', channelPrices: {}, ingredients: [], expenses: [], active: true };
  const ingOptions = (sel) => `<option value="">— เลือกวัตถุดิบ —</option>` + DB.ingredients.map((i) => opt(i.id, `${i.name} (${baht(ingUnitCost(i))}/${i.unit})`, sel)).join('');
  const expOptions = (sel) => `<option value="">— เลือกค่าใช้จ่าย —</option>` + DB.expenses.map((e) => opt(e.id, `${e.name} (${e.type === 'monthly' ? 'ปันส่วน ' + baht(expUnitCost(e)) + '/จาน' : baht(e.amount) + '/' + (e.unit || 'หน่วย')})`, sel)).join('');
  const ingRow = (r = {}) => `<div class="row-editor" data-row="ing"><select class="input" data-f="id">${ingOptions(r.id)}</select><input class="input num" data-f="qty" value="${esc(r.qty ?? '')}" placeholder="ปริมาณ" inputmode="decimal"><span class="rc"></span><button type="button" class="icon-btn" data-rm aria-label="ลบ">✕</button></div>`;
  const expRow = (r = {}) => `<div class="row-editor" data-row="exp"><select class="input" data-f="id">${expOptions(r.id)}</select><input class="input num" data-f="qty" value="${esc(r.qty ?? 1)}" placeholder="จำนวน" inputmode="decimal"><span class="rc"></span><button type="button" class="icon-btn" data-rm aria-label="ลบ">✕</button></div>`;

  const body = `
  <div class="form-grid">
    ${fInput('name', 'ชื่อเมนู *', m.name, { placeholder: 'เช่น กะเพราหมูสับไข่ดาว' })}
    ${fInput('category', 'หมวดหมู่', m.category, { placeholder: 'เช่น จานเดียว, เส้น, เครื่องดื่ม', list: 'menuCatList' })}
    ${fInput('price', 'ราคาขายหลัก (หน้าร้าน) *', m.price, { type: 'number' })}
    <div class="field" style="justify-content:flex-end">${fCheck('active', 'เปิดขายเมนูนี้', m.active !== false)}</div>
  </div>
  ${datalist('menuCatList', menuCategories())}

  <div class="section-title">ราคาเฉพาะช่องทาง <span class="muted" style="text-transform:none;font-weight:400">(เว้นว่าง = ใช้ราคาหลัก)</span></div>
  <div class="form-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
    ${activeChannels().map((ch) => fInput('cp_' + ch.id, `${esc(ch.name)} ${num(ch.gp) ? `<span class="muted">(GP ${fmt(ch.gp, 0)}%)</span>` : ''}`, m.channelPrices?.[ch.id] || '', { type: 'number', placeholder: 'ราคาหลัก' })).join('')}
  </div>

  <div class="section-title">🥬 วัตถุดิบในเมนู (ปริมาณต่อ 1 จาน)</div>
  ${DB.ingredients.length ? '' : '<div class="alert warn">ยังไม่มีวัตถุดิบ — เพิ่มได้ที่หน้า วัตถุดิบ &amp; สต็อก</div>'}
  <div id="ingRows">${m.ingredients.map(ingRow).join('')}</div>
  <button type="button" class="btn sm" id="addIngRow">＋ เพิ่มวัตถุดิบ</button>

  <div class="section-title">📦 ค่าใช้จ่ายในเมนู (แพ็กเกจ / ค่าแรง / ค่าไฟ ฯลฯ)</div>
  <div id="expRows">${m.expenses.map(expRow).join('')}</div>
  <div class="inline">
    <button type="button" class="btn sm" id="addExpRow">＋ เพิ่มค่าใช้จ่าย</button>
    <button type="button" class="btn sm" id="addAllUnit">＋ ใส่ค่าแพ็กเกจ/ต่อหน่วยทั้งหมด</button>
    <button type="button" class="btn sm" id="addAllMonthly">＋ ใส่ค่าใช้จ่ายรายเดือนทั้งหมด (ปันส่วน)</button>
  </div>

  <div class="section-title">สรุปต้นทุน &amp; กำไร</div>
  <div id="menuSummary"></div>`;

  const collect = (root) => {
    const f = readForm(root);
    const res = {
      ...m, name: f.name.trim(), category: f.category.trim(), price: num(f.price), active: f.active,
      channelPrices: {}, ingredients: [], expenses: [],
    };
    activeChannels().forEach((ch) => { const v = num(f['cp_' + ch.id]); if (v > 0) res.channelPrices[ch.id] = v; });
    $$('[data-row="ing"]', root).forEach((r) => { const id = $('[data-f=id]', r).value; if (id) res.ingredients.push({ id, qty: num($('[data-f=qty]', r).value) }); });
    $$('[data-row="exp"]', root).forEach((r) => { const id = $('[data-f=id]', r).value; if (id) res.expenses.push({ id, qty: num($('[data-f=qty]', r).value) }); });
    return res;
  };

  const refresh = (root) => {
    const cur = collect(root);
    $$('[data-row]', root).forEach((r) => {
      const id = $('[data-f=id]', r).value, q = num($('[data-f=qty]', r).value);
      let txt = '';
      if (id && r.dataset.row === 'ing') { const i = byId(DB.ingredients, id); if (i) txt = `${i.unit} · ${baht(ingUnitCost(i) * q)}`; }
      if (id && r.dataset.row === 'exp') { const e = byId(DB.expenses, id); if (e) txt = baht(expUnitCost(e) * q); }
      $('.rc', r).textContent = txt;
    });
    const c = menuCost(cur);
    const t = num(DB.settings.targetFoodCost);
    $('#menuSummary', root).innerHTML = `
      <div class="grid g4" style="gap:10px">
        <div class="card kpi"><div class="label">วัตถุดิบ</div><div class="value" style="font-size:18px">${baht(c.ing)}</div></div>
        <div class="card kpi"><div class="label">แพ็กเกจ/ต่อหน่วย</div><div class="value" style="font-size:18px">${baht(c.unitExp)}</div></div>
        <div class="card kpi"><div class="label">ปันส่วนรายเดือน</div><div class="value" style="font-size:18px">${baht(c.overhead)}</div></div>
        <div class="card kpi"><div class="label">ต้นทุนรวม/จาน</div><div class="value" style="font-size:18px">${baht(c.full)}</div>
          <div class="sub">Food cost ${cur.price ? pct(c.variable / cur.price * 100) : '-'} (เป้า ${pct(t)})</div></div>
      </div>
      <div class="table-wrap mt"><table>
        <thead><tr><th>ช่องทาง</th><th class="num">ราคาขาย</th><th class="num">GP</th><th class="num">ร้านได้รับ</th><th class="num">ต้นทุนรวม</th><th class="num">กำไร/จาน</th><th class="num">% กำไร</th><th class="num">ราคาแนะนำ*</th></tr></thead>
        <tbody>${activeChannels().map((ch) => { const a = menuChannelAnalysis(cur, ch, c); return `<tr>
          <td>${esc(ch.name)}</td><td class="num">${baht(a.price)}</td><td class="num">${baht(a.gp)}</td><td class="num">${baht(a.net)}</td><td class="num">${baht(c.full)}</td>
          <td class="num ${signCls(a.profitFull)}"><b>${baht(a.profitFull)}</b></td><td class="num">${pct(a.marginPct)}</td>
          <td class="num">${a.suggested ? baht0(Math.ceil(a.suggested)) : '-'}</td></tr>`; }).join('')}</tbody>
      </table></div>
      <p class="small muted">* ราคาแนะนำ = ราคาที่ทำให้มีกำไร ${pct(DB.settings.targetMargin)} หลังหัก GP และต้นทุนรวม (ปรับเป้าได้ที่หน้าตั้งค่า)</p>`;
  };

  openModal({
    title: isNew ? 'เพิ่มเมนูใหม่' : `แก้ไขเมนู: ${m.name}`,
    body, wide: true,
    onMount: (root) => {
      refresh(root);
      root.addEventListener('input', () => refresh(root));
      root.addEventListener('change', () => refresh(root));
      root.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.rm != null) { b.closest('.row-editor').remove(); refresh(root); }
        else if (b.id === 'addIngRow') { $('#ingRows', root).insertAdjacentHTML('beforeend', ingRow()); refresh(root); }
        else if (b.id === 'addExpRow') { $('#expRows', root).insertAdjacentHTML('beforeend', expRow()); refresh(root); }
        else if (b.id === 'addAllUnit' || b.id === 'addAllMonthly') {
          const type = b.id === 'addAllUnit' ? 'unit' : 'monthly';
          const have = new Set($$('[data-row="exp"] [data-f=id]', root).map((s) => s.value));
          const add = DB.expenses.filter((x) => (x.type || 'unit') === type && !have.has(x.id));
          if (!add.length) return toast('ไม่มีรายการใหม่ให้เพิ่ม');
          $('#expRows', root).insertAdjacentHTML('beforeend', add.map((x) => expRow({ id: x.id, qty: 1 })).join(''));
          refresh(root);
        }
      });
    },
    onSave: (root) => {
      const res = collect(root);
      if (!res.name) { toast('กรุณาใส่ชื่อเมนู', 'error'); return false; }
      if (!(res.price > 0)) { toast('กรุณาใส่ราคาขาย', 'error'); return false; }
      if (isNew) DB.menus.push({ ...res, id: uid() });
      else Object.assign(byId(DB.menus, m.id), res);
      commit(isNew ? 'เพิ่มเมนูแล้ว' : 'บันทึกเมนูแล้ว');
    },
  });
}

/* =========================================================
 * หน้า: วัตถุดิบ & สต็อก & บันทึกการซื้อ
 * ========================================================= */
function renderIngredients() {
  const tabs = `<div class="seg" id="ingTabs">
    <button data-tab="list" class="${UI.ingTab === 'list' ? 'on' : ''}">🥬 รายการวัตถุดิบ</button>
    <button data-tab="purchases" class="${UI.ingTab === 'purchases' ? 'on' : ''}">🛒 ประวัติการซื้อ</button></div>`;
  const usedIn = (id) => DB.menus.filter((m) => (m.ingredients || []).some((r) => r.id === id)).length;
  let content;
  if (UI.ingTab === 'list') {
    content = DB.ingredients.length ? `<div class="table-wrap"><table>
      <thead><tr><th>วัตถุดิบ</th><th>ซื้อมาเป็น</th><th class="num">% ใช้ได้จริง</th><th class="num">ต้นทุนต่อหน่วย</th><th class="num">สต็อกคงเหลือ</th><th class="num">ใช้ใน</th><th></th></tr></thead>
      <tbody>${[...DB.ingredients].sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name)).map((i) => {
        const low = i.trackStock && num(i.stock) <= num(i.minStock);
        return `<tr>
        <td><b>${esc(i.name)}</b><div class="small muted">${esc(i.category || '')}</div></td>
        <td>${baht(i.packPrice)} / ${esc(i.packLabel || '')}<div class="small muted">= ${fmt(i.packSize, 0)} ${esc(i.unit)}</div></td>
        <td class="num">${fmt(i.yield || 100, 0)}%</td>
        <td class="num"><b>${baht(ingUnitCost(i))}</b> <span class="small muted">/${esc(i.unit)}</span></td>
        <td class="num">${i.trackStock ? `${fmt(i.stock, 0)} ${esc(i.unit)} ${low ? '<span class="badge warn">ใกล้หมด</span>' : ''}` : '<span class="muted small">ไม่ติดตาม</span>'}</td>
        <td class="num small">${usedIn(i.id)} เมนู</td>
        <td class="actions-cell"><button class="btn sm" data-buy="${esc(i.id)}">🛒 ซื้อเข้า</button> <button class="btn sm" data-editing="${esc(i.id)}">แก้ไข</button> <button class="btn sm danger" data-deling="${esc(i.id)}">ลบ</button></td>
      </tr>`; }).join('')}</tbody></table></div>`
      : emptyState('🥬', 'ยังไม่มีวัตถุดิบ', '<button class="btn primary" data-addfirst>＋ เพิ่มวัตถุดิบแรก</button>');
  } else {
    const list = [...DB.purchases].sort((a, b) => b.date.localeCompare(a.date));
    const total = list.reduce((s, p) => s + num(p.total), 0);
    content = list.length ? `<div class="table-wrap"><table>
      <thead><tr><th>วันที่</th><th>วัตถุดิบ</th><th class="num">จำนวน</th><th class="num">ราคาต่อหน่วยซื้อ</th><th class="num">รวมเงิน</th><th>หมายเหตุ</th><th></th></tr></thead>
      <tbody>${list.map((p) => { const i = byId(DB.ingredients, p.ingredientId); return `<tr>
        <td>${esc(thDate(p.date))}</td><td>${esc(i ? i.name : '(ถูกลบ)')}</td>
        <td class="num">${fmt(p.packs, 2)} ${esc(i?.packLabel || '')}</td><td class="num">${baht(num(p.total) / Math.max(num(p.packs), 1e-9))}</td>
        <td class="num">${baht(p.total)}</td><td class="small">${esc(p.note || '')}</td>
        <td class="actions-cell"><button class="btn sm danger" data-delpur="${esc(p.id)}">ลบ</button></td></tr>`; }).join('')}</tbody>
      <tfoot><tr><td colspan="4">รวมค่าซื้อวัตถุดิบ</td><td class="num">${baht(total)}</td><td colspan="2"></td></tr></tfoot></table></div>`
      : emptyState('🛒', 'ยังไม่มีการบันทึกซื้อวัตถุดิบ');
  }

  main.innerHTML = `
  <div class="page-head">
    <div><h1>วัตถุดิบ &amp; สต็อก</h1><p>บันทึกราคาวัตถุดิบ ระบบคิดต้นทุนต่อกรัม/ชิ้นหลังหักส่วนที่ตัดแต่งทิ้ง และตัดสต็อกอัตโนมัติเมื่อขาย</p></div>
    <div class="actions">${tabs}<button class="btn" id="buyIng">🛒 บันทึกซื้อ</button><button class="btn primary" id="addIng">＋ เพิ่มวัตถุดิบ</button></div>
  </div>
  <div class="card">${content}</div>
  <div class="hint mt">💡 <b>% ใช้ได้จริง (Yield)</b> คือสัดส่วนที่เหลือหลังตัดแต่ง เช่น ซื้อผักคะน้า 1 กก. เด็ดใบเสียทิ้งเหลือ 750 กรัม = 75% ต้นทุนต่อกรัมจะสูงขึ้นตามจริง · การ<b>บันทึกซื้อ</b>จะเพิ่มสต็อกและอัปเดตราคาล่าสุดให้อัตโนมัติ</div>`;

  $$('#ingTabs button').forEach((b) => b.onclick = () => { UI.ingTab = b.dataset.tab; renderIngredients(); });
  $('#addIng').onclick = () => ingredientModal();
  $('#buyIng').onclick = () => purchaseModal();
  main.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.addfirst != null) ingredientModal();
    else if (b.dataset.buy) purchaseModal(b.dataset.buy);
    else if (b.dataset.editing) ingredientModal(byId(DB.ingredients, b.dataset.editing));
    else if (b.dataset.deling) {
      const i = byId(DB.ingredients, b.dataset.deling);
      const n = usedIn(i.id);
      if (!confirm(`ลบ "${i.name}"?${n ? `\nวัตถุดิบนี้ใช้อยู่ใน ${n} เมนู และจะถูกนำออกจากสูตร` : ''}`)) return;
      DB.ingredients = DB.ingredients.filter((x) => x !== i);
      DB.menus.forEach((m) => { m.ingredients = (m.ingredients || []).filter((r) => r.id !== i.id); });
      commit('ลบวัตถุดิบแล้ว');
    } else if (b.dataset.delpur) {
      const p = byId(DB.purchases, b.dataset.delpur);
      if (!confirm('ลบรายการซื้อนี้? (สต็อกจะถูกหักออกคืน)')) return;
      const i = byId(DB.ingredients, p.ingredientId);
      if (i && i.trackStock) i.stock = round2(num(i.stock) - num(p.packs) * num(i.packSize));
      DB.purchases = DB.purchases.filter((x) => x !== p);
      commit('ลบรายการซื้อแล้ว');
    }
  };
}

function ingredientModal(i) {
  const isNew = !i;
  i = i || { name: '', category: '', unit: 'กรัม', packLabel: 'กก.', packSize: 1000, packPrice: '', yield: 100, trackStock: false, stock: 0, minStock: 0 };
  const body = `
  <div class="form-grid">
    ${fInput('name', 'ชื่อวัตถุดิบ *', i.name, { placeholder: 'เช่น หมูสับ' })}
    ${fInput('category', 'หมวดหมู่', i.category, { placeholder: 'เช่น เนื้อสัตว์, ผัก, เครื่องปรุง', list: 'ingCatList' })}
    ${fInput('unit', 'หน่วยที่ใช้ในสูตร *', i.unit, { list: 'unitList', hint: 'หน่วยเล็กที่ใช้ตวงต่อจาน เช่น กรัม, มล., ฟอง, ชิ้น' })}
    ${fInput('packLabel', 'หน่วยที่ซื้อ', i.packLabel, { list: 'packList', hint: 'เช่น กก., แผง, ขวด, แพ็ก' })}
    ${fInput('packSize', '1 หน่วยที่ซื้อ = กี่หน่วยใช้ *', i.packSize, { type: 'number', hint: 'เช่น 1 กก. = 1000 กรัม, 1 แผง = 30 ฟอง' })}
    ${fInput('packPrice', 'ราคาซื้อต่อหน่วยที่ซื้อ (บาท) *', i.packPrice, { type: 'number' })}
    ${fInput('yield', '% ใช้ได้จริง (Yield)', i.yield ?? 100, { type: 'number', hint: 'หลังล้าง/ตัดแต่ง/สูญเสีย (100 = ใช้ได้ทั้งหมด)' })}
    <div class="field"><span>ต้นทุนต่อหน่วยใช้</span><div class="value" id="ingPreview" style="font-size:20px;font-weight:700;padding-top:4px"></div></div>
    <div class="full">${fCheck('trackStock', 'ติดตามสต็อก (ตัดสต็อกอัตโนมัติเมื่อมีออเดอร์)', i.trackStock)}</div>
    ${fInput('stock', 'สต็อกคงเหลือ (หน่วยใช้)', i.stock, { type: 'number', min: '-999999', hint: 'แก้ตัวเลขนี้เมื่อนับสต็อกจริง' })}
    ${fInput('minStock', 'แจ้งเตือนเมื่อเหลือน้อยกว่า', i.minStock, { type: 'number' })}
  </div>
  ${datalist('ingCatList', ingCategories())}
  ${datalist('unitList', ['กรัม', 'มล.', 'ฟอง', 'ชิ้น', 'ลูก', 'ใบ', 'ช้อนชา'])}
  ${datalist('packList', ['กก.', 'กรัม', 'ลิตร', 'ขวด', 'แผง', 'แพ็ก', 'ถุง', 'กระสอบ', 'ลัง', 'กล่อง'])}`;
  const preview = (root) => {
    const f = readForm(root);
    $('#ingPreview', root).textContent = `${baht(ingUnitCost({ packPrice: f.packPrice, packSize: f.packSize, yield: f.yield }))} / ${f.unit || 'หน่วย'}`;
  };
  openModal({
    title: isNew ? 'เพิ่มวัตถุดิบ' : `แก้ไข: ${i.name}`, body,
    onMount: (root) => { preview(root); root.addEventListener('input', () => preview(root)); },
    onSave: (root) => {
      const f = readForm(root);
      if (!f.name.trim() || !f.unit.trim() || !(num(f.packSize) > 0)) { toast('กรุณากรอกชื่อ หน่วย และขนาดให้ครบ', 'error'); return false; }
      const y = num(f.yield);
      const rec = { name: f.name.trim(), category: f.category.trim(), unit: f.unit.trim(), packLabel: f.packLabel.trim(), packSize: num(f.packSize), packPrice: num(f.packPrice), yield: y > 0 && y <= 100 ? y : 100, trackStock: f.trackStock, stock: num(f.stock), minStock: num(f.minStock) };
      if (isNew) DB.ingredients.push({ id: uid(), ...rec }); else Object.assign(i, rec);
      commit(isNew ? 'เพิ่มวัตถุดิบแล้ว' : 'บันทึกแล้ว — ต้นทุนเมนูที่ใช้วัตถุดิบนี้อัปเดตอัตโนมัติ');
    },
  });
}

function purchaseModal(ingId) {
  if (!DB.ingredients.length) return toast('กรุณาเพิ่มวัตถุดิบก่อน', 'error');
  const sel = ingId || DB.ingredients[0].id;
  const body = `<div class="form-grid">
    ${fInput('date', 'วันที่ซื้อ', today(), { type: 'date' })}
    ${fSelect('ingredientId', 'วัตถุดิบ', DB.ingredients.map((i) => [i.id, `${i.name} (${i.packLabel || 'หน่วย'})`]), sel)}
    ${fInput('packs', 'จำนวนที่ซื้อ (หน่วยที่ซื้อ)', 1, { type: 'number', hint: '<span id="purUnit"></span>' })}
    ${fInput('total', 'ราคารวมที่จ่าย (บาท)', '', { type: 'number' })}
    ${fInput('note', 'หมายเหตุ / ร้านที่ซื้อ', '', { cls: 'full', placeholder: 'เช่น ตลาดไท, Makro' })}
    <div class="full">${fCheck('updatePrice', 'อัปเดตราคาวัตถุดิบเป็นราคาล่าสุดนี้ (แนะนำ)', true)}</div>
    <div class="full hint" id="purInfo"></div>
  </div>`;
  const info = (root) => {
    const f = readForm(root);
    const i = byId(DB.ingredients, f.ingredientId);
    $('#purUnit', root).textContent = `1 ${i.packLabel || 'หน่วย'} = ${fmt(i.packSize, 0)} ${i.unit}`;
    const per = num(f.packs) > 0 ? num(f.total) / num(f.packs) : 0;
    const diff = per && num(i.packPrice) ? (per - num(i.packPrice)) / num(i.packPrice) * 100 : 0;
    $('#purInfo', root).innerHTML = `ราคาเดิม ${baht(i.packPrice)}/${esc(i.packLabel || 'หน่วย')} → ราคาใหม่ <b>${baht(per)}</b> ${per && diff ? `<span class="badge ${diff > 0 ? 'bad' : 'good'}">${diff > 0 ? '▲' : '▼'} ${fmt(Math.abs(diff), 1)}%</span>` : ''}${i.trackStock ? ` · สต็อกจะเพิ่ม ${fmt(num(f.packs) * num(i.packSize), 0)} ${esc(i.unit)}` : ''}`;
  };
  openModal({
    title: '🛒 บันทึกการซื้อวัตถุดิบ', body,
    onMount: (root) => { info(root); root.addEventListener('input', () => info(root)); root.addEventListener('change', () => info(root)); },
    onSave: (root) => {
      const f = readForm(root);
      if (!(num(f.packs) > 0) || !(num(f.total) >= 0) || !f.date) { toast('กรุณากรอกจำนวนและราคา', 'error'); return false; }
      const i = byId(DB.ingredients, f.ingredientId);
      DB.purchases.push({ id: uid(), date: f.date, ingredientId: i.id, packs: num(f.packs), total: num(f.total), note: f.note.trim() });
      if (i.trackStock) i.stock = round2(num(i.stock) + num(f.packs) * num(i.packSize));
      if (f.updatePrice && num(f.total) > 0) i.packPrice = round2(num(f.total) / num(f.packs));
      commit('บันทึกการซื้อแล้ว');
    },
  });
}

/* =========================================================
 * หน้า: ค่าใช้จ่าย (ต่อหน่วย / รายเดือน)
 * ========================================================= */
function renderExpenses() {
  const unit = DB.expenses.filter((e) => e.type !== 'monthly');
  const monthly = DB.expenses.filter((e) => e.type === 'monthly');
  const usedIn = (id) => DB.menus.filter((m) => (m.expenses || []).some((r) => r.id === id)).length;
  const fixed = fixedMonthlyTotal();
  const dpm = num(DB.settings.dishesPerMonth);
  const rowBtns = (e) => `<td class="actions-cell"><button class="btn sm" data-editexp="${esc(e.id)}">แก้ไข</button> <button class="btn sm danger" data-delexp="${esc(e.id)}">ลบ</button></td>`;

  // ประมาณจำนวนจานต่อเดือนจริงจากยอดขาย 30 วันล่าสุด
  const a30 = aggregate(addDays(today(), -29), today(), { includeFixed: false });
  const actualDishes = a30.total.qty;

  main.innerHTML = `
  <div class="page-head">
    <div><h1>ค่าใช้จ่าย</h1><p>แยก 2 แบบ: <b>ต่อหน่วย</b> (คิดทุกจานที่ขาย เช่น กล่อง ถุง ช้อน) และ <b>รายเดือน</b> (ค่าแรง ค่าไฟ ค่าเช่า — ปันส่วนเข้าเมนู)</p></div>
    <div class="actions"><button class="btn" data-addexp="unit">＋ ค่าใช้จ่ายต่อหน่วย</button><button class="btn primary" data-addexp="monthly">＋ ค่าใช้จ่ายรายเดือน</button></div>
  </div>

  <div class="grid g3">
    <div class="card kpi"><div class="label">ค่าใช้จ่ายคงที่รวม/เดือน</div><div class="value">${baht0(fixed)}</div><div class="sub">เฉลี่ยวันละ ${baht(dailyFixed())}</div></div>
    <div class="card kpi"><div class="label">ปันส่วนเข้าเมนู/จาน</div><div class="value">${baht(dpm > 0 ? fixed / dpm : 0)}</div><div class="sub">คิดจาก ${fmt(dpm, 0)} จาน/เดือน</div></div>
    <div class="card kpi">
      <div class="label">จำนวนจานที่คาดว่าขายได้/เดือน</div>
      <div class="inline" style="margin-top:4px"><input class="input num" id="dpm" value="${esc(dpm)}" style="width:120px" inputmode="numeric"><button class="btn sm" id="saveDpm">บันทึก</button></div>
      <div class="sub">30 วันล่าสุดขายจริง ${fmt(actualDishes, 0)} จาน ${actualDishes ? `<button class="btn sm" id="useActual">ใช้ค่านี้</button>` : ''}</div>
    </div>
  </div>

  <div class="card">
    <h3>📦 ค่าใช้จ่ายต่อหน่วย <small>แพ็กเกจจิ้ง ค่าแก๊สต่อจาน ฯลฯ</small></h3>
    ${unit.length ? `<div class="table-wrap"><table>
      <thead><tr><th>รายการ</th><th>หมวด</th><th class="num">ราคาต่อหน่วย</th><th class="num">ใช้ใน</th><th></th></tr></thead>
      <tbody>${unit.map((e) => `<tr><td><b>${esc(e.name)}</b></td><td>${esc(e.category || '')}</td><td class="num">${baht(e.amount)} / ${esc(e.unit || 'หน่วย')}</td><td class="num small">${usedIn(e.id)} เมนู</td>${rowBtns(e)}</tr>`).join('')}</tbody>
    </table></div>` : emptyState('📦', 'ยังไม่มี — เช่น กล่องข้าว 3.50 บาท/ใบ, ถุง, ช้อนส้อม, สติ๊กเกอร์')}
  </div>

  <div class="card">
    <h3>🏠 ค่าใช้จ่ายรายเดือน (คงที่) <small>ค่าแรง ค่าไฟ ค่าน้ำ ค่าเช่า</small></h3>
    ${monthly.length ? `<div class="table-wrap"><table>
      <thead><tr><th>รายการ</th><th>หมวด</th><th class="num">ต่อเดือน</th><th class="num">ต่อวัน</th><th class="num">ปันส่วนต่อจาน</th><th class="num">สัดส่วน</th><th></th></tr></thead>
      <tbody>${monthly.map((e) => `<tr><td><b>${esc(e.name)}</b></td><td>${esc(e.category || '')}</td><td class="num">${baht(e.amount)}</td><td class="num">${baht(num(e.amount) * 12 / 365)}</td><td class="num">${baht(expUnitCost(e))}</td>
        <td><div class="meter"><i style="width:${fixed ? num(e.amount) / fixed * 100 : 0}%"></i></div></td>${rowBtns(e)}</tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">รวม</td><td class="num">${baht(fixed)}</td><td class="num">${baht(dailyFixed())}</td><td class="num">${baht(dpm > 0 ? fixed / dpm : 0)}</td><td colspan="2"></td></tr></tfoot>
    </table></div>` : emptyState('🏠', 'ยังไม่มี — เช่น ค่าแรง 15,000 บาท/เดือน, ค่าไฟ 2,500 บาท/เดือน')}
  </div>
  <div class="hint mt">💡 ค่าใช้จ่ายรายเดือนถูกใช้ 2 ที่: (1) <b>ปันส่วนเข้าต้นทุนเมนู</b> เพื่อช่วยตั้งราคาให้ครอบคลุมทุกค่าใช้จ่าย (2) <b>หักในรายงานกำไร/ขาดทุนตามจำนวนวันจริง</b> — รายงานไม่หักซ้ำจากต้นทุนเมนู</div>`;

  $('#saveDpm').onclick = () => { DB.settings.dishesPerMonth = Math.max(1, num($('#dpm').value)); commit('บันทึกแล้ว — ต้นทุนเมนูอัปเดต'); };
  const ua = $('#useActual'); if (ua) ua.onclick = () => { DB.settings.dishesPerMonth = Math.round(actualDishes); commit('ใช้จำนวนจานจริงแล้ว'); };
  main.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.addexp) expenseModal(null, b.dataset.addexp);
    else if (b.dataset.editexp) expenseModal(byId(DB.expenses, b.dataset.editexp));
    else if (b.dataset.delexp) {
      const x = byId(DB.expenses, b.dataset.delexp);
      const n = usedIn(x.id);
      if (!confirm(`ลบ "${x.name}"?${n ? `\nรายการนี้ใช้อยู่ใน ${n} เมนู และจะถูกนำออก` : ''}`)) return;
      DB.expenses = DB.expenses.filter((y) => y !== x);
      DB.menus.forEach((m) => { m.expenses = (m.expenses || []).filter((r) => r.id !== x.id); });
      commit('ลบแล้ว');
    }
  };
}

function expenseModal(x, type) {
  const isNew = !x;
  x = x || { name: '', type: type || 'unit', amount: '', unit: 'ใบ', category: '' };
  const body = `<div class="form-grid">
    ${fInput('name', 'ชื่อรายการ *', x.name, { placeholder: x.type === 'monthly' ? 'เช่น ค่าแรงพนักงาน' : 'เช่น กล่องข้าว' })}
    ${fSelect('type', 'ประเภท', [['unit', 'ต่อหน่วย (คิดทุกจาน)'], ['monthly', 'รายเดือน (คงที่ ปันส่วน)']], x.type)}
    ${fInput('amount', 'จำนวนเงิน (บาท) *', x.amount, { type: 'number', hint: 'ต่อหน่วย: ราคาต่อ 1 ชิ้น · รายเดือน: ยอดรวมต่อเดือน' })}
    ${fInput('unit', 'หน่วย (สำหรับแบบต่อหน่วย)', x.unit, { list: 'expUnitList', placeholder: 'ใบ, ชุด, จาน' })}
    ${fInput('category', 'หมวดหมู่', x.category, { cls: 'full', list: 'expCatList', placeholder: 'เช่น แพ็กเกจจิ้ง, ค่าแรง, สาธารณูปโภค' })}
  </div>
  ${datalist('expUnitList', ['ใบ', 'ชุด', 'จาน', 'ชิ้น', 'ดวง', 'คู่'])}
  ${datalist('expCatList', ['แพ็กเกจจิ้ง', 'ค่าแรง', 'สาธารณูปโภค', 'ค่าเช่า', 'อื่นๆ', ...DB.expenses.map((e) => e.category)])}`;
  openModal({
    title: isNew ? 'เพิ่มค่าใช้จ่าย' : `แก้ไข: ${x.name}`, body,
    onSave: (root) => {
      const f = readForm(root);
      if (!f.name.trim()) { toast('กรุณาใส่ชื่อรายการ', 'error'); return false; }
      const rec = { name: f.name.trim(), type: f.type, amount: num(f.amount), unit: f.unit.trim(), category: f.category.trim() };
      if (isNew) DB.expenses.push({ id: uid(), ...rec }); else Object.assign(x, rec);
      commit(isNew ? 'เพิ่มค่าใช้จ่ายแล้ว' : 'บันทึกแล้ว');
    },
  });
}

/* =========================================================
 * หน้า: ค่าโฆษณา (หักรายวัน)
 * ========================================================= */
function renderAds() {
  const A = UI.ads;
  const from = A.month + '-01', to = monthEnd(from);
  const list = DB.ads.filter((a) => a.date >= from && a.date <= to && (!A.channel || a.channelId === A.channel)).sort((a, b) => b.date.localeCompare(a.date));
  const agg = aggregate(from, to, { includeFixed: false });
  const total = list.reduce((s, a) => s + num(a.amount), 0);
  const days = new Set(list.map((a) => a.date)).size;

  main.innerHTML = `
  <div class="page-head">
    <div><h1>ค่าโฆษณา</h1><p>บันทึกค่าโฆษณาบนแอพเดลิเวอรี่ (หักเป็นรายวัน) ระบบนำไปหักในรายงานกำไร/ขาดทุนอัตโนมัติ</p></div>
    <div class="actions"><button class="btn primary" id="addAd">＋ บันทึกค่าโฆษณา</button></div>
  </div>
  <div class="filters" id="adFilters">
    ${fInput('month', 'เดือน', A.month, { type: 'month' })}
    ${fSelect('channel', 'ช่องทาง', [['', 'ทุกช่องทาง'], ...DB.channels.map((c) => [c.id, c.name])], A.channel)}
  </div>
  <div class="grid g3">
    <div class="card kpi"><div class="label">ค่าโฆษณารวมเดือนนี้</div><div class="value">${baht(total)}</div><div class="sub">${days} วันที่มีโฆษณา</div></div>
    <div class="card kpi"><div class="label">เฉลี่ยต่อวัน</div><div class="value">${baht(days ? total / days : 0)}</div></div>
    <div class="card kpi"><div class="label">ค่าโฆษณาต่อยอดขาย (ทั้งร้าน)</div><div class="value">${agg.total.subtotal ? pct(agg.total.ads / agg.total.subtotal * 100) : '-'}</div><div class="sub">ควรไม่เกิน 5–10% ของยอดขาย</div></div>
  </div>

  <div class="grid g-21" style="margin-top:16px">
    <div class="card">
      <h3>รายการค่าโฆษณา</h3>
      ${list.length ? `<div class="table-wrap"><table>
        <thead><tr><th>วันที่</th><th>ช่องทาง</th><th class="num">จำนวนเงิน</th><th>หมายเหตุ</th><th></th></tr></thead>
        <tbody>${list.map((a) => `<tr><td>${esc(thDate(a.date))}</td><td>${esc(channelById(a.channelId).name)}</td><td class="num">${baht(a.amount)}</td><td class="small">${esc(a.note || '')}</td>
          <td class="actions-cell"><button class="btn sm" data-editad="${esc(a.id)}">แก้ไข</button> <button class="btn sm danger" data-delad="${esc(a.id)}">ลบ</button></td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="2">รวม</td><td class="num">${baht(total)}</td><td colspan="2"></td></tr></tfoot>
      </table></div>` : emptyState('📣', 'ยังไม่มีค่าโฆษณาในเดือนนี้')}
    </div>
    <div class="card">
      <h3>ความคุ้มค่าโฆษณาแยกช่องทาง</h3>
      ${agg.channels.filter((c) => c.ads > 0).length ? `<div class="table-wrap"><table>
        <thead><tr><th>ช่องทาง</th><th class="num">ค่าโฆษณา</th><th class="num">ยอดขาย</th><th class="num">% Ads</th><th class="num">ROAS</th></tr></thead>
        <tbody>${agg.channels.filter((c) => c.ads > 0).map((c) => `<tr><td>${esc(c.name)}</td><td class="num">${baht0(c.ads)}</td><td class="num">${baht0(c.subtotal)}</td>
          <td class="num">${c.subtotal ? pct(c.ads / c.subtotal * 100) : '-'}</td><td class="num">${fmt(c.subtotal / c.ads, 1)}x</td></tr>`).join('')}</tbody>
      </table></div><p class="small muted">ROAS = ยอดขาย ÷ ค่าโฆษณา (ยิ่งสูงยิ่งคุ้ม)</p>` : '<div class="muted small">ยังไม่มีข้อมูล</div>'}
    </div>
  </div>`;

  const f = $('#adFilters');
  f.addEventListener('change', () => { Object.assign(A, readForm(f)); if (!A.month) A.month = today().slice(0, 7); renderAds(); });
  $('#addAd').onclick = () => adModal();
  main.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.editad) adModal(byId(DB.ads, b.dataset.editad));
    else if (b.dataset.delad) { if (!confirm('ลบรายการนี้?')) return; DB.ads = DB.ads.filter((a) => a.id !== b.dataset.delad); commit('ลบแล้ว'); }
  };
}

function adModal(a) {
  const isNew = !a;
  const chs = DB.channels.filter((c) => c.active !== false);
  const def = chs.find((c) => num(c.gp) > 0) || chs[0];
  a = a || { date: today(), channelId: def ? def.id : '', amount: '', note: '' };
  const body = `<div class="form-grid">
    ${fInput('from', isNew ? 'ตั้งแต่วันที่' : 'วันที่', a.date, { type: 'date' })}
    ${isNew ? fInput('to', 'ถึงวันที่', a.date, { type: 'date', hint: 'เลือกหลายวัน = บันทึกวันละเท่ากันทุกวัน' }) : '<div></div>'}
    ${fSelect('channelId', 'ช่องทาง', DB.channels.map((c) => [c.id, c.name]), a.channelId)}
    ${fInput('amount', 'ค่าโฆษณาต่อวัน (บาท) *', a.amount, { type: 'number' })}
    ${fInput('note', 'หมายเหตุ', a.note, { cls: 'full', placeholder: 'เช่น โปรโมทร้าน, Boost, แบนเนอร์' })}
    <div class="full hint" id="adInfo"></div>
  </div>`;
  const info = (root) => {
    if (!isNew) return;
    const f = readForm(root);
    const n = f.from && f.to && f.to >= f.from ? daysBetween(f.from, f.to) : 0;
    $('#adInfo', root).textContent = n ? `จะบันทึก ${n} วัน × ${baht(f.amount)} = ${baht(n * num(f.amount))}` : 'ช่วงวันที่ไม่ถูกต้อง';
  };
  openModal({
    title: isNew ? '📣 บันทึกค่าโฆษณา' : 'แก้ไขค่าโฆษณา', body,
    onMount: (root) => { info(root); root.addEventListener('input', () => info(root)); root.addEventListener('change', () => info(root)); },
    onSave: (root) => {
      const f = readForm(root);
      if (!(num(f.amount) > 0) || !f.from) { toast('กรุณาใส่จำนวนเงินและวันที่', 'error'); return false; }
      if (!isNew) { Object.assign(a, { date: f.from, channelId: f.channelId, amount: num(f.amount), note: f.note.trim() }); return commit('บันทึกแล้ว'); }
      if (!f.to || f.to < f.from) { toast('ช่วงวันที่ไม่ถูกต้อง', 'error'); return false; }
      const n = daysBetween(f.from, f.to);
      if (n > 366) { toast('บันทึกได้ครั้งละไม่เกิน 366 วัน', 'error'); return false; }
      for (let k = 0; k < n; k++) DB.ads.push({ id: uid() + k, date: addDays(f.from, k), channelId: f.channelId, amount: num(f.amount), note: f.note.trim() });
      commit(`บันทึกค่าโฆษณา ${n} วันแล้ว`);
    },
  });
}

/* =========================================================
 * หน้า: รายงานกำไร/ขาดทุน
 * ========================================================= */
function renderReports() {
  const R = UI.report;
  const agg = aggregate(R.from, R.to, { includeFixed: R.includeFixed });
  const t = agg.total;
  const p = (v) => (t.subtotal ? ` <span class="muted small">(${pct(v / t.subtotal * 100)})</span>` : '');
  const row = (label, v, cls = '', showPct = true) => `<div class="row ${cls}"><span>${label}</span><span>${baht(v)}${showPct ? p(Math.abs(v)) : ''}</span></div>`;
  const gross = t.netRevenue - t.varCost - t.extra;

  // ข้อสังเกตอัตโนมัติ
  const insights = [];
  if (t.subtotal) {
    const gpPct = (t.gp + t.shopDisc) / t.subtotal * 100;
    if (gpPct > 35) insights.push(['warn', `GP + ส่วนลดรวมกันกิน <b>${pct(gpPct)}</b> ของยอดขาย — ลองปรับราคาบนแอพ หรือลดโปรที่ร้านออกเอง`]);
    const fc = t.varCost / t.subtotal * 100;
    if (fc > num(DB.settings.targetFoodCost)) insights.push(['warn', `Food cost เฉลี่ย <b>${pct(fc)}</b> สูงกว่าเป้า ${pct(DB.settings.targetFoodCost)}`]);
    const ad = t.ads / t.subtotal * 100;
    if (ad > 10) insights.push(['warn', `ค่าโฆษณาคิดเป็น <b>${pct(ad)}</b> ของยอดขาย ค่อนข้างสูง`]);
    const worst = agg.menus.filter((m) => m.qty > 0).sort((a, b) => a.contribution / a.sales - b.contribution / b.sales)[0];
    if (worst && worst.contribution / worst.sales < 0.2) insights.push(['bad', `เมนู <b>${esc(worst.name)}</b> ทำกำไรขั้นต้นต่ำสุด (${pct(worst.contribution / worst.sales * 100)} ของยอดขาย)`]);
    const best = [...agg.channels].sort((a, b) => b.net / (b.subtotal || 1) - a.net / (a.subtotal || 1))[0];
    if (best && best.subtotal) insights.push(['good', `ช่องทางที่กำไรดีที่สุด (ต่อยอดขาย): <b>${esc(best.name)}</b> ${pct(best.net / best.subtotal * 100)}`]);
    if (t.net >= 0) insights.push(['good', `ช่วงนี้มีกำไรสุทธิ <b>${baht(t.net)}</b> (${pct(t.net / t.subtotal * 100)})`]);
    else insights.push(['bad', `ช่วงนี้ขาดทุนสุทธิ <b>${baht(-t.net)}</b>`]);
  }

  main.innerHTML = `
  <div class="page-head">
    <div><h1>รายงานกำไร/ขาดทุน</h1><p>${esc(thDate(R.from))} – ${esc(thDate(R.to))} · ${t.nDays} วัน</p></div>
    <div class="actions"><button class="btn" id="exportDaily">⬇️ CSV รายวัน</button><button class="btn" id="exportMenus">⬇️ CSV รายเมนู</button><button class="btn" onclick="print()">🖨️ พิมพ์</button></div>
  </div>
  <div class="filters" id="repFilters">
    <div class="seg" id="presets">
      ${[['today', 'วันนี้'], ['yesterday', 'เมื่อวาน'], ['7', '7 วัน'], ['30', '30 วัน'], ['month', 'เดือนนี้'], ['lastmonth', 'เดือนก่อน']].map(([k, l]) => `<button data-p="${k}" class="${R.preset === k ? 'on' : ''}">${l}</button>`).join('')}
    </div>
    ${fInput('from', 'ตั้งแต่', R.from, { type: 'date' })}
    ${fInput('to', 'ถึง', R.to, { type: 'date' })}
    <div style="align-self:flex-end;padding-bottom:8px">${fCheck('includeFixed', 'หักค่าใช้จ่ายคงที่ (ค่าแรง/ค่าเช่า/ค่าไฟ)', R.includeFixed)}</div>
  </div>

  <div class="grid g4">
    <div class="card kpi"><div class="label">ยอดขาย</div><div class="value">${baht0(t.subtotal)}</div><div class="sub">${t.orders} ออเดอร์ · ${fmt(t.qty, 0)} จาน</div></div>
    <div class="card kpi"><div class="label">กำไรขั้นต้น</div><div class="value ${signCls(gross)}">${baht0(gross)}</div><div class="sub">หลัง GP ส่วนลด ต้นทุนวัตถุดิบ</div></div>
    <div class="card kpi"><div class="label">ค่าโฆษณา + ค่าคงที่</div><div class="value">${baht0(t.ads + t.fixed)}</div><div class="sub">โฆษณา ${baht0(t.ads)} · คงที่ ${baht0(t.fixed)}</div></div>
    <div class="card kpi"><div class="label">${t.net >= 0 ? 'กำไรสุทธิ' : 'ขาดทุนสุทธิ'}</div><div class="value ${signCls(t.net)}">${baht0(t.net)}</div><div class="sub">${t.subtotal ? pct(t.net / t.subtotal * 100) + ' ของยอดขาย' : ''}</div></div>
  </div>

  <div class="grid g2" style="margin-top:16px">
    <div class="card">
      <h3>งบกำไรขาดทุน</h3>
      <div class="pl">
        ${row('ยอดขาย (ราคาอาหารก่อนส่วนลด)', t.subtotal, 'total', false)}
        ${row('หัก ส่วนลดที่ร้านออก', -t.shopDisc, 'sub')}
        ${t.platDisc ? `<div class="row sub"><span>ส่วนลดที่แอพออกให้ (ไม่กระทบร้าน)</span><span class="muted">${baht(t.platDisc)}</span></div>` : ''}
        ${row('หัก ค่า GP แอพเดลิเวอรี่ (รวม VAT)', -t.gp, 'sub')}
        ${row('รายรับสุทธิที่ร้านได้', t.netRevenue, 'total')}
        ${row('หัก ต้นทุนวัตถุดิบ + แพ็กเกจ', -t.varCost, 'sub')}
        ${t.extra ? row('หัก ค่าใช้จ่ายเพิ่มรายบิล', -t.extra, 'sub') : ''}
        ${row('กำไรขั้นต้น', gross, 'total')}
        ${row('หัก ค่าโฆษณา', -t.ads, 'sub')}
        ${R.includeFixed ? row(`หัก ค่าใช้จ่ายคงที่ (${t.nDays} วัน × ${baht(dailyFixed())})`, -t.fixed, 'sub') : ''}
        <div class="row grand"><span>${t.net >= 0 ? 'กำไรสุทธิ' : 'ขาดทุนสุทธิ'}</span><span class="${signCls(t.net)}">${baht(t.net)}</span></div>
      </div>
    </div>
    <div class="card">
      <h3>ข้อสังเกต</h3>
      ${insights.length ? insights.map(([c, txt]) => `<div class="alert ${c}">${c === 'good' ? '✅' : c === 'bad' ? '🔻' : '⚠️'} <div>${txt}</div></div>`).join('') : '<div class="muted small">ยังไม่มีข้อมูลในช่วงนี้</div>'}
    </div>
  </div>

  <div class="card">
    <h3>ยอดขาย &amp; กำไรสุทธิรายวัน</h3>
    ${chartLegend()}
    ${agg.days.length <= 92 ? chartSlot('report', agg.days) : '<div class="muted small">ช่วงเวลายาวเกินไปสำหรับกราฟ (สูงสุด 92 วัน) — ดูตารางด้านล่าง</div>'}
  </div>

  <div class="grid g2">
    <div class="card"><h3>แยกตามช่องทาง</h3>${agg.channels.length ? channelTable(agg) : emptyState('🛵', 'ไม่มีข้อมูล')}</div>
    <div class="card">
      <h3>แยกตามเมนู</h3>
      ${agg.menus.length ? `<div class="table-wrap"><table>
        <thead><tr><th>เมนู</th><th class="num">จำนวน</th><th class="num">ยอดขาย</th><th class="num">ต้นทุน</th><th class="num">กำไรขั้นต้น</th><th class="num">%</th></tr></thead>
        <tbody>${agg.menus.map((m) => `<tr><td>${esc(m.name)}</td><td class="num">${fmt(m.qty, 0)}</td><td class="num">${baht0(m.sales)}</td><td class="num">${baht0(m.varCost)}</td><td class="num ${signCls(m.contribution)}">${baht0(m.contribution)}</td><td class="num">${m.sales ? fmt(m.contribution / m.sales * 100, 0) + '%' : '-'}</td></tr>`).join('')}</tbody>
      </table></div><p class="small muted">กำไรขั้นต้นต่อเมนู = ส่วนแบ่งรายรับหลัง GP/ส่วนลด − ต้นทุนวัตถุดิบ+แพ็กเกจ</p>` : emptyState('🍽️', 'ไม่มีข้อมูล')}
    </div>
  </div>

  <div class="card">
    <h3>ตารางรายวัน</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>วันที่</th><th class="num">ออเดอร์</th><th class="num">ยอดขาย</th><th class="num">ส่วนลดร้าน</th><th class="num">GP</th><th class="num">ต้นทุน</th><th class="num">โฆษณา</th><th class="num">คงที่</th><th class="num">กำไรสุทธิ</th></tr></thead>
      <tbody>${[...agg.days].reverse().map((d) => `<tr><td>${esc(thDate(d.date))}</td><td class="num">${d.orders}</td><td class="num">${baht0(d.subtotal)}</td><td class="num">${baht0(d.shopDisc)}</td><td class="num">${baht0(d.gp)}</td><td class="num">${baht0(d.varCost + d.extra)}</td><td class="num">${baht0(d.ads)}</td><td class="num">${baht0(d.fixed)}</td><td class="num ${signCls(d.net)}"><b>${baht0(d.net)}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><td>รวม</td><td class="num">${t.orders}</td><td class="num">${baht0(t.subtotal)}</td><td class="num">${baht0(t.shopDisc)}</td><td class="num">${baht0(t.gp)}</td><td class="num">${baht0(t.varCost + t.extra)}</td><td class="num">${baht0(t.ads)}</td><td class="num">${baht0(t.fixed)}</td><td class="num ${signCls(t.net)}">${baht0(t.net)}</td></tr></tfoot>
    </table></div>
  </div>`;

  $$('#presets button').forEach((b) => b.onclick = () => {
    const k = b.dataset.p, td = today();
    R.preset = k;
    if (k === 'today') { R.from = R.to = td; }
    else if (k === 'yesterday') { R.from = R.to = addDays(td, -1); }
    else if (k === '7') { R.from = addDays(td, -6); R.to = td; }
    else if (k === '30') { R.from = addDays(td, -29); R.to = td; }
    else if (k === 'month') { R.from = monthStart(td); R.to = td; }
    else if (k === 'lastmonth') { const lm = addDays(monthStart(td), -1); R.from = monthStart(lm); R.to = lm; }
    renderReports();
  });
  const f = $('#repFilters');
  f.addEventListener('change', (e) => {
    const v = readForm(f);
    if (e.target.name === 'includeFixed') R.includeFixed = v.includeFixed;
    else { R.preset = ''; R.from = v.from || R.from; R.to = v.to || R.to; if (R.to < R.from) R.to = R.from; }
    renderReports();
  });
  $('#exportDaily').onclick = () => {
    const rows = [['วันที่', 'ออเดอร์', 'จำนวนจาน', 'ยอดขาย', 'ส่วนลดร้าน', 'ส่วนลดแอพ', 'GP', 'รายรับสุทธิ', 'ต้นทุนวัตถุดิบ+แพ็กเกจ', 'ค่าใช้จ่ายเพิ่ม', 'ค่าโฆษณา', 'ค่าคงที่', 'กำไรสุทธิ']];
    agg.days.forEach((d) => rows.push([d.date, d.orders, d.qty, round2(d.subtotal), round2(d.shopDisc), round2(d.platDisc), round2(d.gp), round2(d.netRevenue), round2(d.varCost), round2(d.extra), round2(d.ads), round2(d.fixed), round2(d.net)]));
    downloadFile(`pnl_${R.from}_${R.to}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
  };
  $('#exportMenus').onclick = () => {
    const rows = [['เมนู', 'จำนวน', 'ยอดขาย', 'รายรับหลัง GP/ส่วนลด', 'ต้นทุน', 'กำไรขั้นต้น']];
    agg.menus.forEach((m) => rows.push([m.name, m.qty, round2(m.sales), round2(m.net), round2(m.varCost), round2(m.contribution)]));
    downloadFile(`menus_${R.from}_${R.to}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
  };
  drawCharts();
}

/* =========================================================
 * หน้า: ตั้งค่า
 * ========================================================= */
function renderSettings() {
  const S = DB.settings;
  const theme = (() => { try { return localStorage.getItem('rms-theme') || 'auto'; } catch (e) { return 'auto'; } })();
  main.innerHTML = `
  <div class="page-head"><div><h1>ตั้งค่า</h1><p>ข้อมูลร้าน ช่องทางขาย ค่า GP และการสำรองข้อมูล</p></div></div>

  <div class="grid g2">
    <div class="card">
      <h3>ข้อมูลร้าน &amp; เป้าหมาย</h3>
      <div class="form-grid" id="shopForm">
        ${fInput('shopName', 'ชื่อร้าน', S.shopName, { cls: 'full' })}
        ${fInput('targetFoodCost', 'Food cost เป้าหมาย (%)', S.targetFoodCost, { type: 'number', hint: 'ร้านเดลิเวอรี่ทั่วไป 30–40%' })}
        ${fInput('targetMargin', 'กำไรเป้าหมายต่อจาน (%)', S.targetMargin, { type: 'number', hint: 'ใช้คำนวณราคาแนะนำ' })}
        ${fInput('dishesPerMonth', 'จำนวนจานที่คาดว่าขาย/เดือน', S.dishesPerMonth, { type: 'number', hint: 'ใช้ปันส่วนค่าใช้จ่ายรายเดือน' })}
        ${fSelect('theme', 'ธีมหน้าจอ', [['auto', 'ตามระบบ'], ['light', 'สว่าง'], ['dark', 'มืด']], theme)}
      </div>
      <div class="actions mt"><button class="btn primary" id="saveShop">บันทึก</button></div>
    </div>

    <div class="card">
      <h3>สำรอง &amp; กู้คืนข้อมูล</h3>
      <p class="small muted" style="margin-top:0">ข้อมูลทั้งหมดเก็บไว้ในเบราว์เซอร์เครื่องนี้ ควรสำรองข้อมูลเป็นประจำ (เช่น ทุกสัปดาห์) หรือใช้ไฟล์สำรองเพื่อย้ายไปเครื่องอื่น</p>
      <div class="actions">
        <button class="btn primary" id="backup">⬇️ ดาวน์โหลดไฟล์สำรอง</button>
        <label class="btn">⬆️ กู้คืนจากไฟล์<input type="file" id="restore" accept="application/json,.json" hidden></label>
      </div>
      <div class="section-title">ข้อมูลตัวอย่าง &amp; ล้างข้อมูล</div>
      <div class="actions">
        <button class="btn" id="demo">โหลดข้อมูลตัวอย่าง</button>
        <button class="btn danger" id="wipe">ล้างข้อมูลทั้งหมด</button>
      </div>
      <p class="small muted">ข้อมูลปัจจุบัน: เมนู ${DB.menus.length} · วัตถุดิบ ${DB.ingredients.length} · ออเดอร์ ${DB.orders.length} · ค่าโฆษณา ${DB.ads.length} รายการ</p>
    </div>
  </div>

  <div class="card">
    <h3>ช่องทางขาย &amp; ค่า GP <small>แก้ไขแล้วกดบันทึก — มีผลกับออเดอร์ใหม่เท่านั้น ออเดอร์เก่าใช้ค่า GP ณ วันที่บันทึก</small></h3>
    <div class="table-wrap"><table id="chTable">
      <thead><tr><th>ชื่อช่องทาง</th><th class="num">GP (%)</th><th>คิด VAT 7% บน GP</th><th>คิด GP จากยอดก่อนหักส่วนลดร้าน</th><th>เปิดใช้</th><th></th></tr></thead>
      <tbody>${DB.channels.map((c) => `<tr data-id="${esc(c.id)}">
        <td><input class="input" data-f="name" value="${esc(c.name)}" style="min-width:130px"></td>
        <td><input class="input num" data-f="gp" value="${esc(c.gp)}" style="width:80px" inputmode="decimal"></td>
        <td><input type="checkbox" data-f="vatOnGp" ${c.vatOnGp ? 'checked' : ''}></td>
        <td><input type="checkbox" data-f="gpBeforeDiscount" ${c.gpBeforeDiscount ? 'checked' : ''}></td>
        <td><input type="checkbox" data-f="active" ${c.active !== false ? 'checked' : ''}></td>
        <td class="actions-cell"><button class="btn sm danger" data-delch="${esc(c.id)}">ลบ</button></td></tr>`).join('')}</tbody>
    </table></div>
    <div class="actions mt"><button class="btn" id="addCh">＋ เพิ่มช่องทาง</button><button class="btn primary" id="saveCh">บันทึกช่องทาง</button></div>
    <div class="hint mt">💡 ตรวจสอบ % GP ตามสัญญาของร้านคุณกับแต่ละแอพ (มักอยู่ราว 25–35% และบางแอพเรียกเก็บ VAT 7% บนค่า GP เพิ่ม) · ถ้าแอพคิด GP จากราคาเต็มแม้ร้านจะออกส่วนลดเอง ให้ติ๊ก "คิด GP จากยอดก่อนหักส่วนลด"</div>
  </div>`;

  $('#saveShop').onclick = () => {
    const f = readForm($('#shopForm'));
    Object.assign(S, { shopName: f.shopName.trim() || 'ร้านของฉัน', targetFoodCost: num(f.targetFoodCost), targetMargin: num(f.targetMargin), dishesPerMonth: Math.max(1, num(f.dishesPerMonth)) });
    try { localStorage.setItem('rms-theme', f.theme); } catch (e) { /* ignore */ }
    applyTheme();
    commit('บันทึกการตั้งค่าแล้ว');
  };
  const readChannels = () => $$('#chTable tbody tr').forEach((tr) => {
    const c = byId(DB.channels, tr.dataset.id);
    if (!c) return;
    c.name = $('[data-f=name]', tr).value.trim() || c.name;
    c.gp = num($('[data-f=gp]', tr).value);
    c.vatOnGp = $('[data-f=vatOnGp]', tr).checked;
    c.gpBeforeDiscount = $('[data-f=gpBeforeDiscount]', tr).checked;
    c.active = $('[data-f=active]', tr).checked;
  });
  $('#saveCh').onclick = () => { readChannels(); commit('บันทึกช่องทางแล้ว'); };
  $('#addCh').onclick = () => { readChannels(); DB.channels.push({ id: uid(), name: 'ช่องทางใหม่', gp: 0, vatOnGp: false, gpBeforeDiscount: true, active: true }); commit(); };
  $$('[data-delch]').forEach((b) => b.onclick = () => {
    const used = DB.orders.some((o) => o.channelId === b.dataset.delch);
    if (used) return toast('ช่องทางนี้มีออเดอร์อยู่ — ให้ปิดการใช้งานแทนการลบ', 'error');
    if (!confirm('ลบช่องทางนี้?')) return;
    readChannels();
    DB.channels = DB.channels.filter((c) => c.id !== b.dataset.delch);
    commit('ลบแล้ว');
  });
  $('#backup').onclick = () => downloadFile(`backup_${today()}.json`, JSON.stringify(DB, null, 2), 'application/json');
  $('#restore').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    file.text().then((txt) => {
      let data;
      try { data = JSON.parse(txt); } catch (err) { return toast('ไฟล์ไม่ถูกต้อง', 'error'); }
      if (!data || !Array.isArray(data.menus) || !Array.isArray(data.orders)) return toast('ไฟล์ไม่ใช่ไฟล์สำรองของระบบนี้', 'error');
      if (!confirm('กู้คืนข้อมูลจากไฟล์? ข้อมูลปัจจุบันจะถูกแทนที่ทั้งหมด')) return;
      Store.replace(data);
      toast('กู้คืนข้อมูลแล้ว');
      render();
    });
  };
  $('#demo').onclick = () => {
    if ((DB.orders.length || DB.menus.length) && !confirm('โหลดข้อมูลตัวอย่าง? ข้อมูลปัจจุบันจะถูกแทนที่ (แนะนำให้สำรองข้อมูลก่อน)')) return;
    Store.replace(buildDemoData()); UI.pos = null; toast('โหลดข้อมูลตัวอย่างแล้ว'); render();
  };
  $('#wipe').onclick = () => {
    if (!confirm('ล้างข้อมูลทั้งหมด? ไม่สามารถย้อนกลับได้ (แนะนำให้สำรองข้อมูลก่อน)')) return;
    Store.reset(); UI.pos = null; toast('ล้างข้อมูลแล้ว'); render();
  };
}

/* ---------- Theme ---------- */
function applyTheme() {
  let t = 'auto';
  try { t = localStorage.getItem('rms-theme') || 'auto'; } catch (e) { /* ignore */ }
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

/* ---------- Router ---------- */
const PAGES = {
  dashboard: renderDashboard, orders: renderOrders, menus: renderMenus, ingredients: renderIngredients,
  expenses: renderExpenses, ads: renderAds, reports: renderReports, settings: renderSettings,
};
let lastPage = null;
function render() {
  const page = PAGES[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard';
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
  $('#shopName').textContent = DB.settings.shopName;
  document.title = `${DB.settings.shopName} · ระบบจัดการร้านเดลิเวอรี่`;
  main.onclick = null;
  hideTip();
  PAGES[page]();
  if (page !== lastPage) { scrollTo(0, 0); lastPage = page; }
}
addEventListener('hashchange', render);
addEventListener('storage', (e) => { if (e.key === DB_KEY) { Store.load(); render(); } });

Store.load();
applyTheme();
render();
