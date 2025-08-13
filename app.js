document.addEventListener("DOMContentLoaded", async () => {
  const inputBusqueda = document.getElementById("busqueda");
  const selectSuper = document.getElementById("filter-super");
  const btnBuscar = document.getElementById("btn-buscar");
  const listaResultados = document.getElementById("listaResultados");
  const listaProductos = document.getElementById("listaProductos");
  const resultadoEconomico = document.getElementById("resultadoEconomico");
  const btnClear = document.getElementById("btn-clear");
  const btnDownload = document.getElementById("btn-download");
  const countList = document.getElementById("count-list");

  let carrito = [];
  let productos = [];

  // Cargar productos.json estáticamente
  async function loadProducts() {
    try {
      const res = await fetch('./productos.json');
      if (!res.ok) throw new Error('No se pudo cargar productos.json');
      productos = await res.json();
      console.log('✅ Productos cargados desde productos.json:', productos.length);
    } catch (err) {
      console.error('❌ Error al cargar productos.json:', err.message);
      // Fallback a productos.js
      productos = [
        { "nombre": "Leche Entera 1L", "precio": 1.25, "supermercado": "Mercadona", "imagen": "https://via.placeholder.com/200x150?text=Leche+Mercadona" },
        { "nombre": "Leche Entera 1L", "precio": 1.30, "supermercado": "Carrefour", "imagen": "https://via.placeholder.com/200x150?text=Leche+Carrefour" },
        { "nombre": "Leche Entera 1L", "precio": 1.28, "supermercado": "DIA", "imagen": "https://via.placeholder.com/200x150?text=Leche+DIA" },
        { "nombre": "Pan de Molde", "precio": 1.50, "supermercado": "Mercadona", "imagen": "https://via.placeholder.com/200x150?text=Pan+Mercadona" },
        { "nombre": "Pan de Molde", "precio": 1.60, "supermercado": "Carrefour", "imagen": "https://via.placeholder.com/200x150?text=Pan+Carrefour" },
        { "nombre": "Huevos Camperos 12ud", "precio": 2.50, "supermercado": "Mercadona", "imagen": "https://via.placeholder.com/200x150?text=Huevos+Mercadona" },
        { "nombre": "Huevos Camperos 12ud", "precio": 2.70, "supermercado": "Carrefour", "imagen": "https://via.placeholder.com/200x150?text=Huevos+Carrefour" },
        { "nombre": "Aceite de Oliva 1L", "precio": 5.90, "supermercado": "Mercadona", "imagen": "https://via.placeholder.com/200x150?text=Aceite+Mercadona" },
        { "nombre": "Aceite de Oliva 1L", "precio": 6.10, "supermercado": "Carrefour", "imagen": "https://via.placeholder.com/200x150?text=Aceite+Carrefour" },
        { "nombre": "Aceite de Oliva 1L", "precio": 5.95, "supermercado": "DIA", "imagen": "https://via.placeholder.com/200x150?text=Aceite+DIA" }
      ];
      console.log('Usando fallback de productos.js:', productos.length);
    }
  }

  // Normalizar texto para búsquedas flexibles
  function normalizeText(text) {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
      .replace(/[^a-z0-9\s]/g, '') // Eliminar caracteres especiales
      .split(/\s+/); // Dividir en palabras
  }

  // Filtrar productos con coincidencia flexible
  function filterProducts(products, query, supermarket) {
    const queryWords = normalizeText(query);
    return products.filter(p => {
      const nameWords = normalizeText(p.nombre);
      const nameMatch = queryWords.some(q => nameWords.some(n => n.includes(q)));
      const superMatch = supermarket === 'all' || p.supermercado.toLowerCase() === supermarket.toLowerCase();
      return nameMatch && superMatch;
    });
  }

  // Cargar productos al iniciar
  await loadProducts();

  async function buscarProductos() {
    const q = inputBusqueda.value.trim();
    if (!q) {
      listaResultados.innerHTML = "<p>Escribe un término para buscar.</p>";
      return;
    }

    const superFilter = selectSuper.value || 'all';

    listaResultados.innerHTML = "<p>Buscando...</p>";

    try {
      let resultados = filterProducts(productos, q, superFilter);
      resultados.sort((a, b) => a.precio - b.precio);
      console.log(`Enviando ${resultados.length} resultados al frontend`);
      mostrarResultados(resultados.slice(0, 3));
    } catch (err) {
      console.error(err);
      listaResultados.innerHTML = `<p>Error al buscar: ${err.message}</p>`;
    }
  }

  function mostrarResultados(productos) {
    listaResultados.innerHTML = "";
    if (!productos || productos.length === 0) {
      listaResultados.innerHTML = "<p>No se encontraron productos (prueba otro término).</p>";
      return;
    }

    productos.forEach(p => {
      const card = document.createElement("div");
      card.className = "card-producto";
      card.innerHTML = `
        ${p.imagen ? `<img src="${p.imagen}" alt="${p.nombre}">` : `<div style="height:150px;display:flex;align-items:center;justify-content:center;background:#f1f5f9;color:#6b7280">Sin imagen</div>`}
        <div class="info">
          <h4 title="${p.nombre}">${p.nombre.length > 60 ? p.nombre.slice(0, 60) + "…" : p.nombre}</h4>
          <div class="price-row">
            <p style="font-size:0.9rem">${p.supermercado}</p>
            <strong>${Number(p.precio).toFixed(2)} €</strong>
          </div>
          <a href="${p.enlace || '#'}" target="_blank" style="display:block;margin-bottom:8px;color:#2b8f5b">Ver en ${p.supermercado}</a>
          <button>Añadir</button>
        </div>
      `;

      card.querySelector("button").addEventListener("click", () => {
        carrito.push(p);
        actualizarCarrito();
      });

      listaResultados.appendChild(card);
    });
  }

  function actualizarCarrito() {
    listaProductos.innerHTML = "";
    let total = 0;

    carrito.forEach((p, index) => {
      total += Number(p.precio);
      const li = document.createElement("li");
      li.innerHTML = `
        ${p.nombre} - ${Number(p.precio).toFixed(2)} €
        <button data-index="${index}" title="Quitar">❌</button>
      `;
      li.querySelector("button").addEventListener("click", () => {
        carrito.splice(index, 1);
        actualizarCarrito();
      });
      listaProductos.appendChild(li);
    });

    resultadoEconomico.textContent = `Total: ${total.toFixed(2)} €`;
    countList.textContent = carrito.length;
  }

  btnClear.addEventListener("click", () => {
    carrito = [];
    actualizarCarrito();
  });

  btnDownload.addEventListener("click", () => {
    let csv = "Producto,Precio,Supermercado,Enlace\n";
    carrito.forEach(p => {
      csv += `"${p.nombre.replace(/"/g,'""')}",${Number(p.precio).toFixed(2)},${p.supermercado},${p.enlace || '#'}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lista_compra.csv";
    a.click();
  });

  inputBusqueda.addEventListener("keyup", (e) => {
    if (e.key === "Enter") btnBuscar.click();
  });

  btnBuscar.addEventListener("click", buscarProductos);
});