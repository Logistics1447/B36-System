# 🔧 إعداد البيانات - B36 v34

---

## 📋 البيانات المطلوبة في Firestore

### 1️⃣ **Collection: users**

يجب إنشاء المستخدمين التالية:

#### **Admin (المدير)**
```
Document ID: admin
Fields:
  - fullName: "المدير العام"
  - role: "يوزر_المدير_العام"
  - pass: "1234"
```

#### **External Counter (العداد الخارجي)**
```
Document ID: external1
Fields:
  - fullName: "عداد خارجي 1"
  - role: "يوزر_العداد_الخارجي"
  - pass: "1234"
```

#### **Waiting Hall User (قاعة انتظار)**
```
Document ID: waiting1
Fields:
  - fullName: "قاعة الانتظار 1"
  - role: "يوزر_قاعة_انتظار"
  - assignedHallId: "hall_waiting_1"
  - pass: "1234"
```

#### **Interview Hall User (قاعة مقابلات)**
```
Document ID: interview1
Fields:
  - fullName: "قاعة المقابلات 1"
  - role: "يوزر_قاعة_مقابلات"
  - assignedHallId: "hall_interview_1"
  - pass: "1234"
```

---

### 2️⃣ **Collection: halls**

#### **قاعة انتظار 1**
```
Document ID: hall_waiting_1
Fields:
  - name: "قاعة الانتظار 1"
  - type: "انتظار"
  - capacity: 100
  - current: 0
  - active: true
```

#### **قاعة انتظار 2**
```
Document ID: hall_waiting_2
Fields:
  - name: "قاعة الانتظار 2"
  - type: "انتظار"
  - capacity: 150
  - current: 0
  - active: true
```

#### **قاعة مقابلات 1**
```
Document ID: hall_interview_1
Fields:
  - name: "قاعة المقابلات 1"
  - type: "مقابلات"
  - capacity: 50
  - current: 0
  - active: true
```

#### **قاعة مقابلات 2**
```
Document ID: hall_interview_2
Fields:
  - name: "قاعة المقابلات 2"
  - type: "مقابلات"
  - capacity: 30
  - current: 0
  - active: true
```

---

### 3️⃣ **Collection: settings**

#### **Global Config**
```
Document ID: global_config
Fields:
  - outdoor_queue: 0
  - daily_target: 500
  - served_count: 0
```

---

## 🚀 خطوات الإعداد السريعة

### الطريقة 1: يدوياً من Firebase Console

1. افتح [Firebase Console](https://console.firebase.google.com/)
2. اختر مشروعك: **b36-hall-mgmt**
3. اذهب إلى **Firestore Database**
4. اضغط **Start collection**
5. اسم الـ Collection: `users`
6. اضغط **Add document**
7. Document ID: `admin`
8. أضف الـ Fields كما هو موضح أعلاه
9. كرر للمستخدمين الآخرين
10. كرر نفس الخطوات للـ `halls` و `settings`

---

### الطريقة 2: باستخدام Console في المتصفح

بعد تسجيل الدخول كـ Admin، افتح Console (F12) وانسخ:

```javascript
// إنشاء المستخدمين
await setDoc(doc(db, 'users', 'admin'), {
    fullName: 'المدير العام',
    role: 'يوزر_المدير_العام',
    pass: '1234'
});

await setDoc(doc(db, 'users', 'external1'), {
    fullName: 'عداد خارجي 1',
    role: 'يوزر_العداد_الخارجي',
    pass: '1234'
});

await setDoc(doc(db, 'users', 'waiting1'), {
    fullName: 'قاعة الانتظار 1',
    role: 'يوزر_قاعة_انتظار',
    assignedHallId: 'hall_waiting_1',
    pass: '1234'
});

await setDoc(doc(db, 'users', 'interview1'), {
    fullName: 'قاعة المقابلات 1',
    role: 'يوزر_قاعة_مقابلات',
    assignedHallId: 'hall_interview_1',
    pass: '1234'
});

// إنشاء القاعات
await setDoc(doc(db, 'halls', 'hall_waiting_1'), {
    name: 'قاعة الانتظار 1',
    type: 'انتظار',
    capacity: 100,
    current: 0,
    active: true
});

await setDoc(doc(db, 'halls', 'hall_waiting_2'), {
    name: 'قاعة الانتظار 2',
    type: 'انتظار',
    capacity: 150,
    current: 0,
    active: true
});

await setDoc(doc(db, 'halls', 'hall_interview_1'), {
    name: 'قاعة المقابلات 1',
    type: 'مقابلات',
    capacity: 50,
    current: 0,
    active: true
});

await setDoc(doc(db, 'halls', 'hall_interview_2'), {
    name: 'قاعة المقابلات 2',
    type: 'مقابلات',
    capacity: 30,
    current: 0,
    active: true
});

// إنشاء الإعدادات
await setDoc(doc(db, 'settings', 'global_config'), {
    outdoor_queue: 0,
    daily_target: 500,
    served_count: 0
});

console.log('✅ تم إنشاء جميع البيانات بنجاح!');
```

---

## ✅ التحقق من البيانات

بعد الإنشاء، تحقق من:

1. **Users:**
   - ✅ admin
   - ✅ external1
   - ✅ waiting1
   - ✅ interview1

2. **Halls:**
   - ✅ hall_waiting_1
   - ✅ hall_waiting_2
   - ✅ hall_interview_1
   - ✅ hall_interview_2

3. **Settings:**
   - ✅ global_config

---

## 🎯 بيانات تسجيل الدخول

### للتجربة:

```
Admin:
Username: admin
Password: 1234

External Counter:
Username: external1
Password: 1234

Waiting Hall:
Username: waiting1
Password: 1234

Interview Hall:
Username: interview1
Password: 1234
```

---

**جاهز للاستخدام!** 🚀
