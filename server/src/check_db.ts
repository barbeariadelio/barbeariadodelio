import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/barber-delio';

async function check() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const units = await mongoose.connection.db.collection('units').find().toArray();
  console.log('Units:', units.map(u => ({ id: u._id, name: u.name })));

  const services = await mongoose.connection.db.collection('services').find().toArray();
  console.log('Services count:', services.length);
  console.log('Sample service unitId:', services[0]?.unitId);

  await mongoose.disconnect();
}

check();
