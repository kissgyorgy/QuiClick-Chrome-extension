class BookmarkManager {
    constructor() {
        this.bookmarks = [];
        this.currentBookmarkId = null;
        this.init();
    }

    async init() {
        await this.loadBookmarks();
        this.setupEventListeners();
        this.renderQuickAccess();
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


        // Remove view toggle listeners since we only have favicon view now

        // Edit bookmark modal events
        document.getElementById('cancelEditBtn').addEventListener('click', () => {
            this.hideEditBookmarkModal();
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
                this.hideEditBookmarkModal();
            }
        });

        // Context menu events
        document.getElementById('editBookmark').addEventListener('click', () => {
            this.showEditBookmarkModal();
            this.hideContextMenu();
        });

        document.getElementById('deleteBookmark').addEventListener('click', () => {
            this.deleteBookmark();
            this.hideContextMenu();
        });

        // Hide context menu when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#contextMenu') && !e.target.closest('#editBookmarkModal')) {
                this.hideContextMenu();
                // Clear currentBookmarkId when context menu is dismissed by clicking elsewhere
                console.log('Clearing currentBookmarkId due to click outside');
                this.currentBookmarkId = null;
            }
        });

        // Prevent default context menu
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // Drag and drop functionality
        this.setupDragAndDrop();
    }

    setupDragAndDrop() {
        const body = document.body;
        
        // Prevent default drag behaviors on document
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            document.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        // Handle drag over the entire page
        body.addEventListener('dragover', (e) => {
            e.preventDefault();
            // Add a visual overlay to indicate drop zone (excluding header)
            if (!document.getElementById('dropOverlay')) {
                const header = document.querySelector('header');
                const headerHeight = header ? header.offsetHeight : 0;
                
                const overlay = document.createElement('div');
                overlay.id = 'dropOverlay';
                overlay.className = 'fixed left-0 right-0 bottom-0 bg-blue-100 bg-opacity-20 border-4 border-dashed border-blue-400 z-40 flex items-center justify-center';
                overlay.style.top = `${headerHeight}px`; // Start exactly at bottom of header
                overlay.innerHTML = '<div class="text-blue-600 text-xl font-semibold">Drop bookmark here</div>';
                body.appendChild(overlay);
            }
        });

        // Handle drag leave
        body.addEventListener('dragleave', (e) => {
            // Only remove overlay if we're actually leaving the body
            if (e.target === body) {
                const overlay = document.getElementById('dropOverlay');
                if (overlay) {
                    overlay.remove();
                }
            }
        });

        // Handle drop on entire page
        body.addEventListener('drop', (e) => {
            e.preventDefault();
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

        const faviconUrl = await this.getHighResolutionFavicon(url);

        const bookmark = {
            id: Date.now(),
            title: bookmarkTitle,
            url: url,
            category: 'General',
            favicon: faviconUrl,
            dateAdded: new Date().toISOString()
        };

        this.bookmarks.unshift(bookmark);
        await this.saveBookmarks();
        this.renderQuickAccess();
    }

    async loadBookmarks() {
        try {
            const result = await chrome.storage.local.get(['bookmarks']);
            this.bookmarks = result.bookmarks || await this.getDefaultBookmarks();
            } catch (error) {
            console.log('Using default bookmarks');
            this.bookmarks = await this.getDefaultBookmarks();
            }
    }

    async getDefaultBookmarks() {
        const defaultUrls = [
            { title: 'Google', url: 'https://www.google.com', category: 'Search' },
            { title: 'GitHub', url: 'https://github.com', category: 'Development' },
            { title: 'Stack Overflow', url: 'https://stackoverflow.com', category: 'Development' },
            { title: 'YouTube', url: 'https://www.youtube.com', category: 'Entertainment' }
        ];

        const bookmarks = [];
        for (let i = 0; i < defaultUrls.length; i++) {
            const { title, url, category } = defaultUrls[i];
            const favicon = await this.getHighResolutionFavicon(url);
            bookmarks.push({
                id: Date.now() + i + 1,
                title,
                url,
                category,
                favicon,
                dateAdded: new Date().toISOString()
            });
        }
        
        return bookmarks;
    }

    async saveBookmarks() {
        try {
            await chrome.storage.local.set({ bookmarks: this.bookmarks });
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
    }

    async addBookmark() {
        const title = document.getElementById('bookmarkTitle').value.trim();
        const url = document.getElementById('bookmarkUrl').value.trim();
        const category = document.getElementById('bookmarkCategory').value.trim() || 'General';

        if (!title || !url) return;

        const faviconUrl = await this.getHighResolutionFavicon(url);

        const bookmark = {
            id: Date.now(),
            title,
            url,
            category,
            favicon: faviconUrl,
            dateAdded: new Date().toISOString()
        };

        this.bookmarks.unshift(bookmark);
        await this.saveBookmarks();
        this.renderQuickAccess();
        this.hideAddBookmarkModal();
    }



    // Remove setView method since we only have favicon view now

    renderQuickAccess() {
        const quickAccessContainer = document.getElementById('quickAccess');
        
        quickAccessContainer.innerHTML = this.bookmarks.map(bookmark => `
            <div class="group relative flex flex-col items-center rounded-xl hover:shadow-md transition-all duration-200 cursor-pointer pb-2" data-bookmark-id="${bookmark.id}">
                <div class="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mb-1 group-hover:scale-105 transition-transform">
                    <img src="${bookmark.favicon}" alt="" class="w-10 h-10 rounded-lg bookmark-favicon">
                    <div class="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center text-white text-lg font-bold bookmark-fallback" style="display: none;">
                        ${bookmark.title.charAt(0).toUpperCase()}
                    </div>
                </div>
                <span class="text-xs text-gray-600 text-center truncate w-full">${bookmark.title}</span>
            </div>
        `).join('');
        
        // Add event listeners for bookmark clicks and right-clicks
        this.bookmarks.forEach(bookmark => {
            const bookmarkElement = quickAccessContainer.querySelector(`[data-bookmark-id="${bookmark.id}"]`);
            
            // Left click - navigate to URL
            bookmarkElement.addEventListener('click', (e) => {
                if (e.button === 0) { // Left click
                    window.location.href = bookmark.url;
                }
            });
            
            // Right click - show context menu
            bookmarkElement.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showContextMenu(e, bookmark.id);
            });

            // Handle favicon error - show fallback
            const faviconImg = bookmarkElement.querySelector('.bookmark-favicon');
            const fallbackDiv = bookmarkElement.querySelector('.bookmark-fallback');
            
            faviconImg.addEventListener('error', () => {
                faviconImg.style.display = 'none';
                fallbackDiv.style.display = 'block';
            });
        });
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
        
        const modal = document.getElementById('editBookmarkModal');
        document.getElementById('editBookmarkTitle').value = bookmark.title;
        document.getElementById('editBookmarkUrl').value = bookmark.url;
        document.getElementById('editBookmarkCategory').value = bookmark.category || '';
        
        modal.classList.remove('hidden');
        document.getElementById('editBookmarkTitle').focus();
    }

    hideEditBookmarkModal() {
        document.getElementById('editBookmarkModal').classList.add('hidden');
        document.getElementById('editBookmarkForm').reset();
        this.currentBookmarkId = null;
    }

    async updateBookmark() {
        console.log('updateBookmark called, currentBookmarkId:', this.currentBookmarkId);
        
        if (!this.currentBookmarkId) {
            console.log('No currentBookmarkId, exiting');
            return;
        }
        
        const title = document.getElementById('editBookmarkTitle').value.trim();
        const url = document.getElementById('editBookmarkUrl').value.trim();
        const category = document.getElementById('editBookmarkCategory').value.trim() || 'General';

        console.log('Form values:', { title, url, category });

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

        console.log('Getting favicon...');
        const faviconUrl = await this.getHighResolutionFavicon(url);

        console.log('Updating bookmark...');
        this.bookmarks[bookmarkIndex] = {
            ...this.bookmarks[bookmarkIndex],
            title,
            url,
            category,
            favicon: faviconUrl
        };

        console.log('Saving bookmarks...');
        await this.saveBookmarks();
        console.log('Rendering...');
        this.renderQuickAccess();
        console.log('Hiding modal...');
        this.hideEditBookmarkModal();
        console.log('Update complete');
    }

    async deleteBookmark() {
        if (!this.currentBookmarkId) return;
        
        if (confirm('Are you sure you want to delete this bookmark?')) {
            this.bookmarks = this.bookmarks.filter(b => b.id !== this.currentBookmarkId);
            await this.saveBookmarks();
            this.renderQuickAccess();
        }
    }

    // Removed unused bookmark card and list rendering methods
}

// Initialize the bookmark manager when the page loads
let bookmarkManager;
document.addEventListener('DOMContentLoaded', () => {
    bookmarkManager = new BookmarkManager();
});