export interface Client {
  _id: string;
  name: string;
  email: string;
  phone: string;
  userId?: string;
  unitId: string;
  birthdate?: string;
  notes?: string;
  createdAt: string;
}
