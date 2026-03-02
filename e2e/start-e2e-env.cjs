const http = require('http');
const { spawn } = require('child_process');

const FRONTEND_HOST = '127.0.0.1';
const FRONTEND_PORT = 4300;
const API_PORT = 5010;

const corsHeaders = {
  'Access-Control-Allow-Origin': `http://${FRONTEND_HOST}:${FRONTEND_PORT}`,
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Content-Type': 'application/json'
};

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, corsHeaders);
  res.end(JSON.stringify(payload));
};

const apiServer = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/api/auth/users') {
    sendJson(res, 200, { authenticated: false });
    return;
  }

  if (req.method === 'GET' && req.url === '/api/repositories') {
    sendJson(res, 200, [{ id: 1, name: 'ReviewWise', owner: { login: 'PodolskiLuke' } }]);
    return;
  }

  if (req.method === 'GET' && req.url === '/api/repositories/PodolskiLuke/ReviewWise/pull-requests') {
    sendJson(res, 200, [{ number: 101, title: 'Add e2e smoke test' }]);
    return;
  }

  if (req.method === 'GET' && req.url === '/api/repositories/PodolskiLuke/ReviewWise/pull-requests/101/review') {
    sendJson(res, 404, { message: 'No review result found for this PR.' });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/repositories/PodolskiLuke/ReviewWise/pull-requests/101/review') {
    sendJson(res, 200, {
      review: 'Generated review: looks good overall.',
      createdAt: new Date().toISOString(),
      username: 'ci-user',
      reused: false
    });
    return;
  }

  sendJson(res, 404, { message: `Unhandled mock endpoint: ${req.method} ${req.url}` });
});

let ngServeProcess;

const shutdown = () => {
  if (ngServeProcess && !ngServeProcess.killed) {
    ngServeProcess.kill('SIGTERM');
  }

  apiServer.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

apiServer.listen(API_PORT, () => {
  ngServeProcess = spawn('npx', ['ng', 'serve', '--proxy-config', 'proxy.conf.json', '--host', FRONTEND_HOST, '--port', String(FRONTEND_PORT)], {
    stdio: 'inherit',
    shell: true
  });

  ngServeProcess.on('exit', (code) => {
    apiServer.close(() => process.exit(code ?? 0));
  });
});