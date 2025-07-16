export type Role = 'user' | 'teamAdmin' | 'admin';

// Simple in-memory user record
export interface User {
  id: number;
  username: string;
  password: string; // hashed password in production
  role: Role;
}

// Dummy user list for demonstration purposes
export const users: User[] = [
  { id: 1, username: 'admin', password: 'admin', role: 'admin' },
  { id: 2, username: 'team', password: 'team', role: 'teamAdmin' },
  { id: 3, username: 'user', password: 'user', role: 'user' }
];
