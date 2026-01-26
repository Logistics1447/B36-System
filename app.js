import { getFirestore, collection, doc, onSnapshot, getDoc, getDocs, setDoc, updateDoc, increment, writeBatch, deleteDoc, serverTimestamp, query, orderBy, limit, where, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAHzKx8e5cXP33zfSON_X1RC4Ek7JukaPg",
    authDomain: "b36-hall-mgmt.firebaseapp.com",
    projectId: "b36-hall-mgmt",
    storageBucket: "b36-hall-mgmt.firebasestorage.app",
    messagingSenderId: "972582807480",
    appId: "1:972582807480:web:bf5080de188b588325d14d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ============================================
// RBAC SYSTEM - نظام الأدوار والصلاحيات
// ============================================

const ROLES = {
    ADMIN: 'مدير_عام',
    EXTERNAL_SUPERVISOR: 'منظم_خارجي_مشرف',
    EXTERNAL_REGULAR: 'منظم_خارجي_عادي',
    INTERNAL_SUPERVISOR: 'منظم_داخلي_مشرف',
    INTERNAL_REGULAR: 'منظم_داخلي_عادي',
    PATH_ORGANIZER: 'منظم_مسار',
    VIEWER: 'عارض'
};

const PERMISSIONS = {