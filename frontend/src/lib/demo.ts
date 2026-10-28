import type { Role } from '../api/types';

export const demoEnabled = true;

export interface DemoAccount {
  role: Role;
  key: 'learner' | 'teacher' | 'admin';
  email: string;
  password: string;
}

export const demoAccounts: DemoAccount[] = [
  { role: 'LEARNER', key: 'learner', email: 'learner@guruji.demo', password: 'DemoPass123!' },
  { role: 'TEACHER', key: 'teacher', email: 'teacher@guruji.demo', password: 'DemoPass123!' },
  { role: 'ADMIN', key: 'admin', email: 'admin@guruji.demo', password: 'DemoPass123!' },
];
