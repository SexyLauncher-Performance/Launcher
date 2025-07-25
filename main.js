const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const RPC = require('discord-rpc');
const fs = require('fs-extra');
const axios = require('axios');
const unzipper = require('unzipper');
const { exec } = require('child_process');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const Store = require('electron-store');
const { Client, Authenticator } = require('minecraft-launcher-core');


const store = new Store();
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('App starting...');
let launcher;
let mainWindow;
const clientId = '1237030928996630550';
const rpc = new RPC.Client({ transport: 'ipc' });
const SUPPORTED_VERSIONS = ["fabric 1.21.4s", "fabric 1.21.4", "fabric 1.21.5", "fabric 1.21.5s"];
const VERSION_JSON_MAP = {
    'fabric 1.21.4': 'fabric-shelder-edition.json',
    'fabric 1.21.4s': 'fabric-shelder-edition.json',
    'fabric 1.21.5': 'fabric-shelder-edition.json',
    'fabric 1.21.5s': 'fabric-shelder-edition.json',
};
const VERSION_JSON_URLS = {
    'fabric 1.21.4': 'https://github.com/SheldersonGD/versions/releases/download/versions/fabric-shelder-edition-1.21.4.json',
    'fabric 1.21.4s': 'https://github.com/SheldersonGD/versions/releases/download/versions/fabric-shelder-edition-1.21.4.json',
    'fabric 1.21.5': 'https://github.com/SheldersonGD/versions/releases/download/versions/fabric-shelder-edition-1.21.5.json',
    'fabric 1.21.5s': 'https://github.com/SheldersonGD/versions/releases/download/versions/fabric-shelder-edition-1.21.5.json',
};

async function createNecessaryDirectories() {
    const appDataDir = app.getPath('appData');
    const sexyMinecraftDir = path.join(appDataDir, '.sexylauncher');
    const javaDir = path.join(sexyMinecraftDir, 'java');
    const javaPath = await installJava(javaDir);
    if (!javaPath) {
        log.error('Java installation failed. Cannot proceed.');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('error-message', 'Java installation failed. Cannot proceed.');
        }
        return;
    }
    try {
        await verifyJava(javaPath);
    } catch (error) {
        log.error(`Java verification failed: ${error.message}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('error-message', `Java verification failed: ${error.message}`);
        }
        return;
    }
    for (const version of SUPPORTED_VERSIONS) {
        const versionDir = path.join(sexyMinecraftDir, version);
        const modsDir = path.join(versionDir, 'mods');
        const configDir = path.join(versionDir, 'config');
        const versionsSubDir = path.join(versionDir, 'versions', 'fabric-shelder-edition');
        try {
            await fs.ensureDir(modsDir);
            await fs.ensureDir(configDir);
            await fs.ensureDir(versionsSubDir);
            log.info(`Directories created successfully for ${version}: ${modsDir}, ${configDir}, ${versionsSubDir}`);
            await downloadAndSaveJson(version, versionsSubDir);
            await copyModsFromInstallation(modsDir, version);
            await copyConfigsFromInstallation(configDir, version);
        } catch (err) {
            log.error(`Failed to initialize ${version}: ${err.message}`);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('error-message', `Initialization failed for ${version}: ${err.message}`);
            }
        }
    }
}

async function installJava(javaDir) {
    const javaExeRelativePath = ['bin', 'java.exe'];
    const javaFolders = await fs.readdir(javaDir).catch(() => []);
    for (const folder of javaFolders) {
        const javaExePath = path.join(javaDir, folder, ...javaExeRelativePath);
        if (await fs.pathExists(javaExePath)) {
            log.info(`Java 21 is already installed at ${javaExePath}`);
            return javaExePath;
        }
    }
    log.info('Java 21 not found. Starting download and installation...');
    const downloadUrl = 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.5%2B11/OpenJDK21U-jdk_x64_windows_hotspot_21.0.5_11.zip';
    const zipPath = path.join(app.getPath('temp'), 'OpenJDK21U-jdk_x64_windows_hotspot_21.0.5_11.zip');
    try {
        await downloadFile(downloadUrl, zipPath);
        log.info('Java 21 downloaded successfully.');
        await extractZip(zipPath, javaDir);
        log.info(`Java 21 extracted to ${javaDir}.`);
        const extractedFolders = await fs.readdir(javaDir).catch(() => []);
        const jdkFolder = extractedFolders.find(folder => folder.toLowerCase().startsWith('jdk'));
        if (!jdkFolder) {
            throw new Error('JDK folder not found after extraction.');
        }
        const finalJavaExePath = path.join(javaDir, jdkFolder, ...javaExeRelativePath);
        if (!(await fs.pathExists(finalJavaExePath))) {
            throw new Error(`java.exe not found in the extracted JDK directory: ${finalJavaExePath}`);
        }
        log.info(`Java 21 installed successfully at ${finalJavaExePath}`);
        return finalJavaExePath;
    } catch (error) {
        log.error(`Failed to install Java 21: ${error.message}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('error-message', `Failed to install Java 21: ${error.message}`);
        }
        return null;
    }
}

async function verifyJava(javaPath) {
    return new Promise((resolve, reject) => {
        exec(`"${javaPath}" -version`, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`Java verification failed: ${error.message}`));
            } else {
                log.info(`Java version output: ${stderr}`);
                resolve(true);
            }
        });
    });
}

async function downloadFile(url, outputPath) {
    const writer = fs.createWriteStream(outputPath);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        maxRedirects: 5,
    });
    const totalLength = response.headers['content-length'];
    let downloadedLength = 0;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('java_download_progress', { percent: 0, transferred: 0, total: parseInt(totalLength) });
    }
    response.data.on('data', (chunk) => {
        downloadedLength += chunk.length;
        const percentage = (downloadedLength / totalLength) * 100;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('java_download_progress', { percent: percentage, transferred: downloadedLength, total: parseInt(totalLength) });
        }
    });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

async function extractZip(zipPath, extractTo) {
    return fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: extractTo }))
        .promise();
}

async function downloadAndSaveJson(version, versionsDir) {
    const jsonFilename = VERSION_JSON_MAP[version];
    const downloadUrl = VERSION_JSON_URLS[version];
    const targetPath = path.join(versionsDir, jsonFilename);
    try {
        const response = await axios.get(downloadUrl, { responseType: 'json' });
        await fs.writeJson(targetPath, response.data, { spaces: 4 });
        log.info(`JSON file downloaded and saved to: ${targetPath}`);
    } catch (error) {
        log.error(`Failed to download or save JSON file for ${version}: ${error.message}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('error-message', `Failed to download or save JSON file for ${version}: ${error.message}`);
        }
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 400,
        height: 550,
        icon: path.join(__dirname, 'assets', 'icon.png'),
        roundedCorners: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            enableRemoteModule: false,
        },
        frame: false,
        resizable: false,
    });
    mainWindow.setMenu(null);
    mainWindow.loadFile('index.html');
    mainWindow.once('ready-to-show', () => {
        autoUpdater.checkForUpdatesAndNotify();
    });
}

autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...');
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('message', 'Checking for updates...');
    }
});

autoUpdater.on('update-available', (info) => {
    log.info('Update available.');
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update_available', info);
    }
});

autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available.');
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update_not_available', info);
    }
});

autoUpdater.on('download-progress', (progressObj) => {
    const percentage = Math.floor(progressObj.percent);
    const transferred = progressObj.transferred;
    const total = progressObj.total;
    log.info(`Download progress: ${percentage}% (${transferred}/${total})`);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update_download_progress', {
            percent: percentage,
            transferred: transferred,
            total: total
        });
    }
});

autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded.');
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update_downloaded', info);
    }
});

autoUpdater.on('error', (error) => {
    log.error('Error in auto-updater:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update_error', error);
    }
});

ipcMain.on('restart_app', () => {
    autoUpdater.quitAndInstall();
});

// MICROSOFT LOGIN SUPPORT (Single handler!)

ipcMain.handle('login-microsoft', async () => {
    try {
        const { MicrosoftAuth } = await import('minecraft-auth');
        const auth = new MicrosoftAuth({
            clientId: '00000000402b5328',
            redirectUri: 'https://login.live.com/oauth20_desktop.srf'
        });
        const result = await auth.getAuth('device-code');
        store.set('microsoftUser', result);
        return {
            success: true,
            profile: {
                uuid: result.uuid || (result.profile && result.profile.id),
                username: result.name || (result.profile && result.profile.name),
                accessToken: result.access_token,
                clientToken: result.client_token,
                xuid: result.xuid
            }
        };
    } catch (e) {
        // LOG THE ERROR
        log.error('Microsoft login error:', e);
        return {
            success: false,
            message: e.message || 'Unknown error'
        };
    }
});






ipcMain.handle('logout-microsoft', async () => {
    store.delete('microsoftUser');
    return { success: true };
});

// Set selected version
ipcMain.on('set-selected-version', (event, version) => {
    if (SUPPORTED_VERSIONS.includes(version)) {
        store.set('selectedVersion', version);
        log.info(`Selected version set to: ${version}`);
    } else {
        log.error(`Attempted to set unsupported version: ${version}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('error-message', `Unsupported version selected: ${version}`);
        }
    }
});

function createLauncherProfilesIfMissing(minecraftDir, version) {
    const launcherProfilesPath = path.join(minecraftDir, 'launcher_profiles.json');
    if (!fs.existsSync(launcherProfilesPath)) {
        const launcherProfilesContent = {
            profiles: {
                'fabric-shelder-edition': {
                    name: 'Fabric Shelder Edition',
                    lastUsed: 'fabric-shelder-edition',
                    type: 'custom',
                    lastVersionId: 'fabric-shelder-edition',
                }
            },
            clientToken: '',
            selectedUser: { account: '', profile: '' },
            authenticationDatabase: {},
        };
        fs.writeFileSync(launcherProfilesPath, JSON.stringify(launcherProfilesContent, null, 4));
        log.info(`Created launcher_profiles.json at ${launcherProfilesPath}`);
    } else {
        log.info(`launcher_profiles.json already exists at ${launcherProfilesPath}`);
    }
}

ipcMain.on('openGameFiles', () => {
    const selectedVersion = store.get('selectedVersion') || 'fabric 1.21';
    const gameFilesPath = path.join(app.getPath('appData'), '.sexylauncher', selectedVersion, '/');
    log.info(`Opening game files directory at: ${gameFilesPath}`);
    shell.openPath(gameFilesPath)
        .then(() => {
            log.info('Game files directory opened successfully.');
        })
        .catch(err => {
            log.error('Error opening game files directory:', err);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('error-message', `Error opening game files directory: ${err.message}`);
            }
        });
});

// Discord RPC
rpc.on('ready', () => {
    log.info('Discord RPC is ready!');
    rpc.setActivity({
        details: 'Playing on SexyLauncher',
        state: 'Connecting...',
        largeImageKey: 'SexyLauncher',
        instance: false,
    });
});
rpc.login({ clientId }).catch(console.error);

// --------------------- LAUNCH GAME HANDLER (WITH MICROSOFT SUPPORT) --------------
ipcMain.on('launch-game', async (event, { username, version, useMicrosoft }) => {
    log.info(`Received request to launch game for user: ${username}, with version: ${version}${useMicrosoft ? ' [Microsoft Login]' : ''}`);
    if (!SUPPORTED_VERSIONS.includes(version)) {
        log.error(`Unsupported version selected: ${version}`);
        mainWindow.webContents.send('error-message', `Unsupported version selected: ${version}`);
        return;
    }
    store.set('selectedVersion', version);
    log.info(`Selected version stored: ${version}`);
    launcher = new Client();
    const sexyMinecraftDir = path.join(app.getPath('appData'), '.sexylauncher');
    const versionDir = path.join(sexyMinecraftDir, version);
    const modsDir = path.join(versionDir, 'mods');
    const configDir = path.join(versionDir, 'config');
    const javaDir = path.join(sexyMinecraftDir, 'java');
    try {
        await fs.ensureDir(sexyMinecraftDir);
        await fs.ensureDir(versionDir);
        await fs.ensureDir(javaDir);
    } catch (err) {
        log.error(`Failed to create directories: ${err.message}`);
        mainWindow.webContents.send('error-message', `Failed to create directories: ${err.message}`);
        return;
    }
    createLauncherProfilesIfMissing(versionDir, version);
    const javaPath = await getJavaPath(javaDir);
    if (!javaPath) {
        log.error('Java 21 is not installed correctly.');
        mainWindow.webContents.send('error-message', 'Java 21 is not installed correctly.');
        return;
    }
    try {
        const versionNumberMap = {
            'fabric 1.21.4': '1.21.4',
            'fabric 1.21.4s': '1.21.4',
            'fabric 1.21.5': '1.21.5',
            'fabric 1.21.5s': '1.21.5',
        };
        const ramAllocation = store.get('ramAllocation') || { min: '4G', max: '6G' };

        let authObj;
if (useMicrosoft) {
    const msUser = store.get('microsoftUser');
    if (!msUser || !msUser.access_token) {
        log.error('Microsoft user is not logged in!');
        mainWindow.webContents.send('error-message', 'Microsoft login required. Please log in with Microsoft.');
        return;
    }
    authObj = {
        access_token: msUser.access_token,
        client_token: msUser.client_token,
        uuid: msUser.uuid || (msUser.profile && msUser.profile.id),
        name: msUser.name || (msUser.profile && msUser.profile.name),
        user_properties: '{}',
        meta: {
            type: 'msa',
            demo: false,
            xuid: msUser.xuid || '',
            clientId: msUser.client_token
        }
    };
} else {
    authObj = Authenticator.getAuth(username);
}


        const opts = {
            authorization: authObj,
            root: versionDir,
            javaPath: javaPath,
            version: {
                number: versionNumberMap[version],
                type: 'release',
                custom: 'fabric-shelder-edition',
            },
            memory: {
                max: ramAllocation.max,
                min: ramAllocation.min,
            },
            spawnOptions: {
                detached: false,
                stdio: 'ignore',
                windowsHide: true,
            },
        };

        // Function to delete a folder and its contents
        function deleteFolderRecursive(folderPath) {
            if (fs.existsSync(folderPath)) {
                fs.readdirSync(folderPath).forEach((file) => {
                    const currentPath = path.join(folderPath, file);
                    if (fs.lstatSync(currentPath).isDirectory()) {
                        deleteFolderRecursive(currentPath); // Recursively delete subfolders
                    } else {
                        fs.unlinkSync(currentPath); // Delete file
                    }
                });
                fs.rmdirSync(folderPath); // Finally, remove the empty folder
                console.log(`Deleted: ${folderPath}`);
            } else {
                console.log(`Folder does not exist: ${folderPath}`);
            }
        }
        const os = require('os');
        const appDataPath = path.join(os.homedir(), 'AppData', 'Roaming', '.sexylauncher');
        const foldersToDelete = [
            path.join(appDataPath, 'fabric 1.21.4', 'libraries', 'org', 'ow2', 'asm', 'asm', '9.7.1'),
            path.join(appDataPath, 'fabric 1.21.4s', 'libraries', 'org', 'ow2', 'asm', 'asm', '9.7.1'),
            path.join(appDataPath, 'fabric 1.21.5', 'libraries', 'org', 'ow2', 'asm', 'asm', '9.8'),
            path.join(appDataPath, 'fabric 1.21.5s', 'libraries', 'org', 'ow2', 'asm', 'asm', '9.8')
        ];
        setTimeout(() => {
            foldersToDelete.forEach(deleteFolderRecursive);
        }, 2000);

        opts.version.arguments = [
            `-Xmx${ramAllocation.max}`,
            `-Xms${ramAllocation.min}`,
            "-XX:+UseG1GC",
            "-XX:G1NewSizePercent=20",
            "-XX:G1ReservePercent=15",
            "-XX:MaxGCPauseMillis=50",
            "-XX:+DisableExplicitGC",
            "-XX:MaxHeapFreeRatio=60",
            "-XX:MinHeapFreeRatio=20",
            "-XX:+UseStringDeduplication",
        ];
        launcher.launch(opts);
        launcher.on('progress', (event) => {
            if (event && event.type === 'assets' && typeof event.task === 'number' && typeof event.total === 'number') {
                const percentage = Math.floor((event.task / event.total) * 100);
                log.info(`Loading progress: ${percentage}%`);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('progress-update', percentage);
                }
                if (percentage === 100) {
                    log.info('Game assets fully loaded. Hiding the launcher.');
                    mainWindow.hide();
                }
            }
        });
        launcher.on('debug', (e) => {
            log.info(`[DEBUG] ${e}`);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('debug-log', e);
            }
        });
        launcher.on('data', (e) => {
            if (e === undefined) {
                log.error('[DATA] Received undefined data.');
            } else if (typeof e !== 'object') {
                log.error(`[DATA] Received non-object data: ${e} (Type: ${typeof e})`);
            } else if (e && typeof e === 'object') {
                if (e.url) {
                    log.info(`[DATA] URL: ${e.url}`);
                } else {
                    log.info('[DATA] URL is missing. Full data:', JSON.stringify(e, null, 2));
                }
            }
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('data-log', e);
            }
        });
        await copyModsFromInstallation(modsDir, version);
        await copyConfigsFromInstallation(configDir, version);
        launcher.on('close', () => {
            log.info('Game has exited. Reopening the launcher.');
            setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.show();
                } else {
                    createWindow();
                }
            }, 1000);
        });
        launcher.on('error', (e) => {
            log.error(`[ERROR] Launcher error: ${e}`);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('error-message', `Launcher error: ${e}`);
            }
        });
    } catch (error) {
        log.error(`Failed to launch Minecraft: ${error.message}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('error-message', `Failed to launch Minecraft: ${error.message}`);
        }
    }
    rpc.setActivity({
        details: `Playing as ${username}`,
        state: `Sexy people aren't born, they are made.`,
        largeImageKey: 'SexyLauncher',
        instance: false,
        buttons: [
            { label: 'GET SEXYLAUNCHER', url: 'https://github.com/SheldersonGD/SexyLauncherPerformance' }
        ]
    });
});

// -------------------------------------------------------------------------------

async function getJavaPath(javaDir) {
    const javaFolders = await fs.readdir(javaDir).catch(() => []);
    for (const folder of javaFolders) {
        const javaExePath = path.join(javaDir, folder, 'bin', 'java.exe');
        if (await fs.pathExists(javaExePath)) {
            return javaExePath;
        }
    }
    return null;
}

async function copyModsFromInstallation(modsDir, version) {
    let installationDir;
    if (app.isPackaged) {
        installationDir = path.dirname(app.getPath('exe'));
    } else {
        installationDir = path.resolve(__dirname);
    }
    const installedModsDir = path.join(installationDir, version, 'mods');
    try {
        if (!fs.existsSync(installedModsDir)) {
            log.warn(`Mods directory does not exist at: ${installedModsDir}`);
            return;
        }
        await fs.ensureDir(modsDir);
        await fs.copy(installedModsDir, modsDir, { overwrite: true });
        log.info(`Mods for ${version} copied successfully from installation directory to Minecraft mods folder.`);
    } catch (err) {
        log.error(`Failed to copy mods for ${version}: ${err.message}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('error-message', `Failed to copy mods for ${version}: ${err.message}`);
        }
    }
}

async function copyConfigsFromInstallation(configDir, version) {
    let installationDir;
    if (app.isPackaged) {
        installationDir = path.dirname(app.getPath('exe'));
    } else {
        installationDir = path.resolve(__dirname);
    }
    const installedConfigDir = path.join(installationDir, version, 'config');
    try {
        if (!fs.existsSync(installedConfigDir)) {
            log.warn(`Config directory does not exist at: ${installedConfigDir}`);
            return;
        }
        await fs.ensureDir(configDir);
        await fs.copy(installedConfigDir, configDir, { overwrite: true });
        log.info(`Config for ${version} copied successfully from installation directory to Minecraft config folder.`);
    } catch (err) {
        log.error(`Failed to copy config for ${version}: ${err.message}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('error-message', `Failed to copy config for ${version}: ${err.message}`);
        }
    }
}

app.on('ready', async () => {
    if (!store.has('ramAllocation')) {
        store.set('ramAllocation', { min: '4G', max: '6G' });
    }
    await createNecessaryDirectories();
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

ipcMain.on('set-ram-allocation', (event, ram) => {
    if (ram && typeof ram.min === 'string' && typeof ram.max === 'string') {
        store.set('ramAllocation', ram);
        log.info(`RAM allocation set to: Min=${ram.min}, Max=${ram.max}`);
    } else {
        log.error('Invalid RAM allocation received.');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('error-message', 'Invalid RAM allocation received.');
        }
    }
});

ipcMain.handle('get-ram-allocation', () => {
    return store.get('ramAllocation') || { min: '4G', max: '6G' };
});
