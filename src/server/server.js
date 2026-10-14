const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('../config');
const apiRoutes = require('./apiRoutes');

function createWebServer() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // API Routes
  app.use('/api', apiRoutes);

  // Serve static frontend assets
  const publicDir = path.resolve(__dirname, '../../public');
  app.use(express.static(publicDir));

  // Fallback for non-API routes to index.html
  app.use((req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}

module.exports = { createWebServer };
