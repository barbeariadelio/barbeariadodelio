import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/barber-delio';

async function cleanup() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const collections = ['users', 'franchises', 'units', 'services', 'clients', 'products', 'appointments', 'transactions', 'tasks'];
  
  for (const colName of collections) {
    try {
      await mongoose.connection.db.collection(colName).deleteMany({});
      console.log(`Cleared ${colName}`);
    } catch (e) {
      console.log(`Error clearing ${colName}:`, e.message);
    }
  }

  await mongoose.disconnect();
  console.log('Cleanup finished');
}

cleanup();
