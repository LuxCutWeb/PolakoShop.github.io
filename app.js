
/* ==========================================================================
   POLAKOSHOP: CONTROLADOR GENERAL DE INTERFAZ & ESTADO DE APLICACIÓN
   ========================================================================== */

import { 
    auth, 
    signUpUser, 
    loginUser, 
    logoutUser, 
    updateUserData, 
    changeUserPassword, 
    getUserProfile, 
    createProduct, 
    getAllProducts, 
    updateProductData, 
    deleteProductFromDb, 
    toggleFavoriteInDb, 
    getUserFavorites, 
    createOrderInDb, 
    getUserOrdersFromDb, 
    getAllOrdersAdmin, 
    updateOrderStatus, 
    getSystemStats,
    onAuthStateChanged
} from "./firebase.js";

class App {
    constructor() {
        this.products = [];
        this.cart = JSON.parse(localStorage.getItem("polakoshop_cart")) || [];
        this.favorites = [];
        this.currentUser = null;
        this.isAdmin = false;
        
        // Estructura de filtros activos
        this.filters = {
            category: null,
            maxPrice: 500,
            searchQuery: "",
            sortBy: "newest"
        };

        this.init();
    }

    async init() {
        this.setupRouter();
        this.setupEventListeners();
        this.updateCartUI();
        
        // Carga inicial de productos
        await this.loadProducts();

        // Escucha cambios de Auth
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                this.currentUser = user;
                const profile = await getUserProfile(user.uid);
                this.isAdmin = (profile && profile.role === "admin") || user.email === "jeremyalexandercubasomonte@gmail.com";
                
                // Cargar favoritos del usuario de Firebase
                this.favorites = await getUserFavorites(user.uid);
                
                this.updateAuthUI(true, profile);
            } else {
                this.currentUser = null;
                this.isAdmin = false;
                this.favorites = [];
                this.updateAuthUI(false, null);
            }
            this.renderCatalog();
            this.renderHome();
        });
    }

    /* ==========================================================================
       SISTEMA DE ENRUTAMIENTO SPA
       ========================================================================== */
    setupRouter() {
        const handleRoute = () => {
            const hash = window.location.hash || "#home";
            const sectionId = `section-${hash.replace("#", "")}`;
            
            // Cerrar menú móvil al navegar
            document.getElementById("nav-menu").classList.remove("active");

            // Ocultar todas las secciones
            document.querySelectorAll(".app-section").forEach(sec => {
                sec.classList.remove("active");
            });

            // Activar la sección correspondiente
            const activeSection = document.getElementById(sectionId);
            if (activeSection) {
                activeSection.classList.add("active");
                window.scrollTo(0, 0);
            }

            // Actualizar enlaces de navegación activos
            document.querySelectorAll(".nav-link").forEach(link => {
                if (link.getAttribute("href") === hash) {
                    link.classList.add("active");
                } else {
                    link.classList.remove("active");
                }
            });

            // Lógica específica para cada sección al entrar
            if (hash === "#admin") {
                if (!this.isAdmin) {
                    this.showToast("Acceso restringido. Solo administradores.");
                    window.location.hash = "#home";
                } else {
                    this.loadAdminView();
                }
            } else if (hash === "#profile") {
                this.loadProfileView();
            } else if (hash === "#favorites") {
                this.renderFavorites();
            }
        };

        window.addEventListener("hashchange", handleRoute);
        window.addEventListener("load", handleRoute);
    }

    /* ==========================================================================
       MANEJADORES DE EVENTOS DE INTERFAZ
       ========================================================================== */
    setupEventListeners() {
        // Toggle Menú Móvil
        document.getElementById("menu-toggle").addEventListener("click", () => {
            document.getElementById("nav-menu").classList.toggle("active");
        });

        // Buscador Global
        const searchOverlay = document.getElementById("search-overlay");
        document.getElementById("search-trigger").addEventListener("click", () => {
            searchOverlay.classList.add("active");
            document.getElementById("global-search-input").focus();
        });
        document.getElementById("close-search").addEventListener("click", () => {
            searchOverlay.classList.remove("active");
        });

        document.getElementById("global-search-input").addEventListener("input", (e) => {
            this.filters.searchQuery = e.target.value.toLowerCase();
            this.renderCatalog();
            if (window.location.hash !== "#catalog") {
                window.location.hash = "#catalog";
            }
        });

        // Sidebar de Filtros (Filtros Móviles)
        const sidebar = document.getElementById("catalog-sidebar");
        document.getElementById("mobile-filter-btn").addEventListener("click", () => {
            sidebar.classList.add("active");
        });
        document.getElementById("close-filters-btn").addEventListener("click", () => {
            sidebar.classList.remove("active");
        });

        // Eventos de Filtro en Catálogo
        const range = document.getElementById("price-range");
        const rangeVal = document.getElementById("price-range-val");
        range.addEventListener("input", (e) => {
            rangeVal.innerText = `S/ ${e.target.value}`;
            this.filters.maxPrice = parseFloat(e.target.value);
            this.renderCatalog();
        });

        document.getElementById("sort-select").addEventListener("change", (e) => {
            this.filters.sortBy = e.target.value;
            this.renderCatalog();
        });

        document.getElementById("clear-filters").addEventListener("click", () => {
            this.clearFilters();
        });

        // Eventos del Carrito de Compras
        document.getElementById("cart-trigger").addEventListener("click", () => {
            window.location.hash = "#cart";
        });
        document.getElementById("clear-cart-btn").addEventListener("click", () => {
            this.clearCart();
        });
        document.getElementById("checkout-btn").addEventListener("click", () => {
            this.processCheckout();
        });

        // Eventos de Autenticación
        document.getElementById("go-to-register").addEventListener("click", (e) => {
            e.preventDefault();
            document.getElementById("login-card").classList.add("hidden");
            document.getElementById("register-card").classList.remove("hidden");
        });

        document.getElementById("go-to-login").addEventListener("click", (e) => {
            e.preventDefault();
            document.getElementById("register-card").classList.add("hidden");
            document.getElementById("login-card").classList.remove("hidden");
        });

        document.getElementById("login-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = document.getElementById("login-email").value;
            const pass = document.getElementById("login-password").value;
            try {
                await loginUser(email, pass);
                this.showToast("¡Inicio de sesión exitoso!");
            } catch (err) {
                this.showToast(`Error: ${err.message}`);
            }
        });

        document.getElementById("register-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("register-name").value;
            const email = document.getElementById("register-email").value;
            const pass = document.getElementById("register-password").value;
            try {
                await signUpUser(email, pass, name);
                this.showToast("¡Registro de cuenta completado!");
            } catch (err) {
                this.showToast(`Error: ${err.message}`);
            }
        });

        document.getElementById("logout-btn").addEventListener("click", async () => {
            try {
                await logoutUser();
                this.showToast("Sesión cerrada.");
                window.location.hash = "#home";
            } catch (err) {
                this.showToast("Error al cerrar sesión");
            }
        });

        // Formularios del Perfil
        document.getElementById("edit-profile-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("edit-name").value;
            const photo = document.getElementById("edit-photo-url").value;
            try {
                await updateUserData(name, photo);
                this.showToast("Perfil actualizado correctamente");
                this.loadProfileView();
            } catch (err) {
                this.showToast(`Error: ${err.message}`);
            }
        });

        document.getElementById("change-password-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            const newPass = document.getElementById("new-password").value;
            try {
                await changeUserPassword(newPass);
                this.showToast("Contraseña actualizada con éxito");
                e.target.reset();
            } catch (err) {
                this.showToast(`Error: ${err.message}`);
            }
        });

        // Tabs del Perfil
        document.querySelectorAll(".profile-tab").forEach(tab => {
            tab.addEventListener("click", (e) => {
                document.querySelectorAll(".profile-tab").forEach(t => t.classList.remove("active"));
                document.querySelectorAll(".profile-tab-content").forEach(c => c.classList.remove("active"));
                
                e.target.classList.add("active");
                document.getElementById(`tab-${e.target.dataset.tab}`).classList.add("active");
            });
        });

        // Eventos del Panel Admin (Tabs de control interno)
        document.querySelectorAll(".admin-tab-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                document.querySelectorAll(".admin-tab-btn").forEach(b => b.classList.remove("active"));
                document.querySelectorAll(".admin-tab-pane").forEach(p => p.classList.remove("active"));

                e.target.classList.add("active");
                document.getElementById(`admin-tab-${e.target.dataset.adminTab}`).classList.add("active");
            });
        });

        /* ==========================================================
           NUEVO SISTEMA DE IMÁGENES: CONVERTIR FOTO A BASE64
           ========================================================== */
        const fileInput = document.getElementById('product-img-file');
        const base64Input = document.getElementById('product-img-base64');

        if (fileInput) {
            fileInput.addEventListener('change', function(event) {
                const file = event.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.readAsDataURL(file);
                
                reader.onload = function(e) {
                    const img = new Image();
                    img.src = e.target.result;
                    
                    img.onload = function() {
                        const canvas = document.createElement('canvas');
                        const MAX_WIDTH = 600; // Achicamos la imagen para que Firebase la acepte
                        let width = img.width;
                        let height = img.height;

                        if (width > MAX_WIDTH) {
                            height = height * (MAX_WIDTH / width);
                            width = MAX_WIDTH;
                        }

                        canvas.width = width;
                        canvas.height = height;

                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);

                        // Convertimos a texto Base64 y lo guardamos en el input oculto
                        const base64String = canvas.toDataURL('image/jpeg', 0.7);
                        base64Input.value = base64String;
                    };
                };
            });
        }

        // Formulario de Agregar / Editar Producto
        document.getElementById("product-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            const id = document.getElementById("form-product-id").value;
            
            // Obtenemos la imagen convertida
            let imagenParaGuardar = document.getElementById("product-img-base64").value;

            // Validación por si no se procesó la imagen correctamente
            if (!imagenParaGuardar && !id) {
                this.showToast("Por favor, selecciona una imagen para el producto.");
                return;
            }

            const pData = {
                name: document.getElementById("product-name").value,
                price: parseFloat(document.getElementById("product-price").value),
                category: document.getElementById("product-category").value,
                stock: parseInt(document.getElementById("product-stock").value),
                imgUrl: imagenParaGuardar, // <--- AHORA GUARDAMOS EL TEXTO BASE64
                desc: document.getElementById("product-desc").value
            };

            try {
                if (id) {
                    // Si estamos editando y no subió imagen nueva, evitamos borrar la que ya estaba
                    if (!imagenParaGuardar) delete pData.imgUrl; 
                    await updateProductData(id, pData);
                    this.showToast("Producto actualizado en el almacén");
                } else {
                    await createProduct(pData);
                    this.showToast("Producto publicado correctamente");
                }
                
                this.resetProductForm();
                
                // Limpiamos también el input oculto y el de archivo
                if(base64Input) base64Input.value = "";
                if(fileInput) fileInput.value = "";

                await this.loadProducts();
                this.renderCatalog();
                this.loadAdminView();
                
                // Ir a la pestaña del almacén
                document.querySelector("[data-admin-tab='warehouse']").click();
            } catch (err) {
                this.showToast(`Error: ${err.message}`);
            }
        });

        document.getElementById("cancel-edit-btn").addEventListener("click", () => {
            this.resetProductForm();
            if(base64Input) base64Input.value = "";
            if(fileInput) fileInput.value = "";
        });
    }
    /* ==========================================================================
       CONECTIVIDAD DE DATOS (PRODUCTOS & RENDERIZADO GENERAL)
       ========================================================================== */
    async loadProducts() {
        try {
            this.products = await getAllProducts();
            this.renderFiltersSidebar();
        } catch (err) {
            this.showToast("Error al obtener catálogo de productos.");
        }
    }

    renderFiltersSidebar() {
        const cats = ["Todos", ...new Set(this.products.map(p => p.category))];
        const container = document.getElementById("filter-categories-container");
        container.innerHTML = "";

        cats.forEach(cat => {
            const label = document.createElement("label");
            label.className = "filter-checkbox-label";
            
            const isChecked = (cat === "Todos" && !this.filters.category) || (this.filters.category === cat);
            label.innerHTML = `
                <input type="radio" name="cat-filter" value="${cat}" ${isChecked ? "checked" : ""}>
                <span>${cat}</span>
            `;

            label.querySelector("input").addEventListener("change", (e) => {
                this.filters.category = e.target.value === "Todos" ? null : e.target.value;
                this.renderCatalog();
            });

            container.appendChild(label);
        });
    }

    renderHome() {
        // Categorías Destacadas (Círculos Interactivos)
        const homeCats = ["Polos", "oufits", "Hoodies", "Pantalones", "accesorios", "Gorras", "camisas", "mochilas" ];
        const catsGrid = document.getElementById("home-categories");
        catsGrid.innerHTML = "";

        homeCats.forEach(cat => {
            const div = document.createElement("div");
            div.className = "category-card";
            div.innerHTML = `
                <div class="category-icon">${this.getCategoryEmoji(cat)}</div>
                <div class="category-name">${cat}</div>
            `;
            div.addEventListener("click", () => {
                this.filters.category = cat;
                this.renderFiltersSidebar();
                window.location.hash = "#catalog";
                this.renderCatalog();
            });
            catsGrid.appendChild(div);
        });

        // Productos Destacados (Últimos 4 agregados)
        const featuredContainer = document.getElementById("featured-products");
        featuredContainer.innerHTML = "";
        
        const sorted = [...this.products]
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 4);

        sorted.forEach(p => {
            featuredContainer.appendChild(this.buildProductCard(p));
        });
    }

    renderCatalog() {
        const grid = document.getElementById("catalog-products-grid");
        const countLabel = document.getElementById("products-count-label");
        const emptyState = document.getElementById("catalog-empty-state");
        grid.innerHTML = "";

        // Filtrar
        let filtered = this.products.filter(p => {
            const matchesCat = !this.filters.category || p.category === this.filters.category;
            const matchesPrice = p.price <= this.filters.maxPrice;
            const matchesSearch = !this.filters.searchQuery || 
                p.name.toLowerCase().includes(this.filters.searchQuery) || 
                p.category.toLowerCase().includes(this.filters.searchQuery);
            return matchesCat && matchesPrice && matchesSearch;
        });

        // Ordenar
        if (this.filters.sortBy === "newest") {
            filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        } else if (this.filters.sortBy === "price-asc") {
            filtered.sort((a, b) => a.price - b.price);
        } else if (this.filters.sortBy === "price-desc") {
            filtered.sort((a, b) => b.price - a.price);
        } else if (this.filters.sortBy === "popular") {
            filtered.sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0));
        }

        countLabel.innerText = `${filtered.length} prendas encontradas`;

        if (filtered.length === 0) {
            emptyState.classList.remove("hidden");
            grid.classList.add("hidden");
        } else {
            emptyState.classList.add("hidden");
            grid.classList.remove("hidden");
            filtered.forEach(p => {
                grid.appendChild(this.buildProductCard(p));
            });
        }
    }

    buildProductCard(product) {
        const card = document.createElement("div");
        card.className = "product-card";
        
        const isFav = this.favorites.includes(product.id);

        card.innerHTML = `
            <div class="product-image-container">
                <img src="${product.imgUrl}" alt="${product.name}" class="product-img" loading="lazy">
                <button class="product-fav-btn ${isFav ? "active" : ""}" aria-label="Añadir a favoritos">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                </button>
            </div>
            <div class="product-info">
                <div class="product-category">${product.category}</div>
                <h3 class="product-title">${product.name}</h3>
                <p class="product-desc-short">${product.desc}</p>
                <div class="product-bottom-row">
                    <span class="product-price">S/ ${product.price.toFixed(2)}</span>
                    <button class="add-cart-btn-round" aria-label="Añadir al carrito">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </button>
                </div>
            </div>
        `;

        // Eventos internos
        card.querySelector(".product-fav-btn").addEventListener("click", async (e) => {
            e.stopPropagation();
            await this.toggleFavorite(product.id, e.currentTarget);
        });

        card.querySelector(".add-cart-btn-round").addEventListener("click", (e) => {
            e.stopPropagation();
            this.addToCart(product);
        });

        return card;
    }

    clearFilters() {
        this.filters.category = null;
        this.filters.maxPrice = 500;
        this.filters.sortBy = "newest";
        this.filters.searchQuery = "";
        
        document.getElementById("price-range").value = 500;
        document.getElementById("price-range-val").innerText = "S/ 500";
        document.getElementById("sort-select").value = "newest";
        document.getElementById("global-search-input").value = "";
        
        this.renderFiltersSidebar();
        this.renderCatalog();
    }

    filterNewArrivals() {
        this.clearFilters();
        this.filters.sortBy = "newest";
        window.location.hash = "#catalog";
        this.renderCatalog();
    }

    getCategoryEmoji(cat) {
        const map = {
            "Polos": "👕", 
            "oufits": "👘", 
            "Hoodies": "🧥", 
            "Pantalones": "👖", 
            "accesorios": "👑", 
            "Gorras": "🧢", 
            "camisas": "👔", 
            "Mochilas": "🎒"
        };
        return map[cat] || "🏷️";
    }

    /* ==========================================================================
       GESTIÓN DEL CARRITO COMPLETO
       ========================================================================== */
    addToCart(product) {
        const existing = this.cart.find(item => item.id === product.id);
        if (existing) {
            existing.quantity += 1;
        } else {
            this.cart.push({ ...product, quantity: 1 });
        }
        this.updateCartUI();
        this.showToast(`¡Añadido! ${product.name}`);
    }

    updateCartUI() {
        localStorage.setItem("polakoshop_cart", JSON.stringify(this.cart));
        const badge = document.getElementById("cart-badge");
        const list = document.getElementById("cart-items-list");
        const summaryPanel = document.getElementById("cart-summary-panel");
        const emptyState = document.getElementById("cart-empty-state");

        const totalItems = this.cart.reduce((acc, curr) => acc + curr.quantity, 0);
        
        if (totalItems > 0) {
            badge.innerText = totalItems;
            badge.classList.remove("hidden");
            emptyState.classList.add("hidden");
            list.classList.remove("hidden");
            summaryPanel.classList.remove("hidden");
            
            // Renderizar filas
            list.innerHTML = "";
            let subtotal = 0;

            this.cart.forEach(item => {
                const row = document.createElement("div");
                row.className = "cart-item-row";
                row.innerHTML = `
                    <img src="${item.imgUrl}" alt="${item.name}" class="cart-item-img">
                    <div class="cart-item-info">
                        <h4>${item.name}</h4>
                        <div class="cart-item-category">${item.category}</div>
                        <div class="quantity-controls">
                            <button class="quantity-btn dec-btn">-</button>
                            <span class="quantity-val">${item.quantity}</span>
                            <button class="quantity-btn inc-btn">+</button>
                        </div>
                    </div>
                    <div class="cart-item-actions">
                        <span class="cart-item-price">S/ ${(item.price * item.quantity).toFixed(2)}</span>
                        <button class="cart-item-delete-btn" aria-label="Eliminar">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                    </div>
                `;

                // Eventos
                row.querySelector(".dec-btn").addEventListener("click", () => this.updateQuantity(item.id, -1));
                row.querySelector(".inc-btn").addEventListener("click", () => this.updateQuantity(item.id, 1));
                row.querySelector(".cart-item-delete-btn").addEventListener("click", () => this.removeFromCart(item.id));

                list.appendChild(row);
                subtotal += item.price * item.quantity;
            });

            document.getElementById("cart-subtotal").innerText = `S/ ${subtotal.toFixed(2)}`;
            document.getElementById("cart-total").innerText = `S/ ${subtotal.toFixed(2)}`;

        } else {
            badge.classList.add("hidden");
            list.classList.add("hidden");
            summaryPanel.classList.add("hidden");
            emptyState.classList.remove("hidden");
        }
    }

    updateQuantity(id, change) {
        const item = this.cart.find(i => i.id === id);
        if (item) {
            item.quantity += change;
            if (item.quantity <= 0) {
                this.removeFromCart(id);
            } else {
                this.updateCartUI();
            }
        }
    }

    removeFromCart(id) {
        this.cart = this.cart.filter(i => i.id !== id);
        this.updateCartUI();
    }

    clearCart() {
        this.cart = [];
        this.updateCartUI();
        this.showToast("Carrito vaciado correctamente");
    }

    async processCheckout() {
        if (this.cart.length === 0) return;

        try {
            const total = this.cart.reduce((acc, curr) => acc + (curr.price * curr.quantity), 0);
            
            // Guardar registro de orden en Firestore
            const orderId = await createOrderInDb(this.currentUser ? this.currentUser.uid : null, this.cart, total);

            // Generar contenido exclusivo del mensaje de WhatsApp (sin precios en la lista de ítems)
            let msg = `Hola PolakoShop.\nQuiero realizar la compra de los siguientes productos:\n`;
            this.cart.forEach(item => {
                msg += `• ${item.quantity}x ${item.name}\n`;
            });
            msg += `\nMuchisimas gracias.\nRef-Orden: PS-${orderId.substring(0,6).toUpperCase()}`;

            const encoded = encodeURIComponent(msg);
            
            // Limpiar carrito local
            this.cart = [];
            this.updateCartUI();

            // Abrir API de WhatsApp redireccionando al número maestro
            window.open(`https://api.whatsapp.com/send?phone=51982277143&text=${encoded}`, "_blank");
            this.showToast("Pedido registrado. Redireccionando a WhatsApp...");

        } catch (err) {
            this.showToast(`Error al procesar el pedido: ${err.message}`);
        }
    }

    /* ==========================================================================
       GESTIÓN DE FAVORITOS
       ========================================================================== */
    async toggleFavorite(productId, buttonElement) {
        if (!this.currentUser) {
            this.showToast("Por favor, inicia sesión para guardar favoritos.");
            window.location.hash = "#profile";
            return;
        }

        try {
            const added = await toggleFavoriteInDb(this.currentUser.uid, productId);
            if (added) {
                this.favorites.push(productId);
                buttonElement.classList.add("active");
                this.showToast("Guardado en favoritos");
            } else {
                this.favorites = this.favorites.filter(id => id !== productId);
                buttonElement.classList.remove("active");
                this.showToast("Eliminado de tus favoritos");
            }
            this.renderFavorites();
        } catch (err) {
            this.showToast("No se pudo completar la acción de favoritos.");
        }
    }

    renderFavorites() {
        const grid = document.getElementById("favorites-grid");
        const emptyState = document.getElementById("favs-empty-state");
        grid.innerHTML = "";

        const favProducts = this.products.filter(p => this.favorites.includes(p.id));

        if (favProducts.length === 0) {
            emptyState.classList.remove("hidden");
            grid.classList.add("hidden");
        } else {
            emptyState.classList.add("hidden");
            grid.classList.remove("hidden");
            favProducts.forEach(p => {
                grid.appendChild(this.buildProductCard(p));
            });
        }
    }

    /* ==========================================================================
       SECCIÓN: CUENTA / PERFIL
       ========================================================================== */
    updateAuthUI(isAuthenticated, profile) {
        const authContainer = document.getElementById("auth-container");
        const dashboard = document.getElementById("profile-dashboard");
        const navProfile = document.getElementById("nav-profile-link");
        const navAdmin = document.getElementById("nav-admin");

        if (isAuthenticated) {
            authContainer.classList.add("hidden");
            dashboard.classList.remove("hidden");
            navProfile.innerText = "Mi Perfil";
            
            if (this.isAdmin) {
                navAdmin.classList.remove("hidden");
            } else {
                navAdmin.classList.add("hidden");
            }
        } else {
            authContainer.classList.remove("hidden");
            dashboard.classList.add("hidden");
            navProfile.innerText = "Cuenta";
            navAdmin.classList.add("hidden");
            
            document.getElementById("login-card").classList.remove("hidden");
            document.getElementById("register-card").classList.add("hidden");
        }
    }

    async loadProfileView() {
        if (!this.currentUser) return;

        // Cargar campos del usuario
        document.getElementById("user-display-name").innerText = this.currentUser.displayName || "Usuario Polako";
        document.getElementById("user-display-email").innerText = this.currentUser.email;
        document.getElementById("user-profile-img").src = this.currentUser.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=250&auto=format&fit=crop";
        document.getElementById("user-role-badge").innerText = this.isAdmin ? "Administrador Jefe" : "Cliente Premium";

        // Autocompletar form de edición
        document.getElementById("edit-name").value = this.currentUser.displayName || "";
        document.getElementById("edit-photo-url").value = this.currentUser.photoURL || "";

        // Consultar registro fecha en Firestore
        const profile = await getUserProfile(this.currentUser.uid);
        if (profile && profile.createdAt) {
            const date = new Date(profile.createdAt).toLocaleDateString();
            document.getElementById("user-register-date").innerText = `Miembro desde el: ${date}`;
        }

        // Cargar pedidos de este usuario
        const ordersList = document.getElementById("orders-list-container");
        ordersList.innerHTML = "<p>Buscando órdenes en el sistema...</p>";

        try {
            const orders = await getUserOrdersFromDb(this.currentUser.uid);
            ordersList.innerHTML = "";
            if (orders.length === 0) {
                ordersList.innerHTML = "<p>No has realizado ningún pedido todavía.</p>";
            } else {
                orders.forEach(order => {
                    const oCard = document.createElement("div");
                    oCard.className = "order-card";
                    oCard.innerHTML = `
                        <div class="order-header">
                            <div>
                                <div class="order-id">ORDEN: PS-${order.id.substring(0,8).toUpperCase()}</div>
                                <div class="order-date">${new Date(order.createdAt).toLocaleString()}</div>
                            </div>
                            <span class="order-status status-${order.status}">${order.status}</span>
                        </div>
                        <div class="order-items-summary">
                            ${order.items.map(i => `${i.quantity}x ${i.name}`).join("<br>")}
                        </div>
                        <div style="text-align: right; font-weight: 800; margin-top: 15px;">
                            Total: S/ ${order.total.toFixed(2)}
                        </div>
                    `;
                    ordersList.appendChild(oCard);
                });
            }
        } catch (err) {
            ordersList.innerHTML = "<p>Error al sincronizar con el servidor de pedidos.</p>";
        }
    }

    /* ==========================================================================
       PANEL CONTROL DEL ADMINISTRADOR (CRUD COMPLETO & DASHBOARD)
       ========================================================================== */
    async loadAdminView() {
        if (!this.isAdmin) return;

        try {
            // Obtener Estadísticas de Firebase
            const stats = await getSystemStats();
            document.getElementById("stat-total-users").innerText = stats.usersCount;
            document.getElementById("stat-total-products").innerText = stats.productsCount;
            document.getElementById("stat-total-orders").innerText = stats.ordersCount;

            // Renderizar Almacén (Lista CRUD)
            const warehouseBody = document.getElementById("warehouse-table-body");
            warehouseBody.innerHTML = "";

            this.products.forEach(p => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td><img src="${p.imgUrl}" alt="${p.name}"></td>
                    <td><strong>${p.name}</strong></td>
                    <td>${p.category}</td>
                    <td>S/ ${p.price.toFixed(2)}</td>
                    <td><span class="stock-indicator ${p.stock < 10 ? 'low-stock' : ''}">${p.stock} unidades</span></td>
                    <td>
                        <button class="btn btn-outline edit-btn-table" style="padding: 6px 12px; margin-right: 5px;">Editar</button>
                        <button class="btn btn-black delete-btn-table" style="padding: 6px 12px; background: #ff3b30;">Eliminar</button>
                    </td>
                `;

                // Control CRUD
                tr.querySelector(".edit-btn-table").addEventListener("click", () => this.startEditProduct(p));
                tr.querySelector(".delete-btn-table").addEventListener("click", () => this.deleteProduct(p.id));

                warehouseBody.appendChild(tr);
            });

            // Renderizar Pedidos Recibidos
            const ordersAdminBody = document.getElementById("admin-orders-table-body");
            ordersAdminBody.innerHTML = "";

            const allOrders = await getAllOrdersAdmin();
            allOrders.forEach(order => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td><strong>PS-${order.id.substring(0,8).toUpperCase()}</strong></td>
                    <td>${order.userId}<br><small>${new Date(order.createdAt).toLocaleDateString()}</small></td>
                    <td>${new Date(order.createdAt).toLocaleDateString()}</td>
                    <td>${order.items.map(i => `${i.quantity}x ${i.name}`).join("<br>")}</td>
                    <td>
                        <select class="form-control status-select" style="padding: 6px; width: 130px;">
                            <option value="pendiente" ${order.status === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                            <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>Enviado</option>
                            <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Completado</option>
                        </select>
                    </td>
                    <td>
                        <button class="btn btn-black update-order-status-btn" style="padding: 6px 12px;">Actualizar</button>
                    </td>
                `;

                tr.querySelector(".update-order-status-btn").addEventListener("click", async () => {
                    const newStatus = tr.querySelector(".status-select").value;
                    try {
                        await updateOrderStatus(order.id, newStatus);
                        this.showToast("Estado del pedido actualizado");
                        this.loadAdminView();
                    } catch (err) {
                        this.showToast("Error al guardar estado de envío");
                    }
                });

                ordersAdminBody.appendChild(tr);
            });

            // Dibujar Gráfico en Canvas de forma nativa
            this.drawAdminChart(allOrders);

        } catch (err) {
            this.showToast("Error al consultar la sección administrativa de base de datos.");
        }
    }

    startEditProduct(product) {
        document.getElementById("form-product-id").value = product.id;
        document.getElementById("product-name").value = product.name;
        document.getElementById("product-price").value = product.price;
        document.getElementById("product-category").value = product.category;
        document.getElementById("product-stock").value = product.stock;
        document.getElementById("product-img-url").value = product.imgUrl;
        document.getElementById("product-desc").value = product.desc;

        document.getElementById("form-product-title").innerText = "MODIFICAR PRODUCTO REGISTRADO";
        document.getElementById("submit-product-btn").innerText = "GUARDAR CAMBIOS EN PRODUCTO";
        document.getElementById("cancel-edit-btn").style.display = "inline-flex";

        // Mover el scroll a la pestaña del formulario
        document.querySelector("[data-admin-tab='add-product']").click();
    }

    resetProductForm() {
        document.getElementById("product-form").reset();
        document.getElementById("form-product-id").value = "";
        document.getElementById("form-product-title").innerText = "NUEVO PRODUCTO";
        document.getElementById("submit-product-btn").innerText = "PUBLICAR PRODUCTO";
        document.getElementById("cancel-edit-btn").style.display = "none";
    }

    async deleteProduct(productId) {
        if (confirm("¿Estás completamente seguro de que deseas eliminar este producto de forma permanente?")) {
            try {
                await deleteProductFromDb(productId);
                this.showToast("Producto eliminado de la base de datos");
                await this.loadProducts();
                this.renderCatalog();
                this.loadAdminView();
            } catch (err) {
                this.showToast("Error al intentar procesar la eliminación");
            }
        }
    }

    drawAdminChart(orders) {
        const canvas = document.getElementById("admin-stats-chart");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Simular datos de pedidos por meses en 2026 de forma limpia
        const monthlyData = [12, 19, 3, 5, 2, 3, orders.length]; // El mes actual muestra el tamaño real
        const labels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul"];
        
        const padding = 30;
        const chartWidth = canvas.width - (padding * 2);
        const chartHeight = canvas.height - (padding * 2);
        const maxVal = Math.max(...monthlyData, 10);
        
        // Dibujar Fondo e Interfaz del Gráfico
        ctx.strokeStyle = "#e8e8ed";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, canvas.height - padding);
        ctx.lineTo(canvas.width - padding, canvas.height - padding);
        ctx.stroke();

        // Trazar Curva
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 2.5;
        ctx.beginPath();

        const points = [];

        for (let i = 0; i < monthlyData.length; i++) {
            const x = padding + (i * (chartWidth / (monthlyData.length - 1)));
            const y = (canvas.height - padding) - ((monthlyData[i] / maxVal) * chartHeight);
            points.push({x, y});
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        // Dibujar Puntos de Anclaje y Textos
        ctx.font = "10px Plus Jakarta Sans";
        ctx.fillStyle = "#86868b";
        ctx.textAlign = "center";

        points.forEach((pt, idx) => {
            ctx.fillStyle = "#000000";
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = "#86868b";
            ctx.fillText(labels[idx], pt.x, canvas.height - 10);
            ctx.fillText(monthlyData[idx], pt.x, pt.y - 10);
        });
    }

    /* ==========================================================================
       NOTIFICACIONES FLOTANTES PREMIUM (TOAST SYSTEM)
       ========================================================================== */
    showToast(message) {
        const container = document.getElementById("toast-container");
        const toast = document.createElement("div");
        toast.className = "toast";
        toast.innerText = message;

        container.appendChild(toast);
        
        // Trigger de animación de entrada
        setTimeout(() => toast.classList.add("show"), 100);

        // Destrucción tras ciclo completado
        setTimeout(() => {
            toast.classList.remove("show");
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    }
}

// Instanciar Aplicación Core como módulo activo
export const app = new App();
