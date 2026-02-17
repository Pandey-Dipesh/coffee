// script.js – all Firebase logic for EditConnect (ES module)

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, doc, query, where, onSnapshot, serverTimestamp, getDocs, setDoc, getDoc, orderBy } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDPiXx5GsagdcllW_wZgRjJrRL7fhqfGVA",
  authDomain: "editconnect-ac9e8.firebaseapp.com",
  projectId: "editconnect-ac9e8",
  storageBucket: "editconnect-ac9e8.firebasestorage.app",
  messagingSenderId: "1059840493157",
  appId: "1:1059840493157:web:9d9d8c874f26b50ed7688c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ==================== HELPER: Escape HTML (prevents XSS) ====================
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ==================== TOAST NOTIFICATION SYSTEM ====================
function showToast(message, type = 'success', duration = 3000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'check-circle';
  if (type === 'error') icon = 'exclamation-circle';
  else if (type === 'info') icon = 'info-circle';
  
  toast.innerHTML = `
    <i class="fas fa-${icon}"></i>
    <span>${escapeHTML(message)}</span>
    <button class="toast-close"><i class="fas fa-times"></i></button>
  `;
  
  container.appendChild(toast);
  
  // Auto-remove after duration
  const timeout = setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, duration);
  
  // Close button
  toast.querySelector('.toast-close').addEventListener('click', () => {
    clearTimeout(timeout);
    toast.remove();
  });
}

// Replace all window.alert calls with showToast (except for critical errors we still want to show)
// We'll override alert globally, but careful: we only want to replace non-critical ones.
// However, we'll keep using showToast directly in the code.

// ==================== GLOBAL STATE ====================
let currentUser = null;
let userRole = null;
let currentEditorDocId = null;
let currentChatPartner = null;
let unsubscribeChat = null;
let unsubscribeInbox = null;
let chatsData = [];

const editorsMap = new Map();   // key: uid, value: editor object
const jobsMap = new Map();      // key: jobId, value: job object
let currentBrowseMode = 'editors'; // 'editors' or 'jobs'

// ==================== BACKGROUND MUSIC ====================
const bgMusic = document.getElementById('bgMusic');
const musicToggle = document.getElementById('musicToggle');
const musicIcon = document.getElementById('musicIcon');

let musicPlaying = false;      // actual playing state (unmuted)
let musicEnabled = false;      // whether user has ever unmuted (for resume logic)
let userInteracted = false;    // first interaction flag

bgMusic.volume = 0.2;

function handleFirstInteraction() {
  if (userInteracted) return;
  userInteracted = true;
  
  bgMusic.muted = false;
  const playPromise = bgMusic.play();
  if (playPromise !== undefined) {
    playPromise
      .then(() => {
        musicPlaying = true;
        musicEnabled = true;
        musicIcon.className = 'fas fa-volume-up';
      })
      .catch(err => {
        console.log('Still could not play after interaction:', err);
        musicPlaying = false;
        musicIcon.className = 'fas fa-volume-mute';
      });
  }
  document.removeEventListener('click', handleFirstInteraction);
  document.removeEventListener('keydown', handleFirstInteraction);
  document.removeEventListener('touchstart', handleFirstInteraction);
}

document.addEventListener('click', handleFirstInteraction);
document.addEventListener('keydown', handleFirstInteraction);
document.addEventListener('touchstart', handleFirstInteraction);

musicToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  if (musicPlaying) {
    bgMusic.pause();
    musicPlaying = false;
    musicIcon.className = 'fas fa-volume-mute';
  } else {
    bgMusic.play()
      .then(() => {
        musicPlaying = true;
        musicEnabled = true;
        musicIcon.className = 'fas fa-volume-up';
      })
      .catch(err => {
        console.error('Music play failed:', err);
        showToast('Could not play music. Please try again.', 'error');
      });
  }
});

function pauseBackgroundMusic() {
  if (musicPlaying) {
    bgMusic.pause();
    musicPlaying = false;
    musicIcon.className = 'fas fa-volume-mute';
  }
}

function resumeBackgroundMusic() {
  if (musicEnabled && !musicPlaying && !isAnyVideoPlaying() && userInteracted) {
    bgMusic.play().catch(() => {});
    musicPlaying = true;
    musicIcon.className = 'fas fa-volume-up';
  }
}

function isAnyVideoPlaying() {
  const videos = document.querySelectorAll('video');
  for (let v of videos) if (!v.paused) return true;
  return false;
}

function attachVideoListeners(container) {
  container.querySelectorAll('video').forEach(v => {
    v.addEventListener('play', pauseBackgroundMusic);
    v.addEventListener('pause', () => { if (!isAnyVideoPlaying()) resumeBackgroundMusic(); });
    v.addEventListener('ended', () => { if (!isAnyVideoPlaying()) resumeBackgroundMusic(); });
  });
  // iframe cross-origin limitations – we skip trying to detect play
}

function stopAllVideos(container) {
  container.querySelectorAll('video').forEach(v => { v.pause(); v.currentTime = 0; });
}

// ==================== UI HELPERS ====================
window.scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

window.showLoginModal = () => {
  if (!currentUser) document.getElementById('loginModal').style.display = 'flex';
};

window.closeModal = (modalId) => {
  const modal = document.getElementById(modalId);
  if (modal) {
    stopAllVideos(modal);
    modal.style.display = 'none';
    setTimeout(() => {
      if (!isAnyVideoPlaying()) resumeBackgroundMusic();
    }, 100);
  }
  if (modalId === 'chatModal' && unsubscribeChat) {
    unsubscribeChat();
    unsubscribeChat = null;
  }
};

window.onclick = (event) => {
  const modals = ['loginModal','roleModal','profileModal','chatModal','inboxModal','dashboardModal','clientDashboardModal','postJobModal','jobModal','myJobsModal'];
  modals.forEach(id => {
    const modal = document.getElementById(id);
    if (event.target === modal) window.closeModal(id);
  });
};

// ==================== DROPDOWN MENU ====================
const userMenu = document.getElementById('user-menu');
const avatar = document.getElementById('user-avatar');

avatar.addEventListener('click', (e) => {
  e.stopPropagation();
  userMenu.classList.toggle('open');
});

document.addEventListener('click', (e) => {
  if (!userMenu.contains(e.target)) {
    userMenu.classList.remove('open');
  }
});

// ==================== AUTH & ROLE ====================
document.getElementById('google-login-btn').addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error('Login error:', error);
    showToast('Login failed: ' + error.message, 'error');
  }
});

window.logout = async () => {
  try {
    await signOut(auth);
    userMenu.classList.remove('open');
  } catch (error) {
    console.error('Logout error:', error);
    showToast('Logout failed: ' + error.message, 'error');
  }
};

window.selectRole = async (role) => {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, 'users', currentUser.uid), {
      uid: currentUser.uid,
      email: currentUser.email,
      displayName: currentUser.displayName,
      photoURL: currentUser.photoURL,
      role: role,
      updatedAt: serverTimestamp()
    }, { merge: true });

    userRole = role;
    updateUIForUser(currentUser, role);
    closeModal('roleModal');

    if (role === 'editor') {
      openEditorDashboard();
      showJobs(); // editors see jobs first
    } else {
      document.getElementById('clientDashboardModal').style.display = 'flex';
      showEditors();
    }
    showToast(`Welcome, ${role}!`, 'success');
  } catch (error) {
    console.error('Error saving role:', error);
    showToast('Failed to save role: ' + error.message, 'error');
  }
};

async function fetchUserRole(uid) {
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      return userDoc.data().role || null;
    }
    return null;
  } catch (error) {
    console.error('Error fetching user role:', error);
    return null;
  }
}

function updateUIForUser(user, role = null) {
  const loginBtn = document.getElementById('login-btn');
  const messagesIcon = document.getElementById('messages-icon');
  const userMenuDiv = document.getElementById('user-menu');
  const roleSpan = document.getElementById('user-role-text');
  const avatarIcon = document.getElementById('avatar-icon');
  const avatarImg = document.getElementById('avatar-img');
  const dashboardLink = document.getElementById('dashboard-link');

  if (user) {
    loginBtn.style.display = 'none';
    userMenuDiv.style.display = 'inline-block';
    messagesIcon.style.display = 'inline-block';

    if (user.photoURL) {
      avatarImg.src = user.photoURL;
      avatarImg.style.display = 'inline';
      avatarIcon.style.display = 'none';
    } else {
      avatarImg.style.display = 'none';
      avatarIcon.style.display = 'inline';
    }

    roleSpan.textContent = role === 'editor' ? 'Editor' : (role === 'client' ? 'Client' : 'Choose role');
    dashboardLink.textContent = role === 'editor' ? 'Dashboard' : 'Company Dashboard';
  } else {
    loginBtn.style.display = 'inline-flex';
    userMenuDiv.style.display = 'none';
    messagesIcon.style.display = 'none';
  }
}

window.openRoleDashboard = () => {
  if (!currentUser) return;
  if (!userRole) {
    document.getElementById('roleModal').style.display = 'flex';
    return;
  }
  if (userRole === 'editor') {
    openEditorDashboard();
  } else {
    document.getElementById('clientDashboardModal').style.display = 'flex';
  }
  userMenu.classList.remove('open');
};

// ==================== BROWSE TOGGLE ====================
window.showEditors = () => {
  currentBrowseMode = 'editors';
  document.getElementById('jobs-section').style.display = 'none';
  document.getElementById('featured-section').style.display = 'block';
  document.getElementById('featured-title').textContent = 'Editors';
  document.getElementById('hero-title').textContent = 'Find the perfect editor for your next project';
  document.getElementById('hero-action-btn').textContent = 'Find an Editor';
};

window.showJobs = () => {
  currentBrowseMode = 'jobs';
  document.getElementById('featured-section').style.display = 'none';
  document.getElementById('jobs-section').style.display = 'block';
  document.getElementById('jobs-title').textContent = 'Jobs';
  document.getElementById('hero-title').textContent = 'Find the perfect job for your skills';
  document.getElementById('hero-action-btn').textContent = 'Browse Jobs';
};

document.getElementById('browse-editors-link').addEventListener('click', (e) => {
  e.preventDefault();
  showEditors();
});

document.getElementById('browse-jobs-link').addEventListener('click', (e) => {
  e.preventDefault();
  showJobs();
});

document.getElementById('hero-action-btn').addEventListener('click', (e) => {
  e.preventDefault();
  if (currentBrowseMode === 'editors') {
    document.getElementById('featured-section').scrollIntoView({ behavior: 'smooth' });
  } else {
    document.getElementById('jobs-section').scrollIntoView({ behavior: 'smooth' });
  }
});

// ==================== SEARCH ====================
const editorSearchInput = document.getElementById('editor-search');
const jobSearchInput = document.getElementById('job-search');

function filterEditors() {
  const term = editorSearchInput.value.toLowerCase();
  document.querySelectorAll('.editor-card').forEach(card => {
    const uid = card.getAttribute('data-uid');
    const editor = editorsMap.get(uid);
    if (!editor) return;
    const name = (editor.name || '').toLowerCase();
    const specialties = (editor.specialties || []).join(' ').toLowerCase();
    const software = (editor.software || []).join(' ').toLowerCase();
    const proposal = (editor.proposal || '').toLowerCase();
    const matches = name.includes(term) || specialties.includes(term) || software.includes(term) || proposal.includes(term);
    card.style.display = matches ? 'block' : 'none';
  });
}

function filterJobs() {
  const term = jobSearchInput.value.toLowerCase();
  document.querySelectorAll('.job-card').forEach(card => {
    const jobId = card.getAttribute('data-job-id');
    const job = jobsMap.get(jobId);
    if (!job) return;
    const title = (job.title || '').toLowerCase();
    const client = (job.clientName || '').toLowerCase();
    const software = (job.software || []).join(' ').toLowerCase();
    const description = (job.description || '').toLowerCase();
    const matches = title.includes(term) || client.includes(term) || software.includes(term) || description.includes(term);
    card.style.display = matches ? 'block' : 'none';
  });
}

editorSearchInput.addEventListener('input', filterEditors);
jobSearchInput.addEventListener('input', filterJobs);

// ==================== EDITOR DASHBOARD ====================
async function openEditorDashboard() {
  const q = query(collection(db, "editors"), where("uid", "==", currentUser.uid));
  const querySnapshot = await getDocs(q);
  if (!querySnapshot.empty) {
    const docSnap = querySnapshot.docs[0];
    currentEditorDocId = docSnap.id;
    const data = docSnap.data();
    fillEditorForm(data);
  } else {
    currentEditorDocId = null;
    const form = document.getElementById('editorProfileForm');
    form.reset();
    form.querySelector('input[name="name"]').value = currentUser.displayName || '';
  }
  document.getElementById('dashboardModal').style.display = 'flex';
}

function fillEditorForm(profile) {
  const form = document.getElementById('editorProfileForm');
  form.querySelectorAll('input[name="software"]').forEach(cb => cb.checked = false);
  form.querySelectorAll('input[name="specialties"]').forEach(cb => cb.checked = false);
  form.querySelector('input[name="name"]').value = profile.name || '';
  form.querySelector('textarea[name="experience"]').value = profile.experience || '';
  form.querySelector('textarea[name="proposal"]').value = profile.proposal || '';
  (profile.software || []).forEach(val => {
    form.querySelectorAll('input[name="software"]').forEach(cb => {
      if (cb.value === val) cb.checked = true;
    });
  });
  (profile.specialties || []).forEach(val => {
    form.querySelectorAll('input[name="specialties"]').forEach(cb => {
      if (cb.value === val) cb.checked = true;
    });
  });
  const portfolio = profile.portfolio || [];
  form.querySelector('input[name="portfolio1"]').value = portfolio[0] || '';
  form.querySelector('input[name="portfolio2"]').value = portfolio[1] || '';
  form.querySelector('input[name="portfolio3"]').value = portfolio[2] || '';
}

function isValidUrl(string) {
  try { new URL(string); return true; } catch { return false; }
}

document.getElementById('editorProfileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentUser) return showToast('You must be logged in.', 'error');

  const formData = new FormData(e.target);
  const name = formData.get('name')?.trim();
  if (!name) return showToast('Please enter your name.', 'error');

  const software = formData.getAll('software');
  const specialties = formData.getAll('specialties');
  if (specialties.length < 3) return showToast('Please select at least 3 video specialties.', 'error');

  const experience = formData.get('experience')?.trim();
  const proposal = formData.get('proposal')?.trim();

  const portfolio = [
    formData.get('portfolio1'),
    formData.get('portfolio2'),
    formData.get('portfolio3')
  ].filter(url => url && url.trim() !== '').map(url => url.trim());

  for (let url of portfolio) {
    if (!isValidUrl(url)) return showToast(`Invalid URL: ${url}`, 'error');
  }

  const profileData = {
    uid: currentUser.uid,
    name,
    software,
    specialties,
    experience,
    proposal,
    portfolio,
    updatedAt: serverTimestamp()
  };

  try {
    if (currentEditorDocId) {
      await updateDoc(doc(db, "editors", currentEditorDocId), profileData);
      showToast('Profile updated!', 'success');
    } else {
      profileData.createdAt = serverTimestamp();
      await addDoc(collection(db, "editors"), profileData);
      showToast('Profile saved!', 'success');
    }
    e.target.reset();
    closeModal('dashboardModal');
  } catch (error) {
    showToast('Error saving profile: ' + error.message, 'error');
  }
});

// ==================== JOB POSTING ====================
window.openPostJobModal = () => {
  document.getElementById('postJobModal').style.display = 'flex';
};

document.getElementById('jobPostForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentUser || userRole !== 'client') return showToast('Only clients can post jobs.', 'error');

  const formData = new FormData(e.target);
  const title = formData.get('title')?.trim();
  const description = formData.get('description')?.trim();
  const software = formData.getAll('software');

  if (!title || !description) return showToast('Please fill in title and description.', 'error');

  const jobData = {
    clientUid: currentUser.uid,
    clientName: currentUser.displayName || 'Anonymous',
    title,
    description,
    software,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    await addDoc(collection(db, "jobs"), jobData);
    showToast('Job posted successfully!', 'success');
    e.target.reset();
    closeModal('postJobModal');
  } catch (error) {
    showToast('Error posting job: ' + error.message, 'error');
  }
});

// ==================== MY JOBS ====================
window.openMyJobsModal = async () => {
  if (!currentUser) return;
  const q = query(collection(db, "jobs"), where("clientUid", "==", currentUser.uid));
  const querySnapshot = await getDocs(q);
  const jobsList = document.getElementById('myJobsList');
  jobsList.innerHTML = '';
  if (querySnapshot.empty) {
    jobsList.innerHTML = '<p style="text-align:center; color:#64748b;">You haven\'t posted any jobs yet.</p>';
  } else {
    querySnapshot.forEach(doc => {
      const job = doc.data();
      const jobId = doc.id;
      const item = document.createElement('div');
      item.className = 'my-job-item';
      item.innerHTML = `
        <span class="job-title">${escapeHTML(job.title)}</span>
        <button class="view-job-btn" data-job-id="${escapeHTML(jobId)}">View</button>
      `;
      item.querySelector('.view-job-btn').addEventListener('click', () => {
        closeModal('myJobsModal');
        window.viewJob(jobId);
      });
      jobsList.appendChild(item);
    });
  }
  document.getElementById('myJobsModal').style.display = 'flex';
};

// ==================== REAL‑TIME EDITORS ====================
const editorsRef = collection(db, "editors");
onSnapshot(editorsRef, (snapshot) => {
  snapshot.docChanges().forEach((change) => {
    const data = change.doc.data();
    const uid = data.uid;
    if (!uid) return;

    if (change.type === "added" || change.type === "modified") {
      editorsMap.set(uid, { ...data, id: change.doc.id });
      addOrUpdateEditorCard(uid, data);
    }
    if (change.type === "removed") {
      editorsMap.delete(uid);
      removeEditorCard(uid);
    }
  });
  filterEditors();
});

function addOrUpdateEditorCard(uid, profile) {
  const name = profile.name || 'Unnamed Editor';
  const style = (profile.specialties?.length) ? profile.specialties[0] + '...' : (profile.proposal || 'Editor');

  const grid = document.getElementById('editor-grid');
  let card = document.querySelector(`.editor-card[data-uid="${uid}"]`);
  if (card) {
    card.querySelector('h3').textContent = name;
    card.querySelector('.editor-style').textContent = style;
    card.querySelector('.view-profile').setAttribute('onclick', `window.handleViewProfile('${uid}')`);
  } else {
    card = document.createElement('div');
    card.className = 'editor-card';
    card.setAttribute('data-uid', uid);
    card.innerHTML = `
      <div class="editor-header">
        <div class="avatar"><i class="fas fa-user"></i></div>
        <div class="editor-info">
          <h3>${escapeHTML(name)}</h3>
          <div class="editor-style">${escapeHTML(style)}</div>
        </div>
      </div>
      <div class="view-profile" onclick="window.handleViewProfile('${uid}')">View Profile</div>
    `;
    grid.appendChild(card);
  }
}

function removeEditorCard(uid) {
  document.querySelector(`.editor-card[data-uid="${uid}"]`)?.remove();
}

// ==================== REAL‑TIME JOBS ====================
const jobsRef = collection(db, "jobs");
onSnapshot(jobsRef, (snapshot) => {
  snapshot.docChanges().forEach((change) => {
    const data = change.doc.data();
    const jobId = change.doc.id;
    if (change.type === "added" || change.type === "modified") {
      jobsMap.set(jobId, { ...data, id: jobId });
      addOrUpdateJobCard(jobId, data);
    }
    if (change.type === "removed") {
      jobsMap.delete(jobId);
      removeJobCard(jobId);
    }
  });
  filterJobs();
});

function addOrUpdateJobCard(jobId, job) {
  const title = job.title || 'Untitled Job';
  const client = job.clientName || 'Client';
  const software = job.software || [];
  const createdAt = job.createdAt?.toDate?.() || new Date();
  const timeAgo = formatRelativeTime(createdAt);
  const softwareTags = software.map(sw => `<span class="job-software-tag">${escapeHTML(sw)}</span>`).join('');

  const grid = document.getElementById('jobs-grid');
  let card = document.querySelector(`.job-card[data-job-id="${jobId}"]`);
  if (card) {
    card.querySelector('h3').textContent = title;
    card.querySelector('.job-meta').innerHTML = escapeHTML(client);
    card.querySelector('.job-software-tags').innerHTML = softwareTags || '<span class="job-software-tag">Any</span>';
    card.querySelector('.job-date').textContent = `Posted ${timeAgo}`;
    card.querySelector('.view-job').setAttribute('onclick', `window.viewJob('${jobId}')`);
  } else {
    card = document.createElement('div');
    card.className = 'job-card';
    card.setAttribute('data-job-id', jobId);
    card.innerHTML = `
      <div class="job-header">
        <div class="avatar"><i class="fas fa-briefcase"></i></div>
        <div class="job-info">
          <h3>${escapeHTML(title)}</h3>
          <div class="job-meta">${escapeHTML(client)}</div>
        </div>
      </div>
      <div class="job-software-tags">${softwareTags || '<span class="job-software-tag">Any</span>'}</div>
      <div class="job-date">Posted ${timeAgo}</div>
      <div class="view-job" onclick="window.viewJob('${jobId}')">View Job</div>
    `;
    grid.appendChild(card);
  }
}

function formatRelativeTime(date) {
  const diff = Math.floor((new Date() - date) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)} hours ago`;
  return `${Math.floor(diff/86400)} days ago`;
}

function removeJobCard(jobId) {
  document.querySelector(`.job-card[data-job-id="${jobId}"]`)?.remove();
}

// ==================== VIEW JOB ====================
window.viewJob = (jobId) => {
  const job = jobsMap.get(jobId);
  if (!job) return showToast('Job not found', 'error');

  document.getElementById('job-title').textContent = escapeHTML(job.title);
  document.getElementById('job-client').textContent = `Posted by ${escapeHTML(job.clientName)}`;
  document.getElementById('job-description').textContent = escapeHTML(job.description);

  const softwareContainer = document.getElementById('job-software');
  softwareContainer.innerHTML = '';
  if (job.software?.length) {
    job.software.forEach(sw => {
      const tag = document.createElement('span');
      tag.className = 'software-tag';
      tag.textContent = sw;
      softwareContainer.appendChild(tag);
    });
  } else {
    softwareContainer.innerHTML = '<p class="text-muted">No specific software required</p>';
  }

  currentChatPartner = { uid: job.clientUid, name: job.clientName };
  document.getElementById('jobModal').style.display = 'flex';
};

// ==================== PROFILE MODAL ====================
window.handleViewProfile = (uid) => {
  if (!currentUser) {
    window.showLoginModal();
    return;
  }
  const editor = editorsMap.get(uid);
  if (editor) {
    updateProfileModal(editor);
    const modal = document.getElementById('profileModal');
    modal.style.display = 'flex';
    setTimeout(() => attachVideoListeners(modal), 300);
  } else {
    showToast('Editor not found', 'error');
  }
};

function updateProfileModal(editor) {
  document.getElementById('profile-name').textContent = escapeHTML(editor.name || 'Editor');
  document.getElementById('profile-style').textContent = (editor.specialties?.length) ? editor.specialties.join(', ') : (editor.proposal || 'Editor');
  document.getElementById('chat-btn-name').textContent = (editor.name || 'Editor').split(' ')[0];
  currentChatPartner = { uid: editor.uid, name: editor.name };

  const chatBtn = document.getElementById('chatBtn');
  if (currentUser && editor.uid === currentUser.uid) {
    chatBtn.disabled = true;
    chatBtn.textContent = 'This is you';
  } else {
    chatBtn.disabled = false;
    chatBtn.innerHTML = `Chat with <span id="chat-btn-name">${escapeHTML(editor.name.split(' ')[0])}</span>`;
  }

  const softwareContainer = document.getElementById('profile-software');
  softwareContainer.innerHTML = '';
  if (editor.software?.length) {
    editor.software.forEach(sw => {
      const tag = document.createElement('span');
      tag.className = 'software-tag';
      tag.textContent = sw;
      softwareContainer.appendChild(tag);
    });
  } else {
    softwareContainer.innerHTML = '<p class="text-muted">Not specified</p>';
  }

  const specialtiesContainer = document.getElementById('profile-specialties');
  specialtiesContainer.innerHTML = '';
  if (editor.specialties?.length) {
    editor.specialties.forEach(spec => {
      const tag = document.createElement('span');
      tag.className = 'specialty-tag';
      tag.textContent = spec;
      specialtiesContainer.appendChild(tag);
    });
  } else {
    specialtiesContainer.innerHTML = '<p class="text-muted">Not specified</p>';
  }

  document.getElementById('profile-experience').textContent = escapeHTML(editor.experience || 'No experience provided.');
  document.getElementById('profile-proposal').textContent = escapeHTML(editor.proposal || 'No proposal provided.');

  const portfolioGrid = document.getElementById('profile-portfolio');
  portfolioGrid.innerHTML = '';
  const portfolioUrls = (editor.portfolio || []).filter(url => url && url.trim() !== '');

  if (portfolioUrls.length > 0) {
    portfolioUrls.forEach((url, index) => {
      portfolioGrid.appendChild(createVideoCard(url, index));
    });
  } else {
    portfolioGrid.innerHTML = '<p class="text-muted">No portfolio links provided.</p>';
  }
}

function createVideoCard(url, index) {
  const card = document.createElement('div');
  card.className = 'portfolio-video-card';
  card.dataset.index = index;

  let embedUrl = null;
  let platform = 'link';

  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
  if (ytMatch) {
    embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0&mute=0&controls=1&modestbranding=1`;
    platform = 'youtube';
  } else {
    const vimeoMatch = url.match(/(?:vimeo\.com\/)(\d+)/);
    if (vimeoMatch) {
      embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=0&muted=0&controls=1`;
      platform = 'vimeo';
    } else if (url.match(/\.(mp4|webm|ogg)$/i)) {
      embedUrl = url;
      platform = 'direct';
    }
  }

  if (embedUrl) {
    if (platform === 'direct') {
      card.innerHTML = `
        <video class="portfolio-video" controls playsinline preload="metadata">
          <source src="${escapeHTML(embedUrl)}" type="video/mp4">
        </video>
      `;
    } else {
      card.innerHTML = `
        <iframe class="portfolio-video" src="${escapeHTML(embedUrl)}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" loading="lazy"></iframe>
      `;
    }
  } else {
    card.innerHTML = `
      <div class="portfolio-link-card">
        <i class="fas fa-link"></i>
        <a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(extractDomain(url))}</a>
      </div>
    `;
  }
  return card;
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

// ==================== CHAT ====================
window.openPrivateChat = async () => {
  if (!currentUser || !currentChatPartner) return;
  if (currentChatPartner.uid === currentUser.uid) {
    showToast("You cannot chat with yourself.", 'error');
    return;
  }
  closeModal('profileModal');
  await openChatWith(currentChatPartner);
};

window.openJobChat = async () => {
  if (!currentUser || !currentChatPartner) return;
  if (currentChatPartner.uid === currentUser.uid) {
    showToast("You cannot chat with yourself.", 'error');
    return;
  }
  closeModal('jobModal');
  await openChatWith(currentChatPartner);
};

async function openChatWith(partner) {
  document.getElementById('chat-modal-title').textContent = `Chat with ${escapeHTML(partner.name)}`;
  document.getElementById('chatModal').style.display = 'flex';

  const participants = [currentUser.uid, partner.uid].sort();
  const chatId = participants.join('_');

  const chatRef = doc(db, 'chats', chatId);
  await setDoc(chatRef, {
    participants: participants,
    participantNames: {
      [currentUser.uid]: currentUser.displayName || 'Anonymous',
      [partner.uid]: partner.name
    },
    lastMessage: { text: '', timestamp: null, senderId: '' },
    updatedAt: serverTimestamp()
  }, { merge: true });

  const messagesRef = collection(db, 'chats', chatId, 'messages');
  if (unsubscribeChat) unsubscribeChat();
  const q = query(messagesRef, orderBy('timestamp', 'asc'));
  unsubscribeChat = onSnapshot(q, (snapshot) => {
    const messagesDiv = document.getElementById('chatMessages');
    messagesDiv.innerHTML = '';
    snapshot.forEach(doc => {
      const msg = doc.data();
      const msgDiv = document.createElement('div');
      msgDiv.className = 'chat-message' + (msg.senderId === currentUser.uid ? ' sent' : '');
      msgDiv.innerHTML = `
        <div class="sender">${escapeHTML(msg.senderName || 'Unknown')}</div>
        <div class="bubble">${escapeHTML(msg.text || '')}</div>
      `;
      messagesDiv.appendChild(msgDiv);
    });
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });

  const sendBtn = document.getElementById('chatSendBtn');
  const input = document.getElementById('chatInput');
  const newSendBtn = sendBtn.cloneNode(true);
  const newInput = input.cloneNode(true);
  sendBtn.replaceWith(newSendBtn);
  input.replaceWith(newInput);

  newSendBtn.addEventListener('click', async () => {
    const text = newInput.value.trim();
    if (text === '') return;
    if (text.length > 500) {
      showToast('Message too long (max 500 characters)', 'error');
      return;
    }
    try {
      const messageData = {
        text,
        senderId: currentUser.uid,
        senderName: currentUser.displayName || 'Anonymous',
        timestamp: serverTimestamp()
      };
      await addDoc(messagesRef, messageData);
      await updateDoc(chatRef, {
        lastMessage: { text, timestamp: serverTimestamp(), senderId: currentUser.uid },
        updatedAt: serverTimestamp()
      });
      newInput.value = '';
    } catch (error) {
      console.error('Error sending message:', error);
      showToast('Failed to send message.', 'error');
    }
  });

  newInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') newSendBtn.click();
  });
}

// ==================== INBOX ====================
function startInboxListener() {
  if (!currentUser) return;
  if (unsubscribeInbox) unsubscribeInbox();

  const chatsRef = collection(db, 'chats');
  const q = query(chatsRef, where('participants', 'array-contains', currentUser.uid), orderBy('updatedAt', 'desc'));

  unsubscribeInbox = onSnapshot(q, (snapshot) => {
    chatsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateInboxUI();
    updateUnreadBadge();
  }, (error) => {
    console.error('Inbox listener error:', error);
    if (error.code === 'failed-precondition' && error.message.includes('requires an index')) {
      const link = error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
      if (link && !localStorage.getItem('indexAlertShown')) {
        console.warn('Create the required Firestore index here:', link[0]);
        showToast('Inbox requires a Firestore index. Check the console (F12) for the link to create it.', 'info');
        localStorage.setItem('indexAlertShown', 'true');
      }
    }
  });
}

function updateInboxUI() {
  const inboxList = document.getElementById('inboxList');
  if (!inboxList) return;

  if (chatsData.length === 0) {
    inboxList.innerHTML = '<p style="text-align:center; color:#64748b;">No conversations yet.</p>';
    return;
  }

  inboxList.innerHTML = '';
  chatsData.forEach(chat => {
    const otherUid = chat.participants.find(uid => uid !== currentUser.uid);
    const otherName = chat.participantNames?.[otherUid] || 'Unknown';
    const lastMsg = chat.lastMessage?.text || 'No messages yet';
    const timestamp = chat.updatedAt?.toDate?.() || new Date();
    const isUnread = chat.lastMessage && chat.lastMessage.senderId && chat.lastMessage.senderId !== currentUser.uid;

    const item = document.createElement('div');
    item.className = `inbox-item ${isUnread ? 'unread' : ''}`;
    item.innerHTML = `
      <div class="avatar"><i class="fas fa-user"></i></div>
      <div class="info">
        <div class="name">${escapeHTML(otherName)}</div>
        <div class="last-message">${escapeHTML(lastMsg)}</div>
        <div class="time">${escapeHTML(timestamp.toLocaleString())}</div>
      </div>
    `;
    item.onclick = () => openChatFromInbox(chat.id, otherUid, otherName);
    inboxList.appendChild(item);
  });
}

function updateUnreadBadge() {
  const unreadCount = chatsData.filter(chat => chat.lastMessage && chat.lastMessage.senderId && chat.lastMessage.senderId !== currentUser.uid).length;
  const badge = document.getElementById('unread-badge');
  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  }
}

window.openInbox = () => {
  if (!currentUser) return;
  updateInboxUI();
  document.getElementById('inboxModal').style.display = 'flex';
};

async function openChatFromInbox(chatId, otherUid, otherName) {
  closeModal('inboxModal');
  currentChatPartner = { uid: otherUid, name: otherName };
  await openChatWith(currentChatPartner);
}

// ==================== AUTH STATE ====================
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    closeModal('loginModal');
    const role = await fetchUserRole(user.uid);
    userRole = role;
    updateUIForUser(user, role);

    if (!role) {
      setTimeout(() => {
        if (document.getElementById('roleModal').style.display !== 'flex') {
          document.getElementById('roleModal').style.display = 'flex';
        }
      }, 500);
    } else {
      if (role === 'editor') {
        showJobs();
      } else {
        showEditors();
      }
    }
    startInboxListener();
  } else {
    userRole = null;
    updateUIForUser(null);
    if (unsubscribeInbox) unsubscribeInbox();
    if (unsubscribeChat) unsubscribeChat();
    chatsData = [];
    showEditors();
    ['loginModal','roleModal','profileModal','chatModal','inboxModal','dashboardModal','clientDashboardModal','postJobModal','jobModal','myJobsModal'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }
});

// Default view
showEditors();

// Simple protection against right‑click and certain keys
document.addEventListener('contextmenu', event => event.preventDefault());
document.onkeydown = function(e) {
  if (e.key === "F12") return false;
  if (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J")) return false;
  if (e.ctrlKey && e.key === "U") return false;
};
