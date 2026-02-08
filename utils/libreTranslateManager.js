// utils/libreTranslateManager.js - Self-managing LibreTranslate Docker container
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import logger from './logger.js';
import {
  ENABLED_LANGUAGES,
  LIBRETRANSLATE_URL,
  LIBRETRANSLATE_PORT,
  LIBRETRANSLATE_CONTAINER_NAME,
  LIBRETRANSLATE_AUTO_START
} from '../config.js';

const execAsync = promisify(exec);

class LibreTranslateManager {
  constructor() {
    this.containerName = LIBRETRANSLATE_CONTAINER_NAME;
    this.port = LIBRETRANSLATE_PORT;
    this.apiUrl = LIBRETRANSLATE_URL;
    this.imageName = 'libretranslate/libretranslate:latest';
    this.autoStart = LIBRETRANSLATE_AUTO_START;
    this.currentLanguages = [...ENABLED_LANGUAGES];
    this.isReady = false;
    this.startupPromise = null;

    // Health check settings
    this.healthCheckInterval = 5000; // 5s between checks
    this.healthCheckTimeout = 300000; // 5 min max wait (first boot compiles models)
    this.healthCheckRetries = 60; // 60 retries = 5 min
  }

  // ═══════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════

  /**
   * Ensure LibreTranslate is running and healthy.
   * Called during bot startup. Will pull image + start container if needed.
   * Returns true if service is ready, false if unavailable.
   */
  async ensureRunning() {
    if (!this.autoStart) {
      logger.info('LIBRETRANSLATE', 'Auto-start disabled, skipping Docker management');
      return await this._checkApiHealth();
    }

    // Prevent concurrent startup attempts
    if (this.startupPromise) {
      return this.startupPromise;
    }

    this.startupPromise = this._doEnsureRunning();
    try {
      const result = await this.startupPromise;
      return result;
    } finally {
      this.startupPromise = null;
    }
  }

  /**
   * Recompile LibreTranslate with a new set of languages.
   * Stops existing container, removes it, starts fresh with new language set.
   * Called when admin adds/removes languages.
   */
  async recompileWithLanguages(languageCodes) {
    if (!Array.isArray(languageCodes) || languageCodes.length === 0) {
      logger.warn('LIBRETRANSLATE', 'recompileWithLanguages called with empty array');
      return false;
    }

    // Always ensure 'en' is included
    const langs = ['en', ...languageCodes.filter(c => c !== 'en')];

    logger.info('LIBRETRANSLATE', `Recompiling with languages: ${langs.join(', ')}`);

    try {
      // Stop and remove existing container
      await this._stopContainer();
      await this._removeContainer();

      // Update current languages
      this.currentLanguages = langs;
      this.isReady = false;

      // Start with new languages
      await this._startContainer(langs);

      // Wait for health
      const healthy = await this._waitForHealth();
      if (healthy) {
        logger.info('LIBRETRANSLATE', `Recompile complete. Languages: ${langs.join(', ')}`);
      } else {
        logger.error('LIBRETRANSLATE', 'Recompile finished but service not healthy');
      }

      return healthy;
    } catch (error) {
      logger.error('LIBRETRANSLATE', `Recompile failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Add a single language to the running instance.
   * Triggers a full recompile with the updated language set.
   */
  async addLanguage(langCode) {
    if (this.currentLanguages.includes(langCode)) {
      logger.info('LIBRETRANSLATE', `Language ${langCode} already loaded`);
      return true;
    }
    const newLangs = [...this.currentLanguages, langCode];
    return this.recompileWithLanguages(newLangs);
  }

  /**
   * Remove a language from the running instance.
   */
  async removeLanguage(langCode) {
    if (langCode === 'en') {
      logger.warn('LIBRETRANSLATE', 'Cannot remove English');
      return false;
    }
    const newLangs = this.currentLanguages.filter(c => c !== langCode);
    if (newLangs.length === this.currentLanguages.length) {
      return true; // wasn't loaded anyway
    }
    return this.recompileWithLanguages(newLangs);
  }

  /**
   * Quick health check - is the API responding?
   */
  async healthCheck() {
    return this._checkApiHealth();
  }

  /**
   * Stop the LibreTranslate container gracefully.
   */
  async stop() {
    try {
      await this._stopContainer();
      this.isReady = false;
      logger.info('LIBRETRANSLATE', 'Container stopped');
      return true;
    } catch (error) {
      logger.error('LIBRETRANSLATE', `Stop failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get current status info.
   */
  async getStatus() {
    const dockerOk = await this._isDockerAvailable();
    const containerRunning = await this._isContainerRunning();
    const apiHealthy = containerRunning ? await this._checkApiHealth() : false;

    return {
      dockerAvailable: dockerOk,
      containerExists: await this._doesContainerExist(),
      containerRunning,
      apiHealthy,
      loadedLanguages: [...this.currentLanguages],
      containerName: this.containerName,
      port: this.port,
      apiUrl: this.apiUrl,
      autoStart: this.autoStart
    };
  }

  /**
   * Get loaded languages from the running LibreTranslate instance.
   */
  async getLoadedLanguages() {
    try {
      const res = await fetch(`${this.apiUrl}/languages`, {
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        const langs = await res.json();
        return langs.map(l => l.code);
      }
    } catch { /* ignore */ }
    return [];
  }

  // ═══════════════════════════════════════
  //  INTERNAL - DOCKER OPERATIONS
  // ═══════════════════════════════════════

  async _doEnsureRunning() {
    try {
      // 1. Check Docker is available
      const dockerOk = await this._isDockerAvailable();
      if (!dockerOk) {
        logger.error('LIBRETRANSLATE', 'Docker is not available. Cannot manage LibreTranslate.');
        logger.error('LIBRETRANSLATE', 'Install Docker: apt-get install -y docker.io && systemctl start docker');
        return false;
      }

      // 2. Check if container is already running
      const running = await this._isContainerRunning();
      if (running) {
        logger.info('LIBRETRANSLATE', 'Container already running, checking health...');

        // Verify the loaded languages match
        const loadedLangs = await this.getLoadedLanguages();
        const needed = this.currentLanguages;
        const missing = needed.filter(l => !loadedLangs.includes(l));

        if (missing.length > 0) {
          logger.info('LIBRETRANSLATE', `Missing languages: ${missing.join(', ')} - recompiling...`);
          return await this.recompileWithLanguages(needed);
        }

        const healthy = await this._checkApiHealth();
        if (healthy) {
          this.isReady = true;
          logger.info('LIBRETRANSLATE', 'Existing container is healthy and has all needed languages');
          return true;
        }

        // Running but not healthy - restart
        logger.warn('LIBRETRANSLATE', 'Container running but not healthy, restarting...');
        await this._stopContainer();
        await this._removeContainer();
      }

      // 3. Check if container exists but stopped
      const exists = await this._doesContainerExist();
      if (exists) {
        logger.info('LIBRETRANSLATE', 'Found stopped container, removing for fresh start...');
        await this._removeContainer();
      }

      // 4. Pull image if not present
      const hasImage = await this._hasImage();
      if (!hasImage) {
        logger.info('LIBRETRANSLATE', 'Pulling LibreTranslate Docker image (this may take a few minutes)...');
        await this._pullImage();
      }

      // 5. Start new container
      logger.info('LIBRETRANSLATE', `Starting container with languages: ${this.currentLanguages.join(', ')}`);
      await this._startContainer(this.currentLanguages);

      // 6. Wait for health
      logger.info('LIBRETRANSLATE', 'Waiting for LibreTranslate to initialize (first boot compiles language models)...');
      const healthy = await this._waitForHealth();
      this.isReady = healthy;

      if (healthy) {
        logger.info('LIBRETRANSLATE', '✅ LibreTranslate is ready!');
      } else {
        logger.error('LIBRETRANSLATE', '❌ LibreTranslate failed to become healthy within timeout');
      }

      return healthy;
    } catch (error) {
      logger.error('LIBRETRANSLATE', `ensureRunning failed: ${error.message}`);
      return false;
    }
  }

  async _isDockerAvailable() {
    try {
      await execAsync('docker info', { timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }

  async _hasImage() {
    try {
      const { stdout } = await execAsync(
        `docker images -q ${this.imageName}`,
        { timeout: 10000 }
      );
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  async _pullImage() {
    try {
      logger.info('LIBRETRANSLATE', 'Pulling image... this can take 2-5 minutes');
      await execAsync(`docker pull ${this.imageName}`, { timeout: 600000 }); // 10 min timeout
      logger.info('LIBRETRANSLATE', 'Image pulled successfully');
      return true;
    } catch (error) {
      logger.error('LIBRETRANSLATE', `Image pull failed: ${error.message}`);
      throw error;
    }
  }

  async _startContainer(languages) {
    // Build --load-only argument: comma-separated language codes
    const loadOnly = languages.join(',');

    const cmd = [
      'docker run -d',
      `--name ${this.containerName}`,
      `--restart unless-stopped`,
      `-p ${this.port}:5000`,
      `-e LT_LOAD_ONLY=${loadOnly}`,
      `-e LT_DISABLE_FILES_TRANSLATION=true`,
      `-e LT_DISABLE_WEB_UI=true`,
      `-e LT_UPDATE_MODELS=true`,
      `--memory=2g`,
      `--cpus=1.5`,
      this.imageName
    ].join(' ');

    try {
      const { stdout } = await execAsync(cmd, { timeout: 30000 });
      const containerId = stdout.trim().substring(0, 12);
      logger.info('LIBRETRANSLATE', `Container started: ${containerId}`);
      return containerId;
    } catch (error) {
      // If container name conflict, remove old and retry
      if (error.message.includes('is already in use')) {
        logger.warn('LIBRETRANSLATE', 'Container name conflict, removing old container...');
        await this._removeContainer();
        const { stdout } = await execAsync(cmd, { timeout: 30000 });
        return stdout.trim().substring(0, 12);
      }
      throw error;
    }
  }

  async _stopContainer() {
    try {
      await execAsync(`docker stop ${this.containerName}`, { timeout: 30000 });
    } catch {
      // Container might not be running
    }
  }

  async _removeContainer() {
    try {
      await execAsync(`docker rm -f ${this.containerName}`, { timeout: 15000 });
    } catch {
      // Container might not exist
    }
  }

  async _isContainerRunning() {
    try {
      const { stdout } = await execAsync(
        `docker inspect -f '{{.State.Running}}' ${this.containerName} 2>/dev/null`,
        { timeout: 10000 }
      );
      return stdout.trim() === 'true';
    } catch {
      return false;
    }
  }

  async _doesContainerExist() {
    try {
      await execAsync(
        `docker inspect ${this.containerName} 2>/dev/null`,
        { timeout: 10000 }
      );
      return true;
    } catch {
      return false;
    }
  }

  async _getContainerLogs(tail = 50) {
    try {
      const { stdout } = await execAsync(
        `docker logs --tail ${tail} ${this.containerName} 2>&1`,
        { timeout: 10000 }
      );
      return stdout;
    } catch {
      return '';
    }
  }

  // ═══════════════════════════════════════
  //  INTERNAL - HEALTH CHECKING
  // ═══════════════════════════════════════

  async _checkApiHealth() {
    try {
      const res = await fetch(`${this.apiUrl}/languages`, {
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        this.isReady = true;
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }

  async _waitForHealth() {
    const startTime = Date.now();
    let attempt = 0;

    while (attempt < this.healthCheckRetries) {
      attempt++;
      const elapsed = Math.round((Date.now() - startTime) / 1000);

      // Check if container is still running
      const running = await this._isContainerRunning();
      if (!running) {
        const logs = await this._getContainerLogs(20);
        logger.error('LIBRETRANSLATE', `Container stopped unexpectedly. Last logs:\n${logs}`);
        return false;
      }

      // Check API health
      const healthy = await this._checkApiHealth();
      if (healthy) {
        logger.info('LIBRETRANSLATE', `Healthy after ${elapsed}s (${attempt} checks)`);
        return true;
      }

      // Log progress periodically
      if (attempt % 6 === 0) { // Every 30 seconds
        logger.info('LIBRETRANSLATE', `Still initializing... (${elapsed}s elapsed, attempt ${attempt}/${this.healthCheckRetries})`);
      }

      await this._sleep(this.healthCheckInterval);
    }

    const totalTime = Math.round((Date.now() - startTime) / 1000);
    const logs = await this._getContainerLogs(30);
    logger.error('LIBRETRANSLATE', `Health check timeout after ${totalTime}s. Last logs:\n${logs}`);
    return false;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton
const libreTranslateManager = new LibreTranslateManager();

export default libreTranslateManager;
