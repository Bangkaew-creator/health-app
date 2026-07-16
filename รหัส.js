/**
 * [Micro-GAS สำหรับยิง LINE Messaging API]
 * ไม่พึ่งพา Google Sheets อีกต่อไป
 * ทำหน้าที่รอรับ Payload จากหน้าเว็บและยิง LINE ทันที
 */

function doPost(e) {
  try {
    const requestData = JSON.parse(e.postData.contents);
    let response = {};

    if (requestData.action === 'updatePatientVHV') {
      
      // ดึง Token ที่หน้าเว็บส่งมาให้ใน Payload
      const lineToken = requestData.lineToken;
      
      if (lineToken && requestData.vhvId) {
        const tDesc = requestData.taskDesc ? requestData.taskDesc : "ติดตามเยี่ยมบ้านทั่วไป";
        const messageText = `📋 มีการมอบหมายภารกิจ อสม.\n\nรบกวนลงพื้นที่ติดตามดูแลและประเมินอาการผู้ป่วย:\n\n👤 ผู้ป่วย: ${requestData.pName}\n🏠 ที่อยู่: บ้านเลขที่ ${requestData.pHouse} หมู่ที่ ${requestData.pVillage}\n📌 งานที่ต้องทำ: ${tDesc}\n\nเมื่อดำเนินการเสร็จสิ้น รบกวนบันทึกและกด "ยืนยันปิดงาน" ผ่านแอปพลิเคชันด้วยครับ 🙏`;
        
        response = sendLinePushMessage(requestData.vhvId, messageText, lineToken);
      } else {
        response = { success: false, message: 'ไม่พบ LINE Token หรือ UID ของ อสม. ในระบบ' };
      }
      
    } else {
      // ดักจับคำสั่งขยะที่อาจค้างอยู่ในระบบ
      response = { success: true, message: 'Action ignored: System migrated to Firebase' };
    }
    
    return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ฟังก์ชันยิงข้อความผ่าน LINE Messaging API
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
    
    if (code === 200) {
      return { success: true, message: "ส่งแจ้งเตือน LINE สำเร็จ" };
    } else {
      return { success: false, message: "LINE ปฏิเสธการส่ง: " + response.getContentText() };
    }
  } catch(e) {
    return { success: false, message: "Error ขณะส่ง LINE: " + e.message };
  }
}
