"""
B36 System - Database Management Module
إدارة قاعدة البيانات باستخدام Supabase
"""

import os
from supabase import create_client, Client
from datetime import datetime
from typing import Dict, List, Optional
import streamlit as st

class B36Database:
    """فئة لإدارة جميع عمليات قاعدة البيانات"""
    
    def __init__(self, url: str, key: str):
        """
        تهيئة الاتصال بقاعدة البيانات
        
        Args:
            url: عنوان Supabase
            key: مفتاح API
        """
        self.client: Client = create_client(url, key)
        self.initialize_tables()
    
    def initialize_tables(self):
        """إنشاء الجداول الأساسية إذا لم تكن موجودة"""
        try:
            # التحقق من وجود الجداول عن طريق محاولة القراءة منها
            # إذا فشلت، يعني الجدول غير موجود ويجب إنشاؤه يدوياً من Supabase Dashboard
            
            tables_to_check = ['users', 'halls', 'global_settings', 'activity_logs', 'incidents']
            
            for table in tables_to_check:
                try:
                    self.client.table(table).select("*").limit(1).execute()
                except Exception as e:
                    st.warning(f"⚠️ الجدول {table} غير موجود. يرجى إنشاؤه من لوحة تحكم Supabase")
                    
        except Exception as e:
            st.error(f"خطأ في التحقق من الجداول: {e}")
    
    # ==================== إدارة المستخدمين ====================
    
    def create_user(self, username: str, password: str, full_name: str, role: str = "STAFF") -> Dict:
        """إنشاء مستخدم جديد"""
        try:
            data = {
                "username": username,
                "password": password,  # في الإنتاج، استخدم تشفير bcrypt
                "full_name": full_name,
                "role": role,
                "created_at": datetime.now().isoformat()
            }
            response = self.client.table("users").insert(data).execute()
            return {"success": True, "data": response.data}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def get_user(self, username: str) -> Optional[Dict]:
        """جلب بيانات مستخدم"""
        try:
            response = self.client.table("users").select("*").eq("username", username).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            st.error(f"خطأ في جلب المستخدم: {e}")
            return None
    
    def authenticate_user(self, username: str, password: str) -> Optional[Dict]:
        """التحقق من بيانات المستخدم"""
        try:
            response = self.client.table("users").select("*").eq("username", username).eq("password", password).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            st.error(f"خطأ في المصادقة: {e}")
            return None
    
    def get_all_users(self) -> List[Dict]:
        """جلب جميع المستخدمين"""
        try:
            response = self.client.table("users").select("*").order("created_at", desc=True).execute()
            return response.data
        except Exception as e:
            st.error(f"خطأ في جلب المستخدمين: {e}")
            return []
    
    # ==================== إدارة القاعات ====================
    
    def create_hall(self, name: str, hall_type: str, capacity: int, color: str = None) -> Dict:
        """إنشاء قاعة جديدة"""
        try:
            data = {
                "name": name,
                "type": hall_type,
                "capacity": capacity,
                "current": 0,
                "status": "OPEN",
                "active": True,
                "color": color,
                "created_at": datetime.now().isoformat()
            }
            response = self.client.table("halls").insert(data).execute()
            return {"success": True, "data": response.data}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def get_all_halls(self, active_only: bool = True) -> List[Dict]:
        """جلب جميع القاعات"""
        try:
            query = self.client.table("halls").select("*")
            if active_only:
                query = query.eq("active", True)
            response = query.order("name").execute()
            return response.data
        except Exception as e:
            st.error(f"خطأ في جلب القاعات: {e}")
            return []
    
    def get_hall(self, hall_id: int) -> Optional[Dict]:
        """جلب قاعة محددة"""
        try:
            response = self.client.table("halls").select("*").eq("id", hall_id).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            st.error(f"خطأ في جلب القاعة: {e}")
            return None
    
    def update_hall_current(self, hall_id: int, increment: int) -> Dict:
        """تحديث العدد الحالي في القاعة"""
        try:
            # جلب القيمة الحالية
            hall = self.get_hall(hall_id)
            if not hall:
                return {"success": False, "error": "القاعة غير موجودة"}
            
            new_value = hall['current'] + increment
            if new_value < 0:
                new_value = 0
            elif new_value > hall['capacity']:
                return {"success": False, "error": "تجاوز السعة القصوى"}
            
            # تحديث القيمة
            response = self.client.table("halls").update({"current": new_value}).eq("id", hall_id).execute()
            return {"success": True, "data": response.data}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def set_hall_current(self, hall_id: int, value: int) -> Dict:
        """تعيين العدد الحالي في القاعة"""
        try:
            response = self.client.table("halls").update({"current": value}).eq("id", hall_id).execute()
            return {"success": True, "data": response.data}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def toggle_hall_status(self, hall_id: int) -> Dict:
        """تبديل حالة القاعة (OPEN/PAUSED)"""
        try:
            hall = self.get_hall(hall_id)
            if not hall:
                return {"success": False, "error": "القاعة غير موجودة"}
            
            new_status = "PAUSED" if hall['status'] == "OPEN" else "OPEN"
            response = self.client.table("halls").update({"status": new_status}).eq("id", hall_id).execute()
            return {"success": True, "data": response.data}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def delete_hall(self, hall_id: int) -> Dict:
        """حذف قاعة (soft delete)"""
        try:
            response = self.client.table("halls").update({"active": False}).eq("id", hall_id).execute()
            return {"success": True, "data": response.data}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    # ==================== الإعدادات العامة ====================
    
    def get_global_settings(self) -> Dict:
        """جلب الإعدادات العامة"""
        try:
            response = self.client.table("global_settings").select("*").limit(1).execute()
            if response.data:
                return response.data[0]
            else:
                # إنشاء إعدادات افتراضية
                default_settings = {
                    "outdoor_queue": 0,
                    "served_count": 0,
                    "updated_at": datetime.now().isoformat()
                }
                self.client.table("global_settings").insert(default_settings).execute()
                return default_settings
        except Exception as e:
            st.error(f"خطأ في جلب الإعدادات: {e}")
            return {"outdoor_queue": 0, "served_count": 0}
    
    def update_outdoor_queue(self, increment: int) -> Dict:
        """تحديث قائمة الانتظار الخارجية"""
        try:
            settings = self.get_global_settings()
            new_value = settings.get('outdoor_queue', 0) + increment
            if new_value < 0:
                new_value = 0
            
            response = self.client.table("global_settings").update({
                "outdoor_queue": new_value,
                "updated_at": datetime.now().isoformat()
            }).eq("id", settings.get('id')).execute()
            
            return {"success": True, "data": response.data}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def update_served_count(self, increment: int) -> Dict:
        """تحديث عدد المخدومين"""
        try:
            settings = self.get_global_settings()
            new_value = settings.get('served_count', 0) + increment
            if new_value < 0:
                new_value = 0
            
            response = self.client.table("global_settings").update({
                "served_count": new_value,
                "updated_at": datetime.now().isoformat()
            }).eq("id", settings.get('id')).execute()
            
            return {"success": True, "data": response.data}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def reset_settings(self, reset_served: bool = False, reset_queue: bool = False) -> Dict:
        """إعادة تعيين الإعدادات"""
        try:
            settings = self.get_global_settings()
            updates = {"updated_at": datetime.now().isoformat()}
            
            if reset_served:
                updates["served_count"] = 0
            if reset_queue:
                updates["outdoor_queue"] = 0
            
            response = self.client.table("global_settings").update(updates).eq("id", settings.get('id')).execute()
            return {"success": True, "data": response.data}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    # ==================== سجل النشاطات ====================
    
    def log_activity(self, user: str, action: str, details: str, hall_id: int = None) -> Dict:
        """تسجيل نشاط"""
        try:
            data = {
                "user": user,
                "action": action,
                "details": details,
                "hall_id": hall_id,
                "timestamp": datetime.now().isoformat()
            }
            response = self.client.table("activity_logs").insert(data).execute()
            return {"success": True, "data": response.data}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def get_activity_logs(self, limit: int = 50, hall_id: int = None) -> List[Dict]:
        """جلب سجل النشاطات"""
        try:
            query = self.client.table("activity_logs").select("*")
            if hall_id:
                query = query.eq("hall_id", hall_id)
            response = query.order("timestamp", desc=True).limit(limit).execute()
            return response.data
        except Exception as e:
            st.error(f"خطأ في جلب السجل: {e}")
            return []
    
    # ==================== إدارة البلاغات ====================
    
    def create_incident(self, user: str, hall_id: int, description: str, 
                       priority: str = "MEDIUM", image_url: str = None) -> Dict:
        """إنشاء بلاغ"""
        try:
            data = {
                "user": user,
                "hall_id": hall_id,
                "description": description,
                "priority": priority,
                "status": "NEW",
                "image_url": image_url,
                "created_at": datetime.now().isoformat()
            }
            response = self.client.table("incidents").insert(data).execute()
            return {"success": True, "data": response.data}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def get_incidents(self, status: str = None) -> List[Dict]:
        """جلب البلاغات"""
        try:
            query = self.client.table("incidents").select("*, halls(name)")
            if status:
                query = query.eq("status", status)
            response = query.order("created_at", desc=True).execute()
            return response.data
        except Exception as e:
            st.error(f"خطأ في جلب البلاغات: {e}")
            return []
    
    def update_incident_status(self, incident_id: int, status: str, notes: str = None) -> Dict:
        """تحديث حالة البلاغ"""
        try:
            updates = {
                "status": status,
                "updated_at": datetime.now().isoformat()
            }
            if notes:
                updates["resolution_notes"] = notes
            
            response = self.client.table("incidents").update(updates).eq("id", incident_id).execute()
            return {"success": True, "data": response.data}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    # ==================== إحصائيات ====================
    
    def get_statistics(self) -> Dict:
        """جلب إحصائيات النظام"""
        try:
            halls = self.get_all_halls()
            settings = self.get_global_settings()
            
            total_capacity = sum(h['capacity'] for h in halls)
            total_current = sum(h['current'] for h in halls)
            occupancy_rate = (total_current / total_capacity * 100) if total_capacity > 0 else 0
            
            return {
                "total_halls": len(halls),
                "total_capacity": total_capacity,
                "total_current": total_current,
                "outdoor_queue": settings.get('outdoor_queue', 0),
                "served_count": settings.get('served_count', 0),
                "occupancy_rate": round(occupancy_rate, 2),
                "total_in_system": total_current + settings.get('outdoor_queue', 0)
            }
        except Exception as e:
            st.error(f"خطأ في جلب الإحصائيات: {e}")
            return {}


# ==================== دوال مساعدة ====================

@st.cache_resource
def get_database() -> B36Database:
    """الحصول على اتصال قاعدة البيانات (cached)"""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    
    if not url or not key:
        st.error("⚠️ بيانات الاتصال بقاعدة البيانات غير موجودة!")
        st.stop()
    
    return B36Database(url, key)
