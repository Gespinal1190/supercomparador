const express = require('express');
const cors = require('cors');
const fs = require('fs');
const cron = require('node-cron');
const { exec } = require('child_process');
const app = express();
const PORT = 3000;

app.use(express.static(__dirname));
app.use(cors());
app.use(express.json());

let productos = [];

function loadProducts() {
  try {
    if (fs.existsSync('productos.json')) {
      const data = fs.readFileSync('productos.json', 'utf8');
      productos = JSON.parse(data);
      console.log('✅ Productos cargados desde productos.json');
    } else {
      console.log('⚠️ productos.json no existe.');
      productos = [];
    }
  } catch (err) {
    console.error('❌ Error al cargar productos.json:', err);
    productos = [];
  }
}

loadProducts();

// Cron para ejecutar scraper diario con default "leche"
cron.schedule('0 0 * * *', () => {
  console.log('⏳ Ejecutando scraper programado...');
  exec(`node scraper.js "leche"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error en scraper: ${error.message}`);
      return;
    }
    console.log(`Salida del scraper: ${stdout}`);
    if (stderr) console.error(`Errores del scraper: ${stderr}`);
    loadProducts();
  });
});

// API de búsqueda
app.get('/api/productos', async (req, res) => {
  const q = req.query.q?.toLowerCase() || '';
  const filtroSuper = req.query.super?.toLowerCase() || 'all';

  if (!q) {
    return res.json([]);
  }

  let resultados = productos.filter(p => p.nombre.toLowerCase().includes(q));
  if (filtroSuper !== 'all') {
    resultados = resultados.filter(p => p.supermercado.toLowerCase() === filtroSuper);
  }

  // Si no hay resultados, ejecutar scraper con q
  if (resultados.length === 0) {
    console.log(`No hay resultados para "${q}". Ejecutando scraper...`);
    try {
      await new Promise((resolve, reject) => {
        exec(`node scraper.js "${q}"`, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error en scraper: ${error.message}`);
            reject(error);
            return;
          }
          console.log(`Salida del scraper: ${stdout}`);
          if (stderr) console.error(`Errores del scraper: ${stderr}`);
          loadProducts();
          resolve();
        });
      });
      resultados = productos.filter(p => p.nombre.toLowerCase().includes(q));
      if (filtroSuper !== 'all') {
        resultados = resultados.filter(p => p.supermercado.toLowerCase() === filtroSuper);
      }
    } catch (error) {
      console.error('Error ejecutando scraper:', error);
    }
  }

  // Fallback a productos.js
  if (resultados.length === 0) {
    console.log('Usando fallback de productos.js');
    const fallback = require('./productos.js');
    resultados = fallback.filter(p => p.nombre.toLowerCase().includes(q));
    if (filtroSuper !== 'all') {
      resultados = resultados.filter(p => p.supermercado.toLowerCase() === filtroSuper);
    }
  }

  resultados.sort((a, b) => a.precio - b.precio);
  res.json(resultados.slice(0, 3));
});

app.listen(PORT, () => {
  console.log(`✅ Servidor en http://localhost:${PORT}`);
});