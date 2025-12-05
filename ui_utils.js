
// UI Utility: Dropdown Toggle
function toggleDropdown(btn) {
    const menu = document.querySelector('.dropdown-menu');
    // If clicked from a button, toggle it
    if (menu) {
        // Simple toggle logic
        if (menu.classList.contains('show')) {
            menu.classList.remove('show');
        } else {
            menu.classList.add('show');
        }
    }
}

// Close dropdown when clicking outside
window.onclick = function (event) {
    if (!event.target.matches('.btn-toggle')) {
        const dropdowns = document.getElementsByClassName("dropdown-menu");
        for (let i = 0; i < dropdowns.length; i++) {
            const openDropdown = dropdowns[i];
            if (openDropdown.classList.contains('show')) {
                openDropdown.classList.remove('show');
            }
        }
    }
}
