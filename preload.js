const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (ch, ...a) => ipcRenderer.invoke(ch, ...a);

// Read the theme main.js resolved before the window was even created, and
// hand it to the page synchronously (preload runs before the page's own
// scripts) so index.html can set data-theme before first paint instead of
// waiting on the async settings:getAll() IPC call — avoiding a flash of
// the wrong theme.
const themeArg = process.argv.find(a => a.startsWith('--initial-theme='));
contextBridge.exposeInMainWorld('initialTheme', themeArg ? themeArg.split('=')[1] : 'dark');

contextBridge.exposeInMainWorld('api', {
  auth: {
    signIn: () => invoke('auth:signIn'),
    signOut: () => invoke('auth:signOut'),
    currentUser: () => invoke('auth:currentUser'),
    onSignedIn: (cb) => ipcRenderer.on('auth:signedIn', (_, user) => cb(user)),
    onFailed: (cb) => ipcRenderer.on('auth:failed', () => cb()),
  },
  series: {
    getAll: (f) => invoke('series:getAll', f),
    get: (id) => invoke('series:get', id),
    create: (d) => invoke('series:create', d),
    update: (id, d) => invoke('series:update', id, d),
    delete: (id) => invoke('series:delete', id),
  },
  volumes: {
    getBySeries: (sid) => invoke('volumes:getBySeries', sid),
    get: (id) => invoke('volumes:get', id),
    create: (d) => invoke('volumes:create', d),
    update: (id, d) => invoke('volumes:update', id, d),
    delete: (id) => invoke('volumes:delete', id),
  },
  characters: {
    getBySeries: (sid) => invoke('characters:getBySeries', sid),
    get: (id) => invoke('characters:get', id),
    create: (d) => invoke('characters:create', d),
    update: (id, d) => invoke('characters:update', id, d),
    delete: (id) => invoke('characters:delete', id),
  },
  relationships: {
    getBySeries: (sid) => invoke('relationships:getBySeries', sid),
    getByCharacter: (cid) => invoke('relationships:getByCharacter', cid),
    create: (d) => invoke('relationships:create', d),
    update: (id, d) => invoke('relationships:update', id, d),
    delete: (id) => invoke('relationships:delete', id),
  },
  tags: {
    getAll: () => invoke('tags:getAll'),
    create: (n) => invoke('tags:create', n),
  },
  genres: {
    getAll: () => invoke('genres:getAll'),
  },
  settings: {
    getAll: () => invoke('settings:getAll'),
    set: (k, v) => invoke('settings:set', k, v),
  },
  libraries: {
    getAll: () => invoke('libraries:getAll'),
    create: (d) => invoke('libraries:create', d),
    update: (id, d) => invoke('libraries:update', id, d),
    delete: (id) => invoke('libraries:delete', id),
  },
  gallery: {
    getBySeries: (sid) => invoke('gallery:getBySeries', sid),
    add: (d) => invoke('gallery:add', d),
    updateCaption: (id, caption) => invoke('gallery:updateCaption', id, caption),
    delete: (id) => invoke('gallery:delete', id),
    reorder: (orderedIds) => invoke('gallery:reorder', orderedIds),
  },
  attachments: {
    getBySeries: (sid) => invoke('attachments:getBySeries', sid),
    openDialog: () => invoke('attachments:openDialog'),
    add: (seriesId, sourcePath) => invoke('attachments:add', seriesId, sourcePath),
    open: (filePath) => invoke('attachments:open', filePath),
    delete: (id) => invoke('attachments:delete', id),
  },
  files: {
    openImageDialog: () => invoke('files:openImageDialog'),
    openImagesDialog: () => invoke('files:openImagesDialog'),
    saveImage: (p, cat) => invoke('files:saveImage', p, cat),
    getImageData: (p) => invoke('files:getImageData', p),
    getPathForFile: (file) => webUtils.getPathForFile(file),
  },
  export: {
    json: () => invoke('export:json'),
    pdf: () => invoke('export:pdf'),
  },
  windowControls: {
    minimize: () => invoke('window:minimize'),
    maximize: () => invoke('window:maximize'),
    close: () => invoke('window:close'),
    isMaximized: () => invoke('window:isMaximized'),
  },
});