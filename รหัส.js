// [F0] คอนฟิกหลัก
const SHEET_NAMES = { USERS: 'Users', PATIENTS: 'Patients', VITALS: 'Vitals' };
const IMAGE_FOLDER_ID = '1dMIOwVRSkYvEGDb5-VksdrA2Hx60xYrd';

// [F1] ระบบ API Endpoint หลัก
function doPost(e) {
  try {
    const requestData = JSON.parse(e.postData.contents);
    let response = {};
    switch (requestData.action) {
      case 'checkUserRegistration': response = F_checkUserRegistration(requestData.uid); break;
      case 'saveNewPatient': response = F_savePatient(requestData.patient); break;
      case 'getAllPatients': response = F_getAllPatients(); break;
      case 'getPatientById': response = F_getPatientById(requestData.id); break;
      case 'saveADLScore': response = F_saveADLScore(requestData.id, requestData.score, requestData.group); break;
      case 'updatePatientData': response = F_updatePatientData(requestData.data); break;
      case 'saveDepression': response = F_saveDepressionScore(requestData.id, requestData.score2q, requestData.score9q, requestData.status); break;
      case 'saveVitals': response = F_saveVitals(requestData.data); break;
      case 'getVitals': response = F_getVitals(requestData.id); break;
      case 'getAssessments': response = F_getAssessments(requestData.id); break;
      case 'uploadImage': response = F_uploadImage(requestData.id, requestData.imageType, requestData.base64, requestData.filename); break;
      case 'updateVHVProfile': response = F_updateVHVProfile(requestData.data); break;
      case 'updatePatientStatus': response = F_updatePatientStatus(requestData.id, requestData.status); break;
      case 'updateResourceApproval': response = F_updateResourceApproval(requestData.id, requestData.diaperQty, requestData.underpadQty); break;
      case 'getAllVHVs': response = F_getAllVHVs(); break;
      case 'updatePatientVHV': response = F_updatePatientVHV(requestData.id, requestData.vhvId, requestData.taskDesc); break; // [แก้ไขจุดนี้]
      case 'recordCommitteeDecision': response = F_recordCommitteeDecision(requestData.patientIds, requestData.fy, requestData.round, requestData.months); break;
      case 'registerUser': response = F_registerUser(requestData.uid, requestData.name, requestData.role, requestData.village_no, requestData.phone); break;
      case 'getPendingVHVs': response = F_getPendingVHVs(); break;
      case 'manageVHVStatus': response = F_manageVHVStatus(requestData.targetUid, requestData.actionType); break;
      case 'getUserProfile': response = F_getUserProfile(requestData.uid); break;
      case 'updateUserProfile': response = F_updateUserProfile(requestData.uid, requestData.name, requestData.phone, requestData.pic); break;
      case 'getAllSystemConfigs': response = F_getAllSystemConfigs(); break;
      case 'updateSystemConfigs': response = F_updateSystemConfigs(requestData.configs); break;
      case 'registerAdmin': response = F_registerAdmin(requestData.uid, requestData.name, requestData.phone, requestData.secretCode); break;
      case 'importPatients': response = F_importPatients(requestData.patients); break;
      default: response = { status: 'error', message: 'Action not found' };
    }
    return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function F_getAllPatients() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Patients');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  
  const colId = headers.indexOf('patient_id');
  const colIdCard = headers.indexOf('id_card');
  const colPrefix = headers.indexOf('prefix');
  const colName = headers.indexOf('name');
  const colAge = headers.indexOf('age');
  const colHouse = headers.indexOf('house_no');
  const colVillage = headers.indexOf('village_no');
  const colLatLong = headers.indexOf('lat_long'); 
  const colDisease = headers.indexOf('disease');
  const colMedication = headers.indexOf('medication');
  const colCaregiverName = headers.indexOf('caregiver_name');
  const colCaregiverPhone = headers.indexOf('caregiver_phone');
  const colGroup = headers.indexOf('patient_group');
  const colAdl = headers.indexOf('adl_score');
  const colDepression = headers.indexOf('depression_status');
  const colLastAssess = headers.indexOf('last_assessment_date');
  const colStatus = headers.indexOf('status');
  const colDiaper = headers.indexOf('diaper_size'); 
  const colEquipment = headers.indexOf('required_equipment');
  const colAssignedVHV = headers.indexOf('assigned_vhv_id'); 
  
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (colId === -1 || !row[colId]) continue; 
    let currentStatus = 'Active';
    if (colStatus > -1 && String(row[colStatus]).trim() !== '') {
      currentStatus = String(row[colStatus]).trim();
    }
    
    list.push({
      id: String(row[colId]),
      id_card: colIdCard > -1 ? String(row[colIdCard]) : '-',
      prefix: colPrefix > -1 ? String(row[colPrefix]) : '',
      name: colName > -1 ? String(row[colName]) : '',
      age: colAge > -1 ? String(row[colAge]) : '-',
      house_no: colHouse > -1 ? String(row[colHouse]) : '',
      village_no: colVillage > -1 ? String(row[colVillage]) : '',
      lat_long: colLatLong > -1 ? String(row[colLatLong]) : '', 
      disease: colDisease > -1 ? String(row[colDisease]) : '-',
      medication: colMedication > -1 ? String(row[colMedication]) : '-',
      caregiver_name: colCaregiverName > -1 ? String(row[colCaregiverName]) : '-',
      caregiver_phone: colCaregiverPhone > -1 ? String(row[colCaregiverPhone]) : '-',
      phone: colCaregiverPhone > -1 ? String(row[colCaregiverPhone]) : '-', 
      group: colGroup > -1 && row[colGroup] ? String(row[colGroup]) : 'ยังไม่ประเมิน',
      adl: colAdl > -1 ? String(row[colAdl]) : '-',
      dep_status: colDepression > -1 ? String(row[colDepression]) : '-',
      last_assess: colLastAssess > -1 ? String(row[colLastAssess]) : '',
      status: currentStatus, 
      diaper: colDiaper > -1 ? String(row[colDiaper]) : '',
      equipment: colEquipment > -1 ? String(row[colEquipment]) : '',
      assigned_vhv_id: colAssignedVHV > -1 ? String(row[colAssignedVHV]).trim() : ''
    });
  }
  return list;
}

function F_savePatient(p) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PATIENTS);
  const patientId = "HN-" + Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd-HHmm");
  const safeHouseNo = "'" + p.house_no;
  let safeDob = p.dob;
  if (safeDob) {
    const parts = safeDob.split('-');
    if (parts.length === 3) {
      let year = parseInt(parts[0]);
      if (year < 2400) year += 543;
      safeDob = "'" + parts[2] + "/" + parts[1] + "/" + year;
    }
  }

  sheet.appendRow([
    patientId, p.id_card || '', p.prefix || '', p.fullname || '', safeDob || '', p.age || '',
    safeHouseNo || '', p.village_no || '', p.lat_long || '', '', '', '', 
    p.caregiver_name || '', p.caregiver_phone ? "'" + p.caregiver_phone : '', '', '', '', '', '', '', 
    'ยังไม่ประเมิน', '-', '', '-', '-', '-', '-', '-', '', '', 'Active'
  ]);
  return { success: true, patient_id: patientId };
}

function F_getConfig(key) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config');
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return null;
}

function F_updateVHVProfile(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.USERS);
  let picUrl = "";
  if (data.pic && data.pic !== "") {
    try {
      const folderName = "VHV_Profiles";
      const folderIterator = DriveApp.getFoldersByName(folderName);
      let folder = folderIterator.hasNext() ? folderIterator.next() : DriveApp.createFolder(folderName);
      const blob = Utilities.newBlob(Utilities.base64Decode(data.pic), "image/jpeg", "vhv_" + data.uid + ".jpg");
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      picUrl = file.getUrl();
    } catch (e) { console.log("Upload Error: " + e); }
  }

  const dataRange = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < dataRange.length; i++) {
    if (dataRange[i][0] === data.uid) { rowIndex = i + 1; break; }
  }

  if (rowIndex > -1) {
    sheet.getRange(rowIndex, 2).setValue(data.name);       
    sheet.getRange(rowIndex, 3).setValue(data.village);    
    sheet.getRange(rowIndex, 6).setValue("'" + data.phone); 
    if (picUrl !== "") sheet.getRange(rowIndex, 7).setValue(picUrl);        
    return { success: true, message: "อัปเดตข้อมูลสำเร็จ", pic_url: picUrl };
  } else { return { success: false, message: "ไม่พบข้อมูลผู้ใช้งาน" }; }
}

function F_getPatientById(id) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PATIENTS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      return {
        id: data[i][0], id_card: data[i][1], prefix: data[i][2], name: data[i][3], dob: data[i][4], age: data[i][5], house_no: data[i][6], village_no: data[i][7], lat_long: data[i][8],
        disease: data[i][9], medication: data[i][10], caregiver_card: data[i][11], caregiver_name: data[i][12], caregiver_phone: data[i][13], diaper: data[i][14], equipment: data[i][15],
        pic_bed: data[i][16], pic_bath: data[i][17], pic_entrance: data[i][18], pic_walkway: data[i][19], group: data[i][20] || 'ยังไม่ประเมิน', adl: data[i][21] !== "" ? data[i][21] : '-',
        profile_pic: data[i][22] || '', bp: data[i][23] || '-', hr: data[i][24] || '-', score_2q: data[i][25] !== "" ? data[i][25] : '-', score_9q: data[i][26] !== "" ? data[i][26] : '-',
        dep_status: data[i][27] || '-', assigned_vhv: data[i][28] || '', last_assess: data[i][29] || '', status: data[i][30]
      };
    }
  }
  return { error: 'ไม่พบข้อมูลผู้ป่วย' };
}

function F_saveADLScore(id, score, group) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.PATIENTS);
  const data = sheet.getDataRange().getValues();
  const today = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
  const timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");

  let aSheet = ss.getSheetByName('Assessments');
  if (!aSheet) {
    aSheet = ss.insertSheet('Assessments');
    aSheet.appendRow(['Timestamp', 'Patient_ID', 'Type', 'Score_1', 'Score_2', 'Result']);
  }
  aSheet.appendRow([timestamp, id, 'ADL', score, '', group]);

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.getRange(i + 1, 21).setValue(group);
      sheet.getRange(i + 1, 22).setValue(score);
      sheet.getRange(i + 1, 30).setValue("'" + today);
      return { success: true };
    }
  }
  return { error: 'ไม่พบข้อมูลผู้ป่วย' };
}

function F_updatePatientData(p) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PATIENTS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === p.id) {
      const row = i + 1; 
      sheet.getRange(row, 3).setValue(p.prefix);             
      sheet.getRange(row, 4).setValue(p.fullname);           
      sheet.getRange(row, 7).setValue("'" + p.house_no);     
      sheet.getRange(row, 8).setValue(p.village_no);         
      sheet.getRange(row, 9).setValue(p.lat_long);           
      sheet.getRange(row, 10).setValue(p.disease);           
      sheet.getRange(row, 11).setValue(p.medication);        
      sheet.getRange(row, 13).setValue(p.caregiver_name);    
      sheet.getRange(row, 14).setValue("'" + p.caregiver_phone); 
      sheet.getRange(row, 15).setValue(p.diaper);            
      sheet.getRange(row, 16).setValue(p.equipment);         
      return { success: true };
    }
  }
  return { error: 'ไม่พบข้อมูลที่ต้องการแก้ไข' };
}

function F_saveDepressionScore(id, score2q, score9q, status) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.PATIENTS);
  const data = sheet.getDataRange().getValues();
  const timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");

  let aSheet = ss.getSheetByName('Assessments');
  if (!aSheet) {
    aSheet = ss.insertSheet('Assessments');
    aSheet.appendRow(['Timestamp', 'Patient_ID', 'Type', 'Score_1', 'Score_2', 'Result']);
  }
  aSheet.appendRow([timestamp, id, 'DEP', score2q, score9q, status]);

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.getRange(i + 1, 26).setValue(score2q);
      sheet.getRange(i + 1, 27).setValue(score9q);
      sheet.getRange(i + 1, 28).setValue(status);
      return { success: true };
    }
  }
  return { error: 'ไม่พบข้อมูลผู้ป่วย' };
}

function F_saveVitals(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let vSheet = ss.getSheetByName(SHEET_NAMES.VITALS);
  if (!vSheet) {
    vSheet = ss.insertSheet(SHEET_NAMES.VITALS);
    vSheet.appendRow(['Timestamp', 'Patient_ID', 'BP_Sys', 'BP_Dia', 'HR', 'Blood_Sugar', 'Meal_Type']);
  }
  const timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");
  vSheet.appendRow([timestamp, data.patient_id, data.sys, data.dia, data.hr, data.sugar, data.meal_type]);

  const pSheet = ss.getSheetByName(SHEET_NAMES.PATIENTS);
  const pData = pSheet.getDataRange().getValues();
  for (let i = 1; i < pData.length; i++) {
    if (pData[i][0] === data.patient_id) {
      if (data.sys && data.dia) pSheet.getRange(i + 1, 24).setValue(data.sys + '/' + data.dia); 
      if (data.hr) pSheet.getRange(i + 1, 25).setValue(data.hr); 
      break;
    }
  }
  return { success: true };
}

function F_getVitals(id) {
  const vSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.VITALS);
  if (!vSheet) return [];
  const data = vSheet.getDataRange().getValues();
  const records = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === id) {
      records.push({ date: data[i][0], sys: data[i][2], dia: data[i][3], hr: data[i][4], sugar: data[i][5], meal: data[i][6] });
    }
  }
  return records;
}

function F_getAssessments(id) {
  const aSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Assessments');
  if (!aSheet) return [];
  const data = aSheet.getDataRange().getValues();
  const records = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === id) {
      records.push({ date: data[i][0], type: data[i][2], score1: data[i][3], score2: data[i][4], result: data[i][5] });
    }
  }
  return records;
}

function F_uploadImage(id, imageType, base64Data, filename) {
  try {
    const folder = DriveApp.getFolderById(IMAGE_FOLDER_ID);
    const contentType = base64Data.substring(5, base64Data.indexOf(';'));
    const bytes = Utilities.base64Decode(base64Data.split(',')[1]);
    const blob = Utilities.newBlob(bytes, contentType, filename);
    const file = folder.createFile(blob);
    const fileUrl = file.getUrl();

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PATIENTS);
    const data = sheet.getDataRange().getValues();
    let colIndex = 22; 
    if (imageType === 'Pic_Bed') colIndex = 16;        
    else if (imageType === 'Pic_Bath') colIndex = 17;    
    else if (imageType === 'Pic_Entrance') colIndex = 18; 
    else if (imageType === 'Pic_Walkway') colIndex = 19;  

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === id) {
        sheet.getRange(i + 1, colIndex + 1).setValue(fileUrl);
        return { success: true, url: fileUrl };
      }
    }
    return { error: 'ไม่พบข้อมูลผู้ป่วย' };
  } catch (e) { return { error: e.toString() }; }
}

function F_updatePatientStatus(id, newStatus) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PATIENTS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.getRange(i + 1, 31).setValue(newStatus);
      return { success: true, message: 'อัปเดตสถานะเรียบร้อยแล้ว' };
    }
  }
  return { success: false, message: 'ไม่พบข้อมูลผู้ป่วยรายนี้' };
}

function F_updateResourceApproval(id, diaperQty, underpadQty) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Patients'); 
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const colId = headers.indexOf('patient_id');
  const colDiaper = headers.indexOf('diaper_size'); 
  
  if (colId === -1 || colDiaper === -1) return { success: false, message: 'หารหัสผู้ป่วย หรือ คอลัมน์ Diaper_Size ไม่พบ' };
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colId]) === String(id)) {
      let currentDiaper = String(data[i][colDiaper]).trim();
      let diaperObj = {};
      if (currentDiaper && currentDiaper !== '') {
        if (currentDiaper.includes('""')) { currentDiaper = currentDiaper.replace(/""/g, '"'); }
        if (currentDiaper.startsWith('"') && currentDiaper.endsWith('"')) { currentDiaper = currentDiaper.substring(1, currentDiaper.length - 1); }
        try { diaperObj = JSON.parse(currentDiaper); } catch(e) {}
      }
      diaperObj.approved_diaper = diaperQty || 0;
      diaperObj.approved_underpad = underpadQty || 0;
      diaperObj.approve_status = "อนุมัติแล้ว";
      diaperObj.approve_date = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
      sheet.getRange(i + 1, colDiaper + 1).setValue(JSON.stringify(diaperObj));
      return { success: true, message: 'บันทึกการอนุมัติเรียบร้อยแล้ว' };
    }
  }
  return { success: false, message: 'ไม่พบรหัสผู้ป่วยรายนี้' };
}

function F_getAllVHVs() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const colUid = headers.indexOf('uid');
  const colName = headers.indexOf('name');
  const colVillage = headers.indexOf('village_no');
  const colStatus = headers.indexOf('status');
  const colPhone = headers.indexOf('phone');

  const list = [];
  for (let i = 1; i < data.length; i++) {
    if (colUid > -1 && data[i][colUid]) {
       const status = colStatus > -1 ? String(data[i][colStatus]).trim() : '';
       const village = colVillage > -1 ? String(data[i][colVillage]).trim() : '';
       if (status === 'Active' && village.toUpperCase() !== 'ADMIN') {
         list.push({ uid: String(data[i][colUid]).trim(), name: colName > -1 ? String(data[i][colName]) : 'ไม่ระบุชื่อ', village_no: village, phone: colPhone > -1 ? String(data[i][colPhone]) : '-' });
       }
    }
  }
  return list;
}

// [แก้ไขจุดนี้] เปลี่ยนแปลงการดึง Task Description ไปแจ้งเตือน
function F_updatePatientVHV(id, vhvId, taskDesc) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Patients');
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const colId = headers.indexOf('patient_id');
  const colName = headers.indexOf('name');
  const colHouse = headers.indexOf('house_no');
  const colVillage = headers.indexOf('village_no');
  const colAssignedVHV = headers.indexOf('assigned_vhv_id');

  if (colId === -1 || colAssignedVHV === -1) return { success: false, message: 'โครงสร้างตารางไม่สมบูรณ์' };

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colId]) === String(id)) {
      sheet.getRange(i + 1, colAssignedVHV + 1).setValue(String(vhvId).trim());
      
      const pName = colName > -1 ? data[i][colName] : 'ไม่ระบุชื่อ';
      const pHouse = colHouse > -1 ? data[i][colHouse] : '-';
      const pVillage = colVillage > -1 ? data[i][colVillage] : '-';
      
      const tDesc = taskDesc ? taskDesc : "ติดตามเยี่ยมบ้านทั่วไป";
      const messageText = `📋 มีการมอบหมายภารกิจ อสม.\n\nรบกวนลงพื้นที่ติดตามและดูแลผู้ป่วย:\n\n👤 ผู้ป่วย: ${pName}\n🏠 ที่อยู่: บ้านเลขที่ ${pHouse} หมู่ที่ ${pVillage}\n📌 งานที่ต้องทำ: ${tDesc}\n\nเมื่อดำเนินการเสร็จสิ้น รบกวนบันทึกและกด "ยืนยันปิดงาน" ผ่านแอปพลิเคชันด้วยครับ 🙏`;
      
      let lineResultMsg = "ไม่ได้ส่ง (หา Token จาก Config ไม่เจอ)";
      const lineToken = F_getConfig('LINE_CHANNEL_ACCESS_TOKEN'); 
      
      if (lineToken && vhvId) {
        try {
          const resText = sendLinePushMessage(vhvId, messageText, lineToken);
          if (resText === "{}" || resText.includes("sentMessages")) {
             lineResultMsg = "ส่งแจ้งเตือนเข้า LINE สำเร็จ!";
          } else {
             lineResultMsg = `LINE ปฏิเสธข้อความ: ${resText}\n(พยายามส่งไปที่ UID: ${vhvId})`;
          }
        } catch(e) { lineResultMsg = "Error ฝั่ง Google: " + e.message; }
      }
      return { success: true, message: `บันทึกการมอบหมายงานเรียบร้อยแล้ว\n\n[สถานะ LINE]\n${lineResultMsg}` };
    }
  }
  return { success: false, message: 'ไม่พบรหัสผู้ป่วยรายนี้' };
}

function sendLinePushMessage(toUid, textMessage, accessToken) {
  const url = "https://api.line.me/v2/bot/message/push";
  const payload = { "to": String(toUid).trim(), "messages": [{ "type": "text", "text": textMessage }] };
  const options = { "method": "post", "headers": { "Content-Type": "application/json", "Authorization": "Bearer " + String(accessToken).trim() }, "payload": JSON.stringify(payload), "muteHttpExceptions": true };
  const response = UrlFetchApp.fetch(url, options);
  return response.getContentText();
}

function F_recordCommitteeDecision(patientIds, fy, round, months) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Patients');
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const colId = headers.indexOf('patient_id');
  const colDiaper = headers.indexOf('diaper_size'); 

  if (colId === -1 || colDiaper === -1) return { success: false, message: 'โครงสร้างตารางไม่สมบูรณ์' };

  let updatedCount = 0;
  for (let i = 1; i < data.length; i++) {
    if (patientIds.includes(String(data[i][colId]))) {
      let currentDiaper = String(data[i][colDiaper]).trim();
      let diaperObj = {};
      if (currentDiaper && currentDiaper !== '') {
        if (currentDiaper.includes('""')) currentDiaper = currentDiaper.replace(/""/g, '"');
        if (currentDiaper.startsWith('"') && currentDiaper.endsWith('"')) currentDiaper = currentDiaper.substring(1, currentDiaper.length - 1);
        try { diaperObj = JSON.parse(currentDiaper); } catch(e) {}
      }
      diaperObj.committee_status = "จัดสรรแล้ว";
      diaperObj.fy = String(fy).trim();
      diaperObj.round = String(round).trim();
      diaperObj.alloc_months = parseInt(months) || 1;
      diaperObj.committee_date = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");

      sheet.getRange(i + 1, colDiaper + 1).setValue(JSON.stringify(diaperObj));
      updatedCount++;
    }
  }
  return { success: true, message: `บันทึกมติจัดสรรให้ผู้ป่วยจำนวน ${updatedCount} ราย สำเร็จ!` };
}

function F_checkUserRegistration(uid) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const colUid = headers.indexOf('uid');
  const colRole = headers.indexOf('role');
  const colVillage = headers.indexOf('village_no');
  const colStatus = headers.indexOf('status');
  const vCount = F_getConfig('VILLAGE_COUNT') || 15;
  
  if (colUid === -1) return { status: 'error', message: 'ไม่พบคอลัมน์ UID' };
  const targetUid = String(uid).trim();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colUid]).trim() === targetUid) {
      let userStatus = colStatus > -1 ? String(data[i][colStatus]).trim() : 'Active';
      if (userStatus === '') userStatus = 'Pending'; 
      return { status: 'registered', role: colRole > -1 ? String(data[i][colRole]).trim() : 'VHV', village_no: colVillage > -1 ? String(data[i][colVillage]).trim() : '', user_status: userStatus, village_count: vCount };
    }
  }
  return { status: 'not_registered', village_count: vCount };
}

function F_registerUser(uid, name, role, village_no, phone) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const colUid = headers.indexOf('uid');
  for (let i = 1; i < data.length; i++) {
    if (colUid > -1 && String(data[i][colUid]) === String(uid)) return { status: 'already_registered' };
  }
  const initialStatus = role === 'ADMIN' ? 'Active' : 'Pending';
  let newRow = new Array(headers.length).fill('');
  if(headers.indexOf('uid') > -1) newRow[headers.indexOf('uid')] = uid;
  if(headers.indexOf('name') > -1) newRow[headers.indexOf('name')] = name;
  if(headers.indexOf('role') > -1) newRow[headers.indexOf('role')] = role;
  if(headers.indexOf('village_no') > -1) newRow[headers.indexOf('village_no')] = village_no;
  if(headers.indexOf('status') > -1) newRow[headers.indexOf('status')] = initialStatus;
  if(headers.indexOf('phone') > -1) newRow[headers.indexOf('phone')] = "'" + String(phone).trim();
  sheet.appendRow(newRow);
  return { status: 'success', user_status: initialStatus };
}

function F_getPendingVHVs() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const colUid = headers.indexOf('uid');
  const colName = headers.indexOf('name');
  const colVillage = headers.indexOf('village_no');
  const colStatus = headers.indexOf('status');
  const colPhone = headers.indexOf('phone');
  
  const list = [];
  for (let i = 1; i < data.length; i++) {
    if (colUid > -1 && data[i][colUid]) {
       const status = colStatus > -1 ? String(data[i][colStatus]).trim() : '';
       if (status === 'Pending') {
         list.push({ uid: String(data[i][colUid]).trim(), name: colName > -1 ? String(data[i][colName]) : 'ไม่ระบุชื่อ', village_no: colVillage > -1 ? String(data[i][colVillage]) : '', phone: colPhone > -1 ? String(data[i][colPhone]) : '-' });
       }
    }
  }
  return list;
}

function F_manageVHVStatus(uid, actionType) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const colUid = headers.indexOf('uid');
  const colStatus = headers.indexOf('status');
  if (colUid === -1 || colStatus === -1) return { success: false, message: 'ไม่พบคอลัมน์ที่ต้องการ' };
  for(let i=1; i<data.length; i++) {
     if(String(data[i][colUid]) === String(uid)) {
        sheet.getRange(i+1, colStatus+1).setValue(actionType);
        return { success: true, message: `อัปเดตสถานะสำเร็จ` };
     }
  }
  return { success: false, message: 'ไม่พบผู้ใช้นี้' };
}

function F_importPatients(patients) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Patients');
  if (!sheet || !patients || patients.length === 0) return { success: false, message: 'ไม่มีข้อมูลสำหรับนำเข้า' };
  const existingData = sheet.getDataRange().getValues();
  const headers = existingData[0].map(h => String(h).trim().toLowerCase());
  const colIdCard = headers.indexOf('id_card');
  const colName = headers.indexOf('name');
  const timestamp = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd-HHmm");
  const todayStr = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy"); 
  const newRowsToAppend = [];
  let updateCount = 0, insertCount = 0, counter = 1;

  patients.forEach(p => {
    const cleanIdCard = p.id_card ? String(p.id_card).trim().replace(/-/g, '') : '';
    const cleanName = p.name ? String(p.name).trim() : '';
    let existingRowIndex = -1;
    for (let i = 1; i < existingData.length; i++) {
      const sheetIdCard = colIdCard > -1 ? String(existingData[i][colIdCard]).trim().replace(/-/g, '') : '';
      const sheetName = colName > -1 ? String(existingData[i][colName]).trim() : '';
      if (cleanIdCard !== '' && sheetIdCard === cleanIdCard) { existingRowIndex = i + 1; break; } 
      else if (cleanIdCard === '' && cleanName !== '' && sheetName === cleanName) { existingRowIndex = i + 1; break; }
    }
    let rowData = new Array(31).fill('');
    if (existingRowIndex > -1) {
      for (let c = 0; c < 31; c++) rowData[c] = existingData[existingRowIndex - 1][c];
      updateCount++;
    } else {
      rowData[0] = "HN-" + timestamp + "-" + String(counter).padStart(3, '0');
      counter++;
      rowData[20] = 'ยังไม่ประเมิน'; rowData[21] = '-';
      for (let i = 23; i <= 27; i++) rowData[i] = '-';
      rowData[30] = 'Active';
      insertCount++;
    }

    if (p.id_card) rowData[1] = "'" + cleanIdCard;
    if (p.prefix) rowData[2] = String(p.prefix).trim();
    if (p.name) rowData[3] = cleanName;
    if (p.dob) rowData[4] = String(p.dob).trim();
    if (p.age) rowData[5] = p.age;
    if (p.house_no) rowData[6] = "'" + String(p.house_no).trim();
    if (p.village_no) rowData[7] = String(p.village_no).trim();
    if (p.disease) rowData[9] = String(p.disease).trim();
    if (p.medication) rowData[10] = String(p.medication).trim();
    if (p.caregiver_name) rowData[12] = String(p.caregiver_name).trim();
    if (p.caregiver_phone) rowData[13] = "'" + String(p.caregiver_phone).trim();
    if (p.diaper && String(p.diaper).trim() !== '') {
      rowData[14] = JSON.stringify({ size: String(p.diaper).trim(), req_diaper: true, req_underpad: false, approve_status: "รออนุมัติ", approved_diaper: 0, approved_underpad: 0 });
    }
    const adlValue = String(p.adl).trim();
    if (adlValue !== '' && adlValue !== '-') {
      rowData[21] = Number(adlValue) || adlValue;
      const scoreNum = parseInt(adlValue);
      if (!isNaN(scoreNum)) {
        if (scoreNum <= 4) rowData[20] = 'ติดเตียง';
        else if (scoreNum <= 11) rowData[20] = 'ติดบ้าน';
        else rowData[20] = 'ติดสังคม';
      }
      rowData[29] = todayStr;
    }
    if (existingRowIndex > -1) {
      sheet.getRange(existingRowIndex, 1, 1, 31).setValues([rowData]);
      existingData[existingRowIndex - 1] = rowData;
    } else {
      newRowsToAppend.push(rowData);
      existingData.push(rowData);
    }
  });

  if (newRowsToAppend.length > 0) {
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, newRowsToAppend.length, 31).setValues(newRowsToAppend);
  }
  SpreadsheetApp.flush();
  return { success: true, message: `ระบบคัดกรองข้อมูลเสร็จสิ้น:\n- เพิ่มผู้ป่วยใหม่รายใหม่: ${insertCount} ราย\n- อัปเดตปรับปรุงข้อมูลเดิม: ${updateCount} ราย` };
}

function F_getUserProfile(uid) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const colUid = headers.indexOf('uid');
  if(colUid === -1) return { success: false, message: 'ไม่พบคอลัมน์ UID' };
  for(let i = 1; i < data.length; i++) {
    if(String(data[i][colUid]).trim() === String(uid).trim()) {
       return { success: true, name: headers.indexOf('name') > -1 ? data[i][headers.indexOf('name')] : '', phone: headers.indexOf('phone') > -1 ? data[i][headers.indexOf('phone')] : '', profile_pic: headers.indexOf('profile_pic') > -1 ? data[i][headers.indexOf('profile_pic')] : '' }
    }
  }
  return { success: false, message: 'ไม่พบผู้ใช้' };
}

function F_updateUserProfile(uid, name, phone, picUrl) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const colUid = headers.indexOf('uid');
  for(let i = 1; i < data.length; i++) {
    if(String(data[i][colUid]).trim() === String(uid).trim()) {
       if(headers.indexOf('name') > -1 && name !== undefined) sheet.getRange(i+1, headers.indexOf('name')+1).setValue(String(name).trim());
       if(headers.indexOf('phone') > -1 && phone !== undefined) sheet.getRange(i+1, headers.indexOf('phone')+1).setValue("'" + String(phone).trim());
       if(headers.indexOf('profile_pic') > -1 && picUrl !== undefined) sheet.getRange(i+1, headers.indexOf('profile_pic')+1).setValue(String(picUrl).trim());
       return { success: true, message: 'อัปเดตโปรไฟล์สำเร็จ' };
    }
  }
  return { success: false, message: 'ไม่พบผู้ใช้นี้ในระบบ' };
}

function F_getAllSystemConfigs() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config');
  if(!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const configs = [];
  for(let i = 1; i < data.length; i++) { 
     if(data[i][0]) {
        configs.push({ key: String(data[i][0]).trim(), value: String(data[i][1] || ''), description: String(data[i][2] || '') });
     }
  }
  return configs;
}

function F_updateSystemConfigs(configArray) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config');
  const data = sheet.getDataRange().getValues();
  let updated = 0;
  for(let i=1; i<data.length; i++) {
     const rowKey = String(data[i][0]).trim();
     const match = configArray.find(c => c.key === rowKey);
     if(match) {
        sheet.getRange(i+1, 2).setValue(String(match.value).trim());
        updated++;
     }
  }
  SpreadsheetApp.flush(); 
  return { success: true, message: `อัปเดตการตั้งค่าสำเร็จจำนวน ${updated} รายการ` };
}

function F_registerAdmin(uid, name, phone, secretCode) {
  const actualCode = F_getConfig('ADMIN_SECRET_CODE');
  if (!actualCode) return { status: 'error', message: 'ระบบยังไม่ได้ตั้งค่า ADMIN_SECRET_CODE ในชีต Config' };
  if (String(secretCode).trim() !== String(actualCode).trim()) return { status: 'invalid_code', message: 'รหัสลับไม่ถูกต้อง' };
  return F_registerUser(uid, name, 'ADMIN', 'ADMIN', phone);
}
