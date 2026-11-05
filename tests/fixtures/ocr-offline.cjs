const blocked = () => { throw new Error('O reconhecimento tentou acessar a rede'); };
globalThis.fetch = blocked;
for (const name of ['http', 'https']) {
  const network = require(name);
  network.request = blocked;
  network.get = blocked;
}
