const puppeteer = require('puppeteer');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0.0',
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
    const el = await page.$(sel);
    if (el) {
      console.log(`🍪 Aceptando cookies en ${supermarketName}`);
      await el.click();
      await delay(2000);
      return;
    }
  }
}

async function scrapeSupermarket(urlBase, selectors, supermarketName, postalCode, searchTerm) {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);

    await page.goto(`${urlBase}${encodeURIComponent(searchTerm)}`, { waitUntil: 'networkidle2', timeout: 60000 });
    await delay(30000);
    await acceptCookies(page, supermarketName);

    if (supermarketName === 'Mercadona' && postalCode) {
      const postalInput = 'input[placeholder="Código postal"], input[id="postalCode"]';
      if (await page.$(postalInput)) {
        await page.type(postalInput, postalCode, { delay: 100 });
        await page.click('button[type="submit"], button[data-testid="submit-postal-code"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
      }
    }

    await page.waitForSelector(selectors.product, { timeout: 90000 });

    for (let i = 0; i < 10; i++) {
      const prevHeight = await page.evaluate('document.body.scrollHeight');
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      await delay(4000);
      const newHeight = await page.evaluate('document.body.scrollHeight');
      if (newHeight === prevHeight) break;
    }

    const products = await page.evaluate((selectors, supermarketName) => {
      return Array.from(document.querySelectorAll(selectors.product)).map(item => {
        const nombre = item.querySelector(selectors.name)?.innerText.trim() || 'No disponible';
        let precioStr = item.querySelector(selectors.price)?.innerText.trim() || '0';
        precioStr = precioStr.replace(/[^0-9,€]/g, '').replace(',', '.').replace('€', '');
        const precio = parseFloat(precioStr) || 0;
        const imagen = item.querySelector(selectors.image)?.src || '';
        const enlace = item.querySelector(selectors.url)?.href || '#';
        return { nombre, precio, precioStr: `${precio.toFixed(2)} €`, imagen, enlace, supermercado: supermarketName };
      }).filter(p => p.nombre !== 'No disponible');
    }, selectors, supermarketName);

    return products.sort((a, b) => a.precio - b.precio).slice(0, 3);
  } catch (err) {
    console.error(`Error en ${supermarketName}:`, err.message);
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

async function scrapeProductos(searchTerm) {
  let allProducts = [];
  for (const [name, config] of Object.entries(configSupermercados)) {
    const products = await scrapeSupermarket(config.urlBase, config.selectors, name, config.postalCode, searchTerm);
    allProducts = [...allProducts, ...products];
  }
  return allProducts.sort((a, b) => a.precio - b.precio);
}

module.exports = scrapeProductos;
