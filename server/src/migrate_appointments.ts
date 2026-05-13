import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/barber-delio';

async function migrate() {
  if (!process.argv.includes('--confirm-migration')) {
    console.error('Error: You must pass --confirm-migration to run this script.');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  if (mongoose.connection.db) {
    const result = await mongoose.connection.db.collection('appointments').updateMany(
      { status: 'pending' },
      { $set: { status: 'confirmed' } }
    );
    console.log(`Updated ${result.modifiedCount} appointments to confirmed`);
    
    const count = await mongoose.connection.db.collection('appointments').countDocuments({ unitId: { $exists: false } });
    console.log(`Appointments missing unitId: ${count}`);
  }

  await mongoose.disconnect();
  console.log('Migration finished');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
