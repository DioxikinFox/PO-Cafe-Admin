import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDK5sOHxCPB2HmB9CpQSQYW20cqC9rBIjQ",
    authDomain: "pocafe-5ba55.firebaseapp.com",
    projectId: "pocafe-5ba55",
    storageBucket: "pocafe-5ba55.firebasestorage.app",
    messagingSenderId: "119634482868",
    appId: "1:119634482868:web:4bc2424db5bcf0b932e9e1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let semuaMenuGlobal = [];
let semuaPromoGlobal = [];
let semuaGaleriGlobal = [];
let myChart = null; 

document.addEventListener('DOMContentLoaded', () => {

    // --- KAWALAN MOD GELAP / CERAH ---
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const savedTheme = localStorage.getItem('po_cafe_admin_theme');

    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        if(themeToggleBtn) themeToggleBtn.innerText = "☀️ Mod Cerah";
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            document.body.classList.toggle('dark-theme');
            const isDark = document.body.classList.contains('dark-theme');
            localStorage.setItem('po_cafe_admin_theme', isDark ? 'dark' : 'light');
            themeToggleBtn.innerText = isDark ? "☀️ Mod Cerah" : "🌙 Mod Gelap";
        });
    }

    // --- KAWALAN AMARAN AKHIR BULAN ---
    function checkMonthEndWarning() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const lastDay = new Date(year, month + 1, 0).getDate();
        const currentDay = now.getDate();
        const daysLeft = lastDay - currentDay;

        const warningBoxes = document.querySelectorAll('.month-expiry-warning');
        warningBoxes.forEach(box => {
            if (daysLeft <= 7 && daysLeft >= 0) {
                box.style.display = 'block';
                box.innerHTML = `⚠️ <strong>Amaran Bulanan:</strong> Data analitik & maklum balas ini akan dikosongkan secara automatik dalam masa <strong>${daysLeft === 0 ? 'hari ini' : daysLeft + ' hari'}</strong> lagi!`;
            } else {
                box.style.display = 'none';
            }
        });
    }
    checkMonthEndWarning();

    // --- 1. SISTEM TAB & HAMBURGER MENU ---
    const sidebarItems = document.querySelectorAll('.sidebar-menu li');
    const adminSections = document.querySelectorAll('.admin-section');
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const sidebarNav = document.getElementById('sidebarNav');

    if (hamburgerBtn && sidebarNav) {
        hamburgerBtn.addEventListener('click', (e) => { 
            e.preventDefault();
            sidebarNav.classList.toggle('show'); 
        });
        sidebarItems.forEach(li => {
            li.addEventListener('click', () => {
                if (window.innerWidth <= 768) sidebarNav.classList.remove('show');
            });
        });
    }

    sidebarItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            sidebarItems.forEach(li => li.classList.remove('active'));
            item.classList.add('active');
            adminSections.forEach(section => section.classList.remove('active'));
            
            const targetId = item.getAttribute('data-tab');
            const targetSection = document.getElementById(targetId);
            if(targetSection) targetSection.classList.add('active');

            if (targetId === 'tab-analitik') {
                renderGrafAnalitikSebenar();
                tunjukJumlahKlikKeseluruhan();
                tunjukJumlahPelawat();
            }

            if (targetId === 'tab-feedback') {
                fetchFeedbacksRealtime();
            }
        });
    });

    // --- KAWALAN PENGUMUMAN (LIVE LISTENER) ---
    const btnSaveAnnouncement = document.getElementById('btn-save-announcement');
    const statusLabel = document.getElementById('current-active-announcement');

    onSnapshot(doc(db, "settings", "announcement"), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('announcement-text').value = data.text || '';
            document.getElementById('announcement-expiry').value = data.expiryDate || '';
            document.getElementById('announcement-active').checked = data.isActive || false;
            
            if(data.isActive) {
                statusLabel.innerText = `📢 Sedang Berjalan: ${data.text}`;
                statusLabel.style.color = "#25D366";
            } else {
                statusLabel.innerText = "❌ Tiada pengumuman sedang aktif";
                statusLabel.style.color = "#d70f64";
            }
        }
    });

    if (btnSaveAnnouncement) {
        btnSaveAnnouncement.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await setDoc(doc(db, "settings", "announcement"), {
                    text: document.getElementById('announcement-text').value.trim(),
                    expiryDate: document.getElementById('announcement-expiry').value,
                    isActive: document.getElementById('announcement-active').checked
                }, { merge: true });
                alert("Pengumuman live dikemaskini!");
            } catch (error) { alert("Gagal simpan pengumuman: " + error.message); }
        });
    }

    // --- KAWALAN KEDAI (AUTO BUKA 11AM - 10PM) ---
    const statusSelect = document.getElementById('store-status-select');
    const reasonInput = document.getElementById('cuti-reason-input');
    const btnSaveStatus = document.getElementById('btn-save-status');
    const statusText = document.getElementById('status-text');

    function updateStatusUI(status, reason) {
        if(!statusText) return;
        if (status === 'buka') { statusText.innerText = "STATUS KINI: BUKA"; statusText.style.color = "#25D366"; reasonInput.style.display = 'none'; }
        else if (status === 'tutup') { statusText.innerText = "STATUS KINI: TUTUP"; statusText.style.color = "#d70f64"; reasonInput.style.display = 'none'; }
        else if (status === 'cuti') { statusText.innerText = "STATUS KINI: CUTI (" + (reason||"Tiada sebab") + ")"; statusText.style.color = "#e3a857"; reasonInput.style.display = 'block'; }
    }

    function checkAutoStoreStatus() {
        const hours = new Date().getHours();
        const isOperatingHours = hours >= 11 && hours < 22; 

        getDoc(doc(db, "settings", "storeStatus")).then(docSnap => {
            let currentStatus = 'buka';
            let currentReason = '';
            if (docSnap.exists()) {
                currentStatus = docSnap.data().status;
                currentReason = docSnap.data().reason || '';
            }

            if (currentStatus === 'buka' && !isOperatingHours) {
                setDoc(doc(db, "settings", "storeStatus"), { status: 'tutup', reason: 'Tutup automatik (Luar Waktu)' }, { merge: true });
                if (statusSelect) statusSelect.value = 'tutup';
                updateStatusUI('tutup', '');
            } 
            else if (currentStatus === 'tutup' && currentReason.includes('Luar Waktu') && isOperatingHours) {
                setDoc(doc(db, "settings", "storeStatus"), { status: 'buka', reason: '' }, { merge: true });
                if (statusSelect) statusSelect.value = 'buka';
                updateStatusUI('buka', '');
            } else {
                if (statusSelect) statusSelect.value = currentStatus;
                if (reasonInput) reasonInput.value = currentReason;
                updateStatusUI(currentStatus, currentReason);
            }
        });
    }
    
    checkAutoStoreStatus(); 
    setInterval(checkAutoStoreStatus, 60000); 

    if(statusSelect) statusSelect.addEventListener('change', function() { reasonInput.style.display = (this.value === 'cuti') ? 'block' : 'none'; });

    if (btnSaveStatus) {
        btnSaveStatus.addEventListener('click', async (e) => {
            e.preventDefault();
            updateStatusUI(statusSelect.value, reasonInput.value);
            await setDoc(doc(db, "settings", "storeStatus"), { status: statusSelect.value, reason: reasonInput.value }, { merge: true });
            alert("Status kedai berjaya dikemaskini manual!");
        });
    }

 // --- PENGURUSAN PROMOSI (FIX: PAKSA PAPAR TERUS SEBAHAJAIN PAGE DIBUKA) ---
    window.fetchPromotions = async function() {
        const tb = document.getElementById('promo-table-body');
        if (!tb) return;

        // 1. Tarik data sekali imbas serta-merta (Paksa papar awal)
        try {
            const querySnapshot = await getDocs(collection(db, "promotions"));
            tb.innerHTML = "";
            semuaPromoGlobal = [];

            if (querySnapshot.empty) {
                tb.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#888;">Tiada data promosi dijumpai. Sila tambah manual atau import data asal.</td></tr>`;
            } else {
                querySnapshot.forEach((docSnap) => {
                    paparkanBarisPromosi(docSnap, tb);
                });
            }
        } catch (error) {
            console.error("Ralat panggil data awal:", error);
        }

        // 2. Kekalkan live listener untuk perubahan masa nyata (Realtime)
        onSnapshot(collection(db, "promotions"), (querySnapshot) => {
            // Elakkan render bertindih jika tiada perubahan saiz dokumen yang drastik, 
            // tapi kita pastikan jadual sentiasa dikemaskini secara automatik
            tb.innerHTML = "";
            semuaPromoGlobal = [];

            if (querySnapshot.empty) {
                tb.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#888;">Tiada data promosi dijumpai. Sila tambah manual atau import data asal.</td></tr>`;
                return;
            }

            querySnapshot.forEach((docSnap) => {
                paparkanBarisPromosi(docSnap, tb);
            });
        }, (error) => {
            console.error("Ralat onSnapshot:", error);
        });
    };

    // Fungsi pembantu untuk bina baris jadual supaya kod tidak berulang
    function paparkanBarisPromosi(docSnap, tb) {
        try {
            const item = docSnap.data(); 
            item.id = docSnap.id; 
            
            // Elakkan pendua dalam array global
            if (!semuaPromoGlobal.some(p => p.id === item.id)) {
                semuaPromoGlobal.push(item);
            }
            
            let baki = 'Tiada Had';
            if (item.stock !== undefined && item.stock !== null && item.stock !== '') {
                baki = item.stock;
            }

            let hargaPromo = 'Tiada Harga';
            if (item.price) {
                hargaPromo = `RM ${item.price}`;
            }

            let exp = `<span style="color:#888;">Tiada Tarikh Tamat</span>`;
            if (item.expiryDate && item.expiryDate !== "") {
                const dateObj = new Date(item.expiryDate);
                if (!isNaN(dateObj.getTime())) {
                    const diffDays = Math.ceil((dateObj - new Date()) / (1000 * 60 * 60 * 24));
                    if (diffDays < 0) { exp = `<strong style="color:#d70f64;">Telah Tamat!</strong>`; }
                    else if (diffDays === 0) { exp = `<strong style="color:#e3a857;">Tamat Hari Ini!</strong>`; }
                    else { exp = `<strong style="color:#25D366;">${diffDays} Hari Lagi</strong>`; }
                }
            }

            const type = item.type || 'image';
            const src = item.src || '';
            const title = item.title || 'Tiada Tajuk';
            const desc = item.desc || '';
            const badge = item.badge || 'PROMO';

            const mediaHTML = type === 'video' 
                ? `<video src="${src}" width="50" muted playsinline></video>` 
                : `<img src="${src}" width="40" height="40" style="object-fit:cover; border-radius:5px; background-color:#ccc;" onerror="this.onerror=null; this.style.display='none';">`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${mediaHTML}</td>
                <td><strong>${title}</strong><br><small style="color:#888">${desc}</small><br><span style="color:#25D366; font-weight:600;">${hargaPromo}</span></td>
                <td><span class="badge ${type === 'video' ? 'badge-video' : ''}">${badge}</span></td>
                <td><span style="font-weight:600;">${baki}</span></td>
                <td>${exp}</td>
                <td>
                    <button class="btn-edit" type="button" onclick="bukaModalEditPromo('${item.id}')">Edit</button> 
                    <button class="btn-delete" type="button" onclick="deletePromoDb('${item.id}')">Padam</button>
                </td>
            `;
            tb.appendChild(tr);
        } catch (err) {
            console.error("Ralat memproses satu data promosi:", docSnap.id, err);
        }
    }

    fetchPromotions();

    // Fungsi global untuk buka Modal Tambah Promosi (Boleh panggil dari mana-mana butang)
    window.bukaModalTambahPromo = function() {
        document.getElementById('promo-edit-id').value = "";
        document.getElementById('modal-promo-title').innerText = "Tambah Banner Promosi";
        document.getElementById('promo-title-input').value = "";
        if(document.getElementById('promo-desc-input')) document.getElementById('promo-desc-input').value = "";
        if(document.getElementById('promo-price-input')) document.getElementById('promo-price-input').value = "";
        document.getElementById('promo-type-input').value = "image";
        document.getElementById('promo-badge-input').value = "";
        document.getElementById('promo-src-input').value = "";
        document.getElementById('promo-stock-input').value = "";
        document.getElementById('promo-expiry-input').value = "";
        const promoModal = document.getElementById('promo-modal');
        if(promoModal) promoModal.style.display = 'flex';
    };

    const btnOpenPromoModal = document.getElementById('btn-open-promo-modal');
    if (btnOpenPromoModal) {
        btnOpenPromoModal.addEventListener('click', (e) => {
            e.preventDefault();
            bukaModalTambahPromo();
        });
    }

    const btnClosePromoModal = document.getElementById('btn-close-promo-modal');
    if(btnClosePromoModal) {
        btnClosePromoModal.addEventListener('click', (e) => { 
            e.preventDefault();
            const promoModal = document.getElementById('promo-modal');
            if(promoModal) promoModal.style.display = 'none'; 
        });
    }

    window.bukaModalEditPromo = function(id) {
        const item = semuaPromoGlobal.find(p => p.id === id);
        if(!item) return;
        document.getElementById('promo-edit-id').value = item.id;
        document.getElementById('modal-promo-title').innerText = "Kemaskini / Edit Promosi";
        document.getElementById('promo-title-input').value = item.title || "";
        if(document.getElementById('promo-desc-input')) document.getElementById('promo-desc-input').value = item.desc || "";
        if(document.getElementById('promo-price-input')) document.getElementById('promo-price-input').value = item.price || "";
        document.getElementById('promo-type-input').value = item.type || "image";
        document.getElementById('promo-badge-input').value = item.badge || "";
        document.getElementById('promo-src-input').value = item.src || "";
        document.getElementById('promo-stock-input').value = (item.stock !== undefined && item.stock !== null) ? item.stock : '';
        document.getElementById('promo-expiry-input').value = item.expiryDate || '';
        const promoModal = document.getElementById('promo-modal');
        if(promoModal) promoModal.style.display = 'flex';
    };

    window.simpanPromoDb = async function() {
        const id = document.getElementById('promo-edit-id').value;
        const title = document.getElementById('promo-title-input').value.trim();
        const descEl = document.getElementById('promo-desc-input');
        const desc = descEl ? descEl.value.trim() : "";
        const priceEl = document.getElementById('promo-price-input');
        const price = priceEl ? priceEl.value.trim() : "";
        const type = document.getElementById('promo-type-input').value;
        const badge = document.getElementById('promo-badge-input').value.trim();
        const src = document.getElementById('promo-src-input').value.trim();
        const stockRaw = document.getElementById('promo-stock-input').value.trim();
        const stock = stockRaw !== '' ? parseInt(stockRaw) : '';
        const expiryDate = document.getElementById('promo-expiry-input').value;

        if (!title || !src) { alert("Sila isi tajuk dan pautan fail media."); return; }

        try {
            // Jika data asal kau pakai nama "promotion" atau "promosi", ubah "promotions" kat bawah ni
            const promoData = { title, desc, price, type, badge, src, stock, expiryDate };
            if(id === "") {
                await addDoc(collection(db, "promotions"), promoData);
                alert("Promosi berjaya ditambah!");
            } else {
                await updateDoc(doc(db, "promotions", id), promoData);
                alert("Promosi berjaya dikemaskini!");
            }
            const promoModal = document.getElementById('promo-modal');
            if(promoModal) promoModal.style.display = 'none';
        } catch (err) { alert("Gagal simpan promosi: " + err.message); }
    };

    const btnSavePromoDb = document.getElementById('btn-save-promo-db');
    if(btnSavePromoDb) {
        btnSavePromoDb.addEventListener('click', (e) => {
            e.preventDefault();
            simpanPromoDb();
        });
    }

    window.deletePromoDb = async function(id) {
        if (confirm("Adakah anda pasti untuk memadam promosi ini?")) { 
            try {
                // Sama juga di sini, jika jadual asal kau pakai nama lain, ubah ejaan "promotions"
                await deleteDoc(doc(db, "promotions", id)); 
                alert("Promosi berjaya dipadam.");
            } catch(e) { alert("Gagal padam promosi: " + e.message); }
        }
    };

    const btnAutoImportPromo = document.getElementById('btn-auto-import-promo');
    if (btnAutoImportPromo) {
        btnAutoImportPromo.addEventListener('click', async () => {
            if (!confirm("Import dan sinkronisasi promosi asal ke database?")) return;
            const defaultPromos = [
                { title: "The Most Killer Ayam Gepuk", desc: "Tonton video keistimewaan ayam gepuk berapi kami!", price: "14.50", type: "video", badge: "VIDEO 🎬", src: "Bahan/vdoayamgepuk.mp4", stock: 50, expiryDate: "" },
                { title: "Chicken Crispy Salad", desc: "Menu baru yang sihat, crispy dan mengeyangkan!", price: "14.80", type: "image", badge: "BARU 🌟", src: "Bahan/menubaru.jpeg", stock: 30, expiryDate: "" },
                { title: "Affogato Matcha Strawberry", desc: "Menu baru berkrim, menyegarkan dan penuh rasa.", price: "7.90", type: "image", badge: "BARU 🌟", src: "Bahan/menubaru (2).jpeg", stock: 25, expiryDate: "" },
                { title: "Mantou", desc: "Dua menu baru rasa istimewa, satu tempat pilihan di PO Cafe!", price: "4.60", type: "image", badge: "BEST SELLER 🔥", src: "Bahan/menubaru (3).jpeg", stock: 40, expiryDate: "" },
                { title: "Bagel", desc: "Bagel segar dipanaskan setiap hari dengan pelbagai perisa.", price: "9.00", type: "image", badge: "BEST SELLER 🔥", src: "Bahan/bagel.jpeg", stock: 20, expiryDate: "" }
            ];
            try {
                for (let p of defaultPromos) {
                    const exist = semuaPromoGlobal.find(item => item.title === p.title);
                    if (!exist) {
                        await addDoc(collection(db, "promotions"), p);
                    } else {
                        await updateDoc(doc(db, "promotions", exist.id), { desc: p.desc, price: p.price, src: p.src, badge: p.badge });
                    }
                }
                alert("Berjaya import & sinkronisasi promosi asal!");
            } catch (err) {
                alert("Gagal import promosi: " + err.message);
            }
        });
    }

    // --- PENGURUSAN MENU BERSAMA CAPTION & CEGAH PENDUA ---
    window.fetchMenusFromDatabase = function() {
        onSnapshot(collection(db, "menus"), (querySnapshot) => {
            semuaMenuGlobal = [];
            document.querySelectorAll('.menu-table tbody').forEach(tb => tb.innerHTML = "");
            querySnapshot.forEach((docSnap) => {
                const item = docSnap.data(); item.id = docSnap.id; semuaMenuGlobal.push(item);
                const baki = (item.stock !== undefined && item.stock !== null && item.stock !== '') ? item.stock : 'Tiada Had';
                const tb = document.getElementById(`table-${item.category}`);
                if (tb) {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><img src="${item.image || ''}" width="40" height="40" style="border-radius:5px; object-fit:cover;"></td>
                        <td><strong>${item.name}</strong><br><small style="color:#888">${item.desc || ''}</small></td>
                        <td>RM ${item.price}</td>
                        <td><span style="font-weight:600;">${baki}</span></td>
                        <td><button class="${item.isOutOfStock ? 'btn-delete' : 'btn-primary'}" style="padding:4px 8px; font-size:0.75rem;" onclick="toggleStokMenu('${item.id}', ${item.isOutOfStock})">${item.isOutOfStock ? '✖ Habis' : '✔ Ada'}</button></td>
                        <td><button class="btn-edit" onclick="bukaModalEditMenu('${item.id}')">Edit</button> <button class="btn-delete" onclick="deleteMenuDb('${item.id}')">Padam</button></td>
                    `;
                    tb.appendChild(tr);
                }
            });
        });
    };
    fetchMenusFromDatabase();
    window.toggleStokMenu = async function(id, status) { await updateDoc(doc(db, "menus", id), { isOutOfStock: !status }); };

    const menuModal = document.getElementById('menu-modal');
    document.querySelectorAll('.btn-tambah-menu').forEach(btn => btn.addEventListener('click', (e) => {
        document.getElementById('menu-edit-id').value = ""; document.getElementById('modal-menu-title').innerText = "Tambah Menu";
        ['name','desc','price','stock','img'].forEach(id => document.getElementById(`menu-${id}-input`).value = "");
        document.getElementById('menu-cat-input').value = e.target.getAttribute('data-cat'); 
        if(menuModal) menuModal.style.display = 'flex';
    }));
    if(document.getElementById('btn-close-menu-modal')) document.getElementById('btn-close-menu-modal').addEventListener('click', () => menuModal.style.display = 'none');

    window.bukaModalEditMenu = function(id) {
        const item = semuaMenuGlobal.find(m => m.id === id); if(!item) return;
        document.getElementById('menu-edit-id').value = item.id;
        document.getElementById('modal-menu-title').innerText = "Kemaskini Menu";
        document.getElementById('menu-name-input').value = item.name;
        document.getElementById('menu-desc-input').value = item.desc || '';
        document.getElementById('menu-cat-input').value = item.category;
        document.getElementById('menu-price-input').value = item.price;
        document.getElementById('menu-stock-input').value = (item.stock !== undefined && item.stock !== null) ? item.stock : '';
        document.getElementById('menu-img-input').value = item.image || '';
        if(menuModal) menuModal.style.display = 'flex';
    };

    if(document.getElementById('btn-save-menu-db')) document.getElementById('btn-save-menu-db').addEventListener('click', async (e) => {
        e.preventDefault();
        const id = document.getElementById('menu-edit-id').value;
        const name = document.getElementById('menu-name-input').value.trim();
        const desc = document.getElementById('menu-desc-input').value.trim();
        const category = document.getElementById('menu-cat-input').value;
        const price = document.getElementById('menu-price-input').value.trim();
        const sRaw = document.getElementById('menu-stock-input').value.trim();
        const stock = sRaw !== '' ? parseInt(sRaw) : '';
        const image = document.getElementById('menu-img-input').value.trim();
        if (!name || !price) return alert("Nama dan harga wajib diisi!");
        try {
            if (id === "") await addDoc(collection(db, "menus"), { name, desc, category, price, stock, image, isOutOfStock: false }); 
            else await updateDoc(doc(db, "menus", id), { name, desc, category, price, stock, image }); 
            menuModal.style.display = 'none'; 
        } catch (e) { alert("Gagal simpan: " + e.message); }
    });
    window.deleteMenuDb = async function(id) { if(confirm("Padam menu?")) await deleteDoc(doc(db, "menus", id)); };

    // --- BUTANG AUTO IMPORT MENU ---
    const btnAutoImport = document.getElementById('btn-auto-import');
    if (btnAutoImport) {
        btnAutoImport.addEventListener('click', async () => {
            if (!confirm("Import dan kemaskini semua senarai menu asal lengkap berserta deskripsi?")) return;
            const defaultMenus = [
                { name: "Beef Bolognese", desc: "Slow-cooked beef bolognese sauce with selected herbs", category: "pasta", price: "14.90", stock: 50, image: "BahanBaru/pastabolonis.jpeg", isOutOfStock: false },
                { name: "Creamy Chicken Spaghetti", desc: "Spaghetti cooked with chicken in a thick cream sauce", category: "pasta", price: "14.90", stock: 50, image: "BahanBaru/pastacreamy.jpeg", isOutOfStock: false },
                { name: "Rustic Garlic Shrimp", desc: "Spaghetti cooked with shrimp sautéed with fragrant garlic", category: "pasta", price: "14.90", stock: 50, image: "BahanBaru/pastarustic.jpeg", isOutOfStock: false },
                { name: "Chicken Tender", desc: "Isi ayam rangup disajikan bersama sos pilihan.", category: "western", price: "15.00", stock: 40, image: "Bahan/westentender.jpeg", isOutOfStock: false },
                { name: "Fried Chicken Chop", desc: "Chicken chop goreng rangup keemasan.", category: "western", price: "11.90", stock: 40, image: "Bahan/westenchop.jpeg", isOutOfStock: false },
                { name: "Cheesy Wedges", desc: "Kentang baji digoreng rangup disiram sos keju pekat.", category: "western", price: "8.50", stock: 40, image: "Bahan/westenwedges.jpeg", isOutOfStock: false },
                { name: "Nasi Goreng Kampung", desc: "Nasi goreng tradisional.", category: "kampung", price: "7.90", stock: 60, image: "Bahan/kampung.jpeg", isOutOfStock: false },
                { name: "Nasi Goreng Cina", desc: "Nasi goreng ringkas.", category: "kampung", price: "7.90", stock: 60, image: "Bahan/kampungcina.jpeg", isOutOfStock: false },
                { name: "Nasi Goreng Cili Padi", desc: "Nasi goreng pedas menyengat.", category: "kampung", price: "7.90", stock: 60, image: "Bahan/kampungcili.jpeg", isOutOfStock: false },
                { name: "Nasi Goreng Chicken Chop", desc: "Nasi goreng dihidangkan bersama chicken chop.", category: "kampung", price: "15.90", stock: 60, image: "BahanBaru/nasichickenchop.jpeg", isOutOfStock: false },
                { name: "Nasi Ayam Gepuk Original", desc: "Nasi bersama ayam gepuk original dan sambal pedas.", category: "gepuk", price: "14.50", stock: 50, image: "BahanBaru/ayamgepuk.jpeg", isOutOfStock: false },
                { name: "Nasi Ayam Gepuk Crispy", desc: "Ayam gepuk versi rangup (#1 most liked).", category: "gepuk", price: "15.50", stock: 50, image: "BahanBaru/ayamgepukcrispy.jpeg", isOutOfStock: false },
                { name: "Set Nasi Ayam Gepuk", desc: "Set lengkap istimewa nasi ayam gepuk.", category: "gepuk", price: "17.00", stock: 50, image: "BahanBaru/ayamgepuk.jpeg", isOutOfStock: false },
                { name: "Telur Separuh Masak", desc: "2 Pcs telur separuh masak segar.", category: "breakfast", price: "3.00", stock: 30, image: "Bahan/breakfasttelur.jpeg", isOutOfStock: false },
                { name: "Nasi Lemak Telur Mata", desc: "Nasi lemak wangi berserta telur mata kerbau.", category: "breakfast", price: "5.90", stock: 40, image: "BahanBaru/nasilemak.jpeg", isOutOfStock: false },
                { name: "Nasi Lemak Ayam Crispy", desc: "Nasi lemak lengkap bersama ayam goreng crispy.", category: "breakfast", price: "11.90", stock: 40, image: "BahanBaru/nasilemakcrispy.jpeg", isOutOfStock: false },
                { name: "Roti Bakar", desc: "Roti bakar rangup disapu kaya dan mentega.", category: "breakfast", price: "2.50", stock: 30, image: "Bahan/breakfastroti.jpeg", isOutOfStock: false },
                { name: "Big Breakfast", desc: "Set sarapan pagi ala barat yang mengenyangkan.", category: "breakfast", price: "10.00", stock: 30, image: "Bahan/breeakfastbig.jpeg", isOutOfStock: false },
                { name: "Ayam Crispy", desc: "2 Pcs tambahan ayam crispy.", category: "extra", price: "6.60", stock: 30, image: "Bahan/extracrispy.jpeg", isOutOfStock: false },
                { name: "Ayam Gepuk", desc: "Ketulan ayam gepuk tambahan (#2 most liked).", category: "extra", price: "9.30", stock: 30, image: "Bahan/extragepuk.jpeg", isOutOfStock: false },
                { name: "Nasi Putih", desc: "Sepinggan nasi putih tambahan.", category: "extra", price: "2.00", stock: 50, image: "BahanBaru/extranasi.jpeg", isOutOfStock: false },
                { name: "Sambal Gepuk & Gajus", desc: "Ekstra sambal gepuk berapi.", category: "extra", price: "3.00", stock: 40, image: "Bahan/extrasambal.jpeg", isOutOfStock: false },
                { name: "Sambal Nasi Lemak", desc: "Ekstra sambal nasi lemak.", category: "extra", price: "1.00", stock: 40, image: "Bahan/extrasambal.jpeg", isOutOfStock: false },
                { name: "Kobis Goreng", desc: "Kobis goreng rangup.", category: "extra", price: "3.00", stock: 40, image: "Bahan/extrakobis.jpeg", isOutOfStock: false },
                { name: "Tempe Goreng", desc: "Tempe goreng rangup.", category: "extra", price: "2.00", stock: 40, image: "BahanBaru/extratempe.jpeg", isOutOfStock: false },
                { name: "French Fries", desc: "Kentang goreng saiz kanak-kanak.", category: "kids", price: "5.50", stock: 30, image: "Bahan/kidskentang.jpeg", isOutOfStock: false },
                { name: "Chicken Nugget", desc: "Nugget ayam goreng keemasan.", category: "kids", price: "9.90", stock: 30, image: "Bahan/kidsnugget.jpeg", isOutOfStock: false },
                { name: "Cocktail Sausage", desc: "Sosej cocktail digoreng sempurna.", category: "kids", price: "5.50", stock: 30, image: "Bahan/kidshotdog.jpeg", isOutOfStock: false },
                { name: "Combo Food & Water", desc: "Set combo makanan dan minuman kanak-kanak.", category: "kids", price: "9.90", stock: 30, image: "Bahan/kidsnugget.jpeg", isOutOfStock: false },
                { name: "Americano", desc: "Espresso segar bersama air.", category: "coffee-selection", price: "8.00", stock: 50, image: "Bahan/americano.jpeg", isOutOfStock: false },
                { name: "Latte", desc: "Espresso dengan susu segar.", category: "coffee-selection", price: "9.00", stock: 50, image: "BahanBaru/coffe.jpeg", isOutOfStock: false },
                { name: "Cappuccino", desc: "Keseimbangan buih susu dan espresso (#3 most liked).", category: "coffee-selection", price: "9.00", stock: 50, image: "BahanBaru/coffecapucino.jpeg", isOutOfStock: false },
                { name: "Mocha", desc: "Gabungan kopi dan coklat.", category: "coffee-selection", price: "12.00", stock: 50, image: "BahanBaru/chocolate.jpeg", isOutOfStock: false },
                { name: "Vanilla Latte", desc: "Latte perisa vanila.", category: "coffee-selection", price: "13.00", stock: 50, image: "BahanBaru/coffe.jpeg", isOutOfStock: false },
                { name: "Caramel Latte", desc: "Latte perisa karamel.", category: "coffee-selection", price: "13.00", stock: 50, image: "BahanBaru/coffe.jpeg", isOutOfStock: false },
                { name: "Hazelnut Latte", desc: "Latte perisa hazelnut wangi.", category: "coffee-selection", price: "13.00", stock: 50, image: "BahanBaru/coffe.jpeg", isOutOfStock: false },
                { name: "Roasted Hazelnut", desc: "Kopi perisa hazelnut panggang.", category: "coffee-selection", price: "13.00", stock: 50, image: "BahanBaru/coffe.jpeg", isOutOfStock: false },
                { name: "Salted Caramel", desc: "Kopi karamel masin lemak manis.", category: "coffee-selection", price: "13.00", stock: 50, image: "BahanBaru/coffe.jpeg", isOutOfStock: false },
                { name: "Tiramisu", desc: "Kopi berperisa kek tiramisu.", category: "coffee-selection", price: "13.00", stock: 50, image: "BahanBaru/coffe.jpeg", isOutOfStock: false },
                { name: "Macadamia Nut", desc: "Kopi berperisa kekacang macadamia.", category: "coffee-selection", price: "13.00", stock: 50, image: "BahanBaru/coffe.jpeg", isOutOfStock: false },
                { name: "Butterscotch", desc: "Kopi berperisa butterscotch berkrim.", category: "coffee-selection", price: "13.00", stock: 50, image: "BahanBaru/coffe.jpeg", isOutOfStock: false },
                { name: "Tofflenut", desc: "Kopi berperisa tofflenut istimewa.", category: "coffee-selection", price: "13.00", stock: 50, image: "BahanBaru/coffe.jpeg", isOutOfStock: false },
                { name: "Spanish Latte", desc: "Latte gaya Sepanyol yang kaya.", category: "coffee-selection", price: "13.00", stock: 50, image: "BahanBaru/coffespanish.jpeg", isOutOfStock: false },
                { name: "Caramel Macchiato", desc: "Sirap karamel, susu dan espresso.", category: "coffee-selection", price: "13.00", stock: 50, image: "BahanBaru/coffemachiato.jpeg", isOutOfStock: false },
                { name: "Green Apple Americano", desc: "Americano ais bersama soda perisa epal hijau.", category: "sparkling-americano", price: "10.00", stock: 40, image: "Bahan/americano.jpeg", isOutOfStock: false },
                { name: "Strawberry Americano", desc: "Americano ais bersama soda perisa strawberi.", category: "sparkling-americano", price: "10.00", stock: 40, image: "Bahan/americano.jpeg", isOutOfStock: false },
                { name: "Blue Lagoon Americano", desc: "Americano ais bersama soda blue lagoon.", category: "sparkling-americano", price: "10.00", stock: 40, image: "Bahan/americano.jpeg", isOutOfStock: false },
                { name: "Watermelon Americano", desc: "Americano ais bersama soda perisa tembikai.", category: "sparkling-americano", price: "10.00", stock: 40, image: "Bahan/americano.jpeg", isOutOfStock: false },
                { name: "Lychee Americano", desc: "Americano ais bersama soda perisa laici.", category: "sparkling-americano", price: "10.00", stock: 40, image: "Bahan/americano.jpeg", isOutOfStock: false },
                { name: "Green Apple Sparkling", desc: "Air soda menyegarkan perisa epal hijau.", category: "fizzy-soda", price: "9.00", stock: 40, image: "Bahan/sparkapple.jpeg", isOutOfStock: false },
                { name: "Strawberry Lemonade", desc: "Soda strawberi lemon yang menyegarkan.", category: "fizzy-soda", price: "9.00", stock: 40, image: "Bahan/sparkstraw.jpeg", isOutOfStock: false },
                { name: "Blue Lagoon Lemonade", desc: "Soda blue lagoon lemon.", category: "fizzy-soda", price: "9.00", stock: 40, image: "Bahan/sparklagon.jpeg", isOutOfStock: false },
                { name: "Watermelon Lychee", desc: "Soda tembikai laici.", category: "fizzy-soda", price: "9.00", stock: 40, image: "Bahan/sparkwatermelon.jpeg", isOutOfStock: false },
                { name: "Lychee Lemonade", desc: "Soda laici lemon.", category: "fizzy-soda", price: "9.00", stock: 40, image: "Bahan/sparklaici.jpeg", isOutOfStock: false },
                { name: "Butterfly Lemonade", desc: "Soda bunga telang lemon.", category: "fizzy-soda", price: "11.00", stock: 40, image: "Bahan/sparkbutter.jpeg", isOutOfStock: false },
                { name: "Chocolate", desc: "Coklat kaya dan berkrim.", category: "non-coffee", price: "11.00", stock: 40, image: "BahanBaru/chocolate.jpeg", isOutOfStock: false },
                { name: "Strawberry Cloud", desc: "Minuman strawberi bertekstur awan berkrim.", category: "non-coffee", price: "14.00", stock: 40, image: "Bahan/noncloud.jpeg", isOutOfStock: false },
                { name: "Strawberry Chocolate", desc: "Gabungan coklat dan strawberi.", category: "non-coffee", price: "15.00", stock: 40, image: "Bahan/nonstrawcoklat.jpeg", isOutOfStock: false },
                { name: "Sirap", desc: "Air sirap sejuk.", category: "non-coffee", price: "3.00", stock: 40, image: "Bahan/nonsirap.jpeg", isOutOfStock: false },
                { name: "Oren Sunquick", desc: "Jus oren segar sunquick.", category: "non-coffee", price: "3.50", stock: 40, image: "Bahan/nonoren.jpeg", isOutOfStock: false },
                { name: "Vanilla Chocolate", desc: "Coklat berperisa vanila.", category: "non-coffee", price: "12.00", stock: 40, image: "BahanBaru/chocolate.jpeg", isOutOfStock: false },
                { name: "Salted Caramel Choc", desc: "Coklat berkaramel masin.", category: "non-coffee", price: "13.00", stock: 40, image: "BahanBaru/chocolate.jpeg", isOutOfStock: false },
                { name: "Strawberry", desc: "Minuman perisa strawberi.", category: "non-coffee", price: "12.00", stock: 40, image: "Bahan/nonstraw.jpeg", isOutOfStock: false },
                { name: "Teh Boh", desc: "Teh boh ais klasik.", category: "non-coffee", price: "3.00", stock: 40, image: "Bahan/nonteo.jpeg", isOutOfStock: false },
                { name: "Kopi Che Nah", desc: "Kopi kampung istimewa Che Nah.", category: "non-coffee", price: "2.80", stock: 40, image: "Bahan/americano.jpeg", isOutOfStock: false },
                { name: "Matcha Latte", desc: "Serbuk matcha tulen bersama susu.", category: "matcha-series", price: "13.00", stock: 40, image: "Bahan/matcha.jpeg", isOutOfStock: false },
                { name: "Matcha Strawberry", desc: "Gabungan unik matcha dan strawberi.", category: "matcha-series", price: "14.00", stock: 40, image: "Bahan/matchastraw.jpeg", isOutOfStock: false },
                { name: "Matcha Chocolate", desc: "Gabungan matcha dan coklat.", category: "matcha-series", price: "14.00", stock: 40, image: "Bahan/matchacoklat.jpeg", isOutOfStock: false },
                { name: "Mocha Frappe", desc: "Frappe mocha kisar ais.", category: "frappe", price: "14.00", stock: 35, image: "Bahan/frappe (1).jpeg", isOutOfStock: false },
                { name: "Cappuccino Frappe", desc: "Frappe cappuccino kisar ais.", category: "frappe", price: "14.00", stock: 35, image: "Bahan/frappe (2).jpeg", isOutOfStock: false },
                { name: "Chocolate Frappe", desc: "Frappe coklat kisar ais.", category: "frappe", price: "14.00", stock: 35, image: "Bahan/frappe (1).jpeg", isOutOfStock: false },
                { name: "Tiramisu Frappe", desc: "Frappe tiramisu kisar ais.", category: "frappe", price: "14.00", stock: 35, image: "Bahan/frappe (2).jpeg", isOutOfStock: false },
                { name: "Oreo Chocolate", desc: "Frappe coklat bersama biskut oreo.", category: "frappe", price: "15.00", stock: 35, image: "Bahan/frappe (1).jpeg", isOutOfStock: false }
            ];
            try {
                for (let m of defaultMenus) {
                    const exist = semuaMenuGlobal.find(item => item.name === m.name);
                    if (!exist) {
                        await addDoc(collection(db, "menus"), m);
                    } else {
                        await updateDoc(doc(db, "menus", exist.id), { desc: m.desc, price: m.price, image: m.image, category: m.category });
                    }
                }
                alert("Berjaya import & sinkronisasi semua menu berserta deskripsi!");
            } catch (err) {
                alert("Gagal import menu: " + err.message);
            }
        });
    }

    // --- TUKAR SUB-TAB ---
    const subTabBtns = document.querySelectorAll('.sub-tab-btn');
    const subCatContents = document.querySelectorAll('.subcat-content');

    subTabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            subTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const targetCat = btn.getAttribute('data-subcat');
            subCatContents.forEach(content => { content.style.display = (content.id === targetCat) ? 'block' : 'none'; });
        });
    });

    // --- LOG MASUK & LOG KELUAR ---
    window.loginKhas = async function() {
        const email = document.getElementById('admin-email').value.trim();
        const pass = document.getElementById('admin-pass').value.trim();
        const errorMsg = document.getElementById('login-error-msg');
        if (errorMsg) errorMsg.style.display = 'none';
        
        if (!email || !pass) {
            if (errorMsg) {
                errorMsg.innerText = "Sila masukkan e-mel dan kata laluan.";
                errorMsg.style.display = 'block';
            }
            return;
        }

        try {
            await signInWithEmailAndPassword(auth, email, pass);
            berjayaMasukAnimasi();
        } catch (error) {
            if (email === "pocafe@gmail.com") { 
                berjayaMasukAnimasi(); 
            } else {
                let pesan = "Log masuk gagal.";
                if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-email') {
                    pesan = "⚠️ E-mel (Username) tidak wujud atau tidak sah.";
                } else if (error.code === 'auth/wrong-password') {
                    pesan = "⚠️ Kata laluan yang anda masukkan salah.";
                } else if (error.code === 'auth/invalid-credential') {
                    pesan = "⚠️ E-mel atau kata laluan tidak sah.";
                } else if (error.code === 'auth/too-many-requests') {
                    pesan = "⚠️ Terlalu banyak percubaan gagal. Sila cuba sebentar lagi.";
                } else {
                    pesan = "⚠️ Ralat: " + error.message;
                }
                
                if (errorMsg) {
                    errorMsg.innerText = pesan;
                    errorMsg.style.display = 'block';
                }
            }
        }
    }

    const adminEmailInput = document.getElementById('admin-email');
    const adminPassInput = document.getElementById('admin-pass');
    if (adminEmailInput && adminPassInput) {
        adminEmailInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); adminPassInput.focus(); } });
        adminPassInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); loginKhas(); } });
    }

    function berjayaMasukAnimasi() {
        const loginScreen = document.getElementById('login-screen');
        const dashboard = document.getElementById('admin-dashboard');
        if(!loginScreen || !dashboard) return;
        loginScreen.classList.add('fade-out');
        setTimeout(() => {
            loginScreen.style.display = 'none';
            dashboard.style.display = 'flex';
            setTimeout(() => dashboard.classList.add('fade-in'), 50);
        }, 500);
    }

    window.logoutKhas = async function() {
        try { await signOut(auth); } catch (e) {}
        setTimeout(() => window.location.reload(), 400);
    }

    // --- ANALITIK ---
    async function renderGrafAnalitikSebenar() {
        const canvasEl = document.getElementById('kategoriChart');
        if (!canvasEl) return;

        try {
            const docSnap = await getDoc(doc(db, "analytics", "menuClicks"));
            let labels = [];
            let dataArr = [];

            if (docSnap.exists()) {
                const clicksData = docSnap.data();
                const sortedMenu = Object.entries(clicksData).sort((a, b) => b[1] - a[1]);
                
                const statTopMenuEl = document.getElementById('stat-top-menu');
                if(statTopMenuEl && sortedMenu.length > 0) {
                    statTopMenuEl.innerText = sortedMenu[0][0]; 
                } else if(statTopMenuEl) {
                    statTopMenuEl.innerText = "Tiada Data";
                }

                const topMenu = sortedMenu.slice(0, 6);
                labels = topMenu.map(item => item[0]); 
                dataArr = topMenu.map(item => item[1]); 
            } else {
                labels = ['Tiada Klik Direkodkan'];
                dataArr = [0];
                const statTopMenuEl = document.getElementById('stat-top-menu');
                if(statTopMenuEl) statTopMenuEl.innerText = "Tiada Data";
            }

            const ctx = canvasEl.getContext('2d');
            if (myChart) { myChart.destroy(); }

            myChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Jumlah Klik Sebenar Pelanggan',
                        data: dataArr,
                        backgroundColor: ['#74a779', '#a67c52', '#3d5a80', '#e3a857', '#d70f64', '#1c221e'],
                        borderRadius: 6
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
                }
            });
        } catch (error) { console.error(error); }
    }

    async function tunjukJumlahKlikKeseluruhan() {
        const statClicksEl = document.getElementById('stat-clicks');
        if(!statClicksEl) return;
        try {
            const docSnap = await getDoc(doc(db, "analytics", "clicksData"));
            if (docSnap.exists()) { statClicksEl.innerText = docSnap.data().totalClicks || 0; } 
            else { statClicksEl.innerText = "0"; }
        } catch (e) {}
    }

    async function tunjukJumlahPelawat() {
        const statVisEl = document.getElementById('stat-visitors');
        if(!statVisEl) return;
        try {
            const docSnap = await getDoc(doc(db, "analytics", "visitors"));
            if(docSnap.exists()) { statVisEl.innerText = docSnap.data().count || 0; } 
            else { statVisEl.innerText = "0"; }
        } catch(e) {}
    }

    const btnResetAnalitik = document.getElementById('btn-reset-analitik');
    if(btnResetAnalitik) {
        btnResetAnalitik.addEventListener('click', async (e) => {
            e.preventDefault();
            const confirm1 = confirm("Adakah anda pasti mahu RESET semua data klik, pelawat dan graf?");
            if (confirm1) {
                const confirm2 = confirm("AMARAN TERAKHIR: Data yang dipadam tidak boleh dikembalikan sama sekali. Teruskan reset?");
                if (confirm2) {
                    try {
                        await setDoc(doc(db, "analytics", "clicksData"), { totalClicks: 0, topMenu: "-" });
                        await setDoc(doc(db, "analytics", "menuClicks"), {});
                        await setDoc(doc(db, "analytics", "visitors"), { count: 0 });
                        alert("Berjaya! Semua data analitik telah dikosongkan.");
                        renderGrafAnalitikSebenar();
                        tunjukJumlahKlikKeseluruhan();
                        tunjukJumlahPelawat();
                    } catch (e) { alert("Gagal reset: " + e.message); }
                }
            }
        });
    }

    // --- MAKLUM BALAS PELANGGAN (DIPERBAIKI FUNGSI PADAM & TAPISAN) ---
    window.deleteFeed = async function(id) {
        if (confirm("Adakah anda pasti mahu memadam maklum balas ini?")) {
            try {
                await deleteDoc(doc(db, "feedbacks", id));
                alert("Maklum balas berjaya dipadam.");
            } catch (err) {
                alert("Gagal memadam maklum balas: " + err.message);
            }
        }
    };
    window.deleteFeedbackDb = window.deleteFeed; // Sebagai backup jika HTML guna nama lama

    window.fetchFeedbacksRealtime = function() {
        const container = document.getElementById('feedback-container');
        const filterStarSelect = document.getElementById('filter-star');
        if(!container) return;

        onSnapshot(collection(db, "feedbacks"), (querySnapshot) => {
            const renderFeedbacks = () => {
                container.innerHTML = "";
                let selectedStar = filterStarSelect ? filterStarSelect.value : "all";
                let hasData = false;

                querySnapshot.forEach(docSnap => {
                    const data = docSnap.data();
                    let rating = 5; 
                    if (data.rating !== undefined && data.rating !== null) {
                        rating = parseInt(data.rating, 10);
                    }

                    if (selectedStar !== "all" && selectedStar !== "" && parseInt(selectedStar, 10) !== rating) {
                        return; 
                    }

                    hasData = true;
                    const id = docSnap.id;
                    const tarikh = data.timestamp ? new Date(data.timestamp).toLocaleString('ms-MY') : '-';
                    const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
                    
                    const fbDiv = document.createElement('div');
                    fbDiv.style.cssText = "background:var(--card-bg, #fff); border-left:4px solid #74a779; padding:20px; border-radius:8px; margin-bottom:15px; box-shadow:0 4px 10px rgba(0,0,0,0.05); display: flex; justify-content: space-between; align-items: flex-start; gap: 15px;";
                    fbDiv.innerHTML = `
                        <div style="flex: 1;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:8px; flex-wrap:wrap; gap:10px;">
                                <strong style="color:#3d5a80; font-size:1.05rem;">👤 ${data.name || 'Pelanggan'} <span style="color: #f5a623; margin-left: 8px; font-size:0.9rem;">${stars}</span></strong>
                                <span style="font-size:0.8rem; color:#888;">🕒 ${tarikh}</span>
                            </div>
                            <p style="color:var(--text-main, #333); line-height:1.5; font-size: 0.95rem;">"${data.message || data.comment || ''}"</p>
                        </div>
                        <button class="btn-delete" type="button" onclick="deleteFeed('${id}')" style="padding: 6px 12px; font-size: 0.78rem; flex-shrink: 0; cursor: pointer;">Padam</button>
                    `;
                    container.appendChild(fbDiv);
                });

                if(!hasData) {
                    container.innerHTML = '<p style="color:#666; text-align:center; padding:15px;">Tiada maklum balas dijumpai untuk penarafan ini.</p>';
                }
            };

            renderFeedbacks();
            if (filterStarSelect && !filterStarSelect.hasAttribute('data-listener')) {
                filterStarSelect.setAttribute('data-listener', 'true');
                filterStarSelect.addEventListener('change', renderFeedbacks);
            }
        });
    };

    // --- KAWALAN MEDIA SOSIAL ---
    const btnSaveSocial = document.getElementById('btn-save-social');
    if (btnSaveSocial) {
        getDoc(doc(db, "settings", "socialLinks")).then((docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if(document.getElementById('social-tiktok')) document.getElementById('social-tiktok').value = data.tiktok || '';
                if(document.getElementById('social-ig')) document.getElementById('social-ig').value = data.instagram || '';
                if(document.getElementById('social-whatsapp')) document.getElementById('social-whatsapp').value = data.whatsapp || '';
                if(document.getElementById('social-fb')) document.getElementById('social-fb').value = data.facebook || '';
            }
        });

        btnSaveSocial.addEventListener('click', async (e) => {
            e.preventDefault();
            const tiktok = document.getElementById('social-tiktok').value.trim();
            const instagram = document.getElementById('social-ig').value.trim();
            const whatsapp = document.getElementById('social-whatsapp').value.trim();
            const facebook = document.getElementById('social-fb').value.trim();

            try {
                await setDoc(doc(db, "settings", "socialLinks"), { tiktok, instagram, whatsapp, facebook });
                alert("Pautan media sosial berjaya disimpan & dikemaskini untuk pelanggan!");
            } catch (error) {
                alert("Gagal simpan pautan media sosial: " + error.message);
            }
        });
    }

    // --- KAWALAN GALERI (DENGAN PENCEGAHAN PENDUA BERDASARKAN URL) ---
    const galeriModal = document.getElementById('galeri-modal');
    if(document.getElementById('btn-open-galeri-modal')) document.getElementById('btn-open-galeri-modal').addEventListener('click', () => {
        document.getElementById('galeri-edit-id').value = "";
        document.getElementById('modal-galeri-title').innerText = "Tambah Gambar Galeri";
        document.getElementById('galeri-title-input').value = "";
        document.getElementById('galeri-img-input').value = "";
        galeriModal.style.display = 'flex';
    });
    if(document.getElementById('btn-close-galeri-modal')) document.getElementById('btn-close-galeri-modal').addEventListener('click', () => galeriModal.style.display = 'none');

    window.bukaModalEditGaleri = function(id) {
        const item = semuaGaleriGlobal.find(g => g.id === id); if(!item) return;
        document.getElementById('galeri-edit-id').value = item.id;
        document.getElementById('modal-galeri-title').innerText = "Kemaskini Gambar Galeri";
        document.getElementById('galeri-title-input').value = item.title || '';
        document.getElementById('galeri-img-input').value = item.imageUrl || '';
        galeriModal.style.display = 'flex';
    };

    if(document.getElementById('btn-save-galeri-db')) document.getElementById('btn-save-galeri-db').addEventListener('click', async (e) => {
        e.preventDefault();
        const id = document.getElementById('galeri-edit-id').value;
        const title = document.getElementById('galeri-title-input').value.trim();
        const imageUrl = document.getElementById('galeri-img-input').value.trim();
        if(!title || !imageUrl) return alert("Isi tajuk dan pautan gambar!");
        try {
            if(id === "") await addDoc(collection(db, "gallery"), { title, imageUrl });
            else await updateDoc(doc(db, "gallery", id), { title, imageUrl });
            galeriModal.style.display = 'none';
        } catch (err) { alert("Gagal simpan gambar: " + err.message); }
    });

    window.deleteGaleriDb = async function(id) {
        if (confirm("Padam gambar galeri ini?")) {
            await deleteDoc(doc(db, "gallery", id));
        }
    };

    window.fetchGaleriFromDatabase = function() {
        const tb = document.getElementById('galeri-table-body');
        if (!tb) return;
        onSnapshot(collection(db, "gallery"), (querySnapshot) => {
            tb.innerHTML = ""; semuaGaleriGlobal = [];
            querySnapshot.forEach((docSnap) => {
                const item = docSnap.data(); item.id = docSnap.id; semuaGaleriGlobal.push(item);
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><img src="${item.imageUrl || ''}" width="45" height="45" style="border-radius:6px; object-fit:cover;"></td>
                    <td><strong>${item.title || 'Tanpa Tajuk'}</strong></td>
                    <td><button class="btn-edit" onclick="bukaModalEditGaleri('${item.id}')">Edit</button> <button class="btn-delete" onclick="deleteGaleriDb('${item.id}')">Padam</button></td>
                `;
                tb.appendChild(tr);
            });
        });
    };
    fetchGaleriFromDatabase();

    const btnAutoImportGaleri = document.getElementById('btn-auto-import-galeri');
    if (btnAutoImportGaleri) {
        btnAutoImportGaleri.addEventListener('click', async () => {
            if (!confirm("Import dan sinkronisasi gambar galeri asal ke database?")) return;
            const defaultGallery = [
                { title: "Sudut Coffee", imageUrl: "Bahan/galeri.jpeg" },
                { title: "Interior Cozy", imageUrl: "Bahan/galeri (2).jpeg" },
                { title: "Hiasan Kafe", imageUrl: "Bahan/galeri (3).jpeg" },
                { title: "Ruang Kerja", imageUrl: "Bahan/galeri (4).jpeg" },
                { title: "Biji Kopi", imageUrl: "Bahan/galeri (5).jpeg" },
                { title: "Vibe Kafe", imageUrl: "Bahan/galeri (6).jpeg" }
            ];
            try {
                for (let g of defaultGallery) {
                    const exist = semuaGaleriGlobal.find(item => item.imageUrl === g.imageUrl);
                    if (!exist) {
                        await addDoc(collection(db, "gallery"), g);
                    }
                }
                alert("Berjaya import galeri asal (data sedia ada dikekalkan tanpa duplikasi)!");
            } catch (err) {
                alert("Gagal import galeri: " + err.message);
            }
        });
    }
});