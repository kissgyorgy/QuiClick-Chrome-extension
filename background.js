// Background script for QuiClick extension
// Handles the action button clicks to add bookmarks to QuiClick

class QuiClickBackground {
    constructor() {
        this.syncAvailable = false;
        this.init();
    }

    async init() {
        await this.checkSyncAvailability();
        this.setupActionListener();
    }

    async checkSyncAvailability() {
        try {
            const testKey = 'syncTest_' + Date.now();
            const testValue = 'test';
            
            await chrome.storage.sync.set({ [testKey]: testValue });
            const result = await chrome.storage.sync.get([testKey]);
            await chrome.storage.sync.remove([testKey]);
            
            if (result[testKey] === testValue) {
                this.syncAvailable = true;
                console.log('✅ Chrome sync storage is available and working');
            } else {
                throw new Error('Sync test failed');
            }
        } catch (error) {
            this.syncAvailable = false;
            console.log('❌ Chrome sync storage not available:', error.message);
        }
    }

    setupActionListener() {
        // No need for action listener since we're using popup now
        // The popup handles all the bookmark addition logic
    }

    async addCurrentTabToQuiClick(tab) {
        try {
            // Get current bookmarks and folders
            const { bookmarks, folders } = await this.loadBookmarks();
            
            // Check if bookmark already exists
            const existingBookmark = bookmarks.find(bookmark => bookmark.url === tab.url);
            if (existingBookmark) {
                console.log('Bookmark already exists:', existingBookmark.title);
                return;
            }

            // Create new bookmark
            const newBookmark = {
                id: Date.now(),
                title: tab.title || this.extractTitleFromUrl(tab.url),
                url: tab.url,
                favicon: await this.getHighResolutionFavicon(tab.url),
                dateAdded: new Date().toISOString(),
                folderId: null
            };

            // Add bookmark to array
            bookmarks.push(newBookmark);

            // Save updated bookmarks
            await this.saveBookmarks(bookmarks, folders);

            console.log('✅ Added bookmark:', newBookmark.title);
            
        } catch (error) {
            console.error('Error adding bookmark:', error);
        }
    }

    async loadBookmarks() {
        try {
            let result;
            let syncResult = null;
            let localResult = null;
            
            if (this.syncAvailable) {
                try {
                    syncResult = await chrome.storage.sync.get(['bookmarks', 'folders']);
                } catch (syncError) {
                    console.log('Sync storage error:', syncError.message);
                }
            }
            
            try {
                localResult = await chrome.storage.local.get(['bookmarks', 'folders']);
            } catch (localError) {
                console.log('Local storage error:', localError.message);
            }
            
            // Determine which storage has the most recent data
            if (localResult && localResult.bookmarks && localResult.bookmarks.length > 0) {
                result = localResult;
            } else if (syncResult && syncResult.bookmarks && syncResult.bookmarks.length > 0) {
                result = syncResult;
            } else {
                result = {};
            }
            
            return {
                bookmarks: result.bookmarks || [],
                folders: result.folders || []
            };
            
        } catch (error) {
            console.log('Error loading bookmarks:', error);
            return {
                bookmarks: [],
                folders: []
            };
        }
    }

    async saveBookmarks(bookmarks, folders) {
        try {
            if (this.syncAvailable) {
                try {
                    const data = { bookmarks, folders };
                    const dataString = JSON.stringify(data);
                    const sizeInBytes = new TextEncoder().encode(dataString).length;
                    
                    if (sizeInBytes > 8000) {
                        console.log('Data too large for sync storage, using local storage');
                        await chrome.storage.local.set(data);
                    } else {
                        await chrome.storage.sync.set(data);
                        console.log('Saved bookmarks and folders to sync storage');
                    }
                } catch (syncError) {
                    console.log('Sync storage failed, saving to local storage:', syncError.message);
                    await chrome.storage.local.set({ bookmarks, folders });
                }
            } else {
                console.log('Sync not available, saving to local storage');
                await chrome.storage.local.set({ bookmarks, folders });
            }
        } catch (error) {
            console.error('Error saving bookmarks:', error);
        }
    }

    extractTitleFromUrl(url) {
        try {
            const hostname = new URL(url).hostname;
            let title = hostname.replace('www.', '');
            title = title.charAt(0).toUpperCase() + title.slice(1);
            return title;
        } catch (e) {
            return 'Bookmark';
        }
    }

    async getHighResolutionFavicon(url) {
        try {
            const domain = new URL(url).hostname;
            
            // Try multiple favicon sources in order of preference
            const faviconUrls = [
                `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
                `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
                `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
                `https://${domain}/favicon.ico`
            ];

            for (const faviconUrl of faviconUrls) {
                try {
                    const response = await fetch(faviconUrl);
                    if (response.ok) {
                        const blob = await response.blob();
                        if (blob.size > 0) {
                            return new Promise((resolve) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result);
                                reader.readAsDataURL(blob);
                            });
                        }
                    }
                } catch (fetchError) {
                    console.log(`Failed to fetch favicon from ${faviconUrl}:`, fetchError.message);
                }
            }

            // Default fallback favicon
            return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMCA5TDEzLjA5IDE1Ljc0TDEyIDIyTDEwLjkxIDE1Ljc0TDQgOUwxMC45MSA4LjI2TDEyIDJaIiBmaWxsPSIjNjM2MzYzIi8+Cjwvc3ZnPgo=';
        } catch (error) {
            console.log('Error getting favicon:', error);
            return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMCA5TDEzLjA5IDE1Ljc0TDEyIDIyTDEwLjkxIDE1Ljc0TDQgOUwxMC45MSA4LjI2TDEyIDJaIiBmaWxsPSIjNjM2MzYzIi8+Cjwvc3ZnPgo=';
        }
    }
}

// Initialize the background script
new QuiClickBackground();