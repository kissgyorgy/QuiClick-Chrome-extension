import { dragState } from "../state/store.js";
import { reorderBookmarks } from "./use-bookmarks.js";
import {
  moveBookmarkToFolder,
  removeBookmarkFromFolder,
} from "./use-folders.js";

// Returns drag handlers for a bookmark tile
export function useBookmarkDragHandlers(bookmarkId) {
  function onDragStart(e) {
    dragState.value = {
      isDragging: true,
      draggedBookmarkId: bookmarkId,
      draggedFolderId: null,
    };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(bookmarkId));
  }

  function onDragEnd() {
    dragState.value = {
      isDragging: false,
      draggedBookmarkId: null,
      draggedFolderId: null,
    };
  }

  function onDragOver(e) {
    const { draggedBookmarkId } = dragState.peek();
    if (draggedBookmarkId && draggedBookmarkId !== bookmarkId) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  }

  function onDrop(e) {
    const { draggedBookmarkId } = dragState.peek();
    if (draggedBookmarkId && draggedBookmarkId !== bookmarkId) {
      e.preventDefault();
      // Determine insert position from cursor X
      const rect = e.currentTarget.getBoundingClientRect();
      const insertAfter = e.clientX > rect.left + rect.width / 2;
      reorderBookmarks(draggedBookmarkId, bookmarkId, insertAfter);
    }
  }

  return { onDragStart, onDragEnd, onDragOver, onDrop };
}

// Returns drag handlers for a folder tile
export function useFolderDropHandlers(folderId) {
  function onDragOver(e) {
    const { draggedBookmarkId } = dragState.peek();
    if (draggedBookmarkId) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  }

  function onDrop(e) {
    const { draggedBookmarkId } = dragState.peek();
    if (draggedBookmarkId) {
      e.preventDefault();
      moveBookmarkToFolder(draggedBookmarkId, folderId);
    }
  }

  return { onDragOver, onDrop };
}

// Returns handlers for the folder modal backdrop (drag bookmark out of folder)
export function useFolderModalDropHandlers(openFolderIdValue) {
  function onDragOver(e) {
    const { draggedBookmarkId } = dragState.peek();
    if (draggedBookmarkId && e.target === e.currentTarget) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  }

  function onDrop(e) {
    const { draggedBookmarkId } = dragState.peek();
    if (draggedBookmarkId && e.target === e.currentTarget) {
      e.preventDefault();
      removeBookmarkFromFolder(draggedBookmarkId);
    }
  }

  return { onDragOver, onDrop };
}

// External page-level drag drop (dragging URLs from outside the page)
export function useExternalDropHandlers(onExternalDrop) {
  let dragCounter = 0;

  function onDragEnter(e) {
    const { isDragging } = dragState.peek();
    if (!isDragging) {
      e.preventDefault();
      dragCounter++;
    }
  }

  function onDragLeave(e) {
    const { isDragging } = dragState.peek();
    if (!isDragging) {
      e.preventDefault();
      dragCounter--;
    }
  }

  function onDragOver(e) {
    e.preventDefault();
  }

  function onDrop(e) {
    const { isDragging } = dragState.peek();
    if (!isDragging) {
      e.preventDefault();
      dragCounter = 0;

      const url =
        e.dataTransfer.getData("text/uri-list") ||
        e.dataTransfer.getData("text/plain");

      let title = "";
      const htmlData = e.dataTransfer.getData("text/html");
      const plainText = e.dataTransfer.getData("text/plain");

      if (htmlData) {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = htmlData;
        const linkElement = tempDiv.querySelector("a");
        if (
          linkElement &&
          linkElement.textContent &&
          linkElement.textContent.trim() !== url &&
          !linkElement.textContent.trim().startsWith("http")
        ) {
          title = linkElement.textContent.trim();
        }
      }

      if (
        !title &&
        plainText &&
        plainText !== url &&
        !plainText.startsWith("http")
      ) {
        title = plainText.trim();
      }

      if (url) {
        onExternalDrop(url, title);
      }
    }
  }

  return {
    onDragEnter,
    onDragLeave,
    onDragOver,
    onDrop,
    getDragCounter: () => dragCounter,
  };
}
