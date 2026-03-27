import express from 'express';

export default function createProxyRouter(proxyController) {
  const router = express.Router();

  // API Routes
  router.get('/getall', (req, res) => proxyController.getAll(req, res));
  router.post('/update', (req, res) => proxyController.update(req, res));

  // Catch-all for actual proxying
  router.all('/*', (req, res) => {
    // Check if it's already an API route
    if (req.path === '/getall' || req.path === '/update') {
      return; // Handled above
    }
    return proxyController.proxyRequest(req, res);
  });

  return router;
}
