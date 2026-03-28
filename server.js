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

import db from './database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const proxy = httpProxy.createProxyServer({});

// Basic Middlewares
app.use(cors());
app.use(express.static('public')); // Serves your index.html

// Helper functions for DB
const getAllProxies = () => db.prepare('SELECT * FROM proxies').all().map(p => ({
    ...p,
    isEnabled: Boolean(p.isEnabled),
}));

const getActiveProxies = () => db.prepare('SELECT * FROM proxies WHERE isEnabled = 1').all().map(p => ({
    ...p,
    isEnabled: true
}));

// --- DASHBOARD ---
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- ADMIN API (Uses JSON body parser) ---
app.get('/admin/proxies', (req, res) => res.json(getAllProxies()));

app.patch('/admin/proxies/:id', express.json(), (req, res) => {
    const { isEnabled, url } = req.body;
    const target = db.prepare('SELECT * FROM proxies WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).send('Not found');
    
    const update = db.prepare(`
        UPDATE proxies 
        SET isEnabled = ?, url = ?
        WHERE id = ?
    `);

    // Explicitly convert isEnabled to 1/0 for SQLite
    const enabledValue = isEnabled !== undefined ? (isEnabled ? 1 : 0) : target.isEnabled;

    update.run(
        enabledValue,
        url ?? target.url,
        req.params.id
    );

    const updated = db.prepare('SELECT * FROM proxies WHERE id = ?').get(req.params.id);
    res.json({
        ...updated,
        isEnabled: Boolean(updated.isEnabled)
    });
});

app.post('/admin/proxies', express.json(), (req, res) => {
    const { id, url, isEnabled } = req.body;
    if (!id || !url) return res.status(400).send('ID and URL are required');
    
    try {
        const insert = db.prepare('INSERT INTO proxies (id, url, isEnabled) VALUES (?, ?, ?)');
        insert.run(id, url, isEnabled ? 1 : 0);
        
        const created = db.prepare('SELECT * FROM proxies WHERE id = ?').get(id);
        res.json({
            ...created,
            isEnabled: Boolean(created.isEnabled)
        });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).send('Proxy ID already exists');
        }
        res.status(500).send(err.message);
    }
});

app.delete('/admin/proxies/:id', (req, res) => {
    const info = db.prepare('DELETE FROM proxies WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).send('Not found');
    res.sendStatus(204);
});

// --- WHATSAPP WEBHOOK: GET (Verification) ---
// Meta sends a GET with hub.mode, hub.verify_token, hub.challenge to verify the endpoint.
app.get('/api/v1/workspace/:workspaceId/whatsapp/:credentialsId/webhook', (req, res) => {
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
app.post('/api/v1/workspace/:workspaceId/whatsapp/:credentialsId/webhook', bodyParser.raw({ type: '*/*', limit: '20mb' }), (req, res) => {
    const activeTargets = getActiveProxies();
    const { workspaceId, credentialsId } = req.params;

    // Always acknowledge Meta first — it retries if we don't respond quickly.
    res.sendStatus(200);

    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    
    // Log incoming request
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] 📩 Incoming from Meta (Workspace: ${workspaceId}, Creds: ${credentialsId})`);
    try {
        const jsonBody = JSON.parse(body.toString());
        console.log(JSON.stringify(jsonBody, null, 2));
    } catch (e) {
        console.log("Raw Body:", body.toString().substring(0, 500) + (body.length > 500 ? "..." : ""));
    }

    if (activeTargets.length === 0) {
        console.warn("[Fan-out] No active targets configured. Request dropped.");
        return;
    }

    console.log(`[Fan-out] Forwarding to ${activeTargets.length} target(s)...`);

    let completed = 0;
    activeTargets.forEach((dest) => {
        // Each target gets its own Readable so the buffer isn't shared/consumed.
        const dummyRes = new ServerResponse(req);
        const options = {
            target: dest.url,
            changeOrigin: true,
            ...(body.length > 0 && { buffer: Readable.from(body) }),
        };

        proxy.web(req, dummyRes, options, (err) => {
            console.error(`[Fan-out] ❌ Error forwarding to ${dest.id} (${dest.url}): ${err.message}`);
        });

        // http-proxy starts the request immediately. 
        // We log "Finished" after the loop as the initial step, 
        // but note that the actual HTTP responses are async.
        completed++;
    });

    console.log(`[Fan-out] ✅ All ${activeTargets.length} requests fanned out successfully.\n`);
});

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
    console.log(`\n✅ Server active at http://localhost:${PORT}`);
    console.log(`🛠  Dashboard: http://localhost:${PORT}/dashboard`);
    console.log(`🚀 Webhook Entry: http://localhost:${PORT}/api/v1/workspace/:workspaceId/whatsapp/:credentialsId/webhook\n`);
});