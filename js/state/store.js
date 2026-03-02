/**
 * Simple reactive store implementation. It exposes a `state` object
 * where application properties can be mutated and a subscription API
 * for other modules to react to changes. This mimics a very small
 * portion of Android's shared state held in the `Application` class.
 */
(function () {
  const listeners = [];
  const state = {};

  function notify() {
    listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (e) {
        console.error('store notify error', e);
      }
    });
  }

  window.store = {
    /** Get a value from the store. */
    get(key) {
      return state[key];
    },
    /** Set a value and notify subscribers. */
    set(key, value) {
      state[key] = value;
      notify();
    },
    /** Subscribe to state changes. */
    subscribe(fn) {
      if (typeof fn === 'function') {
        listeners.push(fn);
      }
    },
    /** Retrieve the raw state object (read only). */
    getState() {
      return Object.assign({}, state);
    },
  };
})();