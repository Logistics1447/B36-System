# تصميم نموذج البيانات والـ Schema المحدث (Firestore)

هذا المستند يوضح التصميم النهائي لجداول (Collections) Firestore بناءً على المتطلبات الجديدة. تم تصميم الجداول لضمان الكفاءة، الأمان، وقابلية التوسع.

---

### 1. Halls Collection

يخزن معلومات عن كل قاعة.

**Path:** `/halls/{hallId}`

**Schema:**
```json
{
  "name": "string",
  "type": "'waiting' | 'interview'",
  "capacity": "number",
  "currentCount": "number",
  "draftCount": "number",
  "lastCommittedBy": {
    "userId": "string",
    "userName": "string"
  },
  "lastCommittedAt": "timestamp",
  "lastActivityAt": "timestamp",
  "createdAt": "timestamp"
}
```

| الحقل | النوع | الوصف |
|---|---|---|
| `name` | string | اسم القاعة (مثال: "قاعة الانتظار الرئيسية") |
| `type` | string | نوع القاعة: `waiting` أو `interview` |
| `capacity` | number | السعة القصوى للقاعة |
| `currentCount` | number | **العدد الفعلي المعتمد**. يتم تحديثه فقط عبر عملية `Commit` أو `Confirm Arrival`. |
| `draftCount` | number | **العدد المسودة**. يتم تحديثه يدوياً في واجهة `Hall Control` ولا يؤثر على النظام. |
| `lastCommittedBy` | object | معلومات المستخدم الذي قام بآخر عملية `Commit`. |
| `lastCommittedAt` | timestamp | وقت آخر عملية `Commit`. |
| `lastActivityAt` | timestamp | وقت آخر نشاط في القاعة (لفرز القاعات النشطة). |
| `createdAt` | timestamp | وقت إنشاء القاعة. |

---

### 2. SystemState Collection

يخزن الحالة العامة للنظام التي لا تنتمي لقاعة معينة.

**Path:** `/systemState/global` (مستند واحد فقط)

**Schema:**
```json
{
  "currentOutsideCount": "number",
  "lastUpdatedBy": {
    "userId": "string",
    "userName": "string"
  },
  "lastUpdatedAt": "timestamp"
}
```

| الحقل | النوع | الوصف |
|---|---|---|
| `currentOutsideCount` | number | عدد المرشحين الحالي خارج المبنى. |
| `lastUpdatedBy` | object | معلومات المستخدم الذي قام بآخر تحديث. |
| `lastUpdatedAt` | timestamp | وقت آخر تحديث. |

---

### 3. TransferRequests Collection

يخزن جميع طلبات نقل المرشحين بين المناطق.

**Path:** `/transferRequests/{requestId}`

**Schema:**
```json
{
  "requestType": "'outside_to_waiting' | 'waiting_to_interview' | 'interview_to_interview'",
  "status": "'draft' | 'pending' | 'accepted' | 'rejected' | 'in_transit' | 'arrived' | 'closed'",
  "requestedCount": "number",
  
  "fromHall": {
    "hallId": "string | null",
    "hallName": "string | null"
  },
  "toHall": {
    "hallId": "string",
    "hallName": "string"
  },
  
  "assignees": {
    "assignedBy": { "userId": "string", "userName": "string" },
    "assignedTo": { "userId": "string", "userName": "string" },
    "pathOrganizer": { "userId": "string | null", "userName": "string | null" }
  },
  
  "timestamps": {
    "createdAt": "timestamp",
    "submittedAt": "timestamp | null",
    "acceptedAt": "timestamp | null",
    "rejectedAt": "timestamp | null",
    "transitStartedAt": "timestamp | null",
    "arrivedAt": "timestamp | null",
    "confirmedAt": "timestamp | null",
    "closedAt": "timestamp | null"
  },
  
  "actors": {
    "acceptedBy": { "userId": "string | null", "userName": "string | null" },
    "rejectedBy": { "userId": "string | null", "userName": "string | null" },
    "confirmedBy": { "userId": "string | null", "userName": "string | null" }
  },
  
  "confirmationDetails": {
    "actualArrivedCount": "number | null",
    "delta": "number | null",
    "comment": "string | null",
    "mismatchReason": "'count_mismatch' | 'candidates_rejected' | 'other' | null"
  }
}
```

**ملاحظات التصميم:**
- تم تجميع الحقول المتشابهة في كائنات (objects) مثل `assignees`, `timestamps`, `actors` لتحسين القراءة والتنظيم.
- `fromHall` و `toHall` تحتويان على `hallId` و `hallName` لتجنب الحاجة لـ `join` عند عرض الطلبات.

---

### 4. HallAssignments Collection

يحدد المستخدمين المعينين على قاعات معينة وما هو دورهم في تلك القاعة.

**Path:** `/hallAssignments/{assignmentId}`

**Schema:**
```json
{
  "userId": "string",
  "hallId": "string",
  "roleInHall": "'receiver' | 'manager'",
  "assignedAt": "timestamp",
  "assignedBy": { "userId": "string", "userName": "string" }
}
```

**ملاحظات التصميم:**
- هذا الجدول هو **أساس صلاحيات نطاق القاعة (Hall Scope)**. سيتم استخدامه في قواعد أمان Firestore للتحقق مما إذا كان المستخدم يستطيع تنفيذ إجراء على قاعة معينة.

---

### 5. AuditLog Collection

يسجل جميع العمليات الحساسة التي تحدث في النظام.

**Path:** `/auditLog/{logId}`

**Schema:**
```json
{
  "actor": {
    "userId": "string",
    "userName": "string",
    "userRole": "string"
  },
  "action": "string",
  "entity": {
    "type": "'hall' | 'request' | 'user' | 'system'",
    "id": "string"
  },
  "details": {
    "before": "object | null",
    "after": "object | null",
    "reason": "string | null"
  },
  "createdAt": "timestamp"
}
```

| الحقل | النوع | الوصف |
|---|---|---|
| `actor` | object | معلومات المستخدم الذي قام بالإجراء. |
| `action` | string | اسم الإجراء (مثال: `COMMIT_HALL_COUNT`, `ACCEPT_REQUEST`). |
| `entity` | object | الكيان الذي تم عليه الإجراء (قاعة، طلب، ...). |
| `details` | object | تفاصيل التغيير. `before` و `after` يخزنان نسخة من البيانات قبل وبعد التغيير. `reason` يخزن السبب الإلزامي. |
| `createdAt` | timestamp | وقت حدوث الإجراء. |

---

### 6. Users Collection (افتراضي)

يخزن معلومات المستخدمين الأساسية.

**Path:** `/users/{userId}`

**Schema:**
```json
{
  "name": "string",
  "email": "string",
  "role": "'Admin' | 'InternalSupervisor' | ...",
  "isPathOrganizer": "boolean",
  "createdAt": "timestamp"
}
```

**ملاحظة:** `isPathOrganizer` هي علامة (flag) بسيطة لتحديد ما إذا كان المستخدم يمكن تعيينه كمنظم مسار. يمكن تطويرها لاحقاً لدور مستقل.
