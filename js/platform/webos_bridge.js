/**
 * Wrapper around the webOS service API. When running inside a webOS
 * environment, `window.webOS.service.request` is used to call system
 * services. When unavailable (such as in a browser during
 * development), calls no‑op and log a warning.
 */
(function () {
  window.webosBridge = {
    call(service, method, params = {}, onSuccess = () => {}, onFailure = () => {}) {
      try {
        if (window.webOS && window.webOS.service && window.webOS.service.request) {
          window.webOS.service.request(service, {
            method: method,
            parameters: params,
            onSuccess: onSuccess,
            onFailure: onFailure,
          });
        } else {
          console.warn('webOS service unavailable: ', service, method);
          // Immediately call failure callback to preserve flow
          onFailure({ errorText: 'Service unavailable' });
        }
      } catch (e) {
        console.error('webOS service call error', e);
        onFailure(e);
      }
    },
  };
})();