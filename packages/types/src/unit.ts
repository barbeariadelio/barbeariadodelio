export interface Unit {
  _id: string;
  name: string;
  address: string;
  phone: string;
  cnpj?: string;
  ownerId: string;
  franchiseId?: string;
  isActive: boolean;
  createdAt: string;
}
