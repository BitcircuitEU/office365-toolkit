$(document).ready(function() {
    // Function to load PST files
    function loadPSTFiles() {
      $.ajax({
        url: '/api/pst/list',
        method: 'GET',
        success: function(data) {
          const filesList = $('#pstFilesList');
          filesList.empty();
          data.forEach(filename => {
            filesList.append(`
              <tr>
                <td>${filename}</td>
                <td>
                  <button class="btn btn-sm btn-danger delete-pst" data-filename="${filename}">Delete</button>
                </td>
              </tr>
            `);
          });
        },
        error: function(err) {
          console.error('Error loading PST files:', err);
        }
      });
    }

    // Load PST files on page load
    loadPSTFiles();

    // Upload PST File
    $('#uploadForm').submit(function(e) {
      e.preventDefault();
      var formData = new FormData(this);
  
      $.ajax({
        url: '/api/pst/upload',
        type: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        xhr: function() {
          var xhr = new window.XMLHttpRequest();
          xhr.upload.addEventListener("progress", function(evt) {
            if (evt.lengthComputable) {
              var percentComplete = evt.loaded / evt.total;
              percentComplete = parseInt(percentComplete * 100);
              $('.progress-bar').width(percentComplete + '%');
              $('.progress-bar').text(percentComplete + '%');
            }
          }, false);
          return xhr;
        },
        beforeSend: function() {
          $('#uploadProgress').show();
        },
        success: function(response) {
          console.log('Upload successful', response);
          loadPSTFiles();
        },
        error: function(error) {
          console.error('Upload failed', error);
        },
        complete: function() {
          $('#uploadProgress').hide();
          $('.progress-bar').width('0%');
          $('.progress-bar').text('0%');
        }
      });
    });

    // Delete PST file
    $(document).on('click', '.delete-pst', function() {
      const filename = $(this).data('filename');
      if (confirm(`Are you sure you want to delete ${filename}?`)) {
        $.ajax({
          url: `/api/pst/delete/${encodeURIComponent(filename)}`,
          method: 'DELETE',
          success: function() {
            loadPSTFiles();
          },
          error: function(err) {
            console.error('Error deleting PST file:', err);
          }
        });
      }
    });


  });