const { ipcRenderer } = require('electron');

console.log('Preload: Script starting...', window.location.href);

if (window.location.protocol === 'about:' || window.location.protocol === 'chrome-error:') {
    console.log('Preload: Skipping initialization on about:blank or error page.');
} else {
    try {
        // Wait for the document to be ready to inject storage
        window.addEventListener('DOMContentLoaded', () => {
            console.log('Preload: Requesting storage...');
            ipcRenderer.send('get-storage');
            
            // Initial status
            updateStatus(navigator.onLine);
        });

        function updateStatus(online) {
            ipcRenderer.send('update-connection-status', online ? 'Online' : 'Offline');
        }

        window.addEventListener('online', () => updateStatus(true));
        window.addEventListener('offline', () => updateStatus(false));

        /*
        ipcRenderer.on('load-storage', (event, storage) => {
            console.log('Preload: Loading storage...', storage ? 'Found data' : 'No data');
            if (storage) {
                try {
                    const data = JSON.parse(storage);
                    for (const [key, value] of Object.entries(data)) {
                        window.localStorage.setItem(key, value);
                    }
                    console.log('Preload: Storage loaded successfully.');
                } catch (e) {
                    console.error('Preload: Failed to parse storage', e);
                }
            }
        });
        */

        // Hook into localStorage to sync changes back to main process
        const originalSetItem = window.localStorage.setItem;
        const originalRemoveItem = window.localStorage.removeItem;
        const originalClear = window.localStorage.clear;

        window.localStorage.setItem = function(key, value) {
            originalSetItem.call(this, key, value);
            try {
                ipcRenderer.send('save-storage', JSON.stringify(window.localStorage));
            } catch (e) {
                console.error('Preload: Error sending save-storage', e);
            }
        };

        window.localStorage.removeItem = function(key) {
            originalRemoveItem.call(this, key);
            try {
                ipcRenderer.send('save-storage', JSON.stringify(window.localStorage));
            } catch (e) {
                console.error('Preload: Error sending save-storage', e);
            }
        };

        window.localStorage.clear = function() {
            originalClear.call(this);
            try {
                ipcRenderer.send('save-storage', JSON.stringify(window.localStorage));
            } catch (e) {
                console.error('Preload: Error sending save-storage', e);
            }
        };
        
        console.log('Preload: localStorage hooks installed.');

    } catch (error) {
        console.error('Preload: Critical error during initialization:', error);
    }
}
