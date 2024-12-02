$(document).ready(function() {
    const $pstFileSelect = $('#pstFile');
    const $targetMailboxSelect = $('#targetMailbox');
    const $pstFolderTree = $('#pstFolderTree');
    const $targetFolderTree = $('#targetFolderTree');
    const $importButton = $('#importButton');
    const $pstStructureButton = $('#pstStructureButton');
    const $targetStructureButton = $('#targetStructureButton');

    let selectedPstFolder = null;
    let selectedTargetFolder = null;

    loadPstFiles();
    loadMailboxes();

    $('#pstSelectForm').on('submit', handlePstSelectFormSubmit);
    $('#targetMailboxForm').on('submit', handleTargetMailboxFormSubmit);
    $pstFolderTree.on('changed.jstree', handlePstFolderTreeChange);
    $targetFolderTree.on('changed.jstree', handleTargetFolderTreeChange);
    $importButton.click(handleImportButtonClick);

    function loadPstFiles() {
        $.ajax({
            url: '/list-pst-files',
            type: 'GET',
            success: populatePstFiles,
            error: handleError('Fehler beim Laden der PST-Dateien')
        });
    }

    function loadMailboxes() {
        $.ajax({
            url: '/list-mailboxes',
            type: 'GET',
            success: populateMailboxes,
            error: handleError('Fehler beim Laden der Zielpostfächer')
        });
    }

    function populatePstFiles(files) {
        files.forEach(file => {
            $pstFileSelect.append($('<option>', { value: file, text: file }));
        });
    }

    function populateMailboxes(mailboxes) {
        if (Array.isArray(mailboxes)) {
            mailboxes.forEach(mailbox => {
                $targetMailboxSelect.append($('<option>', {
                    value: mailbox.userPrincipalName,
                    text: mailbox.displayName
                }));
            });
        } else {
            console.error('Unexpected response format:', mailboxes);
            alert('Unerwartetes Antwortformat beim Laden der Zielpostfächer');
        }
    }

    function handlePstSelectFormSubmit(e) {
        e.preventDefault();
        const selectedFile = $pstFileSelect.val();
        
        if (!selectedFile) {
            alert('Bitte wählen Sie eine PST-Datei aus.');
            return;
        }

        $pstStructureButton.text('Wird geladen...').prop('disabled', true);

        $.ajax({
            url: '/analyze-pst',
            type: 'POST',
            data: JSON.stringify({ fileName: selectedFile }),
            contentType: 'application/json',
            dataType: 'json',
            success: data => {
                $pstFolderTree.jstree('destroy').jstree({ 'core': { 'data': data } });
                $pstStructureButton.text('Ordnerstruktur anzeigen').prop('disabled', false);
                checkImportButtonVisibility();
            },
            error: handleError('Fehler beim Analysieren der PST-Datei', $pstStructureButton, 'Ordnerstruktur anzeigen')
        });
    }

    function handleTargetMailboxFormSubmit(e) {
        e.preventDefault();
        const selectedMailbox = $targetMailboxSelect.val();
        
        if (!selectedMailbox) {
            alert('Bitte wählen Sie ein Zielpostfach aus.');
            return;
        }

        $targetStructureButton.text('Wird geladen...').prop('disabled', true);

        $.ajax({
            url: '/get-mailbox-folders',
            type: 'POST',
            data: JSON.stringify({ mailbox: selectedMailbox }),
            contentType: 'application/json',
            dataType: 'json',
            success: data => {
                $targetFolderTree.jstree('destroy').jstree({ 'core': { 'data': data } });
                $targetStructureButton.text('Ordnerstruktur anzeigen').prop('disabled', false);
                checkImportButtonVisibility();
            },
            error: handleError('Fehler beim Laden der Zielpostfach-Ordnerstruktur', $targetStructureButton, 'Ordnerstruktur anzeigen')
        });
    }

    let selectedPstFolderId = null; // Store the node ID
    let selectedPstFolderName = null; // Store the folder name

    function handlePstFolderTreeChange(e, data) {
        if (data.selected.length) {
            const node = $pstFolderTree.jstree(true).get_node(data.selected[0]);
            selectedPstFolderId = node.id; // Store the node ID
            selectedPstFolderName = node.text; // Store the folder name
        } else {
            selectedPstFolderId = null;
            selectedPstFolderName = null;
        }
        checkImportButtonVisibility();
    }

    function handleTargetFolderTreeChange(e, data) {
        selectedTargetFolder = data.selected[0];
        checkImportButtonVisibility();
    }

    function checkImportButtonVisibility() {
        if ($pstFolderTree.jstree(true) && $targetFolderTree.jstree(true) && selectedPstFolderId && selectedTargetFolder) {
            $importButton.show();
        } else {
            $importButton.hide();
        }
    }

    function handleImportButtonClick() {
        if (!selectedPstFolderId || !selectedTargetFolder) {
            alert('Bitte wählen Sie sowohl einen Quell- als auch einen Zielordner aus.');
            return;
        }
    
        const pstFile = $pstFileSelect.val();
        const mailbox = $targetMailboxSelect.val();
    
        $importButton.prop('disabled', true).text('Ordnerstruktur wird erstellt...');
    
        const fullStructure = $pstFolderTree.jstree(true).get_json(selectedPstFolderId);
    
        if (!fullStructure || fullStructure.length === 0) {
            alert('Keine Ordnerstruktur gefunden. Bitte wählen Sie einen gültigen Ordner aus.');
            $importButton.prop('disabled', false).text('Importieren');
            return;
        }
    
        const childrenStructure = Array.isArray(fullStructure) ? fullStructure[0].children || [] : fullStructure.children || [];
    
        if (childrenStructure.length === 0) {
            alert('Der ausgewählte Ordner hat keine Unterordner.');
            $importButton.prop('disabled', false).text('Importieren');
            return;
        }
    
        $.ajax({
            url: '/create-folders',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                mailbox: mailbox,
                targetFolderId: selectedTargetFolder,
                folderStructure: childrenStructure
            }),
            success: response => {
                console.log('Folders created:', response);
                $importButton.prop('disabled', true).text('Importiere Items...');
    
                const message = formatToastMessage(response);
                showToast(message);
                reloadTargetFolderStructure(mailbox);     
                
                importEmails(selectedPstFolderName, mailbox, selectedTargetFolder); // Use the folder name for display
            },
            error: handleError('Fehler beim Erstellen der Ordner', $importButton, 'Importieren')
        });
    }
    function importEmails(selectedPstFolder, mailbox, targetFolderId) {
        const pstFile = $pstFileSelect.val();
        $.ajax({
            url: '/import-emails',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                selectedPstFolder: selectedPstFolder,
                mailbox: mailbox,
                targetFolderId: targetFolderId,
                fileName: pstFile
            }),
            success: response => {
                console.log('Emails imported:', response);
                alert('Die E-Mails wurden erfolgreich importiert.');
                $importButton.prop('disabled', false).text('Importieren');
            },
            error: handleError('Fehler beim Importieren der E-Mails', $importButton, 'Importieren')
        });
    }
    
    function reloadTargetFolderStructure(mailbox) {
        $.ajax({
            url: '/get-mailbox-folders',
            type: 'POST',
            data: JSON.stringify({ mailbox: mailbox }),
            contentType: 'application/json',
            dataType: 'json',
            success: data => {
                $targetFolderTree.jstree('destroy').jstree({ 'core': { 'data': data } });
                $importButton.prop('disabled', false).text('Importieren');
                console.log("Das erstellen der Ordnerstruktur ist abgeschlossen.");
            },
            error: handleError('Fehler beim Neuladen der Zielpostfach-Ordnerstruktur', $importButton, 'Importieren')
        });
    }

    function showToast(message) {
        const toastEl = document.getElementById('resultToast');
        const toastBody = toastEl.querySelector('.toast-body');
        toastBody.innerHTML = message;
        const toast = new bootstrap.Toast(toastEl);
        toast.show();
    }
    
    function formatToastMessage(response) {
        return `
            <p><strong>Ordner verarbeitet:</strong> ${response.totalProcessed}</p>
            <p><strong>Erstellt:</strong> ${response.created}</p>
            <p><strong>Übersprungen:</strong> ${response.skipped.total}</p>
            <p>(Bereits existierend: ${response.skipped.existing}, Fehler: ${response.skipped.errors})</p>
        `;
    }

    function handleError(errorMessage, button, buttonText) {
        return function(xhr, status, error) {
            console.error('Error:', xhr.responseJSON);
            let fullErrorMessage = errorMessage;
            if (xhr.responseJSON && xhr.responseJSON.error) {
                fullErrorMessage += ': ' + xhr.responseJSON.error;
            }
            alert(fullErrorMessage);
            if (button && buttonText) {
                button.text(buttonText).prop('disabled', false);
            }
        };
    }
});