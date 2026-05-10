import mongoose from 'mongoose';
import { ClientModel } from '../server/src/modules/clients/client.model';
import { UnitModel } from '../server/src/modules/units/unit.model';

async function findActiveUnit() {
  await mongoose.connect('mongodb+srv://filipesantana859_db_user:6FVnI2EUfado7qtt@barbearia.qlkdk0q.mongodb.net/barber-delio?appName=Barbearia');
  
  const client = await ClientModel.findOne({ name: 'filipe santana' });
  if (client) {
    console.log('UnitID do filipe santana:', client.unitId);
  } else {
    console.log('Cliente filipe santana não encontrado.');
  }

  const units = await UnitModel.find({});
  console.log('Unidades disponíveis:', units.map(u => ({ name: u.name, id: u._id })));

  await mongoose.disconnect();
}

findActiveUnit().catch(console.error);
