export default class ProxyController {
  constructor(proxyService, forwardingService) {
    this.proxyService = proxyService;
    this.forwardingService = forwardingService;
  }

  async getAll(req, res) {
    try {
      const proxies = await this.proxyService.getAllProxies();
      res.json(proxies);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async update(req, res) {
    try {
      const proxies = req.body;
      if (!Array.isArray(proxies)) {
        return res.status(400).json({ error: 'Expected an array of proxies' });
      }
      const updatedProxies = await this.proxyService.updateAllProxies(proxies);
      res.json(updatedProxies);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async proxyRequest(req, res) {
    try {
      const requestData = {
        method: req.method,
        // Using req.originalUrl to get the full path with query string
        url: req.originalUrl,
        headers: req.headers,
        body: req.body
      };

      const results = await this.forwardingService.sendToAll(requestData);
      
      // Since it's a fan-out, we return all responses
      res.json({
        total: results.length,
        results
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}
