document.addEventListener("DOMContentLoaded", () => {
  // Set up tab switching between Wishlist and Settings.
  const tabWishlist = document.getElementById("tabWishlist");
  const tabSettings = document.getElementById("tabSettings");
  const wishlistTab = document.getElementById("wishlistTab");
  const settingsTab = document.getElementById("settingsTab");

  tabWishlist.addEventListener("click", () => {
    tabWishlist.classList.add("active");
    tabSettings.classList.remove("active");
    tabWishlist.setAttribute("aria-selected", "true");
    tabSettings.setAttribute("aria-selected", "false");
    wishlistTab.classList.add("active");
    settingsTab.classList.remove("active");
  });

  tabSettings.addEventListener("click", () => {
    tabSettings.classList.add("active");
    tabWishlist.classList.remove("active");
    tabSettings.setAttribute("aria-selected", "true");
    tabWishlist.setAttribute("aria-selected", "false");
    settingsTab.classList.add("active");
    wishlistTab.classList.remove("active");
  });

  // Check if the current tab is on Fab and load the wishlist
  checkCurrentTab();
  loadWishlist();

  // Update the list when the sort dropdown or filter input changes.
  document.getElementById("sortSelect").addEventListener("change", loadWishlist);
  document.getElementById("filterInput").addEventListener("input", loadWishlist);
});

// Check if the active tab is on Fab and disable the Add button if not
function checkCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    const addBtn = document.getElementById("addBtn");
    const fabWarning = document.getElementById("fabWarning");
    if (currentTab && currentTab.url.indexOf("fab.com") === -1) {
      addBtn.disabled = true;
      fabWarning.textContent = "Open Fab.com to add more items";
    } else {
      addBtn.disabled = false;
      fabWarning.textContent = "";
    }
  });
}

// When the user clicks the Add button add it to storage
document.getElementById("addBtn").addEventListener("click", async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.scripting.executeScript(
    {
      target: { tabId: tab.id },
      func: getItemDetails
    },
    (results) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        alert("Error: Unable to get item details. Please check the page structure.");
        return;
      }
      if (results && results[0] && results[0].result) {
        const asset = results[0].result;
        if (!asset) {
          alert("Error: No item details found. The page structure may have changed.");
          return;
        }
        chrome.storage.local.get({ ufwWishlist: [] }, (data) => {
          const wishlist = data.ufwWishlist;
          if (wishlist.some(item => item.url === asset.url)) {
            alert("This item has already been added to your wishlist.");
            return;
          }
          wishlist.push(asset);
          chrome.storage.local.set({ ufwWishlist: wishlist }, loadWishlist);
        });
      }
    }
  );
});

// Extracts the item details from the current page
function getItemDetails() {
  try {
    const titleElem = document.querySelector("aside h1");
    const title = titleElem ? titleElem.innerText.trim() : document.title;
    const url = document.location.href;
    const priceElem = document.querySelector('aside button[aria-haspopup="true"]');
    const priceText = priceElem ? priceElem.innerText : "";
    const match = priceText.match(/\$[\d,.]+/);
    const price = match ? match[0] : "Unknown";
    // Try to get a thumbnail image (using a sample selector)
    const thumbElem = document.querySelector(".fabkit-Thumbnail-root img") || document.querySelector("img");
    const thumbnail = thumbElem ? thumbElem.src : "";
    return { title, url, price, thumbnail };
  } catch (error) {
    console.error("Error getting item details:", error);
    return null;
  }
}

// Loads and displays wishlist items, applying sorting and filtering
function loadWishlist() {
  chrome.storage.local.get({ ufwWishlist: [] }, (data) => {
    let wishlist = data.ufwWishlist;
    const sortOption = document.getElementById("sortSelect").value;
    const filterText = document.getElementById("filterInput").value.toLowerCase().trim();
    
    let sortedWishlist = wishlist.slice();
    if (sortOption === "name") {
      sortedWishlist.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    } else if (sortOption === "priceLow") {
      sortedWishlist.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
    } else if (sortOption === "priceHigh") {
      sortedWishlist.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
    }
    
    // Filter items based on the filter input
    if (filterText) {
      sortedWishlist = sortedWishlist.filter(item =>
        item.title.toLowerCase().includes(filterText)
      );
    }
    
    const container = document.getElementById("wishlistContainer");
    container.innerHTML = "";
    if (sortedWishlist.length === 0) {
      container.innerHTML = "<p>No items in wishlist yet.</p>";
      return;
    }
    sortedWishlist.forEach((asset) => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "wishlist-item";
      
      // If there's a thumbnail, add an image element.
      if (asset.thumbnail) {
        const thumbImg = document.createElement("img");
        thumbImg.src = asset.thumbnail;
        thumbImg.alt = asset.title;
        itemDiv.appendChild(thumbImg);
      }
      
      const link = document.createElement("a");
      link.href = asset.url;
      link.target = "_blank";
      link.textContent = asset.title + " - " + asset.price;
      link.setAttribute("aria-label", `${asset.title}, price ${asset.price}`);
      itemDiv.appendChild(link);
      
      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-btn";
      removeBtn.textContent = "✖";
      removeBtn.setAttribute("aria-label", `Remove ${asset.title} from wishlist`);
      removeBtn.addEventListener("click", () => {
        if (confirm(`Are you sure you want to remove "${asset.title}" from your wishlist?`)) {
          removeItem(asset.url, itemDiv);
        }
      });
      itemDiv.appendChild(removeBtn);
      container.appendChild(itemDiv);
    });
  });
}

// Converts a price string (without the currency symbol) to a number.
function parsePrice(priceStr) {
  if (typeof priceStr !== "string") return Infinity;
  let num = parseFloat(priceStr.replace(/^\$/, ""));
  return isNaN(num) ? Infinity : num;
}

// Removes an item from the wishlist with a fade-out animation.
function removeItem(url, itemElement) {
  itemElement.classList.add("removing");
  itemElement.addEventListener("animationend", () => {
    chrome.storage.local.get({ ufwWishlist: [] }, (data) => {
      let wishlist = data.ufwWishlist;
      wishlist = wishlist.filter(item => item.url !== url);
      chrome.storage.local.set({ ufwWishlist: wishlist }, loadWishlist);
    });
  });
}

// Exports the wishlist as a CSV file (with price formatted without the $ sign).
document.getElementById("exportBtn").addEventListener("click", () => {
  chrome.storage.local.get({ ufwWishlist: [] }, (data) => {
    const wishlist = data.ufwWishlist;
    let csvContent = "Title,URL,Price\n";
    wishlist.forEach(asset => {
      let price = asset.price.replace(/^\$/, "");
      let title = `"${asset.title.replace(/"/g, '""')}"`;
      let url = `"${asset.url.replace(/"/g, '""')}"`;
      csvContent += `${title},${url},${price}\n`;
    });
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const urlBlob = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = urlBlob;
    a.download = "wishlist.csv";
    a.click();
    URL.revokeObjectURL(urlBlob);
  });
});

// Imports the wishlist from a CSV file.
document.getElementById("importFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const text = event.target.result;
      const lines = text.split("\n").filter(line => line.trim() !== "");
      if (lines.length < 2) {
        alert("CSV file is empty or invalid.");
        return;
      }
      // Remove header
      lines.shift();
      const importedWishlist = lines.map(line => {
        const parts = line.split(/,(?=(?:"[^"]*"|[^"]*$))/);
        if (parts.length < 3) return null;
        const title = parts[0].replace(/^"|"$/g, "").trim();
        const url = parts[1].replace(/^"|"$/g, "").trim();
        const price = parts[2].replace(/^"|"$/g, "").trim();
        return { title, url, price };
      }).filter(item => item !== null);
      chrome.storage.local.set({ ufwWishlist: importedWishlist }, () => {
        alert("Wishlist imported successfully.");
        loadWishlist();
      });
    } catch (error) {
      console.error(error);
      alert("Failed to import wishlist: Invalid CSV file.");
    }
  };
  reader.readAsText(file);
});

// Clears all wishlist items after confirmation.
document.getElementById("clearBtn").addEventListener("click", () => {
  if (confirm("Are you sure you want to clear all wishlist items? This action cannot be undone.")) {
    chrome.storage.local.set({ ufwWishlist: [] }, loadWishlist);
  }
});
