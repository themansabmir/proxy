import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default class ProxyRepository {
  constructor(filePath) {
    this.filePath = filePath || path.join(__dirname, '../../proxy.json');
  }

  async getAll() {
    const data = await fs.readFile(this.filePath, 'utf8');
    return JSON.parse(data);
  }

  async update(newProxies) {
    const data = { proxies: newProxies };
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
    return data;
  }
}
