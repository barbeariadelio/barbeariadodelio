import mongoose from 'mongoose';
import { AppointmentModel } from '../server/src/modules/appointments/appointment.model';

async function fixAppt() {
  await mongoose.connect('mongodb+srv://filipesantana859_db_user:6FVnI2EUfado7qtt@barbearia.qlkdk0q.mongodb.net/barber-delio?appName=Barbearia');
  
  const result = await AppointmentModel.updateMany(
    { date: '2026-05-12', startTime: '16:00' },
    { $set: { isPackage: true } }
  );

  console.log('Agendamentos atualizados:', result.modifiedCount);
  await mongoose.disconnect();
}

fixAppt().catch(console.error);
