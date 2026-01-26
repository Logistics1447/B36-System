// ============================================
// DASHBOARD COMMAND CENTER - لوحة التحكم المتقدمة
// ============================================
// هذا الملف يحتوي على Dashboard متقدم يشمل:
// 1. KPI Ribbon (مؤشرات الأداء الرئيسية)
// 2. Heatmap Grid (خريطة حرارية للقاعات)
// 3. Flow View (مخطط التدفق)
// 4. Alerts Panel (لوحة التنبيهات)
// 5. Task Inbox (صندوق المهام حسب الدور)

import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============================================
// RENDER COMMAND CENTER
// ============================================

async function renderCommandCenter(db, currentUser, halls, requests) {
  const container = document.getElementById('mainContent');
  
  // حساب KPIs
  const kpis = await calculateKPIs(db, halls, requests);
  
  // حساب التنبيهات
  const alerts = calculateAlerts(halls, requests);
  
  // حساب المهام
  const tasks = calculateTasks(currentUser, requests);
  
  let html = `
    <div class="max-w-full mx-auto p-6 space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-3xl font-bold text-slate-800 dark:text-white mb-2">
            <i class="ph ph-command text-blue-600"></i>
            مركز القيادة
          </h1>
          <p class="text-slate-600 dark:text-slate-400">
            لوحة تحكم شاملة لمراقبة وإدارة تدفق المرشحين
          </p>
        </div>
        <button onclick="refreshDashboard()" class="btn-secondary">
          <i class="ph ph-arrows-clockwise"></i>
          تحديث
        </button>
      </div>
      
      <!-- KPI Ribbon -->
      ${renderKPIRibbon(kpis)}
      
      <!-- Main Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Left Column: Heatmap + Flow -->
        <div class="lg:col-span-2 space-y-6">
          ${renderHeatmapGrid(halls)}
          ${renderFlowView(kpis)}
        </div>
        
        <!-- Right Column: Alerts + Tasks -->
        <div class="space-y-6">
          ${renderAlertsPanel(alerts)}
          ${renderTaskInbox(currentUser, tasks)}
        </div>
      </div>
    </div>
  `;
  
  container.innerHTML = html;
  
  // رسم الرسوم البيانية
  await drawSparklines(halls);
  await drawFlowDiagram(kpis);
}

// ============================================
// KPI RIBBON
// ============================================

async function calculateKPIs(db, halls, requests) {
  // حساب العدد الخارجي
  const systemStateRef = doc(db, 'systemState', 'global');
  const systemStateSnap = await getDoc(systemStateRef);
  const outsideCount = systemStateSnap.exists() ? systemStateSnap.data().currentOutsideCount : 0;
  
  // حساب إجمالي الداخل
  const totalInside = halls.reduce((sum, hall) => sum + hall.currentCount, 0);
  
  // حساب المتبقي
  const totalCapacity = halls.reduce((sum, hall) => sum + hall.capacity, 0);
  const totalRemainingCapacity = totalCapacity - totalInside;
  
  // حساب Throughput (آخر 30 و 60 دقيقة)
  const now = new Date();
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const sixtyMinAgo = new Date(now.getTime() - 60 * 60 * 1000);
  
  const closedRequests = requests.filter(r => r.status === 'closed');
  const throughput30min = closedRequests.filter(r => 
    r.timestamps.closedAt && r.timestamps.closedAt.toDate() >= thirtyMinAgo
  ).reduce((sum, r) => sum + (r.confirmationDetails.actualArrivedCount || 0), 0);
  
  const throughput60min = closedRequests.filter(r => 
    r.timestamps.closedAt && r.timestamps.closedAt.toDate() >= sixtyMinAgo
  ).reduce((sum, r) => sum + (r.confirmationDetails.actualArrivedCount || 0), 0);
  
  // حساب نسبة Mismatch
  const confirmedRequests = closedRequests.filter(r => r.confirmationDetails.delta !== null);
  const mismatchCount = confirmedRequests.filter(r => r.confirmationDetails.delta !== 0).length;
  const mismatchRate = confirmedRequests.length > 0 
    ? (mismatchCount / confirmedRequests.length) * 100 
    : 0;
  
  return {
    outsideCount,
    totalInside,
    totalRemainingCapacity,
    throughput30min,
    throughput60min,
    mismatchRate
  };
}

function renderKPIRibbon(kpis) {
  const kpiItems = [
    {
      label: 'خارج المبنى',
      value: kpis.outsideCount,
      icon: 'ph-users',
      color: 'from-blue-500 to-blue-600',
      textColor: 'text-blue-600'
    },
    {
      label: 'داخل المبنى',
      value: kpis.totalInside,
      icon: 'ph-building',
      color: 'from-green-500 to-green-600',
      textColor: 'text-green-600'
    },
    {
      label: 'الطاقة المتبقية',
      value: kpis.totalRemainingCapacity,
      icon: 'ph-battery-charging',
      color: 'from-purple-500 to-purple-600',
      textColor: 'text-purple-600'
    },
    {
      label: 'التدفق (30 دقيقة)',
      value: kpis.throughput30min,
      icon: 'ph-arrow-right',
      color: 'from-orange-500 to-orange-600',
      textColor: 'text-orange-600'
    },
    {
      label: 'التدفق (60 دقيقة)',
      value: kpis.throughput60min,
      icon: 'ph-arrow-right',
      color: 'from-yellow-500 to-yellow-600',
      textColor: 'text-yellow-600'
    },
    {
      label: 'نسبة الفروقات',
      value: kpis.mismatchRate.toFixed(1) + '%',
      icon: 'ph-warning',
      color: 'from-red-500 to-red-600',
      textColor: 'text-red-600'
    }
  ];
  
  return `
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      ${kpiItems.map(kpi => `
        <div class="bg-gradient-to-br ${kpi.color} rounded-xl shadow-lg p-6 text-white">
          <div class="flex items-center justify-between mb-2">
            <i class="${kpi.icon} text-3xl opacity-80"></i>
          </div>
          <div class="text-3xl font-bold mb-1">${kpi.value}</div>
          <div class="text-sm opacity-90">${kpi.label}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================
// HEATMAP GRID
// ============================================

function renderHeatmapGrid(halls) {
  return `
    <div class="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
      <h2 class="text-xl font-bold text-slate-800 dark:text-white mb-4">
        <i class="ph ph-grid-four text-blue-600"></i>
        خريطة القاعات الحرارية
      </h2>
      
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        ${halls.map(hall => renderHallTile(hall)).join('')}
      </div>
    </div>
  `;
}

function renderHallTile(hall) {
  const occupancyRate = (hall.currentCount / hall.capacity) * 100;
  
  let bgColor = 'bg-green-100 dark:bg-green-900/30 border-green-500';
  let textColor = 'text-green-700 dark:text-green-300';
  let icon = 'ph-arrow-up';
  
  if (occupancyRate >= 90) {
    bgColor = 'bg-red-100 dark:bg-red-900/30 border-red-500';
    textColor = 'text-red-700 dark:text-red-300';
    icon = 'ph-warning';
  } else if (occupancyRate >= 70) {
    bgColor = 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-500';
    textColor = 'text-yellow-700 dark:text-yellow-300';
    icon = 'ph-arrow-up';
  }
  
  const remaining = hall.capacity - hall.currentCount;
  
  return `
    <div 
      class="${bgColor} border-2 rounded-xl p-4 cursor-pointer hover:shadow-lg transition-all"
      onclick="showHallDrawer('${hall.id}')"
    >
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm font-bold ${textColor}">${hall.name}</span>
        <i class="${icon} ${textColor}"></i>
      </div>
      
      <div class="text-2xl font-bold ${textColor} mb-1">
        ${hall.currentCount}/${hall.capacity}
      </div>
      
      <div class="text-xs ${textColor} opacity-75 mb-2">
        متبقي: ${remaining}
      </div>
      
      <!-- Sparkline Placeholder -->
      <canvas id="sparkline_${hall.id}" width="120" height="30" class="w-full"></canvas>
      
      <div class="text-xs ${textColor} opacity-75 mt-2">
        ${occupancyRate.toFixed(0)}% ممتلئ
      </div>
    </div>
  `;
}

async function drawSparklines(halls) {
  // رسم Sparklines بسيطة لكل قاعة (محاكاة بيانات آخر 60 دقيقة)
  for (const hall of halls) {
    const canvas = document.getElementById(`sparkline_${hall.id}`);
    if (!canvas) continue;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // توليد بيانات عشوائية للتجربة (في الواقع يجب جلبها من Firestore)
    const dataPoints = 12; // 12 نقطة (كل 5 دقائق)
    const data = Array.from({ length: dataPoints }, () => 
      Math.random() * hall.capacity
    );
    
    // رسم الخط
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = getComputedStyle(canvas).color || '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    const stepX = width / (dataPoints - 1);
    const maxValue = Math.max(...data, hall.capacity);
    
    data.forEach((value, index) => {
      const x = index * stepX;
      const y = height - (value / maxValue) * height;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
  }
}

// ============================================
// FLOW VIEW
// ============================================

function renderFlowView(kpis) {
  return `
    <div class="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
      <h2 class="text-xl font-bold text-slate-800 dark:text-white mb-4">
        <i class="ph ph-flow-arrow text-blue-600"></i>
        مخطط التدفق
      </h2>
      
      <canvas id="flowDiagram" width="800" height="300" class="w-full"></canvas>
    </div>
  `;
}

async function drawFlowDiagram(kpis) {
  // رسم مخطط تدفق مبسط (Sankey-like)
  const canvas = document.getElementById('flowDiagram');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  
  ctx.clearRect(0, 0, width, height);
  
  // الألوان
  const colorOutside = '#3b82f6'; // أزرق
  const colorWaiting = '#10b981'; // أخضر
  const colorInterview = '#8b5cf6'; // بنفسجي
  
  // المواقع
  const outsideX = 100;
  const waitingX = 400;
  const interviewX = 700;
  const centerY = height / 2;
  
  // رسم الصناديق
  const boxWidth = 120;
  const boxHeight = 80;
  
  // Outside
  ctx.fillStyle = colorOutside;
  ctx.fillRect(outsideX - boxWidth/2, centerY - boxHeight/2, boxWidth, boxHeight);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('خارج المبنى', outsideX, centerY - 10);
  ctx.fillText(kpis.outsideCount.toString(), outsideX, centerY + 15);
  
  // Waiting
  ctx.fillStyle = colorWaiting;
  ctx.fillRect(waitingX - boxWidth/2, centerY - boxHeight/2, boxWidth, boxHeight);
  ctx.fillStyle = '#fff';
  ctx.fillText('قاعات الانتظار', waitingX, centerY - 10);
  ctx.fillText(Math.floor(kpis.totalInside * 0.6).toString(), waitingX, centerY + 15);
  
  // Interview
  ctx.fillStyle = colorInterview;
  ctx.fillRect(interviewX - boxWidth/2, centerY - boxHeight/2, boxWidth, boxHeight);
  ctx.fillStyle = '#fff';
  ctx.fillText('قاعات المقابلات', interviewX, centerY - 10);
  ctx.fillText(Math.floor(kpis.totalInside * 0.4).toString(), interviewX, centerY + 15);
  
  // رسم الأسهم
  const arrowWidth = 20;
  
  // Outside → Waiting
  ctx.strokeStyle = colorOutside;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(outsideX + boxWidth/2, centerY);
  ctx.lineTo(waitingX - boxWidth/2, centerY);
  ctx.stroke();
  
  // Waiting → Interview
  ctx.strokeStyle = colorWaiting;
  ctx.beginPath();
  ctx.moveTo(waitingX + boxWidth/2, centerY);
  ctx.lineTo(interviewX - boxWidth/2, centerY);
  ctx.stroke();
  
  // معدلات التدفق
  ctx.fillStyle = '#64748b';
  ctx.font = '14px Arial';
  ctx.fillText(`${kpis.throughput30min}/30دق`, (outsideX + waitingX) / 2, centerY - 20);
  ctx.fillText(`${Math.floor(kpis.throughput30min * 0.6)}/30دق`, (waitingX + interviewX) / 2, centerY - 20);
}

// ============================================
// ALERTS PANEL
// ============================================

function calculateAlerts(halls, requests) {
  const alerts = [];
  
  // تنبيهات القاعات القريبة من الامتلاء
  for (const hall of halls) {
    const occupancyRate = (hall.currentCount / hall.capacity) * 100;
    if (occupancyRate >= 90) {
      alerts.push({
        type: 'error',
        icon: 'ph-warning',
        message: `قاعة "${hall.name}" امتلأت بنسبة ${occupancyRate.toFixed(0)}%`
      });
    } else if (occupancyRate >= 70) {
      alerts.push({
        type: 'warning',
        icon: 'ph-warning-circle',
        message: `قاعة "${hall.name}" قريبة من الامتلاء (${occupancyRate.toFixed(0)}%)`
      });
    }
  }
  
  // تنبيهات الطلبات المعلقة
  const now = new Date();
  const pendingRequests = requests.filter(r => r.status === 'pending');
  for (const request of pendingRequests) {
    const submittedAt = request.timestamps.submittedAt?.toDate();
    if (submittedAt) {
      const minutesAgo = (now - submittedAt) / (1000 * 60);
      if (minutesAgo > 30) {
        alerts.push({
          type: 'warning',
          icon: 'ph-clock',
          message: `طلب #${request.id.substring(0, 8)} معلق منذ ${Math.floor(minutesAgo)} دقيقة`
        });
      }
    }
  }
  
  // تنبيهات النقل المتعثر
  const inTransitRequests = requests.filter(r => r.status === 'in_transit');
  for (const request of inTransitRequests) {
    const transitStartedAt = request.timestamps.transitStartedAt?.toDate();
    if (transitStartedAt) {
      const minutesAgo = (now - transitStartedAt) / (1000 * 60);
      if (minutesAgo > 15) {
        alerts.push({
          type: 'error',
          icon: 'ph-warning-octagon',
          message: `نقل متعثر: طلب #${request.id.substring(0, 8)} في الطريق منذ ${Math.floor(minutesAgo)} دقيقة`
        });
      }
    }
  }
  
  return alerts.slice(0, 10); // أول 10 تنبيهات
}

function renderAlertsPanel(alerts) {
  return `
    <div class="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
      <h2 class="text-xl font-bold text-slate-800 dark:text-white mb-4">
        <i class="ph ph-bell text-red-600"></i>
        التنبيهات
        ${alerts.length > 0 ? `<span class="text-sm font-normal text-red-600">(${alerts.length})</span>` : ''}
      </h2>
      
      ${alerts.length === 0 ? `
        <div class="text-center py-8 text-slate-500 dark:text-slate-400">
          <i class="ph ph-check-circle text-4xl text-green-500 mb-2"></i>
          <p>لا توجد تنبيهات</p>
        </div>
      ` : `
        <div class="space-y-2 max-h-96 overflow-y-auto">
          ${alerts.map(alert => `
            <div class="flex items-start gap-3 p-3 rounded-lg ${
              alert.type === 'error' ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' :
              alert.type === 'warning' ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800' :
              'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
            }">
              <i class="${alert.icon} text-xl ${
                alert.type === 'error' ? 'text-red-600' :
                alert.type === 'warning' ? 'text-yellow-600' :
                'text-blue-600'
              }"></i>
              <p class="text-sm ${
                alert.type === 'error' ? 'text-red-700 dark:text-red-300' :
                alert.type === 'warning' ? 'text-yellow-700 dark:text-yellow-300' :
                'text-blue-700 dark:text-blue-300'
              }">${alert.message}</p>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;
}

// ============================================
// TASK INBOX
// ============================================

function calculateTasks(user, requests) {
  const tasks = [];
  
  if (user.role === 'ExternalSupervisor') {
    // طلبات outside→waiting بانتظار قبول
    const pendingRequests = requests.filter(r => 
      r.requestType === 'outside_to_waiting' && 
      r.status === 'pending'
    );
    tasks.push(...pendingRequests.map(r => ({
      type: 'accept',
      request: r,
      message: `قبول طلب نقل ${r.requestedCount} مرشح إلى ${r.toHall.hallName}`
    })));
  }
  
  if (user.isPathOrganizer) {
    // مهام النقل المكلف بها
    const assignedRequests = requests.filter(r => 
      r.assignees.pathOrganizer?.userId === user.id &&
      r.status === 'accepted'
    );
    tasks.push(...assignedRequests.map(r => ({
      type: 'transit',
      request: r,
      message: `بدء نقل ${r.requestedCount} مرشح من ${r.fromHall.hallName} إلى ${r.toHall.hallName}`
    })));
  }
  
  if (user.role === 'InternalRegular' || user.role === 'InternalSupervisor') {
    // مهام مصادقة الوصول
    const arrivedRequests = requests.filter(r => 
      r.status === 'in_transit' &&
      (user.role === 'InternalSupervisor' || r.assignees.assignedTo?.userId === user.id)
    );
    tasks.push(...arrivedRequests.map(r => ({
      type: 'confirm',
      request: r,
      message: `مصادقة وصول ${r.requestedCount} مرشح إلى ${r.toHall.hallName}`
    })));
  }
  
  return tasks.slice(0, 10); // أول 10 مهام
}

function renderTaskInbox(user, tasks) {
  return `
    <div class="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
      <h2 class="text-xl font-bold text-slate-800 dark:text-white mb-4">
        <i class="ph ph-tray text-blue-600"></i>
        صندوق المهام
        ${tasks.length > 0 ? `<span class="text-sm font-normal text-blue-600">(${tasks.length})</span>` : ''}
      </h2>
      
      ${tasks.length === 0 ? `
        <div class="text-center py-8 text-slate-500 dark:text-slate-400">
          <i class="ph ph-check-circle text-4xl text-green-500 mb-2"></i>
          <p>لا توجد مهام معلقة</p>
        </div>
      ` : `
        <div class="space-y-3 max-h-96 overflow-y-auto">
          ${tasks.map(task => `
            <div class="p-4 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600">
              <p class="text-sm text-slate-700 dark:text-slate-300 mb-3">${task.message}</p>
              <button 
                onclick="handleTask('${task.type}', '${task.request.id}')"
                class="btn-primary w-full text-sm"
              >
                ${task.type === 'accept' ? 'قبول' : task.type === 'transit' ? 'بدء النقل' : 'مصادقة'}
              </button>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;
}

// ============================================
// HALL DRAWER
// ============================================

window.showHallDrawer = async (hallId) => {
  // عرض Drawer بتفاصيل القاعة
  const hall = halls.find(h => h.id === hallId);
  if (!hall) return;
  
  // جلب آخر الطلبات المتعلقة بالقاعة
  const relatedRequests = requests.filter(r => 
    r.toHall.hallId === hallId || r.fromHall?.hallId === hallId
  ).slice(0, 5);
  
  const drawer = document.createElement('div');
  drawer.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-50';
  drawer.innerHTML = `
    <div class="bg-white dark:bg-slate-800 rounded-t-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[80vh] overflow-y-auto">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-2xl font-bold text-slate-800 dark:text-white">${hall.name}</h3>
        <button onclick="this.closest('.fixed').remove()" class="text-slate-500 hover:text-slate-700">
          <i class="ph ph-x text-2xl"></i>
        </button>
      </div>
      
      <div class="space-y-4">
        <div class="grid grid-cols-3 gap-4">
          <div class="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div class="text-3xl font-bold text-blue-600">${hall.currentCount}</div>
            <div class="text-sm text-slate-600 dark:text-slate-400">العدد الحالي</div>
          </div>
          <div class="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div class="text-3xl font-bold text-green-600">${hall.capacity - hall.currentCount}</div>
            <div class="text-sm text-slate-600 dark:text-slate-400">المتبقي</div>
          </div>
          <div class="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <div class="text-3xl font-bold text-purple-600">${hall.capacity}</div>
            <div class="text-sm text-slate-600 dark:text-slate-400">السعة</div>
          </div>
        </div>
        
        <div class="border-t border-slate-200 dark:border-slate-700 pt-4">
          <h4 class="font-bold text-slate-800 dark:text-white mb-3">آخر الطلبات</h4>
          ${relatedRequests.length === 0 ? `
            <p class="text-sm text-slate-500 dark:text-slate-400">لا توجد طلبات حديثة</p>
          ` : `
            <div class="space-y-2">
              ${relatedRequests.map(r => `
                <div class="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg text-sm">
                  <div class="font-bold">${r.requestType === 'outside_to_waiting' ? 'خارج → انتظار' : r.requestType === 'waiting_to_interview' ? 'انتظار → مقابلات' : 'مقابلات → مقابلات'}</div>
                  <div class="text-slate-600 dark:text-slate-400">${r.requestedCount} مرشح - ${r.status}</div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(drawer);
};

// ============================================
// TASK HANDLER
// ============================================

window.handleTask = async (taskType, requestId) => {
  // معالجة المهمة
  console.log(`Handling task: ${taskType} for request ${requestId}`);
  // TODO: استدعاء الوظائف المناسبة من backend-api.js
};

// ============================================
// REFRESH DASHBOARD
// ============================================

window.refreshDashboard = async () => {
  showToast('جاري تحديث البيانات...', 'info');
  // TODO: إعادة جلب البيانات وإعادة رسم الداشبورد
};

// ============================================
// EXPORTS
// ============================================

export {
  renderCommandCenter,
  calculateKPIs
};
