/**
 * DialogManager - Android-style modal dialog system
 * Provides AlertDialog, ProgressDialog, and Toast equivalents
 * Matches Java Android dialog functionality and behavior
 */
(function() {
    'use strict';
    
    var TAG = '[DIALOG_MANAGER]';
    var log = (window.ControllerBase && window.ControllerBase.createLogger)
        ? window.ControllerBase.createLogger(TAG)
        : { info: console.log.bind(console, TAG), warn: console.warn.bind(console, TAG), error: console.error.bind(console, TAG) };
    
    // Dialog queue and state management
    var dialogQueue = [];
    var activeDialog = null;
    var dialogContainer = null;
    var toastContainer = null;
    
    // Dialog types
    var DIALOG_TYPES = {
        ALERT: 'alert',
        PROGRESS: 'progress',
        TOAST: 'toast',
        ROTATION: 'rotation',
        SUBSCRIPTION: 'subscription',
        PERMISSION: 'permission'
    };
    
    /**
     * Initialize dialog system
     */
    function initialize() {
        try {
            createDialogContainer();
            createToastContainer();
            log.info('DialogManager initialized');
        } catch (err) {
            log.error('Failed to initialize DialogManager:', err);
        }
    }
    
    /**
     * Create main dialog container
     */
    function createDialogContainer() {
        if (dialogContainer) return;
        
        dialogContainer = document.createElement('div');
        dialogContainer.id = 'dialog-container';
        dialogContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 9999;
            pointer-events: none;
            display: none;
        `;
        document.body.appendChild(dialogContainer);
    }
    
    /**
     * Create toast container
     */
    function createToastContainer() {
        if (toastContainer) return;
        
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.cssText = `
            position: fixed;
            top: 10%;
            left: 50%;
            transform: translateX(-50%);
            z-index: 10000;
            pointer-events: none;
        `;
        document.body.appendChild(toastContainer);
    }
    
    /**
     * Show AlertDialog - equivalent to Android AlertDialog.Builder
     * @param {Object} options Dialog options
     * @param {string} options.title Dialog title
     * @param {string} options.message Dialog message
     * @param {Array} options.buttons Button configurations
     * @param {boolean} options.cancelable Whether dialog is cancelable
     * @param {Function} options.onDismiss Callback when dialog is dismissed
     */
    function showAlert(options) {
        try {
            var config = Object.assign({
                title: '',
                message: '',
                buttons: [{ text: 'OK', action: 'positive' }],
                cancelable: true,
                onDismiss: null
            }, options || {});
            
            var dialog = createAlertDialog(config);
            showDialog(dialog);
            
            return dialog;
        } catch (err) {
            log.error('Failed to show alert:', err);
            // Fallback to native alert
            window.alert((config.title ? config.title + '\n' : '') + config.message);
        }
    }
    
    /**
     * Create AlertDialog DOM element
     */
    function createAlertDialog(config) {
        var dialogOverlay = document.createElement('div');
        dialogOverlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: auto;
        `;
        
        var dialogBox = document.createElement('div');
        dialogBox.style.cssText = `
            background: white;
            border-radius: 8px;
            padding: 20px;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            animation: dialogSlideIn 0.3s ease-out;
        `;
        
        // Title
        if (config.title) {
            var titleEl = document.createElement('h3');
            titleEl.textContent = config.title;
            titleEl.style.cssText = `
                margin: 0 0 15px 0;
                color: #333;
                font-size: 18px;
                font-weight: 500;
            `;
            dialogBox.appendChild(titleEl);
        }
        
        // Message
        if (config.message) {
            var messageEl = document.createElement('p');
            messageEl.textContent = config.message;
            messageEl.style.cssText = `
                margin: 0 0 20px 0;
                color: #666;
                font-size: 14px;
                line-height: 1.4;
                white-space: pre-wrap;
            `;
            dialogBox.appendChild(messageEl);
        }
        
        // Buttons
        var buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 20px;
        `;
        
        config.buttons.forEach(function(button, index) {
            var buttonEl = document.createElement('button');
            buttonEl.textContent = button.text;
            buttonEl.style.cssText = `
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                background: ${button.action === 'positive' ? '#2196F3' : '#757575'};
                color: white;
                transition: background-color 0.2s;
            `;
            
            buttonEl.addEventListener('click', function() {
                if (button.onClick) {
                    button.onClick();
                }
                dismissDialog(dialogOverlay);
            });
            
            buttonEl.addEventListener('mouseenter', function() {
                this.style.backgroundColor = button.action === 'positive' ? '#1976D2' : '#616161';
            });
            
            buttonEl.addEventListener('mouseleave', function() {
                this.style.backgroundColor = button.action === 'positive' ? '#2196F3' : '#757575';
            });
            
            buttonContainer.appendChild(buttonEl);
        });
        
        dialogBox.appendChild(buttonContainer);
        dialogOverlay.appendChild(dialogBox);
        
        // Handle cancelable backdrop click
        if (config.cancelable) {
            dialogOverlay.addEventListener('click', function(e) {
                if (e.target === dialogOverlay) {
                    dismissDialog(dialogOverlay);
                }
            });
        }
        
        // Store dialog data
        dialogOverlay._type = DIALOG_TYPES.ALERT;
        dialogOverlay._config = config;
        dialogOverlay._onDismiss = config.onDismiss;
        
        return dialogOverlay;
    }
    
    /**
     * Show ProgressDialog - equivalent to Android ProgressDialog
     * @param {Object} options Progress dialog options
     * @param {string} options.title Progress dialog title
     * @param {string} options.message Progress dialog message
     * @param {boolean} options.cancelable Whether dialog is cancelable
     * @param {Function} options.onCancel Callback when cancelled
     * @param {boolean} options.indeterminate Whether progress is indeterminate
     * @param {number} options.max Maximum progress value
     * @param {number} options.progress Current progress value
     */
    function showProgress(options) {
        try {
            var config = Object.assign({
                title: 'Loading...',
                message: 'Please wait',
                cancelable: false,
                onCancel: null,
                indeterminate: true,
                max: 100,
                progress: 0
            }, options || {});
            
            var dialog = createProgressDialog(config);
            showDialog(dialog);
            
            return dialog;
        } catch (err) {
            log.error('Failed to show progress dialog:', err);
        }
    }
    
    /**
     * Update progress dialog
     * @param {HTMLElement} dialog Progress dialog element
     * @param {Object} updates Progress updates
     */
    function updateProgress(dialog, updates) {
        try {
            if (!dialog || !dialog._config) return;
            
            if (updates.message !== undefined) {
                var messageEl = dialog.querySelector('.progress-message');
                if (messageEl) {
                    messageEl.textContent = updates.message;
                }
            }
            
            if (updates.progress !== undefined && !dialog._config.indeterminate) {
                var progressBar = dialog.querySelector('.progress-bar-fill');
                var progressText = dialog.querySelector('.progress-text');
                if (progressBar) {
                    progressBar.style.width = updates.progress + '%';
                }
                if (progressText) {
                    progressText.textContent = Math.round(updates.progress) + '%';
                }
            }
        } catch (err) {
            log.error('Failed to update progress dialog:', err);
        }
    }
    
    /**
     * Create ProgressDialog DOM element
     */
    function createProgressDialog(config) {
        var dialogOverlay = document.createElement('div');
        dialogOverlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: auto;
        `;
        
        var dialogBox = document.createElement('div');
        dialogBox.style.cssText = `
            background: white;
            border-radius: 8px;
            padding: 30px;
            text-align: center;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            animation: dialogSlideIn 0.3s ease-out;
            min-width: 280px;
        `;
        
        // Progress indicator
        var progressContainer = document.createElement('div');
        progressContainer.style.cssText = `
            margin: 0 auto 20px auto;
        `;
        
        if (config.indeterminate) {
            // Indeterminate progress (spinning)
            var progressIndicator = document.createElement('div');
            progressIndicator.style.cssText = `
                width: 40px;
                height: 40px;
                border: 3px solid #f3f3f3;
                border-top: 3px solid #2196F3;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            `;
            progressContainer.appendChild(progressIndicator);
        } else {
            // Determinate progress (progress bar)
            var progressBar = document.createElement('div');
            progressBar.style.cssText = `
                width: 200px;
                height: 6px;
                background: #f0f0f0;
                border-radius: 3px;
                overflow: hidden;
                margin: 0 auto 10px auto;
            `;
            
            var progressBarFill = document.createElement('div');
            progressBarFill.className = 'progress-bar-fill';
            progressBarFill.style.cssText = `
                height: 100%;
                background: #2196F3;
                width: ${config.progress || 0}%;
                transition: width 0.3s ease;
            `;
            
            progressBar.appendChild(progressBarFill);
            progressContainer.appendChild(progressBar);
            
            // Progress text
            var progressText = document.createElement('div');
            progressText.className = 'progress-text';
            progressText.style.cssText = `
                font-size: 12px;
                color: #666;
                margin-top: 5px;
            `;
            progressText.textContent = Math.round(config.progress || 0) + '%';
            progressContainer.appendChild(progressText);
        }
        
        // Title
        var titleEl = document.createElement('h3');
        titleEl.textContent = config.title;
        titleEl.style.cssText = `
            margin: 0 0 10px 0;
            color: #333;
            font-size: 16px;
            font-weight: 500;
        `;
        
        // Message
        var messageEl = document.createElement('p');
        messageEl.className = 'progress-message';
        messageEl.textContent = config.message;
        messageEl.style.cssText = `
            margin: 0;
            color: #666;
            font-size: 14px;
        `;
        
        dialogBox.appendChild(progressContainer);
        dialogBox.appendChild(titleEl);
        dialogBox.appendChild(messageEl);
        dialogOverlay.appendChild(dialogBox);
        
        // Handle cancelable
        if (config.cancelable) {
            dialogOverlay.addEventListener('click', function(e) {
                if (e.target === dialogOverlay) {
                    if (config.onCancel) config.onCancel();
                    dismissDialog(dialogOverlay);
                }
            });
        }
        
        dialogOverlay._type = DIALOG_TYPES.PROGRESS;
        dialogOverlay._config = config;
        
        return dialogOverlay;
    }
    
    /**
     * Show Toast - equivalent to Android Toast
     * @param {string} message Toast message
     * @param {number} duration Duration in milliseconds (2000 for SHORT, 3500 for LONG)
     */
    function showToast(message, duration) {
        try {
            var toastDuration = duration || 2000;
            
            var toast = document.createElement('div');
            toast.style.cssText = `
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 12px 20px;
                border-radius: 4px;
                font-size: 14px;
                max-width: 300px;
                text-align: center;
                animation: toastSlideIn 0.3s ease-out;
                margin-bottom: 10px;
            `;
            toast.textContent = message;
            
            toastContainer.appendChild(toast);
            
            // Auto dismiss
            setTimeout(function() {
                toast.style.animation = 'toastSlideOut 0.3s ease-in';
                setTimeout(function() {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 300);
            }, toastDuration);
            
        } catch (err) {
            log.error('Failed to show toast:', err);
            // Fallback to console
            console.log('TOAST: ' + message);
        }
    }
    
    /**
     * Show dialog with queue management
     */
    function showDialog(dialog) {
        if (activeDialog) {
            dialogQueue.push(dialog);
            return;
        }
        
        activeDialog = dialog;
        dialogContainer.style.display = 'block';
        dialogContainer.appendChild(dialog);
    }
    
    /**
     * Dismiss current dialog and show next in queue
     */
    function dismissDialog(dialog) {
        if (!dialog || dialog !== activeDialog) return;
        
        dialog.style.animation = 'dialogSlideOut 0.3s ease-in';
        
        setTimeout(function() {
            if (dialog.parentNode) {
                dialog.parentNode.removeChild(dialog);
            }
            
            if (dialog._onDismiss) {
                dialog._onDismiss();
            }
            
            activeDialog = null;
            
            // Show next dialog in queue
            if (dialogQueue.length > 0) {
                var nextDialog = dialogQueue.shift();
                showDialog(nextDialog);
            } else {
                dialogContainer.style.display = 'none';
            }
        }, 300);
    }
    
    /**
     * Dismiss all dialogs
     */
    function dismissAll() {
        if (activeDialog) {
            dismissDialog(activeDialog);
        }
        
        dialogQueue.forEach(function(dialog) {
            if (dialog.parentNode) {
                dialog.parentNode.removeChild(dialog);
            }
        });
        
        dialogQueue = [];
        dialogContainer.style.display = 'none';
    }
    
    /**
     * Add CSS animations
     */
    function addAnimations() {
        var style = document.createElement('style');
        style.textContent = `
            @keyframes dialogSlideIn {
                from {
                    opacity: 0;
                    transform: scale(0.9) translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: scale(1) translateY(0);
                }
            }
            
            @keyframes dialogSlideOut {
                from {
                    opacity: 1;
                    transform: scale(1) translateY(0);
                }
                to {
                    opacity: 0;
                    transform: scale(0.9) translateY(-20px);
                }
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            @keyframes toastSlideIn {
                from {
                    opacity: 0;
                    transform: translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            @keyframes toastSlideOut {
                from {
                    opacity: 1;
                    transform: translateY(0);
                }
                to {
                    opacity: 0;
                    transform: translateY(-20px);
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Initialize on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initialize();
            addAnimations();
        });
    } else {
        initialize();
        addAnimations();
    }
    
    /**
     * Show subscription renewal dialog
     * @param {number} daysLeft Number of days left until renewal
     * @param {Function} onDismiss Callback when dialog is dismissed
     */
    function showSubscriptionDialog(daysLeft, onDismiss) {
        try {
            var config = {};
            
            if (daysLeft >= 2 && daysLeft <= 7) {
                // 2-7 days left warning
                config = {
                    title: 'Subscription Renewal',
                    message: daysLeft + ' days left to renewal of subscription. Pay immediately to keep your Music Online.',
                    buttons: [{ text: 'OK', action: 'positive' }],
                    cancelable: false,
                    onDismiss: onDismiss
                };
            } else if (daysLeft === 1) {
                // 1 day left warning
                config = {
                    title: 'Subscription Renewal',
                    message: '1 day left to renewal of subscription. Pay immediately to keep your Music Online.',
                    buttons: [{ text: 'OK', action: 'positive' }],
                    cancelable: false,
                    onDismiss: onDismiss
                };
            } else if (daysLeft < 0) {
                // Expired subscription
                config = {
                    title: 'Subscription Expired',
                    message: 'Your subscription has expired. Please renew to continue using the service.',
                    buttons: [{ text: 'OK', action: 'positive' }],
                    cancelable: false,
                    onDismiss: onDismiss
                };
            } else {
                // No dialog needed
                if (onDismiss) onDismiss();
                return;
            }
            
            var dialog = createAlertDialog(config);
            showDialog(dialog);
            
            return dialog;
        } catch (err) {
            log.error('Failed to show subscription dialog:', err);
            if (onDismiss) onDismiss();
        }
    }
    
    /**
     * Show rotation selection dialog
     * @param {string} currentRotation Current rotation value
     * @param {Function} onRotationSelected Callback when rotation is selected
     */
    function showRotationDialog(currentRotation, onRotationSelected) {
        try {
            var dialogOverlay = document.createElement('div');
            dialogOverlay.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                pointer-events: auto;
            `;
            
            var dialogBox = document.createElement('div');
            dialogBox.style.cssText = `
                background: white;
                border-radius: 8px;
                padding: 20px;
                max-width: 400px;
                width: 90%;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                animation: dialogSlideIn 0.3s ease-out;
            `;
            
            // Title
            var titleEl = document.createElement('h3');
            titleEl.textContent = 'Select Rotation';
            titleEl.style.cssText = `
                margin: 0 0 20px 0;
                color: #333;
                font-size: 18px;
                font-weight: 500;
                text-align: center;
            `;
            
            // Radio group
            var radioGroup = document.createElement('div');
            radioGroup.style.cssText = `
                margin-bottom: 20px;
            `;
            
            var rotations = [
                { value: '0', label: '0 (Landscape Normal)' },
                { value: '90', label: '90 (Portrait Right)' },
                { value: '180', label: '180 (Inverse Landscape)' },
                { value: '270', label: '270 (Portrait Left)' }
            ];
            
            var selectedRotation = currentRotation || '0';
            
            rotations.forEach(function(rotation) {
                var radioContainer = document.createElement('div');
                radioContainer.style.cssText = `
                    margin-bottom: 10px;
                    display: flex;
                    align-items: center;
                `;
                
                var radioInput = document.createElement('input');
                radioInput.type = 'radio';
                radioInput.name = 'rotation';
                radioInput.value = rotation.value;
                radioInput.checked = rotation.value === selectedRotation;
                radioInput.style.cssText = `
                    margin-right: 10px;
                `;
                
                var label = document.createElement('label');
                label.textContent = rotation.label;
                label.style.cssText = `
                    cursor: pointer;
                    color: #333;
                `;
                
                radioContainer.appendChild(radioInput);
                radioContainer.appendChild(label);
                radioGroup.appendChild(radioContainer);
            });
            
            // Buttons
            var buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = `
                display: flex;
                justify-content: flex-end;
                gap: 10px;
            `;
            
            var saveBtn = document.createElement('button');
            saveBtn.textContent = 'Save';
            saveBtn.style.cssText = `
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                background: #2196F3;
                color: white;
            `;
            
            var cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.cssText = `
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                background: #757575;
                color: white;
            `;
            
            saveBtn.addEventListener('click', function() {
                var selectedRadio = radioGroup.querySelector('input[name="rotation"]:checked');
                if (selectedRadio && onRotationSelected) {
                    onRotationSelected(selectedRadio.value);
                }
                dismissDialog(dialogOverlay);
            });
            
            cancelBtn.addEventListener('click', function() {
                dismissDialog(dialogOverlay);
            });
            
            buttonContainer.appendChild(cancelBtn);
            buttonContainer.appendChild(saveBtn);
            
            dialogBox.appendChild(titleEl);
            dialogBox.appendChild(radioGroup);
            dialogBox.appendChild(buttonContainer);
            dialogOverlay.appendChild(dialogBox);
            
            dialogOverlay._type = DIALOG_TYPES.ROTATION;
            
            showDialog(dialogOverlay);
            return dialogOverlay;
        } catch (err) {
            log.error('Failed to show rotation dialog:', err);
        }
    }
    
    /**
     * Show permission request dialog matching Android behavior
     * @param {string} permission Permission type
     * @param {string} rationale Permission rationale message
     * @param {Function} onPermissionGranted Callback when permission is granted
     * @param {Function} onPermissionDenied Callback when permission is denied
     * @param {Function} onPermissionPermanentlyDenied Callback when permission is permanently denied
     */
    function requestPermission(permission, rationale, onPermissionGranted, onPermissionDenied, onPermissionPermanentlyDenied) {
        try {
            // Check if permission is already granted
            if (checkPermission(permission)) {
              if (onPermissionGranted) onPermissionGranted();
              return;
            }
            
            // Show permission request dialog
            var config = {
              title: 'Permission Required',
              message: rationale || 'This app needs ' + permission + ' permission to continue.',
              buttons: [
                { 
                  text: 'Allow', 
                  action: 'positive',
                  onClick: function() {
                    // Grant permission and save state
                    grantPermission(permission);
                    if (onPermissionGranted) onPermissionGranted();
                    dismissDialog(activeDialog);
                  }
                },
                { 
                  text: 'Deny', 
                  action: 'negative',
                  onClick: function() {
                    // Deny permission
                    if (onPermissionDenied) onPermissionDenied();
                    dismissDialog(activeDialog);
                  }
                }
              ],
              cancelable: false
            };
            
            var dialog = createAlertDialog(config);
            showDialog(dialog);
            
        } catch (err) {
            log.error('Failed to request permission:', err);
            if (onPermissionDenied) onPermissionDenied();
        }
    }
    
    /**
    /**
     * Check if permission is granted
     * @param {string} permission Permission to check
     * @returns {boolean} Whether permission is granted
     */
    function checkPermission(permission) {
      try {
        // Map permission names to stored values
        var permissionMap = {
          'SYSTEM_ALERT_WINDOW': 'overlay_permission',
          'WRITE_EXTERNAL_STORAGE': 'storage_permission',
          'READ_EXTERNAL_STORAGE': 'storage_permission',
          'ACCESS_FINE_LOCATION': 'location_permission',
          'ACCESS_COARSE_LOCATION': 'location_permission'
        };
        
        var storageKey = permissionMap[permission] || permission.toLowerCase();
        var grantedValue = prefs.getString(storageKey, '');
        return grantedValue === 'granted';
      } catch (err) {
        log.error('Failed to check permission:', err);
        return false;
      }
    }
    
    /**
     * Grant permission and save state
     * @param {string} permission Permission to grant
     */
    function grantPermission(permission) {
      try {
        // Map permission names to storage keys
        var permissionMap = {
          'SYSTEM_ALERT_WINDOW': 'overlay_permission',
          'WRITE_EXTERNAL_STORAGE': 'storage_permission',
          'READ_EXTERNAL_STORAGE': 'storage_permission',
          'ACCESS_FINE_LOCATION': 'location_permission',
          'ACCESS_COARSE_LOCATION': 'location_permission'
        };
        
        var storageKey = permissionMap[permission] || permission.toLowerCase();
        prefs.setString(storageKey, 'granted');
        log.info('Permission granted:', permission);
      } catch (err) {
        log.error('Failed to grant permission:', err);
      }
    }
    
    /**
     * Check multiple permissions
     * @param {Array} permissions Array of permissions to check
     * @returns {Array} Array of missing permissions
     */
    function checkPermissions(permissions) {
      try {
        var missing = [];
        permissions.forEach(function(permission) {
          if (!checkPermission(permission)) {
            missing.push(permission);
          }
        });
        return missing;
      } catch (err) {
        log.error('Failed to check permissions:', err);
        return permissions || [];
      }
    };
    
    // Public API
    window.DialogManager = {
        showAlert: showAlert,
        showProgress: showProgress,
        updateProgress: updateProgress,
        showToast: showToast,
        showSubscriptionDialog: showSubscriptionDialog,
        showRotationDialog: showRotationDialog,
        requestPermission: requestPermission,
        checkPermission: checkPermission,
        checkPermissions: checkPermissions,
        dismissAll: dismissAll,
        DIALOG_TYPES: DIALOG_TYPES
    };
    
    // Convenience methods matching Android
    window.AlertDialog = {
        Builder: function() {
            return {
                setTitle: function(title) {
                    this._title = title;
                    return this;
                },
                setMessage: function(message) {
                    this._message = message;
                    return this;
                },
                setPositiveButton: function(text, onClick) {
                    this._positiveButton = { text: text, onClick: onClick };
                    return this;
                },
                setNegativeButton: function(text, onClick) {
                    this._negativeButton = { text: text, onClick: onClick };
                    return this;
                },
                setCancelable: function(cancelable) {
                    this._cancelable = cancelable;
                    return this;
                },
                setOnDismissListener: function(listener) {
                    this._onDismiss = listener;
                    return this;
                },
                show: function() {
                    var buttons = [];
                    if (this._positiveButton) {
                        buttons.push({ text: this._positiveButton.text, action: 'positive', onClick: this._positiveButton.onClick });
                    }
                    if (this._negativeButton) {
                        buttons.push({ text: this._negativeButton.text, action: 'negative', onClick: this._negativeButton.onClick });
                    }
                    if (buttons.length === 0) {
                        buttons.push({ text: 'OK', action: 'positive' });
                    }
                    
                    return showAlert({
                        title: this._title || '',
                        message: this._message || '',
                        buttons: buttons,
                        cancelable: this._cancelable !== false,
                        onDismiss: this._onDismiss
                    });
                }
            };
        }
    };
    
    window.Toast = {
        LENGTH_SHORT: 2000,
        LENGTH_LONG: 3500,
        makeText: function(context, message, duration) {
            return {
                show: function() {
                    showToast(message, duration || window.Toast.LENGTH_SHORT);
                }
            };
        }
    };

    /**
     * Secure request helper.
     * Enforces https://, applies JSON headers, and supports timeout.
     * Mirrors the Java network layer's emphasis on TLS + timeouts.
     */
    function secureRequest(url, options) {
        return new Promise(function(resolve, reject) {
            try {
                if (!url || typeof url !== 'string' || url.indexOf('https://') !== 0) {
                    reject(new Error('Invalid URL or insecure protocol'));
                    return;
                }

                var opts = options || {};
                var timeout = typeof opts.timeout === 'number' ? opts.timeout : 30000;

                // Default secure options
                var headers = {};
                if (opts.headers && typeof opts.headers === 'object') {
                    for (var k in opts.headers) {
                        if (Object.prototype.hasOwnProperty.call(opts.headers, k)) {
                            headers[k] = opts.headers[k];
                        }
                    }
                }
                if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
                if (!headers['X-Requested-With']) headers['X-Requested-With'] = 'Smc-signage';

                var fetchOptions = {
                    method: opts.method || 'GET',
                    headers: headers,
                    body: opts.body,
                    credentials: opts.credentials,
                };

                var didTimeout = false;
                var timerId = setTimeout(function() {
                    didTimeout = true;
                    reject(new Error('Request timeout'));
                }, timeout);

                fetch(url, fetchOptions)
                    .then(function(response) {
                        if (didTimeout) return;
                        clearTimeout(timerId);
                        if (!response.ok) {
                            throw new Error('HTTP ' + response.status + ': ' + response.statusText);
                        }
                        // Some endpoints may return text; try JSON first
                        return response.text().then(function(t) {
                            try {
                                return JSON.parse(t);
                            } catch (e) {
                                return t;
                            }
                        });
                    })
                    .then(function(data) {
                        if (didTimeout) return;
                        if (data === null || typeof data === 'undefined') {
                            throw new Error('Invalid response format');
                        }
                        resolve(data);
                    })
                    .catch(function(error) {
                        if (didTimeout) return;
                        clearTimeout(timerId);
                        reject(error);
                    });
            } catch (err) {
                reject(err);
            }
        });
    }

    // Expose on DialogManager
    if (typeof window.DialogManager === 'object') {
        window.DialogManager.secureRequest = secureRequest;
    }
    
})();
