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
    // Outside Count Management
    MANAGE_OUTSIDE_COUNT: 'manage_outside_count',
    VIEW_OUTSIDE_COUNT: 'view_outside_count',
    
    // Transfer Requests
    CREATE_OUTSIDE_TO_WAITING: 'create_outside_to_waiting',
    CREATE_WAITING_TO_INTERVIEW: 'create_waiting_to_interview',
    CREATE_INTERVIEW_TO_INTERVIEW: 'create_interview_to_interview',
    
    // Request Actions
    ACCEPT_REJECT_REQUEST: 'accept_reject_request',
    CONFIRM_ARRIVAL: 'confirm_arrival',
    EXECUTE_TRANSFER: 'execute_transfer',
    START_TRANSIT: 'start_transit',
    
    // Management
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
    
    try {
        const d = await getDoc(doc(db, "users", u));
        if (d.exists() && d.data().pass === p) {
            currentUser = { id: u, ...d.data() };
            
            if (!Object.values(ROLES).includes(currentUser.role)) {
                showToast('دور المستخدم غير صحيح', 'error');
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
        showToast('خطأ في الاتصال', 'error');
    }
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
    
    let requestsQuery;
    
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
                <button onclick="createOutsideToWaitingRequest()" class="w-full bg-gradient-to-r from-blue-500 to-green-500 text-white p-4 rounded-xl font-bold">
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
        html += '<div class="bg-white dark:bg-slate-800 p-12 rounded-2xl shadow text-center"><h3 class="text-2xl font-bold">مرحباً بك</h3></div>';
    }
    
    content.innerHTML = html;
}

function renderRequests() {
    const content = document.getElementById('contentArea');
    content.innerHTML = `<h2 class="text-2xl font-black mb-6">طلبات النقل</h2>
    <div class="bg-white dark:bg-slate-800 p-12 rounded-2xl shadow text-center">
        <p class="text-slate-500">سيتم إضافة نظام الطلبات قريباً</p>
    </div>`;
}

function renderMyHall() {
    const content = document.getElementById('contentArea');
    content.innerHTML = `<h2 class="text-2xl font-black mb-6">قاعتي</h2>
    <div class="bg-white dark:bg-slate-800 p-12 rounded-2xl shadow text-center">
        <p class="text-slate-500">معلومات القاعة</p>
    </div>`;
}

function renderAnalytics() {
    const content = document.getElementById('contentArea');
    content.innerHTML = `<h2 class="text-2xl font-black mb-6">الإحصائيات</h2>
    <div class="bg-white dark:bg-slate-800 p-12 rounded-2xl shadow text-center">
        <p class="text-slate-500">الإحصائيات المتقدمة</p>
    </div>`;
}

function renderManageHalls() {
    const content = document.getElementById('contentArea');
    content.innerHTML = `<h2 class="text-2xl font-black mb-6">إدارة القاعات</h2>
    <div class="bg-white dark:bg-slate-800 p-12 rounded-2xl shadow text-center">
        <p class="text-slate-500">إدارة القاعات</p>
    </div>`;
}

function renderManageUsers() {
    const content = document.getElementById('contentArea');
    content.innerHTML = `<h2 class="text-2xl font-black mb-6">إدارة المستخدمين</h2>
    <div class="bg-white dark:bg-slate-800 p-12 rounded-2xl shadow text-center">
        <p class="text-slate-500">إدارة المستخدمين</p>
    </div>`;
}

function renderAuditLog() {
    const content = document.getElementById('contentArea');
    content.innerHTML = `<h2 class="text-2xl font-black mb-6">سجل العمليات</h2>
    <div class="bg-white dark:bg-slate-800 p-12 rounded-2xl shadow text-center">
        <p class="text-slate-500">سجل العمليات</p>
    </div>`;
}

// ============================================
// ACTIONS
// ============================================

window.adjustOutdoor = async (n) => {
    await updateDoc(doc(db, "settings", "global_config"), { outdoor_queue: increment(n) });
    await logActivity(n > 0 ? 'ADD_OUTDOOR' : 'REMOVE_OUTDOOR', `${n > 0 ? 'إضافة' : 'خصم'} ${Math.abs(n)} من الانتظار الخارجي`);
    showToast(n > 0 ? 'تمت الإضافة' : 'تم الخصم', 'success');
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
        await updateDoc(doc(db, "settings", "global_config"), {
            outdoor_queue: increment(parseInt(count))
        });
        await logActivity('ADD_ARRIVALS', `إضافة ${count} واصلين`);
        showToast(`تم إضافة ${count}`, 'success');
    }
};

window.createOutsideToWaitingRequest = async () => {
    showToast('سيتم إضافة إنشاء الطلبات قريباً', 'info');
};

// ============================================
// SYSTEM RESET
// ============================================

window.systemReset = async () => {
    if (!confirm('تهيئة النظام؟ سيتم إنشاء بيانات تجريبية!')) return;
    
    try {
        const batch = writeBatch(db);
        
        // Create users with new roles
        batch.set(doc(db, "users", "admin"), {
            pass: "1234",
            role: ROLES.ADMIN,
            fullName: "مدير عام"
        });
        
        batch.set(doc(db, "users", "external_supervisor"), {
            pass: "1234",
            role: ROLES.EXTERNAL_SUPERVISOR,
            fullName: "مشرف خارجي"
        });
        
        batch.set(doc(db, "users", "external_regular"), {
            pass: "1234",
            role: ROLES.EXTERNAL_REGULAR,
            fullName: "منظم خارجي"
        });
        
        batch.set(doc(db, "users", "internal_supervisor"), {
            pass: "1234",
            role: ROLES.INTERNAL_SUPERVISOR,
            fullName: "مشرف داخلي"
        });
        
        batch.set(doc(db, "users", "internal_regular"), {
            pass: "1234",
            role: ROLES.INTERNAL_REGULAR,
            fullName: "منظم داخلي",
            assignedHallId: "waiting_1"
        });
        
        batch.set(doc(db, "users", "path_organizer"), {
            pass: "1234",
            role: ROLES.PATH_ORGANIZER,
            fullName: "منظم مسار"
        });
        
        batch.set(doc(db, "users", "viewer"), {
            pass: "1234",
            role: ROLES.VIEWER,
            fullName: "عارض"
        });
        
        // Settings
        batch.set(doc(db, "settings", "global_config"), {
            served_count: 0,
            outdoor_queue: 0
        });
        
        // Waiting halls
        for (let i = 1; i <= 3; i++) {
            batch.set(doc(db, "halls", `waiting_${i}`), {
                name: `انتظار ${i}`,
                type: "انتظار",
                capacity: 50,
                current: 0,
                supervisorId: null,
                active: true,
                status: 'OPEN'
            });
        }
        
        // Interview halls
        for (let i = 1; i <= 5; i++) {
            batch.set(doc(db, "halls", `interview_${i}`), {
                name: `مقابلات ${i}`,
                type: "مقابلات",
                capacity: 40,
                current: 0,
                supervisorId: null,
                active: true,
                status: 'OPEN'
            });
        }
        
        await batch.commit();
        
        alert('تمت التهيئة بنجاح! سيتم إعادة تحميل الصفحة...');
        location.reload();
    } catch (e) {
        console.error('Reset error:', e);
        alert('حدث خطأ: ' + e.message);
    }
};
