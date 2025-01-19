import express from 'express';
import Xvfb from 'xvfb';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

const app = express();
app.use(express.json());

puppeteer.use(StealthPlugin());

const xvfb = new Xvfb({
    silent: true,
    xvfb_args: ['-screen', '0', '1920x1080x24', '-ac'],
});

console.log('Iniciando Xvfb...');
xvfb.startSync();
console.log('Xvfb iniciado com sucesso');

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
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--start-maximized'
            ]
        });

        console.log('Abrindo nova página...');
        const page = await browser.newPage();
        
        console.log(`Navegando para ${url}...`);
        await page.goto(url);
        
        await page.waitForTimeout(45000);
        // Tira um screenshot
        console.log('Tirando screenshot...');
        const screenshot = await page.screenshot({ encoding: 'base64' });

        console.log('Screenshot capturado com sucesso');
        
        return res.json({
            success: true,
            screenshot: screenshot
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

// Rota de health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});