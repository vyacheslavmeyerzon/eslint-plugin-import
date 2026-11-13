import ext from 'required-ext';
import { local } from './local';

export const required = require('./required');
export const c = () => [ext, local];
