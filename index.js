import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

// Import services and controllers (ESM requires .js extensions)
import ProxyRepository from './src/proxy/proxy.repository.js';
import ProxyService from './src/proxy/proxy.service.js';
import ForwardingService from './src/proxy/forwarding.service.js';
import ProxyController from './src/proxy/proxy.controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Setup Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup Dependencies (SOLID/DI)
const proxyRepository = new ProxyRepository(path.join(__dirname, 'proxy.json'));
const proxyService = new ProxyService(proxyRepository);
const forwardingService = new ForwardingService(proxyService);
const proxyController = new ProxyController(proxyService, forwardingService);

// Setup Routes
// The user asked for "getall" and "update" APIs
app.get('/getall', (req, res) => proxyController.getAll(req, res));
app.post('/update', (req, res) => proxyController.update(req, res));


// Using a standard middleware for catch-all is more robust in Express 5
app.use((req, res, next) => {
  // Prevent recursion if someone accidentally calls getall/update via this handler
  if (req.path === '/getall' || req.path === '/update') {
    return next();
  }
  return proxyController.proxyRequest(req, res);
});

app.listen(port, () => {
  console.log(`\n Proxy Server started on port :${port}`);
  
  // Basic info on start
  proxyService.getEnabledProxies()
    .then(enabled => {
      console.log(`✅ Loaded ${enabled.length} enabled proxy targets`);
    })
    .catch(err => {
      console.error('❌ Failed to load proxy config:', err.message);
    });
});
