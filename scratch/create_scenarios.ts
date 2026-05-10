import mongoose from 'mongoose';
import { ClientModel } from '../server/src/modules/clients/client.model';
import { ServiceModel } from '../server/src/modules/services/service.model';
import { AppointmentModel } from '../server/src/modules/appointments/appointment.model';
import { UserModel } from '../server/src/modules/auth/auth.model';

async function createScenarios() {
  await mongoose.connect('mongodb+srv://filipesantana859_db_user:6FVnI2EUfado7qtt@barbearia.qlkdk0q.mongodb.net/barber-delio?appName=Barbearia'); 

  const unitId = new mongoose.Types.ObjectId('69fa463aa078044937f7024e');

  // 1. Service & Package
  let service = await ServiceModel.findOne({ name: 'Corte Simples', unitId });
  if (!service) {
    service = await ServiceModel.create({
      name: 'Corte Simples', price: 35, durationMinutes: 30, unitId, type: 'single'
    });
  }

  let pkg = await ServiceModel.findOne({ name: 'Pacote de 4 Cortes', unitId });
  if (!pkg) {
    pkg = await ServiceModel.create({
      name: 'Pacote de 4 Cortes',
      price: 120,
      durationMinutes: 0,
      unitId,
      type: 'package',
      packageValidity: { type: 'months', value: 1 },
      packageItems: [{ serviceId: service._id as any, quantity: 4 }]
    });
  }

  const employee = await UserModel.findOne({ unitId, role: { $in: ['employee', 'admin', 'owner'] } });
  if (!employee) {
    console.log('Nenhum profissional encontrado.');
    process.exit(1);
  }

  const createClientWithUsage = async (name: string, email: string, usedCount: number, startDate: Date) => {
    let client = await ClientModel.findOne({ email, unitId });
    if (client) await ClientModel.deleteOne({ _id: client._id });
    
    client = await ClientModel.create({
      name, email, phone: '11900000000', unitId,
      packages: [{
        packageId: pkg!._id as any,
        startDate: startDate,
        active: true,
        itemLimits: [{ serviceId: service!._id as any, quantity: 4 }]
      }]
    });

    // Create completed appointments for usage
    for (let i = 0; i < usedCount; i++) {
      await AppointmentModel.create({
        clientId: client._id,
        employeeId: employee!._id,
        serviceId: service!._id,
        unitId,
        date: '2026-05-01',
        startTime: `0${9+i}:00`,
        endTime: `0${9+i}:30`,
        status: 'completed',
        price: 0,
        isPackage: true
      });
    }
    return client;
  };

  // Scenario 1: Client 2/4
  await createClientWithUsage('Cliente Uso Parcial (2 de 4)', 'parcial@teste.com', 2, new Date());

  // Scenario 2: Client 4/4
  await createClientWithUsage('Cliente Uso Total (4 de 4)', 'total@teste.com', 4, new Date());

  // Scenario 3: Expired Client
  const expiredDate = new Date();
  expiredDate.setMonth(expiredDate.getMonth() - 2); // 2 months ago
  await createClientWithUsage('Cliente Vencido (Renovação)', 'vencido@teste.com', 1, expiredDate);

  console.log('--- CENÁRIOS CRIADOS ---');
  console.log('1. Cliente 2/4 criado.');
  console.log('2. Cliente 4/4 criado.');
  console.log('3. Cliente Vencido criado.');
  
  await mongoose.disconnect();
}

createScenarios().catch(console.error);
