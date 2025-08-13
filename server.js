const express = require('express');
const cors = require('cors');
const fs = require('fs');
const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');

const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname))); // Sirve index.html, style.css, app.js

let productos = [];

function loadProducts() {
  try {
    if (fs.existsSync('productos.json')) {
      const data = fs.readFileSync('productos.json', 'utf8');
      productos = JSON.parse(data).map(p => {
        if (p.precioStr && !p.precio) {
          const cleanedPrecioStr = p.precioStr.replace(/ €/g, '').replace(',', '.');
          p.precio = parseFloat(cleanedPrecioStr) || 0;
        }
        return p;
      });
      console.log('✅ Productos cargados desde productos.json:', productos.length);
    } else {
      console.log('⚠️ productos.json no existe.');
      productos = [];
    }
  } catch (err) {
    console.error('❌ Error al cargar productos.json:', err.message);
    productos = [];
  }
}

loadProducts();

function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/);
}

function filterProducts(products, query, supermarket) {
  const queryWords = normalizeText(query);
  return products.filter(p => {
    const nameWords = normalizeText(p.nombre);
    const nameMatch = queryWords.some(q => nameWords.some(n => n.includes(q)));
    const superMatch = supermarket === 'all' || p.supermercado.toLowerCase() === supermarket.toLowerCase();
    return nameMatch && superMatch;
  });
}

cron.schedule('0 0 * * *', () => {
  console.log('⏳ Ejecutando scraper programado...');
  exec(`node scraper.js "leche"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error en scraper programado: ${error.message}`);
      return;
    }
    console.log(`Salida del scraper: ${stdout}`);
    if (stderr) console.error(`Errores del scraper: ${stderr}`);
    loadProducts();
  });
});

app.get('/api/productos', async (req, res) => {
  const q = req.query.q?.trim().toLowerCase() || '';
  const filtroSuper = req.query.super?.toLowerCase() || 'all';
  console.log(`🔍 API: buscando "${q}" con filtro de supermercado "${filtroSuper}"`);

  if (!q) {
    console.log('⚠️ No se proporcionó término de búsqueda');
    return res.json([]);
  }

  let resultados = filterProducts(productos, q, filtroSuper);
  console.log(`Resultados de productos.json: ${resultados.length}`);

  if (resultados.length === 0) {
    console.log(`No hay resultados para "${q}" en productos.json. Ejecutando scraper...`);
    try {
      await new Promise((resolve) => {
        exec(`node scraper.js "${q.replace(/"/g, '\\"')}"`, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error en scraper: ${error.message}`);
            resolve();
            return;
          }
          console.log(`Salida del scraper: ${stdout}`);
          if (stderr) console.error(`Errores del scraper: ${stderr}`);
          loadProducts();
          resolve();
        });
      });
      resultados = filterProducts(productos, q, filtroSuper);
      console.log(`Resultados tras scraper: ${resultados.length}`);
    } catch (error) {
      console.error('Error ejecutando scraper:', error.message);
    }
  }

  if (resultados.length === 0) {
    console.log('Usando fallback de productos.js');
    const fallback = require('./productos.js');
    resultados = filterProducts(fallback, q, filtroSuper);
    console.log(`Resultados de productos.js: ${resultados.length}`);
  }

  resultados.sort((a, b) => a.precio - b.precio);
  console.log(`Enviando ${resultados.length} resultados al frontend`);
  res.json(resultados.slice(0, 3));
});

app.listen(PORT, () => {
  console.log(`✅ Servidor en http://localhost:${PORT}`);
});