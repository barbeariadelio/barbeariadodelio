import mongoose from 'mongoose';
import { ServiceModel } from '../server/src/modules/services/service.model';

async function checkServices() {
  await mongoose.connect('mongodb+srv://filipesantana859_db_user:6FVnI2EUfado7qtt@barbearia.qlkdk0q.mongodb.net/barber-delio?appName=Barbearia');
  const services = await ServiceModel.find({});
  console.log('Serviços encontrados:', services.map(s => ({ name: s.name, type: s.type, id: s._id })));
  await mongoose.disconnect();
}

checkServices().catch(console.error);
