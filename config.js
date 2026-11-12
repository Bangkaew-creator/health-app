// ==========================================
// ไฟล์ตั้งค่าระบบส่วนหน้า (Frontend Configuration)
// ==========================================

// 1. ตั้งค่า LINE LIFF สำหรับให้ อสม. และเจ้าหน้าที่ล็อกอิน
const LIFF_ID = "2010500776-6r1shNwL";

// 2. ตั้งค่า Webhook สำหรับส่ง LINE (ลิงก์ Web App จาก Google Apps Script)
const API_URL = "https://script.google.com/macros/s/AKfycbyzPy7sklwURcJiqFDzlK4OEQ8616CJLuNyAjb8euQNzYJLXz_dj4UJM63w8-nI1L3r/exec";

// 3. ตั้งค่ากุญแจเชื่อมต่อ Firebase (ฐานข้อมูลหลัก)
const firebaseConfig = {
  apiKey: "AIzaSyBb9rmXVT9A3TFlNHeUu2pp9o8li2WQdik",
  authDomain: "orsomo-smart.firebaseapp.com",
  projectId: "orsomo-smart",
  storageBucket: "orsomo-smart.firebasestorage.app",
  messagingSenderId: "1090261739518",
  appId: "1:1090261739518:web:9e7c9eef5a1ad4f3ad82af"
};

// ==========================================
// 🛡️ ระบบล้างแคชรุ่นก่อน Auth & ปิด Offline Persistence ที่ค้างบนมือถืออัตโนมัติ
// ==========================================
const ORSOMO_BUILD_VERSION = "20261112_v2";
window.ORSOMO_BUILD_VERSION = ORSOMO_BUILD_VERSION;

// ฟังก์ชันต่อท้ายเลขเวอร์ชันให้ลิงก์ภายในทั้งหมด เพื่อบังคับให้มือถือโหลดไฟล์ HTML ใหม่เสมอ
window.OrsomoAppendVer = function(url) {
    if (!url || typeof url !== "string") return url;
    const trimmed = url.trim();
    if (!trimmed || trimmed === "reload" || trimmed === "back" || trimmed.startsWith("#") || trimmed.startsWith("javascript:") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        return url;
    }
    const hashParts = trimmed.split("#");
    const baseAndQuery = hashParts[0];
    const hashSuffix = hashParts.length > 1 ? "#" + hashParts.slice(1).join("#") : "";
    if (!/\.html(\?|$)/i.test(baseAndQuery)) return url;
    if (baseAndQuery.indexOf("_v=" + ORSOMO_BUILD_VERSION) !== -1) return url;

    const cleanQuery = baseAndQuery
        .replace(/([?&])_v=[^&]*(&|$)/g, function(match, p1, p2) {
            return p2 === "&" ? p1 : "";
        })
        .replace(/[?&]$/, "");
    const sep = cleanQuery.indexOf("?") === -1 ? "?" : "&";
    return cleanQuery + sep + "_v=" + ORSOMO_BUILD_VERSION + hashSuffix;
};

(function initPreAuthMigrationAndCacheGuard() {
    try {
        // 1. ปิด enablePersistence ของ Firestore ทันที เพื่อไม่ให้มือถือใช้คิว IndexedDB เก่าจากเวอร์ชันก่อน Auth
        if (typeof firebase !== "undefined" && firebase.firestore && firebase.firestore.Firestore && firebase.firestore.Firestore.prototype) {
            firebase.firestore.Firestore.prototype.enablePersistence = function() {
                return Promise.resolve();
            };
        }
    } catch (e) {}

    try {
        // 2. ล้างกุญแจจำลองและกุญแจล็อก Multi-tab ของ Firestore ที่ค้างใน localStorage
        localStorage.removeItem("dev_mock_uid");
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && (k.indexOf("firestore_") === 0 || k.indexOf("firebase:previous_websocket_failure") === 0)) {
                localStorage.removeItem(k);
            }
        }
    } catch (e) {}

    try {
        // 3. ลบฐานข้อมูล IndexedDB ของ Firestore ที่สร้างไว้ตั้งแต่เวอร์ชันก่อน Auth (แต่เก็บ Auth และ orsomo_uid ไว้)
        if (typeof indexedDB !== "undefined") {
            try { indexedDB.deleteDatabase("firestore/[DEFAULT]/orsomo-smart/main"); } catch (e) {}
            if (typeof indexedDB.databases === "function") {
                indexedDB.databases().then(function(dbs) {
                    (dbs || []).forEach(function(dbInfo) {
                        if (dbInfo && dbInfo.name && dbInfo.name.indexOf("firestore/") === 0) {
                            try { indexedDB.deleteDatabase(dbInfo.name); } catch (e) {}
                        }
                    });
                }).catch(function() {});
            }
        }
    } catch (e) {}

    try {
        const prevBuildVer = localStorage.getItem("orsomo_build_ver");
        const isVersionUpgrade = prevBuildVer !== ORSOMO_BUILD_VERSION;

        if (isVersionUpgrade) {
            localStorage.setItem("orsomo_build_ver", ORSOMO_BUILD_VERSION);
            localStorage.setItem("orsomo_needs_auth_reset", "1");
            try { sessionStorage.removeItem("orsomo_auth_bound"); } catch (e) {}

            // ยกเลิก Service Worker เก่าทั้งหมด
            if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(regs) {
                    regs.forEach(function(r) { r.unregister(); });
                }).catch(function() {});
            }
            // ล้าง CacheStorage ของ PWA ทั้งหมด
            if (typeof window !== "undefined" && "caches" in window) {
                caches.keys().then(function(keys) {
                    keys.forEach(function(k) { caches.delete(k); });
                }).catch(function() {});
            }

            // สั่งดึงไฟล์ใหม่ทับ HTTP Disk Cache ของเบราว์เซอร์ทุกหน้าในระบบ
            if (typeof fetch === "function") {
                const allAppAssets = [
                    "config.js",
                    "core.js",
                    "index.html",
                    "dashboard.html",
                    "patient_list.html",
                    "patient_profile.html",
                    "patient_edit.html",
                    "patient_register.html",
                    "patient_images.html",
                    "assessments.html",
                    "adl_assessment.html",
                    "depression_assessment.html",
                    "vitals_record.html",
                    "home_visit.html",
                    "map_overview.html",
                    "vhv_settings.html",
                    "admin_dashboard.html",
                    "admin_datacenter.html",
                    "admin_reports.html",
                    "admin_resources.html",
                    "admin_analytics.html",
                    "admin_delegation.html",
                    "admin_equipment.html",
                    "admin_finance.html",
                    "admin_inventory.html",
                    "admin_map.html",
                    "admin_settings.html"
                ];
                allAppAssets.forEach(function(asset) {
                    fetch(asset, { cache: "reload", credentials: "same-origin" }).catch(function() {});
                });
            }
        }

        // 4. ตรวจสอบว่าหน้า HTML ปัจจุบันเป็นไฟล์เก่าที่ติดแคชในมือถือหรือไม่
        const searchStr = String(window.location.search || "");
        const hashStr = String(window.location.hash || "");
        const isLiffCallback = searchStr.indexOf("code=") !== -1 ||
            searchStr.indexOf("state=") !== -1 ||
            searchStr.indexOf("liffClientId=") !== -1 ||
            searchStr.indexOf("liffRedirectUri=") !== -1 ||
            hashStr.indexOf("access_token=") !== -1 ||
            hashStr.indexOf("id_token=") !== -1;

        const scripts = Array.from(document.getElementsByTagName("script"));
        const hasCurrentVerScript = scripts.some(function(s) {
            const src = s.getAttribute("src") || "";
            return src.indexOf("config.js") !== -1 && src.indexOf(ORSOMO_BUILD_VERSION) !== -1;
        });

        const pathKey = "orsomo_page_ver_" + (window.location.pathname || "root");
        const pageAlreadyReloaded = sessionStorage.getItem(pathKey) === ORSOMO_BUILD_VERSION;

        if (!isLiffCallback && (!hasCurrentVerScript || isVersionUpgrade) && !pageAlreadyReloaded) {
            sessionStorage.setItem(pathKey, ORSOMO_BUILD_VERSION);
            const targetUrl = window.OrsomoAppendVer(window.location.pathname + window.location.search + window.location.hash);
            fetch(window.location.href, { cache: "reload", credentials: "same-origin" })
                .catch(function() {})
                .finally(function() {
                    if (targetUrl && targetUrl !== (window.location.pathname + window.location.search + window.location.hash)) {
                        window.location.replace(targetUrl);
                    } else {
                        window.location.reload();
                    }
                });
        }
    } catch (e) {}
})();

// ดักจับการคลิกลิงก์ <a href="...html"> ทุกจุดให้แนบเลขเวอร์ชันอัตโนมัติ ป้องกันการเปิดเจอหน้า HTML เก่าในแคชมือถือ
document.addEventListener("click", function(e) {
    try {
        const anchor = e.target && e.target.closest ? e.target.closest("a[href]") : null;
        if (!anchor) return;
        const rawHref = anchor.getAttribute("href");
        if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("javascript:") || anchor.target === "_blank") return;
        const updatedHref = window.OrsomoAppendVer(rawHref);
        if (updatedHref && updatedHref !== rawHref) {
            anchor.setAttribute("href", updatedHref);
        }
    } catch (err) {}
}, true);

// ==========================================
// ค่าเริ่มต้นของระบบ (Default Fallback)
// ==========================================
const DEFAULT_CONFIGS = {
    HOSPITAL_NAME: "เทศบาลเมืองบางแก้ว",
    SYSTEM_NAME: "อสม.สามารถ (Orsomo Smart)",
    VILLAGE_COUNT: 16,
    DIAPER_PRICE: 9.50,
    UNDERPAD_PRICE: 6.00,
    JELLY_PRICE: 55.00,       // ราคากลางปิโตรเลียมเจลลี่ต่อกระปุก/หลอด (บาท)
    JELLY_DEFAULT_QTY: 0,     // จำนวนปิโตรเลียมเจลลี่เริ่มต้นต่อราย/รอบ
    BANNER_PRICE: 0.00        // ค่าป้ายโครงการ / วัสดุโครงการเริ่มต้นต่อรอบ (บาท)
};

// ==========================================
// 🚀 ระบบแจ้งเตือนส่วนกลาง (Centralized Toast Notification)
// ==========================================
window.showToast = function(message, type = 'success', redirectUrl = null) {
    const mountToast = function() {
        let container = document.getElementById('orsomo-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'orsomo-toast-container';
            container.className = 'fixed top-5 left-1/2 transform -translate-x-1/2 z-[99999] flex flex-col gap-3 pointer-events-none w-full max-w-sm px-4';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        const bgColor = type === 'success' ? 'bg-[#00694a]' : (type === 'error' ? 'bg-red-600' : 'bg-amber-500');
        const icon = type === 'success' ? 'check_circle' : (type === 'error' ? 'error' : 'info');

        toast.className = `${bgColor} text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 transform transition-all duration-300 -translate-y-10 opacity-0 pointer-events-auto`;
        toast.innerHTML = `<span class="material-symbols-outlined text-[22px] shrink-0">${icon}</span><span class="font-bold text-sm leading-snug">${message}</span>`;

        container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.remove('-translate-y-10', 'opacity-0');
            toast.classList.add('translate-y-0', 'opacity-100');
        });

        setTimeout(() => {
            toast.classList.remove('translate-y-0', 'opacity-100');
            toast.classList.add('-translate-y-10', 'opacity-0');
            setTimeout(() => {
                toast.remove();
                if (redirectUrl) {
                    if (redirectUrl === 'reload') window.location.reload();
                    else if (redirectUrl === 'back') window.history.back();
                    else window.location.href = window.OrsomoAppendVer ? window.OrsomoAppendVer(redirectUrl) : redirectUrl;
                }
            }, 300);
        }, 3000);
    };

    if (document.body) mountToast();
    else document.addEventListener('DOMContentLoaded', mountToast, { once: true });
};

// โหลดโมดูลกลาง core.js อัตโนมัติหากหน้าเว็บยังไม่ได้ประกาศ <script src="core.js">
(function ensureCoreModuleLoaded() {
    if (typeof window === 'undefined' || window.OrsomoCore || window.__orsomoCoreLoading) return;
    const hasScriptTag = Array.from(document.getElementsByTagName('script')).some(s => (s.getAttribute('src') || '').includes('core.js'));
    if (!hasScriptTag) {
        window.__orsomoCoreLoading = true;
        const script = document.createElement('script');
        script.src = 'core.js?v=' + ORSOMO_BUILD_VERSION;
        script.defer = false;
        (document.head || document.documentElement).appendChild(script);
    }
})();

// ==========================================
// 🛡️ DIGITAL WATERMARK & DEVELOPER CREDIT
// ==========================================
document.addEventListener("DOMContentLoaded", function() {
    function injectCreditToSidebar() {
        const sidebarNav = document.querySelector('aside nav');
        if (sidebarNav && !document.getElementById('dev-credit-sidebar')) {
            const creditDiv = document.createElement("div");
            creditDiv.id = "dev-credit-sidebar";
            creditDiv.className = "mt-auto pt-8 pb-4 px-4 text-center select-none pointer-events-none";
            creditDiv.innerHTML = `
                <div class="border-t border-slate-700/50 pt-4">
                    <p style="font-size: 11px; color: #94a3b8; font-weight: bold; font-family: 'Sarabun', sans-serif;">Powered by Orsomo Smart</p>
                    <p style="font-size: 9px; color: #64748b; margin-top: 4px; line-height: 1.4; font-family: 'Sarabun', sans-serif;">
                        Designed & Developed by<br>
                        <span style="color: #cbd5e1;">Suppawut Asunee</span><br>
                        Public Health Technical Officer
                    </p>
                </div>
            `;
            sidebarNav.appendChild(creditDiv);
        }
    }
    setTimeout(injectCreditToSidebar, 500);
    const observer = new MutationObserver(function() {
        const sidebarNav = document.querySelector('aside nav');
        if (sidebarNav && !document.getElementById('dev-credit-sidebar')) { injectCreditToSidebar(); }
    });
    if (document.body) { observer.observe(document.body, { childList: true, subtree: true }); }
});
