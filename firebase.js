// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// REEMPLAZA ESTE OBJETO CON LA CONFIGURACIÓN DE TU PROYECTO FIREBASE
const firebaseConfig = {
    apiKey: "TU_API_KEY",
    authDomain: "tu-proyecto.firebaseapp.com",
    projectId: "tu-proyecto",
    storageBucket: "tu-proyecto.appspot.com",
    messagingSenderId: "SENDER_ID",
    appId: "APP_ID"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Exportar instancias para usarlas en app.js
export { auth, db };