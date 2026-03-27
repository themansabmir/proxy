import express from 'express';
import 'dotenv/config';
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

// --- DASHBOARD ---
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

// --- WHATSAPP WEBHOOK: GET (Verification) ---
// Meta sends a GET with hub.mode, hub.verify_token, hub.challenge to verify the endpoint.
app.get('/webhook', (req, res) => {
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "my_verify_token";

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("[Webhook] Verification successful");
        return res.status(200).send(challenge);
    }

    console.warn("[Webhook] Verification failed — token mismatch or missing params");
    return res.sendStatus(403);
});

// --- WHATSAPP WEBHOOK: POST (Fan-out) ---
// Meta sends a POST for every incoming message/event.
// We must respond 200 OK immediately, then forward to all active targets.
app.post('/webhook', bodyParser.raw({ type: '*/*', limit: '20mb' }), (req, res) => {
    const activeTargets = getConfig().proxies.filter(p => p.isEnabled);

    // Always acknowledge Meta first — it retries if we don't respond quickly.
    res.sendStatus(200);

    if (activeTargets.length === 0) {
        console.warn("[Fan-out] No active targets configured");
        return;
    }

    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    console.log(`[Fan-out] Forwarding to ${activeTargets.length} target(s)...`);

    activeTargets.forEach((dest) => {
        // Each target gets its own Readable so the buffer isn't shared/consumed.
        const dummyRes = new ServerResponse(req);
        const options = {
            target: dest.url,
            changeOrigin: true,
            ...(body.length > 0 && { buffer: Readable.from(body) }),
        };

        proxy.web(req, dummyRes, options, (err) => {
            console.error(`[Fan-out] Error forwarding to ${dest.id} (${dest.url}): ${err.message}`);
        });
    });
});

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
    console.log(`\n✅ Server active at http://localhost:${PORT}`);
    console.log(`🛠  Dashboard: http://localhost:${PORT}/dashboard`);
    console.log(`🚀 Webhook Entry: http://localhost:${PORT}/forward\n`);
});