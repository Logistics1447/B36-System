    
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
