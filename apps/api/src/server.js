import 'dotenv/config';

import { createApp } from './app.js';

const port = Number(process.env.PORT || 4000);
const app = createApp();

const server = app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

server.timeout = 15 * 60 * 1000;
server.headersTimeout = 15 * 60 * 1000 + 5000;
server.requestTimeout = 15 * 60 * 1000;
