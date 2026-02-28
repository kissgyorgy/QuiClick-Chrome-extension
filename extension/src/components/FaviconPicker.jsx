// Shared favicon selection grid component

export function FaviconPicker({
  faviconUrls,
  selectedFavicon,
  onSelect,
  isLoading,
}) {
  if (isLoading && faviconUrls.length === 0) {
    return (
      <div class="grid grid-cols-6 gap-2 p-3 border border-custom-border rounded-lg bg-gray-50">
        <div class="text-sm text-gray-500 col-span-6 text-center">
          Loading favicon options...
        </div>
      </div>
    );
  }

  if (!isLoading && faviconUrls.length === 0) {
    return (
      <div class="grid grid-cols-6 gap-2 p-3 border border-custom-border rounded-lg bg-gray-50">
        <div class="text-sm text-gray-500 col-span-6 text-center">
          Enter a URL to load favicon options
        </div>
      </div>
    );
  }

  return (
    <div class="grid grid-cols-6 gap-2 p-3 border border-custom-border rounded-lg bg-gray-50">
      {faviconUrls.map((favicon) => {
        const url = typeof favicon === "string" ? favicon : favicon.url;
        const label = typeof favicon === "string" ? url : favicon.label;
        const isSelected = selectedFavicon === url || false;

        return (
          <FaviconOption
            key={url}
            url={url}
            label={label}
            isSelected={isSelected}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
}

function FaviconOption({ url, label, isSelected, onSelect }) {
  function handleError(e) {
    e.currentTarget.parentElement.style.display = "none";
  }

  return (
    <div
      class={`w-10 h-10 border rounded cursor-pointer hover:border-blue-500 flex items-center justify-center bg-white transition-colors ${
        isSelected
          ? "border-blue-500 bg-blue-50 border-2"
          : "border-gray-300 border"
      }`}
      title={label}
      onClick={() => onSelect({ url, label })}
    >
      <img src={url} class="w-8 h-8 rounded" alt="" onError={handleError} />
    </div>
  );
}
