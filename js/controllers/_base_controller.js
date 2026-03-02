/**
 * Base controller helpers for route lifecycle management.
 * Controllers in this app are simple objects that expose:
 *   - mount(context)
 *   - unmount(context)
 *
 * This file provides a tiny logger factory and safe invocation helpers.
 * IMPORTANT: No business logic should live here.
 */
(function () {
  function createLogger(tag) {
    return {
      info: function () { console.log.apply(console, [tag].concat(Array.from(arguments))); },
      warn: function () { console.warn.apply(console, [tag].concat(Array.from(arguments))); },
      error: function () { console.error.apply(console, [tag].concat(Array.from(arguments))); },
    };
  }

  /**
   * Safely invoke a lifecycle function. If it returns a Promise, log on
   * resolve/reject. Always logs success/failure (no silent failures).
   */
  function safeInvoke(tag, stepName, fn) {
    try {
      var result = fn();
      if (result && typeof result.then === 'function') {
        return result
          .then(function (val) {
            console.log(tag, stepName, 'SUCCESS');
            return val;
          })
          .catch(function (err) {
            console.error(tag, stepName, 'FAIL', err);
            throw err;
          });
      }
      console.log(tag, stepName, 'SUCCESS');
      return Promise.resolve(result);
    } catch (err) {
      console.error(tag, stepName, 'FAIL', err);
      return Promise.reject(err);
    }
  }

  window.ControllerBase = {
    createLogger: createLogger,
    safeInvoke: safeInvoke,
  };
})();