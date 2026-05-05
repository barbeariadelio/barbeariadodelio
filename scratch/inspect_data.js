const mongoose = require('mongoose');

async function inspect() {
  await mongoose.connect('mongodb://localhost:27017/barber-delio');
  const appt = await mongoose.connection.db.collection('appointments').findOne({});
  console.log('Appointment:', JSON.stringify(appt, null, 2));
  
  if (appt && appt.unitId) {
    const unit = await mongoose.connection.db.collection('units').findOne({ _id: appt.unitId });
    console.log('Unit:', JSON.stringify(unit, null, 2));
  }
  await mongoose.disconnect();
}

inspect().catch(console.error);
