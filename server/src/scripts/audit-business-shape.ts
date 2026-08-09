/**
 * Read-only snapshot of the business's real shape in the database — services,
 * appointment volume/date range, package/subscription usage, revenue scale,
 * unit/product counts. No writes of any kind.
 */
import mongoose from 'mongoose';
import { env } from '../config/env';
import { ServiceModel } from '../modules/services/service.model';
import { AppointmentModel } from '../modules/appointments/appointment.model';
import { ClientModel } from '../modules/clients/client.model';
import { ProductModel } from '../modules/inventory/product.model';
import { UnitModel } from '../modules/units/unit.model';
import { TransactionModel } from '../modules/finance/transaction.model';

async function main() {
  await mongoose.connect(env.mongoUri);
  try {
    const units = await UnitModel.find({}).select('name isActive ownerId workingDays businessHours slotInterval').lean();

    const services = await ServiceModel.find({}).select('name type unitId price durationMinutes isActive isOnline packageItems').lean();

    const appointmentsByStatus = await AppointmentModel.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const appointmentDateRange = await AppointmentModel.aggregate([
      { $group: { _id: null, min: { $min: '$date' }, max: { $max: '$date' } } },
    ]);
    const appointmentsBySource = await AppointmentModel.aggregate([
      { $group: { _id: '$source', count: { $sum: 1 } } },
    ]);
    const appointmentsByUnit = await AppointmentModel.aggregate([
      { $group: { _id: '$unitId', count: { $sum: 1 } } },
    ]);

    const clientsWithActivePackages = await ClientModel.countDocuments({ 'packages.active': true });
    const totalClients = await ClientModel.countDocuments({});

    const products = await ProductModel.find({}).select('name unitId price stockQuantity isActive').lean();

    const txByCategory = await TransactionModel.aggregate([
      { $group: { _id: { category: '$category', type: '$type' }, count: { $sum: 1 }, total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
    ]);
    const txDateRange = await TransactionModel.aggregate([
      { $group: { _id: null, min: { $min: '$date' }, max: { $max: '$date' } } },
    ]);

    const report = {
      generatedAt: new Date().toISOString(),
      units: units.map(u => ({ id: u._id.toString(), name: u.name, isActive: u.isActive, workingDays: u.workingDays, slotInterval: u.slotInterval })),
      services: services.map(s => ({
        id: s._id.toString(), name: s.name, type: s.type, unitId: s.unitId?.toString(),
        price: s.price, durationMinutes: s.durationMinutes, isActive: s.isActive, isOnline: s.isOnline,
        packageItemCount: s.packageItems?.length ?? 0,
      })),
      appointments: {
        byStatus: appointmentsByStatus.map(r => ({ status: r._id, count: r.count })),
        bySource: appointmentsBySource.map(r => ({ source: r._id, count: r.count })),
        byUnit: appointmentsByUnit.map(r => ({ unitId: r._id?.toString(), count: r.count })),
        dateRange: appointmentDateRange[0] ? { min: appointmentDateRange[0].min, max: appointmentDateRange[0].max } : null,
      },
      clients: { total: totalClients, withActivePackages: clientsWithActivePackages },
      products: products.map(p => ({ name: p.name, unitId: p.unitId?.toString(), price: p.price, stockQuantity: p.stockQuantity, isActive: p.isActive })),
      transactions: {
        byCategoryType: txByCategory.map(r => ({ category: r._id.category, type: r._id.type, count: r.count, total: Math.round(r.total * 100) / 100 })),
        dateRange: txDateRange[0] ? { min: txDateRange[0].min, max: txDateRange[0].max } : null,
      },
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
