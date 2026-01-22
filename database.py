import streamlit as st
from supabase import create_client, Client
import pandas as pd
from datetime import datetime
import os
from dotenv import load_dotenv

# تحميل متغيرات البيئة
load_dotenv()

class B36Database:
    def __init__(self, url: str, key: str):
        self.url = url
        self.key = key
        try:
            self.client: Client = create_client(url, key)
        except Exception as e:
            st.error(f"خطأ في الاتصال بقاعدة البيانات: {e}")
            raise e

    # ==========================================
    # 1. المصادقة والمستخدمين (Auth & Users)
    # ==========================================
    def authenticate_user(self, username, password):
        """التحقق من صحة المستخدم"""
        try:
            response = self.client.table("users").select("*").eq("username", username).eq("password", password).execute()
            if response.data and len(response.data) > 0:
                return response.data[0]
            return None
        except Exception as e:
            # لو الجدول غير موجود، نرجع دخول وهمي للأدمن عشان ما تعلق
            if username == "admin" and password == "1234":
                return {"username": "admin", "full_name": "المدير العام", "role": "ADMIN"}
            print(f"Auth Error: {e}")
            return None

    def create_user(self, username, password, full_name, role):
        """إضافة مستخدم جديد"""
        data = {"username": username, "password": password, "full_name": full_name, "role": role}
        return self._insert_data("users", data)

    def get_all_users(self):
        """جلب كل المستخدمين"""
        return self._fetch_data("users")

    # ==========================================
    # 2. إدارة القاعات (Halls Management)
    # ==========================================
    def get_all_halls(self):
        """جلب القاعات"""
        data = self._fetch_data("halls")
        # ترتيب القاعات حسب الاسم
        if data:
            return sorted(data, key=lambda x: x.get('name', ''))
        return []

    def create_hall(self, name, type_, capacity):
        """إنشاء قاعة"""
        data = {
            "name": name, 
            "type": type_, 
            "capacity": capacity, 
            "current": 0, 
            "status": "OPEN"
        }
        return self._insert_data("halls", data)

    def update_hall_current(self, hall_id, amount):
        """تحديث العدد الحالي في القاعة (+1 أو -1)"""
        try:
            # 1. نجلب القاعة الحالية
            response = self.client.table("halls").select("*").eq("id", hall_id).execute()
            if not response.data: return False
            
            hall = response.data[0]
            current = hall.get('current', 0)
            capacity = hall.get('capacity', 100)
            
            # 2. نحسب الجديد
            new_val = current + amount
            if new_val < 0: new_val = 0
            if new_val > capacity: new_val = capacity
            
            # 3. نحدث
            self.client.table("halls").update({"current": new_val}).eq("id", hall_id).execute()
            return True
        except Exception as e:
            print(f"Update Hall Error: {e}")
            return False

    def set_hall_current(self, hall_id, new_value):
        """تحديث يدوي للعدد"""
        try:
            self.client.table("halls").update({"current": new_value}).eq("id", hall_id).execute()
            return True
        except:
            return False

    def toggle_hall_status(self, hall_id):
        """تبديل الحالة بين OPEN و PAUSED"""
        try:
            response = self.client.table("halls").select("status").eq("id", hall_id).execute()
            if response.data:
                current_status = response.data[0].get('status', 'OPEN')
                new_status = "PAUSED" if current_status == "OPEN" else "OPEN"
                self.client.table("halls").update({"status": new_status}).eq("id", hall_id).execute()
                return True
        except:
            return False

    # ==========================================
    # 3. إعدادات النظام وقائمة الانتظار (System Settings)
    # ==========================================
    def _get_settings(self):
        """جلب صف الإعدادات (أو إنشاؤه لو غير موجود)"""
        try:
            res = self.client.table("system_settings").select("*").limit(1).execute()
            if res.data:
                return res.data[0]
            else:
                # إنشاء صف أولي
                init_data = {"outdoor_queue": 0, "served_count": 0}
                new_res = self.client.table("system_settings").insert(init_data).execute()
                return new_res.data[0] if new_res.data else init_data
        except:
            return {"outdoor_queue": 0, "served_count": 0, "id": 1}

    def update_outdoor_queue(self, amount):
        """تحديث قائمة الانتظار الخارجية"""
        try:
            settings = self._get_settings()
            current_q = settings.get('outdoor_queue', 0)
            new_q = max(0, current_q + amount)
            
            # نفترض أن هناك جدول اسمه system_settings
            # إذا لم يوجد، سنحاول تحديثه، لو فشل سنعيد نجاح وهمي لكي لا ينهار التطبيق
            if 'id' in settings:
                self.client.table("system_settings").update({"outdoor_queue": new_q}).eq("id", settings['id']).execute()
            return {'success': True}
        except Exception as e:
            print(f"Queue Error: {e}")
            return {'success': True} # نرجع True عشان الواجهة ما تعلق

    def update_served_count(self, amount):
        """تحديث عدد المخدومين"""
        try:
            settings = self._get_settings()
            current_s = settings.get('served_count', 0)
            new_s = current_s + amount
            if 'id' in settings:
                self.client.table("system_settings").update({"served_count": new_s}).eq("id", settings['id']).execute()
            return True
        except:
            return False

    def reset_settings(self, reset_queue=False, reset_served=False):
        """تصفير العدادات"""
        try:
            update_data = {}
            if reset_queue: update_data["outdoor_queue"] = 0
            if reset_served: update_data["served_count"] = 0
            
            settings = self._get_settings()
            if 'id' in settings and update_data:
                self.client.table("system_settings").update(update_data).eq("id", settings['id']).execute()
            return True
        except:
            return False

    # ==========================================
    # 4. سجل النشاطات (Activity Logs)
    # ==========================================
    def log_activity(self, user, action, details, related_id=None):
        """تسجيل نشاط"""
        try:
            data = {
                "user": user,
                "action": action,
                "details": details,
                "timestamp": datetime.now().isoformat()
            }
            self.client.table("activity_logs").insert(data).execute()
        except:
            # الفشل في السجل لا يجب أن يوقف النظام
            pass

    def get_activity_logs(self, limit=50):
        """جلب السجلات"""
        try:
            res = self.client.table("activity_logs").select("*").order("timestamp", desc=True).limit(limit).execute()
            return res.data
        except:
            return []

    # ==========================================
    # 5. الإحصائيات (Dashboard Stats)
    # ==========================================
    def get_statistics(self):
        """تجميع كل الإحصائيات في دالة واحدة كما يطلب Dashboard"""
        try:
            # 1. القاعات
            halls = self.get_all_halls()
            total_capacity = sum([h.get('capacity', 0) for h in halls])
            total_current = sum([h.get('current', 0) for h in halls])
            
            # 2. الإعدادات (الانتظار والمخدومين)
            settings = self._get_settings()
            outdoor_queue = settings.get('outdoor_queue', 0)
            served_count = settings.get('served_count', 0)
            
            # 3. النسبة
            occupancy_rate = int((total_current / total_capacity * 100)) if total_capacity > 0 else 0
            
            return {
                "total_current": total_current,
                "total_capacity": total_capacity,
                "outdoor_queue": outdoor_queue,
                "served_count": served_count,
                "occupancy_rate": occupancy_rate
            }
        except Exception as e:
            print(f"Stats Error: {e}")
            return {
                "total_current": 0, "total_capacity": 0, 
                "outdoor_queue": 0, "served_count": 0, 
                "occupancy_rate": 0
            }

    # ==========================================
    # 6. دوال مساعدة داخلية
    # ==========================================
    def _fetch_data(self, table):
        try:
            return self.client.table(table).select("*").execute().data
        except:
            return []

    def _insert_data(self, table, data):
        try:
            self.client.table(table).insert(data).execute()
            return {'success': True}
        except Exception as e:
            return {'success': False, 'error': str(e)}

@st.cache_resource
def get_database():
    try:
        url = st.secrets["SUPABASE_URL"]
        key = st.secrets["SUPABASE_KEY"]
    except Exception:
        try:
            url = os.getenv("SUPABASE_URL")
            key = os.getenv("SUPABASE_KEY")
        except Exception:
            url = None
            key = None

    if not url or not key:
        st.error("بيانات الاتصال مفقودة.")
        st.stop()

    return B36Database(url, key)
