import { UserModel, IUser } from './auth.model';
import { NotFoundError } from '../../shared/errors/AppError';
import { sharedCache } from '../../shared/utils/cache';
import bcrypt from 'bcryptjs';

export class UserService {
  async listAll(unitId?: string): Promise<IUser[]> {
    const cacheKey = `users:list:${unitId || 'all'}`;
    const cached = sharedCache.get<IUser[]>(cacheKey);
    if (cached) return cached;

    const filter = unitId ? { unitId } : {};
    const users = await UserModel.find(filter).select('-passwordHash').sort({ name: 1 });
    
    sharedCache.set(cacheKey, users, 60);
    return users;
  }

  async create(data: any): Promise<IUser> {
    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await UserModel.create({
      ...data,
      passwordHash,
      passwordPlain: data.password,
      isActive: true,
    });
    
    sharedCache.delete(`users:list:${data.unitId || 'all'}`);
    sharedCache.delete('users:list:all');

    return UserModel.findById(user._id).select('-passwordHash') as Promise<IUser>;
  }

  async updateAccount(id: string, data: Partial<IUser>): Promise<IUser> {
    const user = await UserModel.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).select('-passwordHash');
    if (!user) throw new NotFoundError('User');

    sharedCache.delete(`users:list:${user.unitId || 'all'}`);
    sharedCache.delete('users:list:all');

    return user;
  }

  async deleteAccount(id: string): Promise<void> {
    const user = await UserModel.findByIdAndDelete(id);
    if (!user) throw new NotFoundError('User');

    sharedCache.delete(`users:list:${user.unitId || 'all'}`);
    sharedCache.delete('users:list:all');
  }
}
