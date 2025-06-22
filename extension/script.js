class BookmarkManager {
    constructor() {
        this.bookmarks = [];
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
                favicon: 'https://www.google.com/favicon.ico',
                dateAdded: new Date().toISOString()
            },
            {
                id: Date.now() + 2,
                title: 'GitHub',
                url: 'https://github.com',
                category: 'Development',
                favicon: 'https://github.com/favicon.ico',
                dateAdded: new Date().toISOString()
            },
            {
                id: Date.now() + 3,
                title: 'Stack Overflow',
                url: 'https://stackoverflow.com',
                category: 'Development',
                favicon: 'https://stackoverflow.com/favicon.ico',
                dateAdded: new Date().toISOString()
            },
            {
                id: Date.now() + 4,
                title: 'YouTube',
                url: 'https://www.youtube.com',
                category: 'Entertainment',
                favicon: 'https://www.youtube.com/favicon.ico',
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

        const bookmark = {
            id: Date.now(),
            title,
            url,
            category,
            favicon: `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`,
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
            <a href="${bookmark.url}" class="group relative flex flex-col items-center p-3 rounded-lg hover:bg-white hover:shadow-md transition-all duration-200 border border-transparent hover:border-gray-200 cursor-pointer">
                <div class="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                    <img src="${bookmark.favicon}" alt="" class="w-10 h-10 rounded" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                    <div class="w-10 h-10 bg-blue-500 rounded flex items-center justify-center text-white text-lg font-bold" style="display: none;">
                        ${bookmark.title.charAt(0).toUpperCase()}
                    </div>
                </div>
                <span class="text-xs text-gray-600 text-center truncate w-full">${bookmark.title}</span>
            </a>
        `).join('');
        
    }


    // Removed unused bookmark card and list rendering methods
}

// Initialize the bookmark manager when the page loads
let bookmarkManager;
document.addEventListener('DOMContentLoaded', () => {
    bookmarkManager = new BookmarkManager();
});