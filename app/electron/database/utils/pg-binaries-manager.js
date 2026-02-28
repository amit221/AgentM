/**
 * PostgreSQL Binaries Manager
 * 
 * Downloads and manages PostgreSQL client tools (pg_dump, pg_restore, psql)
 * for users who don't have them installed on their system.
 * 
 * Automatically fetches the latest PostgreSQL version from postgresql.org
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

// Fallback version if we can't fetch the latest
const FALLBACK_PG_VERSION = { major: 17, minor: 2 };

// PostgreSQL versions API endpoint
const PG_VERSIONS_URL = 'https://www.postgresql.org/versions.json';

class PgBinariesManager {
  constructor() {
    // Store binaries in app's user data directory
    this.binariesDir = path.join(app.getPath('userData'), 'pg-binaries');
    this.binDir = path.join(this.binariesDir, 'pgsql', 'bin');
    this.versionFile = path.join(this.binariesDir, 'version.json');
    this.downloadInProgress = false;
    this.downloadProgress = 0;
    this.cachedLatestVersion = null;
  }

  /**
   * Get the currently installed version
   * First tries version.json, then falls back to running pg_dump --version
   */
  getInstalledVersion() {
    // First try version.json
    try {
      if (fs.existsSync(this.versionFile)) {
        const data = JSON.parse(fs.readFileSync(this.versionFile, 'utf8'));
        return data;
      }
    } catch (error) {
      console.warn('Could not read version.json:', error.message);
    }
    
    // Fall back to detecting version from binary
    try {
      const pgDumpPath = this.getBinaryPath('pg_dump');
      if (fs.existsSync(pgDumpPath)) {
        const output = execSync(`"${pgDumpPath}" --version`, { 
          stdio: 'pipe', 
          windowsHide: true, 
          timeout: 5000 
        }).toString().trim();
        
        // Parse output like "pg_dump (PostgreSQL) 15.8"
        const match = output.match(/(\d+)\.(\d+)/);
        if (match) {
          const version = {
            major: parseInt(match[1], 10),
            minor: parseInt(match[2], 10),
            full: `${match[1]}.${match[2]}`,
            detectedFromBinary: true
          };
          console.log(`📦 Detected installed version from binary: ${version.full}`);
          return version;
        }
      }
    } catch (error) {
      console.warn('Could not detect version from binary:', error.message);
    }
    
    return null;
  }

  /**
   * Save the installed version to version.json
   */
  saveInstalledVersion(version) {
    try {
      fs.writeFileSync(this.versionFile, JSON.stringify({
        major: version.major,
        minor: version.minor,
        full: version.full,
        installedAt: new Date().toISOString()
      }, null, 2));
    } catch (error) {
      console.warn('Could not save version info:', error.message);
    }
  }

  /**
   * Get the path to a PostgreSQL binary
   */
  getBinaryPath(binaryName) {
    const isWindows = process.platform === 'win32';
    const ext = isWindows ? '.exe' : '';
    return path.join(this.binDir, `${binaryName}${ext}`);
  }

  /**
   * Fetch the latest PostgreSQL version from postgresql.org
   * Returns { major: number, minor: number, full: string }
   */
  async fetchLatestVersion() {
    // Return cached version if available
    if (this.cachedLatestVersion) {
      return this.cachedLatestVersion;
    }

    return new Promise((resolve) => {
      console.log('📡 Fetching latest PostgreSQL version from postgresql.org...');
      
      const request = https.get(PG_VERSIONS_URL, { timeout: 10000 }, (response) => {
        if (response.statusCode !== 200) {
          console.warn(`⚠️ Failed to fetch versions (status: ${response.statusCode}), using fallback`);
          resolve(FALLBACK_PG_VERSION);
          return;
        }

        let data = '';
        response.on('data', (chunk) => data += chunk);
        response.on('end', () => {
          try {
            const versions = JSON.parse(data);
            
            // Find the latest stable version (highest major that's not EOL)
            // versions.json format: [{ "major": 17, "minor": 2, "eol": "2029-11-08" }, ...]
            const currentVersions = versions
              .filter(v => !v.eol || new Date(v.eol) > new Date())
              .sort((a, b) => b.major - a.major);
            
            if (currentVersions.length > 0) {
              const latest = currentVersions[0];
              this.cachedLatestVersion = {
                major: latest.major,
                minor: latest.minor || 0,
                full: `${latest.major}.${latest.minor || 0}`
              };
              console.log(`✅ Latest PostgreSQL version: ${this.cachedLatestVersion.full}`);
              resolve(this.cachedLatestVersion);
            } else {
              console.warn('⚠️ No current versions found, using fallback');
              resolve(FALLBACK_PG_VERSION);
            }
          } catch (error) {
            console.error('❌ Error parsing versions JSON:', error);
            resolve(FALLBACK_PG_VERSION);
          }
        });
      });

      request.on('error', (error) => {
        console.error('❌ Error fetching PostgreSQL versions:', error.message);
        resolve(FALLBACK_PG_VERSION);
      });

      request.on('timeout', () => {
        console.warn('⚠️ Timeout fetching versions, using fallback');
        request.destroy();
        resolve(FALLBACK_PG_VERSION);
      });
    });
  }

  /**
   * Build download URL for a specific version and platform
   */
  buildDownloadUrl(version, platform, arch) {
    const major = version.major;
    const minor = version.minor || 0;
    
    // EDB download URL pattern
    // Format: postgresql-{major}.{minor}-{build}-{platform}-{arch}-binaries.{ext}
    const build = 1; // Usually 1 for release builds
    
    const urlPatterns = {
      win32: {
        x64: `https://get.enterprisedb.com/postgresql/postgresql-${major}.${minor}-${build}-windows-x64-binaries.zip`
      },
      darwin: {
        x64: `https://get.enterprisedb.com/postgresql/postgresql-${major}.${minor}-${build}-osx-binaries.zip`,
        arm64: `https://get.enterprisedb.com/postgresql/postgresql-${major}.${minor}-${build}-osx-binaries.zip`
      },
      linux: {
        x64: `https://get.enterprisedb.com/postgresql/postgresql-${major}.${minor}-${build}-linux-x64-binaries.tar.gz`
      }
    };

    const platformUrls = urlPatterns[platform];
    if (!platformUrls) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    return platformUrls[arch] || platformUrls.x64;
  }

  /**
   * Check if PostgreSQL binaries are installed (either system or local)
   * Also checks for available upgrades
   */
  async checkBinariesAvailable() {
    const result = {
      systemInstalled: false,
      localInstalled: false,
      pg_dump: null,
      pg_restore: null,
      psql: null,
      installedVersion: null,
      latestVersion: null,
      upgradeAvailable: false
    };

    // Check system installation first
    const isWindows = process.platform === 'win32';
    const binaries = ['pg_dump', 'pg_restore', 'psql'];
    
    for (const binary of binaries) {
      try {
        const cmd = isWindows ? `where ${binary}` : `which ${binary}`;
        const systemPath = execSync(cmd, { stdio: 'pipe', windowsHide: true, timeout: 5000 })
          .toString().trim().split('\n')[0];
        if (systemPath) {
          result[binary] = systemPath;
          result.systemInstalled = true;
        }
      } catch (e) {
        // Not found in system PATH
      }
    }

    // If all system binaries found, we're done (system binaries are managed externally)
    if (result.pg_dump && result.pg_restore && result.psql) {
      return result;
    }

    // Check local installation
    for (const binary of binaries) {
      if (!result[binary]) {
        const localPath = this.getBinaryPath(binary);
        if (fs.existsSync(localPath)) {
          result[binary] = localPath;
          result.localInstalled = true;
        }
      }
    }

    // Check for upgrade if using local installation
    if (result.localInstalled) {
      result.installedVersion = this.getInstalledVersion();
      
      // Fetch latest version to check for upgrades
      try {
        result.latestVersion = await this.fetchLatestVersion();
        
        if (result.installedVersion && result.latestVersion) {
          result.upgradeAvailable = 
            result.latestVersion.major > result.installedVersion.major ||
            (result.latestVersion.major === result.installedVersion.major && 
             result.latestVersion.minor > result.installedVersion.minor);
        }
      } catch (e) {
        console.warn('Could not check for upgrades:', e.message);
      }
    }

    return result;
  }

  /**
   * Check if local binaries need to be downloaded (sync version - just checks if files exist)
   */
  needsDownload() {
    const binaries = ['pg_dump', 'pg_restore', 'psql'];
    for (const binary of binaries) {
      const localPath = this.getBinaryPath(binary);
      if (!fs.existsSync(localPath)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if an upgrade is available (async - compares with latest version)
   * Returns: { needsDownload: boolean, needsUpgrade: boolean, installedVersion: object|null, latestVersion: object }
   */
  async checkForUpdates() {
    const installed = this.getInstalledVersion();
    const latest = await this.fetchLatestVersion();
    
    // Check if binaries exist
    const binariesMissing = this.needsDownload();
    
    // Check if upgrade is needed
    let needsUpgrade = false;
    if (installed && latest && !binariesMissing) {
      needsUpgrade = latest.major > installed.major || 
                     (latest.major === installed.major && latest.minor > installed.minor);
    }
    
    return {
      needsDownload: binariesMissing,
      needsUpgrade,
      installedVersion: installed,
      latestVersion: latest
    };
  }

  /**
   * Get download URL for current platform (fetches latest version dynamically)
   */
  async getDownloadUrl() {
    const platform = process.platform;
    const arch = process.arch;
    
    // Fetch the latest version from postgresql.org
    const version = await this.fetchLatestVersion();
    
    // Build the download URL for this version
    return this.buildDownloadUrl(version, platform, arch);
  }

  /**
   * Download a file with progress tracking
   */
  downloadFile(url, destPath, progressCallback) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      const protocol = url.startsWith('https') ? https : http;

      const request = protocol.get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          file.close();
          fs.unlinkSync(destPath);
          return this.downloadFile(response.headers.location, destPath, progressCallback)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(destPath);
          reject(new Error(`Download failed with status: ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'], 10) || 0;
        let downloadedSize = 0;

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          if (totalSize > 0 && progressCallback) {
            const progress = Math.round((downloadedSize / totalSize) * 100);
            progressCallback({ phase: 'downloading', progress, downloadedSize, totalSize });
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve(destPath);
        });
      });

      request.on('error', (err) => {
        file.close();
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        reject(err);
      });

      request.setTimeout(60000, () => {
        request.destroy();
        reject(new Error('Download timeout'));
      });
    });
  }

  /**
   * Extract downloaded archive (async to prevent UI freeze)
   */
  async extractArchive(archivePath, progressCallback) {
    const { spawn, exec } = require('child_process');
    const isWindows = process.platform === 'win32';
    const isTarGz = archivePath.endsWith('.tar.gz');
    const isZip = archivePath.endsWith('.zip');

    if (progressCallback) {
      progressCallback({ phase: 'extracting', progress: 10, message: 'Extracting PostgreSQL binaries (this may take a minute)...' });
    }

    return new Promise((resolve, reject) => {
      let proc;
      
      try {
        if (isWindows && isZip) {
          // On Windows 10+, use tar.exe which is much faster than PowerShell
          // tar can handle .zip files with -x -f
          console.log('📦 Using tar to extract zip on Windows...');
          proc = spawn('tar', ['-xf', archivePath, '-C', this.binariesDir], { 
            windowsHide: true,
            shell: true 
          });
        } else if (isTarGz) {
          // Use tar for .tar.gz files
          proc = spawn('tar', ['-xzf', archivePath, '-C', this.binariesDir]);
        } else if (isZip) {
          // Use unzip for .zip files on Unix
          proc = spawn('unzip', ['-o', archivePath, '-d', this.binariesDir]);
        } else {
          reject(new Error('Unknown archive format'));
          return;
        }

        let stderr = '';
        let stdout = '';
        
        proc.stdout?.on('data', (data) => {
          stdout += data.toString();
          // Update progress during extraction
          if (progressCallback) {
            progressCallback({ phase: 'extracting', progress: 50, message: 'Extracting files...' });
          }
        });
        
        proc.stderr.on('data', (data) => {
          stderr += data.toString();
          console.log('Extraction stderr:', data.toString());
        });

        proc.on('close', (code) => {
          console.log(`📦 Extraction finished with code: ${code}`);
          
          if (code === 0) {
            if (progressCallback) {
              progressCallback({ phase: 'extracting', progress: 90, message: 'Finalizing...' });
            }

            // Make binaries executable on Unix systems
            if (!isWindows) {
              const binaries = ['pg_dump', 'pg_restore', 'psql'];
              for (const binary of binaries) {
                const binaryPath = this.getBinaryPath(binary);
                if (fs.existsSync(binaryPath)) {
                  fs.chmodSync(binaryPath, '755');
                }
              }
            }

            if (progressCallback) {
              progressCallback({ phase: 'extracting', progress: 100, message: 'Extraction complete' });
            }
            
            resolve(true);
          } else {
            // If tar fails on Windows, fall back to PowerShell
            if (isWindows && isZip) {
              console.log('📦 Tar failed, falling back to PowerShell...');
              if (progressCallback) {
                progressCallback({ phase: 'extracting', progress: 20, message: 'Using alternative extraction method...' });
              }
              
              exec(
                `powershell -NoProfile -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${this.binariesDir}' -Force"`,
                { windowsHide: true, timeout: 600000 },
                (error, stdout, stderr) => {
                  if (error) {
                    reject(new Error(`PowerShell extraction failed: ${error.message}`));
                  } else {
                    if (progressCallback) {
                      progressCallback({ phase: 'extracting', progress: 100, message: 'Extraction complete' });
                    }
                    resolve(true);
                  }
                }
              );
            } else {
              reject(new Error(`Extraction failed with code ${code}: ${stderr}`));
            }
          }
        });

        proc.on('error', (error) => {
          console.error('Extraction process error:', error);
          // Fall back to PowerShell on Windows
          if (isWindows && isZip) {
            console.log('📦 Tar not available, falling back to PowerShell...');
            if (progressCallback) {
              progressCallback({ phase: 'extracting', progress: 20, message: 'Using alternative extraction method...' });
            }
            
            exec(
              `powershell -NoProfile -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${this.binariesDir}' -Force"`,
              { windowsHide: true, timeout: 600000 },
              (execError, stdout, stderr) => {
                if (execError) {
                  reject(new Error(`PowerShell extraction failed: ${execError.message}`));
                } else {
                  if (progressCallback) {
                    progressCallback({ phase: 'extracting', progress: 100, message: 'Extraction complete' });
                  }
                  resolve(true);
                }
              }
            );
          } else {
            reject(new Error(`Failed to start extraction: ${error.message}`));
          }
        });

        // Set a longer timeout for large files
        const timeout = setTimeout(() => {
          proc.kill();
          reject(new Error('Extraction timeout (10 minutes)'));
        }, 600000);

        proc.on('close', () => clearTimeout(timeout));
        
      } catch (error) {
        console.error('Extraction error:', error);
        reject(new Error(`Failed to extract PostgreSQL binaries: ${error.message}`));
      }
    });
  }

  /**
   * Download and install PostgreSQL client binaries
   */
  async downloadBinaries(progressCallback = null) {
    if (this.downloadInProgress) {
      throw new Error('Download already in progress');
    }

    this.downloadInProgress = true;

    try {
      // Create binaries directory if it doesn't exist
      if (!fs.existsSync(this.binariesDir)) {
        fs.mkdirSync(this.binariesDir, { recursive: true });
      }

      if (progressCallback) {
        progressCallback({ 
          phase: 'starting', 
          progress: 0, 
          message: 'Checking latest PostgreSQL version...' 
        });
      }

      // Get download URL (fetches latest version dynamically)
      const url = await this.getDownloadUrl();
      const isZip = url.endsWith('.zip');
      const archiveExt = isZip ? '.zip' : '.tar.gz';
      const archivePath = path.join(this.binariesDir, `postgresql${archiveExt}`);

      if (progressCallback) {
        progressCallback({ 
          phase: 'starting', 
          progress: 5, 
          message: `Downloading PostgreSQL ${this.cachedLatestVersion?.full || ''} client tools...` 
        });
      }

      console.log(`📥 Downloading PostgreSQL binaries from: ${url}`);

      // Download the archive
      await this.downloadFile(url, archivePath, progressCallback);

      console.log('📦 Download complete, extracting...');

      // Extract the archive
      await this.extractArchive(archivePath, progressCallback);

      // Clean up the archive
      if (fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath);
      }

      // Verify binaries exist
      const binaries = ['pg_dump', 'pg_restore', 'psql'];
      const missingBinaries = [];
      
      for (const binary of binaries) {
        const binaryPath = this.getBinaryPath(binary);
        if (!fs.existsSync(binaryPath)) {
          missingBinaries.push(binary);
        }
      }

      if (missingBinaries.length > 0) {
        throw new Error(`Some binaries were not found after extraction: ${missingBinaries.join(', ')}`);
      }

      if (progressCallback) {
        progressCallback({ 
          phase: 'completed', 
          progress: 100, 
          message: 'PostgreSQL client tools installed successfully!' 
        });
      }

      // Save the installed version
      if (this.cachedLatestVersion) {
        this.saveInstalledVersion(this.cachedLatestVersion);
        console.log(`✅ PostgreSQL ${this.cachedLatestVersion.full} binaries installed successfully`);
      } else {
        console.log('✅ PostgreSQL binaries installed successfully');
      }

      return {
        success: true,
        binDir: this.binDir,
        version: this.cachedLatestVersion,
        pg_dump: this.getBinaryPath('pg_dump'),
        pg_restore: this.getBinaryPath('pg_restore'),
        psql: this.getBinaryPath('psql')
      };
    } catch (error) {
      console.error('❌ Failed to download PostgreSQL binaries:', error);
      
      if (progressCallback) {
        progressCallback({ 
          phase: 'error', 
          progress: 0, 
          message: `Download failed: ${error.message}` 
        });
      }

      throw error;
    } finally {
      this.downloadInProgress = false;
    }
  }

  /**
   * Remove downloaded binaries
   */
  async removeBinaries() {
    try {
      if (fs.existsSync(this.binariesDir)) {
        fs.rmSync(this.binariesDir, { recursive: true, force: true });
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get the size of downloaded binaries
   */
  getBinariesSize() {
    if (!fs.existsSync(this.binariesDir)) {
      return 0;
    }

    let totalSize = 0;
    const getAllFiles = (dirPath) => {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          getAllFiles(filePath);
        } else {
          totalSize += stat.size;
        }
      }
    };

    getAllFiles(this.binariesDir);
    return totalSize;
  }

  /**
   * Format bytes to human readable string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Export singleton instance
module.exports = new PgBinariesManager();

