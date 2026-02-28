const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const mongodb = require('mongodb');
const EJSON = mongodb.EJSON || require('mongodb/lib/bson').EJSON;

/**
 * ShellManager handles all MongoDB shell operations for the DatabaseConnection class.
 * This includes persistent shell management, query execution, and shell utilities.
 * Now supports conversation-based shells with activity tracking and limits.
 */
class ShellManager {
  constructor(databaseConnection) {
    this.databaseConnection = databaseConnection; // Reference back to main connection class
    this.shells = new Map(); // Map of shell IDs (conversationId_connectionId) to persistent shell processes
    this.activeOperations = new Map(); // Map of operation IDs to shell operations
    
    // Shell management configuration
    this.maxConcurrentShells = 4; // Maximum number of concurrent shells
    this.shellTimeoutMs = 15 * 60 * 1000; // 3 minutes of inactivity (debug mode)
    this.cleanupIntervalMs = 1 * 60 * 1000; // 1 minute cleanup check (debug mode)
    this.cleanupInterval = null;
    
    // Start cleanup timer
    this.startCleanupTimer();
    
    // Debug log for timeout configuration
    console.log(`🐚 [SHELL CONFIG] Shell timeout: ${this.shellTimeoutMs / 60000} minutes, cleanup interval: ${this.cleanupIntervalMs / 60000} minutes`);
  }

  // ===== SHELL MANAGEMENT UTILITIES =====

  /**
   * Generate shell ID from conversation and connection IDs
   */
  generateShellId(conversationId, connectionId) {
    return `${conversationId}_${connectionId}`;
  }

  /**
   * Start cleanup timer for inactive shells
   */
  startCleanupTimer() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveShells();
    }, this.cleanupIntervalMs);
  }

  /**
   * Update shell activity timestamp
   */
  updateShellActivity(shellId) {
    const shell = this.shells.get(shellId);
    if (shell) {
      shell.lastActivity = Date.now();
      shell.queryCount = (shell.queryCount || 0) + 1;
    }
  }

  /**
   * Check if we can create a new shell (within limits)
   */
  canCreateNewShell() {
    return this.shells.size < this.maxConcurrentShells;
  }

  /**
   * Find least recently used shell for eviction
   */
  findLeastRecentlyUsedShell() {
    let oldestShell = null;
    let oldestActivity = Date.now();

    for (const [shellId, shell] of this.shells) {
      // Skip shells that are currently executing queries
      if (shell.currentQuery) continue;
      
      if (shell.lastActivity < oldestActivity) {
        oldestActivity = shell.lastActivity;
        oldestShell = { shellId, shell };
      }
    }

    return oldestShell;
  }

  /**
   * Enforce shell limit by evicting LRU shell if needed
   */
  async enforceShellLimit() {
    if (this.shells.size >= this.maxConcurrentShells) {
      const lruShell = this.findLeastRecentlyUsedShell();
      if (lruShell) {
        const inactiveTime = Math.round((Date.now() - lruShell.shell.lastActivity) / 60000);
        console.log(`🚫 [SHELL EVICT] Shell limit reached (${this.maxConcurrentShells}), evicting LRU shell: ${lruShell.shellId}`);
        console.log(`🚫 [SHELL EVICT] Evicted shell was inactive for ${inactiveTime} minutes (${lruShell.shell.queryCount} queries total)`);
        await this.closePersistentShell(lruShell.shellId);
        return true;
      }
    }
    return false;
  }

  /**
   * Clean up inactive shells based on timeout
   */
  cleanupInactiveShells() {
    const now = Date.now();
    const shellsToClose = [];

    for (const [shellId, shell] of this.shells) {
      // Skip shells that are currently executing queries
      if (shell.currentQuery) continue;
      
      const inactiveTime = now - shell.lastActivity;
      if (inactiveTime > this.shellTimeoutMs) {
        shellsToClose.push(shellId);
      }
    }

    // Close inactive shells
    shellsToClose.forEach(async (shellId) => {
      const shell = this.shells.get(shellId);
      const inactiveMinutes = Math.round((now - shell.lastActivity) / 60000);
      console.log(`🧹 [SHELL TIMEOUT] Closing inactive shell: ${shellId} (inactive for ${inactiveMinutes} minutes, ${shell.queryCount} queries total)`);
      await this.closePersistentShell(shellId);
    });

    if (shellsToClose.length > 0) {
      console.log(`🧹 [SHELL CLEANUP] Cleaned up ${shellsToClose.length} inactive shells (remaining: ${this.shells.size - shellsToClose.length})`);
    }
  }

  /**
   * Ensure shell exists for conversation, create if needed
   */
  async ensureShellForConversation(conversationId, connectionId) {
    const shellId = this.generateShellId(conversationId, connectionId);
    
    // Check if shell already exists and is ready
    const existingShell = this.shells.get(shellId);
    if (existingShell && existingShell.isReady && existingShell.process && !existingShell.process.killed) {
      this.updateShellActivity(shellId);
      console.log(`♻️ [SHELL REUSE] Reusing existing shell ${shellId} (${existingShell.queryCount} queries so far)`);
      return existingShell;
    }

    // Remove dead shell if it exists
    if (existingShell) {
      this.shells.delete(shellId);
    }

    // Enforce shell limits before creating new shell
    await this.enforceShellLimit();

    // Get connection string
    const connectionString = this.databaseConnection.getConnectionString(connectionId, true);
    if (!connectionString) {
      throw new Error(`No connection string available for ${connectionId}`);
    }

    // Create new shell
    console.log(`🐚 [SHELL CREATE] Starting shell creation for conversation '${conversationId}' on connection '${connectionId}'`);
    console.log(`🐚 [SHELL CREATE] Current shell count: ${this.shells.size}/${this.maxConcurrentShells}`);
    
    const shell = await this.createPersistentShell(conversationId, connectionId, connectionString);
    this.shells.set(shellId, shell);
    
    console.log(`✅ [SHELL CREATE] Successfully created shell '${shellId}' (total shells: ${this.shells.size})`);
    return shell;
  }

  // ===== CORE SHELL LIFECYCLE METHODS =====

  /**
   * Creates a persistent MongoDB shell process for a conversation and connection
   */
  async createPersistentShell(conversationId, connectionId, connectionString) {
    const shellId = this.generateShellId(conversationId, connectionId);
    
    try {
      // Determine which shell to use based on server version
      const shellCommand = await this.checkMongoShellAvailability(connectionId);
      if (!shellCommand) {
        throw new Error('MongoDB shell not available');
      }
      console.log(`🐚 [SHELL SPAWN] Spawning shell process for ${shellId} using: ${shellCommand}`);
      console.log(`🔗 [SHELL SPAWN] Connection: ${connectionString.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);

      // Spawn persistent shell process (without --quiet during startup to see initial output)
      const shellArgs = [connectionString];
      const shellProcess = spawn(shellCommand, shellArgs, {
        stdio: ['pipe', 'pipe', 'pipe'] // stdin, stdout, stderr
      });

      // Create shell wrapper object with conversation context and activity tracking
      const shell = {
        process: shellProcess,
        connectionId,
        conversationId,
        shellId,
        shellCommand,
        isReady: false,
        queryQueue: [],
        currentQuery: null,
        buffer: '',
        queryId: 0,
        // Activity tracking
        createdAt: Date.now(),
        lastActivity: Date.now(),
        queryCount: 0
      };

      // Set up data handlers
      shellProcess.stdout.on('data', (data) => {
        this.handleShellOutput(shell, data);
      });

      shellProcess.stderr.on('data', (data) => {
        console.error(`Shell stderr (${shellId}):`, data.toString());
      });

      shellProcess.on('close', (code) => {
        console.log(`🔴 [SHELL CLOSE] Shell process closed for ${shellId} with code: ${code} (remaining shells: ${this.shells.size - 1})`);
        this.shells.delete(shellId);
      });

      shellProcess.on('error', (error) => {
        console.error(`❌ [SHELL ERROR] Shell process error for ${shellId}:`, error.message);
        this.shells.delete(shellId);
      });

      // Wait for shell to be ready with improved detection
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.error(`🐚 Shell startup timeout for ${shellId}. Buffer content:`, JSON.stringify(shell.buffer));
          reject(new Error('Shell startup timeout'));
        }, 15000); // Increased timeout

        const promptPatterns = [
          '>',              // Basic prompt
          'mongos>',        // Sharded cluster
          'rs0:PRIMARY>',   // Replica set primary
          'rs0:SECONDARY>', // Replica set secondary
          'MongoDB shell',  // Shell startup message
          'connecting to:', // Connection message
        ];

        let checkAttempts = 0;
        const maxAttempts = 30; // 15 seconds with 500ms intervals

        const checkReady = () => {
          checkAttempts++;
          console.log(`🔍 Shell check attempt ${checkAttempts} for ${shellId}, buffer: ${JSON.stringify(shell.buffer.slice(-100))}`);
          
          // Check for any prompt pattern
          const hasPrompt = promptPatterns.some(pattern => shell.buffer.includes(pattern));
          
          if (hasPrompt) {
            clearTimeout(timeout);
            shell.isReady = true;
            console.log(`✅ [SHELL READY] Shell ${shellId} ready after ${checkAttempts} attempts`);
            shell.buffer = ''; // Clear initial output
            
            resolve();
            return;
          }

          // Continue checking if we haven't exceeded max attempts
          if (checkAttempts < maxAttempts) {
            setTimeout(checkReady, 500);
          } else {
            clearTimeout(timeout);
            console.error(`🐚 Shell never became ready for ${shellId} after ${maxAttempts} attempts`);
            console.error(`🐚 Final buffer content: ${shell.buffer}`);
            reject(new Error(`Shell startup failed - no prompt detected after ${maxAttempts} attempts`));
          }
        };

        // Start checking immediately, don't wait for first data event
        setTimeout(checkReady, 1000); // Give shell a moment to start
      });

      return shell;
    } catch (error) {
      console.error(`❌ Failed to create persistent shell for ${shellId}:`, error);
      throw error;
    }
  }

  /**
   * Recreates a persistent shell for a conversation if it's missing or dead
   * @deprecated Use ensureShellForConversation instead
   */
  async ensurePersistentShell(conversationId, connectionId) {
    console.warn('⚠️  ensurePersistentShell is deprecated, use ensureShellForConversation instead');
    return this.ensureShellForConversation(conversationId, connectionId);
  }

  /**
   * Closes a persistent shell by shell ID
   */
  async closePersistentShell(shellId) {
    const shell = this.shells.get(shellId);
    if (shell) {
      const inactiveTime = Math.round((Date.now() - shell.lastActivity) / 60000);
      console.log(`🔴 [SHELL CLOSE] Closing shell ${shellId} (lived ${inactiveTime} minutes, ${shell.queryCount} queries)`);
      
      try {
        // Send exit command to shell
        if (shell.process && !shell.process.killed) {
          shell.process.stdin.write('exit\n');
          
          // Give it a moment to exit gracefully
          setTimeout(() => {
            if (shell.process && !shell.process.killed) {
              console.log(`🔪 [SHELL FORCE] Force killing shell process: ${shellId}`);
              shell.process.kill('SIGTERM');
            }
          }, 1000);
        }
      } catch (shellError) {
        console.warn(`⚠️ [SHELL CLOSE] Warning closing shell ${shellId}:`, shellError.message);
      }
      
      this.shells.delete(shellId);
    }
  }

  // ===== UNIFIED COMMAND EXECUTION =====

  /**
   * Execute a command (query or script) in the persistent shell
   */
  async executeCommand(conversationId, connectionId, databaseName, command, options = {}) {
    const {
      operationId = null,
      timeoutSeconds = 30,
      isScript = false
    } = options;

    // Ensure shell exists for this conversation
    const shell = await this.ensureShellForConversation(conversationId, connectionId);
    const shellId = shell.shellId;

    if (!shell.isReady) {
      throw new Error(`Shell not ready for conversation ${conversationId} on connection ${connectionId}`);
    }

    // Update shell activity at start of command execution
    this.updateShellActivity(shellId);
    
    console.log(`🔍 [SHELL EXEC] Executing command in shell ${shellId} (query count: ${shell.queryCount})`);

    return new Promise((resolve, reject) => {
      // Generate unique command ID
      const commandId = `CMD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      let shellCommand;
      
      if (isScript) {
        // Script execution - raw output with timing
        shellCommand = `
       
use ${databaseName};
config.set("displayBatchSize",100000)
const __startTime__ = Date.now();
${command}
const __endTime__ = Date.now();
print('${commandId}_TIMING:' + (__endTime__ - __startTime__));
print('${commandId}_COMPLETE');
`.trim();
      } else {
        // Query execution - structured JSON output
        shellCommand = `
use ${databaseName};
const __startTime__ = Date.now();
try {
  const __result__ = ${command};
  const __endTime__ = Date.now();
  const __executionTime__ = __endTime__ - __startTime__;
  
  // Convert cursor to array if needed
  const __finalResult__ = (__result__ && typeof __result__.toArray === 'function') 
    ? __result__.toArray() 
    : __result__;
  
  print('${commandId}_START');
  print(EJSON.stringify({
    success: true,
    result: __finalResult__,
    executionTime: __executionTime__
  }));
  print('${commandId}_END');
} catch (__error__) {
  const __endTime__ = Date.now();
  const __executionTime__ = __endTime__ - __startTime__;
  
  print('${commandId}_START');
  print(EJSON.stringify({ 
    success: false,
    error: __error__.message,
    errorType: __error__.name,
    stack: __error__.stack,
    executionTime: __executionTime__
  }));
  print('${commandId}_END');
}
`.trim();
      }

      const commandObj = {
        commandId: ++shell.queryId,
        uniqueId: commandId,
        shellCommand,
        originalCommand: command,
        databaseName,
        isScript,
        timestamp: Date.now(),
        resolve,
        reject,
        timeout: null,
        cancellationCheckInterval: null
      };

      // Add timeout and cancellation handling
      commandObj.timeout = setTimeout(() => {
        reject(new Error(`Command timeout after ${timeoutSeconds} seconds`));
        
        // Remove from queue if still there
        const index = shell.queryQueue.indexOf(commandObj);
        if (index > -1) {
          shell.queryQueue.splice(index, 1);
        }
        
        // Clear current command if it's this one
        if (shell.currentQuery === commandObj) {
          shell.currentQuery = null;
          shell.buffer = '';
          this.processNextQuery(shell);
        }
      }, timeoutSeconds * 1000);

      // Periodic cancellation check if operationId is provided
      if (operationId) {
        commandObj.cancellationCheckInterval = setInterval(() => {
          const operation = this.databaseConnection.activeOperations.get(operationId);
          if (operation && operation.cancelled) {
            clearInterval(commandObj.cancellationCheckInterval);
            clearTimeout(commandObj.timeout);
            
            // Remove from queue if still there
            const index = shell.queryQueue.indexOf(commandObj);
            if (index > -1) {
              shell.queryQueue.splice(index, 1);
            }
            
            // Clear current command if it's this one
            if (shell.currentQuery === commandObj) {
              shell.currentQuery = null;
              shell.buffer = '';
              this.processNextQuery(shell);
            }
            
            reject(new Error(`Command execution was cancelled by user`));
          }
        }, 100); // Check every 100ms
      }

      // Clear timeout and cancellation check when command completes
      const originalResolve = resolve;
      const originalReject = reject;
      
      commandObj.resolve = (result) => {
        clearTimeout(commandObj.timeout);
        if (commandObj.cancellationCheckInterval) {
          clearInterval(commandObj.cancellationCheckInterval);
        }
        console.log(`✅ [SHELL RESULT] Command completed in shell ${shellId} - Success: ${result?.success}, Type: ${result?.type}`);
        originalResolve(result);
      };
      
      commandObj.reject = (error) => {
        clearTimeout(commandObj.timeout);
        if (commandObj.cancellationCheckInterval) {
          clearInterval(commandObj.cancellationCheckInterval);
        }
        console.log(`❌ [SHELL RESULT] Command failed in shell ${shellId} - Error: ${error?.message}`);
        originalReject(error);
      };

      // Add to queue or execute immediately
      if (shell.currentQuery) {
        shell.queryQueue.push(commandObj);
        console.log(`📋 Queued command for ${shellId}, queue length: ${shell.queryQueue.length}`);
      } else {
        shell.currentQuery = commandObj;
        shell.buffer = ''; // Clear any leftover output before executing command
        console.log(`📝 Executing ${isScript ? 'script' : 'query'} immediately for ${shellId}: ${command}`);
        shell.process.stdin.write(shellCommand + '\n');
      }
    });
  }

  /**
   * Legacy method for backward compatibility - delegates to executeCommand
   * @deprecated Use executeCommand with conversationId instead
   */
  async sendQueryToShell(conversationId, connectionId, databaseName, queryString, operationId = null, timeoutSeconds = 30) {
    console.warn('⚠️  sendQueryToShell is deprecated, use executeCommand with conversationId instead');
    return this.executeCommand(conversationId, connectionId, databaseName, queryString, {
      operationId,
      timeoutSeconds,
      isScript: false
    });
  }

  /**
   * Executes a MongoDB script via persistent shell - delegates to executeCommand
   * @deprecated Use executeCommand with conversationId instead
   */
  async executeScript(conversationId, connectionId, databaseName, script, operationId = null, timeoutSeconds = 60) {
    console.warn('⚠️  executeScript is deprecated, use executeCommand with conversationId instead');
    return this.executeCommand(conversationId, connectionId, databaseName, script, {
      operationId,
      timeoutSeconds,
      isScript: true
    });
  }

  // ===== SHELL OUTPUT PROCESSING =====

  /**
   * Handles output from persistent shell processes
   */
  handleShellOutput(shell, data) {
    const rawOutput = data.toString();
    // Always add raw output to buffer to preserve command markers
    // Cleaning will happen later when extracting results for display
    shell.buffer += rawOutput;

    // Debug output during startup (when no current query)
    if (this.shouldLogStartupOutput(shell)) {
      console.log(`🐚 Shell startup output for ${shell.shellId}: ${JSON.stringify(rawOutput)}`);
    }

    // Check if we have a complete response for a command
    if (shell.currentQuery) {
      const command = shell.currentQuery;
      
      // First, check for immediate errors (before completion markers)
      if (this.shouldHandleImmediateError(shell, command)) {
        // We have an error and no success markers - this is likely an error
        console.log(`🚨 Detected error for ${shell.shellId}`);
        
        // Clear timeout and intervals
        this.clearCommandTimeouts(command);
        
        // Return full output with error flag (clean it since we have a query)
        const cleanedOutput = this.cleanShellOutput(shell.buffer);
        command.resolve(this.createErrorResult(cleanedOutput));
        
        // Clear current command and buffer
        this.finishCommand(shell);
        return;
      }
      
      // Check for completion markers based on command type
      if (this.hasCompleteCommandResult(shell, command)) {
        // Use minimal parser to extract result

        const parseResult = this.parseShellResult(shell.buffer, command.uniqueId, command.isScript);
          
        if (parseResult.success) {
          // Success - return result to frontend
          // Clean any string values in the result (especially output properties)
          const cleanedResult = this.cleanResultStrings(parseResult.result);
          
          const result = {
            success: true,
            result: cleanedResult,
            executionTime: parseResult.executionTime,
            type: parseResult.type
          };
          
          // Convert to legacy format for backward compatibility
          this.addLegacyFormatIfNeeded(result, parseResult);
          
          command.resolve(result);
        } else if (parseResult.error) {
          // Error - forward to frontend
          command.reject(new Error(parseResult.error));
        } else {
          // Fallback - return raw output, but check if it contains errors (clean it since we have a query)
          const rawOutput = parseResult.rawOutput || shell.buffer;
          const cleanedOutput = this.cleanShellOutput(rawOutput);
          
          // Check if the raw output contains error patterns
          if (this.shouldTreatAsError(rawOutput, cleanedOutput)) {
            command.resolve(this.createErrorResult(cleanedOutput));
          } else {
            command.resolve(this.createRawSuccessResult(cleanedOutput));
          }
        }
        
        // Clear timeout and intervals
        this.clearCommandTimeouts(command);
        
        // Clear current command and buffer
        this.finishCommand(shell);
      }
    }
  }

  /**
   * Check if we should log startup output
   */
  shouldLogStartupOutput(shell) {
    return !shell.currentQuery && !shell.isReady;
  }

  /**
   * Check if we should handle an immediate error (before completion markers)
   */
  shouldHandleImmediateError(shell, command) {
    const hasError = this.hasErrorInOutput(shell.buffer);
    const hasSuccessMarkers = shell.buffer.includes(`${command.uniqueId}_START`);
    return hasError && !hasSuccessMarkers;
  }

  /**
   * Check if command has complete result based on its type
   */
  hasCompleteCommandResult(shell, command) {
    if (command.isScript) {
      return shell.buffer.includes(`${command.uniqueId}_COMPLETE`);
    } else {
      const hasStart = shell.buffer.includes(`${command.uniqueId}_START`);
      const hasEnd = shell.buffer.includes(`${command.uniqueId}_END`);
      
      // Log completion status
      if (hasStart && hasEnd) {
        console.log(`✅ [COMPLETE] Command ${command.uniqueId} has both markers`);
      }
      
      return hasStart && hasEnd;
    }
  }

  /**
   * Check if output should be treated as an error
   */
  shouldTreatAsError(rawOutput, cleanedOutput) {
    return this.hasErrorInOutput(rawOutput) || this.hasErrorInOutput(cleanedOutput);
  }

  /**
   * Add legacy format properties for backward compatibility
   */
  addLegacyFormatIfNeeded(result, parseResult) {
    if (this.shouldAddLegacyFormat(parseResult.type)) {
      // Use the cleaned result from result.result, not parseResult.result
      const cleanedResult = result.result;
      result.documents = Array.isArray(cleanedResult) ? cleanedResult : [cleanedResult];
      result.count = Array.isArray(cleanedResult) ? cleanedResult.length : 1;
      result.actualExecutionTime = parseResult.executionTime;
    }
  }

  /**
   * Check if legacy format should be added
   */
  shouldAddLegacyFormat(type) {
    return type === 'query' || type === 'raw';
  }

  /**
   * Create error result object
   */
  createErrorResult(cleanedOutput) {
    return {
      success: false,
      error: 'Query execution failed',
      result: { output: cleanedOutput },
      executionTime: 0,
      type: 'error',
      documents: [{ output: cleanedOutput }],
      count: 1,
      actualExecutionTime: 0
    };
  }

  /**
   * Create raw success result object
   */
  createRawSuccessResult(cleanedOutput) {
    return {
      success: true,
      result: { output: cleanedOutput },
      executionTime: 0,
      type: 'raw',
      documents: [{ output: cleanedOutput }],
      count: 1,
      actualExecutionTime: 0
    };
  }

  /**
   * Clear command timeouts and intervals
   */
  clearCommandTimeouts(command) {
    if (command.timeout) {
      clearTimeout(command.timeout);
    }
    if (command.cancellationCheckInterval) {
      clearInterval(command.cancellationCheckInterval);
    }
  }

  /**
   * Finish command execution and process next in queue
   */
  finishCommand(shell) {
    shell.currentQuery = null;
    shell.buffer = '';
    this.processNextQuery(shell);
  }

  /**
   * Processes the next command in the shell's queue
   */
  processNextQuery(shell) {
    if (shell.queryQueue.length > 0 && !shell.currentQuery) {
      const nextCommand = shell.queryQueue.shift();
      shell.currentQuery = nextCommand;
      shell.buffer = ''; // Clear any leftover output before executing queued command
      
      console.log(`📝 Sending ${nextCommand.isScript ? 'script' : 'query'} to shell (${shell.shellId}): ${nextCommand.originalCommand}`);
      
      // Send the command to the shell
      shell.process.stdin.write(nextCommand.shellCommand + '\n');
    }
  }

  // ===== SHELL UTILITIES =====

  /**
   * Checks which MongoDB shell is available and returns the command to use
   */
  async checkMongoShellAvailability(connectionId = null) {
    console.log('🔍 [SHELL AVAILABILITY] Starting shell availability check...');
    
    // Get bundled tool paths
    const bundledPaths = this.getBundledMongoShellPath();
    
    // Always use mongosh regardless of server version
    console.log('ℹ️ [SHELL AVAILABILITY] Using mongosh for all MongoDB versions');
    
    // Try bundled mongosh first with timeout protection
    const bundledMongosh = bundledPaths.mongosh;
    if (bundledMongosh) {
      console.log(`🧪 [SHELL AVAILABILITY] Testing bundled mongosh: ${bundledMongosh}`);
      
      try {
        await new Promise((resolve, reject) => {
          const shell = spawn(bundledMongosh, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
          
          let stdout = '';
          let stderr = '';
          
          shell.stdout.on('data', (data) => {
            stdout += data.toString();
          });
          
          shell.stderr.on('data', (data) => {
            stderr += data.toString();
          });
          
          // Add timeout protection to prevent hanging
          const timeout = setTimeout(() => {
            console.warn('⏰ [SHELL AVAILABILITY] Bundled mongosh version check timed out, killing process');
            shell.kill('SIGKILL');
            reject(new Error('Version check timeout'));
          }, 5000); // Increased timeout to 5 seconds
          
          shell.on('close', (code) => {
            clearTimeout(timeout);
            console.log(`🔚 [SHELL AVAILABILITY] Bundled mongosh exit code: ${code}`);
            if (stdout) console.log(`📤 [SHELL AVAILABILITY] Bundled mongosh stdout: ${stdout.trim()}`);
            if (stderr) console.log(`📤 [SHELL AVAILABILITY] Bundled mongosh stderr: ${stderr.trim()}`);
            
            code === 0 ? resolve() : reject(new Error(`Exit code: ${code}, stderr: ${stderr.trim()}`));
          });
          
          shell.on('error', (error) => {
            clearTimeout(timeout);
            console.error(`❌ [SHELL AVAILABILITY] Bundled mongosh spawn error: ${error.message}`);
            reject(error);
          });
        });
        console.log(`✅ [SHELL AVAILABILITY] Using bundled mongosh: ${bundledMongosh}`);
        return bundledMongosh;
      } catch (e) {
        console.warn(`⚠️ [SHELL AVAILABILITY] Bundled mongosh not working: ${e.message}`);
      }
    } else {
      console.log(`ℹ️ [SHELL AVAILABILITY] No bundled mongosh found`);
    }
    
    // Fall back to system-installed mongosh with timeout protection
    console.log('🔄 [SHELL AVAILABILITY] Bundled mongosh not available, trying system installation...');
    
    try {
      await new Promise((resolve, reject) => {
        const shell = spawn('mongosh', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
        
        let stdout = '';
        let stderr = '';
        
        shell.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        shell.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        // Add timeout protection to prevent hanging
        const timeout = setTimeout(() => {
          console.warn('⏰ [SHELL AVAILABILITY] System mongosh version check timed out, killing process');
          shell.kill('SIGKILL');
          reject(new Error('Version check timeout'));
        }, 5000); // Increased timeout to 5 seconds
        
        shell.on('close', (code) => {
          clearTimeout(timeout);
          console.log(`🔚 [SHELL AVAILABILITY] System mongosh exit code: ${code}`);
          if (stdout) console.log(`📤 [SHELL AVAILABILITY] System mongosh stdout: ${stdout.trim()}`);
          if (stderr) console.log(`📤 [SHELL AVAILABILITY] System mongosh stderr: ${stderr.trim()}`);
          
          code === 0 ? resolve() : reject(new Error(`Exit code: ${code}, stderr: ${stderr.trim()}`));
        });
        
        shell.on('error', (error) => {
          clearTimeout(timeout);
          console.error(`❌ [SHELL AVAILABILITY] System mongosh spawn error: ${error.message}`);
          reject(error);
        });
      });
      console.log('✅ [SHELL AVAILABILITY] Using system mongosh');
      return 'mongosh';
    } catch (e) {
      console.error(`❌ [SHELL AVAILABILITY] No working mongosh installation found: ${e.message}`);
      return null;
    }
  }

  /**
   * Gets the path to bundled MongoDB shell executables
   */
  getBundledMongoShellPath() {
    const { app } = require('electron');
    
    // Determine platform and architecture
    const platform = os.platform();
    const arch = os.arch();
    
    console.log(`🔍 [SHELL DETECTION] Platform: ${platform}, Architecture: ${arch}`);
    
    let shellDir = '';
    let shellExtension = platform === 'win32' ? '.exe' : '';
    
    // Platform-specific directory names
    switch (platform) {
      case 'darwin': // macOS
        shellDir = arch === 'arm64' ? 'macos-arm64' : 'macos-x64';
        break;
      case 'win32': // Windows
        shellDir = arch === 'x64' ? 'windows-x64' : 'windows-x86';
        break;
      case 'linux': // Linux
        // Try to detect specific Linux distro
        try {
          if (fs.existsSync('/etc/os-release')) {
            const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
            if (osRelease.includes('Ubuntu')) {
              shellDir = 'ubuntu-x64';
            } else if (osRelease.includes('Debian')) {
              shellDir = 'debian-x64';
            } else if (osRelease.includes('CentOS') || osRelease.includes('Red Hat')) {
              shellDir = 'centos-x64';
            } else {
              shellDir = arch === 'x64' ? 'linux-x64' : 'linux-x86';
            }
          } else {
            shellDir = arch === 'x64' ? 'linux-x64' : 'linux-x86';
          }
        } catch (e) {
          shellDir = arch === 'x64' ? 'linux-x64' : 'linux-x86';
        }
        break;
      default:
        console.warn(`Unsupported platform: ${platform}`);
        return { mongosh: null, mongotools: null };
    }
    
    console.log(`🔍 [SHELL DETECTION] Target shell directory: ${shellDir}`);
    console.log(`🔍 [SHELL DETECTION] App packaged: ${app ? app.isPackaged : 'no app'}`);
    
    // Try different possible locations
    const possibleBasePaths = [];
    
    if (app && app.isPackaged) {
      // Production: shells are in extraResources
      possibleBasePaths.push(
        path.join(process.resourcesPath, 'shells'),
        path.join(app.getAppPath(), 'shells'),
        path.join(__dirname, '..', 'shells')
      );
      console.log(`🔍 [SHELL DETECTION] process.resourcesPath: ${process.resourcesPath}`);
      console.log(`🔍 [SHELL DETECTION] app.getAppPath(): ${app.getAppPath()}`);
      console.log(`🔍 [SHELL DETECTION] __dirname: ${__dirname}`);
    } else {
      // Development: shells are in electron/shells
      possibleBasePaths.push(
        path.join(__dirname, '..', 'shells'),
        path.join(__dirname, '..', '..', 'electron', 'shells')
      );
    }
    
    // Check each possible location
    console.log(`🔍 [SHELL DETECTION] Searching for bundled tools in ${possibleBasePaths.length} locations...`);
    for (const basePath of possibleBasePaths) {
      const mongoshPath = path.join(basePath, shellDir, 'mongosh', 'bin', `mongosh${shellExtension}`);
      const mongotoolsPath = path.join(basePath, shellDir, 'mongotools', 'bin', `mongodump${shellExtension}`);
      
      console.log(`📁 [SHELL DETECTION] Checking: ${basePath}`);
      console.log(`   mongosh: ${mongoshPath} (exists: ${fs.existsSync(mongoshPath)})`);
      console.log(`   mongotools: ${mongotoolsPath} (exists: ${fs.existsSync(mongotoolsPath)})`);
      
      // Check if paths are accessible and executable
      if (fs.existsSync(mongoshPath)) {
        try {
          const stats = fs.statSync(mongoshPath);
          console.log(`   mongosh stats: size=${stats.size}, mode=${stats.mode.toString(8)}`);
        } catch (e) {
          console.warn(`   mongosh stat error: ${e.message}`);
        }
      }
      
      const result = {
        mongosh: fs.existsSync(mongoshPath) ? mongoshPath : null,
        mongotools: fs.existsSync(mongotoolsPath) ? path.dirname(mongotoolsPath) : null
      };
      
      // If we found at least mongosh, use this location (mongosh is required, mongotools optional)
      if (result.mongosh) {
        console.log(`✅ [SHELL DETECTION] Found MongoDB tools at: ${basePath}`);
        return result;
      }
    }
    
    console.warn('❌ [SHELL DETECTION] No bundled MongoDB tools found');
    return { mongosh: null, mongotools: null };
  }

  /**
   * Opens an external MongoDB shell terminal
   */
  async openMongoShell(connectionId, connectionString) {
    try {
      // Check if mongosh is available
      const shellCommand = 'mongosh'; // or 'mongo' for older versions
      
      console.log(`Opening MongoDB shell for connection: ${connectionString}`);
      
      if (os.platform() === 'darwin') { // macOS
        // Open in Terminal app
        spawn('open', ['-a', 'Terminal'], { 
          stdio: 'inherit',
          env: { ...process.env, MONGO_CONNECTION: connectionString }
        });
        
        // Send command to new terminal
        setTimeout(() => {
          spawn('osascript', [
            '-e', 
            `tell application "Terminal" to do script "${shellCommand} '${connectionString}'"`
          ]);
        }, 500);
        
      } else if (os.platform() === 'win32') { // Windows
        spawn('cmd', ['/c', 'start', 'cmd', '/k', `${shellCommand} "${connectionString}"`], {
          stdio: 'inherit'
        });
        
      } else { // Linux
        // Try common terminal emulators
        const terminals = ['gnome-terminal', 'xterm', 'konsole', 'terminal'];
        
        for (const terminal of terminals) {
          try {
            spawn(terminal, ['-e', `${shellCommand} "${connectionString}"`], {
              stdio: 'inherit'
            });
            break;
          } catch (error) {
            continue;
          }
        }
      }
      
      return { success: true, message: 'MongoDB shell opened in external terminal' };
      
    } catch (error) {
      console.error('Error opening MongoDB shell:', error);
      return { success: false, error: error.message };
    }
  }

  // ===== MINIMAL RESULT PARSER =====

  /**
   * Parse shell command result with minimal logic
   */
  parseShellResult(output, commandId, isScript = false) {
    if (isScript) {
      // Script parsing - extract raw output and timing
      const timingMatch = output.match(new RegExp(`${commandId}_TIMING:(\\d+)`));
      const completeMatch = output.match(new RegExp(`${commandId}_COMPLETE`));
      
      if (!completeMatch) {
        return {
          success: false,
          error: 'Script did not complete',
          rawOutput: output
        };
      }

      const executionTime = timingMatch ? parseInt(timingMatch[1]) : 0;
      const scriptOutput = timingMatch 
        ? output.substring(0, output.indexOf(timingMatch[0]))
        : output.substring(0, output.indexOf(`${commandId}_COMPLETE`));

      const trimmedOutput = scriptOutput.trim();
      const cleanedOutput = this.cleanShellOutput(trimmedOutput);
      // Try to parse script output as EJSON first, then as JavaScript if that fails
      try {
        const ejsonResult = EJSON.parse(cleanedOutput);
        return {
          success: true,
          result: ejsonResult,
          executionTime,
          type: 'script'
        };
      } catch (ejsonError) {
        // Try to evaluate as JavaScript (for MongoDB shell output like ObjectId('...'))
        try {
                     // Create a safe evaluation context with MongoDB types
           const evalContext = {
             ObjectId: (id) => id, // Return the string ID directly for better UI display
             NumberLong: (num) => parseInt(num), // Convert to regular number if possible
             NumberDecimal: (num) => parseFloat(num), // Convert to regular number if possible
             Date: (date) => new Date(date), // Return as JavaScript Date object
             ISODate: (date) => new Date(date), // Return as JavaScript Date object
             BinData: (type, data) => ({ $binary: { base64: data, subType: type } }),
             UUID: (uuid) => uuid, // Return UUID string directly
             Timestamp: (t, i) => ({ $timestamp: { t: t, i: i } }),
             MinKey: () => ({ $minKey: 1 }),
             MaxKey: () => ({ $maxKey: 1 }),
             RegExp: (pattern, options) => new RegExp(pattern, options) // Return as JavaScript RegExp
           };
          
          // Create a safe eval function
          const safeEval = (code) => {
            const func = new Function(...Object.keys(evalContext), `return ${code}`);
            return func(...Object.values(evalContext));
          };
          
          const jsResult = safeEval(cleanedOutput);
          return {
            success: true,
            result: jsResult,
            executionTime,
            type: 'script'
          };
        } catch (jsError) {
          // Both EJSON and JavaScript parsing failed - return raw output (already cleaned)
          return {
            success: true,
            result: { output: cleanedOutput },
            executionTime,
            type: 'script'
          };
        }
      }
    } else {
      // Query parsing - expect JSON between markers
      const resultMatch = output.match(new RegExp(`${commandId}_START\\s*([\\s\\S]*?)\\s*${commandId}_END`));
      
      if (!resultMatch) {
        // No result markers found - check for errors in the output
        if (this.hasErrorInOutput(output)) {
          const cleanedOutput = this.cleanShellOutput(output);
          return {
            success: false,
            error: 'Query execution failed',
            result: { output: cleanedOutput },
            rawOutput: output,
            type: 'error'
          };
        }
        
        return {
          success: false,
          error: 'No result markers found - query may have failed to execute',
          rawOutput: output
        };
      }

      const rawResult = resultMatch[1].trim();
      
      try {
        // Parse as JSON (ObjectIds and Dates are already in Extended JSON format)
        const resultData = JSON.parse(rawResult);
        
        return {
          success: resultData.success,
          result: resultData.result,
          error: resultData.error,
          errorType: resultData.errorType,
          stack: resultData.stack,
          executionTime: resultData.executionTime,
          type: 'query'
        };
      } catch (parseError) {
        // JSON parsing failed - check if this is actually an error message
        if (this.hasErrorInOutput(rawResult) || this.hasErrorInOutput(output)) {
          const cleanedOutput = this.cleanShellOutput(output);
          return {
            success: false,
            error: 'Query execution failed',
            result: { output: cleanedOutput },
            rawOutput: output,
            type: 'error'
          };
        }
        
        // If no error patterns found, treat as raw output but mark as potentially problematic (clean it since we have a query)
        const cleanedRawResult = this.cleanShellOutput(rawResult);
        return {
          success: true,
          result: { output: cleanedRawResult },
          executionTime: 0,
          type: 'raw',
          warning: 'Result could not be parsed as JSON - may indicate an error'
        };
      }
    }
  }

  /**
   * Check if output contains any error patterns
   */
  hasErrorInOutput(output) {
    // Common MongoDB error patterns - just check if they exist
    const errorPatterns = [
      /SyntaxError:/i,
      /Uncaught\s+SyntaxError:/i,
      /MongoServerError\[/i,
      /ReferenceError:/i,
      /Uncaught\s+ReferenceError:/i,
      /TypeError:/i,
      /Uncaught\s+TypeError:/i,
      /^[a-zA-Z0-9_]*>.*?Error/m,
      /Error:/i
    ];

    return errorPatterns.some(pattern => pattern.test(output));
  }

  /**
   * Clean shell output by removing noise patterns and database switching commands
   * Cleans each row (line) individually for more precise cleaning
   */
  cleanShellOutput(output) {
    if (!output || typeof output !== 'string') {
      return output;
    }

    // Split into lines and clean each row individually
    const lines = output.split('\n');
    const cleanedLines = lines.map(line => {
      let cleaned = line;

      // First, check if line should be completely removed (before any processing)
      
      // Remove lines that are just database prompts (e.g., "ecommerce>")
      if (/^[a-zA-Z0-9_-]+>\s*$/.test(cleaned.trim())) {
        return '';
      }
      
      // Remove lines that are database prompt followed only by dots (e.g., "ecommerce> ... ... ...")
      if (/^[a-zA-Z0-9_-]+>\s*\.\.\.(\s+\.\.\.)*\s*$/.test(cleaned.trim())) {
        return '';
      }
      
      // Remove lines that are just continuation dots (e.g., "... ... ... ...")
      if (/^(\s*\.\.\.\s*)+$/.test(cleaned.trim())) {
        return '';
      }

      // Now trim and process the line
      cleaned = cleaned.trim();

      // Remove the initial "use database;" command and its response
      if (/^use\s+[^;]+;\s*$/.test(cleaned)) {
        return '';
      }
      if (/^switched to db\s+\w+\s*$/.test(cleaned)) {
        return '';
      }
      if (/^already on db\s+\w+\s*$/.test(cleaned)) {
        return '';
      }

      // Remove displayBatchSize setting messages
      if (/^Setting "displayBatchSize" has been changed\s*$/.test(cleaned)) {
        return '';
      }
      cleaned = cleaned.replace(/^DBQuery\.shellBatchSize.*$/, '');

      // Remove "Invalid REPL keyword" messages
      if (/^Invalid REPL keyword\s*$/.test(cleaned)) {
        return '';
      }

      // Remove command markers (CMD_*_START, CMD_*_END, etc.)
      cleaned = cleaned.replace(/CMD_\d+_[a-z0-9]+_(START|END|COMPLETE|TIMING:\d+)/gi, '');

      // Remove shell prompts at the beginning of lines (enhanced patterns)
      // This must happen AFTER checking for prompt-only lines above
      cleaned = cleaned.replace(/^[a-zA-Z0-9_]*>\s*/, ''); // Basic prompts
      cleaned = cleaned.replace(/^[a-zA-Z0-9_]*:\w+>\s*/, ''); // Replica sets like rs0:PRIMARY>
      cleaned = cleaned.replace(/^[a-zA-Z0-9_-]+>\s*/, ''); // Database prompts with hyphens
      cleaned = cleaned.replace(/^[a-zA-Z0-9_-]+:\w+>\s*/, ''); // Complex replica set prompts
      
      // Remove Atlas MongoDB prompts (like "Atlas atlas-ghz29i-shard-0 [primary] ecommerce_copy>")
      cleaned = cleaned.replace(/^Atlas\s+[a-zA-Z0-9_-]+\s+\[[^\]]+\]\s+[a-zA-Z0-9_-]+>\s*/, '');
      
      // Remove any remaining complex prompts with brackets and spaces
      cleaned = cleaned.replace(/^[a-zA-Z0-9_-]+\s+[a-zA-Z0-9_-]+\s+\[[^\]]+\]\s+[a-zA-Z0-9_-]+>\s*/, '');

      // Remove continuation dots patterns more aggressively
      // Remove lines that are just dots or continuation patterns
      if (/^\s*\.+\s*$/.test(cleaned)) {
        return '';
      }
      if (/^\s*\.\.\.\s*$/.test(cleaned)) {
        return '';
      }
      
      // Remove continuation dots that appear at the start (like "... ... {")
      cleaned = cleaned.replace(/^(\s*\.\.\.\s*)+/, '');
      
      // Remove trailing dots from lines
      cleaned = cleaned.replace(/(\s*\.\.\.\s*)+$/, '');
      
      // Remove continuation dots in the middle of output (replace multiple ... patterns with space)
      cleaned = cleaned.replace(/(\s*\.\.\.\s*)+/g, ' ');

      // Remove MongoDB shell continuation prompts
      cleaned = cleaned.replace(/^\.\.\.>\s*/, ''); // Continuation with prompt

      // Remove MongoDB shell startup messages
      cleaned = cleaned.replace(/^MongoDB shell version.*$/, '');
      cleaned = cleaned.replace(/^connecting to:.*$/, '');
      cleaned = cleaned.replace(/^Implicit session:.*$/, '');
      cleaned = cleaned.replace(/^MongoDB server version:.*$/, '');
      
      // Remove mongosh startup messages
      cleaned = cleaned.replace(/^Using MongoDB:\s+.*$/, '');
      cleaned = cleaned.replace(/^Using Mongosh:\s+.*$/, '');
      cleaned = cleaned.replace(/^mongosh .* is available for download:.*$/, '');
      cleaned = cleaned.replace(/^For mongosh info see:.*$/, '');

      // Remove warning messages about deprecated features
      cleaned = cleaned.replace(/^Warning:.*$/, '');
      cleaned = cleaned.replace(/^DeprecationWarning:.*$/, '');

      // Remove lines that are just whitespace
      if (/^\s*$/.test(cleaned)) {
        return '';
      }

      return cleaned;
    }).filter(line => line !== ''); // Filter out empty lines

    // Join lines back together
    let cleaned = cleanedLines.join('\n');

    // Remove empty lines at the beginning and end
    cleaned = cleaned.replace(/^\s*\n+/, '');
    cleaned = cleaned.replace(/\n+\s*$/, '');

    // Remove multiple consecutive empty lines (reduce to max 2 newlines)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // Final cleanup - remove leading/trailing whitespace
    cleaned = cleaned.trim();

    // Debug log to see cleaning results (only if something changed)
    if (output !== cleaned && cleaned.length > 0) {
      console.log('🧹 [CLEAN] Removed shell noise from output');
    }

    return cleaned;
  }

  /**
   * Clean string values in result objects (recursively clean output properties)
   */
  cleanResultStrings(result) {
    if (typeof result === 'string') {
      return this.cleanShellOutput(result);
    }
    
    if (Array.isArray(result)) {
      return result.map(item => this.cleanResultStrings(item));
    }
    
    if (result && typeof result === 'object') {
      const cleaned = {};
      for (const [key, value] of Object.entries(result)) {
        if (key === 'output' && typeof value === 'string') {
          cleaned[key] = this.cleanShellOutput(value);
        } else {
          cleaned[key] = this.cleanResultStrings(value);
        }
      }
      return cleaned;
    }
    
    return result;
  }

  // ===== OUTPUT PROCESSING UTILITIES =====



  // ===== DEBUG AND UTILITY METHODS =====

  /**
   * Generate comprehensive debug information for shell operations
   */
  generateShellDebugInfo(context) {
    const {
      shellCommand,
      shellArgs,
      connectionString,
      databaseName,
      queryString,
      scriptContent,
      exitCode,
      output,
      errorOutput,
      operationType = 'query'
    } = context;

    const debugInfo = {
      timestamp: new Date().toISOString(),
      operationType,
      command: shellCommand,
      args: shellArgs ? shellArgs.map(arg => `"${arg}"`).join(', ') : 'N/A',
      connection: connectionString ? connectionString.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') : 'N/A',
      database: databaseName || 'N/A',
      query: queryString ? this.databaseConnection.sanitizeQueryForLogging(queryString) : 'N/A',
      scriptContent: scriptContent || 'N/A',
      exitCode: exitCode !== undefined ? exitCode : 'N/A',
      hasOutput: !!output,
      hasErrorOutput: !!errorOutput,
      outputLength: output ? output.length : 0,
      errorOutputLength: errorOutput ? errorOutput.length : 0
    };

    return debugInfo;
  }

  /**
   * Log comprehensive debug information for shell operations
   */
  logShellDebugInfo(debugInfo, logLevel = 'error') {
    const logFn = console[logLevel] || console.log;
    
    logFn(`🐚 MongoDB Shell Debug Information:`);
    logFn(`   Timestamp: ${debugInfo.timestamp}`);
    logFn(`   Operation: ${debugInfo.operationType}`);
    logFn(`   Command: ${debugInfo.command}`);
    if (debugInfo.args !== 'N/A') {
      logFn(`   Arguments: [${debugInfo.args}]`);
    }
    logFn(`   Connection: ${debugInfo.connection}`);
    logFn(`   Database: ${debugInfo.database}`);
    logFn(`   Query: ${debugInfo.query}`);
    if (debugInfo.exitCode !== 'N/A') {
      logFn(`   Exit Code: ${debugInfo.exitCode}`);
    }
    logFn(`   Output Length: ${debugInfo.outputLength} chars`);
    logFn(`   Error Output Length: ${debugInfo.errorOutputLength} chars`);
    
    if (debugInfo.scriptContent !== 'N/A') {
      logFn(`   Script Content:\n${debugInfo.scriptContent}`);
    }
  }

  // ===== STATUS AND MANAGEMENT =====

  /**
   * Get status of all shells
   */
  getShellStatus() {
    const shellStatus = {};
    
    for (const [shellId, shell] of this.shells) {
      shellStatus[shellId] = {
        conversationId: shell.conversationId,
        connectionId: shell.connectionId,
        isReady: shell.isReady,
        hasProcess: shell.process && !shell.process.killed,
        queueLength: shell.queryQueue.length,
        hasCurrentQuery: !!shell.currentQuery,
        shellCommand: shell.shellCommand,
        createdAt: shell.createdAt,
        lastActivity: shell.lastActivity,
        queryCount: shell.queryCount || 0,
        inactiveTime: Date.now() - shell.lastActivity
      };
    }
    
    const status = {
      totalShells: this.shells.size,
      maxShells: this.maxConcurrentShells,
      activeShells: Array.from(this.shells.keys()),
      shellDetails: shellStatus
    };
    
    console.log(`📊 [SHELL STATUS] ${status.totalShells}/${status.maxShells} shells active: [${status.activeShells.join(', ')}]`);
    return status;
  }

  /**
   * Check if a shell exists and is ready for a conversation
   */
  hasReadyShell(conversationId, connectionId) {
    const shellId = this.generateShellId(conversationId, connectionId);
    const shell = this.shells.get(shellId);
    return shell && shell.isReady && shell.process && !shell.process.killed;
  }

  /**
   * Get shell for a conversation (if it exists)
   */
  getShell(conversationId, connectionId) {
    const shellId = this.generateShellId(conversationId, connectionId);
    return this.shells.get(shellId);
  }

  /**
   * Get shell by shell ID
   */
  getShellById(shellId) {
    return this.shells.get(shellId);
  }

  /**
   * Cleanup all shells
   */
  async cleanup() {
    console.log(`🧹 [CLEANUP] Starting ShellManager cleanup (${this.shells.size} shells active)...`);
    
    // Stop cleanup timer
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Close all persistent shells
    for (const [shellId, shell] of this.shells) {
      try {
        console.log(`🔴 [CLEANUP] Closing shell: ${shellId}`);
        if (shell.process && !shell.process.killed) {
          // Try graceful exit first
          shell.process.stdin.write('exit\n');
          
          // Force kill after a short delay
          setTimeout(() => {
            if (shell.process && !shell.process.killed) {
              console.log(`🔪 [CLEANUP] Force killing shell process: ${shellId}`);
              shell.process.kill('SIGKILL');
            }
          }, 1000);
        }
      } catch (error) {
        console.warn(`⚠️ [CLEANUP] Warning closing shell ${shellId}:`, error.message);
      }
    }
    this.shells.clear();
    
    // Clear active operations
    this.activeOperations.clear();
    
    console.log('✅ [CLEANUP] ShellManager cleanup completed');
  }
}

module.exports = ShellManager;
