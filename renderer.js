// renderer.js

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const notification = document.getElementById('notification');
    const message = document.getElementById('message');
    const restartButton = document.getElementById('restart-button');
    const progressBar = document.getElementById('progress-bar');

    // ---- AUTO-UPDATE EVENTS ----
    window.electronAPI.onUpdateAvailable(() => {
        message.innerText = 'A new update is available. Downloading now...';
        notification.style.display = 'block';
        progressBar.style.display = 'block';
        restartButton.style.display = 'none';
    });

    window.electronAPI.onDownloadProgress((event, percent) => {
        progressBar.value = percent;
        progressBar.style.display = 'block';
    });

    window.electronAPI.onUpdateDownloaded(() => {
        message.innerText = 'Update downloaded. It will be installed on restart. Restart now?';
        restartButton.style.display = 'inline-block';
        notification.style.display = 'block';
        progressBar.style.display = 'none';
    });

    window.electronAPI.onUpdateNotAvailable(() => {
        // Optionally show a notification: "You are using the latest version."
        console.log('You are using the latest version.');
    });

    window.electronAPI.onUpdateError((event, error) => {
        console.error('Error during update:', error);
        message.innerText = 'Error checking for updates.';
        notification.style.display = 'block';
        progressBar.style.display = 'none';
        restartButton.style.display = 'none';
    });

    // ---- RESTART BUTTON ----
    restartButton.addEventListener('click', () => {
        window.electronAPI.restartApp();
    });

    // ---- MICROSOFT LOGIN EXAMPLE (needs a button with id 'ms-login-btn') ----
    const msLoginBtn = document.getElementById('ms-login-btn');
    if (msLoginBtn) {
        msLoginBtn.addEventListener('click', async () => {
    const result = await window.electron.loginMicrosoft();
    if (result.success) {
        // ... logged in!
    } else {
        // Show detailed error
        alert("Microsoft login failed: " + result.message);
    }
});
    }

    // ---- Example: LAUNCH GAME BUTTON ----
    const launchBtn = document.getElementById('launch-btn');
    if (launchBtn) {
        launchBtn.addEventListener('click', () => {
            // Replace with your own logic to get username, version, and useMicrosoft
            const username = document.getElementById('username-input').value;
            const version = document.getElementById('version-select').value;
            const useMicrosoft = true; // or false based on your UI
            window.electronAPI.launchGame({ username, version, useMicrosoft });
        });
    }

    // ---- Optional: Handle error messages from main ----
    window.electronAPI.onErrorMessage((event, msg) => {
        alert(msg);
    });

    // ---- Optional: Progress updates ----
    window.electronAPI.onProgressUpdate((event, percent) => {
        // Example: Show loading bar during asset download
        progressBar.value = percent;
        progressBar.style.display = 'block';
    });
});
