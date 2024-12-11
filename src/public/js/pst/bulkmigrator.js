$(document).ready(function() {
  const mailboxList = document.getElementById('mailboxList');
  const startMigrationBtn = document.getElementById('startMigrationBtn');
  const migrationProgressContainer = document.getElementById('migrationProgressContainer');
  const migrationProgress = document.getElementById('migrationProgress');
  let assignedPstFiles = new Set();
  let allPstFiles = [];

  // Fetch Office 365 mailboxes
  fetch('/api/graph/users')
    .then(response => response.json())
    .then(mailboxes => {
      mailboxes.forEach(mailbox => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${mailbox.displayName} (${mailbox.userPrincipalName})</td>
          <td>
            <select class="form-control pst-select" data-mailbox-id="${mailbox.id}">
              <option value="">Select a PST file</option>
              <!-- PST files will be dynamically added here -->
            </select>
          </td>
          <td>
            <button class="btn btn-sm btn-primary assign-btn" data-mailbox-id="${mailbox.id}" disabled>Assign</button>
          </td>
        `;
        mailboxList.appendChild(row);
      });

      // Fetch available PST files
      return fetch('/api/pst/list');
    })
    .then(response => response.json())
    .then(pstFiles => {
      allPstFiles = pstFiles;
      updatePstSelects(allPstFiles);
    })
    .catch(error => console.error('Error:', error));

    function updatePstSelects(pstFiles) {
      const pstSelects = document.querySelectorAll('.pst-select');
      const availablePstFiles = pstFiles.filter(file => !assignedPstFiles.has(file));
  
      pstSelects.forEach(select => {
          // Clear existing options (except the first one)
          select.innerHTML = '<option value="">Select a PST file</option>';
          
          availablePstFiles.forEach(file => {
              const option = document.createElement('option');
              option.value = file;
              option.textContent = file;
              select.appendChild(option);
          });
  
          select.addEventListener('change', function() {
              const assignBtn = this.closest('tr').querySelector('.assign-btn');
              assignBtn.disabled = !this.value;
          });
      });
  }

  // Handle assign button clicks
  mailboxList.addEventListener('click', function(e) {
    if (e.target.classList.contains('assign-btn')) {
      const mailboxId = e.target.dataset.mailboxId;
      const pstSelect = e.target.closest('tr').querySelector('.pst-select');
      const pstFile = pstSelect.value;
      
      // Here you would typically send this assignment to the server
      console.log(`Assigned ${pstFile} to mailbox ${mailboxId}`);
      
      e.target.textContent = 'Assigned';
      e.target.disabled = true;
      pstSelect.disabled = true;

      assignedPstFiles.add(pstFile);
      updatePstSelects(allPstFiles);

      updateStartMigrationButton();
    }
  });

  function updateStartMigrationButton() {
    const anyAssigned = Array.from(document.querySelectorAll('.assign-btn')).some(btn => btn.textContent === 'Assigned');
    startMigrationBtn.disabled = !anyAssigned;
  }

  startMigrationBtn.addEventListener('click', function() {
    // Start the migration process
    migrationProgressContainer.style.display = 'block';
    
    // Collect assigned mailboxes and PST files
    const assignments = Array.from(document.querySelectorAll('.assign-btn'))
      .filter(btn => btn.textContent === 'Assigned')
      .map(btn => {
        const row = btn.closest('tr');
        return {
          mailboxId: btn.dataset.mailboxId,
          pstFile: row.querySelector('.pst-select').value
        };
      });

    // Here you would typically send a request to start the migration process
    console.log('Starting bulk migration', assignments);

    // Set up Socket.IO for real-time updates
    const socket = io();
    socket.on('migrationUpdate', function(data) {
      // Update the migration progress display
      migrationProgress.innerHTML += `<p>${data.message}</p>`;
    });

    // Send the assignments to the server to start the migration
    fetch('/api/pst/bulkmigrate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assignments }),
    })
    .then(response => response.json())
    .then(data => {
      console.log('Migration started:', data);
    })
    .catch(error => {
      console.error('Error starting migration:', error);
      migrationProgress.innerHTML += `<p class="text-danger">Error starting migration: ${error.message}</p>`;
    });
  });
});