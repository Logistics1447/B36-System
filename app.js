// ============================================
// B36 HALL MANAGEMENT SYSTEM v33 - INTEGRATED
// ============================================
// هذا الملف يدمج النظام القديم مع جميع التحديثات الجديدة

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot, getDoc, getDocs, setDoc, updateDoc, increment, writeBatch, deleteDoc, serverTimestamp, query, orderBy, limit, where, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// استيراد الوظائف الجديدة
import { 
  ROLES, 
  PERMISSIONS, 
  hasPermission as checkPermission,
  commitHallCount,
  acceptRequest,
  rejectRequest,
  startTransit,
  confirmArrival,
  logAudit,
  canActOnHall
} from './backend-api.js';

import {
  createTransferRequest,
  handleRequestAction
} from './workflow-engine.js';

import {
  renderHallControlView
} from './hall-control-ui.js';

import {
  renderCommandCenter
} from './dashboard-command-center.js';

// ============================================
// FIREBASE CONFIG
// ============================================

const firebaseConfig = {
    apiKey: "AIzaSyAHzKx8e5cXP33zfSON_X1RC4Ek7JukaPg",
    authDomain: "b36-hall-mgmt.firebaseapp.com",
    projectId: "b36-hall-mgmt",
    storageBucket: "b36-hall-mgmt.firebasestorage.app",
    messagingSenderId: "972582807480",
    appId: "1:972582807480:web:bf5080de188b588325d14d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ============================================
// GLOBAL STATE
// ============================================

let currentUser = null;
let halls = [];
let requests = [];
let users = [];
let unsubscribeHalls = null;
let unsubscribeRequests = null;

// ============================================
// AUTH & LOGIN
// ============================================

window.login = async function() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!username || !password) {
        showToast('الرجاء إدخال اسم المستخدم وكلمة المرور', 'error');
        return;
    }

    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('username', '==', username));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            showToast('اسم المستخدم أو كلمة المرور غير صحيحة', 'error');
            return;
        }

        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();

        if (userData.password !== password) {
            showToast('اسم المستخدم أو كلمة المرور غير صحيحة', 'error');
            return;
        }

        currentUser = {
            id: userDoc.id,
            ...userData
        };

        // حفظ في localStorage
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        showToast(`مرحباً ${currentUser.name}!`, 'success');
        
        // الانتقال إلى الداشبورد
        document.getElementById('loginPage').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        
        // تحميل البيانات
        await loadData();
        
        // عرض الداشبورد
        showView('dashboard');

    } catch (error) {
        console.error('Login error:', error);
        showToast('حدث خطأ أثناء تسجيل الدخول', 'error');
    }
};

window.logout = function() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    
    // إيقاف الاستماع
    if (unsubscribeHalls) unsubscribeHalls();
    if (unsubscribeRequests) unsubscribeRequests();
    
    // العودة لصفحة تسجيل الدخول
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('loginPage').classList.remove('hidden');
    
    showToast('تم تسجيل الخروج بنجاح', 'info');
};

// التحقق من الجلسة السابقة
window.addEventListener('DOMContentLoaded', async () => {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            document.getElementById('loginPage').classList.add('hidden');
            document.getElementById('mainApp').classList.remove('hidden');
            await loadData();
            showView('dashboard');
        } catch (error) {
            console.error('Session restore error:', error);
            logout();
        }
    }
});

// ============================================
// DATA LOADING
// ============================================

async function loadData() {
    // تحميل القاعات
    unsubscribeHalls = onSnapshot(
        query(collection(db, 'halls'), orderBy('name')),
        (snapshot) => {
            halls = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            // تحديث العرض إذا كان في صفحة القاعات أو الداشبورد
            const currentView = document.querySelector('.view-content:not(.hidden)')?.id;
            if (currentView === 'dashboardView') {
                showView('dashboard');
            } else if (currentView === 'hallsView') {
                showView('halls');
            }
        }
    );
    
    // تحميل الطلبات
    unsubscribeRequests = onSnapshot(
        query(collection(db, 'transferRequests'), orderBy('timestamps.createdAt', 'desc')),
        (snapshot) => {
            requests = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            // تحديث العرض إذا كان في صفحة الطلبات أو الداشبورد
            const currentView = document.querySelector('.view-content:not(.hidden)')?.id;
            if (currentView === 'dashboardView') {
                showView('dashboard');
            } else if (currentView === 'requestsView') {
                showView('requests');
            }
        }
    );
    
    // تحميل المستخدمين (للمشرفين فقط)
    if (currentUser.role === ROLES.ADMIN || currentUser.role === ROLES.INTERNAL_SUPERVISOR) {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        users = usersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    }
}

// ============================================
// VIEW MANAGEMENT
// ============================================

window.showView = async function(viewName) {
    // إخفاء جميع الصفحات
    document.querySelectorAll('.view-content').forEach(view => {
        view.classList.add('hidden');
    });
    
    // إزالة active من جميع الأزرار
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // تفعيل الزر المناسب
    const activeBtn = document.querySelector(`[onclick="showView('${viewName}')"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    // عرض الصفحة المطلوبة
    switch(viewName) {
        case 'dashboard':
            document.getElementById('dashboardView').classList.remove('hidden');
            await renderDashboard();
            break;
            
        case 'halls':
            document.getElementById('hallsView').classList.remove('hidden');
            await renderHalls();
            break;
            
        case 'requests':
            document.getElementById('requestsView').classList.remove('hidden');
            await renderRequests();
            break;
            
        case 'analytics':
            document.getElementById('analyticsView').classList.remove('hidden');
            await renderAnalytics();
            break;
            
        case 'audit':
            document.getElementById('auditView').classList.remove('hidden');
            await renderAuditLog();
            break;
            
        default:
            document.getElementById('dashboardView').classList.remove('hidden');
            await renderDashboard();
    }
};

// ============================================
// DASHBOARD RENDERING - استخدام Dashboard الجديد
// ============================================

async function renderDashboard() {
    try {
        await renderCommandCenter(db, currentUser, halls, requests);
    } catch (error) {
        console.error('Dashboard render error:', error);
        // Fallback إلى الداشبورد القديم
        renderDashboardFallback();
    }
}

function renderDashboardFallback() {
    const container = document.getElementById('dashboardView');
    container.innerHTML = `
        <div class="p-6">
            <h1 class="text-3xl font-bold mb-6">لوحة التحكم</h1>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="bg-white p-6 rounded-lg shadow">
                    <h3 class="text-lg font-bold mb-2">عدد القاعات</h3>
                    <p class="text-4xl font-bold text-blue-600">${halls.length}</p>
                </div>
                <div class="bg-white p-6 rounded-lg shadow">
                    <h3 class="text-lg font-bold mb-2">الطلبات النشطة</h3>
                    <p class="text-4xl font-bold text-green-600">${requests.filter(r => r.status !== 'closed').length}</p>
                </div>
                <div class="bg-white p-6 rounded-lg shadow">
                    <h3 class="text-lg font-bold mb-2">إجمالي المرشحين</h3>
                    <p class="text-4xl font-bold text-purple-600">${halls.reduce((sum, h) => sum + (h.currentCount || 0), 0)}</p>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// HALLS RENDERING - استخدام Hall Control الجديد
// ============================================

async function renderHalls() {
    try {
        await renderHallControlView(db, currentUser, halls);
    } catch (error) {
        console.error('Halls render error:', error);
        // Fallback إلى العرض القديم
        renderHallsFallback();
    }
}

function renderHallsFallback() {
    const container = document.getElementById('hallsView');
    
    let html = `
        <div class="p-6">
            <div class="flex items-center justify-between mb-6">
                <h1 class="text-3xl font-bold">القاعات</h1>
                ${checkPermission(currentUser, PERMISSIONS.MANAGE_HALLS) ? `
                    <button onclick="showAddHallModal()" class="btn-primary">
                        <i class="ph ph-plus"></i>
                        إضافة قاعة
                    </button>
                ` : ''}
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${halls.map(hall => `
                    <div class="bg-white p-6 rounded-lg shadow hover:shadow-lg transition">
                        <h3 class="text-xl font-bold mb-4">${hall.name}</h3>
                        <div class="space-y-2">
                            <div class="flex justify-between">
                                <span>العدد الحالي:</span>
                                <span class="font-bold">${hall.currentCount || 0}</span>
                            </div>
                            <div class="flex justify-between">
                                <span>السعة:</span>
                                <span class="font-bold">${hall.capacity}</span>
                            </div>
                            <div class="flex justify-between">
                                <span>المتبقي:</span>
                                <span class="font-bold text-green-600">${hall.capacity - (hall.currentCount || 0)}</span>
                            </div>
                        </div>
                        ${checkPermission(currentUser, PERMISSIONS.MANAGE_HALLS) || canActOnHall(db, currentUser, hall.id) ? `
                            <button onclick="showEditHallModal('${hall.id}')" class="btn-secondary w-full mt-4">
                                تعديل
                            </button>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

// ============================================
// REQUESTS RENDERING
// ============================================

async function renderRequests() {
    const container = document.getElementById('requestsView');
    
    // تصفية الطلبات حسب الصلاحيات
    let filteredRequests = requests;
    
    if (currentUser.role === ROLES.INTERNAL_REGULAR) {
        // عرض الطلبات المتعلقة بقاعته فقط
        filteredRequests = requests.filter(r => 
            r.toHall?.hallId === currentUser.assignedHallId ||
            r.fromHall?.hallId === currentUser.assignedHallId
        );
    }
    
    let html = `
        <div class="p-6">
            <div class="flex items-center justify-between mb-6">
                <h1 class="text-3xl font-bold">طلبات النقل</h1>
                ${checkPermission(currentUser, PERMISSIONS.CREATE_OUTSIDE_TO_WAITING) || 
                  checkPermission(currentUser, PERMISSIONS.CREATE_WAITING_TO_INTERVIEW) ? `
                    <button onclick="showCreateRequestModal()" class="btn-primary">
                        <i class="ph ph-plus"></i>
                        إنشاء طلب
                    </button>
                ` : ''}
            </div>
            
            <div class="space-y-4">
                ${filteredRequests.length === 0 ? `
                    <div class="text-center py-12 text-gray-500">
                        <i class="ph ph-folder-open text-6xl mb-4"></i>
                        <p>لا توجد طلبات</p>
                    </div>
                ` : filteredRequests.map(request => renderRequestCard(request)).join('')}
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

function renderRequestCard(request) {
    const statusColors = {
        'draft': 'bg-gray-100 text-gray-700',
        'pending': 'bg-yellow-100 text-yellow-700',
        'accepted': 'bg-green-100 text-green-700',
        'rejected': 'bg-red-100 text-red-700',
        'in_transit': 'bg-blue-100 text-blue-700',
        'arrived': 'bg-purple-100 text-purple-700',
        'closed': 'bg-gray-100 text-gray-700'
    };
    
    const statusText = {
        'draft': 'مسودة',
        'pending': 'بانتظار الموافقة',
        'accepted': 'مقبول',
        'rejected': 'مرفوض',
        'in_transit': 'قيد النقل',
        'arrived': 'وصل',
        'closed': 'مغلق'
    };
    
    return `
        <div class="bg-white p-6 rounded-lg shadow">
            <div class="flex items-start justify-between mb-4">
                <div>
                    <span class="px-3 py-1 rounded-full text-sm font-bold ${statusColors[request.status]}">
                        ${statusText[request.status]}
                    </span>
                </div>
                <div class="text-sm text-gray-500">
                    #${request.id.substring(0, 8)}
                </div>
            </div>
            
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <p class="text-sm text-gray-600">من:</p>
                    <p class="font-bold">${request.fromHall?.hallName || 'خارج المبنى'}</p>
                </div>
                <div>
                    <p class="text-sm text-gray-600">إلى:</p>
                    <p class="font-bold">${request.toHall?.hallName}</p>
                </div>
            </div>
            
            <div class="mb-4">
                <p class="text-sm text-gray-600">العدد المطلوب:</p>
                <p class="text-2xl font-bold text-blue-600">${request.requestedCount}</p>
            </div>
            
            ${renderRequestActions(request)}
        </div>
    `;
}

function renderRequestActions(request) {
    let actions = [];
    
    // حسب حالة الطلب والصلاحيات
    if (request.status === 'pending' && checkPermission(currentUser, PERMISSIONS.ACCEPT_REJECT_REQUEST)) {
        if (canActOnHall(db, currentUser, request.toHall?.hallId)) {
            actions.push(`
                <button onclick="handleAcceptRequest('${request.id}')" class="btn-primary">
                    قبول
                </button>
                <button onclick="handleRejectRequest('${request.id}')" class="btn-danger">
                    رفض
                </button>
            `);
        }
    }
    
    if (request.status === 'accepted' && checkPermission(currentUser, PERMISSIONS.START_TRANSIT)) {
        if (request.assignees.pathOrganizer?.userId === currentUser.id || currentUser.role === ROLES.ADMIN) {
            actions.push(`
                <button onclick="handleStartTransit('${request.id}')" class="btn-primary">
                    بدء النقل
                </button>
            `);
        }
    }
    
    if (request.status === 'in_transit' && checkPermission(currentUser, PERMISSIONS.CONFIRM_ARRIVAL)) {
        if (canActOnHall(db, currentUser, request.toHall?.hallId)) {
            actions.push(`
                <button onclick="handleConfirmArrival('${request.id}')" class="btn-primary">
                    مصادقة الوصول
                </button>
            `);
        }
    }
    
    if (actions.length === 0) return '';
    
    return `<div class="flex gap-2 mt-4">${actions.join('')}</div>`;
}

// ============================================
// REQUEST ACTIONS - استخدام الوظائف الجديدة
// ============================================

window.handleAcceptRequest = async function(requestId) {
    try {
        await acceptRequest(db, currentUser, requestId);
        showToast('تم قبول الطلب بنجاح', 'success');
    } catch (error) {
        console.error('Accept request error:', error);
        showToast(error.message || 'حدث خطأ أثناء قبول الطلب', 'error');
    }
};

window.handleRejectRequest = async function(requestId) {
    const reason = prompt('الرجاء إدخال سبب الرفض:');
    if (!reason) return;
    
    try {
        await rejectRequest(db, currentUser, requestId, reason);
        showToast('تم رفض الطلب', 'info');
    } catch (error) {
        console.error('Reject request error:', error);
        showToast(error.message || 'حدث خطأ أثناء رفض الطلب', 'error');
    }
};

window.handleStartTransit = async function(requestId) {
    try {
        await startTransit(db, currentUser, requestId);
        showToast('تم بدء النقل بنجاح', 'success');
    } catch (error) {
        console.error('Start transit error:', error);
        showToast(error.message || 'حدث خطأ أثناء بدء النقل', 'error');
    }
};

window.handleConfirmArrival = async function(requestId) {
    const request = requests.find(r => r.id === requestId);
    if (!request) return;
    
    const actualCount = prompt(`الرجاء إدخال العدد الفعلي الذي وصل (المطلوب: ${request.requestedCount}):`);
    if (actualCount === null) return;
    
    const actualArrivedCount = parseInt(actualCount);
    if (isNaN(actualArrivedCount) || actualArrivedCount < 0) {
        showToast('الرجاء إدخال عدد صحيح', 'error');
        return;
    }
    
    let comment = null;
    let mismatchReason = null;
    
    if (actualArrivedCount !== request.requestedCount) {
        comment = prompt('يوجد فرق بين العدد المطلوب والفعلي. الرجاء إدخال تعليق:');
        if (!comment) {
            showToast('التعليق إلزامي عند وجود فرق', 'error');
            return;
        }
        mismatchReason = prompt('الرجاء إدخال سبب الفرق:');
        if (!mismatchReason) {
            showToast('سبب الفرق إلزامي', 'error');
            return;
        }
    }
    
    try {
        await confirmArrival(db, currentUser, requestId, actualArrivedCount, comment, mismatchReason);
        showToast('تم مصادقة الوصول بنجاح', 'success');
    } catch (error) {
        console.error('Confirm arrival error:', error);
        showToast(error.message || 'حدث خطأ أثناء مصادقة الوصول', 'error');
    }
};

// ============================================
// ANALYTICS RENDERING
// ============================================

async function renderAnalytics() {
    const container = document.getElementById('analyticsView');
    
    if (!checkPermission(currentUser, PERMISSIONS.VIEW_ANALYTICS)) {
        container.innerHTML = `
            <div class="p-6 text-center">
                <i class="ph ph-lock text-6xl text-gray-400 mb-4"></i>
                <p class="text-gray-600">ليس لديك صلاحية لعرض الإحصائيات</p>
            </div>
        `;
        return;
    }
    
    // حساب الإحصائيات
    const totalHalls = halls.length;
    const totalCapacity = halls.reduce((sum, h) => sum + h.capacity, 0);
    const totalOccupied = halls.reduce((sum, h) => sum + (h.currentCount || 0), 0);
    const totalRequests = requests.length;
    const closedRequests = requests.filter(r => r.status === 'closed').length;
    
    container.innerHTML = `
        <div class="p-6">
            <h1 class="text-3xl font-bold mb-6">الإحصائيات</h1>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div class="bg-white p-6 rounded-lg shadow">
                    <h3 class="text-sm text-gray-600 mb-2">إجمالي القاعات</h3>
                    <p class="text-4xl font-bold text-blue-600">${totalHalls}</p>
                </div>
                <div class="bg-white p-6 rounded-lg shadow">
                    <h3 class="text-sm text-gray-600 mb-2">السعة الكلية</h3>
                    <p class="text-4xl font-bold text-green-600">${totalCapacity}</p>
                </div>
                <div class="bg-white p-6 rounded-lg shadow">
                    <h3 class="text-sm text-gray-600 mb-2">المرشحين الحاليين</h3>
                    <p class="text-4xl font-bold text-purple-600">${totalOccupied}</p>
                </div>
                <div class="bg-white p-6 rounded-lg shadow">
                    <h3 class="text-sm text-gray-600 mb-2">نسبة الإشغال</h3>
                    <p class="text-4xl font-bold text-orange-600">${((totalOccupied / totalCapacity) * 100).toFixed(1)}%</p>
                </div>
            </div>
            
            <div class="bg-white p-6 rounded-lg shadow mb-8">
                <h2 class="text-xl font-bold mb-4">إحصائيات الطلبات</h2>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-gray-600">إجمالي الطلبات:</p>
                        <p class="text-2xl font-bold">${totalRequests}</p>
                    </div>
                    <div>
                        <p class="text-gray-600">الطلبات المكتملة:</p>
                        <p class="text-2xl font-bold text-green-600">${closedRequests}</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// AUDIT LOG RENDERING
// ============================================

async function renderAuditLog() {
    const container = document.getElementById('auditView');
    
    if (!checkPermission(currentUser, PERMISSIONS.VIEW_AUDIT_LOG)) {
        container.innerHTML = `
            <div class="p-6 text-center">
                <i class="ph ph-lock text-6xl text-gray-400 mb-4"></i>
                <p class="text-gray-600">ليس لديك صلاحية لعرض سجل العمليات</p>
            </div>
        `;
        return;
    }
    
    try {
        const auditLogsRef = collection(db, 'auditLog');
        const q = query(auditLogsRef, orderBy('timestamp', 'desc'), limit(50));
        const snapshot = await getDocs(q);
        
        const logs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        container.innerHTML = `
            <div class="p-6">
                <h1 class="text-3xl font-bold mb-6">سجل العمليات</h1>
                
                <div class="bg-white rounded-lg shadow overflow-hidden">
                    <table class="w-full">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">التاريخ</th>
                                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">المستخدم</th>
                                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">العملية</th>
                                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">التفاصيل</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200">
                            ${logs.map(log => `
                                <tr>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        ${log.timestamp?.toDate().toLocaleString('ar-EG')}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        ${log.actor?.userName || 'غير معروف'}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        ${log.action}
                                    </td>
                                    <td class="px-6 py-4 text-sm text-gray-500">
                                        ${JSON.stringify(log.details || {}, null, 2)}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Audit log render error:', error);
        container.innerHTML = `
            <div class="p-6 text-center text-red-600">
                <p>حدث خطأ أثناء تحميل سجل العمليات</p>
            </div>
        `;
    }
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white z-50 ${
        type === 'success' ? 'bg-green-500' :
        type === 'error' ? 'bg-red-500' :
        type === 'warning' ? 'bg-yellow-500' :
        'bg-blue-500'
    }`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

window.showToast = showToast;

// ============================================
// EXPORTS
// ============================================

export {
    db,
    currentUser,
    halls,
    requests,
    users,
    showToast
};
