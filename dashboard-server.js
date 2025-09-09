const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const port = 3000;

const dashboardPath = path.join(__dirname, 'dashboard');

// API Proxy
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:3001', // API server port
  changeOrigin: true,
  onProxyReq: (proxyReq, req, res) => {
    console.log(`Proxying API request: ${req.method} ${req.path}`);
  }
}));

// Static files
app.use(express.static(dashboardPath));

app.listen(port, () => {
  console.log(`Dashboard server running at http://localhost:${port}`);
  console.log(`API proxy configured to http://localhost:3001`);
});
