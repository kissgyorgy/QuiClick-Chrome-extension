class BookmarkManager {
    constructor() {
        this.bookmarks = [];
        this.filteredBookmarks = [];
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

        // Search functionality
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.searchBookmarks(e.target.value);
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
            this.filteredBookmarks = [...this.bookmarks];
        } catch (error) {
            console.log('Using default bookmarks');
            this.bookmarks = this.getDefaultBookmarks();
            this.filteredBookmarks = [...this.bookmarks];
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
        this.filteredBookmarks = [...this.bookmarks];
        this.renderQuickAccess();
        this.hideAddBookmarkModal();
    }

    async deleteBookmark(id) {
        if (confirm('Are you sure you want to delete this bookmark?')) {
            this.bookmarks = this.bookmarks.filter(bookmark => bookmark.id !== id);
            await this.saveBookmarks();
            this.filteredBookmarks = [...this.bookmarks];
            this.renderQuickAccess();
        }
    }

    searchBookmarks(query) {
        if (!query.trim()) {
            this.filteredBookmarks = [...this.bookmarks];
        } else {
            const searchTerm = query.toLowerCase();
            this.filteredBookmarks = this.bookmarks.filter(bookmark =>
                bookmark.title.toLowerCase().includes(searchTerm) ||
                bookmark.url.toLowerCase().includes(searchTerm) ||
                bookmark.category.toLowerCase().includes(searchTerm)
            );
        }
        this.renderQuickAccess();
    }

    // Remove setView method since we only have favicon view now

    renderQuickAccess() {
        const quickAccessContainer = document.getElementById('quickAccess');
        
        quickAccessContainer.innerHTML = this.filteredBookmarks.map(bookmark => `
            <div class="group relative flex flex-col items-center p-3 rounded-lg hover:bg-white hover:shadow-md transition-all duration-200 border border-transparent hover:border-gray-200">
                <a href="${bookmark.url}" class="flex flex-col items-center">
                    <div class="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                        <img src="${bookmark.favicon}" alt="" class="w-6 h-6" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                        <div class="w-6 h-6 bg-blue-500 rounded flex items-center justify-center text-white text-xs font-bold" style="display: none;">
                            ${bookmark.title.charAt(0).toUpperCase()}
                        </div>
                    </div>
                    <span class="text-xs text-gray-600 text-center truncate w-full">${bookmark.title}</span>
                </a>
                <button data-delete-bookmark="${bookmark.id}" class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 w-6 h-6 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all flex items-center justify-center">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>
        `).join('');
        
        // Add event listeners for delete buttons
        this.attachDeleteListeners();
    }

    attachDeleteListeners() {
        const deleteButtons = document.querySelectorAll('[data-delete-bookmark]');
        deleteButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const bookmarkId = parseInt(button.getAttribute('data-delete-bookmark'));
                this.deleteBookmark(bookmarkId);
            });
        });
    }

    // Removed unused bookmark card and list rendering methods
}

// Initialize the bookmark manager when the page loads
let bookmarkManager;
document.addEventListener('DOMContentLoaded', () => {
    bookmarkManager = new BookmarkManager();
});