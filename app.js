document.addEventListener('DOMContentLoaded', () => {
    const inputBusqueda = document.getElementById('busqueda');
    const btnBuscar = document.getElementById('btn-buscar');
    const listaResultados = document.getElementById('listaResultados');

    async function buscarProductos() {
        const q = inputBusqueda.value.trim();
        if (!q) {
            listaResultados.innerHTML = '<p>Escribe un término para buscar.</p>';
            return;
        }

        listaResultados.innerHTML = '<p>Buscando...</p>';

        try {
            const res = await fetch(`/api/productos?q=${encodeURIComponent(q)}`);
            if (!res.ok) throw new Error('Error en servidor');
            const datos = await res.json();
            mostrarResultados(datos);
        } catch (err) {
            console.error(err);
            listaResultados.innerHTML = `<p>Error al buscar: ${err.message}</p>`;
        }
    }

    function mostrarResultados(productos) {
        listaResultados.innerHTML = '';
        if (!productos || productos.length === 0) {
            listaResultados.innerHTML = '<p>No se encontraron productos.</p>';
            return;
        }

        productos.forEach(p => {
            const card = document.createElement('div');
            card.className = 'card-producto';
            card.innerHTML = `
                ${p.imagen ? `<img src="${p.imagen}" alt="${p.nombre}">` : `<div style="height:150px;display:flex;align-items:center;justify-content:center;background:#f1f5f9;color:#6b7280">Sin imagen</div>`}
                <div class="info">
                    <h4 title="${p.nombre}">${p.nombre}</h4>
                    <p style="font-size:0.9rem">${p.supermercado}</p>
                    <strong>${Number(p.precio).toFixed(2)} €</strong>
                    <a href="${p.url || '#'}" target="_blank" style="display:block;margin-top:8px;color:#2b8f5b">Ver en ${p.supermercado}</a>
                </div>
            `;
            listaResultados.appendChild(card);
        });
    }

    btnBuscar.addEventListener('click', buscarProductos);
    inputBusqueda.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            buscarProductos();
        }
    });
});