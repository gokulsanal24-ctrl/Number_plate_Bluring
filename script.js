const form = document.querySelector("#uploadForm");
const imageInput = document.querySelector("#imageInput");
const dropzone = document.querySelector(".dropzone");
const previewList = document.querySelector("#previewList");
const resultList = document.querySelector("#resultList");
const resultCount = document.querySelector("#resultCount");
const statusText = document.querySelector("#status");
const submitButton = document.querySelector("#submitButton");
const progress = document.querySelector("#progress");

let selectedFiles = [];
let previewUrls = [];

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Processing..." : "Blur Number Plates";
  progress.hidden = !isLoading;
}

function clearPreviews() {
  previewUrls.forEach((url) => URL.revokeObjectURL(url));
  previewUrls = [];
  previewList.replaceChildren();
}

function renderPreviews(files) {
  clearPreviews();

  files.forEach((file) => {
    const url = URL.createObjectURL(file);
    previewUrls.push(url);

    const figure = document.createElement("figure");
    figure.className = "image-panel";
    figure.innerHTML = `
      <figcaption>${escapeHtml(file.name)}</figcaption>
      <img src="${url}" alt="Preview of ${escapeHtml(file.name)}" />
    `;
    previewList.appendChild(figure);
  });
}

function setFiles(files) {
  selectedFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
  resultList.replaceChildren();
  resultCount.textContent = "No outputs yet";

  if (selectedFiles.length === 0) {
    clearPreviews();
    setStatus("Choose at least one image.", true);
    return;
  }

  renderPreviews(selectedFiles);
  setStatus(`${selectedFiles.length} image${selectedFiles.length === 1 ? "" : "s"} ready.`);
}

imageInput.addEventListener("change", () => {
  setFiles(imageInput.files);
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragging");
  });
});

dropzone.addEventListener("drop", (event) => {
  setFiles(event.dataTransfer.files);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (selectedFiles.length === 0) {
    setStatus("Choose at least one image first.", true);
    return;
  }

  const formData = new FormData();
  selectedFiles.forEach((file) => {
    formData.append("image", file);
  });

  setLoading(true);
  resultList.replaceChildren();
  resultCount.textContent = "Processing...";
  setStatus("Uploading images and blurring number plates.");

  try {
    const response = await fetch("/upload", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Image processing failed.");
    }

    renderResults(data.results || []);
    setStatus("Done. Processed images are ready.");
  } catch (error) {
    resultCount.textContent = "No outputs yet";
    setStatus(error.message, true);
  } finally {
    setLoading(false);
  }
});

function renderResults(results) {
  resultCount.textContent = `${results.length} output${results.length === 1 ? "" : "s"}`;
  resultList.replaceChildren();

  results.forEach((result) => {
    const card = document.createElement("article");
    card.className = "result-card";
    card.innerHTML = `
      <header class="result-header">
        <h2>${escapeHtml(result.originalName)}</h2>
        <span>${result.detectionCount} plate${result.detectionCount === 1 ? "" : "s"}</span>
      </header>
      <div class="result-images">
        <figure class="image-panel">
          <figcaption>Bounding Boxes</figcaption>
          <img src="${result.boxesUrl}" alt="Detected bounding boxes for ${escapeHtml(result.originalName)}" />
        </figure>
        <figure class="image-panel">
          <figcaption>Blurred Output</figcaption>
          <img src="${result.outputUrl}" alt="Blurred output for ${escapeHtml(result.originalName)}" />
        </figure>
      </div>
      <a class="download" href="${result.outputUrl}" download>Download Processed Image</a>
    `;
    resultList.appendChild(card);
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}
