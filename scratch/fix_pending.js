const mongoose = require('mongoose');

async function fixStatuses() {
  await mongoose.connect('mongodb://localhost:27017/barber-delio');
  console.log('Connected to DB');
  
  const result = await mongoose.connection.db.collection('appointments').updateMany(
    { status: 'pending' },
    { $set: { status: 'confirmed' } }
  );
  
  console.log(`Updated ${result.modifiedCount} appointments to confirmed`);
  await mongoose.disconnect();
}

fixStatuses().catch(console.error);
