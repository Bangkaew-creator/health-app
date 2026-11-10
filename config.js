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

// ปิดช่องโหว่บัญชีจำลอง (Mockup Account) ถาวรทันทีที่โหลดหน้าเว็บ และตรวจสอบเวอร์ชันแคชอัตโนมัติ
const ORSOMO_BUILD_VERSION = "20261109_v3";
window.ORSOMO_BUILD_VERSION = ORSOMO_BUILD_VERSION;

try {
    localStorage.removeItem("dev_mock_uid");
    const prevBuildVer = localStorage.getItem("orsomo_build_ver");
    if (prevBuildVer !== ORSOMO_BUILD_VERSION) {
        localStorage.setItem("orsomo_build_ver", ORSOMO_BUILD_VERSION);
        try { sessionStorage.removeItem("orsomo_auth_bound"); } catch (e) {}
        if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
            navigator.serviceWorker.getRegistrations().then(function(regs) {
                regs.forEach(function(r) { r.unregister(); });
            }).catch(function() {});
        }
        if (typeof window !== "undefined" && "caches" in window) {
            caches.keys().then(function(keys) {
                keys.forEach(function(k) { caches.delete(k); });
            }).catch(function() {});
        }
        const reloadFlagKey = "orsomo_reloaded_" + ORSOMO_BUILD_VERSION;
        if (!sessionStorage.getItem(reloadFlagKey)) {
            sessionStorage.setItem(reloadFlagKey, "1");
            fetch(window.location.href, { cache: "reload", credentials: "same-origin" })
                .catch(function() {})
                .finally(function() {
                    window.location.reload();
                });
        }
    }
} catch (e) {}

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
                    else window.location.href = redirectUrl;
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
