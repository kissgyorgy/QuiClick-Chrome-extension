class BookmarkManager {
    constructor() {
        this.bookmarks = [];
        this.folders = [];
        this.currentBookmarkId = null;
        this.currentFolderId = null;
        this.openFolderId = null;
        this.isDragging = false;
        this.draggedBookmarkId = null;
        this.draggedFolderId = null;
        this.isDuplicateMode = false;
        this.duplicatedBookmarkId = null;
        this.selectedFavicon = null;
        this.selectedEditFavicon = null;
        this.faviconDebounceTimer = null;
        this.editFaviconDebounceTimer = null;
        this.syncAvailable = false;
        this.settings = {
            showTitles: true,
            tilesPerRow: 8,
            tileGap: 1,
            showAddButton: true
        };
        this.init();
    }

    async init() {
        await this.checkSyncAvailability();
        await this.loadSettings();
        await this.loadBookmarks();
        await this.loadFolders();
        this.setupEventListeners();
        this.updateTilesPerRowCSS(this.settings.tilesPerRow);
        this.renderQuickAccess();
    }

    async checkSyncAvailability() {
        try {
            // Test if sync storage is available and working
            const testKey = 'syncTest_' + Date.now();
            const testValue = 'test';
            
            await chrome.storage.sync.set({ [testKey]: testValue });
            const result = await chrome.storage.sync.get([testKey]);
            await chrome.storage.sync.remove([testKey]);
            
            if (result[testKey] === testValue) {
                this.syncAvailable = true;
                console.log('✅ Chrome sync storage is available and working');
                console.log('Extension ID:', chrome.runtime.id);
                console.log('💡 For sync to work: ensure you are signed into Chrome on all devices');
            } else {
                throw new Error('Sync test failed');
            }
        } catch (error) {
            this.syncAvailable = false;
            console.log('❌ Chrome sync storage not available:', error.message);
            console.log('📝 Sync troubleshooting:');
            console.log('   1. Make sure you are signed into Chrome');
            console.log('   2. Check Chrome sync settings (chrome://settings/syncSetup)');
            console.log('   3. Ensure Extensions sync is enabled');
            console.log('   4. For unpacked extensions, sync may not work across different computers');
        }
        
    }


    setupEventListeners() {
        // Add bookmark button
        document.getElementById('addBookmarkBtn').addEventListener('click', () => {
            this.showAddBookmarkModal();
        });

        // Create folder button
        document.getElementById('createFolderBtn').addEventListener('click', () => {
            this.showCreateFolderModal();
        });

        // Cancel add bookmark
        document.getElementById('cancelAddBtn').addEventListener('click', () => {
            this.hideAddBookmarkModal();
        });

        // Add bookmark form submission
        document.getElementById('addBookmarkForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addBookmark();
        });

        // URL input change for favicon loading
        document.getElementById('bookmarkUrl').addEventListener('input', (e) => {
            this.handleUrlInputChange(e.target.value);
        });

        // Edit URL input change for favicon loading
        document.getElementById('editBookmarkUrl').addEventListener('input', (e) => {
            this.handleEditUrlInputChange(e.target.value);
        });

        // Remove view toggle listeners since we only have favicon view now

        // Edit bookmark modal events
        document.getElementById('cancelEditBtn').addEventListener('click', () => {
            this.cancelEditBookmarkModal();
        });

        document.getElementById('editBookmarkForm').addEventListener('submit', (e) => {
            e.preventDefault();
            console.log('Form submission triggered');
            this.updateBookmark();
        });

        // ESC key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideAddBookmarkModal();
                this.cancelEditBookmarkModal();
                this.hideDeleteConfirmation();
                this.hideSettingsModal();
                this.closeFolderModal();
                this.hideCreateFolderModal();
                this.hideRenameFolderModal();
                this.hideContextMenu();
            }
        });

        // Backdrop click handling for modals
        document.getElementById('editBookmarkModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                this.cancelEditBookmarkModal();
            }
        });

        document.getElementById('addBookmarkModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                this.hideAddBookmarkModal();
            }
        });

        // Context menu events
        document.getElementById('editBookmark').addEventListener('click', () => {
            this.showEditBookmarkModal();
            this.hideContextMenu();
        });

        document.getElementById('duplicateBookmark').addEventListener('click', () => {
            this.duplicateBookmark();
            this.hideContextMenu();
        });

        document.getElementById('copyBookmarkUrl').addEventListener('click', () => {
            this.copyBookmarkUrl();
            this.hideContextMenu();
        });

        document.getElementById('deleteBookmark').addEventListener('click', (e) => {
            this.showDeleteConfirmation(e);
            this.hideContextMenu();
        });

        // Delete confirmation popup events
        document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
            this.hideDeleteConfirmation();
        });

        document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
            this.confirmDeleteBookmark();
            this.hideDeleteConfirmation();
        });

        // Settings button
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.showSettingsModal();
        });

        // Settings modal events - removed Save/Cancel buttons, settings apply immediately

        // Settings modal - no backdrop click handler needed since no backdrop

        // Folder modal events
        document.getElementById('closeFolderBtn').addEventListener('click', () => {
            this.closeFolderModal();
        });

        document.getElementById('folderModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                this.closeFolderModal();
            }
        });

        // Create folder modal events
        document.getElementById('cancelCreateFolderBtn').addEventListener('click', () => {
            this.hideCreateFolderModal();
        });

        document.getElementById('createFolderForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.createFolderFromModal();
        });

        document.getElementById('createFolderModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                this.hideCreateFolderModal();
            }
        });

        // Folder context menu events
        document.getElementById('renameFolder').addEventListener('click', () => {
            this.showRenameFolderModal();
            this.hideContextMenu();
        });

        document.getElementById('deleteFolder').addEventListener('click', (e) => {
            this.showFolderDeleteConfirmation(e);
            this.hideContextMenu();
        });

        // Rename folder modal events
        document.getElementById('cancelRenameFolderBtn').addEventListener('click', () => {
            this.hideRenameFolderModal();
        });

        document.getElementById('renameFolderForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.renameFolderFromModal();
        });

        document.getElementById('renameFolderModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                this.hideRenameFolderModal();
            }
        });


        // Toggle switch styling and immediate settings save
        document.getElementById('showTitles').addEventListener('change', (e) => {
            this.updateToggleVisual(e.target);
            this.settings.showTitles = e.target.checked;
            this.saveSettings();
            this.renderQuickAccess(); // Re-render to show/hide titles immediately
        });

        // Show/Hide Add Button toggle
        document.getElementById('showAddButton').addEventListener('change', (e) => {
            this.updateToggleVisual(e.target);
            this.settings.showAddButton = e.target.checked;
            this.saveSettings();
            this.renderQuickAccess(); // Re-render to show/hide add button immediately
        });

        // Tiles per row slider
        document.getElementById('tilesPerRow').addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('tilesPerRowValue').textContent = value;
            this.settings.tilesPerRow = value;
            this.saveSettings();
            this.updateTilesPerRowCSS(value);
        });

        // Tile gap slider
        document.getElementById('tileGap').addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('tileGapValue').textContent = value;
            this.settings.tileGap = value;
            this.saveSettings();
            this.updateTilesPerRowCSS(this.settings.tilesPerRow);
        });

        // Hide context menu when clicking elsewhere
        document.addEventListener('click', (e) => {
            const isClickInsideModal = e.target.closest('#contextMenu') || 
                                      e.target.closest('#editBookmarkModal') || 
                                      e.target.closest('#deleteConfirmPopup') ||
                                      e.target.closest('#addBookmarkModal') ||
                                      e.target.closest('#settingsModal') ||
                                      e.target.closest('#settingsBtn') ||
                                      e.target.closest('#folderModal') ||
                                      e.target.closest('#createFolderModal') ||
                                      e.target.closest('#renameFolderModal');
            
            if (!isClickInsideModal) {
                this.hideContextMenu();
                this.hideDeleteConfirmation();
                
                // Check modal states
                const editModalOpen = !document.getElementById('editBookmarkModal').classList.contains('hidden');
                const addModalOpen = !document.getElementById('addBookmarkModal').classList.contains('hidden');
                const settingsModalOpen = !document.getElementById('settingsModal').classList.contains('hidden');
                const folderModalOpen = !document.getElementById('folderModal').classList.contains('hidden');
                const createFolderModalOpen = !document.getElementById('createFolderModal').classList.contains('hidden');
                const renameFolderModalOpen = !document.getElementById('renameFolderModal').classList.contains('hidden');
                
                // Close settings modal if it's open
                if (settingsModalOpen) {
                    this.hideSettingsModal();
                }
                
                // Only clear currentBookmarkId if no modals are open
                if (!editModalOpen && !addModalOpen && !settingsModalOpen && !folderModalOpen && !createFolderModalOpen && !renameFolderModalOpen) {
                    console.log('Clearing currentBookmarkId and currentFolderId due to click outside');
                    this.currentBookmarkId = null;
                    this.currentFolderId = null;
                }
            }
        });

        // Prevent default context menu
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // Paste functionality for adding bookmarks
        this.setupPasteListener();

        // Drag and drop functionality
        this.setupDragAndDrop();
    }

    setupPasteListener() {
        document.addEventListener('paste', async (e) => {
            // Don't interfere if user is pasting into an input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            e.preventDefault();
            
            try {
                const clipboardText = await navigator.clipboard.readText();
                await this.handlePastedContent(clipboardText);
            } catch (error) {
                console.log('Could not read clipboard:', error);
                // Fallback to event clipboardData if clipboard API fails
                const clipboardText = e.clipboardData?.getData('text/plain');
                if (clipboardText) {
                    await this.handlePastedContent(clipboardText);
                }
            }
        });
    }

    async handlePastedContent(content) {
        if (!content || !content.trim()) return;

        // Check if the content is a valid URL
        if (this.isValidUrl(content.trim())) {
            const url = content.trim();
            let title = '';

            // Try to extract title from URL
            try {
                const hostname = new URL(url).hostname;
                title = hostname.replace('www.', '');
                title = title.charAt(0).toUpperCase() + title.slice(1);
            } catch (e) {
                title = 'Bookmark';
            }

            // Show the add bookmark modal with pre-filled URL
            this.showAddBookmarkModal();
            document.getElementById('bookmarkUrl').value = url;
            document.getElementById('bookmarkTitle').value = title;
            
            // Trigger favicon loading for the pasted URL
            this.handleUrlInputChange(url);
            
            document.getElementById('bookmarkTitle').focus();
            document.getElementById('bookmarkTitle').select();
        } else {
            // Check if content contains a URL within text (like "Check out https://example.com")
            const urlMatch = content.match(/(https?:\/\/[^\s]+)/i);
            if (urlMatch) {
                const url = urlMatch[1];
                const title = content.replace(urlMatch[0], '').trim() || this.extractTitleFromUrl(url);
                
                this.showAddBookmarkModal();
                document.getElementById('bookmarkUrl').value = url;
                document.getElementById('bookmarkTitle').value = title;
                
                // Trigger favicon loading for the extracted URL
                this.handleUrlInputChange(url);
                
                document.getElementById('bookmarkTitle').focus();
                document.getElementById('bookmarkTitle').select();
            }
        }
    }

    extractTitleFromUrl(url) {
        try {
            const hostname = new URL(url).hostname;
            let title = hostname.replace('www.', '');
            return title.charAt(0).toUpperCase() + title.slice(1);
        } catch (e) {
            return 'Bookmark';
        }
    }

    setupDragAndDrop() {
        const body = document.body;
        let dragCounter = 0;
        
        // Prevent default drag behaviors on document
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            document.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        // Handle drag enter
        body.addEventListener('dragenter', (e) => {
            e.preventDefault();
            
            // Only show overlay for external drags (not internal bookmark reordering)
            if (!this.isDragging) {
                dragCounter++;
                
                // Add a visual overlay to indicate drop zone (excluding header)
                if (!document.getElementById('dropOverlay')) {
                    const header = document.querySelector('header');
                    const headerHeight = header ? header.offsetHeight : 0;
                    
                    const overlay = document.createElement('div');
                    overlay.id = 'dropOverlay';
                    overlay.className = 'fixed left-0 right-0 bottom-0 bg-blue-100/10 backdrop-blur-sm border-4 border-dashed border-blue-400 z-40 flex items-center justify-center';
                    overlay.style.top = `${headerHeight}px`; // Start exactly at bottom of header
                    overlay.innerHTML = '<div class="text-blue-600 text-xl font-semibold">Drop bookmark here</div>';
                    body.appendChild(overlay);
                }
            }
        });

        // Handle drag over (required for drop to work)
        body.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        // Handle drag leave
        body.addEventListener('dragleave', (e) => {
            e.preventDefault();
            
            // Only handle external drags
            if (!this.isDragging) {
                dragCounter--;
                
                // Only remove overlay when all drag operations are done
                if (dragCounter === 0) {
                    const overlay = document.getElementById('dropOverlay');
                    if (overlay) {
                        overlay.remove();
                    }
                }
            }
        });

        // Handle drop on entire page
        body.addEventListener('drop', (e) => {
            e.preventDefault();
            
            // Only handle external drops (not internal bookmark reordering)
            if (!this.isDragging) {
                dragCounter = 0; // Reset counter on drop
                const overlay = document.getElementById('dropOverlay');
                if (overlay) {
                    overlay.remove();
                }
                
                // Get the dragged data - Chrome bookmarks provide multiple data formats
                const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
            
            // Try to get the bookmark title from different data types
            let title = '';
            
            // Debug: log all available data types
            console.log('Available data types:', e.dataTransfer.types);
            
            // Try various data formats to get the bookmark name
            const htmlData = e.dataTransfer.getData('text/html');
            const plainText = e.dataTransfer.getData('text/plain');
            const mozText = e.dataTransfer.getData('text/x-moz-text-internal');
            const mozHtml = e.dataTransfer.getData('application/x-moz-nativehtml');
            
            console.log('Data extraction:', { htmlData, plainText, mozText, mozHtml, url });
            
            // First priority: Extract title from HTML data (most reliable for bookmarks)
            if (htmlData) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = htmlData;
                const linkElement = tempDiv.querySelector('a');
                if (linkElement && linkElement.textContent && 
                    linkElement.textContent.trim() !== url && 
                    !linkElement.textContent.trim().startsWith('http')) {
                    title = linkElement.textContent.trim();
                }
            }
            
            // Second priority: Use Mozilla-specific data formats
            if (!title && mozText && mozText !== url && !mozText.startsWith('http')) {
                title = mozText.trim();
            }
            
            // Third priority: Use plain text if it's not a URL
            if (!title && plainText && plainText !== url && !plainText.startsWith('http')) {
                title = plainText.trim();
            }
            
                if (url && this.isValidUrl(url)) {
                    this.addBookmarkFromDrop(title, url);
                }
            }
        });
    }

    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    normalizeUrl(url) {
        if (!url || !url.trim()) return url;
        
        const trimmedUrl = url.trim();
        
        // If it already has a protocol, return as is
        if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
            return trimmedUrl;
        }
        
        // If it looks like a URL (contains a dot and domain pattern), prefix with https://
        if (trimmedUrl.includes('.') && /^[a-zA-Z0-9]/.test(trimmedUrl)) {
            return 'https://' + trimmedUrl;
        }
        
        return trimmedUrl;
    }

    isValidUrlOrCanBeNormalized(string) {
        if (!string || !string.trim()) return false;
        
        // First check if it's already valid
        if (this.isValidUrl(string)) return true;
        
        // Then check if it can be normalized to a valid URL
        const normalized = this.normalizeUrl(string);
        return this.isValidUrl(normalized);
    }

    extractTitleFromDocument(doc) {
        // Try different title sources in order of preference
        const titleSources = [
            'meta[property="og:title"]',
            'meta[name="twitter:title"]',
            'title',
            'h1'
        ];

        for (const selector of titleSources) {
            const element = doc.querySelector(selector);
            if (element) {
                const title = element.getAttribute('content') || element.textContent || '';
                const cleanTitle = title.trim();
                if (cleanTitle) {
                    return cleanTitle;
                }
            }
        }

        return null;
    }

    async getHighResolutionFavicon(url) {
        const hostname = new URL(url).hostname;
        const origin = new URL(url).origin;
        
        // Check if we have a cached favicon for this domain
        const cachedFavicon = await this.getCachedFavicon(hostname);
        if (cachedFavicon) {
            return cachedFavicon;
        }
        
        let faviconUrl = null;
        
        // First try to parse HTML to find declared favicon links
        try {
            const response = await fetch(url);
            if (response.ok) {
                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                
                // Look for various favicon declarations in order of preference
                const faviconSelectors = [
                    'link[rel*="icon"][sizes*="192"]',
                    'link[rel*="icon"][sizes*="180"]',
                    'link[rel*="icon"][sizes*="152"]',
                    'link[rel*="icon"][sizes*="144"]',
                    'link[rel*="icon"][sizes*="128"]',
                    'link[rel*="icon"][sizes*="96"]',
                    'link[rel*="icon"][sizes*="72"]',
                    'link[rel*="icon"][sizes*="64"]',
                    'link[rel*="icon"][sizes*="48"]',
                    'link[rel*="icon"][sizes*="32"]',
                    'link[rel="apple-touch-icon"]',
                    'link[rel="apple-touch-icon-precomposed"]',
                    'link[rel="icon"]',
                    'link[rel="shortcut icon"]'
                ];
                
                for (const selector of faviconSelectors) {
                    const link = doc.querySelector(selector);
                    if (link && link.href) {
                        const testUrl = new URL(link.href, url).href;
                        // Test if the favicon actually exists and download it
                        const cachedData = await this.downloadAndCacheFavicon(hostname, testUrl);
                        if (cachedData) {
                            return cachedData;
                        }
                    }
                }
            }
        } catch (e) {
            // If HTML parsing fails, fall back to hardcoded paths
        }
        
        // Fallback to common favicon paths
        const faviconSources = [
            `${origin}/apple-touch-icon.png`,
            `${origin}/apple-touch-icon-180x180.png`,
            `${origin}/apple-touch-icon-152x152.png`,
            `${origin}/apple-touch-icon-144x144.png`,
            `${origin}/apple-touch-icon-120x120.png`,
            `${origin}/android-chrome-192x192.png`,
            `${origin}/favicon-196x196.png`,
            `${origin}/favicon-128x128.png`,
            `${origin}/favicon-96x96.png`,
            `${origin}/favicon-64x64.png`,
            `${origin}/favicon-32x32.png`,
            `${origin}/favicon.png`,
            `${origin}/favicon.ico`
        ];

        for (const testUrl of faviconSources) {
            const cachedData = await this.downloadAndCacheFavicon(hostname, testUrl);
            if (cachedData) {
                return cachedData;
            }
        }
        
        // If no favicon found, return null (no fallback)
        return null;
    }

    async testFaviconUrl(url) {
        try {
            const response = await fetch(url, { 
                method: 'HEAD',
                mode: 'no-cors'
            });
            return response.ok || response.type === 'opaque';
        } catch (e) {
            return false;
        }
    }

    async getCachedFavicon(hostname) {
        try {
            const result = await chrome.storage.local.get(['faviconCache']);
            const cache = result.faviconCache || {};
            return cache[hostname] || null;
        } catch (e) {
            console.log('Failed to get cached favicon:', e);
            return null;
        }
    }

    async downloadAndCacheFavicon(hostname, faviconUrl) {
        try {
            const response = await fetch(faviconUrl);
            if (!response.ok) {
                return null;
            }

            const blob = await response.blob();
            
            // Check if it's a valid image
            if (!blob.type.startsWith('image/')) {
                return null;
            }

            // Convert to base64 data URL
            const base64Data = await this.blobToBase64(blob);
            
            // Cache the favicon
            await this.cacheFavicon(hostname, base64Data);
            
            return base64Data;
        } catch (e) {
            console.log('Failed to download favicon:', e);
            return null;
        }
    }

    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    async cacheFavicon(hostname, base64Data) {
        try {
            const result = await chrome.storage.local.get(['faviconCache']);
            const cache = result.faviconCache || {};
            cache[hostname] = base64Data;
            
            // Limit cache size by removing old entries if needed
            const cacheKeys = Object.keys(cache);
            if (cacheKeys.length > 100) {
                // Remove the oldest 20 entries (simple cleanup)
                cacheKeys.slice(0, 20).forEach(key => delete cache[key]);
            }
            
            await chrome.storage.local.set({ faviconCache: cache });
        } catch (e) {
            console.log('Failed to cache favicon:', e);
        }
    }

    async addBookmarkFromDrop(title, url) {
        // Use the provided bookmark title if available, otherwise extract from URL
        let bookmarkTitle = title;
        if (!title || title.trim() === '' || title === url || title.startsWith('http')) {
            try {
                const hostname = new URL(url).hostname;
                bookmarkTitle = hostname.replace('www.', '');
                bookmarkTitle = bookmarkTitle.charAt(0).toUpperCase() + bookmarkTitle.slice(1);
            } catch (e) {
                bookmarkTitle = 'Bookmark';
            }
        }

        // Show the add bookmark modal with pre-filled data
        this.showAddBookmarkModal();
        document.getElementById('bookmarkTitle').value = bookmarkTitle;
        document.getElementById('bookmarkUrl').value = url;
        
        // Trigger favicon loading for the dropped URL
        this.handleUrlInputChange(url);
        
        // Focus the title field and select the text for easy editing
        setTimeout(() => {
            const titleInput = document.getElementById('bookmarkTitle');
            titleInput.focus();
            titleInput.select();
        }, 100);
    }

    async loadBookmarks() {
        try {
            let result;
            let loadedFromSync = false;
            
            // Try to load from sync storage first (only if sync is available)
            if (this.syncAvailable) {
                try {
                    result = await chrome.storage.sync.get(['bookmarks']);
                    if (result.bookmarks && result.bookmarks.length > 0) {
                        console.log('Loaded bookmarks from sync storage');
                        loadedFromSync = true;
                    } else {
                        throw new Error('No bookmarks in sync storage');
                    }
                } catch (syncError) {
                    console.log('Sync storage error, falling back to local:', syncError.message);
                }
            }
            
            if (!loadedFromSync) {
                // Fallback to local storage
                console.log('Loading from local storage');
                result = await chrome.storage.local.get(['bookmarks']);
                
                // If we have bookmarks in local but not sync, try to migrate them (only if sync is available)
                if (this.syncAvailable && result.bookmarks && result.bookmarks.length > 0) {
                    console.log('Found bookmarks in local storage, attempting to migrate to sync');
                    const bookmarksData = JSON.stringify(result.bookmarks);
                    const sizeInBytes = new TextEncoder().encode(bookmarksData).length;
                    
                    if (sizeInBytes <= 8000) {
                        try {
                            await chrome.storage.sync.set({ bookmarks: result.bookmarks });
                            console.log('Successfully migrated bookmarks to sync storage');
                        } catch (migrationError) {
                            console.log('Migration to sync failed, keeping in local storage');
                        }
                    } else {
                        console.log('Bookmarks too large for sync storage, keeping in local storage');
                    }
                }
            }
            
            this.bookmarks = result.bookmarks || await this.getDefaultBookmarks();
        } catch (error) {
            console.log('Error loading bookmarks, using default bookmarks');
            this.bookmarks = await this.getDefaultBookmarks();
        }
    }

    async loadFolders() {
        try {
            let result;
            let loadedFromSync = false;
            
            // Try to load from sync storage first (only if sync is available)
            if (this.syncAvailable) {
                try {
                    result = await chrome.storage.sync.get(['folders']);
                    if (result.folders && result.folders.length > 0) {
                        console.log('Loaded folders from sync storage');
                        loadedFromSync = true;
                    } else {
                        throw new Error('No folders in sync storage');
                    }
                } catch (syncError) {
                    console.log('Sync storage error for folders, falling back to local:', syncError.message);
                }
            }
            
            if (!loadedFromSync) {
                // Fallback to local storage
                console.log('Loading folders from local storage');
                result = await chrome.storage.local.get(['folders']);
                
                // If we have folders in local but not sync, try to migrate them (only if sync is available)
                if (this.syncAvailable && result.folders && result.folders.length > 0) {
                    console.log('Found folders in local storage, attempting to migrate to sync');
                    try {
                        await chrome.storage.sync.set({ folders: result.folders });
                        console.log('Successfully migrated folders to sync storage');
                    } catch (migrationError) {
                        console.log('Migration of folders to sync failed, keeping in local storage');
                    }
                }
            }
            
            this.folders = result.folders || [];
        } catch (error) {
            console.log('Error loading folders, using empty array');
            this.folders = [];
        }
    }

    async getDefaultBookmarks() {
        const defaultUrls = [
            { title: 'Google', url: 'https://www.google.com' },
            { title: 'GitHub', url: 'https://github.com' },
            { title: 'Stack Overflow', url: 'https://stackoverflow.com' },
            { title: 'YouTube', url: 'https://www.youtube.com' }
        ];

        const bookmarks = [];
        for (let i = 0; i < defaultUrls.length; i++) {
            const { title, url } = defaultUrls[i];
            const favicon = await this.getHighResolutionFavicon(url);
            bookmarks.push({
                id: Date.now() + i + 1,
                title,
                url,
                favicon,
                dateAdded: new Date().toISOString(),
                folderId: null
            });
        }
        
        return bookmarks;
    }

    async saveBookmarks() {
        try {
            // Try to save to sync storage first (only if available), fallback to local storage
            if (this.syncAvailable) {
                try {
                    // Check if bookmarks data is too large for sync storage
                    const data = { bookmarks: this.bookmarks, folders: this.folders };
                    const dataString = JSON.stringify(data);
                    const sizeInBytes = new TextEncoder().encode(dataString).length;
                    
                    // Chrome sync storage limits: 8KB per item, 100KB total
                    if (sizeInBytes > 8000) { // 8KB limit with some buffer
                        console.log('Data too large for sync storage, using local storage');
                        await chrome.storage.local.set(data);
                    } else {
                        await chrome.storage.sync.set(data);
                        console.log('Saved bookmarks and folders to sync storage');
                    }
                } catch (syncError) {
                    console.log('Sync storage failed, saving to local storage:', syncError.message);
                    await chrome.storage.local.set({ bookmarks: this.bookmarks, folders: this.folders });
                }
            } else {
                console.log('Sync not available, saving to local storage');
                await chrome.storage.local.set({ bookmarks: this.bookmarks, folders: this.folders });
            }
        } catch (error) {
            console.error('Error saving bookmarks:', error);
        }
    }

    showAddBookmarkModal() {
        document.getElementById('addBookmarkModal').classList.remove('hidden');
        
        // Show favicon selection UI immediately with empty state
        const faviconSelection = document.getElementById('faviconSelection');
        const faviconOptions = document.getElementById('faviconOptions');
        faviconSelection.classList.remove('hidden');
        faviconOptions.innerHTML = '<div class="text-sm text-gray-500 col-span-6 text-center">Enter a URL to load favicon options</div>';
        
        document.getElementById('bookmarkTitle').focus();
    }

    hideAddBookmarkModal() {
        document.getElementById('addBookmarkModal').classList.add('hidden');
        document.getElementById('addBookmarkForm').reset();
        document.getElementById('faviconSelection').classList.add('hidden');
        this.selectedFavicon = null;
        if (this.faviconDebounceTimer) {
            clearTimeout(this.faviconDebounceTimer);
        }
    }

    handleUrlInputChange(url) {
        if (this.faviconDebounceTimer) {
            clearTimeout(this.faviconDebounceTimer);
        }

        if (!url || !this.isValidUrlOrCanBeNormalized(url)) {
            document.getElementById('faviconSelection').classList.add('hidden');
            this.selectedFavicon = null;
            return;
        }

        // Show favicon selection UI immediately
        const faviconSelection = document.getElementById('faviconSelection');
        const faviconOptions = document.getElementById('faviconOptions');
        faviconSelection.classList.remove('hidden');
        faviconOptions.innerHTML = '<div class="text-sm text-gray-500 col-span-6 text-center">Loading favicon options...</div>';

        this.faviconDebounceTimer = setTimeout(() => {
            const normalizedUrl = this.normalizeUrl(url);
            
            // Update the input field with the normalized URL if it changed
            if (normalizedUrl !== url) {
                document.getElementById('bookmarkUrl').value = normalizedUrl;
            }
            
            this.loadFaviconOptions(normalizedUrl);
        }, 500);
    }

    handleEditUrlInputChange(url) {
        if (this.editFaviconDebounceTimer) {
            clearTimeout(this.editFaviconDebounceTimer);
        }

        if (!url || !this.isValidUrlOrCanBeNormalized(url)) {
            document.getElementById('editFaviconSelection').classList.add('hidden');
            this.selectedEditFavicon = null;
            return;
        }

        // Show favicon selection UI immediately
        const faviconSelection = document.getElementById('editFaviconSelection');
        const faviconOptions = document.getElementById('editFaviconOptions');
        faviconSelection.classList.remove('hidden');
        faviconOptions.innerHTML = '<div class="text-sm text-gray-500 col-span-6 text-center">Loading favicon options...</div>';

        this.editFaviconDebounceTimer = setTimeout(() => {
            const normalizedUrl = this.normalizeUrl(url);
            
            // Update the input field with the normalized URL if it changed
            if (normalizedUrl !== url) {
                document.getElementById('editBookmarkUrl').value = normalizedUrl;
            }
            
            this.loadEditFaviconOptions(normalizedUrl);
        }, 500);
    }

    async loadFaviconOptions(url) {
        const faviconSelection = document.getElementById('faviconSelection');
        const faviconOptions = document.getElementById('faviconOptions');
        
        faviconSelection.classList.remove('hidden');
        faviconOptions.innerHTML = '<div class="text-sm text-gray-500 col-span-6 text-center">Loading favicon options...</div>';

        try {
            const result = await this.getAllFaviconUrlsAndTitle(url);
            this.displayFaviconOptions(result.faviconUrls);
            
            // Auto-fill title if it's empty and we extracted a title
            const titleInput = document.getElementById('bookmarkTitle');
            if (result.pageTitle && (!titleInput.value || titleInput.value.trim() === '')) {
                titleInput.value = result.pageTitle;
            }
        } catch (error) {
            faviconOptions.innerHTML = '<div class="text-sm text-red-500 col-span-6 text-center">Failed to load favicon options</div>';
        }
    }

    async loadEditFaviconOptions(url) {
        const faviconSelection = document.getElementById('editFaviconSelection');
        const faviconOptions = document.getElementById('editFaviconOptions');
        
        faviconSelection.classList.remove('hidden');
        faviconOptions.innerHTML = '<div class="text-sm text-gray-500 col-span-6 text-center">Loading favicon options...</div>';

        try {
            const result = await this.getAllFaviconUrlsAndTitle(url);
            this.displayEditFaviconOptions(result.faviconUrls);
            
            // Auto-fill title if it's empty and we extracted a title
            const titleInput = document.getElementById('editBookmarkTitle');
            if (result.pageTitle && (!titleInput.value || titleInput.value.trim() === '')) {
                titleInput.value = result.pageTitle;
            }
        } catch (error) {
            faviconOptions.innerHTML = '<div class="text-sm text-red-500 col-span-6 text-center">Failed to load favicon options</div>';
        }
    }

    async getAllFaviconUrls(url) {
        const result = await this.getAllFaviconUrlsAndTitle(url);
        return result.faviconUrls;
    }

    async getAllFaviconUrlsAndTitle(url) {
        const hostname = new URL(url).hostname;
        const origin = new URL(url).origin;
        const faviconUrls = [];
        let pageTitle = null;

        // Check if we have a cached favicon for this domain
        const cachedFavicon = await this.getCachedFavicon(hostname);
        if (cachedFavicon) {
            faviconUrls.push({
                url: cachedFavicon,
                label: 'Cached Favicon'
            });
        }

        try {
            const response = await fetch(url);
            if (response.ok) {
                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                
                // Extract page title
                pageTitle = this.extractTitleFromDocument(doc);
                
                const faviconSelectors = [
                    'link[rel*="icon"][sizes*="192"]',
                    'link[rel*="icon"][sizes*="180"]',
                    'link[rel*="icon"][sizes*="152"]',
                    'link[rel*="icon"][sizes*="144"]',
                    'link[rel*="icon"][sizes*="128"]',
                    'link[rel*="icon"][sizes*="96"]',
                    'link[rel="apple-touch-icon"]',
                    'link[rel="apple-touch-icon-precomposed"]',
                    'link[rel="icon"]',
                    'link[rel="shortcut icon"]'
                ];
                
                for (const selector of faviconSelectors) {
                    const links = doc.querySelectorAll(selector);
                    for (const link of links) {
                        if (link.href) {
                            const faviconUrl = new URL(link.href, url).href;
                            const sizes = link.getAttribute('sizes') || 'unspecified';
                            faviconUrls.push({
                                url: faviconUrl,
                                label: `${link.rel} (${sizes})`
                            });
                        }
                    }
                }
            }
        } catch (e) {
            console.log('Could not parse HTML for favicons');
        }
        
        // Add alternative favicon services (these work better for authentication-protected sites)
        const alternativeSources = [
            { url: `https://icons.duckduckgo.com/ip3/${hostname}.ico`, label: 'DuckDuckGo Favicon' },
            { url: `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`, label: 'Google Favicon (64px)' },
        ];

        for (const {url: faviconUrl, label} of alternativeSources) {
            faviconUrls.push({
                url: faviconUrl,
                label: label
            });
        }

        // Add common favicon paths
        const commonPaths = [
            { path: '/apple-touch-icon.png', label: 'Apple Touch Icon' },
            { path: '/favicon-192x192.png', label: 'Android Chrome 192x192' },
            { path: '/favicon-96x96.png', label: 'Favicon 96x96' },
            { path: '/favicon-32x32.png', label: 'Favicon 32x32' },
            { path: '/favicon.ico', label: 'Classic Favicon' }
        ];

        for (const {path, label} of commonPaths) {
            faviconUrls.push({
                url: `${origin}${path}`,
                label: label
            });
        }

        // Remove duplicates
        const uniqueUrls = [];
        const seenUrls = new Set();
        for (const favicon of faviconUrls) {
            if (!seenUrls.has(favicon.url)) {
                seenUrls.add(favicon.url);
                uniqueUrls.push(favicon);
            }
        }

        return {
            faviconUrls: uniqueUrls,
            pageTitle: pageTitle
        };
    }

    async displayFaviconOptions(faviconUrls) {
        const faviconOptions = document.getElementById('faviconOptions');
        
        if (faviconUrls.length === 0) {
            faviconOptions.innerHTML = '<div class="text-sm text-gray-500 col-span-6 text-center">No favicon options found</div>';
            return;
        }

        faviconOptions.innerHTML = '';
        
        for (let i = 0; i < faviconUrls.length; i++) {
            const favicon = faviconUrls[i];
            const faviconElement = document.createElement('div');
            faviconElement.className = 'favicon-option w-10 h-10 border border-gray-300 rounded cursor-pointer hover:border-blue-500 flex items-center justify-center bg-white transition-colors';
            faviconElement.title = favicon.label;
            faviconElement.dataset.faviconUrl = favicon.url;
            
            const img = document.createElement('img');
            img.src = favicon.url;
            img.className = 'w-8 h-8 rounded';
            img.style.display = 'block';
            
            const fallback = document.createElement('div');
            fallback.className = 'w-8 h-8 bg-gray-300 rounded flex items-center justify-center text-xs text-gray-600';
            fallback.textContent = '?';
            fallback.style.display = 'none';
            
            img.onerror = () => {
                img.style.display = 'none';
                fallback.style.display = 'flex';
                // Mark this favicon as problematic
                faviconElement.classList.add('favicon-error');
                faviconElement.title = favicon.label + ' (failed to load)';
            };
            
            faviconElement.appendChild(img);
            faviconElement.appendChild(fallback);
            
            faviconElement.addEventListener('click', async () => {
                await this.selectFavicon(faviconElement, favicon.url);
            });
            
            faviconOptions.appendChild(faviconElement);
            
            // Auto-select first option
            if (i === 0) {
                await this.selectFavicon(faviconElement, favicon.url);
            }
        }
    }

    async displayEditFaviconOptions(faviconUrls) {
        const faviconOptions = document.getElementById('editFaviconOptions');
        
        if (faviconUrls.length === 0) {
            faviconOptions.innerHTML = '<div class="text-sm text-gray-500 col-span-6 text-center">No favicon options found</div>';
            return;
        }

        faviconOptions.innerHTML = '';
        
        for (let i = 0; i < faviconUrls.length; i++) {
            const favicon = faviconUrls[i];
            const faviconElement = document.createElement('div');
            faviconElement.className = 'edit-favicon-option w-10 h-10 border border-gray-300 rounded cursor-pointer hover:border-blue-500 flex items-center justify-center bg-white transition-colors';
            faviconElement.title = favicon.label;
            faviconElement.dataset.faviconUrl = favicon.url;
            
            const img = document.createElement('img');
            img.src = favicon.url;
            img.className = 'w-8 h-8 rounded';
            img.style.display = 'block';
            
            const fallback = document.createElement('div');
            fallback.className = 'w-8 h-8 bg-gray-300 rounded flex items-center justify-center text-xs text-gray-600';
            fallback.textContent = '?';
            fallback.style.display = 'none';
            
            img.onerror = () => {
                img.style.display = 'none';
                fallback.style.display = 'flex';
                // Mark this favicon as problematic
                faviconElement.classList.add('favicon-error');
                faviconElement.title = favicon.label + ' (failed to load)';
            };
            
            faviconElement.appendChild(img);
            faviconElement.appendChild(fallback);
            
            faviconElement.addEventListener('click', async () => {
                await this.selectEditFavicon(faviconElement, favicon.url);
            });
            
            faviconOptions.appendChild(faviconElement);
            
            // Auto-select first option
            if (i === 0) {
                await this.selectEditFavicon(faviconElement, favicon.url);
            }
        }
    }

    async selectFavicon(element, url) {
        // Remove previous selection
        const currentSelected = document.querySelector('.favicon-option.selected');
        if (currentSelected) {
            currentSelected.classList.remove('selected', 'border-blue-500', 'bg-blue-50');
            currentSelected.classList.add('border-gray-300', 'bg-white');
            currentSelected.style.borderWidth = '1px';
        }
        
        // Add selection to new element
        element.classList.remove('border-gray-300', 'bg-white');
        element.classList.add('selected', 'border-blue-500', 'bg-blue-50');
        element.style.borderWidth = '2px';
        
        // If this is not already a cached favicon (base64 data URL), cache it
        if (!url.startsWith('data:')) {
            const normalizedUrl = this.normalizeUrl(document.getElementById('bookmarkUrl').value);
            const hostname = new URL(normalizedUrl).hostname;
            const cachedData = await this.downloadAndCacheFavicon(hostname, url);
            if (cachedData) {
                this.selectedFavicon = cachedData;
            } else {
                this.selectedFavicon = null; // Don't use external URL if caching fails
            }
        } else {
            this.selectedFavicon = url;
        }
    }

    async selectEditFavicon(element, url) {
        // Remove previous selection
        const currentSelected = document.querySelector('.edit-favicon-option.selected');
        if (currentSelected) {
            currentSelected.classList.remove('selected', 'border-blue-500', 'bg-blue-50');
            currentSelected.classList.add('border-gray-300', 'bg-white');
            currentSelected.style.borderWidth = '1px';
        }
        
        // Add selection to new element
        element.classList.remove('border-gray-300', 'bg-white');
        element.classList.add('selected', 'border-blue-500', 'bg-blue-50');
        element.style.borderWidth = '2px';
        
        // If this is not already a cached favicon (base64 data URL), cache it
        if (!url.startsWith('data:')) {
            const normalizedUrl = this.normalizeUrl(document.getElementById('editBookmarkUrl').value);
            const hostname = new URL(normalizedUrl).hostname;
            const cachedData = await this.downloadAndCacheFavicon(hostname, url);
            if (cachedData) {
                this.selectedEditFavicon = cachedData;
            } else {
                this.selectedEditFavicon = null; // Don't use external URL if caching fails
            }
        } else {
            this.selectedEditFavicon = url;
        }
    }

    async addBookmark() {
        const title = document.getElementById('bookmarkTitle').value.trim();
        const rawUrl = document.getElementById('bookmarkUrl').value.trim();
        const url = this.normalizeUrl(rawUrl);

        if (!title || !url) return;

        const bookmark = {
            id: Date.now(),
            title,
            url,
            favicon: this.selectedFavicon || '',
            dateAdded: new Date().toISOString(),
            folderId: null // null means it's not in a folder
        };

        // Check if a favicon was selected before hiding modal (which resets selectedFavicon)
        const faviconWasSelected = !!this.selectedFavicon;
        
        this.bookmarks.unshift(bookmark);
        await this.saveBookmarks();
        this.renderQuickAccess();
        this.hideAddBookmarkModal();
        
        // Only update favicon async if no favicon was selected
        if (!faviconWasSelected) {
            this.updateFaviconAsync(bookmark.id, url);
        }
    }



    // Remove setView method since we only have favicon view now

    renderQuickAccess() {
        const quickAccessContainer = document.getElementById('quickAccess');
        
        // Always show main view bookmarks (those not in folders) in the main area
        // The openFolderId is only used for the folder modal, not the main view
        const visibleBookmarks = this.bookmarks.filter(b => !b.folderId);
        
        // Render folder tiles (always show in main view)
        const folderTiles = this.folders.map(folder => {
            const paddingClass = this.settings.showTitles ? 'pt-2 px-4 pb-6' : 'p-4';
            
            return `
            <div class="tile w-24 h-24 relative bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-300 hover:shadow-md transition-all duration-200 cursor-pointer" 
                 data-folder-id="${folder.id}" 
                 draggable="false"
                 title="${folder.name}">
                <div class="tile-icon absolute inset-0 flex items-center justify-center ${paddingClass}">
                    <div class="w-full h-full bg-amber-500 rounded-lg flex items-center justify-center text-white">
                        <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
                        </svg>
                    </div>
                </div>
                ${this.settings.showTitles ? `
                <div class="tile-title absolute bottom-1 left-1 right-1">
                    <span class="text-xs text-gray-800 text-center block truncate">${folder.name}</span>
                </div>` : ''}
            </div>
        `;
        }).join('');
        
        const bookmarkTiles = visibleBookmarks.map(bookmark => {
            const paddingClass = this.settings.showTitles ? 'pt-2 px-4 pb-6' : 'p-4';
            
            return `
            <div class="tile w-24 h-24 relative bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-200 hover:shadow-md transition-all duration-200 cursor-pointer" 
                 data-bookmark-id="${bookmark.id}" 
                 draggable="true"
                 title="${bookmark.title}">
                <a draggable="false" href="${bookmark.url}" aria-label="${bookmark.title}" class="absolute inset-0"></a>
                <div class="tile-icon absolute inset-0 flex items-center justify-center ${paddingClass}">
                    <img draggable="false" alt="" src="${bookmark.favicon}" class="w-full h-full rounded-lg object-cover bookmark-favicon" style="display: ${bookmark.favicon ? 'block' : 'none'};">
                    <div class="w-full h-full bg-blue-500 rounded-lg flex items-center justify-center text-white text-2xl font-bold bookmark-fallback" style="display: ${bookmark.favicon ? 'none' : 'block'};">
                        ${bookmark.title.charAt(0).toUpperCase()}
                    </div>
                </div>
                ${this.settings.showTitles ? `
                <div class="tile-title absolute bottom-1 left-1 right-1">
                    <span class="text-xs text-gray-800 text-center block truncate">${bookmark.title}</span>
                </div>` : ''}
            </div>
        `;
        }).join('');

        const addButtonTile = `
            <div id="addBookmarkTile" class="tile w-24 h-24 relative bg-gray-50 border border-gray-200 border-dashed rounded-lg hover:bg-gray-200 hover:shadow-md transition-all duration-200 cursor-pointer" 
                 title="Add New Bookmark">
                <div class="absolute inset-0 flex items-center justify-center">
                    <span class="text-custom-accent leading-none plus-icon">+</span>
                </div>
            </div>
        `;

        quickAccessContainer.innerHTML = folderTiles + bookmarkTiles + (this.settings.showAddButton ? addButtonTile : '');
        
        // Add event listeners for bookmark clicks and right-clicks
        visibleBookmarks.forEach(bookmark => {
            const bookmarkElement = quickAccessContainer.querySelector(`[data-bookmark-id="${bookmark.id}"]`);
            if (!bookmarkElement) return; // Skip if element not found
            
            // Left click - navigate to URL (only if not dragging)
            bookmarkElement.addEventListener('click', (e) => {
                if (e.button === 0 && !this.isDragging) { // Left click and not dragging
                    window.location.href = bookmark.url;
                }
            });
            
            // Middle click - open in new background tab
            bookmarkElement.addEventListener('mousedown', (e) => {
                if (e.button === 1 && !this.isDragging) { // Middle click and not dragging
                    e.preventDefault();
                    chrome.tabs.create({ url: bookmark.url, active: false });
                }
            });
            
            // Right click - show context menu
            bookmarkElement.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showContextMenu(e, bookmark.id);
            });

            // Drag start
            bookmarkElement.addEventListener('dragstart', (e) => {
                this.isDragging = true;
                this.draggedBookmarkId = bookmark.id;
                bookmarkElement.style.opacity = '0.5';
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/html', bookmarkElement.outerHTML);
            });

            // Drag end
            bookmarkElement.addEventListener('dragend', (e) => {
                this.isDragging = false;
                this.draggedBookmarkId = null;
                bookmarkElement.style.opacity = '1';
                this.removeDragIndicator();
            });

            // Drag over - show drop indicator
            bookmarkElement.addEventListener('dragover', (e) => {
                if (this.draggedBookmarkId && this.draggedBookmarkId !== bookmark.id) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    this.showDragIndicator(bookmarkElement, e);
                }
            });

            // Drop - reorder bookmarks
            bookmarkElement.addEventListener('drop', (e) => {
                if (this.draggedBookmarkId && this.draggedBookmarkId !== bookmark.id) {
                    e.preventDefault();
                    this.reorderBookmarks(this.draggedBookmarkId, bookmark.id, e);
                    this.removeDragIndicator();
                }
            });

            // Handle favicon error - show fallback
            const faviconImg = bookmarkElement.querySelector('.bookmark-favicon');
            const fallbackDiv = bookmarkElement.querySelector('.bookmark-fallback');
            
            faviconImg.addEventListener('error', () => {
                faviconImg.style.display = 'none';
                fallbackDiv.style.display = 'block';
            });
        });

        // Add event listeners for folder tiles
        this.folders.forEach(folder => {
            const folderElement = quickAccessContainer.querySelector(`[data-folder-id="${folder.id}"]`);
            if (folderElement) {
                // Left click - open folder
                folderElement.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.openFolder(folder.id);
                });
                
                // Right click - show folder context menu
                folderElement.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this.showFolderContextMenu(e, folder.id);
                });

                // Drag over - accept bookmarks
                folderElement.addEventListener('dragover', (e) => {
                    if (this.draggedBookmarkId && !this.openFolderId) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        folderElement.classList.add('bg-amber-200', 'border-amber-400');
                    }
                });

                // Drag leave - remove drop indicator
                folderElement.addEventListener('dragleave', (e) => {
                    folderElement.classList.remove('bg-amber-200', 'border-amber-400');
                });

                // Drop - move bookmark to folder
                folderElement.addEventListener('drop', (e) => {
                    if (this.draggedBookmarkId && !this.openFolderId) {
                        e.preventDefault();
                        this.moveBookmarkToFolder(this.draggedBookmarkId, folder.id);
                        folderElement.classList.remove('bg-amber-200', 'border-amber-400');
                    }
                });
            }
        });

        // Add event listener for the add bookmark tile
        const addBookmarkTile = quickAccessContainer.querySelector('#addBookmarkTile');
        if (addBookmarkTile) {
            addBookmarkTile.addEventListener('click', () => {
                this.showAddBookmarkModal();
            });
        }
    }

    showDragIndicator(targetElement, event) {
        this.removeDragIndicator();
        
        const rect = targetElement.getBoundingClientRect();
        const midPoint = rect.left + rect.width / 2;
        const isRightSide = event.clientX > midPoint;
        
        const indicator = document.createElement('div');
        indicator.id = 'dragIndicator';
        indicator.className = 'absolute top-0 bottom-0 w-1 bg-blue-500 z-50 rounded-full';
        indicator.style.height = `${rect.height}px`;
        
        if (isRightSide) {
            indicator.style.left = `${rect.right}px`;
        } else {
            indicator.style.left = `${rect.left - 4}px`;
        }
        
        indicator.style.top = `${rect.top}px`;
        document.body.appendChild(indicator);
    }

    removeDragIndicator() {
        const indicator = document.getElementById('dragIndicator');
        if (indicator) {
            indicator.remove();
        }
    }

    async reorderBookmarks(draggedId, targetId, event) {
        const draggedIndex = this.bookmarks.findIndex(b => b.id == draggedId);
        const targetIndex = this.bookmarks.findIndex(b => b.id == targetId);
        
        if (draggedIndex === -1 || targetIndex === -1) return;
        
        // Determine if we're inserting before or after the target
        const targetElement = document.querySelector(`[data-bookmark-id="${targetId}"]`);
        const rect = targetElement.getBoundingClientRect();
        const midPoint = rect.left + rect.width / 2;
        const insertAfter = event.clientX > midPoint;
        
        // Remove the dragged bookmark from its current position
        const draggedBookmark = this.bookmarks.splice(draggedIndex, 1)[0];
        
        // Calculate new insert position
        let newIndex = targetIndex;
        if (draggedIndex < targetIndex) {
            newIndex = insertAfter ? targetIndex : targetIndex - 1;
        } else {
            newIndex = insertAfter ? targetIndex + 1 : targetIndex;
        }
        
        // Insert bookmark at new position
        this.bookmarks.splice(newIndex, 0, draggedBookmark);
        
        // Save and re-render
        await this.saveBookmarks();
        this.renderQuickAccess();
    }

    // Helper function to set appropriate z-index class based on open modals
    setElementZIndex(element) {
        // Remove all possible z-index classes first
        element.classList.remove('z-50', 'z-60', 'z-70', 'z-80', 'z-90');
        
        // Check which modals are open to determine appropriate z-index
        const modals = [
            { id: 'addBookmarkModal', zIndex: 50 },
            { id: 'editBookmarkModal', zIndex: 60 },
            { id: 'deleteConfirmPopup', zIndex: 50 },
            { id: 'createFolderModal', zIndex: 50 },
            { id: 'renameFolderModal', zIndex: 50 },
            { id: 'folderModal', zIndex: 50 },
            { id: 'settingsModal', zIndex: 50 }
        ];
        
        let highestModalZIndex = 0;
        
        for (const modal of modals) {
            const modalElement = document.getElementById(modal.id);
            if (modalElement && !modalElement.classList.contains('hidden')) {
                highestModalZIndex = Math.max(highestModalZIndex, modal.zIndex);
            }
        }
        
        // Set appropriate z-index class based on highest modal
        if (highestModalZIndex >= 60) {
            element.classList.add('z-80'); // Above edit modals
        } else if (highestModalZIndex >= 50) {
            element.classList.add('z-70'); // Above regular modals  
        } else {
            element.classList.add('z-60'); // Default high level
        }
    }

    showContextMenu(event, bookmarkId) {
        console.log('showContextMenu called with bookmarkId:', bookmarkId);
        this.currentBookmarkId = bookmarkId;
        const contextMenu = document.getElementById('contextMenu');
        
        // Show bookmark menu items and hide folder menu items
        document.getElementById('editBookmark').classList.remove('hidden');
        document.getElementById('duplicateBookmark').classList.remove('hidden');
        document.getElementById('deleteBookmark').classList.remove('hidden');
        document.getElementById('renameFolder').classList.add('hidden');
        document.getElementById('deleteFolder').classList.add('hidden');
        
        // Set z-index based on open modals
        this.setElementZIndex(contextMenu);
        
        // Note: Dynamic positioning requires style attributes since Tailwind can't handle pixel-perfect dynamic positioning
        contextMenu.style.left = `${event.pageX}px`;
        contextMenu.style.top = `${event.pageY}px`;
        contextMenu.classList.remove('hidden');
        
        // Adjust position if menu goes off screen
        const rect = contextMenu.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        if (rect.right > windowWidth) {
            contextMenu.style.left = `${event.pageX - rect.width}px`;
        }
        if (rect.bottom > windowHeight) {
            contextMenu.style.top = `${event.pageY - rect.height}px`;
        }
    }

    hideContextMenu() {
        const contextMenu = document.getElementById('contextMenu');
        contextMenu.classList.add('hidden');
        // Reset z-index to default
        contextMenu.classList.remove('z-70', 'z-80', 'z-90');
        contextMenu.classList.add('z-60');
        // Don't clear currentBookmarkId or currentFolderId here as they're needed for edit/delete operations
    }

    showEditBookmarkModal() {
        console.log('showEditBookmarkModal called, currentBookmarkId:', this.currentBookmarkId);
        const bookmark = this.bookmarks.find(b => b.id === this.currentBookmarkId);
        console.log('Found bookmark:', bookmark);
        if (!bookmark) {
            console.log('No bookmark found, exiting');
            return;
        }
        
        // Highlight the bookmark being edited
        this.highlightBookmarkBeingEdited(this.currentBookmarkId);
        
        const modal = document.getElementById('editBookmarkModal');
        const modalTitle = modal.querySelector('h3');
        modalTitle.textContent = 'Edit Bookmark';
        
        document.getElementById('editBookmarkTitle').value = bookmark.title;
        document.getElementById('editBookmarkUrl').value = bookmark.url;
        
        // Set z-index based on open modals
        this.setElementZIndex(modal);
        
        // Position the modal near the bookmark being edited
        this.positionEditModal(modal);
        
        // Show favicon selection UI immediately
        const faviconSelection = document.getElementById('editFaviconSelection');
        const faviconOptions = document.getElementById('editFaviconOptions');
        faviconSelection.classList.remove('hidden');
        faviconOptions.innerHTML = '<div class="text-sm text-gray-500 col-span-6 text-center">Loading favicon options...</div>';
        
        // Trigger favicon loading for the current URL
        this.handleEditUrlInputChange(bookmark.url);
        
        modal.classList.remove('hidden');
        document.getElementById('editBookmarkTitle').focus();
    }

    showDuplicateBookmarkModal() {
        console.log('showDuplicateBookmarkModal called, currentBookmarkId:', this.currentBookmarkId);
        const bookmark = this.bookmarks.find(b => b.id === this.currentBookmarkId);
        console.log('Found bookmark:', bookmark);
        if (!bookmark) {
            console.log('No bookmark found, exiting');
            return;
        }
        
        // Highlight the bookmark being duplicated
        this.highlightBookmarkBeingEdited(this.currentBookmarkId);
        
        const modal = document.getElementById('editBookmarkModal');
        const modalTitle = modal.querySelector('h3');
        modalTitle.textContent = 'Duplicate Bookmark';
        
        document.getElementById('editBookmarkTitle').value = bookmark.title;
        document.getElementById('editBookmarkUrl').value = bookmark.url;
        
        // Set z-index based on open modals
        this.setElementZIndex(modal);
        
        // Position the modal near the bookmark being duplicated
        this.positionEditModal(modal);
        
        modal.classList.remove('hidden');
        document.getElementById('editBookmarkTitle').focus();
    }

    async hideEditBookmarkModal() {
        // Remove highlighting
        this.removeBookmarkHighlight();
        
        const modal = document.getElementById('editBookmarkModal');
        modal.classList.add('hidden');
        // Reset z-index to default
        modal.classList.remove('z-70', 'z-80', 'z-90');
        modal.classList.add('z-60');
        document.getElementById('editBookmarkForm').reset();
        document.getElementById('editFaviconSelection').classList.add('hidden');
        this.selectedEditFavicon = null;
        this.currentBookmarkId = null;
        if (this.editFaviconDebounceTimer) {
            clearTimeout(this.editFaviconDebounceTimer);
        }
        this.isDuplicateMode = false;
        this.duplicatedBookmarkId = null;
    }

    async cancelEditBookmarkModal() {
        // If we're in duplicate mode and cancelling, delete the duplicate
        if (this.isDuplicateMode && this.duplicatedBookmarkId) {
            await this.deleteBookmarkById(this.duplicatedBookmarkId);
            this.renderQuickAccess();
        }
        
        this.hideEditBookmarkModal();
    }

    async updateBookmark() {
        console.log('updateBookmark called, currentBookmarkId:', this.currentBookmarkId);
        
        if (!this.currentBookmarkId) {
            console.log('No currentBookmarkId, exiting');
            return;
        }
        
        const title = document.getElementById('editBookmarkTitle').value.trim();
        const rawUrl = document.getElementById('editBookmarkUrl').value.trim();
        const url = this.normalizeUrl(rawUrl);

        console.log('Form values:', { title, url });

        if (!title || !url) {
            console.log('Missing title or url, exiting');
            return;
        }

        const bookmarkIndex = this.bookmarks.findIndex(b => b.id === this.currentBookmarkId);
        console.log('Found bookmark at index:', bookmarkIndex);
        
        if (bookmarkIndex === -1) {
            console.log('Bookmark not found, exiting');
            return;
        }

        const oldUrl = this.bookmarks[bookmarkIndex].url;

        console.log('Updating bookmark...');
        
        // Check if a favicon was selected, otherwise keep the existing one
        const updatedBookmark = {
            ...this.bookmarks[bookmarkIndex],
            title,
            url
        };
        
        // If a favicon was selected in the edit form, use it
        if (this.selectedEditFavicon !== null) {
            updatedBookmark.favicon = this.selectedEditFavicon;
        }
        
        this.bookmarks[bookmarkIndex] = updatedBookmark;

        console.log('Saving bookmarks...');
        await this.saveBookmarks();
        console.log('Rendering...');
        this.renderQuickAccess();
        
        // If we're in a folder modal and the edited bookmark is in that folder, update the folder view
        const editedBookmark = this.bookmarks[bookmarkIndex];
        if (this.openFolderId && editedBookmark && editedBookmark.folderId === this.openFolderId) {
            this.renderFolderBookmarks(this.openFolderId);
        }
        
        console.log('Hiding modal...');
        this.hideEditBookmarkModal();
        
        // Only update favicon async if no favicon was manually selected and URL changed
        if (url !== oldUrl && this.selectedEditFavicon === null) {
            this.updateFaviconAsync(this.currentBookmarkId, url);
        }
        console.log('Update complete');
    }

    async duplicateBookmark() {
        if (!this.currentBookmarkId) return;
        
        const bookmark = this.bookmarks.find(b => b.id === this.currentBookmarkId);
        if (!bookmark) return;
        
        const duplicatedBookmark = {
            ...bookmark,
            id: Date.now(),
            title: bookmark.title,
            dateAdded: new Date().toISOString()
        };
        
        const originalIndex = this.bookmarks.findIndex(b => b.id === this.currentBookmarkId);
        this.bookmarks.splice(originalIndex + 1, 0, duplicatedBookmark);
        await this.saveBookmarks();
        this.renderQuickAccess();
        
        // If we're in a folder modal, also update the folder view
        if (this.openFolderId && bookmark.folderId === this.openFolderId) {
            this.renderFolderBookmarks(this.openFolderId);
        }
        
        this.currentBookmarkId = duplicatedBookmark.id;
        this.isDuplicateMode = true;
        this.duplicatedBookmarkId = duplicatedBookmark.id;
        this.showDuplicateBookmarkModal();
        
        setTimeout(() => {
            const titleInput = document.getElementById('editBookmarkTitle');
            titleInput.focus();
            titleInput.select();
        }, 100);
    }

    async copyBookmarkUrl() {
        if (!this.currentBookmarkId) return;
        
        const bookmark = this.bookmarks.find(b => b.id === this.currentBookmarkId);
        if (!bookmark) return;
        
        try {
            await navigator.clipboard.writeText(bookmark.url);
            console.log('Bookmark URL copied to clipboard:', bookmark.url);
            this.showCopyNotification();
        } catch (error) {
            console.error('Failed to copy URL to clipboard:', error);
            
            // Fallback for browsers that don't support navigator.clipboard
            try {
                const textArea = document.createElement('textarea');
                textArea.value = bookmark.url;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                console.log('Bookmark URL copied to clipboard (fallback method):', bookmark.url);
                this.showCopyNotification();
            } catch (fallbackError) {
                console.error('Failed to copy URL with fallback method:', fallbackError);
                // Don't show notification if both methods failed
            }
        }
    }

    showCopyNotification() {
        const notification = document.getElementById('copyNotification');
        const notificationContent = notification.querySelector('div');
        
        // Show the notification container
        notification.classList.remove('hidden');
        
        // Animate the notification content sliding in from the right
        setTimeout(() => {
            notificationContent.classList.remove('translate-x-full');
            notificationContent.classList.add('translate-x-0');
        }, 10);
        
        // Hide the notification after 2 seconds
        setTimeout(() => {
            notificationContent.classList.remove('translate-x-0');
            notificationContent.classList.add('translate-x-full');
            
            // Hide the container after animation completes
            setTimeout(() => {
                notification.classList.add('hidden');
            }, 300);
        }, 2000);
    }

    async updateFaviconAsync(bookmarkId, url) {
        try {
            const faviconUrl = await this.getHighResolutionFavicon(url);
            const bookmarkIndex = this.bookmarks.findIndex(b => b.id === bookmarkId);
            
            if (bookmarkIndex !== -1 && faviconUrl) {
                this.bookmarks[bookmarkIndex].favicon = faviconUrl;
                await this.saveBookmarks();
                
                const bookmarkElement = document.querySelector(`[data-bookmark-id="${bookmarkId}"]`);
                if (bookmarkElement) {
                    const faviconImg = bookmarkElement.querySelector('.bookmark-favicon');
                    const fallbackDiv = bookmarkElement.querySelector('.bookmark-fallback');
                    
                    if (faviconImg && fallbackDiv) {
                        faviconImg.src = faviconUrl;
                        faviconImg.style.display = 'block';
                        fallbackDiv.style.display = 'none';
                        
                        // Since we're using base64 data URLs, errors should be rare
                        faviconImg.onerror = () => {
                            faviconImg.style.display = 'none';
                            fallbackDiv.style.display = 'block';
                        };
                    }
                }
            }
        } catch (error) {
            console.log('Failed to update favicon asynchronously:', error);
        }
    }

    showDeleteConfirmation(event) {
        if (!this.currentBookmarkId) return;
        
        const popup = document.getElementById('deleteConfirmPopup');
        const bookmark = this.bookmarks.find(b => b.id === this.currentBookmarkId);
        
        if (!bookmark) return;
        
        // Highlight the bookmark being deleted
        this.highlightBookmarkForDeletion(this.currentBookmarkId);
        
        // Update the confirmation message with the bookmark title
        const messageElement = document.getElementById('deleteConfirmMessage');
        messageElement.innerHTML = `Are you sure you want to delete <strong>${bookmark.title}</strong>?`;
        
        // Position the popup near the bookmark being deleted
        const bookmarkElement = document.querySelector(`[data-bookmark-id="${this.currentBookmarkId}"]`);
        if (bookmarkElement) {
            const rect = bookmarkElement.getBoundingClientRect();
            const popupRect = popup.getBoundingClientRect();
            
            // Position popup to the right of the bookmark, or left if not enough space
            let left = rect.right + 10;
            let top = rect.top;
            
            // Check if popup would go off screen horizontally
            if (left + 256 > window.innerWidth) { // 256px is popup width (w-64)
                left = rect.left - 256 - 10;
            }
            
            // Check if popup would go off screen vertically
            if (top + 100 > window.innerHeight) { // Approximate popup height
                top = rect.bottom - 100;
            }
            
            // Ensure popup doesn't go above viewport
            if (top < 0) {
                top = 10;
            }
            
            // Note: Dynamic positioning requires style attributes since Tailwind can't handle pixel-perfect dynamic positioning  
            popup.style.left = `${left}px`;
            popup.style.top = `${top}px`;
        }
        
        // Set z-index based on open modals
        this.setElementZIndex(popup);
        
        popup.classList.remove('hidden');
    }
    
    hideDeleteConfirmation() {
        // Remove delete highlighting for both bookmarks and folders
        this.removeDeleteHighlight();
        this.removeFolderDeleteHighlight();
        const popup = document.getElementById('deleteConfirmPopup');
        popup.classList.add('hidden');
        // Reset z-index to default
        popup.classList.remove('z-60', 'z-70', 'z-80', 'z-90');
        popup.classList.add('z-50');
    }
    
    async confirmDeleteBookmark() {
        // Handle both bookmark and folder deletion
        if (this.currentBookmarkId) {
            // Delete bookmark
            this.removeDeleteHighlight();
            
            // Get the bookmark before deleting to check if it was in a folder
            const deletedBookmark = this.bookmarks.find(b => b.id === this.currentBookmarkId);
            
            this.bookmarks = this.bookmarks.filter(b => b.id !== this.currentBookmarkId);
            await this.saveBookmarks();
            this.renderQuickAccess();
            
            // If we're in a folder modal and the deleted bookmark was in that folder, update the folder view
            if (this.openFolderId && deletedBookmark && deletedBookmark.folderId === this.openFolderId) {
                this.renderFolderBookmarks(this.openFolderId);
            }
            
            this.currentBookmarkId = null;
        } else if (this.currentFolderId) {
            // Delete folder
            this.removeFolderDeleteHighlight();
            
            // Move all bookmarks in this folder back to main view
            this.bookmarks.forEach(bookmark => {
                if (bookmark.folderId === this.currentFolderId) {
                    bookmark.folderId = null; // Remove from folder
                }
            });
            
            // Close folder modal if this folder was open
            if (this.openFolderId === this.currentFolderId) {
                this.closeFolderModal();
            }
            
            // Remove the folder
            this.folders = this.folders.filter(f => f.id !== this.currentFolderId);
            
            // Save changes and update UI
            await this.saveBookmarks();
            this.renderQuickAccess();
            this.currentFolderId = null;
        }
    }

    async deleteBookmark() {
        // This method is now deprecated in favor of showDeleteConfirmation
        // Keeping for backward compatibility but it won't be used
        if (!this.currentBookmarkId) return;
        
        if (confirm('Are you sure you want to delete this bookmark?')) {
            this.bookmarks = this.bookmarks.filter(b => b.id !== this.currentBookmarkId);
            await this.saveBookmarks();
            this.renderQuickAccess();
        }
    }

    async deleteBookmarkById(bookmarkId) {
        this.bookmarks = this.bookmarks.filter(b => b.id !== bookmarkId);
        await this.saveBookmarks();
    }

    // Bookmark highlighting methods
    highlightBookmarkBeingEdited(bookmarkId) {
        // Remove any existing highlights
        this.removeBookmarkHighlight();
        
        // Add highlight to the current bookmark
        const bookmarkElement = document.querySelector(`[data-bookmark-id="${bookmarkId}"]`);
        if (bookmarkElement) {
            bookmarkElement.classList.add('tile-highlighted');
        }
    }

    removeBookmarkHighlight() {
        const highlightedElement = document.querySelector('.tile-highlighted');
        if (highlightedElement) {
            highlightedElement.classList.remove('tile-highlighted');
        }
    }

    // Delete highlighting methods
    highlightBookmarkForDeletion(bookmarkId) {
        // Remove any existing highlights
        this.removeBookmarkHighlight();
        this.removeDeleteHighlight();
        
        // Add delete highlight to the current bookmark
        const bookmarkElement = document.querySelector(`[data-bookmark-id="${bookmarkId}"]`);
        if (bookmarkElement) {
            bookmarkElement.classList.add('tile-delete-highlighted');
        }
    }

    removeDeleteHighlight() {
        const deleteHighlightedElement = document.querySelector('.tile-delete-highlighted');
        if (deleteHighlightedElement) {
            deleteHighlightedElement.classList.remove('tile-delete-highlighted');
        }
    }

    // Position edit modal near the bookmark being edited
    positionEditModal(modal) {
        if (!this.currentBookmarkId) return;
        
        const bookmarkElement = document.querySelector(`[data-bookmark-id="${this.currentBookmarkId}"]`);
        if (!bookmarkElement) return;
        
        const rect = bookmarkElement.getBoundingClientRect();
        
        // Position modal to the right of the bookmark, or left if not enough space
        let left = rect.right + 10;
        let top = rect.top;
        
        // Check if modal would go off screen horizontally (384px is modal width - w-96)
        if (left + 384 > window.innerWidth) {
            left = rect.left - 384 - 10;
        }
        
        // Check if modal would go off screen vertically (approximate modal height ~300px)
        if (top + 300 > window.innerHeight) {
            top = rect.bottom - 300;
        }
        
        // Ensure modal doesn't go above viewport
        if (top < 0) {
            top = 10;
        }
        
        // Ensure modal doesn't go too far left
        if (left < 10) {
            left = 10;
        }
        
        // Note: Dynamic positioning requires style attributes since Tailwind can't handle pixel-perfect dynamic positioning
        modal.style.left = `${left}px`;
        modal.style.top = `${top}px`;
    }

    // Settings functionality
    async loadSettings() {
        try {
            const data = await chrome.storage.local.get(['bookmarkSettings']);
            if (data.bookmarkSettings) {
                this.settings = { ...this.settings, ...data.bookmarkSettings };
            }
        } catch (error) {
            console.warn('Failed to load settings:', error);
        }
    }

    async saveSettingsToStorage() {
        try {
            await chrome.storage.local.set({
                bookmarkSettings: this.settings
            });
        } catch (error) {
            console.warn('Failed to save settings:', error);
        }
    }

    showSettingsModal() {
        const modal = document.getElementById('settingsModal');
        
        // Load current settings into the modal
        this.loadCurrentSettingsIntoForm();
        
        // Update sync status in settings modal
        this.updateSettingsSyncStatus();
        
        // Position modal at bottom right with specific margins
        modal.classList.remove('hidden');
        modal.classList.add('right-6', 'bottom-20', 'mr-8', '-mb-4');
    }

    hideSettingsModal() {
        const modal = document.getElementById('settingsModal');
        modal.classList.add('hidden');
        modal.classList.remove('right-6', 'bottom-20', 'mr-8', '-mb-4');
        // Reset form to current settings
        this.loadCurrentSettingsIntoForm();
    }

    loadCurrentSettingsIntoForm() {
        const showTitlesToggle = document.getElementById('showTitles');
        const showAddButtonToggle = document.getElementById('showAddButton');
        const tilesPerRowSlider = document.getElementById('tilesPerRow');
        const tilesPerRowValue = document.getElementById('tilesPerRowValue');
        const tileGapSlider = document.getElementById('tileGap');
        const tileGapValue = document.getElementById('tileGapValue');
        
        showTitlesToggle.checked = this.settings.showTitles;
        this.updateToggleVisual(showTitlesToggle);
        
        showAddButtonToggle.checked = this.settings.showAddButton;
        this.updateToggleVisual(showAddButtonToggle);
        
        tilesPerRowSlider.value = this.settings.tilesPerRow;
        tilesPerRowValue.textContent = this.settings.tilesPerRow;
        
        tileGapSlider.value = this.settings.tileGap;
        tileGapValue.textContent = this.settings.tileGap;
    }

    async saveSettings() {
        // Save current settings to storage
        await this.saveSettingsToStorage();
    }

    updateTilesPerRowCSS(tilesPerRow) {
        const quickAccess = document.getElementById('quickAccess');
        const folderBookmarks = document.getElementById('folderBookmarks');
        
        // Map tiles per row to appropriate max-width classes - updated for proper gap spacing
        // Each tile is 96px (w-24), gaps are 16px default, so: tiles*96 + (tiles-1)*16
        const maxWidthClasses = {
            3: 'max-w-sm',    // 3*96 + 2*16 = 320px (~20rem)
            4: 'max-w-md',    // 4*96 + 3*16 = 432px (~27rem)  
            5: 'max-w-xl',    // 5*96 + 4*16 = 544px (~34rem)
            6: 'max-w-2xl',   // 6*96 + 5*16 = 656px (~41rem)
            7: 'max-w-3xl',   // 7*96 + 6*16 = 768px (~48rem)
            8: 'max-w-4xl',   // 8*96 + 7*16 = 880px (~55rem)
            9: 'max-w-5xl',   // 9*96 + 8*16 = 992px (~62rem)
            10: 'max-w-6xl',  // 10*96 + 9*16 = 1104px (~69rem)
            11: 'max-w-7xl',  // 11*96 + 10*16 = 1216px (~76rem)
            12: 'max-w-7xl'   // 12*96 + 11*16 = 1328px (~83rem) - use max available
        };
        
        // Clear all classes and rebuild with only what we need
        quickAccess.className = '';
        
        // Add new grid class based on tilesPerRow value - explicit mapping for Tailwind compilation
        const gridClasses = {
            3: 'grid-cols-3',
            4: 'grid-cols-4',
            5: 'grid-cols-5',
            6: 'grid-cols-6',
            7: 'grid-cols-7',
            8: 'grid-cols-8',
            9: 'grid-cols-9',
            10: 'grid-cols-10',
            11: 'grid-cols-11',
            12: 'grid-cols-12'
        };
        const gridClass = gridClasses[tilesPerRow] || 'grid-cols-8';
        const maxWidthClass = maxWidthClasses[tilesPerRow];
        
        // Get gap classes based on setting - separate column and row gaps for better spacing
        const gapMapping = {
            0: { x: 'gap-x-0', y: 'gap-y-0' },     // 0 → no gaps
            1: { x: 'gap-x-4', y: 'gap-y-2' },     // 1 → 16px columns, 8px rows
            2: { x: 'gap-x-8', y: 'gap-y-4' },     // 2 → 32px columns, 16px rows
            3: { x: 'gap-x-12', y: 'gap-y-6' },    // 3 → 48px columns, 24px rows
            4: { x: 'gap-x-16', y: 'gap-y-8' },    // 4 → 64px columns, 32px rows
            5: { x: 'gap-x-20', y: 'gap-y-10' },   // 5 → 80px columns, 40px rows
            6: { x: 'gap-x-24', y: 'gap-y-12' },   // 6 → 96px columns, 48px rows
            7: { x: 'gap-x-28', y: 'gap-y-14' },   // 7 → 112px columns, 56px rows
            8: { x: 'gap-x-32', y: 'gap-y-16' },   // 8 → 128px columns, 64px rows
            9: { x: 'gap-x-36', y: 'gap-y-18' },   // 9 → 144px columns, 72px rows
            10: { x: 'gap-x-40', y: 'gap-y-20' }   // 10 → 160px columns, 80px rows
        };
        const gaps = gapMapping[this.settings.tileGap] || { x: 'gap-x-4', y: 'gap-y-2' };
        
        // Update quickAccess layout - clean slate with only necessary classes
        quickAccess.classList.add('grid', gridClass, gaps.x, gaps.y, maxWidthClass, 'mx-auto', 'place-items-center');
        
        // Update folderBookmarks layout if it exists
        if (folderBookmarks) {
            folderBookmarks.className = '';
            folderBookmarks.classList.add('grid', gridClass, gaps.x, gaps.y, maxWidthClass, 'mx-auto', 'place-items-center');
        }
    }

    updateToggleVisual(toggle) {
        const toggleBg = toggle.parentElement.querySelector('.toggle-bg');
        const toggleDot = toggle.parentElement.querySelector('.toggle-dot');
        
        if (toggle.checked) {
            toggleBg.classList.remove('bg-gray-200');
            toggleBg.classList.add('bg-blue-500');
            toggleDot.style.transform = 'translateX(16px)';
        } else {
            toggleBg.classList.remove('bg-blue-500');
            toggleBg.classList.add('bg-gray-200');
            toggleDot.style.transform = 'translateX(0)';
        }
    }



    updateSettingsSyncStatus() {
        const statusContainer = document.getElementById('settingsSyncStatus');
        const statusIcon = document.getElementById('settingsSyncIcon');
        const statusText = document.getElementById('settingsSyncText');
        
        if (this.syncAvailable) {
            statusIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>';
            statusIcon.setAttribute('class', 'w-4 h-4 text-green-500');
            statusText.textContent = 'Sync enabled and working';
            statusContainer.className = 'flex items-center space-x-2 p-3 bg-green-50 border border-green-200 rounded-lg';
        } else {
            statusIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>';
            statusIcon.setAttribute('class', 'w-4 h-4 text-yellow-500');
            statusText.textContent = 'Sync not available';
            statusContainer.className = 'flex items-center space-x-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg';
        }
    }

    // Folder management methods
    openFolder(folderId) {
        const folder = this.folders.find(f => f.id === folderId);
        if (!folder) return;
        
        document.getElementById('folderModalTitle').textContent = folder.name;
        document.getElementById('folderModal').classList.remove('hidden');
        
        // Store the current open folder ID
        this.openFolderId = folderId;
        
        // Set up drag and drop for removing bookmarks from folder
        this.setupFolderDragAndDrop();
        
        // Render bookmarks in this folder
        this.renderFolderBookmarks(folderId);
    }

    closeFolderModal() {
        document.getElementById('folderModal').classList.add('hidden');
        this.openFolderId = null;
        this.cleanupFolderDragAndDrop();
    }

    renderFolderBookmarks(folderId) {
        const folderBookmarksContainer = document.getElementById('folderBookmarks');
        const folderBookmarks = this.bookmarks.filter(b => b.folderId === folderId);
        
        if (folderBookmarks.length === 0) {
            folderBookmarksContainer.innerHTML = `
                <div class="text-center text-gray-500 w-full py-8">
                    <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
                    </svg>
                    <p class="text-lg font-medium">This folder is empty</p>
                    <p class="text-sm">Drag bookmarks here to organize them</p>
                </div>
            `;
            return;
        }

        const bookmarkTiles = folderBookmarks.map(bookmark => {
            const paddingClass = this.settings.showTitles ? 'pt-2 px-4 pb-6' : 'p-4';
            
            return `
            <div class="tile w-24 h-24 relative bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-200 hover:shadow-md transition-all duration-200 cursor-pointer" 
                 data-bookmark-id="${bookmark.id}" 
                 draggable="true"
                 title="${bookmark.title}">
                <a draggable="false" href="${bookmark.url}" aria-label="${bookmark.title}" class="absolute inset-0"></a>
                <div class="tile-icon absolute inset-0 flex items-center justify-center ${paddingClass}">
                    <img draggable="false" alt="" src="${bookmark.favicon}" class="w-full h-full rounded-lg object-cover bookmark-favicon" style="display: ${bookmark.favicon ? 'block' : 'none'};">
                    <div class="w-full h-full bg-blue-500 rounded-lg flex items-center justify-center text-white text-2xl font-bold bookmark-fallback" style="display: ${bookmark.favicon ? 'none' : 'block'};">
                        ${bookmark.title.charAt(0).toUpperCase()}
                    </div>
                </div>
                ${this.settings.showTitles ? `
                <div class="tile-title absolute bottom-1 left-1 right-1">
                    <span class="text-xs text-gray-800 text-center block truncate">${bookmark.title}</span>
                </div>` : ''}
            </div>
        `;
        }).join('');

        folderBookmarksContainer.innerHTML = bookmarkTiles;
        
        // Add event listeners for bookmarks in folder
        folderBookmarks.forEach(bookmark => {
            const bookmarkElement = folderBookmarksContainer.querySelector(`[data-bookmark-id="${bookmark.id}"]`);
            
            // Left click - navigate to URL
            bookmarkElement.addEventListener('click', (e) => {
                if (e.button === 0 && !this.isDragging) {
                    window.location.href = bookmark.url;
                }
            });
            
            // Middle click - open in new background tab
            bookmarkElement.addEventListener('mousedown', (e) => {
                if (e.button === 1 && !this.isDragging) {
                    e.preventDefault();
                    chrome.tabs.create({ url: bookmark.url, active: false });
                }
            });
            
            // Right click - show context menu
            bookmarkElement.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showContextMenu(e, bookmark.id);
            });

            // Drag start
            bookmarkElement.addEventListener('dragstart', (e) => {
                this.isDragging = true;
                this.draggedBookmarkId = bookmark.id;
                bookmarkElement.style.opacity = '0.5';
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/html', bookmarkElement.outerHTML);
            });

            // Drag end
            bookmarkElement.addEventListener('dragend', (e) => {
                this.isDragging = false;
                this.draggedBookmarkId = null;
                bookmarkElement.style.opacity = '1';
                this.removeFolderDragIndicator();
            });

            // Handle favicon error
            const faviconImg = bookmarkElement.querySelector('.bookmark-favicon');
            const fallbackDiv = bookmarkElement.querySelector('.bookmark-fallback');
            
            faviconImg.addEventListener('error', () => {
                faviconImg.style.display = 'none';
                fallbackDiv.style.display = 'block';
            });
        });
    }

    async moveBookmarkToFolder(bookmarkId, folderId) {
        const bookmark = this.bookmarks.find(b => b.id === bookmarkId);
        if (!bookmark) return;
        
        bookmark.folderId = folderId;
        await this.saveBookmarks();
        this.renderQuickAccess();
    }

    async createFolder(name) {
        const folder = {
            id: Date.now(),
            name: name,
            dateCreated: new Date().toISOString()
        };
        
        this.folders.push(folder);
        await this.saveBookmarks();
        this.renderQuickAccess();
        
        return folder;
    }

    showCreateFolderModal() {
        document.getElementById('createFolderModal').classList.remove('hidden');
        document.getElementById('folderName').focus();
    }

    hideCreateFolderModal() {
        document.getElementById('createFolderModal').classList.add('hidden');
        document.getElementById('createFolderForm').reset();
    }

    async createFolderFromModal() {
        const folderName = document.getElementById('folderName').value.trim();
        
        if (!folderName) return;
        
        await this.createFolder(folderName);
        this.hideCreateFolderModal();
    }

    showFolderContextMenu(event, folderId) {
        console.log('showFolderContextMenu called with folderId:', folderId);
        this.currentFolderId = folderId;
        const contextMenu = document.getElementById('contextMenu');
        
        // Hide bookmark menu items and show folder menu items
        document.getElementById('editBookmark').classList.add('hidden');
        document.getElementById('duplicateBookmark').classList.add('hidden');
        document.getElementById('deleteBookmark').classList.add('hidden');
        document.getElementById('renameFolder').classList.remove('hidden');
        document.getElementById('deleteFolder').classList.remove('hidden');
        
        // Set z-index based on open modals
        this.setElementZIndex(contextMenu);
        
        // Note: Dynamic positioning requires style attributes since Tailwind can't handle pixel-perfect dynamic positioning
        contextMenu.style.left = `${event.pageX}px`;
        contextMenu.style.top = `${event.pageY}px`;
        contextMenu.classList.remove('hidden');
        
        // Adjust position if menu goes off screen
        const rect = contextMenu.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        if (rect.right > windowWidth) {
            contextMenu.style.left = `${event.pageX - rect.width}px`;
        }
        if (rect.bottom > windowHeight) {
            contextMenu.style.top = `${event.pageY - rect.height}px`;
        }
    }

    showRenameFolderModal() {
        const folder = this.folders.find(f => f.id === this.currentFolderId);
        if (!folder) return;
        
        document.getElementById('renameFolderName').value = folder.name;
        document.getElementById('renameFolderModal').classList.remove('hidden');
        document.getElementById('renameFolderName').focus();
        document.getElementById('renameFolderName').select();
    }

    hideRenameFolderModal() {
        document.getElementById('renameFolderModal').classList.add('hidden');
        document.getElementById('renameFolderForm').reset();
    }

    async renameFolderFromModal() {
        const newName = document.getElementById('renameFolderName').value.trim();
        if (!newName || !this.currentFolderId) return;
        
        const folder = this.folders.find(f => f.id === this.currentFolderId);
        if (!folder) return;
        
        folder.name = newName;
        await this.saveBookmarks();
        this.renderQuickAccess();
        
        // Update folder modal title if the folder modal is open for this folder
        if (this.openFolderId === this.currentFolderId) {
            document.getElementById('folderModalTitle').textContent = newName;
        }
        
        this.hideRenameFolderModal();
        this.currentFolderId = null;
    }

    async deleteFolderWithBookmarks() {
        if (!this.currentFolderId) return;
        
        const folder = this.folders.find(f => f.id === this.currentFolderId);
        if (!folder) return;
        
        // Move all bookmarks in this folder back to main view
        this.bookmarks.forEach(bookmark => {
            if (bookmark.folderId === this.currentFolderId) {
                bookmark.folderId = null; // Remove from folder
            }
        });
        
        // Remove the folder
        this.folders = this.folders.filter(f => f.id !== this.currentFolderId);
        
        // Save changes
        await this.saveBookmarks();
        this.renderQuickAccess();
        
        // Close folder modal if this folder was open
        if (this.openFolderId === this.currentFolderId) {
            this.closeFolderModal();
        }
        
        this.currentFolderId = null;
    }

    showFolderDeleteConfirmation(event) {
        if (!this.currentFolderId) return;
        
        const popup = document.getElementById('deleteConfirmPopup');
        const folder = this.folders.find(f => f.id === this.currentFolderId);
        
        if (!folder) return;
        
        // Highlight the folder being deleted
        this.highlightFolderForDeletion(this.currentFolderId);
        
        // Update the confirmation message with the folder name
        const messageElement = document.getElementById('deleteConfirmMessage');
        const bookmarkCount = this.bookmarks.filter(b => b.folderId === this.currentFolderId).length;
        const bookmarkText = bookmarkCount === 1 ? 'bookmark' : 'bookmarks';
        messageElement.innerHTML = `Are you sure you want to delete folder <strong>${folder.name}</strong>?<br><small class="text-gray-500">${bookmarkCount} ${bookmarkText} will be moved to the main view.</small>`;
        
        // Position the popup near the folder being deleted
        const folderElement = document.querySelector(`[data-folder-id="${this.currentFolderId}"]`);
        if (folderElement) {
            const rect = folderElement.getBoundingClientRect();
            const popupRect = popup.getBoundingClientRect();
            
            // Position popup to the right of the folder, or left if not enough space
            let left = rect.right + 10;
            let top = rect.top;
            
            // Check if popup would go off screen horizontally
            if (left + 256 > window.innerWidth) { // 256px is popup width (w-64)
                left = rect.left - 256 - 10;
            }
            
            // Check if popup would go off screen vertically
            if (top + 100 > window.innerHeight) { // Approximate popup height
                top = rect.bottom - 100;
            }
            
            // Ensure popup doesn't go above viewport
            if (top < 0) {
                top = 10;
            }
            
            // Note: Dynamic positioning requires style attributes since Tailwind can't handle pixel-perfect dynamic positioning  
            popup.style.left = `${left}px`;
            popup.style.top = `${top}px`;
        }
        
        // Set z-index based on open modals
        this.setElementZIndex(popup);
        
        popup.classList.remove('hidden');
    }

    highlightFolderForDeletion(folderId) {
        // Remove any existing highlights
        this.removeBookmarkHighlight();
        this.removeDeleteHighlight();
        this.removeFolderDeleteHighlight();
        
        // Add delete highlight to the current folder
        const folderElement = document.querySelector(`[data-folder-id="${folderId}"]`);
        if (folderElement) {
            folderElement.classList.add('folder-delete-highlighted');
        }
    }

    removeFolderDeleteHighlight() {
        const deleteHighlightedElement = document.querySelector('.folder-delete-highlighted');
        if (deleteHighlightedElement) {
            deleteHighlightedElement.classList.remove('folder-delete-highlighted');
        }
    }

    setupFolderDragAndDrop() {
        const folderModal = document.getElementById('folderModal');
        const modalBackdrop = folderModal; // The backdrop is the modal itself
        let dragCounter = 0;
        
        // Store event handlers for cleanup
        this.folderDragHandlers = {};
        
        // Handle drag enter on the backdrop (outside the modal content)
        this.folderDragHandlers.dragenter = (e) => {
            // Only handle if dragging from within folder and target is backdrop
            if (this.draggedBookmarkId && e.target === modalBackdrop) {
                e.preventDefault();
                dragCounter++;
                this.showFolderDragIndicator();
            }
        };
        
        // Handle drag over
        this.folderDragHandlers.dragover = (e) => {
            if (this.draggedBookmarkId && e.target === modalBackdrop) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            }
        };
        
        // Handle drag leave
        this.folderDragHandlers.dragleave = (e) => {
            if (this.draggedBookmarkId && e.target === modalBackdrop) {
                e.preventDefault();
                dragCounter--;
                if (dragCounter === 0) {
                    this.removeFolderDragIndicator();
                }
            }
        };
        
        // Handle drop on backdrop
        this.folderDragHandlers.drop = (e) => {
            if (this.draggedBookmarkId && e.target === modalBackdrop) {
                e.preventDefault();
                dragCounter = 0;
                this.removeFolderDragIndicator();
                this.removeBookmarkFromFolder(this.draggedBookmarkId);
            }
        };
        
        // Add event listeners
        modalBackdrop.addEventListener('dragenter', this.folderDragHandlers.dragenter);
        modalBackdrop.addEventListener('dragover', this.folderDragHandlers.dragover);
        modalBackdrop.addEventListener('dragleave', this.folderDragHandlers.dragleave);
        modalBackdrop.addEventListener('drop', this.folderDragHandlers.drop);
    }

    cleanupFolderDragAndDrop() {
        if (!this.folderDragHandlers) return;
        
        const folderModal = document.getElementById('folderModal');
        
        // Remove all event listeners
        folderModal.removeEventListener('dragenter', this.folderDragHandlers.dragenter);
        folderModal.removeEventListener('dragover', this.folderDragHandlers.dragover);
        folderModal.removeEventListener('dragleave', this.folderDragHandlers.dragleave);
        folderModal.removeEventListener('drop', this.folderDragHandlers.drop);
        
        this.folderDragHandlers = null;
        this.removeFolderDragIndicator();
    }

    showFolderDragIndicator() {
        const folderModal = document.getElementById('folderModal');
        folderModal.classList.add('bg-blue-100/20');
        
        // Add visual indicator
        if (!document.getElementById('folderDragIndicator')) {
            const indicator = document.createElement('div');
            indicator.id = 'folderDragIndicator';
            indicator.className = 'fixed inset-0 pointer-events-none flex items-center justify-center z-50';
            indicator.innerHTML = `
                <div class="bg-blue-600 text-white px-6 py-3 rounded-lg shadow-lg text-lg font-semibold">
                    Drop here to remove from folder
                </div>
            `;
            document.body.appendChild(indicator);
        }
    }

    removeFolderDragIndicator() {
        const folderModal = document.getElementById('folderModal');
        folderModal.classList.remove('bg-blue-100/20');
        
        const indicator = document.getElementById('folderDragIndicator');
        if (indicator) {
            indicator.remove();
        }
    }

    async removeBookmarkFromFolder(bookmarkId) {
        const bookmark = this.bookmarks.find(b => b.id === bookmarkId);
        if (!bookmark) return;
        
        // Remove from folder (set folderId to null)
        bookmark.folderId = null;
        await this.saveBookmarks();
        
        // Re-render both the folder contents and main view
        this.renderFolderBookmarks(this.openFolderId);
        this.renderQuickAccess();
    }

    // Removed unused bookmark card and list rendering methods
}

// Initialize the bookmark manager when the page loads
let bookmarkManager;
document.addEventListener('DOMContentLoaded', () => {
    bookmarkManager = new BookmarkManager();
});
