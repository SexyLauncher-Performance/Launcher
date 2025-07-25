const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Update Events
    onUpdateAvailable: (callback) => ipcRenderer.on('update_available', callback),
    onDownloadProgress: (callback) => ipcRenderer.on('update_download_progress', (event, data) => callback(event, data.percent)),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update_downloaded', callback),
    onUpdateNotAvailable: (callback) => ipcRenderer.on('update_not_available', callback),
    onUpdateError: (callback) => ipcRenderer.on('update_error', callback),

    // App Features
    launchGame: (data) => {
        if (data && typeof data.username === 'string' && typeof data.version === 'string') {
            ipcRenderer.send('launch-game', data);
        } else {
            console.error('Invalid data for launching the game. Ensure both username and version are strings.');
        }
    },
    setSelectedVersion: (version) => {
        if (typeof version === 'string') {
            ipcRenderer.send('set-selected-version', version);
        } else {
            console.error('Invalid version type. Version should be a string.');
        }
    },
    openGameFiles: () => {
        try {
            ipcRenderer.send('openGameFiles');
        } catch (error) {
            console.error('Failed to send openGameFiles message:', error);
        }
    },
    restartApp: () => {
        ipcRenderer.send('restart_app');
    },
    setRamAllocation: (ram) => {
        if (ram && typeof ram.min === 'string' && typeof ram.max === 'string') {
            ipcRenderer.send('set-ram-allocation', ram);
        } else {
            console.error('Invalid RAM allocation. Ensure both min and max are strings.');
        }
    },
    getRamAllocation: () => ipcRenderer.invoke('get-ram-allocation'),
    loginMicrosoft: () => ipcRenderer.invoke('login-microsoft'),
    logoutMicrosoft: () => ipcRenderer.invoke('logout-microsoft'),
    // Extra events if needed
    onProgressUpdate: (callback) => ipcRenderer.on('progress-update', callback),
    onErrorMessage: (callback) => ipcRenderer.on('error-message', callback),
});
