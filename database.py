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
            # إنشاء اتصال Supabase
            self.client: Client = create_client(url, key)
        except Exception as e:
            st.error(f"خطأ في الاتصال بقاعدة البيانات: {e}")
            raise e

    # --- الدالة التي كانت ناقصة (إصلاح المشكلة) ---
    def authenticate_user(self, username, password):
        """التحقق من صحة اسم المستخدم وكلمة المرور"""
        try:
            # البحث في جدول users عن المستخدم
            response = self.client.table("users").select("*").eq("username", username).eq("password", password).execute()
            
            # إذا وجدنا نتيجة، يعني البيانات صحيحة
            if response.data and len(response.data) > 0:
                return response.data[0]
            return None
        except Exception as e:
            # في حال حدوث خطأ، نطبع رسالة للتوضيح
            print(f"Auth Error: {e}")
            return None

    # --- باقي الدوال الأساسية ---
    def fetch_data(self, table_name: str):
        try:
            response = self.client.table(table_name).select("*").execute()
            return response.data
        except Exception as e:
            st.error(f"Error fetching {table_name}: {e}")
            return []

    def insert_data(self, table_name: str, data: dict):
        try:
            response = self.client.table(table_name).insert(data).execute()
            return response.data
        except Exception as e:
            st.error(f"Error inserting into {table_name}: {e}")
            return None

    def update_data(self, table_name: str, data: dict, match_column: str, match_value):
        try:
            response = self.client.table(table_name).update(data).eq(match_column, match_value).execute()
            return response.data
        except Exception as e:
            st.error(f"Error updating {table_name}: {e}")
            return None

    def delete_data(self, table_name: str, match_column: str, match_value):
        try:
            response = self.client.table(table_name).delete().eq(match_column, match_value).execute()
            return response.data
        except Exception as e:
            st.error(f"Error deleting from {table_name}: {e}")
            return None

    # دوال مساعدة للتصميم القديم
    def get_halls(self):
        return self.fetch_data("halls")
        
    def get_courses(self):
        return self.fetch_data("courses")

    def get_instructors(self):
        return self.fetch_data("instructors")

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
        st.error("بيانات الاتصال مفقودة (Secrets/Env).")
        st.stop()

    return B36Database(url, key)
