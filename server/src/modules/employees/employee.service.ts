import { UserModel, IUser } from '../auth/auth.model';
import { NotFoundError } from '../../shared/errors/AppError';
import { sharedCache } from '../../shared/utils/cache';
import bcrypt from 'bcryptjs';

export class EmployeeService {
  async findByUnitPublic(unitId: string): Promise<any[]> {
    const cacheKey = `users:public:${unitId}`;
    const cached = sharedCache.get<any[]>(cacheKey);
    if (cached) return cached;
    const employees = await UserModel.find({ unitId, role: 'employee', isActive: true })
      .select('-passwordHash -passwordPlain -email -phone -commissionRate -allowedApps -tokenVersion -theme -vacations -blockedDays')
      .lean();
    const sorted = (employees as any[])
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'pt-BR'))
      .map((e) => {
        const { avatar, ...rest } = e as any;
        return { ...rest, hasAvatar: !!(avatar as string | undefined) };
      });
    sharedCache.set(cacheKey, sorted, 60);
    return sorted;
  }

  async getPublicAvatar(id: string): Promise<{ mimeType: string; data: Buffer } | { redirect: string } | null> {
    const emp = await UserModel.findById(id).select('avatar').lean();
    const avatar = (emp as any)?.avatar as string | undefined;
    if (!avatar) return null;
    if (avatar.startsWith('http')) return { redirect: avatar };
    const match = avatar.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) return null;
    return { mimeType: match[1], data: Buffer.from(match[2], 'base64') };
  }

  async findByUnit(unitId: string): Promise<any[]> {
    const cacheKey = `users:list:franchise:${unitId}`;
    const cached = sharedCache.get<any[]>(cacheKey);
    if (cached) return cached;
    const employees = await UserModel.find({ unitId, role: 'employee', isActive: true })
      .select('-passwordHash -passwordPlain')
      .lean();
    const sorted = employees.sort((a: any, b: any) => (a.name ?? '').localeCompare(b.name ?? '', 'pt-BR'));
    sharedCache.set(cacheKey, sorted, 60);
    return sorted;
  }

  async findAdminByUnit(unitId: string): Promise<any[]> {
    const cacheKey = `users:list:admin:${unitId}`;
    const cached = sharedCache.get<any[]>(cacheKey);
    if (cached) return cached;
    const employees = await UserModel.find({ unitId, role: 'employee', isActive: true })
      .select('-passwordHash')
      .lean();
    const sorted = employees.sort((a: any, b: any) => (a.name ?? '').localeCompare(b.name ?? '', 'pt-BR'));
    sharedCache.set(cacheKey, sorted, 60);
    return sorted;
  }

  async findById(id: string): Promise<IUser> {
    const emp = await UserModel.findById(id).select('-passwordHash').lean();
    if (!emp) throw new NotFoundError('Employee');
    return emp as unknown as IUser;
  }

  async create(data: any): Promise<IUser> {
    const rawPhone = (data.phone || '').replace(/\D/g, '');
    const autoPassword = rawPhone.length >= 4 ? rawPhone.slice(-4) : '1234';
    const password = data.password || autoPassword;
    const passwordHash = await bcrypt.hash(password, 10);

    // Free unique indexes held by deactivated users so the new employee can use the same email/phone
    const orConditions: any[] = [];
    if (data.email) orConditions.push({ email: data.email.toLowerCase() });
    if (rawPhone) orConditions.push({ phone: rawPhone });
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
      allowedApps: data.allowedApps ?? ['admin'],
      commissionRate: data.commissionRate ?? 0,
    });

    const uid = data.unitId || 'all';
    sharedCache.delete(`users:list:franchise:${uid}`);
    sharedCache.delete(`users:list:admin:${uid}`);
    sharedCache.delete(`users:public:${uid}`);
    return UserModel.findById(emp._id).select('-passwordHash').lean() as unknown as Promise<IUser>;
  }

  async update(id: string, data: any): Promise<IUser> {
    const updateData = { ...data };
    if (!updateData.avatar) delete updateData.avatar;
    if (updateData.password) {
      updateData.passwordHash = await bcrypt.hash(updateData.password, 10);
      updateData.passwordPlain = updateData.password;
      delete updateData.password;
    }

    // Free unique indexes held by inactive users (excluding the document being updated)
    const orConditions: any[] = [];
    if (updateData.email) orConditions.push({ email: updateData.email.toLowerCase(), _id: { $ne: id } });
    if (updateData.phone) orConditions.push({ phone: updateData.phone, _id: { $ne: id } });
    if (orConditions.length > 0) {
      await UserModel.updateMany(
        { $or: orConditions, isActive: false },
        { $unset: { email: '', phone: '' } },
      );
    }

    // Avoid setting empty strings for unique-indexed fields
    if (updateData.phone === '') delete updateData.phone;
    if (updateData.email === '') delete updateData.email;

    const emp = await UserModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true },
    ).select('-passwordHash');
    if (!emp) throw new NotFoundError('Employee');
    const uid = emp.unitId?.toString() ?? 'all';
    sharedCache.delete(`users:list:franchise:${uid}`);
    sharedCache.delete(`users:list:admin:${uid}`);
    sharedCache.delete(`users:public:${uid}`);
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

  async hardDelete(id: string): Promise<void> {
    const emp = await UserModel.findByIdAndDelete(id);
    if (!emp) throw new NotFoundError('Employee');
    const uid = emp.unitId?.toString() ?? 'all';
    sharedCache.delete(`users:list:franchise:${uid}`);
    sharedCache.delete(`users:list:admin:${uid}`);
    sharedCache.delete(`users:public:${uid}`);
  }
}
