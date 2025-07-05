// Test export data structure
const testData = {
    bookmarks: [
        {
            id: 1620000000000,
            title: "Test Bookmark",
            url: "https://example.com",
            category: "general",
            favicon: "https://www.google.com/s2/favicons?domain=example.com",
            dateAdded: "2023-01-01T00:00:00.000Z"
        }
    ],
    folders: [
        {
            id: 1620000001000,
            name: "Test Folder",
            dateCreated: "2023-01-01T00:00:00.000Z"
        }
    ],
    settings: {
        showTitles: true,
        tilesPerRow: 8,
        tileGap: 1,
        showAddButton: true
    },
    exportDate: new Date().toISOString(),
    version: "1.0"
};

console.log('Export data structure:');
console.log(JSON.stringify(testData, null, 2));
console.log('\nExport successful - data is valid JSON');