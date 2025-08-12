document.addEventListener("DOMContentLoaded", () => {
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

  async function buscarProductos() {
    const q = inputBusqueda.value.trim();
    if (!q) {
      listaResultados.innerHTML = "<p>Escribe un término para buscar.</p>";
      return;
    }

    listaResultados.innerHTML = "<p>Buscando... (puede tardar unos segundos)</p>";

    try {
      const res = await fetch(`/api/productos?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error("Error en servidor");
      const datos = await res.json();
      mostrarResultados(datos);
    } catch (err) {
      console.error(err);
      listaResultados.innerHTML = `<p>Error al buscar: ${err.message}</p><p>Revisa la consola del servidor para más detalles.</p>`;
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