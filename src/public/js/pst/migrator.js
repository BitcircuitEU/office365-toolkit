$(document).ready(function() {
  const socket = io();
  const logBox = document.getElementById('logBox');

  
  let selectedPstFolder = null;
  let selectedOffice365Folder = null;

  socket.on('migrationStats', function(stats) {
    $('#currentFolderPath').text(stats.currentFolderPath || '-');
    $('#currentFileName').text(stats.currentFileName || '-');
    $('#currentFolder').text(stats.processedFolders);
    $('#totalFolders').text(stats.totalFolders);
    $('#currentFile').text(stats.processedEmails);
    $('#totalFiles').text(stats.totalEmails);
    $('#foldersCreated').text(stats.processedFolders);
    $('#foldersSkipped').text(stats.totalFolders - stats.processedFolders);
    $('#filesCreated').text(stats.processedEmails);
    $('#filesSkipped').text(stats.skippedEmails);
  });

  socket.on('migrationProgress', function(progress) {
    // Hier können Sie den Fortschrittsbalken aktualisieren, wenn Sie einen haben
    console.log('Migration progress:', progress);
  });

  socket.on('log', sendLog);

  socket.on('error', function(error) {
    sendLog(`Error: ${error}`);
  });

  socket.on('importComplete', function() {
    resetImportButton();
    sendLog('Import process completed');
  });

  // Event listeners
  $('#pstFileSelect').change(function() {
    const selectedFile = $(this).val();
    if (selectedFile) {
      loadPSTFolderStructure(selectedFile);
    }
  });

  $('#mailboxSelect').change(function() {
    const selectedMailbox = $(this).val();
    if (selectedMailbox) {
      loadOffice365FolderStructure(selectedMailbox);
    }
  });

  $('#importButton').click(function() {
    const pstFile = $('#pstFileSelect').val();
    const mailboxId = $('#mailboxSelect').val();
    $('#migrationContainer').show();
    $(this).prop('disabled', true).text('Importing...');

    $.ajax({
      url: '/api/pst/import',
      method: 'POST',
      data: {
        pstFile: pstFile,
        mailboxId: mailboxId,
        pstFolderId: selectedPstFolder,
        office365FolderId: selectedOffice365Folder
      },
      success: function(response) {
        console.log('Import process started');
      },
      error: function(err) {
        console.error('Error starting import process:', err);
        $('#importButton').prop('disabled', false).text('Import');
      }
    });
  });

  // Functions
  function sendLog(message) {
    const logEntry = document.createElement('div');
    logEntry.textContent = message;
    logBox.appendChild(logEntry);
    logBox.scrollTop = logBox.scrollHeight;
  }

  function loadPSTFiles() {
    $.ajax({
      url: '/api/pst/list',
      method: 'GET',
      success: function(data) {
        const pstFileSelect = $('#pstFileSelect');
        pstFileSelect.empty().append('<option value="">Select a PST file</option>');
        data.forEach(filename => {
          pstFileSelect.append(`<option value="${filename}">${filename}</option>`);
        });
      },
      error: function(err) {
        console.error('Error loading PST files:', err);
        sendLog('Error loading PST files');
      }
    });
  }

  function loadOffice365Mailboxes() {
    $.ajax({
      url: '/api/graph/users',
      method: 'GET',
      success: function(data) {
        const mailboxSelect = $('#mailboxSelect');
        mailboxSelect.empty().append('<option value="">Wählen Sie ein Office 365 Postfach</option>');
        data.forEach(user => {
          mailboxSelect.append(`<option value="${user.userPrincipalName}">${user.displayName} (${user.userPrincipalName})</option>`);
        });
      },
      error: function(err) {
        console.error('Fehler beim Laden der Office 365 Postfächer:', err);
        sendLog('Fehler beim Laden der Office 365 Postfächer');
      }
    });
  }

  function loadPSTFolderStructure(pstFile) {
    // Zeige den Ladekreis an
    $('#pstLoadingSpinner').show();
  
    $.ajax({
      url: '/api/pst/structure',
      method: 'POST',
      data: { fileName: pstFile },
      success: function(data) {
        if (!Array.isArray(data) || data.length === 0) {
          console.error('Invalid or empty PST folder structure data');
          sendLog('Error: Invalid PST folder structure data received');
          $('#pstLoadingSpinner').hide();
          return;
        }
        setTimeout(() => {
          try {
            if ($('#pstTree').jstree(true)) {
              $('#pstTree').jstree(true).destroy();
            }
            $('#pstTree').jstree({
              'core': {
                'data': data,
                'check_callback': true,
                'themes': {
                  'responsive': false,
                  'variant': 'large'
                }
              },
              'plugins': ['wholerow', 'types'],
              'types': {
                'default': {
                  'icon': 'fas fa-folder'
                }
              }
            }).on('select_node.jstree', function(e, data) {
              selectedPstFolder = data.node.id;
              updateImportButton();
            }).on('open_node.jstree close_node.jstree', function(e, data) {
              if (e.type === 'open_node') {
                data.instance.set_icon(data.node, 'fas fa-folder-open');
              } else {
                data.instance.set_icon(data.node, 'fas fa-folder');
              }
            });
  
            // Verstecke den Ladekreis, wenn der Baum fertig geladen ist
            $('#pstTree').on('ready.jstree', function() {
              $('#pstLoadingSpinner').hide();
            });
  
          } catch (error) {
            console.error('Error initializing PST jstree:', error);
            sendLog('Error initializing PST folder structure');
            $('#pstLoadingSpinner').hide();
          }
        }, 100);
      },
      error: function(err) {
        console.error('Error loading PST folder structure:', err);
        sendLog('Error loading PST folder structure');
        $('#pstLoadingSpinner').hide();
      }
    });
  }
  
  function loadOffice365FolderStructure(mailboxId) {
    $('#office365LoadingSpinner').show();
    $('#office365Tree').empty();

    $.ajax({
        url: '/api/graph/folders',
        type: 'POST',
        data: JSON.stringify({ mailboxId: mailboxId }),
        contentType: 'application/json',
        dataType: 'json',
        success: data => {
          setTimeout(() => {
            try {
              if ($('#office365Tree').jstree(true)) {
                $('#office365Tree').jstree(true).destroy();
              }
              $('#office365Tree').jstree({
                'core': {
                  'data': data,
                  'check_callback': true,
                  'themes': {
                    'responsive': false,
                    'variant': 'large'
                  }
                },
                'plugins': ['wholerow', 'types'],
                'types': {
                  'default': {
                    'icon': 'fas fa-folder'
                  }
                }
              }).on('select_node.jstree', function(e, data) {
                selectedOffice365Folder = data.node.id;
                updateImportButton();
              }).on('open_node.jstree close_node.jstree', function(e, data) {
                if (e.type === 'open_node') {
                  data.instance.set_icon(data.node, 'fas fa-folder-open');
                } else {
                  data.instance.set_icon(data.node, 'fas fa-folder');
                }
              });
    
              // Verstecke den Ladekreis, wenn der Baum fertig geladen ist
              $('#office365Tree').on('ready.jstree', function() {
                $('#office365LoadingSpinner').hide();
              });
    
            } catch (error) {
              console.error('Error initializing Office 365 jstree:', error);
              sendLog('Error initializing Office 365 folder structure');
              $('#office365LoadingSpinner').hide();
            }
          }, 100);
        }
    });
  }

  function updateImportButton() {
    if (selectedPstFolder && selectedOffice365Folder) {
      $('#importButton').show();
    } else {
      $('#importButton').hide();
    }
  }

  function resetImportButton() {
    $('#importButton').prop('disabled', false).text('Import');
  }

  // Initial load
  loadPSTFiles();
  loadOffice365Mailboxes();
});