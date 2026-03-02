/**
 * Controller registry mapping routes to controller objects.
 * Controllers are loaded as global modules (no ES module dependency).
 */
(function () {
  var controllers = {
    '/splash': window.splashController,
    '/login': window.loginController,
    '/home': window.homeController,
    '/settings': window.settingsController,
    '/player': window.playerController,
  };

  function getController(route) {
    return controllers[route] || null;
  }

  window.controllerRegistry = {
    controllers: controllers,
    getController: getController,
  };
})();