import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot, getDoc, getDocs, setDoc, updateDoc, increment, writeBatch, deleteDoc, serverTimestamp, query, orderBy, limit, where, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
// RBAC SYSTEM - نظام الأدوار والصلاحيات
// ============================================

const ROLES = {
    ADMIN: 'مدير_عام',
    EXTERNAL_SUPERVISOR: 'منظم_خارجي_مشرف',
    EXTERNAL_REGULAR: 'منظم_خارجي_عادي',
    INTERNAL_SUPERVISOR: 'منظم_داخلي_مشرف',
    INTERNAL_REGULAR: 'منظم_داخلي_عادي',
    PATH_ORGANIZER: 'منظم_مسار',
    VIEWER: 'عارض'
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
    VIEW_MY_HALL: 'view_my_hall'
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
        PERMISSIONS.VIEW_DASHBOARD,
        PERMISSIONS.VIEW_REQUESTS,
        PERMISSIONS.VIEW_ANALYTICS
    ],
    [ROLES.INTERNAL_REGULAR]: [
        PERMISSIONS.ACCEPT_REJECT_REQUEST,
        PERMISSIONS.CONFIRM_ARRIVAL,
        PERMISSIONS.VIEW_MY_HALL,
        PERMISSIONS.VIEW_DASHBOARD
    ],
    [ROLES.PATH_ORGANIZER]: [
        PERMISSIONS.EXECUTE_TRANSFER,
        PERMISSIONS.START_TRANSIT,
        PERMISSIONS.VIEW_DASHBOARD,
        PERMISSIONS.VIEW_REQUESTS
    ],
    [ROLES.VIEWER]: [
        PERMISSIONS.VIEW_ANALYTICS,
        PERMISSIONS.VIEW_DASHBOARD
    ]
};

function hasPermission(permission) {
    if (!currentUser) return false;
    const rolePermissions = ROLE_PERMISSIONS[currentUser.role] || [];
    return rolePermissions.includes(permission);
}

// ============================================
// STATE
// ============================================

let currentUser = null;
let halls = [];
let transferRequests = [];
let users = [];
let globalStats = { served: 0, outdoor_queue: 0 };
let currentView = 'dashboard';
let isLoading = false;

// ============================================
// UI HELPERS
// ============================================

window.toggleSidebar = () => {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('drawer-closed');
    if (sidebar.classList.contains('drawer-closed')) {
        overlay.classList.add('hidden');
    } else {
        overlay.classList.remove('hidden');
    }
};

window.toggleDark = () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('darkMode', document.documentElement.classList.contains('dark'));
};

if (localStorage.getItem('darkMode') === 'true') {
    document.documentElement.classList.add('dark');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    
    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        warning: 'bg-amber-500',
        info: 'bg-blue-500'
    };
    
    const icons = {
        success: 'ph-check-circle',
        error: 'ph-x-circle',
        warning: 'ph-warning',
        info: 'ph-info'
    };
    
    toast.className = `toast ${colors[type]} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2`;
    toast.innerHTML = `<i class="ph ${icons[type]} text-xl"></i><span class="text-sm font-bold">${message}</span>`;
    
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function setLoading(state) {
    isLoading = state;
}

async function logActivity(action, details, entityType = null, entityId = null, before = null, after = null, reason = null) {
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
            timestamp: serverTimestamp(),
            ipAddress: null
        });
    } catch (e) {
        console.error('Log error:', e);
    }
}

// ============================================
// LOGIN
// ============================================

window.login = async () => {
    const u = document.getElementById('username').value.toLowerCase().trim();
    const p = document.getElementById('password').value;
    
    if (!u || !p) {
        showToast('يرجى إدخال اسم المستخدم وكلمة المرور', 'warning');
        return;
    }
    
    setLoading(true);
    try {
        const d = await getDoc(doc(db, "users", u));
        if (d.exists() && d.data().pass === p) {
            currentUser = { id: u, ...d.data() };
            
            if (!Object.values(ROLES).includes(currentUser.role)) {
                showToast('دور المستخدم غير صحيح', 'error');
                setLoading(false);
                return;
            }
            
            document.getElementById('loginScreen').classList.add('hidden');
            document.getElementById('mainApp').classList.remove('hidden');
            document.getElementById('userRoleDisplay').textContent = currentUser.role;
            
            buildNavigation();
            listenToData();
            showView('dashboard');
            showToast(`مرحباً ${currentUser.fullName || currentUser.id}`, 'success');
            await logActivity('LOGIN', `تسجيل دخول للنظام`);
        } else {
            showToast('بيانات دخول خاطئة', 'error');
        }
    } catch (e) {
        console.error('Login error:', e);
        showToast('خطأ في الاتصال بالنظام', 'error');
    } finally {
        setLoading(false);
    }
};

window.logout = async () => {
    await logActivity('LOGOUT', `تسجيل خروج من النظام`);
    currentUser = null;
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    showToast('تم تسجيل الخروج بنجاح', 'success');
};

// ============================================
// NAVIGATION
// ============================================

function buildNavigation() {
    const navMenu = document.getElementById('navMenu');
    navMenu.innerHTML = '';
    
    const menuItems = [];
    
    if (hasPermission(PERMISSIONS.VIEW_DASHBOARD)) {
        menuItems.push({ view: 'dashboard', icon: 'ph-squares-four', text: 'لوحة التحكم', color: '#6B9AC4' });
    }
    
    if (hasPermission(PERMISSIONS.VIEW_REQUESTS)) {
        menuItems.push({ view: 'requests', icon: 'ph-swap', text: 'طلبات النقل', color: '#E8A87C' });
    }
    
    if (hasPermission(PERMISSIONS.VIEW_MY_HALL) && currentUser.assignedHallId) {
        menuItems.push({ view: 'my-hall', icon: 'ph-door', text: 'قاعتي', color: '#88B2AC' });
    }
    
    if (hasPermission(PERMISSIONS.VIEW_ANALYTICS)) {
        menuItems.push({ view: 'analytics', icon: 'ph-chart-bar', text: 'الإحصائيات', color: '#8BA888' });
    }
    
    if (hasPermission(PERMISSIONS.MANAGE_HALLS)) {
        menuItems.push({ view: 'manage-halls', icon: 'ph-building', text: 'إدارة القاعات', color: '#6B9AC4' });
        menuItems.push({ view: 'manage-users', icon: 'ph-users', text: 'إدارة المستخدمين', color: '#6B9AC4' });
    }
    
    if (hasPermission(PERMISSIONS.VIEW_AUDIT_LOG)) {
        menuItems.push({ view: 'audit-log', icon: 'ph-clock-clockwise', text: 'سجل العمليات', color: '#B8A4C9' });
    }
    
    menuItems.forEach(item => {
        const btn = document.createElement('button');
        btn.onclick = () => showView(item.view);
        btn.className = 'w-full flex items-center gap-3 p-3 rounded-xl font-bold text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition';
        btn.innerHTML = `<i class="${item.icon} text-xl" style="color: ${item.color}"></i> ${item.text}`;
        navMenu.appendChild(btn);
    });
}

// ============================================
// DATA LISTENERS
// ============================================

function listenToData() {
    onSnapshot(collection(db, "halls"), (s) => {
        halls = [];
        s.forEach(d => halls.push({ id: d.id, ...d.data() }));
        halls.sort((a, b) => {
            const numA = parseInt(a.name.replace(/\D/g,'')) || 999;
            const numB = parseInt(b.name.replace(/\D/g,'')) || 999;
            return numA - numB;
        });
        updateKPIs();
        renderCurrentView();
    });
    
    onSnapshot(doc(db, "settings", "global_config"), (s) => {
        if (s.exists()) {
            const d = s.data();
            globalStats = { served: d.served_count || 0, outdoor_queue: d.outdoor_queue || 0 };
            updateKPIs();
        }
    });
    
    if (hasPermission(PERMISSIONS.ASSIGN_USERS)) {
        onSnapshot(collection(db, "users"), (s) => {
            users = [];
            s.forEach(d => users.push({ id: d.id, ...d.data() }));
            renderCurrentView();
        });
    }
    
    let requestsQuery = null;
    
    if (currentUser.role === ROLES.ADMIN || currentUser.role === ROLES.INTERNAL_SUPERVISOR) {
        requestsQuery = query(collection(db, "transfer_requests"), orderBy("createdAt", "desc"));
    } else if (currentUser.role === ROLES.EXTERNAL_SUPERVISOR) {
        requestsQuery = query(
            collection(db, "transfer_requests"),
            where("createdBy", "==", currentUser.id),
            orderBy("createdAt", "desc")
        );
    } else if (currentUser.role === ROLES.PATH_ORGANIZER) {
        requestsQuery = query(
            collection(db, "transfer_requests"),
            where("assignedPathOrganizer", "==", currentUser.id),
            orderBy("createdAt", "desc")
        );
    } else if (currentUser.role === ROLES.INTERNAL_REGULAR && currentUser.assignedHallId) {
        requestsQuery = query(
            collection(db, "transfer_requests"),
            where("toId", "==", currentUser.assignedHallId),
            orderBy("createdAt", "desc")
        );
    }
    
    if (requestsQuery) {
        onSnapshot(requestsQuery, (s) => {
            transferRequests = [];
            s.forEach(d => transferRequests.push({ id: d.id, ...d.data() }));
            renderCurrentView();
        });
    }
}

function updateKPIs() {
    const kpiContainer = document.getElementById('kpiContainer');
    if (!kpiContainer) return;
    
    const waitingHalls = halls.filter(h => h.type === 'انتظار' && h.active);
    const interviewHalls = halls.filter(h => h.type === 'مقابلات' && h.active);
    
    const totalWaiting = waitingHalls.reduce((a, b) => a + (b.current || 0), 0);
    const totalInterview = interviewHalls.reduce((a, b) => a + (b.current || 0), 0);
    const totalIndoor = totalWaiting + totalInterview;
    const totalCap = halls.filter(h => h.active).reduce((a, b) => a + (b.capacity || 0), 0);
    const occupancyRate = totalCap > 0 ? Math.round((totalIndoor / totalCap) * 100) : 0;
    
    if (currentUser.role === ROLES.ADMIN || currentUser.role === ROLES.INTERNAL_SUPERVISOR) {
        kpiContainer.innerHTML = `
            <div class="text-center p-3">
                <span class="block text-xs text-slate-400 mb-1">ينتظرون خارجاً</span>
                <span class="text-2xl font-black text-[#E8A87C]">${globalStats.outdoor_queue}</span>
            </div>
            <div class="text-center p-3 border-r">
                <span class="block text-xs text-slate-400 mb-1">قاعات الانتظار</span>
                <span class="text-2xl font-black text-[#6B9AC4]">${totalWaiting}</span>
            </div>
            <div class="text-center p-3 border-r">
                <span class="block text-xs text-slate-400 mb-1">قاعات المقابلات</span>
                <span class="text-2xl font-black text-[#88B2AC]">${totalInterview}</span>
            </div>
            <div class="text-center p-3 border-r">
                <span class="block text-xs text-slate-400 mb-1">تمت خدمتهم</span>
                <span class="text-2xl font-black text-[#8BA888]">${globalStats.served}</span>
            </div>
            <div class="text-center p-3 border-r">
                <span class="block text-xs text-slate-400 mb-1">الإشغال</span>
                <span class="text-2xl font-black text-[#B8A4C9]">${occupancyRate}%</span>
            </div>
        `;
    } else if (currentUser.role === ROLES.EXTERNAL_SUPERVISOR || currentUser.role === ROLES.EXTERNAL_REGULAR) {
        kpiContainer.innerHTML = `
            <div class="text-center p-3 col-span-5">
                <span class="block text-xs text-slate-400 mb-1">ينتظرون خارجاً</span>
                <span class="text-2xl font-black text-[#E8A87C]">${globalStats.outdoor_queue}</span>
            </div>
        `;
    }
}

// ============================================
// VIEW RENDERING
// ============================================

window.showView = (view) => {
    currentView = view;
    renderCurrentView();
    
    if (window.innerWidth < 1024) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar && !sidebar.classList.contains('drawer-closed')) {
            sidebar.classList.add('drawer-closed');
            overlay.classList.add('hidden');
        }
    }
};

function renderCurrentView() {
    if (currentView === 'dashboard') renderDashboard();
    else if (currentView === 'requests') renderRequests();
    else if (currentView === 'my-hall') renderMyHall();
    else if (currentView === 'analytics') renderAnalytics();
    else if (currentView === 'manage-halls') renderManageHalls();
    else if (currentView === 'manage-users') renderManageUsers();
    else if (currentView === 'audit-log') renderAuditLog();
}

function renderDashboard() {
    const content = document.getElementById('contentArea');
    
    let html = `<h2 class="text-2xl font-black mb-6">لوحة التحكم</h2>`;
    
    if (currentUser.role === ROLES.EXTERNAL_SUPERVISOR) {
        html += `
        <div class="grid md:grid-cols-2 gap-6">
            <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow">
                <h3 class="font-bold text-lg mb-4">إدارة الانتظار الخارجي</h3>
                <div class="bg-gradient-to-r from-orange-400 to-orange-500 text-white p-6 rounded-xl mb-4">
                    <p class="text-5xl font-black">${globalStats.outdoor_queue}</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="adjustOutdoor(10)" class="flex-1 bg-green-500 text-white p-3 rounded-lg font-bold">+ إضافة</button>
                    <button onclick="adjustOutdoor(-10)" class="flex-1 bg-red-500 text-white p-3 rounded-lg font-bold">- خصم</button>
                </div>
            </div>
            <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow">
                <h3 class="font-bold text-lg mb-4">إنشاء طلب نقل</h3>
                <button onclick="showCreateRequestModal()" class="w-full bg-gradient-to-r from-blue-500 to-green-500 text-white p-4 rounded-xl font-bold">
                    طلب إرسال مرشحين لقاعة انتظار
                </button>
            </div>
        </div>
        `;
    } else if (currentUser.role === ROLES.EXTERNAL_REGULAR) {
        html += `
        <div class="max-w-2xl mx-auto">
            <div class="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow text-center">
                <h3 class="font-bold text-xl mb-4">إدخال عدد الواصلين</h3>
                <button onclick="addArrivalCount()" class="bg-gradient-to-r from-blue-500 to-green-500 text-white px-8 py-4 rounded-xl font-bold text-lg">
                    إضافة واصلين
                </button>
            </div>
        </div>
        `;
    } else if (currentUser.role === ROLES.ADMIN) {
        html += `
        <div class="grid md:grid-cols-3 gap-6">
            <button onclick="showView('requests')" class="bg-white dark:bg-slate-800 p-6 rounded-2xl border-2 hover:border-[#6B9AC4] transition text-right">
                <i class="ph ph-swap text-4xl text-[#6B9AC4] mb-3"></i>
                <h3 class="font-bold text-lg">طلبات النقل</h3>
                <p class="text-sm text-slate-500 mt-1">${transferRequests.length} طلب</p>
            </button>
            
            <button onclick="showView('manage-halls')" class="bg-white dark:bg-slate-800 p-6 rounded-2xl border-2 hover:border-[#6B9AC4] transition text-right">
                <i class="ph ph-building text-4xl text-[#6B9AC4] mb-3"></i>
                <h3 class="font-bold text-lg">إدارة القاعات</h3>
                <p class="text-sm text-slate-500 mt-1">${halls.length} قاعة</p>
            </button>
            
            <button onclick="showView('manage-users')" class="bg-white dark:bg-slate-800 p-6 rounded-2xl border-2 hover:border-[#6B9AC4] transition text-right">
                <i class="ph ph-users text-4xl text-[#6B9AC4] mb-3"></i>
                <h3 class="font-bold text-lg">إدارة المستخدمين</h3>
                <p class="text-sm text-slate-500 mt-1">${users.length} مستخدم</p>
            </button>
        </div>
        `;
    } else {
        html += '<div class="bg-white dark:bg-slate-800 p-12 rounded-2xl shadow text-center"><h3 class="text-2xl font-bold">مرحباً بك في النظام</h3></div>';
    }
    
    content.innerHTML = html;
}

function renderRequests() {
    const content = document.getElementById('contentArea');
    
    if (transferRequests.length === 0) {
        content.innerHTML = `
            <h2 class="text-2xl font-black mb-6">طلبات النقل</h2>
            <div class="bg-white dark:bg-slate-800 p-12 rounded-2xl shadow text-center">
                <p class="text-slate-500">لا توجد طلبات نقل حالياً</p>
            </div>
        `;
        return;
    }
    
    let html = `<h2 class="text-2xl font-black mb-6">طلبات النقل (${transferRequests.length})</h2>
    <div class="space-y-4">`;
    
    transferRequests.forEach(req => {
        const fromHall = halls.find(h => h.id === req.fromId);
        const toHall = halls.find(h => h.id === req.toId);
        const statusClass = `status-${req.status}`;
        
        html += `
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow p-4">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <h3 class="font-bold text-lg">${fromHall?.name || 'خارج'} → ${toHall?.name || 'غير معروف'}</h3>
                    <p class="text-sm text-slate-500">الطلب: ${req.id.substring(0, 8)}</p>
                </div>
                <span class="px-3 py-1 rounded-full text-white text-xs font-bold ${statusClass}">
                    ${getStatusLabel(req.status)}
                </span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-sm mb-3">
                <div><span class="text-slate-500">العدد:</span> <span class="font-bold">${req.count}</span></div>
                <div><span class="text-slate-500">التاريخ:</span> <span class="font-bold">${new Date(req.createdAt?.toDate?.() || req.createdAt).toLocaleDateString('ar-SA')}</span></div>
            </div>
            <div class="flex gap-2">
                ${getRequestActions(req)}
            </div>
        </div>
        `;
    });
    
    html += `</div>`;
    content.innerHTML = html;
}

function renderMyHall() {
    const content = document.getElementById('contentArea');
    const myHall = halls.find(h => h.id === currentUser.assignedHallId);
    
    if (!myHall) {
        content.innerHTML = `<h2 class="text-2xl font-black mb-6">قاعتي</h2>
        <div class="bg-white dark:bg-slate-800 p-12 rounded-2xl shadow text-center">
            <p class="text-slate-500">لم يتم تعيين قاعة لك</p>
        </div>`;
        return;
    }
    
    const occupancyPercent = myHall.capacity > 0 ? Math.round((myHall.current / myHall.capacity) * 100) : 0;
    
    let html = `<h2 class="text-2xl font-black mb-6">قاعتي: ${myHall.name}</h2>
    <div class="grid md:grid-cols-2 gap-6">
        <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow">
            <h3 class="font-bold text-lg mb-4">معلومات القاعة</h3>
            <div class="space-y-3">
                <div class="flex justify-between">
                    <span class="text-slate-500">النوع:</span>
                    <span class="font-bold">${myHall.type}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-slate-500">السعة الكلية:</span>
                    <span class="font-bold">${myHall.capacity}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-slate-500">العدد الحالي:</span>
                    <span class="font-bold text-[#6B9AC4]">${myHall.current}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-slate-500">نسبة الإشغال:</span>
                    <span class="font-bold text-[#E8A87C]">${occupancyPercent}%</span>
                </div>
            </div>
        </div>
        <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow">
            <h3 class="font-bold text-lg mb-4">الحالة</h3>
            <div class="text-center">
                <div class="w-32 h-32 mx-auto rounded-full flex items-center justify-center mb-4" style="background: conic-gradient(#6B9AC4 0deg ${occupancyPercent * 3.6}deg, #e5e7eb ${occupancyPercent * 3.6}deg);">
                    <div class="w-28 h-28 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center">
                        <span class="text-3xl font-black text-[#6B9AC4]">${occupancyPercent}%</span>
                    </div>
                </div>
                <p class="text-sm text-slate-500">${myHall.active ? 'القاعة نشطة' : 'القاعة معطلة'}</p>
            </div>
        </div>
    </div>`;
    
    content.innerHTML = html;
}

function renderAnalytics() {
    const content = document.getElementById('contentArea');
    
    const totalHalls = halls.length;
    const activeHalls = halls.filter(h => h.active).length;
    const totalCapacity = halls.reduce((a, b) => a + (b.capacity || 0), 0);
    const totalCurrent = halls.reduce((a, b) => a + (b.current || 0), 0);
    const occupancyRate = totalCapacity > 0 ? Math.round((totalCurrent / totalCapacity) * 100) : 0;
    
    const waitingHalls = halls.filter(h => h.type === 'انتظار').length;
    const interviewHalls = halls.filter(h => h.type === 'مقابلات').length;
    
    let html = `<h2 class="text-2xl font-black mb-6">الإحصائيات والتحليلات</h2>
    <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="bg-white dark:bg-slate-800 p-4 rounded-xl shadow">
            <p class="text-xs text-slate-500 mb-2">إجمالي القاعات</p>
            <p class="text-3xl font-black text-[#6B9AC4]">${totalHalls}</p>
        </div>
        <div class="bg-white dark:bg-slate-800 p-4 rounded-xl shadow">
            <p class="text-xs text-slate-500 mb-2">القاعات النشطة</p>
            <p class="text-3xl font-black text-[#88B2AC]">${activeHalls}</p>
        </div>
        <div class="bg-white dark:bg-slate-800 p-4 rounded-xl shadow">
            <p class="text-xs text-slate-500 mb-2">نسبة الإشغال</p>
            <p class="text-3xl font-black text-[#E8A87C]">${occupancyRate}%</p>
        </div>
        <div class="bg-white dark:bg-slate-800 p-4 rounded-xl shadow">
            <p class="text-xs text-slate-500 mb-2">إجمالي الحاضرين</p>
            <p class="text-3xl font-black text-[#8BA888]">${totalCurrent}</p>
        </div>
    </div>
    
    <div class="grid md:grid-cols-2 gap-6">
        <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow">
            <h3 class="font-bold text-lg mb-4">توزيع أنواع القاعات</h3>
            <div class="space-y-3">
                <div class="flex justify-between items-center">
                    <span>قاعات الانتظار</span>
                    <span class="font-bold text-[#6B9AC4]">${waitingHalls}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span>قاعات المقابلات</span>
                    <span class="font-bold text-[#88B2AC]">${interviewHalls}</span>
                </div>
            </div>
        </div>
        
        <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow">
            <h3 class="font-bold text-lg mb-4">الإحصائيات العامة</h3>
            <div class="space-y-3">
                <div class="flex justify-between items-center">
                    <span>السعة الكلية</span>
                    <span class="font-bold text-[#6B9AC4]">${totalCapacity}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span>الأماكن المتاحة</span>
                    <span class="font-bold text-[#88B2AC]">${totalCapacity - totalCurrent}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span>ينتظرون خارجاً</span>
                    <span class="font-bold text-[#E8A87C]">${globalStats.outdoor_queue}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span>تمت خدمتهم</span>
                    <span class="font-bold text-[#8BA888]">${globalStats.served}</span>
                </div>
            </div>
        </div>
    </div>`;
    
    content.innerHTML = html;
}

function renderManageHalls() {
    const content = document.getElementById('contentArea');
    
    let html = `<div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-black">إدارة القاعات</h2>
        <button onclick="showAddHallModal()" class="bg-green-500 text-white px-4 py-2 rounded-lg font-bold">+ قاعة جديدة</button>
    </div>`;
    
    if (halls.length === 0) {
        html += `<div class="bg-white dark:bg-slate-800 p-12 rounded-2xl shadow text-center">
            <p class="text-slate-500">لا توجد قاعات حالياً</p>
        </div>`;
    } else {
        html += `<div class="grid gap-4">`;
        halls.forEach(hall => {
            const occupancyPercent = hall.capacity > 0 ? Math.round((hall.current / hall.capacity) * 100) : 0;
            html += `
            <div class="bg-white dark:bg-slate-800 p-4 rounded-xl shadow">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <h3 class="font-bold text-lg">${hall.name}</h3>
                        <p class="text-sm text-slate-500">${hall.type}</p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="showEditHallModal('${hall.id}')" class="bg-blue-500 text-white px-3 py-1 rounded text-sm font-bold">تعديل</button>
                        <button onclick="deleteHall('${hall.id}')" class="bg-red-500 text-white px-3 py-1 rounded text-sm font-bold">حذف</button>
                    </div>
                </div>
                <div class="grid grid-cols-4 gap-2 text-sm">
                    <div><span class="text-slate-500">السعة:</span> <span class="font-bold">${hall.capacity}</span></div>
                    <div><span class="text-slate-500">الحالي:</span> <span class="font-bold">${hall.current}</span></div>
                    <div><span class="text-slate-500">الإشغال:</span> <span class="font-bold">${occupancyPercent}%</span></div>
                    <div><span class="text-slate-500">الحالة:</span> <span class="font-bold">${hall.active ? '✓ نشطة' : '✗ معطلة'}</span></div>
                </div>
            </div>
            `;
        });
        html += `</div>`;
    }
    
    content.innerHTML = html;
}

function renderManageUsers() {
    const content = document.getElementById('contentArea');
    
    let html = `<div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-black">إدارة المستخدمين</h2>
        <button onclick="showAddUserModal()" class="bg-green-500 text-white px-4 py-2 rounded-lg font-bold">+ مستخدم جديد</button>
    </div>`;
    
    if (users.length === 0) {
        html += `<div class="bg-white dark:bg-slate-800 p-12 rounded-2xl shadow text-center">
            <p class="text-slate-500">لا يوجد مستخدمون حالياً</p>
        </div>`;
    } else {
        html += `<div class="grid gap-4">`;
        users.forEach(user => {
            const assignedHall = halls.find(h => h.id === user.assignedHallId);
            html += `
            <div class="bg-white dark:bg-slate-800 p-4 rounded-xl shadow">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <h3 class="font-bold text-lg">${user.fullName || user.id}</h3>
                        <p class="text-sm text-slate-500">${user.role}</p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="showEditUserModal('${user.id}')" class="bg-blue-500 text-white px-3 py-1 rounded text-sm font-bold">تعديل</button>
                        <button onclick="deleteUser('${user.id}')" class="bg-red-500 text-white px-3 py-1 rounded text-sm font-bold">حذف</button>
                    </div>
                </div>
                <div class="grid grid-cols-3 gap-2 text-sm">
                    <div><span class="text-slate-500">المستخدم:</span> <span class="font-bold">${user.id}</span></div>
                    <div><span class="text-slate-500">القاعة:</span> <span class="font-bold">${assignedHall?.name || 'لم يتم التعيين'}</span></div>
                    <div><span class="text-slate-500">الحالة:</span> <span class="font-bold">${user.active ? '✓ نشط' : '✗ معطل'}</span></div>
                </div>
            </div>
            `;
        });
        html += `</div>`;
    }
    
    content.innerHTML = html;
}

function renderAuditLog() {
    const content = document.getElementById('contentArea');
    
    content.innerHTML = `
        <h2 class="text-2xl font-black mb-6">سجل العمليات</h2>
        <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow">
            <div id="auditLogContainer" class="space-y-3"></div>
        </div>
    `;
    
    loadAuditLog();
}

async function loadAuditLog() {
    try {
        const q = query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), limit(50));
        const snapshot = await getDocs(q);
        const logs = [];
        snapshot.forEach(doc => {
            logs.push({ id: doc.id, ...doc.data() });
        });
        
        const container = document.getElementById('auditLogContainer');
        if (logs.length === 0) {
            container.innerHTML = '<p class="text-slate-500 text-center py-8">لا توجد عمليات مسجلة</p>';
            return;
        }
        
        let html = '';
        logs.forEach(log => {
            const timestamp = log.timestamp?.toDate?.() || new Date(log.timestamp);
            html += `
            <div class="border-l-4 border-[#6B9AC4] pl-4 py-2">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-bold">${log.action}</p>
                        <p class="text-sm text-slate-500">${log.userName} (${log.userRole})</p>
                    </div>
                    <span class="text-xs text-slate-400">${timestamp.toLocaleString('ar-SA')}</span>
                </div>
                <p class="text-sm mt-1">${log.details}</p>
            </div>
            `;
        });
        
        container.innerHTML = html;
    } catch (e) {
        console.error('Error loading audit log:', e);
        document.getElementById('auditLogContainer').innerHTML = '<p class="text-red-500">خطأ في تحميل السجل</p>';
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getStatusLabel(status) {
    const labels = {
        'pending': 'قيد الانتظار',
        'accepted': 'مقبول',
        'rejected': 'مرفوض',
        'in_transit': 'قيد النقل',
        'arrived': 'وصل',
        'closed': 'مغلق'
    };
    return labels[status] || status;
}

function getRequestActions(req) {
    let html = '';
    
    if (req.status === 'pending' && hasPermission(PERMISSIONS.ACCEPT_REJECT_REQUEST)) {
        html += `
            <button onclick="acceptRequest('${req.id}')" class="flex-1 bg-green-500 text-white px-3 py-2 rounded text-sm font-bold">قبول</button>
            <button onclick="rejectRequest('${req.id}')" class="flex-1 bg-red-500 text-white px-3 py-2 rounded text-sm font-bold">رفض</button>
        `;
    } else if (req.status === 'accepted' && hasPermission(PERMISSIONS.CONFIRM_ARRIVAL)) {
        html += `
            <button onclick="confirmArrival('${req.id}')" class="flex-1 bg-blue-500 text-white px-3 py-2 rounded text-sm font-bold">تأكيد الوصول</button>
        `;
    } else if (req.status === 'arrived' && hasPermission(PERMISSIONS.EXECUTE_TRANSFER)) {
        html += `
            <button onclick="executeTransfer('${req.id}')" class="flex-1 bg-purple-500 text-white px-3 py-2 rounded text-sm font-bold">تنفيذ النقل</button>
        `;
    }
    
    return html || '<span class="text-xs text-slate-500">لا توجد إجراءات متاحة</span>';
}

// ============================================
// ACTIONS - OUTDOOR MANAGEMENT
// ============================================

window.adjustOutdoor = async (n) => {
    try {
        await updateDoc(doc(db, "settings", "global_config"), { outdoor_queue: increment(n) });
        await logActivity(n > 0 ? 'ADD_OUTDOOR' : 'REMOVE_OUTDOOR', `${n > 0 ? 'إضافة' : 'خصم'} ${Math.abs(n)} من الانتظار الخارجي`);
        showToast(n > 0 ? 'تمت الإضافة' : 'تم الخصم', 'success');
    } catch (e) {
        console.error('Error adjusting outdoor:', e);
        showToast('حدث خطأ', 'error');
    }
};

window.addArrivalCount = async () => {
    const { value: count } = await Swal.fire({
        title: 'عدد الواصلين',
        input: 'number',
        inputValue: 10,
        showCancelButton: true,
        confirmButtonText: 'إضافة',
        cancelButtonText: 'إلغاء'
    });
    
    if (count) {
        try {
            await updateDoc(doc(db, "settings", "global_config"), {
                outdoor_queue: increment(parseInt(count))
            });
            await logActivity('ADD_ARRIVALS', `إضافة ${count} واصلين`);
            showToast(`تم إضافة ${count}`, 'success');
        } catch (e) {
            console.error('Error adding arrivals:', e);
            showToast('حدث خطأ', 'error');
        }
    }
};

// ============================================
// ACTIONS - TRANSFER REQUESTS
// ============================================

window.showCreateRequestModal = async () => {
    const waitingHalls = halls.filter(h => h.type === 'انتظار' && h.active);
    
    let hallOptions = '<option value="">اختر قاعة</option>';
    waitingHalls.forEach(hall => {
        hallOptions += `<option value="${hall.id}">${hall.name}</option>`;
    });
    
    const { value: formValues } = await Swal.fire({
        title: 'إنشاء طلب نقل',
        html: `
            <div class="text-right">
                <label class="block mb-2 font-bold">إلى القاعة:</label>
                <select id="toHallSelect" class="w-full p-2 border rounded mb-4">${hallOptions}</select>
                <label class="block mb-2 font-bold">عدد المرشحين:</label>
                <input type="number" id="countInput" class="w-full p-2 border rounded" value="10" min="1">
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'إنشاء',
        cancelButtonText: 'إلغاء',
        didOpen: () => {
            document.getElementById('toHallSelect').focus();
        },
        preConfirm: () => {
            const toHallId = document.getElementById('toHallSelect').value;
            const count = parseInt(document.getElementById('countInput').value);
            
            if (!toHallId) {
                Swal.showValidationMessage('يرجى اختيار قاعة');
                return false;
            }
            if (!count || count < 1) {
                Swal.showValidationMessage('يرجى إدخال عدد صحيح');
                return false;
            }
            
            return { toHallId, count };
        }
    });
    
    if (formValues) {
        await createTransferRequest(formValues.toHallId, formValues.count);
    }
};

async function createTransferRequest(toHallId, count) {
    try {
        setLoading(true);
        
        const toHall = halls.find(h => h.id === toHallId);
        if (!toHall) {
            showToast('القاعة المختارة غير موجودة', 'error');
            return;
        }
        
        const requestData = {
            fromId: null,
            toId: toHallId,
            count: count,
            status: 'pending',
            createdBy: currentUser.id,
            createdAt: serverTimestamp(),
            createdByRole: currentUser.role,
            acceptedBy: null,
            acceptedAt: null,
            confirmedBy: null,
            confirmedAt: null,
            executedBy: null,
            executedAt: null,
            reason: null
        };
        
        const docRef = await addDoc(collection(db, "transfer_requests"), requestData);
        
        await logActivity('CREATE_REQUEST', `إنشاء طلب نقل ${count} مرشح إلى ${toHall.name}`, 'transfer_request', docRef.id, null, requestData);
        
        showToast('تم إنشاء الطلب بنجاح', 'success');
    } catch (e) {
        console.error('Error creating request:', e);
        showToast('حدث خطأ في إنشاء الطلب', 'error');
    } finally {
        setLoading(false);
    }
}

window.acceptRequest = async (requestId) => {
    try {
        setLoading(true);
        
        const req = transferRequests.find(r => r.id === requestId);
        if (!req) return;
        
        await updateDoc(doc(db, "transfer_requests", requestId), {
            status: 'accepted',
            acceptedBy: currentUser.id,
            acceptedAt: serverTimestamp()
        });
        
        await logActivity('ACCEPT_REQUEST', `قبول طلب نقل ${req.count} مرشح`, 'transfer_request', requestId, { status: 'pending' }, { status: 'accepted' });
        
        showToast('تم قبول الطلب', 'success');
    } catch (e) {
        console.error('Error accepting request:', e);
        showToast('حدث خطأ', 'error');
    } finally {
        setLoading(false);
    }
};

window.rejectRequest = async (requestId) => {
    const { value: reason } = await Swal.fire({
        title: 'رفض الطلب',
        input: 'textarea',
        inputPlaceholder: 'السبب...',
        showCancelButton: true,
        confirmButtonText: 'رفض',
        cancelButtonText: 'إلغاء'
    });
    
    if (reason !== undefined && reason !== null) {
        try {
            setLoading(true);
            
            const req = transferRequests.find(r => r.id === requestId);
            if (!req) return;
            
            await updateDoc(doc(db, "transfer_requests", requestId), {
                status: 'rejected',
                reason: reason
            });
            
            await logActivity('REJECT_REQUEST', `رفض طلب نقل ${req.count} مرشح`, 'transfer_request', requestId, { status: 'pending' }, { status: 'rejected' }, reason);
            
            showToast('تم رفض الطلب', 'success');
        } catch (e) {
            console.error('Error rejecting request:', e);
            showToast('حدث خطأ', 'error');
        } finally {
            setLoading(false);
        }
    }
};

window.confirmArrival = async (requestId) => {
    try {
        setLoading(true);
        
        const req = transferRequests.find(r => r.id === requestId);
        if (!req) return;
        
        await updateDoc(doc(db, "transfer_requests", requestId), {
            status: 'arrived',
            confirmedBy: currentUser.id,
            confirmedAt: serverTimestamp()
        });
        
        await logActivity('CONFIRM_ARRIVAL', `تأكيد وصول ${req.count} مرشح`, 'transfer_request', requestId, { status: 'accepted' }, { status: 'arrived' });
        
        showToast('تم تأكيد الوصول', 'success');
    } catch (e) {
        console.error('Error confirming arrival:', e);
        showToast('حدث خطأ', 'error');
    } finally {
        setLoading(false);
    }
};

window.executeTransfer = async (requestId) => {
    try {
        setLoading(true);
        
        const req = transferRequests.find(r => r.id === requestId);
        if (!req) return;
        
        const toHall = halls.find(h => h.id === req.toId);
        if (!toHall) return;
        
        await updateDoc(doc(db, "transfer_requests", requestId), {
            status: 'closed',
            executedBy: currentUser.id,
            executedAt: serverTimestamp()
        });
        
        await updateDoc(doc(db, "halls", req.toId), {
            current: increment(req.count)
        });
        
        await logActivity('EXECUTE_TRANSFER', `تنفيذ نقل ${req.count} مرشح إلى ${toHall.name}`, 'transfer_request', requestId, { status: 'arrived' }, { status: 'closed' });
        
        showToast('تم تنفيذ النقل بنجاح', 'success');
    } catch (e) {
        console.error('Error executing transfer:', e);
        showToast('حدث خطأ', 'error');
    } finally {
        setLoading(false);
    }
};

// ============================================
// ACTIONS - HALLS MANAGEMENT
// ============================================

window.showAddHallModal = async () => {
    const { value: formValues } = await Swal.fire({
        title: 'إضافة قاعة جديدة',
        html: `
            <div class="text-right">
                <label class="block mb-2 font-bold">اسم القاعة:</label>
                <input type="text" id="hallName" class="w-full p-2 border rounded mb-4" placeholder="مثال: قاعة 1">
                <label class="block mb-2 font-bold">النوع:</label>
                <select id="hallType" class="w-full p-2 border rounded mb-4">
                    <option value="انتظار">انتظار</option>
                    <option value="مقابلات">مقابلات</option>
                </select>
                <label class="block mb-2 font-bold">السعة:</label>
                <input type="number" id="hallCapacity" class="w-full p-2 border rounded" value="50" min="1">
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'إضافة',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            const name = document.getElementById('hallName').value;
            const type = document.getElementById('hallType').value;
            const capacity = parseInt(document.getElementById('hallCapacity').value);
            
            if (!name) {
                Swal.showValidationMessage('يرجى إدخال اسم القاعة');
                return false;
            }
            if (!capacity || capacity < 1) {
                Swal.showValidationMessage('يرجى إدخال سعة صحيحة');
                return false;
            }
            
            return { name, type, capacity };
        }
    });
    
    if (formValues) {
        await addHall(formValues);
    }
};

async function addHall(hallData) {
    try {
        setLoading(true);
        
        const hallId = `hall_${Date.now()}`;
        await setDoc(doc(db, "halls", hallId), {
            name: hallData.name,
            type: hallData.type,
            capacity: hallData.capacity,
            current: 0,
            active: true,
            createdAt: serverTimestamp(),
            createdBy: currentUser.id
        });
        
        await logActivity('CREATE_HALL', `إنشاء قاعة جديدة: ${hallData.name}`, 'hall', hallId, null, hallData);
        
        showToast('تم إضافة القاعة بنجاح', 'success');
    } catch (e) {
        console.error('Error adding hall:', e);
        showToast('حدث خطأ', 'error');
    } finally {
        setLoading(false);
    }
}

window.showEditHallModal = async (hallId) => {
    const hall = halls.find(h => h.id === hallId);
    if (!hall) return;
    
    const { value: formValues } = await Swal.fire({
        title: 'تعديل القاعة',
        html: `
            <div class="text-right">
                <label class="block mb-2 font-bold">اسم القاعة:</label>
                <input type="text" id="hallName" class="w-full p-2 border rounded mb-4" value="${hall.name}">
                <label class="block mb-2 font-bold">النوع:</label>
                <select id="hallType" class="w-full p-2 border rounded mb-4">
                    <option value="انتظار" ${hall.type === 'انتظار' ? 'selected' : ''}>انتظار</option>
                    <option value="مقابلات" ${hall.type === 'مقابلات' ? 'selected' : ''}>مقابلات</option>
                </select>
                <label class="block mb-2 font-bold">السعة:</label>
                <input type="number" id="hallCapacity" class="w-full p-2 border rounded" value="${hall.capacity}" min="1">
                <label class="block mb-2 font-bold">الحالة:</label>
                <select id="hallActive" class="w-full p-2 border rounded">
                    <option value="true" ${hall.active ? 'selected' : ''}>نشطة</option>
                    <option value="false" ${!hall.active ? 'selected' : ''}>معطلة</option>
                </select>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'حفظ',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            const name = document.getElementById('hallName').value;
            const type = document.getElementById('hallType').value;
            const capacity = parseInt(document.getElementById('hallCapacity').value);
            const active = document.getElementById('hallActive').value === 'true';
            
            if (!name) {
                Swal.showValidationMessage('يرجى إدخال اسم القاعة');
                return false;
            }
            if (!capacity || capacity < 1) {
                Swal.showValidationMessage('يرجى إدخال سعة صحيحة');
                return false;
            }
            
            return { name, type, capacity, active };
        }
    });
    
    if (formValues) {
        await updateHall(hallId, formValues, hall);
    }
}

async function updateHall(hallId, newData, oldData) {
    try {
        setLoading(true);
        
        await updateDoc(doc(db, "halls", hallId), {
            name: newData.name,
            type: newData.type,
            capacity: newData.capacity,
            active: newData.active
        });
        
        await logActivity('UPDATE_HALL', `تعديل بيانات القاعة: ${newData.name}`, 'hall', hallId, oldData, newData);
        
        showToast('تم تحديث القاعة بنجاح', 'success');
    } catch (e) {
        console.error('Error updating hall:', e);
        showToast('حدث خطأ', 'error');
    } finally {
        setLoading(false);
    }
}

window.deleteHall = async (hallId) => {
    const hall = halls.find(h => h.id === hallId);
    if (!hall) return;
    
    const result = await Swal.fire({
        title: 'تأكيد الحذف',
        text: `هل تريد حذف القاعة "${hall.name}"؟`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'حذف',
        cancelButtonText: 'إلغاء'
    });
    
    if (result.isConfirmed) {
        try {
            setLoading(true);
            
            await deleteDoc(doc(db, "halls", hallId));
            
            await logActivity('DELETE_HALL', `حذف القاعة: ${hall.name}`, 'hall', hallId, hall, null);
            
            showToast('تم حذف القاعة بنجاح', 'success');
        } catch (e) {
            console.error('Error deleting hall:', e);
            showToast('حدث خطأ', 'error');
        } finally {
            setLoading(false);
        }
    }
};

// ============================================
// ACTIONS - USERS MANAGEMENT
// ============================================

window.showAddUserModal = async () => {
    const hallOptions = '<option value="">لم يتم التعيين</option>' + 
        halls.map(h => `<option value="${h.id}">${h.name}</option>`).join('');
    
    const roleOptions = Object.entries(ROLES)
        .map(([key, value]) => `<option value="${value}">${value}</option>`)
        .join('');
    
    const { value: formValues } = await Swal.fire({
        title: 'إضافة مستخدم جديد',
        html: `
            <div class="text-right">
                <label class="block mb-2 font-bold">اسم المستخدم:</label>
                <input type="text" id="userId" class="w-full p-2 border rounded mb-4" placeholder="مثال: user123">
                <label class="block mb-2 font-bold">الاسم الكامل:</label>
                <input type="text" id="fullName" class="w-full p-2 border rounded mb-4" placeholder="مثال: أحمد محمد">
                <label class="block mb-2 font-bold">كلمة المرور:</label>
                <input type="password" id="password" class="w-full p-2 border rounded mb-4" placeholder="كلمة المرور">
                <label class="block mb-2 font-bold">الدور:</label>
                <select id="role" class="w-full p-2 border rounded mb-4">${roleOptions}</select>
                <label class="block mb-2 font-bold">القاعة المعينة:</label>
                <select id="hallId" class="w-full p-2 border rounded">${hallOptions}</select>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'إضافة',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            const userId = document.getElementById('userId').value;
            const fullName = document.getElementById('fullName').value;
            const password = document.getElementById('password').value;
            const role = document.getElementById('role').value;
            const hallId = document.getElementById('hallId').value || null;
            
            if (!userId) {
                Swal.showValidationMessage('يرجى إدخال اسم المستخدم');
                return false;
            }
            if (!fullName) {
                Swal.showValidationMessage('يرجى إدخال الاسم الكامل');
                return false;
            }
            if (!password) {
                Swal.showValidationMessage('يرجى إدخال كلمة المرور');
                return false;
            }
            
            return { userId, fullName, password, role, hallId };
        }
    });
    
    if (formValues) {
        await addUser(formValues);
    }
};

async function addUser(userData) {
    try {
        setLoading(true);
        
        const existingUser = await getDoc(doc(db, "users", userData.userId));
        if (existingUser.exists()) {
            showToast('المستخدم موجود بالفعل', 'warning');
            return;
        }
        
        await setDoc(doc(db, "users", userData.userId), {
            fullName: userData.fullName,
            pass: userData.password,
            role: userData.role,
            assignedHallId: userData.hallId,
            active: true,
            createdAt: serverTimestamp(),
            createdBy: currentUser.id
        });
        
        await logActivity('CREATE_USER', `إنشاء مستخدم جديد: ${userData.fullName}`, 'user', userData.userId, null, userData);
        
        showToast('تم إضافة المستخدم بنجاح', 'success');
    } catch (e) {
        console.error('Error adding user:', e);
        showToast('حدث خطأ', 'error');
    } finally {
        setLoading(false);
    }
}

window.showEditUserModal = async (userId) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    
    const hallOptions = '<option value="">لم يتم التعيين</option>' + 
        halls.map(h => `<option value="${h.id}" ${h.id === user.assignedHallId ? 'selected' : ''}>${h.name}</option>`).join('');
    
    const roleOptions = Object.entries(ROLES)
        .map(([key, value]) => `<option value="${value}" ${value === user.role ? 'selected' : ''}>${value}</option>`)
        .join('');
    
    const { value: formValues } = await Swal.fire({
        title: 'تعديل المستخدم',
        html: `
            <div class="text-right">
                <label class="block mb-2 font-bold">الاسم الكامل:</label>
                <input type="text" id="fullName" class="w-full p-2 border rounded mb-4" value="${user.fullName || ''}">
                <label class="block mb-2 font-bold">كلمة المرور:</label>
                <input type="password" id="password" class="w-full p-2 border rounded mb-4" placeholder="اترك فارغاً لعدم التغيير">
                <label class="block mb-2 font-bold">الدور:</label>
                <select id="role" class="w-full p-2 border rounded mb-4">${roleOptions}</select>
                <label class="block mb-2 font-bold">القاعة المعينة:</label>
                <select id="hallId" class="w-full p-2 border rounded mb-4">${hallOptions}</select>
                <label class="block mb-2 font-bold">الحالة:</label>
                <select id="active" class="w-full p-2 border rounded">
                    <option value="true" ${user.active ? 'selected' : ''}>نشط</option>
                    <option value="false" ${!user.active ? 'selected' : ''}>معطل</option>
                </select>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'حفظ',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            const fullName = document.getElementById('fullName').value;
            const password = document.getElementById('password').value;
            const role = document.getElementById('role').value;
            const hallId = document.getElementById('hallId').value || null;
            const active = document.getElementById('active').value === 'true';
            
            if (!fullName) {
                Swal.showValidationMessage('يرجى إدخال الاسم الكامل');
                return false;
            }
            
            return { fullName, password, role, hallId, active };
        }
    });
    
    if (formValues) {
        await updateUser(userId, formValues, user);
    }
}

async function updateUser(userId, newData, oldData) {
    try {
        setLoading(true);
        
        const updatePayload = {
            fullName: newData.fullName,
            role: newData.role,
            assignedHallId: newData.hallId,
            active: newData.active
        };
        
        if (newData.password) {
            updatePayload.pass = newData.password;
        }
        
        await updateDoc(doc(db, "users", userId), updatePayload);
        
        await logActivity('UPDATE_USER', `تعديل بيانات المستخدم: ${newData.fullName}`, 'user', userId, oldData, newData);
        
        showToast('تم تحديث المستخدم بنجاح', 'success');
    } catch (e) {
        console.error('Error updating user:', e);
        showToast('حدث خطأ', 'error');
    } finally {
        setLoading(false);
    }
}

window.deleteUser = async (userId) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    
    const result = await Swal.fire({
        title: 'تأكيد الحذف',
        text: `هل تريد حذف المستخدم "${user.fullName || userId}"؟`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'حذف',
        cancelButtonText: 'إلغاء'
    });
    
    if (result.isConfirmed) {
        try {
            setLoading(true);
            
            await deleteDoc(doc(db, "users", userId));
            
            await logActivity('DELETE_USER', `حذف المستخدم: ${user.fullName || userId}`, 'user', userId, user, null);
            
            showToast('تم حذف المستخدم بنجاح', 'success');
        } catch (e) {
            console.error('Error deleting user:', e);
            showToast('حدث خطأ', 'error');
        } finally {
            setLoading(false);
        }
    }
};

// ============================================
// SYSTEM RESET
// ============================================

window.systemReset = async () => {
    const result = await Swal.fire({
        title: 'تهيئة النظام',
        text: 'سيتم إنشاء بيانات تجريبية. هل تريد المتابعة؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، هيّئ النظام',
        cancelButtonText: 'إلغاء'
    });
    
    if (!result.isConfirmed) return;
    
    setLoading(true);
    try {
        const batch = writeBatch(db);
        
        // Create demo users
        const demoUsers = [
            { id: 'admin', fullName: 'مدير النظام', pass: '1234', role: ROLES.ADMIN },
            { id: 'external_supervisor', fullName: 'منظم خارجي مشرف', pass: '1234', role: ROLES.EXTERNAL_SUPERVISOR },
            { id: 'external_regular', fullName: 'منظم خارجي عادي', pass: '1234', role: ROLES.EXTERNAL_REGULAR },
            { id: 'internal_supervisor', fullName: 'منظم داخلي مشرف', pass: '1234', role: ROLES.INTERNAL_SUPERVISOR },
            { id: 'internal_regular', fullName: 'منظم داخلي عادي', pass: '1234', role: ROLES.INTERNAL_REGULAR },
            { id: 'path_organizer', fullName: 'منظم مسار', pass: '1234', role: ROLES.PATH_ORGANIZER },
            { id: 'viewer', fullName: 'عارض', pass: '1234', role: ROLES.VIEWER }
        ];
        
        demoUsers.forEach(user => {
            batch.set(doc(db, "users", user.id), {
                ...user,
                active: true,
                assignedHallId: null,
                createdAt: serverTimestamp()
            });
        });
        
        // Create demo halls
        const demoHalls = [
            { name: 'قاعة الانتظار 1', type: 'انتظار', capacity: 50, current: 0 },
            { name: 'قاعة الانتظار 2', type: 'انتظار', capacity: 50, current: 0 },
            { name: 'قاعة المقابلات 1', type: 'مقابلات', capacity: 30, current: 0 },
            { name: 'قاعة المقابلات 2', type: 'مقابلات', capacity: 30, current: 0 }
        ];
        
        demoHalls.forEach((hall, index) => {
            batch.set(doc(db, "halls", `hall_${index + 1}`), {
                ...hall,
                active: true,
                createdAt: serverTimestamp()
            });
        });
        
        // Initialize global config
        batch.set(doc(db, "settings", "global_config"), {
            served_count: 0,
            outdoor_queue: 50,
            lastReset: serverTimestamp()
        });
        
        await batch.commit();
        
        showToast('تم تهيئة النظام بنجاح', 'success');
    } catch (e) {
        console.error('System reset error:', e);
        showToast('حدث خطأ في تهيئة النظام', 'error');
    } finally {
        setLoading(false);
    }
};
