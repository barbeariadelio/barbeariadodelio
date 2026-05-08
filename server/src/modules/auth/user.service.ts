import { UserModel, IUser } from './auth.model';
import { NotFoundError } from '../../shared/errors/AppError';
import bcrypt from 'bcryptjs';

export class UserService {
  async listAll(unitId?: string): Promise<IUser[]> {
    const filter = unitId ? { unitId } : {};
    return UserModel.find(filter).select('-passwordHash').sort({ name: 1 });
  }

  async create(data: any): Promise<IUser> {
    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await UserModel.create({
      ...data,
      passwordHash,
      passwordPlain: data.password,
      isActive: true,
    });
    return UserModel.findById(user._id).select('-passwordHash') as Promise<IUser>;
  }

  async updateAccount(id: string, data: Partial<IUser>): Promise<IUser> {
    const user = await UserModel.findByIdAndUpdate(id, { $set: data }, { new: true }).select('-passwordHash');
    if (!user) throw new NotFoundError('User');
    return user;
  }
}
