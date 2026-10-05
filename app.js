import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// ==================== FIREBASE ====================
const firebaseConfig = {
  apiKey: "AIzaSyCo2RfS6KiNB4GppkROuFq8A4QxeWoWuRU",
  authDomain: "mybudget-330b9.firebaseapp.com",
  projectId: "mybudget-330b9",
  storageBucket: "mybudget-330b9.firebasestorage.app",
  messagingSenderId: "408475301014",
  appId: "1:408475301014:web:53d6f5f050a5d8fb477eb7"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==================== DATA ====================
const DS_LOAI = [
  { ma: "AN",   ten: "Ăn uống",   icon: "🍚", mau: "#EF5350" },
  { ma: "DO",   ten: "Đồ dùng",   icon: "🧴", mau: "#42A5F5" },
  { ma: "DIEN", ten: "Điện nước", icon: "💡", mau: "#FFA726" },
  { ma: "NET",  ten: "Internet",  icon: "🌐", mau: "#66BB6A" },
  { ma: "NHA",  ten: "Nhà cửa",   icon: "🏠", mau: "#AB47BC" },
  { ma: "KHAC", ten: "Khác",      icon: "📦", mau: "#78909C" }
];
const timLoai = (ma) => DS_LOAI.find(l => l.ma === ma) || DS_LOAI[5];

// ==================== STATE ====================
let maNha = localStorage.getItem("maNha") || null;
let house = null;         // { ten, nguois: [...] }
let khoanChis = [];       // array
let thanhToans = [];
let khoanNos = [];

let unsubs = [];
let tab = "home";
let thangHienTai = new Date();
let ngayChon = -1;

// ==================== HELPERS ====================
const fmtVnd = (n) => new Intl.NumberFormat('vi-VN').format(n) + " đ";
const fmtGon = (n) => {
  if (n >= 1_000_000) return (n/1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return Math.round(n/1_000) + "k";
  return n.toString();
};
const fmtGio = (m) => {
  const d = new Date(m);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
};
const fmtNgay = (m) => {
  const d = new Date(m);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};
const fmtThu = (m) => {
  const thu = ["Chủ nhật","Thứ 2","Thứ 3","Thứ 4","Thứ 5","Thứ 6","Thứ 7"];
  return thu[new Date(m).getDay()];
};
const dauThang = (d) => new Date(d.getFullYear(), d.getMonth(), 1).getTime();
const dauThangSau = (d) => new Date(d.getFullYear(), d.getMonth()+1, 1).getTime();
const trongKhoang = (ngay, tu, den) => ngay >= tu && ngay < den;

function sinhMaNha() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(window._toastT);
  window._toastT = setTimeout(() => el.classList.remove("show"), 2000);
}

// ==================== SETUP SCREEN ====================
window.showTaoNha = () => {
  document.getElementById("setup-choice").classList.add("hidden");
  document.getElementById("setup-tao").classList.remove("hidden");
};
window.showVaoNha = () => {
  document.getElementById("setup-choice").classList.add("hidden");
  document.getElementById("setup-vao").classList.remove("hidden");
};
window.backSetup = () => {
  document.getElementById("setup-choice").classList.remove("hidden");
  document.getElementById("setup-tao").classList.add("hidden");
  document.getElementById("setup-vao").classList.add("hidden");
};

window.taoNha = async () => {
  const t1 = document.getElementById("inp-ten1").value.trim();
  const t2 = document.getElementById("inp-ten2").value.trim();
  if (!t1 || !t2) return toast("Nhập đủ tên 2 người");

  const ma = sinhMaNha();
  try {
    await setDoc(doc(db, "houses", ma), {
      ten: "Nhà của " + t1 + " và " + t2,
      nguois: [
        { id: "p1", ten: t1 },
        { id: "p2", ten: t2 }
      ],
      createdAt: Date.now()
    });
    maNha = ma;
    localStorage.setItem("maNha", ma);
    toast("Đã tạo nhà: " + ma);
    khoiDongApp();
  } catch (e) {
    console.error(e);
    toast("Lỗi tạo nhà: " + e.message);
  }
};

window.vaoNha = async () => {
  const ma = document.getElementById("inp-ma").value.trim().toUpperCase();
  if (!ma) return toast("Nhập mã nhà");
  try {
    const snap = await getDoc(doc(db, "houses", ma));
    if (!snap.exists()) return toast("Mã nhà không tồn tại");
    maNha = ma;
    localStorage.setItem("maNha", ma);
    toast("Đã vào nhà!");
    khoiDongApp();
  } catch (e) {
    console.error(e);
    toast("Lỗi: " + e.message);
  }
};

// ==================== KHỞI ĐỘNG ====================
function khoiDongApp() {
  document.getElementById("scr-setup").classList.remove("active");
  document.getElementById("scr-main").classList.add("active");
  document.getElementById("ma-nha-badge").textContent = maNha;
  listenAll();
  chonTab("home");
}

function listenAll() {
  unsubs.forEach(u => u());
  unsubs = [];

  // Lắng nghe thông tin nhà
  unsubs.push(onSnapshot(doc(db, "houses", maNha), (snap) => {
    if (snap.exists()) {
      house = snap.data();
      render();
    } else {
      toast("Nhà đã bị xóa!");
      localStorage.removeItem("maNha");
      location.reload();
    }
  }));

  // Khoản chi
  unsubs.push(onSnapshot(
    query(collection(db, "houses", maNha, "khoanChis")),
    (snap) => {
      khoanChis = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      render();
    }
  ));

  // Thanh toán
  unsubs.push(onSnapshot(
    query(collection(db, "houses", maNha, "thanhToans")),
    (snap) => {
      thanhToans = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      render();
    }
  ));

  // Khoản nợ
  unsubs.push(onSnapshot(
    query(collection(db, "houses", maNha, "khoanNos")),
    (snap) => {
      khoanNos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      render();
    }
  ));
}

// ==================== TÍNH TOÁN ====================
function tinhBuTru(tu, den) {
  const ds = khoanChis.filter(kc => kc.chiaDeu && !kc.daThanhToanRieng && trongKhoang(kc.ngay, tu, den));
  const tong = ds.reduce((s, k) => s + k.soTien, 0);
  const moiNguoi = Math.floor(tong / 2);
  const p1Tra = ds.filter(k => k.nguoiTraId === "p1").reduce((s,k)=>s+k.soTien,0);
  const p2Tra = ds.filter(k => k.nguoiTraId === "p2").reduce((s,k)=>s+k.soTien,0);
  const chenhLech = Math.abs(p1Tra - p2Tra) / 2;
  // Đã thanh toán
  const tt = thanhToans.filter(t => trongKhoang(t.ngay, tu, den));
  const p2P1 = tt.filter(t => t.nguoiGuiId === "p2" && t.nguoiNhanId === "p1").reduce((s,t)=>s+t.soTien,0);
  const p1P2 = tt.filter(t => t.nguoiGuiId === "p1" && t.nguoiNhanId === "p2").reduce((s,t)=>s+t.soTien,0);
  const daTT = Math.abs(p2P1 - p1P2);
  const conLaiRaw = chenhLech - daTT;

  let conLai = 0, nguoiTraId = null, nguoiNhanId = null;
  if (p1Tra > p2Tra && conLaiRaw > 0) { conLai = conLaiRaw; nguoiTraId = "p2"; nguoiNhanId = "p1"; }
  else if (p1Tra < p2Tra && conLaiRaw > 0) { conLai = conLaiRaw; nguoiTraId = "p1"; nguoiNhanId = "p2"; }

  return {
    tongChiChiaDeu: tong, moiNguoiChiu: moiNguoi, p1DaTra: p1Tra, p2DaTra: p2Tra,
    chenhLech, daThanhToan: daTT, conLai, nguoiTraId, nguoiNhanId, daHoa: conLai === 0
  };
}

// ==================== RENDER ====================
window.chonTab = (t) => {
  tab = t;
  document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.tab === t));
  const titles = { home: "Trang chủ", chitieu: "Chi tiêu", tongket: "Tổng kết", sono: "Sổ nợ", caidat: "Cài đặt" };
  document.getElementById("header-title").textContent = titles[t];
  render();
};

function render() {
  if (!house) return;

  document.getElementById("header-sub").textContent =
    `Tháng ${thangHienTai.getMonth()+1}/${thangHienTai.getFullYear()}`;

  const content = document.getElementById("app-content");
  const fab = document.getElementById("fab");
  fab.style.display = (tab === "home" || tab === "chitieu" || tab === "sono") ? "block" : "none";
  fab.textContent = (tab === "sono") ? "＋" : "＋";

  if (tab === "home") content.innerHTML = renderHome();
  else if (tab === "chitieu") content.innerHTML = renderChiTieu();
  else if (tab === "tongket") content.innerHTML = renderTongKet();
  else if (tab === "sono") content.innerHTML = renderSoNo();
  else if (tab === "caidat") content.innerHTML = renderCaiDat();
}

function renderHome() {
  const tu = dauThang(thangHienTai);
  const den = dauThangSau(thangHienTai);
  const kq = tinhBuTru(tu, den);
  const tongAll = khoanChis.filter(k => trongKhoang(k.ngay, tu, den)).reduce((s,k)=>s+k.soTien,0);
  const p1 = house.nguois[0].ten;
  const p2 = house.nguois[1].ten;

  let html = `<div class="card">
    <div class="card-title">💰 TỔNG CHI THÁNG NÀY</div>
    <div class="card-big-amount">${fmtVnd(tongAll)}</div>
    ${tongAll !== kq.tongChiChiaDeu ? `<div class="muted" style="margin-top:4px">Chi chung chưa tất toán: ${fmtVnd(kq.tongChiChiaDeu)}</div>` : ''}
  </div>`;

  html += `<div class="card">
    <div class="card-title">💱 BÙ TRỪ CHI PHÍ CHUNG</div>
    <div class="card-row"><span class="lbl">Tổng chi chung (chưa TT)</span><span class="val">${fmtVnd(kq.tongChiChiaDeu)}</span></div>
    <div class="card-row"><span class="lbl">Mỗi người chịu</span><span class="val">${fmtVnd(kq.moiNguoiChiu)}</span></div>
    <div class="card-divider"></div>
    <div class="card-row"><span class="lbl">${p1} đã trả</span><span class="val" style="color:var(--primary)">${fmtVnd(kq.p1DaTra)}</span></div>
    <div class="card-row"><span class="lbl">${p2} đã trả</span><span class="val" style="color:var(--secondary)">${fmtVnd(kq.p2DaTra)}</span></div>
    <div class="card-divider"></div>
    <div class="card-row"><span class="lbl">Chênh lệch |A−B| / 2</span><span class="val">${fmtVnd(kq.chenhLech)}</span></div>
    ${kq.daThanhToan > 0 ? `<div class="card-row"><span class="lbl">Đã thanh toán</span><span class="val">- ${fmtVnd(kq.daThanhToan)}</span></div>` : ''}
    <div class="status-box ${kq.daHoa ? 'hoa' : 'win'}">
      ${kq.daHoa
        ? `<div style="font-weight:700">🎉 Đã hòa</div><div class="muted">Không ai nợ ai</div>`
        : `<div class="muted">${kq.nguoiTraId === "p1" ? p1 : p2} → ${kq.nguoiNhanId === "p1" ? p1 : p2}</div>
           <div class="big">${fmtVnd(kq.conLai)}</div>`}
    </div>
    ${!kq.daHoa ? `<button class="btn btn-primary" onclick="tatToanChung()">✅ Tất toán tất cả khoản chung</button>` : ''}
  </div>`;

  html += `<div class="section">🧾 Hoạt động gần đây</div>`;
  html += `<div class="muted" style="margin-bottom:8px">💡 Chạm vào khoản chi để xem chi tiết</div>`;

  const ganDay = khoanChis
    .filter(k => trongKhoang(k.ngay, tu, den))
    .sort((a,b)=>b.ngay-a.ngay)
    .slice(0, 8);

  if (ganDay.length === 0) {
    html += `<div class="empty"><div class="icon">📭</div>Chưa có khoản chi nào</div>`;
  } else {
    ganDay.forEach(k => html += renderItemKhoanChi(k, true));
  }

  return html;
}

function renderItemKhoanChi(k, choXem = true) {
  const lc = timLoai(k.loai);
  const nguoi = house.nguois.find(p => p.id === k.nguoiTraId)?.ten || "?";
  const daTT = k.daThanhToanRieng;
  return `<div class="item ${daTT ? 'done' : ''}" ${choXem ? `onclick="xemChiTiet('${k.id}')"` : ''}>
    <div class="item-icon" style="background:${lc.mau}22">${lc.icon}</div>
    <div class="item-body">
      <div class="item-title">${escapeHtml(k.ten)}${daTT ? ' ✅' : ''}</div>
      <div class="item-sub">${nguoi} trả • ${fmtGio(k.ngay)}${!k.chiaDeu ? ' • riêng' : (daTT ? ' • đã tất toán' : '')}</div>
    </div>
    <div class="item-amount" style="${daTT ? 'color:#888' : ''}">${fmtVnd(k.soTien)}</div>
  </div>`;
}

function renderChiTieu() {
  const tu = dauThang(thangHienTai);
  const den = dauThangSau(thangHienTai);
  const ds = khoanChis.filter(k => trongKhoang(k.ngay, tu, den));

  // Group by day
  const groups = {};
  ds.forEach(k => {
    const d = new Date(k.ngay);
    const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    (groups[key] = groups[key] || []).push(k);
  });
  const days = Object.keys(groups).map(Number).sort((a,b)=>b-a);

  let html = renderThangNav();
  html += `<div class="muted" style="margin-bottom:8px">💡 Chạm để xem chi tiết</div>`;

  if (days.length === 0) {
    html += `<div class="empty"><div class="icon">📭</div>Tháng này chưa có khoản chi nào</div>`;
  } else {
    days.forEach(day => {
      const itemsOfDay = groups[day].sort((a,b)=>b.ngay-a.ngay);
      const tong = itemsOfDay.reduce((s,k)=>s+k.soTien,0);
      html += `<div class="section" style="display:flex;justify-content:space-between">
        <span>${fmtNgay(day)} <span class="muted">${fmtThu(day)}</span></span>
        <span style="color:var(--primary)">${fmtVnd(tong)}</span>
      </div>`;
      itemsOfDay.forEach(k => html += renderItemKhoanChi(k, true));
    });
  }

  const tong = ds.reduce((s,k)=>s+k.soTien,0);
  html += `<div class="card" style="margin-top:16px">
    <div class="card-title">TỔNG THÁNG ${thangHienTai.getMonth()+1}</div>
    <div class="card-big-amount">${fmtVnd(tong)}</div>
  </div>`;

  return html;
}

function renderThangNav() {
  return `<div class="thang-nav">
    <button onclick="doiThang(-1)">◀</button>
    <div class="thang-ten">Tháng ${thangHienTai.getMonth()+1}/${thangHienTai.getFullYear()}</div>
    <button onclick="doiThang(1)">▶</button>
  </div>`;
}

window.doiThang = (d) => {
  thangHienTai = new Date(thangHienTai.getFullYear(), thangHienTai.getMonth()+d, 1);
  ngayChon = -1;
  render();
};

function renderTongKet() {
  const tu = dauThang(thangHienTai);
  const den = dauThangSau(thangHienTai);
  const tong = khoanChis.filter(k=>trongKhoang(k.ngay,tu,den)).reduce((s,k)=>s+k.soTien,0);
  const kq = tinhBuTru(tu, den);
  const p1 = house.nguois[0].ten, p2 = house.nguois[1].ten;

  let html = renderThangNav();

  // Lịch tháng
  const y = thangHienTai.getFullYear(), m = thangHienTai.getMonth();
  const firstDay = new Date(y, m, 1).getDay(); // 0=CN, 1=T2...
  const offset = (firstDay + 6) % 7; // 0=T2
  const soNgay = new Date(y, m+1, 0).getDate();

  html += `<div class="lich">
    <div class="lich-grid">
      ${["T2","T3","T4","T5","T6","T7","CN"].map(t=>`<div class="lich-thu">${t}</div>`).join("")}
      ${Array(offset).fill('<div></div>').join("")}
      ${Array.from({length: soNgay}, (_, i) => {
        const ngay = i+1;
        const d1 = new Date(y, m, ngay).getTime();
        const d2 = new Date(y, m, ngay+1).getTime();
        const dt = khoanChis.filter(k=>k.ngay>=d1 && k.ngay<d2).reduce((s,k)=>s+k.soTien,0);
        const sel = ngayChon === ngay;
        return `<button class="lich-ngay ${sel?'chon':''}" onclick="chonNgay(${ngay})">
          <div>${ngay}</div>
          ${dt>0 ? `<div class="amount">${fmtGon(dt)}</div>` : ''}
        </button>`;
      }).join("")}
    </div>
    <div class="muted" style="text-align:center;margin-top:8px">👆 Chạm vào ngày để xem chi tiết</div>
  </div>`;

  // Chi tiết ngày
  if (ngayChon > 0) {
    const d1 = new Date(y, m, ngayChon).getTime();
    const d2 = new Date(y, m, ngayChon+1).getTime();
    const dsNgay = khoanChis.filter(k=>k.ngay>=d1 && k.ngay<d2).sort((a,b)=>b.ngay-a.ngay);
    const tongNgay = dsNgay.reduce((s,k)=>s+k.soTien,0);
    html += `<div class="section" style="display:flex;justify-content:space-between">
      <span>📅 Ngày ${ngayChon}/${m+1}/${y}</span>
      <span style="color:var(--primary)">${fmtVnd(tongNgay)}</span>
    </div>`;
    if (dsNgay.length === 0) html += `<div class="empty">Không có khoản chi nào</div>`;
    else dsNgay.forEach(k => html += renderItemKhoanChi(k, true));
  }

  // Tổng kết
  html += `<div class="section">📊 Tổng kết tháng ${m+1}</div>
  <div class="card">
    <div class="card-title">💸 TỔNG CHI</div>
    <div class="card-big-amount">${fmtVnd(tong)}</div>
    <div class="card-divider"></div>
    <div style="display:flex;gap:16px">
      <div style="flex:1">
        <div class="muted">👤 ${p1}</div>
        <div style="font-weight:700">${fmtVnd(kq.p1DaTra)}</div>
      </div>
      <div style="flex:1">
        <div class="muted">👤 ${p2}</div>
        <div style="font-weight:700">${fmtVnd(kq.p2DaTra)}</div>
      </div>
    </div>
  </div>`;

  // Số dư
  html += `<div class="card">
    <div class="card-title">⚖️ SỐ DƯ CUỐI THÁNG</div>
    <div class="status-box ${kq.daHoa ? 'hoa' : 'win'}" style="margin-top:8px">
      ${kq.daHoa
        ? `<div style="font-weight:700">Đã hòa 🎉</div>`
        : `<div class="muted">${kq.nguoiTraId==="p1"?p1:p2} nợ ${kq.nguoiNhanId==="p1"?p1:p2}</div>
           <div class="big">${fmtVnd(kq.conLai)}</div>`}
    </div>
    ${!kq.daHoa ? `<button class="btn btn-primary" onclick="tatToanChung()">✅ Tất toán tất cả</button>` : ''}
  </div>`;

  // Phân loại
  const theoLoai = {};
  khoanChis.filter(k=>trongKhoang(k.ngay,tu,den)).forEach(k => {
    theoLoai[k.loai] = (theoLoai[k.loai] || 0) + k.soTien;
  });
  const arr = Object.entries(theoLoai).sort((a,b)=>b[1]-a[1]);

  if (arr.length > 0) {
    html += `<div class="section">🏷 Theo phân loại</div>`;
    arr.forEach(([ma, tien]) => {
      const lc = timLoai(ma);
      const pct = tong > 0 ? (tien*100/tong).toFixed(1) : 0;
      html += `<div class="card" style="padding:12px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
          <div class="item-icon" style="background:${lc.mau}22;width:34px;height:34px;font-size:16px">${lc.icon}</div>
          <div style="flex:1">
            <div style="font-weight:600;font-size:14px">${lc.ten}</div>
            <div class="muted">${pct}%</div>
          </div>
          <div style="font-weight:700">${fmtVnd(tien)}</div>
        </div>
        <div style="height:5px;background:#eee;border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${lc.mau}"></div>
        </div>
      </div>`;
    });
  }

  return html;
}

window.chonNgay = (n) => { ngayChon = (ngayChon === n) ? -1 : n; render(); };

function renderSoNo() {
  const ds = khoanNos.sort((a,b)=>b.ngay-a.ngay);
  const tongConLai = ds.reduce((s,k)=>s+Math.max(0, k.soTien - (k.daTraBaoNhieu||0)), 0);
  const tongBanDau = ds.reduce((s,k)=>s+k.soTien, 0);
  const tongDaTra = ds.reduce((s,k)=>s+Math.min(k.soTien, k.daTraBaoNhieu||0), 0);

  let html = `<div class="card">
    <div class="card-title">💰 TỔNG NỢ CÒN LẠI</div>
    <div class="card-big-amount" style="${tongConLai>0?'color:var(--orange)':''}">${fmtVnd(tongConLai)}</div>
    <div class="card-divider"></div>
    <div style="display:flex;gap:16px">
      <div style="flex:1">
        <div class="muted">Nợ ban đầu</div>
        <div style="font-weight:600">${fmtVnd(tongBanDau)}</div>
      </div>
      <div style="flex:1">
        <div class="muted">Đã trả</div>
        <div style="font-weight:600;color:var(--green)">${fmtVnd(tongDaTra)}</div>
      </div>
    </div>
    <div class="muted" style="margin-top:6px">Tổng ${ds.length} khoản nợ</div>
  </div>`;

  html += `<div class="section">📋 Danh sách khoản nợ</div>`;

  if (ds.length === 0) {
    html += `<div class="empty"><div class="icon">📭</div>Chưa có khoản nợ nào<br><small>Bấm nút ＋ để thêm</small></div>`;
  } else {
    ds.forEach(kn => {
      const daTraHet = (kn.daTraBaoNhieu||0) >= kn.soTien;
      const conLai = Math.max(0, kn.soTien - (kn.daTraBaoNhieu||0));
      html += `<div class="item ${daTraHet ? 'done' : ''}" onclick="suaNo('${kn.id}')">
        <div class="item-icon" style="background:${daTraHet?'#2E7D3222':'#E6510022'}">
          ${daTraHet ? '✅' : '💸'}
        </div>
        <div class="item-body">
          <div class="item-title">${escapeHtml(kn.tenNguoiNo)}</div>
          <div class="item-sub">${fmtGio(kn.ngay)}</div>
          ${kn.gc ? `<div class="item-sub">${escapeHtml(kn.gc)}</div>` : ''}
          ${(kn.daTraBaoNhieu||0) > 0 && !daTraHet ? `<div class="item-sub" style="color:var(--green)">Đã trả ${fmtVnd(kn.daTraBaoNhieu)} / ${fmtVnd(kn.soTien)}</div>` : ''}
        </div>
        <div class="item-amount" style="${daTraHet ? 'color:#888' : 'color:var(--orange)'}">
          ${daTraHet ? '<div style="font-size:11px">Đã trả hết</div>' : fmtVnd(conLai)}
        </div>
      </div>`;
    });
  }

  return html;
}

function renderCaiDat() {
  const p1 = house.nguois[0].ten, p2 = house.nguois[1].ten;
  return `
  <div class="card">
    <div class="card-title">🏠 MÃ NHÀ</div>
    <div style="font-size:24px;font-weight:700;letter-spacing:4px;text-align:center;padding:12px 0">${maNha}</div>
    <div class="muted" style="text-align:center">Chia sẻ mã này cho người khác để cùng dùng</div>
    <button class="btn btn-secondary" onclick="copyMaNha()">📋 Copy mã nhà</button>
  </div>

  <div class="card">
    <div class="card-title">👥 HAI NGƯỜI DÙNG</div>
    <input id="cd-ten1" value="${escapeHtml(p1)}" placeholder="Tên người 1">
    <input id="cd-ten2" value="${escapeHtml(p2)}" placeholder="Tên người 2">
    <button class="btn btn-primary" onclick="luuTen()">💾 Lưu tên</button>
  </div>

  <div class="card">
    <div class="card-title">🗑 VÙNG NGUY HIỂM</div>
    <div class="muted">Xóa toàn bộ dữ liệu (khoản chi, thanh toán, sổ nợ)</div>
    <button class="btn btn-danger" onclick="xoaHet()">XÓA TOÀN BỘ DỮ LIỆU</button>
  </div>

  <div class="card">
    <div class="card-title">🚪 THOÁT NHÀ</div>
    <div class="muted">Chuyển sang nhà khác hoặc tạo nhà mới</div>
    <button class="btn btn-secondary" onclick="thoatNha()">Thoát nhà này</button>
  </div>
  `;
}

window.copyMaNha = () => {
  navigator.clipboard.writeText(maNha).then(()=>toast("Đã copy mã nhà!"));
};

window.luuTen = async () => {
  const t1 = document.getElementById("cd-ten1").value.trim();
  const t2 = document.getElementById("cd-ten2").value.trim();
  if (!t1 || !t2) return toast("Nhập đủ tên");
  await updateDoc(doc(db, "houses", maNha), {
    nguois: [{ id: "p1", ten: t1 }, { id: "p2", ten: t2 }]
  });
  toast("Đã lưu");
};

window.xoaHet = async () => {
  if (!confirm("XÓA TOÀN BỘ dữ liệu? Không thể hoàn tác!")) return;
  try {
    for (const k of khoanChis) await deleteDoc(doc(db, "houses", maNha, "khoanChis", k.id));
    for (const t of thanhToans) await deleteDoc(doc(db, "houses", maNha, "thanhToans", t.id));
    for (const n of khoanNos) await deleteDoc(doc(db, "houses", maNha, "khoanNos", n.id));
    toast("Đã xóa hết!");
  } catch (e) { toast("Lỗi: " + e.message); }
};

window.thoatNha = () => {
  if (!confirm("Thoát khỏi nhà này?")) return;
  localStorage.removeItem("maNha");
  location.reload();
};

window.tatToanChung = async () => {
  if (!confirm("Đánh dấu tất cả khoản chi chung là đã thanh toán?")) return;
  const tu = dauThang(thangHienTai), den = dauThangSau(thangHienTai);
  const ds = khoanChis.filter(k => k.chiaDeu && !k.daThanhToanRieng && trongKhoang(k.ngay, tu, den));
  try {
    for (const k of ds) {
      await updateDoc(doc(db, "houses", maNha, "khoanChis", k.id), { daThanhToanRieng: true });
    }
    toast(`Đã tất toán ${ds.length} khoản`);
  } catch (e) { toast("Lỗi: " + e.message); }
};

// ==================== MODAL ====================
window.dongModal = () => document.getElementById("modal").classList.remove("active");
function moModal(title, html) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = html;
  document.getElementById("modal").classList.add("active");
}

// ====== THÊM / SỬA KHOẢN CHI ======
let _kcEdit = { ten: "", soTien: "", loai: "AN", nguoiTraId: "p1", chiaDeu: true, gc: "", id: null };

window.moThemKhoanChi = () => {
  if (tab === "sono") return moThemNo(null);
  _kcEdit = { ten: "", soTien: "", loai: "AN", nguoiTraId: "p1", chiaDeu: true, gc: "", id: null };
  veModalKhoanChi("Thêm khoản chi");
};
window.themKhoanChi = moThemKhoanChi;

function veModalKhoanChi(title) {
  const p1 = house.nguois[0].ten, p2 = house.nguois[1].ten;
  const html = `
    <label class="muted">SỐ TIỀN (VNĐ)</label>
    <input id="kc-sotien" type="number" inputmode="numeric" placeholder="0" value="${_kcEdit.soTien}" style="font-size:22px;font-weight:700">
    <div id="kc-preview" class="muted" style="text-align:right;margin-top:4px"></div>

    <label class="muted" style="display:block;margin-top:12px">TÊN KHOẢN CHI</label>
    <input id="kc-ten" placeholder="VD: Đi chợ..." value="${escapeHtml(_kcEdit.ten)}">

    <label class="muted" style="display:block;margin-top:12px">PHÂN LOẠI</label>
    <div class="chips" id="kc-loai">
      ${DS_LOAI.map(l => `<button class="chip ${_kcEdit.loai===l.ma?'active':''}" data-ma="${l.ma}">${l.icon} ${l.ten}</button>`).join("")}
    </div>

    <label class="muted" style="display:block;margin-top:12px">AI TRẢ TIỀN?</label>
    <div class="nguoi-tra" id="kc-nguoi">
      <button data-id="p1" class="${_kcEdit.nguoiTraId==='p1'?'active':''}">
        <span class="avatar">${p1[0].toUpperCase()}</span>${escapeHtml(p1)}
      </button>
      <button data-id="p2" class="${_kcEdit.nguoiTraId==='p2'?'active':''}">
        <span class="avatar">${p2[0].toUpperCase()}</span>${escapeHtml(p2)}
      </button>
    </div>

    <div class="switch-row">
      <div class="info">
        <div class="lbl">Chia đều 50/50</div>
        <div class="sub" id="kc-chia-sub"></div>
      </div>
      <label class="switch">
        <input type="checkbox" id="kc-chia" ${_kcEdit.chiaDeu?'checked':''}>
        <span class="slider"></span>
      </label>
    </div>

    <label class="muted" style="display:block;margin-top:12px">GHI CHÚ</label>
    <textarea id="kc-gc" placeholder="Tuỳ chọn...">${escapeHtml(_kcEdit.gc)}</textarea>

    <button class="btn btn-primary" onclick="luuKhoanChi()">💾 LƯU</button>
    ${_kcEdit.id ? `<button class="btn btn-danger" onclick="xoaKhoanChi('${_kcEdit.id}')">🗑 XÓA</button>` : ''}
  `;
  moModal(title, html);
  capNhatPreview();

  document.getElementById("kc-sotien").oninput = (e) => {
    _kcEdit.soTien = e.target.value.replace(/\D/g,'');
    capNhatPreview();
  };
  document.getElementById("kc-ten").oninput = (e) => _kcEdit.ten = e.target.value;
  document.getElementById("kc-gc").oninput = (e) => _kcEdit.gc = e.target.value;
  document.getElementById("kc-chia").onchange = (e) => { _kcEdit.chiaDeu = e.target.checked; capNhatPreview(); };

  document.querySelectorAll("#kc-loai .chip").forEach(b => {
    b.onclick = () => {
      _kcEdit.loai = b.dataset.ma;
      document.querySelectorAll("#kc-loai .chip").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
    };
  });
  document.querySelectorAll("#kc-nguoi button").forEach(b => {
    b.onclick = () => {
      _kcEdit.nguoiTraId = b.dataset.id;
      document.querySelectorAll("#kc-nguoi button").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      capNhatPreview();
    };
  });
}

function capNhatPreview() {
  const n = parseInt(_kcEdit.soTien || "0", 10);
  document.getElementById("kc-preview").textContent = n > 0 ? "= " + fmtVnd(n) : "";
  const p = _kcEdit.nguoiTraId === "p1" ? house.nguois[0].ten : house.nguois[1].ten;
  document.getElementById("kc-chia-sub").textContent = _kcEdit.chiaDeu ? "Mỗi người chịu 50%" : `${p} chịu hết`;
}

window.luuKhoanChi = async () => {
  const ten = _kcEdit.ten.trim();
  const soTien = parseInt(_kcEdit.soTien || "0", 10);
  if (!ten) return toast("Nhập tên khoản chi");
  if (!soTien || soTien <= 0) return toast("Nhập số tiền hợp lệ");

  const data = {
    ten, soTien, loai: _kcEdit.loai,
    nguoiTraId: _kcEdit.nguoiTraId,
    chiaDeu: _kcEdit.chiaDeu,
    ngay: _kcEdit.id ? _kcEdit.ngay : Date.now(),
    gc: _kcEdit.gc.trim(),
    daThanhToanRieng: _kcEdit.id ? _kcEdit.daThanhToanRieng : false
  };

  try {
    if (_kcEdit.id) {
      await updateDoc(doc(db, "houses", maNha, "khoanChis", _kcEdit.id), data);
      toast("Đã cập nhật");
    } else {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2,7);
      await setDoc(doc(db, "houses", maNha, "khoanChis", id), data);
      toast("Đã thêm");
    }
    dongModal();
  } catch (e) { toast("Lỗi: " + e.message); }
};

window.xoaKhoanChi = async (id) => {
  if (!confirm("Xóa khoản chi này?")) return;
  await deleteDoc(doc(db, "houses", maNha, "khoanChis", id));
  toast("Đã xóa");
  dongModal();
};

// ====== CHI TIẾT KHOẢN CHI ======
window.xemChiTiet = (id) => {
  const k = khoanChis.find(x => x.id === id);
  if (!k) return;
  const lc = timLoai(k.loai);
  const nguoi = house.nguois.find(p=>p.id===k.nguoiTraId)?.ten || "?";
  const nguoiKia = house.nguois.find(p=>p.id!==k.nguoiTraId)?.ten || "?";
  const daTT = k.daThanhToanRieng;

  let html = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
      <div class="item-icon" style="background:${lc.mau}22;width:44px;height:44px;font-size:22px">${lc.icon}</div>
      <div>
        <div style="font-size:17px;font-weight:700">${escapeHtml(k.ten)}</div>
        <div style="color:var(--primary);font-weight:600">${fmtVnd(k.soTien)}</div>
      </div>
    </div>
    <div class="card-row"><span class="lbl">Loại</span><span class="val">${lc.ten}</span></div>
    <div class="card-row"><span class="lbl">Người trả</span><span class="val">${escapeHtml(nguoi)}</span></div>
    <div class="card-row"><span class="lbl">Chia</span><span class="val">${k.chiaDeu ? "Đều 50/50" : "Chịu riêng"}</span></div>
    <div class="card-row"><span class="lbl">Ngày</span><span class="val">${fmtGio(k.ngay)}</span></div>
    ${k.gc ? `<div class="card-row" style="flex-direction:column;align-items:flex-start"><span class="lbl">Ghi chú</span><span class="val">${escapeHtml(k.gc)}</span></div>` : ''}
  `;

  if (k.chiaDeu) {
    if (daTT) {
      html += `<div class="status-box hoa" style="margin-top:12px">
        <div style="font-weight:700;color:var(--green)">✅ Đã thanh toán</div>
        <div class="muted">Khoản này đã tất toán, không còn trong bù trừ</div>
      </div>
      <button class="btn btn-secondary" onclick="boDanhDau('${k.id}')">↩️ Bỏ đánh dấu</button>
      `;
    } else {
      const tienLe = Math.floor(k.soTien/2);
      html += `<div class="card" style="background:var(--surface-var);margin-top:12px">
        <div class="muted">Chia đều cho khoản này</div>
        <div class="card-row"><span>${escapeHtml(nguoi)} đã trả</span><span class="val">${fmtVnd(k.soTien)}</span></div>
        <div class="card-row"><span>${escapeHtml(nguoiKia)} cần trả</span><span class="val" style="color:var(--primary)">${fmtVnd(tienLe)}</span></div>
      </div>
      <button class="btn btn-primary" onclick="danhDauDaTT('${k.id}')">✅ Đánh dấu đã thanh toán</button>
      `;
    }
  } else {
    html += `<div class="status-box" style="background:var(--surface-var);margin-top:12px">
      <div class="muted">Khoản này chịu riêng — không ảnh hưởng bù trừ chung</div>
    </div>`;
  }

  html += `<button class="btn btn-secondary" onclick="suaKhoanChi('${k.id}')">✏️ Sửa</button>`;

  moModal("Chi tiết khoản chi", html);
};

window.suaKhoanChi = (id) => {
  const k = khoanChis.find(x=>x.id===id);
  if (!k) return;
  _kcEdit = { ...k };
  veModalKhoanChi("Sửa khoản chi");
};

window.danhDauDaTT = async (id) => {
  await updateDoc(doc(db, "houses", maNha, "khoanChis", id), { daThanhToanRieng: true });
  toast("✅ Đã đánh dấu");
  dongModal();
};

window.boDanhDau = async (id) => {
  await updateDoc(doc(db, "houses", maNha, "khoanChis", id), { daThanhToanRieng: false });
  toast("Đã bỏ đánh dấu");
  dongModal();
};

// ====== SỔ NỢ ======
let _knEdit = { id: null, tenNguoiNo: "", soTien: "", daTraBaoNhieu: "", gc: "" };

window.moThemNo = (kn) => {
  if (kn) {
    _knEdit = { id: kn.id, tenNguoiNo: kn.tenNguoiNo, soTien: kn.soTien.toString(),
                daTraBaoNhieu: (kn.daTraBaoNhieu||0).toString(), gc: kn.gc||"" };
  } else {
    _knEdit = { id: null, tenNguoiNo: "", soTien: "", daTraBaoNhieu: "", gc: "" };
  }
  veModalNo();
};

window.suaNo = (id) => {
  const kn = khoanNos.find(x=>x.id===id);
  if (kn) moThemNo(kn);
};

function veModalNo() {
  const tongNo = parseInt(_knEdit.soTien || "0", 10);
  const daTra = parseInt(_knEdit.daTraBaoNhieu || "0", 10);
  const conLai = Math.max(0, tongNo - daTra);
  const daTraHet = tongNo > 0 && conLai === 0;

  const html = `
    <label class="muted">TÊN NGƯỜI NỢ</label>
    <input id="kn-ten" placeholder="VD: Anh Nam..." value="${escapeHtml(_knEdit.tenNguoiNo)}">

    <label class="muted" style="display:block;margin-top:12px">SỐ TIỀN NỢ (VNĐ)</label>
    <input id="kn-tong" type="number" inputmode="numeric" placeholder="0" value="${_knEdit.soTien}">

    <label class="muted" style="display:block;margin-top:12px">ĐÃ TRẢ BAO NHIÊU (VNĐ)</label>
    <input id="kn-datra" type="number" inputmode="numeric" placeholder="0" value="${_knEdit.daTraBaoNhieu}" style="color:var(--green)">

    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
      <button class="btn btn-small btn-secondary" onclick="datTra('0')">Trả 0</button>
      <button class="btn btn-small btn-secondary" onclick="datTra('1/2')">Trả 1/2</button>
      <button class="btn btn-small btn-secondary" onclick="datTra('het')">Trả hết</button>
    </div>

    <div id="kn-preview" style="margin-top:12px"></div>

    <label class="muted" style="display:block;margin-top:12px">GHI CHÚ</label>
    <textarea id="kn-gc" placeholder="VD: mượn tiền mua đồ...">${escapeHtml(_knEdit.gc)}</textarea>

    <button class="btn btn-primary" onclick="luuNo()">💾 LƯU</button>
    ${_knEdit.id ? `<button class="btn btn-danger" onclick="xoaNo('${_knEdit.id}')">🗑 XÓA</button>` : ''}
  `;
  moModal(_knEdit.id ? "Sửa khoản nợ" : "Thêm khoản nợ", html);
  capNhatPreviewNo();

  document.getElementById("kn-ten").oninput = (e) => _knEdit.tenNguoiNo = e.target.value;
  document.getElementById("kn-tong").oninput = (e) => { _knEdit.soTien = e.target.value.replace(/\D/g,''); capNhatPreviewNo(); };
  document.getElementById("kn-datra").oninput = (e) => { _knEdit.daTraBaoNhieu = e.target.value.replace(/\D/g,''); capNhatPreviewNo(); };
  document.getElementById("kn-gc").oninput = (e) => _knEdit.gc = e.target.value;
}

function capNhatPreviewNo() {
  const tong = parseInt(_knEdit.soTien || "0", 10);
  const daTra = parseInt(_knEdit.daTraBaoNhieu || "0", 10);
  const conLai = Math.max(0, tong - daTra);
  const daTraHet = tong > 0 && conLai === 0;
  const el = document.getElementById("kn-preview");
  if (tong <= 0) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="status-box ${daTraHet ? 'hoa' : 'no'}">
      <div style="font-weight:700;font-size:11px;color:${daTraHet ? 'var(--green)' : 'var(--orange)'}">
        ${daTraHet ? '🎉 Đã trả hết nợ' : '💸 SỐ NỢ CÒN LẠI'}
      </div>
      <div class="big">${fmtVnd(conLai)}</div>
      <div class="muted">${fmtVnd(tong)} − ${fmtVnd(daTra)} = ${fmtVnd(conLai)}</div>
    </div>
  `;
}

window.datTra = (kieu) => {
  const tong = parseInt(_knEdit.soTien || "0", 10);
  if (tong <= 0) return toast("Nhập tổng nợ trước");
  let v = "0";
  if (kieu === "1/2") v = Math.floor(tong/2).toString();
  if (kieu === "het") v = tong.toString();
  _knEdit.daTraBaoNhieu = v;
  document.getElementById("kn-datra").value = v;
  capNhatPreviewNo();
};

window.luuNo = async () => {
  const ten = _knEdit.tenNguoiNo.trim();
  const soTien = parseInt(_knEdit.soTien || "0", 10);
  const daTra = Math.min(soTien, parseInt(_knEdit.daTraBaoNhieu || "0", 10));
  if (!ten) return toast("Nhập tên người nợ");
  if (soTien <= 0) return toast("Nhập số tiền hợp lệ");

  const data = {
    tenNguoiNo: ten, soTien, ngay: _knEdit.id ? _knEdit.ngay : Date.now(),
    gc: _knEdit.gc.trim(), daTraBaoNhieu: daTra
  };
  try {
    if (_knEdit.id) {
      await updateDoc(doc(db, "houses", maNha, "khoanNos", _knEdit.id), data);
      toast("Đã cập nhật");
    } else {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2,7);
      await setDoc(doc(db, "houses", maNha, "khoanNos", id), data);
      toast("Đã thêm");
    }
    dongModal();
  } catch (e) { toast("Lỗi: " + e.message); }
};

window.xoaNo = async (id) => {
  if (!confirm("Xóa khoản nợ này?")) return;
  await deleteDoc(doc(db, "houses", maNha, "khoanNos", id));
  toast("Đã xóa");
  dongModal();
};

// ==================== MISC ====================
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ==================== KHỞI ĐỘNG ====================
(function init() {
  if (maNha) {
    khoiDongApp();
  } else {
    document.getElementById("scr-setup").classList.add("active");
  }
})();