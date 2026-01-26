// ============================================
// B36 HALL MANAGEMENT SYSTEM v35 - MOBILE-FIRST
// نظام عد يدوي + أزرار سريعة + Dashboard + Mobile Responsive
// ============================================

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
    EXTERNAL_COUNTER: 'يوزر_العداد_الخارجي',
    WAITING_HALL: 'يوزر_قاعة_انتظار',
    INTERVIEW_HALL: 'يوزر_قاعة_مقابلات',
    VIEWER: 'يوزر_العرض'
};

// ============================================
// GLOBAL STATE
// ============================================

let currentUser = null;
let halls = [];
let users = [];
let globalStats = {
    outdoor_queue: 0,
    daily_target: 500,
    served_count: 0
};

let unsubscribeHalls = null;
let unsubscribeStats = null;

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

        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        showToast(`مرحباً ${currentUser.fullName || currentUser.id}!`, 'success');
        
        document.getElementById('loginPage').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        
        document.getElementById('userName').textContent = currentUser.fullName || currentUser.id;
        document.getElementById('userRole').textContent = getRoleLabel(currentUser.role);
        
        updateSidebarNav();
        
        await startRealtimeListeners();
        
        showView(getDefaultView());

    } catch (error) {
        console.error('Login error:', error);
        showToast('حدث خطأ أثناء تسجيل الدخول: ' + error.message, 'error');
    }
};

window.logout = function() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    
    if (unsubscribeHalls) unsubscribeHalls();
    if (unsubscribeStats) unsubscribeStats();
    
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('loginPage').classList.remove('hidden');
    
    showToast('تم تسجيل الخروج بنجاح', 'info');
};

function getRoleLabel(role) {
    const labels = {
        [ROLES.ADMIN]: 'المدير العام',
        [ROLES.EXTERNAL_COUNTER]: 'عداد خارجي',
        [ROLES.WAITING_HALL]: 'قاعة انتظار',
        [ROLES.INTERVIEW_HALL]: 'قاعة مقابلات',
        [ROLES.VIEWER]: 'عارض'
    };
    return labels[role] || role;
}

function updateSidebarNav() {
    const nav = document.getElementById('sidebarNav');
    let navItems = [];

    // Dashboard - للجميع ماعدا العداد الخارجي
    if (currentUser.role !== ROLES.EXTERNAL_COUNTER) {
        navItems.push({
            icon: 'ph-command',
            label: 'لوحة التحكم',
            view: 'dashboard'
        });
    }

    // External Counter - للعداد الخارجي فقط
    if (currentUser.role === ROLES.EXTERNAL_COUNTER) {
        navItems.push({
            icon: 'ph-counter',
            label: 'العداد الخارجي',
            view: 'external'
        });
    }

    // My Hall - لمسؤولي القاعات
    if (currentUser.role === ROLES.WAITING_HALL || currentUser.role === ROLES.INTERVIEW_HALL) {
        navItems.push({
            icon: 'ph-building',
            label: 'قاعتي',
            view: 'myHall'
        });
    }

    // Halls Management - للمدير فقط
    if (currentUser.role === ROLES.ADMIN) {
        navItems.push({
            icon: 'ph-buildings',
            label: 'إدارة القاعات',
            view: 'hallsManagement'
        });
    }

    // Users Management - للمدير فقط
    if (currentUser.role === ROLES.ADMIN) {
        navItems.push({
            icon: 'ph-users',
            label: 'إدارة المستخدمين',
            view: 'usersManagement'
        });
    }

    // Analytics - للمدير والعارض
    if (currentUser.role === ROLES.ADMIN || currentUser.role === ROLES.VIEWER) {
        navItems.push({
            icon: 'ph-chart-line',
            label: 'الإحصائيات',
            view: 'analytics'
        });
    }

    // Profile - للجميع
    navItems.push({
        icon: 'ph-user-circle',
        label: 'الملف الشخصي',
        view: 'profile'
    });

    nav.innerHTML = navItems.map(item => `
        <button onclick="showView('${item.view}')" class="nav-btn w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition text-right">
            <i class="${item.icon} text-xl"></i>
            <span class="font-bold">${item.label}</span>
        </button>
    `).join('');
}

function getDefaultView() {
    switch(currentUser.role) {
        case ROLES.ADMIN:
            return 'dashboard';
        case ROLES.VIEWER:
            return 'analytics';
        case ROLES.EXTERNAL_COUNTER:
            return 'external';
        case ROLES.WAITING_HALL:
        case ROLES.INTERVIEW_HALL:
            return 'myHall';
        default:
            return 'dashboard';
    }
}

// ============================================
// REALTIME LISTENERS
// ============================================

async function startRealtimeListeners() {
    // الاستماع للقاعات
    unsubscribeHalls = onSnapshot(collection(db, 'halls'), (snapshot) => {
        halls = [];
        snapshot.forEach(doc => {
            halls.push({ id: doc.id, ...doc.data() });
        });
        refreshCurrentView();
    });

    // الاستماع للإحصائيات
    unsubscribeStats = onSnapshot(doc(db, 'settings', 'global_config'), (doc) => {
        if (doc.exists()) {
            globalStats = doc.data();
        }
        refreshCurrentView();
    });

    // تحميل المستخدمين (للمدير فقط)
    if (currentUser.role === ROLES.ADMIN) {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        users = [];
        usersSnapshot.forEach(doc => {
            users.push({ id: doc.id, ...doc.data() });
        });
    }
}

function refreshCurrentView() {
    const currentView = document.querySelector('.view-content:not(.hidden)');
    if (currentView) {
        const viewId = currentView.id.replace('View', '');
        showView(viewId);
    }
}

// ============================================
// VIEW MANAGEMENT
// ============================================

window.showView = function(viewName) {
    document.querySelectorAll('.view-content').forEach(view => {
        view.classList.add('hidden');
    });

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    const viewElement = document.getElementById(viewName + 'View');
    if (viewElement) {
        viewElement.classList.remove('hidden');
    }

    const activeButton = Array.from(document.querySelectorAll('.nav-btn')).find(btn => {
        return btn.getAttribute('onclick')?.includes(viewName);
    });
    if (activeButton) {
        activeButton.classList.add('active');
    }

    switch(viewName) {
        case 'dashboard':
            renderDashboard();
            break;
        case 'external':
            renderExternalCounter();
            break;
        case 'myHall':
            renderMyHall();
            break;
        case 'hallsManagement':
            renderHallsManagement();
            break;
        case 'usersManagement':
            renderUsersManagement();
            break;
        case 'analytics':
            renderAnalytics();
            break;
        case 'profile':
            renderProfile();
            break;
    }
};

// ============================================
// DASHBOARD - للمدير والعارض
// ============================================

function renderDashboard() {
    const view = document.getElementById('dashboardView');
    
    const waitingHalls = halls.filter(h => h.type === 'انتظار' && h.active);
    const interviewHalls = halls.filter(h => h.type === 'مقابلات' && h.active);
    
    const totalWaiting = waitingHalls.reduce((sum, h) => sum + (h.current || 0), 0);
    const totalInterview = interviewHalls.reduce((sum, h) => sum + (h.current || 0), 0);
    const totalInside = totalWaiting + totalInterview;
    const totalCapacity = halls.filter(h => h.active).reduce((sum, h) => sum + (h.capacity || 0), 0);
    const remainingCapacity = totalCapacity - totalInside;

    // حساب الأكثر والأقل نشاطاً
    const activeHalls = halls.filter(h => h.active);
    let mostActive = null;
    let leastActive = null;

    if (activeHalls.length > 0) {
        mostActive = activeHalls.reduce((max, h) => {
            const occupancy = h.capacity > 0 ? (h.current / h.capacity) : 0;
            const maxOccupancy = max.capacity > 0 ? (max.current / max.capacity) : 0;
            return occupancy > maxOccupancy ? h : max;
        });

        leastActive = activeHalls.reduce((min, h) => {
            const occupancy = h.capacity > 0 ? (h.current / h.capacity) : 0;
            const minOccupancy = min.capacity > 0 ? (min.current / min.capacity) : 0;
            return occupancy < minOccupancy ? h : min;
        });
    }

    const targetProgress = globalStats.daily_target > 0 
        ? Math.round((globalStats.outdoor_queue / globalStats.daily_target) * 100) 
        : 0;

    view.innerHTML = `
        <div class="p-4 md:p-6">
            <div class="flex justify-between items-center mb-4 md:mb-6">
                <h1 class="text-2xl md:text-3xl font-black text-slate-800 dark:text-white">📊 لوحة التحكم</h1>
                <button onclick="showResetDialog()" class="bg-red-500 hover:bg-red-600 text-white px-3 md:px-4 py-2 rounded-lg font-bold transition shadow-lg text-sm md:text-base active:scale-95">
                    <i class="ph ph-arrow-counter-clockwise ml-1"></i>
                    تصفير
                </button>
            </div>
            
            <!-- نشاط القاعات -->
            ${mostActive ? `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div class="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg p-4 border-2 border-green-200 dark:border-green-700">
                    <div class="flex items-center gap-2 mb-2">
                        <i class="ph ph-fire text-2xl text-green-600"></i>
                        <h3 class="text-base font-black text-green-800 dark:text-green-300">الأكثر نشاطاً</h3>
                    </div>
                    <p class="text-xl font-black text-green-600 dark:text-green-400 mb-1">${mostActive.name}</p>
                    <p class="text-sm text-green-700 dark:text-green-300">
                        ${mostActive.current} / ${mostActive.capacity} 
                        (${Math.round((mostActive.current / mostActive.capacity) * 100)}%)
                    </p>
                </div>
                
                <div class="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-4 border-2 border-blue-200 dark:border-blue-700">
                    <div class="flex items-center gap-2 mb-2">
                        <i class="ph ph-snowflake text-2xl text-blue-600"></i>
                        <h3 class="text-base font-black text-blue-800 dark:text-blue-300">الأقل نشاطاً</h3>
                    </div>
                    <p class="text-xl font-black text-blue-600 dark:text-blue-400 mb-1">${leastActive.name}</p>
                    <p class="text-sm text-blue-700 dark:text-blue-300">
                        ${leastActive.current} / ${leastActive.capacity} 
                        (${Math.round((leastActive.current / leastActive.capacity) * 100)}%)
                    </p>
                </div>
            </div>
            ` : ''}
            
            <!-- KPIs الرئيسية -->
            <div class="grid grid-cols-2 gap-2 mb-6">
                <div class="bg-gradient-to-br from-orange-400 to-orange-500 rounded-lg shadow-lg p-3 text-white">
                    <div class="text-xs opacity-90 mb-1">خارج المبنى</div>
                    <div class="text-3xl font-black mb-1">${globalStats.outdoor_queue || 0}</div>
                    <div class="text-xs opacity-75">هدف: ${globalStats.daily_target || 0}</div>
                    <div class="text-xs opacity-75">${targetProgress}%</div>
                </div>
                
                <div class="bg-gradient-to-br from-blue-400 to-blue-500 rounded-lg shadow-lg p-3 text-white">
                    <div class="text-xs opacity-90 mb-1">داخل المبنى</div>
                    <div class="text-3xl font-black mb-1">${totalInside}</div>
                    <div class="text-xs opacity-75">انتظار: ${totalWaiting}</div>
                    <div class="text-xs opacity-75">مقابلات: ${totalInterview}</div>
                </div>
                
                <div class="bg-gradient-to-br from-purple-400 to-purple-500 rounded-lg shadow-lg p-3 text-white">
                    <div class="text-xs opacity-90 mb-1">الطاقة المتبقية</div>
                    <div class="text-3xl font-black mb-1">${remainingCapacity}</div>
                    <div class="text-xs opacity-75">من ${totalCapacity}</div>
                </div>
                
                <div class="bg-gradient-to-br from-green-400 to-green-500 rounded-lg shadow-lg p-3 text-white">
                    <div class="text-xs opacity-90 mb-1">تمت خدمتهم</div>
                    <div class="text-3xl font-black mb-1">${globalStats.served_count || 0}</div>
                </div>
            </div>
            
            <!-- جميع القاعات -->
            <div class="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-4">
                <h2 class="text-xl font-black text-slate-800 dark:text-white mb-4">🏢 جميع القاعات</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    ${halls.filter(h => h.active).map(hall => renderHallCard(hall)).join('')}
                </div>
            </div>
        </div>
    `;
}

function renderHallCard(hall) {
    const occupancy = hall.capacity > 0 ? Math.round((hall.current / hall.capacity) * 100) : 0;
    const remaining = hall.capacity - hall.current;
    
    let colorClass = 'bg-green-500';
    let textColor = 'text-green-600';
    if (occupancy >= 90) {
        colorClass = 'bg-red-500';
        textColor = 'text-red-600';
    } else if (occupancy >= 70) {
        colorClass = 'bg-amber-500';
        textColor = 'text-amber-600';
    }

    return `
        <div class="border-2 border-slate-200 dark:border-slate-700 rounded-lg p-3 hover:shadow-lg transition-all">
            <div class="flex justify-between items-start mb-2">
                <div>
                    <h3 class="text-base font-black text-slate-800 dark:text-white">${hall.name}</h3>
                    <span class="text-xs text-slate-500 dark:text-slate-400">${hall.type}</span>
                </div>
                <div class="text-right">
                    <div class="text-2xl font-black ${textColor} dark:opacity-90">${hall.current || 0}</div>
                    <div class="text-xs text-slate-500 dark:text-slate-400">من ${hall.capacity}</div>
                </div>
            </div>
            
            <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 mb-2 overflow-hidden">
                <div class="${colorClass} h-full rounded-full transition-all duration-500" 
                     style="width: ${occupancy}%"></div>
            </div>
            
            <div class="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                <span><strong>${occupancy}%</strong></span>
                <span>باقي: <strong>${remaining}</strong></span>
            </div>
        </div>
    `;
}

// ============================================
// EXTERNAL COUNTER - عداد المرشحين الخارجي
// ============================================

function renderExternalCounter() {
    const view = document.getElementById('externalView');
    
    const current = globalStats.outdoor_queue || 0;
    const target = globalStats.daily_target || 500;
    const progress = target > 0 ? Math.round((current / target) * 100) : 0;
    const remaining = target - current;

    view.innerHTML = `
        <div class="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-slate-900 dark:to-slate-800">
            <div class="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-8 w-full max-w-md">
                <div class="text-center mb-6">
                    <i class="ph ph-users text-6xl text-orange-500 mb-4"></i>
                    <h1 class="text-3xl font-black text-slate-800 dark:text-white mb-2">عداد المرشحين الخارجي</h1>
                    <p class="text-slate-600 dark:text-slate-400">المستهدف اليوم: <strong>${target}</strong></p>
                </div>
                
                <!-- العدد الحالي -->
                <div class="bg-gradient-to-br from-orange-400 to-orange-500 rounded-2xl p-8 text-center mb-6">
                    <div class="text-white text-sm opacity-90 mb-2">العدد الحالي</div>
                    <div class="text-white text-7xl font-black" id="externalCount">${current}</div>
                </div>
                
                <!-- Progress Bar -->
                <div class="mb-6">
                    <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-4 mb-2">
                        <div class="bg-gradient-to-r from-orange-400 to-orange-500 h-full rounded-full transition-all duration-500" 
                             style="width: ${progress}%"></div>
                    </div>
                    <div class="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                        <span>${progress}% من الهدف</span>
                        <span>باقي: ${remaining}</span>
                    </div>
                </div>
                
                <!-- أزرار التحديث السريع -->
                <div class="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 mb-4">
                    <p class="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 text-center">تحديث سريع:</p>
                    <div class="grid grid-cols-2 gap-3">
                        <button onclick="updateExternalCount(${current + 1})" 
                                class="bg-green-500 hover:bg-green-600 text-white rounded-xl py-4 font-bold text-xl transition-all hover:scale-105 shadow-lg">
                            <i class="ph ph-plus-circle text-2xl"></i>
                            <div class="text-sm">زيادة +1</div>
                        </button>
                        <button onclick="updateExternalCount(${current - 1})" 
                                class="bg-red-500 hover:bg-red-600 text-white rounded-xl py-4 font-bold text-xl transition-all hover:scale-105 shadow-lg">
                            <i class="ph ph-minus-circle text-2xl"></i>
                            <div class="text-sm">تقليل -1</div>
                        </button>
                    </div>
                </div>
                
                <!-- إدخال يدوي -->
                <div class="bg-slate-50 dark:bg-slate-700 rounded-xl p-6">
                    <p class="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 text-center">أو أدخل العدد يدوياً:</p>
                    <div class="flex gap-2">
                        <input type="number" 
                               id="externalManualInput" 
                               placeholder="أدخل العدد"
                               class="flex-1 p-3 border-2 border-slate-300 dark:border-slate-600 rounded-xl text-center font-bold text-lg focus:border-orange-500 outline-none bg-white dark:bg-slate-600 text-slate-800 dark:text-white"
                               value="${current}">
                        <button onclick="updateExternalCountManual()" 
                                class="px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-bold hover:opacity-90 transition-all shadow-lg">
                            تحديث
                        </button>
                    </div>
                </div>
                
                <!-- تحديث المستهدف (للمدير فقط) -->
                ${currentUser.role === ROLES.ADMIN ? `
                <div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600">
                    <p class="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 text-center">تحديث المستهدف اليومي:</p>
                    <div class="flex gap-2">
                        <input type="number" 
                               id="targetInput" 
                               placeholder="المستهدف"
                               class="flex-1 p-3 border-2 border-slate-300 dark:border-slate-600 rounded-xl text-center font-bold focus:border-blue-500 outline-none bg-white dark:bg-slate-600 text-slate-800 dark:text-white"
                               value="${target}">
                        <button onclick="updateDailyTarget()" 
                                class="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold transition-all">
                            حفظ
                        </button>
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

window.updateExternalCount = async function(newCount) {
    if (newCount < 0) {
        showToast('العدد لا يمكن أن يكون سالباً', 'error');
        return;
    }

    try {
        await updateDoc(doc(db, 'settings', 'global_config'), {
            outdoor_queue: newCount
        });
        showToast('تم التحديث بنجاح', 'success');
    } catch (error) {
        console.error('Update error:', error);
        showToast('حدث خطأ في التحديث', 'error');
    }
};

window.updateExternalCountManual = async function() {
    const input = document.getElementById('externalManualInput');
    const newCount = parseInt(input.value);

    if (isNaN(newCount) || newCount < 0) {
        showToast('الرجاء إدخال رقم صحيح', 'error');
        return;
    }

    await updateExternalCount(newCount);
};

window.updateDailyTarget = async function() {
    const input = document.getElementById('targetInput');
    const newTarget = parseInt(input.value);

    if (isNaN(newTarget) || newTarget < 0) {
        showToast('الرجاء إدخال رقم صحيح', 'error');
        return;
    }

    try {
        await updateDoc(doc(db, 'settings', 'global_config'), {
            daily_target: newTarget
        });
        showToast('تم تحديث المستهدف بنجاح', 'success');
    } catch (error) {
        console.error('Update error:', error);
        showToast('حدث خطأ في التحديث', 'error');
    }
};

// ============================================
// MY HALL - قاعتي (انتظار أو مقابلات)
// ============================================

function renderMyHall() {
    const view = document.getElementById('myHallView');
    
    // البحث عن قاعة المستخدم
    let myHall = null;
    if (currentUser.assignedHallId) {
        myHall = halls.find(h => h.id === currentUser.assignedHallId);
    }

    if (!myHall) {
        view.innerHTML = `
            <div class="min-h-screen flex items-center justify-center p-6">
                <div class="text-center">
                    <i class="ph ph-warning text-6xl text-amber-500 mb-4"></i>
                    <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-2">لم يتم تعيين قاعة</h2>
                    <p class="text-slate-600 dark:text-slate-400">الرجاء التواصل مع المدير</p>
                </div>
            </div>
        `;
        return;
    }

    const current = myHall.current || 0;
    const capacity = myHall.capacity || 100;
    const occupancy = capacity > 0 ? Math.round((current / capacity) * 100) : 0;
    const remaining = capacity - current;

    let colorClass = 'from-green-400 to-green-500';
    let bgColor = 'from-green-50 to-green-100';
    if (occupancy >= 90) {
        colorClass = 'from-red-400 to-red-500';
        bgColor = 'from-red-50 to-red-100';
    } else if (occupancy >= 70) {
        colorClass = 'from-amber-400 to-amber-500';
        bgColor = 'from-amber-50 to-amber-100';
    }

    view.innerHTML = `
        <div class="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br ${bgColor} dark:from-slate-900 dark:to-slate-800">
            <div class="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-8 w-full max-w-md">
                <div class="text-center mb-6">
                    <i class="ph ph-building text-6xl text-blue-500 mb-4"></i>
                    <h1 class="text-3xl font-black text-slate-800 dark:text-white mb-2">${myHall.name}</h1>
                    <p class="text-slate-600 dark:text-slate-400">${myHall.type}</p>
                    <p class="text-sm text-slate-500 dark:text-slate-500 mt-1">السعة: ${capacity}</p>
                </div>
                
                <!-- العدد الحالي -->
                <div class="bg-gradient-to-br ${colorClass} rounded-2xl p-8 text-center mb-6">
                    <div class="text-white text-sm opacity-90 mb-2">العدد الحالي</div>
                    <div class="text-white text-7xl font-black" id="hallCount">${current}</div>
                </div>
                
                <!-- Progress Bar -->
                <div class="mb-6">
                    <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-4 mb-2">
                        <div class="bg-gradient-to-r ${colorClass} h-full rounded-full transition-all duration-500" 
                             style="width: ${occupancy}%"></div>
                    </div>
                    <div class="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                        <span><strong>${occupancy}%</strong> إشغال</span>
                        <span>باقي: <strong>${remaining}</strong></span>
                    </div>
                </div>
                
                <!-- أزرار التحديث السريع -->
                <div class="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 mb-4">
                    <p class="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 text-center">تحديث سريع:</p>
                    <div class="grid grid-cols-2 gap-3">
                        <button onclick="updateHallCount('${myHall.id}', ${current + 1})" 
                                class="bg-green-500 hover:bg-green-600 text-white rounded-xl py-4 font-bold text-xl transition-all hover:scale-105 shadow-lg">
                            <i class="ph ph-plus-circle text-2xl"></i>
                            <div class="text-sm">دخول +1</div>
                        </button>
                        <button onclick="updateHallCount('${myHall.id}', ${current - 1})" 
                                class="bg-red-500 hover:bg-red-600 text-white rounded-xl py-4 font-bold text-xl transition-all hover:scale-105 shadow-lg">
                            <i class="ph ph-minus-circle text-2xl"></i>
                            <div class="text-sm">خروج -1</div>
                        </button>
                    </div>
                </div>
                
                <!-- إدخال يدوي -->
                <div class="bg-slate-50 dark:bg-slate-700 rounded-xl p-6">
                    <p class="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 text-center">أو أدخل العدد الكامل:</p>
                    <div class="flex gap-2">
                        <input type="number" 
                               id="hallManualInput" 
                               placeholder="أدخل العدد"
                               class="flex-1 p-3 border-2 border-slate-300 dark:border-slate-600 rounded-xl text-center font-bold text-lg focus:border-blue-500 outline-none bg-white dark:bg-slate-600 text-slate-800 dark:text-white"
                               value="${current}">
                        <button onclick="updateHallCountManual('${myHall.id}')" 
                                class="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-bold hover:opacity-90 transition-all shadow-lg">
                            تحديث
                        </button>
                    </div>
                </div>
                
                ${myHall.type === 'مقابلات' ? `
                <div class="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-700 rounded-xl">
                    <p class="text-sm text-green-700 dark:text-green-300 text-center">
                        <i class="ph ph-info text-lg"></i>
                        عند خروج مرشح من هذه القاعة = تمت خدمته ✅
                    </p>
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

window.updateHallCount = async function(hallId, newCount) {
    const hall = halls.find(h => h.id === hallId);
    if (!hall) return;

    if (newCount < 0) {
        showToast('العدد لا يمكن أن يكون سالباً', 'error');
        return;
    }

    if (newCount > hall.capacity) {
        const confirmed = await Swal.fire({
            title: 'تحذير',
            text: `العدد الجديد (${newCount}) يتجاوز السعة (${hall.capacity}). هل تريد المتابعة؟`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'نعم، تحديث',
            cancelButtonText: 'إلغاء'
        });
        
        if (!confirmed.isConfirmed) return;
    }

    try {
        const oldCount = hall.current || 0;
        
        // تحديث القاعة
        await updateDoc(doc(db, 'halls', hallId), {
            current: newCount
        });

        // إذا كانت قاعة مقابلات والعدد نقص = تمت خدمتهم
        if (hall.type === 'مقابلات' && newCount < oldCount) {
            const served = oldCount - newCount;
            await updateDoc(doc(db, 'settings', 'global_config'), {
                served_count: increment(served)
            });
            showToast(`تم التحديث! تمت خدمة ${served} مرشح`, 'success');
        } else {
            showToast('تم التحديث بنجاح', 'success');
        }

    } catch (error) {
        console.error('Update error:', error);
        showToast('حدث خطأ في التحديث', 'error');
    }
};

window.updateHallCountManual = async function(hallId) {
    const input = document.getElementById('hallManualInput');
    const newCount = parseInt(input.value);

    if (isNaN(newCount) || newCount < 0) {
        showToast('الرجاء إدخال رقم صحيح', 'error');
        return;
    }

    await updateHallCount(hallId, newCount);
};

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
    toast.className = `fixed top-4 left-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg z-[9999] animate-fadeIn`;
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
            
            document.getElementById('userName').textContent = currentUser.fullName || currentUser.id;
            document.getElementById('userRole').textContent = getRoleLabel(currentUser.role);
            
            updateSidebarNav();
            
            await startRealtimeListeners();
            showView(getDefaultView());
        } catch (error) {
            console.error('Session restore error:', error);
            logout();
        }
    }
});

console.log('✅ B36 System v35 - Complete Management System - Ready!');

// ============================================
// HALLS MANAGEMENT - إدارة القاعات
// ============================================

function renderHallsManagement() {
    const view = document.getElementById('hallsManagementView');
    
    view.innerHTML = `
        <div class="p-6">
            <div class="flex justify-between items-center mb-6">
                <h1 class="text-3xl font-black text-slate-800 dark:text-white">🏛️ إدارة القاعات</h1>
                <button onclick="showAddHallDialog()" class="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-6 py-3 rounded-xl font-bold hover:opacity-90 transition shadow-lg">
                    <i class="ph ph-plus-circle ml-2"></i>
                    إضافة قاعة
                </button>
            </div>
            
            <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${halls.map(hall => {
                    const occupancy = hall.capacity > 0 ? Math.round((hall.current / hall.capacity) * 100) : 0;
                    let colorClass = 'from-green-400 to-green-500';
                    if (occupancy >= 90) colorClass = 'from-red-400 to-red-500';
                    else if (occupancy >= 70) colorClass = 'from-amber-400 to-amber-500';
                    
                    return `
                        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 border-2 ${hall.active ? 'border-green-200' : 'border-red-200'}">
                            <div class="flex justify-between items-start mb-4">
                                <div>
                                    <h3 class="text-xl font-black text-slate-800 dark:text-white">${hall.name}</h3>
                                    <p class="text-sm text-slate-600 dark:text-slate-400">${hall.type}</p>
                                </div>
                                <span class="px-3 py-1 rounded-full text-xs font-bold ${hall.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                                    ${hall.active ? 'نشط' : 'معطل'}
                                </span>
                            </div>
                            
                            <div class="bg-gradient-to-br ${colorClass} rounded-lg p-4 text-white mb-4">
                                <div class="text-sm opacity-90 mb-1">العدد الحالي</div>
                                <div class="text-3xl font-black">${hall.current || 0} / ${hall.capacity}</div>
                                <div class="text-xs opacity-75 mt-1">${occupancy}% إشغال</div>
                            </div>
                            
                            <div class="flex gap-2">
                                <button onclick="editHall('${hall.id}')" class="flex-1 bg-blue-100 text-blue-700 py-2 rounded-lg font-bold hover:bg-blue-200 transition">
                                    <i class="ph ph-pencil ml-1"></i>
                                    تعديل
                                </button>
                                <button onclick="toggleHallStatus('${hall.id}')" class="flex-1 ${hall.active ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-green-100 text-green-700 hover:bg-green-200'} py-2 rounded-lg font-bold transition">
                                    <i class="ph ${hall.active ? 'ph-pause' : 'ph-play'} ml-1"></i>
                                    ${hall.active ? 'تعطيل' : 'تفعيل'}
                                </button>
                                <button onclick="deleteHall('${hall.id}')" class="bg-red-100 text-red-700 py-2 px-3 rounded-lg font-bold hover:bg-red-200 transition">
                                    <i class="ph ph-trash"></i>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

window.showAddHallDialog = async function() {
    const { value: formValues } = await Swal.fire({
        title: 'إضافة قاعة جديدة',
        html: `
            <div class="space-y-4 text-right">
                <div>
                    <label class="block text-sm font-bold mb-2">اسم القاعة</label>
                    <input id="hallName" class="swal2-input w-full" placeholder="مثال: قاعة 1">
                </div>
                <div>
                    <label class="block text-sm font-bold mb-2">النوع</label>
                    <select id="hallType" class="swal2-input w-full">
                        <option value="انتظار">انتظار</option>
                        <option value="مقابلات">مقابلات</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-bold mb-2">السعة</label>
                    <input id="hallCapacity" type="number" class="swal2-input w-full" placeholder="مثال: 100">
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'إضافة',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            return {
                name: document.getElementById('hallName').value,
                type: document.getElementById('hallType').value,
                capacity: parseInt(document.getElementById('hallCapacity').value)
            };
        }
    });

    if (formValues) {
        if (!formValues.name || !formValues.capacity) {
            showToast('الرجاء ملء جميع الحقول', 'error');
            return;
        }

        try {
            const hallId = 'hall_' + Date.now();
            await setDoc(doc(db, 'halls', hallId), {
                name: formValues.name,
                type: formValues.type,
                capacity: formValues.capacity,
                current: 0,
                active: true
            });
            showToast('تمت إضافة القاعة بنجاح', 'success');
        } catch (error) {
            console.error('Add hall error:', error);
            showToast('حدث خطأ في الإضافة', 'error');
        }
    }
};

window.editHall = async function(hallId) {
    const hall = halls.find(h => h.id === hallId);
    if (!hall) return;

    const { value: formValues } = await Swal.fire({
        title: 'تعديل القاعة',
        html: `
            <div class="space-y-4 text-right">
                <div>
                    <label class="block text-sm font-bold mb-2">اسم القاعة</label>
                    <input id="hallName" class="swal2-input w-full" value="${hall.name}">
                </div>
                <div>
                    <label class="block text-sm font-bold mb-2">النوع</label>
                    <select id="hallType" class="swal2-input w-full">
                        <option value="انتظار" ${hall.type === 'انتظار' ? 'selected' : ''}>انتظار</option>
                        <option value="مقابلات" ${hall.type === 'مقابلات' ? 'selected' : ''}>مقابلات</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-bold mb-2">السعة</label>
                    <input id="hallCapacity" type="number" class="swal2-input w-full" value="${hall.capacity}">
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'حفظ',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            return {
                name: document.getElementById('hallName').value,
                type: document.getElementById('hallType').value,
                capacity: parseInt(document.getElementById('hallCapacity').value)
            };
        }
    });

    if (formValues) {
        try {
            await updateDoc(doc(db, 'halls', hallId), {
                name: formValues.name,
                type: formValues.type,
                capacity: formValues.capacity
            });
            showToast('تم التحديث بنجاح', 'success');
        } catch (error) {
            console.error('Update hall error:', error);
            showToast('حدث خطأ في التحديث', 'error');
        }
    }
};

window.toggleHallStatus = async function(hallId) {
    const hall = halls.find(h => h.id === hallId);
    if (!hall) return;

    try {
        await updateDoc(doc(db, 'halls', hallId), {
            active: !hall.active
        });
        showToast(hall.active ? 'تم تعطيل القاعة' : 'تم تفعيل القاعة', 'success');
    } catch (error) {
        console.error('Toggle hall error:', error);
        showToast('حدث خطأ', 'error');
    }
};

window.deleteHall = async function(hallId) {
    const confirmed = await Swal.fire({
        title: 'تأكيد الحذف',
        text: 'هل أنت متأكد من حذف هذه القاعة؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#ef4444'
    });

    if (confirmed.isConfirmed) {
        try {
            await deleteDoc(doc(db, 'halls', hallId));
            showToast('تم حذف القاعة', 'success');
        } catch (error) {
            console.error('Delete hall error:', error);
            showToast('حدث خطأ في الحذف', 'error');
        }
    }
};


// ============================================
// USERS MANAGEMENT - إدارة المستخدمين
// ============================================

function renderUsersManagement() {
    const view = document.getElementById('usersManagementView');
    
    view.innerHTML = `
        <div class="p-6">
            <div class="flex justify-between items-center mb-6">
                <h1 class="text-3xl font-black text-slate-800 dark:text-white">👥 إدارة المستخدمين</h1>
                <button onclick="showAddUserDialog()" class="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-6 py-3 rounded-xl font-bold hover:opacity-90 transition shadow-lg">
                    <i class="ph ph-user-plus ml-2"></i>
                    إضافة مستخدم
                </button>
            </div>
            
            <!-- Desktop Table -->
            <div class="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 responsive-table">
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead>
                            <tr class="border-b dark:border-slate-700">
                                <th class="text-right py-3 px-4 font-bold text-slate-700 dark:text-slate-300">المستخدم</th>
                                <th class="text-center py-3 px-4 font-bold text-slate-700 dark:text-slate-300">الدور</th>
                                <th class="text-center py-3 px-4 font-bold text-slate-700 dark:text-slate-300">القاعة المعينة</th>
                                <th class="text-center py-3 px-4 font-bold text-slate-700 dark:text-slate-300">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${users.map(user => {
                                const assignedHall = halls.find(h => h.id === user.assignedHallId);
                                return `
                                    <tr class="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700">
                                        <td class="py-3 px-4">
                                            <div class="font-bold">${user.fullName || user.id}</div>
                                            <div class="text-sm text-slate-600 dark:text-slate-400">${user.id}</div>
                                        </td>
                                        <td class="text-center py-3 px-4">
                                            <span class="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                                                ${getRoleLabel(user.role)}
                                            </span>
                                        </td>
                                        <td class="text-center py-3 px-4 text-sm">
                                            ${assignedHall ? assignedHall.name : '-'}
                                        </td>
                                        <td class="text-center py-3 px-4">
                                            <div class="flex gap-2 justify-center">
                                                <button onclick="editUser('${user.id}')" class="bg-blue-100 text-blue-700 px-3 py-1 rounded-lg font-bold hover:bg-blue-200 transition text-sm">
                                                    <i class="ph ph-pencil"></i>
                                                </button>
                                                ${user.id !== 'admin' ? `
                                                <button onclick="deleteUser('${user.id}')" class="bg-red-100 text-red-700 px-3 py-1 rounded-lg font-bold hover:bg-red-200 transition text-sm">
                                                    <i class="ph ph-trash"></i>
                                                </button>
                                                ` : ''}
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <!-- Mobile Cards -->
            <div class="responsive-cards space-y-4">
                ${users.map(user => {
                    const assignedHall = halls.find(h => h.id === user.assignedHallId);
                    return `
                        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-4">
                            <div class="flex justify-between items-start mb-3">
                                <div class="flex-1">
                                    <h3 class="font-bold text-lg text-slate-800 dark:text-white">${user.fullName || user.id}</h3>
                                    <p class="text-sm text-slate-600 dark:text-slate-400">${user.id}</p>
                                </div>
                                <span class="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                                    ${getRoleLabel(user.role)}
                                </span>
                            </div>
                            
                            <div class="mb-3 pb-3 border-b dark:border-slate-700">
                                <p class="text-sm text-slate-600 dark:text-slate-400 mb-1">القاعة المعينة</p>
                                <p class="font-bold text-slate-800 dark:text-white">${assignedHall ? assignedHall.name : 'بدون قاعة'}</p>
                            </div>
                            
                            <div class="flex gap-2">
                                <button onclick="editUser('${user.id}')" class="flex-1 bg-blue-100 text-blue-700 py-2 rounded-lg font-bold hover:bg-blue-200 active:scale-95 transition">
                                    <i class="ph ph-pencil ml-1"></i>
                                    تعديل
                                </button>
                                ${user.id !== 'admin' ? `
                                <button onclick="deleteUser('${user.id}')" class="flex-1 bg-red-100 text-red-700 py-2 rounded-lg font-bold hover:bg-red-200 active:scale-95 transition">
                                    <i class="ph ph-trash ml-1"></i>
                                    حذف
                                </button>
                                ` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

window.showAddUserDialog = async function() {
    const hallsOptions = halls.map(h => `<option value="${h.id}">${h.name}</option>`).join('');
    
    const { value: formValues } = await Swal.fire({
        title: 'إضافة مستخدم جديد',
        html: `
            <div class="space-y-4 text-right">
                <div>
                    <label class="block text-sm font-bold mb-2">اسم المستخدم</label>
                    <input id="userId" class="swal2-input w-full" placeholder="مثال: user1">
                </div>
                <div>
                    <label class="block text-sm font-bold mb-2">الاسم الكامل</label>
                    <input id="userFullName" class="swal2-input w-full" placeholder="مثال: محمد أحمد">
                </div>
                <div>
                    <label class="block text-sm font-bold mb-2">كلمة المرور</label>
                    <input id="userPassword" type="password" class="swal2-input w-full" placeholder="كلمة المرور">
                </div>
                <div>
                    <label class="block text-sm font-bold mb-2">الدور</label>
                    <select id="userRole" class="swal2-input w-full">
                        <option value="${ROLES.EXTERNAL_COUNTER}">عداد خارجي</option>
                        <option value="${ROLES.WAITING_HALL}">قاعة انتظار</option>
                        <option value="${ROLES.INTERVIEW_HALL}">قاعة مقابلات</option>
                        <option value="${ROLES.VIEWER}">عارض</option>
                    </select>
                </div>
                <div id="hallSelection">
                    <label class="block text-sm font-bold mb-2">القاعة المعينة (اختياري)</label>
                    <select id="userHall" class="swal2-input w-full">
                        <option value="">بدون قاعة</option>
                        ${hallsOptions}
                    </select>
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'إضافة',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            return {
                id: document.getElementById('userId').value,
                fullName: document.getElementById('userFullName').value,
                password: document.getElementById('userPassword').value,
                role: document.getElementById('userRole').value,
                hallId: document.getElementById('userHall').value
            };
        }
    });

    if (formValues) {
        if (!formValues.id || !formValues.fullName || !formValues.password) {
            showToast('الرجاء ملء جميع الحقول المطلوبة', 'error');
            return;
        }

        try {
            const userData = {
                fullName: formValues.fullName,
                pass: formValues.password,
                role: formValues.role
            };
            
            if (formValues.hallId) {
                userData.assignedHallId = formValues.hallId;
            }
            
            await setDoc(doc(db, 'users', formValues.id), userData);
            users.push({ id: formValues.id, ...userData });
            showToast('تمت إضافة المستخدم بنجاح', 'success');
            renderUsersManagement();
        } catch (error) {
            console.error('Add user error:', error);
            showToast('حدث خطأ في الإضافة', 'error');
        }
    }
};

window.editUser = async function(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    const hallsOptions = halls.map(h => 
        `<option value="${h.id}" ${user.assignedHallId === h.id ? 'selected' : ''}>${h.name}</option>`
    ).join('');

    const { value: formValues } = await Swal.fire({
        title: 'تعديل المستخدم',
        html: `
            <div class="space-y-4 text-right">
                <div>
                    <label class="block text-sm font-bold mb-2">الاسم الكامل</label>
                    <input id="userFullName" class="swal2-input w-full" value="${user.fullName}">
                </div>
                <div>
                    <label class="block text-sm font-bold mb-2">كلمة المرور الجديدة (اتركها فارغة للإبقاء على القديمة)</label>
                    <input id="userPassword" type="password" class="swal2-input w-full" placeholder="كلمة مرور جديدة">
                </div>
                <div>
                    <label class="block text-sm font-bold mb-2">الدور</label>
                    <select id="userRole" class="swal2-input w-full">
                        <option value="${ROLES.EXTERNAL_COUNTER}" ${user.role === ROLES.EXTERNAL_COUNTER ? 'selected' : ''}>عداد خارجي</option>
                        <option value="${ROLES.WAITING_HALL}" ${user.role === ROLES.WAITING_HALL ? 'selected' : ''}>قاعة انتظار</option>
                        <option value="${ROLES.INTERVIEW_HALL}" ${user.role === ROLES.INTERVIEW_HALL ? 'selected' : ''}>قاعة مقابلات</option>
                        <option value="${ROLES.VIEWER}" ${user.role === ROLES.VIEWER ? 'selected' : ''}>عارض</option>
                        ${userId === 'admin' ? `<option value="${ROLES.ADMIN}" selected>المدير العام</option>` : ''}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-bold mb-2">القاعة المعينة</label>
                    <select id="userHall" class="swal2-input w-full">
                        <option value="">بدون قاعة</option>
                        ${hallsOptions}
                    </select>
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'حفظ',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            return {
                fullName: document.getElementById('userFullName').value,
                password: document.getElementById('userPassword').value,
                role: document.getElementById('userRole').value,
                hallId: document.getElementById('userHall').value
            };
        }
    });

    if (formValues) {
        try {
            const updateData = {
                fullName: formValues.fullName,
                role: formValues.role
            };
            
            if (formValues.password) {
                updateData.pass = formValues.password;
            }
            
            if (formValues.hallId) {
                updateData.assignedHallId = formValues.hallId;
            } else {
                updateData.assignedHallId = null;
            }
            
            await updateDoc(doc(db, 'users', userId), updateData);
            
            const userIndex = users.findIndex(u => u.id === userId);
            if (userIndex !== -1) {
                users[userIndex] = { ...users[userIndex], ...updateData };
            }
            
            showToast('تم التحديث بنجاح', 'success');
            renderUsersManagement();
        } catch (error) {
            console.error('Update user error:', error);
            showToast('حدث خطأ في التحديث', 'error');
        }
    }
};

window.deleteUser = async function(userId) {
    if (userId === 'admin') {
        showToast('لا يمكن حذف حساب المدير', 'error');
        return;
    }

    const confirmed = await Swal.fire({
        title: 'تأكيد الحذف',
        text: 'هل أنت متأكد من حذف هذا المستخدم؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#ef4444'
    });

    if (confirmed.isConfirmed) {
        try {
            await deleteDoc(doc(db, 'users', userId));
            users = users.filter(u => u.id !== userId);
            showToast('تم حذف المستخدم', 'success');
            renderUsersManagement();
        } catch (error) {
            console.error('Delete user error:', error);
            showToast('حدث خطأ في الحذف', 'error');
        }
    }
};

// ============================================
// ANALYTICS - الإحصائيات
// ============================================

function renderAnalytics() {
    const view = document.getElementById('analyticsView');
    
    const totalWaiting = halls.filter(h => h.type === 'انتظار').reduce((sum, h) => sum + (h.current || 0), 0);
    const totalInterview = halls.filter(h => h.type === 'مقابلات').reduce((sum, h) => sum + (h.current || 0), 0);
    const totalCapacity = halls.reduce((sum, h) => sum + (h.capacity || 0), 0);
    const totalInside = totalWaiting + totalInterview;
    
    view.innerHTML = `
        <div class="p-6">
            <h1 class="text-3xl font-black text-slate-800 dark:text-white mb-6">📈 الإحصائيات والتحليلات</h1>
            
            <!-- KPIs -->
            <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <div class="bg-gradient-to-br from-orange-400 to-orange-500 rounded-xl shadow-lg p-6 text-white">
                    <div class="text-sm opacity-90 mb-2">خارج المبنى</div>
                    <div class="text-4xl font-black">${globalStats.outdoor_queue || 0}</div>
                </div>
                <div class="bg-gradient-to-br from-blue-400 to-blue-500 rounded-xl shadow-lg p-6 text-white">
                    <div class="text-sm opacity-90 mb-2">في الانتظار</div>
                    <div class="text-4xl font-black">${totalWaiting}</div>
                </div>
                <div class="bg-gradient-to-br from-purple-400 to-purple-500 rounded-xl shadow-lg p-6 text-white">
                    <div class="text-sm opacity-90 mb-2">في المقابلات</div>
                    <div class="text-4xl font-black">${totalInterview}</div>
                </div>
                <div class="bg-gradient-to-br from-green-400 to-green-500 rounded-xl shadow-lg p-6 text-white">
                    <div class="text-sm opacity-90 mb-2">تمت خدمتهم</div>
                    <div class="text-4xl font-black">${globalStats.served_count || 0}</div>
                </div>
                <div class="bg-gradient-to-br from-pink-400 to-pink-500 rounded-xl shadow-lg p-6 text-white">
                    <div class="text-sm opacity-90 mb-2">الإجمالي</div>
                    <div class="text-4xl font-black">${(globalStats.outdoor_queue || 0) + totalInside + (globalStats.served_count || 0)}</div>
                </div>
            </div>
            
            <!-- رسم بياني بسيط -->
            <div class="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 mb-6">
                <h2 class="text-xl font-black text-slate-800 dark:text-white mb-4">التوزيع الحالي للقاعات</h2>
                <div class="space-y-4">
                    ${halls.map(hall => {
                        const occupancy = hall.capacity > 0 ? (hall.current / hall.capacity) * 100 : 0;
                        let colorClass = 'bg-green-500';
                        if (occupancy >= 90) colorClass = 'bg-red-500';
                        else if (occupancy >= 70) colorClass = 'bg-amber-500';
                        
                        return `
                            <div>
                                <div class="flex justify-between mb-2">
                                    <span class="font-bold text-slate-800 dark:text-white">${hall.name}</span>
                                    <span class="text-sm text-slate-600 dark:text-slate-400">${hall.current} / ${hall.capacity} (${Math.round(occupancy)}%)</span>
                                </div>
                                <div class="bg-slate-200 dark:bg-slate-700 rounded-full h-4 overflow-hidden">
                                    <div class="${colorClass} h-full rounded-full transition-all" style="width: ${Math.min(occupancy, 100)}%"></div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            
            <!-- معلومات إضافية -->
            <div class="grid md:grid-cols-2 gap-6">
                <div class="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
                    <h2 class="text-xl font-black text-slate-800 dark:text-white mb-4">معدل الإشغال</h2>
                    <div class="text-center">
                        <div class="text-6xl font-black text-blue-600 dark:text-blue-400 mb-2">
                            ${totalCapacity > 0 ? Math.round((totalInside / totalCapacity) * 100) : 0}%
                        </div>
                        <p class="text-slate-600 dark:text-slate-400">من إجمالي السعة (${totalInside} / ${totalCapacity})</p>
                    </div>
                </div>
                
                <div class="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
                    <h2 class="text-xl font-black text-slate-800 dark:text-white mb-4">إحصائيات القاعات</h2>
                    <div class="space-y-3">
                        <div class="flex justify-between">
                            <span class="text-slate-600 dark:text-slate-400">عدد القاعات النشطة:</span>
                            <span class="font-bold text-slate-800 dark:text-white">${halls.filter(h => h.active).length}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-slate-600 dark:text-slate-400">قاعات الانتظار:</span>
                            <span class="font-bold text-slate-800 dark:text-white">${halls.filter(h => h.type === 'انتظار').length}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-slate-600 dark:text-slate-400">قاعات المقابلات:</span>
                            <span class="font-bold text-slate-800 dark:text-white">${halls.filter(h => h.type === 'مقابلات').length}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-slate-600 dark:text-slate-400">إجمالي السعة:</span>
                            <span class="font-bold text-slate-800 dark:text-white">${totalCapacity}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-slate-600 dark:text-slate-400">السعة المتبقية:</span>
                            <span class="font-bold text-slate-800 dark:text-white">${totalCapacity - totalInside}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// PROFILE - الملف الشخصي
// ============================================

function renderProfile() {
    const view = document.getElementById('profileView');
    
    const assignedHall = halls.find(h => h.id === currentUser.assignedHallId);
    
    view.innerHTML = `
        <div class="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-slate-900 dark:to-slate-800">
            <div class="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-8 w-full max-w-md">
                <div class="text-center mb-8">
                    <div class="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full mx-auto mb-4 flex items-center justify-center">
                        <i class="ph ph-user text-5xl text-white"></i>
                    </div>
                    <h1 class="text-3xl font-black text-slate-800 dark:text-white mb-2">${currentUser.fullName || currentUser.id}</h1>
                    <p class="text-slate-600 dark:text-slate-400">${getRoleLabel(currentUser.role)}</p>
                </div>
                
                <div class="space-y-4 mb-6">
                    <div class="bg-slate-50 dark:bg-slate-700 rounded-xl p-4">
                        <div class="text-sm text-slate-600 dark:text-slate-400 mb-1">اسم المستخدم</div>
                        <div class="font-bold text-slate-800 dark:text-white">${currentUser.id}</div>
                    </div>
                    
                    <div class="bg-slate-50 dark:bg-slate-700 rounded-xl p-4">
                        <div class="text-sm text-slate-600 dark:text-slate-400 mb-1">الدور</div>
                        <div class="font-bold text-slate-800 dark:text-white">${getRoleLabel(currentUser.role)}</div>
                    </div>
                    
                    ${assignedHall ? `
                    <div class="bg-slate-50 dark:bg-slate-700 rounded-xl p-4">
                        <div class="text-sm text-slate-600 dark:text-slate-400 mb-1">القاعة المعينة</div>
                        <div class="font-bold text-slate-800 dark:text-white">${assignedHall.name} (${assignedHall.type})</div>
                    </div>
                    ` : ''}
                </div>
                
                <button onclick="showChangePasswordDialog()" class="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white p-3 rounded-xl font-bold hover:opacity-90 transition shadow-lg mb-3">
                    <i class="ph ph-lock ml-2"></i>
                    تغيير كلمة المرور
                </button>
                
                <button onclick="logout()" class="w-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 rounded-xl font-bold hover:bg-red-200 dark:hover:bg-red-900/50 transition">
                    <i class="ph ph-sign-out ml-2"></i>
                    تسجيل خروج
                </button>
            </div>
        </div>
    `;
}

window.showChangePasswordDialog = async function() {
    const { value: formValues } = await Swal.fire({
        title: 'تغيير كلمة المرور',
        html: `
            <div class="space-y-4 text-right">
                <div>
                    <label class="block text-sm font-bold mb-2">كلمة المرور الحالية</label>
                    <input id="currentPassword" type="password" class="swal2-input w-full">
                </div>
                <div>
                    <label class="block text-sm font-bold mb-2">كلمة المرور الجديدة</label>
                    <input id="newPassword" type="password" class="swal2-input w-full">
                </div>
                <div>
                    <label class="block text-sm font-bold mb-2">تأكيد كلمة المرور</label>
                    <input id="confirmPassword" type="password" class="swal2-input w-full">
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'تغيير',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            return {
                current: document.getElementById('currentPassword').value,
                new: document.getElementById('newPassword').value,
                confirm: document.getElementById('confirmPassword').value
            };
        }
    });

    if (formValues) {
        if (formValues.current !== currentUser.pass) {
            showToast('كلمة المرور الحالية غير صحيحة', 'error');
            return;
        }
        
        if (formValues.new !== formValues.confirm) {
            showToast('كلمات المرور الجديدة غير متطابقة', 'error');
            return;
        }
        
        if (formValues.new.length < 4) {
            showToast('كلمة المرور يجب أن تكون 4 أحرف على الأقل', 'error');
            return;
        }

        try {
            await updateDoc(doc(db, 'users', currentUser.id), {
                pass: formValues.new
            });
            currentUser.pass = formValues.new;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            showToast('تم تغيير كلمة المرور بنجاح', 'success');
        } catch (error) {
            console.error('Change password error:', error);
            showToast('حدث خطأ في تغيير كلمة المرور', 'error');
        }
    }
};


// ============================================
// MOBILE DRAWER FUNCTIONS
// ============================================

window.toggleDrawer = function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('drawerOverlay');
    
    if (sidebar.classList.contains('drawer-open')) {
        closeDrawer();
    } else {
        openDrawer();
    }
};

window.openDrawer = function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('drawerOverlay');
    
    sidebar.classList.add('drawer-open');
    overlay.classList.remove('hidden');
    document.body.classList.add('drawer-open');
};

window.closeDrawer = function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('drawerOverlay');
    
    sidebar.classList.remove('drawer-open');
    overlay.classList.add('hidden');
    document.body.classList.remove('drawer-open');
};

// Close drawer when clicking on nav buttons (mobile only)
function setupDrawerAutoClose() {
    const navButtons = document.querySelectorAll('#sidebarNav button');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Only close on mobile
            if (window.innerWidth < 1024) {
                closeDrawer();
            }
        });
    });
}

// Update page title on mobile
function updateMobilePageTitle(title) {
    const mobileTitle = document.getElementById('mobilePageTitle');
    if (mobileTitle) {
        mobileTitle.textContent = title;
    }
}

// Override showView to update mobile title and close drawer
const originalShowView = window.showView;
window.showView = function(viewName) {
    // Call original function
    if (originalShowView) {
        originalShowView(viewName);
    }
    
    // Update mobile title
    const titles = {
        'dashboard': 'لوحة التحكم',
        'external': 'العداد الخارجي',
        'myHall': 'قاعتي',
        'hallsManagement': 'إدارة القاعات',
        'usersManagement': 'إدارة المستخدمين',
        'analytics': 'الإحصائيات',
        'profile': 'الملف الشخصي'
    };
    
    updateMobilePageTitle(titles[viewName] || 'B36 System');
    
    // Close drawer on mobile
    if (window.innerWidth < 1024) {
        closeDrawer();
    }
};

// Setup drawer auto-close after updateSidebarNav is called
const originalUpdateSidebarNav = window.updateSidebarNav;
if (originalUpdateSidebarNav) {
    window.updateSidebarNav = function() {
        originalUpdateSidebarNav();
        setTimeout(setupDrawerAutoClose, 100);
    };
}

console.log('✅ B36 System v35 - Mobile-First Ready!');


// ============================================
// RESET COUNTS DIALOG
// ============================================

window.showResetDialog = async function() {
    const { value: resetType } = await Swal.fire({
        title: 'تصفير الأعداد',
        html: `
            <div class="text-right space-y-3">
                <p class="text-sm text-slate-600 dark:text-slate-400 mb-4">اختر ما تريد تصفيره:</p>
                <div class="space-y-2">
                    <label class="flex items-center gap-3 p-3 border-2 border-slate-200 dark:border-slate-600 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700">
                        <input type="radio" name="resetType" value="outdoor" class="w-4 h-4">
                        <div class="flex-1 text-right">
                            <div class="font-bold text-slate-800 dark:text-white">خارج المبنى فقط</div>
                            <div class="text-xs text-slate-600 dark:text-slate-400">تصفير العدد الخارجي</div>
                        </div>
                    </label>
                    
                    <label class="flex items-center gap-3 p-3 border-2 border-slate-200 dark:border-slate-600 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700">
                        <input type="radio" name="resetType" value="waiting" class="w-4 h-4">
                        <div class="flex-1 text-right">
                            <div class="font-bold text-slate-800 dark:text-white">قاعات الانتظار فقط</div>
                            <div class="text-xs text-slate-600 dark:text-slate-400">تصفير جميع قاعات الانتظار</div>
                        </div>
                    </label>
                    
                    <label class="flex items-center gap-3 p-3 border-2 border-slate-200 dark:border-slate-600 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700">
                        <input type="radio" name="resetType" value="interview" class="w-4 h-4">
                        <div class="flex-1 text-right">
                            <div class="font-bold text-slate-800 dark:text-white">قاعات المقابلات فقط</div>
                            <div class="text-xs text-slate-600 dark:text-slate-400">تصفير جميع قاعات المقابلات</div>
                        </div>
                    </label>
                    
                    <label class="flex items-center gap-3 p-3 border-2 border-red-200 dark:border-red-600 rounded-lg cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/20">
                        <input type="radio" name="resetType" value="all" class="w-4 h-4">
                        <div class="flex-1 text-right">
                            <div class="font-bold text-red-600 dark:text-red-400">تصفير كل شيء</div>
                            <div class="text-xs text-red-600 dark:text-red-400">تصفير جميع الأعداد (خارجي + جميع القاعات)</div>
                        </div>
                    </label>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'تصفير',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#ef4444',
        preConfirm: () => {
            const selected = document.querySelector('input[name="resetType"]:checked');
            if (!selected) {
                Swal.showValidationMessage('الرجاء اختيار نوع التصفير');
                return false;
            }
            return selected.value;
        }
    });

    if (resetType) {
        await executeReset(resetType);
    }
};

async function executeReset(resetType) {
    try {
        const batch = writeBatch(db);
        
        switch (resetType) {
            case 'outdoor':
                // تصفير العدد الخارجي فقط
                batch.update(doc(db, 'settings', 'global_config'), {
                    outdoor_queue: 0
                });
                showToast('تم تصفير العدد الخارجي', 'success');
                break;
                
            case 'waiting':
                // تصفير قاعات الانتظار فقط
                halls.filter(h => h.type === 'انتظار').forEach(hall => {
                    batch.update(doc(db, 'halls', hall.id), {
                        current: 0
                    });
                });
                showToast('تم تصفير قاعات الانتظار', 'success');
                break;
                
            case 'interview':
                // تصفير قاعات المقابلات فقط
                halls.filter(h => h.type === 'مقابلات').forEach(hall => {
                    batch.update(doc(db, 'halls', hall.id), {
                        current: 0
                    });
                });
                showToast('تم تصفير قاعات المقابلات', 'success');
                break;
                
            case 'all':
                // تصفير كل شيء
                batch.update(doc(db, 'settings', 'global_config'), {
                    outdoor_queue: 0
                });
                halls.forEach(hall => {
                    batch.update(doc(db, 'halls', hall.id), {
                        current: 0
                    });
                });
                showToast('تم تصفير جميع الأعداد', 'success');
                break;
        }
        
        await batch.commit();
    } catch (error) {
        console.error('Reset error:', error);
        showToast('حدث خطأ في التصفير', 'error');
    }
}


// ============================================
// DARK MODE TOGGLE
// ============================================

window.toggleDarkMode = function() {
    const html = document.documentElement;
    const isDark = html.classList.contains('dark');
    
    if (isDark) {
        html.classList.remove('dark');
        localStorage.setItem('darkMode', 'light');
        updateDarkModeUI(false);
    } else {
        html.classList.add('dark');
        localStorage.setItem('darkMode', 'dark');
        updateDarkModeUI(true);
    }
};

function updateDarkModeUI(isDark) {
    // Update mobile toggle icon
    const mobileIcon = document.getElementById('darkModeIconMobile');
    if (mobileIcon) {
        if (isDark) {
            mobileIcon.className = 'ph ph-sun text-xl text-yellow-400';
        } else {
            mobileIcon.className = 'ph ph-moon text-xl text-slate-800';
        }
    }
    
    // Update desktop toggle icon and text
    const desktopIcon = document.getElementById('darkModeIconDesktop');
    const desktopText = document.getElementById('darkModeText');
    
    if (desktopIcon) {
        desktopIcon.className = isDark ? 'ph ph-sun' : 'ph ph-moon';
    }
    
    if (desktopText) {
        desktopText.textContent = isDark ? 'وضع نهاري' : 'وضع ليلي';
    }
}

// Initialize dark mode from localStorage
function initDarkMode() {
    const darkMode = localStorage.getItem('darkMode');
    const html = document.documentElement;
    
    if (darkMode === 'dark') {
        html.classList.add('dark');
        updateDarkModeUI(true);
    } else {
        html.classList.remove('dark');
        updateDarkModeUI(false);
    }
}

// Call on page load
initDarkMode();


// ============================================
// DRAWER LOGIC (Mobile)
// ============================================

window.toggleDrawer = function() {
    const drawer = document.getElementById('mobileDrawer');
    const overlay = document.getElementById('drawerOverlay');
    
    if (drawer.classList.contains('open')) {
        closeDrawer();
    } else {
        openDrawer();
    }
};

function openDrawer() {
    const drawer = document.getElementById('mobileDrawer');
    const overlay = document.getElementById('drawerOverlay');
    
    drawer.classList.add('open');
    drawer.classList.remove('translate-x-full');
    overlay.classList.remove('hidden');
    overlay.classList.add('show');
    
    // Prevent body scroll when drawer is open
    document.body.style.overflow = 'hidden';
}

window.closeDrawer = function() {
    const drawer = document.getElementById('mobileDrawer');
    const overlay = document.getElementById('drawerOverlay');
    
    drawer.classList.remove('open');
    drawer.classList.add('translate-x-full');
    overlay.classList.add('hidden');
    overlay.classList.remove('show');
    
    // Restore body scroll
    document.body.style.overflow = '';
};

// Close drawer on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeDrawer();
    }
});

// Update updateSidebarNav to also update drawer
const originalUpdateSidebarNav = updateSidebarNav;
updateSidebarNav = function() {
    const navItems = [];

    // Dashboard - للجميع ماعدا العداد الخارجي
    if (currentUser.role !== ROLES.EXTERNAL_COUNTER) {
        navItems.push({
            icon: 'ph-bold ph-squares-four',
            label: 'لوحة التحكم',
            view: 'dashboard'
        });
    }

    // External Counter - للعداد الخارجي فقط
    if (currentUser.role === ROLES.EXTERNAL_COUNTER) {
        navItems.push({
            icon: 'ph-bold ph-counter',
            label: 'العداد الخارجي',
            view: 'external'
        });
    }

    // My Hall - لمسؤولي القاعات
    if (currentUser.role === ROLES.WAITING_HALL || currentUser.role === ROLES.INTERVIEW_HALL) {
        navItems.push({
            icon: 'ph-bold ph-building',
            label: 'قاعتي',
            view: 'myHall'
        });
    }

    // Halls Management - للمدير فقط
    if (currentUser.role === ROLES.ADMIN) {
        navItems.push({
            icon: 'ph-bold ph-buildings',
            label: 'إدارة القاعات',
            view: 'hallsManagement'
        });
    }

    // Users Management - للمدير فقط
    if (currentUser.role === ROLES.ADMIN) {
        navItems.push({
            icon: 'ph-bold ph-users',
            label: 'إدارة المستخدمين',
            view: 'usersManagement'
        });
    }

    // Analytics - للمدير والعارض
    if (currentUser.role === ROLES.ADMIN || currentUser.role === ROLES.VIEWER) {
        navItems.push({
            icon: 'ph-bold ph-chart-line',
            label: 'الإحصائيات',
            view: 'analytics'
        });
    }

    // Profile - للجميع
    navItems.push({
        icon: 'ph-bold ph-user-circle',
        label: 'الملف الشخصي',
        view: 'profile'
    });

    const navHTML = navItems.map(item => `
        <button onclick="showView('${item.view}'); closeDrawer();" class="nav-item w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition text-right touch-manipulation">
            <i class="${item.icon} text-xl"></i>
            <span class="font-bold text-sm">${item.label}</span>
        </button>
    `).join('');

    // Update both sidebar and drawer
    const sidebarNav = document.getElementById('sidebarNav');
    const drawerNav = document.getElementById('drawerNav');
    
    if (sidebarNav) sidebarNav.innerHTML = navHTML;
    if (drawerNav) drawerNav.innerHTML = navHTML;
};

// Update showView to update mobile page title
const originalShowView = window.showView;
window.showView = function(viewName) {
    // Call original function
    originalShowView(viewName);
    
    // Update mobile page title
    const titles = {
        'dashboard': 'لوحة التحكم',
        'external': 'العداد الخارجي',
        'myHall': 'قاعتي',
        'hallsManagement': 'إدارة القاعات',
        'usersManagement': 'إدارة المستخدمين',
        'analytics': 'الإحصائيات',
        'profile': 'الملف الشخصي'
    };
    
    const mobileTitle = document.getElementById('mobilePageTitle');
    if (mobileTitle && titles[viewName]) {
        mobileTitle.textContent = titles[viewName];
    }
    
    // Close drawer after navigation (mobile)
    closeDrawer();
};

// Update login to set user info in both places
const originalLogin = window.login;
window.login = async function() {
    await originalLogin();
    
    if (currentUser) {
        // Update Sidebar
        const userNameSidebar = document.getElementById('userNameSidebar');
        const userRoleSidebar = document.getElementById('userRoleSidebar');
        if (userNameSidebar) userNameSidebar.textContent = currentUser.fullName || currentUser.id;
        if (userRoleSidebar) userRoleSidebar.textContent = getRoleLabel(currentUser.role);
        
        // Update Drawer
        const userNameDrawer = document.getElementById('userNameDrawer');
        const userRoleDrawer = document.getElementById('userRoleDrawer');
        if (userNameDrawer) userNameDrawer.textContent = currentUser.fullName || currentUser.id;
        if (userRoleDrawer) userRoleDrawer.textContent = getRoleLabel(currentUser.role);
    }
};

console.log('✅ B36 v36 Rebuilt - Drawer Logic Loaded');
