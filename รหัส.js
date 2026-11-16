/**
 * [Micro-GAS สำหรับยิง LINE Messaging API]
 * ไม่พึ่งพา Google Sheets อีกต่อไป
 * ทำหน้าที่รอรับ Payload จากหน้าเว็บและยิง LINE ทันที
 * รองรับการเก็บ LINE_CHANNEL_ACCESS_TOKEN ไว้ใน Script Properties อย่างปลอดภัย
 */

function doPost(e) {
  try {
    const requestData = JSON.parse(e.postData.contents || "{}");
    const action = String(requestData.action || "").trim();

    // 1. ตรวจสอบ Action พิเศษ: pingTest เพื่อทดสอบสถานะระบบ Micro-GAS ปลอดภัย ไม่แครช
    if (action === "pingTest") {
      const hasScriptToken = Boolean(PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ACCESS_TOKEN"));
      const res = {
        status: "ok",
        success: true,
        message: "Micro-GAS is active and healthy",
        hasScriptToken: hasScriptToken,
        timestamp: new Date().toISOString()
      };
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. ตรวจสอบ Action พิเศษ: syncToken / setToken เพื่อบันทึก Token ลง Script Properties
    if (action === "syncToken" || action === "setToken") {
      const tokenToSave = String(requestData.lineToken || requestData.token || "").trim();
      if (tokenToSave) {
        PropertiesService.getScriptProperties().setProperty("LINE_CHANNEL_ACCESS_TOKEN", tokenToSave);
        const res = { success: true, message: "บันทึก LINE_CHANNEL_ACCESS_TOKEN ลง Script Properties สำเร็จ" };
        return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
      } else {
        const res = { success: false, message: "ไม่พบค่า Token สำหรับบันทึก" };
        return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // 3. อ่าน LINE Channel Access Token:
    // ลำดับที่ 1: อ่านจาก Script Properties (ปลอดภัย ไม่รั่วไหลไปยังฝั่ง Client)
    // ลำดับที่ 2: ถ้าใน Script Properties ยังว่าง ให้ใช้ requestData.lineToken เป็น Fallback ชั่วคราว
    let lineToken = PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ACCESS_TOKEN") || "";
    if (!lineToken && requestData.lineToken) {
      lineToken = String(requestData.lineToken).trim();
    }

    let response = {};

    // 1. แจ้งเตือนมอบหมายงาน อสม. (ฟังก์ชันเดิม รองรับ 100%)
    if (action === "updatePatientVHV") {
      if (lineToken && requestData.vhvId) {
        const tDesc = requestData.taskDesc ? requestData.taskDesc : "เยี่ยมบ้านทั่วไป";
        const messageText =
          `📋 มีการมอบหมายภารกิจ อสม.\n\n` +
          `รบกวนลงพื้นที่ติดตามดูแลและประเมินอาการผู้ป่วย:\n\n` +
          `👤 ผู้ป่วย: ${requestData.pName || "-"}\n` +
          `🏠 ที่อยู่: บ้านเลขที่ ${requestData.pHouse || "-"} หมู่ที่ ${requestData.pVillage || "-"}\n` +
          `📌 งานที่ต้องทำ: ${tDesc}\n\n` +
          `เมื่อดำเนินการเสร็จสิ้น รบกวนบันทึกและกด "ยืนยันปิดงาน" ผ่านแอปพลิเคชันด้วยครับ 🙏`;

        response = sendLinePushMessage(requestData.vhvId, messageText, lineToken);
      } else {
        response = { success: false, message: "ไม่พบ LINE Token หรือ UID ของ อสม. ในระบบ" };
      }

    // 2. แจ้งเตือนเคสสุขภาพวิกฤตเร่งด่วน (BP วิกฤต / น้ำตาลผิดปกติ / 9Q รุนแรง / ตกเป็นติดเตียง)
    } else if (action === "notifyCriticalHealthAlert") {
      const recipients = normalizeRecipientUids(requestData.recipientUids, requestData.toUid);
      if (lineToken && recipients.length > 0) {
        const messageText =
          `🚨 แจ้งเตือนสุขภาพเร่งด่วน (เคสวิกฤต)\n` +
          `━━━━━━━━━━━━━━\n` +
          `👤 ผู้ป่วย: ${requestData.pName || "-"}\n` +
          `🏠 ที่อยู่: บ้านเลขที่ ${requestData.pHouse || "-"} หมู่ที่ ${requestData.pVillage || "-"}\n` +
          `⚠️ ประเด็นวิกฤต: ${requestData.alertTitle || "พบค่าสุขภาพผิดปกติรุนแรง"}\n` +
          `📊 รายละเอียด: ${requestData.alertDetails || "-"}\n` +
          `👩‍⚕️ ผู้ประเมิน/บันทึก: ${requestData.assessorName || "เจ้าหน้าที่/อสม."}\n` +
          `🕒 วันเวลา: ${requestData.recordedAt || "-"}\n` +
          `━━━━━━━━━━━━━━\n` +
          `กรุณาตรวจสอบแฟ้มประวัติผู้ป่วยเพื่อพิจารณาติดตามอาการเร่งด่วนครับ`;

        response = sendLineMulticastOrPush(recipients, messageText, lineToken);
      } else {
        response = { success: false, message: "ไม่พบ LINE Token หรือรายชื่อผู้รับแจ้งเตือนวิกฤต" };
      }

    // 3. แจ้งเตือนติดตามรับคืนกายอุปกรณ์ทางการแพทย์ (เมื่อผู้ยืมเสียชีวิต/ย้ายออก/เลิกติดตาม)
    } else if (action === "notifyEquipmentReturnAlert") {
      const recipients = normalizeRecipientUids(requestData.recipientUids, requestData.toUid);
      if (lineToken && recipients.length > 0) {
        const messageText =
          `🦽 แจ้งเตือนติดตามรับคืนกายอุปกรณ์\n` +
          `━━━━━━━━━━━━━━\n` +
          `👤 ผู้ยืม: ${requestData.pName || "-"}\n` +
          `🏠 ที่อยู่: บ้านเลขที่ ${requestData.pHouse || "-"} หมู่ที่ ${requestData.pVillage || "-"}\n` +
          `📌 สถานะผู้ป่วยล่าสุด: ${requestData.newStatus || "-"}\n` +
          `📦 รายการที่ยืมค้างอยู่: ${requestData.equipmentSummary || "-"}\n` +
          `━━━━━━━━━━━━━━\n` +
          `กรุณาประสานงานติดตามรับคืนอุปกรณ์เข้าคลังเพื่อส่งต่อให้ผู้ป่วยรายอื่นต่อไปครับ`;

        response = sendLineMulticastOrPush(recipients, messageText, lineToken);
      } else {
        response = { success: false, message: "ไม่พบ LINE Token หรือรายชื่อผู้รับแจ้งเตือน" };
      }

    // 4. แจ้งเตือนเมื่อมีผู้ลงทะเบียนใหม่ รออนุมัติสิทธิ์ (notifyNewRegistration)
    } else if (action === "notifyNewRegistration" || action === "notifyNewVHV") {
      const recipients = normalizeRecipientUids(requestData.recipientUids, requestData.toUid);
      if (lineToken && recipients.length > 0) {
        const reqRole = String(requestData.requestedRole || requestData.role || "VHV").toUpperCase();
        const roleTitle = reqRole === "ADMIN" ? "ผู้ดูแลระบบส่วนกลาง (ADMIN)" :
                          reqRole === "SUB_ADMIN" ? "เจ้าหน้าที่ รพ.สต. (SUB_ADMIN)" : "อาสาสมัครสาธารณสุข (อสม.)";
        const vhvName = requestData.applicantName || requestData.vhvName || "-";
        const nickTxt = requestData.vhvNickname ? ` (${requestData.vhvNickname})` : "";
        const vNo = requestData.villageNo || requestData.vhvVillage || "";
        const villageTxt = (reqRole === "VHV" && vNo && vNo !== "-") ? `\n📍 หมู่ที่รับผิดชอบ: หมู่ที่ ${vNo}` : "";
        const phone = requestData.applicantPhone || requestData.vhvPhone || "-";
        const regTime = requestData.registeredAt || "-";

        const messageText =
          `🆕 มีผู้ลงทะเบียนเข้าใช้งานใหม่ รออนุมัติสิทธิ์\n` +
          `━━━━━━━━━━━━━━\n` +
          `👤 ชื่อ-สกุล: ${vhvName}${nickTxt}\n` +
          `🔰 ตำแหน่งที่ขอ: ${roleTitle}${villageTxt}\n` +
          `📞 เบอร์โทร: ${phone}\n` +
          `🕒 วันเวลา: ${regTime}\n` +
          `━━━━━━━━━━━━━━\n` +
          `กรุณาเข้าเมนู "มอบหมายงาน อสม." เพื่อตรวจสอบและอนุมัติการเข้าใช้งานครับ`;

        response = sendLineMulticastOrPush(recipients, messageText, lineToken);
      } else {
        response = { success: false, message: "ไม่พบ LINE Token หรือ UID แอดมิน/เจ้าหน้าที่ผู้รับแจ้งเตือน" };
      }

    // 5. แจ้งเตือนผลการอนุมัติสิทธิ์ให้ผู้สมัครทราบ (notifyApprovalResult)
    } else if (action === "notifyApprovalResult") {
      const targetUid = String(requestData.targetUid || requestData.toUid || "").trim();
      const isApproved = requestData.approved === true || requestData.approved === "true";
      if (lineToken && targetUid) {
        let messageText = "";
        if (isApproved) {
          const reqRole = String(requestData.approvedRole || requestData.role || "VHV").toUpperCase();
          const roleName = reqRole === "ADMIN" ? "ผู้ดูแลระบบส่วนกลาง (ADMIN)" :
                           reqRole === "SUB_ADMIN" ? "เจ้าหน้าที่ รพ.สต. (SUB_ADMIN)" : "อาสาสมัครสาธารณสุข (อสม.)";
          messageText =
            `✅ ผลการตรวจสอบสิทธิ์การใช้งาน\n` +
            `━━━━━━━━━━━━━━\n` +
            `เรียนคุณ ${requestData.targetName || ""}\n\n` +
            `บัญชีของคุณได้รับการ "อนุมัติสิทธิ์" เรียบร้อยแล้ว 🎉\n` +
            `🔰 สิทธิ์การใช้งาน: ${roleName}\n` +
            `👨‍💼 ผู้อนุมัติ: ${requestData.approverName || "ผู้ดูแลระบบ"}\n` +
            `━━━━━━━━━━━━━━\n` +
            `คุณสามารถเปิดเข้าใช้งานระบบ อสม.สามารถ ได้ทันทีครับ 🙏`;
        } else {
          messageText =
            `❌ ผลการตรวจสอบสิทธิ์การใช้งาน\n` +
            `━━━━━━━━━━━━━━\n` +
            `เรียนคุณ ${requestData.targetName || ""}\n\n` +
            `ขออภัย บัญชีของคุณ "ไม่ผ่านการอนุมัติสิทธิ์" เข้าใช้งานระบบ\n` +
            `📌 รายละเอียด: ${requestData.reason || "ข้อมูลไม่สอดคล้องกับระเบียบหน่วยงาน หรือไม่พบชื่อในสังกัด"}\n` +
            `━━━━━━━━━━━━━━\n` +
            `หากมีข้อสงสัย กรุณาติดต่อผู้ดูแลระบบหรือเจ้าหน้าที่สาธารณสุขในพื้นที่ครับ`;
        }

        response = sendLinePushMessage(targetUid, messageText, lineToken);
      } else {
        response = { success: false, message: "ไม่พบ LINE Token หรือ UID ผู้รับผลการอนุมัติ" };
      }

    // 6. แจ้งเตือนคำขอรับผ้าอ้อม/แผ่นรองซับใหม่ (notifyNewDiaperRequest)
    } else if (action === "notifyNewDiaperRequest") {
      const recipients = normalizeRecipientUids(requestData.recipientUids, requestData.toUid);
      if (lineToken && recipients.length > 0) {
        const sizeTxt = requestData.diaperSize ? ` (ไซส์ ${requestData.diaperSize})` : "";
        const messageText =
          `📦 มีคำขอรับผ้าอ้อม/แผ่นรองซับใหม่ (กปท.)\n` +
          `━━━━━━━━━━━━━━\n` +
          `👤 ผู้ป่วย: ${requestData.pName || "-"}\n` +
          `🏠 ที่อยู่: บ้านเลขที่ ${requestData.pHouse || "-"} หมู่ที่ ${requestData.pVillage || "-"}\n` +
          `📋 รายการที่ขอ: ${requestData.diaperType || "ผ้าอ้อม/แผ่นรองซับ"}${sizeTxt}\n` +
          `👩‍⚕️ ผู้ทำรายการ/อสม.: ${requestData.requesterName || "เจ้าหน้าที่/อสม."}\n` +
          `🕒 วันเวลา: ${requestData.recordedAt || "-"}\n` +
          `━━━━━━━━━━━━━━\n` +
          `กรุณาตรวจสอบข้อมูลในระบบ "Data Center" เพื่อเตรียมการจัดสรรในรอบถัดไปครับ`;

        response = sendLineMulticastOrPush(recipients, messageText, lineToken);
      } else {
        response = { success: false, message: "ไม่พบ LINE Token หรือรายชื่อผู้รับแจ้งเตือนคำขอผ้าอ้อม" };
      }

    // 7. แจ้งเตือนเมื่อ อสม. ปฏิบัติภารกิจเสร็จสิ้น (notifyTaskCompleted)
    } else if (action === "notifyTaskCompleted") {
      const recipients = normalizeRecipientUids(requestData.recipientUids, requestData.toUid);
      if (lineToken && recipients.length > 0) {
        const messageText =
          `✅ อสม. ปฏิบัติภารกิจเสร็จสิ้น (ยืนยันปิดงาน)\n` +
          `━━━━━━━━━━━━━━\n` +
          `👤 ผู้ป่วย: ${requestData.pName || "-"}\n` +
          `🏠 ที่อยู่: บ้านเลขที่ ${requestData.pHouse || "-"} หมู่ที่ ${requestData.pVillage || "-"}\n` +
          `👩‍⚕️ อสม. ผู้ปฏิบัติงาน: ${requestData.vhvName || "อสม.ประจำหมู่บ้าน"}\n` +
          `📋 ภารกิจที่ดำเนินการ: ${requestData.completedTasks || "เยี่ยมบ้าน/ดูแลสุขภาพ"}\n` +
          `🕒 เวลาปิดงาน: ${requestData.completedAt || "-"}\n` +
          `━━━━━━━━━━━━━━\n` +
          `ข้อมูลการลงพื้นที่ได้รับการอัปเดตเข้าสู่ระบบเรียบร้อยแล้ว`;

        response = sendLineMulticastOrPush(recipients, messageText, lineToken);
      } else {
        response = { success: false, message: "ไม่พบ LINE Token หรือรายชื่อผู้รับแจ้งเตือนปิดงาน" };
      }

    } else {
      // ดักจับคำสั่งขยะที่อาจค้างอยู่ในระบบ
      response = { success: true, message: "Action ignored: System migrated to Firebase" };
    }

    return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", success: false, message: error.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * จัดเตรียมและกรองรหัส LINE UID ไม่ให้ซ้ำหรือว่างเปล่า
 */
function normalizeRecipientUids(uidList, singleUid) {
  const raw = [];
  if (Array.isArray(uidList)) {
    for (let i = 0; i < uidList.length; i++) {
      if (uidList[i]) raw.push(String(uidList[i]).trim());
    }
  }
  if (singleUid) raw.push(String(singleUid).trim());

  const unique = [];
  const seen = {};
  for (let j = 0; j < raw.length; j++) {
    const id = raw[j];
    // LINE User ID มาตรฐานขึ้นต้นด้วย U และยาว >= 10 ตัวอักษร
    if (id && id.length >= 10 && !seen[id]) {
      seen[id] = true;
      unique.push(id);
    }
  }
  return unique;
}

/**
 * ส่งข้อความหาผู้รับ 1 คน (Push) หรือหลายคนพร้อมกัน (Multicast สูงสุดครั้งละ 500 คน)
 */
function sendLineMulticastOrPush(uids, textMessage, accessToken) {
  if (!uids || uids.length === 0) {
    return { success: false, message: "ไม่มีรายชื่อผู้รับ" };
  }
  if (uids.length === 1) {
    return sendLinePushMessage(uids[0], textMessage, accessToken);
  }

  const url = "https://api.line.me/v2/bot/message/multicast";
  const chunkSize = 500;
  let allSuccess = true;
  let lastError = "";

  for (let i = 0; i < uids.length; i += chunkSize) {
    const chunk = uids.slice(i, i + chunkSize);
    const payload = {
      to: chunk,
      messages: [{ type: "text", text: textMessage }]
    };

    const options = {
      method: "post",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + String(accessToken).trim()
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    try {
      const response = UrlFetchApp.fetch(url, options);
      const code = response.getResponseCode();
      if (code !== 200) {
        allSuccess = false;
        lastError = response.getContentText();
      }
    } catch (e) {
      allSuccess = false;
      lastError = e.message;
    }
  }

  return allSuccess
    ? { success: true, message: "ส่งแจ้งเตือน LINE สำเร็จ (" + uids.length + " ราย)" }
    : { success: false, message: "บางรายการส่งไม่สำเร็จ: " + lastError };
}

/**
 * ฟังก์ชันยิงข้อความผ่าน LINE Messaging API (รายบุคคล)
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
  } catch (e) {
    return { success: false, message: "Error ขณะส่ง LINE: " + e.message };
  }
}
