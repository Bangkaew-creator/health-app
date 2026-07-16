/**
 * [GAS สำหรับยิง LINE Messaging API]
 * ทำหน้าที่เป็น Webhook (ตัวกลาง) รับคำสั่งจากหน้าเว็บ (Frontend)
 * แล้วยิงข้อความแจ้งเตือนไปยัง LINE ของ อสม. 
 * (ส่วนการบันทึกข้อมูลหลักย้ายไป Firebase 100% แล้ว)
 */

function doPost(e) {
  try {
    const requestData = JSON.parse(e.postData.contents);
    let response = {};

    // 1. ตรวจสอบ Action ที่ส่งมาจากหน้าเว็บ
    if (requestData.action === 'updatePatientVHV') {
      
      // ดึง Token ของ LINE จากชีต Config
      const lineToken = F_getLineToken();
      
      if (lineToken && requestData.vhvId) {
        const tDesc = requestData.taskDesc ? requestData.taskDesc : "ติดตามเยี่ยมบ้านทั่วไป";
        const messageText = `📋 มีการมอบหมายภารกิจ อสม.\n\nรบกวนลงพื้นที่ติดตามดูแลและประเมินอาการผู้ป่วย:\n\n👤 ผู้ป่วย: ${requestData.pName}\n🏠 ที่อยู่: บ้านเลขที่ ${requestData.pHouse} หมู่ที่ ${requestData.pVillage}\n📌 งานที่ต้องทำ: ${tDesc}\n\nเมื่อดำเนินการเสร็จสิ้น รบกวนบันทึกและกด "ยืนยันปิดงาน" ผ่านแอปพลิเคชันด้วยครับ 🙏`;
        
        response = sendLinePushMessage(requestData.vhvId, messageText, lineToken);
      } else {
        response = { success: false, message: 'ไม่พบ LINE Token ในระบบ หรือ ไม่มี UID ของ อสม.' };
      }
      
    } 
    // 2. ดักจับคำสั่งอื่นๆ (Silent Sync) ที่หน้าเว็บอาจจะยังยิงมา เพื่อไม่ให้เกิด Error
    else {
      response = { 
        success: true, 
        message: 'Action ignored: ฟังก์ชันนี้ถูกย้ายไปทำงานบน Firebase เรียบร้อยแล้ว' 
      };
    }
    
    return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ดึง LINE_CHANNEL_ACCESS_TOKEN จากหน้า Sheet 'Config'
 */
function F_getLineToken() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config');
  if (!sheet) return "";
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'LINE_CHANNEL_ACCESS_TOKEN') {
      return String(data[i][1]).trim();
    }
  }
  return "";
}

/**
 * ฟังก์ชันหลักในการยิงข้อความผ่าน LINE Messaging API
 */
function sendLinePushMessage(toUid, textMessage, accessToken) {
  const url = "https://api.line.me/v2/bot/message/push";
  const payload = { 
    "to": String(toUid).trim(), 
    "messages": [{ "type": "text", "text": textMessage }] 
  };
  
  const options = { 
    "method": "post", 
    "headers": { 
      "Content-Type": "application/json", 
      "Authorization": "Bearer " + String(accessToken).trim() 
    }, 
    "payload": JSON.stringify(payload), 
    "muteHttpExceptions": true 
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    const content = response.getContentText();
    
    if (code === 200) {
      return { success: true, message: "ส่งแจ้งเตือน LINE สำเร็จ" };
    } else {
      return { success: false, message: "LINE ปฏิเสธการส่ง: " + content };
    }
  } catch(e) {
    return { success: false, message: "Error ขณะส่ง LINE: " + e.message };
  }
}
