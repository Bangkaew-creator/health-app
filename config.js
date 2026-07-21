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
