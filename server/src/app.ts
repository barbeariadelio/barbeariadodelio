import express from 'express';
import cors from 'cors';
import { connectDb } from './config/db';
import { env } from './config/env';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Module routes will be added in subsequent tasks

// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.statusCode ?? 500;
  res.status(status).json({ message: err.message ?? 'Internal server error' });
});

async function start() {
  await connectDb();
  app.listen(env.port, () => {
    console.log(`Server running on port ${env.port}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  start().catch(console.error);
}

export default app;
