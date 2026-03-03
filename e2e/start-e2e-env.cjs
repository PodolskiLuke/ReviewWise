const http = require('http');
const { spawn } = require('child_process');

const FRONTEND_HOST = '127.0.0.1';
const FRONTEND_PORT = 4300;
const API_PORT = 5010;

const corsHeaders = {
  'Access-Control-Allow-Origin': `http://${FRONTEND_HOST}:${FRONTEND_PORT}`,
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Content-Type': 'application/json'
};

let mockUserSettings = {
  schemaVersion: 1,
  profile: {
    displayName: 'ci-user',
    timezone: 'Europe/London'
  },
  reviewPreferences: {
    depth: 'standard',
    focusAreas: ['bugs', 'security', 'quality'],
    outputLength: 'medium',
    autoLoadLatestReview: true,
    autoGenerateWhenMissing: true
  },
  repositoryPreferences: {
    defaultRepository: {
      owner: 'PodolskiLuke',
      name: 'ReviewWise'
    },
    excludedRepositories: []
  },
  uiPreferences: {
    showCooldownHints: true
  },
  updatedAt: null
};

let mockRecentReviews = [];

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
    sendJson(res, 200, { review: null, createdAt: null, username: null });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/repositories/PodolskiLuke/ReviewWise/pull-requests/101/review') {
    const createdAt = new Date().toISOString();
    mockRecentReviews = [
      {
        owner: 'PodolskiLuke',
        repo: 'ReviewWise',
        prNumber: 101,
        createdAt,
        username: 'ci-user'
      },
      ...mockRecentReviews.filter((review) => !(review.owner === 'PodolskiLuke' && review.repo === 'ReviewWise' && review.prNumber === 101))
    ];

    sendJson(res, 200, {
      review: 'Generated review: looks good overall.',
      createdAt,
      username: 'ci-user',
      reused: false
    });
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/reviews/recent')) {
    const requestUrl = new URL(req.url, `http://${FRONTEND_HOST}:${API_PORT}`);
    const requestedLimit = Number(requestUrl.searchParams.get('limit') ?? '5');
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 5;
    sendJson(res, 200, { reviews: mockRecentReviews.slice(0, limit) });
    return;
  }

  if (req.method === 'GET' && req.url === '/api/user-settings') {
    sendJson(res, 200, { settings: mockUserSettings });
    return;
  }

  if (req.method === 'PUT' && req.url === '/api/user-settings') {
    let rawBody = '';
    req.on('data', (chunk) => {
      rawBody += chunk;
    });

    req.on('end', () => {
      try {
        const payload = rawBody ? JSON.parse(rawBody) : {};
        if (!payload.settings || typeof payload.settings !== 'object') {
          sendJson(res, 400, { message: 'Settings payload is required.' });
          return;
        }

        mockUserSettings = {
          ...payload.settings,
          updatedAt: new Date().toISOString()
        };

        sendJson(res, 200, { settings: mockUserSettings });
      } catch {
        sendJson(res, 400, { message: 'Invalid JSON payload.' });
      }
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