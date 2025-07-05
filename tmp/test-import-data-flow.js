// Test import data flow logic
class MockBookmarkManager {
    constructor() {
        this.pendingImportData = null;
        this.bookmarks = [];
        this.folders = [];
        this.settings = {};
    }

    showImportConfirmModal(fileName, importData, fileInput) {
        this.pendingImportData = importData;
        console.log('Modal shown with data:', !!this.pendingImportData);
    }

    hideImportConfirmModal() {
        console.log('Hiding modal, clearing pendingImportData');
        this.pendingImportData = null;
    }

    async confirmImport() {
        try {
            // Check if import data is available
            if (!this.pendingImportData) {
                throw new Error('No import data available');
            }

            // Store import data before modal cleanup
            const importData = this.pendingImportData;
            console.log('Stored import data:', !!importData);

            // Hide modal (this clears pendingImportData)
            this.hideImportConfirmModal();
            console.log('After hiding modal, pendingImportData:', this.pendingImportData);

            // Import the data (using stored copy)
            this.bookmarks = importData.bookmarks || [];
            this.folders = importData.folders || [];
            this.settings = { ...this.settings, ...importData.settings };

            console.log('Import completed successfully');
            return true;
        } catch (error) {
            console.error('Import failed:', error.message);
            return false;
        }
    }
}

// Test the flow
const manager = new MockBookmarkManager();

// Simulate import process
const testData = {
    bookmarks: [{ id: 1, title: 'Test', url: 'https://test.com' }],
    folders: [{ id: 2, name: 'Test Folder' }],
    settings: { showTitles: true }
};

manager.showImportConfirmModal('test.json', testData, null);
const result = await manager.confirmImport();
console.log('Import result:', result);
console.log('Final bookmarks count:', manager.bookmarks.length);
console.log('Final folders count:', manager.folders.length);