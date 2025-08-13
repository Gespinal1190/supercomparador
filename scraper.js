// scraper.js
const puppeteer = require('puppeteer');
const fs = require('fs');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** Intenta clickar botones de cookies con selectores directos y, si falla, por texto (XPath) */
async function acceptCookies(page, supermarketName) {
  const directSelectors = [
    // OneTrust común
    'button#onetrust-accept-btn-handler',
    '#onetrust-accept-btn-handler',
    // variantes genéricas
    'button.cookie-accept',
    '.accept-cookies',
    '[data-testid="cookie-accept"]',
    '[data-qa="accept-necessary-cookies-button"]',
    'button[aria-label="Aceptar"]',
    'button[aria-label="Aceptar todo"]'
  ];

  for (const sel of directSelectors) {
    const el = await page.$(sel);
    if (el) {
      console.log(`🍪 Aceptando cookies en ${supermarketName} (selector: ${sel})`);
      await el.click().catch(() => {});
      await delay(1500);
      return true;
    }
  }

  // fallback: por texto (XPath)
  const xpaths = [
    "//button[contains(., 'Aceptar todo')]",
    "//button[contains(., 'Aceptar todos')]",
    "//button[contains(., 'Aceptar')]",
    "//button[contains(., 'Acepto')]",
    "//button[contains(., 'Consentir')]",
    "//a[contains(., 'Aceptar')]"
  ];

  for (const xp of xpaths) {
    const [btn] = await page.$x(xp);
    if (btn) {
      console.log(`🍪 Aceptando cookies en ${supermarketName} (texto)`);
      await btn.click().catch(() => {});
      await delay(1500);
      return true;
    }
  }

  return false;
}

/** Espera a que exista cualquiera de los selectores dados (devuelve el que encontró) */
async function waitAnySelector(page, selectors, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const sel of selectors) {
      const found = await page.$(sel);
      if (found) return sel;
    }
    await delay(400);
  }
  throw new Error(`Timeout esperando cualquiera de: ${selectors.join(' | ')}`);
}

/** Auto-scroll hasta el final (o hasta que no cambie la altura) */
async function autoScroll(page, pauseMs = 1200, maxLoops = 30) {
  let lastHeight = await page.evaluate('document.body.scrollHeight');
  for (let i = 0; i < maxLoops; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(pauseMs);
    const newHeight = await page.evaluate('document.body.scrollHeight');
    if (newHeight === lastHeight) break;
    lastHeight = newHeight;
  }
}

/** Limpia precio a número */
function parsePrecio(texto) {
  if (!texto) return Infinity;
  const n = parseFloat(texto.replace(/[^0-9.,]/g, '').replace('.', '').replace(',', '.'));
  return Number.isFinite(n) ? n : Infinity;
}

async function scrapeSupermarket(urlBase, selectorsCfg, supermarketName, postalCode, searchTerm) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    // User-Agent moderno
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const searchUrl = `${urlBase}${encodeURIComponent(searchTerm)}`;
    console.log(`⏳ Navegando a ${supermarketName}: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 90000 }).catch(() => {});

    // Cookies
    await acceptCookies(page, supermarketName).catch(() => {});

    // Código postal para Mercadona
    if (supermarketName === 'Mercadona' && postalCode) {
      try {
        // Intentos de localizar el input de CP
        const cpSelectors = [
          'input[placeholder*="Código postal" i]',
          'input[name="postalCode"]',
          'input[type="text"][inputmode="numeric"]',
          'input[data-testid*="postal" i]'
        ];

        let cpSel = null;
        for (const sel of cpSelectors) {
          if (await page.$(sel)) { cpSel = sel; break; }
        }

        if (cpSel) {
          console.log(`📍 Ingresando código postal ${postalCode} en ${supermarketName}...`);
          await page.click(cpSel, { clickCount: 3 }).catch(() => {});
          await page.type(cpSel, postalCode, { delay: 50 });

          // Buscar botón de confirmar por selectores y por texto
          const confirmSelectors = [
            'button[type="submit"]',
            'button[aria-label*="Confirmar" i]',
            'button[aria-label*="Aplicar" i]'
          ];
          let clicked = false;
          for (const sel of confirmSelectors) {
            const el = await page.$(sel);
            if (el) {
              await el.click().catch(() => {});
              clicked = true;
              break;
            }
          }
          if (!clicked) {
            const [btn] = await page.$x("//button[contains(., 'Confirmar') or contains(., 'Aceptar') or contains(., 'Aplicar')]");
            if (btn) await btn.click().catch(() => {});
          }
          await page.waitForNetworkIdle?.( { idleTime: 1500, timeout: 10000 }).catch(() => {});
          await delay(1500);
        }
      } catch (e) {
        console.log('ℹ️ No se pudo fijar el código postal (continuo igualmente).');
      }
    }

    // Esperar contenedor de productos (robusto con alternativas)
    console.log(`🔎 Esperando productos en ${supermarketName}...`);
    const productSelector = await waitAnySelector(page, selectorsCfg.productAny, 35000)
      .catch(() => null);

    if (!productSelector) {
      // en Lidl a veces hay que hacer un pequeño scroll para que se pinten
      await page.evaluate(() => window.scrollTo(0, 500)).catch(() => {});
      // reintento corto
      const retrySel = await waitAnySelector(page, selectorsCfg.productAny, 15000).catch(() => null);
      if (!retrySel) throw new Error('No aparecieron productos');
    }

    // Scroll para cargar más (en Lidl y Carrefour ayuda)
    await autoScroll(page, 1200, 20);

    // Extraer datos
    const products = await page.evaluate((cfg, supermarketName) => {
      const candidates = cfg.productAny
        .map(sel => Array.from(document.querySelectorAll(sel)))
        .flat();
      // quitar duplicados
      const seen = new Set();
      const items = candidates.filter(el => {
        const key = el.outerHTML.slice(0, 200);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // toma el primer selector válido para cada campo
      const qFirst = (root, list) => {
        for (const sel of list) {
          const el = root.querySelector(sel);
          if (el) return el;
        }
        return null;
      };

      return items.map(item => {
        const nameEl = qFirst(item, cfg.nameAny);
        const priceEl = qFirst(item, cfg.priceAny);
        const imgEl = qFirst(item, cfg.imageAny);
        const linkEl = qFirst(item, cfg.urlAny) || item.closest('a');

        const nombre = nameEl?.textContent?.trim() || 'No disponible';
        const precioStr = priceEl?.textContent?.trim() || '';
        const imagen = imgEl?.src || imgEl?.getAttribute?.('data-src') || '';
        const enlace = linkEl?.href || '';

        // No parseamos aquí para evitar locales. Devolvemos tal cual y parsea fuera si quieres.
        return { nombre, precioStr, imagen, enlace, supermercado: supermarketName };
      }).filter(p => p.nombre && p.nombre !== 'No disponible');
    }, selectorsCfg, supermarketName);

    // Normalizar precios en Node (más control)
    const normalized = products.map(p => ({
      ...p,
      precio: parsePrecio(p.precioStr)
    })).filter(p => Number.isFinite(p.precio));

    console.log(`✅ ${normalized.length} productos extraídos de ${supermarketName}`);
    return normalized;
  } catch (error) {
    console.error(`❌ Error en ${supermarketName}:`, error.message);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

/** Config por supermercado con listas de selectores alternativos */
const configSupermercados = {
  Mercadona: {
    urlBase: 'https://tienda.mercadona.es/search-results?query=',
    selectors: {
      productAny: [
        '.product-cell',
        '[data-product-id]',
        '.product-card' // fallback
      ],
      nameAny: [
        '.product-cell__description-name',
        '.product-description__title',
        '.product-card__name',
        'h2, h3'
      ],
      priceAny: [
        '.product-price__unit-price',
        '.product-price__unit',
        '.product-card__price',
        '.price, .Price'
      ],
      imageAny: [
        '.product-cell img',
        'img[loading][src], img[data-src]'
      ],
      urlAny: [
        '.product-cell a',
        '.product a',
        'a[href*="/product"]'
      ]
    },
    postalCode: '28001'
  },
  Carrefour: {
    urlBase: 'https://www.carrefour.es/search?Ntt=',
    selectors: {
      productAny: [
        '.product-card',
        '[data-component="product-card"]',
        '.product-list__item'
      ],
      nameAny: [
        '.product-card__title',
        '.product-card__name',
        'h2, h3'
      ],
      priceAny: [
        '.product-card__price--current',
        '.product-card__price',
        '.price'
      ],
      imageAny: [
        '.product-card img',
        'img[loading][src], img[data-src]'
      ],
      urlAny: [
        '.product-card a',
        'a[href*="/supermercado"]'
      ]
    }
  },
  Lidl: {
    urlBase: 'https://www.lidl.es/es/search?q=',
    selectors: {
      productAny: [
        '.product-grid-box',
        '.grid__item',
        '[data-gtm*="product"]'
      ],
      nameAny: [
        '.product-grid-box__title',
        '.title, h2, h3'
      ],
      priceAny: [
        '.pricebox__price',
        '.retail-price__price',
        '.price, .Price'
      ],
      imageAny: [
        '.product-grid-box img',
        'img[loading][src], img[data-src]'
      ],
      urlAny: [
        '.product-grid-box a',
        'a[href*="/p/"]',
        'a[href*="/es/"]'
      ]
    }
  }
};

async function mainScraper(searchTerm = 'leche') {
  let allProducts = [];
  for (const [name, config] of Object.entries(configSupermercados)) {
    const prods = await scrapeSupermarket(
      config.urlBase,
      config.selectors,
      name,
      config.postalCode || null,
      searchTerm
    );
    allProducts = allProducts.concat(prods);
  }

  allProducts.sort((a, b) => a.precio - b.precio);
  fs.writeFileSync('productos.json', JSON.stringify(allProducts, null, 2));
  console.log(`💾 Guardados ${allProducts.length} productos en productos.json`);
}

// Ejecutar
const searchTerm = process.argv[2] || 'leche';
mainScraper(searchTerm);
