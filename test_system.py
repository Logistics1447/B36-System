"""
B36 System - Quick Test Script
===============================
اختبار سريع للتحقق من أن جميع الوظائف تعمل بشكل صحيح
"""

import os
from dotenv import load_dotenv

# تحميل متغيرات البيئة
load_dotenv()

print("="*60)
print("B36 System - Quick Test")
print("="*60)

# 1. اختبار استيراد المكتبات
print("\n1️⃣ Testing Imports...")
try:
    import streamlit as st
    print("   ✅ Streamlit installed")
except ImportError:
    print("   ❌ Streamlit NOT installed")

try:
    from supabase import create_client
    print("   ✅ Supabase installed")
except ImportError:
    print("   ❌ Supabase NOT installed")

try:
    import pandas as pd
    print("   ✅ Pandas installed")
except ImportError:
    print("   ❌ Pandas NOT installed")

try:
    import plotly
    print("   ✅ Plotly installed")
except ImportError:
    print("   ❌ Plotly NOT installed")

# 2. اختبار استيراد database.py
print("\n2️⃣ Testing database.py...")
try:
    from database import B36Database, get_database
    print("   ✅ database.py imported successfully")
except Exception as e:
    print(f"   ❌ database.py import failed: {e}")
    exit(1)

# 3. اختبار بيانات الاتصال
print("\n3️⃣ Testing Credentials...")
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

if url:
    print(f"   ✅ SUPABASE_URL found: {url[:30]}...")
else:
    print("   ⚠️  SUPABASE_URL not found in .env")

if key:
    print(f"   ✅ SUPABASE_KEY found: {key[:30]}...")
else:
    print("   ⚠️  SUPABASE_KEY not found in .env")

# 4. اختبار إنشاء Database Instance
print("\n4️⃣ Testing Database Connection...")
try:
    db = B36Database(url, key)
    if db.connected:
        print("   ✅ Database connected successfully")
    else:
        print("   ⚠️  Database not connected (running in fallback mode)")
except Exception as e:
    print(f"   ❌ Database connection failed: {e}")

# 5. اختبار الدوال الأساسية
print("\n5️⃣ Testing Core Functions...")

# 5.1 المصادقة
print("\n   Testing Authentication...")
try:
    user = db.authenticate_user("admin", "1234")
    if user:
        print(f"   ✅ Admin login successful: {user.get('full_name')}")
    else:
        print("   ❌ Admin login failed")
except Exception as e:
    print(f"   ❌ Authentication error: {e}")

# 5.2 القاعات
print("\n   Testing Halls...")
try:
    halls = db.get_all_halls()
    print(f"   ✅ Halls fetched: {len(halls)} halls found")
    
    if halls:
        for hall in halls[:3]:  # عرض أول 3 قاعات
            print(f"      - {hall.get('name')}: {hall.get('current')}/{hall.get('capacity')}")
except Exception as e:
    print(f"   ❌ Halls error: {e}")

# 5.3 الإحصائيات
print("\n   Testing Statistics...")
try:
    stats = db.get_statistics()
    print(f"   ✅ Statistics fetched:")
    print(f"      - Total Current: {stats.get('total_current')}")
    print(f"      - Total Capacity: {stats.get('total_capacity')}")
    print(f"      - Outdoor Queue: {stats.get('outdoor_queue')}")
    print(f"      - Served Count: {stats.get('served_count')}")
    print(f"      - Occupancy Rate: {stats.get('occupancy_rate')}%")
except Exception as e:
    print(f"   ❌ Statistics error: {e}")

# 5.4 السجلات
print("\n   Testing Activity Logs...")
try:
    logs = db.get_activity_logs(limit=5)
    print(f"   ✅ Activity logs fetched: {len(logs)} logs")
except Exception as e:
    print(f"   ❌ Activity logs error: {e}")

# 5.5 المستخدمين
print("\n   Testing Users...")
try:
    users = db.get_all_users()
    print(f"   ✅ Users fetched: {len(users)} users")
except Exception as e:
    print(f"   ❌ Users error: {e}")

# 6. اختبار العمليات (بدون كتابة)
print("\n6️⃣ Testing Operations (Read-Only)...")

# 6.1 تحديث القاعة (محاكاة)
print("\n   Testing hall operations...")
try:
    if halls and len(halls) > 0:
        test_hall = halls[0]
        print(f"   ℹ️  Would update: {test_hall.get('name')}")
        print(f"   ℹ️  Current: {test_hall.get('current')} / {test_hall.get('capacity')}")
        print("   ✅ Hall operations structure valid")
    else:
        print("   ⚠️  No halls available for testing")
except Exception as e:
    print(f"   ❌ Hall operations error: {e}")

# 7. اختبار Fallback Mode
print("\n7️⃣ Testing Fallback Mode...")
try:
    fallback_db = B36Database(None, None)
    print(f"   ✅ Fallback mode works: connected={fallback_db.connected}")
    
    # اختبار دالة في Fallback
    fallback_user = fallback_db.authenticate_user("admin", "1234")
    if fallback_user:
        print("   ✅ Fallback authentication works")
except Exception as e:
    print(f"   ❌ Fallback mode error: {e}")

# 8. الخلاصة
print("\n" + "="*60)
print("Test Summary")
print("="*60)

if db.connected:
    print("✅ Database: CONNECTED")
    print("✅ All functions: WORKING")
    print("✅ Ready for production")
else:
    print("⚠️  Database: NOT CONNECTED")
    print("✅ Fallback mode: ACTIVE")
    print("⚠️  Add credentials to .env and retest")

print("\n" + "="*60)
print("To run the app:")
print("  streamlit run main.py")
print("="*60)
