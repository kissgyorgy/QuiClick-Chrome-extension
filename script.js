class BookmarkManager {
    constructor() {
        this.bookmarks = [];
        this.currentBookmarkId = null;
        this.isDragging = false;
        this.draggedBookmarkId = null;
        this.isDuplicateMode = false;
        this.duplicatedBookmarkId = null;
        this.selectedFavicon = null;
        this.faviconDebounceTimer = null;
        this.syncAvailable = false;
        this.init();
    }

    async init() {
        await this.checkSyncAvailability();
        await this.loadBookmarks();
        this.setupEventListeners();
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
                
                // Check if user is signed in to Chrome
                if (chrome.identity && chrome.identity.getProfileUserInfo) {
                    chrome.identity.getProfileUserInfo((userInfo) => {
                        if (userInfo.email) {
                            console.log('✅ User is signed into Chrome:', userInfo.email);
                        } else {
                            console.log('⚠️ User may not be signed into Chrome or sync may be disabled');
                        }
                    });
                }
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
        
        this.updateSyncStatusUI();
    }

    updateSyncStatusUI() {
        const syncStatus = document.getElementById('syncStatus');
        const syncIcon = document.getElementById('syncIcon');
        const syncStatusText = document.getElementById('syncStatusText');
        
        if (this.syncAvailable) {
            syncStatus.classList.remove('hidden');
            syncIcon.className = 'w-4 h-4 text-green-600';
            syncStatusText.textContent = 'Sync enabled';
            syncStatusText.className = 'text-green-600';
        } else {
            syncStatus.classList.remove('hidden');
            syncIcon.className = 'w-4 h-4 text-orange-600';
            syncStatusText.textContent = 'Local only';
            syncStatusText.className = 'text-orange-600';
        }
    }

    setupEventListeners() {
        // Add bookmark button
        document.getElementById('addBookmarkBtn').addEventListener('click', () => {
            this.showAddBookmarkModal();
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

        // Hide context menu when clicking elsewhere
        document.addEventListener('click', (e) => {
            const isClickInsideModal = e.target.closest('#contextMenu') || 
                                      e.target.closest('#editBookmarkModal') || 
                                      e.target.closest('#deleteConfirmPopup') ||
                                      e.target.closest('#addBookmarkModal');
            
            if (!isClickInsideModal) {
                this.hideContextMenu();
                this.hideDeleteConfirmation();
                // Only clear currentBookmarkId if no modals are open
                const editModalOpen = !document.getElementById('editBookmarkModal').classList.contains('hidden');
                const addModalOpen = !document.getElementById('addBookmarkModal').classList.contains('hidden');
                
                if (!editModalOpen && !addModalOpen) {
                    console.log('Clearing currentBookmarkId due to click outside');
                    this.currentBookmarkId = null;
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

    async getHighResolutionFavicon(url) {
        const hostname = new URL(url).hostname;
        const origin = new URL(url).origin;
        
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
                        const faviconUrl = new URL(link.href, url).href;
                        // Test if the favicon actually exists
                        if (await this.testFaviconUrl(faviconUrl)) {
                            return faviconUrl;
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

        for (const faviconUrl of faviconSources) {
            if (await this.testFaviconUrl(faviconUrl)) {
                return faviconUrl;
            }
        }
        
        // Final fallback to Google favicon service
        return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
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
                dateAdded: new Date().toISOString()
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
                    const bookmarksData = JSON.stringify(this.bookmarks);
                    const sizeInBytes = new TextEncoder().encode(bookmarksData).length;
                    
                    // Chrome sync storage limits: 8KB per item, 100KB total
                    if (sizeInBytes > 8000) { // 8KB limit with some buffer
                        console.log('Bookmarks data too large for sync storage, using local storage');
                        await chrome.storage.local.set({ bookmarks: this.bookmarks });
                    } else {
                        await chrome.storage.sync.set({ bookmarks: this.bookmarks });
                        console.log('Saved bookmarks to sync storage');
                    }
                } catch (syncError) {
                    console.log('Sync storage failed, saving to local storage:', syncError.message);
                    await chrome.storage.local.set({ bookmarks: this.bookmarks });
                }
            } else {
                console.log('Sync not available, saving to local storage');
                await chrome.storage.local.set({ bookmarks: this.bookmarks });
            }
        } catch (error) {
            console.error('Error saving bookmarks:', error);
        }
    }

    showAddBookmarkModal() {
        document.getElementById('addBookmarkModal').classList.remove('hidden');
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

        if (!url || !this.isValidUrl(url)) {
            document.getElementById('faviconSelection').classList.add('hidden');
            this.selectedFavicon = null;
            return;
        }

        this.faviconDebounceTimer = setTimeout(() => {
            this.loadFaviconOptions(url);
        }, 500);
    }

    async loadFaviconOptions(url) {
        const faviconSelection = document.getElementById('faviconSelection');
        const faviconOptions = document.getElementById('faviconOptions');
        
        faviconSelection.classList.remove('hidden');
        faviconOptions.innerHTML = '<div class="text-sm text-gray-500 col-span-6 text-center">Loading favicon options...</div>';

        try {
            const faviconUrls = await this.getAllFaviconUrls(url);
            this.displayFaviconOptions(faviconUrls);
        } catch (error) {
            faviconOptions.innerHTML = '<div class="text-sm text-red-500 col-span-6 text-center">Failed to load favicon options</div>';
        }
    }

    async getAllFaviconUrls(url) {
        const hostname = new URL(url).hostname;
        const origin = new URL(url).origin;
        const faviconUrls = [];
        
        // Add Google favicon service as first option
        faviconUrls.push({
            url: `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
            label: 'Google Favicon Service'
        });

        try {
            const response = await fetch(url);
            if (response.ok) {
                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                
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

        return uniqueUrls;
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
            };
            
            faviconElement.appendChild(img);
            faviconElement.appendChild(fallback);
            
            faviconElement.addEventListener('click', () => {
                this.selectFavicon(faviconElement, favicon.url);
            });
            
            faviconOptions.appendChild(faviconElement);
            
            // Auto-select first option
            if (i === 0) {
                this.selectFavicon(faviconElement, favicon.url);
            }
        }
    }

    selectFavicon(element, url) {
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
        this.selectedFavicon = url;
    }

    async addBookmark() {
        const title = document.getElementById('bookmarkTitle').value.trim();
        const url = document.getElementById('bookmarkUrl').value.trim();

        if (!title || !url) return;

        const bookmark = {
            id: Date.now(),
            title,
            url,
            favicon: this.selectedFavicon || '',
            dateAdded: new Date().toISOString()
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
        
        const bookmarkTiles = this.bookmarks.map(bookmark => `
            <div class="tile w-24 h-24 relative bg-gray-50 border border-gray-200 rounded-lg hover:bg-white hover:shadow-md transition-all duration-200 cursor-pointer" 
                 data-bookmark-id="${bookmark.id}" 
                 draggable="true"
                 title="${bookmark.title}">
                <a draggable="false" href="${bookmark.url}" aria-label="${bookmark.title}" class="absolute inset-0"></a>
                <div class="tile-icon absolute inset-0 flex items-center justify-center pt-2 px-4 pb-6">
                    <img draggable="false" alt="" src="${bookmark.favicon}" class="w-full h-full rounded-lg object-cover bookmark-favicon" style="display: ${bookmark.favicon ? 'block' : 'none'};">
                    <div class="w-full h-full bg-blue-500 rounded-lg flex items-center justify-center text-white text-2xl font-bold bookmark-fallback" style="display: ${bookmark.favicon ? 'none' : 'block'};">
                        ${bookmark.title.charAt(0).toUpperCase()}
                    </div>
                </div>
                <div class="tile-title absolute bottom-1 left-1 right-1">
                    <span class="text-xs text-gray-800 text-center block truncate">${bookmark.title}</span>
                </div>
            </div>
        `).join('');

        const addButtonTile = `
            <div id="addBookmarkTile" class="tile w-24 h-24 relative bg-gray-50 border border-gray-200 border-dashed rounded-lg hover:bg-white hover:shadow-md transition-all duration-200 cursor-pointer" 
                 title="Add New Bookmark">
                <div class="absolute inset-0 flex items-center justify-center">
                    <span class="text-custom-accent leading-none plus-icon">+</span>
                </div>
            </div>
        `;

        quickAccessContainer.innerHTML = bookmarkTiles + addButtonTile;
        
        // Add event listeners for bookmark clicks and right-clicks
        this.bookmarks.forEach(bookmark => {
            const bookmarkElement = quickAccessContainer.querySelector(`[data-bookmark-id="${bookmark.id}"]`);
            
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

    showContextMenu(event, bookmarkId) {
        console.log('showContextMenu called with bookmarkId:', bookmarkId);
        this.currentBookmarkId = bookmarkId;
        const contextMenu = document.getElementById('contextMenu');
        
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
        document.getElementById('contextMenu').classList.add('hidden');
        // Don't clear currentBookmarkId here as it's needed for edit/delete operations
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
        
        // Position the modal near the bookmark being edited
        this.positionEditModal(modal);
        
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
        
        // Position the modal near the bookmark being duplicated
        this.positionEditModal(modal);
        
        modal.classList.remove('hidden');
        document.getElementById('editBookmarkTitle').focus();
    }

    async hideEditBookmarkModal() {
        // Remove highlighting
        this.removeBookmarkHighlight();
        
        document.getElementById('editBookmarkModal').classList.add('hidden');
        document.getElementById('editBookmarkForm').reset();
        this.currentBookmarkId = null;
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
        const url = document.getElementById('editBookmarkUrl').value.trim();

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
        this.bookmarks[bookmarkIndex] = {
            ...this.bookmarks[bookmarkIndex],
            title,
            url
        };

        console.log('Saving bookmarks...');
        await this.saveBookmarks();
        console.log('Rendering...');
        this.renderQuickAccess();
        console.log('Hiding modal...');
        this.hideEditBookmarkModal();
        
        if (url !== oldUrl) {
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

    async updateFaviconAsync(bookmarkId, url) {
        try {
            const faviconUrl = await this.getHighResolutionFavicon(url);
            const bookmarkIndex = this.bookmarks.findIndex(b => b.id === bookmarkId);
            
            if (bookmarkIndex !== -1) {
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
            
            popup.style.left = `${left}px`;
            popup.style.top = `${top}px`;
        }
        
        popup.classList.remove('hidden');
    }
    
    hideDeleteConfirmation() {
        // Remove delete highlighting
        this.removeDeleteHighlight();
        document.getElementById('deleteConfirmPopup').classList.add('hidden');
    }
    
    async confirmDeleteBookmark() {
        if (!this.currentBookmarkId) return;
        
        // Remove highlighting before deleting
        this.removeDeleteHighlight();
        
        this.bookmarks = this.bookmarks.filter(b => b.id !== this.currentBookmarkId);
        await this.saveBookmarks();
        this.renderQuickAccess();
        this.currentBookmarkId = null;
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
        
        modal.style.left = `${left}px`;
        modal.style.top = `${top}px`;
    }

    // Removed unused bookmark card and list rendering methods
}

// Initialize the bookmark manager when the page loads
let bookmarkManager;
document.addEventListener('DOMContentLoaded', () => {
    bookmarkManager = new BookmarkManager();
});