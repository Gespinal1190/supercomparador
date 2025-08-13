const puppeteer = require('puppeteer');
const fs = require('fs');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Array de User-Agents para rotar
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
];

async function acceptCookies(page, supermarketName) {
  const selectors = [
    'button#onetrust-accept-btn-handler',
    '#onetrust-accept-btn-handler',
    'button.cookie-accept',
    '.accept-cookies',
    '[data-testid="cookie-accept"]',
    '[data-qa="accept-necessary-cookies-button"]',
    'button[aria-label="Aceptar"]',
    'button[aria-label="Aceptar todo"]'
  ];

  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        console.log(`🍪 Aceptando cookies en ${supermarketName} (selector: ${sel})`);
        await el.click();
        await delay(2000);
        return true;
      }
    } catch (err) {
      console.error(`Error al aceptar cookies en ${supermarketName} con ${sel}:`, err.message);
    }
  }

  console.log(`⚠️ No se encontraron botones de cookies en ${supermarketName}`);
  return false;
}

async function scrapeSupermarket(urlBase, selectors, supermarketName, postalCode, searchTerm) {
  let browser;
  let page;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      // executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    page = await browser.newPage();
    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    await page.setUserAgent(randomUserAgent);
    console.log(`🕵️ Usando User-Agent: ${randomUserAgent}`);

    const searchUrl = `${urlBase}${encodeURIComponent(searchTerm)}`;
    console.log(`⏳ Navegando a ${supermarketName}: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // Espera adicional para contenido dinámico
    console.log(`⏳ Esperando carga dinámica en ${supermarketName}...`);
    await delay(30000);

    // Verificar si hay CAPTCHA usando selectores específicos
    const captchaSelectors = ['#recaptcha', '.g-recaptcha', '#cf-error-details', '[data-testid="captcha"]', '.captcha-form'];
    let captchaDetected = false;
    for (const sel of captchaSelectors) {
      if (await page.$(sel)) {
        console.error(`🚨 CAPTCHA detectado en ${supermarketName} (selector: ${sel})`);
        await page.screenshot({ path: `captcha_${supermarketName}.png`, fullPage: true });
        captchaDetected = true;
        break;
      }
    }
    if (captchaDetected) return [];

    await acceptCookies(page, supermarketName);

    if (supermarketName === 'Mercadona' && postalCode) {
      try {
        const postalInput = 'input[placeholder="Código postal"], input[id="postalCode"]';
        if (await page.$(postalInput)) {
          console.log(`📍 Ingresando código postal ${postalCode} en Mercadona...`);
          await page.type(postalInput, postalCode, { delay: 100 });
          await page.click('button[type="submit"], button[data-testid="submit-postal-code"]');
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        } else {
          console.log(`ℹ️ No se encontró campo de código postal en Mercadona`);
        }
      } catch (err) {
        console.error(`Error al ingresar código postal en Mercadona:`, err.message);
      }
    }

    console.log(`🔎 Esperando productos en ${supermarketName}...`);
    try {
      // Verificar si la página contiene resultados
      const pageContent = await page.evaluate(() => document.body.innerText);
      if (pageContent.toLowerCase().includes('resultados') || pageContent.toLowerCase().includes('productos')) {
        console.log(`🛒 Página contiene resultados de búsqueda`);
      } else {
        console.log(`⚠️ No se encontraron resultados de búsqueda en la página`);
      }

      await page.waitForSelector(selectors.product, { timeout: 90000 });
      await page.waitForFunction(`document.querySelectorAll("${selectors.product}").length > 0`, { timeout: 90000 });
      const productCount = await page.evaluate((selector) => {
        return document.querySelectorAll(selector).length;
      }, selectors.product);
      console.log(`🛒 Encontrados ${productCount} elementos con selector ${selectors.product}`);
    } catch (err) {
      console.error(`❌ Error esperando selector ${selectors.product} en ${supermarketName}: ${err.message}`);
      await page.screenshot({ path: `error_${supermarketName}.png`, fullPage: true });
      return [];
    }

    // Desplazamiento para cargar más productos
    let previousHeight;
    for (let i = 0; i < 10; i++) { // Aumentado a 10 iteraciones
      previousHeight = await page.evaluate('document.body.scrollHeight');
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      await delay(4000);
      const newHeight = await page.evaluate('document.body.scrollHeight');
      if (newHeight === previousHeight) break;
    }

    await page.screenshot({ path: `debug_${supermarketName}.png`, fullPage: true });

    const products = await page.evaluate((selectors, supermarketName) => {
      const items = Array.from(document.querySelectorAll(selectors.product));
      return items.map(item => {
        const nombre = item.querySelector(selectors.name)?.innerText.trim() ||
                       item.querySelector('.title, [class*="title"], [class*="name"]')?.innerText.trim() || 'No disponible';
        let precioStr = item.querySelector(selectors.price)?.innerText.trim() ||
                        item.querySelector('.price, [class*="price"]')?.innerText.trim() || 'No disponible';
        precioStr = precioStr.replace(/[^0-9,€]/g, '').replace(',', '.').replace('€', '');
        const imagen = item.querySelector(selectors.image)?.src ||
                       item.querySelector(selectors.image)?.getAttribute('data-src') ||
                       item.querySelector('img')?.src || '';
        const enlace = item.querySelector(selectors.url)?.href ||
                       item.querySelector('a')?.href || '#';
        const precio = parseFloat(precioStr) || 0; // Cambiado a 0 para no filtrar
        return { nombre, precio, precioStr: precio > 0 ? `${precio.toFixed(2)} €` : precioStr, imagen, enlace, supermercado: supermarketName };
      }).filter(p => p.nombre !== 'No disponible'); // Relajado el filtro
    }, selectors, supermarketName);

    console.log(`✅ ${products.length} productos extraídos de ${supermarketName}`);
    return products.sort((a, b) => a.precio - b.precio).slice(0, 3);
  } catch (error) {
    console.error(`❌ Error en ${supermarketName}: ${error.message}`);
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
      price: '.product-price__unit-price',
      image: '.product-cell__image img',
      url: '.product-cell a'
    },
    postalCode: '28001'
  },
  DIA: {
    urlBase: 'https://www.dia.es/search?q=',
    selectors: {
      product: '.search-product-card',
      name: '.product-card__title',
      price: '.product-card__price--current',
      image: '.product-card__image img',
      url: '.product-card__link'
    }
  }
};

async function mainScraper(searchTerm = 'leche') {
  let allProducts = [];

  for (const [name, config] of Object.entries(configSupermercados)) {
    const products = await scrapeSupermarket(config.urlBase, config.selectors, name, config.postalCode, searchTerm);
    allProducts = [...allProducts, ...products];
  }

  allProducts.sort((a, b) => a.precio - b.precio);
  const top3 = allProducts.slice(0, 3);

  fs.writeFileSync('productos.json', JSON.stringify(top3, null, 2));
  console.log(`💾 Guardados ${top3.length} productos en productos.json`);
}

const searchTerm = process.argv[2] || 'leche';
mainScraper(searchTerm);