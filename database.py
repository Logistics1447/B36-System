import streamlit as st
from supabase import create_client, Client
import pandas as pd
from datetime import datetime
import os
from dotenv import load_dotenv

# محاولة تحميل ملف .env إذا كان موجوداً (للتشغيل المحلي)
load_dotenv()

class B36Database:
    def __init__(self, url: str, key: str):
        self.url = url
        self.key = key
        # إنشاء اتصال Supabase
        try:
            self.client: Client = create_client(url, key)
        except Exception as e:
            st.error(f"خطأ في تهيئة الاتصال: {e}")
            raise e

    def fetch_data(self, table_name: str):
        """جلب البيانات من جدول معين"""
        try:
            response = self.client.table(table_name).select("*").execute()
            return response.data
        except Exception as e:
            st.error(f"خطأ في جلب البيانات من {table_name}: {e}")
            return []

    def insert_data(self, table_name: str, data: dict):
        """إدخال بيانات جديدة"""
        try:
            response = self.client.table(table_name).insert(data).execute()
            return response.data
        except Exception as e:
            st.error(f"خطأ في الإدخال في {table_name}: {e}")
            return None

    def update_data(self, table_name: str, data: dict, match_column: str, match_value):
        """تحديث بيانات"""
        try:
            response = self.client.table(table_name).update(data).eq(match_column, match_value).execute()
            return response.data
        except Exception as e:
            st.error(f"خطأ في التحديث في {table_name}: {e}")
            return None

    def delete_data(self, table_name: str, match_column: str, match_value):
        """حذف بيانات"""
        try:
            response = self.client.table(table_name).delete().eq(match_column, match_value).execute()
            return response.data
        except Exception as e:
            st.error(f"خطأ في الحذف من {table_name}: {e}")
            return None

    # دوال مساعدة إضافية قد يحتاجها التصميم القديم
    def get_halls(self):
        return self.fetch_data("halls")
        
    def get_courses(self):
        return self.fetch_data("courses")

    def get_instructors(self):
        return self.fetch_data("instructors")

@st.cache_resource
def get_database():
    """دالة لإنشاء وإرجاع كائن قاعدة البيانات مع التعامل مع الأسرار"""
    try:
        # المحاولة الأولى: من أسرار Streamlit (للسيرفر)
        url = st.secrets["SUPABASE_URL"]
        key = st.secrets["SUPABASE_KEY"]
    except Exception:
        try:
            # المحاولة الثانية: من متغيرات البيئة (للتشغيل المحلي)
            url = os.getenv("SUPABASE_URL")
            key = os.getenv("SUPABASE_KEY")
        except Exception:
            url = None
            key = None

    if not url or not key:
        st.error("❌ لم يتم العثور على معلومات الاتصال (Secrets/Env missing).")
        st.stop()

    return B36Database(url, key)
