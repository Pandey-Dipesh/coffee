/**
 * PROTECTED LOGIC - DO NOT EDIT
 * This section contains encoded data and security measures.
 */
(function() {
    "use strict";

    // Disable right-click and certain key combinations
    document.addEventListener("contextmenu", function(e) {
        e.preventDefault();
    });

    document.onkeydown = function(e) {
        if (e.keyCode === 123) return false; // F12
        if (e.ctrlKey && e.shiftKey && e.keyCode === "I".charCodeAt(0)) return false; // Ctrl+Shift+I
        if (e.ctrlKey && e.shiftKey && e.keyCode === "C".charCodeAt(0)) return false; // Ctrl+Shift+C
        if (e.ctrlKey && e.shiftKey && e.keyCode === "J".charCodeAt(0)) return false; // Ctrl+Shift+J
        if (e.ctrlKey && e.keyCode === "U".charCodeAt(0)) return false; // Ctrl+U
    };

    // Encoded Software Data
var _0x5f2a = `[
    {
        "name": "Adobe Photoshop",
        "desc": "The industry standard for photo editing and graphic design.",
        "cat": "Design",
        "icon": "https://upload.wikimedia.org/wikipedia/commons/a/af/Adobe_Photoshop_CC_icon.svg",
        "rate": 4.9,
        "down": "1.2M",
        "size": "2.4 GB",
        "official": "https://www.adobe.com/products/photoshop.html",
        "google": "https://mega.nz/file/ywBWzbQS#pRseNnr6fZ5xxjyrufTHLDRA-rmknaRYKYhlM6scmUc",
        "color": "#31C5F0"
    },
    {
        "name": "Premiere Pro",
        "desc": "Professional video editing software for film, TV, and the web.",
        "cat": "Video",
        "icon": "https://upload.wikimedia.org/wikipedia/commons/4/40/Adobe_Premiere_Pro_CC_icon.svg",
        "rate": 4.8,
        "down": "850K",
        "size": "8.1 GB",
        "official": "https://www.adobe.com/products/premiere.html",
        "google": "https://mega.nz/file/m4gwxbbC#W7-hf37yYtfy50tJh9dZz72bKc6lBIw8p6jY2HnxIps",
        "color": "#9D50E8"
    },
    {
        "name": "CapCut",
        "desc": "Easy-to-use yet powerful video editing software for creators, offering advanced effects, transitions, and AI-powered tools.",
        "cat": "Video",
        "icon": "https://tse1.mm.bing.net/th/id/OIP.TCxG5sHUhF83uYz5jnsAEgHaEK?cb=ucfimg2&ucfimg=1&w=1920&h=1080&rs=1&pid=ImgDetMain&o=7&rm=3",
        "rate": 4.7,
        "down": "500M",
        "size": "300 MB",
        "official": "https://www.capcut.com/",
        "google": "https://mega.nz/file/akYxHCQR#GioYjQqA7YYf_jU3YL-Ax6dt52M7ej5mxMrtGMgIM2w",
        "color": "#000000"
    },
    {
        "name": "After Effects",
        "desc": "Professional motion graphics and visual effects software.",
        "cat": "Video",
        "icon": "https://www.adobe.com/cc-shared/assets/img/product-icons/svg/after-effects-40.svg",
        "rate": 4.7,
        "down": "750K",
        "size": "1.8 GB",
        "official": "https://www.adobe.com/products/aftereffects.html",
        "google": "https://mega.nz/file/TgoR3bzZ#NsKYYH8ynNxdeDLE1zmYUcaHwk-MW3OX8o_jTck61jE",
        "color": "#FF6B35"
    }
]`;

    var softwareDatabase = JSON.parse(_0x5f2a);
    var currentCategory = "All";

    // Render software cards
    window.render = function(data) {
        var grid = document.getElementById("softwareGrid");
        var count = document.getElementById("count");

        grid.innerHTML = "";
        count.innerText = data.length;

        if (data.length) {
            data.forEach(function(software, index) {
                var delay = 0.05 * index;
                grid.innerHTML += `
                    <div class="card animate-in" style="animation-delay:${delay}s">
                        <div class="card-header">
                            <img class="app-icon" src="${software.icon}" alt="${software.name} logo" />
                        </div>
                        <div class="card-body">
                            <span class="tag">${software.cat}</span>
                            <h3>${software.name}</h3>
                            <p>${software.desc}</p>
                            <div class="meta-row">
                                <div class="meta-item"><i class="fas fa-star"></i> ${software.rate}</div>
                                <div class="meta-item"><i class="fas fa-download" style="color:var(--text-muted)"></i> ${software.down}</div>
                                <div class="meta-item"><i class="fas fa-hdd" style="color:var(--text-muted)"></i> ${software.size}</div>
                            </div>
                            <div class="action-row">
                                <button class="btn btn-outline" onclick="openLink('${software.official}')">
                                    Go with link <i class="fas fa-external-link-alt" style="font-size:0.8em"></i>
                                </button>
                                <button class="btn btn-primary" onclick="openLink('${software.google}')">
                                    Download <i class="fas fa-arrow-down" style="font-size:0.8em"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
        } else {
            grid.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:60px 0; color:var(--text-muted)">
                    <i class="fas fa-search" style="font-size:3rem;margin-bottom:20px;opacity:0.3"></i>
                    <h3>No software found</h3>
                    <p>Try adjusting your search terms or filters</p>
                </div>
            `;
        }
    };

    // Open external link
    window.openLink = function(url) {
        window.open(url, "_blank", "noopener");
    };

    // Filter by category
    window.filterCategory = function(category) {
        currentCategory = category;
        document.querySelectorAll(".filter-chip").forEach(function(chip) {
            if (chip.innerText.includes(category) || (category === "Video" && chip.innerText.includes("Video"))) {
                chip.classList.add("active");
            } else {
                chip.classList.remove("active");
            }
        });
        applyFilters();
    };

    // Search and apply filters
    window.searchSoftware = function() {
        applyFilters();
    };

    window.applyFilters = function() {
        var searchValue = document.getElementById("searchInput").value.toLowerCase();
        var filtered = softwareDatabase.filter(function(software) {
            var matchesSearch = software.name.toLowerCase().includes(searchValue) || software.desc.toLowerCase().includes(searchValue);
            var matchesCategory = currentCategory === "All" ? true : (currentCategory === "Video" ? software.cat === "Video" || software.cat === "3D" : software.cat === currentCategory);
            return matchesSearch && matchesCategory;
        });
        render(filtered);
    };

    // Mobile menu toggle
    window.toggleMobileMenu = function() {
        var menu = document.getElementById("mobileNav");
        var icon = document.querySelector(".mobile-menu-btn i");
        if (menu.style.display === "flex") {
            menu.style.display = "none";
            icon.classList.remove("fa-times");
            icon.classList.add("fa-bars");
        } else {
            menu.style.display = "flex";
            icon.classList.remove("fa-bars");
            icon.classList.add("fa-times");
        }
    };

    // Event listeners
    document.getElementById("searchInput").addEventListener("input", searchSoftware);
    document.addEventListener("DOMContentLoaded", function() {
        render(softwareDatabase);
    });

})();
