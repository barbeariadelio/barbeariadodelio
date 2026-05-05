import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/barber-delio';

async function check() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not connected');

    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));

    const counts = await Promise.all(
      collections.map(async (c) => ({
        name: c.name,
        count: await db.collection(c.name).countDocuments()
      }))
    );
  console.log('Stats:', counts);

  await mongoose.disconnect();
}

check();
