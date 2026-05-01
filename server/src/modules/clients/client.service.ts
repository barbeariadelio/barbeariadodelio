import { ClientModel, IClient } from './client.model';
import { NotFoundError } from '../../shared/errors/AppError';

export class ClientService {
  async findByUnit(unitId: string): Promise<IClient[]> {
    return ClientModel.find({ unitId }).sort({ name: 1 });
  }

  async search(unitId: string, query: string): Promise<IClient[]> {
    return ClientModel.find({
      unitId,
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { phone: { $regex: query, $options: 'i' } },
      ],
    }).sort({ name: 1 });
  }

  async findById(id: string): Promise<IClient> {
    const client = await ClientModel.findById(id);
    if (!client) throw new NotFoundError('Client');
    return client;
  }

  async create(data: Partial<IClient>): Promise<IClient> {
    return ClientModel.create(data);
  }

  async update(id: string, data: Partial<IClient>): Promise<IClient> {
    const client = await ClientModel.findByIdAndUpdate(id, data, { new: true });
    if (!client) throw new NotFoundError('Client');
    return client;
  }
}
