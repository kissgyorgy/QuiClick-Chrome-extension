import { useEffect, useState, useRef } from "preact/hooks";
import { initStore } from "./state/storage-bridge.js";
import {
  activeModal,
  contextMenu,
  currentBookmarkId,
  currentFolderId,
} from "./state/store.js";
import { cleanupUnusedFavicons } from "./utils/favicon.js";
import { isValidUrl, extractTitleFromUrl } from "./utils/url.js";
import { bookmarks } from "./state/store.js";
import { Header } from "./components/Header.jsx";
import { BookmarkGrid } from "./components/BookmarkGrid.jsx";
import { SettingsButton } from "./components/SettingsButton.jsx";
import { ContextMenu } from "./components/ContextMenu.jsx";
import { AddBookmarkModal } from "./components/AddBookmarkModal.jsx";
import { EditBookmarkModal } from "./components/EditBookmarkModal.jsx";
import { DeleteConfirm } from "./components/DeleteConfirm.jsx";
import { FolderModal } from "./components/FolderModal.jsx";
import { CreateFolderModal } from "./components/CreateFolderModal.jsx";
import { RenameFolderModal } from "./components/RenameFolderModal.jsx";
import { SettingsModal } from "./components/SettingsModal.jsx";
import { ImportConfirmModal } from "./components/ImportConfirmModal.jsx";
import { Notification } from "./components/Notification.jsx";

export function NewTabApp() {
  const [prefillUrl, setPrefillUrl] = useState("");
  const [prefillTitle, setPrefillTitle] = useState("");

  useEffect(() => {
    (async () => {
      await initStore();
      await cleanupUnusedFavicons(bookmarks.peek());
      chrome.runtime.sendMessage({ type: "pull_changes" }).catch(() => {});
    })();

    // Global keyboard listener
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        activeModal.value = null;
        contextMenu.value = { ...contextMenu.peek(), visible: false };
        currentBookmarkId.value = null;
        currentFolderId.value = null;
      }
    }

    // Global click listener — hide context menu + settings on outside click
    function handleClick(e) {
      const ctx = contextMenu.peek();
      if (ctx.visible) {
        const menu = document.getElementById("contextMenu");
        if (menu && !menu.contains(e.target)) {
          contextMenu.value = { ...ctx, visible: false };
        }
      }

      // Close settings modal on outside click
      if (activeModal.peek() === "settings") {
        const settingsArea = e.target.closest(
          ".modal-content, [class*='fixed right-6 bottom-6']",
        );
        if (!settingsArea) {
          activeModal.value = null;
        }
      }
    }

    // Prevent default context menu globally
    function handleContextMenu(e) {
      e.preventDefault();
    }

    // Paste handler for URLs
    async function handlePaste(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;

      e.preventDefault();

      let clipboardText;
      try {
        clipboardText = await navigator.clipboard.readText();
      } catch (_) {
        clipboardText = e.clipboardData?.getData("text/plain");
      }

      if (!clipboardText || !clipboardText.trim()) return;
      const text = clipboardText.trim();

      if (isValidUrl(text)) {
        setPrefillUrl(text);
        setPrefillTitle(extractTitleFromUrl(text));
        activeModal.value = "addBookmark";
      } else {
        const urlMatch = text.match(/(https?:\/\/[^\s]+)/i);
        if (urlMatch) {
          const url = urlMatch[1];
          const title =
            text.replace(urlMatch[0], "").trim() || extractTitleFromUrl(url);
          setPrefillUrl(url);
          setPrefillTitle(title);
          activeModal.value = "addBookmark";
        }
      }
    }

    // External drag-and-drop handler for URLs
    function preventDragDefaults(e) {
      e.preventDefault();
      e.stopPropagation();
    }
    ["dragenter", "dragover", "dragleave", "drop"].forEach((ev) =>
      document.addEventListener(ev, preventDragDefaults, false),
    );

    function handleExternalDrop(e) {
      e.preventDefault();

      // Only handle external drops (not internal bookmark reordering)
      const { isDragging } =
        (window.__quiclick_dragState && window.__quiclick_dragState()) || {};
      if (isDragging) return;

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

      if (url && isValidUrl(url)) {
        if (!title || title === url || title.startsWith("http")) {
          title = extractTitleFromUrl(url);
        }
        setPrefillUrl(url);
        setPrefillTitle(title);
        activeModal.value = "addBookmark";
      }
    }

    document.body.addEventListener("drop", handleExternalDrop);

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("click", handleClick);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("paste", handlePaste);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("click", handleClick);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("paste", handlePaste);
      document.body.removeEventListener("drop", handleExternalDrop);
      ["dragenter", "dragover", "dragleave", "drop"].forEach((ev) =>
        document.removeEventListener(ev, preventDragDefaults, false),
      );
    };
  }, []);

  // Clear prefill data when modal closes
  useEffect(() => {
    if (activeModal.value !== "addBookmark") {
      setPrefillUrl("");
      setPrefillTitle("");
    }
  }, [activeModal.value]);

  return (
    <>
      <Header />
      <main class="max-w-7xl mx-auto px-6 py-8">
        <section>
          <div class="mb-6"></div>
          <BookmarkGrid />
        </section>
      </main>
      <SettingsButton />
      <ContextMenu />
      <AddBookmarkModal prefillUrl={prefillUrl} prefillTitle={prefillTitle} />
      <EditBookmarkModal />
      <DeleteConfirm />
      <FolderModal />
      <CreateFolderModal />
      <RenameFolderModal />
      <SettingsModal />
      <ImportConfirmModal />
      <Notification />
    </>
  );
}
