importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

// 🌟 จำเป็นต้องใส่ firebaseConfig ซ้ำในไฟล์นี้ด้วย 
// เนื่องจาก Service Worker ทำงานเบื้องหลัง ไม่สามารถดึงตัวแปรจากไฟล์ config.js ตรงๆ ได้ครับ
const firebaseConfig = {
  apiKey: "AIzaSyBb9rmXVT9A3TFlNHeUu2pp9o8li2WQdik",
  authDomain: "orsomo-smart.firebaseapp.com",
  projectId: "orsomo-smart",
  storageBucket: "orsomo-smart.firebasestorage.app",
  messagingSenderId: "1090261739518",
  appId: "1:1090261739518:web:9e7c9eef5a1ad4f3ad82af"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// 🌟 ฟังก์ชันนี้จะทำงานเมื่อผู้ใช้ปิดแอป หรือพับแอปไปเล่นหน้าอื่น
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || payload.data?.title || 'อสม.สามารถ แจ้งเตือน';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || 'คุณมีข้อความใหม่',
    icon: 'https://cdn-icons-png.flaticon.com/512/3063/3063116.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/3063/3063116.png',
    data: { url: payload.data?.click_action || '/index.html?openExternalBrowser=1' }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// 🌟 เมื่อผู้ใช้แตะที่แบนเนอร์แจ้งเตือน ให้พาเข้าแอป
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i];
                if (client.url.includes('orsomo-smart') && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(event.notification.data.url);
            }
        })
    );
});
