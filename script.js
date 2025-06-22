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

        // Modal close on backdrop click
        document.getElementById('addBookmarkModal').addEventListener('click', (e) => {
            if (e.target.id === 'addBookmarkModal') {
                this.hideAddBookmarkModal();
            }
        });

        // Edit bookmark modal events
        document.getElementById('cancelEditBtn').addEventListener('click', () => {
            this.hideEditBookmarkModal();
        });

        document.getElementById('editBookmarkForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateBookmark();
        });

        document.getElementById('editBookmarkModal').addEventListener('click', (e) => {
            if (e.target.id === 'editBookmarkModal') {
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
            if (!e.target.closest('#contextMenu')) {
                this.hideContextMenu();
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
        const quickAccessContainer = document.getElementById('quickAccess');
        
        // Prevent default drag behaviors on document
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            document.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        // Handle drag over the container
        quickAccessContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            quickAccessContainer.classList.add('bg-blue-50', 'border-2', 'border-dashed', 'border-blue-300');
        });

        // Handle drag leave
        quickAccessContainer.addEventListener('dragleave', (e) => {
            if (!quickAccessContainer.contains(e.relatedTarget)) {
                quickAccessContainer.classList.remove('bg-blue-50', 'border-2', 'border-dashed', 'border-blue-300');
            }
        });

        // Handle drop
        quickAccessContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            quickAccessContainer.classList.remove('bg-blue-50', 'border-2', 'border-dashed', 'border-blue-300');
            
            // Get the dragged data - Chrome bookmarks provide multiple data formats
            const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
            
            // Try to get the bookmark title from different data types
            let title = '';
            
            // Chrome bookmarks provide the title in 'text/x-moz-text-internal' or 'text/plain'
            // When dragging from bookmark bar, the title is usually in text/plain when it's different from URL
            const plainText = e.dataTransfer.getData('text/plain');
            const htmlData = e.dataTransfer.getData('text/html');
            
            // If HTML data is available, try to extract title from it
            if (htmlData) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = htmlData;
                const linkElement = tempDiv.querySelector('a');
                if (linkElement && linkElement.textContent) {
                    title = linkElement.textContent.trim();
                }
            }
            
            // If no title from HTML, use plain text if it's different from URL
            if (!title && plainText && plainText !== url) {
                title = plainText;
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
        
        const faviconSources = [
            `${origin}/apple-touch-icon.png`,
            `${origin}/apple-touch-icon-180x180.png`,
            `${origin}/apple-touch-icon-152x152.png`,
            `${origin}/apple-touch-icon-144x144.png`,
            `${origin}/apple-touch-icon-120x120.png`,
            `${origin}/apple-touch-icon-114x114.png`,
            `${origin}/android-chrome-192x192.png`,
            `${origin}/android-chrome-512x512.png`,
            `${origin}/favicon-196x196.png`,
            `${origin}/favicon-128x128.png`,
            `${origin}/favicon-96x96.png`,
            `${origin}/favicon-64x64.png`,
            `${origin}/favicon-48x48.png`,
            `${origin}/favicon-32x32.png`,
            `${origin}/favicon-16x16.png`,
            `${origin}/favicon.png`,
            `${origin}/favicon.ico`,
            `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`,
            `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
            `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`
        ];

        for (const faviconUrl of faviconSources) {
            try {
                const response = await fetch(faviconUrl, { 
                    method: 'HEAD',
                    mode: 'no-cors'
                });
                if (response.ok || response.type === 'opaque') {
                    return faviconUrl;
                }
            } catch (e) {
                continue;
            }
        }
        
        return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
    }

    async addBookmarkFromDrop(title, url) {
        // Extract title from URL if not provided or if title is the same as URL
        let bookmarkTitle = title;
        if (!title || title === url) {
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
            this.bookmarks = result.bookmarks || this.getDefaultBookmarks();
            } catch (error) {
            console.log('Using default bookmarks');
            this.bookmarks = this.getDefaultBookmarks();
            }
    }

    getDefaultBookmarks() {
        return [
            {
                id: Date.now() + 1,
                title: 'Google',
                url: 'https://www.google.com',
                category: 'Search',
                favicon: 'https://www.google.com/s2/favicons?domain=google.com&sz=128',
                dateAdded: new Date().toISOString()
            },
            {
                id: Date.now() + 2,
                title: 'GitHub',
                url: 'https://github.com',
                category: 'Development',
                favicon: 'https://github.com/apple-touch-icon.png',
                dateAdded: new Date().toISOString()
            },
            {
                id: Date.now() + 3,
                title: 'Stack Overflow',
                url: 'https://stackoverflow.com',
                category: 'Development',
                favicon: 'https://stackoverflow.com/apple-touch-icon.png',
                dateAdded: new Date().toISOString()
            },
            {
                id: Date.now() + 4,
                title: 'YouTube',
                url: 'https://www.youtube.com',
                category: 'Entertainment',
                favicon: 'https://www.youtube.com/s/desktop/favicon_144x144.png',
                dateAdded: new Date().toISOString()
            }
        ];
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
            <div class="group relative flex flex-col items-center p-3 rounded-lg hover:bg-white hover:shadow-md transition-all duration-200 border border-transparent hover:border-gray-200 cursor-pointer" data-bookmark-id="${bookmark.id}">
                <div class="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                    <img src="${bookmark.favicon}" alt="" class="w-10 h-10 rounded" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                    <div class="w-10 h-10 bg-blue-500 rounded flex items-center justify-center text-white text-lg font-bold" style="display: none;">
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
                    window.open(bookmark.url, '_blank');
                }
            });
            
            // Right click - show context menu
            bookmarkElement.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showContextMenu(e, bookmark.id);
            });
        });
    }


    showContextMenu(event, bookmarkId) {
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
        this.currentBookmarkId = null;
    }

    showEditBookmarkModal() {
        const bookmark = this.bookmarks.find(b => b.id === this.currentBookmarkId);
        if (!bookmark) return;
        
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
        if (!this.currentBookmarkId) return;
        
        const title = document.getElementById('editBookmarkTitle').value.trim();
        const url = document.getElementById('editBookmarkUrl').value.trim();
        const category = document.getElementById('editBookmarkCategory').value.trim() || 'General';

        if (!title || !url) return;

        const bookmarkIndex = this.bookmarks.findIndex(b => b.id === this.currentBookmarkId);
        if (bookmarkIndex === -1) return;

        const faviconUrl = await this.getHighResolutionFavicon(url);

        this.bookmarks[bookmarkIndex] = {
            ...this.bookmarks[bookmarkIndex],
            title,
            url,
            category,
            favicon: faviconUrl
        };

        await this.saveBookmarks();
        this.renderQuickAccess();
        this.hideEditBookmarkModal();
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