/**
 * Platform Detection Layer
 * Routes to correct implementation (Mac AppleScript or Windows PowerShell)
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const logger = require('./logger').child('Platform');

class PlatformDetector {
  constructor() {
    this.platform = os.platform();
    this.isWindows = this.platform === 'win32';
    this.isMac = this.platform === 'darwin';
    this.isLinux = this.platform === 'linux';
    
    logger.info(`Platform detected: ${this.platform}`);
  }

  /**
   * Read deploymentMode from settings.json (cached per process).
   */
  _getDeploymentMode() {
    if (this._deploymentMode !== undefined) return this._deploymentMode;
    try {
      const settingsPath = path.join(__dirname, '..', 'config', 'settings.json');
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      this._deploymentMode = settings.deploymentMode || 'local';
    } catch (e) {
      this._deploymentMode = 'local';
    }
    return this._deploymentMode;
  }

  /**
   * Returns true when running in AgentSpaces / hosted cloud mode.
   */
  isHostedMode() {
    return this._getDeploymentMode() === 'hosted';
  }

  /**
   * Get the appropriate Outlook service for this platform / deployment mode.
   *
   * Always uses aws-outlook-mcp (works on Mac, Windows, Linux, and AgentSpaces).
   * Requires: aim mcp install aws-outlook-mcp
   */
  getOutlookService() {
    logger.info('Routing Outlook to aws-outlook-mcp');
    return require('./outlook-mcp');
  }

  /**
   * Get the appropriate background agent for this platform
   */
  getBackgroundAgent() {
    if (this.isWindows) {
      return require('./background-agent-windows');
    } else if (this.isMac) {
      return require('./background-agent');
    } else {
      logger.warn('Unsupported platform for background agent:', this.platform);
      throw new Error(`Background agent not supported on ${this.platform}`);
    }
  }

  /**
   * Get platform-specific script path
   */
  getScriptPath(scriptName) {
    if (this.isWindows) {
      // Windows PowerShell scripts
      return path.join(__dirname, '..', 'scripts', 'windows', `${scriptName}.ps1`);
    } else if (this.isMac) {
      // Mac AppleScript/JXA
      return path.join(__dirname, '..', 'scripts', `${scriptName}.scpt`);
    }
    throw new Error(`Script path not available for ${this.platform}`);
  }

  /**
   * Get platform-specific command executor
   */
  getCommandExecutor() {
    if (this.isWindows) {
      return {
        shell: 'powershell.exe',
        args: ['-ExecutionPolicy', 'Bypass', '-File']
      };
    } else if (this.isMac) {
      return {
        shell: 'osascript',
        args: []
      };
    }
    throw new Error(`Command executor not available for ${this.platform}`);
  }

  /**
   * Validate platform requirements
   */
  async validatePlatform() {
    const requirements = {
      platform: this.isMac || this.isWindows,
      outlook: false,
      scriptExecutor: false
    };

    // Check if Outlook is available
    try {
      const outlookService = this.getOutlookService();
      // Try to ping Outlook (this should be implemented in the service)
      requirements.outlook = true;
    } catch (error) {
      logger.warn('Outlook not available:', error.message);
    }

    // Check script executor
    try {
      const executor = this.getCommandExecutor();
      requirements.scriptExecutor = true;
    } catch (error) {
      logger.warn('Script executor not available:', error.message);
    }

    return requirements;
  }

  /**
   * Get platform info for diagnostics
   */
  getPlatformInfo() {
    return {
      platform: this.platform,
      isWindows: this.isWindows,
      isMac: this.isMac,
      isLinux: this.isLinux,
      architecture: os.arch(),
      release: os.release(),
      hostname: os.hostname(),
      homedir: os.homedir(),
      nodeVersion: process.version
    };
  }

  /**
   * Get path separator for this platform
   */
  getPathSeparator() {
    return this.isWindows ? '\\' : '/';
  }

  /**
   * Normalize path for this platform
   */
  normalizePath(filePath) {
    return this.isWindows 
      ? filePath.replace(/\//g, '\\')
      : filePath.replace(/\\/g, '/');
  }

  /**
   * Get appropriate temp directory
   */
  getTempDir() {
    return os.tmpdir();
  }

  /**
   * Get data directory for application
   */
  getDataDir() {
    const baseDir = path.join(__dirname, '..', 'data');
    return this.normalizePath(baseDir);
  }

  /**
   * Check if running on Mac with Apple Silicon
   */
  isAppleSilicon() {
    return this.isMac && os.arch() === 'arm64';
  }

  /**
   * Get recommended settings for this platform
   */
  getRecommendedSettings() {
    const settings = {
      platform: this.platform,
      recommendations: []
    };

    if (this.isMac) {
      settings.recommendations.push({
        key: 'outlook_method',
        value: 'applescript',
        reason: 'macOS uses AppleScript for Outlook integration'
      });
      
      if (this.isAppleSilicon()) {
        settings.recommendations.push({
          key: 'ollama_optimization',
          value: 'metal',
          reason: 'Apple Silicon can use Metal GPU acceleration'
        });
      }
    }

    if (this.isWindows) {
      settings.recommendations.push({
        key: 'outlook_method',
        value: 'powershell',
        reason: 'Windows uses PowerShell COM automation for Outlook'
      });
      
      settings.recommendations.push({
        key: 'execution_policy',
        value: 'RemoteSigned',
        reason: 'PowerShell scripts require appropriate execution policy'
      });
    }

    return settings;
  }
}

// Export singleton instance
const platformDetector = new PlatformDetector();

module.exports = platformDetector;