'use strict';
/* ข้อมูลตัวอย่าง สำหรับทดลองใช้งานระบบ */
function buildDemoData() {
  const d = defaultData();
  d.settings.shopName = 'ครัวป้าแดง เดลิเวอรี่';
  d.settings.dishesPerMonth = 1200;

  const ing = (id, name, category, unit, packPrice, packSize, packLabel, yieldPct, stock, minStock) =>
    ({ id, name, category, unit, packPrice, packSize, packLabel, yield: yieldPct, trackStock: true, stock, minStock });
  d.ingredients = [
    ing('i-pork', 'หมูสับ', 'เนื้อสัตว์', 'กรัม', 150, 1000, 'กก.', 100, 4200, 2000),
    ing('i-porksl', 'หมูสไลซ์', 'เนื้อสัตว์', 'กรัม', 170, 1000, 'กก.', 95, 3000, 1500),
    ing('i-chick', 'อกไก่', 'เนื้อสัตว์', 'กรัม', 95, 1000, 'กก.', 90, 2500, 1500),
    ing('i-rice', 'ข้าวสาร', 'ของแห้ง', 'กรัม', 1050, 49000, 'กระสอบ 49 กก.', 100, 30000, 10000),
    ing('i-egg', 'ไข่ไก่', 'ของสด', 'ฟอง', 120, 30, 'แผง', 97, 90, 60),
    ing('i-basil', 'ใบกะเพรา', 'ผัก', 'กรัม', 60, 1000, 'กก.', 70, 800, 500),
    ing('i-garlic', 'กระเทียม', 'ผัก', 'กรัม', 80, 1000, 'กก.', 85, 1500, 500),
    ing('i-chili', 'พริกขี้หนู', 'ผัก', 'กรัม', 120, 1000, 'กก.', 90, 400, 300),
    ing('i-kale', 'คะน้า', 'ผัก', 'กรัม', 50, 1000, 'กก.', 75, 1200, 800),
    ing('i-noodle', 'เส้นใหญ่', 'ของแห้ง', 'กรัม', 40, 1000, 'กก.', 100, 3000, 2000),
    ing('i-oil', 'น้ำมันพืช', 'เครื่องปรุง', 'มล.', 55, 1000, 'ขวด 1 ลิตร', 100, 6000, 2000),
    ing('i-sauce', 'ซอสปรุงรส (รวม)', 'เครื่องปรุง', 'มล.', 45, 700, 'ขวด', 100, 3500, 1000),
  ];

  const exp = (id, name, type, amount, unit, category) => ({ id, name, type, amount, unit, category });
  d.expenses = [
    exp('e-box', 'กล่องข้าว (กระดาษ)', 'unit', 3.5, 'ใบ', 'แพ็กเกจจิ้ง'),
    exp('e-bag', 'ถุงหิ้ว', 'unit', 0.6, 'ใบ', 'แพ็กเกจจิ้ง'),
    exp('e-spoon', 'ช้อนส้อมพลาสติก', 'unit', 0.8, 'ชุด', 'แพ็กเกจจิ้ง'),
    exp('e-sticker', 'สติ๊กเกอร์ปิดกล่อง', 'unit', 0.3, 'ดวง', 'แพ็กเกจจิ้ง'),
    exp('e-gas', 'ค่าแก๊สหุงต้ม (ต่อจาน)', 'unit', 1.2, 'จาน', 'สาธารณูปโภค'),
    exp('e-labor', 'ค่าแรงพนักงาน', 'monthly', 12000, '', 'ค่าแรง'),
    exp('e-rent', 'ค่าเช่าร้าน', 'monthly', 5000, '', 'ค่าเช่า'),
    exp('e-elec', 'ค่าไฟฟ้า', 'monthly', 2800, '', 'สาธารณูปโภค'),
    exp('e-water', 'ค่าน้ำประปา', 'monthly', 350, '', 'สาธารณูปโภค'),
    exp('e-net', 'ค่าอินเทอร์เน็ต/มือถือ', 'monthly', 600, '', 'อื่นๆ'),
  ];
  const pack = [{ id: 'e-box', qty: 1 }, { id: 'e-bag', qty: 1 }, { id: 'e-spoon', qty: 1 }, { id: 'e-sticker', qty: 1 }, { id: 'e-gas', qty: 1 }];
  const overhead = [{ id: 'e-labor', qty: 1 }, { id: 'e-rent', qty: 1 }, { id: 'e-elec', qty: 1 }, { id: 'e-water', qty: 1 }, { id: 'e-net', qty: 1 }];

  d.menus = [
    { id: 'm-kaprao', name: 'กะเพราหมูสับไข่ดาว', category: 'จานเดียว', price: 69, channelPrices: { grab: 89, lineman: 89, shopee: 89 }, active: true,
      ingredients: [{ id: 'i-pork', qty: 100 }, { id: 'i-rice', qty: 110 }, { id: 'i-egg', qty: 1 }, { id: 'i-basil', qty: 15 }, { id: 'i-garlic', qty: 8 }, { id: 'i-chili', qty: 5 }, { id: 'i-oil', qty: 25 }, { id: 'i-sauce', qty: 15 }],
      expenses: [...pack, ...overhead] },
    { id: 'm-friedrice', name: 'ข้าวผัดหมู', category: 'จานเดียว', price: 65, channelPrices: { grab: 85, lineman: 85, shopee: 85 }, active: true,
      ingredients: [{ id: 'i-porksl', qty: 80 }, { id: 'i-rice', qty: 140 }, { id: 'i-egg', qty: 1 }, { id: 'i-garlic', qty: 5 }, { id: 'i-oil', qty: 20 }, { id: 'i-sauce', qty: 15 }],
      expenses: [...pack, ...overhead] },
    { id: 'm-seeew', name: 'ผัดซีอิ๊วหมู', category: 'เส้น', price: 69, channelPrices: { grab: 89, lineman: 89, shopee: 89 }, active: true,
      ingredients: [{ id: 'i-porksl', qty: 80 }, { id: 'i-noodle', qty: 180 }, { id: 'i-egg', qty: 1 }, { id: 'i-kale', qty: 50 }, { id: 'i-garlic', qty: 5 }, { id: 'i-oil', qty: 20 }, { id: 'i-sauce', qty: 20 }],
      expenses: [...pack, ...overhead] },
    { id: 'm-garlicchick', name: 'ไก่ทอดกระเทียม', category: 'จานเดียว', price: 65, channelPrices: { grab: 85, lineman: 85, shopee: 85 }, active: true,
      ingredients: [{ id: 'i-chick', qty: 110 }, { id: 'i-rice', qty: 110 }, { id: 'i-garlic', qty: 20 }, { id: 'i-oil', qty: 40 }, { id: 'i-sauce', qty: 10 }],
      expenses: [...pack, ...overhead] },
    { id: 'm-egg', name: 'ไข่ดาวเพิ่ม', category: 'ท็อปปิ้ง', price: 12, channelPrices: { grab: 15, lineman: 15, shopee: 15 }, active: true,
      ingredients: [{ id: 'i-egg', qty: 1 }, { id: 'i-oil', qty: 10 }], expenses: [] },
  ];

  // ออเดอร์ย้อนหลัง 30 วัน (สุ่มแบบกำหนดค่าเริ่มต้น เพื่อให้ได้ผลเหมือนเดิมทุกครั้ง)
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const t = today();
  const chWeights = ['grab', 'grab', 'grab', 'lineman', 'lineman', 'shopee', 'robinhood', 'walkin', 'walkin'];
  const mainMenus = d.menus.filter((m) => m.category !== 'ท็อปปิ้ง');

  // ต้องคำนวณต้นทุนจากข้อมูลตัวอย่าง จึงสลับ DB ชั่วคราว
  const prevDB = DB;
  DB = d;
  for (let day = 29; day >= 0; day--) {
    const date = addDays(t, -day);
    const nOrders = 18 + Math.floor(rnd() * 16);
    for (let k = 0; k < nOrders; k++) {
      const chId = pick(chWeights);
      const ch = byId(d.channels, chId);
      const items = [];
      const nItems = 1 + Math.floor(rnd() * 2.3);
      for (let j = 0; j < nItems; j++) {
        const m = pick(mainMenus);
        const ex = items.find((x) => x.menuId === m.id);
        if (ex) ex.qty += 1; else items.push(snapshotItem(m.id, 1, menuPrice(m, chId)));
      }
      if (rnd() < 0.25) items.push(snapshotItem('m-egg', 1, menuPrice(d.menus[4], chId)));
      const hasDisc = chId !== 'walkin' && rnd() < 0.35;
      const hh = String(10 + Math.floor(rnd() * 11)).padStart(2, '0');
      const mm = String(Math.floor(rnd() * 60)).padStart(2, '0');
      d.orders.push({
        id: uid() + k, date, time: `${hh}:${mm}`, channelId: chId, ref: '',
        items,
        discountType: 'baht', discountValue: hasDisc ? pick([10, 15, 20]) : 0,
        discountBy: hasDisc && rnd() < 0.3 ? 'platform' : 'shop',
        extraCost: 0, note: '',
        gp: ch.gp, vatOnGp: ch.vatOnGp, gpBeforeDiscount: ch.gpBeforeDiscount,
        createdAt: Date.now(),
      });
    }
    d.ads.push({ id: uid() + 'g' + day, date, channelId: 'grab', amount: 150, note: 'โฆษณาร้านแนะนำ' });
    if (day % 2 === 0) d.ads.push({ id: uid() + 'l' + day, date, channelId: 'lineman', amount: 100, note: 'Boost ร้าน' });
  }
  DB = prevDB;

  d.purchases = [
    { id: uid() + 'p1', date: addDays(t, -3), ingredientId: 'i-pork', packs: 5, total: 750, note: 'ตลาดสด' },
    { id: uid() + 'p2', date: addDays(t, -2), ingredientId: 'i-egg', packs: 3, total: 360, note: '' },
  ];
  return d;
}
