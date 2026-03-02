/**
 * MyWorker provides a lightweight job scheduling wrapper.
 * Mirrors Android's WorkManager periodic work concept.
 *
 * Java reference: MyWorker.java (WorkManager periodic work every 16 minutes)
 *
 * Provides:
 *   - runJob: Schedule a recurring job with optional backoff
 *   - runOnce: Schedule a one-time delayed job
 *   - cancelJob: Cancel a scheduled job
 */
(function () {
  var TAG = '[MyWorker]';

  // Active jobs registry
  var jobs = {};

  // Job ID counter
  var jobIdCounter = 0;

  // Default settings
  var DEFAULT_INTERVAL_MS = 16 * 60 * 1000; // 16 minutes (WorkManager minimum)
  var DEFAULT_INITIAL_DELAY_MS = 5000;
  var MAX_BACKOFF_MS = 30 * 60 * 1000; // 30 minutes max backoff

  /**
   * Schedule a recurring job.
   * @param {string} name Unique job name
   * @param {function} fn Job function to execute (can be async)
   * @param {number} intervalMs Interval between executions (default: 16 minutes)
   * @param {Object} options Additional options
   * @param {number} options.initialDelay Initial delay before first execution
   * @param {boolean} options.useBackoff Enable exponential backoff on failure
   * @param {number} options.maxRetries Maximum retries per execution (default: 3)
   * @returns {string} Job ID
   */
  function runJob(name, fn, intervalMs, options) {
    options = options || {};
    intervalMs = intervalMs || DEFAULT_INTERVAL_MS;
    var initialDelay = options.initialDelay !== undefined ? options.initialDelay : DEFAULT_INITIAL_DELAY_MS;
    var useBackoff = options.useBackoff !== undefined ? options.useBackoff : true;
    var maxRetries = options.maxRetries || 3;

    // Cancel existing job with same name
    if (jobs[name]) {
      console.log(TAG, 'Replacing existing job:', name);
      cancelJob(name);
    }

    var jobId = 'job_' + (++jobIdCounter);
    var retryCount = 0;
    var currentBackoff = intervalMs;

    console.log(TAG, 'Scheduling job:', name, 'interval:', intervalMs, 'ms');

    var job = {
      id: jobId,
      name: name,
      fn: fn,
      intervalMs: intervalMs,
      useBackoff: useBackoff,
      maxRetries: maxRetries,
      isRunning: false,
      lastRunAt: null,
      lastError: null,
      runCount: 0,
      timerId: null
    };

    /**
     * Execute the job function with error handling.
     */
    async function executeJob() {
      if (job.isRunning) {
        console.log(TAG, 'Job already running, skipping:', name);
        return;
      }

      job.isRunning = true;
      job.lastRunAt = Date.now();
      job.runCount++;

      console.log(TAG, 'Executing job:', name, 'run #' + job.runCount);

      try {
        var result = fn();
        if (result && typeof result.then === 'function') {
          await result;
        }
        console.log(TAG, 'Job completed:', name);
        job.lastError = null;
        retryCount = 0;
        currentBackoff = intervalMs;
      } catch (err) {
        console.error(TAG, 'Job failed:', name, err);
        job.lastError = err;
        retryCount++;

        if (useBackoff && retryCount <= maxRetries) {
          currentBackoff = Math.min(currentBackoff * 2, MAX_BACKOFF_MS);
          console.log(TAG, 'Backoff retry in', currentBackoff, 'ms');
        }
      } finally {
        job.isRunning = false;
      }

      // Schedule next execution
      scheduleNext();
    }

    /**
     * Schedule the next execution.
     */
    function scheduleNext() {
      if (job.timerId) {
        clearTimeout(job.timerId);
      }

      var delay = useBackoff && retryCount > 0 ? currentBackoff : intervalMs;
      job.timerId = setTimeout(executeJob, delay);
    }

    // Store job
    jobs[name] = job;

    // Schedule first execution
    if (initialDelay > 0) {
      job.timerId = setTimeout(executeJob, initialDelay);
    } else {
      executeJob();
    }

    return jobId;
  }

  /**
   * Schedule a one-time delayed job.
   * @param {string} name Unique job name
   * @param {function} fn Job function to execute
   * @param {number} delayMs Delay before execution
   * @returns {string} Job ID
   */
  function runOnce(name, fn, delayMs) {
    delayMs = delayMs || 0;

    // Cancel existing job with same name
    if (jobs[name]) {
      cancelJob(name);
    }

    var jobId = 'job_' + (++jobIdCounter);

    console.log(TAG, 'Scheduling one-time job:', name, 'delay:', delayMs, 'ms');

    var job = {
      id: jobId,
      name: name,
      fn: fn,
      oneTime: true,
      isRunning: false,
      lastRunAt: null,
      lastError: null,
      timerId: null
    };

    job.timerId = setTimeout(async function () {
      job.isRunning = true;
      job.lastRunAt = Date.now();

      console.log(TAG, 'Executing one-time job:', name);

      try {
        var result = fn();
        if (result && typeof result.then === 'function') {
          await result;
        }
        console.log(TAG, 'One-time job completed:', name);
      } catch (err) {
        console.error(TAG, 'One-time job failed:', name, err);
        job.lastError = err;
      } finally {
        job.isRunning = false;
        // Clean up after one-time job
        delete jobs[name];
      }
    }, delayMs);

    jobs[name] = job;
    return jobId;
  }

  /**
   * Cancel a scheduled job.
   * @param {string} name Job name to cancel
   * @returns {boolean} True if job was found and cancelled
   */
  function cancelJob(name) {
    var job = jobs[name];
    if (!job) {
      console.log(TAG, 'Job not found:', name);
      return false;
    }

    console.log(TAG, 'Cancelling job:', name);

    if (job.timerId) {
      clearTimeout(job.timerId);
    }

    delete jobs[name];
    return true;
  }

  /**
   * Cancel all scheduled jobs.
   */
  function cancelAllJobs() {
    console.log(TAG, 'Cancelling all jobs');
    Object.keys(jobs).forEach(function (name) {
      cancelJob(name);
    });
  }

  /**
   * Get job status.
   * @param {string} name Job name
   * @returns {Object|null} Job status or null if not found
   */
  function getJobStatus(name) {
    var job = jobs[name];
    if (!job) return null;

    return {
      id: job.id,
      name: job.name,
      isRunning: job.isRunning,
      lastRunAt: job.lastRunAt,
      lastError: job.lastError ? job.lastError.message : null,
      runCount: job.runCount || 0,
      oneTime: !!job.oneTime
    };
  }

  /**
   * List all active jobs.
   * @returns {Object[]} Array of job statuses
   */
  function listJobs() {
    return Object.keys(jobs).map(function (name) {
      return getJobStatus(name);
    });
  }

  // Expose globally
  window.MyWorker = {
    runJob: runJob,
    runOnce: runOnce,
    cancelJob: cancelJob,
    cancelAllJobs: cancelAllJobs,
    getJobStatus: getJobStatus,
    listJobs: listJobs
  };
})();
