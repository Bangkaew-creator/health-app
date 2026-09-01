// ==========================================
// ไฟล์ตั้งค่าระบบส่วนหน้า (Frontend Configuration)
// ==========================================

// 1. ตั้งค่า LINE LIFF สำหรับให้ อสม. ล็อกอิน
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

// 🌟 4. ตั้งค่า Web Push Notification (FCM VAPID Key) 🌟
// นำ Public Key ที่ได้จาก Firebase Console (ในขั้นตอนที่ 1) มาวางตรงนี้ครับ
const FCM_VAPID_KEY = "BF5a8DkIAe7RFCtQncWmot8vhfljefq1Qt18oIZOvgJedAaFn0msZ6HmJlEjpG2v8mJT9ZkpL5KYtlX4DJGB0lM";

// ==========================================
// ค่าเริ่มต้นของระบบ (Default Fallback)
// ==========================================
const DEFAULT_CONFIGS = {
    HOSPITAL_NAME: "เทศบาลเมืองบางแก้ว",           
    SYSTEM_NAME: "อสม.สามารถ (Orsomo Smart)",     
    VILLAGE_COUNT: 16,                            
    DIAPER_PRICE: 9.50,                           
    UNDERPAD_PRICE: 6.00                          
};

// ==========================================
// 🚀 ระบบแจ้งเตือนอัจฉริยะ (Toast Notification สำหรับ Admin)
// ==========================================
window.showToast = function(message, type = 'success', redirectUrl = null) {
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
    
    toast.className = `${bgColor} text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 transform transition-all duration-300 -translate-y-10 opacity-0`;
    toast.innerHTML = `<span class="material-symbols-outlined text-[24px]">${icon}</span><span class="font-bold text-sm">${message}</span>`;
    
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
    }, 3000); // แสดง 3 วินาที
};

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
    const observer = new MutationObserver(function(mutations) {
        const sidebarNav = document.querySelector('aside nav');
        if (sidebarNav && !document.getElementById('dev-credit-sidebar')) { injectCreditToSidebar(); }
    });
    if(document.body) { observer.observe(document.body, { childList: true, subtree: true }); }
});

// ==========================================
// 🚀 ระบบส่ง Web Push Notification ส่วนกลาง (FCM)
// ==========================================
window.sendWebPushByRole = async function(villageNo, title, body, targetRole = 'ADMIN_ONLY', specificVhvUid = null) {
    try {
        // 1. ดึง FCM Server Key จากฐานข้อมูล
        const keySnap = await firebase.firestore().collection('SystemConfig').doc('FCM_SERVER_KEY').get();
        if (!keySnap.exists) return;
        const serverKey = keySnap.data().value;
        if (!serverKey) return;

        // 2. ค้นหา fcmToken ของผู้รับเป้าหมาย
        const vhvSnap = await firebase.firestore().collection('VHVs').get();
        let targetTokens = [];

        vhvSnap.forEach(doc => {
            const v = doc.data();
            const token = v.fcmToken;
            if (!token) return; // ถ้าไม่เคยอนุญาตแจ้งเตือน ข้ามไป

            const role = String(v.role || '').toUpperCase();

            // ส่งหา แอดมินส่วนกลาง หรือ แอดมิน รพ.สต. ที่รับผิดชอบหมู่บ้านนี้
            if (targetRole === 'ADMIN_ONLY') {
                if (role === 'ADMIN') {
                    targetTokens.push(token);
                } else if (role === 'SUB_ADMIN') {
                    const assigned = v.assigned_villages || [];
                    if (assigned.includes(String(villageNo))) {
                        targetTokens.push(token);
                    }
                }
            }
            // ส่งหา อสม. เจาะจงตัวบุคคล (ตอนมอบหมายงาน)
            else if (targetRole === 'VHV_SPECIFIC' && doc.id === String(specificVhvUid)) {
                targetTokens.push(token);
            }
        });

        // 3. ถ้าไม่มีคนรับเลย ไม่ต้องส่ง
        if (targetTokens.length === 0) return;

        // 4. สั่ง Google Apps Script ยิงข้อความเข้ามือถือ
        await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'sendWebPush',
                fcmServerKey: serverKey,
                targetTokens: targetTokens,
                title: title,
                body: body,
                clickUrl: targetRole === 'ADMIN_ONLY' ? '/admin_dashboard.html' : '/assessments.html'
            })
        });
    } catch (e) {
        console.error("Web Push Error:", e);
    }
};
