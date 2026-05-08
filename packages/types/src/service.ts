export interface PackageItem {
  serviceId: string;
  quantity: number;
  unitPrice?: number;
}

export interface Service {
  _id: string;
  name: string;
  description?: string;
  price: number;
  durationMinutes: number;
  unitId: string;
  isActive: boolean;
  type?: 'single' | 'package';
  packageValidity?: {
    type: 'none' | 'days' | 'weeks' | 'months' | 'years';
    value?: number;
  };
  packageItems?: PackageItem[];
}
