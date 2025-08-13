const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// Sirve archivos estáticos desde el directorio actual
app.use(express.static(__dirname));

// Ruta al archivo de productos
const productosFilePath = path.join(__dirname, 'productos.json');

// API endpoint para buscar y filtrar productos
app.get('/api/productos', (req, res) => {
    const { q } = req.query;

    fs.readFile(productosFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error al leer productos.json:', err);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }

        const productos = JSON.parse(data);
        
        let resultados = productos.filter(p => {
            const nombreProducto = p.nombre ? p.nombre.toLowerCase() : '';
            return nombreProducto.includes(q.toLowerCase());
        });

        res.json(resultados);
    });
});

app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
    console.log('Abre esta URL en tu navegador para ver la página.');
});