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
    ADMIN: 'يوزر_المدير_العام',
    EXTERNAL_SUPERVISOR: 'يوزر_المنظم_الخارجي_مشرف',
    EXTERNAL_REGULAR: 'يوزر_المنظم_الخارجي_عادي',
    INTERNAL_SUPERVISOR: 'يوزر_المنظم_الداخلي_مشرف_المبنى',
    INTERNAL_REGULAR: 'يوزر_المنظم_الداخلي_عادي',
    VIEWER: 'يوزر_العرض'
};

// ملاحظة: منظم المسار = INTERNAL_REGULAR مع isPathOrganizer: true

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
// STATE MACHINE - آلية حالات الطلبات
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

const STATE_LABELS = {
    [REQUEST_STATES.DRAFT]: 'مسودة',
    [REQUEST_STATES.PENDING]: 'قيد الانتظار',
    [REQUEST_STATES.ACCEPTED]: 'مقبول',
    [REQUEST_STATES.REJECTED]: 'مرفوض',
    [REQUEST_STATES.IN_TRANSIT]: 'في الطريق',
    [REQUEST_STATES.ARRIVED]: 'وصل',
    [REQUEST_STATES.CLOSED]: 'مغلق'
};

const VALID_TRANSITIONS = {
    [REQUEST_STATES.DRAFT]: [REQUEST_STATES.PENDING],
    [REQUEST_STATES.PENDING]: [REQUEST_STATES.ACCEPTED, REQUEST_STATES.REJECTED],
    [REQUEST_STATES.ACCEPTED]: [REQUEST_STATES.IN_TRANSIT, REQUEST_STATES.ARRIVED],
    [REQUEST_STATES.REJECTED]: [],
    [REQUEST_STATES.IN_TRANSIT]: [REQUEST_STATES.ARRIVED],
    [REQUEST_STATES.ARRIVED]: [REQUEST_STATES.CLOSED],
    [REQUEST_STATES.CLOSED]: []
};

function validateStateTransition(currentState, newState) {
    const validNextStates = VALID_TRANSITIONS[currentState] || [];
    if (!validNextStates.includes(newState)) {
        throw new Error(`انتقال غير صحيح: لا يمكن الانتقال من ${STATE_LABELS[currentState]} إلى ${STATE_LABELS[newState]}`);
    }
    return true;
}

function getStateColor(state) {
    const colors = {
        [REQUEST_STATES.DRAFT]: 'bg-gray-400',
        [REQUEST_STATES.PENDING]: 'status-pending',
        [REQUEST_STATES.ACCEPTED]: 'status-accepted',
        [REQUEST_STATES.REJECTED]: 'status-rejected',
        [REQUEST_STATES.IN_TRANSIT]: 'status-in-transit',
        [REQUEST_STATES.ARRIVED]: 'status-arrived',
        [REQUEST_STATES.CLOSED]: 'status-closed'
    };
    return colors[state] || 'bg-gray-400';
}


// ============================================
// STATE
// ============================================

let currentUser = null;
let halls = [];
let transferRequests = [];
let confirmations = [];
let users = [];
let globalStats = { 
    served_count: 0, 
    outdoor_queue: 0,
    missing_count: 0
};
let currentView = 'dashboard';

// ============================================
// SIDEBAR RENDERING
// ============================================

function renderSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    
    let menuHTML = '<div class="p-4 space-y-2">';
    
    // Dashboard
    menuHTML += `
        <button onclick="showView('dashboard')" class="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all font-bold">
            <i class="ph ph-chart-pie text-xl"></i>
            <span>لوحة التحكم</span>
        </button>
    `;
    
    // الإحصائيات المتقدمة
    if (hasPermission(PERMISSIONS.VIEW_ANALYTICS)) {
        menuHTML += `
            <button onclick="showAdvancedAnalytics()" class="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all font-bold bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20">
                <i class="ph ph-chart-line text-xl text-blue-600"></i>
                <span class="text-blue-700 dark:text-blue-300">📊 إحصائيات متقدمة</span>
            </button>
        `;
    }
    
    // طلبات النقل
    if (hasPermission(PERMISSIONS.VIEW_REQUESTS)) {
        menuHTML += `
            <button onclick="showView('requests')" class="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all font-bold">
                <i class="ph ph-swap text-xl"></i>
                <span>طلبات النقل</span>
            </button>
        `;
    }
    
    // إدارة القاعات
    if (hasPermission(PERMISSIONS.MANAGE_HALLS)) {
        menuHTML += `
            <button onclick="showView('halls')" class="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all font-bold">
                <i class="ph ph-buildings text-xl"></i>
                <span>إدارة القاعات</span>
            </button>
        `;
    }
    
    // إدارة المستخدمين
    if (hasPermission(PERMISSIONS.ASSIGN_USERS)) {
        menuHTML += `
            <button onclick="showView('users')" class="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all font-bold">
                <i class="ph ph-users text-xl"></i>
                <span>إدارة المستخدمين</span>
            </button>
        `;
    }
    
    // سجل العمليات
    if (hasPermission(PERMISSIONS.VIEW_AUDIT_LOG)) {
        menuHTML += `
            <button onclick="showView('audit')" class="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all font-bold">
                <i class="ph ph-clipboard-text text-xl"></i>
                <span>سجل العمليات</span>
            </button>
        `;
    }
    
    // الملف الشخصي
    menuHTML += `
        <button onclick="showView('profile')" class="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all font-bold">
            <i class="ph ph-user text-xl"></i>
            <span>الملف الشخصي</span>
        </button>
    `;
    
    // Super Admin Mode
    if (currentUser && currentUser.role === ROLES.ADMIN) {
        menuHTML += `
            <div class="border-t border-slate-200 dark:border-slate-700 my-4"></div>
            <button onclick="toggleSuperAdminMode()" class="w-full flex items-center gap-3 px-4 py-3 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-xl transition-all font-bold border-2 border-purple-300 dark:border-purple-600">
                <i class="ph ph-magic-wand text-xl"></i>
                <span>🎭 وضع التجربة</span>
            </button>
        `;
    }
    
    // تسجيل الخروج
    menuHTML += `
        <div class="border-t border-slate-200 dark:border-slate-700 my-4"></div>
        <button onclick="logout()" class="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all font-bold">
            <i class="ph ph-sign-out text-xl"></i>
            <span>تسجيل الخروج</span>
        </button>
    `;
    
    menuHTML += '</div>';
    sidebar.innerHTML = menuHTML;
}

function updateSidebar() {
    renderSidebar();
}

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
    
    menuItems.push({ view: 'profile', icon: 'ph-user', text: 'الملف الشخصي', color: '#6B9AC4' });
    
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
            globalStats = { 
                served_count: d.served_count || 0, 
                outdoor_queue: d.outdoor_queue || 0,
                missing_count: d.missing_count || 0
            };
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
    
    // Listener للمصادقات (للـ Admin فقط)
    if (hasPermission(PERMISSIONS.VIEW_AUDIT_LOG)) {
        onSnapshot(collection(db, "confirmations"), (s) => {
            confirmations = [];
            s.forEach(d => confirmations.push({ id: d.id, ...d.data() }));
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
            <div class="text-center p-3 border-r dark:border-slate-600">
                <span class="block text-xs text-slate-400 mb-1">مفقودين</span>
                <span class="text-2xl font-black text-[#C97C7C]">${globalStats.missing_count || 0}</span>
            </div>
            <div class="text-center p-3 border-r dark:border-slate-600">
                <span class="block text-xs text-slate-400 mb-1">تمت خدمتهم</span>
                <span class="text-2xl font-black text-[#8BA888]">${globalStats.served_count || 0}</span>
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
    else if (currentView === 'profile') renderProfile();
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

// دالة بدء النقل (لمنظم المسار)
window.startTransit = async (requestId) => {
    try {
        const req = transferRequests.find(r => r.id === requestId);
        if (!req) {
            showToast('الطلب غير موجود', 'error');
            return;
        }
        
        // التحقق أن المستخدم منظم مسار
        if (!currentUser.isPathOrganizer) {
            showToast('هذه العملية لمنظم المسار فقط', 'error');
            return;
        }
        
        // التحقق أن الطلب معين له
        if (req.assignedPathOrganizer && req.assignedPathOrganizer !== currentUser.id) {
            showToast('هذا الطلب ليس معيناً لك', 'error');
            return;
        }
        
        // التحقق من State Machine
        validateStateTransition(req.status, REQUEST_STATES.IN_TRANSIT);
        
        const result = await Swal.fire({
            title: 'بدء النقل',
            text: `هل تريد بدء نقل ${req.requestedCount || req.count} مرشح؟`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'نعم، ابدأ النقل',
            cancelButtonText: 'إلغاء'
        });
        
        if (!result.isConfirmed) return;
        
        setLoading(true);
        
        const batch = writeBatch(db);
        
        batch.update(doc(db, "transfer_requests", requestId), {
            status: REQUEST_STATES.IN_TRANSIT,
            inTransitAt: serverTimestamp(),
            inTransitBy: currentUser.id,
            inTransitByName: currentUser.fullName || currentUser.id
        });
        
        if (req.fromId) {
            batch.update(doc(db, "halls", req.fromId), {
                current: increment(-(req.requestedCount || req.count))
            });
        }
        
        await batch.commit();
        
        await logActivity(
            'START_TRANSIT',
            `بدء نقل ${req.requestedCount || req.count} مرشح`,
            'transfer_request',
            requestId,
            { status: req.status },
            { status: REQUEST_STATES.IN_TRANSIT }
        );
        
        showToast('تم بدء النقل بنجاح', 'success');
        renderCurrentView();
    } catch (e) {
        console.error('Error starting transit:', e);
        showToast('حدث خطأ: ' + e.message, 'error');
    } finally {
        setLoading(false);
    }
};


window.confirmArrival = async (requestId) => {
    // الآن نستخدم showConfirmationModal بدلاً من الطريقة القديمة
    await showConfirmationModal(requestId);
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
// PROFILE PAGE
// ============================================

function renderProfile() {
    const content = document.getElementById('contentArea');
    
    const hallName = currentUser.assignedHallId ? 
        halls.find(h => h.id === currentUser.assignedHallId)?.name : 
        'لم يتم التعيين';
    
    let html = `
    <h2 class="text-2xl font-black mb-6">الملف الشخصي</h2>
    
    <div class="grid md:grid-cols-2 gap-6">
        <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow">
            <h3 class="font-bold text-lg mb-6 pb-4 border-b">معلوماتي الشخصية</h3>
            
            <div class="space-y-4 mb-6">
                <div>
                    <label class="block text-sm text-slate-500 mb-1">اسم المستخدم</label>
                    <p class="text-lg font-bold">${currentUser.id}</p>
                </div>
                <div>
                    <label class="block text-sm text-slate-500 mb-1">الاسم الكامل</label>
                    <p class="text-lg font-bold">${currentUser.fullName || 'لم يتم تعيين'}</p>
                </div>
                <div>
                    <label class="block text-sm text-slate-500 mb-1">الدور الوظيفي</label>
                    <p class="text-lg font-bold text-[#6B9AC4]">${currentUser.role}</p>
                </div>
                <div>
                    <label class="block text-sm text-slate-500 mb-1">القاعة المعينة</label>
                    <p class="text-lg font-bold text-[#88B2AC]">${hallName}</p>
                </div>
                <div>
                    <label class="block text-sm text-slate-500 mb-1">حالة الحساب</label>
                    <p class="text-lg font-bold ${currentUser.active ? 'text-green-500' : 'text-red-500'}">
                        ${currentUser.active ? '✓ نشط' : '✗ معطل'}
                    </p>
                </div>
            </div>
            
            <button onclick="showEditProfileModal()" class="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white p-3 rounded-xl font-bold hover:shadow-lg transition">
                <i class="ph ph-pencil ml-2"></i> تعديل البيانات
            </button>
        </div>
        
        <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow">
            <h3 class="font-bold text-lg mb-6 pb-4 border-b">الأمان</h3>
            
            <div class="space-y-4">
                <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl">
                    <p class="text-sm text-slate-600 dark:text-slate-300 mb-2">🔒 كلمة المرور</p>
                    <p class="text-xs text-slate-500 mb-3">غيّر كلمة المرور الخاصة بك بانتظام للحفاظ على أمان حسابك</p>
                    <button onclick="showChangePasswordModal()" class="w-full bg-gradient-to-r from-red-500 to-red-600 text-white p-3 rounded-xl font-bold hover:shadow-lg transition">
                        <i class="ph ph-lock ml-2"></i> تغيير كلمة المرور
                    </button>
                </div>
                
                <div class="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-xl">
                    <p class="text-sm text-slate-600 dark:text-slate-300 mb-2">📋 معلومات الحساب</p>
                    <div class="text-xs text-slate-500 space-y-1">
                        <p>تم إنشاء الحساب: ${currentUser.createdAt ? new Date(currentUser.createdAt.toDate?.() || currentUser.createdAt).toLocaleDateString('ar-SA') : 'غير معروف'}</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;
    
    content.innerHTML = html;
}

window.showEditProfileModal = async () => {
    const { value: formValues } = await Swal.fire({
        title: 'تعديل البيانات الشخصية',
        html: `
            <div class="text-right">
                <label class="block mb-2 font-bold">الاسم الكامل:</label>
                <input type="text" id="fullName" class="w-full p-2 border rounded mb-4" value="${currentUser.fullName || ''}">
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'حفظ',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            const fullName = document.getElementById('fullName').value;
            if (!fullName) {
                Swal.showValidationMessage('يرجى إدخال الاسم الكامل');
                return false;
            }
            return { fullName };
        }
    });
    
    if (formValues) {
        await updateUserProfile(formValues);
    }
};

async function updateUserProfile(newData) {
    try {
        setLoading(true);
        
        const oldData = { fullName: currentUser.fullName };
        
        await updateDoc(doc(db, "users", currentUser.id), {
            fullName: newData.fullName
        });
        
        currentUser.fullName = newData.fullName;
        
        await logActivity('UPDATE_PROFILE', `تحديث البيانات الشخصية`, 'user', currentUser.id, oldData, newData);
        
        renderProfile();
        showToast('تم تحديث البيانات بنجاح', 'success');
    } catch (e) {
        console.error('Error updating profile:', e);
        showToast('حدث خطأ في تحديث البيانات', 'error');
    } finally {
        setLoading(false);
    }
}

window.showChangePasswordModal = async () => {
    const { value: formValues } = await Swal.fire({
        title: 'تغيير كلمة المرور',
        html: `
            <div class="text-right">
                <label class="block mb-2 font-bold">كلمة المرور الحالية:</label>
                <input type="password" id="currentPassword" class="w-full p-2 border rounded mb-4" placeholder="أدخل كلمة المرور الحالية">
                <label class="block mb-2 font-bold">كلمة المرور الجديدة:</label>
                <input type="password" id="newPassword" class="w-full p-2 border rounded mb-4" placeholder="أدخل كلمة المرور الجديدة">
                <label class="block mb-2 font-bold">تأكيد كلمة المرور الجديدة:</label>
                <input type="password" id="confirmPassword" class="w-full p-2 border rounded" placeholder="أعد إدخال كلمة المرور الجديدة">
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'تغيير',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            if (!currentPassword) {
                Swal.showValidationMessage('يرجى إدخال كلمة المرور الحالية');
                return false;
            }
            if (currentPassword !== currentUser.pass) {
                Swal.showValidationMessage('كلمة المرور الحالية غير صحيحة');
                return false;
            }
            if (!newPassword || newPassword.length < 3) {
                Swal.showValidationMessage('كلمة المرور الجديدة يجب أن تكون 3 أحرف على الأقل');
                return false;
            }
            if (newPassword !== confirmPassword) {
                Swal.showValidationMessage('كلمات المرور الجديدة غير متطابقة');
                return false;
            }
            if (currentPassword === newPassword) {
                Swal.showValidationMessage('كلمة المرور الجديدة يجب أن تكون مختلفة عن الحالية');
                return false;
            }
            
            return { newPassword };
        }
    });
    
    if (formValues) {
        await changePassword(formValues.newPassword);
    }
};

async function changePassword(newPassword) {
    try {
        setLoading(true);
        
        const oldData = { pass: '***' };
        const newData = { pass: '***' };
        
        await updateDoc(doc(db, "users", currentUser.id), {
            pass: newPassword
        });
        
        currentUser.pass = newPassword;
        
        await logActivity('CHANGE_PASSWORD', `تغيير كلمة المرور`, 'user', currentUser.id, oldData, newData);
        
        showToast('تم تغيير كلمة المرور بنجاح', 'success');
    } catch (e) {
        console.error('Error changing password:', e);
        showToast('حدث خطأ في تغيير كلمة المرور', 'error');
    } finally {
        setLoading(false);
    }
}

// ============================================
// CONFIRMATION SYSTEM - نظام المصادقة الكامل
// ============================================

window.showConfirmationModal = async (requestId) => {
    const request = transferRequests.find(r => r.id === requestId);
    if (!request) {
        showToast('الطلب غير موجود', 'error');
        return;
    }
    
    if (!hasPermission(PERMISSIONS.CONFIRM_ARRIVAL)) {
        showToast('ليس لديك صلاحية المصادقة', 'error');
        return;
    }
    
    if (request.status !== REQUEST_STATES.ACCEPTED && request.status !== REQUEST_STATES.IN_TRANSIT) {
        showToast('الطلب يجب أن يكون مقبولاً أولاً', 'error');
        return;
    }
    
    const { value: formValues } = await Swal.fire({
        title: 'مصادقة الوصول',
        html: `
            <div class="text-right space-y-4">
                <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                    <p class="text-sm text-blue-800 dark:text-blue-200 font-bold mb-2">معلومات الطلب:</p>
                    <p class="text-sm"><span class="font-bold">العدد المطلوب:</span> ${request.requestedCount || request.count}</p>
                    <p class="text-sm"><span class="font-bold">من:</span> ${getSourceName(request)}</p>
                    <p class="text-sm"><span class="font-bold">إلى:</span> ${getTargetName(request)}</p>
                </div>
                
                <div>
                    <label class="block text-sm font-bold mb-2">العدد الفعلي الذي وصل: *</label>
                    <input type="number" id="actualCount" class="swal2-input w-full" 
                           placeholder="أدخل العدد الفعلي" min="0" max="${(request.requestedCount || request.count) + 10}" required>
                </div>
                
                <div id="differenceSection" class="hidden">
                    <div class="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg">
                        <p class="text-sm font-bold mb-2">الفرق المحسوب:</p>
                        <p id="differenceDisplay" class="text-2xl font-black"></p>
                        <p id="differenceType" class="text-sm mt-1"></p>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-bold mb-2 text-red-600">التعليق (إلزامي عند وجود فرق): *</label>
                        <textarea id="confirmationComment" class="swal2-textarea w-full" 
                                  placeholder="اذكر سبب الفرق..." rows="3"></textarea>
                    </div>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'تأكيد المصادقة',
        cancelButtonText: 'إلغاء',
        width: '600px',
        didOpen: () => {
            const actualCountInput = document.getElementById('actualCount');
            const differenceSection = document.getElementById('differenceSection');
            const differenceDisplay = document.getElementById('differenceDisplay');
            const differenceType = document.getElementById('differenceType');
            
            actualCountInput.addEventListener('input', () => {
                const actualCount = parseInt(actualCountInput.value) || 0;
                const requestedCount = request.requestedCount || request.count;
                const difference = actualCount - requestedCount;
                
                if (actualCount > 0) {
                    differenceSection.classList.remove('hidden');
                    differenceDisplay.textContent = difference === 0 ? 'مطابق ✓' : `${Math.abs(difference)}`;
                    
                    if (difference === 0) {
                        differenceType.textContent = 'العدد مطابق تماماً';
                        differenceType.className = 'text-sm mt-1 text-green-600';
                        differenceDisplay.className = 'text-2xl font-black text-green-600';
                    } else if (difference < 0) {
                        differenceType.textContent = `ناقص ${Math.abs(difference)} مرشح`;
                        differenceType.className = 'text-sm mt-1 text-red-600';
                        differenceDisplay.className = 'text-2xl font-black text-red-600';
                    } else {
                        differenceType.textContent = `زيادة ${difference} مرشح`;
                        differenceType.className = 'text-sm mt-1 text-amber-600';
                        differenceDisplay.className = 'text-2xl font-black text-amber-600';
                    }
                } else {
                    differenceSection.classList.add('hidden');
                }
            });
        },
        preConfirm: () => {
            const actualCount = parseInt(document.getElementById('actualCount').value);
            const comment = document.getElementById('confirmationComment').value.trim();
            const requestedCount = request.requestedCount || request.count;
            const difference = actualCount - requestedCount;
            
            if (!actualCount || actualCount < 0) {
                Swal.showValidationMessage('يجب إدخال العدد الفعلي');
                return false;
            }
            
            if (difference !== 0 && !comment) {
                Swal.showValidationMessage('يجب إدخال تعليق عند وجود فرق في العدد');
                return false;
            }
            
            return { actualCount, comment, difference };
        }
    });
    
    if (formValues) {
        await confirmArrival(requestId, formValues.actualCount, formValues.comment, formValues.difference);
    }
};

async function confirmArrival(requestId, actualCount, comment, difference) {
    try {
        setLoading(true);
        
        const request = transferRequests.find(r => r.id === requestId);
        if (!request) throw new Error('الطلب غير موجود');
        
        const requestedCount = request.requestedCount || request.count;
        
        let differenceType;
        if (difference === 0) differenceType = 'مطابق';
        else if (difference < 0) differenceType = 'ناقص';
        else differenceType = 'زيادة';
        
        const confirmationData = {
            requestId: requestId,
            requestedCount: requestedCount,
            actualCount: actualCount,
            difference: difference,
            differenceType: differenceType,
            comment: comment || null,
            confirmedBy: currentUser.id,
            confirmedByName: currentUser.fullName || currentUser.id,
            confirmedAt: serverTimestamp()
        };
        
        const confirmationRef = await addDoc(collection(db, "confirmations"), confirmationData);
        
        await updateDoc(doc(db, "transfer_requests", requestId), {
            status: REQUEST_STATES.ARRIVED,
            confirmationId: confirmationRef.id,
            actualCount: actualCount,
            difference: difference,
            arrivedAt: serverTimestamp()
        });
        
        const batch = writeBatch(db);
        
        if (request.fromType !== 'outside' && request.fromId) {
            batch.update(doc(db, "halls", request.fromId), {
                current: increment(-requestedCount)
            });
        }
        
        if (request.toId) {
            batch.update(doc(db, "halls", request.toId), {
                current: increment(actualCount)
            });
        }
        
        if (request.fromType === 'outside' || !request.fromId) {
            batch.update(doc(db, "settings", "global_config"), {
                outdoor_queue: increment(-actualCount)
            });
        }
        
        if (difference < 0) {
            batch.update(doc(db, "settings", "global_config"), {
                missing_count: increment(Math.abs(difference))
            });
        }
        
        await batch.commit();
        
        await logActivity(
            'CONFIRM_ARRIVAL',
            `مصادقة الوصول: ${actualCount} من ${requestedCount} (${differenceType})`,
            'transfer_request',
            requestId,
            { status: request.status },
            { status: REQUEST_STATES.ARRIVED, actualCount, difference },
            comment || null
        );
        
        showToast(`تم المصادقة بنجاح${difference !== 0 ? ` - ${differenceType}: ${Math.abs(difference)}` : ''}`, 'success');
        renderCurrentView();
    } catch (e) {
        console.error('Confirmation error:', e);
        showToast('حدث خطأ في المصادقة: ' + e.message, 'error');
    } finally {
        setLoading(false);
    }
}

function getSourceName(request) {
    if (request.fromType === 'outside' || !request.fromId) return 'خارج المبنى';
    const hall = halls.find(h => h.id === request.fromId);
    return hall ? hall.name : 'غير معروف';
}

function getTargetName(request) {
    const hall = halls.find(h => h.id === request.toId);
    return hall ? hall.name : 'غير معروف';
}



// ============================================
// ADVANCED ANALYTICS SYSTEM
// ============================================

window.showAdvancedAnalytics = () => {
    if (!hasPermission(PERMISSIONS.VIEW_ANALYTICS)) {
        showToast('ليس لديك صلاحية عرض الإحصائيات', 'error');
        return;
    }
    
    currentView = 'analytics';
    renderAdvancedAnalytics();
};

function renderAdvancedAnalytics() {
    const app = document.getElementById('app');
    
    // حساب الإحصائيات
    const stats = calculateAdvancedStats();
    
    app.innerHTML = `
        <div class="space-y-6 p-6">
            <!-- Header -->
            <div class="flex justify-between items-center">
                <h2 class="text-3xl font-black text-slate-800 dark:text-white">
                    📊 لوحة الإحصائيات المتقدمة
                </h2>
                <button onclick="exportAnalyticsToPDF()" 
                        class="px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg font-bold shadow-lg hover:shadow-xl transition-all hover:scale-105">
                    <i class="ph ph-file-pdf text-xl"></i>
                    تصدير PDF
                </button>
            </div>
            
            <!-- KPIs الموسعة -->
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                ${renderKPICard('ينتظرون خارجاً', stats.outdoor, 'ph-users', 'from-orange-400 to-orange-500')}
                ${renderKPICard('في الانتظار', stats.waiting, 'ph-clock', 'from-blue-400 to-blue-500')}
                ${renderKPICard('في المقابلات', stats.interview, 'ph-chats-circle', 'from-teal-400 to-teal-500')}
                ${renderKPICard('تمت خدمتهم', stats.served, 'ph-check-circle', 'from-green-400 to-green-500')}
                ${renderKPICard('مفقودين', stats.missing, 'ph-warning', 'from-red-400 to-red-500')}
                ${renderKPICard('إجمالي الطاقة', stats.totalCapacity, 'ph-buildings', 'from-purple-400 to-purple-500')}
            </div>
            
            <!-- القاعات - تفصيلي -->
            <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6">
                <h3 class="text-2xl font-black text-slate-800 dark:text-white mb-6 flex items-center gap-3">
                    <i class="ph ph-building text-3xl text-blue-500"></i>
                    القاعات - التفاصيل الكاملة
                </h3>
                
                <div class="space-y-4">
                    ${renderHallsDetailed()}
                </div>
            </div>
            
            <!-- إحصائيات الطلبات -->
            <div class="grid md:grid-cols-2 gap-6">
                <!-- حالات الطلبات -->
                <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6">
                    <h3 class="text-xl font-black text-slate-800 dark:text-white mb-4">
                        📋 حالات الطلبات
                    </h3>
                    ${renderRequestsStats(stats.requests)}
                </div>
                
                <!-- إحصائيات المصادقات -->
                <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6">
                    <h3 class="text-xl font-black text-slate-800 dark:text-white mb-4">
                        ✓ إحصائيات المصادقات
                    </h3>
                    ${renderConfirmationsStats(stats.confirmations)}
                </div>
            </div>
            
            <!-- الرسوم البيانية -->
            <div class="grid md:grid-cols-2 gap-6">
                <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6">
                    <h3 class="text-xl font-black text-slate-800 dark:text-white mb-4">
                        📈 نسبة الإشغال
                    </h3>
                    <canvas id="occupancyChart" height="200"></canvas>
                </div>
                
                <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6">
                    <h3 class="text-xl font-black text-slate-800 dark:text-white mb-4">
                        🔄 تدفق الطلبات
                    </h3>
                    <canvas id="requestsChart" height="200"></canvas>
                </div>
            </div>
        </div>
    `;
    
    // رسم الرسوم البيانية
    setTimeout(() => {
        drawOccupancyChart();
        drawRequestsChart();
    }, 100);
}

function calculateAdvancedStats() {
    const waitingHalls = halls.filter(h => h.type === 'انتظار' && h.active);
    const interviewHalls = halls.filter(h => h.type === 'مقابلات' && h.active);
    
    const totalWaiting = waitingHalls.reduce((sum, h) => sum + (h.current || 0), 0);
    const totalInterview = interviewHalls.reduce((sum, h) => sum + (h.current || 0), 0);
    const totalCapacity = halls.filter(h => h.active).reduce((sum, h) => sum + (h.capacity || 0), 0);
    
    // إحصائيات الطلبات
    const requestsStats = {
        pending: transferRequests.filter(r => r.status === REQUEST_STATES.PENDING).length,
        accepted: transferRequests.filter(r => r.status === REQUEST_STATES.ACCEPTED).length,
        rejected: transferRequests.filter(r => r.status === REQUEST_STATES.REJECTED).length,
        inTransit: transferRequests.filter(r => r.status === REQUEST_STATES.IN_TRANSIT).length,
        arrived: transferRequests.filter(r => r.status === REQUEST_STATES.ARRIVED).length,
        closed: transferRequests.filter(r => r.status === REQUEST_STATES.CLOSED).length
    };
    
    // إحصائيات المصادقات
    const confirmedRequests = transferRequests.filter(r => r.confirmationId);
    const confirmationsStats = {
        total: confirmedRequests.length,
        matched: confirmedRequests.filter(r => r.difference === 0).length,
        missing: confirmedRequests.filter(r => r.difference < 0).length,
        extra: confirmedRequests.filter(r => r.difference > 0).length,
        totalMissing: confirmedRequests.reduce((sum, r) => sum + (r.difference < 0 ? Math.abs(r.difference) : 0), 0),
        totalExtra: confirmedRequests.reduce((sum, r) => sum + (r.difference > 0 ? r.difference : 0), 0)
    };
    
    return {
        outdoor: globalStats.outdoor_queue || 0,
        waiting: totalWaiting,
        interview: totalInterview,
        served: globalStats.served_count || 0,
        missing: globalStats.missing_count || 0,
        totalCapacity: totalCapacity,
        requests: requestsStats,
        confirmations: confirmationsStats
    };
}

function renderKPICard(label, value, icon, gradient) {
    return `
        <div class="bg-gradient-to-br ${gradient} rounded-xl shadow-lg p-6 text-white transform hover:scale-105 transition-all">
            <div class="flex justify-between items-start mb-2">
                <i class="ph ${icon} text-4xl opacity-80"></i>
                <span class="text-sm font-bold opacity-90">${label}</span>
            </div>
            <div class="text-4xl font-black mt-2">${value}</div>
        </div>
    `;
}

function renderHallsDetailed() {
    const activeHalls = halls.filter(h => h.active);
    
    return activeHalls.map(hall => {
        const occupancy = hall.capacity > 0 ? Math.round((hall.current / hall.capacity) * 100) : 0;
        const available = hall.capacity - hall.current;
        
        let occupancyColor = 'bg-green-500';
        if (occupancy >= 90) occupancyColor = 'bg-red-500';
        else if (occupancy >= 70) occupancyColor = 'bg-amber-500';
        
        return `
            <div class="border-2 border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:shadow-lg transition-all">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <h4 class="text-lg font-black text-slate-800 dark:text-white">${hall.name}</h4>
                        <span class="text-sm text-slate-500 dark:text-slate-400">${hall.type}</span>
                    </div>
                    <div class="text-right">
                        <div class="text-2xl font-black text-blue-600 dark:text-blue-400">${hall.current}</div>
                        <div class="text-xs text-slate-500">من ${hall.capacity}</div>
                    </div>
                </div>
                
                <div class="space-y-2">
                    <!-- Progress Bar -->
                    <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
                        <div class="${occupancyColor} h-full rounded-full transition-all duration-500" 
                             style="width: ${occupancy}%"></div>
                    </div>
                    
                    <div class="flex justify-between text-sm">
                        <span class="text-slate-600 dark:text-slate-400">
                            <i class="ph ph-percent text-blue-500"></i> الإشغال: <strong>${occupancy}%</strong>
                        </span>
                        <span class="text-slate-600 dark:text-slate-400">
                            <i class="ph ph-chair text-green-500"></i> متاح: <strong>${available}</strong>
                        </span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderRequestsStats(stats) {
    const total = Object.values(stats).reduce((a, b) => a + b, 0);
    
    return `
        <div class="space-y-3">
            ${renderStatBar('قيد الانتظار', stats.pending, total, 'bg-amber-500')}
            ${renderStatBar('مقبول', stats.accepted, total, 'bg-green-500')}
            ${renderStatBar('مرفوض', stats.rejected, total, 'bg-red-500')}
            ${renderStatBar('في الطريق', stats.inTransit, total, 'bg-blue-500')}
            ${renderStatBar('وصل', stats.arrived, total, 'bg-teal-500')}
            ${renderStatBar('مغلق', stats.closed, total, 'bg-slate-500')}
        </div>
    `;
}

function renderConfirmationsStats(stats) {
    return `
        <div class="space-y-4">
            <div class="grid grid-cols-2 gap-3">
                <div class="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-4">
                    <div class="text-sm text-blue-700 dark:text-blue-300 mb-1">إجمالي المصادقات</div>
                    <div class="text-3xl font-black text-blue-600 dark:text-blue-400">${stats.total}</div>
                </div>
                <div class="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg p-4">
                    <div class="text-sm text-green-700 dark:text-green-300 mb-1">مطابق</div>
                    <div class="text-3xl font-black text-green-600 dark:text-green-400">${stats.matched}</div>
                </div>
                <div class="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 rounded-lg p-4">
                    <div class="text-sm text-red-700 dark:text-red-300 mb-1">ناقص</div>
                    <div class="text-3xl font-black text-red-600 dark:text-red-400">${stats.missing}</div>
                    <div class="text-xs text-red-600 dark:text-red-400 mt-1">(-${stats.totalMissing} مرشح)</div>
                </div>
                <div class="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 rounded-lg p-4">
                    <div class="text-sm text-amber-700 dark:text-amber-300 mb-1">زيادة</div>
                    <div class="text-3xl font-black text-amber-600 dark:text-amber-400">${stats.extra}</div>
                    <div class="text-xs text-amber-600 dark:text-amber-400 mt-1">(+${stats.totalExtra} مرشح)</div>
                </div>
            </div>
        </div>
    `;
}

function renderStatBar(label, value, total, color) {
    const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
    
    return `
        <div>
            <div class="flex justify-between text-sm mb-1">
                <span class="font-bold text-slate-700 dark:text-slate-300">${label}</span>
                <span class="text-slate-600 dark:text-slate-400">${value} (${percentage}%)</span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                <div class="${color} h-full rounded-full transition-all" style="width: ${percentage}%"></div>
            </div>
        </div>
    `;
}

function drawOccupancyChart() {
    const canvas = document.getElementById('occupancyChart');
    if (!canvas) return;
    
    // التحقق من تحميل Chart.js
    if (typeof Chart === 'undefined') {
        console.error('Chart.js not loaded!');
        canvas.parentElement.innerHTML = '<p class="text-red-600 text-center p-4">خطأ: Chart.js لم يتم تحميله</p>';
        return;
    }
    
    const ctx = canvas.getContext('2d');
    const activeHalls = halls.filter(h => h.active);
    
    const labels = activeHalls.map(h => h.name);
    const data = activeHalls.map(h => h.capacity > 0 ? Math.round((h.current / h.capacity) * 100) : 0);
    
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'نسبة الإشغال %',
                data: data,
                backgroundColor: data.map(v => {
                    if (v >= 90) return 'rgba(239, 68, 68, 0.8)';
                    if (v >= 70) return 'rgba(245, 158, 11, 0.8)';
                    return 'rgba(34, 197, 94, 0.8)';
                }),
                borderColor: data.map(v => {
                    if (v >= 90) return 'rgb(239, 68, 68)';
                    if (v >= 70) return 'rgb(245, 158, 11)';
                    return 'rgb(34, 197, 94)';
                }),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: value => value + '%'
                    }
                }
            }
        }
    });
}

function drawRequestsChart() {
    const canvas = document.getElementById('requestsChart');
    if (!canvas) return;
    
    // التحقق من تحميل Chart.js
    if (typeof Chart === 'undefined') {
        console.error('Chart.js not loaded!');
        canvas.parentElement.innerHTML = '<p class="text-red-600 text-center p-4">خطأ: Chart.js لم يتم تحميله</p>';
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    const data = {
        pending: transferRequests.filter(r => r.status === REQUEST_STATES.PENDING).length,
        accepted: transferRequests.filter(r => r.status === REQUEST_STATES.ACCEPTED).length,
        inTransit: transferRequests.filter(r => r.status === REQUEST_STATES.IN_TRANSIT).length,
        arrived: transferRequests.filter(r => r.status === REQUEST_STATES.ARRIVED).length,
        rejected: transferRequests.filter(r => r.status === REQUEST_STATES.REJECTED).length,
        closed: transferRequests.filter(r => r.status === REQUEST_STATES.CLOSED).length
    };
    
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['قيد الانتظار', 'مقبول', 'في الطريق', 'وصل', 'مرفوض', 'مغلق'],
            datasets: [{
                data: [data.pending, data.accepted, data.inTransit, data.arrived, data.rejected, data.closed],
                backgroundColor: [
                    'rgba(245, 158, 11, 0.8)',
                    'rgba(34, 197, 94, 0.8)',
                    'rgba(59, 130, 246, 0.8)',
                    'rgba(20, 184, 166, 0.8)',
                    'rgba(239, 68, 68, 0.8)',
                    'rgba(100, 116, 139, 0.8)'
                ],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}



// ============================================
// PDF EXPORT SYSTEM - تصدير احترافي
// ============================================

async function exportAnalyticsToPDF() {
    try {
        setLoading(true);
        showToast('جاري إنشاء التقرير...', 'info');
        
        const stats = calculateAdvancedStats();
        const activeHalls = halls.filter(h => h.active);
        
        // إنشاء المستند
        // التحقق من تحميل jsPDF
        if (typeof window.jspdf === 'undefined') {
            throw new Error('jsPDF library not loaded');
        }
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        
        // استخدام الخط الافتراضي مع دعم RTL
        doc.setR2L(true);
        
        let yPos = 20;
        
        // ═══════════════════════════════════════════
        // HEADER - رأس التقرير
        // ═══════════════════════════════════════════
        
        // خلفية Header
        doc.setFillColor(30, 41, 59); // slate-800
        doc.rect(0, 0, 210, 45, 'F');
        
        // عنوان التقرير
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.text('تقرير إحصائيات نظام B36', 105, 20, { align: 'center' });
        
        doc.setFontSize(12);
        doc.text('نظام إدارة تدفق المرشحين - B36 Hall Management System', 105, 28, { align: 'center' });
        
        // التاريخ والوقت
        const now = new Date();
        const dateStr = now.toLocaleDateString('ar-SA', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        const timeStr = now.toLocaleTimeString('ar-SA');
        
        doc.setFontSize(10);
        doc.text(`تاريخ التقرير: ${dateStr} - ${timeStr}`, 105, 36, { align: 'center' });
        
        yPos = 55;
        
        // ═══════════════════════════════════════════
        // KPIs - المؤشرات الرئيسية
        // ═══════════════════════════════════════════
        
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(16);
        doc.text('📊 المؤشرات الرئيسية', 195, yPos, { align: 'right' });
        yPos += 10;
        
        // صناديق KPIs
        const kpiData = [
            { label: 'ينتظرون خارجاً', value: stats.outdoor, color: [249, 115, 22] },
            { label: 'في قاعات الانتظار', value: stats.waiting, color: [59, 130, 246] },
            { label: 'في قاعات المقابلات', value: stats.interview, color: [20, 184, 166] },
            { label: 'تمت خدمتهم', value: stats.served, color: [34, 197, 94] },
            { label: 'مفقودين', value: stats.missing, color: [239, 68, 68] },
            { label: 'إجمالي الطاقة', value: stats.totalCapacity, color: [168, 85, 247] }
        ];
        
        const boxWidth = 60;
        const boxHeight = 22;
        let xPos = 20;
        let row = 0;
        
        kpiData.forEach((kpi, index) => {
            if (index > 0 && index % 3 === 0) {
                row++;
                xPos = 20;
            }
            
            const currentX = xPos + (index % 3) * (boxWidth + 5);
            const currentY = yPos + (row * (boxHeight + 5));
            
            // صندوق بلون
            doc.setFillColor(...kpi.color);
            doc.roundedRect(currentX, currentY, boxWidth, boxHeight, 3, 3, 'F');
            
            // العنوان
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(9);
            doc.text(kpi.label, currentX + boxWidth - 5, currentY + 8, { align: 'right' });
            
            // القيمة
            doc.setFontSize(16);
            doc.text(kpi.value.toString(), currentX + boxWidth - 5, currentY + 18, { align: 'right' });
        });
        
        yPos += (Math.ceil(kpiData.length / 3) * (boxHeight + 5)) + 15;
        
        // ═══════════════════════════════════════════
        // جدول القاعات
        // ═══════════════════════════════════════════
        
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(16);
        doc.text('🏢 القاعات - التفاصيل الكاملة', 195, yPos, { align: 'right' });
        yPos += 8;
        
        // رأس الجدول
        doc.setFillColor(59, 130, 246);
        doc.rect(15, yPos, 180, 10, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.text('الإشغال %', 25, yPos + 7, { align: 'center' });
        doc.text('المتاح', 55, yPos + 7, { align: 'center' });
        doc.text('الحالي', 85, yPos + 7, { align: 'center' });
        doc.text('السعة', 115, yPos + 7, { align: 'center' });
        doc.text('النوع', 145, yPos + 7, { align: 'center' });
        doc.text('اسم القاعة', 175, yPos + 7, { align: 'center' });
        
        yPos += 10;
        
        // بيانات القاعات
        doc.setTextColor(30, 41, 59);
        activeHalls.forEach((hall, index) => {
            const occupancy = hall.capacity > 0 ? Math.round((hall.current / hall.capacity) * 100) : 0;
            const available = hall.capacity - hall.current;
            
            // صف بلون متبادل
            if (index % 2 === 0) {
                doc.setFillColor(241, 245, 249);
                doc.rect(15, yPos, 180, 8, 'F');
            }
            
            // لون حسب نسبة الإشغال
            let occupancyColor = [34, 197, 94]; // green
            if (occupancy >= 90) occupancyColor = [239, 68, 68]; // red
            else if (occupancy >= 70) occupancyColor = [245, 158, 11]; // amber
            
            doc.setTextColor(...occupancyColor);
            doc.setFontSize(9);
            doc.text(`${occupancy}%`, 25, yPos + 6, { align: 'center' });
            
            doc.setTextColor(30, 41, 59);
            doc.text(available.toString(), 55, yPos + 6, { align: 'center' });
            doc.text(hall.current.toString(), 85, yPos + 6, { align: 'center' });
            doc.text(hall.capacity.toString(), 115, yPos + 6, { align: 'center' });
            doc.text(hall.type, 145, yPos + 6, { align: 'center' });
            doc.text(hall.name, 175, yPos + 6, { align: 'center' });
            
            yPos += 8;
            
            // صفحة جديدة إذا لزم الأمر
            if (yPos > 260) {
                doc.addPage();
                yPos = 20;
            }
        });
        
        yPos += 10;
        
        // ═══════════════════════════════════════════
        // إحصائيات الطلبات
        // ═══════════════════════════════════════════
        
        if (yPos > 220) {
            doc.addPage();
            yPos = 20;
        }
        
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(16);
        doc.text('📋 إحصائيات الطلبات', 195, yPos, { align: 'right' });
        yPos += 10;
        
        const requestsData = [
            { label: 'قيد الانتظار', value: stats.requests.pending, color: [245, 158, 11] },
            { label: 'مقبول', value: stats.requests.accepted, color: [34, 197, 94] },
            { label: 'مرفوض', value: stats.requests.rejected, color: [239, 68, 68] },
            { label: 'في الطريق', value: stats.requests.inTransit, color: [59, 130, 246] },
            { label: 'وصل', value: stats.requests.arrived, color: [20, 184, 166] },
            { label: 'مغلق', value: stats.requests.closed, color: [100, 116, 139] }
        ];
        
        requestsData.forEach(item => {
            // شريط
            doc.setFillColor(...item.color);
            const barWidth = (item.value / Math.max(...requestsData.map(r => r.value))) * 120;
            doc.rect(70, yPos, barWidth, 8, 'F');
            
            // النص
            doc.setTextColor(30, 41, 59);
            doc.setFontSize(10);
            doc.text(item.label, 190, yPos + 6, { align: 'right' });
            doc.text(item.value.toString(), 60, yPos + 6, { align: 'right' });
            
            yPos += 12;
        });
        
        yPos += 10;
        
        // ═══════════════════════════════════════════
        // إحصائيات المصادقات
        // ═══════════════════════════════════════════
        
        if (yPos > 220) {
            doc.addPage();
            yPos = 20;
        }
        
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(16);
        doc.text('✓ إحصائيات المصادقات', 195, yPos, { align: 'right' });
        yPos += 10;
        
        const confBoxes = [
            { label: 'إجمالي المصادقات', value: stats.confirmations.total, color: [59, 130, 246] },
            { label: 'مطابق', value: stats.confirmations.matched, color: [34, 197, 94] },
            { label: 'ناقص', value: `${stats.confirmations.missing} (-${stats.confirmations.totalMissing})`, color: [239, 68, 68] },
            { label: 'زيادة', value: `${stats.confirmations.extra} (+${stats.confirmations.totalExtra})`, color: [245, 158, 11] }
        ];
        
        confBoxes.forEach((box, index) => {
            const boxX = 20 + (index % 2) * 90;
            const boxY = yPos + Math.floor(index / 2) * 25;
            
            doc.setFillColor(...box.color);
            doc.roundedRect(boxX, boxY, 80, 20, 2, 2, 'F');
            
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(9);
            doc.text(box.label, boxX + 75, boxY + 8, { align: 'right' });
            
            doc.setFontSize(14);
            doc.text(box.value.toString(), boxX + 75, boxY + 16, { align: 'right' });
        });
        
        yPos += 60;
        
        // ═══════════════════════════════════════════
        // FOOTER
        // ═══════════════════════════════════════════
        
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            
            doc.setFillColor(241, 245, 249);
            doc.rect(0, 285, 210, 12, 'F');
            
            doc.setTextColor(100, 116, 139);
            doc.setFontSize(8);
            doc.text('B36 Hall Management System v32 - تقرير إحصائيات شامل', 105, 291, { align: 'center' });
            doc.text(`صفحة ${i} من ${pageCount}`, 20, 291);
            doc.text(`تم الإنشاء بواسطة: ${currentUser.fullName || currentUser.id}`, 190, 291, { align: 'right' });
        }
        
        // حفظ الملف
        const filename = `B36_Analytics_${new Date().getTime()}.pdf`;
        doc.save(filename);
        
        showToast('تم تصدير التقرير بنجاح!', 'success');
        
        await logActivity(
            'EXPORT_PDF',
            'تصدير تقرير الإحصائيات إلى PDF',
            'analytics',
            null,
            null,
            { filename }
        );
        
    } catch (e) {
        console.error('PDF export error:', e);
        showToast('حدث خطأ في التصدير: ' + e.message, 'error');
    } finally {
        setLoading(false);
    }
}



// ============================================
// SUPER ADMIN MODE - وضع التجربة الكامل
// ============================================

let superAdminMode = false;
let originalUser = null;
let simulatedRole = null;

window.toggleSuperAdminMode = () => {
    if (currentUser.role !== ROLES.ADMIN) {
        showToast('هذه الميزة للمدير العام فقط', 'error');
        return;
    }
    
    superAdminMode = !superAdminMode;
    
    if (superAdminMode) {
        originalUser = { ...currentUser };
        showSuperAdminPanel();
        showToast('🎭 تم تفعيل وضع التجربة - يمكنك تجربة جميع الأدوار!', 'info');
    } else {
        currentUser = { ...originalUser };
        simulatedRole = null;
        updateSidebar();
        renderCurrentView();
        showToast('تم إيقاف وضع التجربة', 'info');
    }
};

function showSuperAdminPanel() {
    const panel = document.getElementById('superAdminPanel');
    if (!panel) {
        // إنشاء Panel
        const panelHTML = `
            <div id="superAdminPanel" class="fixed bottom-4 left-4 bg-gradient-to-br from-purple-600 to-purple-700 text-white rounded-2xl shadow-2xl p-4 z-50 w-80">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-black">🎭 وضع التجربة</h3>
                    <button onclick="toggleSuperAdminMode()" class="text-white hover:text-red-200">
                        <i class="ph ph-x text-xl"></i>
                    </button>
                </div>
                
                <div class="space-y-3">
                    <div>
                        <label class="block text-sm font-bold mb-2">جرب الدور:</label>
                        <select id="roleSimulator" onchange="simulateRole(this.value)" 
                                class="w-full p-2 rounded-lg bg-white/20 text-white font-bold border-2 border-white/30">
                            <option value="">-- اختر الدور --</option>
                            <option value="${ROLES.ADMIN}">يوزر المدير العام (أنت)</option>
                            <option value="${ROLES.EXTERNAL_SUPERVISOR}">يوزر المنظم الخارجي مشرف</option>
                            <option value="${ROLES.EXTERNAL_REGULAR}">يوزر المنظم الخارجي عادي</option>
                            <option value="${ROLES.INTERNAL_SUPERVISOR}">يوزر المنظم الداخلي مشرف المبنى</option>
                            <option value="${ROLES.INTERNAL_REGULAR}">يوزر المنظم الداخلي عادي</option>
                            <option value="${ROLES.VIEWER}">يوزر العرض</option>
                            <option value="PATH_ORGANIZER">منظم المسار (خاص)</option>
                        </select>
                    </div>
                    
                    <div id="hallAssignment" class="hidden">
                        <label class="block text-sm font-bold mb-2">تعيين القاعة:</label>
                        <select id="hallSimulator" onchange="updateSimulatedHall(this.value)"
                                class="w-full p-2 rounded-lg bg-white/20 text-white font-bold border-2 border-white/30">
                            <option value="">-- اختر القاعة --</option>
                        </select>
                    </div>
                    
                    <div id="currentSimulation" class="bg-white/10 rounded-lg p-3 text-sm hidden">
                        <div class="font-bold mb-2">🎯 الوضع الحالي:</div>
                        <div id="simulationDetails"></div>
                    </div>
                    
                    <div class="bg-amber-500/20 border-2 border-amber-300/50 rounded-lg p-3 text-xs">
                        <div class="font-bold mb-1">💡 ملاحظة:</div>
                        <div>الواجهة ستتغير حسب الدور المختار. يمكنك رؤية ما يراه كل مستخدم!</div>
                    </div>
                    
                    <button onclick="showPermissionsMatrix()" 
                            class="w-full px-4 py-2 bg-white text-purple-700 rounded-lg font-bold hover:bg-purple-50 transition-all">
                        <i class="ph ph-shield-check"></i>
                        عرض مصفوفة الصلاحيات
                    </button>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', panelHTML);
        
        // ملء القاعات
        updateHallsDropdown();
    } else {
        panel.classList.toggle('hidden');
    }
}

window.simulateRole = (role) => {
    if (!role) {
        currentUser = { ...originalUser };
        simulatedRole = null;
        document.getElementById('currentSimulation').classList.add('hidden');
        updateSidebar();
        renderCurrentView();
        return;
    }
    
    simulatedRole = role;
    
    if (role === 'PATH_ORGANIZER') {
        currentUser.role = ROLES.INTERNAL_REGULAR;
        currentUser.isPathOrganizer = true;
        currentUser.fullName = 'منظم مسار (تجريبي)';
    } else {
        currentUser.role = role;
        currentUser.isPathOrganizer = false;
        currentUser.fullName = `مستخدم تجريبي (${getRoleLabel(role)})`;
    }
    
    // إظهار تعيين القاعة إذا كان Internal Regular
    if (currentUser.role === ROLES.INTERNAL_REGULAR) {
        document.getElementById('hallAssignment').classList.remove('hidden');
    } else {
        document.getElementById('hallAssignment').classList.add('hidden');
        currentUser.assignedHallId = null;
    }
    
    // عرض التفاصيل
    document.getElementById('currentSimulation').classList.remove('hidden');
    updateSimulationDetails();
    
    // تحديث الواجهة
    updateSidebar();
    renderCurrentView();
    
    showToast(`تم التبديل إلى: ${currentUser.fullName}`, 'success');
};

window.updateSimulatedHall = (hallId) => {
    currentUser.assignedHallId = hallId || null;
    updateSimulationDetails();
    renderCurrentView();
};

function updateHallsDropdown() {
    const select = document.getElementById('hallSimulator');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- اختر القاعة --</option>';
    halls.filter(h => h.active).forEach(hall => {
        select.innerHTML += `<option value="${hall.id}">${hall.name}</option>`;
    });
}

function updateSimulationDetails() {
    const details = document.getElementById('simulationDetails');
    if (!details) return;
    
    let html = `
        <div class="space-y-1">
            <div><strong>الدور:</strong> ${currentUser.fullName}</div>
    `;
    
    if (currentUser.isPathOrganizer) {
        html += `<div><strong>منظم مسار:</strong> نعم ✓</div>`;
    }
    
    if (currentUser.assignedHallId) {
        const hall = halls.find(h => h.id === currentUser.assignedHallId);
        html += `<div><strong>القاعة المعينة:</strong> ${hall ? hall.name : 'غير معروف'}</div>`;
    }
    
    const permissions = ROLE_PERMISSIONS[currentUser.role] || [];
    html += `<div><strong>عدد الصلاحيات:</strong> ${permissions.length}</div>`;
    
    html += '</div>';
    details.innerHTML = html;
}

function getRoleLabel(role) {
    const labels = {
        [ROLES.ADMIN]: 'المدير العام',
        [ROLES.EXTERNAL_SUPERVISOR]: 'منظم خارجي مشرف',
        [ROLES.EXTERNAL_REGULAR]: 'منظم خارجي عادي',
        [ROLES.INTERNAL_SUPERVISOR]: 'مشرف المبنى',
        [ROLES.INTERNAL_REGULAR]: 'منظم داخلي عادي',
        [ROLES.VIEWER]: 'عارض'
    };
    return labels[role] || role;
}

window.showPermissionsMatrix = async () => {
    const matrix = generatePermissionsMatrix();
    
    await Swal.fire({
        title: '🔐 مصفوفة الصلاحيات الكاملة',
        html: matrix,
        width: '90%',
        showCloseButton: true,
        showConfirmButton: false,
        customClass: {
            htmlContainer: 'text-right'
        }
    });
};

function generatePermissionsMatrix() {
    const roles = [
        { key: ROLES.ADMIN, label: 'المدير' },
        { key: ROLES.EXTERNAL_SUPERVISOR, label: 'خارجي مشرف' },
        { key: ROLES.EXTERNAL_REGULAR, label: 'خارجي عادي' },
        { key: ROLES.INTERNAL_SUPERVISOR, label: 'داخلي مشرف' },
        { key: ROLES.INTERNAL_REGULAR, label: 'داخلي عادي' },
        { key: ROLES.VIEWER, label: 'عارض' }
    ];
    
    const permissionGroups = {
        'إدارة الأعداد الخارجية': [
            PERMISSIONS.MANAGE_OUTSIDE_COUNT,
            PERMISSIONS.VIEW_OUTSIDE_COUNT
        ],
        'إنشاء طلبات النقل': [
            PERMISSIONS.CREATE_OUTSIDE_TO_WAITING,
            PERMISSIONS.CREATE_WAITING_TO_INTERVIEW,
            PERMISSIONS.CREATE_INTERVIEW_TO_INTERVIEW
        ],
        'إجراءات الطلبات': [
            PERMISSIONS.ACCEPT_REJECT_REQUEST,
            PERMISSIONS.CONFIRM_ARRIVAL,
            PERMISSIONS.EXECUTE_TRANSFER,
            PERMISSIONS.START_TRANSIT,
            PERMISSIONS.ASSIGN_PATH_ORGANIZER
        ],
        'الإدارة': [
            PERMISSIONS.MANAGE_HALLS,
            PERMISSIONS.ASSIGN_USERS
        ],
        'العرض والإحصائيات': [
            PERMISSIONS.VIEW_AUDIT_LOG,
            PERMISSIONS.VIEW_ANALYTICS,
            PERMISSIONS.VIEW_DASHBOARD,
            PERMISSIONS.VIEW_REQUESTS,
            PERMISSIONS.VIEW_MY_HALL,
            PERMISSIONS.VIEW_PROFILE
        ]
    };
    
    let html = '<div class="overflow-x-auto" style="max-height: 70vh;">';
    
    Object.keys(permissionGroups).forEach(groupName => {
        html += `
            <div class="mb-6">
                <h4 class="text-lg font-black text-blue-600 mb-3 bg-blue-50 p-2 rounded">${groupName}</h4>
                <table class="w-full text-sm">
                    <thead>
                        <tr class="bg-slate-200">
                            <th class="p-2 text-right font-bold">الصلاحية</th>
                            ${roles.map(r => `<th class="p-2 text-center font-bold">${r.label}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        permissionGroups[groupName].forEach((perm, index) => {
            const permLabel = getPermissionLabel(perm);
            const rowColor = index % 2 === 0 ? 'bg-white' : 'bg-slate-50';
            
            html += `<tr class="${rowColor}">`;
            html += `<td class="p-2 text-right">${permLabel}</td>`;
            
            roles.forEach(role => {
                const hasIt = ROLE_PERMISSIONS[role.key]?.includes(perm);
                html += `<td class="p-2 text-center">`;
                if (hasIt) {
                    html += `<i class="ph ph-check-circle text-green-600 text-xl"></i>`;
                } else {
                    html += `<i class="ph ph-x-circle text-red-400 text-xl"></i>`;
                }
                html += `</td>`;
            });
            
            html += `</tr>`;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
    });
    
    html += '</div>';
    return html;
}

function getPermissionLabel(perm) {
    const labels = {
        [PERMISSIONS.MANAGE_OUTSIDE_COUNT]: 'إدارة العدد الخارجي',
        [PERMISSIONS.VIEW_OUTSIDE_COUNT]: 'عرض العدد الخارجي',
        [PERMISSIONS.CREATE_OUTSIDE_TO_WAITING]: 'إنشاء طلب خارج→انتظار',
        [PERMISSIONS.CREATE_WAITING_TO_INTERVIEW]: 'إنشاء طلب انتظار→مقابلات',
        [PERMISSIONS.CREATE_INTERVIEW_TO_INTERVIEW]: 'إعادة توزيع المقابلات',
        [PERMISSIONS.ACCEPT_REJECT_REQUEST]: 'قبول/رفض الطلبات',
        [PERMISSIONS.CONFIRM_ARRIVAL]: 'مصادقة الوصول',
        [PERMISSIONS.EXECUTE_TRANSFER]: 'تنفيذ النقل',
        [PERMISSIONS.START_TRANSIT]: 'بدء النقل',
        [PERMISSIONS.ASSIGN_PATH_ORGANIZER]: 'تعيين منظم مسار',
        [PERMISSIONS.MANAGE_HALLS]: 'إدارة القاعات',
        [PERMISSIONS.ASSIGN_USERS]: 'إدارة المستخدمين',
        [PERMISSIONS.VIEW_AUDIT_LOG]: 'سجل العمليات',
        [PERMISSIONS.VIEW_ANALYTICS]: 'الإحصائيات',
        [PERMISSIONS.VIEW_DASHBOARD]: 'لوحة التحكم',
        [PERMISSIONS.VIEW_REQUESTS]: 'عرض الطلبات',
        [PERMISSIONS.VIEW_MY_HALL]: 'عرض قاعتي',
        [PERMISSIONS.VIEW_PROFILE]: 'الملف الشخصي'
    };
    return labels[perm] || perm;
}



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
            { id: 'admin', fullName: 'المدير العام', pass: '1234', role: ROLES.ADMIN },
            { id: 'external_supervisor', fullName: 'منظم خارجي مشرف', pass: '1234', role: ROLES.EXTERNAL_SUPERVISOR },
            { id: 'external_regular', fullName: 'منظم خارجي عادي', pass: '1234', role: ROLES.EXTERNAL_REGULAR },
            { id: 'internal_supervisor', fullName: 'مشرف المبنى', pass: '1234', role: ROLES.INTERNAL_SUPERVISOR },
            { id: 'internal_regular_1', fullName: 'منظم داخلي - قاعة 1', pass: '1234', role: ROLES.INTERNAL_REGULAR, assignedHallId: 'hall_1', isPathOrganizer: false },
            { id: 'internal_regular_2', fullName: 'منظم مسار', pass: '1234', role: ROLES.INTERNAL_REGULAR, assignedHallId: 'hall_3', isPathOrganizer: true },
            { id: 'viewer', fullName: 'عارض', pass: '1234', role: ROLES.VIEWER }
        ];
        
        demoUsers.forEach(user => {
            batch.set(doc(db, "users", user.id), {
                ...user,
                active: true,
                assignedHallId: user.assignedHallId || null,
                isPathOrganizer: user.isPathOrganizer || false,
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
            missing_count: 0,
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
