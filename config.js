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

// ==========================================
// ค่าเริ่มต้นของระบบ (Default Fallback)
// ระบบจะใช้ค่าเหล่านี้ หากใน Firebase ยังไม่มีการตั้งค่า
// ใช้สำหรับการนำไปติดตั้งในหน่วยงานใหม่ (White-label)
// ==========================================
const DEFAULT_CONFIGS = {
    HOSPITAL_NAME: "เทศบาลเมืองบางแก้ว",           // ชื่อหน่วยงานตั้งต้น
    SYSTEM_NAME: "อสม.สามารถ (Orsomo Smart)",     // ชื่อระบบ/โปรเจกต์ตั้งต้น
    VILLAGE_COUNT: 16,                            // จำนวนหมู่บ้านตั้งต้น
    DIAPER_PRICE: 9.50,                           // ราคาผ้าอ้อมผู้ใหญ่ตั้งต้น (บาท/ชิ้น)
    UNDERPAD_PRICE: 6.00                          // ราคาแผ่นรองซับตั้งต้น (บาท/ชิ้น)
};

// ==========================================
// 🛡️ DIGITAL WATERMARK & DEVELOPER CREDIT
// (รูปแบบ Sidebar / Menu)
// ==========================================
document.addEventListener("DOMContentLoaded", function() {
    // ฟังก์ชันสำหรับแทรกเครดิตลงใน Sidebar
    function injectCreditToSidebar() {
        // หา <nav> ใน sidebar
        const sidebarNav = document.querySelector('aside nav');
        
        // ถ้าหาเจอ และยังไม่มีเครดิต
        if (sidebarNav && !document.getElementById('dev-credit-sidebar')) {
            const creditDiv = document.createElement("div");
            creditDiv.id = "dev-credit-sidebar";
            // ใช้ mt-auto เพื่อดันกล่องนี้ให้ไปอยู่ล่างสุดของเมนูเสมอ
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

    // เรียกใช้ฟังก์ชันครั้งแรก
    setTimeout(injectCreditToSidebar, 500); // ดีเลย์นิดนึงรอ DOM โหลดเสร็จ

    // ระบบป้องกันการลบ (MutationObserver) จะคอยเฝ้าดูว่า sidebar ถูกแก้หรือลบเครดิตออกหรือไม่
    const observer = new MutationObserver(function(mutations) {
        const sidebarNav = document.querySelector('aside nav');
        if (sidebarNav && !document.getElementById('dev-credit-sidebar')) {
            injectCreditToSidebar();
        }
    });
    
    // เริ่มสังเกตการณ์
    if(document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // พิมพ์ลายน้ำลงใน Console
    console.log(
        "%c🏥 Orsomo Smart System%c\n\nDeveloped by: Suppawut Asunee\nPosition: Public Health Technical Officer\nOrganization: Bang Kaeo Town Municipality\n\n%c© All Rights Reserved.", 
        "color: #00694a; font-size: 20px; font-weight: bold;", 
        "color: #333; font-size: 14px;", 
        "color: red; font-size: 12px; font-weight: bold;"
    );
});

