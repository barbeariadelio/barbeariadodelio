import mongoose from 'mongoose';
import { ClientModel } from '../server/src/modules/clients/client.model';
import { ServiceModel } from '../server/src/modules/services/service.model';
import { AppointmentModel } from '../server/src/modules/appointments/appointment.model';
import { UserModel } from '../server/src/modules/auth/auth.model';

async function seedExample() {
  await mongoose.connect('mongodb+srv://filipesantana859_db_user:6FVnI2EUfado7qtt@barbearia.qlkdk0q.mongodb.net/barber-delio?appName=Barbearia'); 

  const unitId = new mongoose.Types.ObjectId('69fa463aa078044937f7024e');

  // 1. Find or create the basic service
  let service = await ServiceModel.findOne({ name: 'Corte Simples', unitId });
  if (!service) {
    service = await ServiceModel.create({
      name: 'Corte Simples',
      price: 35,
      durationMinutes: 30,
      unitId: unitId,
      type: 'single'
    });
  }

  // 2. Find or create the package service
  let pkgService = await ServiceModel.findOne({ name: 'Pacote VIP Exemplo', unitId });
  if (!pkgService) {
    pkgService = await ServiceModel.create({
      name: 'Pacote VIP Exemplo',
      price: 150,
      durationMinutes: 0,
      unitId: unitId,
      type: 'package',
      packageValidity: { type: 'months', value: 1 },
      packageItems: [
        { serviceId: service._id as any, quantity: 4 }
      ]
    });
  }

  // 3. Find or create the client
  let client = await ClientModel.findOne({ email: 'exemplo@cliente.com', unitId });
  if (!client) {
    client = await ClientModel.create({
      name: 'Cliente Exemplo Pacote',
      email: 'exemplo@cliente.com',
      phone: '11999999999',
      unitId: unitId,
    });
  }

  // 4. Subscribe the client to the package
  const hasSubscription = client.packages?.some(p => p.packageId.toString() === pkgService!._id.toString() && p.active);
  if (!hasSubscription) {
    client.packages = client.packages || [];
    client.packages.push({
      packageId: pkgService._id as any,
      startDate: new Date(),
      active: true,
      itemLimits: [{ serviceId: service._id as any, quantity: 4 }]
    });
    await client.save();
  }

  // 5. Find an employee
  const employee = await UserModel.findOne({ unitId, role: { $in: ['employee', 'admin', 'owner'] } });
  if (!employee) {
    console.log('Nenhum profissional encontrado nesta unidade.');
    process.exit(1);
  }

  // 6. Create the appointment
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  
  const appt = await AppointmentModel.create({
    clientId: client._id,
    employeeId: employee._id,
    serviceId: service._id,
    unitId: unitId,
    date: dateStr,
    startTime: '10:00',
    endTime: '11:00',
    status: 'confirmed',
    price: 0,
    isPackage: true,
    notes: 'Exemplo de agendamento com pacote'
  });

  console.log('--- EXEMPLO CRIADO ---');
  console.log('Cliente:', client.name);
  console.log('Serviço:', service.name);
  console.log('Pacote:', pkgService.name);
  console.log('Agendamento às 10:00 criado com sucesso!');
  
  await mongoose.disconnect();
}

seedExample().catch(console.error);
