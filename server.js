import express from 'express';
import httpProxy from 'http-proxy';
import bodyParser from 'body-parser';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { ServerResponse } from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'config.json');

const app = express();
const proxy = httpProxy.createProxyServer({});

// Basic Middlewares
app.use(cors());
app.use(express.static('public')); // Serves your index.html

// Helper: Read/Write Config
const getConfig = () => JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const saveConfig = (config) => fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

// --- ADMIN API (Uses JSON body parser) ---
app.get('/admin/proxies', (req, res) => res.json(getConfig().proxies));

app.patch('/admin/proxies/:id', express.json(), (req, res) => {
    const config = getConfig();
    const target = config.proxies.find(p => p.id === req.params.id);
    if (!target) return res.status(404).send('Not found');
    
    target.isEnabled = req.body.isEnabled ?? target.isEnabled;
    saveConfig(config);
    res.json(target);
});

// --- FAN-OUT PROXY LOGIC ---
// Any request to /forward/... gets mirrored
// Using raw body parser to handle ALL body types as-is
app.all('/forward*', bodyParser.raw({ type: '*/*', limit: '20mb' }), (req, res) => {
    const activeTargets = getConfig().proxies.filter(p => p.isEnabled);
    
    if (activeTargets.length === 0) return res.status(503).send("No active proxies.");

    activeTargets.forEach((dest, index) => {
        const isPrimary = index === 0;
        
        // When using body-parsers, we MUST provide a buffer to http-proxy 
        // to re-stream the body, as the stream has already been consumed.
        const options = {
            target: dest.url,
            changeOrigin: true,
            buffer: Readable.from(req.body) // req.body is a Buffer here
        };

        if (isPrimary) {
            proxy.web(req, res, options, (err) => {
                if (!res.headersSent) res.status(502).send(`Primary Proxy Error: ${err.message}`);
            });
        } else {
            // Shadow requests: Need a dummy response object to catch writes/headers
            // without affecting the actual response being sent to the client.
            const dummyRes = new ServerResponse(req);
            
            // We can optionally log errors or responses from shadows here
            proxy.web(req, dummyRes, options, (err) => {
                console.error(`Shadow Error [${dest.id}]:`, err.message);
            });
        }
    });
});

const PORT = 8000;
app.listen(PORT, () => {
    console.log(`\n✅ Server active at http://localhost:${PORT}`);
    console.log(`🛠  Dashboard: http://localhost:${PORT}/index.html`);
    console.log(`🚀 Proxy Entry: http://localhost:${PORT}/forward\n`);
});