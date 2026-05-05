import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/barber-delio';

async function check() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const users = await mongoose.connection.db.collection('users').find({ email: 'admin@barbeariadelio.com.br' }).toArray();
  const user = users[0];
  console.log('User:', { id: user?._id, name: user?.name, role: user?.role });

  const units = await mongoose.connection.db.collection('units').find().toArray();
  console.log('Units:', units.map(u => ({ id: u._id, name: u.name, ownerId: u.ownerId })));

  const appts = await mongoose.connection.db.collection('appointments').find({ status: 'confirmed' }).toArray();
  console.log('Confirmed appts count:', appts.length);
  console.log('Sample appt date:', appts[0]?.date);
  console.log('Sample appt unitId:', appts[0]?.unitId);

  await mongoose.disconnect();
}

check();
