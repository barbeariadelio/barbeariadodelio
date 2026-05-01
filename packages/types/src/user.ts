export type UserRole = 'owner' | 'employee' | 'franchisor' | 'franchisee' | 'client';

export interface User {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  unitId?: string;
  phone: string;
  avatar?: string;
  isActive: boolean;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}
