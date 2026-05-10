import mongoose from 'mongoose';
import { ClientModel } from '../server/src/modules/clients/client.model';
import { ServiceModel } from '../server/src/modules/services/service.model';

async function fixSubscription() {
  await mongoose.connect('mongodb+srv://filipesantana859_db_user:6FVnI2EUfado7qtt@barbearia.qlkdk0q.mongodb.net/barber-delio?appName=Barbearia');
  
  const unitId = '69fa463aa078044937f7024e';
  const client = await ClientModel.findOne({ name: 'filipe santana', unitId });
  const pkg = await ServiceModel.findOne({ name: 'Pacote de 4 Cortes', unitId });

  if (client && pkg) {
    const alreadyHas = client.packages?.some(p => p.packageId.toString() === pkg._id.toString() && p.active);
    if (!alreadyHas) {
      client.packages = client.packages || [];
      client.packages.push({
        packageId: pkg._id as any,
        startDate: new Date(),
        active: true,
        itemLimits: pkg.packageItems?.map(pi => ({
          serviceId: pi.serviceId,
          quantity: pi.quantity
        })) || []
      });
      await client.save();
      console.log('Assinatura adicionada para filipe santana');
    } else {
      console.log('Cliente já possui a assinatura.');
    }
  } else {
    console.log('Cliente ou Pacote não encontrado.');
  }

  await mongoose.disconnect();
}

fixSubscription().catch(console.error);
