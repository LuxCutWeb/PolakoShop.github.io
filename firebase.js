/* ==========================================================================
   POLAKOSHOP: INTEGRACIÓN DIRECTA CON FIREBASE (MÓDULOS ESM NATIVOS)
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    updateProfile, 
    updatePassword, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    orderBy, 
    limit 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Configuración de Firebase - Reemplazar por tus credenciales de consola Firebase
// Import the functions you need from the SDKs you need

//aca iba lo q borre de 2//

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyD2lQU4sY2fhfN1A13PPJ1ZcrLILJw6II8",
  authDomain: "polakoshop-9b3d9.firebaseapp.com",
  projectId: "polakoshop-9b3d9",
  storageBucket: "polakoshop-9b3d9.firebasestorage.app",
  messagingSenderId: "702207897369",
  appId: "1:702207897369:web:aa1eb14f81e3b749db9f88",
  measurementId: "G-BEHS232718"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// 👇 ESTAS SON LAS DOS LÍNEAS NUEVAS QUE DEBES PONER 👇
const auth = getAuth(app);
const db = getFirestore(app);

// ID del administrador maestro (se almacena como campo en Firestore o UID definido)
const ADMIN_EMAIL = "jeremyalexandercubasomonte@gmail.com";
/* ==========================================================================
   MÓDULO: AUTENTICACIÓN
   ========================================================================== */

export async function signUpUser(email, password, name) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        await updateProfile(user, {
            displayName: name,
            photoURL: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=250&auto=format&fit=crop"
        });

        // Crear documento del usuario en Firestore
        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            name: name,
            email: email,
            role: email.toLowerCase() === ADMIN_EMAIL.toLowerCase() ? "admin" : "client",
            photoURL: user.photoURL,
            createdAt: new Date().toISOString()
        });

        return user;
    } catch (error) {
        throw new Error(error.message);
    }
}

export async function loginUser(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return userCredential.user;
    } catch (error) {
        throw new Error(error.message);
    }
}

export async function logoutUser() {
    try {
        await signOut(auth);
    } catch (error) {
        throw new Error(error.message);
    }
}

export async function updateUserData(name, photoURL) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("No hay usuario autenticado.");

        await updateProfile(user, { displayName: name, photoURL: photoURL });
        
        await updateDoc(doc(db, "users", user.uid), {
            name: name,
            photoURL: photoURL
        });

        return user;
    } catch (error) {
        throw new Error(error.message);
    }
}

export async function changeUserPassword(newPass) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("No hay usuario autenticado.");
        await updatePassword(user, newPass);
    } catch (error) {
        throw new Error(error.message);
    }
}

export async function getUserProfile(uid) {
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return docSnap.data();
    } else {
        return null;
    }
}

/* ==========================================================================
   MÓDULO: GESTIÓN DE PRODUCTOS (CRUD FIRESTORE)
   ========================================================================= */

export async function createProduct(productData) {
    try {
        const docRef = await addDoc(collection(db, "products"), {
            ...productData,
            createdAt: new Date().toISOString(),
            salesCount: 0
        });
        return docRef.id;
    } catch (error) {
        throw new Error(error.message);
    }
}

export async function getAllProducts() {
    try {
        const querySnapshot = await getDocs(collection(db, "products"));
        const products = [];
        querySnapshot.forEach((doc) => {
            products.push({ id: doc.id, ...doc.data() });
        });
        return products;
    } catch (error) {
        throw new Error(error.message);
    }
}

export async function updateProductData(productId, updatedData) {
    try {
        const docRef = doc(db, "products", productId);
        await updateDoc(docRef, updatedData);
    } catch (error) {
        throw new Error(error.message);
    }
}

export async function deleteProductFromDb(productId) {
    try {
        await deleteDoc(doc(db, "products", productId));
    } catch (error) {
        throw new Error(error.message);
    }
}

/* ==========================================================================
   MÓDULO: FAVORITOS
   ========================================================================== */

export async function toggleFavoriteInDb(userId, productId) {
    try {
        const favRef = doc(db, "favorites", `${userId}_${productId}`);
        const docSnap = await getDoc(favRef);

        if (docSnap.exists()) {
            await deleteDoc(favRef);
            return false; // Eliminado
        } else {
            await setDoc(favRef, {
                userId,
                productId,
                createdAt: new Date().toISOString()
            });
            return true; // Agregado
        }
    } catch (error) {
        throw new Error(error.message);
    }
}

export async function getUserFavorites(userId) {
    try {
        const q = query(collection(db, "favorites"), where("userId", "==", userId));
        const querySnapshot = await getDocs(q);
        const favoriteIds = [];
        querySnapshot.forEach((doc) => {
            favoriteIds.push(doc.data().productId);
        });
        return favoriteIds;
    } catch (error) {
        throw new Error(error.message);
    }
}

/* ==========================================================================
   MÓDULO: PEDIDOS HISTÓRICOS
   ========================================================================== */

export async function createOrderInDb(userId, items, total) {
    try {
        const orderData = {
            userId: userId || "guest",
            items: items.map(i => ({ id: i.id, name: i.name, quantity: i.quantity, price: i.price })),
            total: total,
            status: "pendiente",
            createdAt: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, "orders"), orderData);
        
        // Actualizar contador de ventas en background
        for (const item of items) {
            const productRef = doc(db, "products", item.id);
            const prodSnap = await getDoc(productRef);
            if (prodSnap.exists()) {
                const currentSales = prodSnap.data().salesCount || 0;
                const currentStock = prodSnap.data().stock || 0;
                await updateDoc(productRef, {
                    salesCount: currentSales + item.quantity,
                    stock: Math.max(0, currentStock - item.quantity)
                });
            }
        }
        return docRef.id;
    } catch (error) {
        throw new Error(error.message);
    }
}

export async function getUserOrdersFromDb(userId) {
    try {
        const q = query(collection(db, "orders"), where("userId", "==", userId));
        const querySnapshot = await getDocs(q);
        const orders = [];
        querySnapshot.forEach((doc) => {
            orders.push({ id: doc.id, ...doc.data() });
        });
        return orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
        throw new Error(error.message);
    }
}

export async function getAllOrdersAdmin() {
    try {
        const querySnapshot = await getDocs(collection(db, "orders"));
        const orders = [];
        querySnapshot.forEach((doc) => {
            orders.push({ id: doc.id, ...doc.data() });
        });
        return orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
        throw new Error(error.message);
    }
}

export async function updateOrderStatus(orderId, newStatus) {
    try {
        const orderRef = doc(db, "orders", orderId);
        await updateDoc(orderRef, { status: newStatus });
    } catch (error) {
        throw new Error(error.message);
    }
}

export async function getSystemStats() {
    try {
        const usersSnap = await getDocs(collection(db, "users"));
        const productsSnap = await getDocs(collection(db, "products"));
        const ordersSnap = await getDocs(collection(db, "orders"));

        return {
            usersCount: usersSnap.size,
            productsCount: productsSnap.size,
            ordersCount: ordersSnap.size
        };
    } catch (error) {
        throw new Error(error.message);
    }
}

// Exportación global de herramientas Firebase
export { auth, db, onAuthStateChanged };
