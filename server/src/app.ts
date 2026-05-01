import express from 'express';
import cors from 'cors';
import { connectDb } from './config/db';
import { env } from './config/env';
import { errorHandler } from './shared/middlewares/errorHandler';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Module routes will be added in subsequent tasks

app.use(errorHandler);

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
