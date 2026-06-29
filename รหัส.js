// [F0] คอนฟิกหลัก
// เปลี่ยนจากเดิมที่มี 2 อัน เป็น 3 อัน
const SHEET_NAMES = { USERS: 'Users', PATIENTS: 'Patients', VITALS: 'Vitals' };
const IMAGE_FOLDER_ID = '1dMIOwVRSkYvEGDb5-VksdrA2Hx60xYrd';

// [F1] ระบบ API Endpoint หลัก
function doPost(e) {
  try {
    const requestData = JSON.parse(e.postData.contents);
    let response = {};
    switch (requestData.action) {
      case 'checkUserRegistration': response = F_checkUser(requestData.uid); break;
      case 'registerNewUser': response = F_registerUser(requestData.uid, requestData.name, requestData.village, requestData.adminPassword); break;
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
      case 'updatePatientVHV': response = F_updatePatientVHV(requestData.id, requestData.vhvId); break;
      default: response = { status: 'error', message: 'Action not found' };
    }
    return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

// [F2] ฟังก์ชันดึงรายชื่อผู้ป่วยทั้งหมด (รองรับ 31 คอลัมน์)
// [F_Patients] ฟังก์ชันดึงข้อมูลผู้ป่วย (แก้ไข: ชี้เป้าคอลัมน์ O Diaper_Size และแก้ปัญหาสถานะว่างเปล่า)
function F_getAllPatients() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Patients');
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  
  const colId = headers.indexOf('patient_id');
  const colName = headers.indexOf('name');
  const colVillage = headers.indexOf('village_no');
  const colHouse = headers.indexOf('house_no');
  const colGroup = headers.indexOf('patient_group');
  const colLastAssess = headers.indexOf('last_assessment_date');
  const colStatus = headers.indexOf('status');
  const colProfilePic = headers.indexOf('profile_pic');
  const colAdl = headers.indexOf('adl_score');
  const colAssignedVHV = headers.indexOf('assigned_vhv_id'); // <--- เพิ่มบรรทัดนี้เพื่อจับคู่ช่อง Assigned_VHV_ID

  // *** จุดสำคัญที่แก้ไข ***
  // ชี้เป้าไปที่คอลัมน์ O (Diaper_Size) ตามที่คุณบันทึกข้อมูลไว้จริง
  const colDiaper = headers.indexOf('diaper_size'); 
  const colEquipment = headers.indexOf('required_equipment');
  
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (colId === -1 || !row[colId]) continue; 
    
    // ดักจับ: ถ้าช่อง Status เป็นค่าว่าง ให้ระบบยัดคำว่า 'Active' ให้โดยอัตโนมัติ
    let currentStatus = 'Active';
    if (colStatus > -1 && String(row[colStatus]).trim() !== '') {
      currentStatus = String(row[colStatus]).trim();
    }
    
    list.push({
      id: String(row[colId]),
      name: colName > -1 ? String(row[colName]) : '',
      village_no: colVillage > -1 ? String(row[colVillage]) : '',
      house_no: colHouse > -1 ? String(row[colHouse]) : '',
      group: colGroup > -1 && row[colGroup] ? String(row[colGroup]) : 'ยังไม่ประเมิน',
      last_assess: colLastAssess > -1 ? String(row[colLastAssess]) : '',
      status: currentStatus, 
      diaper: colDiaper > -1 ? String(row[colDiaper]) : '',
      profile_pic: colProfilePic > -1 ? String(row[colProfilePic]) : '',
      adl: colAdl > -1 ? String(row[colAdl]) : '-',
      assigned_vhv_id: colAssignedVHV > -1 ? String(row[colAssignedVHV]).trim() : '' // <--- เพิ่มบรรทัดนี้
    });
  }
  return list;
}

// [F3] ฟังก์ชันบันทึกผู้ป่วยใหม่ (บันทึกให้ครบ 31 คอลัมน์)
function F_savePatient(p) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PATIENTS);

  // สร้างรหัสผู้ป่วย HN-ปีเดือนวัน-เวลา
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

  // บันทึกลงแถวใหม่ 31 คอลัมน์
  sheet.appendRow([
    patientId,
    p.id_card || '',
    p.prefix || '',
    p.fullname || '',
    safeDob || '',
    p.age || '',
    safeHouseNo || '',
    p.village_no || '',
    p.lat_long || '',
    '', '', '',                                    // Index 9-11 (ว่าง)
    p.caregiver_name || '',                        // Index 12 (คอลัมน์ M: ชื่อผู้ดูแล)
    p.caregiver_phone ? "'" + p.caregiver_phone : '', // Index 13 (คอลัมน์ N: เบอร์โทรผู้ดูแล)
    '', '', '', '', '', '',                        // Index 14-19 (ว่าง)
    'ยังไม่ประเมิน', '-',                            // Index 20-21 (Group, ADL)
    '', '-', '-', '-', '-', '-', '', '',           // Index 22-29 (Profile_Pic จนถึง Last_Assess)
    'Active'                                       // Index 30 (Status)
  ]);

  return { success: true, patient_id: patientId };
}
// [F_Config] ฟังก์ชันอ่านค่ารหัสผ่านแอดมินจากชีต Config
function F_getConfig(key) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config');
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return null;
}

// [F4] ฟังก์ชันตรวจสอบผู้ใช้งานเมื่อเข้าสู่ระบบ (ล็อกเป้าหมายหัวตารางเป๊ะๆ)
function F_checkUser(uid) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  if (!sheet) return { status: 'unregistered' };
  
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { status: 'unregistered' };

  // ดึงค่า Config
  const hospitalName = F_getConfig('HOSPITAL_NAME') || 'เทศบาลเมืองบางแก้ว';
  const villageCount = F_getConfig('VILLAGE_COUNT') || 15;
  const diaperPrice = F_getConfig('DIAPER_PRICE') || 9.50;
  const underpadPrice = F_getConfig('UNDERPAD_PRICE') || 6.00;
  
  // ล็อกหัวตารางเป๊ะๆ จากชีท Users
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const colUid = headers.indexOf('uid');
  const colName = headers.indexOf('name');
  const colVillage = headers.indexOf('village_no');
  const colStatus = headers.indexOf('status');
  const colPhone = headers.indexOf('phone');
  const colPic = headers.indexOf('profile_pic');

  if (colUid === -1) return { status: 'unregistered', hospital_name: hospitalName, village_count: villageCount };

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colUid]) === String(uid)) {
      if (colStatus > -1 && data[i][colStatus] !== 'Active') {
        return { status: 'inactive', hospital_name: hospitalName };
      }
      
      const village = colVillage > -1 ? String(data[i][colVillage]) : '';
      const role = (village === 'ADMIN') ? 'ADMIN' : 'VHV';
      
      return { 
        status: 'registered', 
        name: colName > -1 ? data[i][colName] : '', 
        village: village,
        role: role,
        phone: colPhone > -1 ? data[i][colPhone] : '',  
        pic_url: colPic > -1 ? data[i][colPic] : '',
        hospital_name: hospitalName,
        village_count: villageCount, 
        diaper_price: diaperPrice,   
        underpad_price: underpadPrice 
      };
    }
  }
  return { status: 'unregistered', hospital_name: hospitalName, village_count: villageCount };
}

// [F5] ฟังก์ชันลงทะเบียนผู้ใช้ใหม่แบบแยกรหัสผ่าน (จำกัด 7 คอลัมน์ A-G)
function F_registerUser(uid, name, village, adminPassword) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.USERS);
  
  // ตรวจสอบกรณีลงทะเบียนโหมดเจ้าหน้าที่
  if (adminPassword) {
    const correctPassword = F_getConfig('ADMIN_PASSWORD');
    if (String(adminPassword) !== String(correctPassword)) {
      return { success: false, message: 'รหัสผ่านสำหรับเจ้าหน้าที่ไม่ถูกต้อง' };
    }
    village = 'ADMIN'; // เปลี่ยนค่าหมู่เป็นคำว่า ADMIN เพื่อใช้เป็นตัวจำแนกสิทธิ์
  }
  
  // บันทึกข้อมูลลงชีต Users ครบถ้วนตามหัวตาราง 7 คอลัมน์พอดี
  // คอลัมน์: UID(A), Name(B), Village_No(C), Register_Date(D), Status(E), Phone(F), Profile_Pic(G)
  sheet.appendRow([uid, name, village, new Date(), 'Active', '', '']);
  
  return { success: true, role: (village === 'ADMIN' ? 'ADMIN' : 'VHV') };
}

// [F5.1] ฟังก์ชันอัปเดตโปรไฟล์ อสม. และ แอดมิน (เขียนพิกัดลงล็อกตารางเดิม)
function F_updateVHVProfile(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.USERS);
  let picUrl = "";

  // 1. จัดการอัปโหลดรูปภาพลง Google Drive
  if (data.pic && data.pic !== "") {
    try {
      const folderName = "VHV_Profiles";
      const folderIterator = DriveApp.getFoldersByName(folderName);
      let folder = folderIterator.hasNext() ? folderIterator.next() : DriveApp.createFolder(folderName);
      
      const blob = Utilities.newBlob(Utilities.base64Decode(data.pic), "image/jpeg", "vhv_" + data.uid + ".jpg");
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      picUrl = file.getUrl();
    } catch (e) {
      console.log("Upload Error: " + e);
    }
  }

  // 2. ค้นหาแถวเพื่อเขียนทับข้อมูล
  const dataRange = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < dataRange.length; i++) {
    if (dataRange[i][0] === data.uid) {
      rowIndex = i + 1;
      break;
    }
  }

  // 3. จัดการเขียนบันทึกข้อมูลลงตำแหน่งคอลัมน์ที่ถูกต้อง (1-based index)
  if (rowIndex > -1) {
    sheet.getRange(rowIndex, 2).setValue(data.name);       // คอลัมน์ B: Name
    sheet.getRange(rowIndex, 3).setValue(data.village);    // คอลัมน์ C: Village_No (กรณีแอดมินจะรักษาสถานะ 'ADMIN' ไว้)
    sheet.getRange(rowIndex, 6).setValue("'" + data.phone); // คอลัมน์ F: Phone
    
    if (picUrl !== "") {
      sheet.getRange(rowIndex, 7).setValue(picUrl);        // คอลัมน์ G: Profile_Pic
    }
    return { success: true, message: "อัปเดตข้อมูลสำเร็จ", pic_url: picUrl };
  } else {
    return { success: false, message: "ไม่พบข้อมูลผู้ใช้งาน" };
  }
}

// [F6] ฟังก์ชันดึงข้อมูลผู้ป่วยรายบุคคลตาม ID
function F_getPatientById(id) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PATIENTS);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      return {
        id: data[i][0],
        id_card: data[i][1], prefix: data[i][2], name: data[i][3],
        dob: data[i][4], age: data[i][5], house_no: data[i][6], village_no: data[i][7], lat_long: data[i][8],
        disease: data[i][9], medication: data[i][10],
        caregiver_card: data[i][11], caregiver_name: data[i][12], caregiver_phone: data[i][13],
        diaper: data[i][14], equipment: data[i][15],
        pic_bed: data[i][16], pic_bath: data[i][17], pic_entrance: data[i][18], pic_walkway: data[i][19],
        group: data[i][20] || 'ยังไม่ประเมิน',
        // [แก้ไข] ดักจับการแสดงผลคะแนนต่างๆ ไม่ให้เลข 0 หายไป
        adl: data[i][21] !== "" ? data[i][21] : '-',
        profile_pic: data[i][22] || '', bp: data[i][23] || '-', hr: data[i][24] || '-',
        score_2q: data[i][25] !== "" ? data[i][25] : '-',
        score_9q: data[i][26] !== "" ? data[i][26] : '-',
        dep_status: data[i][27] || '-',
        assigned_vhv: data[i][28] || '', last_assess: data[i][29] || '', status: data[i][30]
      };
    }
  }
  return { error: 'ไม่พบข้อมูลผู้ป่วย' };
}

// [F7] ฟังก์ชันบันทึกคะแนน ADL (อัปเดตเก็บประวัติ)
function F_saveADLScore(id, score, group) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.PATIENTS);
  const data = sheet.getDataRange().getValues();
  const today = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
  const timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");

  // 1. เก็บประวัติลงชีต Assessments (สร้างอัตโนมัติถ้ายังไม่มี)
  let aSheet = ss.getSheetByName('Assessments');
  if (!aSheet) {
    aSheet = ss.insertSheet('Assessments');
    aSheet.appendRow(['Timestamp', 'Patient_ID', 'Type', 'Score_1', 'Score_2', 'Result']);
  }
  aSheet.appendRow([timestamp, id, 'ADL', score, '', group]);

  // 2. อัปเดตข้อมูลล่าสุดหน้า Patients
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

// [F8] ฟังก์ชันอัปเดตข้อมูลผู้ป่วย
function F_updatePatientData(p) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PATIENTS);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === p.id) {
      const row = i + 1; // ตำแหน่งแถวที่เจอข้อมูล

      // เขียนข้อมูลใหม่ทับลงไปตามคอลัมน์ (ใส่ ' ดักหน้าข้อมูลที่เป็นตัวเลขเพื่อป้องกันความเพี้ยน)
      sheet.getRange(row, 3).setValue(p.prefix);             // คอลัมน์ C: คำนำหน้า
      sheet.getRange(row, 4).setValue(p.fullname);           // คอลัมน์ D: ชื่อ-สกุล
      sheet.getRange(row, 7).setValue("'" + p.house_no);     // คอลัมน์ G: บ้านเลขที่
      sheet.getRange(row, 8).setValue(p.village_no);         // คอลัมน์ H: หมู่ที่
      sheet.getRange(row, 9).setValue(p.lat_long);           // คอลัมน์ I: พิกัด GPS
      sheet.getRange(row, 10).setValue(p.disease);           // คอลัมน์ J: โรคประจำตัว
      sheet.getRange(row, 11).setValue(p.medication);        // คอลัมน์ K: ยาที่ใช้ประจำ
      sheet.getRange(row, 13).setValue(p.caregiver_name);    // คอลัมน์ M: ชื่อผู้ดูแล
      sheet.getRange(row, 14).setValue("'" + p.caregiver_phone); // คอลัมน์ N: เบอร์โทรผู้ดูแล
      sheet.getRange(row, 15).setValue(p.diaper);            // คอลัมน์ O
      sheet.getRange(row, 16).setValue(p.equipment);         // คอลัมน์ P

      return { success: true };
    }
  }
  return { error: 'ไม่พบข้อมูลที่ต้องการแก้ไข' };
}

// [F9] ฟังก์ชันบันทึกผลคัดกรองซึมเศร้า (อัปเดตเก็บประวัติ)
function F_saveDepressionScore(id, score2q, score9q, status) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.PATIENTS);
  const data = sheet.getDataRange().getValues();
  const timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");

  // 1. เก็บประวัติลงชีต Assessments
  let aSheet = ss.getSheetByName('Assessments');
  if (!aSheet) {
    aSheet = ss.insertSheet('Assessments');
    aSheet.appendRow(['Timestamp', 'Patient_ID', 'Type', 'Score_1', 'Score_2', 'Result']);
  }
  aSheet.appendRow([timestamp, id, 'DEP', score2q, score9q, status]);

  // 2. อัปเดตข้อมูลล่าสุดหน้า Patients
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

// [F10] บันทึกประวัติสัญญาณชีพ
function F_saveVitals(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let vSheet = ss.getSheetByName(SHEET_NAMES.VITALS);
  if (!vSheet) {
    vSheet = ss.insertSheet(SHEET_NAMES.VITALS);
    vSheet.appendRow(['Timestamp', 'Patient_ID', 'BP_Sys', 'BP_Dia', 'HR', 'Blood_Sugar', 'Meal_Type']);
  }

  const timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");

  // บันทึกลงชีต Vitals (ประวัติ)
  vSheet.appendRow([
    timestamp, data.patient_id, data.sys, data.dia, data.hr, data.sugar, data.meal_type
  ]);

  // อัปเดตค่าล่าสุดไปที่ชีต Patients ด้วย (เพื่อให้โชว์หน้าแดชบอร์ด)
  const pSheet = ss.getSheetByName(SHEET_NAMES.PATIENTS);
  const pData = pSheet.getDataRange().getValues();
  for (let i = 1; i < pData.length; i++) {
    if (pData[i][0] === data.patient_id) {
      if (data.sys && data.dia) pSheet.getRange(i + 1, 24).setValue(data.sys + '/' + data.dia); // คอลัมน์ X: BP_Latest
      if (data.hr) pSheet.getRange(i + 1, 25).setValue(data.hr); // คอลัมน์ Y: HR_Latest
      break;
    }
  }
  return { success: true };
}

// [F11] ดึงประวัติสัญญาณชีพเพื่อทำกราฟ
function F_getVitals(id) {
  const vSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.VITALS);
  if (!vSheet) return [];
  const data = vSheet.getDataRange().getValues();
  const records = [];

  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === id) {
      records.push({
        date: data[i][0],
        sys: data[i][2], dia: data[i][3], hr: data[i][4],
        sugar: data[i][5], meal: data[i][6]
      });
    }
  }
  return records;
}

// [F12] ดึงประวัติการประเมิน (ADL, DEP)
function F_getAssessments(id) {
  const aSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Assessments');
  if (!aSheet) return [];
  const data = aSheet.getDataRange().getValues();
  const records = [];

  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === id) {
      records.push({
        date: data[i][0],
        type: data[i][2],
        score1: data[i][3],
        score2: data[i][4],
        result: data[i][5]
      });
    }
  }
  return records;
}

// [F13] ฟังก์ชันอัปโหลดรูปภาพไปเก็บบน Google Drive
function F_uploadImage(id, imageType, base64Data, filename) {
  try {
    const folder = DriveApp.getFolderById(IMAGE_FOLDER_ID);

    // แยกส่วนหัวของ Base64 ออก เพื่อเอาเฉพาะเนื้อไฟล์
    const contentType = base64Data.substring(5, base64Data.indexOf(';'));
    const bytes = Utilities.base64Decode(base64Data.split(',')[1]);
    const blob = Utilities.newBlob(bytes, contentType, filename);

    // สร้างไฟล์ใน Drive
    const file = folder.createFile(blob);

    // ดึงลิงก์ของไฟล์เพื่อนำไปโชว์
    const fileUrl = file.getUrl();

    // ค้นหาผู้ป่วยและบันทึกลิงก์ลงคอลัมน์ที่ถูกต้อง
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PATIENTS);
    const data = sheet.getDataRange().getValues();

    // กำหนดคอลัมน์ตามประเภทรูปภาพ
    let colIndex = 22; // Default: Profile_Pic (คอลัมน์ W = Index 22)
    if (imageType === 'Pic_Bed') colIndex = 16;        // คอลัมน์ Q
    else if (imageType === 'Pic_Bath') colIndex = 17;    // คอลัมน์ R
    else if (imageType === 'Pic_Entrance') colIndex = 18; // คอลัมน์ S
    else if (imageType === 'Pic_Walkway') colIndex = 19;  // คอลัมน์ T

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === id) {
        sheet.getRange(i + 1, colIndex + 1).setValue(fileUrl);
        return { success: true, url: fileUrl };
      }
    }
    return { error: 'ไม่พบข้อมูลผู้ป่วย' };
  } catch (e) {
    return { error: e.toString() };
  }
}

// [F14] ฟังก์ชันอัปเดตสถานะผู้ป่วย (Soft Delete)
function F_updatePatientStatus(id, newStatus) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PATIENTS);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      // อัปเดตคอลัมน์ AE (Index 30) เป็นสถานะใหม่ (เช่น 'เสียชีวิต', 'ย้ายที่อยู่')
      sheet.getRange(i + 1, 31).setValue(newStatus);
      return { success: true, message: 'อัปเดตสถานะเรียบร้อยแล้ว' };
    }
  }
  return { success: false, message: 'ไม่พบข้อมูลผู้ป่วยรายนี้' };
}

// [F15] ฟังก์ชันบันทึกการอนุมัติผ้าอ้อม/แผ่นรองซับ
// [F8] ฟังก์ชันบันทึกการอนุมัติผ้าอ้อม/แผ่นรองซับ (แก้ไข: บันทึกกลับลงคอลัมน์ O)
function F_updateResourceApproval(id, diaperQty, underpadQty) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Patients'); 
  const data = sheet.getDataRange().getValues();
  
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const colId = headers.indexOf('patient_id');
  const colDiaper = headers.indexOf('diaper_size'); // เป้าหมายคือคอลัมน์ O
  
  if (colId === -1 || colDiaper === -1) return { success: false, message: 'หารหัสผู้ป่วย หรือ คอลัมน์ Diaper_Size ไม่พบ' };

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colId]) === String(id)) {
      let currentDiaper = String(data[i][colDiaper]).trim();
      let diaperObj = {};
      
      if (currentDiaper && currentDiaper !== '') {
        // ล้างเครื่องหมายคำพูดซ้อนกันออกก่อนอ่านค่า
        if (currentDiaper.includes('""')) { currentDiaper = currentDiaper.replace(/""/g, '"'); }
        if (currentDiaper.startsWith('"') && currentDiaper.endsWith('"')) { currentDiaper = currentDiaper.substring(1, currentDiaper.length - 1); }
        try { diaperObj = JSON.parse(currentDiaper); } catch(e) {}
      }
      
      // เพิ่มยอดจำนวนชิ้นที่แอดมินอนุมัติเข้าไปในก้อน JSON
      diaperObj.approved_diaper = diaperQty || 0;
      diaperObj.approved_underpad = underpadQty || 0;
      diaperObj.approve_status = "อนุมัติแล้ว";
      diaperObj.approve_date = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
      
      // บันทึกกลับลงไปในชีต
      sheet.getRange(i + 1, colDiaper + 1).setValue(JSON.stringify(diaperObj));
      return { success: true, message: 'บันทึกการอนุมัติเรียบร้อยแล้ว' };
    }
  }
  return { success: false, message: 'ไม่พบรหัสผู้ป่วยรายนี้' };
}

// [F16_VHVs] ฟังก์ชันดึงรายชื่อ อสม. ทั้งหมดในระบบ (อัปเดต: ดึงรหัส UID ไปผูกเคส)
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
         list.push({
           uid: String(data[i][colUid]).trim(), // <--- ดึง UID ไปใช้ระบุตัวตนหน้าเว็บ
           name: colName > -1 ? String(data[i][colName]) : 'ไม่ระบุชื่อ',
           village_no: village,
           phone: colPhone > -1 ? String(data[i][colPhone]) : '-'
         });
       }
    }
  }
  return list;
}

// [F17] ฟังก์ชันอัปเดตผู้รับผิดชอบเคสผู้ป่วย (Assigned VHV)
function F_updatePatientVHV(id, vhvId) {
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
      // 1. บันทึก UID อสม. ลงคอลัมน์ AC (Assigned_VHV_ID)
      sheet.getRange(i + 1, colAssignedVHV + 1).setValue(String(vhvId).trim());
      
      // 2. [ฟีเจอร์ส่ง LINE อัตโนมัติ] ดึงชื่อคนไข้ไปทำข้อความ
      const pName = colName > -1 ? data[i][colName] : 'ไม่ระบุชื่อ';
      const pHouse = colHouse > -1 ? data[i][colHouse] : '-';
      const pVillage = colVillage > -1 ? data[i][colVillage] : '-';
      
      const messageText = `📋 มีการมอบหมายภารกิจ อสม. รายบุคคล\n\nรบกวนลงพื้นที่ติดตามดูแลและประเมินอาการผู้ป่วยในความรับผิดชอบของท่านครับ:\n\n👤 ผู้ป่วย: ${pName}\n🏠 ที่อยู่: บ้านเลขที่ ${pHouse} หมู่ที่ ${pVillage}\n\nเมื่อดำเนินการเสร็จสิ้น รบกวนบันทึกผ่านแอปพลิเคชันด้วยครับ ขอบคุณครับ 🙏`;
      
      // ดึง Channel Access Token จากหน้า Config มาใช้งาน
      const lineToken = F_getConfig('LINE_CHANNEL_ACCESS_TOKEN'); 
      if (lineToken && vhvId && !vhvId.startsWith('TEMP_')) {
        try {
          sendLinePushMessage(vhvId, messageText, lineToken);
        } catch(e) {
          console.log("LINE Push Error: " + e);
        }
      }
      
      return { success: true, message: 'บันทึกการมอบหมายและส่งแจ้งเตือน LINE เรียบร้อยแล้ว' };
    }
  }
  return { success: false, message: 'ไม่พบรหัสผู้ป่วยรายนี้' };
}

// ฟังก์ชันภายในสำหรับเชื่อมต่อกับเซิร์ฟเวอร์ LINE Developers
function sendLinePushMessage(toUid, textMessage, accessToken) {
  const url = "https://api.line.me/v2/bot/message/push";
  const payload = {
    "to": toUid,
    "messages": [{ "type": "text", "text": textMessage }]
  };
  const options = {
    "method": "post",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + accessToken
    },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  UrlFetchApp.fetch(url, options);
}

// ==========================================
// [F99] ฟังก์ชันพิเศษ: ใช้สำหรับรันเพื่อจัดหัวตารางอัตโนมัติ (อัปเดต 31 คอลัมน์)
// ==========================================
function F99_setupDatabase() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PATIENTS);

  // 1. ล้างข้อมูลเก่า
  sheet.clear();

  // 2. ชุดหัวตารางใหม่แบบ Full Database 31 คอลัมน์
  const headers = [
    'Patient_ID', 'ID_Card', 'Prefix', 'Name', 'DOB',
    'Age', 'House_No', 'Village_No', 'Lat_Long', 'Disease',
    'Medication', 'Caregiver_ID_Card', 'Caregiver_Name', 'Caregiver_Phone', 'Diaper_Size',
    'Required_Equipment', 'Pic_Bed', 'Pic_Bath', 'Pic_Entrance', 'Pic_Walkway',
    'Patient_Group', 'ADL_Score', 'Profile_Pic', 'BP_Latest', 'HR_Latest',
    'Score_2Q', 'Score_9Q', 'Depression_Status', 'Assigned_VHV_ID', 'Last_Assessment_Date',
    'Status'
  ];

  // 3. นำหัวตารางไปวางและตกแต่ง
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#e7eeff");
  sheet.setFrozenRows(1);
}

function testDrivePermission() {
  // บังคับขอสิทธิ์สร้างไฟล์ในโฟลเดอร์
  const folder = DriveApp.getFolderById(IMAGE_FOLDER_ID);
  folder.createFile("test_permission.txt", "ทดสอบสิทธิ์", MimeType.PLAIN_TEXT);
}
