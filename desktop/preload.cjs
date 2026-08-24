const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('erpDesktop', { isDesktop: true, platform: process.platform });
