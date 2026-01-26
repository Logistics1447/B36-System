// ============================================
// HALL CONTROL UI - واجهة التحكم بالقاعات مع عداد يدوي
// ============================================
// هذا الملف يحتوي على واجهة Hall Control التي تسمح بـ:
// 1. عرض القاعات مع أعدادها الحالية
// 2. عداد يدوي (Draft → Commit)
// 3. طلب سبب عند التعديلات الكبيرة
// 4. تطبيق صلاحيات Hall Scope

import { commitHallCount, canActOnHall, PERMISSIONS, hasPermission } from './backend-api.js';

// ============================================
// STATE
// ============================================

let hallDrafts = {}; // { hallId: draftCount }

// ============================================
// RENDER HALL CONTROL VIEW
// ============================================

function renderHallControlView(db, currentUser, halls) {
  const container = document.getElementById('mainContent');
  
  let html = `
    <div class="max-w-7xl mx-auto p-6">
      <div class="mb-6">
        <h1 class="text-3xl font-bold text-slate-800 dark:text-white mb-2">
          <i class="ph ph-buildings text-blue-600"></i>
          التحكم بالقاعات
        </h1>
        <p class="text-slate-600 dark:text-slate-400">
          استخدم العداد اليدوي لتحديث أعداد المرشحين في القاعات
        </p>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  `;
  
  for (const hall of halls) {
    const canEdit = canActOnHallSync(currentUser, hall.id);
    html += renderHallCard(hall, canEdit);
  }
  
  html += `
      </div>
    </div>
  `;
  
  container.innerHTML = html;
  
  // تهيئة الـ drafts
  for (const hall of halls) {
    hallDrafts[hall.id] = hall.currentCount;
  }
}

// ============================================
// RENDER HALL CARD
// ============================================

function renderHallCard(hall, canEdit) {
  const occupancyRate = (hall.currentCount / hall.capacity) * 100;
  const remaining = hall.capacity - hall.currentCount;
  
  let occupancyColor = 'bg-green-500';
  if (occupancyRate >= 90) occupancyColor = 'bg-red-500';
  else if (occupancyRate >= 70) occupancyColor = 'bg-yellow-500';
  
  const draftCount = hallDrafts[hall.id] || hall.currentCount;
  const hasChanges = draftCount !== hall.currentCount;
  
  return `
    <div class="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 border-2 ${hasChanges ? 'border-blue-500' : 'border-slate-200 dark:border-slate-700'}">
      <!-- Header -->
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-xl font-bold text-slate-800 dark:text-white">
          ${hall.name}
        </h3>
        <span class="px-3 py-1 rounded-full text-sm font-bold ${hall.type === 'waiting' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}">
          ${hall.type === 'waiting' ? 'انتظار' : 'مقابلات'}
        </span>
      </div>
      
      <!-- Current Stats -->
      <div class="mb-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm text-slate-600 dark:text-slate-400">العدد الحالي</span>
          <span class="text-2xl font-bold text-slate-800 dark:text-white">${hall.currentCount}</span>
        </div>
        
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm text-slate-600 dark:text-slate-400">المتبقي</span>
          <span class="text-lg font-bold ${remaining > 10 ? 'text-green-600' : 'text-red-600'}">${remaining}</span>
        </div>
        
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm text-slate-600 dark:text-slate-400">السعة</span>
          <span class="text-lg font-bold text-slate-600 dark:text-slate-400">${hall.capacity}</span>
        </div>
        
        <!-- Progress Bar -->
        <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 mt-3">
          <div class="${occupancyColor} h-3 rounded-full transition-all" style="width: ${Math.min(occupancyRate, 100)}%"></div>
        </div>
        <div class="text-center text-sm text-slate-600 dark:text-slate-400 mt-1">
          ${occupancyRate.toFixed(1)}% ممتلئ
        </div>
      </div>
      
      ${canEdit ? `
        <!-- Manual Counter -->
        <div class="border-t border-slate-200 dark:border-slate-700 pt-4 mb-4">
          <label class="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
            عداد يدوي:
          </label>
          <div class="flex items-center gap-2">
            <button 
              onclick="decrementHall('${hall.id}')" 
              class="btn-secondary px-4 py-2 text-xl font-bold"
            >
              -1
            </button>
            <input 
              type="number" 
              id="draft_${hall.id}" 
              value="${draftCount}" 
              onchange="updateDraft('${hall.id}', this.value)"
              class="flex-1 text-center text-2xl font-bold border-2 border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
            />
            <button 
              onclick="incrementHall('${hall.id}')" 
              class="btn-secondary px-4 py-2 text-xl font-bold"
            >
              +1
            </button>
          </div>
        </div>
        
        <!-- Commit Buttons -->
        ${hasChanges ? `
          <div class="flex gap-2">
            <button 
              onclick="commitHall('${hall.id}')" 
              class="btn-primary flex-1"
            >
              <i class="ph ph-check-circle"></i>
              اعتماد العدد
            </button>
            <button 
              onclick="cancelDraft('${hall.id}')" 
              class="btn-secondary"
            >
              <i class="ph ph-x-circle"></i>
              إلغاء
            </button>
          </div>
        ` : `
          <div class="text-center text-sm text-slate-500 dark:text-slate-400">
            <i class="ph ph-check-circle text-green-500"></i>
            العدد محدث
          </div>
        `}
      ` : `
        <div class="border-t border-slate-200 dark:border-slate-700 pt-4 text-center text-sm text-slate-500 dark:text-slate-400">
          <i class="ph ph-lock text-slate-400"></i>
          ليس لديك صلاحية للتعديل
        </div>
      `}
      
      <!-- Last Update Info -->
      ${hall.lastCommittedBy ? `
        <div class="border-t border-slate-200 dark:border-slate-700 pt-3 mt-3 text-xs text-slate-500 dark:text-slate-400">
          <div>آخر تحديث: ${formatTimestamp(hall.lastCommittedAt)}</div>
          <div>بواسطة: ${hall.lastCommittedBy.userName}</div>
        </div>
      ` : ''}
    </div>
  `;
}

// ============================================
// COUNTER ACTIONS
// ============================================

window.incrementHall = (hallId) => {
  const input = document.getElementById(`draft_${hallId}`);
  const currentValue = parseInt(input.value) || 0;
  input.value = currentValue + 1;
  updateDraft(hallId, input.value);
};

window.decrementHall = (hallId) => {
  const input = document.getElementById(`draft_${hallId}`);
  const currentValue = parseInt(input.value) || 0;
  if (currentValue > 0) {
    input.value = currentValue - 1;
    updateDraft(hallId, input.value);
  }
};

window.updateDraft = (hallId, value) => {
  const newValue = parseInt(value) || 0;
  hallDrafts[hallId] = newValue;
  
  // إعادة رسم البطاقة
  refreshHallCard(hallId);
};

window.cancelDraft = (hallId) => {
  const hall = halls.find(h => h.id === hallId);
  if (hall) {
    hallDrafts[hallId] = hall.currentCount;
    document.getElementById(`draft_${hallId}`).value = hall.currentCount;
    refreshHallCard(hallId);
  }
};

// ============================================
// COMMIT HALL COUNT
// ============================================

window.commitHall = async (hallId) => {
  const hall = halls.find(h => h.id === hallId);
  if (!hall) return;
  
  const newCount = hallDrafts[hallId];
  const oldCount = hall.currentCount;
  const delta = Math.abs(newCount - oldCount);
  
  // التحقق من الحاجة لسبب
  let reason = null;
  if (delta > 5 || newCount < oldCount || newCount > hall.capacity) {
    reason = await promptForReason(newCount, oldCount, hall.capacity);
    if (!reason) {
      showToast('يجب إدخال سبب للتعديل', 'error');
      return;
    }
  }
  
  // تأكيد
  const confirmed = await showConfirmDialog(
    'تأكيد الاعتماد',
    `هل أنت متأكد من اعتماد العدد الجديد (${newCount}) للقاعة "${hall.name}"؟`
  );
  
  if (!confirmed) return;
  
  // تنفيذ الـ Commit
  try {
    showLoading(true);
    await commitHallCount(db, currentUser, hallId, newCount, reason);
    showToast('تم اعتماد العدد بنجاح', 'success');
    
    // تحديث البيانات المحلية
    hall.currentCount = newCount;
    hall.draftCount = newCount;
    hall.lastCommittedBy = {
      userId: currentUser.id,
      userName: currentUser.name
    };
    hall.lastCommittedAt = new Date();
    
    // إعادة رسم البطاقة
    refreshHallCard(hallId);
  } catch (error) {
    console.error('Error committing hall count:', error);
    showToast(error.message || 'حدث خطأ أثناء اعتماد العدد', 'error');
  } finally {
    showLoading(false);
  }
};

// ============================================
// PROMPT FOR REASON
// ============================================

async function promptForReason(newCount, oldCount, capacity) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
        <h3 class="text-xl font-bold text-slate-800 dark:text-white mb-4">
          <i class="ph ph-warning text-yellow-500"></i>
          يُرجى إدخال السبب
        </h3>
        
        <div class="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <p class="text-sm text-slate-700 dark:text-slate-300">
            ${newCount > capacity ? '⚠️ تجاوز السعة القصوى' : ''}
            ${Math.abs(newCount - oldCount) > 5 ? '⚠️ تعديل كبير (أكثر من 5)' : ''}
            ${newCount < oldCount ? '⚠️ تخفيض العدد' : ''}
          </p>
          <p class="text-sm text-slate-600 dark:text-slate-400 mt-2">
            العدد القديم: <strong>${oldCount}</strong> → العدد الجديد: <strong>${newCount}</strong>
          </p>
        </div>
        
        <textarea 
          id="reasonInput" 
          placeholder="اكتب السبب هنا..."
          class="w-full border-2 border-slate-300 dark:border-slate-600 rounded-lg px-4 py-3 bg-white dark:bg-slate-700 text-slate-800 dark:text-white mb-4 resize-none"
          rows="4"
        ></textarea>
        
        <div class="flex gap-2">
          <button id="submitReason" class="btn-primary flex-1">
            <i class="ph ph-check"></i>
            تأكيد
          </button>
          <button id="cancelReason" class="btn-secondary">
            <i class="ph ph-x"></i>
            إلغاء
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const reasonInput = modal.querySelector('#reasonInput');
    reasonInput.focus();
    
    modal.querySelector('#submitReason').onclick = () => {
      const reason = reasonInput.value.trim();
      if (!reason) {
        showToast('يجب إدخال السبب', 'error');
        return;
      }
      document.body.removeChild(modal);
      resolve(reason);
    };
    
    modal.querySelector('#cancelReason').onclick = () => {
      document.body.removeChild(modal);
      resolve(null);
    };
  });
}

// ============================================
// HELPERS
// ============================================

function canActOnHallSync(user, hallId) {
  // نسخة مبسطة من canActOnHall للاستخدام في الواجهة
  if (user.role === 'Admin') return true;
  if (user.role === 'InternalSupervisor') return true;
  if (user.role === 'InternalRegular') {
    // التحقق من التعيين (يجب تحميله مسبقاً)
    return hallAssignments.some(a => a.userId === user.id && a.hallId === hallId);
  }
  return false;
}

function refreshHallCard(hallId) {
  // إعادة رسم البطاقة بعد التحديث
  const hall = halls.find(h => h.id === hallId);
  if (!hall) return;
  
  const canEdit = canActOnHallSync(currentUser, hallId);
  const cardHTML = renderHallCard(hall, canEdit);
  
  // استبدال البطاقة القديمة
  const cards = document.querySelectorAll('.grid > div');
  const index = halls.findIndex(h => h.id === hallId);
  if (cards[index]) {
    cards[index].outerHTML = cardHTML;
  }
}

function formatTimestamp(timestamp) {
  if (!timestamp) return 'غير محدد';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function showConfirmDialog(title, message) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
        <h3 class="text-xl font-bold text-slate-800 dark:text-white mb-4">${title}</h3>
        <p class="text-slate-600 dark:text-slate-400 mb-6">${message}</p>
        <div class="flex gap-2">
          <button id="confirmYes" class="btn-primary flex-1">نعم</button>
          <button id="confirmNo" class="btn-secondary flex-1">لا</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('#confirmYes').onclick = () => {
      document.body.removeChild(modal);
      resolve(true);
    };
    
    modal.querySelector('#confirmNo').onclick = () => {
      document.body.removeChild(modal);
      resolve(false);
    };
  });
}

function showLoading(show) {
  // عرض/إخفاء مؤشر التحميل
  let loader = document.getElementById('globalLoader');
  if (show) {
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'globalLoader';
      loader.className = 'fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50';
      loader.innerHTML = '<div class="animate-spin rounded-full h-16 w-16 border-t-4 border-blue-500"></div>';
      document.body.appendChild(loader);
    }
  } else {
    if (loader) {
      document.body.removeChild(loader);
    }
  }
}

function showToast(message, type = 'info') {
  // عرض إشعار
  const toast = document.createElement('div');
  toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 ${
    type === 'success' ? 'bg-green-500' : 
    type === 'error' ? 'bg-red-500' : 
    'bg-blue-500'
  } text-white font-bold`;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    document.body.removeChild(toast);
  }, 3000);
}

// ============================================
// EXPORTS
// ============================================

export {
  renderHallControlView,
  hallDrafts
};
