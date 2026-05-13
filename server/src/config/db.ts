import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../shared/utils/logger';

export async function connectDb(): Promise<void> {
  try {
    await mongoose.connect(env.mongoUri, {
      maxPoolSize: 100, // Adjusted for higher throughput
      minPoolSize: 10,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000,
    });
    logger.info('MongoDB connected with pool size 10-100');
  } catch (err) {
    logger.error({ err }, 'MongoDB connection error');
    process.exit(1);
  }
}
