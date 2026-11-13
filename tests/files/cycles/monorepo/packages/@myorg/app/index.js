import { shared } from '@myorg/shared';
import { local } from './local';

export const app = () => [shared, local];
