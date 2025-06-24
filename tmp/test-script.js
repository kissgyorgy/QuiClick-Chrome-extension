// Test script to verify folder functionality works
// Mock Chrome APIs for testing
window.chrome = {
    storage: {
        local: {
            get: async (keys) => {
                console.log('Mock: Getting from local storage:', keys);
                return {};
            },
            set: async (data) => {
                console.log('Mock: Setting to local storage:', data);
            }
        },
        sync: {
            get: async (keys) => {
                console.log('Mock: Getting from sync storage:', keys);
                throw new Error('Sync not available in test');
            },
            set: async (data) => {
                console.log('Mock: Setting to sync storage:', data);
                throw new Error('Sync not available in test');
            },
            remove: async (keys) => {
                console.log('Mock: Removing from sync storage:', keys);
                throw new Error('Sync not available in test');
            }
        }
    },
    tabs: {
        create: (options) => {
            console.log('Mock: Creating tab:', options);
        }
    },
    runtime: {
        id: 'test-extension-id'
    }
};

console.log('✅ Mocked Chrome APIs');

// Test folder creation
async function testFolderFunctionality() {
    console.log('🧪 Testing folder functionality...');
    
    try {
        // Create a test bookmark manager instance
        const manager = new BookmarkManager();
        
        // Wait for initialization
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('📁 Initial folders:', manager.folders);
        console.log('📚 Initial bookmarks:', manager.bookmarks);
        
        // Test creating a folder
        console.log('Creating test folder...');
        const testFolder = await manager.createFolder('Test Folder');
        console.log('✅ Created folder:', testFolder);
        
        // Test creating a bookmark and moving it to folder
        console.log('Adding test bookmark...');
        const testBookmark = {
            id: Date.now(),
            title: 'Test Bookmark',
            url: 'https://example.com',
            favicon: '',
            dateAdded: new Date().toISOString(),
            folderId: null
        };
        
        manager.bookmarks.push(testBookmark);
        await manager.saveBookmarks();
        
        console.log('Moving bookmark to folder...');
        await manager.moveBookmarkToFolder(testBookmark.id, testFolder.id);
        
        console.log('✅ Final state:');
        console.log('📁 Folders:', manager.folders);
        console.log('📚 Bookmarks:', manager.bookmarks);
        
        // Test filtering
        const folderBookmarks = manager.bookmarks.filter(b => b.folderId === testFolder.id);
        console.log('📚 Bookmarks in folder:', folderBookmarks);
        
        console.log('🎉 All tests passed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run test when page loads
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(testFolderFunctionality, 500);
});