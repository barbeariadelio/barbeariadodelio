import { ProductModel, IProduct } from './product.model';
import { NotFoundError } from '../../shared/errors/AppError';

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
    return ProductModel.create(data);
  }

  async update(id: string, data: Partial<IProduct>): Promise<IProduct> {
    const product = await ProductModel.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!product) throw new NotFoundError('Product');
    return product;
  }

  async delete(id: string): Promise<void> {
    const product = await ProductModel.findByIdAndUpdate(id, { isActive: false }, { new: true, runValidators: true });
    if (!product) throw new NotFoundError('Product');
  }
}
