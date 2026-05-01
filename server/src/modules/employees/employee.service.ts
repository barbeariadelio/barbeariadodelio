import { UserModel, IUser } from '../auth/auth.model';
import { NotFoundError } from '../../shared/errors/AppError';
import bcrypt from 'bcryptjs';

export class EmployeeService {
  async findByUnit(unitId: string): Promise<IUser[]> {
    return UserModel.find({ unitId, role: 'employee', isActive: true })
      .select('-passwordHash')
      .sort({ name: 1 });
  }

  async findById(id: string): Promise<IUser> {
    const emp = await UserModel.findById(id).select('-passwordHash');
    if (!emp) throw new NotFoundError('Employee');
    return emp;
  }

  async create(data: {
    name: string;
    email: string;
    password: string;
    phone: string;
    unitId: string;
  }): Promise<IUser> {
    const passwordHash = await bcrypt.hash(data.password, 10);
    const emp = await UserModel.create({
      name: data.name,
      email: data.email,
      passwordHash,
      phone: data.phone,
      unitId: data.unitId,
      role: 'employee',
      isActive: true,
    });
    return UserModel.findById(emp._id).select('-passwordHash') as Promise<IUser>;
  }

  async update(id: string, data: Partial<IUser>): Promise<IUser> {
    const emp = await UserModel.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true },
    ).select('-passwordHash');
    if (!emp) throw new NotFoundError('Employee');
    return emp;
  }

  async deactivate(id: string): Promise<IUser> {
    const emp = await UserModel.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true },
    ).select('-passwordHash');
    if (!emp) throw new NotFoundError('Employee');
    return emp;
  }
}
