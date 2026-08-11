'use strict';

const express = require('express');
const { MemoryStore } = require('./store/memoryStore');
const { Ledger } = require('./domain/ledger');
const { createRouter } = require('./api/routes');

function createApp({ store = new MemoryStore(), ledger = new Ledger() } = {}) {
  const app = express();
  app.use(express.json());
  app.use('/', createRouter({ store, ledger }));
  app.get('/health', (req, res) => res.json({ ok: true }));
  return app;
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  const app = createApp();
  app.listen(port, () => {
    console.log(`per-second-payments MVP server listening on :${port}`);
  });
}

module.exports = { createApp };
