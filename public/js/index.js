

const mobileMenuBtn = document.getElementById("mobile-menu-btn")

const mobileMenu = document.getElementById("mobile-menu")

mobileMenuBtn.addEventListener("click", (e) => {
    mobileMenuBtn.classList.toggle("active")
    mobileMenu.classList.toggle("active")

})

document.addEventListener("click", (e) => {
    if (!mobileMenu.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
        mobileMenuBtn.classList.remove("active")
        mobileMenu.classList.remove("active")
    }
})


const header = document.getElementById("header")
let lastScroll = 0

if (window.scrollY === 0) {
    header.classList.add("active")
    header.classList.add("transparent")
}

document.addEventListener("scroll", () => {
    let currentScroll = window.scrollY

    if (currentScroll === 0) {
        header.classList.add("active")
        header.classList.add("transparent")
    } else {
        header.classList.remove("transparent")

        if (currentScroll > lastScroll) {
            header.classList.remove("active")
        } else if (currentScroll < lastScroll) {
            header.classList.add("active")
        }
    }

    lastScroll = currentScroll
})
