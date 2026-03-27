import axios from 'axios';

export default class ForwardingService {
  constructor(proxyService) {
    this.proxyService = proxyService;
  }

  async sendToAll(requestData) {
    const enabledProxies = await this.proxyService.getEnabledProxies();
    
    if (enabledProxies.length === 0) {
      return { success: false, message: 'No enabled proxies found' };
    }

    const promises = enabledProxies.map(async (proxy) => {
      try {
        // Construct the final URL
        // proxy.url might end with a slash, requestData.url often starts with one.
        // We ensure a single slash correctly.
        const baseUrl = proxy.url.endsWith('/') ? proxy.url.slice(0, -1) : proxy.url;
        const targetUrl = requestData.url.startsWith('/') ? requestData.url : `/${requestData.url}`;
        const fullUrl = `${baseUrl}${targetUrl}`;
        
        const response = await axios({
          method: requestData.method,
          url: fullUrl,
          data: requestData.body,
          headers: this._filterHeaders(requestData.headers),
          timeout: 5000 // default timeout 5s
        });

        return {
          id: proxy.id,
          url: proxy.url,
          status: response.status,
          data: response.data
        };
      } catch (error) {
        return {
          id: proxy.id,
          url: proxy.url,
          status: error.response?.status || 500,
          error: error.message
        };
      }
    });

    const results = await Promise.all(promises);
    return results;
  }

  _filterHeaders(headers) {
    // Filter out hop-by-hop headers or host headers that might break the outgoing request
    const { host, ...rem } = headers;
    return rem;
  }
}
