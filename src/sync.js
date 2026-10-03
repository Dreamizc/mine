'use strict';
/* =========================================================
 * sync.js — ใช้งานหลายเครื่องผ่าน Firebase (Firestore + Authentication)
 * - ไม่ได้ตั้งค่า Firebase = ใช้ในเครื่องเดียว (localStorage) เหมือนเดิม
 * - ตั้งค่าแล้ว = ทุกเครื่องที่ล็อกอินเห็นข้อมูลชุดเดียวกันแบบเรียลไทม์
 *   และยังบันทึกได้ตอนเน็ตหลุด (ซิงก์ให้เองเมื่อกลับมาออนไลน์)
 * โครงสร้างบน Firestore:
 *   config/main            { settings, channels, ownerEmail }
 *   ingredients|purchases|expenses|menus|orders|ads/{id}   1 รายการ = 1 เอกสาร
 *   members/{email}        อีเมลพนักงานที่เจ้าของร้านอนุญาต
 * ========================================================= */

const FB_VERSION = '10.14.1';
const CFG_KEY = 'rms-firebase-config';
const DAYS_KEY = 'rms-cloud-days';

const Sync = {
  COLS: ['ingredients', 'preps', 'productions', 'purchases', 'expenses', 'menus', 'orders', 'ads'],
  WINDOWED: ['orders', 'ads', 'purchases', 'productions'], // โหลดเฉพาะช่วงวันล่าสุด เพื่อประหยัดโควตาการอ่าน
  cfg: null,
  state: 'off', // off | loading | login | verify | connecting | onboard | denied | error | ready
  error: '',
  user: null,
  auth: null,
  fs: null,
  config: undefined, // เอกสาร config/main (null = ยังไม่มีบนคลาวด์)
  cloud: {}, // col -> Map(id -> JSON) สถานะล่าสุดที่รู้ว่าอยู่บนคลาวด์ ใช้หาความต่างตอนบันทึก
  members: [],
  unsubs: [],
  pending: [],
  seen: new Set(),
  localCopy: null,
  online: navigator.onLine,

  get active() { return this.state === 'ready'; },
  get email() { return (this.user && this.user.email || '').toLowerCase(); },
  get ownerEmail() { return (this.config && this.config.ownerEmail || '').toLowerCase(); },
  get isOwner() { return !!this.email && this.email === this.ownerEmail; },
  days() { let d = 0; try { d = num(localStorage.getItem(DAYS_KEY)); } catch (e) { /* ignore */ } return d > 0 ? d : 90; },
  cutoff() { return addDays(today(), -this.days()); },

  /* ---------- ค่าตั้งค่า Firebase ---------- */
  /** รับได้ทั้ง JSON และโค้ด `const firebaseConfig = {...}` ที่คัดลอกจาก Firebase Console */
  parseConfig(text) {
    const cfg = {};
    const re = /["']?(\w+)["']?\s*:\s*["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(String(text || '')))) cfg[m[1]] = m[2].trim();
    if (!cfg.apiKey || !cfg.projectId || !cfg.authDomain) return null;
    const keep = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    return Object.fromEntries(keep.filter((k) => cfg[k]).map((k) => [k, cfg[k]]));
  },
  loadCfg() {
    // ลิงก์เชื่อมต่อจากเครื่องอื่น: ...index.html#connect=xxxx
    const h = location.hash;
    if (h.startsWith('#connect=')) {
      try {
        const cfg = JSON.parse(decodeURIComponent(escape(atob(h.slice(9).replace(/-/g, '+').replace(/_/g, '/')))));
        if (cfg && cfg.apiKey && cfg.projectId) localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
      } catch (e) { /* ลิงก์ไม่ถูกต้อง */ }
      history.replaceState(null, '', location.pathname + location.search + '#settings');
    }
    try { this.cfg = JSON.parse(localStorage.getItem(CFG_KEY)) || null; } catch (e) { this.cfg = null; }
    return this.cfg;
  },
  saveCfg(cfg) { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); this.cfg = cfg; },
  connectLink() {
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(this.cfg)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return location.href.split('#')[0] + '#connect=' + b64;
  },

  /* ---------- เริ่มต้น ---------- */
  loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('โหลดไม่สำเร็จ: ' + src));
      document.head.appendChild(s);
    });
  },
  async start() {
    if (!this.cfg) { this.state = 'off'; return; }
    this.state = 'loading';
    render();
    try {
      if (!window.firebase) {
        const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}/`;
        await this.loadScript(base + 'firebase-app-compat.js');
        await Promise.all([this.loadScript(base + 'firebase-auth-compat.js'), this.loadScript(base + 'firebase-firestore-compat.js')]);
      }
      const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(this.cfg);
      this.auth = app.auth();
      this.fs = app.firestore();
      this.fs.enablePersistence({ synchronizeTabs: true }).catch(() => { /* เบราว์เซอร์ไม่รองรับแคชออฟไลน์ ใช้งานต่อได้ */ });
    } catch (e) {
      this.fail('เชื่อมต่อ Firebase ไม่ได้ ตรวจสอบอินเทอร์เน็ต หรือค่าตั้งค่า Firebase (' + e.message + ')');
      return;
    }
    this.auth.onAuthStateChanged((u) => {
      this.user = u;
      this.unsubAll();
      if (!u) this.state = 'login';
      else if (!u.emailVerified) this.state = 'verify';
      else { this.subscribe(); return; }
      render();
    });
  },
  fail(msg) { this.state = 'error'; this.error = msg; this.unsubAll(); render(); },
  unsubAll() { this.unsubs.forEach((u) => { try { u(); } catch (e) { /* ignore */ } }); this.unsubs = []; },

  /* ---------- ฟังการเปลี่ยนแปลงแบบเรียลไทม์ ---------- */
  subscribe() {
    this.unsubAll();
    if (!this.localCopy) this.localCopy = JSON.parse(JSON.stringify(DB));
    this.state = 'connecting';
    this.seen = new Set();
    this.pending = [];
    this.cloud = {};
    render();
    const onErr = (e) => {
      if (e && e.code === 'permission-denied') { this.state = 'denied'; this.unsubAll(); render(); }
      else this.fail('อ่านข้อมูลออนไลน์ไม่สำเร็จ: ' + (e && e.message || e));
    };
    this.COLS.forEach((col) => {
      let q = this.fs.collection(col);
      if (this.WINDOWED.includes(col)) q = q.where('date', '>=', this.cutoff());
      this.unsubs.push(q.onSnapshot((snap) => this.receive(col, snap.docs.map((d) => d.data())), onErr));
    });
    this.unsubs.push(this.fs.doc('config/main').onSnapshot((d) => this.receive('config', d.exists ? d.data() : null), onErr));
    this.unsubs.push(this.fs.collection('members').onSnapshot((s) => { this.members = s.docs.map((d) => d.id).sort(); scheduleRender(); }, () => {}));
  },
  receive(key, data) {
    // ระหว่างเปิดหน้าต่างแก้ไขอยู่ เก็บไว้ก่อน แล้วค่อยนำมาใช้ตอนปิดหน้าต่าง
    if (this.state === 'ready' && $('#modal').open) { this.pending.push([key, data]); return; }
    this.apply(key, data);
  },
  flush() {
    const p = this.pending; this.pending = [];
    p.forEach(([k, d]) => this.apply(k, d));
  },
  apply(key, data) {
    if (key === 'config') {
      this.config = data;
      this.cloud.config = data ? JSON.stringify(data) : null;
      if (data) {
        const def = defaultData();
        DB.settings = { ...def.settings, ...(data.settings || {}) };
        DB.channels = Array.isArray(data.channels) && data.channels.length ? data.channels : def.channels;
      }
    } else {
      this.cloud[key] = new Map(data.map((r) => [r.id, JSON.stringify(r)]));
      DB[key] = data;
    }
    if (this.state === 'connecting') {
      this.seen.add(key);
      if (this.seen.size === this.COLS.length + 1) { this.state = this.config ? 'ready' : 'onboard'; render(); }
    } else scheduleRender();
  },

  /** ฐานข้อมูลออนไลน์ยังว่าง: เลือกอัปโหลดข้อมูลในเครื่อง / ข้อมูลตัวอย่าง / เริ่มใหม่ */
  initCloud(source) {
    const base = source === 'local' ? this.localCopy : source === 'demo' ? buildDemoData() : defaultData();
    DB = Store.normalize(JSON.parse(JSON.stringify(base)));
    this.config = { ownerEmail: this.email };
    this.cloud = { config: null };
    this.state = 'ready';
    this.push();
  },

  /* ---------- บันทึกเฉพาะส่วนที่เปลี่ยน ---------- */
  push() {
    if (!this.active) return;
    const strip = (o) => JSON.parse(JSON.stringify(o));
    const cfg = strip({ settings: DB.settings, channels: DB.channels, ownerEmail: this.ownerEmail || this.email });
    const cfgJson = JSON.stringify(cfg);
    if (cfgJson !== this.cloud.config) {
      // แยก batch ของ config เพราะพนักงานไม่มีสิทธิ์แก้ จะได้ไม่ทำให้ออเดอร์บันทึกไม่ได้ไปด้วย
      this.cloud.config = cfgJson;
      this.config = cfg;
      this.fs.doc('config/main').set(cfg).catch((e) => this.writeError(e, 'การตั้งค่าร้าน'));
    }
    const ops = [];
    this.COLS.forEach((col) => {
      const prev = this.cloud[col] || (this.cloud[col] = new Map());
      const ids = new Set();
      DB[col].forEach((r) => {
        if (!r || !r.id) return;
        ids.add(r.id);
        const json = JSON.stringify(r);
        const old = prev.get(r.id);
        if (json === old) return;
        const ref = this.fs.collection(col).doc(r.id);
        if ((col === 'ingredients' || col === 'preps') && old) {
          // สต็อกใช้การบวก/ลบแบบสะสม เพื่อไม่ให้หลายเครื่องตัดสต็อกพร้อมกันแล้วทับกัน
          const { stock, ...rest } = strip(r);
          const delta = round2(num(stock) - num(JSON.parse(old).stock));
          const data = delta ? { ...rest, stock: firebase.firestore.FieldValue.increment(delta) } : rest;
          ops.push((b) => b.set(ref, data, { merge: true }));
        } else {
          const data = strip(r);
          ops.push((b) => b.set(ref, data));
        }
        prev.set(r.id, json);
      });
      [...prev.keys()].forEach((id) => {
        if (ids.has(id)) return;
        const ref = this.fs.collection(col).doc(id);
        ops.push((b) => b.delete(ref));
        prev.delete(id);
      });
    });
    for (let i = 0; i < ops.length; i += 450) {
      const b = this.fs.batch();
      ops.slice(i, i + 450).forEach((op) => op(b));
      b.commit().catch((e) => this.writeError(e));
    }
  },
  writeError(e, what) {
    const denied = e && e.code === 'permission-denied';
    toast(denied ? `บัญชีนี้ไม่มีสิทธิ์แก้ไข${what || 'ข้อมูลนี้'} (เฉพาะเจ้าของร้าน)` : 'บันทึกขึ้นออนไลน์ไม่สำเร็จ: ' + (e && e.message || e), 'error');
    // โหลดข้อมูลจริงจากคลาวด์ใหม่ เพื่อให้หน้าจอตรงกับที่บันทึกได้จริง
    if (this.active) this.subscribe();
  },

  /* ---------- บัญชีผู้ใช้ ---------- */
  login(email, pw) { return this.auth.signInWithEmailAndPassword(email.trim(), pw); },
  async signup(email, pw) {
    const cred = await this.auth.createUserWithEmailAndPassword(email.trim(), pw);
    await cred.user.sendEmailVerification();
  },
  resend() { return this.user.sendEmailVerification(); },
  resetPassword(email) { return this.auth.sendPasswordResetEmail(email.trim()); },
  async checkVerified() {
    await this.user.reload();
    this.user = this.auth.currentUser;
    if (!this.user.emailVerified) return false;
    await this.user.getIdToken(true);
    this.subscribe();
    return true;
  },
  logout() { this.unsubAll(); this.localCopy = null; return this.auth.signOut(); },
  disconnect() {
    this.unsubAll();
    if (this.auth) this.auth.signOut().catch(() => {});
    try { localStorage.removeItem(CFG_KEY); } catch (e) { /* ignore */ }
    this.cfg = null; this.state = 'off'; this.user = null; this.config = undefined;
    Store.save(); // เก็บข้อมูลล่าสุดไว้ในเครื่องนี้
  },

  /* ---------- สมาชิก (พนักงาน) ---------- */
  addMember(email) { return this.fs.collection('members').doc(email.trim().toLowerCase()).set({ email: email.trim().toLowerCase(), addedBy: this.email, addedAt: Date.now() }); },
  removeMember(email) { return this.fs.collection('members').doc(email).delete(); },

  /** กฎความปลอดภัยของ Firestore: เจ้าของร้าน + อีเมลที่อยู่ใน members เท่านั้น */
  rules(owner) {
    return `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null && request.auth.token.email_verified == true;
    }
    function isOwner() {
      return signedIn() && request.auth.token.email.lower() == '${String(owner || 'อีเมลเจ้าของร้าน').toLowerCase()}';
    }
    function isMember() {
      return isOwner() || (signedIn() && exists(/databases/$(database)/documents/members/$(request.auth.token.email.lower())));
    }
    match /members/{email} {
      allow read: if isMember();
      allow write: if isOwner();
    }
    match /config/{id} {
      allow read: if isMember();
      allow write: if isOwner();
    }
    match /{col}/{id} {
      allow read, write: if isMember() && col != 'members' && col != 'config';
    }
  }
}`;
  },
};

/* วาดหน้าจอใหม่เมื่อข้อมูลจากเครื่องอื่นเข้ามา (รอจนผู้ใช้พิมพ์เสร็จ/ปิดหน้าต่างก่อน) */
let syncRenderT;
function scheduleRender() {
  clearTimeout(syncRenderT);
  syncRenderT = setTimeout(function tryRender() {
    const a = document.activeElement;
    const typing = a && a !== document.body && main.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
    if ($('#modal').open || typing) { syncRenderT = setTimeout(tryRender, 800); return; }
    render();
  }, 250);
}
$('#modal').addEventListener('close', () => { if (Sync.pending.length) { Sync.flush(); } });
addEventListener('online', () => { Sync.online = true; updateSyncStatus(); });
addEventListener('offline', () => { Sync.online = false; updateSyncStatus(); });
