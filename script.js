// ======= LOGIN =======
function login() {
  const role = document.getElementById("role").value;
  const dept = document.getElementById("department").value;
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  if (!role || !dept || !username || !password) {
    alert("Please fill all fields!");
    return;
  }

  localStorage.setItem("role", role);
  localStorage.setItem("department", dept);
  localStorage.setItem("username", username);
  window.location.href = "dashboard.html";
}

// ======= LOGOUT =======
function logout() {
  const dept = localStorage.getItem("department");
  const keep = confirm(
    "Keep uploaded notes after logout?\n\n" +
    "Press OK to keep notes for your department available on next login.\n" +
    "Press Cancel to delete them."
  );

  if (!keep && dept) {
    const allNotes = JSON.parse(localStorage.getItem("notes") || "{}");
    if (allNotes[dept]) {
      delete allNotes[dept];
      localStorage.setItem("notes", JSON.stringify(allNotes));
    }
  }

  // remove only authentication info so notes (if kept) remain
  localStorage.removeItem("role");
  localStorage.removeItem("department");
  localStorage.removeItem("username");

  window.location.href = "index.html";
}

// ======= DASHBOARD =======
let currentPreviewName = null;
let sortAsc = false;
let selectedFiles = []; // tracked selected files for upload
window.onload = function () {
  const path = window.location.pathname;
  if (path.includes("dashboard.html")) {
    const role = localStorage.getItem("role");
    const dept = localStorage.getItem("department");
    const username = localStorage.getItem("username");

    if (!role) {
      window.location.href = "index.html";
      return;
    }

    document.getElementById("welcomeMsg").innerText =
      `Welcome ${username}`;
    document.getElementById("deptChip").innerText = `Dept: ${dept}`;
    document.getElementById("sidebarDept").innerText = dept;
    document.getElementById("sidebarRole").innerText = `Role: ${role}`;

    // init drag/drop and file selection
    initUploadControls();

    loadNotes();

    // show any previously kept notes count/last upload
    updateSidebarStats();
  }
};

// ======= NOTES STORAGE (LOCAL) =======
function getNotes() {
  const dept = localStorage.getItem("department");
  const allNotes = JSON.parse(localStorage.getItem("notes") || "{}");
  return allNotes[dept] || [];
}

function saveNotes(notes) {
  const dept = localStorage.getItem("department");
  const allNotes = JSON.parse(localStorage.getItem("notes") || "{}");
  allNotes[dept] = notes;
  localStorage.setItem("notes", JSON.stringify(allNotes));
  updateSidebarStats();
}

// ======= UPLOAD NOTES (with FileReader) =======
function initUploadControls() {
  const drop = document.getElementById("dropzone");
  const input = document.getElementById("fileInput");
  const preview = document.getElementById("uploadPreview");

  // helper to set input.files from selectedFiles array
  function updateInputFilesFromSelected() {
    try {
      const dataTransfer = new DataTransfer();
      selectedFiles.forEach(f => dataTransfer.items.add(f));
      input.files = dataTransfer.files;
    } catch (e) {
      // some older browsers may not support DataTransfer(); keep input as-is
    }
  }

  function showUploadPreview(files) {
    if (!files || !files.length) {
      preview.innerText = "No files selected";
      return;
    }
    const listHtml = files.map((f, i) => {
      return `<div class="preview-row">
                <span class="preview-name">${escapeHtml(f.name)}</span>
                <span class="preview-meta">${formatSize(f.size)} • ${f.type || inferType(f.name)}</span>
                <button class="small remove" onclick="removeSelectedFile(${i})" title="Remove">✕</button>
              </div>`;
    }).join("");
    preview.innerHTML = listHtml;
  }

  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.style.borderColor = "#22c1c3";
    drop.style.background = "rgba(34,193,195,0.04)";
  });
  drop.addEventListener("dragleave", () => {
    drop.style.borderColor = "rgba(0,51,102,0.12)";
    drop.style.background = "";
  });

  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.style.borderColor = "rgba(0,51,102,0.12)";
    const files = Array.from(e.dataTransfer.files || []);
    // replace selection with dropped files
    selectedFiles = files;
    updateInputFilesFromSelected();
    showUploadPreview(selectedFiles);
  });

  input.addEventListener("change", () => {
    selectedFiles = Array.from(input.files || []);
    showUploadPreview(selectedFiles);
  });

  // expose removeSelectedFile globally so buttons in preview can call it
  window.removeSelectedFile = function (index) {
    if (!Array.isArray(selectedFiles)) selectedFiles = [];
    selectedFiles.splice(index, 1);
    updateInputFilesFromSelected();
    showUploadPreview(selectedFiles);
  };

  // initial preview
  showUploadPreview(selectedFiles);
}

function triggerFileInput() {
  document.getElementById("fileInput").click();
}

function uploadNotes() {
  const input = document.getElementById("fileInput");
  // prefer selectedFiles tracked array
  const files = (selectedFiles && selectedFiles.length) ? selectedFiles : Array.from(input.files || []);
  if (files.length === 0) {
    alert("Please select at least one file!");
    return;
  }

  const tag = document.getElementById("uploaderTag").value || "";

  // read each file content (text) when possible, otherwise keep empty
  const readers = files.map(file => new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res({
      name: file.name,
      content: typeof r.result === "string" ? r.result : "",
      date: new Date().toLocaleString(),
      size: file.size,
      type: file.type || inferType(file.name),
      tag
    });
    r.onerror = () => res({
      name: file.name,
      content: "",
      date: new Date().toLocaleString(),
      size: file.size,
      type: file.type || inferType(file.name),
      tag
    });
    // try to read as text (safe). For binaries, it will still produce something or trigger error.
    try {
      r.readAsText(file);
    } catch (e) {
      res({
        name: file.name,
        content: "",
        date: new Date().toLocaleString(),
        size: file.size,
        type: file.type || inferType(file.name),
        tag
      });
    }
  }));

  Promise.all(readers).then(results => {
    let notes = getNotes();
    notes = notes.concat(results);
    saveNotes(notes);
    loadNotes();
    alert("Notes uploaded successfully!");
    // clear selection
    selectedFiles = [];
    try { input.value = ""; } catch (e) {}
    const preview = document.getElementById("uploadPreview");
    if (preview) preview.innerText = "No files selected";
  });
}

// ======= LOAD / RENDER NOTES =======
function loadNotes(filtered = null) {
  const role = localStorage.getItem("role");
  const notes = filtered || getNotes();
  const notesList = document.getElementById("notesList");
  const emptyStateEl = document.getElementById("emptyState");
  const tableWrap = document.querySelector(".table-wrap");

  notesList.innerHTML = "";

  if (!notes || notes.length === 0) {
    if (emptyStateEl) emptyStateEl.style.display = "block";
    if (tableWrap) tableWrap.style.display = "none";
    document.getElementById("notesCount").innerText = 0;
    updateSidebarStats();
    return;
  }

  if (emptyStateEl) emptyStateEl.style.display = "none";
  if (tableWrap) tableWrap.style.display = "block";

  notes.forEach((note, index) => {
    // concise type: prefer file extension, fallback to mime subtype
    const fileType = getExtension(note.name) || ((note.type || inferType(note.name)).split('/').pop() || '');
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="filecell"><button class="link-btn" onclick="previewNote(${index})">${escapeHtml(note.name)}</button></td>
      <td>${escapeHtml(fileType)}</td>
      <td>${formatSize(note.size || 0)}</td>
      <td>${escapeHtml(note.date || '')}</td>
      <td>${escapeHtml(note.tag || '')}</td>
      <td>
        <button class="download-btn" onclick="downloadNote('${encodeURIComponent(note.name)}')">Download</button>
        ${localStorage.getItem("role") === "teacher" ? `<button class="delete-btn" onclick="deleteNote(${index})">Delete</button>` : ""}
      </td>`;
    notesList.appendChild(row);
  });

  document.getElementById("notesCount").innerText = notes.length;
  updateSidebarStats();
}

// ======= SEARCH / FILTER / SORT =======
function searchNotes() {
  const q = (document.getElementById("searchInput").value || "").toLowerCase();
  const type = document.getElementById("typeFilter").value;
  let notes = getNotes();

  if (q) {
    notes = notes.filter(n => (n.name || "").toLowerCase().includes(q) || (n.tag||"").toLowerCase().includes(q));
  }
  if (type) {
    notes = notes.filter(n => ((n.type || inferType(n.name)).toLowerCase()).includes(type));
  }
  loadNotes(notes);
}

function sortNotes() {
  let notes = getNotes();
  notes.sort((a, b) => {
    const da = new Date(a.date || 0).getTime();
    const db = new Date(b.date || 0).getTime();
    return sortAsc ? da - db : db - da;
  });
  sortAsc = !sortAsc;
  loadNotes(notes);
}

// ======= PREVIEW & DOWNLOAD =======
function previewNote(index) {
  const notes = getNotes();
  const note = notes[index];
  if (!note) return;
  currentPreviewName = note.name;

  document.getElementById("previewTitle").innerText = note.name;
  const body = document.getElementById("previewBody");
  if (note.content) {
    body.innerText = note.content.slice(0, 20000); // limit preview
  } else {
    body.innerText = "(No preview available for this file type)";
  }
  document.getElementById("previewModal").style.display = "flex";
}

function closePreview(e) {
  if (e && e.target === document.getElementById("previewModal")) {
    document.getElementById("previewModal").style.display = "none";
  } else {
    document.getElementById("previewModal").style.display = "none";
  }
}

function downloadNote(nameOrEncoded) {
  // Accept both raw names and encoded names; also allow being called without args
  let name = nameOrEncoded;
  if (!name) {
    name = currentPreviewName;
  }
  try {
    name = decodeURIComponent(name);
  } catch (e) {
    // if decode fails, assume name is raw
  }
  const notes = getNotes();
  const note = notes.find(n => n.name === name);
  const content = (note && note.content) ? note.content : ("This is a demo content for " + name);
  const blob = new Blob([content], { type: "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

// ======= DELETE NOTES =======
function deleteNote(index) {
  if (!confirm("Are you sure you want to delete this note?")) return;
  let notes = getNotes();
  notes.splice(index, 1);
  saveNotes(notes);
  loadNotes();
}

// ======= HELPERS =======
function updateSidebarStats() {
  const notes = getNotes();
  document.getElementById("notesCount").innerText = notes.length;
  document.getElementById("lastUpload").innerText = notes.length ? (notes[notes.length-1].date || "-") : "-";
}

function formatSize(bytes) {
  if (!bytes) return "-";
  const units = ['B','KB','MB','GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length-1) {
    bytes /= 1024;
    i++;
  }
  return Math.round(bytes*10)/10 + ' ' + units[i];
}

function inferType(name) {
  const ext = (name || "").split('.').pop().toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'doc' || ext === 'docx') return 'application/msword';
  if (ext === 'txt') return 'text/plain';
  return 'application/octet-stream';
}

function escapeHtml(s) {
  if (!s) return "";
  return s.replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'" :'&#39;','"':'&quot;' })[c]);
}

// helper: return concise extension (pdf, jpg, pptx, docx, etc.)
function getExtension(filename) {
  if (!filename) return "";
  const parts = filename.split('.');
  if (parts.length < 2) return "";
  let ext = parts.pop().toLowerCase();
  // normalize common variants
  if (ext === 'jpeg') ext = 'jpg';
  if (ext === 'htm') ext = 'html';
  if (ext === 'ppt') ext = 'pptx';
  if (ext === 'xls') ext = 'xlsx';
  return ext;
}
