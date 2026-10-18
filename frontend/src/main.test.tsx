import {describe,it,expect} from 'vitest';
describe('shell',()=>{it('keeps the learning route contract',()=>{expect('/learn').toMatch(/^\/learn$/)})})
