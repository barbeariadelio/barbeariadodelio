export type UserRole = 'owner' | 'employee' | 'client' | 'cashier';

export interface User {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  unitId?: string;
  phone: string;
  avatar?: string;
  isActive: boolean;
  allowedApps?: string[];
  theme?: 'light' | 'dark';
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends AuthTokens {
  user: User;
}

export interface LoginPayload {
  email: string;
  password: string;
  appId?: string;
}
