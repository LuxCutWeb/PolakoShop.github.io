import { 
    auth, db, 
    onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, updateProfile,
    collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, serverTimestamp, setDoc, getDoc
} from './firebase.js';

/* ============================
   ESTADO GLOBAL DE LA APLICACIÓN
   ============================ */
const appState = {
    user: null,
    isAdmin: false,
    products: [],
    cart: JSON.parse(localStorage.getItem('polakoshop_cart')) || [],
    favorites: JSON.parse(localStorage.getItem('polakoshop_favs')) || [],
    categories: [
        'Polos', 'Camisetas', 'Chompas', 'Casacas', 'Poleras', 'Pantalones', 
        'Jeans', 'Joggers', 'Shorts', 'Ropa deportiva', 'Medias', 'Calzoncillos', 
        'Boxers', 'Zapatos', 'Zapatillas', 'Sandalias', 'Gorras', 'Mochilas', 'Accesorios'
    ]
};

/* ============================
   SISTEMA DE NAVEGACIÓN (SPA)
   ============================ */
const views = ['home', 'catalog', 'cart', 'favorites', 'orders', 'profile', 'admin', 'login'];

function navigate(targetView) {
    // Proteger rutas
    if (['favorites', 'orders', 'profile'].includes(targetView) && !appState.user) {
        showToast('Debes iniciar sesión primero', 'error');
        targetView = 'login';
    }
    if (targetView === 'admin' && !appState.isAdmin) {
        showToast('Acceso denegado', 'error');
        targetView = 'home';
    }

    views.forEach(view => {
        document.getElementById(`view-${view}`).classList.remove('active');
    });
    document.getElementById(`view-${targetView}`).classList.add('active');
    
    // Actualizar nav active state
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active-nav'));
    const activeNav = document.querySelector(`.nav-links li[data-target="${targetView}"]`);
    if(activeNav) activeNav.classList.add('active-nav');
    
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Ejecutar lógicas por vista
    if (targetView === 'home') renderHome();
    if (targetView === 'catalog') renderCatalog();
    if (targetView === 'cart') renderCart();
    if (targetView === 'favorites') renderFavorites();
    if (targetView === 'admin') loadAdminDashboard();
    
    // Cerrar menú móvil si está abierto
    document.querySelector('.nav-links').classList.remove('active');
}

// Listeners Nav
document.querySelectorAll('[data-target]').forEach(elem => {
    elem.addEventListener('click', (e) => {
        navigate(e.currentTarget.getAttribute('data-target'));
    });
});
document.querySelector('.hamburger').addEventListener('click', () => {
    document.querySelector('.nav-links').classList.toggle('active');
});

// Exponer navigate globalmente (para onclick en html)
window.app = { navigate };

/* ============================
   UTILIDADES UI (Toasts, Skeletons)
   ============================ */
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

const formatMoney = (amount) => `S/ ${parseFloat(amount).toFixed(2)}`;

function renderSkeletons(containerId, count) {
    const container = document.getElementById(containerId);
    container.innerHTML = Array(count).fill('<div class="skeleton skeleton-card"></div>').join('');
}

/* ============================
   AUTENTICACIÓN
   ============================ */
let isLoginMode = true;

document.getElementById('toggle-auth').addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    document.getElementById('auth-title').innerText = isLoginMode ? 'Iniciar Sesión' : 'Crear Cuenta';
    document.getElementById('auth-name').style.display = isLoginMode ? 'none' : 'block';
    document.getElementById('auth-submit').innerText = isLoginMode ? 'Entrar' : 'Registrarse';
    document.getElementById('toggle-auth').innerText = isLoginMode ? '¿No tienes cuenta? Regístrate aquí' : '¿Ya tienes cuenta? Inicia sesión';
});

document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name').value;
    
    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, pass);
            showToast('Sesión iniciada correctamente');
        } else {
            const userCred = await createUserWithEmailAndPassword(auth, email, pass);
            await updateProfile(userCred.user, { displayName: name });
            // Guardar en Firestore con rol normal
            await setDoc(doc(db, 'users', userCred.user.uid), {
                name: name, email: email, role: 'user', createdAt: serverTimestamp()
            });
            showToast('Cuenta creada exitosamente');
        }
        document.getElementById('auth-form').reset();
        navigate('home');
    } catch (error) {
        showToast(error.message.replace('Firebase:', ''), 'error');
    }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
    await signOut(auth);
    showToast('Sesión cerrada');
    navigate('home');
});

document.getElementById('forgot-password').addEventListener('click', async () => {
    const email = prompt("Ingresa tu correo para recuperar contraseña:");
    if(email) {
        try {
            await sendPasswordResetEmail(auth, email);
            showToast('Correo de recuperación enviado');
        } catch(e) {
            showToast('Error al enviar correo', 'error');
        }
    }
});

onAuthStateChanged(auth, async (user) => {
    appState.user = user;
    
    document.querySelectorAll('.guest-required').forEach(el => el.style.display = user ? 'none' : 'flex');
    document.querySelectorAll('.auth-required').forEach(el => el.style.display = user ? 'flex' : 'none');
    
    if (user) {
        document.getElementById('profile-name').innerText = user.displayName || 'Usuario';
        document.getElementById('profile-email').innerText = user.email;
        
        // Verificar Rol Admin
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if(userDoc.exists() && userDoc.data().role === 'admin') {
            appState.isAdmin = true;
            document.querySelectorAll('.admin-required').forEach(el => el.style.display = 'flex');
        } else {
            appState.isAdmin = false;
            document.querySelectorAll('.admin-required').forEach(el => el.style.display = 'none');
            if(document.getElementById('view-admin').classList.contains('active')) navigate('home');
        }
    } else {
        appState.isAdmin = false;
        document.querySelectorAll('.admin-required').forEach(el => el.style.display = 'none');
    }
});

/* ============================
   PRODUCTOS Y CATÁLOGO
   ============================ */
async function loadProducts() {
    if(appState.products.length === 0) renderSkeletons('catalog-products', 8);
    const querySnapshot = await getDocs(collection(db, "products"));
    const products = [];
    querySnapshot.forEach((doc) => {
        products.push({ id: doc.id, ...doc.data() });
    });
    appState.products = products;
    renderCatalog();
    renderHome();
}

function generateProductCard(product) {
    const isFav = appState.favorites.includes(product.id);
    return `
        <div class="product-card" onclick="openProductModal('${product.id}')">
            <div class="fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite('${product.id}')">
                <i class="${isFav ? 'fas' : 'far'} fa-heart"></i>
            </div>
            <div class="img-container">
                <img src="${product.image}" alt="${product.name}" loading="lazy">
            </div>
            <div class="product-info">
                <div class="product-brand">${product.category}</div>
                <h3 class="product-name">${product.name}</h3>
                <div class="product-price">${formatMoney(product.price)}</div>
            </div>
        </div>
    `;
}

function renderHome() {
    const container = document.getElementById('home-new-products');
    const latest = [...appState.products].sort((a,b) => b.createdAt - a.createdAt).slice(0, 4);
    if(latest.length === 0) return container.innerHTML = '<p>No hay productos aún.</p>';
    container.innerHTML = latest.map(generateProductCard).join('');
}

function renderCatalog() {
    const container = document.getElementById('catalog-products');
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const category = document.getElementById('category-filter').value;
    const sortBy = document.getElementById('sort-filter').value;

    let filtered = appState.products.filter(p => {
        const matchSearch = p.name.toLowerCase().includes(searchTerm) || p.description.toLowerCase().includes(searchTerm);
        const matchCat = category === 'all' || p.category === category;
        return matchSearch && matchCat;
    });

    if(sortBy === 'price-asc') filtered.sort((a,b) => a.price - b.price);
    if(sortBy === 'price-desc') filtered.sort((a,b) => b.price - a.price);
    if(sortBy === 'newest') filtered.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    if(filtered.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 50px;">No se encontraron productos.</div>';
        return;
    }
    container.innerHTML = filtered.map(generateProductCard).join('');
}

// Poblar filtros
const catSelect = document.getElementById('category-filter');
appState.categories.forEach(c => catSelect.innerHTML += `<option value="${c}">${c}</option>`);

// Listeners Filtros
document.getElementById('search-input').addEventListener('input', renderCatalog);
document.getElementById('category-filter').addEventListener('change', renderCatalog);
document.getElementById('sort-filter').addEventListener('change', renderCatalog);

/* ============================
   MODAL DE PRODUCTO
   ============================ */
window.openProductModal = (id) => {
    const product = appState.products.find(p => p.id === id);
    if(!product) return;
    
    const isFav = appState.favorites.includes(product.id);
    const content = `
        <div class="product-detail">
            <img src="${product.image}" alt="${product.name}">
            <div class="product-detail-info">
                <h2>${product.name}</h2>
                <div class="price">${formatMoney(product.price)}</div>
                <p>${product.description}</p>
                <div style="font-size: 14px; color: var(--color-gray); margin-bottom: 20px;">
                    <strong>Categoría:</strong> ${product.category} <br>
                    <strong>Stock disponible:</strong> ${product.stock} unidades
                </div>
                <div class="modal-actions">
                    <button class="btn-primary" style="flex: 2" onclick="addToCart('${product.id}')">
                        <i class="fas fa-shopping-cart"></i> Agregar al Carrito
                    </button>
                    <button class="btn-secondary" style="flex: 1; color: ${isFav ? 'var(--color-danger)' : 'inherit'};" onclick="toggleFavorite('${product.id}'); openProductModal('${product.id}')">
                        <i class="${isFav ? 'fas' : 'far'} fa-heart"></i>
                    </button>
                    <button class="btn-secondary" onclick="navigator.clipboard.writeText(window.location.href); showToast('Enlace copiado')">
                        <i class="fas fa-share"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('modal-product-details').innerHTML = content;
    document.getElementById('product-modal').style.display = 'flex';
}

document.querySelector('.close-modal').addEventListener('click', () => {
    document.getElementById('product-modal').style.display = 'none';
});

/* ============================
   CARRITO Y FAVORITOS
   ============================ */
function updateCartBadge() {
    const count = appState.cart.reduce((sum, item) => sum + item.qty, 0);
    document.getElementById('cart-badge').innerText = count;
    localStorage.setItem('polakoshop_cart', JSON.stringify(appState.cart));
}

window.addToCart = (id) => {
    const product = appState.products.find(p => p.id === id);
    if(!product) return;
    if(product.stock <= 0) return showToast('Producto sin stock', 'error');

    const existing = appState.cart.find(item => item.id === id);
    if(existing) {
        if(existing.qty >= product.stock) return showToast('Stock máximo alcanzado', 'error');
        existing.qty += 1;
    } else {
        appState.cart.push({ ...product, qty: 1 });
    }
    
    updateCartBadge();
    showToast('Agregado al carrito');
    document.getElementById('product-modal').style.display = 'none';
    if(document.getElementById('view-cart').classList.contains('active')) renderCart();
}

window.updateCartQty = (id, delta) => {
    const item = appState.cart.find(i => i.id === id);
    const prod = appState.products.find(p => p.id === id);
    if(!item || !prod) return;

    item.qty += delta;
    if(item.qty <= 0) {
        appState.cart = appState.cart.filter(i => i.id !== id);
    } else if(item.qty > prod.stock) {
        item.qty = prod.stock;
        showToast('Stock máximo', 'error');
    }
    updateCartBadge();
    renderCart();
}

function renderCart() {
    const container = document.getElementById('cart-items');
    if(appState.cart.length === 0) {
        container.innerHTML = '<p style="padding:40px 0;">Tu carrito está vacío.</p>';
        document.getElementById('cart-subtotal').innerText = 'S/ 0.00';
        document.getElementById('cart-igv').innerText = 'S/ 0.00';
        document.getElementById('cart-total').innerText = 'S/ 0.00';
        return;
    }

    let subtotal = 0;
    container.innerHTML = appState.cart.map(item => {
        const totalItem = item.price * item.qty;
        subtotal += totalItem;
        return `
            <div class="cart-item">
                <img src="${item.image}" alt="${item.name}">
                <div class="cart-item-details">
                    <div class="cart-item-title">${item.name}</div>
                    <div class="cart-item-price">${formatMoney(item.price)}</div>
                    <div class="qty-controls">
                        <button class="qty-btn" onclick="updateCartQty('${item.id}', -1)">-</button>
                        <span>${item.qty}</span>
                        <button class="qty-btn" onclick="updateCartQty('${item.id}', 1)">+</button>
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight:600; margin-bottom: 10px;">${formatMoney(totalItem)}</div>
                    <div class="remove-item" onclick="updateCartQty('${item.id}', -999)"><i class="fas fa-trash"></i> Eliminar</div>
                </div>
            </div>
        `;
    }).join('');

    const igv = subtotal * 0.18;
    const total = subtotal + igv;

    document.getElementById('cart-subtotal').innerText = formatMoney(subtotal);
    document.getElementById('cart-igv').innerText = formatMoney(igv);
    document.getElementById('cart-total').innerText = formatMoney(total);
}

document.getElementById('btn-empty-cart').addEventListener('click', () => {
    if(confirm('¿Vaciar todo el carrito?')) {
        appState.cart = [];
        updateCartBadge();
        renderCart();
    }
});

document.getElementById('btn-checkout').addEventListener('click', async () => {
    if(appState.cart.length === 0) return showToast('El carrito está vacío', 'error');
    if(!appState.user) return navigate('login');
    
    document.getElementById('btn-checkout').innerText = 'Procesando...';
    
    // Calcular totales
    const subtotal = appState.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const total = subtotal * 1.18;

    try {
        // Guardar pedido en Firestore
        await addDoc(collection(db, "orders"), {
            userId: appState.user.uid,
            items: appState.cart,
            total: total,
            status: 'Completado',
            date: serverTimestamp()
        });

        // Actualizar Stock (Simplificado para frontend, ideal en Cloud Functions)
        for(let item of appState.cart) {
            const prodRef = doc(db, "products", item.id);
            await updateDoc(prodRef, { stock: item.stock - item.qty });
        }

        appState.cart = [];
        updateCartBadge();
        showToast('¡Compra realizada con éxito! Gracias.');
        loadProducts(); // Refrescar stock
        navigate('orders');
    } catch (error) {
        showToast('Error procesando compra', 'error');
    } finally {
        document.getElementById('btn-checkout').innerText = 'Procesar Compra';
    }
});

// FAVORITOS
window.toggleFavorite = (id) => {
    const idx = appState.favorites.indexOf(id);
    if(idx > -1) {
        appState.favorites.splice(idx, 1);
        showToast('Eliminado de favoritos');
    } else {
        appState.favorites.push(id);
        showToast('Agregado a favoritos');
    }
    localStorage.setItem('polakoshop_favs', JSON.stringify(appState.favorites));
    if(document.getElementById('view-catalog').classList.contains('active')) renderCatalog();
    if(document.getElementById('view-favorites').classList.contains('active')) renderFavorites();
    if(document.getElementById('view-home').classList.contains('active')) renderHome();
}

function renderFavorites() {
    const container = document.getElementById('favorites-grid');
    const favProds = appState.products.filter(p => appState.favorites.includes(p.id));
    if(favProds.length === 0) {
        container.innerHTML = '<p>No tienes favoritos aún.</p>';
        return;
    }
    container.innerHTML = favProds.map(generateProductCard).join('');
}

/* ============================
   PANEL DE ADMINISTRADOR
   ============================ */
// Tabs Admin
document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.admin-content').forEach(c => c.style.display = 'none');
        e.target.classList.add('active');
        const tab = e.target.getAttribute('data-tab');
        document.getElementById(`admin-${tab}`).style.display = 'block';
        if(tab === 'inventory') renderAdminProducts();
        if(tab === 'users') renderAdminUsers();
    });
});

async function loadAdminDashboard() {
    // Info Productos
    document.getElementById('stat-products').innerText = appState.products.length;
    
    // Traer Usuarios y Pedidos concurrentemente
    const [usersSnap, ordersSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "orders"))
    ]);
    
    document.getElementById('stat-users').innerText = usersSnap.size;
    document.getElementById('stat-orders').innerText = ordersSnap.size;
    
    let totalSales = 0;
    const activityHtml = [];
    ordersSnap.forEach(doc => {
        const d = doc.data();
        totalSales += d.total;
        activityHtml.push(`<div style="padding: 15px; border-bottom: 1px solid #eee;">
            Venta registrada por <strong>${formatMoney(d.total)}</strong> (${d.items.length} items) - Estado: ${d.status}
        </div>`);
    });
    
    document.getElementById('stat-sales').innerText = formatMoney(totalSales);
    document.getElementById('admin-recent-activity').innerHTML = activityHtml.slice(0, 5).join('') || '<p>No hay actividad reciente.</p>';
}

function renderAdminProducts() {
    const tbody = document.getElementById('admin-products-table');
    tbody.innerHTML = appState.products.map(p => `
        <tr>
            <td><img src="${p.image}" alt=""></td>
            <td><strong>${p.name}</strong></td>
            <td>${p.category}</td>
            <td>${formatMoney(p.price)}</td>
            <td>${p.stock} un.</td>
            <td class="action-icons">
                <i class="fas fa-edit" onclick="editProduct('${p.id}')"></i>
                <i class="fas fa-trash" onclick="deleteProduct('${p.id}')"></i>
            </td>
        </tr>
    `).join('');
}

async function renderAdminUsers() {
    const tbody = document.getElementById('admin-users-table');
    tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
    const usersSnap = await getDocs(collection(db, "users"));
    let html = '';
    usersSnap.forEach(doc => {
        const u = doc.data();
        const date = u.createdAt ? new Date(u.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';
        html += `
            <tr>
                <td>${u.name}</td>
                <td>${u.email}</td>
                <td><span style="background:${u.role==='admin'?'var(--color-black)':'#ccc'}; color:#fff; padding:2px 8px; border-radius:12px; font-size:12px;">${u.role.toUpperCase()}</span></td>
                <td>${date}</td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// Modal Formularios Admin (Almacén)
const adminModal = document.getElementById('admin-modal');
const apCategory = document.getElementById('ap-category');
appState.categories.forEach(c => apCategory.innerHTML += `<option value="${c}">${c}</option>`);

document.getElementById('btn-new-product').addEventListener('click', () => {
    document.getElementById('admin-product-form').reset();
    document.getElementById('ap-id').value = '';
    document.getElementById('admin-modal-title').innerText = 'Nuevo Producto';
    document.getElementById('ap-image-preview').style.display = 'none';
    adminModal.style.display = 'flex';
});

document.querySelector('.close-modal-admin').addEventListener('click', () => {
    adminModal.style.display = 'none';
});

// Preview Imagen URL
document.getElementById('ap-image').addEventListener('input', (e) => {
    const img = document.getElementById('ap-image-preview');
    if(e.target.value) {
        img.src = e.target.value;
        img.style.display = 'block';
    } else {
        img.style.display = 'none';
    }
});

// Guardar/Editar Producto
document.getElementById('admin-product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('ap-id').value;
    const data = {
        name: document.getElementById('ap-name').value,
        description: document.getElementById('ap-desc').value,
        price: parseFloat(document.getElementById('ap-price').value),
        stock: parseInt(document.getElementById('ap-stock').value),
        category: document.getElementById('ap-category').value,
        image: document.getElementById('ap-image').value
    };

    try {
        if(id) {
            await updateDoc(doc(db, "products", id), data);
            showToast('Producto actualizado');
        } else {
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, "products"), data);
            showToast('Producto creado exitosamente');
        }
        adminModal.style.display = 'none';
        await loadProducts(); // Recargar DB
        if(document.getElementById('view-admin').classList.contains('active')) renderAdminProducts();
    } catch(err) {
        showToast('Error al guardar: ' + err.message, 'error');
    }
});

window.editProduct = (id) => {
    const p = appState.products.find(x => x.id === id);
    if(!p) return;
    document.getElementById('ap-id').value = p.id;
    document.getElementById('ap-name').value = p.name;
    document.getElementById('ap-desc').value = p.description;
    document.getElementById('ap-price').value = p.price;
    document.getElementById('ap-stock').value = p.stock;
    document.getElementById('ap-category').value = p.category;
    document.getElementById('ap-image').value = p.image;
    
    document.getElementById('ap-image-preview').src = p.image;
    document.getElementById('ap-image-preview').style.display = 'block';
    
    document.getElementById('admin-modal-title').innerText = 'Editar Producto';
    adminModal.style.display = 'flex';
};

window.deleteProduct = async (id) => {
    if(confirm('¿Estás seguro de eliminar este producto irreversiblemente?')) {
        try {
            await deleteDoc(doc(db, "products", id));
            showToast('Producto eliminado');
            await loadProducts();
            renderAdminProducts();
        } catch(err) {
            showToast('Error al eliminar', 'error');
        }
    }
};

/* ============================
   INICIALIZACIÓN
   ============================ */
document.addEventListener('DOMContentLoaded', () => {
    loadProducts();
    updateCartBadge();
    
    // Cerrar modals al hacer click fuera
    window.addEventListener('click', (e) => {
        if(e.target === document.getElementById('product-modal')) document.getElementById('product-modal').style.display = 'none';
        if(e.target === document.getElementById('admin-modal')) document.getElementById('admin-modal').style.display = 'none';
    });
});