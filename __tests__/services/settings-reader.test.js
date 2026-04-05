// Behavioral tests for services/settings-reader.js
// Pure-function utility — mock only fs for file reads.

const mockReadFileSync = jest.fn(() => JSON.stringify({ phonetoolAlias: 'testuser', aiTemperature: 0.3, deploymentMode: 'local' }));

jest.mock('fs', () => ({
  readFileSync: (...args) => mockReadFileSync(...args),
  existsSync: jest.fn(() => true),
}));

const { readSettingsSafe, clearSettingsCache } = require('../../services/settings-reader');

describe('services/settings-reader.js', () => {
  beforeEach(() => {
    mockReadFileSync.mockReset();
    mockReadFileSync.mockReturnValue(JSON.stringify({ phonetoolAlias: 'testuser', aiTemperature: 0.3, deploymentMode: 'local' }));
    clearSettingsCache();
  });

  it('exports readSettingsSafe and clearSettingsCache', () => {
    expect(typeof readSettingsSafe).toBe('function');
    expect(typeof clearSettingsCache).toBe('function');
  });

  describe('readSettingsSafe(key, default)', () => {
    it('returns value for existing key', () => {
      expect(readSettingsSafe('phonetoolAlias', 'unknown')).toBe('testuser');
    });

    it('returns default for missing key', () => {
      expect(readSettingsSafe('nonExistentKey', 'fallback')).toBe('fallback');
    });

    it('returns default when default is null', () => {
      expect(readSettingsSafe('nonExistentKey')).toBeNull();
    });

    it('returns numeric value correctly', () => {
      expect(readSettingsSafe('aiTemperature', 0.25)).toBe(0.3);
    });
  });

  describe('readSettingsSafe() — no key', () => {
    it('returns full settings object when no key provided', () => {
      const all = readSettingsSafe();
      expect(all).toHaveProperty('phonetoolAlias', 'testuser');
      expect(all).toHaveProperty('aiTemperature', 0.3);
      expect(all).toHaveProperty('deploymentMode', 'local');
    });

    it('returns a copy (not reference) of the settings', () => {
      const a = readSettingsSafe();
      const b = readSettingsSafe();
      a.phonetoolAlias = 'modified';
      expect(b.phonetoolAlias).toBe('testuser');
    });
  });

  describe('caching', () => {
    it('reads file once on first call, then uses cache', () => {
      readSettingsSafe('phonetoolAlias');
      readSettingsSafe('aiTemperature');
      readSettingsSafe('deploymentMode');
      expect(mockReadFileSync).toHaveBeenCalledTimes(1);
    });

    it('clearSettingsCache forces a re-read', () => {
      readSettingsSafe('phonetoolAlias');
      expect(mockReadFileSync).toHaveBeenCalledTimes(1);

      clearSettingsCache();
      readSettingsSafe('phonetoolAlias');
      expect(mockReadFileSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('returns default when file does not exist', () => {
      mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
      clearSettingsCache();
      expect(readSettingsSafe('phonetoolAlias', 'fallback')).toBe('fallback');
    });

    it('returns empty object when file is invalid JSON and no key', () => {
      mockReadFileSync.mockReturnValue('not-valid-json{{{');
      clearSettingsCache();
      expect(readSettingsSafe()).toEqual({});
    });
  });
});
