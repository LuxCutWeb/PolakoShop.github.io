// app.js
import { auth, db } from './firebase.js';
import { 
    onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
    signOut, sendPasswordResetEmail 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc, 
    query, where, serverTimestamp, orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

class PolakoShop {
    constructor() {
        this.currentUser = null;
        this.isAdmin = false;
        this.products = [];
        this.cart = JSON.parse(localStorage.getItem('cart')) || [];
        this.favorites = [];
        this.init();
    }

    async init() {
        this.removeLoader();
        this.setupNavigation();
        this.setupAuthObserver();
        this.setupEventListeners();
        await this.loadProducts();
        this.updateCartUI();
        this.navigateTo('home'); // Vista inicial
    }

    removeLoader() {
        const loader = document.getElementById('global-loader');
        setTimeout(() => {
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 500);
        }, 800);
    }

    /* =========================================
       SISTEMA DE NAVEGACIÓN (SPA)
    ========================================= */
    setupNavigation() {
        // Toggle menú móvil
        document.querySelector('.mobile-menu-btn').addEventListener('click', () => {
            document.querySelector('.nav-links').classList.toggle('show');
        });
    }

    navigateTo(viewId) {
        // Ocultar todas las vistas
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });
        
        // Mostrar la vista objetivo
        const targetView = document.getElementById(`view-${viewId}`);
        if(targetView) {
            targetView.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // Actualizar links activos en Navbar
        document.querySelectorAll('.nav-links .nav-item').forEach(link => {
            link.classList.remove('active');
        });
        const activeLink = document.querySelector(`.nav-links a[onclick="app.navigateTo('${viewId}')"]`);
        if(activeLink) activeLink.classList.add('active');

        // Ejecutar funciones específicas por vista
        if(viewId === 'catalog') this.renderCatalog();
        if(viewId === 'cart') this.renderCartView();
        if(viewId === 'favorites') this.renderFavorites();
        if(viewId === 'orders') this.loadOrders();
        if(viewId === 'admin' && this.isAdmin) this.loadAdminDashboard();
        
        // Cerrar menú móvil si está abierto
        document.querySelector('.nav-links').classList.remove('show');
    }

    /* =========================================
       AUTENTICACIÓN Y PERFIL
    ========================================= */
    setupAuthObserver() {
        onAuthStateChanged(auth, async (user) => {
            this.currentUser = user;
            if (user) {
                // Usuario logueado
                document.querySelectorAll('.guest-only').forEach(el => el.style.display = 'none');
                document.querySelectorAll('.user-only').forEach(el => el.style.display = 'block');
                
                // Verificar si existe en Firestore, si no, crearlo (para registro)
                const userRef = doc(db, 'users', user.uid);
                const userSnap = await getDoc(userRef);
                
                if (userSnap.exists()) {
                    const userData = userSnap.data();
                    this.isAdmin = userData.role === 'admin';
                    this.favorites = userData.favorites || [];
                    this.fillProfile(userData, user.email);
                } else {
                    // Crear perfil básico si no existe
                    await setDoc(userRef, {
                        email: user.email,
                        name: user.displayName || 'Usuario',
                        role: 'user',
                        favorites: [],
                        createdAt: serverTimestamp()
                    });
                    this.isAdmin = false;
                    this.fillProfile({name: 'Usuario'}, user.email);
                }

                if (this.isAdmin) {
                    document.getElementById('nav-admin').style.display = 'block';
                }

            } else {
                // Usuario NO logueado
                this.isAdmin = false;
                this.favorites = [];
                document.querySelectorAll('.guest-only').forEach(el => el.style.display = 'block');
                document.querySelectorAll('.user-only').forEach(el => el.style.display = 'none');
                document.getElementById('nav-admin').style.display = 'none';
                
                // Si está en una ruta protegida, mandarlo a inicio
                const activeView = document.querySelector('.view.active').id;
                if(['view-profile', 'view-orders', 'view-admin', 'view-favorites', 'view-settings'].includes(activeView)){
                    this.navigateTo('home');
                }
            }
        });
    }

    setupEventListeners() {
        // Formularios Auth
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-password').value;
            try {
                await signInWithEmailAndPassword(auth, email, pass);
                this.showToast('Sesión iniciada correctamente');
                this.navigateTo('home');
                e.target.reset();
            } catch (error) {
                this.showToast('Error: ' + error.message);
            }
        });

        document.getElementById('register-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('reg-email').value;
            const pass = document.getElementById('reg-password').value;
            const name = document.getElementById('reg-name').value;
            try {
                const cred = await createUserWithEmailAndPassword(auth, email, pass);
                await setDoc(doc(db, 'users', cred.user.uid), {
                    email: email,
                    name: name,
                    role: 'user',
                    favorites: [],
                    createdAt: serverTimestamp()
                });
                this.showToast('Cuenta creada con éxito');
                this.navigateTo('home');
                e.target.reset();
            } catch (error) {
                this.showToast('Error: ' + error.message);
            }
        });

        // Buscador Global
        document.getElementById('global-search').addEventListener('input', (e) => {
            this.navigateTo('catalog');
            this.renderCatalog(e.target.value);
        });

        // Filtros Catálogo
        document.getElementById('filter-category').addEventListener('change', () => this.renderCatalog());
        document.getElementById('sort-products').addEventListener('change', () => this.renderCatalog());

        // Actualizar Perfil
        document.getElementById('profile-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            if(!this.currentUser) return;
            const newName = document.getElementById('profile-name').value;
            const newPhoto = document.getElementById('profile-photo-url').value;
            try {
                await updateDoc(doc(db, 'users', this.currentUser.uid), {
                    name: newName,
                    photoURL: newPhoto
                });
                this.showToast('Perfil actualizado');
                document.getElementById('profile-name-display').innerText = newName;
                if(newPhoto) document.getElementById('profile-img').src = newPhoto;
            } catch(e) {
                this.showToast('Error al actualizar');
            }
        });

        // Formulario Admin - Crear/Editar Producto
        document.getElementById('admin-product-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveProduct();
        });
    }

    async logout() {
        try {
            await signOut(auth);
            this.showToast('Has cerrado sesión');
            this.navigateTo('home');
        } catch (error) {
            console.error(error);
        }
    }

    async resetPassword() {
        const email = prompt("Ingresa tu correo para recuperar la contraseña:");
        if (email) {
            try {
                await sendPasswordResetEmail(auth, email);
                this.showToast('Correo de recuperación enviado');
            } catch (error) {
                this.showToast('Error: ' + error.message);
            }
        }
    }

    fillProfile(data, email) {
        document.getElementById('profile-name-display').innerText = data.name || 'Usuario';
        document.getElementById('profile-email-display').innerText = email;
        document.getElementById('profile-name').value = data.name || '';
        document.getElementById('profile-photo-url').value = data.photoURL || '';
        if(data.photoURL) document.getElementById('profile-img').src = data.photoURL;
        if(data.createdAt) {
            const date = data.createdAt.toDate ? data.createdAt.toDate().toLocaleDateString() : 'Reciente';
            document.getElementById('profile-date').innerText = date;
        }
    }

    /* =========================================
       PRODUCTOS Y CATÁLOGO
    ========================================= */
    async loadProducts() {
        try {
            const q = query(collection(db, 'products'), where('status', '==', 'active'));
            const querySnapshot = await getDocs(q);
            this.products = [];
            querySnapshot.forEach((doc) => {
                this.products.push({ id: doc.id, ...doc.data() });
            });
            this.renderHomeProducts();
        } catch (error) {
            console.log("Error loading products (asegúrate de configurar Firebase Rules): ", error);
        }
    }

    renderHomeProducts() {
        const container = document.getElementById('home-new-products');
        container.innerHTML = '';
        // Mostrar los últimos 4 productos
        const latest = [...this.products].sort((a,b) => b.createdAt - a.createdAt).slice(0, 4);
        latest.forEach(p => container.appendChild(this.createProductCard(p)));
    }

    renderCatalog(searchTerm = '') {
        const container = document.getElementById('catalog-grid');
        const categoryFilter = document.getElementById('filter-category').value;
        const sortFilter = document.getElementById('sort-products').value;

        container.innerHTML = '';

        let filtered = this.products;

        // Búsqueda
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(p => p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term));
        }

        // Categoría
        if (categoryFilter !== 'all') {
            filtered = filtered.filter(p => p.category === categoryFilter);
        }

        // Ordenamiento
        if (sortFilter === 'price-asc') filtered.sort((a,b) => parseFloat(a.price) - parseFloat(b.price));
        if (sortFilter === 'price-desc') filtered.sort((a,b) => parseFloat(b.price) - parseFloat(a.price));
        if (sortFilter === 'newest') filtered.sort((a,b) => b.createdAt - a.createdAt);

        if(filtered.length === 0) {
            container.innerHTML = '<p class="text-muted" style="grid-column: 1/-1; text-align:center; padding: 3rem;">No se encontraron productos.</p>';
            return;
        }

        filtered.forEach(p => container.appendChild(this.createProductCard(p)));
    }

    createProductCard(product) {
        const div = document.createElement('div');
        div.className = 'product-card fade-in';
        const isFav = this.favorites.includes(product.id);
        
        div.innerHTML = `
            <div class="product-img-wrap" onclick="app.openProductDetails('${product.id}')">
                <img src="${product.img}" alt="${product.name}" loading="lazy">
                <div class="card-actions" onclick="event.stopPropagation()">
                    <button class="btn btn-icon" onclick="app.addToCart('${product.id}')" title="Añadir al Carrito"><i class='bx bx-cart-add'></i></button>
                    <button class="btn btn-icon ${isFav ? 'text-red' : ''}" onclick="app.toggleFavorite('${product.id}', this)" title="Favorito"><i class='bx ${isFav ? 'bxs-heart' : 'bx-heart'}'></i></button>
                </div>
            </div>
            <div class="product-info" onclick="app.openProductDetails('${product.id}')">
                <p class="product-brand">${product.brand}</p>
                <h4 class="product-name">${product.name}</h4>
                <p class="product-price">$${parseFloat(product.price).toFixed(2)}</p>
            </div>
        `;
        return div;
    }

    openProductDetails(id) {
        const p = this.products.find(x => x.id === id);
        if(!p) return;

        document.getElementById('pm-img').src = p.img;
        document.getElementById('pm-category').innerText = p.category;
        document.getElementById('pm-name').innerText = p.name;
        document.getElementById('pm-price').innerText = `$${parseFloat(p.price).toFixed(2)}`;
        document.getElementById('pm-desc').innerText = p.desc;
        document.getElementById('pm-stock').innerText = p.stock;

        // Botones de acción modal
        document.getElementById('pm-buy-btn').onclick = () => {
            this.addToCart(p.id);
            this.closeModal('product-modal');
            this.navigateTo('cart');
        };
        document.getElementById('pm-add-cart-btn').onclick = () => this.addToCart(p.id);
        
        const favBtn = document.getElementById('pm-fav-btn');
        const isFav = this.favorites.includes(p.id);
        favBtn.innerHTML = `<i class='bx ${isFav ? 'bxs-heart text-red' : 'bx-heart'}'></i>`;
        favBtn.onclick = () => {
            this.toggleFavorite(p.id, null);
            const nowFav = this.favorites.includes(p.id);
            favBtn.innerHTML = `<i class='bx ${nowFav ? 'bxs-heart text-red' : 'bx-heart'}'></i>`;
        };

        document.getElementById('pm-share-btn').onclick = () => {
            navigator.clipboard.writeText(window.location.href);
            this.showToast('Enlace copiado al portapapeles');
        };

        document.getElementById('product-modal').classList.add('active');
    }

    /* =========================================
       FAVORITOS
    ========================================= */
    async toggleFavorite(productId, btnElement) {
        if (!this.currentUser) {
            this.showToast('Inicia sesión para guardar favoritos');
            this.navigateTo('login');
            return;
        }

        const index = this.favorites.indexOf(productId);
        if (index > -1) {
            this.favorites.splice(index, 1);
            if(btnElement) btnElement.innerHTML = "<i class='bx bx-heart'></i>";
        } else {
            this.favorites.push(productId);
            if(btnElement) btnElement.innerHTML = "<i class='bx bxs-heart'></i>";
            this.showToast('Añadido a favoritos');
        }

        // Actualizar UI en vivo si está en la vista de favoritos
        if(document.getElementById('view-favorites').classList.contains('active')) {
            this.renderFavorites();
        }

        // Guardar en Firebase
        try {
            await updateDoc(doc(db, 'users', this.currentUser.uid), {
                favorites: this.favorites
            });
        } catch(e) {
            console.error(e);
        }
    }

    renderFavorites() {
        const container = document.getElementById('favorites-grid');
        container.innerHTML = '';
        if(this.favorites.length === 0) {
            container.innerHTML = '<p class="text-muted">Aún no tienes productos favoritos.</p>';
            return;
        }
        const favProducts = this.products.filter(p => this.favorites.includes(p.id));
        favProducts.forEach(p => container.appendChild(this.createProductCard(p)));
    }

    /* =========================================
       CARRITO DE COMPRAS
    ========================================= */
    addToCart(productId) {
        const product = this.products.find(p => p.id === productId);
        if(!product) return;

        const existingItem = this.cart.find(item => item.id === productId);
        if (existingItem) {
            if(existingItem.qty < product.stock) {
                existingItem.qty++;
                this.showToast('Cantidad actualizada');
            } else {
                this.showToast('Stock máximo alcanzado');
            }
        } else {
            this.cart.push({ ...product, qty: 1 });
            this.showToast('Añadido al carrito');
        }
        
        this.saveCart();
        this.updateCartUI();
    }

    removeFromCart(productId) {
        this.cart = this.cart.filter(item => item.id !== productId);
        this.saveCart();
        this.updateCartUI();
        if(document.getElementById('view-cart').classList.contains('active')) {
            this.renderCartView();
        }
    }

    changeCartQty(productId, delta) {
        const item = this.cart.find(i => i.id === productId);
        if(!item) return;
        
        const newQty = item.qty + delta;
        if(newQty > 0 && newQty <= item.stock) {
            item.qty = newQty;
            this.saveCart();
            this.updateCartUI();
            this.renderCartView();
        }
    }

    clearCart() {
        this.cart = [];
        this.saveCart();
        this.updateCartUI();
        this.renderCartView();
    }

    saveCart() {
        localStorage.setItem('cart', JSON.stringify(this.cart));
    }

    updateCartUI() {
        const count = this.cart.reduce((acc, item) => acc + item.qty, 0);
        document.getElementById('cart-count').innerText = count;
    }

    renderCartView() {
        const container = document.getElementById('cart-items-container');
        container.innerHTML = '';

        if(this.cart.length === 0) {
            container.innerHTML = '<p class="text-muted">Tu carrito está vacío.</p>';
            document.getElementById('cart-subtotal').innerText = '$0.00';
            document.getElementById('cart-igv').innerText = '$0.00';
            document.getElementById('cart-total').innerText = '$0.00';
            return;
        }

        let subtotal = 0;

        this.cart.forEach(item => {
            const itemTotal = item.price * item.qty;
            subtotal += itemTotal;

            const div = document.createElement('div');
            div.className = 'cart-item fade-in';
            div.innerHTML = `
                <img src="${item.img}" alt="${item.name}">
                <div class="cart-item-info">
                    <h4>${item.name}</h4>
                    <p>${item.category} | Talla Única</p>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:600;">$${parseFloat(item.price).toFixed(2)}</span>
                        <div class="cart-qty">
                            <button onclick="app.changeCartQty('${item.id}', -1)">-</button>
                            <span>${item.qty}</span>
                            <button onclick="app.changeCartQty('${item.id}', 1)">+</button>
                        </div>
                    </div>
                </div>
                <button class="cart-remove" onclick="app.removeFromCart('${item.id}')"><i class='bx bx-trash'></i></button>
            `;
            container.appendChild(div);
        });

        const igv = subtotal * 0.18;
        const total = subtotal + igv;

        document.getElementById('cart-subtotal').innerText = `$${subtotal.toFixed(2)}`;
        document.getElementById('cart-igv').innerText = `$${igv.toFixed(2)}`;
        document.getElementById('cart-total').innerText = `$${total.toFixed(2)}`;
    }

    async processCheckout() {
        if(this.cart.length === 0) {
            this.showToast('El carrito está vacío');
            return;
        }
        if(!this.currentUser) {
            this.showToast('Debes iniciar sesión para comprar');
            this.navigateTo('login');
            return;
        }

        // Descontar stock y registrar pedido (Simulado por seguridad de cliente, ideal en Cloud Functions)
        try {
            const orderData = {
                userId: this.currentUser.uid,
                items: this.cart,
                total: parseFloat(document.getElementById('cart-total').innerText.replace('$','')),
                date: serverTimestamp(),
                status: 'Procesando'
            };
            
            await addDoc(collection(db, 'orders'), orderData);
            
            this.showToast('¡Compra realizada con éxito!');
            this.clearCart();
            this.navigateTo('orders');
            
        } catch (error) {
            this.showToast('Error al procesar compra');
            console.error(error);
        }
    }

    /* =========================================
       PEDIDOS (USUARIO)
    ========================================= */
    async loadOrders() {
        if(!this.currentUser) return;
        const container = document.getElementById('orders-container');
        container.innerHTML = '<div class="spinner"></div>';
        
        try {
            const q = query(collection(db, 'orders'), where('userId', '==', this.currentUser.uid), orderBy('date', 'desc'));
            const snapshot = await getDocs(q);
            container.innerHTML = '';
            
            if(snapshot.empty) {
                container.innerHTML = '<p class="text-muted">No tienes pedidos anteriores.</p>';
                return;
            }

            snapshot.forEach(doc => {
                const order = doc.data();
                const date = order.date ? order.date.toDate().toLocaleDateString() : 'Reciente';
                
                const div = document.createElement('div');
                div.className = 'order-card fade-in';
                div.innerHTML = `
                    <div>
                        <h4 style="margin-bottom:0.5rem;">Pedido #${doc.id.substring(0,8).toUpperCase()}</h4>
                        <p class="text-muted text-sm">${date} - ${order.items.length} artículos</p>
                    </div>
                    <div style="text-align:right;">
                        <span style="display:inline-block; padding:0.2rem 0.8rem; background:var(--bg-light); border-radius:20px; font-size:0.8rem; margin-bottom:0.5rem;">${order.status}</span>
                        <h4 style="font-weight:700;">$${order.total.toFixed(2)}</h4>
                    </div>
                `;
                container.appendChild(div);
            });
        } catch(e) {
            container.innerHTML = '<p class="text-red">Error al cargar pedidos. Verifica los índices de Firebase.</p>';
        }
    }

    /* =========================================
       PANEL ADMINISTRADOR
    ========================================= */
    adminShowTab(tabId) {
        document.querySelectorAll('.admin-tab').forEach(t => t.style.display = 'none');
        document.getElementById(`admin-tab-${tabId}`).style.display = 'block';
        
        document.querySelectorAll('.admin-sidebar li').forEach(li => li.classList.remove('active'));
        document.getElementById(`tab-${tabId}`).classList.add('active');

        if(tabId === 'dashboard') this.loadAdminDashboard();
        if(tabId === 'products') this.renderAdminProducts();
    }

    async loadAdminDashboard() {
        // Cargar métricas reales o estimadas de Firestore
        try {
            const usersSnap = await getDocs(collection(db, 'users'));
            document.getElementById('stat-users').innerText = usersSnap.size;

            const prodsSnap = await getDocs(collection(db, 'products'));
            document.getElementById('stat-products').innerText = prodsSnap.size;

            const ordersSnap = await getDocs(collection(db, 'orders'));
            document.getElementById('stat-orders').innerText = ordersSnap.size;
            
            let totalSales = 0;
            ordersSnap.forEach(d => totalSales += d.data().total);
            document.getElementById('stat-sales').innerText = `$${totalSales.toFixed(2)}`;

        } catch(e) {
            console.error("Error loading stats:", e);
        }
    }

    async renderAdminProducts() {
        const tbody = document.getElementById('admin-product-list');
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Cargando productos...</td></tr>';
        
        try {
            const snapshot = await getDocs(collection(db, 'products'));
            tbody.innerHTML = '';
            
            if(snapshot.empty) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay productos en el almacén.</td></tr>';
                return;
            }

            snapshot.forEach(docSnap => {
                const p = docSnap.data();
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><img src="${p.img}" alt="img"></td>
                    <td style="font-weight:500;">${p.name}</td>
                    <td>${p.category}</td>
                    <td>$${parseFloat(p.price).toFixed(2)}</td>
                    <td>${p.stock}</td>
                    <td>
                        <button class="action-btn" onclick="app.editProduct('${docSnap.id}')" title="Editar"><i class='bx bx-edit'></i></button>
                        <button class="action-btn delete" onclick="app.deleteProduct('${docSnap.id}')" title="Eliminar"><i class='bx bx-trash'></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch(e) {
            console.error(e);
        }
    }

    openProductModal(prodId = null) {
        const form = document.getElementById('admin-product-form');
        form.reset();
        document.getElementById('ap-id').value = '';
        document.getElementById('admin-modal-title').innerText = 'Agregar Nuevo Producto';

        if (prodId) {
            document.getElementById('admin-modal-title').innerText = 'Editar Producto';
            // Cargar datos (para simplificar buscamos en el cache local si ya se cargó)
            this.getProductFromDB(prodId).then(p => {
                document.getElementById('ap-id').value = prodId;
                document.getElementById('ap-name').value = p.name;
                document.getElementById('ap-img').value = p.img;
                document.getElementById('ap-price').value = p.price;
                document.getElementById('ap-stock').value = p.stock;
                document.getElementById('ap-category').value = p.category;
                document.getElementById('ap-brand').value = p.brand;
                document.getElementById('ap-desc').value = p.desc;
                document.getElementById('ap-status').value = p.status;
            });
        }
        document.getElementById('admin-product-modal').classList.add('active');
    }

    async getProductFromDB(id) {
        const docRef = doc(db, 'products', id);
        const snap = await getDoc(docRef);
        return snap.exists() ? snap.data() : null;
    }

    async saveProduct() {
        const id = document.getElementById('ap-id').value;
        const pData = {
            name: document.getElementById('ap-name').value,
            img: document.getElementById('ap-img').value,
            price: parseFloat(document.getElementById('ap-price').value),
            stock: parseInt(document.getElementById('ap-stock').value),
            category: document.getElementById('ap-category').value,
            brand: document.getElementById('ap-brand').value,
            desc: document.getElementById('ap-desc').value,
            status: document.getElementById('ap-status').value,
            updatedAt: serverTimestamp()
        };

        try {
            if (id) {
                // Actualizar
                await updateDoc(doc(db, 'products', id), pData);
                this.showToast('Producto actualizado');
            } else {
                // Crear
                pData.createdAt = serverTimestamp();
                await addDoc(collection(db, 'products'), pData);
                this.showToast('Producto publicado');
            }
            this.closeModal('admin-product-modal');
            this.renderAdminProducts(); // recargar tabla
            this.loadProducts(); // recargar catálogo global
        } catch(e) {
            this.showToast('Error al guardar producto');
            console.error(e);
        }
    }

    editProduct(id) {
        this.openProductModal(id);
    }

    async deleteProduct(id) {
        if(confirm('¿Estás seguro de eliminar este producto de forma permanente?')) {
            try {
                await deleteDoc(doc(db, 'products', id));
                this.showToast('Producto eliminado');
                this.renderAdminProducts();
                this.loadProducts();
            } catch(e) {
                this.showToast('Error al eliminar');
            }
        }
    }

    /* =========================================
       UTILIDADES UI
    ========================================= */
    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }

    showToast(message) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerText = message;
        container.appendChild(toast);

        setTimeout(() => {
            if(toast.parentElement) toast.remove();
        }, 3300);
    }
}

// Inicializar la aplicación y exponerla al objeto window para el HTML
window.app = new PolakoShop();