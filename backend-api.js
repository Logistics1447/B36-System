// ============================================
// BACKEND API - منطق الصلاحيات المحكم
// ============================================
// هذا الملف يحتوي على جميع الوظائف التي تتفاعل مع Firestore
// مع تطبيق Defense in Depth (التحقق من الصلاحيات في كل طبقة)

import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  addDoc,
  increment, 
  serverTimestamp, 
  query, 
  where,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============================================
// PERMISSIONS & ROLES
// ============================================

const ROLES = {
  ADMIN: 'Admin',
  EXTERNAL_SUPERVISOR: 'ExternalSupervisor',
  EXTERNAL_REGULAR: 'ExternalRegular',
  INTERNAL_SUPERVISOR: 'InternalSupervisor',
  INTERNAL_REGULAR: 'InternalRegular',
  VIEWER: 'Viewer'
};

const PERMISSIONS = {
  MANAGE_OUTSIDE_COUNT: 'manage_outside_count',
  VIEW_OUTSIDE_COUNT: 'view_outside_count',
  CREATE_OUTSIDE_TO_WAITING: 'create_outside_to_waiting',
  CREATE_WAITING_TO_INTERVIEW: 'create_waiting_to_interview',
  CREATE_INTERVIEW_TO_INTERVIEW: 'create_interview_to_interview',
  ACCEPT_REJECT_REQUEST: 'accept_reject_request',
  CONFIRM_ARRIVAL: 'confirm_arrival',
  EXECUTE_TRANSFER: 'execute_transfer',
  START_TRANSIT: 'start_transit',
  MANAGE_HALLS: 'manage_halls',
  ASSIGN_USERS: 'assign_users',
  VIEW_AUDIT_LOG: 'view_audit_log',
  VIEW_ANALYTICS: 'view_analytics',
  VIEW_DASHBOARD: 'view_dashboard',
  VIEW_REQUESTS: 'view_requests',
  VIEW_MY_HALL: 'view_my_hall',
  COMMIT_HALL_COUNT: 'commit_hall_count'
};

const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: Object.values(PERMISSIONS),
  [ROLES.EXTERNAL_SUPERVISOR]: [
    PERMISSIONS.MANAGE_OUTSIDE_COUNT,
    PERMISSIONS.VIEW_OUTSIDE_COUNT,
    PERMISSIONS.CREATE_OUTSIDE_TO_WAITING,
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_REQUESTS
  ],
  [ROLES.EXTERNAL_REGULAR]: [
    PERMISSIONS.MANAGE_OUTSIDE_COUNT,
    PERMISSIONS.VIEW_DASHBOARD
  ],
  [ROLES.INTERNAL_SUPERVISOR]: [
    PERMISSIONS.CREATE_WAITING_TO_INTERVIEW,
    PERMISSIONS.CREATE_INTERVIEW_TO_INTERVIEW,
    PERMISSIONS.ACCEPT_REJECT_REQUEST,
    PERMISSIONS.CONFIRM_ARRIVAL,
    PERMISSIONS.START_TRANSIT,
    PERMISSIONS.COMMIT_HALL_COUNT,
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_REQUESTS,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.MANAGE_HALLS
  ],
  [ROLES.INTERNAL_REGULAR]: [
    PERMISSIONS.ACCEPT_REJECT_REQUEST,
    PERMISSIONS.CONFIRM_ARRIVAL,
    PERMISSIONS.COMMIT_HALL_COUNT,
    PERMISSIONS.VIEW_MY_HALL,
    PERMISSIONS.VIEW_DASHBOARD
  ],
  [ROLES.VIEWER]: [
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.VIEW_DASHBOARD
  ]
};

function hasPermission(user, permission) {
  if (!user || !user.role) return false;
  const rolePermissions = ROLE_PERMISSIONS[user.role] || [];
  return rolePermissions.includes(permission);
}

// ============================================
// HALL SCOPE - التحقق من نطاق القاعة
// ============================================

async function canActOnHall(db, user, hallId) {
  // Admin يستطيع كل شيء
  if (user.role === ROLES.ADMIN) return true;
  
  // InternalSupervisor يستطيع كل شيء في مبناه
  if (user.role === ROLES.INTERNAL_SUPERVISOR) return true;
  
  // InternalUser فقط للقاعات المعيّن عليها
  if (user.role === ROLES.INTERNAL_REGULAR) {
    const assignmentId = `${user.id}_${hallId}`;
    const assignmentRef = doc(db, 'hallAssignments', assignmentId);
    const assignmentSnap = await getDoc(assignmentRef);
    return assignmentSnap.exists();
  }
  
  return false;
}

async function canActOnRequest(db, user, request) {
  // Admin يستطيع كل شيء
  if (user.role === ROLES.ADMIN) return true;
  
  // InternalSupervisor يستطيع كل شيء
  if (user.role === ROLES.INTERNAL_SUPERVISOR) return true;
  
  // InternalUser فقط للطلبات المتعلقة بقاعاته
  if (user.role === ROLES.INTERNAL_REGULAR) {
    return await canActOnHall(db, user, request.toHall.hallId);
  }
  
  // PathOrganizer يستطيع تنفيذ الطلبات المُسندة له
  if (user.isPathOrganizer && request.assignees.pathOrganizer?.userId === user.id) {
    return true;
  }
  
  return false;
}

// ============================================
// AUDIT LOG - تسجيل العمليات
// ============================================

async function logAudit(db, user, action, entityType, entityId, details = {}) {
  const auditRef = collection(db, 'auditLog');
  await addDoc(auditRef, {
    actor: {
      userId: user.id,
      userName: user.name,
      userRole: user.role
    },
    action: action,
    entity: {
      type: entityType,
      id: entityId
    },
    details: {
      before: details.before || null,
      after: details.after || null,
      reason: details.reason || null
    },
    createdAt: serverTimestamp()
  });
}

// ============================================
// HALL CONTROL - عداد يدوي مع Commit
// ============================================

async function commitHallCount(db, user, hallId, newCount, reason = null) {
  // 1. التحقق من الصلاحيات
  if (!hasPermission(user, PERMISSIONS.COMMIT_HALL_COUNT)) {
    throw new Error('ليس لديك صلاحية لاعتماد الأعداد');
  }
  
  const canAct = await canActOnHall(db, user, hallId);
  if (!canAct) {
    throw new Error('ليس لديك صلاحية للتعديل على هذه القاعة');
  }
  
  // 2. الحصول على بيانات القاعة الحالية
  const hallRef = doc(db, 'halls', hallId);
  const hallSnap = await getDoc(hallRef);
  if (!hallSnap.exists()) {
    throw new Error('القاعة غير موجودة');
  }
  
  const hallData = hallSnap.data();
  const oldCount = hallData.currentCount;
  const capacity = hallData.capacity;
  const delta = Math.abs(newCount - oldCount);
  
  // 3. التحقق من القواعد
  // منع العدد السالب
  if (newCount < 0) {
    throw new Error('لا يمكن أن يكون العدد سالباً');
  }
  
  // منع تجاوز السعة (إلا للـ Admin مع سبب)
  if (newCount > capacity) {
    if (user.role !== ROLES.ADMIN) {
      throw new Error('لا يمكن تجاوز السعة القصوى');
    }
    if (!reason) {
      throw new Error('يجب إدخال سبب لتجاوز السعة');
    }
  }
  
  // طلب سبب إذا كان الفرق كبير (>5) أو تخفيض
  if ((delta > 5 || newCount < oldCount) && !reason) {
    throw new Error('يجب إدخال سبب للتعديل الكبير أو التخفيض');
  }
  
  // 4. تحديث القاعة
  await updateDoc(hallRef, {
    currentCount: newCount,
    draftCount: newCount, // مزامنة draftCount مع currentCount بعد الاعتماد
    lastCommittedBy: {
      userId: user.id,
      userName: user.name
    },
    lastCommittedAt: serverTimestamp(),
    lastActivityAt: serverTimestamp()
  });
  
  // 5. تسجيل في AuditLog
  await logAudit(db, user, 'COMMIT_HALL_COUNT', 'hall', hallId, {
    before: { currentCount: oldCount },
    after: { currentCount: newCount },
    reason: reason
  });
  
  return { success: true, newCount, oldCount };
}

// ============================================
// WORKFLOW - إدارة حالات الطلبات
// ============================================

const REQUEST_STATES = {
  DRAFT: 'draft',
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  IN_TRANSIT: 'in_transit',
  ARRIVED: 'arrived',
  CLOSED: 'closed'
};

const VALID_TRANSITIONS = {
  [REQUEST_STATES.DRAFT]: [REQUEST_STATES.PENDING],
  [REQUEST_STATES.PENDING]: [REQUEST_STATES.ACCEPTED, REQUEST_STATES.REJECTED],
  [REQUEST_STATES.ACCEPTED]: [REQUEST_STATES.IN_TRANSIT],
  [REQUEST_STATES.REJECTED]: [],
  [REQUEST_STATES.IN_TRANSIT]: [REQUEST_STATES.ARRIVED],
  [REQUEST_STATES.ARRIVED]: [REQUEST_STATES.CLOSED],
  [REQUEST_STATES.CLOSED]: []
};

function validateStateTransition(currentState, newState) {
  const validNextStates = VALID_TRANSITIONS[currentState] || [];
  if (!validNextStates.includes(newState)) {
    throw new Error(`انتقال غير صحيح: لا يمكن الانتقال من ${currentState} إلى ${newState}`);
  }
  return true;
}

// ============================================
// WORKFLOW - قبول الطلب
// ============================================

async function acceptRequest(db, user, requestId) {
  // 1. التحقق من الصلاحيات
  if (!hasPermission(user, PERMISSIONS.ACCEPT_REJECT_REQUEST)) {
    throw new Error('ليس لديك صلاحية لقبول الطلبات');
  }
  
  // 2. الحصول على بيانات الطلب
  const requestRef = doc(db, 'transferRequests', requestId);
  const requestSnap = await getDoc(requestRef);
  if (!requestSnap.exists()) {
    throw new Error('الطلب غير موجود');
  }
  
  const requestData = requestSnap.data();
  
  // 3. التحقق من نطاق القاعة
  const canAct = await canActOnRequest(db, user, requestData);
  if (!canAct) {
    throw new Error('ليس لديك صلاحية للتعامل مع هذا الطلب');
  }
  
  // 4. التحقق من حالة الطلب
  validateStateTransition(requestData.status, REQUEST_STATES.ACCEPTED);
  
  // 5. تحديث الطلب
  await updateDoc(requestRef, {
    status: REQUEST_STATES.ACCEPTED,
    'timestamps.acceptedAt': serverTimestamp(),
    'actors.acceptedBy': {
      userId: user.id,
      userName: user.name
    }
  });
  
  // 6. تسجيل في AuditLog
  await logAudit(db, user, 'ACCEPT_REQUEST', 'request', requestId, {
    before: { status: requestData.status },
    after: { status: REQUEST_STATES.ACCEPTED }
  });
  
  return { success: true };
}

// ============================================
// WORKFLOW - رفض الطلب
// ============================================

async function rejectRequest(db, user, requestId, reason) {
  // 1. التحقق من الصلاحيات
  if (!hasPermission(user, PERMISSIONS.ACCEPT_REJECT_REQUEST)) {
    throw new Error('ليس لديك صلاحية لرفض الطلبات');
  }
  
  if (!reason) {
    throw new Error('يجب إدخال سبب الرفض');
  }
  
  // 2. الحصول على بيانات الطلب
  const requestRef = doc(db, 'transferRequests', requestId);
  const requestSnap = await getDoc(requestRef);
  if (!requestSnap.exists()) {
    throw new Error('الطلب غير موجود');
  }
  
  const requestData = requestSnap.data();
  
  // 3. التحقق من نطاق القاعة
  const canAct = await canActOnRequest(db, user, requestData);
  if (!canAct) {
    throw new Error('ليس لديك صلاحية للتعامل مع هذا الطلب');
  }
  
  // 4. التحقق من حالة الطلب
  validateStateTransition(requestData.status, REQUEST_STATES.REJECTED);
  
  // 5. تحديث الطلب
  await updateDoc(requestRef, {
    status: REQUEST_STATES.REJECTED,
    'timestamps.rejectedAt': serverTimestamp(),
    'actors.rejectedBy': {
      userId: user.id,
      userName: user.name
    },
    'confirmationDetails.comment': reason
  });
  
  // 6. تسجيل في AuditLog
  await logAudit(db, user, 'REJECT_REQUEST', 'request', requestId, {
    before: { status: requestData.status },
    after: { status: REQUEST_STATES.REJECTED },
    reason: reason
  });
  
  return { success: true };
}

// ============================================
// WORKFLOW - بدء النقل (IN_TRANSIT)
// ⚠️ هنا يحدث الخصم من المصدر (منع Double Decrement)
// ============================================

async function startTransit(db, user, requestId) {
  // 1. التحقق من الصلاحيات
  if (!hasPermission(user, PERMISSIONS.START_TRANSIT)) {
    throw new Error('ليس لديك صلاحية لبدء النقل');
  }
  
  // 2. الحصول على بيانات الطلب
  const requestRef = doc(db, 'transferRequests', requestId);
  const requestSnap = await getDoc(requestRef);
  if (!requestSnap.exists()) {
    throw new Error('الطلب غير موجود');
  }
  
  const requestData = requestSnap.data();
  
  // 3. التحقق من نطاق القاعة
  const canAct = await canActOnRequest(db, user, requestData);
  if (!canAct) {
    throw new Error('ليس لديك صلاحية للتعامل مع هذا الطلب');
  }
  
  // 4. التحقق من حالة الطلب
  validateStateTransition(requestData.status, REQUEST_STATES.IN_TRANSIT);
  
  // 5. ⚠️ الخصم من المصدر (نقطة واحدة فقط)
  const requestedCount = requestData.requestedCount;
  
  if (requestData.fromHall.hallId) {
    // خصم من قاعة
    const fromHallRef = doc(db, 'halls', requestData.fromHall.hallId);
    const fromHallSnap = await getDoc(fromHallRef);
    if (!fromHallSnap.exists()) {
      throw new Error('القاعة المصدر غير موجودة');
    }
    
    const fromHallData = fromHallSnap.data();
    if (fromHallData.currentCount < requestedCount) {
      throw new Error('العدد في القاعة المصدر غير كافٍ');
    }
    
    await updateDoc(fromHallRef, {
      currentCount: increment(-requestedCount),
      lastActivityAt: serverTimestamp()
    });
    
    // تسجيل الخصم في AuditLog
    await logAudit(db, user, 'DECREMENT_HALL', 'hall', requestData.fromHall.hallId, {
      before: { currentCount: fromHallData.currentCount },
      after: { currentCount: fromHallData.currentCount - requestedCount },
      reason: `بدء نقل الطلب ${requestId}`
    });
  } else {
    // خصم من العدد الخارجي
    const systemStateRef = doc(db, 'systemState', 'global');
    const systemStateSnap = await getDoc(systemStateRef);
    if (!systemStateSnap.exists()) {
      throw new Error('حالة النظام غير موجودة');
    }
    
    const systemStateData = systemStateSnap.data();
    if (systemStateData.currentOutsideCount < requestedCount) {
      throw new Error('العدد الخارجي غير كافٍ');
    }
    
    await updateDoc(systemStateRef, {
      currentOutsideCount: increment(-requestedCount),
      lastUpdatedBy: {
        userId: user.id,
        userName: user.name
      },
      lastUpdatedAt: serverTimestamp()
    });
    
    // تسجيل الخصم في AuditLog
    await logAudit(db, user, 'DECREMENT_OUTSIDE', 'system', 'global', {
      before: { currentOutsideCount: systemStateData.currentOutsideCount },
      after: { currentOutsideCount: systemStateData.currentOutsideCount - requestedCount },
      reason: `بدء نقل الطلب ${requestId}`
    });
  }
  
  // 6. تحديث حالة الطلب
  await updateDoc(requestRef, {
    status: REQUEST_STATES.IN_TRANSIT,
    'timestamps.transitStartedAt': serverTimestamp()
  });
  
  // 7. تسجيل في AuditLog
  await logAudit(db, user, 'START_TRANSIT', 'request', requestId, {
    before: { status: requestData.status },
    after: { status: REQUEST_STATES.IN_TRANSIT }
  });
  
  return { success: true };
}

// ============================================
// WORKFLOW - مصادقة الوصول (ARRIVED)
// ⚠️ هنا تتم الإضافة للوجهة (لا خصم)
// ============================================

async function confirmArrival(db, user, requestId, actualArrivedCount, comment = null, mismatchReason = null) {
  // 1. التحقق من الصلاحيات
  if (!hasPermission(user, PERMISSIONS.CONFIRM_ARRIVAL)) {
    throw new Error('ليس لديك صلاحية لمصادقة الوصول');
  }
  
  // 2. الحصول على بيانات الطلب
  const requestRef = doc(db, 'transferRequests', requestId);
  const requestSnap = await getDoc(requestRef);
  if (!requestSnap.exists()) {
    throw new Error('الطلب غير موجود');
  }
  
  const requestData = requestSnap.data();
  
  // 3. التحقق من نطاق القاعة
  const canAct = await canActOnRequest(db, user, requestData);
  if (!canAct) {
    throw new Error('ليس لديك صلاحية للتعامل مع هذا الطلب');
  }
  
  // 4. التحقق من حالة الطلب
  validateStateTransition(requestData.status, REQUEST_STATES.ARRIVED);
  
  // 5. التحقق من البيانات
  if (actualArrivedCount < 0) {
    throw new Error('العدد الفعلي لا يمكن أن يكون سالباً');
  }
  
  const requestedCount = requestData.requestedCount;
  const delta = actualArrivedCount - requestedCount;
  
  // إذا كان هناك فرق، يجب إدخال تعليق وسبب
  if (delta !== 0 && (!comment || !mismatchReason)) {
    throw new Error('يجب إدخال تعليق وسبب عند وجود فرق في العدد');
  }
  
  // 6. ⚠️ الإضافة للوجهة (لا خصم هنا)
  const toHallRef = doc(db, 'halls', requestData.toHall.hallId);
  const toHallSnap = await getDoc(toHallRef);
  if (!toHallSnap.exists()) {
    throw new Error('القاعة الوجهة غير موجودة');
  }
  
  const toHallData = toHallSnap.data();
  
  await updateDoc(toHallRef, {
    currentCount: increment(actualArrivedCount),
    lastActivityAt: serverTimestamp()
  });
  
  // تسجيل الإضافة في AuditLog
  await logAudit(db, user, 'INCREMENT_HALL', 'hall', requestData.toHall.hallId, {
    before: { currentCount: toHallData.currentCount },
    after: { currentCount: toHallData.currentCount + actualArrivedCount },
    reason: `مصادقة وصول الطلب ${requestId}`
  });
  
  // 7. تحديث الطلب
  await updateDoc(requestRef, {
    status: REQUEST_STATES.ARRIVED,
    'timestamps.arrivedAt': serverTimestamp(),
    'timestamps.confirmedAt': serverTimestamp(),
    'actors.confirmedBy': {
      userId: user.id,
      userName: user.name
    },
    'confirmationDetails.actualArrivedCount': actualArrivedCount,
    'confirmationDetails.delta': delta,
    'confirmationDetails.comment': comment,
    'confirmationDetails.mismatchReason': mismatchReason
  });
  
  // 8. تسجيل في AuditLog
  await logAudit(db, user, 'CONFIRM_ARRIVAL', 'request', requestId, {
    before: { status: requestData.status },
    after: { 
      status: REQUEST_STATES.ARRIVED,
      actualArrivedCount: actualArrivedCount,
      delta: delta
    },
    reason: comment
  });
  
  // 9. إغلاق الطلب تلقائياً
  await updateDoc(requestRef, {
    status: REQUEST_STATES.CLOSED,
    'timestamps.closedAt': serverTimestamp()
  });
  
  return { success: true, delta };
}

// ============================================
// EXPORTS
// ============================================

export {
  ROLES,
  PERMISSIONS,
  hasPermission,
  canActOnHall,
  canActOnRequest,
  logAudit,
  commitHallCount,
  acceptRequest,
  rejectRequest,
  startTransit,
  confirmArrival,
  REQUEST_STATES,
  validateStateTransition
};
