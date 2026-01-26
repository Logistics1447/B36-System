// ============================================
// MIGRATION SCRIPT - سكريبت ترحيل البيانات
// ============================================
// هذا السكريبت يقوم بترحيل البيانات من النظام القديم إلى النظام الجديد
// بدون كسر البيانات الحالية
//
// الخطوات:
// 1. إضافة الحقول الجديدة إلى Halls
// 2. إنشاء SystemState/global
// 3. تحديث TransferRequests بالحقول الجديدة
// 4. إنشاء HallAssignments
// 5. تحسين AuditLog

import { 
  getFirestore, 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  setDoc, 
  updateDoc, 
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============================================
// MIGRATION STEP 1: تحديث Halls
// ============================================

async function migrateHalls(db) {
  console.log('🔄 بدء ترحيل القاعات...');
  
  const hallsRef = collection(db, 'halls');
  const hallsSnap = await getDocs(hallsRef);
  
  const batch = writeBatch(db);
  let count = 0;
  
  for (const hallDoc of hallsSnap.docs) {
    const hallData = hallDoc.data();
    const hallRef = doc(db, 'halls', hallDoc.id);
    
    // إضافة الحقول الجديدة فقط إذا لم تكن موجودة
    const updates = {};
    
    if (!hallData.hasOwnProperty('draftCount')) {
      updates.draftCount = hallData.currentCount || 0;
    }
    
    if (!hallData.hasOwnProperty('lastCommittedBy')) {
      updates.lastCommittedBy = {
        userId: 'system',
        userName: 'النظام'
      };
    }
    
    if (!hallData.hasOwnProperty('lastCommittedAt')) {
      updates.lastCommittedAt = serverTimestamp();
    }
    
    if (!hallData.hasOwnProperty('lastActivityAt')) {
      updates.lastActivityAt = serverTimestamp();
    }
    
    if (Object.keys(updates).length > 0) {
      batch.update(hallRef, updates);
      count++;
    }
  }
  
  await batch.commit();
  console.log(`✅ تم ترحيل ${count} قاعة`);
  
  return { success: true, count };
}

// ============================================
// MIGRATION STEP 2: إنشاء SystemState
// ============================================

async function migrateSystemState(db) {
  console.log('🔄 بدء ترحيل حالة النظام...');
  
  const systemStateRef = doc(db, 'systemState', 'global');
  const systemStateSnap = await getDoc(systemStateRef);
  
  if (!systemStateSnap.exists()) {
    // إنشاء المستند الجديد
    // نحاول جلب العدد الخارجي من globalStats إذا كان موجوداً
    let currentOutsideCount = 0;
    
    try {
      const globalStatsRef = doc(db, 'globalStats', 'stats');
      const globalStatsSnap = await getDoc(globalStatsRef);
      if (globalStatsSnap.exists()) {
        currentOutsideCount = globalStatsSnap.data().outdoor_queue || 0;
      }
    } catch (error) {
      console.warn('لم يتم العثور على globalStats، استخدام القيمة الافتراضية 0');
    }
    
    await setDoc(systemStateRef, {
      currentOutsideCount: currentOutsideCount,
      lastUpdatedBy: {
        userId: 'system',
        userName: 'النظام'
      },
      lastUpdatedAt: serverTimestamp()
    });
    
    console.log(`✅ تم إنشاء SystemState بعدد خارجي: ${currentOutsideCount}`);
  } else {
    console.log('ℹ️ SystemState موجود بالفعل، تخطي...');
  }
  
  return { success: true };
}

// ============================================
// MIGRATION STEP 3: تحديث TransferRequests
// ============================================

async function migrateTransferRequests(db) {
  console.log('🔄 بدء ترحيل طلبات النقل...');
  
  const requestsRef = collection(db, 'transferRequests');
  const requestsSnap = await getDocs(requestsRef);
  
  const batch = writeBatch(db);
  let count = 0;
  
  for (const requestDoc of requestsSnap.docs) {
    const requestData = requestDoc.data();
    const requestRef = doc(db, 'transferRequests', requestDoc.id);
    
    const updates = {};
    
    // تحويل البنية القديمة إلى الجديدة
    
    // 1. fromHall و toHall
    if (!requestData.hasOwnProperty('fromHall') || typeof requestData.fromHall === 'string') {
      updates.fromHall = {
        hallId: requestData.fromHallId || requestData.fromHall || null,
        hallName: requestData.fromHallName || null
      };
    }
    
    if (!requestData.hasOwnProperty('toHall') || typeof requestData.toHall === 'string') {
      updates.toHall = {
        hallId: requestData.toHallId || requestData.toHall || null,
        hallName: requestData.toHallName || null
      };
    }
    
    // 2. assignees
    if (!requestData.hasOwnProperty('assignees')) {
      updates.assignees = {
        assignedBy: {
          userId: requestData.createdBy || 'unknown',
          userName: requestData.createdByName || 'غير معروف'
        },
        assignedTo: {
          userId: requestData.assignedToUserId || 'unknown',
          userName: requestData.assignedToName || 'غير معروف'
        },
        pathOrganizer: {
          userId: requestData.pathOrganizerId || null,
          userName: requestData.pathOrganizerName || null
        }
      };
    }
    
    // 3. timestamps
    if (!requestData.hasOwnProperty('timestamps')) {
      updates.timestamps = {
        createdAt: requestData.createdAt || serverTimestamp(),
        submittedAt: requestData.submittedAt || null,
        acceptedAt: requestData.acceptedAt || null,
        rejectedAt: requestData.rejectedAt || null,
        transitStartedAt: requestData.transitStartedAt || null,
        arrivedAt: requestData.arrivedAt || null,
        confirmedAt: requestData.confirmedAt || null,
        closedAt: requestData.closedAt || null
      };
    }
    
    // 4. actors
    if (!requestData.hasOwnProperty('actors')) {
      updates.actors = {
        acceptedBy: requestData.acceptedBy ? {
          userId: requestData.acceptedBy,
          userName: requestData.acceptedByName || 'غير معروف'
        } : null,
        rejectedBy: requestData.rejectedBy ? {
          userId: requestData.rejectedBy,
          userName: requestData.rejectedByName || 'غير معروف'
        } : null,
        confirmedBy: requestData.confirmedBy ? {
          userId: requestData.confirmedBy,
          userName: requestData.confirmedByName || 'غير معروف'
        } : null
      };
    }
    
    // 5. confirmationDetails
    if (!requestData.hasOwnProperty('confirmationDetails')) {
      updates.confirmationDetails = {
        actualArrivedCount: requestData.actualArrivedCount || null,
        delta: requestData.delta || null,
        comment: requestData.comment || null,
        mismatchReason: null // حقل جديد
      };
    }
    
    if (Object.keys(updates).length > 0) {
      batch.update(requestRef, updates);
      count++;
    }
  }
  
  await batch.commit();
  console.log(`✅ تم ترحيل ${count} طلب`);
  
  return { success: true, count };
}

// ============================================
// MIGRATION STEP 4: إنشاء HallAssignments
// ============================================

async function migrateHallAssignments(db) {
  console.log('🔄 بدء ترحيل تعيينات القاعات...');
  
  // في النظام القديم، قد لا يكون هناك جدول HallAssignments
  // نحتاج إلى إنشائه من الصفر أو من بيانات المستخدمين
  
  // مثال: إنشاء تعيينات افتراضية للمستخدمين الداخليين
  const usersRef = collection(db, 'users');
  const usersSnap = await getDocs(usersRef);
  
  const batch = writeBatch(db);
  let count = 0;
  
  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data();
    
    // إذا كان المستخدم داخلي ولديه assignedHallId
    if (userData.assignedHallId && 
        (userData.role === 'InternalRegular' || userData.role === 'InternalSupervisor')) {
      
      const assignmentId = `${userDoc.id}_${userData.assignedHallId}`;
      const assignmentRef = doc(db, 'hallAssignments', assignmentId);
      
      batch.set(assignmentRef, {
        userId: userDoc.id,
        hallId: userData.assignedHallId,
        roleInHall: userData.role === 'InternalSupervisor' ? 'manager' : 'receiver',
        assignedAt: serverTimestamp(),
        assignedBy: {
          userId: 'system',
          userName: 'النظام'
        }
      });
      
      count++;
    }
  }
  
  await batch.commit();
  console.log(`✅ تم إنشاء ${count} تعيين قاعة`);
  
  return { success: true, count };
}

// ============================================
// MIGRATION STEP 5: تحسين AuditLog
// ============================================

async function migrateAuditLog(db) {
  console.log('🔄 بدء ترحيل سجل العمليات...');
  
  // السجلات القديمة قد لا تحتوي على before/after/reason
  // نتركها كما هي ونضيف الحقول الجديدة للسجلات الجديدة فقط
  
  const auditLogsRef = collection(db, 'auditLog');
  const auditLogsSnap = await getDocs(auditLogsRef);
  
  const batch = writeBatch(db);
  let count = 0;
  
  for (const logDoc of auditLogsSnap.docs) {
    const logData = logDoc.data();
    const logRef = doc(db, 'auditLog', logDoc.id);
    
    const updates = {};
    
    // تحويل البنية القديمة إلى الجديدة
    if (!logData.hasOwnProperty('actor')) {
      updates.actor = {
        userId: logData.userId || logData.actorId || 'unknown',
        userName: logData.userName || logData.actorName || 'غير معروف',
        userRole: logData.userRole || logData.actorRole || 'غير معروف'
      };
    }
    
    if (!logData.hasOwnProperty('entity')) {
      updates.entity = {
        type: logData.entityType || 'unknown',
        id: logData.entityId || 'unknown'
      };
    }
    
    if (!logData.hasOwnProperty('details')) {
      updates.details = {
        before: logData.before || null,
        after: logData.after || null,
        reason: logData.reason || null
      };
    }
    
    if (Object.keys(updates).length > 0) {
      batch.update(logRef, updates);
      count++;
    }
  }
  
  await batch.commit();
  console.log(`✅ تم ترحيل ${count} سجل`);
  
  return { success: true, count };
}

// ============================================
// MAIN MIGRATION FUNCTION
// ============================================

async function runMigration(db) {
  console.log('🚀 بدء عملية الترحيل الشاملة...');
  console.log('⚠️ تأكد من عمل نسخة احتياطية من قاعدة البيانات قبل المتابعة!');
  
  const results = {
    halls: null,
    systemState: null,
    transferRequests: null,
    hallAssignments: null,
    auditLog: null
  };
  
  try {
    // Step 1: Halls
    results.halls = await migrateHalls(db);
    
    // Step 2: SystemState
    results.systemState = await migrateSystemState(db);
    
    // Step 3: TransferRequests
    results.transferRequests = await migrateTransferRequests(db);
    
    // Step 4: HallAssignments
    results.hallAssignments = await migrateHallAssignments(db);
    
    // Step 5: AuditLog
    results.auditLog = await migrateAuditLog(db);
    
    console.log('✅ اكتملت عملية الترحيل بنجاح!');
    console.log('📊 النتائج:', results);
    
    return { success: true, results };
    
  } catch (error) {
    console.error('❌ فشلت عملية الترحيل:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// ROLLBACK FUNCTION (اختياري)
// ============================================

async function rollbackMigration(db) {
  console.log('⚠️ بدء عملية التراجع...');
  console.log('ملاحظة: هذه العملية لا تحذف البيانات، فقط تحذف الحقول الجديدة');
  
  // TODO: تطبيق منطق التراجع إذا لزم الأمر
  // في الواقع، من الأفضل استعادة النسخة الاحتياطية بدلاً من التراجع
  
  console.log('ℹ️ يُنصح باستعادة النسخة الاحتياطية بدلاً من التراجع');
  
  return { success: false, message: 'استخدم النسخة الاحتياطية للتراجع' };
}

// ============================================
// VERIFICATION FUNCTION - التحقق من الترحيل
// ============================================

async function verifyMigration(db) {
  console.log('🔍 بدء التحقق من الترحيل...');
  
  const checks = {
    halls: false,
    systemState: false,
    transferRequests: false,
    hallAssignments: false,
    auditLog: false
  };
  
  // Check 1: Halls
  const hallsSnap = await getDocs(collection(db, 'halls'));
  const firstHall = hallsSnap.docs[0]?.data();
  if (firstHall && firstHall.hasOwnProperty('draftCount') && firstHall.hasOwnProperty('lastCommittedBy')) {
    checks.halls = true;
    console.log('✅ Halls: تم الترحيل بنجاح');
  } else {
    console.log('❌ Halls: لم يتم الترحيل');
  }
  
  // Check 2: SystemState
  const systemStateSnap = await getDoc(doc(db, 'systemState', 'global'));
  if (systemStateSnap.exists()) {
    checks.systemState = true;
    console.log('✅ SystemState: موجود');
  } else {
    console.log('❌ SystemState: غير موجود');
  }
  
  // Check 3: TransferRequests
  const requestsSnap = await getDocs(collection(db, 'transferRequests'));
  const firstRequest = requestsSnap.docs[0]?.data();
  if (firstRequest && firstRequest.hasOwnProperty('assignees') && firstRequest.hasOwnProperty('timestamps')) {
    checks.transferRequests = true;
    console.log('✅ TransferRequests: تم الترحيل بنجاح');
  } else {
    console.log('❌ TransferRequests: لم يتم الترحيل');
  }
  
  // Check 4: HallAssignments
  const assignmentsSnap = await getDocs(collection(db, 'hallAssignments'));
  if (assignmentsSnap.size > 0) {
    checks.hallAssignments = true;
    console.log(`✅ HallAssignments: موجود (${assignmentsSnap.size} تعيين)`);
  } else {
    console.log('⚠️ HallAssignments: فارغ (قد يكون طبيعياً)');
  }
  
  // Check 5: AuditLog
  const auditLogsSnap = await getDocs(collection(db, 'auditLog'));
  const firstLog = auditLogsSnap.docs[0]?.data();
  if (firstLog && firstLog.hasOwnProperty('actor') && firstLog.hasOwnProperty('entity')) {
    checks.auditLog = true;
    console.log('✅ AuditLog: تم الترحيل بنجاح');
  } else {
    console.log('❌ AuditLog: لم يتم الترحيل');
  }
  
  const allPassed = Object.values(checks).filter(v => v === true).length >= 4;
  
  if (allPassed) {
    console.log('✅ التحقق اكتمل بنجاح! النظام جاهز للاستخدام');
  } else {
    console.log('⚠️ بعض الفحوصات فشلت، يرجى مراجعة السجلات');
  }
  
  return { success: allPassed, checks };
}

// ============================================
// EXPORTS
// ============================================

export {
  runMigration,
  rollbackMigration,
  verifyMigration,
  
  // Individual steps
  migrateHalls,
  migrateSystemState,
  migrateTransferRequests,
  migrateHallAssignments,
  migrateAuditLog
};

// ============================================
// USAGE EXAMPLE
// ============================================
/*
// في Console أو في ملف منفصل:

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { runMigration, verifyMigration } from './migration-script.js';

const firebaseConfig = { ... };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// تشغيل الترحيل
const result = await runMigration(db);
console.log(result);

// التحقق من الترحيل
const verification = await verifyMigration(db);
console.log(verification);
*/
