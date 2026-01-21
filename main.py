"""
B36 Hall Management System
نظام إدارة القاعات اللوجستية
Powered by Streamlit & Supabase
"""

import streamlit as st
import os
from dotenv import load_dotenv
from datetime import datetime
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from database import get_database

# تحميل المتغيرات البيئية
load_dotenv()

# إعدادات الصفحة
st.set_page_config(
    page_title="B36 System",
    page_icon="🏛️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# تحميل CSS مخصص
st.markdown("""
<style>
    /* الخط العربي */
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
    
    * {
        font-family: 'Cairo', sans-serif;
    }
    
    /* تحسين الأزرار */
    .stButton>button {
        width: 100%;
        border-radius: 10px;
        font-weight: 600;
        padding: 0.5rem 1rem;
    }
    
    /* البطاقات */
    .metric-card {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 1.5rem;
        border-radius: 15px;
        color: white;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    
    /* العناوين */
    h1, h2, h3 {
        color: #667eea;
    }
    
    /* تحسين الجداول */
    .dataframe {
        border-radius: 10px;
        overflow: hidden;
    }
    
    /* Sidebar */
    [data-testid="stSidebar"] {
        background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
    }
    
    [data-testid="stSidebar"] * {
        color: white !important;
    }
</style>
""", unsafe_allow_html=True)

# ==================== Session State ====================

def init_session_state():
    """تهيئة Session State"""
    if 'logged_in' not in st.session_state:
        st.session_state.logged_in = False
    if 'user' not in st.session_state:
        st.session_state.user = None
    if 'current_page' not in st.session_state:
        st.session_state.current_page = "dashboard"

init_session_state()

# ==================== Authentication ====================

def login_page():
    """صفحة تسجيل الدخول"""
    st.markdown("<h1 style='text-align: center;'>🏛️ نظام B36</h1>", unsafe_allow_html=True)
    st.markdown("<h3 style='text-align: center; color: #666;'>نظام إدارة القاعات اللوجستية</h3>", unsafe_allow_html=True)
    
    col1, col2, col3 = st.columns([1, 2, 1])
    
    with col2:
        st.markdown("---")
        
        with st.form("login_form"):
            username = st.text_input("👤 اسم المستخدم", placeholder="admin")
            password = st.text_input("🔒 كلمة المرور", type="password", placeholder="••••")
            
            col_login1, col_login2 = st.columns(2)
            with col_login1:
                submit = st.form_submit_button("🚀 دخول", use_container_width=True)
            with col_login2:
                test_connection = st.form_submit_button("🔌 اختبار الاتصال", use_container_width=True)
        
        if submit:
            if username and password:
                db = get_database()
                user = db.authenticate_user(username, password)
                
                if user:
                    st.session_state.logged_in = True
                    st.session_state.user = user
                    st.success(f"مرحباً {user['full_name']}! 🎉")
                    st.rerun()
                else:
                    st.error("❌ اسم المستخدم أو كلمة المرور غير صحيحة")
            else:
                st.warning("⚠️ يرجى إدخال اسم المستخدم وكلمة المرور")
        
        if test_connection:
            with st.spinner("جاري اختبار الاتصال..."):
                try:
                    db = get_database()
                    st.success("✅ الاتصال بقاعدة البيانات ناجح!")
                    st.info("📊 يمكنك الآن تسجيل الدخول")
                except Exception as e:
                    st.error(f"❌ فشل الاتصال: {e}")
        
        st.markdown("---")
        with st.expander("ℹ️ معلومات تجريبية"):
            st.code("""
اسم المستخدم: admin
كلمة المرور: 1234
            """)

def logout():
    """تسجيل الخروج"""
    st.session_state.logged_in = False
    st.session_state.user = None
    st.rerun()

# ==================== Dashboard ====================

def show_dashboard():
    """عرض لوحة المعلومات الرئيسية"""
    st.title("📊 لوحة المعلومات")
    
    db = get_database()
    stats = db.get_statistics()
    
    # البطاقات الإحصائية
    col1, col2, col3, col4, col5 = st.columns(5)
    
    with col1:
        st.metric(
            label="✅ تمت خدمتهم",
            value=stats.get('served_count', 0),
            delta="إجمالي"
        )
    
    with col2:
        st.metric(
            label="⏳ قائمة الانتظار",
            value=stats.get('outdoor_queue', 0),
            delta="في الخارج"
        )
    
    with col3:
        st.metric(
            label="🏛️ داخل القاعات",
            value=stats.get('total_current', 0),
            delta=f"من {stats.get('total_capacity', 0)}"
        )
    
    with col4:
        st.metric(
            label="📈 إجمالي النظام",
            value=stats.get('total_in_system', 0),
            delta="زائر"
        )
    
    with col5:
        st.metric(
            label="📊 نسبة الإشغال",
            value=f"{stats.get('occupancy_rate', 0)}%",
            delta="من السعة"
        )
    
    st.markdown("---")
    
    # الرسوم البيانية
    col_chart1, col_chart2 = st.columns(2)
    
    with col_chart1:
        st.subheader("📊 توزيع الإشغال")
        
        # رسم بياني دائري
        fig_pie = go.Figure(data=[go.Pie(
            labels=['مشغول', 'متاح'],
            values=[stats.get('total_current', 0), 
                   stats.get('total_capacity', 0) - stats.get('total_current', 0)],
            hole=.6,
            marker_colors=['#667eea', '#e0e7ff']
        )])
        fig_pie.update_layout(
            height=300,
            showlegend=True,
            annotations=[dict(text=f"{stats.get('occupancy_rate', 0)}%", 
                            x=0.5, y=0.5, font_size=20, showarrow=False)]
        )
        st.plotly_chart(fig_pie, use_container_width=True)
    
    with col_chart2:
        st.subheader("🏛️ حالة القاعات")
        
        halls = db.get_all_halls()
        if halls:
            df_halls = pd.DataFrame(halls)
            fig_bar = px.bar(
                df_halls,
                x='name',
                y=['current', 'capacity'],
                title='',
                labels={'value': 'العدد', 'name': 'القاعة'},
                barmode='group',
                color_discrete_sequence=['#667eea', '#e0e7ff']
            )
            fig_bar.update_layout(height=300)
            st.plotly_chart(fig_bar, use_container_width=True)
        else:
            st.info("لا توجد قاعات متاحة")
    
    # إدارة سريعة
    st.markdown("---")
    st.subheader("⚡ إدارة سريعة")
    
    col_quick1, col_quick2, col_quick3 = st.columns(3)
    
    with col_quick1:
        st.markdown("##### 📥 قائمة الانتظار")
        col_btn1, col_btn2 = st.columns(2)
        with col_btn1:
            if st.button("➕ إضافة", key="add_queue"):
                result = db.update_outdoor_queue(1)
                if result['success']:
                    db.log_activity(st.session_state.user['username'], 
                                   "OUTDOOR_ADD", "إضافة زائر للانتظار")
                    st.success("تمت الإضافة ✅")
                    st.rerun()
        with col_btn2:
            if st.button("➖ خصم", key="remove_queue"):
                result = db.update_outdoor_queue(-1)
                if result['success']:
                    db.log_activity(st.session_state.user['username'],
                                   "OUTDOOR_REMOVE", "خصم زائر من الانتظار")
                    st.success("تم الخصم ✅")
                    st.rerun()
    
    with col_quick2:
        st.markdown("##### 🔄 تحديث القاعات")
        if st.button("🔄 تحديث البيانات", use_container_width=True):
            st.rerun()
    
    with col_quick3:
        st.markdown("##### 🗑️ إعادة تعيين")
        if st.button("🗑️ تصفير العدادات", use_container_width=True):
            with st.expander("تأكيد التصفير"):
                col_reset1, col_reset2 = st.columns(2)
                with col_reset1:
                    if st.button("تصفير المخدومين"):
                        db.reset_settings(reset_served=True)
                        st.success("تم التصفير ✅")
                        st.rerun()
                with col_reset2:
                    if st.button("تصفير الانتظار"):
                        db.reset_settings(reset_queue=True)
                        st.success("تم التصفير ✅")
                        st.rerun()
    
    # آخر النشاطات
    st.markdown("---")
    st.subheader("📋 آخر النشاطات")
    
    logs = db.get_activity_logs(limit=10)
    if logs:
        df_logs = pd.DataFrame(logs)
        df_logs['timestamp'] = pd.to_datetime(df_logs['timestamp']).dt.strftime('%Y-%m-%d %H:%M')
        st.dataframe(
            df_logs[['timestamp', 'user', 'action', 'details']],
            use_container_width=True,
            hide_index=True,
            column_config={
                "timestamp": "الوقت",
                "user": "المستخدم",
                "action": "العملية",
                "details": "التفاصيل"
            }
        )
    else:
        st.info("لا توجد نشاطات مسجلة")

# ==================== Halls Management ====================

def show_halls():
    """صفحة إدارة القاعات"""
    st.title("🏛️ إدارة القاعات")
    
    db = get_database()
    
    # إضافة قاعة جديدة
    with st.expander("➕ إضافة قاعة جديدة"):
        with st.form("add_hall_form"):
            col1, col2, col3 = st.columns(3)
            
            with col1:
                hall_name = st.text_input("اسم القاعة", placeholder="قاعة 1")
            with col2:
                hall_type = st.selectbox("نوع القاعة", ["MAIN", "WAITING", "INTERVIEW", "NORMAL"])
            with col3:
                capacity = st.number_input("السعة", min_value=1, value=100)
            
            submitted = st.form_submit_button("➕ إضافة القاعة")
            
            if submitted and hall_name:
                result = db.create_hall(hall_name, hall_type, capacity)
                if result['success']:
                    st.success(f"✅ تم إضافة القاعة: {hall_name}")
                    db.log_activity(st.session_state.user['username'],
                                   "HALL_CREATE", f"إنشاء قاعة: {hall_name}")
                    st.rerun()
                else:
                    st.error(f"❌ خطأ: {result['error']}")
    
    st.markdown("---")
    
    # عرض القاعات
    halls = db.get_all_halls()
    
    if not halls:
        st.info("لا توجد قاعات. أضف قاعة جديدة للبدء.")
        return
    
    # فلترة
    col_filter1, col_filter2 = st.columns([3, 1])
    with col_filter1:
        status_filter = st.multiselect(
            "فلترة حسب الحالة",
            ["OPEN", "PAUSED"],
            default=["OPEN", "PAUSED"]
        )
    
    filtered_halls = [h for h in halls if h['status'] in status_filter]
    
    # عرض القاعات في شبكة
    cols = st.columns(3)
    
    for idx, hall in enumerate(filtered_halls):
        with cols[idx % 3]:
            with st.container():
                # حساب النسبة
                percentage = (hall['current'] / hall['capacity'] * 100) if hall['capacity'] > 0 else 0
                
                # تحديد اللون
                if hall['status'] == 'PAUSED':
                    color = "🔴"
                    status_text = "متوقفة"
                elif percentage >= 90:
                    color = "🔴"
                    status_text = "ممتلئة"
                elif percentage >= 70:
                    color = "🟡"
                    status_text = "مكتظة"
                else:
                    color = "🟢"
                    status_text = "نشطة"
                
                st.markdown(f"### {color} {hall['name']}")
                st.markdown(f"**الحالة:** {status_text}")
                
                # Progress bar
                st.progress(percentage / 100)
                st.markdown(f"**{hall['current']} / {hall['capacity']}** ({percentage:.1f}%)")
                
                # الأزرار
                col_btn1, col_btn2, col_btn3 = st.columns(3)
                
                with col_btn1:
                    if st.button("➕", key=f"add_{hall['id']}", 
                               disabled=(hall['status'] == 'PAUSED' or hall['current'] >= hall['capacity'])):
                        db.update_hall_current(hall['id'], 1)
                        db.update_outdoor_queue(-1)
                        db.log_activity(st.session_state.user['username'],
                                       "ENTRY", f"دخول زائر إلى {hall['name']}", hall['id'])
                        st.rerun()
                
                with col_btn2:
                    if st.button("➖", key=f"remove_{hall['id']}",
                               disabled=(hall['current'] <= 0)):
                        db.update_hall_current(hall['id'], -1)
                        db.update_served_count(1)
                        db.log_activity(st.session_state.user['username'],
                                       "EXIT", f"خروج زائر من {hall['name']}", hall['id'])
                        st.rerun()
                
                with col_btn3:
                    pause_text = "▶️" if hall['status'] == 'PAUSED' else "⏸️"
                    if st.button(pause_text, key=f"pause_{hall['id']}"):
                        db.toggle_hall_status(hall['id'])
                        action = "RESUME" if hall['status'] == 'PAUSED' else "PAUSE"
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
                                       f"تعديل يدوي: {hall['name']} من {hall['current']} إلى {new_value}",
                                       hall['id'])
                        st.success("تم التحديث ✅")
                        st.rerun()
                
                st.markdown("---")

# ==================== Reports ====================

def show_reports():
    """صفحة التقارير والإحصائيات"""
    st.title("📊 التقارير والإحصائيات")
    
    db = get_database()
    
    # اختيار نوع التقرير
    report_type = st.selectbox(
        "اختر نوع التقرير",
        ["إحصائيات عامة", "سجل النشاطات", "تقرير القاعات", "البلاغات"]
    )
    
    st.markdown("---")
    
    if report_type == "إحصائيات عامة":
        stats = db.get_statistics()
        
        col1, col2 = st.columns(2)
        
        with col1:
            st.subheader("📈 الإحصائيات الرئيسية")
            st.json(stats)
        
        with col2:
            st.subheader("📊 الرسم البياني")
            fig = go.Figure(data=[
                go.Bar(name='الحالي', x=['القاعات', 'الانتظار', 'المخدومين'],
                      y=[stats.get('total_current', 0), 
                         stats.get('outdoor_queue', 0),
                         stats.get('served_count', 0)],
                      marker_color='#667eea')
            ])
            fig.update_layout(height=400)
            st.plotly_chart(fig, use_container_width=True)
    
    elif report_type == "سجل النشاطات":
        st.subheader("📋 سجل النشاطات")
        
        limit = st.slider("عدد السجلات", 10, 100, 50)
        logs = db.get_activity_logs(limit=limit)
        
        if logs:
            df = pd.DataFrame(logs)
            df['timestamp'] = pd.to_datetime(df['timestamp'])
            
            # إحصائيات
            col1, col2, col3 = st.columns(3)
            with col1:
                st.metric("إجمالي العمليات", len(logs))
            with col2:
                entries = len([l for l in logs if l['action'] == 'ENTRY'])
                st.metric("عمليات الدخول", entries)
            with col3:
                exits = len([l for l in logs if l['action'] == 'EXIT'])
                st.metric("عمليات الخروج", exits)
            
            # الجدول
            st.dataframe(
                df[['timestamp', 'user', 'action', 'details']],
                use_container_width=True,
                hide_index=True
            )
            
            # تصدير
            csv = df.to_csv(index=False).encode('utf-8-sig')
            st.download_button(
                label="📥 تحميل CSV",
                data=csv,
                file_name=f"activity_log_{datetime.now().strftime('%Y%m%d')}.csv",
                mime="text/csv"
            )
        else:
            st.info("لا توجد سجلات")
    
    elif report_type == "تقرير القاعات":
        st.subheader("🏛️ تقرير القاعات")
        
        halls = db.get_all_halls()
        if halls:
            df = pd.DataFrame(halls)
            
            # الإحصائيات
            st.markdown("#### الإحصائيات")
            col1, col2, col3, col4 = st.columns(4)
            with col1:
                st.metric("عدد القاعات", len(halls))
            with col2:
                st.metric("السعة الكلية", df['capacity'].sum())
            with col3:
                st.metric("الإشغال الكلي", df['current'].sum())
            with col4:
                rate = (df['current'].sum() / df['capacity'].sum() * 100) if df['capacity'].sum() > 0 else 0
                st.metric("نسبة الإشغال", f"{rate:.1f}%")
            
            # الجدول
            st.markdown("#### تفاصيل القاعات")
            st.dataframe(
                df[['name', 'type', 'capacity', 'current', 'status']],
                use_container_width=True,
                hide_index=True,
                column_config={
                    "name": "الاسم",
                    "type": "النوع",
                    "capacity": "السعة",
                    "current": "الحالي",
                    "status": "الحالة"
                }
            )
        else:
            st.info("لا توجد قاعات")
    
    elif report_type == "البلاغات":
        st.subheader("🚨 البلاغات")
        
        incidents = db.get_incidents()
        if incidents:
            df = pd.DataFrame(incidents)
            
            # فلترة
            status = st.multiselect(
                "فلترة حسب الحالة",
                ["NEW", "IN_PROGRESS", "RESOLVED"],
                default=["NEW", "IN_PROGRESS"]
            )
            
            filtered = [i for i in incidents if i['status'] in status]
            
            for incident in filtered:
                with st.expander(f"🚨 {incident['description'][:50]}..."):
                    col1, col2 = st.columns([2, 1])
                    with col1:
                        st.markdown(f"**الوصف:** {incident['description']}")
                        st.markdown(f"**المستخدم:** {incident['user']}")
                        st.markdown(f"**الوقت:** {incident['created_at']}")
                    with col2:
                        st.markdown(f"**الأولوية:** {incident['priority']}")
                        st.markdown(f"**الحالة:** {incident['status']}")
        else:
            st.info("لا توجد بلاغات")

# ==================== Settings ====================

def show_settings():
    """صفحة الإعدادات"""
    st.title("⚙️ الإعدادات")
    
    db = get_database()
    
    tab1, tab2, tab3 = st.tabs(["👥 المستخدمين", "🔧 النظام", "📊 قاعدة البيانات"])
    
    with tab1:
        st.subheader("إدارة المستخدمين")
        
        # إضافة مستخدم
        with st.expander("➕ إضافة مستخدم جديد"):
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
                        if result['success']:
                            st.success("✅ تم إضافة المستخدم")
                            st.rerun()
                        else:
                            st.error(f"❌ خطأ: {result['error']}")
        
        # عرض المستخدمين
        users = db.get_all_users()
        if users:
            df = pd.DataFrame(users)
            st.dataframe(
                df[['username', 'full_name', 'role', 'created_at']],
                use_container_width=True,
                hide_index=True
            )
    
    with tab2:
        st.subheader("إعدادات النظام")
        
        st.markdown("#### 🔄 إعادة تعيين النظام")
        
        col1, col2 = st.columns(2)
        with col1:
            if st.button("🗑️ تصفير عدادات المخدومين", use_container_width=True):
                db.reset_settings(reset_served=True)
                st.success("تم التصفير ✅")
        
        with col2:
            if st.button("🗑️ تصفير قائمة الانتظار", use_container_width=True):
                db.reset_settings(reset_queue=True)
                st.success("تم التصفير ✅")
        
        st.warning("⚠️ هذه العملية لا يمكن التراجع عنها!")
    
    with tab3:
        st.subheader("معلومات قاعدة البيانات")
        
        st.markdown(f"""
        - **النوع:** Supabase (PostgreSQL)
        - **الحالة:** 🟢 متصل
        - **URL:** {os.getenv('SUPABASE_URL', 'غير محدد')}
        """)
        
        if st.button("🔌 اختبار الاتصال"):
            try:
                stats = db.get_statistics()
                st.success("✅ الاتصال ناجح!")
                st.json(stats)
            except Exception as e:
                st.error(f"❌ فشل الاتصال: {e}")

# ==================== Main App ====================

def main():
    """التطبيق الرئيسي"""
    
    # التحقق من تسجيل الدخول
    if not st.session_state.logged_in:
        login_page()
        return
    
    # Sidebar
    with st.sidebar:
        st.image("https://via.placeholder.com/150x150/667eea/ffffff?text=B36", width=150)
        st.markdown(f"### مرحباً {st.session_state.user['full_name']} 👋")
        st.markdown(f"**الدور:** {st.session_state.user['role']}")
        st.markdown("---")
        
        # القائمة
        menu_items = {
            "dashboard": "📊 لوحة المعلومات",
            "halls": "🏛️ إدارة القاعات",
            "reports": "📈 التقارير",
            "settings": "⚙️ الإعدادات"
        }
        
        for key, label in menu_items.items():
            if st.button(label, key=f"menu_{key}", use_container_width=True):
                st.session_state.current_page = key
                st.rerun()
        
        st.markdown("---")
        if st.button("🚪 تسجيل الخروج", use_container_width=True):
            logout()
    
    # عرض الصفحة المحددة
    page = st.session_state.current_page
    
    if page == "dashboard":
        show_dashboard()
    elif page == "halls":
        show_halls()
    elif page == "reports":
        show_reports()
    elif page == "settings":
        show_settings()

# ==================== Run App ====================

if __name__ == "__main__":
    main()
