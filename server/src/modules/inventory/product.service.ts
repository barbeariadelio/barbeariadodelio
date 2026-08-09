import { ProductModel, IProduct } from './product.model';
import { NotFoundError, ForbiddenError } from '../../shared/errors/AppError';

export class ProductService {
  async findByUnit(unitId: string, pagination?: { skip: number, limit: number }): Promise<IProduct[]> {
    let query = ProductModel.find({ unitId, isActive: true }).sort({ name: 1 });
    if (pagination) {
      query = query.skip(pagination.skip).limit(pagination.limit);
    }
    return query;
  }

  async findById(id: string): Promise<IProduct> {
    const product = await ProductModel.findById(id);
    if (!product) throw new NotFoundError('Product');
    return product;
  }

  async create(data: Partial<IProduct>): Promise<IProduct> {
    const deleted = await ProductModel.findOne({ unitId: data.unitId, name: data.name, isActive: false });
    if (deleted) {
      return (await ProductModel.findByIdAndUpdate(deleted._id, { ...data, isActive: true }, { new: true, runValidators: true }))!;
    }
    return ProductModel.create(data);
  }

  async update(id: string, data: Partial<IProduct>, requesterRole?: string): Promise<IProduct> {
    // Moving a product to a different unit is an administrative action —
    // only the owner may do it; a unit-scoped cashier just edits in place.
    if (requesterRole !== 'owner' && data.unitId !== undefined) {
      throw new ForbiddenError('Somente o dono pode mover este produto para outra unidade.');
    }
    const product = await ProductModel.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!product) throw new NotFoundError('Product');
    return product;
  }

  async delete(id: string): Promise<void> {
    const product = await ProductModel.findByIdAndUpdate(id, { isActive: false }, { new: true, runValidators: true });
    if (!product) throw new NotFoundError('Product');
  }
}
