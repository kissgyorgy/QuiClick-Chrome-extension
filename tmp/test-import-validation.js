// Test import validation function
function validateImportData(data) {
    // Check if data has the expected structure
    if (!data || typeof data !== 'object') return false;
    
    // Validate bookmarks array
    if (data.bookmarks && !Array.isArray(data.bookmarks)) return false;
    if (data.bookmarks) {
        for (const bookmark of data.bookmarks) {
            if (!bookmark.id || !bookmark.title || !bookmark.url) return false;
        }
    }

    // Validate folders array
    if (data.folders && !Array.isArray(data.folders)) return false;
    if (data.folders) {
        for (const folder of data.folders) {
            if (!folder.id || !folder.name) return false;
        }
    }

    // Validate settings object
    if (data.settings && typeof data.settings !== 'object') return false;

    return true;
}

// Test with valid data
const validData = require('./test-import-data.json');
console.log('Valid data test:', validateImportData(validData));

// Test with invalid data
const invalidData1 = { bookmarks: "not an array" };
console.log('Invalid bookmarks test:', validateImportData(invalidData1));

const invalidData2 = { 
    bookmarks: [
        { id: 1, title: "Test" } // missing url
    ]
};
console.log('Missing URL test:', validateImportData(invalidData2));

const invalidData3 = { folders: [{ id: 1 }] }; // missing name
console.log('Missing folder name test:', validateImportData(invalidData3));

console.log('All validation tests completed');