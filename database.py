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
    # 1. دوال النظام القديم (لحل مشكلة AttributeError)
    # ==========================================
    
    def get_all_halls(self):
        """دالة خاصة لجلب القاعات كما يطلبها التصميم القديم"""
        return self.fetch_data("halls")

    def get_all_courses(self):
        """دالة خاصة لجلب الدورات"""
        return self.fetch_data("courses")

    def get_all_instructors(self):
        """دالة خاصة لجلب المدربين"""
        return self.fetch_data("instructors")

    def get_all_users(self):
        """دالة خاصة لجلب المستخدمين (لصفحة الإعدادات)"""
        return self.fetch_data("users")

    def get_statistics(self):
        """جلب الإحصائيات للوحة التحكم"""
        try:
            halls = self.fetch_data("halls")
            courses = self.fetch_data("courses")
            instructors = self.fetch_data("instructors")
            return {
                "halls": len(halls),
                "courses": len(courses),
                "instructors": len(instructors)
            }
        except:
            return {"halls": 0, "courses": 0, "instructors": 0}

    def authenticate_user(self, username, password):
        """التحقق من المستخدم"""
        try:
            response = self.client.table("users").select("*").eq("username", username).eq("password", password).execute()
            if response.data and len(response.data) > 0:
                return response.data[0]
            return None
        except:
            return None

    # ==========================================
    # 2. الدوال الأساسية (المحرك الخلفي)
    # ==========================================

    def fetch_data(self, table_name: str):
        try:
            response = self.client.table(table_name).select("*").execute()
            return response.data
        except Exception as e:
            # st.error(f"Error fetching {table_name}: {e}") # تم اخفاء الخطأ لتجميل الواجهة
            return []

    def insert_data(self, table_name: str, data: dict):
        try:
            response = self.client.table(table_name).insert(data).execute()
            return response.data
        except Exception as e:
            st.error(f"Error inserting: {e}")
            return None

    def update_data(self, table_name: str, data: dict, match_column: str, match_value):
        try:
            response = self.client.table(table_name).update(data).eq(match_column, match_value).execute()
            return response.data
        except Exception as e:
            st.error(f"Error updating: {e}")
            return None

    def delete_data(self, table_name: str, match_column: str, match_value):
        try:
            response = self.client.table(table_name).delete().eq(match_column, match_value).execute()
            return response.data
        except Exception as e:
            st.error(f"Error deleting: {e}")
            return None

# ==========================================
# 3. دالة التهيئة والاتصال
# ==========================================
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
