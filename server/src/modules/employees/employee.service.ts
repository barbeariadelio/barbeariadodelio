import { UserModel, IUser } from '../auth/auth.model';
import { NotFoundError } from '../../shared/errors/AppError';
import { sharedCache } from '../../shared/utils/cache';
import bcrypt from 'bcryptjs';

export class EmployeeService {
  async findByUnit(unitId: string): Promise<IUser[]> {
    return UserModel.find({ unitId, role: 'employee', isActive: true })
      .select('-passwordHash -passwordPlain')
      .sort({ name: 1 });
  }

  async findAdminByUnit(unitId: string): Promise<IUser[]> {
    return UserModel.find({ unitId, role: 'employee', isActive: true })
      .select('-passwordHash')
      .sort({ name: 1 });
  }

  async findById(id: string): Promise<IUser> {
    const emp = await UserModel.findById(id).select('-passwordHash');
    if (!emp) throw new NotFoundError('Employee');
    return emp;
  }

  async create(data: any): Promise<IUser> {
    const rawPhone = (data.phone || '').replace(/\D/g, '');
    const autoPassword = rawPhone.length >= 4 ? rawPhone.slice(-4) : '1234';
    const password = data.password || autoPassword;
    const passwordHash = await bcrypt.hash(password, 10);

    // Free unique indexes held by deactivated users so the new employee can use the same email/phone
    const orConditions: any[] = [];
    if (data.email) orConditions.push({ email: data.email.toLowerCase() });
    if (data.phone) orConditions.push({ phone: data.phone });
    if (orConditions.length > 0) {
      await UserModel.updateMany(
        { $or: orConditions, isActive: false },
        { $unset: { email: '', phone: '' } },
      );
    }

    const emp = await UserModel.create({
      name: data.name,
      email: data.email || undefined,
      passwordHash,
      passwordPlain: password,
      phone: data.phone || undefined,
      unitId: data.unitId,
      role: 'employee',
      avatar: data.avatar,
      workSchedule: data.workSchedule,
      daySchedules: data.daySchedules,
      vacations: data.vacations,
      blockedDays: data.blockedDays,
      isActive: true,
      allowedApps: ['admin'],
    });

    sharedCache.delete(`users:list:${data.unitId || 'all'}`);
    sharedCache.delete('users:list:all');
    return UserModel.findById(emp._id).select('-passwordHash') as Promise<IUser>;
  }

  async update(id: string, data: any): Promise<IUser> {
    const updateData = { ...data };
    if (updateData.password) {
      updateData.passwordHash = await bcrypt.hash(updateData.password, 10);
      updateData.passwordPlain = updateData.password;
      delete updateData.password;
    }
    const emp = await UserModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true },
    ).select('-passwordHash');
    if (!emp) throw new NotFoundError('Employee');
    return emp;
  }

  async deactivate(id: string): Promise<IUser> {
    const emp = await UserModel.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true, runValidators: true },
    ).select('-passwordHash');
    if (!emp) throw new NotFoundError('Employee');
    return emp;
  }
}
