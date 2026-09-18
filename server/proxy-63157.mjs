// 63157 → 4917 反向代理（平台预览固定走 63157）
import http from 'node:http';

const TARGET = 'http://localhost:4917';

const server = http.createServer((req, res) => {
  const options = {
    hostname: 'localhost',
    port: 4917,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: 'localhost:4917' },
  };
  const proxy = http.request(options, (pres) => {
    res.writeHead(pres.statusCode || 502, pres.headers);
    pres.pipe(res, { end: true });
  });
  proxy.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad Gateway');
  });
  req.pipe(proxy, { end: true });
});

server.listen(63157, '0.0.0.0', () => {
  console.log(`proxy 63157 -> ${TARGET} ready`);
});
