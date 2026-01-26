# 📋 دليل التنفيذ التفصيلي - B36 v32 RBAC

هذا الملف يشرح التنفيذ الفني بالتفصيل

---

## 🏗️ البنية المعمارية

### 1. الأدوار (Roles)

```javascript
const ROLES = {
    ADMIN: 'يوزر_المدير_العام',
    EXTERNAL_SUPERVISOR: 'يوزر_المنظم_الخارجي_مشرف',
    EXTERNAL_REGULAR: 'يوزر_المنظم_الخارجي_عادي',
    INTERNAL_SUPERVISOR: 'يوزر_المنظم_الداخلي_مشرف_المبنى',
    INTERNAL_REGULAR: 'يوزر_المنظم_الداخلي_عادي',
    VIEWER: 'يوزر_العرض'
};
```

**ملاحظة مهمة:**
- **منظم المسار** ليس دوراً منفصلاً
- هو `INTERNAL_REGULAR` مع `isPathOrganizer: true`
- هذا يسمح بمرونة أكثر في التعيين

---

### 2. State Machine

```javascript
const REQUEST_STATES = {
    DRAFT: 'draft',           // مسودة (اختياري - للمستقبل)
    PENDING: 'pending',       // قيد الانتظار
    ACCEPTED: 'accepted',     // مقبول
    REJECTED: 'rejected',     // مرفوض (نهائي)
    IN_TRANSIT: 'in_transit', // في الطريق (فقط لـ Waiting→Interview)
    ARRIVED: 'arrived',       // وصل (بعد المصادقة)
    CLOSED: 'closed'          // مغلق (نهائي)
};

const VALID_TRANSITIONS = {
    draft: ['pending'],
    pending: ['accepted', 'rejected'],
    accepted: ['in_transit', 'arrived'],
    rejected: [],  // terminal
    in_transit: ['arrived'],
    arrived: ['closed'],
    closed: []  // terminal
};
```

**الانتقالات:**
- `Draft → Pending`: إنشاء الطلب
- `Pending → Accepted`: قبول الطلب
- `Pending → Rejected`: رفض الطلب (نهاية)
- `Accepted → InTransit`: بدء النقل (منظم المسار)
- `Accepted → Arrived`: المصادقة المباشرة (بدون InTransit)
- `InTransit → Arrived`: المصادقة بعد النقل
- `Arrived → Closed`: إغلاق الطلب

---

### 3. نظام المصادقة (Confirmation)

```javascript
{
    requestId: 'req_001',
    requestedCount: 50,      // العدد المطلوب
    actualCount: 48,         // العدد الفعلي المستلم
    difference: -2,          // actualCount - requestedCount
    differenceType: 'ناقص', // مطابق | ناقص | زيادة
    comment: 'شخصان لم يصلا',
    confirmedBy: 'user_id',
    confirmedByName: 'الاسم',
    confirmedAt: timestamp
}
```

**الحسابات:**
```javascript
difference = actualCount - requestedCount;

if (difference === 0) differenceType = 'مطابق';
else if (difference < 0) differenceType = 'ناقص';
else differenceType = 'زيادة';
```

**التحديثات التلقائية:**
```javascript
// عند المصادقة:
1. outdoor_queue -= actualCount (إذا من الخارج)
2. from_hall -= requestedCount (إذا من قاعة)
3. to_hall += actualCount
4. missing_count += Math.abs(difference) (إذا ناقص)
```

---

## 🔄 Workflows التفصيلية

### Workflow A: Outside → Waiting

```javascript
// 1. إنشاء الطلب (External Supervisor)
await createTransferRequest(
    toHallId,      // القاعة المستهدفة
    count,         // العدد
    'outside_to_waiting',
    null,          // fromHallId (null للخارج)
    null           // assignedPathOrganizer (null)
);

// 2. قبول/رفض (Internal Regular - مسؤول القاعة)
await acceptRequest(requestId);
// أو
await rejectRequest(requestId); // مع سبب إلزامي

// 3. المصادقة
await showConfirmationModal(requestId);
// → يدخل العدد الفعلي
// → النظام يحسب الفرق
// → تعليق إلزامي إذا فيه فرق

// 4. النظام ينفذ التحديثات تلقائياً
```

### Workflow B: Waiting → Interview (via Path Organizer)

```javascript
// 1. إنشاء الطلب (Internal Supervisor)
await createTransferRequest(
    toHallId,              // قاعة المقابلات
    count,
    'waiting_to_interview',
    fromHallId,            // قاعة الانتظار
    pathOrganizerUserId    // منظم المسار
);

// 2. بدء النقل (منظم المسار)
await startTransit(requestId);
// → Status: IN_TRANSIT
// → from_hall -= count (فوراً)

// 3. المصادقة (مسؤول قاعة المقابلات)
await showConfirmationModal(requestId);
// → to_hall += actualCount

// 4. إغلاق (اختياري)
await closeRequest(requestId);
```

### Workflow C: Interview → Interview (Rebalancing)

```javascript
// 1. إنشاء طلب إعادة توزيع (Internal Supervisor)
await createTransferRequest(
    toInterviewHallId,
    count,
    'interview_to_interview',
    fromInterviewHallId,
    null
);

// 2. قبول (مسؤول القاعة المستهدفة)
await acceptRequest(requestId);

// 3. المصادقة
await showConfirmationModal(requestId);
// → from_hall -= requestedCount
// → to_hall += actualCount
```

---

## 🛡️ Security Implementation

### 1. Permission Checking

```javascript
function hasPermission(permission) {
    if (!currentUser) return false;
    const rolePermissions = ROLE_PERMISSIONS[currentUser.role] || [];
    return rolePermissions.includes(permission);
}

// الاستخدام في كل دالة:
if (!hasPermission(PERMISSIONS.ACCEPT_REQUEST)) {
    showToast('ليس لديك صلاحية', 'error');
    return;
}
```

### 2. Hall Assignment Checking

```javascript
// للـ Internal Regular - التحقق أنه مسؤول عن القاعة
if (currentUser.role === ROLES.INTERNAL_REGULAR) {
    if (currentUser.assignedHallId !== request.toId) {
        showToast('يمكنك قبول طلبات قاعتك فقط', 'error');
        return;
    }
}
```

### 3. Path Organizer Checking

```javascript
// التحقق أنه منظم مسار
if (!currentUser.isPathOrganizer) {
    showToast('هذه العملية لمنظم المسار فقط', 'error');
    return;
}

// التحقق أن الطلب معين له
if (req.assignedPathOrganizer !== currentUser.id) {
    showToast('هذا الطلب ليس معيناً لك', 'error');
    return;
}
```

### 4. State Machine Validation

```javascript
function validateStateTransition(currentState, newState) {
    const validNextStates = VALID_TRANSITIONS[currentState] || [];
    if (!validNextStates.includes(newState)) {
        throw new Error(`انتقال غير صحيح`);
    }
    return true;
}

// الاستخدام:
try {
    validateStateTransition(request.status, REQUEST_STATES.ACCEPTED);
    // ... تنفيذ العملية
} catch (e) {
    showToast(e.message, 'error');
}
```

---

## 📊 Data Structure

### TransferRequest

```javascript
{
    id: 'req_001',
    type: 'outside_to_waiting', // أو waiting_to_interview أو interview_to_interview
    
    // المصدر
    fromType: 'outside',  // أو waiting أو interview
    fromId: null,         // أو hallId
    
    // الهدف
    toType: 'waiting',    // أو interview
    toId: 'hall_1',
    
    // الأعداد
    requestedCount: 50,
    actualCount: null,    // يتم ملؤه عند المصادقة
    difference: null,     // actualCount - requestedCount
    
    // الحالة
    status: 'pending',
    
    // الإنشاء
    createdBy: 'user_id',
    createdByName: 'الاسم',
    createdByRole: 'الدور',
    createdAt: timestamp,
    
    // القبول/الرفض
    acceptedBy: null,
    acceptedByName: null,
    acceptedAt: null,
    rejectedBy: null,
    rejectedByName: null,
    rejectedAt: null,
    rejectionReason: null,
    
    // النقل (للـ Waiting→Interview)
    assignedPathOrganizer: null,
    inTransitBy: null,
    inTransitByName: null,
    inTransitAt: null,
    
    // المصادقة
    confirmationId: null, // reference to confirmations collection
    arrivedAt: null,
    
    // الإغلاق
    closedBy: null,
    closedByName: null,
    closedAt: null
}
```

---

## 🔄 Real-time Updates

```javascript
function listenToData() {
    // Halls
    onSnapshot(collection(db, "halls"), (s) => {
        halls = [];
        s.forEach(d => halls.push({ id: d.id, ...d.data() }));
        updateKPIs();
        renderCurrentView();
    });
    
    // Global Stats
    onSnapshot(doc(db, "settings", "global_config"), (s) => {
        if (s.exists()) {
            const d = s.data();
            globalStats = { 
                served_count: d.served_count || 0, 
                outdoor_queue: d.outdoor_queue || 0,
                missing_count: d.missing_count || 0
            };
            updateKPIs();
        }
    });
    
    // Users (Admin only)
    if (hasPermission(PERMISSIONS.ASSIGN_USERS)) {
        onSnapshot(collection(db, "users"), (s) => {
            users = [];
            s.forEach(d => users.push({ id: d.id, ...d.data() }));
            renderCurrentView();
        });
    }
    
    // Transfer Requests (filtered by role)
    let requestsQuery = null;
    
    if (currentUser.role === ROLES.ADMIN || currentUser.role === ROLES.INTERNAL_SUPERVISOR) {
        // يرون كل الطلبات
        requestsQuery = query(collection(db, "transfer_requests"), orderBy("createdAt", "desc"));
    } else if (currentUser.role === ROLES.EXTERNAL_SUPERVISOR) {
        // يرون طلباتهم فقط
        requestsQuery = query(
            collection(db, "transfer_requests"),
            where("createdBy", "==", currentUser.id),
            orderBy("createdAt", "desc")
        );
    } else if (currentUser.role === ROLES.INTERNAL_REGULAR) {
        // خيارات متعددة:
        if (currentUser.isPathOrganizer) {
            // إذا منظم مسار: الطلبات المعينة له + طلبات قاعته
            // (يحتاج query مركب أو multiple queries)
        } else {
            // طلبات قاعته فقط
            requestsQuery = query(
                collection(db, "transfer_requests"),
                where("toId", "==", currentUser.assignedHallId),
                orderBy("createdAt", "desc")
            );
        }
    }
    
    if (requestsQuery) {
        onSnapshot(requestsQuery, (s) => {
            transferRequests = [];
            s.forEach(d => transferRequests.push({ id: d.id, ...d.data() }));
            renderCurrentView();
        });
    }
    
    // Confirmations (Admin only)
    if (hasPermission(PERMISSIONS.VIEW_AUDIT_LOG)) {
        onSnapshot(collection(db, "confirmations"), (s) => {
            confirmations = [];
            s.forEach(d => confirmations.push({ id: d.id, ...d.data() }));
        });
    }
}
```

---

## 📝 Audit Logging

```javascript
async function logActivity(
    action,      // 'CREATE_REQUEST', 'ACCEPT_REQUEST', etc.
    details,     // وصف نصي
    entityType,  // 'transfer_request', 'hall', 'user'
    entityId,    // id الكيان
    before,      // الحالة قبل
    after,       // الحالة بعد
    reason       // سبب (اختياري)
) {
    try {
        await addDoc(collection(db, "audit_logs"), {
            userId: currentUser.id,
            userRole: currentUser.role,
            userName: currentUser.fullName || currentUser.id,
            action: action,
            details: details,
            entityType: entityType,
            entityId: entityId,
            before: before,
            after: after,
            reason: reason,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.error('Log error:', e);
    }
}

// مثال:
await logActivity(
    'ACCEPT_REQUEST',
    `قبول طلب نقل 50 مرشح`,
    'transfer_request',
    requestId,
    { status: 'pending' },
    { status: 'accepted' },
    null
);
```

---

## 🎨 UI Components

### 1. Confirmation Modal

```javascript
window.showConfirmationModal = async (requestId) => {
    // 1. التحقق من الصلاحيات
    // 2. عرض نموذج SweetAlert2
    // 3. حساب الفرق تلقائياً
    // 4. طلب تعليق إلزامي إذا فيه فرق
    // 5. تنفيذ المصادقة
};
```

### 2. KPIs Display

```javascript
function updateKPIs() {
    // حساب الإحصائيات
    // عرض حسب الدور:
    // - Admin/Internal Supervisor/Viewer: 5 KPIs
    // - External Supervisor/Regular: 1 KPI (خارجاً)
    // - Internal Regular: 2 KPIs (انتظار + مقابلات)
}
```

---

## 🚀 Performance Optimization

### 1. Batch Operations

```javascript
const batch = writeBatch(db);

batch.update(doc(db, "halls", fromHallId), { current: increment(-count) });
batch.update(doc(db, "halls", toHallId), { current: increment(count) });
batch.update(doc(db, "settings", "global_config"), { missing_count: increment(diff) });

await batch.commit();
```

### 2. Efficient Queries

```javascript
// استخدام where + orderBy
query(
    collection(db, "transfer_requests"),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc"),
    limit(50)
);
```

---

## 📌 ملاحظات مهمة

1. **منظم المسار**:
   - ليس دوراً منفصلاً
   - هو INTERNAL_REGULAR مع isPathOrganizer=true
   - يمكن تعيين/إلغاء التعيين ديناميكياً

2. **InTransit**:
   - مستخدم فقط في Waiting→Interview
   - اختياري: يمكن القفز من Accepted مباشرة إلى Arrived

3. **Missing Count**:
   - يزيد فقط عند difference < 0
   - يُحفظ عالمياً في global_config
   - يظهر في KPIs

4. **Confirmation**:
   - إلزامي لكل الطلبات
   - التعليق إلزامي فقط عند وجود فرق
   - يُحفظ في collection منفصلة

---

**B36 v32 - RBAC Complete Implementation Guide** 🚀
