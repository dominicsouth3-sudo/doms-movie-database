async function testserver() {
    try {
        const response = await fetch("/api/test");
        const data = await response.json();
        document.getElementById("results").textContent = data.message;
    } catch (error) {
        document.getElementById("results").textContent =
            "Could not connect to server";
    }
}

function createTitleCard(title) {
    const card = document.createElement("article");
    card.className = "title-card";
    card.tabIndex = 0;

    if (title.poster_url) {
        const poster = document.createElement("img");
        poster.src = title.poster_url;
        poster.alt = `Poster for ${title.title || "Untitled"}`;
        poster.className = "title-poster";
        poster.addEventListener("error", () => poster.remove());
        card.appendChild(poster);
    }

    const heading = document.createElement("h2");
    heading.textContent = title.title || "Untitled";
    card.appendChild(heading);

    const info = document.createElement("p");
    info.textContent =
        `${title.type || "Unknown"} · ${title.release_year || "Unknown year"}`;
    card.appendChild(info);

    const controls = document.createElement("div");
    controls.className = "title-controls";

    const ratingLabel = document.createElement("label");
    ratingLabel.textContent = "My rating: ";

    const ratingSelect = document.createElement("select");
    for (let rating = 0; rating <= 10; rating++) {
        const option = document.createElement("option");
        option.value = rating;
        option.textContent = rating;
        ratingSelect.appendChild(option);
    }

    ratingSelect.value = String(
        Math.round(Number(title.average_rating || 0))
    );

    ratingSelect.addEventListener("change", async () => {
        try {
            const response = await fetch(`/api/titles/${title.id}/rating`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    rating: Number(ratingSelect.value)
                })
            });

            if (!response.ok) {
                throw new Error("Could not save rating");
            }
        } catch (error) {
            console.error("Error saving rating:", error);
        }
    });

    ratingLabel.appendChild(ratingSelect);
    controls.appendChild(ratingLabel);

    const watchedLabel = document.createElement("label");
    const watchedCheckbox = document.createElement("input");
    watchedCheckbox.type = "checkbox";
    watchedCheckbox.checked = Boolean(title.watched);

    watchedCheckbox.addEventListener("change", async () => {
        try {
            const response = await fetch(`/api/titles/${title.id}/watched`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    watched: watchedCheckbox.checked
                })
            });

            if (!response.ok) {
                throw new Error("Could not save watched status");
            }
        } catch (error) {
            watchedCheckbox.checked = !watchedCheckbox.checked;
            console.error("Error saving watched status:", error);
        }
    });

    watchedLabel.appendChild(watchedCheckbox);
    watchedLabel.append(" Watched");
    controls.appendChild(watchedLabel);

    card.appendChild(controls);

    const details = document.createElement("div");
    details.className = "title-details";
    details.hidden = true;

    const description = document.createElement("p");
    description.textContent =
        title.description || "No further information is available.";
    details.appendChild(description);
    card.appendChild(details);

    const toggleDetails = () => {
        details.hidden = !details.hidden;
        card.classList.toggle("is-expanded", !details.hidden);
    };

    card.addEventListener("click", (event) => {
        if (event.target.closest("input, select, label")) return;
        toggleDetails();
    });

    card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleDetails();
        }
    });

    return card;
}

function renderTitles(titles) {
    const container = document.getElementById("results");

    if (!container) {
        throw new Error('Could not find the element with id "results".');
    }

    container.innerHTML = "";

    if (titles.length === 0) {
        container.innerHTML = "<p>No movies or TV shows found.</p>";
        return;
    }

    titles.forEach((title) => {
        container.appendChild(createTitleCard(title));
    });
}

async function loadTitles() {
    try {
        const response = await fetch("/api/titles");

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        renderTitles(await response.json());
    } catch (error) {
        console.error("Error loading titles:", error);
        document.getElementById("results").textContent =
            "Could not load titles.";
    }
}

async function searchTitles() {
    const search = document.getElementById("searchInput").value.trim();

    if (search === "") {
        loadTitles();
        return;
    }

    try {
        const response = await fetch(
            "/api/search?q=" + encodeURIComponent(search)
        );

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        renderTitles(await response.json());
    } catch (error) {
        console.error("Error searching titles:", error);
        document.getElementById("results").textContent =
            "Could not search titles.";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadTitles();

    document.getElementById("searchButton")
        .addEventListener("click", searchTitles);
});