// Behavioral tests for services/platform-detector.js
// Tests strategy pattern (Mac vs Windows routing) with mocked os module.

jest.mock('../../services/logger', () => ({
  child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
}));
jest.mock('../../services/outlook-mcp', () => ({ getCalendar: jest.fn() }));
jest.mock('fs');

// We need to control os.platform() per test, so mock the os module
const mockPlatform = jest.fn(() => 'darwin');
const mockArch = jest.fn(() => 'arm64');
const mockRelease = jest.fn(() => '24.0.0');
const mockHostname = jest.fn(() => 'test-host');
const mockHomedir = jest.fn(() => '/Users/test');
const mockTmpdir = jest.fn(() => '/tmp');

jest.mock('os', () => ({
  platform: () => mockPlatform(),
  arch: () => mockArch(),
  release: () => mockRelease(),
  hostname: () => mockHostname(),
  homedir: () => mockHomedir(),
  tmpdir: () => mockTmpdir(),
}));

describe('services/platform-detector.js', () => {
  let detector;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    // Default to Mac
    mockPlatform.mockReturnValue('darwin');
    mockArch.mockReturnValue('arm64');
    detector = require('../../services/platform-detector');
  });

  // ─── Platform Detection ──────────────────────────────────────────
  describe('platform detection', () => {
    it('detects darwin as Mac', () => {
      expect(detector.isMac).toBe(true);
      expect(detector.isWindows).toBe(false);
      expect(detector.isLinux).toBe(false);
      expect(detector.platform).toBe('darwin');
    });

    it('detects win32 as Windows', () => {
      mockPlatform.mockReturnValue('win32');
      jest.resetModules();
      detector = require('../../services/platform-detector');

      expect(detector.isWindows).toBe(true);
      expect(detector.isMac).toBe(false);
      expect(detector.isLinux).toBe(false);
    });

    it('detects linux as Linux', () => {
      mockPlatform.mockReturnValue('linux');
      jest.resetModules();
      detector = require('../../services/platform-detector');

      expect(detector.isLinux).toBe(true);
      expect(detector.isMac).toBe(false);
      expect(detector.isWindows).toBe(false);
    });
  });

  // ─── getScriptPath() ────────────────────────────────────────────
  describe('getScriptPath()', () => {
    it('returns .scpt path on Mac', () => {
      const scriptPath = detector.getScriptPath('fetch_calendar_local');
      expect(scriptPath).toContain('fetch_calendar_local.scpt');
      expect(scriptPath).toContain('scripts');
      expect(scriptPath).not.toContain('windows');
    });

    it('returns .ps1 path on Windows', () => {
      mockPlatform.mockReturnValue('win32');
      jest.resetModules();
      detector = require('../../services/platform-detector');

      const scriptPath = detector.getScriptPath('install-ingen');
      expect(scriptPath).toContain('install-ingen.ps1');
      expect(scriptPath).toContain('windows');
    });

    it('throws on unsupported platform', () => {
      mockPlatform.mockReturnValue('linux');
      jest.resetModules();
      detector = require('../../services/platform-detector');

      expect(() => detector.getScriptPath('test')).toThrow(/not available/);
    });
  });

  // ─── getCommandExecutor() ──────────────────────────────────────
  describe('getCommandExecutor()', () => {
    it('returns osascript on Mac', () => {
      const executor = detector.getCommandExecutor();
      expect(executor.shell).toBe('osascript');
    });

    it('returns powershell.exe on Windows', () => {
      mockPlatform.mockReturnValue('win32');
      jest.resetModules();
      detector = require('../../services/platform-detector');

      const executor = detector.getCommandExecutor();
      expect(executor.shell).toBe('powershell.exe');
      expect(executor.args).toContain('-ExecutionPolicy');
    });

    it('throws on unsupported platform', () => {
      mockPlatform.mockReturnValue('linux');
      jest.resetModules();
      detector = require('../../services/platform-detector');

      expect(() => detector.getCommandExecutor()).toThrow(/not available/);
    });
  });

  // ─── getPlatformInfo() ─────────────────────────────────────────
  describe('getPlatformInfo()', () => {
    it('returns object with all expected keys', () => {
      const info = detector.getPlatformInfo();
      expect(info).toHaveProperty('platform');
      expect(info).toHaveProperty('isWindows');
      expect(info).toHaveProperty('isMac');
      expect(info).toHaveProperty('isLinux');
      expect(info).toHaveProperty('architecture');
      expect(info).toHaveProperty('release');
      expect(info).toHaveProperty('hostname');
      expect(info).toHaveProperty('homedir');
      expect(info).toHaveProperty('nodeVersion');
      expect(info.platform).toBe('darwin');
      expect(info.isMac).toBe(true);
    });
  });

  // ─── normalizePath() ──────────────────────────────────────────
  describe('normalizePath()', () => {
    it('converts backslash to forward slash on Mac', () => {
      const result = detector.normalizePath('some\\path\\to\\file');
      expect(result).toBe('some/path/to/file');
    });

    it('converts forward slash to backslash on Windows', () => {
      mockPlatform.mockReturnValue('win32');
      jest.resetModules();
      detector = require('../../services/platform-detector');

      const result = detector.normalizePath('some/path/to/file');
      expect(result).toBe('some\\path\\to\\file');
    });
  });

  // ─── getPathSeparator() ───────────────────────────────────────
  describe('getPathSeparator()', () => {
    it('returns / on Mac', () => {
      expect(detector.getPathSeparator()).toBe('/');
    });

    it('returns \\ on Windows', () => {
      mockPlatform.mockReturnValue('win32');
      jest.resetModules();
      detector = require('../../services/platform-detector');

      expect(detector.getPathSeparator()).toBe('\\');
    });
  });

  // ─── isAppleSilicon() ─────────────────────────────────────────
  describe('isAppleSilicon()', () => {
    it('returns true on Mac with arm64', () => {
      expect(detector.isAppleSilicon()).toBe(true);
    });

    it('returns false on Mac with x86_64', () => {
      mockArch.mockReturnValue('x64');
      jest.resetModules();
      detector = require('../../services/platform-detector');

      expect(detector.isAppleSilicon()).toBe(false);
    });

    it('returns false on Windows regardless of arch', () => {
      mockPlatform.mockReturnValue('win32');
      mockArch.mockReturnValue('arm64');
      jest.resetModules();
      detector = require('../../services/platform-detector');

      expect(detector.isAppleSilicon()).toBe(false);
    });
  });

  // ─── getOutlookService() ──────────────────────────────────────
  describe('getOutlookService()', () => {
    it('returns outlook-mcp service (universal)', () => {
      const service = detector.getOutlookService();
      expect(service).toBeDefined();
      expect(service).toHaveProperty('getCalendar');
    });
  });

  // ─── isHostedMode() ───────────────────────────────────────────
  describe('isHostedMode()', () => {
    it('returns false by default (local deployment)', () => {
      // Settings mock returns empty or default
      expect(detector.isHostedMode()).toBe(false);
    });
  });

  // ─── getRecommendedSettings() ─────────────────────────────────
  describe('getRecommendedSettings()', () => {
    it('returns Mac-specific recommendations on darwin', () => {
      const settings = detector.getRecommendedSettings();
      expect(settings.platform).toBe('darwin');
      expect(settings.recommendations.length).toBeGreaterThan(0);
      const keys = settings.recommendations.map(r => r.key);
      expect(keys).toContain('outlook_method');
    });

    it('returns Windows-specific recommendations on win32', () => {
      mockPlatform.mockReturnValue('win32');
      jest.resetModules();
      detector = require('../../services/platform-detector');

      const settings = detector.getRecommendedSettings();
      expect(settings.platform).toBe('win32');
      const keys = settings.recommendations.map(r => r.key);
      expect(keys).toContain('execution_policy');
    });
  });
});
