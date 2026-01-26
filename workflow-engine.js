// ============================================
// WORKFLOW ENGINE - محرك سير العمل المحكم
// ============================================
// هذا الملف يحتوي على منطق سير العمل الكامل لأنواع الطلبات الثلاثة:
// 1. outside_to_waiting
// 2. waiting_to_interview
// 3. interview_to_interview
//
// المبدأ الأساسي: منع Double Decrement
// - الخصم يحدث مرة واحدة فقط عند الانتقال إلى in_transit
// - الإضافة تحدث عند المصادقة (arrived)

import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  getDoc,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { 
  ROLES, 
  PERMISSIONS, 
  hasPermission, 
  logAudit,
  REQUEST_STATES,
  validateStateTransition
} from './backend-api.js';

// ============================================
// CREATE REQUEST - إنشاء طلب جديد
// ============================================

async function createTransferRequest(db, user, requestData) {
  const { requestType, fromHallId, toHallId, requestedCount, pathOrganizerId } = requestData;
  
  // 1. التحقق من الصلاحيات حسب نوع الطلب
  if (requestType === 'outside_to_waiting') {
    if (!hasPermission(user, PERMISSIONS.CREATE_OUTSIDE_TO_WAITING)) {
      throw new Error('ليس لديك صلاحية لإنشاء طلبات خارج → انتظار');
    }
    if (user.role !== ROLES.EXTERNAL_SUPERVISOR) {
      throw new Error('فقط المنظم الخارجي المشرف يستطيع إنشاء هذا النوع من الطلبات');
    }
  } else if (requestType === 'waiting_to_interview' || requestType === 'interview_to_interview') {
    if (!hasPermission(user, PERMISSIONS.CREATE_WAITING_TO_INTERVIEW)) {
      throw new Error('ليس لديك صلاحية لإنشاء طلبات داخلية');
    }
    if (user.role !== ROLES.INTERNAL_SUPERVISOR) {
      throw new Error('فقط مشرف المبنى يستطيع إنشاء هذا النوع من الطلبات');
    }
    if (!pathOrganizerId) {
      throw new Error('يجب تعيين منظم مسار للطلبات الداخلية');
    }
  }
  
  // 2. التحقق من البيانات
  if (requestedCount <= 0) {
    throw new Error('العدد المطلوب يجب أن يكون أكبر من صفر');
  }
  
  // 3. جلب معلومات القاعات
  let fromHallData = null;
  if (fromHallId) {
    const fromHallRef = doc(db, 'halls', fromHallId);
    const fromHallSnap = await getDoc(fromHallRef);
    if (!fromHallSnap.exists()) {
      throw new Error('القاعة المصدر غير موجودة');
    }
    fromHallData = { id: fromHallId, ...fromHallSnap.data() };
    
    // التحقق من توفر العدد
    if (fromHallData.currentCount < requestedCount) {
      throw new Error(`العدد في ${fromHallData.name} غير كافٍ (متوفر: ${fromHallData.currentCount})`);
    }
  }
  
  const toHallRef = doc(db, 'halls', toHallId);
  const toHallSnap = await getDoc(toHallRef);
  if (!toHallSnap.exists()) {
    throw new Error('القاعة الوجهة غير موجودة');
  }
  const toHallData = { id: toHallId, ...toHallSnap.data() };
  
  // 4. جلب معلومات المستلم (المعيّن على القاعة الوجهة)
  // في الواقع يجب جلبه من HallAssignments، هنا نفترض أنه موجود
  const assignedToUserId = 'receiver_' + toHallId; // placeholder
  const assignedToName = 'مستلم ' + toHallData.name; // placeholder
  
  // 5. جلب معلومات منظم المسار (إن وُجد)
  let pathOrganizerData = null;
  if (pathOrganizerId) {
    const pathOrganizerRef = doc(db, 'users', pathOrganizerId);
    const pathOrganizerSnap = await getDoc(pathOrganizerRef);
    if (!pathOrganizerSnap.exists()) {
      throw new Error('منظم المسار غير موجود');
    }
    pathOrganizerData = pathOrganizerSnap.data();
    if (!pathOrganizerData.isPathOrganizer) {
      throw new Error('المستخدم المحدد ليس منظم مسار');
    }
  }
  
  // 6. إنشاء الطلب
  const requestRef = await addDoc(collection(db, 'transferRequests'), {
    requestType: requestType,
    status: REQUEST_STATES.DRAFT,
    requestedCount: requestedCount,
    
    fromHall: fromHallData ? {
      hallId: fromHallData.id,
      hallName: fromHallData.name
    } : {
      hallId: null,
      hallName: null
    },
    
    toHall: {
      hallId: toHallData.id,
      hallName: toHallData.name
    },
    
    assignees: {
      assignedBy: {
        userId: user.id,
        userName: user.name
      },
      assignedTo: {
        userId: assignedToUserId,
        userName: assignedToName
      },
      pathOrganizer: pathOrganizerData ? {
        userId: pathOrganizerId,
        userName: pathOrganizerData.name
      } : {
        userId: null,
        userName: null
      }
    },
    
    timestamps: {
      createdAt: serverTimestamp(),
      submittedAt: null,
      acceptedAt: null,
      rejectedAt: null,
      transitStartedAt: null,
      arrivedAt: null,
      confirmedAt: null,
      closedAt: null
    },
    
    actors: {
      acceptedBy: null,
      rejectedBy: null,
      confirmedBy: null
    },
    
    confirmationDetails: {
      actualArrivedCount: null,
      delta: null,
      comment: null,
      mismatchReason: null
    }
  });
  
  // 7. تسجيل في AuditLog
  await logAudit(db, user, 'CREATE_REQUEST', 'request', requestRef.id, {
    after: {
      requestType: requestType,
      requestedCount: requestedCount,
      fromHall: fromHallData?.name || 'خارج المبنى',
      toHall: toHallData.name
    }
  });
  
  return { success: true, requestId: requestRef.id };
}

// ============================================
// SUBMIT REQUEST - إرسال الطلب (draft → pending)
// ============================================

async function submitRequest(db, user, requestId) {
  // 1. الحصول على بيانات الطلب
  const requestRef = doc(db, 'transferRequests', requestId);
  const requestSnap = await getDoc(requestRef);
  if (!requestSnap.exists()) {
    throw new Error('الطلب غير موجود');
  }
  
  const requestData = requestSnap.data();
  
  // 2. التحقق من الملكية
  if (requestData.assignees.assignedBy.userId !== user.id && user.role !== ROLES.ADMIN) {
    throw new Error('ليس لديك صلاحية لإرسال هذا الطلب');
  }
  
  // 3. التحقق من حالة الطلب
  validateStateTransition(requestData.status, REQUEST_STATES.PENDING);
  
  // 4. تحديث الطلب
  await updateDoc(requestRef, {
    status: REQUEST_STATES.PENDING,
    'timestamps.submittedAt': serverTimestamp()
  });
  
  // 5. تسجيل في AuditLog
  await logAudit(db, user, 'SUBMIT_REQUEST', 'request', requestId, {
    before: { status: requestData.status },
    after: { status: REQUEST_STATES.PENDING }
  });
  
  return { success: true };
}

// ============================================
// WORKFLOW: outside_to_waiting
// ============================================
// الخطوات:
// 1. ExternalSupervisor ينشئ الطلب (draft)
// 2. يرسله (pending)
// 3. المستلم (InternalUser/Supervisor) يقبل (accepted)
// 4. المستلم يبدأ النقل (in_transit) → ⚠️ خصم من outdoor_queue
// 5. المستلم يصادق الوصول (arrived) → ⚠️ إضافة إلى toHall
// 6. إغلاق تلقائي (closed)

async function handleOutsideToWaiting_Accept(db, user, requestId) {
  // استخدام acceptRequest من backend-api.js
  const { acceptRequest } = await import('./backend-api.js');
  return await acceptRequest(db, user, requestId);
}

async function handleOutsideToWaiting_StartTransit(db, user, requestId) {
  // استخدام startTransit من backend-api.js
  const { startTransit } = await import('./backend-api.js');
  return await startTransit(db, user, requestId);
}

async function handleOutsideToWaiting_ConfirmArrival(db, user, requestId, actualArrivedCount, comment, mismatchReason) {
  // استخدام confirmArrival من backend-api.js
  const { confirmArrival } = await import('./backend-api.js');
  return await confirmArrival(db, user, requestId, actualArrivedCount, comment, mismatchReason);
}

// ============================================
// WORKFLOW: waiting_to_interview
// ============================================
// الخطوات:
// 1. InternalSupervisor ينشئ الطلب ويعيّن pathOrganizer (draft)
// 2. يرسله (pending)
// 3. مسؤول قاعة المقابلات يقبل (accepted)
// 4. PathOrganizer يبدأ النقل (in_transit) → ⚠️ خصم من fromHall
// 5. مسؤول قاعة المقابلات يصادق (arrived) → ⚠️ إضافة إلى toHall
// 6. إغلاق تلقائي (closed)

async function handleWaitingToInterview_Accept(db, user, requestId) {
  const { acceptRequest } = await import('./backend-api.js');
  return await acceptRequest(db, user, requestId);
}

async function handleWaitingToInterview_StartTransit(db, user, requestId) {
  // التحقق من أن المستخدم هو PathOrganizer المُعيّن
  const requestRef = doc(db, 'transferRequests', requestId);
  const requestSnap = await getDoc(requestRef);
  if (!requestSnap.exists()) {
    throw new Error('الطلب غير موجود');
  }
  
  const requestData = requestSnap.data();
  
  if (requestData.assignees.pathOrganizer?.userId !== user.id && user.role !== ROLES.ADMIN) {
    throw new Error('فقط منظم المسار المُعيّن يستطيع بدء النقل');
  }
  
  const { startTransit } = await import('./backend-api.js');
  return await startTransit(db, user, requestId);
}

async function handleWaitingToInterview_ConfirmArrival(db, user, requestId, actualArrivedCount, comment, mismatchReason) {
  const { confirmArrival } = await import('./backend-api.js');
  return await confirmArrival(db, user, requestId, actualArrivedCount, comment, mismatchReason);
}

// ============================================
// WORKFLOW: interview_to_interview
// ============================================
// نفس آلية waiting_to_interview

async function handleInterviewToInterview_Accept(db, user, requestId) {
  return await handleWaitingToInterview_Accept(db, user, requestId);
}

async function handleInterviewToInterview_StartTransit(db, user, requestId) {
  return await handleWaitingToInterview_StartTransit(db, user, requestId);
}

async function handleInterviewToInterview_ConfirmArrival(db, user, requestId, actualArrivedCount, comment, mismatchReason) {
  return await handleWaitingToInterview_ConfirmArrival(db, user, requestId, actualArrivedCount, comment, mismatchReason);
}

// ============================================
// ASSIGN PATH ORGANIZER - تعيين منظم المسار
// ============================================

async function assignPathOrganizer(db, user, requestId, pathOrganizerId) {
  // 1. التحقق من الصلاحيات
  if (user.role !== ROLES.INTERNAL_SUPERVISOR && user.role !== ROLES.ADMIN) {
    throw new Error('فقط مشرف المبنى يستطيع تعيين منظم المسار');
  }
  
  // 2. الحصول على بيانات الطلب
  const requestRef = doc(db, 'transferRequests', requestId);
  const requestSnap = await getDoc(requestRef);
  if (!requestSnap.exists()) {
    throw new Error('الطلب غير موجود');
  }
  
  const requestData = requestSnap.data();
  
  // 3. التحقق من نوع الطلب
  if (requestData.requestType === 'outside_to_waiting') {
    throw new Error('طلبات خارج → انتظار لا تحتاج منظم مسار');
  }
  
  // 4. التحقق من حالة الطلب
  if (requestData.status !== REQUEST_STATES.DRAFT && requestData.status !== REQUEST_STATES.PENDING) {
    throw new Error('لا يمكن تعيين منظم مسار بعد قبول الطلب');
  }
  
  // 5. جلب معلومات منظم المسار
  const pathOrganizerRef = doc(db, 'users', pathOrganizerId);
  const pathOrganizerSnap = await getDoc(pathOrganizerRef);
  if (!pathOrganizerSnap.exists()) {
    throw new Error('منظم المسار غير موجود');
  }
  
  const pathOrganizerData = pathOrganizerSnap.data();
  if (!pathOrganizerData.isPathOrganizer) {
    throw new Error('المستخدم المحدد ليس منظم مسار');
  }
  
  // 6. تحديث الطلب
  await updateDoc(requestRef, {
    'assignees.pathOrganizer': {
      userId: pathOrganizerId,
      userName: pathOrganizerData.name
    }
  });
  
  // 7. تسجيل في AuditLog
  await logAudit(db, user, 'ASSIGN_PATH_ORGANIZER', 'request', requestId, {
    before: { pathOrganizer: requestData.assignees.pathOrganizer },
    after: { pathOrganizer: { userId: pathOrganizerId, userName: pathOrganizerData.name } }
  });
  
  return { success: true };
}

// ============================================
// UNIFIED REQUEST HANDLER - معالج موحد للطلبات
// ============================================

async function handleRequestAction(db, user, requestId, action, data = {}) {
  const requestRef = doc(db, 'transferRequests', requestId);
  const requestSnap = await getDoc(requestRef);
  if (!requestSnap.exists()) {
    throw new Error('الطلب غير موجود');
  }
  
  const requestData = requestSnap.data();
  const requestType = requestData.requestType;
  
  switch (action) {
    case 'submit':
      return await submitRequest(db, user, requestId);
      
    case 'accept':
      if (requestType === 'outside_to_waiting') {
        return await handleOutsideToWaiting_Accept(db, user, requestId);
      } else if (requestType === 'waiting_to_interview') {
        return await handleWaitingToInterview_Accept(db, user, requestId);
      } else if (requestType === 'interview_to_interview') {
        return await handleInterviewToInterview_Accept(db, user, requestId);
      }
      break;
      
    case 'reject':
      const { rejectRequest } = await import('./backend-api.js');
      return await rejectRequest(db, user, requestId, data.reason);
      
    case 'start_transit':
      if (requestType === 'outside_to_waiting') {
        return await handleOutsideToWaiting_StartTransit(db, user, requestId);
      } else if (requestType === 'waiting_to_interview') {
        return await handleWaitingToInterview_StartTransit(db, user, requestId);
      } else if (requestType === 'interview_to_interview') {
        return await handleInterviewToInterview_StartTransit(db, user, requestId);
      }
      break;
      
    case 'confirm_arrival':
      if (requestType === 'outside_to_waiting') {
        return await handleOutsideToWaiting_ConfirmArrival(
          db, user, requestId, 
          data.actualArrivedCount, 
          data.comment, 
          data.mismatchReason
        );
      } else if (requestType === 'waiting_to_interview') {
        return await handleWaitingToInterview_ConfirmArrival(
          db, user, requestId, 
          data.actualArrivedCount, 
          data.comment, 
          data.mismatchReason
        );
      } else if (requestType === 'interview_to_interview') {
        return await handleInterviewToInterview_ConfirmArrival(
          db, user, requestId, 
          data.actualArrivedCount, 
          data.comment, 
          data.mismatchReason
        );
      }
      break;
      
    case 'assign_path_organizer':
      return await assignPathOrganizer(db, user, requestId, data.pathOrganizerId);
      
    default:
      throw new Error('إجراء غير معروف');
  }
}

// ============================================
// EXPORTS
// ============================================

export {
  createTransferRequest,
  submitRequest,
  handleRequestAction,
  assignPathOrganizer,
  
  // Specific handlers
  handleOutsideToWaiting_Accept,
  handleOutsideToWaiting_StartTransit,
  handleOutsideToWaiting_ConfirmArrival,
  
  handleWaitingToInterview_Accept,
  handleWaitingToInterview_StartTransit,
  handleWaitingToInterview_ConfirmArrival,
  
  handleInterviewToInterview_Accept,
  handleInterviewToInterview_StartTransit,
  handleInterviewToInterview_ConfirmArrival
};
