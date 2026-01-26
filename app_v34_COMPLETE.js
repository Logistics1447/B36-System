// ============================================
// B36 HALL MANAGEMENT SYSTEM v34 - COMPLETE
// نظام عد يدوي + أزرار سريعة + Dashboard
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

function getDefaultView() {
    switch(currentUser.role) {
        case ROLES.ADMIN:
        case ROLES.VIEWER:
            return 'dashboard';
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
        <div class="p-6">
            <h1 class="text-3xl font-black text-slate-800 dark:text-white mb-6">📊 لوحة التحكم الرئيسية</h1>
            
            <!-- نشاط القاعات -->
            ${mostActive ? `
            <div class="grid md:grid-cols-2 gap-4 mb-6">
                <div class="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl p-6 border-2 border-green-200 dark:border-green-700">
                    <div class="flex items-center gap-3 mb-2">
                        <i class="ph ph-fire text-3xl text-green-600"></i>
                        <h3 class="text-lg font-black text-green-800 dark:text-green-300">الأكثر نشاطاً</h3>
                    </div>
                    <p class="text-2xl font-black text-green-600 dark:text-green-400">${mostActive.name}</p>
                    <p class="text-sm text-green-700 dark:text-green-300 mt-1">
                        ${mostActive.current} / ${mostActive.capacity} 
                        (${Math.round((mostActive.current / mostActive.capacity) * 100)}%)
                    </p>
                </div>
                
                <div class="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl p-6 border-2 border-blue-200 dark:border-blue-700">
                    <div class="flex items-center gap-3 mb-2">
                        <i class="ph ph-snowflake text-3xl text-blue-600"></i>
                        <h3 class="text-lg font-black text-blue-800 dark:text-blue-300">الأقل نشاطاً</h3>
                    </div>
                    <p class="text-2xl font-black text-blue-600 dark:text-blue-400">${leastActive.name}</p>
                    <p class="text-sm text-blue-700 dark:text-blue-300 mt-1">
                        ${leastActive.current} / ${leastActive.capacity} 
                        (${Math.round((leastActive.current / leastActive.capacity) * 100)}%)
                    </p>
                </div>
            </div>
            ` : ''}
            
            <!-- KPIs الرئيسية -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div class="bg-gradient-to-br from-orange-400 to-orange-500 rounded-xl shadow-lg p-6 text-white">
                    <div class="text-sm opacity-90 mb-2">خارج المبنى</div>
                    <div class="text-4xl font-black">${globalStats.outdoor_queue || 0}</div>
                    <div class="text-xs opacity-75 mt-2">المستهدف: ${globalStats.daily_target}</div>
                    <div class="text-xs opacity-75">${targetProgress}% من الهدف</div>
                </div>
                
                <div class="bg-gradient-to-br from-blue-400 to-blue-500 rounded-xl shadow-lg p-6 text-white">
                    <div class="text-sm opacity-90 mb-2">داخل المبنى</div>
                    <div class="text-4xl font-black">${totalInside}</div>
                    <div class="text-xs opacity-75 mt-2">انتظار: ${totalWaiting}</div>
                    <div class="text-xs opacity-75">مقابلات: ${totalInterview}</div>
                </div>
                
                <div class="bg-gradient-to-br from-purple-400 to-purple-500 rounded-xl shadow-lg p-6 text-white">
                    <div class="text-sm opacity-90 mb-2">الطاقة المتبقية</div>
                    <div class="text-4xl font-black">${remainingCapacity}</div>
                    <div class="text-xs opacity-75 mt-2">من ${totalCapacity}</div>
                </div>
                
                <div class="bg-gradient-to-br from-green-400 to-green-500 rounded-xl shadow-lg p-6 text-white">
                    <div class="text-sm opacity-90 mb-2">تمت خدمتهم</div>
                    <div class="text-4xl font-black">${globalStats.served_count || 0}</div>
                </div>
            </div>
            
            <!-- جميع القاعات -->
            <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6">
                <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-6">🏢 جميع القاعات</h2>
                <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
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
        <div class="border-2 border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:shadow-lg transition-all">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <h3 class="text-lg font-black text-slate-800 dark:text-white">${hall.name}</h3>
                    <span class="text-sm text-slate-500 dark:text-slate-400">${hall.type}</span>
                </div>
                <div class="text-right">
                    <div class="text-3xl font-black ${textColor} dark:opacity-90">${hall.current || 0}</div>
                    <div class="text-xs text-slate-500 dark:text-slate-400">من ${hall.capacity}</div>
                </div>
            </div>
            
            <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 mb-2 overflow-hidden">
                <div class="${colorClass} h-full rounded-full transition-all duration-500" 
                     style="width: ${occupancy}%"></div>
            </div>
            
            <div class="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                <span><strong>${occupancy}%</strong> إشغال</span>
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
            
            await startRealtimeListeners();
            showView(getDefaultView());
        } catch (error) {
            console.error('Session restore error:', error);
            logout();
        }
    }
});

console.log('✅ B36 System v34 - Manual Counter with Quick Buttons - Ready!');
