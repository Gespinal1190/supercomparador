const puppeteer = require('puppeteer');
const fs = require('fs');

// Función para esperar
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeSupermarket(urlBase, selectors, supermarketName, postalCode = null, searchTerm) {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    // Construir URL con término de búsqueda
    const searchUrl = `${urlBase}${encodeURIComponent(searchTerm)}`;
    console.log(`⏳ Navegando a ${supermarketName}: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // Manejar cookies
    const cookieSelector = 'button#onetrust-accept-btn-handler';
    if (await page.$(cookieSelector)) {
      await page.click(cookieSelector);
      await delay(2000);
    }

    // Para Mercadona: Ingresar código postal si es necesario
    if (supermarketName === 'Mercadona' && postalCode) {
      const postalInput = 'input[placeholder="Código postal"]';
      if (await page.$(postalInput)) {
        await page.type(postalInput, postalCode);
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
      }
    }

    // Esperar a que carguen productos
    await page.waitForSelector(selectors.product, { timeout: 60000 });

    // Scroll infinito para cargar todos
    let previousHeight;
    while (true) {
      previousHeight = await page.evaluate('document.body.scrollHeight');
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      await delay(3000);
      const newHeight = await page.evaluate('document.body.scrollHeight');
      if (newHeight === previousHeight) break;
    }

    // Captura para depuración
    await page.screenshot({ path: `debug_${supermarketName}.png` });

    // Extraer productos
    const products = await page.evaluate((selectors, supermarketName) => {
      const items = Array.from(document.querySelectorAll(selectors.product));
      return items.map(item => {
        const nombre = item.querySelector(selectors.name)?.innerText.trim() || 'No disponible';
        const precioStr = item.querySelector(selectors.price)?.innerText.trim() || 'No disponible';
        const imagen = item.querySelector(selectors.image)?.src || '';
        const enlace = item.querySelector(selectors.url)?.href || '#';
        const precio = parseFloat(precioStr.replace(/[^0-9.,]/g, '').replace(',', '.')) || Infinity;
        return { nombre, precio, imagen, enlace, supermercado: supermarketName };
      }).filter(p => p.precio !== Infinity && p.nombre !== 'No disponible');
    }, selectors, supermarketName);

    return products;
  } catch (error) {
    console.error(`Error en ${supermarketName}:`, error);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

const configSupermercados = {
  Mercadona: {
    urlBase: 'https://tienda.mercadona.es/search-results?query=',
    selectors: {
      product: '.product-cell',
      name: '.product-cell__description-name',
      price: '.price-product__amount',
      image: '.product-cell img',
      url: '.product-cell a'
    },
    postalCode: '28001' // Cambia a tu código postal si es necesario
  },
  DIA: {
    urlBase: 'https://www.dia.es/search?q=',
    selectors: {
      product: '.product-list__item',
      name: '.product-list__item-name',
      price: '.product-list__item-price',
      image: '.product-list__item-image img',
      url: '.product-list__item-link'
    }
  }
};

async function mainScraper(searchTerm = 'leche') {
  let allProducts = [];

  for (const [name, config] of Object.entries(configSupermercados)) {
    const products = await scrapeSupermarket(config.urlBase, config.selectors, name, config.postalCode, searchTerm);
    allProducts = [...allProducts, ...products];
  }

  // Ordenar por precio y tomar top 3
  allProducts.sort((a, b) => a.precio - b.precio);
  const top3 = allProducts.slice(0, 3);

  fs.writeFileSync('productos.json', JSON.stringify(top3, null, 2));
  console.log(`Guardados ${top3.length} productos en productos.json`);
}

// Ejecutar con término de búsqueda desde la línea de comandos
const searchTerm = process.argv[2] || 'leche';
mainScraper(searchTerm);