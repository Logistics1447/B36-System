// ============================================
// MY HALL VIEW (تكملة)
// ============================================

Hall.capacity) * 100) : 0;
    
    let occupancyColor = 'text-green-500';
    if (occupancyPercent >= 90) occupancyColor = 'text-red-500';
    else if (occupancyPercent >= 70) occupancyColor = 'text-amber-500';
    
    const myRequests = transferRequests.filter(r => r.toId === currentUser.assignedHallId);
    
    const html = `
        <h2 class="text-2xl font-black mb-6">قاعتي: ${myHall.name}</h2>
        
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div class="bg-gradient-to-br from-[#6B9AC4] to-[#5A89B3] p-6 rounded-2xl text-white shadow-lg">
                <i class="ph ph-users text-4xl mb-3 opacity-80"></i>
                <h3 class="text-4xl font-black">${myHall.current}</h3>
                <p class="text-sm opacity-90">الحضور الحالي</p>
            </div>
            
            <div class="bg-gradient-to-br from-[#88B2AC] to-[#7AA39D] p-6 rounded-2xl text-white shadow-lg">
                <i class="ph ph-door-open text-4xl mb-3 opacity-80"></i>
                <h3 class="text-4xl font-black">${myHall.capacity}</h3>
                <p class="text-sm opacity-90">السعة الكلية</p>
            </div>
            
            <div class="bg-gradient-to-br from-[#B8A4C9] to-[#A895B8] p-6 rounded-2xl text-white shadow-lg">
                <i class="ph ph-chart-pie text-4xl mb-3 opacity-80"></i>
                <h3 class="text-4xl font-black">${occupancyPercent}%</h3>
                <p class="text-sm opacity-90">نسبة الإشغال</p>
            </div>
        </div>
        
        <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl border dark:border-slate-700 shadow-sm">
            <h3 class="font-bold text-lg mb-4">الطلبات الواردة لقاعتي</h3>
            ${myRequests.length === 0 ? `
                <div class="text-center py-12">
                    <i class="ph ph-inbox text-6xl text-slate-300 dark:text-slate-600 mb-4"></i>
                    <p class="text-slate-500 dark:text-slate-400">لا توجد طلبات</p>
                </div>
            ` : `
                <div class="space-y-4">
                ${myRequests.map(req => {
                    const canAccept = req.status === 'pending';
                    const canConfirm = req.status === 'in_transit';
                    
                    return `
                    <div class="p-4 border-2 dark:border-slate-600 rounded-xl">
                        <div class="flex justify-between items-start mb-3">
                            <div>
                                <span class="status-${req.status} text-white text-xs px-3 py-1 rounded-full font-bold">${getStatusText(req.status)}</span>
                                <p class="text-sm text-slate-500 mt-2">من: ${req.fromType === 'خارج_المبنى' ? 'خارج المبنى' : req.fromName}</p>
                            </div>
                            <p class="text-2xl font-black text-[#6B9AC4]">${req.requestedCount}</p>
                        </div>
                        
                        ${canAccept ? `
                        <div class="flex gap-2 mt-4">
                            <button onclick="acceptRequest('${req.id}')" class="flex-1 bg-green-500 text-white p-3 rounded-lg font-bold">
                                <i class="ph ph-check"></i> قبول
                            </button>
                            <button onclick="rejectRequest('${req.id}')" class="flex-1 bg-red-500 text-white p-3 rounded-lg font-bold">
                                <i class="ph ph-x"></i> رفض
                            </button>
                        </div>
                        ` : ''}
                        
                        ${canConfirm ? `
                        <button onclick="openConfirmArrivalModal('${req.id}')" class="w-full bg-[#88B2AC] text-white p-3 rounded-lg font-bold mt-4">
                            <i class="ph ph-check-circle"></i> تأكيد الوصول
                        </button>
                        ` : ''}
                    </div>
                    `;
                }).join('')}
                </div>
            `}
        </div>
    `;
    
    content.innerHTML = html;
}

// ============================================
// ANALYTICS VIEW
// ============================================

function renderAnalytics() {
    const content = document.getElementById('contentArea');
    
    const waitingHalls = halls.filter(h => h.type === 'انتظار' && h.active);
    const interviewHalls = halls.filter(h => h.type === 'مقابلات' && h.active);
    
    const totalWaiting = waitingHalls.reduce((a, b) => a + (b.current || 0), 0);
    const totalInterview = interviewHalls.reduce((a, b) => a + (b.current || 0), 0);
    const totalIndoor = totalWaiting + totalInterview;
    const totalCap = halls.filter(h => h.active).reduce((a, b) => a + (b.capacity || 0), 0);
    const occupancyRate = totalCap > 0 ? Math.round((totalIndoor / totalCap) * 100) : 0;
    
    const pendingRequests = transferRequests.filter(r => r.status === 'pending').length;
    const inTransitRequests = transferRequests.filter(r => r.status === 'in_transit').length;
    const closedToday = transferRequests.filter(r => r.status === 'closed').length;
    
    const html = `
        <h2 class="text-2xl font-black mb-6">الإحصائيات والتحليلات</h2>
        
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-gradient-to-br from-[#E8A87C] to-[#D89A6D] p-5 rounded-2xl text-white shadow-lg">
                <i class="ph ph-users text-3xl mb-2 opacity-80"></i>
                <h3 class="text-3xl font-black">${globalStats.outdoor_queue}</h3>
                <p class="text-sm opacity-90">خارج المبنى</p>
            </div>
            
            <div class="bg-gradient-to-br from-[#6B9AC4] to-[#5A89B3] p-5 rounded-2xl text-white shadow-lg">
                <i class="ph ph-door text-3xl mb-2 opacity-80"></i>
                <h3 class="text-3xl font-black">${totalWaiting}</h3>
                <p class="text-sm opacity-90">في الانتظار</p>
            </div>
            
            <div class="bg-gradient-to-br from-[#88B2AC] to-[#7AA39D] p-5 rounded-2xl text-white shadow-lg">
                <i class="ph ph-chalkboard text-3xl mb-2 opacity-80"></i>
                <h3 class="text-3xl font-black">${totalInterview}</h3>
                <p class="text-sm opacity-90">في المقابلات</p>
            </div>
            
            <div class="bg-gradient-to-br from-[#8BA888] to-[#7A9879] p-5 rounded-2xl text-white shadow-lg">
                <i class="ph ph-check-circle text-3xl mb-2 opacity-80"></i>
                <h3 class="text-3xl font-black">${globalStats.served}</h3>
                <p class="text-sm opacity-90">تمت خدمتهم</p>
            </div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border dark:border-slate-700 shadow-sm">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="font-bold">الطلبات قيد الانتظار</h3>
                    <i class="ph ph-clock text-2xl text-amber-500"></i>
                </div>
                <p class="text-4xl font-black text-amber-500">${pendingRequests}</p>
            </div>
            
            <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border dark:border-slate-700 shadow-sm">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="font-bold">جاري التوصيل</h3>
                    <i class="ph ph-truck text-2xl text-blue-500"></i>
                </div>
                <p class="text-4xl font-black text-blue-500">${inTransitRequests}</p>
            </div>
            
            <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border dark:border-slate-700 shadow-sm">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="font-bold">اكتملت اليوم</h3>
                    <i class="ph ph-check-square text-2xl text-green-500"></i>
                </div>
                <p class="text-4xl font-black text-green-500">${closedToday}</p>
            </div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl border dark:border-slate-700 shadow-sm">
                <h3 class="font-bold text-lg mb-4">قاعات الانتظار</h3>
                <div class="space-y-3">
                ${waitingHalls.map(h => {
                    const occ = h.capacity > 0 ? Math.round((h.current / h.capacity) * 100) : 0;
                    return `
                    <div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                        <div class="flex-1">
                            <p class="font-bold">${h.name}</p>
                            <div class="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2 mt-2">
                                <div class="bg-[#6B9AC4] h-2 rounded-full" style="width: ${occ}%"></div>
                            </div>
                        </div>
                        <div class="text-left mr-4">
                            <p class="text-2xl font-black text-[#6B9AC4]">${h.current}</p>
                            <p class="text-xs text-slate-500">من ${h.capacity}</p>
                        </div>
                    </div>
                    `;
                }).join('')}
                </div>
            </div>
            
            <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl border dark:border-slate-700 shadow-sm">
                <h3 class="font-bold text-lg mb-4">قاعات المقابلات</h3>
                <div class="space-y-3">
                ${interviewHalls.map(h => {
                    const occ = h.capacity > 0 ? Math.round((h.current / h.capacity) * 100) : 0;
                    let color = '#22c55e';
                    if (occ >= 90) color = '#ef4444';
                    else if (occ >= 70) color = '#f59e0b';
                    return `
                    <div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                        <div class="flex-1">
                            <p class="font-bold">${h.name}</p>
                            <div class="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2 mt-2">
                                <div class="h-2 rounded-full" style="width: ${occ}%; background: ${color}"></div>
                            </div>
                        </div>
                        <div class="text-left mr-4">
                            <p class="text-2xl font-black" style="color: ${color}">${h.current}</p>
                            <p class="text-xs text-slate-500">من ${h.capacity}</p>
                        </div>
                    </div>
                    `;
                }).join('')}
                </div>
            </div>
        </div>
    `;
    
    content.innerHTML = html;
}

// ============================================
// MANAGE HALLS (للمدير فقط)
// ============================================

function renderManageHalls() {
    if (!hasPermission(PERMISSIONS.MANAGE_HALLS)) {
        document.getElementById('contentArea').innerHTML = '<div class="text-center py-20"><p class="text-xl font-bold text-red-500">غير مصرح</p></div>';
        return;
    }
    
    const content = document.getElementById('contentArea');
    
    const html = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-black">إدارة القاعات</h2>
            <button onclick="openCreateHallModal()" class="bg-[#6B9AC4] text-white px-6 py-3 rounded-xl font-bold hover:opacity-90">
                <i class="ph ph-plus-circle"></i> إضافة قاعة
            </button>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        ${halls.map(h => {
            const supervisor = users.find(u => u.id === h.supervisorId);
            const occ = h.capacity > 0 ? Math.round((h.current / h.capacity) * 100) : 0;
            
            return `
            <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl border-2 ${h.active ? 'border-green-200 dark:border-green-900' : 'border-red-200 dark:border-red-900'} shadow-sm">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h3 class="font-bold text-xl">${h.name}</h3>
                        <span class="text-xs px-2 py-1 rounded-full ${h.type === 'انتظار' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}">${h.type}</span>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" ${h.active ? 'checked' : ''} onchange="toggleHallActive('${h.id}', ${h.active})">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                
                <div class="space-y-2 mb-4">
                    <div class="flex justify-between text-sm">
                        <span class="text-slate-500">الحضور</span>
                        <span class="font-bold">${h.current} / ${h.capacity}</span>
                    </div>
                    <div class="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2">
                        <div class="bg-[#6B9AC4] h-2 rounded-full transition-all" style="width: ${occ}%"></div>
                    </div>
                    ${supervisor ? `
                    <div class="flex justify-between text-sm">
                        <span class="text-slate-500">المسؤول</span>
                        <span class="font-bold">${supervisor.fullName || supervisor.id}</span>
                    </div>
                    ` : ''}
                </div>
                
                <div class="flex gap-2">
                    <button onclick="openEditHallModal('${h.id}')" class="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 p-2 rounded-lg text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-600">
                        <i class="ph ph-pencil"></i> تعديل
                    </button>
                    <button onclick="deleteHall('${h.id}')" class="bg-red-100 dark:bg-red-900/30 text-red-600 p-2 rounded-lg text-sm font-bold hover:bg-red-200">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            </div>
            `;
        }).join('')}
        </div>
    `;
    
    content.innerHTML = html;
}

// فتح modal إنشاء قاعة
window.openCreateHallModal = async () => {
    const { value: formValues } = await Swal.fire({
        title: 'إضافة قاعة جديدة',
        html: `
            <div class="text-right space-y-4">
                <div>
                    <label class="block text-sm font-bold mb-2">اسم القاعة</label>
                    <input type="text" id="swal-hall-name" class="w-full p-3 border-2 rounded-lg" placeholder="قاعة 1">
                </div>
                <div>
                    <label class="block text-sm font-bold mb-2">نوع القاعة</label>
                    <select id="swal-hall-type" class="w-full p-3 border-2 rounded-lg">
                        <option value="انتظار">قاعة انتظار</option>
                        <option value="مقابلات">قاعة مقابلات</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-bold mb-2">السعة</label>
                    <input type="number" id="swal-hall-capacity" class="w-full p-3 border-2 rounded-lg" min="1" value="100">
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'إضافة',
        cancelButtonText: 'إلغاء',
        preConfirm: () => {
            const name = document.getElementById('swal-hall-name').value.trim();
            const type = document.getElementById('swal-hall-type').value;
            const capacity = parseInt(document.getElementById('swal-hall-capacity').value);
            
            if (!name || !capacity || capacity < 1) {
                Swal.showValidationMessage('يرجى ملء جميع الحقول');
                return false;
            }
            
            return { name, type, capacity };
        }
    });
    
    if (formValues) {
        try {
            const { name, type, capacity } = formValues;
            
            const newHallRef = doc(collection(db, "halls"));
            await setDoc(newHallRef, {
                name: name,
                type: type,
                capacity: capacity,
                current: 0,
                supervisorId: null,
                active: true,
                status: 'OPEN',
                createdAt: serverTimestamp()
            });
            
            await logActivity(
                'CREATE_HALL',
                `إنشاء قاعة جديدة: ${name}`,
                'hall',
                newHallRef.id,
                null,
                { name, type, capacity }
            );
            
            showToast('تم إضافة القاعة بنجاح', 'success');
        } catch (e) {
            showToast('حدث خطأ', 'error');
        }
    }
};

// تفعيل/تعطيل القاعة
window.toggleHallActive = async (hallId, currentActive) => {
    try {
        const newActive = !currentActive;
        await updateDoc(doc(db, "halls", hallId), {
            active: newActive
        });
        
        await logActivity(
            newActive ? 'ACTIVATE_HALL' : 'DEACTIVATE_HALL',
            `${newActive ? 'تفعيل' : 'تعطيل'} القاعة`,
            'hall',
            hallId
        );
        
        showToast(newActive ? 'تم التفعيل' : 'تم التعطيل', 'success');
    } catch (e) {
        showToast('حدث خطأ', 'error');
    }
};

// حذف قاعة
window.deleteHall = async (hallId) => {
    const hall = halls.find(h => h.id === hallId);
    if (!hall) return;
    
    if (hall.current > 0) {
        showToast('لا يمكن حذف قاعة بها مرشحين', 'error');
        return;
    }
    
    const confirmed = await Swal.fire({
        title: 'حذف القاعة؟',
        text: `هل تريد حذف ${hall.name}؟`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'حذف',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#ef4444'
    });
    
    if (confirmed.isConfirmed) {
        try {
            await deleteDoc(doc(db, "halls", hallId));
            
            await logActivity(
                'DELETE_HALL',
                `حذف القاعة: ${hall.name}`,
                'hall',
                hallId,
                hall,
                null
            );
            
            showToast('تم الحذف', 'success');
        } catch (e) {
            showToast('حدث خطأ', 'error');
        }
    }
};

// ============================================
// MANAGE USERS (للمدير فقط)
// ============================================

function renderManageUsers() {
    if (!hasPermission(PERMISSIONS.ASSIGN_USERS)) {
        document.getElementById('contentArea').innerHTML = '<div class="text-center py-20"><p class="text-xl font-bold text-red-500">غير مصرح</p></div>';
        return;
    }
    
    const content = document.getElementById('contentArea');
    
    const html = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-black">إدارة المستخدمين</h2>
            <button onclick="openCreateUserModal()" class="bg-[#6B9AC4] text-white px-6 py-3 rounded-xl font-bold hover:opacity-90">
                <i class="ph ph-user-plus"></i> إضافة مستخدم
            </button>
        </div>
        
        <div class="bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700 shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-slate-50 dark:bg-slate-700">
                        <tr>
                            <th class="px-6 py-4 text-right text-sm font-bold">المستخدم</th>
                            <th class="px-6 py-4 text-right text-sm font-bold">الدور</th>
                            <th class="px-6 py-4 text-right text-sm font-bold">القاعة المعينة</th>
                            <th class="px-6 py-4 text-right text-sm font-bold">الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y dark:divide-slate-700">
                    ${users.map(u => {
                        const assignedHall = u.assignedHallId ? halls.find(h => h.id === u.assignedHallId) : null;
                        return `
                        <tr class="hover:bg-slate-50 dark:hover:bg-slate-700">
                            <td class="px-6 py-4">
                                <div>
                                    <p class="font-bold">${u.fullName || u.id}</p>
                                    <p class="text-sm text-slate-500">@${u.id}</p>
                                </div>
                            </td>
                            <td class="px-6 py-4">
                                <span class="text-sm px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full font-bold">
                                    ${u.role}
                                </span>
                            </td>
                            <td class="px-6 py-4">
                                ${assignedHall ? `
                                    <span class="text-sm font-bold">${assignedHall.name}</span>
                                ` : '<span class="text-sm text-slate-400">غير معين</span>'}
                            </td>
                            <td class="px-6 py-4">
                                <div class="flex gap-2">
                                    <button onclick="openEditUserModal('${u.id}')" class="bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 px-3 py-2 rounded-lg text-sm font-bold hover:bg-slate-200">
                                        <i class="ph ph-pencil"></i> تعديل
                                    </button>
                                    ${u.id !== 'admin' ? `
                                    <button onclick="deleteUser('${u.id}')" class="bg-red-100 dark:bg-red-900/30 text-red-600 px-3 py-2 rounded-lg text-sm font-bold hover:bg-red-200">
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
    `;
    
    content.innerHTML = html;
}

// فتح modal إنشاء مستخدم
window.openCreateUserModal = async () => {
    const availableHalls = halls.filter(h => h.active);
    
    const { value: formValues } = await Swal.fire({
        title: 'إضافة مستخدم جديد',
        html: `
            <div class="text-right space-y-4">
                <div>
                    <label class="block text-sm font-bold mb-2">اسم المستخدم (تسجيل الدخول)</label>
                    <input type="text" id="swal-user-id" class="w-full p-3 border-2 rounded-lg" placeholder="ahmad123">
                </div>
                <div>
                    <label class="block text-sm font-bold mb-2">كلمة المرور</label>
                    <input type="password" id="swal-user-pass" class="w-full p-3 border-2 rounded-lg" placeholder="••••••">
                </div>
                <div>
                    <label class="block text-sm font-bold mb-2">الاسم الكامل</label>
                    <input type="text" id="swal-user-name" class="w-full p-3 border-2 rounded-lg" placeholder="أحمد محمد">
                </div>
                <div>
                    <label class="block text-sm font-bold mb-2">الدور</label>
                    <select id="swal-user-role" class="w-full p-3 border-2 rounded-lg">
                        <option value="مشرف_خارجي">مشرف خارجي</option>
                        <option value="منظم_خارجي">منظم خارجي</option>
                        <option value="مشرف_داخلي">مشرف داخلي</option>
                        <option value="منظم_داخلي">منظم داخلي</option>
                        <option value="منظم_مسار">منظم مسار</option>
                        <option value="عارض">عارض</option>
                    </select>
                </div>
                <div id="hall-assignment-div">
                    <label class="block text-sm font-bold mb-2">القاعة المعينة (للمنظم الداخلي)</label>
                    <select id="swal-user-hall" class="w-full p-3 border-2 rounded-lg">
                        <option value="">بدون تعيين</option>
                        ${availableHalls.map(h => `<option value="${h.id}">${h.name} (${h.type})</option>`).join('')}
                    </select>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'إضافة',
        cancelButtonText: 'إلغاء',
        didOpen: () => {
            // إخفاء/إظهار تعيين القاعة
            const roleSelect = document.getElementById('swal-user-role');
            const hallDiv = document.getElementById('hall-assignment-div');
            
            roleSelect.onchange = () => {
                if (roleSelect.value === 'منظم_داخلي') {
                    hallDiv.style.display = 'block';
                } else {
                    hallDiv.style.display = 'none';
                }
            };
            roleSelect.onchange();
        },
        preConfirm: () => {
            const id = document.getElementById('swal-user-id').value.trim().toLowerCase();
            const pass = document.getElementById('swal-user-pass').value;
            const fullName = document.getElementById('swal-user-name').value.trim();
            const role = document.getElementById('swal-user-role').value;
            const assignedHallId = document.getElementById('swal-user-hall').value || null;
            
            if (!id || !pass || !fullName || !role) {
                Swal.showValidationMessage('يرجى ملء جميع الحقول');
                return false;
            }
            
            if (users.find(u => u.id === id)) {
                Swal.showValidationMessage('اسم المستخدم موجود مسبقاً');
                return false;
            }
            
            return { id, pass, fullName, role, assignedHallId };
        }
    });
    
    if (formValues) {
        try {
            const { id, pass, fullName, role, assignedHallId } = formValues;
            
            await setDoc(doc(db, "users", id), {
                pass: pass,
                fullName: fullName,
                role: role,
                assignedHallId: assignedHallId,
                createdAt: serverTimestamp()
            });
            
            // تحديث supervisorId في القاعة
            if (assignedHallId && role === 'منظم_داخلي') {
                await updateDoc(doc(db, "halls", assignedHallId), {
                    supervisorId: id
                });
            }
            
            await logActivity(
                'CREATE_USER',
                `إنشاء مستخدم جديد: ${fullName} (${role})`,
                'user',
                id,
                null,
                { role, assignedHallId }
            );
            
            showToast('تم إضافة المستخدم بنجاح', 'success');
        } catch (e) {
            console.error(e);
            showToast('حدث خطأ', 'error');
        }
    }
};

// حذف مستخدم
window.deleteUser = async (userId) => {
    if (userId === 'admin') {
        showToast('لا يمكن حذف المدير', 'error');
        return;
    }
    
    const user = users.find(u => u.id === userId);
    if (!user) return;
    
    const confirmed = await Swal.fire({
        title: 'حذف المستخدم؟',
        text: `هل تريد حذف ${user.fullName}؟`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'حذف',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#ef4444'
    });
    
    if (confirmed.isConfirmed) {
        try {
            // إزالة تعيينه من القاعة
            if (user.assignedHallId) {
                await updateDoc(doc(db, "halls", user.assignedHallId), {
                    supervisorId: null
                });
            }
            
            await deleteDoc(doc(db, "users", userId));
            
            await logActivity(
                'DELETE_USER',
                `حذف مستخدم: ${user.fullName}`,
                'user',
                userId,
                user,
                null
            );
            
            showToast('تم الحذف', 'success');
        } catch (e) {
            showToast('حدث خطأ', 'error');
        }
    }
};

// ============================================
// AUDIT LOG (للمدير فقط)
// ============================================

function renderAuditLog() {
    if (!hasPermission(PERMISSIONS.VIEW_AUDIT_LOG)) {
        document.getElementById('contentArea').innerHTML = '<div class="text-center py-20"><p class="text-xl font-bold text-red-500">غير مصرح</p></div>';
        return;
    }
    
    // هنا يجب تحميل سجل العمليات من Firestore
    // نتركها كواجهة الآن
    
    const content = document.getElementById('contentArea');
    content.innerHTML = `
        <h2 class="text-2xl font-black mb-6">سجل العمليات</h2>
        <div class="bg-white dark:bg-slate-800 p-12 rounded-2xl border dark:border-slate-700 text-center">
            <i class="ph ph-clock-clockwise text-6xl text-[#B8A4C9] mb-4"></i>
            <p class="text-slate-500 dark:text-slate-400 font-bold">جاري تحميل السجل...</p>
            <p class="text-sm text-slate-400 mt-2">سيتم إضافة التفاصيل قريباً</p>
        </div>
    `;
}

// ============================================
// SYSTEM RESET (للتهيئة الأولية)
// ============================================

window.systemReset = async () => {
    if (!confirm('هل أنت متأكد؟ سيتم حذف جميع البيانات وإنشاء بيانات تجريبية!')) return;
    
    try {
        const batch = writeBatch(db);
        
        // إنشاء المدير
        batch.set(doc(db, "users", "admin"), {
            pass: "1234",
            role: "مدير_عام",
            fullName: "مدير النظام",
            assignedHallId: null
        });
        
        // إنشاء مستخدمين تجريبيين
        batch.set(doc(db, "users", "external_supervisor"), {
            pass: "1234",
            role: "مشرف_خارجي",
            fullName: "مشرف خارجي تجريبي",
            assignedHallId: null
        });
        
        batch.set(doc(db, "users", "external_regular"), {
            pass: "1234",
            role: "منظم_خارجي",
            fullName: "منظم خارجي تجريبي",
            assignedHallId: null
        });
        
        batch.set(doc(db, "users", "internal_supervisor"), {
            pass: "1234",
            role: "مشرف_داخلي",
            fullName: "مشرف داخلي تجريبي",
            assignedHallId: null
        });
        
        batch.set(doc(db, "users", "path_organizer"), {
            pass: "1234",
            role: "منظم_مسار",
            fullName: "منظم مسار تجريبي",
            assignedHallId: null
        });
        
        batch.set(doc(db, "users", "viewer"), {
            pass: "1234",
            role: "عارض",
            fullName: "عارض تجريبي",
            assignedHallId: null
        });
        
        // إنشاء الإعدادات
        batch.set(doc(db, "settings", "global_config"), {
            served_count: 0,
            outdoor_queue: 0
        });
        
        // إنشاء قاعات انتظار
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
        
        // إنشاء قاعات مقابلات
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
        alert('حدث خطأ في التهيئة: ' + e.message);
    }
};

// Modal Functions
window.openModal = (id) => document.getElementById(id)?.classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id)?.classList.add('hidden');

</script>

</body>
</html>
