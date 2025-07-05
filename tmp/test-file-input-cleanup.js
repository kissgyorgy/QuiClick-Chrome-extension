// Test file input cleanup logic
function cleanupFileInput(fileInput) {
    try {
        if (fileInput && fileInput.parentNode) {
            fileInput.parentNode.removeChild(fileInput);
            return true;
        }
        return false;
    } catch (error) {
        console.warn('File input cleanup failed:', error);
        return false;
    }
}

// Mock DOM
const mockDocument = {
    createElement: () => ({
        parentNode: {
            removeChild: (node) => console.log('File input removed successfully')
        }
    }),
    body: {
        appendChild: (node) => console.log('File input added to body')
    }
};

// Test cleanup
const fileInput = mockDocument.createElement('input');
mockDocument.body.appendChild(fileInput);
const result = cleanupFileInput(fileInput);
console.log('Cleanup result:', result);

// Test cleanup of already removed element
const alreadyRemovedInput = { parentNode: null };
const result2 = cleanupFileInput(alreadyRemovedInput);
console.log('Already removed result:', result2);

// Test cleanup of null input
const result3 = cleanupFileInput(null);
console.log('Null input result:', result3);

console.log('File input cleanup tests completed');