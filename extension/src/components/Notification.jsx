import { useEffect, useRef } from "preact/hooks";
import { notification } from "../state/store.js";

export function Notification() {
  const { visible, type } = notification.value;
  const contentRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (visible) {
      // Slide in
      requestAnimationFrame(() => {
        if (contentRef.current) {
          contentRef.current.classList.remove("translate-x-full");
          contentRef.current.classList.add("translate-x-0");
        }
      });

      // Auto-hide after delay
      const delay = type === "import" ? 3000 : 2000;
      timeoutRef.current = setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.classList.remove("translate-x-0");
          contentRef.current.classList.add("translate-x-full");
        }
        setTimeout(() => {
          notification.value = { visible: false, type: null };
        }, 300);
      }, delay);

      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }
  }, [visible, type]);

  if (!visible) return null;

  if (type === "copy") {
    return (
      <div class="fixed top-20 right-4 z-50">
        <div
          ref={contentRef}
          class="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg shadow-sm flex items-center space-x-2 transform translate-x-full transition-transform duration-300 ease-in-out"
        >
          <svg
            class="w-4 h-4 text-green-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V9a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <span class="text-sm">URL copied</span>
        </div>
      </div>
    );
  }

  if (type === "import") {
    return (
      <div class="fixed top-20 right-4 z-50">
        <div
          ref={contentRef}
          class="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded-lg shadow-sm flex items-center space-x-2 transform translate-x-full transition-transform duration-300 ease-in-out"
        >
          <svg
            class="w-4 h-4 text-blue-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span class="text-sm">Data imported successfully</span>
        </div>
      </div>
    );
  }

  return null;
}
