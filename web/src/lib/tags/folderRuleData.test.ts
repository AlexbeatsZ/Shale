import { describe, expect, it } from 'vitest';
import { parseFolderRuleData } from './folderRuleData';
describe('folder rule widget data', () => {
  it('parses read-only widget config without running expressions', () => {
    expect(parseFolderRuleData('({managedRoots:["notes"],typeRules:[]})')).toEqual({ managedRoots: ['notes'], typeRules: [] });
    for (const code of ['({managedRoots:[],typeRules:(globalThis.executed=true,[])})', '({managedRoots:alert("x")})', '({managedRoots:["a"],managedRoots:["b"]})'])
      expect(() => parseFolderRuleData(code)).toThrow();
  });
});
