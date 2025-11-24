const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const axios = require('axios');

const CACHE_DIR = path.join(app.getPath('userData'), 'cache');
const STORAGE_FILE = path.join(app.getPath('userData'), 'storage.json');

fs.ensureDirSync(CACHE_DIR);

function getCachePath(url) {
    const hash = crypto.createHash('md5').update(url).digest('hex');
    return {
        body: path.join(CACHE_DIR, hash),
        meta: path.join(CACHE_DIR, `${hash}.json`)
    };
}

async function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: false,
            sandbox: false,
            webSecurity: false
        }
    });

    // Handle LocalStorage Sync
    ipcMain.on('save-storage', (event, data) => {
        fs.writeFileSync(STORAGE_FILE, data);
    });

    ipcMain.on('get-storage', (event) => {
        if (fs.existsSync(STORAGE_FILE)) {
            event.reply('load-storage', fs.readFileSync(STORAGE_FILE, 'utf8'));
        } else {
            event.reply('load-storage', null);
        }
    });
    

    ipcMain.on('update-connection-status', (event, status) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            win.setTitle(`Protox Mapmaker - ${status}`);
        }
    });

    // Load the URL
    // We use a custom loading mechanism via protocol interception below, 
    // but we still need to initiate the navigation.
    win.loadURL('https://mapmaker.protox.io');
}

app.whenReady().then(() => {
    // Intercept HTTP and HTTPS protocols
    // Note: This is a powerful override. We must ensure we handle it correctly.
    const schemes = ['http', 'https'];
    
    // Intercept HTTP and HTTPS protocols
    // const schemes = ['http', 'https']; // Already declared above
    
    schemes.forEach(scheme => {
        protocol.handle(scheme, async (request) => {
            const url = request.url;
            // console.log(`[Main] Intercepting: ${url}`);
            const { body: bodyPath, meta: metaPath } = getCachePath(url);

            try {
                // Try to fetch online using axios (Node http stack) to bypass interception
                // console.log(`[Main] Fetching online: ${url}`);
                const response = await axios.get(url, {
                    responseType: 'arraybuffer',
                    validateStatus: () => true, // Don't throw on 404/500
                    headers: {
                        ...request.headers,
                        'User-Agent': 'Electron-Offline-Client' // Avoid loop if server checks UA? Unlikely needed but good practice
                    }
                });

                if (response.status >= 200 && response.status < 300) {
                    // console.log(`[Main] Online success: ${url}`);
                    
                    const buffer = response.data;
                    const headers = response.headers;

                    // Write to cache asynchronously
                    fs.outputFile(bodyPath, buffer).catch(err => console.error('Cache write error:', err));
                    fs.outputJson(metaPath, { headers, status: response.status, statusText: response.statusText }).catch(err => console.error('Cache meta error:', err));

                    return new Response(buffer, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: headers
                    });
                } else {
                    // console.log(`[Main] Server returned ${response.status} for ${url}`);
                    return new Response(response.data, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers
                    });
                }

            } catch (error) {
                console.log(`[Main] Offline/Error for ${url}: ${error.message}. Checking cache...`);
                
                if (await fs.pathExists(bodyPath) && await fs.pathExists(metaPath)) {
                    try {
                        const meta = await fs.readJson(metaPath);
                        const body = await fs.readFile(bodyPath);
                        console.log(`[Main] Serving from cache: ${url}`);

                        return new Response(body, {
                            status: meta.status,
                            statusText: meta.statusText,
                            headers: meta.headers
                        });
                    } catch (cacheErr) {
                        console.error(`[Main] Error reading cache for ${url}:`, cacheErr);
                    }
                }

                console.log(`[Main] No cache for: ${url}`);
                return new Response('Offline and not cached.', { status: 503, statusText: 'Service Unavailable' });
            }
        });
    });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});


