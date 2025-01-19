import express from 'express';
import Xvfb from 'xvfb';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

const app = express();
app.use(express.json());
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

puppeteer.use(StealthPlugin());

const xvfb = new Xvfb({
    silent: true,
    xvfb_args: ['-screen', '0', '1280x1024x24', '-ac', '+extension', 'RANDR', '+render', '-dpi', '96'],
});

console.log('Iniciando Xvfb...');
xvfb.startSync();
console.log('Xvfb iniciado com sucesso');

async function detectCaptcha(page) {
    console.log('Iniciando detecção de captcha...');
    
    // Salva screenshot inicial para debug
    await page.screenshot({ path: 'debug-captcha.png' });
    
    // Procura por elementos de captcha
    const captchaInfo = await page.evaluate(() => {
        const info = {
            iframes: [],
            elements: [],
            recaptcha: null,
            hcaptcha: null
        };

        // Procura por iframes
        document.querySelectorAll('iframe').forEach(iframe => {
            info.iframes.push({
                src: iframe.src,
                id: iframe.id,
                name: iframe.name
            });
        });

        // Procura por elementos com 'captcha' no texto/id/classe
        document.querySelectorAll('*').forEach(el => {
            const text = el.textContent?.toLowerCase() || '';
            const id = el.id?.toLowerCase() || '';
            const className = el.className?.toLowerCase() || '';
            
            if (text.includes('captcha') || id.includes('captcha') || className.includes('captcha')) {
                info.elements.push({
                    id: el.id,
                    class: el.className,
                    text: el.textContent,
                    tagName: el.tagName
                });
            }
        });

        // Procura por reCAPTCHA
        const recaptchaElement = document.querySelector('[data-sitekey]');
        if (recaptchaElement) {
            info.recaptcha = recaptchaElement.getAttribute('data-sitekey');
        }

        // Procura por hCaptcha
        const hcaptchaElement = document.querySelector('[data-hcaptcha-sitekey]');
        if (hcaptchaElement) {
            info.hcaptcha = hcaptchaElement.getAttribute('data-hcaptcha-sitekey');
        }

        return info;
    });

    // Salva o HTML da página para análise
    const html = await page.content();
    fs.writeFileSync('debug-page.html', html);

    console.log('Informações de captcha encontradas:', JSON.stringify(captchaInfo, null, 2));
    return captchaInfo;
}

app.post('/screenshot', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL é obrigatória' });
    }

    let browser;
    try {
        console.log('Iniciando browser...');
        browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: [
                '--no-sandbox',
                '--display=:99.0',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-blink-features=AutomationControlled',
                '--disable-acceleration-features',
                '--disable-gpu',
                '--window-size=1280,1024',
                '--hide-scrollbars',
                '--disable-notifications',
                '--disable-extensions'
            ]
        });

        console.log('Abrindo nova página...');
        const page = await browser.newPage();
        
        // Intercepta requisições para detectar chamadas de captcha
        await page.setRequestInterception(true);
        page.on('request', request => {
            const url = request.url();
            if (url.includes('google.com/recaptcha') || url.includes('hcaptcha.com')) {
                console.log('URL de captcha detectada:', url);
                // Procura por parâmetros de sitekey
                const sitekey = url.match(/[?&](k|sitekey)=([^&]*)/);
                if (sitekey) {
                    console.log('Sitekey encontrado na URL:', sitekey[2]);
                }
            }
            request.continue();
        });

        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(window.navigator, 'userAgent', {
                get: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0'
            });
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
            Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt'] });
            
            // Adiciona mais propriedades para evitar detecção
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
            Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
            Object.defineProperty(navigator, 'connection', {
                get: () => ({
                    rtt: 100,
                    downlink: 10,
                    effectiveType: '4g',
                })
            });
        });

        console.log(`Navegando para ${url}...`);
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
        
        // Detecta captcha após carregar a página
        const captchaInfo = await detectCaptcha(page);
        
        await sleep(30000);
        console.log('Tirando screenshot...');
        const screenshot = await page.screenshot({ encoding: 'base64' });

        console.log('Screenshot capturado com sucesso');
        
        return res.json({
            success: true,
            screenshot: screenshot,
            captchaInfo: captchaInfo
        });

    } catch (error) {
        console.error('Erro:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        if (browser) {
            await browser.close();
            console.log('Browser fechado');
        }
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});