const puppeteer = require('puppeteer');
const fs = require('fs');

// Función para esperar
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeSupermarket(urlBase, selectors, supermarketName, postalCode = null, searchTerm) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Construir URL con término de búsqueda
    const searchUrl = `${urlBase}${encodeURIComponent(searchTerm)}`;
    console.log(`⏳ Navegando a ${supermarketName}: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 90000 });

    // Manejar cookies
    const cookieSelectors = ['button#onetrust-accept-btn-handler', '.cookie-accept', '[data-testid="cookie-accept"]', '.accept-cookies'];
    for (const selector of cookieSelectors) {
      if (await page.$(selector)) {
        console.log(`🍪 Aceptando cookies en ${supermarketName}...`);
        await page.click(selector);
        await delay(2000);
        break;
      }
    }

    // Para Mercadona: Ingresar código postal
    if (supermarketName === 'Mercadona' && postalCode) {
      const postalInput = 'input[placeholder*="Código postal"], input#postal-code, input[name="postalCode"]';
      const submitButton = 'button[type="submit"], button.js-submit-postal, button[data-testid="submit-postal"]';
      if (await page.$(postalInput)) {
        console.log(`📍 Ingresando código postal ${postalCode} en Mercadona...`);
        await page.type(postalInput, postalCode);
        await page.click(submitButton);
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => console.log('Navegación postal completada'));
      }
    }

    // Esperar productos
    console.log(`🔎 Esperando productos en ${supermarketName}...`);
    await page.waitForSelector(selectors.product, { timeout: 90000 }).catch(() => {
      console.log(`No se encontraron productos en ${supermarketName}`);
    });

    // Scroll para cargar todos los productos
    let previousHeight;
    for (let i = 0; i < 3; i++) {
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
        return { id: Math.random().toString(36).substr(2, 9), nombre, precio, imagen, enlace, supermercado: supermarketName };
      }).filter(p => p.precio !== Infinity && p.nombre !== 'No disponible');
    }, selectors, supermarketName);

    console.log(`Productos extraídos de ${supermarketName}: ${products.length}`);
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
      price: '.price-product__amount, .product-price__unit-price',
      image: '.product-cell__image img',
      url: '.product-cell a'
    },
    postalCode: '28001' // Cambia a tu código postal
  },
  Carrefour: {
    urlBase: 'https://www.carrefour.es/search?Ntt=',
    selectors: {
      product: '.product-card',
      name: '.product-card__title',
      price: '.product-card__price, .product-card__price--current',
      image: '.product-card__media img',
      url: '.product-card__link'
    }
  },
  Lidl: {
    urlBase: 'https://www.lidl.es/es/search?q=',
    selectors: {
      product: '.product-grid-box',
      name: '.product-grid-box__title',
      price: '.price-box__price, .retail-price__price',
      image: '.product-grid-box img',
      url: '.product-grid-box a'
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

  // Guardar en productos.json
  fs.writeFileSync('productos.json', JSON.stringify(top3, null, 2));
  console.log(`Guardados ${top3.length} productos en productos.json`);
}

// Ejecutar con término de búsqueda desde la línea de comandos
const searchTerm = process.argv[2] || 'leche';
mainScraper(searchTerm);