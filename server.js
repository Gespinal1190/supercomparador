const express = require("express");
const cors = require("cors");
const scrapeProductos = require("./scraper");
const db = require("./firebase");

const app = express();
app.use(cors());

app.get("/api/productos", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: "Falta parámetro q" });

  try {
    const productos = await scrapeProductos(q);

    // Guardar en Realtime Database
    await db.ref("productos").push({
      query: q,
      timestamp: Date.now(),
      productos
    });

    res.json(productos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener productos" });
  }
});

app.listen(3000, () => console.log("✅ Servidor en puerto 3000"));
