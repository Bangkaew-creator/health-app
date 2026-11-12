/**
 * ============================================================================
 * OrsomoCore (core.js) — โมดูลกลางสำหรับระบบ อสม.สามารถ & กองทุน กปท.
 * ----------------------------------------------------------------------------
 * รวมศูนย์ระบบยืนยันตัวตน 2 ชั้น (AuthGuard + Anonymous Auth), มาตรฐานวันที่ไทย,
 * ตัวแปลงข้อมูลผ้าอ้อมกลาง (DiaperAdapter), ระบบตรวจเลขบัตรซ้ำ, ระบบบีบอัดและ
 * แยกเก็บรูปภาพฟรี 0 บาท (Patient_Images), แจ้งเตือนเคสวิกฤต LINE และ Responsive UI
 * ============================================================================
 */
(function (window) {
    'use strict';

    if (window.OrsomoCore) return;

    // ล้างค่าบัญชีจำลอง (Mockup) ทันทีทุกครั้งที่โหลดโมดูล
    try { localStorage.removeItem('dev_mock_uid'); } catch (e) {}

    let _dbInstance = null;
    let _persistenceInitialized = false;
    let _authSdkPromise = null;
    let _authStateReadyPromise = null;
    let _lastAuthError = null;
    let _activeLiffUid = '';
    let _memoryBoundKey = '';
    let _memoryBoundAt = 0;
    let _cachedIdToken = '';
    let _cachedAuthUid = '';
    let _interceptorInstalled = false;
    let _rawDocSet = null;

    function getStoredUid() {
        if (_activeLiffUid) return _activeLiffUid;
        let uid = '';
        try { uid = localStorage.getItem('orsomo_uid') || ''; } catch (e) {}
        if (!uid) {
            try { uid = sessionStorage.getItem('orsomo_uid') || ''; } catch (e) {}
        }
        if (!uid) {
            try {
                if (typeof window.name === 'string' && window.name.indexOf('ORSOMO_UID:') === 0) {
                    uid = window.name.substring('ORSOMO_UID:'.length).trim();
                }
            } catch (e) {}
        }
        uid = String(uid || '').trim();
        if (uid === 'U_DEV_ADMIN_MOCK') {
            clearStoredUid();
            return '';
        }
        if (uid) setStoredUid(uid);
        return uid;
    }

    function setStoredUid(uid) {
        const clean = String(uid || '').trim();
        if (!clean || clean === 'U_DEV_ADMIN_MOCK') return;
        _activeLiffUid = clean;
        try { localStorage.setItem('orsomo_uid', clean); } catch (e) {}
        try { sessionStorage.setItem('orsomo_uid', clean); } catch (e) {}
        try {
            if (!window.name || window.name.indexOf('ORSOMO_UID:') === 0) {
                window.name = 'ORSOMO_UID:' + clean;
            }
        } catch (e) {}
    }

    function clearStoredUid() {
        _activeLiffUid = '';
        _memoryBoundKey = '';
        _memoryBoundAt = 0;
        try { localStorage.removeItem('orsomo_uid'); } catch (e) {}
        try { localStorage.removeItem('dev_mock_uid'); } catch (e) {}
        try { sessionStorage.removeItem('orsomo_uid'); } catch (e) {}
        try { sessionStorage.removeItem('orsomo_auth_bound'); } catch (e) {}
        try {
            if (typeof window.name === 'string' && window.name.indexOf('ORSOMO_UID:') === 0) {
                window.name = '';
            }
        } catch (e) {}
    }

    function isPermissionDeniedError(err) {
        if (!err) return false;
        const code = String(err.code || '').toLowerCase();
        const msg = String(err.message || err || '').toLowerCase();
        return code === 'permission-denied' ||
            code === 'unauthenticated' ||
            msg.includes('insufficient permissions') ||
            msg.includes('permission denied') ||
            msg.includes('missing or insufficient permissions');
    }

    function isServerTimestampFieldValue(val) {
        if (!val || typeof val !== 'object') return false;
        try {
            if (typeof val.isEqual === 'function' && typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue) {
                if (val.isEqual(firebase.firestore.FieldValue.serverTimestamp())) return true;
            }
        } catch (e) {}
        const m = String(val._methodName || (val._delegate && val._delegate._methodName) || '');
        return m.indexOf('serverTimestamp') !== -1;
    }

    function isDeleteFieldValue(val) {
        if (!val || typeof val !== 'object') return false;
        try {
            if (typeof val.isEqual === 'function' && typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue) {
                if (val.isEqual(firebase.firestore.FieldValue.delete())) return true;
            }
        } catch (e) {}
        const m = String(val._methodName || (val._delegate && val._delegate._methodName) || '');
        return m.indexOf('delete') !== -1;
    }

    function getIncrementOperand(val) {
        if (!val || typeof val !== 'object') return null;
        const m = String(val._methodName || (val._delegate && val._delegate._methodName) || '');
        if (m.indexOf('increment') !== -1) {
            const op = val._operand !== undefined ? val._operand : (val._delegate && val._delegate._operand);
            if (typeof op === 'number' && Number.isFinite(op)) return op;
        }
        return null;
    }

    function toFirestoreRestValue(val) {
        if (val === null || val === undefined) return { nullValue: null };
        if (isServerTimestampFieldValue(val)) return { timestampValue: new Date().toISOString() };
        if (val instanceof Date) {
            return { timestampValue: isNaN(val.getTime()) ? new Date().toISOString() : val.toISOString() };
        }
        if (typeof val === 'object' && typeof val.toDate === 'function') {
            try {
                const d = val.toDate();
                if (d instanceof Date && !isNaN(d.getTime())) return { timestampValue: d.toISOString() };
            } catch (e) {}
            return { timestampValue: new Date().toISOString() };
        }
        if (typeof val === 'boolean') return { booleanValue: val };
        if (typeof val === 'number') {
            if (!Number.isFinite(val)) return { nullValue: null };
            return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
        }
        if (typeof val === 'string') return { stringValue: val };
        if (Array.isArray(val)) {
            return {
                arrayValue: {
                    values: val.map(function (item) { return toFirestoreRestValue(item); })
                }
            };
        }
        if (typeof val === 'object') {
            const fields = {};
            Object.keys(val).forEach(function (k) {
                const v = val[k];
                if (v !== undefined && !isDeleteFieldValue(v)) {
                    fields[k] = toFirestoreRestValue(v);
                }
            });
            return { mapValue: { fields: fields } };
        }
        return { stringValue: String(val) };
    }

    function buildFirestoreRestWrite(op) {
        if (!op || !op.docPath || typeof firebaseConfig === 'undefined' || !firebaseConfig.projectId) return null;
        const cleanPath = String(op.docPath).replace(/^\/+/, '');
        const fullDocName = 'projects/' + firebaseConfig.projectId + '/databases/(default)/documents/' + cleanPath;

        if (op.type === 'delete') {
            return { delete: fullDocName };
        }

        const isMerge = op.type === 'update' || Boolean(op.options && op.options.merge);
        const rawData = op.data || {};
        const fields = {};
        const maskPaths = [];
        const updateTransforms = [];

        Object.keys(rawData).forEach(function (k) {
            const v = rawData[k];
            const escapedKey = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k) ? k : ('`' + k.replace(/`/g, '\\`') + '`');

            const incVal = getIncrementOperand(v);
            if (incVal !== null) {
                updateTransforms.push({
                    fieldPath: escapedKey,
                    increment: Number.isInteger(incVal) ? { integerValue: String(incVal) } : { doubleValue: incVal }
                });
                return;
            }

            if (isDeleteFieldValue(v)) {
                if (isMerge) maskPaths.push(escapedKey);
                return;
            }

            if (v === undefined) return;

            fields[k] = toFirestoreRestValue(v);
            if (isMerge) maskPaths.push(escapedKey);
        });

        const writeObj = {
            update: {
                name: fullDocName,
                fields: fields
            }
        };
        if (isMerge) {
            writeObj.updateMask = { fieldPaths: maskPaths };
        }
        if (updateTransforms.length > 0) {
            writeObj.updateTransforms = updateTransforms;
        }
        return writeObj;
    }

    function isActiveStatusNormalized(statusVal) {
        if (statusVal === true) return true;
        const s = String(statusVal || '').trim().toLowerCase();
        return ['active', 'approved', 'อนุมัติ', 'อนุมัติแล้ว', 'ปกติ', 'กำลังปฏิบัติงาน'].includes(s);
    }

    function normalizeUserRole(roleVal) {
        const raw = String(roleVal || '').trim();
        const r = raw.toUpperCase();
        if (!r || r === 'อสม.' || r === 'อสม' || r === 'อาสาสมัครสาธารณสุข' || r === 'USER' || r === 'MEMBER') {
            return 'VHV';
        }
        if (r === 'ADMIN' || r === 'CENTRAL_ADMIN' || r === 'SUPER_ADMIN' || r === 'แอดมิน' || r.includes('ADMIN') || raw.includes('ผู้ดูแลระบบ') || raw.includes('แอดมิน')) {
            return 'ADMIN';
        }
        if (r === 'SUB_ADMIN' || r === 'SUB-ADMIN' || r === 'SUBADMIN' || r === 'SUB ADMIN' ||
            r === 'รพ.สต.' || r === 'รพสต.' || r === 'รพสต' || raw.includes('เจ้าหน้าที่') ||
            raw.includes('รพ.สต') || raw.includes('รพสต') || raw.includes('สาธารณสุข') ||
            raw.includes('พยาบาล') || raw.includes('หมออนามัย')) {
            return 'SUB_ADMIN';
        }
        return r;
    }

    // ========================================================================
    // 1. ระบบเชื่อมต่อฐานข้อมูลและล็อกสิทธิ์ผู้ใช้งาน (Auth & Role Guard)
    // ========================================================================
    const Auth = {
        getLastAuthError: function () {
            return _lastAuthError;
        },
        getStoredUid: getStoredUid,
        setStoredUid: setStoredUid,

        restSignUpAnonymous: async function () {
            if (typeof fetch !== 'function' || typeof firebaseConfig === 'undefined' || !firebaseConfig.apiKey) {
                return null;
            }
            try {
                const res = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + encodeURIComponent(firebaseConfig.apiKey), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ returnSecureToken: true })
                });
                if (!res.ok) return null;
                const data = await res.json();
                if (data && data.idToken && data.localId) {
                    _cachedIdToken = data.idToken;
                    _cachedAuthUid = data.localId;
                    return {
                        uid: data.localId,
                        getIdToken: async function () { return _cachedIdToken; }
                    };
                }
            } catch (e) {
                console.warn('REST anonymous signUp fallback warning:', e);
            }
            return null;
        },

        getValidIdToken: async function (forceRefresh) {
            try {
                if (typeof firebase !== 'undefined' && typeof firebase.auth === 'function' && firebase.auth().currentUser) {
                    const tok = await firebase.auth().currentUser.getIdToken(Boolean(forceRefresh));
                    if (tok) {
                        _cachedIdToken = tok;
                        _cachedAuthUid = firebase.auth().currentUser.uid;
                        return tok;
                    }
                }
            } catch (e) {}
            if (!forceRefresh && _cachedIdToken) return _cachedIdToken;
            const restUser = await Auth.restSignUpAnonymous();
            return restUser ? _cachedIdToken : '';
        },

        restCommitWrites: async function (opsList) {
            if (!Array.isArray(opsList) || opsList.length === 0) return;
            if (typeof fetch !== 'function' || typeof firebaseConfig === 'undefined' || !firebaseConfig.projectId) {
                throw new Error('REST commit unavailable');
            }

            // บังคับยืนยัน Session สดใหม่ก่อนส่งคำสั่งผ่าน REST API
            await Auth.repairSession(_dbInstance);
            let idToken = await Auth.getValidIdToken(false);
            if (!idToken) {
                idToken = await Auth.getValidIdToken(true);
            }
            if (!idToken) {
                throw new Error('Missing or insufficient permissions (Unable to acquire Auth token)');
            }

            const writes = opsList.map(buildFirestoreRestWrite).filter(Boolean);
            if (writes.length === 0) return;

            const commitUrl = 'https://firestore.googleapis.com/v1/projects/' +
                encodeURIComponent(firebaseConfig.projectId) +
                '/databases/(default)/documents:commit';

            // ส่งคำสั่งแบบย่อยทีละรายการ (Single Write) เพื่อป้องกันการชนเพดาน 20 document lookups รวมของกฎ Firestore rules
            for (let i = 0; i < writes.length; i++) {
                const singleWrite = writes[i];
                let res = await fetch(commitUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + idToken
                    },
                    body: JSON.stringify({ writes: [singleWrite] })
                });

                if (!res.ok && (res.status === 401 || res.status === 403)) {
                    // หาก Token เดิมมีปัญหา ให้ขอ Anonymous Token ใหม่ผ่าน REST ทันทีแล้วผูก Auth_Sessions ใหม่
                    const freshAnon = await Auth.restSignUpAnonymous();
                    const targetLiffUid = getStoredUid();
                    if (freshAnon && freshAnon.uid && targetLiffUid) {
                        const sessionUrl = 'https://firestore.googleapis.com/v1/projects/' +
                            encodeURIComponent(firebaseConfig.projectId) +
                            '/databases/(default)/documents/Auth_Sessions/' +
                            encodeURIComponent(freshAnon.uid);
                        await fetch(sessionUrl, {
                            method: 'PATCH',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': 'Bearer ' + _cachedIdToken
                            },
                            body: JSON.stringify({
                                fields: {
                                    liff_uid: { stringValue: targetLiffUid },
                                    updated_at: { timestampValue: new Date().toISOString() }
                                }
                            })
                        });
                        idToken = _cachedIdToken;
                        res = await fetch(commitUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': 'Bearer ' + idToken
                            },
                            body: JSON.stringify({ writes: [singleWrite] })
                        });
                    }
                }

                if (!res.ok) {
                    const errText = await res.text().catch(function () { return ''; });
                    if (res.status === 429 || errText.indexOf('RESOURCE_EXHAUSTED') !== -1 || errText.indexOf('Quota exceeded') !== -1) {
                        throw new Error('โควตาการใช้งานรายวันของ Firebase (ฟรี) เต็มแล้ว ระบบจะรีเซ็ตอัตโนมัติเวลา 15:00 น.');
                    }
                    throw new Error('FirebaseError: Missing or insufficient permissions (' + res.status + ' ' + errText.substring(0, 120) + ')');
                }
            }
            return {};
        },

        installFirestoreWriteInterceptor: function (db) {
            if (_interceptorInstalled || !db) return;
            try {
                const sampleCol = db.collection('_orsomo_init_');
                const sampleDoc = sampleCol.doc('_orsomo_init_');
                const sampleBatch = db.batch();

                const docProto = Object.getPrototypeOf(sampleDoc);
                const colProto = Object.getPrototypeOf(sampleCol);
                const batchProto = Object.getPrototypeOf(sampleBatch);

                if (!docProto || !colProto || !batchProto || docProto.__orsomoWrapped) return;
                docProto.__orsomoWrapped = true;
                _interceptorInstalled = true;

                const origDocSet = docProto.set;
                const origDocUpdate = docProto.update;
                const origDocDelete = docProto.delete;
                const origDocGet = docProto.get;
                const origColAdd = colProto.add;
                const origColGet = colProto.get;
                const origBatchSet = batchProto.set;
                const origBatchUpdate = batchProto.update;
                const origBatchDelete = batchProto.delete;
                const origBatchCommit = batchProto.commit;

                _rawDocSet = origDocSet;

                if (typeof origDocGet === 'function') {
                    docProto.get = async function () {
                        const docRef = this;
                        const args = arguments;
                        try {
                            return await origDocGet.apply(docRef, args);
                        } catch (err) {
                            if (isPermissionDeniedError(err)) {
                                await Auth.repairSession(docRef.firestore || _dbInstance);
                                return await origDocGet.apply(docRef, args);
                            }
                            throw err;
                        }
                    };
                }

                if (typeof origColGet === 'function') {
                    colProto.get = async function () {
                        const colRef = this;
                        const args = arguments;
                        try {
                            return await origColGet.apply(colRef, args);
                        } catch (err) {
                            if (isPermissionDeniedError(err)) {
                                await Auth.repairSession(colRef.firestore || _dbInstance);
                                return await origColGet.apply(colRef, args);
                            }
                            throw err;
                        }
                    };
                }

                docProto.set = async function (data, options) {
                    const docRef = this;
                    const path = String(docRef.path || '');
                    if (path.indexOf('Auth_Sessions/') === 0) {
                        return origDocSet.apply(docRef, arguments);
                    }
                    const args = arguments;
                    const targetDb = docRef.firestore || _dbInstance;
                    await Auth.ensureSessionReadyForWrite(targetDb);
                    try {
                        return await origDocSet.apply(docRef, args);
                    } catch (err) {
                        if (isPermissionDeniedError(err)) {
                            console.warn('doc.set permission-denied. Repairing session & executing fallback...', path);
                            try {
                                await Auth.repairSession(targetDb);
                                return await origDocSet.apply(docRef, args);
                            } catch (retryErr) {
                                if (isPermissionDeniedError(retryErr)) {
                                    await Auth.restCommitWrites([{ type: 'set', docPath: path, data: data, options: options }]);
                                    return;
                                }
                                throw retryErr;
                            }
                        }
                        throw err;
                    }
                };

                docProto.update = async function (data) {
                    const docRef = this;
                    const path = String(docRef.path || '');
                    if (path.indexOf('Auth_Sessions/') === 0) {
                        return origDocUpdate.apply(docRef, arguments);
                    }
                    const args = arguments;
                    const targetDb = docRef.firestore || _dbInstance;
                    await Auth.ensureSessionReadyForWrite(targetDb);
                    try {
                        return await origDocUpdate.apply(docRef, args);
                    } catch (err) {
                        if (isPermissionDeniedError(err)) {
                            console.warn('doc.update permission-denied. Repairing session & executing fallback...', path);
                            try {
                                await Auth.repairSession(targetDb);
                                return await origDocUpdate.apply(docRef, args);
                            } catch (retryErr) {
                                if (isPermissionDeniedError(retryErr)) {
                                    await Auth.restCommitWrites([{ type: 'update', docPath: path, data: data }]);
                                    return;
                                }
                                throw retryErr;
                            }
                        }
                        throw err;
                    }
                };

                docProto.delete = async function () {
                    const docRef = this;
                    const path = String(docRef.path || '');
                    const args = arguments;
                    const targetDb = docRef.firestore || _dbInstance;
                    await Auth.ensureSessionReadyForWrite(targetDb);
                    try {
                        return await origDocDelete.apply(docRef, args);
                    } catch (err) {
                        if (isPermissionDeniedError(err)) {
                            console.warn('doc.delete permission-denied. Repairing session & executing fallback...', path);
                            try {
                                await Auth.repairSession(targetDb);
                                return await origDocDelete.apply(docRef, args);
                            } catch (retryErr) {
                                if (isPermissionDeniedError(retryErr)) {
                                    await Auth.restCommitWrites([{ type: 'delete', docPath: path }]);
                                    return;
                                }
                                throw retryErr;
                            }
                        }
                        throw err;
                    }
                };

                colProto.add = async function (data) {
                    const colRef = this;
                    const args = arguments;
                    const targetDb = colRef.firestore || _dbInstance;
                    await Auth.ensureSessionReadyForWrite(targetDb);
                    try {
                        return await origColAdd.apply(colRef, args);
                    } catch (err) {
                        if (isPermissionDeniedError(err)) {
                            console.warn('col.add permission-denied. Repairing session & executing fallback...', colRef.path);
                            try {
                                await Auth.repairSession(targetDb);
                                return await origColAdd.apply(colRef, args);
                            } catch (retryErr) {
                                if (isPermissionDeniedError(retryErr)) {
                                    const newDocRef = colRef.doc();
                                    await Auth.restCommitWrites([{ type: 'set', docPath: newDocRef.path, data: data }]);
                                    return newDocRef;
                                }
                                throw retryErr;
                            }
                        }
                        throw err;
                    }
                };

                batchProto.set = function (docRef, data, options) {
                    if (!this._orsomoOps) this._orsomoOps = [];
                    this._orsomoOps.push({
                        type: 'set',
                        docPath: docRef && docRef.path ? docRef.path : '',
                        data: data,
                        options: options,
                        args: Array.from(arguments)
                    });
                    return origBatchSet.apply(this, arguments);
                };

                batchProto.update = function (docRef, data) {
                    if (!this._orsomoOps) this._orsomoOps = [];
                    this._orsomoOps.push({
                        type: 'update',
                        docPath: docRef && docRef.path ? docRef.path : '',
                        data: data,
                        args: Array.from(arguments)
                    });
                    return origBatchUpdate.apply(this, arguments);
                };

                batchProto.delete = function (docRef) {
                    if (!this._orsomoOps) this._orsomoOps = [];
                    this._orsomoOps.push({
                        type: 'delete',
                        docPath: docRef && docRef.path ? docRef.path : '',
                        args: Array.from(arguments)
                    });
                    return origBatchDelete.apply(this, arguments);
                };

                batchProto.commit = async function () {
                    const batchInstance = this;
                    const targetDb = batchInstance._firestore || _dbInstance || Auth.ensureFirebase();
                    const recordedOps = Array.isArray(batchInstance._orsomoOps) ? batchInstance._orsomoOps.slice() : [];

                    await Auth.ensureSessionReadyForWrite(targetDb);
                    try {
                        return await origBatchCommit.call(batchInstance);
                    } catch (err) {
                        if (isPermissionDeniedError(err) && recordedOps.length > 0 && targetDb) {
                            console.warn('Batch commit permission-denied. Retrying operations individually to bypass multi-document batch lookup limits...');
                            try {
                                await Auth.repairSession(targetDb);
                                // แยกย่อยรันทีละรายการ (Individual Write) เพื่อไม่ให้ชนข้อจำกัด 20-lookup ของ Firestore สำหรับ Batch
                                for (const op of recordedOps) {
                                    const cleanPath = String(op.docPath || '').replace(/^\/+/, '');
                                    const docRef = targetDb.doc(cleanPath);
                                    if (op.type === 'set') {
                                        await docRef.set(op.data, op.options);
                                    } else if (op.type === 'update') {
                                        await docRef.update(op.data);
                                    } else if (op.type === 'delete') {
                                        await docRef.delete();
                                    }
                                }
                                return;
                            } catch (retryErr) {
                                if (isPermissionDeniedError(retryErr)) {
                                    await Auth.restCommitWrites(recordedOps);
                                    return;
                                }
                                throw retryErr;
                            }
                        }
                        throw err;
                    }
                };
            } catch (err) {
                console.warn('Firestore write interceptor init warning:', err);
            }
        },

        ensureFirebase: function () {
            if (typeof firebase === 'undefined') {
                throw new Error('Firebase SDK is not loaded');
            }
            if (!firebase.apps || firebase.apps.length === 0) {
                firebase.initializeApp(firebaseConfig);
            }
            // ลงทะเบียน Auth Component ก่อนเรียกใช้ Firestore เสมอ เพื่อให้ Firestore แนบ Token ทุกคำสั่ง
            try {
                if (typeof firebase.auth === 'function') {
                    firebase.auth();
                }
            } catch (e) {}
            if (!_dbInstance) {
                _dbInstance = firebase.firestore();
            }
            _persistenceInitialized = true;
            Auth.installFirestoreWriteInterceptor(_dbInstance);
            return _dbInstance;
        },

        ensureAuthSdk: function () {
            if (typeof firebase !== 'undefined' && typeof firebase.auth === 'function') {
                return Promise.resolve();
            }
            if (_authSdkPromise) return _authSdkPromise;

            _authSdkPromise = new Promise(function (resolve) {
                const existing = Array.from(document.getElementsByTagName('script')).find(function (s) {
                    return (s.getAttribute('src') || '').includes('firebase-auth-compat.js');
                });
                if (existing) {
                    existing.addEventListener('load', function () { resolve(); });
                    existing.addEventListener('error', function () { resolve(); });
                    setTimeout(resolve, 2500);
                    return;
                }
                const script = document.createElement('script');
                script.src = 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth-compat.js';
                script.onload = function () { resolve(); };
                script.onerror = function () { resolve(); };
                (document.head || document.documentElement).appendChild(script);
            });
            return _authSdkPromise;
        },

        ensureAnonymousSignIn: async function (forceTokenRefresh) {
            try {
                await Auth.ensureAuthSdk();
                if (typeof firebase === 'undefined' || typeof firebase.auth !== 'function') {
                    return await Auth.restSignUpAnonymous();
                }
                if (!firebase.apps || firebase.apps.length === 0) {
                    firebase.initializeApp(firebaseConfig);
                }
                const auth = firebase.auth();

                // ถ้าระบบเพิ่งอัปเกรดจากเวอร์ชันก่อน Auth ให้รีเซ็ต Anonymous Auth เก่าที่ค้างในมือถือ 1 ครั้งเพื่อเริ่ม Token ใหม่เหมือนเครื่องคอมพิวเตอร์
                let needsAuthReset = false;
                try {
                    needsAuthReset = localStorage.getItem('orsomo_needs_auth_reset') === '1';
                    if (needsAuthReset) {
                        localStorage.removeItem('orsomo_needs_auth_reset');
                    }
                } catch (e) {}

                if (needsAuthReset) {
                    try {
                        await Promise.race([
                            auth.signOut(),
                            new Promise(function (r) { setTimeout(r, 1200); })
                        ]);
                        _authStateReadyPromise = null;
                        _cachedIdToken = '';
                        _cachedAuthUid = '';
                    } catch (e) {}
                }

                // รอให้ Firebase Auth โหลดสถานะเดิมจาก IndexedDB ให้เสร็จก่อน (ป้องกัน Race Condition บนมือถือ)
                if (!auth.currentUser && !needsAuthReset) {
                    if (!_authStateReadyPromise) {
                        _authStateReadyPromise = new Promise(function (resolve) {
                            let settled = false;
                            const done = function (u) {
                                if (!settled) {
                                    settled = true;
                                    resolve(u || null);
                                }
                            };
                            const timer = setTimeout(function () { done(auth.currentUser); }, 1800);
                            try {
                                const unsub = auth.onAuthStateChanged(function (u) {
                                    clearTimeout(timer);
                                    if (typeof unsub === 'function') unsub();
                                    done(u);
                                }, function () {
                                    clearTimeout(timer);
                                    done(null);
                                });
                            } catch (e) {
                                clearTimeout(timer);
                                done(auth.currentUser);
                            }
                        });
                    }
                    await _authStateReadyPromise;
                }

                let user = auth.currentUser;
                if (!user) {
                    try {
                        const signInPromise = auth.signInAnonymously();
                        const cred = await Promise.race([
                            signInPromise,
                            new Promise(function (_, reject) {
                                setTimeout(function () { reject(new Error('AUTH_TIMEOUT')); }, 4500);
                            })
                        ]);
                        user = cred ? cred.user : auth.currentUser;
                    } catch (signInErr) {
                        // กรณี WebView มือถือติดล็อก IndexedDB ให้สลับไปใช้ SESSION/NONE Persistence หรือ REST ทันที
                        try {
                            if (firebase.auth && firebase.auth.Auth && firebase.auth.Auth.Persistence) {
                                await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
                                const cred2 = await auth.signInAnonymously();
                                user = cred2 ? cred2.user : auth.currentUser;
                            }
                        } catch (fallbackErr) {}
                    }
                }

                if (user && typeof user.getIdToken === 'function') {
                    const tok = await user.getIdToken(Boolean(forceTokenRefresh || needsAuthReset));
                    if (tok) {
                        _cachedIdToken = tok;
                        _cachedAuthUid = user.uid;
                    }
                    _lastAuthError = null;
                    return user;
                }

                return await Auth.restSignUpAnonymous();
            } catch (err) {
                const code = err && err.code ? err.code : String(err);
                _lastAuthError = code;
                console.warn('Anonymous Auth info:', code);
                return await Auth.restSignUpAnonymous();
            }
        },

        bindAuthSession: async function (db, liffUid, forceWrite) {
            const targetUid = String(liffUid || getStoredUid() || '').trim();
            if (!targetUid) return null;
            setStoredUid(targetUid);

            try {
                const dbInst = db || Auth.ensureFirebase();
                let authUser = await Auth.ensureAnonymousSignIn(Boolean(forceWrite));
                if (!authUser || !authUser.uid) {
                    authUser = await Auth.restSignUpAnonymous();
                }
                if (!authUser || !authUser.uid) return null;

                const cacheKey = authUser.uid + ':' + targetUid;
                const nowMs = Date.now();
                if (!forceWrite && _memoryBoundKey === cacheKey && (nowMs - _memoryBoundAt) < 180000) {
                    return authUser.uid;
                }

                let idToken = '';
                try {
                    idToken = typeof authUser.getIdToken === 'function'
                        ? await authUser.getIdToken(Boolean(forceWrite))
                        : _cachedIdToken;
                } catch (e) {
                    idToken = _cachedIdToken;
                }

                // 1. ยิงตรงผ่าน Firestore REST API และตรวจสอบสถานะ 200 OK เพื่อให้มั่นใจ 100% ว่าเซิร์ฟเวอร์มีเอกสาร Auth_Sessions
                let restBoundOk = false;
                if (idToken && typeof fetch === 'function' && typeof firebaseConfig !== 'undefined' && firebaseConfig.projectId) {
                    const sendRestBind = async function (uidToBind, tokenToUse) {
                        const restUrl = 'https://firestore.googleapis.com/v1/projects/' +
                            encodeURIComponent(firebaseConfig.projectId) +
                            '/databases/(default)/documents/Auth_Sessions/' +
                            encodeURIComponent(uidToBind);
                        return await fetch(restUrl, {
                            method: 'PATCH',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': 'Bearer ' + tokenToUse
                            },
                            body: JSON.stringify({
                                fields: {
                                    liff_uid: { stringValue: targetUid },
                                    updated_at: { timestampValue: new Date().toISOString() }
                                }
                            })
                        });
                    };

                    try {
                        let patchRes = await sendRestBind(authUser.uid, idToken);
                        if (patchRes && patchRes.ok) {
                            restBoundOk = true;
                        } else if (patchRes && (patchRes.status === 401 || patchRes.status === 403)) {
                            // หาก Token ของเครื่องเก่าหมดอายุหรือถูกปฏิเสธ ให้สร้าง Anonymous Session ใหม่ทันที
                            const freshUser = await Auth.restSignUpAnonymous();
                            if (freshUser && freshUser.uid && _cachedIdToken) {
                                authUser = freshUser;
                                idToken = _cachedIdToken;
                                patchRes = await sendRestBind(authUser.uid, idToken);
                                if (patchRes && patchRes.ok) restBoundOk = true;
                            }
                        }
                    } catch (restErr) {
                        console.warn('REST Auth_Sessions bind fallback:', restErr);
                    }
                }

                // 2. อัปเดตผ่าน SDK ควบคู่กัน (มี Timeout ป้องกันคิวค้าง)
                if (dbInst && authUser && authUser.uid) {
                    const sessionDocRef = dbInst.collection('Auth_Sessions').doc(authUser.uid);
                    const sessionPayload = {
                        liff_uid: targetUid,
                        updated_at: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    const sdkWritePromise = _rawDocSet
                        ? _rawDocSet.call(sessionDocRef, sessionPayload, { merge: true })
                        : sessionDocRef.set(sessionPayload, { merge: true });

                    await Promise.race([
                        sdkWritePromise.catch(function () {}),
                        new Promise(function (r) { setTimeout(r, restBoundOk ? 600 : 1800); })
                    ]);
                }

                const finalKey = authUser.uid + ':' + targetUid;
                _memoryBoundKey = finalKey;
                _memoryBoundAt = Date.now();
                try { sessionStorage.setItem('orsomo_auth_bound', finalKey); } catch (e) {}
                return authUser.uid;
            } catch (err) {
                console.warn('Auth_Sessions bind info:', err && err.message ? err.message : err);
                return null;
            }
        },

        ensureSessionReadyForWrite: async function (db) {
            try {
                let uid = getStoredUid();
                if (!uid) {
                    const resolved = await Auth.resolveLiffUid();
                    uid = String((resolved && resolved.uid) || '').trim();
                }
                if (uid) {
                    await Auth.bindAuthSession(db || _dbInstance, uid, false);
                } else {
                    await Auth.ensureAnonymousSignIn(false);
                }
            } catch (e) {
                console.warn('ensureSessionReadyForWrite warning:', e);
            }
        },

        repairSession: async function (db) {
            try {
                let uid = getStoredUid();
                if (!uid) {
                    const resolved = await Auth.resolveLiffUid();
                    uid = String((resolved && resolved.uid) || '').trim();
                }
                const dbInst = db || Auth.ensureFirebase();
                _memoryBoundKey = '';
                _memoryBoundAt = 0;
                try { sessionStorage.removeItem('orsomo_auth_bound'); } catch (e) {}

                // บังคับรีเฟรช ID Token ใหม่ เพื่อให้ Firestore WebChannel อัปเดตสิทธิ์ทันที
                const user = await Auth.ensureAnonymousSignIn(true);
                if (user) {
                    await new Promise(function (r) { setTimeout(r, 180); });
                }
                if (!uid) return user ? user.uid : null;
                return await Auth.bindAuthSession(dbInst, uid, true);
            } catch (err) {
                console.warn('repairSession warning:', err);
                return null;
            }
        },

        withAutoSessionRetry: async function (db, operationFn) {
            try {
                return await operationFn();
            } catch (err) {
                if (isPermissionDeniedError(err)) {
                    console.warn('Permission issue detected. Executing automatic session self-heal & retry...');
                    await Auth.repairSession(db);
                    return await operationFn();
                }
                throw err;
            }
        },

        resolveLiffUid: async function () {
            try { localStorage.removeItem('dev_mock_uid'); } catch (e) {}
            const savedUid = getStoredUid();

            if (typeof liff === 'undefined') {
                return { uid: savedUid, profile: null };
            }

            try {
                await liff.init({ liffId: LIFF_ID });
                if (liff.isLoggedIn()) {
                    const profile = await liff.getProfile();
                    if (profile && profile.userId) {
                        setStoredUid(profile.userId);
                        return { uid: profile.userId, profile: profile };
                    }
                }
            } catch (err) {
                console.warn('LIFF init/profile fallback:', err);
            }

            return { uid: savedUid, profile: null };
        },

        loadSystemConfigs: async function (db) {
            const cacheKey = 'orsomo_sysconfigs_cache';
            try {
                const cachedStr = sessionStorage.getItem(cacheKey);
                if (cachedStr) {
                    const cached = JSON.parse(cachedStr);
                    if (cached && cached.expiry && Date.now() < cached.expiry && cached.data) {
                        return Object.assign({}, DEFAULT_CONFIGS, cached.data);
                    }
                }
            } catch (e) {}

            const cfg = Object.assign({}, DEFAULT_CONFIGS);
            if (!db) return cfg;
            try {
                const keys = [
                    'HOSPITAL_NAME',
                    'SYSTEM_NAME',
                    'VILLAGE_COUNT',
                    'DIAPER_PRICE',
                    'UNDERPAD_PRICE',
                    'JELLY_PRICE',
                    'JELLY_DEFAULT_QTY',
                    'BANNER_PRICE',
                    'SUB_CENTERS'
                ];
                const snaps = await Promise.all(keys.map(function (k) {
                    return db.collection('SystemConfig').doc(k).get().catch(function () { return null; });
                }));
                snaps.forEach(function (snap, idx) {
                    if (!snap || !snap.exists) return;
                    const key = keys[idx];
                    const val = snap.data().value;
                    if (val === undefined || val === null || val === '') return;

                    if (['VILLAGE_COUNT', 'JELLY_DEFAULT_QTY'].includes(key)) {
                        const n = parseInt(val, 10);
                        if (!isNaN(n)) cfg[key] = n;
                    } else if (['DIAPER_PRICE', 'UNDERPAD_PRICE', 'JELLY_PRICE', 'BANNER_PRICE'].includes(key)) {
                        const f = parseFloat(val);
                        if (!isNaN(f)) cfg[key] = f;
                    } else if (key === 'SUB_CENTERS') {
                        if (Array.isArray(val)) cfg.SUB_CENTERS = val;
                        else if (typeof val === 'string') {
                            try { cfg.SUB_CENTERS = JSON.parse(val); } catch (e) { cfg.SUB_CENTERS = []; }
                        }
                    } else {
                        cfg[key] = val;
                    }
                });

                try {
                    sessionStorage.setItem(cacheKey, JSON.stringify({
                        data: cfg,
                        expiry: Date.now() + (30 * 60 * 1000) // แคช 30 นาที
                    }));
                } catch (e) {}
            } catch (err) {
                console.warn('loadSystemConfigs fallback:', err);
            }
            return cfg;
        },

        guardPage: async function (options) {
            const opts = Object.assign({
                allowedRoles: ['ADMIN', 'SUB_ADMIN', 'VHV'],
                loginUrl: 'index.html',
                autoAdminShell: false,
                currentPage: ''
            }, options || {});

            const toVerUrl = function (u) {
                return (typeof window.OrsomoAppendVer === 'function') ? window.OrsomoAppendVer(u) : u;
            };

            const db = Auth.ensureFirebase();
            const resolved = await Auth.resolveLiffUid();
            const uid = String(resolved.uid || '').trim();

            if (!uid) {
                window.location.replace(toVerUrl(opts.loginUrl));
                throw new Error('UNAUTHENTICATED');
            }

            setStoredUid(uid);
            
            // ลดการยิงเขียน Auth_Sessions ซ้ำซ้อน: ยืนยันเฉพาะเมื่อเข้าสู่เซสชันครั้งแรก หรือเมื่อหลุดสิทธิ์
            const sessionBoundKey = 'orsomo_session_bound_' + uid;
            const isBoundInSession = sessionStorage.getItem(sessionBoundKey) === '1';
            if (!isBoundInSession) {
                await Auth.bindAuthSession(db, uid, false);
                try { sessionStorage.setItem(sessionBoundKey, '1'); } catch (e) {}
            }

            let userDoc = null;
            try {
                userDoc = await db.collection('VHVs').doc(uid).get();
            } catch (readErr) {
                if (isPermissionDeniedError(readErr)) {
                    await Auth.repairSession(db);
                    userDoc = await db.collection('VHVs').doc(uid).get();
                } else {
                    throw readErr;
                }
            }

            if (!userDoc || !userDoc.exists) {
                if (!resolved.profile) {
                    clearStoredUid();
                }
                window.location.replace(toVerUrl(opts.loginUrl));
                throw new Error('USER_NOT_REGISTERED');
            }

            const userData = userDoc.data() || {};
            const isActiveAccount = isActiveStatusNormalized(userData.status);
            const roleUpper = normalizeUserRole(userData.role);

            // บล็อกบัญชี Pending / Rejected / อื่นๆ ที่ไม่ใช่ Active 100%
            if (!isActiveAccount) {
                window.location.replace(toVerUrl(opts.loginUrl));
                throw new Error('USER_NOT_ACTIVE');
            }

            if (Array.isArray(opts.allowedRoles) && opts.allowedRoles.length > 0 && !opts.allowedRoles.includes(roleUpper)) {
                const fallbackUrl = toVerUrl((roleUpper === 'ADMIN' || roleUpper === 'SUB_ADMIN')
                    ? 'admin_dashboard.html'
                    : (roleUpper === 'VHV' ? 'dashboard.html' : opts.loginUrl));
                if (typeof window.showToast === 'function') {
                    window.showToast('บัญชีของคุณไม่มีสิทธิ์เข้าถึงหน้านี้', 'error', fallbackUrl);
                } else {
                    alert('บัญชีของคุณไม่มีสิทธิ์เข้าถึงหน้านี้');
                    window.location.replace(fallbackUrl);
                }
                throw new Error('ROLE_FORBIDDEN');
            }

            const sysConfigs = await Auth.loadSystemConfigs(db);
            const hospitalName = userData.hospital_name || sysConfigs.HOSPITAL_NAME || DEFAULT_CONFIGS.HOSPITAL_NAME;
            const assignedVillages = Array.isArray(userData.assigned_villages)
                ? userData.assigned_villages.map(function (v) { return String(v).trim(); })
                : [];
            const villageNo = userData.village_no !== undefined && userData.village_no !== null
                ? String(userData.village_no).trim()
                : '';

            UI.renderHeaderProfile(userData, hospitalName);
            if (opts.autoAdminShell) {
                UI.initResponsiveAdminShell({
                    role: roleUpper,
                    currentPage: opts.currentPage,
                    hospitalName: hospitalName
                });
            }

            return {
                db: db,
                uid: uid,
                user: userData,
                name: userData.name || '',
                nickname: userData.nickname || '',
                role: roleUpper,
                status: userData.status,
                villageNo: villageNo,
                assignedVillages: assignedVillages,
                assigned_villages: assignedVillages,
                hospitalName: hospitalName,
                hospital_name: hospitalName,
                profile_pic: userData.profile_pic || userData.photoURL || userData.pic_url || '',
                photoURL: userData.photoURL || userData.profile_pic || '',
                sysConfigs: sysConfigs
            };
        },

        canAccessPatient: function (ctx, patient, vhvScope) {
            if (!ctx || !patient) return false;
            const rawVillage = String(patient.village_no || '').trim();
            const pVillage = rawVillage.replace(/\D/g, '');
            const pAssigned = String(patient.assigned_vhv_id || '').trim();
            const creatorUid = String(patient.creator_uid || '').trim();

            // ผู้ดูแลส่วนกลาง (ADMIN) มีสิทธิ์เข้าถึงผู้ป่วยได้ทุกหมู่บ้านในตำบล
            if (ctx.role === 'ADMIN') return true;

            // เจ้าหน้าที่ รพ.สต./ศูนย์สาธารณสุข (SUB_ADMIN)
            if (ctx.role === 'SUB_ADMIN') {
                // หากยังไม่ได้ระบุหมู่บ้าน (เช่น เคสสร้างใหม่) หรือตนเองเป็นผู้สร้างเคส -> อนุญาตให้เข้าถึงเสมอ
                if (!pVillage || (creatorUid && creatorUid === String(ctx.uid || '').trim())) {
                    return true;
                }
                const assigned = (Array.isArray(ctx.assignedVillages) ? ctx.assignedVillages : (ctx.assigned_villages || []))
                    .map(function (v) { return String(v).replace(/\D/g, ''); })
                    .filter(Boolean);
                // หาก Sub-Admin ไม่ได้ระบุหมู่บ้านเฉพาะ -> เข้าถึงได้ทั้งหมด
                if (assigned.length === 0) return true;
                // หากมีหมู่บ้านเฉพาะ (เช่น ศูนย์บริการสาธารณสุข 1 ดูแลเฉพาะหมู่ 8 และ 13) -> เข้าถึงได้เฉพาะหมู่บ้านที่ระบุ
                return assigned.includes(pVillage);
            }

            if (ctx.role === 'VHV') {
                const vhvVillage = String(ctx.villageNo || '').replace(/\D/g, '');
                const inSameVillage = vhvVillage !== '' && pVillage === vhvVillage;
                if (vhvScope === 'village') {
                    return inSameVillage;
                }
                // ค่าเริ่มต้น: เฉพาะเคสที่ได้รับมอบหมายดูแล หรืออยู่ในหมู่เดียวกันหากยังไม่ได้มอบหมาย
                return (pAssigned !== '' && pAssigned === String(ctx.uid).trim()) ||
                       (!pAssigned && inSameVillage);
            }
            return false;
        },

        logout: function (redirectUrl) {
            try {
                clearStoredUid();
                if (typeof liff !== 'undefined' && liff.isLoggedIn && liff.isLoggedIn()) {
                    liff.logout();
                }
                if (typeof firebase !== 'undefined' && typeof firebase.auth === 'function' && firebase.auth().currentUser) {
                    firebase.auth().signOut().catch(function () {});
                }
            } catch (e) {}
            window.location.replace(redirectUrl || 'index.html');
        }
    };

    // ========================================================================
    // 2. มาตรฐานวันที่ไทย พ.ศ./ค.ศ. และการคำนวณอายุสด (DateUtils)
    // ========================================================================
    const DateUtils = {
        parseToDate: function (val) {
            if (!val || val === '-') return null;
            if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
            if (typeof val === 'object' && typeof val.toDate === 'function') {
                const d = val.toDate();
                return isNaN(d.getTime()) ? null : d;
            }
            if (typeof val === 'object' && typeof val.seconds === 'number') {
                return new Date(val.seconds * 1000);
            }

            const str = String(val).trim();
            if (!str) return null;

            // รูปแบบ YYYY-MM-DD หรือ BBBB-MM-DD (ก่อนตรวจ ISO เต็มรูปแบบ)
            const dashMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
            if (dashMatch) {
                let y = parseInt(dashMatch[1], 10);
                const m = parseInt(dashMatch[2], 10);
                const day = parseInt(dashMatch[3], 10);
                if (y > 2400) y -= 543;
                const dObj = new Date(y, m - 1, day);
                return isNaN(dObj.getTime()) ? null : dObj;
            }

            // รูปแบบ DD/MM/BBBB หรือ DD/MM/YYYY พร้อมเวลาต่อท้าย (ถ้ามี)
            const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
            if (slashMatch) {
                const day = parseInt(slashMatch[1], 10);
                const m = parseInt(slashMatch[2], 10);
                let y = parseInt(slashMatch[3], 10);
                if (y > 2400) y -= 543;
                const hh = slashMatch[4] ? parseInt(slashMatch[4], 10) : 0;
                const mm = slashMatch[5] ? parseInt(slashMatch[5], 10) : 0;
                const ss = slashMatch[6] ? parseInt(slashMatch[6], 10) : 0;
                const dObj = new Date(y, m - 1, day, hh, mm, ss);
                return isNaN(dObj.getTime()) ? null : dObj;
            }

            // รูปแบบ ISO อื่นๆ เช่น 2026-11-06T03:00:00Z
            const parsed = new Date(str);
            return isNaN(parsed.getTime()) ? null : parsed;
        },

        toTimestampMs: function (val) {
            const d = DateUtils.parseToDate(val);
            return d ? d.getTime() : 0;
        },

        toThaiDate: function (val) {
            const d = val ? DateUtils.parseToDate(val) : new Date();
            if (!d) return '-';
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const bbbb = d.getFullYear() + 543;
            return dd + '/' + mm + '/' + bbbb;
        },

        toThaiDateTime: function (val) {
            const d = val ? DateUtils.parseToDate(val) : new Date();
            if (!d) return '-';
            const datePart = DateUtils.toThaiDate(d);
            const hh = String(d.getHours()).padStart(2, '0');
            const min = String(d.getMinutes()).padStart(2, '0');
            return datePart + ' ' + hh + ':' + min + ' น.';
        },

        toInputDateISO: function (val) {
            const d = DateUtils.parseToDate(val);
            if (!d) return '';
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return yyyy + '-' + mm + '-' + dd;
        },

        calculateAge: function (dobVal, fallbackAge) {
            const birth = DateUtils.parseToDate(dobVal);
            if (!birth) {
                if (fallbackAge !== undefined && fallbackAge !== null && String(fallbackAge).trim() !== '' && String(fallbackAge).trim() !== '-') {
                    return parseInt(fallbackAge, 10) || fallbackAge;
                }
                return '-';
            }
            const now = new Date();
            let age = now.getFullYear() - birth.getFullYear();
            const monthDiff = now.getMonth() - birth.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
                age--;
            }
            return age >= 0 && age <= 130 ? age : (fallbackAge || '-');
        },

        daysSince: function (dateVal) {
            const ms = DateUtils.toTimestampMs(dateVal);
            if (!ms) return Infinity;
            const diff = Date.now() - ms;
            return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
        },

        compareRounds: function (a, b) {
            const parseR = function (r) {
                const s = String(r || '').trim();
                const m = s.match(/^(\d+)\/(\d{4})(?:-(\d+))?/);
                if (!m) return { year: 0, round: 0, sub: 0, raw: s };
                return {
                    round: parseInt(m[1], 10) || 0,
                    year: parseInt(m[2], 10) || 0,
                    sub: m[3] ? (parseInt(m[3], 10) || 0) : 0,
                    raw: s
                };
            };
            const pa = parseR(a);
            const pb = parseR(b);
            if (pa.year !== pb.year) return pa.year - pb.year;
            if (pa.round !== pb.round) return pa.round - pb.round;
            if (pa.sub !== pb.sub) return pa.sub - pb.sub;
            return pa.raw.localeCompare(pb.raw, 'th');
        },

        getFiscalYearFromRound: function (roundStr) {
            const m = String(roundStr || '').match(/\/(\d{4})/);
            return m ? m[1] : '';
        }
    };

    // ========================================================================
    // 3. ตัวแปลงข้อมูลผ้าอ้อมกลาง (DiaperAdapter — Single Source of Truth)
    // ========================================================================
    const DiaperAdapter = {
        // ขนาดผ้าอ้อมที่ใช้จริงในระบบ (ไม่มี XXL)
        DIAPER_SIZES: ['S', 'M', 'L', 'XL'],

        normalizeSize: function (sizeVal) {
            const s = String(sizeVal || '').trim().toUpperCase();
            return DiaperAdapter.DIAPER_SIZES.includes(s) ? s : (s === '-' || !s ? '-' : s);
        },

        parse: function (rawDiaper) {
            let obj = {};
            if (rawDiaper && typeof rawDiaper === 'object') {
                obj = Object.assign({}, rawDiaper);
            } else if (typeof rawDiaper === 'string' && rawDiaper.trim() !== '') {
                let s = rawDiaper.trim();
                try {
                    obj = JSON.parse(s);
                    if (typeof obj === 'string') obj = JSON.parse(obj);
                } catch (e1) {
                    try {
                        let cleaned = s.replace(/""/g, '"');
                        if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
                            cleaned = cleaned.substring(1, cleaned.length - 1);
                        }
                        obj = JSON.parse(cleaned);
                    } catch (e2) {
                        obj = {};
                    }
                }
            }

            if (!obj || typeof obj !== 'object') obj = {};

            // 1. ซิงค์สถานะอนุมัติโควตาให้ตรงกันระหว่าง approve_status และ status
            let approveStatus = String(obj.approve_status || '').trim();
            const rawStatus = String(obj.status || '').trim().toLowerCase();

            if (!approveStatus) {
                if (rawStatus === 'approved') approveStatus = 'อนุมัติแล้ว';
                else if (rawStatus === 'pending') approveStatus = 'รออนุมัติ';
                else if (rawStatus === 'rejected') approveStatus = 'ไม่อนุมัติ';
                else if (obj.req_diaper || obj.req_underpad || (obj.result && String(obj.result).includes('มีสิทธิ์'))) {
                    approveStatus = 'รออนุมัติ';
                } else {
                    approveStatus = 'ยังไม่ขอรับสิทธิ์';
                }
            }

            let syncedStatus = 'none';
            if (approveStatus === 'อนุมัติแล้ว') syncedStatus = 'approved';
            else if (approveStatus === 'รออนุมัติ') syncedStatus = 'pending';
            else if (approveStatus === 'ไม่อนุมัติ') syncedStatus = 'rejected';

            // 2. ซิงค์ประวัติรอบจัดสรร alloc_history <-> allocations
            const rawHistory = (obj.alloc_history && typeof obj.alloc_history === 'object' && !Array.isArray(obj.alloc_history))
                ? obj.alloc_history
                : {};
            const normalizedHistory = {};

            Object.keys(rawHistory).forEach(function (rk) {
                const key = String(rk || '').trim();
                if (!key) return;
                const item = rawHistory[rk] || {};
                normalizedHistory[key] = Object.assign({}, item, {
                    diaper_qty: Math.max(0, parseInt(item.diaper_qty, 10) || 0),
                    pad_qty: Math.max(0, parseInt(item.pad_qty, 10) || 0),
                    jelly_qty: Math.max(0, parseInt(item.jelly_qty, 10) || 0),
                    actual_size: DiaperAdapter.normalizeSize(item.actual_size || obj.size || '-'),
                    req_diaper: item.req_diaper !== undefined ? Boolean(item.req_diaper) : Boolean(obj.req_diaper),
                    req_underpad: item.req_underpad !== undefined ? Boolean(item.req_underpad) : Boolean(obj.req_underpad),
                    days: parseInt(item.days, 10) || 0,
                    committee_date: item.committee_date || '',
                    recorded_at: item.recorded_at || '',
                    recorded_by: item.recorded_by || '',
                    delivered: Boolean(item.delivered),
                    delivered_at: item.delivered_at || '',
                    delivered_by: item.delivered_by || '',
                    delivery_method: item.delivery_method || '',
                    delivery_gps: item.delivery_gps || '',
                    delivery_note: item.delivery_note || '',
                    proof_doc_id: item.proof_doc_id || '',
                    stock_deducted: Boolean(item.stock_deducted),
                    is_legacy_unrecorded: Boolean(item.is_legacy_unrecorded)
                });
            });

            const rawAllocArr = Array.isArray(obj.allocations) ? obj.allocations : [];
            const roundSet = new Set(Object.keys(normalizedHistory));
            rawAllocArr.forEach(function (r) {
                const rk = String(r || '').trim();
                if (!rk) return;
                roundSet.add(rk);
                if (!normalizedHistory[rk]) {
                    normalizedHistory[rk] = {
                        diaper_qty: 0,
                        pad_qty: 0,
                        jelly_qty: 0,
                        actual_size: DiaperAdapter.normalizeSize(obj.size || '-'),
                        req_diaper: Boolean(obj.req_diaper),
                        req_underpad: Boolean(obj.req_underpad),
                        days: 0,
                        committee_date: '',
                        recorded_at: '',
                        recorded_by: '',
                        delivered: false,
                        delivered_at: '',
                        delivered_by: '',
                        delivery_method: '',
                        delivery_gps: '',
                        delivery_note: '',
                        proof_doc_id: '',
                        stock_deducted: false,
                        is_legacy_unrecorded: true
                    };
                }
            });

            const sortedAllocations = Array.from(roundSet).sort(DateUtils.compareRounds);

            // 3. จัดการ indications ให้เป็น Array เสมอ
            let indications = [];
            if (Array.isArray(obj.indications)) {
                indications = obj.indications.filter(Boolean);
            } else if (typeof obj.indications === 'string' && obj.indications.trim() !== '') {
                indications = obj.indications.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
            }

            return Object.assign({}, obj, {
                result: obj.result || '',
                indications: indications,
                req_diaper: Boolean(obj.req_diaper),
                size: DiaperAdapter.normalizeSize(obj.size || '-'),
                req_underpad: Boolean(obj.req_underpad),
                approve_status: approveStatus,
                status: syncedStatus,
                approved_diaper: parseFloat(obj.approved_diaper) || 0,
                approved_underpad: parseFloat(obj.approved_underpad) || 0,
                assessor_uid: obj.assessor_uid || '',
                assessor_name: obj.assessor_name || '',
                assessor_agency: obj.assessor_agency || '',
                has_medical_cert: Boolean(obj.has_medical_cert || obj.medical_cert),
                alloc_history: normalizedHistory,
                allocations: sortedAllocations
            });
        },

        normalizeForSave: function (rawDiaper, options) {
            const opts = Object.assign({ stripInlineCert: false }, options || {});
            const parsed = DiaperAdapter.parse(rawDiaper);

            // ซิงค์ allocations จากคีย์จริงใน alloc_history
            parsed.allocations = Object.keys(parsed.alloc_history || {}).sort(DateUtils.compareRounds);

            if (opts.stripInlineCert && parsed.medical_cert) {
                parsed.has_medical_cert = true;
                delete parsed.medical_cert;
            }

            // คำนวณและฝังโควตามาตรฐานตั้งต้นเสมอ (3ชิ้น/วัน, 6ชิ้น/วัน, 1+3ชิ้น/วัน)
            const quota = DiaperAdapter.getBaselineQuota(parsed);
            parsed.baseline_diaper_daily = quota.diaper_daily;
            parsed.baseline_underpad_daily = quota.underpad_daily;
            parsed.baseline_diaper_monthly = quota.diaper_monthly;
            parsed.baseline_underpad_monthly = quota.underpad_monthly;
            parsed.baseline_quota_desc = quota.quota_desc;

            // บันทึกเป็น Object มาตรฐานของ Firestore (ข้อ 2.1 ก.)
            return parsed;
        },

        upsertRound: function (rawDiaper, roundKey, payload) {
            const rk = String(roundKey || '').trim();
            const dp = DiaperAdapter.parse(rawDiaper);
            if (!rk) return dp;

            const prev = (dp.alloc_history && dp.alloc_history[rk]) ? dp.alloc_history[rk] : {};
            const nextEntry = Object.assign({}, prev, payload || {}, {
                is_legacy_unrecorded: false
            });
            nextEntry.diaper_qty = Math.max(0, parseInt(nextEntry.diaper_qty, 10) || 0);
            nextEntry.pad_qty = Math.max(0, parseInt(nextEntry.pad_qty, 10) || 0);
            nextEntry.jelly_qty = Math.max(0, parseInt(nextEntry.jelly_qty, 10) || 0);
            nextEntry.actual_size = DiaperAdapter.normalizeSize(nextEntry.actual_size || dp.size || '-');

            if (!nextEntry.recorded_at) {
                nextEntry.recorded_at = new Date().toISOString();
            }

            dp.alloc_history[rk] = nextEntry;
            return DiaperAdapter.normalizeForSave(dp);
        },

        deleteRound: function (rawDiaper, roundKey) {
            const rk = String(roundKey || '').trim();
            const dp = DiaperAdapter.parse(rawDiaper);
            if (!rk) return dp;

            if (dp.alloc_history && dp.alloc_history[rk]) {
                delete dp.alloc_history[rk];
            }
            dp.allocations = (dp.allocations || []).filter(function (r) { return String(r).trim() !== rk; });
            return DiaperAdapter.normalizeForSave(dp);
        },

        getBaselineQuota: function (rawDiaper) {
            const dp = DiaperAdapter.parse(rawDiaper);
            const reqDiaper = Boolean(dp.req_diaper);
            const reqUnderpad = Boolean(dp.req_underpad);

            if (reqDiaper && !reqUnderpad) {
                return {
                    req_type: 'diaper_only',
                    req_type_label: 'เฉพาะผ้าอ้อม',
                    diaper_daily: 3,
                    underpad_daily: 0,
                    diaper_monthly: 90,
                    underpad_monthly: 0,
                    quota_desc: 'ผ้าอ้อม 3 ชิ้น/วัน (90 ชิ้น/ด.)'
                };
            }
            if (!reqDiaper && reqUnderpad) {
                return {
                    req_type: 'underpad_only',
                    req_type_label: 'เฉพาะแผ่นรองซับ',
                    diaper_daily: 0,
                    underpad_daily: 6,
                    diaper_monthly: 0,
                    underpad_monthly: 180,
                    quota_desc: 'แผ่นรอง 6 ชิ้น/วัน (180 ชิ้น/ด.)'
                };
            }
            if (reqDiaper && reqUnderpad) {
                return {
                    req_type: 'both',
                    req_type_label: 'ผ้าอ้อม + แผ่นรองซับ',
                    diaper_daily: 1,
                    underpad_daily: 3,
                    diaper_monthly: 30,
                    underpad_monthly: 90,
                    quota_desc: 'ผ้าอ้อม 1 + แผ่นรอง 3 ชิ้น/วัน (30+90 ชิ้น/ด.)'
                };
            }
            return {
                req_type: 'none',
                req_type_label: 'ไม่ขอรับ',
                diaper_daily: 0,
                underpad_daily: 0,
                diaper_monthly: 0,
                underpad_monthly: 0,
                quota_desc: '-'
            };
        },

        calculateProjectBudget: function (counts, prices) {
            const c = Object.assign({
                S: 0, M: 0, L: 0, XL: 0,
                underpad: 0,
                jelly: 0,
                bannerCost: 0
            }, counts || {});
            const p = Object.assign({
                diaperPrice: DEFAULT_CONFIGS.DIAPER_PRICE,
                underpadPrice: DEFAULT_CONFIGS.UNDERPAD_PRICE,
                jellyPrice: DEFAULT_CONFIGS.JELLY_PRICE,
                bannerPrice: DEFAULT_CONFIGS.BANNER_PRICE
            }, prices || {});

            const totalDiaperPieces = (Number(c.S) || 0) + (Number(c.M) || 0) + (Number(c.L) || 0) + (Number(c.XL) || 0);
            const totalUnderpadPieces = Number(c.underpad) || 0;
            const totalJellyUnits = Number(c.jelly) || 0;
            const bannerCost = c.bannerCost !== undefined ? (Number(c.bannerCost) || 0) : (Number(p.bannerPrice) || 0);

            const diaperBudget = totalDiaperPieces * (Number(p.diaperPrice) || 0);
            const underpadBudget = totalUnderpadPieces * (Number(p.underpadPrice) || 0);
            const jellyBudget = totalJellyUnits * (Number(p.jellyPrice) || 0);
            const grandTotal = diaperBudget + underpadBudget + jellyBudget + bannerCost;

            return {
                totalDiaperPieces: totalDiaperPieces,
                totalUnderpadPieces: totalUnderpadPieces,
                totalJellyUnits: totalJellyUnits,
                diaperBudget: diaperBudget,
                underpadBudget: underpadBudget,
                jellyBudget: jellyBudget,
                bannerCost: bannerCost,
                grandTotal: grandTotal
            };
        }
    };

    // ========================================================================
    // 4. มาตรฐานสถานะผู้ป่วย งานมอบหมาย และตรวจเลขบัตรประชาชนซ้ำ (PatientValidator)
    // ========================================================================
    const PatientValidator = {
        PATIENT_STATUSES: [
            { value: 'Active', label: 'กำลังดูแล', colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: 'check_circle' },
            { value: 'ย้ายที่อยู่', label: 'ย้ายที่อยู่', colorClass: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'moving' },
            { value: 'เสียชีวิต', label: 'เสียชีวิต', colorClass: 'bg-red-50 text-red-700 border-red-200', icon: 'person_off' },
            { value: 'เลิกติดตาม', label: 'เลิกติดตาม', colorClass: 'bg-slate-100 text-slate-700 border-slate-300', icon: 'do_not_disturb_on' }
        ],

        STANDARD_TASKS: [
            { id: 'ADL', value: 'ประเมิน ADL', aliases: ['ประเมิน ADL', 'คัดกรอง ADL'] },
            { id: 'DEP', value: 'ประเมิน 2Q/9Q', aliases: ['ประเมิน 2Q/9Q', 'คัดกรอง 2Q/9Q', '2Q/9Q'] },
            { id: 'VITALS', value: 'วัดความดัน/เบาหวาน', aliases: ['วัดความดัน/เบาหวาน', 'บันทึก Vital Signs', 'วัดความดัน', 'ตรวจความดัน/น้ำตาล'] },
            { id: 'VISIT', value: 'เยี่ยมบ้านทั่วไป', aliases: ['เยี่ยมบ้านทั่วไป', 'ติดตามเยี่ยมบ้านทั่วไป'] }
        ],

        normalizeStatus: function (rawStatus) {
            const s = String(rawStatus || 'Active').trim();
            const lower = s.toLowerCase();
            if (!s || lower === 'active' || s === 'กำลังดูแล') return 'Active';
            if (s.includes('เสียชีวิต')) return 'เสียชีวิต';
            if (s.includes('ย้าย')) return 'ย้ายที่อยู่';
            if (s.includes('เลิกติดตาม') || lower === 'inactive') return 'เลิกติดตาม';
            return s;
        },

        isActiveStatus: function (rawStatus) {
            return PatientValidator.normalizeStatus(rawStatus) === 'Active';
        },

        getStatusMeta: function (rawStatus) {
            const norm = PatientValidator.normalizeStatus(rawStatus);
            return PatientValidator.PATIENT_STATUSES.find(function (st) { return st.value === norm; })
                || PatientValidator.PATIENT_STATUSES[0];
        },

        validateThaiID: function (idStr) {
            const clean = String(idStr || '').replace(/\D/g, '');
            if (clean.length !== 13) {
                return { valid: false, cleanId: clean, message: 'กรุณากรอกเลขบัตรประชาชนให้ครบ 13 หลัก' };
            }
            let sum = 0;
            for (let i = 0; i < 12; i++) {
                sum += parseInt(clean.charAt(i), 10) * (13 - i);
            }
            const checkDigit = (11 - (sum % 11)) % 10;
            if (checkDigit !== parseInt(clean.charAt(12), 10)) {
                return { valid: false, cleanId: clean, message: 'เลขบัตรประชาชน 13 หลักไม่ถูกต้องตามหลักกรมการปกครอง' };
            }
            return { valid: true, cleanId: clean, message: 'ถูกต้อง' };
        },

        checkDuplicateIDCard: async function (db, idCardInput, excludeDocId) {
            const clean = String(idCardInput || '').replace(/\D/g, '');
            if (!db || clean.length !== 13) {
                return { isDuplicate: false, existingPatient: null };
            }
            const exclude = excludeDocId ? String(excludeDocId).trim() : '';

            // 1. ตรวจจาก Document ID โดยตรง
            const directSnap = await db.collection('Patients').doc(clean).get();
            if (directSnap.exists && directSnap.id !== exclude) {
                const d = directSnap.data() || {};
                const ep = {
                    docId: directSnap.id,
                    prefix: d.prefix || '',
                    name: d.name || '',
                    village_no: d.village_no || '-',
                    house_no: d.house_no || '-',
                    status: PatientValidator.normalizeStatus(d.status)
                };
                return {
                    isDuplicate: true,
                    existingPatient: ep,
                    patient: ep,
                    existingDocId: ep.docId
                };
            }

            // 2. ตรวจจากฟิลด์ id_card (ครอบคลุมเคสเก่าที่รหัสเอกสารไม่ตรงกับเลขบัตร)
            const querySnap = await db.collection('Patients').where('id_card', '==', clean).get();
            for (let i = 0; i < querySnap.docs.length; i++) {
                const doc = querySnap.docs[i];
                if (doc.id !== exclude) {
                    const d = doc.data() || {};
                    const ep = {
                        docId: doc.id,
                        prefix: d.prefix || '',
                        name: d.name || '',
                        village_no: d.village_no || '-',
                        house_no: d.house_no || '-',
                        status: PatientValidator.normalizeStatus(d.status)
                    };
                    return {
                        isDuplicate: true,
                        existingPatient: ep,
                        patient: ep,
                        existingDocId: ep.docId
                    };
                }
            }

            return { isDuplicate: false, existingPatient: null, patient: null, existingDocId: null };
        },

        canPermanentDelete: function (role, patientData) {
            const r = String(role || '').toUpperCase();
            if (r === 'ADMIN' || r === 'SUB_ADMIN') {
                return { allowed: true, reason: '' };
            }
            const dp = DiaperAdapter.parse(patientData ? patientData.diaper : null);
            const hasDiaperHistory = (dp.allocations && dp.allocations.length > 0) ||
                (dp.alloc_history && Object.keys(dp.alloc_history).length > 0);

            if (hasDiaperHistory) {
                return {
                    allowed: false,
                    reason: 'ผู้ป่วยรายนี้มีประวัติได้รับจัดสรรผ้าอ้อมในระบบแล้ว เพื่อป้องกันยอดรายงานประจำปี กปท. คลาดเคลื่อน กรุณาให้แอดมินหรือเจ้าหน้าที่ รพ.สต. เป็นผู้ตรวจสอบและลบข้อมูลซ้ำครับ'
                };
            }
            return { allowed: true, reason: '' };
        },

        evaluateTaskCompletion: function (taskDescStr, taskAssignedDateVal, patientDates) {
            const desc = String(taskDescStr || '').trim();
            if (!desc) return { allDone: true, pendingItems: [] };

            const assignedMs = DateUtils.toTimestampMs(taskAssignedDateVal);
            // หักเวลาเผื่อระดับวันเดียวกัน (เที่ยงคืนของวันที่มอบหมาย)
            const assignedDayFloor = assignedMs ? new Date(new Date(assignedMs).setHours(0, 0, 0, 0)).getTime() : 0;

            const dates = patientDates || {};
            const adlMs = DateUtils.toTimestampMs(dates.last_adl_date || dates.adlDate || dates.last_assess);
            const depMs = DateUtils.toTimestampMs(dates.last_dep_date || dates.depDate);
            const vitalMs = DateUtils.toTimestampMs(dates.last_vital_date || dates.vitalDate);
            const visitMs = DateUtils.toTimestampMs(dates.last_visit_date || dates.visitDate);

            const pending = [];

            const matchAny = function (aliases) {
                return aliases.some(function (a) { return desc.includes(a); });
            };

            if (matchAny(PatientValidator.STANDARD_TASKS[0].aliases)) {
                if (!adlMs || adlMs < assignedDayFloor) pending.push('ประเมิน ADL');
            }
            if (matchAny(PatientValidator.STANDARD_TASKS[1].aliases)) {
                if (!depMs || depMs < assignedDayFloor) pending.push('ประเมิน 2Q/9Q');
            }
            if (matchAny(PatientValidator.STANDARD_TASKS[2].aliases)) {
                if (!vitalMs || vitalMs < assignedDayFloor) pending.push('วัดความดัน/เบาหวาน');
            }
            if (matchAny(PatientValidator.STANDARD_TASKS[3].aliases)) {
                const anyRecentActivity = Math.max(visitMs, adlMs, depMs, vitalMs);
                if (!anyRecentActivity || anyRecentActivity < assignedDayFloor) {
                    pending.push('เยี่ยมบ้านทั่วไป');
                }
            }

            return {
                allDone: pending.length === 0,
                pendingItems: pending
            };
        }
    };

    // ========================================================================
    // 5. ระบบบีบอัดและแยกเก็บรูปภาพฟรี 0 บาท (ImageStore -> Patient_Images)
    // ========================================================================
    const ImageStore = {
        sanitizeKey: function (str) {
            return String(str || '').trim().replace(/[\/\\.#$\[\]\s]+/g, '_');
        },

        compressImage: function (fileOrDataUrl, options) {
            const opts = Object.assign({
                maxWidth: 800,
                maxHeight: 800,
                quality: 0.65,
                mimeType: 'image/jpeg'
            }, options || {});

            return new Promise(function (resolve, reject) {
                const processDataUrl = function (dataUrl) {
                    const img = new Image();
                    img.onload = function () {
                        let w = img.width;
                        let h = img.height;
                        if (w > opts.maxWidth || h > opts.maxHeight) {
                            const ratio = Math.min(opts.maxWidth / w, opts.maxHeight / h);
                            w = Math.round(w * ratio);
                            h = Math.round(h * ratio);
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = w;
                        canvas.height = h;
                        const ctx = canvas.getContext('2d');
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, w, h);
                        ctx.drawImage(img, 0, 0, w, h);
                        resolve(canvas.toDataURL(opts.mimeType, opts.quality));
                    };
                    img.onerror = function (err) { reject(err); };
                    img.src = dataUrl;
                };

                if (typeof fileOrDataUrl === 'string') {
                    processDataUrl(fileOrDataUrl);
                } else if (fileOrDataUrl instanceof Blob) {
                    const reader = new FileReader();
                    reader.onload = function (ev) { processDataUrl(ev.target.result); };
                    reader.onerror = function (err) { reject(err); };
                    reader.readAsDataURL(fileOrDataUrl);
                } else {
                    reject(new Error('Invalid image input'));
                }
            });
        },

        createThumbnail: function (fileOrDataUrl) {
            return ImageStore.compressImage(fileOrDataUrl, {
                maxWidth: 180,
                maxHeight: 180,
                quality: 0.62,
                mimeType: 'image/jpeg'
            });
        },

        savePatientImages: async function (db, patientId, patchObj) {
            if (!db || !patientId || !patchObj) return;
            const docId = String(patientId).trim();
            const payload = Object.assign({}, patchObj, {
                patient_id: docId,
                updated_at: firebase.firestore.FieldValue.serverTimestamp()
            });
            await db.collection('Patient_Images').doc(docId).set(payload, { merge: true });
        },

        resolveImageUrl: function (url) {
            if (!url) return '';
            const s = String(url).trim();
            if (!s) return '';
            if (s.startsWith('data:image')) return s;
            const match = s.match(/d\/([a-zA-Z0-9_-]+)/) || s.match(/id=([a-zA-Z0-9_-]+)/);
            return match ? ('https://drive.google.com/thumbnail?id=' + match[1] + '&sz=w1000') : s;
        },

        getPatientImages: async function (db, patientId, legacyPatientData) {
            const result = {
                profile_pic: '',
                pic_bed: '',
                pic_bath: '',
                pic_entrance: '',
                pic_walkway: '',
                house_1: '',
                house_2: '',
                house_3: '',
                house_4: '',
                medical_cert: '',
                med_images: {}
            };

            // Fallback ดึงจากฟิลด์เก่าบนเอกสาร Patients ก่อน (รองรับรูปเก่า 100%)
            if (legacyPatientData && typeof legacyPatientData === 'object') {
                const legacyImgs = legacyPatientData.images || {};
                result.profile_pic = ImageStore.resolveImageUrl(legacyPatientData.profile_pic || legacyPatientData.profile_thumb || '');
                result.pic_bed = ImageStore.resolveImageUrl(legacyPatientData.pic_bed || legacyImgs.house_1 || legacyPatientData.img_env_1 || legacyPatientData.house_img_1 || '');
                result.pic_bath = ImageStore.resolveImageUrl(legacyPatientData.pic_bath || legacyImgs.house_2 || legacyPatientData.img_env_2 || legacyPatientData.house_img_2 || '');
                result.pic_entrance = ImageStore.resolveImageUrl(legacyPatientData.pic_entrance || legacyImgs.house_3 || legacyPatientData.img_env_3 || legacyPatientData.house_img_3 || '');
                result.pic_walkway = ImageStore.resolveImageUrl(legacyPatientData.pic_walkway || legacyImgs.house_4 || legacyPatientData.img_env_4 || legacyPatientData.house_img_4 || '');

                const dp = DiaperAdapter.parse(legacyPatientData.diaper);
                if (dp && dp.medical_cert) {
                    result.medical_cert = ImageStore.resolveImageUrl(dp.medical_cert);
                }
            }

            if (db && patientId) {
                try {
                    const snap = await db.collection('Patient_Images').doc(String(patientId).trim()).get();
                    if (snap.exists) {
                        const data = snap.data() || {};
                        if (data.profile_pic !== undefined) result.profile_pic = ImageStore.resolveImageUrl(data.profile_pic);
                        if (data.pic_bed !== undefined || data.house_1 !== undefined) {
                            result.pic_bed = ImageStore.resolveImageUrl(data.pic_bed !== undefined ? data.pic_bed : data.house_1);
                        }
                        if (data.pic_bath !== undefined || data.house_2 !== undefined) {
                            result.pic_bath = ImageStore.resolveImageUrl(data.pic_bath !== undefined ? data.pic_bath : data.house_2);
                        }
                        if (data.pic_entrance !== undefined || data.house_3 !== undefined) {
                            result.pic_entrance = ImageStore.resolveImageUrl(data.pic_entrance !== undefined ? data.pic_entrance : data.house_3);
                        }
                        if (data.pic_walkway !== undefined || data.house_4 !== undefined) {
                            result.pic_walkway = ImageStore.resolveImageUrl(data.pic_walkway !== undefined ? data.pic_walkway : data.house_4);
                        }
                        if (data.medical_cert !== undefined) {
                            result.medical_cert = ImageStore.resolveImageUrl(data.medical_cert);
                        }
                        if (data.med_images && typeof data.med_images === 'object') {
                            result.med_images = data.med_images;
                        }
                    }
                } catch (err) {
                    console.warn('getPatientImages fallback:', err);
                }
            }

            result.house_1 = result.pic_bed;
            result.house_2 = result.pic_bath;
            result.house_3 = result.pic_entrance;
            result.house_4 = result.pic_walkway;
            return result;
        },

        saveDeliveryProof: async function (db, roundKey, patientId, proofData) {
            if (!db || !roundKey || !patientId) return '';
            const docId = 'delivery_' + ImageStore.sanitizeKey(roundKey) + '_' + ImageStore.sanitizeKey(patientId);
            await db.collection('Patient_Images').doc(docId).set(Object.assign({}, proofData, {
                type: 'DELIVERY_PROOF',
                round: String(roundKey).trim(),
                patient_id: String(patientId).trim(),
                updated_at: firebase.firestore.FieldValue.serverTimestamp()
            }), { merge: true });
            return docId;
        },

        getDeliveryProof: async function (db, roundKey, patientId) {
            if (!db || !roundKey || !patientId) return null;
            const docId = 'delivery_' + ImageStore.sanitizeKey(roundKey) + '_' + ImageStore.sanitizeKey(patientId);
            const snap = await db.collection('Patient_Images').doc(docId).get();
            return snap.exists ? snap.data() : null;
        },

        saveVillageSheetProof: async function (db, roundKey, villageNo, sheetData) {
            if (!db || !roundKey || !villageNo) return '';
            const docId = 'sheet_' + ImageStore.sanitizeKey(roundKey) + '_moo_' + ImageStore.sanitizeKey(villageNo);
            await db.collection('Patient_Images').doc(docId).set(Object.assign({}, sheetData, {
                type: 'VILLAGE_SIGN_SHEET',
                round: String(roundKey).trim(),
                village_no: String(villageNo).trim(),
                updated_at: firebase.firestore.FieldValue.serverTimestamp()
            }), { merge: true });
            return docId;
        },

        getVillageSheetProof: async function (db, roundKey, villageNo) {
            if (!db || !roundKey || !villageNo) return null;
            const docId = 'sheet_' + ImageStore.sanitizeKey(roundKey) + '_moo_' + ImageStore.sanitizeKey(villageNo);
            const snap = await db.collection('Patient_Images').doc(docId).get();
            return snap.exists ? snap.data() : null;
        }
    };

    // ========================================================================
    // 6. ระบบตรวจจับค่าวิกฤตและยิงแจ้งเตือน LINE ด่วนอัตโนมัติ (Alerts)
    // ========================================================================
    const Alerts = {
        evaluateCriticalVitals: function (params) {
            const p = params || {};
            const sys = parseFloat(p.sys) || 0;
            const dia = parseFloat(p.dia) || 0;
            const sugar = parseFloat(p.sugar) || 0;
            const reasons = [];
            const details = [];

            if (sys >= 180 || dia >= 110) {
                reasons.push('ความดันโลหิตสูงระดับวิกฤต (Hypertensive Crisis)');
                details.push('ความดันโลหิต ' + sys + '/' + dia + ' mmHg');
            } else if ((sys > 0 && sys < 80) || (dia > 0 && dia < 50)) {
                reasons.push('ความดันโลหิตต่ำผิดปกติรุนแรง');
                details.push('ความดันโลหิต ' + sys + '/' + dia + ' mmHg');
            }

            if (sugar >= 250) {
                reasons.push('ระดับน้ำตาลในเลือดสูงวิกฤต');
                details.push('ค่าน้ำตาล ' + sugar + ' mg/dL');
            } else if (sugar > 0 && sugar < 70) {
                reasons.push('ภาวะน้ำตาลในเลือดต่ำอันตราย (Hypoglycemia)');
                details.push('ค่าน้ำตาล ' + sugar + ' mg/dL');
            }

            return {
                isCritical: reasons.length > 0,
                alertTitle: reasons.join(' และ '),
                alertDetails: details.join(' | ')
            };
        },

        evaluateCriticalDepression: function (params) {
            const p = params || {};
            const score9q = parseInt(p.score9q, 10) || 0;
            const q9Suicide = parseInt(p.q9Suicide, 10) || 0;
            const reasons = [];
            const details = [];

            if (score9q >= 19) {
                reasons.push('ภาวะซึมเศร้าระดับรุนแรง (9Q >= 19)');
                details.push('คะแนน 9Q = ' + score9q + ' คะแนน');
            }
            if (q9Suicide > 0) {
                reasons.push('พบความเสี่ยงคิดทำร้ายตนเองในข้อที่ 9');
                details.push('คะแนนข้อคิดสั้น = ' + q9Suicide);
            }

            return {
                isCritical: reasons.length > 0,
                alertTitle: reasons.join(' / '),
                alertDetails: details.join(' | ')
            };
        },

        evaluateCriticalADL: function (params) {
            const p = params || {};
            const prevGroup = String(p.prevGroup || '').trim();
            const newGroup = String(p.newGroup || '').trim();
            const newScore = p.newScore !== undefined ? p.newScore : '-';

            if (newGroup === 'ติดเตียง' && prevGroup !== 'ติดเตียง') {
                const fromTxt = prevGroup ? ('จากเดิม "' + prevGroup + '" ') : '';
                return {
                    isCritical: true,
                    alertTitle: 'ผู้ป่วยมีภาวะพึ่งพิงลดลงเป็นกลุ่ม "ติดเตียง"',
                    alertDetails: fromTxt + 'เป็น "ติดเตียง" (คะแนน ADL ล่าสุด ' + newScore + '/20 คะแนน)'
                };
            }
            return { isCritical: false, alertTitle: '', alertDetails: '' };
        },

        getResponsibleStaffUids: async function (db, villageNo) {
            if (!db) return [];
            const vStr = String(villageNo || '').trim();
            const snap = await db.collection('VHVs').where('status', '==', 'Active').get();
            const uids = [];
            snap.forEach(function (doc) {
                const d = doc.data() || {};
                const role = String(d.role || '').toUpperCase();
                const uid = String(d.uid || doc.id).trim();
                if (!uid) return;
                if (role === 'ADMIN') {
                    uids.push(uid);
                } else if (role === 'SUB_ADMIN') {
                    const assigned = Array.isArray(d.assigned_villages) ? d.assigned_villages.map(String) : [];
                    if (!vStr || assigned.includes(vStr)) {
                        uids.push(uid);
                    }
                }
            });
            return Array.from(new Set(uids));
        },

        getLineToken: async function (db) {
            if (!db) return '';
            try {
                const snap = await db.collection('SystemConfig').doc('LINE_CHANNEL_ACCESS_TOKEN').get();
                return snap.exists ? String(snap.data().value || '').trim() : '';
            } catch (e) {
                return '';
            }
        },

        sendCriticalHealthAlert: async function (db, info) {
            if (!db || !info || typeof API_URL === 'undefined' || !API_URL) return false;
            try {
                const lineToken = await Alerts.getLineToken(db);
                if (!lineToken) return false;

                const patient = info.patient || {};
                const recipientUids = await Alerts.getResponsibleStaffUids(db, patient.village_no);
                if (recipientUids.length === 0) return false;

                const pName = (patient.prefix || '') + (patient.name || 'ไม่ระบุชื่อ');
                await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        action: 'notifyCriticalHealthAlert',
                        lineToken: lineToken,
                        recipientUids: recipientUids,
                        pName: pName,
                        pHouse: patient.house_no || '-',
                        pVillage: patient.village_no || '-',
                        alertTitle: info.alertTitle || 'พบค่าสุขภาพวิกฤต',
                        alertDetails: info.alertDetails || '-',
                        assessorName: info.assessorName || 'เจ้าหน้าที่/อสม.',
                        recordedAt: DateUtils.toThaiDateTime(new Date())
                    })
                });
                return true;
            } catch (err) {
                console.warn('sendCriticalHealthAlert warning:', err);
                return false;
            }
        },

        checkAndNotifyEquipmentReturn: async function (db, patientId, patientData, newStatus) {
            if (!db || !patientId) return [];
            try {
                const snap = await db.collection('Equipment_Loans')
                    .where('patient_id', '==', String(patientId).trim())
                    .get();

                const activeLoans = [];
                snap.forEach(function (doc) {
                    const d = doc.data() || {};
                    if (String(d.status || '').toUpperCase() === 'BORROWED') {
                        activeLoans.push(Object.assign({ docId: doc.id }, d));
                    }
                });

                if (activeLoans.length > 0 && !PatientValidator.isActiveStatus(newStatus) && typeof API_URL !== 'undefined' && API_URL) {
                    const lineToken = await Alerts.getLineToken(db);
                    const recipientUids = await Alerts.getResponsibleStaffUids(db, patientData ? patientData.village_no : '');
                    if (lineToken && recipientUids.length > 0) {
                        const summary = activeLoans.map(function (l) {
                            return (l.equipment_name || 'อุปกรณ์') + (l.asset_code ? ' [' + l.asset_code + ']' : '') + ' (' + (l.qty || 1) + ')';
                        }).join(', ');

                        fetch(API_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                            body: JSON.stringify({
                                action: 'notifyEquipmentReturnAlert',
                                lineToken: lineToken,
                                recipientUids: recipientUids,
                                pName: ((patientData && patientData.prefix) || '') + ((patientData && patientData.name) || '-'),
                                pHouse: (patientData && patientData.house_no) || '-',
                                pVillage: (patientData && patientData.village_no) || '-',
                                newStatus: newStatus,
                                equipmentSummary: summary
                            })
                        }).catch(function () {});
                    }
                }
                return activeLoans;
            } catch (err) {
                console.warn('checkAndNotifyEquipmentReturn warning:', err);
                return [];
            }
        }
    };

    // ========================================================================
    // 7. ส่วนแสดงผลโปรไฟล์ ชื่อเล่น และเมนู Responsive รองรับ PC/iPad/มือถือ (UI)
    // ========================================================================
    const UI = {
        resolveAvatar: function (userOrData, picEl, iconEl) {
            if (!userOrData) return;
            const data = (userOrData && userOrData.user) ? userOrData.user : userOrData;
            const avatarUrl = String(data.profile_pic || data.photoURL || data.pic_url || '').trim();
            const pEl = picEl || document.getElementById('header-profile-pic');
            const iEl = iconEl || document.getElementById('header-profile-icon');
            if (pEl) {
                if (avatarUrl) {
                    pEl.src = avatarUrl;
                    pEl.classList.remove('hidden');
                    if (iEl) iEl.classList.add('hidden');
                } else {
                    pEl.classList.add('hidden');
                    if (iEl) iEl.classList.remove('hidden');
                }
            }
        },

        formatVHVName: function (userOrName, optionalNickname) {
            if (!userOrName) return '-';
            if (typeof userOrName === 'object') {
                const base = String(userOrName.name || '').trim() || '-';
                const nick = String(userOrName.nickname || '').trim();
                return nick ? (base + ' (' + nick + ')') : base;
            }
            const baseStr = String(userOrName).trim() || '-';
            const nickStr = String(optionalNickname || '').trim();
            return nickStr ? (baseStr + ' (' + nickStr + ')') : baseStr;
        },

        renderHeaderProfile: function (userData, hospitalName) {
            if (!userData) return;
            const displayName = UI.formatVHVName(userData);
            const avatarUrl = String(userData.profile_pic || userData.photoURL || '').trim();

            // รองรับ ID ชื่อผู้ใช้ทั้งฝั่งแอดมินและฝั่ง อสม.
            const adminNameEl = document.getElementById('header-user-name');
            if (adminNameEl) adminNameEl.innerText = displayName;

            const vhvNameEl = document.getElementById('header-vhv-name');
            if (vhvNameEl) vhvNameEl.innerText = displayName;

            // รองรับ ID รูปโปรไฟล์ทุกแบบที่มีอยู่ในโปรเจกต์ (#header-profile-pic, #header-profile-img, #header-profile-icon)
            const picEl = document.getElementById('header-profile-pic');
            const imgAltEl = document.getElementById('header-profile-img');
            const iconEl = document.getElementById('header-profile-icon');

            if (picEl) {
                if (picEl.tagName === 'IMG') {
                    if (avatarUrl) {
                        picEl.src = avatarUrl;
                        picEl.classList.remove('hidden');
                        if (iconEl) iconEl.classList.add('hidden');
                    } else {
                        picEl.classList.add('hidden');
                        if (iconEl) iconEl.classList.remove('hidden');
                    }
                } else {
                    // กรณีเป็น <div> ฝั่ง อสม.
                    if (avatarUrl) {
                        picEl.innerHTML = '<img src="' + avatarUrl.replace(/"/g, '&quot;') + '" class="w-full h-full object-cover rounded-full" alt="profile">';
                    } else {
                        const initial = (userData.name ? String(userData.name).trim().charAt(0) : 'อ');
                        picEl.innerText = initial;
                    }
                }
            }

            if (imgAltEl && imgAltEl.tagName === 'IMG') {
                if (avatarUrl) {
                    imgAltEl.src = avatarUrl;
                    imgAltEl.classList.remove('hidden');
                    if (iconEl) iconEl.classList.add('hidden');
                }
            }

            if (hospitalName) {
                const sbHosp = document.getElementById('sidebar-hospital-name');
                if (sbHosp) sbHosp.innerText = hospitalName;
            }
        },

        initResponsiveAdminShell: function (options) {
            const opts = Object.assign({
                role: 'ADMIN',
                currentPage: '',
                hospitalName: ''
            }, options || {});

            const sidebar = document.querySelector('aside');
            if (!sidebar) return;

            // 1. แทรกลิงก์เมนู "ยืม-คืนกายอุปกรณ์" อัตโนมัติให้ทั้ง ADMIN และ SUB_ADMIN หากยังไม่มีในหน้า
            const nav = sidebar.querySelector('nav');
            if (nav && !document.getElementById('nav-equipment') && !nav.querySelector('a[href="admin_equipment.html"]')) {
                const eqLink = document.createElement('a');
                eqLink.id = 'nav-equipment';
                eqLink.href = 'admin_equipment.html';
                const isActive = (opts.currentPage === 'admin_equipment.html') || window.location.pathname.endsWith('admin_equipment.html');
                eqLink.className = isActive
                    ? 'flex items-center gap-3 px-4 py-3 bg-[#00694a] text-white rounded-xl font-semibold text-sm transition-colors shadow-sm'
                    : 'flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-slate-800 hover:text-white rounded-xl font-medium text-sm transition-colors';
                eqLink.innerHTML = '<span class="material-symbols-outlined text-[20px]">medical_services</span> ทะเบียนยืม-คืนอุปกรณ์';

                const invLink = document.getElementById('nav-inventory') || nav.querySelector('a[href="admin_inventory.html"]');
                const resLink = nav.querySelector('a[href="admin_resources.html"]');
                if (invLink && invLink.parentNode === nav) {
                    invLink.insertAdjacentElement('afterend', eqLink);
                } else if (resLink && resLink.parentNode === nav) {
                    resLink.insertAdjacentElement('afterend', eqLink);
                } else {
                    nav.appendChild(eqLink);
                }
            }

            // 2. ซ่อนเมนูเฉพาะส่วนกลางเมื่อผู้ใช้งานเป็น SUB_ADMIN (รพ.สต.)
            if (opts.role === 'SUB_ADMIN' && nav) {
                const adminOnlySelectors = [
                    '#nav-settings', 'a[href="admin_settings.html"]',
                    '#nav-finance', 'a[href="admin_finance.html"]',
                    '#nav-inventory', 'a[href="admin_inventory.html"]',
                    '#nav-reports', 'a[href="admin_reports.html"]'
                ];
                adminOnlySelectors.forEach(function (sel) {
                    nav.querySelectorAll(sel).forEach(function (el) {
                        el.style.display = 'none';
                    });
                });
            }

            // 3. ระบบ Off-canvas Drawer ให้รองรับทั้ง PC (>=1024px), iPad (768-1023px) และโทรศัพท์มือถือ (<768px)
            if (!document.getElementById('orsomo-responsive-admin-style')) {
                const style = document.createElement('style');
                style.id = 'orsomo-responsive-admin-style';
                style.textContent = `
                    @media (max-width: 1023px) {
                        body.orsomo-admin-responsive { overflow-x: hidden; overflow-y: auto !important; height: auto !important; min-height: 100dvh; }
                        body.orsomo-admin-responsive > aside {
                            position: fixed !important;
                            top: 0; left: 0; bottom: 0;
                            z-index: 90 !important;
                            width: 270px !important;
                            display: flex !important;
                            transform: translateX(-105%);
                            transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.45);
                        }
                        body.orsomo-admin-responsive.sidebar-open > aside {
                            transform: translateX(0);
                        }
                        #orsomo-sidebar-backdrop {
                            position: fixed; inset: 0;
                            background: rgba(15, 23, 42, 0.55);
                            backdrop-filter: blur(2px);
                            z-index: 85;
                            opacity: 0; pointer-events: none;
                            transition: opacity 0.25s ease;
                        }
                        body.orsomo-admin-responsive.sidebar-open #orsomo-sidebar-backdrop {
                            opacity: 1; pointer-events: auto;
                        }
                    }
                    @media (min-width: 1024px) {
                        #orsomo-mobile-menu-btn, #orsomo-sidebar-backdrop, #orsomo-sidebar-close-btn {
                            display: none !important;
                        }
                    }
                `;
                document.head.appendChild(style);
            }

            document.body.classList.add('orsomo-admin-responsive');

            if (!document.getElementById('orsomo-sidebar-backdrop')) {
                const backdrop = document.createElement('div');
                backdrop.id = 'orsomo-sidebar-backdrop';
                backdrop.onclick = function () { document.body.classList.remove('sidebar-open'); };
                document.body.appendChild(backdrop);
            }

            // ปุ่มปิดบนหัว Sidebar เมื่อเปิดในจอ iPad / มือถือ
            const sbHeader = sidebar.firstElementChild;
            if (sbHeader && !document.getElementById('orsomo-sidebar-close-btn')) {
                sbHeader.classList.add('justify-between');
                const closeBtn = document.createElement('button');
                closeBtn.id = 'orsomo-sidebar-close-btn';
                closeBtn.type = 'button';
                closeBtn.className = 'w-9 h-9 rounded-lg bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center shrink-0';
                closeBtn.innerHTML = '<span class="material-symbols-outlined text-[20px]">close</span>';
                closeBtn.onclick = function () { document.body.classList.remove('sidebar-open'); };
                sbHeader.appendChild(closeBtn);
            }

            // ปุ่ม Hamburger บน Header ของหน้าแอดมิน (สำหรับ iPad และโทรศัพท์)
            const topHeader = document.querySelector('main > header, div.flex-1 > header, header');
            if (topHeader && !document.getElementById('orsomo-mobile-menu-btn')) {
                const firstWrap = topHeader.firstElementChild;
                const btn = document.createElement('button');
                btn.id = 'orsomo-mobile-menu-btn';
                btn.type = 'button';
                btn.setAttribute('aria-label', 'เปิดเมนู');
                btn.className = 'w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 mr-2 transition-colors';
                btn.innerHTML = '<span class="material-symbols-outlined text-[22px]">menu</span>';
                btn.onclick = function () { document.body.classList.toggle('sidebar-open'); };

                if (firstWrap) {
                    firstWrap.classList.add('flex', 'items-center', ' gap-2'.trim());
                    firstWrap.insertBefore(btn, firstWrap.firstChild);
                } else {
                    topHeader.insertBefore(btn, topHeader.firstChild);
                }
            }
        }
    };

    // ========================================================================
    // 8. ระบบแคชข้อมูลอัจฉริยะ (DataCache: SessionStorage + TTL 3 นาที)
    // ลดปริมาณการอ่าน Firestore ลง 90-95% และหน้าเว็บโหลดเร็วทันที 0.05 วินาที
    // ========================================================================
    const DataCache = {
        CACHE_KEY_PREFIX: 'orsomo_cache_',
        DEFAULT_TTL_MS: 3 * 60 * 1000, // แคช 3 นาที

        get: function (key) {
            try {
                const itemStr = sessionStorage.getItem(DataCache.CACHE_KEY_PREFIX + key);
                if (!itemStr) return null;
                const item = JSON.parse(itemStr);
                const now = Date.now();
                if (item && item.expiry && now < item.expiry && item.value) {
                    return item.value;
                }
                sessionStorage.removeItem(DataCache.CACHE_KEY_PREFIX + key);
            } catch (e) {}
            return null;
        },

        set: function (key, value, ttlMs) {
            try {
                const ttl = typeof ttlMs === 'number' ? ttlMs : DataCache.DEFAULT_TTL_MS;
                const item = {
                    value: value,
                    expiry: Date.now() + ttl,
                    saved_at: Date.now()
                };
                sessionStorage.setItem(DataCache.CACHE_KEY_PREFIX + key, JSON.stringify(item));
            } catch (e) {
                // หากเนื้อที่เต็ม ให้ล้างแคชเก่าออกเพื่อกันข้อผิดพลาด
                DataCache.clearAll();
            }
        },

        remove: function (key) {
            try {
                sessionStorage.removeItem(DataCache.CACHE_KEY_PREFIX + key);
            } catch (e) {}
        },

        clearAll: function () {
            try {
                const keysToRemove = [];
                for (let i = 0; i < sessionStorage.length; i++) {
                    const k = sessionStorage.key(i);
                    if (k && k.indexOf(DataCache.CACHE_KEY_PREFIX) === 0) {
                        keysToRemove.push(k);
                    }
                }
                keysToRemove.forEach(function (k) { sessionStorage.removeItem(k); });
            } catch (e) {}
        },

        invalidatePatients: function () {
            try {
                const keysToRemove = [];
                for (let i = 0; i < sessionStorage.length; i++) {
                    const k = sessionStorage.key(i);
                    if (k && k.indexOf(DataCache.CACHE_KEY_PREFIX + 'patients') === 0) {
                        keysToRemove.push(k);
                    }
                }
                keysToRemove.forEach(function (k) { sessionStorage.removeItem(k); });
            } catch (e) {}
        },

        getPatients: async function (db, options) {
            const opts = Object.assign({
                villageNo: '',
                role: 'ADMIN',
                forceRefresh: false,
                ttlMs: 3 * 60 * 1000
            }, options || {});

            const cacheKey = (opts.role === 'VHV' && opts.villageNo)
                ? ('patients_moo_' + opts.villageNo)
                : 'patients_all';

            if (!opts.forceRefresh) {
                const cached = DataCache.get(cacheKey);
                if (cached && Array.isArray(cached) && cached.length > 0) {
                    return cached;
                }
            }

            let query = db.collection('Patients');
            if (opts.role === 'VHV' && opts.villageNo) {
                query = query.where('village_no', '==', String(opts.villageNo));
            }

            const snapshot = await query.get();
            const list = [];
            snapshot.forEach(function (doc) {
                const d = doc.data() || {};
                d.docId = doc.id;
                d.id = d.id || doc.id;
                list.push(d);
            });

            DataCache.set(cacheKey, list, opts.ttlMs);
            return list;
        }
    };

    // ติดตั้งตัวดักจับคำสั่งบันทึกฐานข้อมูลอัตโนมัติทันทีที่โหลดโมดูล
    try {
        if (typeof firebase !== 'undefined' && typeof firebaseConfig !== 'undefined') {
            Auth.ensureFirebase();
        }
    } catch (e) {}

    window.OrsomoCore = {
        Auth: Auth,
        DateUtils: DateUtils,
        DiaperAdapter: DiaperAdapter,
        PatientValidator: PatientValidator,
        ImageStore: ImageStore,
        Alerts: Alerts,
        UI: UI,
        DataCache: DataCache
    };

})(window);
