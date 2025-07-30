const API_BASE =
  location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://smartstudent-backend.onrender.com';


const $ = id => document.getElementById(id);

/* elements */
const schoolSel  = $('schoolFilter');
const roleSel    = $('roleFilter');
const searchInp  = $('searchFilter');
const userTable  = $('userTable');
const spinner    = $('loadingSpinner');   // optional
const emptyBox   = $('emptyState');       // optional

let currentUser = null;
let allUsers = [];

(async () => {
  try {
    spinner && (spinner.hidden = false);

    const session = await fetch(`${API_BASE}/api/session`, {
      credentials: 'include'
    }).then(r => r.json());

    if (!session.loggedIn || !session.user?.is_admin) {
      alert('❌ Unauthorized access');
      return (location.href = 'login.html');
    }

    currentUser = session.user;

    allUsers = await fetch(`${API_BASE}/api/admin/users`, {
      credentials: 'include'
    }).then(r => r.json());

    buildSchoolFilter();
    buildRoleFilter();
    attachEvents();
    renderTable();
  } catch (err) {
    console.error(err);
    alert('Network error');
    location.href = 'login.html';
  } finally {
    spinner && (spinner.hidden = true);
  }
})();

function buildSchoolFilter() {
  const schools = new Set(
    allUsers.map(u => u.schoolName || u.teacherSchool).filter(Boolean)
  );
  schoolSel.innerHTML =
    `<option value="all">All schools</option>` +
    [...schools].map(s => `<option value="${s}">${s}</option>`).join('');
}

function buildRoleFilter() {
  roleSel.innerHTML = `
    <option value="all">All roles</option>
    <option value="student">Student</option>
    <option value="teacher">Teacher</option>
    <option value="admin">Admin</option>`;
}

function attachEvents() {
  [schoolSel, roleSel, searchInp].forEach(el =>
    el.addEventListener('input', renderTable)
  );
}

function renderTable() {
  const sSchool = schoolSel.value;
  const sRole = roleSel.value;
  const q = searchInp?.value.toLowerCase().trim() || '';

  const list = allUsers.filter(u => {
    const schoolMatch =
      sSchool === 'all' || [u.schoolName, u.teacherSchool].includes(sSchool);
    const roleMatch =
      sRole === 'all'
        ? true
        : sRole === 'admin'
        ? u.is_admin
        : u.occupation === sRole;
    const queryMatch =
      !q ||
      `${u.firstname} ${u.lastname} ${u.email}`.toLowerCase().includes(q);

    return schoolMatch && roleMatch && queryMatch;
  });

  userTable.innerHTML = list.map(u => buildCard(u)).join('');

  if (emptyBox) emptyBox.hidden = list.length > 0;
}

function buildCard(u) {
  const sameSchool = [u.schoolName, u.teacherSchool].includes(currentUser.school);
  const canEdit = currentUser.role === 'overseer' || sameSchool;
  const isSelf = u.email === currentUser.email;

  const removeBtn =
    canEdit && !isSelf
      ? `<button class="action" onclick="removeUser('${u.email}')">Remove</button>`
      : '';

  const promoteBtn =
    canEdit && !isSelf
      ? u.is_admin
        ? `<button class="action" onclick="setAdmin('${u.email}', false)">Demote</button>`
        : `<button class="action" onclick="setAdmin('${u.email}', true)">Promote</button>`
      : '';

  return `
    <div class="user-card">
      <strong>${u.firstname} ${u.lastname}</strong>
      <small>(${u.email})</small><br/>
      Role: ${u.is_admin ? 'Admin' : u.occupation || 'N/A'}
      | School: ${u.schoolName || u.teacherSchool || '—'}<br/>
      ${promoteBtn} ${removeBtn}
    </div>`;
}

/* Promote or demote a user */
async function setAdmin(email, promote = true) {
  if (!confirm(`${promote ? 'Promote' : 'Demote'} ${email}?`)) return;

  try {
    const res = await fetch(`${API_BASE}/api/admin/set-admin`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, promote })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update role');

    alert(`${promote ? 'Promoted' : 'Demoted'} successfully`);

    // update local cache and re-render
    allUsers = allUsers.map(u =>
      u.email === email ? { ...u, is_admin: promote } : u
    );
    renderTable();
  } catch (err) {
    console.error(err);
    alert('❌ ' + err.message);
  }
}

async function removeUser(email) {
  if (!confirm(`Remove user ${email}?`)) return;

  try {
    const res = await fetch(`${API_BASE}/api/admin/remove-user`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error');
    alert('User removed.');
    allUsers = allUsers.filter(u => u.email !== email);
    renderTable();
  } catch (err) {
    console.error(err);
    alert('❌ ' + err.message);
  }
}

function buildCard(u) {
  const sameSchool = [u.schoolName, u.teacherSchool].includes(currentUser.school);
  const canEdit = currentUser.role === 'overseer' || sameSchool;
  const isSelf = u.email === currentUser.email;

  const removeBtn =
    canEdit && !isSelf
      ? `<button class="action" onclick="removeUser('${u.email}')">Remove</button>`
      : '';

  const promoteBtn =
    canEdit && !isSelf
      ? u.is_admin
        ? `<button class="action" onclick="setAdmin('${u.email}', false)">Demote</button>`
        : `<button class="action" onclick="setAdmin('${u.email}', true)">Promote</button>`
      : '';

  const badge = u.is_admin
    ? `<span class="badge ${u.role === 'overseer' ? 'overseer' : 'admin'}">${u.role === 'overseer' ? 'Overseer' : 'Admin'}</span>`
    : '';

  return `
    <div class="user-card">
      <strong>${u.firstname} ${u.lastname}</strong> ${badge}
      <small>(${u.email})</small><br/>
      Role: ${u.occupation || 'N/A'}
      | School: ${u.schoolName || u.teacherSchool || '—'}<br/>
      ${promoteBtn} ${removeBtn}
    </div>`;
}