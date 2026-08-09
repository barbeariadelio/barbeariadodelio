/**
 * Read-only diagnostic for the permission audit done this session. Confirms
 * (or corrects) assumptions made from reading code alone, against the real
 * data. No writes of any kind — every query here is find/aggregate/count.
 */
import mongoose from 'mongoose';
import { env } from '../config/env';
import { UserModel } from '../modules/auth/auth.model';
import { ClientModel } from '../modules/clients/client.model';
import { NotificationModel } from '../modules/notifications/notification.model';

async function main() {
  await mongoose.connect(env.mongoUri);
  try {
    const usersByRole = await UserModel.aggregate([
      { $group: { _id: { role: '$role', unitId: '$unitId', isActive: '$isActive' }, count: { $sum: 1 } } },
      { $sort: { '_id.role': 1 } },
    ]);

    const cashiersWithAllowedApps = await UserModel.find({ role: 'cashier' })
      .select('name unitId allowedApps isActive')
      .lean();

    const employeesSample = await UserModel.find({ role: 'employee' })
      .select('name unitId isActive commissionRate')
      .lean();

    const ownerCount = await UserModel.countDocuments({ role: 'owner' });
    const ownerAccounts = await UserModel.find({ role: 'owner' }).select('name unitId isActive').lean();

    const clientsTotal = await ClientModel.countDocuments({});
    const clientsWithUnit = await ClientModel.countDocuments({ unitId: { $exists: true, $ne: null } });

    // Client-role USERS (login accounts) vs Client RECORDS (per-unit customer
    // profiles) are different models — this checks whether a client's login
    // account (used to call GET /notifications) carries a unitId.
    const clientUsersTotal = await UserModel.countDocuments({ role: 'client' });
    const clientUsersWithUnit = await UserModel.countDocuments({ role: 'client', unitId: { $exists: true, $ne: null } });
    const clientUserSample = await UserModel.find({ role: 'client', unitId: { $exists: true, $ne: null } })
      .select('name unitId')
      .limit(5)
      .lean();

    const notificationsTotal = await NotificationModel.countDocuments({});
    const notificationsWithUnit = await NotificationModel.countDocuments({ unitId: { $exists: true, $ne: null } });
    const notificationsWithoutUnit = notificationsTotal - notificationsWithUnit;

    let franchiseSummary: unknown = 'FranchiseModel not found / module not present';
    try {
      const { FranchiseModel } = await import('../modules/franchise/franchise.model');
      const franchises = await FranchiseModel.find({}).select('name franchisors units royaltyPercent').lean();
      franchiseSummary = franchises.map((f: any) => ({
        id: f._id.toString(),
        name: f.name,
        franchisorCount: f.franchisors?.length ?? 0,
        unitCount: f.units?.length ?? 0,
        royaltyPercent: f.royaltyPercent,
      }));
    } catch (e) {
      franchiseSummary = `error reading franchise module: ${(e as Error).message}`;
    }

    const report = {
      generatedAt: new Date().toISOString(),
      usersByRoleUnitActive: usersByRole.map(r => ({
        role: r._id.role,
        unitId: r._id.unitId?.toString() ?? null,
        isActive: r._id.isActive,
        count: r.count,
      })),
      ownerCount,
      ownerAccounts: ownerAccounts.map(o => ({ name: o.name, unitId: o.unitId?.toString() ?? null, isActive: o.isActive })),
      cashiers: cashiersWithAllowedApps.map(c => ({
        name: c.name,
        unitId: c.unitId?.toString() ?? null,
        allowedApps: c.allowedApps,
        isActive: c.isActive,
      })),
      employeesSample: employeesSample.map(e => ({ name: e.name, unitId: e.unitId?.toString() ?? null, isActive: e.isActive })),
      clients: { clientRecordsTotal: clientsTotal, clientRecordsWithUnit: clientsWithUnit },
      clientLoginAccounts: {
        total: clientUsersTotal,
        withUnitIdSet: clientUsersWithUnit,
        sampleWithUnitIdSet: clientUserSample.map(c => ({ name: c.name, unitId: c.unitId?.toString() })),
      },
      notifications: { total: notificationsTotal, withUnitId: notificationsWithUnit, withoutUnitId: notificationsWithoutUnit },
      franchise: franchiseSummary,
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
