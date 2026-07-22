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
// ระบบป้องกันการลบเครดิตผู้พัฒนา
// ==========================================
document.addEventListener("DOMContentLoaded", function() {
    // 1. สร้างกล่องลายน้ำ (Watermark)
    const creditDiv = document.createElement("div");
    creditDiv.id = "dev-credit-watermark";
    creditDiv.innerHTML = `
        <div style="position: fixed; bottom: 15px; right: 15px; background: rgba(255,255,255,0.85); backdrop-filter: blur(8px); padding: 10px 14px; border-radius: 12px; font-size: 10px; color: #475569; box-shadow: 0 4px 15px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; z-index: 999999; pointer-events: none; text-align: right; line-height: 1.5; font-family: 'Sarabun', sans-serif;">
            <strong style="color: #00694a; font-size: 11px;">ระบบ อสม.สามารถ (Orsomo Smart)</strong><br>
            ออกแบบและพัฒนาโดย:<br>
            <span style="font-weight: bold; color: #1e293b;">นายศุภวุธ อสุนี</span><br>
            นักวิชาการสาธารณสุขปฏิบัติการ<br>
            เทศบาลเมืองบางแก้ว
        </div>
    `;
    
    // 2. แปะลายน้ำลงในหน้าเว็บ
    document.body.appendChild(creditDiv);
    
    // 3. ระบบป้องกันการแอบลบ (MutationObserver)
    // หากมีคนใช้ Inspect Element แอบลบ กล่องนี้จะถูกสร้างใหม่ทันที!
    const observer = new MutationObserver(function(mutations) {
        if (!document.body.contains(creditDiv)) {
            document.body.appendChild(creditDiv);
            console.warn("⚠️ สงวนสิทธิ์เครดิตผู้พัฒนา: ไม่อนุญาตให้ลบลายน้ำ (Orsomo Smart by Suppawut Asunee)");
        }
    });
    
    observer.observe(document.body, { childList: true });

    // 4. พิมพ์ลายน้ำลงใน Console (สำหรับพวกชอบแงะโค้ด)
    console.log(
        "%c🏥 Orsomo Smart System%c\n\nDeveloped by: นายศุภวุธ อสุนี\nPosition: นักวิชาการสาธารณสุขปฏิบัติการ\nOrganization: เทศบาลเมืองบางแก้ว\n\n%c© สงวนสิทธิ์ทรัพย์สินทางปัญญา ห้ามลบหรือดัดแปลงเครดิตผู้พัฒนา", 
        "color: #00694a; font-size: 20px; font-weight: bold;", 
        "color: #333; font-size: 14px;", 
        "color: red; font-size: 12px; font-weight: bold;"
    );
});

