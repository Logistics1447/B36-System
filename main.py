"""
B36 Hall Management System - v27 Production ⚡
==============================================
نظام إدارة القاعات اللوجستية
Powered by Streamlit & Supabase
التصميم الأصلي v27 + Session State Management
مُحسّن للأداء الفائق 🚀
"""

import streamlit as st
import os
from datetime import datetime
import pandas as pd
import plotly.graph_objects as go
from database import get_database, init_session_state

# تحميل المتغيرات البيئية (مرة واحدة)
try:
    from dotenv import load_dotenv
    load_dotenv()
except:
    pass

# تهيئة Session State (مرة واحدة فقط)
init_session_state()

# إعدادات الصفحة للأداء الأمثل
st.set_page_config(
    page_title="B36 System v27 ⚡",
    page_icon="🏛️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# ==================== CSS - التصميم الأصلي v27 ====================
st.markdown("""
<style>
    /* الخط الأصلي - Alexandria */
    @import url('https://fonts.googleapis.com/css2?family=Alexandria:wght@300;400;600;800&display=swap');
    
    * {
        font-family: 'Alexandria', sans-serif !important;
    }
    
    /* ألوان B36 الأصلية - Calm Color Palette */
    :root {
        --color-primary: #6B9AC4;
        --color-secondary: #8BA888;
        --color-accent: #D4A574;
        --color-warning: #E8A87C;
        --color-danger: #C97C7C;
        --color-success: #88B2AC;
        --color-info: #9DB4C0;
        --color-purple: #B8A4C9;
    }
    
    /* إخفاء عناصر Streamlit */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    header {visibility: hidden;}
    
    .main {
        background-color: #f8fafc;
        padding: 2rem;
    }
    
    /* Sidebar - التصميم الأصلي الأبيض */
    [data-testid="stSidebar"] {
        background: white;
        border-left: 1px solid #e2e8f0;
        box-shadow: 2px 0 10px rgba(0,0,0,0.05);
    }
    
    [data-testid="stSidebar"] > div:first-child {
        padding-top: 1rem;
    }
    
    [data-testid="stSidebar"] h2 {
        font-size: 1.25rem !important;
        font-weight: 800 !important;
        color: #1e293b !important;
        margin-bottom: 0.25rem !important;
    }
    
    [data-testid="stSidebar"] h3 {
        font-size: 0.75rem !important;
        color: #94a3b8 !important;
        font-weight: 400 !important;
    }
    
    /* أزرار Sidebar */
    [data-testid="stSidebar"] .stButton > button {
        width: 100%;
        text-align: right;
        padding: 0.75rem 1rem;
        border-radius: 12px;
        font-weight: 600;
        font-size: 0.875rem;
        color: #64748b !important;
        background: transparent;
        border: none;
        transition: all 0.2s;
    }
    
    [data-testid="stSidebar"] .stButton > button:hover {
        background: #f1f5f9;
        color: #1e293b !important;
    }
    
    /* KPI Cards - البطاقات الأفقية الأصلية */
    .kpi-container {
        display: flex;
        flex-wrap: wrap;
        background: white;
        border-radius: 12px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        padding: 1rem;
        gap: 1.5rem;
        justify-content: space-around;
        border: 1px solid #e2e8f0;
        margin-bottom: 2rem;
    }
    
    .kpi-item {
        text-align: center;
        padding: 0 1.5rem;
        border-right: 1px solid #e2e8f0;
    }
    
    .kpi-item:last-child {
        border-right: none;
    }
    
    .kpi-label {
        display: block;
        font-size: 0.75rem;
        color: #94a3b8;
        margin-bottom: 0.5rem;
        font-weight: 400;
    }
    
    .kpi-value {
        font-size: 1.75rem;
        font-weight: 800;
        display: block;
    }
    
    .kpi-primary { color: #6B9AC4; }
    .kpi-warning { color: #E8A87C; }
    .kpi-success { color: #88B2AC; }
    .kpi-purple { color: #B8A4C9; }
    .kpi-default { color: #64748b; }
    
    /* بطاقات القاعات */
    .hall-card {
        background: white;
        border-radius: 16px;
        padding: 1.5rem;
        border: 1px solid #e2e8f0;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        transition: all 0.3s;
        margin-bottom: 1rem;
    }
    
    .hall-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.12);
    }
    
    .hall-name {
        font-size: 1.125rem;
        font-weight: 700;
        color: #1e293b;
    }
    
    .hall-status {
        font-size: 0.75rem;
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        font-weight: 600;
    }
    
    .status-open {
        background: #dcfce7;
        color: #16a34a;
    }
    
    .status-paused {
        background: #fee2e2;
        color: #dc2626;
    }
    
    /* Progress bar */
    .progress-bar-container {
        width: 100%;
        height: 8px;
        background: #f1f5f9;
        border-radius: 9999px;
        overflow: hidden;
        margin: 1rem 0;
    }
    
    .progress-bar {
        height: 100%;
        transition: width 0.3s;
        border-radius: 9999px;
    }
    
    .progress-success { background: #88B2AC; }
    .progress-warning { background: #E8A87C; }
    .progress-danger { background: #C97C7C; }
    
    /* الأزرار */
    .stButton > button {
        border-radius: 12px;
        font-weight: 600;
        padding: 0.5rem 1rem;
        border: none;
        transition: all 0.2s;
        font-size: 0.875rem;
    }
    
    .stButton > button:hover {
        transform: translateY(-1px);
    }
    
    /* Input fields */
    .stTextInput > div > div > input,
    .stNumberInput > div > div > input {
        border-radius: 12px;
        border: 2px solid #e2e8f0;
        padding: 0.75rem;
        font-weight: 600;
        text-align: center;
        transition: all 0.2s;
    }
    
    .stTextInput > div > div > input:focus,
    .stNumberInput > div > div > input:focus {
        border-color: #6B9AC4;
        box-shadow: 0 0 0 3px rgba(107, 154, 196, 0.1);
    }
    
    /* الجداول */
    .dataframe {
        border-radius: 12px !important;
        border: 1px solid #e2e8f0 !important;
        overflow: hidden;
    }
    
    .dataframe thead tr th {
        background: #f8fafc !important;
        color: #64748b !important;
        font-weight: 700 !important;
        font-size: 0.875rem !important;
        padding: 1rem !important;
        border-bottom: 2px solid #e2e8f0 !important;
    }
    
    .dataframe tbody tr td {
        padding: 0.875rem !important;
        font-size: 0.875rem !important;
        border-bottom: 1px solid #f1f5f9 !important;
    }
    
    .dataframe tbody tr:hover {
        background: #f8fafc !important;
    }
</style>
""", unsafe_allow_html=True)

# ==================== Helper Functions ====================

def logout():
    """تسجيل الخروج"""
    st.session_state.logged_in = False
    st.session_state.user = None
    st.session_state.current_page = 'dashboard'
    st.rerun()

# ==================== Login Page ====================

def login_page():
    """صفحة تسجيل الدخول"""
    st.markdown("""
    <style>
        .login-container {
            max-width: 400px;
            margin: 6rem auto;
            padding: 2.5rem;
            background: white;
            border-radius: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            border: 1px solid #e2e8f0;
        }
        .login-title {
            text-align: center;
            font-size: 2.5rem;
            font-weight: 800;
            color: #1e293b;
            margin-bottom: 0.5rem;
        }
        .login-badge {
            text-align: center;
            font-size: 0.75rem;
            background: linear-gradient(135deg, #6B9AC4, #88B2AC);
            color: white;
            padding: 0.5rem 1rem;
            border-radius: 9999px;
            display: inline-block;
            margin: 1rem auto 2rem;
        }
        .developers {
            text-align: center;
            margin-top: 2rem;
            padding-top: 2rem;
            border-top: 1px solid #e2e8f0;
        }
        .dev-name {
            font-size: 0.875rem;
            color: #64748b;
            margin: 0.5rem 0;
        }
        .copyright {
            text-align: center;
            margin-top: 1.5rem;
            font-size: 0.75rem;
            color: #94a3b8;
        }
    </style>
    """, unsafe_allow_html=True)
    
    st.markdown('<div class="login-container">', unsafe_allow_html=True)
    st.markdown('<h1 class="login-title">B36 System</h1>', unsafe_allow_html=True)
    st.markdown('<div style="text-align: center;"><span class="login-badge">v27 Production</span></div>', unsafe_allow_html=True)
    
    with st.form("login_form"):
        username = st.text_input("اسم المستخدم", placeholder="admin")
        password = st.text_input("كلمة المرور", type="password", placeholder="••••")
        
        if st.form_submit_button("🔐 تسجيل الدخول", use_container_width=True):
            db = get_database()
            user = db.authenticate_user(username, password)
            
            if user:
                st.session_state.logged_in = True
                st.session_state.user = user
                st.session_state.current_page = 'dashboard'
                st.success("✅ تم تسجيل الدخول بنجاح!")
                st.rerun()
            else:
                st.error("❌ اسم المستخدم أو كلمة المرور غير صحيحة")
    
    st.markdown("""
    <div class="developers">
        <p style='font-weight: 700; color: #1e293b; margin-bottom: 1rem;'>فريق التطوير</p>
        <p class="dev-name">عبدالرحمن المالكي</p>
        <p class="dev-name">عبدالعزيز الأحمدي</p>
        <p class="dev-name">عبدالعزيز الذبياني</p>
    </div>
    <p class="copyright">Made with ❤️ 2026</p>
    """, unsafe_allow_html=True)
    
    st.markdown('</div>', unsafe_allow_html=True)

# ==================== Dashboard ====================

def show_dashboard():
    """لوحة التحكم الرئيسية"""
    st.markdown("<h1 style='margin-bottom: 2rem;'>🏠 لوحة التحكم</h1>", unsafe_allow_html=True)
    
    db = get_database()
    stats = db.get_statistics()
    
    # KPI Cards - التصميم الأفقي الأصلي
    st.markdown(f"""
    <div class="kpi-container">
        <div class="kpi-item">
            <span class="kpi-label">داخل المبنى</span>
            <span class="kpi-value kpi-primary">{stats.get('total_current', 0)}</span>
        </div>
        <div class="kpi-item">
            <span class="kpi-label">ينتظر خارجاً</span>
            <span class="kpi-value kpi-warning">{stats.get('outdoor_queue', 0)}</span>
        </div>
        <div class="kpi-item">
            <span class="kpi-label">الطاقة الكلية</span>
            <span class="kpi-value kpi-default">{stats.get('total_capacity', 0)}</span>
        </div>
        <div class="kpi-item">
            <span class="kpi-label">خدموا اليوم</span>
            <span class="kpi-value kpi-success">{stats.get('served_count', 0)}</span>
        </div>
        <div class="kpi-item">
            <span class="kpi-label">نسبة الإشغال</span>
            <span class="kpi-value kpi-purple">{stats.get('occupancy_rate', 0)}%</span>
        </div>
    </div>
    """, unsafe_allow_html=True)
    
    # إدارة سريعة
    st.markdown("### ⚡ إدارة سريعة")
    
    col1, col2, col3 = st.columns(3)
    
    with col1:
        st.markdown("#### قائمة الانتظار")
        current_queue = stats.get('outdoor_queue', 0)
        st.metric("العدد الحالي", current_queue)
        
        col_a, col_b = st.columns(2)
        with col_a:
            if st.button("➕ إضافة", key="queue_add", use_container_width=True):
                db.update_outdoor_queue(1)
                db.log_activity(st.session_state.user['username'], "QUEUE_ADD", "إضافة إلى الانتظار")
                st.rerun()
        with col_b:
            if st.button("➖ إزالة", key="queue_remove", use_container_width=True):
                if current_queue > 0:
                    db.update_outdoor_queue(-1)
                    db.log_activity(st.session_state.user['username'], "QUEUE_REMOVE", "إزالة من الانتظار")
                    st.rerun()
    
    with col2:
        st.markdown("#### المخدومين")
        served = stats.get('served_count', 0)
        st.metric("العدد الكلي", served)
        
        if st.button("➕ إضافة مخدوم", key="served_add", use_container_width=True):
            db.update_served_count(1)
            db.log_activity(st.session_state.user['username'], "SERVED_ADD", "إضافة مخدوم")
            st.rerun()
    
    with col3:
        st.markdown("#### الإحصائيات")
        occupancy = stats.get('occupancy_rate', 0)
        st.metric("الإشغال", f"{occupancy}%")
        
        if st.button("🔄 تحديث", key="refresh", use_container_width=True):
            st.rerun()
    
    # آخر النشاطات
    st.markdown("### 📋 آخر النشاطات")
    logs = db.get_activity_logs(limit=10)
    
    if logs:
        df = pd.DataFrame(logs)
        if 'timestamp' in df.columns:
            df['timestamp'] = pd.to_datetime(df['timestamp']).dt.strftime('%Y-%m-%d %H:%M')
        st.dataframe(df[['user', 'action', 'details', 'timestamp']], use_container_width=True, hide_index=True)
    else:
        st.info("لا توجد نشاطات بعد")

# ==================== Halls Management ====================

def show_halls():
    """إدارة القاعات"""
    st.markdown("<h1 style='margin-bottom: 2rem;'>🏛️ إدارة القاعات</h1>", unsafe_allow_html=True)
    
    db = get_database()
    halls = db.get_all_halls()
    
    # إضافة قاعة جديدة
    with st.expander("➕ إضافة قاعة جديدة"):
        with st.form("add_hall_form"):
            col1, col2 = st.columns(2)
            with col1:
                hall_name = st.text_input("اسم القاعة")
                hall_capacity = st.number_input("السعة القصوى", min_value=1, value=100)
            with col2:
                hall_type = st.selectbox("نوع القاعة", ["MAIN", "WAITING", "INTERVIEW", "NORMAL"])
            
            if st.form_submit_button("➕ إضافة القاعة"):
                if hall_name:
                    result = db.create_hall(hall_name, hall_type, hall_capacity)
                    if result.get('success'):
                        db.log_activity(st.session_state.user['username'], 
                                       "HALL_CREATE", 
                                       f"إنشاء قاعة: {hall_name}")
                        st.success("✅ تم إنشاء القاعة بنجاح")
                        st.rerun()
                    else:
                        st.error(f"❌ خطأ: {result.get('error')}")
                else:
                    st.warning("⚠️ يرجى إدخال اسم القاعة")
    
    # عرض القاعات
    if not halls:
        st.info("لا توجد قاعات. أضف قاعة جديدة للبدء.")
        return
    
    # عرض القاعات في شبكة
    cols_per_row = 2
    for i in range(0, len(halls), cols_per_row):
        cols = st.columns(cols_per_row)
        for j, col in enumerate(cols):
            if i + j < len(halls):
                hall = halls[i + j]
                with col:
                    render_hall_card(hall, db)

def render_hall_card(hall, db):
    """رسم بطاقة قاعة"""
    is_paused = hall.get('status') == 'PAUSED'
    percentage = (hall['current'] / hall['capacity'] * 100) if hall['capacity'] > 0 else 0
    
    # تحديد لون Progress bar
    if percentage < 50:
        progress_class = "progress-success"
    elif percentage < 80:
        progress_class = "progress-warning"
    else:
        progress_class = "progress-danger"
    
    # تحديد حالة القاعة
    status_class = "status-paused" if is_paused else "status-open"
    status_text = "⏸️ متوقفة" if is_paused else "🟢 نشطة"
    
    # HTML للبطاقة
    st.markdown(f"""
    <div class="hall-card">
        <div style='display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;'>
            <span class="hall-name">{hall['name']}</span>
            <span class="hall-status {status_class}">{status_text}</span>
        </div>
        <div class="progress-bar-container">
            <div class="progress-bar {progress_class}" style="width: {percentage}%"></div>
        </div>
        <div style='text-align: center; margin-top: 0.5rem;'>
            <span style='font-size: 1.5rem; font-weight: 800; color: #1e293b;'>{hall['current']}</span>
            <span style='color: #94a3b8; margin: 0 0.5rem;'>/</span>
            <span style='color: #64748b; font-weight: 600;'>{hall['capacity']}</span>
            <span style='color: #94a3b8; font-size: 0.875rem; margin-right: 0.5rem;'>({percentage:.0f}%)</span>
        </div>
    </div>
    """, unsafe_allow_html=True)
    
    # الأزرار
    col_btn1, col_btn2, col_btn3 = st.columns(3)
    
    with col_btn1:
        if st.button("➕", key=f"add_{hall['id']}", 
                   disabled=(is_paused or hall['current'] >= hall['capacity']),
                   use_container_width=True):
            db.update_hall_current(hall['id'], 1)
            db.update_outdoor_queue(-1)
            db.log_activity(st.session_state.user['username'],
                           "ENTRY", f"دخول إلى {hall['name']}", hall['id'])
            st.rerun()
    
    with col_btn2:
        if st.button("➖", key=f"remove_{hall['id']}",
                   disabled=(hall['current'] <= 0),
                   use_container_width=True):
            db.update_hall_current(hall['id'], -1)
            db.update_served_count(1)
            db.log_activity(st.session_state.user['username'],
                           "EXIT", f"خروج من {hall['name']}", hall['id'])
            st.rerun()
    
    with col_btn3:
        pause_text = "▶️" if is_paused else "⏸️"
        if st.button(pause_text, key=f"pause_{hall['id']}",
                   use_container_width=True):
            db.toggle_hall_status(hall['id'])
            action = "RESUME" if is_paused else "PAUSE"
            db.log_activity(st.session_state.user['username'],
                           action, f"تغيير حالة {hall['name']}", hall['id'])
            st.rerun()
    
    # تعديل يدوي
    with st.expander("✏️ تعديل يدوي"):
        new_value = st.number_input(
            "العدد الجديد",
            min_value=0,
            max_value=hall['capacity'],
            value=hall['current'],
            key=f"manual_{hall['id']}"
        )
        if st.button("✅ تطبيق", key=f"apply_{hall['id']}"):
            db.set_hall_current(hall['id'], new_value)
            db.log_activity(st.session_state.user['username'],
                           "MANUAL_SET",
                           f"تعديل: {hall['name']} من {hall['current']} إلى {new_value}",
                           hall['id'])
            st.success("✅ تم")
            st.rerun()

# ==================== Reports ====================

def show_reports():
    """التقارير"""
    st.markdown("<h1 style='margin-bottom: 2rem;'>📈 التقارير</h1>", unsafe_allow_html=True)
    
    db = get_database()
    
    tab1, tab2, tab3 = st.tabs(["📊 إحصائيات", "📋 السجل", "🏛️ القاعات"])
    
    with tab1:
        stats = db.get_statistics()
        col1, col2 = st.columns(2)
        with col1:
            st.markdown("### الملخص")
            st.json(stats)
        with col2:
            st.markdown("### رسم بياني")
            fig = go.Figure(data=[
                go.Bar(
                    x=['القاعات', 'الانتظار', 'المخدومين'],
                    y=[stats.get('total_current', 0),
                       stats.get('outdoor_queue', 0),
                       stats.get('served_count', 0)],
                    marker_color='#6B9AC4'
                )
            ])
            fig.update_layout(height=350, font=dict(family="Alexandria"))
            st.plotly_chart(fig, use_container_width=True)
    
    with tab2:
        limit = st.slider("عدد السجلات", 10, 100, 50)
        logs = db.get_activity_logs(limit=limit)
        
        if logs:
            df = pd.DataFrame(logs)
            if 'timestamp' in df.columns:
                df['timestamp'] = pd.to_datetime(df['timestamp'])
            
            col1, col2, col3 = st.columns(3)
            with col1:
                st.metric("إجمالي", len(logs))
            with col2:
                entries = len([l for l in logs if l.get('action') == 'ENTRY'])
                st.metric("دخول", entries)
            with col3:
                exits = len([l for l in logs if l.get('action') == 'EXIT'])
                st.metric("خروج", exits)
            
            st.dataframe(df, use_container_width=True, hide_index=True)
            
            csv = df.to_csv(index=False).encode('utf-8-sig')
            st.download_button(
                "📥 تحميل CSV",
                csv,
                f"activity_log_{datetime.now().strftime('%Y%m%d')}.csv",
                "text/csv"
            )
        else:
            st.info("لا توجد سجلات")
    
    with tab3:
        halls = db.get_all_halls()
        if halls:
            df = pd.DataFrame(halls)
            
            col1, col2, col3, col4 = st.columns(4)
            with col1:
                st.metric("القاعات", len(halls))
            with col2:
                st.metric("السعة", df['capacity'].sum())
            with col3:
                st.metric("الإشغال", df['current'].sum())
            with col4:
                rate = (df['current'].sum() / df['capacity'].sum() * 100) if df['capacity'].sum() > 0 else 0
                st.metric("النسبة", f"{rate:.1f}%")
            
            st.dataframe(df, use_container_width=True, hide_index=True)

# ==================== Settings ====================

def show_settings():
    """الإعدادات"""
    st.markdown("<h1 style='margin-bottom: 2rem;'>⚙️ الإعدادات</h1>", unsafe_allow_html=True)
    
    db = get_database()
    
    tab1, tab2 = st.tabs(["👥 المستخدمين", "🔧 النظام"])
    
    with tab1:
        st.markdown("### إدارة المستخدمين")
        
        with st.expander("➕ إضافة مستخدم"):
            with st.form("add_user_form"):
                col1, col2 = st.columns(2)
                with col1:
                    new_username = st.text_input("اسم المستخدم")
                    new_fullname = st.text_input("الاسم الكامل")
                with col2:
                    new_password = st.text_input("كلمة المرور", type="password")
                    new_role = st.selectbox("الدور", ["ADMIN", "STAFF", "VIEWER"])
                
                if st.form_submit_button("➕ إضافة"):
                    if new_username and new_password and new_fullname:
                        result = db.create_user(new_username, new_password, new_fullname, new_role)
                        if result.get('success'):
                            st.success("✅ تم")
                            st.rerun()
                        else:
                            st.error(f"❌ خطأ: {result.get('error')}")
        
        users = db.get_all_users()
        if users:
            df = pd.DataFrame(users)
            st.dataframe(df, use_container_width=True, hide_index=True)
    
    with tab2:
        st.markdown("### إعدادات النظام")
        st.markdown("#### 🔄 إعادة تعيين")
        
        col1, col2 = st.columns(2)
        with col1:
            if st.button("🗑️ تصفير المخدومين", use_container_width=True):
                db.reset_settings(reset_served=True)
                st.success("✅ تم")
                st.rerun()
        with col2:
            if st.button("🗑️ تصفير الانتظار", use_container_width=True):
                db.reset_settings(reset_queue=True)
                st.success("✅ تم")
                st.rerun()
        
        st.warning("⚠️ لا يمكن التراجع")

# ==================== Main App ====================

def main():
    """التطبيق الرئيسي"""
    
    # التحقق من تسجيل الدخول
    if not st.session_state.logged_in:
        login_page()
        return
    
    # Sidebar
    with st.sidebar:
        st.markdown("""
        <div style='padding: 1.5rem 0; border-bottom: 1px solid #e2e8f0;'>
            <h2>B36 Admin</h2>
            <h3>v27 Production</h3>
        </div>
        """, unsafe_allow_html=True)
        
        st.markdown("<br>", unsafe_allow_html=True)
        
        # القائمة
        menu_items = [
            ("dashboard", "🏠", "لوحة التحكم"),
            ("halls", "🏛️", "إدارة القاعات"),
            ("reports", "📊", "التقارير"),
            ("settings", "⚙️", "الإعدادات")
        ]
        
        for key, icon, label in menu_items:
            if st.button(f"{icon}  {label}", key=f"menu_{key}", use_container_width=True):
                st.session_state.current_page = key
                st.rerun()
        
        st.markdown("<br><br>", unsafe_allow_html=True)
        
        # معلومات المستخدم
        if st.session_state.user:
            st.markdown(f"""
            <div style='border-top: 1px solid #e2e8f0; padding-top: 1rem;'>
                <p style='font-size: 0.875rem; font-weight: 700; color: #1e293b;'>
                    {st.session_state.user.get('full_name', 'مستخدم')}
                </p>
                <p style='font-size: 0.75rem; color: #64748b;'>{st.session_state.user.get('role', 'STAFF')}</p>
            </div>
            """, unsafe_allow_html=True)
        
        st.markdown("<br>", unsafe_allow_html=True)
        
        if st.button("🚪 تسجيل خروج", use_container_width=True):
            logout()
    
    # عرض الصفحة المطلوبة
    page = st.session_state.current_page
    
    if page == "dashboard":
        show_dashboard()
    elif page == "halls":
        show_halls()
    elif page == "reports":
        show_reports()
    elif page == "settings":
        show_settings()

if __name__ == "__main__":
    main()
