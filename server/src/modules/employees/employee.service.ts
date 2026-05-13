import { UserModel, IUser } from '../auth/auth.model';
import { NotFoundError } from '../../shared/errors/AppError';
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
    const passwordHash = await bcrypt.hash(data.password, 10);
    const emp = await UserModel.create({
      name: data.name,
      email: data.email,
      passwordHash,
      passwordPlain: data.password,
      phone: data.phone,
      unitId: data.unitId,
      role: 'employee',
      avatar: data.avatar,
      workSchedule: data.workSchedule,
      vacations: data.vacations,
      blockedDays: data.blockedDays,
      isActive: true,
      allowedApps: ['admin'],
    });
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
