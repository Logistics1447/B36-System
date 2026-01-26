
// ============================================
// B36 SYSTEM - VERSION 34 (PERFORMANCE & PDF REPORTS)
// ============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, doc, setDoc, getDoc, updateDoc, 
    onSnapshot, query, where, orderBy, serverTimestamp, increment, writeBatch, limit 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
// CONSTANTS & ROLES
// ============================================

const ROLES = {
    EXTERNAL_SUPERVISOR: 'external_supervisor',
    EXTERNAL_REGULAR: 'external_regular',
    INTERNAL_SUPERVISOR: 'internal_supervisor',
    INTERNAL_REGULAR: 'internal_regular',
    ADMIN: 'admin',
    VIEWER: 'viewer'
};

const PERMISSIONS = {
    MANAGE_OUTSIDE_COUNT: 'manage_outside_count',
    CREATE_TRANSFER: 'create_transfer',
    COMMIT_HALL_COUNT: 'commit_hall_count',
    VIEW_DASHBOARD: 'view_dashboard',
    VIEW_AUDIT_LOG: 'view_audit_log',
    EXPORT_REPORTS: 'export_reports'
};

const ROLE_PERMISSIONS = {
    [ROLES.EXTERNAL_SUPERVISOR]: [PERMISSIONS.MANAGE_OUTSIDE_COUNT, PERMISSIONS.CREATE_TRANSFER, PERMISSIONS.VIEW_DASHBOARD],
    [ROLES.EXTERNAL_REGULAR]: [PERMISSIONS.MANAGE_OUTSIDE_COUNT],
    [ROLES.INTERNAL_SUPERVISOR]: [PERMISSIONS.CREATE_TRANSFER, PERMISSIONS.COMMIT_HALL_COUNT, PERMISSIONS.VIEW_DASHBOARD],
    [ROLES.INTERNAL_REGULAR]: [PERMISSIONS.COMMIT_HALL_COUNT, PERMISSIONS.VIEW_DASHBOARD],
    [ROLES.ADMIN]: Object.values(PERMISSIONS),
    [ROLES.VIEWER]: [PERMISSIONS.VIEW_DASHBOARD]
};

// ============================================
// STATE MANAGEMENT
// ============================================

let currentUser = null;
let halls = [];
let globalStats = { outdoor_queue: 0, served_today: 0 };
let currentView = 'dashboard';
let draftCounts = {};
let unsubscribeFunctions = [];

// ============================================
// AUTHENTICATION (FIXED & OPTIMIZED)
// ============================================

window.login = async (username, password) => {
    if (!username || !password) {
        showToast('يرجى إدخال اسم المستخدم وكلمة المرور', 'warning');
        return;
    }
    
    setLoading(true);
    try {
        const userRef = doc(db, "users", username.trim().toLowerCase());
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.password === password) {
                currentUser = { id: userDoc.id, ...userData };
                localStorage.setItem('b36_user', JSON.stringify(currentUser));
                initApp();
                showToast(`أهلاً بك ${currentUser.name}`, 'success');
            } else {
                showToast('كلمة المرور غير صحيحة', 'error');
            }
        } else {
            showToast('اسم المستخدم غير موجود', 'error');
        }
    } catch (e) { 
        console.error("Login Error:", e);
        showToast('خطأ في الاتصال بقاعدة البيانات', 'error'); 
    }
    finally { setLoading(false); }
};

// ============================================
// INITIALIZATION & LISTENERS (OPTIMIZED)
// ============================================

function initApp() {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    document.getElementById('userNameDisplay').innerText = currentUser.name;
    document.getElementById('userRoleDisplay').innerText = getRoleLabel(currentUser.role);
    
    buildNavigation();
    startListeners();
}

function startListeners() {
    // Clear previous listeners to prevent memory leaks and slowness
    unsubscribeFunctions.forEach(unsub => unsub());
    unsubscribeFunctions = [];

    // Halls Listener
    const unsubHalls = onSnapshot(collection(db, "halls"), (s) => {
        halls = [];
        s.forEach(d => {
            const data = { id: d.id, ...d.data() };
            halls.push(data);
            if (!(d.id in draftCounts)) draftCounts[d.id] = data.current || 0;
        });
        renderCurrentView();
    });
    unsubscribeFunctions.push(unsubHalls);

    // Global Config Listener
    const unsubConfig = onSnapshot(doc(db, "settings", "global_config"), (s) => {
        if (s.exists()) {
            globalStats = s.data();
            renderCurrentView();
        }
    });
    unsubscribeFunctions.push(unsubConfig);
}

// ============================================
// PDF REPORT GENERATION (NEW FEATURE)
// ============================================

window.exportDailyReport = async () => {
    if (!checkAuth(PERMISSIONS.EXPORT_REPORTS)) return;
    
    setLoading(true);
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        
        // Add Arabic Font Support (Simplified for this version)
        doc.setFontSize(22);
        doc.text("B36 Hall Management System", 105, 20, { align: "center" });
        doc.setFontSize(16);
        doc.text("Daily Operations Report", 105, 30, { align: "center" });
        doc.setFontSize(12);
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 105, 40, { align: "center" });
        
        // Stats Section
        doc.line(20, 45, 190, 45);
        doc.text("Summary Statistics:", 20, 55);
        doc.text(`- Total Served Today: ${globalStats.served_today || 0}`, 30, 65);
        doc.text(`- Current Outside Queue: ${globalStats.outdoor_queue}`, 30, 75);
        doc.text(`- Total Building Capacity: ${halls.reduce((a,b)=>a+b.capacity,0)}`, 30, 85);
        
        // Halls Table
        doc.text("Halls Status:", 20, 100);
        let y = 110;
        halls.forEach(h => {
            doc.text(`${h.name}: ${h.current}/${h.capacity} (${Math.round((h.current/h.capacity)*100)}%)`, 30, y);
            y += 10;
        });

        doc.save(`B36_Report_${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('تم تصدير التقرير بنجاح', 'success');
    } catch (e) {
        console.error("PDF Error:", e);
        showToast('خطأ أثناء توليد التقرير', 'error');
    } finally {
        setLoading(false);
    }
};

// ============================================
// HALL CONTROL LOGIC
// ============================================

window.updateDraft = (hallId, delta) => {
    draftCounts[hallId] = Math.max(0, (draftCounts[hallId] || 0) + delta);
    renderCurrentView();
};

window.commitHallCount = async (hallId) => {
    if (!checkAuth(PERMISSIONS.COMMIT_HALL_COUNT)) return;
    
    const hall = halls.find(h => h.id === hallId);
    const newCount = draftCounts[hallId];
    const diff = newCount - (hall.current || 0);
    
    setLoading(true);
    try {
        await updateDoc(doc(db, "halls", hallId), {
            current: newCount,
            lastUpdatedBy: currentUser.name,
            lastUpdateAt: serverTimestamp()
        });
        
        // If it's an interview hall and count decreased, increment served_today
        if (hall.type === 'مقابلات' && diff < 0) {
            await updateDoc(doc(db, "settings", "global_config"), {
                served_today: increment(Math.abs(diff))
            });
        }
        
        showToast('تم التحديث بنجاح', 'success');
    } catch (e) { showToast('خطأ في التحديث', 'error'); }
    finally { setLoading(false); }
};

// ============================================
// UI RENDERING (OPTIMIZED)
// ============================================

function renderDashboard() {
    const content = document.getElementById('contentArea');
    const totalInside = halls.reduce((a, b) => a + (b.current || 0), 0);
    
    content.innerHTML = `
        <div class="flex justify-between items-center mb-8">
            <h2 class="text-2xl font-black">لوحة التحكم الرئيسية</h2>
            ${checkAuth(PERMISSIONS.EXPORT_REPORTS) ? `
                <button onclick="exportDailyReport()" class="bg-white border-2 border-blue-600 text-blue-600 px-6 py-2 rounded-xl font-bold hover:bg-blue-50 transition flex items-center gap-2">
                    <i class="ph ph-file-pdf"></i> تصدير تقرير PDF
                </button>
            ` : ''}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <p class="text-slate-500 text-xs font-bold mb-1">تمت خدمتهم اليوم</p>
                <p class="text-3xl font-black text-green-600">${globalStats.served_today || 0}</p>
            </div>
            <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <p class="text-slate-500 text-xs font-bold mb-1">داخل المبنى</p>
                <p class="text-3xl font-black text-blue-600">${totalInside}</p>
            </div>
            <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <p class="text-slate-500 text-xs font-bold mb-1">خارج المبنى</p>
                <p class="text-3xl font-black text-orange-500">${globalStats.outdoor_queue}</p>
            </div>
            <div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <p class="text-slate-500 text-xs font-bold mb-1">السعة المتاحة</p>
                <p class="text-3xl font-black text-slate-700">${halls.reduce((a,b)=>a+b.capacity,0) - totalInside}</p>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div class="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100">
                <h3 class="text-lg font-black mb-6 flex items-center gap-2">
                    <i class="ph ph-activity text-blue-600"></i> حالة القاعات اللحظية
                </h3>
                <div class="space-y-6">
                    ${halls.map(h => {
                        const percent = Math.min(100, (h.current / h.capacity) * 100);
                        const color = percent > 90 ? 'bg-red-500' : percent > 70 ? 'bg-orange-500' : 'bg-blue-600';
                        return `
                        <div>
                            <div class="flex justify-between text-sm font-bold mb-2">
                                <span>${h.name}</span>
                                <span class="text-slate-400">${h.current} / ${h.capacity}</span>
                            </div>
                            <div class="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                                <div class="${color} h-full transition-all duration-1000" style="width: ${percent}%"></div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>

            <div class="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100">
                <h3 class="text-lg font-black mb-6 flex items-center gap-2">
                    <i class="ph ph-warning-circle text-orange-500"></i> تنبيهات النظام
                </h3>
                <div class="space-y-4">
                    ${halls.filter(h => (h.current/h.capacity) > 0.8).map(h => `
                        <div class="p-4 bg-orange-50 border border-orange-100 rounded-2xl flex items-center gap-4">
                            <i class="ph ph-warning text-orange-500 text-xl"></i>
                            <p class="text-sm font-bold text-orange-700">القاعة ${h.name} قريبة من الامتلاء (${Math.round((h.current/h.capacity)*100)}%)</p>
                        </div>
                    `).join('') || '<p class="text-slate-400 text-sm italic text-center py-10">لا توجد تنبيهات حالياً</p>'}
                </div>
            </div>
        </div>
    `;
}

function renderHallControl() {
    const content = document.getElementById('contentArea');
    content.innerHTML = `
        <h2 class="text-2xl font-black mb-8">التحكم الميداني بالقاعات</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            ${halls.map(h => {
                const draft = draftCounts[h.id] || 0;
                const isChanged = draft !== h.current;
                return `
                <div class="bg-white p-8 rounded-[40px] shadow-sm border ${isChanged ? 'border-blue-500 ring-4 ring-blue-50' : 'border-slate-100'} transition-all">
                    <div class="flex justify-between items-start mb-6">
                        <div>
                            <h3 class="font-black text-xl">${h.name}</h3>
                            <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">${h.type}</p>
                        </div>
                        <div class="text-left">
                            <p class="text-2xl font-black ${h.current >= h.capacity ? 'text-red-500' : 'text-blue-600'}">${h.current}</p>
                            <p class="text-[10px] font-bold text-slate-400">العدد المعتمد</p>
                        </div>
                    </div>

                    <div class="flex items-center gap-6 mb-8">
                        <button onclick="updateDraft('${h.id}', -1)" class="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-2xl hover:bg-slate-100 transition">-</button>
                        <div class="flex-1 text-center">
                            <p class="text-4xl font-black text-slate-800">${draft}</p>
                            <p class="text-[10px] font-bold text-blue-500 uppercase">العدد الجديد</p>
                        </div>
                        <button onclick="updateDraft('${h.id}', 1)" class="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-2xl hover:bg-slate-100 transition">+</button>
                    </div>

                    <button onclick="commitHallCount('${h.id}')" 
                        class="w-full py-5 rounded-2xl font-black transition-all ${isChanged ? 'bg-blue-600 text-white shadow-xl shadow-blue-200 hover:scale-[1.02]' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}"
                        ${!isChanged ? 'disabled' : ''}>
                        اعتماد التحديث
                    </button>
                </div>`;
            }).join('')}
        </div>
    `;
}

// ============================================
// UTILITIES
// ============================================

function checkAuth(permission) {
    if (!currentUser) return false;
    return ROLE_PERMISSIONS[currentUser.role]?.includes(permission);
}

function getRoleLabel(role) {
    const labels = {
        [ROLES.EXTERNAL_SUPERVISOR]: 'مشرف خارجي',
        [ROLES.EXTERNAL_REGULAR]: 'منظم خارجي',
        [ROLES.INTERNAL_SUPERVISOR]: 'مشرف المبنى',
        [ROLES.INTERNAL_REGULAR]: 'منظم داخلي',
        [ROLES.ADMIN]: 'المدير العام',
        [ROLES.VIEWER]: 'يوزر عرض'
    };
    return labels[role] || role;
}

function buildNavigation() {
    const nav = document.getElementById('mainNav');
    let html = `<button onclick="showView('dashboard')" class="nav-item ${currentView === 'dashboard' ? 'active' : ''}"><i class="ph ph-chart-pie"></i>الرئيسية</button>`;
    
    if (checkAuth(PERMISSIONS.COMMIT_HALL_COUNT)) {
        html += `<button onclick="showView('hall_control')" class="nav-item ${currentView === 'hall_control' ? 'active' : ''}"><i class="ph ph-sliders"></i>التحكم بالقاعات</button>`;
    }
    
    nav.innerHTML = html;
}

window.showView = (view) => {
    currentView = view;
    buildNavigation();
    renderCurrentView();
};

function renderCurrentView() {
    if (currentView === 'dashboard') renderDashboard();
    else if (currentView === 'hall_control') renderHallControl();
}

function setLoading(show) {
    document.getElementById('loader').classList.toggle('hidden', !show);
}

function showToast(msg, type = 'info') {
    Swal.fire({ toast: true, position: 'top-end', icon: type, title: msg, showConfirmButton: false, timer: 3000 });
}

// System Reset (Fixed for v34)
window.systemReset = async () => {
    const result = await Swal.fire({ title: 'تهيئة النظام؟', text: "سيتم إنشاء الحسابات الافتراضية للنسخة v34.", icon: 'warning', showCancelButton: true });
    if (result.isConfirmed) {
        setLoading(true);
        try {
            const batch = writeBatch(db);
            const defaultUsers = [
                { id: 'admin', name: 'المدير العام', role: ROLES.ADMIN, password: '123' },
                { id: 'int_sup', name: 'مشرف المبنى', role: ROLES.INTERNAL_SUPERVISOR, password: '123' },
                { id: 'int_reg', name: 'منظم داخلي', role: ROLES.INTERNAL_REGULAR, password: '123' },
                { id: 'viewer', name: 'يوزر العرض', role: ROLES.VIEWER, password: '123' }
            ];
            defaultUsers.forEach(u => batch.set(doc(db, "users", u.id), { username: u.id, name: u.name, role: u.role, password: u.password }));
            batch.set(doc(db, "settings", "global_config"), { outdoor_queue: 50, served_today: 0 });
            
            const defaultHalls = [
                { id: 'h1', name: 'قاعة الانتظار A', type: 'انتظار', capacity: 100, current: 0 },
                { id: 'h2', name: 'قاعة الانتظار B', type: 'انتظار', capacity: 80, current: 0 },
                { id: 'h3', name: 'مقابلات 1', type: 'مقابلات', capacity: 15, current: 0 },
                { id: 'h4', name: 'مقابلات 2', type: 'مقابلات', capacity: 15, current: 0 }
            ];
            defaultHalls.forEach(h => batch.set(doc(db, "halls", h.id), h));
            
            await batch.commit();
            showToast('تمت التهيئة بنجاح', 'success');
        } catch (e) { showToast('خطأ في التهيئة', 'error'); }
        finally { setLoading(false); }
    }
};

// Auto-login if session exists
if (localStorage.getItem('b36_user')) {
    currentUser = JSON.parse(localStorage.getItem('b36_user'));
    initApp();
}
