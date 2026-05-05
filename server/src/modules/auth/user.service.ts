import { UserModel, IUser } from './auth.model';
import { NotFoundError } from '../../shared/errors/AppError';

export class UserService {
  async listAll(unitId?: string): Promise<IUser[]> {
    const filter = unitId ? { unitId } : {};
    return UserModel.find(filter).select('-passwordHash').sort({ name: 1 });
  }

  async updateRole(id: string, role: string, isActive?: boolean): Promise<IUser> {
    const user = await UserModel.findByIdAndUpdate(id, { role, isActive }, { new: true }).select('-passwordHash');
    if (!user) throw new NotFoundError('User');
    return user;
  }
}
