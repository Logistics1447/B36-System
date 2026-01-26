// ============================================
// B36 HALL MANAGEMENT SYSTEM v33 - STANDALONE
// ============================================
// نسخة مستقلة بدون dependencies خارجية

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot, getDoc, getDocs, setDoc, updateDoc, increment, writeBatch, deleteDoc, serverTimestamp, query, orderBy, limit, where, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
// ROLES & PERMISSIONS
// ============================================

const ROLES = {
    ADMIN: 'يوزر_المدير_العام',
    EXTERNAL_SUPERVISOR: 'يوزر_المنظم_الخارجي_مشرف',
    EXTERNAL_REGULAR: 'يوزر_المنظم_الخارجي_عادي',
    INTERNAL_SUPERVISOR: 'يوزر_المنظم_الداخلي_مشرف_المبنى',
    INTERNAL_REGULAR: 'يوزر_المنظم_الداخلي_عادي',
    VIEWER: 'يوزر_العرض'
};

const PERMISSIONS = {
    MANAGE_OUTSIDE_COUNT: 'manage_outside_count',
    VIEW_OUTSIDE_COUNT: 'view_outside_count',
    CREATE_OUTSIDE_TO_WAITING: 'create_outside_to_waiting',
    CREATE_WAITING_TO_INTERVIEW: 'create_waiting_to_interview',
    ACCEPT_REJECT_REQUEST: 'accept_reject_request',
    CONFIRM_ARRIVAL: 'confirm_arrival',
    MANAGE_HALLS: 'manage_halls',
    ASSIGN_USERS: 'assign_users',
    VIEW_AUDIT_LOG: 'view_audit_log',
    VIEW_ANALYTICS: 'view_analytics'
};

const ROLE_PERMISSIONS = {
    [ROLES.ADMIN]: Object.values(PERMISSIONS),
    [ROLES.EXTERNAL_SUPERVISOR]: [
        PERMISSIONS.MANAGE_OUTSIDE_COUNT,
        PERMISSIONS.VIEW_OUTSIDE_COUNT,
        PERMISSIONS.CREATE_OUTSIDE_TO_WAITING,
        PERMISSIONS.VIEW_ANALYTICS
    ],
    [ROLES.EXTERNAL_REGULAR]: [
        PERMISSIONS.MANAGE_OUTSIDE_COUNT,
        PERMISSIONS.VIEW_OUTSIDE_COUNT
    ],
    [ROLES.INTERNAL_SUPERVISOR]: [
        PERMISSIONS.CREATE_WAITING_TO_INTERVIEW,
        PERMISSIONS.ACCEPT_REJECT_REQUEST,
        PERMISSIONS.CONFIRM_ARRIVAL,
        PERMISSIONS.VIEW_ANALYTICS,
        PERMISSIONS.MANAGE_HALLS
    ],
    [ROLES.INTERNAL_REGULAR]: [
        PERMISSIONS.ACCEPT_REJECT_REQUEST,
        PERMISSIONS.CONFIRM_ARRIVAL
    ],
    [ROLES.VIEWER]: [
        PERMISSIONS.VIEW_OUTSIDE_COUNT,
        PERMISSIONS.VIEW_ANALYTICS
    ]
};

function hasPermission(permission) {
    if (!currentUser) return false;
    const rolePermissions = ROLE_PERMISSIONS[currentUser.role] || [];
    return rolePermissions.includes(permission);
}

// ============================================
// GLOBAL STATE
// ============================================

let currentUser = null;
let halls = [];
let requests = [];
let users = [];
let globalStats = {
    served_count: 0,
    outdoor_queue: 0,
    missing_count: 0
};

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
        // البحث بـ id بدلاً من username
        const userDoc = await getDoc(doc(db, 'users', username));

        if (!userDoc.exists()) {
            showToast('اسم المستخدم أو كلمة المرور غير صحيحة', 'error');
            return;
        }

        const userData = userDoc.data();

        if (userData.pass !== password) {
            showToast('اسم المستخدم أو كلمة المرور غير صحيحة', 'error');
            return;
        }

        currentUser = {
            id: userDoc.id,
            ...userData
        };

        // حفظ في localStorage
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        showToast(`مرحباً ${currentUser.fullName || currentUser.id}!`, 'success');
        
        // الانتقال إلى الداشبورد
        document.getElementById('loginPage').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        
        // تحديث اسم المستخدم والدور في الواجهة
        document.getElementById('userName').textContent = currentUser.fullName || currentUser.id;
        document.getElementById('userRole').textContent = currentUser.role || 'غير محدد';
        
        // تحميل البيانات
        await loadData();
        
        // عرض الداشبورد
        showView('dashboard');

    } catch (error) {
        console.error('Login error:', error);
        showToast('حدث خطأ أثناء تسجيل الدخول: ' + error.message, 'error');
    }
};

window.logout = function() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    
    // العودة لصفحة تسجيل الدخول
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('loginPage').classList.remove('hidden');
    
    showToast('تم تسجيل الخروج بنجاح', 'info');
};

// ============================================
// DATA LOADING
// ============================================

async function loadData() {
    try {
        // تحميل الإحصائيات
        const statsDoc = await getDoc(doc(db, 'settings', 'global_config'));
        if (statsDoc.exists()) {
            globalStats = statsDoc.data();
        }

        // تحميل القاعات
        const hallsSnapshot = await getDocs(collection(db, 'halls'));
        halls = [];
        hallsSnapshot.forEach(doc => {
            halls.push({ id: doc.id, ...doc.data() });
        });

        // تحميل الطلبات
        const requestsSnapshot = await getDocs(collection(db, 'transfer_requests'));
        requests = [];
        requestsSnapshot.forEach(doc => {
            requests.push({ id: doc.id, ...doc.data() });
        });

        console.log('✅ تم تحميل البيانات:', { halls: halls.length, requests: requests.length });

    } catch (error) {
        console.error('Error loading data:', error);
        showToast('حدث خطأ في تحميل البيانات', 'error');
    }
}

// ============================================
// VIEW MANAGEMENT
// ============================================

window.showView = function(viewName) {
    // إخفاء جميع الـ views
    document.querySelectorAll('.view-content').forEach(view => {
        view.classList.add('hidden');
    });

    // إزالة active من جميع الأزرار
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // عرض الـ view المطلوب
    const viewElement = document.getElementById(viewName + 'View');
    if (viewElement) {
        viewElement.classList.remove('hidden');
    }

    // تفعيل الزر المناسب
    const activeButton = Array.from(document.querySelectorAll('.nav-btn')).find(btn => {
        return btn.textContent.includes(getViewLabel(viewName));
    });
    if (activeButton) {
        activeButton.classList.add('active');
    }

    // عرض المحتوى حسب النوع
    switch(viewName) {
        case 'dashboard':
            renderDashboard();
            break;
        case 'halls':
            renderHalls();
            break;
        case 'requests':
            renderRequests();
            break;
        case 'analytics':
            renderAnalytics();
            break;
        case 'audit':
            renderAuditLog();
            break;
    }
};

function getViewLabel(viewName) {
    const labels = {
        'dashboard': 'لوحة التحكم',
        'halls': 'القاعات',
        'requests': 'طلبات النقل',
        'analytics': 'الإحصائيات',
        'audit': 'سجل العمليات'
    };
    return labels[viewName] || '';
}

// ============================================
// DASHBOARD RENDERING
// ============================================

function renderDashboard() {
    const view = document.getElementById('dashboardView');
    
    const waitingHalls = halls.filter(h => h.type === 'انتظار' && h.active);
    const interviewHalls = halls.filter(h => h.type === 'مقابلات' && h.active);
    
    const totalWaiting = waitingHalls.reduce((sum, h) => sum + (h.current || 0), 0);
    const totalInterview = interviewHalls.reduce((sum, h) => sum + (h.current || 0), 0);
    const totalCapacity = halls.filter(h => h.active).reduce((sum, h) => sum + (h.capacity || 0), 0);
    const totalCurrent = totalWaiting + totalInterview;

    view.innerHTML = `
        <div class="p-6">
            <h1 class="text-3xl font-black text-slate-800 dark:text-white mb-6">لوحة التحكم</h1>
            
            <!-- KPIs -->
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                <div class="bg-gradient-to-br from-orange-400 to-orange-500 rounded-xl shadow-lg p-6 text-white">
                    <div class="text-sm opacity-90 mb-2">ينتظرون خارجاً</div>
                    <div class="text-4xl font-black">${globalStats.outdoor_queue || 0}</div>
                </div>
                
                <div class="bg-gradient-to-br from-blue-400 to-blue-500 rounded-xl shadow-lg p-6 text-white">
                    <div class="text-sm opacity-90 mb-2">في قاعات الانتظار</div>
                    <div class="text-4xl font-black">${totalWaiting}</div>
                </div>
                
                <div class="bg-gradient-to-br from-teal-400 to-teal-500 rounded-xl shadow-lg p-6 text-white">
                    <div class="text-sm opacity-90 mb-2">في قاعات المقابلات</div>
                    <div class="text-4xl font-black">${totalInterview}</div>
                </div>
                
                <div class="bg-gradient-to-br from-green-400 to-green-500 rounded-xl shadow-lg p-6 text-white">
                    <div class="text-sm opacity-90 mb-2">تمت خدمتهم</div>
                    <div class="text-4xl font-black">${globalStats.served_count || 0}</div>
                </div>
                
                <div class="bg-gradient-to-br from-red-400 to-red-500 rounded-xl shadow-lg p-6 text-white">
                    <div class="text-sm opacity-90 mb-2">مفقودين</div>
                    <div class="text-4xl font-black">${globalStats.missing_count || 0}</div>
                </div>
                
                <div class="bg-gradient-to-br from-purple-400 to-purple-500 rounded-xl shadow-lg p-6 text-white">
                    <div class="text-sm opacity-90 mb-2">إجمالي الطاقة</div>
                    <div class="text-4xl font-black">${totalCapacity}</div>
                </div>
            </div>
            
            <!-- القاعات -->
            <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6">
                <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-6">القاعات</h2>
                <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${halls.filter(h => h.active).map(hall => renderHallCard(hall)).join('')}
                </div>
            </div>
        </div>
    `;
}

function renderHallCard(hall) {
    const occupancy = hall.capacity > 0 ? Math.round((hall.current / hall.capacity) * 100) : 0;
    let colorClass = 'bg-green-500';
    if (occupancy >= 90) colorClass = 'bg-red-500';
    else if (occupancy >= 70) colorClass = 'bg-amber-500';

    return `
        <div class="border-2 border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <h3 class="text-lg font-black text-slate-800 dark:text-white">${hall.name}</h3>
                    <span class="text-sm text-slate-500">${hall.type}</span>
                </div>
                <div class="text-right">
                    <div class="text-2xl font-black text-blue-600">${hall.current || 0}</div>
                    <div class="text-xs text-slate-500">من ${hall.capacity}</div>
                </div>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 mb-2">
                <div class="${colorClass} h-full rounded-full transition-all" style="width: ${occupancy}%"></div>
            </div>
            <div class="text-sm text-slate-600 dark:text-slate-400">
                الإشغال: <strong>${occupancy}%</strong>
            </div>
        </div>
    `;
}

// ============================================
// HALLS VIEW
// ============================================

function renderHalls() {
    const view = document.getElementById('hallsView');
    view.innerHTML = `
        <div class="p-6">
            <h1 class="text-3xl font-black text-slate-800 dark:text-white mb-6">إدارة القاعات</h1>
            <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6">
                <p class="text-center text-slate-600 dark:text-slate-400">قريباً...</p>
            </div>
        </div>
    `;
}

// ============================================
// REQUESTS VIEW
// ============================================

function renderRequests() {
    const view = document.getElementById('requestsView');
    view.innerHTML = `
        <div class="p-6">
            <h1 class="text-3xl font-black text-slate-800 dark:text-white mb-6">طلبات النقل</h1>
            <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6">
                <p class="text-center text-slate-600 dark:text-slate-400">قريباً...</p>
            </div>
        </div>
    `;
}

// ============================================
// ANALYTICS VIEW
// ============================================

function renderAnalytics() {
    const view = document.getElementById('analyticsView');
    view.innerHTML = `
        <div class="p-6">
            <h1 class="text-3xl font-black text-slate-800 dark:text-white mb-6">الإحصائيات</h1>
            <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6">
                <p class="text-center text-slate-600 dark:text-slate-400">قريباً...</p>
            </div>
        </div>
    `;
}

// ============================================
// AUDIT LOG VIEW
// ============================================

function renderAuditLog() {
    const view = document.getElementById('auditView');
    view.innerHTML = `
        <div class="p-6">
            <h1 class="text-3xl font-black text-slate-800 dark:text-white mb-6">سجل العمليات</h1>
            <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6">
                <p class="text-center text-slate-600 dark:text-slate-400">قريباً...</p>
            </div>
        </div>
    `;
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================

function showToast(message, type = 'info') {
    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        warning: 'bg-amber-500',
        info: 'bg-blue-500'
    };

    const toast = document.createElement('div');
    toast.className = `fixed top-4 left-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fadeIn`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// ============================================
// AUTO-LOGIN CHECK
// ============================================

window.addEventListener('DOMContentLoaded', async () => {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            document.getElementById('loginPage').classList.add('hidden');
            document.getElementById('mainApp').classList.remove('hidden');
            
            // تحديث UI
            document.getElementById('userName').textContent = currentUser.fullName || currentUser.id;
            document.getElementById('userRole').textContent = currentUser.role || 'غير محدد';
            
            await loadData();
            showView('dashboard');
        } catch (error) {
            console.error('Session restore error:', error);
            logout();
        }
    }
});

console.log('✅ B36 System v33 Enhanced - Ready!');
