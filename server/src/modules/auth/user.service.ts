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

  async listByUnitIds(unitIds: string[]): Promise<IUser[]> {
    const cacheKey = `users:list:owner:${unitIds.sort().join(',')}`;
    const cached = sharedCache.get<IUser[]>(cacheKey);
    if (cached) return cached;

    const filter = unitIds.length > 0 ? { unitId: { $in: unitIds } } : {};
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
    sharedCache.keys().filter(k => k.startsWith('users:list:owner:')).forEach(k => sharedCache.delete(k));

    return UserModel.findById(user._id).select('-passwordHash') as Promise<IUser>;
  }

  async updateAccount(id: string, data: Partial<IUser> & { password?: string }): Promise<IUser> {
    const setData: any = {};
    const unsetData: any = {};

    const rawData = { ...data } as any;

    if (rawData.password) {
      setData.passwordHash = await bcrypt.hash(rawData.password, 10);
      setData.passwordPlain = rawData.password;
      delete rawData.password;
    }

    for (const [k, v] of Object.entries(rawData)) {
      if (v === null) unsetData[k] = '';
      else setData[k] = v;
    }
    const update: any = {};
    if (Object.keys(setData).length) update.$set = setData;
    if (Object.keys(unsetData).length) update.$unset = unsetData;
    const user = await UserModel.findByIdAndUpdate(id, update, { new: true, runValidators: true }).select('-passwordHash');
    if (!user) throw new NotFoundError('User');

    sharedCache.delete(`users:list:${user.unitId || 'all'}`);
    sharedCache.delete('users:list:all');
    sharedCache.keys().filter(k => k.startsWith('users:list:owner:')).forEach(k => sharedCache.delete(k));

    return user;
  }

  async deleteAccount(id: string): Promise<void> {
    const user = await UserModel.findByIdAndDelete(id);
    if (!user) throw new NotFoundError('User');

    sharedCache.delete(`users:list:${user.unitId || 'all'}`);
    sharedCache.delete('users:list:all');
    sharedCache.keys().filter(k => k.startsWith('users:list:owner:')).forEach(k => sharedCache.delete(k));
  }
}
