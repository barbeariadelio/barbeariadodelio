
import mongoose from 'mongoose';
import { UserModel } from './src/modules/auth/auth.model';
import { env } from './src/config/env';

async function run() {
  await mongoose.connect(env.mongoUri);
  const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
  const users = await UserModel.find({ createdAt: { $gte: tenMinsAgo } });
  console.log(JSON.stringify(users, null, 2));
  await mongoose.disconnect();
}
run();
