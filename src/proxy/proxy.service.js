export default class ProxyService {
  constructor(proxyRepository) {
    this.proxyRepository = proxyRepository;
  }

  async getAllProxies() {
    const data = await this.proxyRepository.getAll();
    return data.proxies;
  }

  async getEnabledProxies() {
    const proxies = await this.getAllProxies();
    return proxies.filter(p => p.isEnabled);
  }

  async updateProxy(id, updates) {
    const data = await this.proxyRepository.getAll();
    const index = data.proxies.findIndex(p => p.id === id);
    
    if (index === -1) {
      throw new Error(`Proxy with ID ${id} not found`);
    }

    data.proxies[index] = { ...data.proxies[index], ...updates };
    await this.proxyRepository.update(data.proxies);
    return data.proxies[index];
  }

  async updateAllProxies(newProxies) {
    await this.proxyRepository.update(newProxies);
    return newProxies;
  }
}
