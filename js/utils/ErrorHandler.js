/**
 * ErrorHandler - Centralized user-friendly error handling
 *
 * Inspired by the Java error patterns described in JAVA_ANALYSIS_DOCUMENT.md:
 * - Network timeouts
 * - HTTP errors (401/403/500)
 * - Offline state awareness
 *
 * The goal is to provide consistent messages without breaking existing flows.
 */
(function () {
  'use strict';

  const TAG = '[ERROR_HANDLER]';

  function buildMessage(err) {
    const msg = (err && err.message) ? String(err.message) : '';
    if (!navigator.onLine) {
      return { title: 'Connection Error', message: 'You are offline. Please check your internet connection.', retry: true, action: 'offline' };
    }
    if (msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('aborted')) {
      return { title: 'Connection Error', message: 'Request timed out. Please check your connection and try again.', retry: true, action: 'timeout' };
    }
    if (msg.includes('HTTP 401') || msg.includes('401')) {
      return { title: 'Authentication', message: 'Authentication failed. Please log in again.', retry: false, action: 'auth' };
    }
    if (msg.includes('HTTP 403') || msg.includes('403')) {
      return { title: 'Access Denied', message: 'Access denied. Please check your subscription.', retry: false, action: 'forbidden' };
    }
    if (msg.includes('HTTP 5') || msg.includes('500') || msg.includes('502') || msg.includes('503')) {
      return { title: 'Server Error', message: 'Server error. Please try again later.', retry: true, action: 'server' };
    }
    return { title: 'Error', message: msg || 'Something went wrong. Please try again.', retry: false, action: 'generic' };
  }

  function clearCredentialsIfNeeded(action) {
    if (action !== 'auth') return;
    try {
      if (window.SecurityManager && typeof SecurityManager.setSecureItem === 'function') {
        SecurityManager.setSecureItem('token_no', '');
      }
    } catch (e) {
      // ignore
    }
    try {
      if (window.prefs && typeof prefs.setString === 'function') {
        prefs.setString('token_no', '');
        prefs.setString('login', '');
      }
    } catch (e) {
      // ignore
    }
  }

  /**
   * Handle an error with optional retry callback.
   * @param {any} err
   * @param {string} context
   * @param {Function=} retryFn
   */
  function handle(err, context, retryFn) {
    try {
      console.error(TAG, 'Error in', context || '(unknown)', err);
      const info = buildMessage(err);
      clearCredentialsIfNeeded(info.action);

      if (window.AlertDialog && window.AlertDialog.Builder) {
        const builder = new AlertDialog.Builder()
          .setTitle(info.title)
          .setMessage(info.message)
          .setCancelable(true);

        if (info.retry && typeof retryFn === 'function') {
          builder.setPositiveButton('Retry', function () {
            setTimeout(retryFn, 750);
          });
          builder.setNegativeButton('OK', null);
        } else {
          builder.setPositiveButton('OK', null);
        }
        builder.show();
      } else if (window.DialogManager && typeof DialogManager.showAlert === 'function') {
        DialogManager.showAlert({
          title: info.title,
          message: info.message,
          buttons: [{ text: 'OK', action: 'positive' }],
          cancelable: true
        });
      } else {
        // last resort
        alert(info.title + '\n\n' + info.message);
      }
      return info;
    } catch (e) {
      console.error(TAG, 'handle failed', e);
      return { title: 'Error', message: 'Something went wrong.', retry: false, action: 'generic' };
    }
  }

  window.ErrorHandler = { handle };
})();
