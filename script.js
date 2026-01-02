document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // BACKEND API & HELPER FUNCTIONS
    // ==========================================
    
    // Global state for uploaded URL
    let currentUploadedUrl = null;
    const USER_ID = 'DObRu1vyStbUynoQmTcHBlhs55z2';

    // Generate nanoid for unique filename
    function generateNanoId(length = 21) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Upload file to CDN storage (called immediately when file is selected)
    async function uploadFile(file) {
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const uniqueId = generateNanoId();
        // Filename is just nanoid.extension (no media/ prefix unless required)
        const fileName = uniqueId + '.' + fileExtension;
        
        // Step 1: Get signed URL from API
        // Endpoint: https://api.chromastudio.ai/get-emd-upload-url?fileName=...
        const signedUrlResponse = await fetch(
            'https://api.chromastudio.ai/get-emd-upload-url?fileName=' + encodeURIComponent(fileName),
            { method: 'GET' }
        );
        
        if (!signedUrlResponse.ok) {
            throw new Error('Failed to get upload URL: ' + signedUrlResponse.statusText);
        }
        
        const signedUrl = await signedUrlResponse.text();
        
        // Step 2: PUT file to signed URL
        const uploadResponse = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });
        
        if (!uploadResponse.ok) {
            throw new Error('Failed to upload file: ' + uploadResponse.statusText);
        }
        
        // Step 3: Return download URL
        // Domain: contents.maxstudio.ai
        const downloadUrl = 'https://contents.maxstudio.ai/' + fileName;
        return downloadUrl;
    }

    // Submit generation job
    async function submitImageGenJob(imageUrl) {
        const endpoint = 'https://api.chromastudio.ai/image-gen';
        
        // Image-specific payload
        const body = {
            model: 'image-effects',
            toolType: 'image-effects',
            effectId: 'photoToVectorArt',
            imageUrl: imageUrl, 
            userId: USER_ID,
            removeWatermark: true,
            isPrivate: true
        };
    
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            throw new Error('Failed to submit job: ' + response.statusText);
        }
        
        const data = await response.json();
        return data;
    }

    // Poll job status
    async function pollJobStatus(jobId) {
        const baseUrl = 'https://api.chromastudio.ai/image-gen';
        const POLL_INTERVAL = 2000; // 2 seconds
        const MAX_POLLS = 60; // Max 2 minutes
        let polls = 0;
        
        while (polls < MAX_POLLS) {
            const response = await fetch(
                `${baseUrl}/${USER_ID}/${jobId}/status`,
                { method: 'GET' }
            );
            
            if (!response.ok) {
                throw new Error('Failed to check status: ' + response.statusText);
            }
            
            const data = await response.json();
            
            if (data.status === 'completed') {
                return data;
            }
            
            if (data.status === 'failed' || data.status === 'error') {
                throw new Error(data.error || 'Job processing failed');
            }
            
            updateStatus('PROCESSING... (' + (polls + 1) + ')');
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            polls++;
        }
        
        throw new Error('Job timed out');
    }

    // UI Helper: Update status text and button state
    function updateStatus(text) {
        const btn = document.getElementById('generate-btn');
        if (btn) {
            if (text.includes('PROCESSING') || text.includes('UPLOADING') || text.includes('SUBMITTING')) {
                btn.disabled = true;
                btn.textContent = text;
            } else if (text === 'READY') {
                btn.disabled = false;
                btn.textContent = 'Generate Vector Art';
            }
        }
    }

    // UI Helper: Show loading state
    function showLoading() {
        const loader = document.getElementById('loading-state');
        const resultPlaceholder = document.querySelector('.result-placeholder');
        const resultImage = document.getElementById('result-image');
        
        if (loader) loader.classList.remove('hidden');
        if (resultPlaceholder) resultPlaceholder.classList.add('hidden');
        if (resultImage) resultImage.classList.add('hidden');
    }

    // UI Helper: Hide loading state
    function hideLoading() {
        const loader = document.getElementById('loading-state');
        if (loader) loader.classList.add('hidden');
    }

    // UI Helper: Show uploaded preview
    function showPreview(url) {
        const img = document.getElementById('preview-image');
        const uploadPlaceholder = document.querySelector('.upload-placeholder');
        if (img) {
            img.src = url;
            img.classList.remove('hidden');
        }
        if (uploadPlaceholder) {
            uploadPlaceholder.classList.add('hidden');
        }
    }

    // UI Helper: Show result
    function showResultMedia(url) {
        const resultImage = document.getElementById('result-image');
        const resultPlaceholder = document.querySelector('.result-placeholder');
        
        if (resultImage) {
            resultImage.src = url;
            resultImage.classList.remove('hidden');
        }
        if (resultPlaceholder) {
            resultPlaceholder.classList.add('hidden');
        }
    }

    function showError(msg) {
        alert('Error: ' + msg);
        updateStatus('READY');
    }

    // ==========================================
    // MOBILE MENU
    // ==========================================
    const menuToggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('header nav');
    
    if (menuToggle && nav) {
        menuToggle.addEventListener('click', () => {
            nav.classList.toggle('active');
            menuToggle.textContent = nav.classList.contains('active') ? '✕' : '☰';
            menuToggle.setAttribute('aria-expanded', nav.classList.contains('active'));
        });

        // Close menu when clicking links
        document.querySelectorAll('header nav a').forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('active');
                menuToggle.textContent = '☰';
            });
        });
    }

    // ==========================================
    // PLAYGROUND LOGIC
    // ==========================================
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const generateBtn = document.getElementById('generate-btn');
    const resetBtn = document.getElementById('reset-btn');
    const downloadBtn = document.getElementById('download-btn');

    // Handle File Selection (Auto-Upload)
    async function handleFileSelect(file) {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert('Please upload an image file.');
            return;
        }

        try {
            updateStatus('UPLOADING...');
            
            // Upload immediately
            const uploadedUrl = await uploadFile(file);
            currentUploadedUrl = uploadedUrl;
            
            // Show preview
            showPreview(uploadedUrl);
            
            updateStatus('READY');
            
        } catch (error) {
            console.error(error);
            showError(error.message);
            updateStatus('ERROR');
        }
    }

    // Wiring File Input and Drag & Drop
    if (uploadZone && fileInput) {
        uploadZone.addEventListener('click', () => fileInput.click());
        
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = 'var(--primary)';
            uploadZone.style.backgroundColor = 'rgba(79, 70, 229, 0.1)';
        });

        uploadZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = '';
            uploadZone.style.backgroundColor = '';
        });

        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = '';
            uploadZone.style.backgroundColor = '';
            if (e.dataTransfer.files.length) {
                handleFileSelect(e.dataTransfer.files[0]);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) {
                handleFileSelect(e.target.files[0]);
            }
        });
    }

    // Handle Generate Button
    if (generateBtn) {
        generateBtn.addEventListener('click', async () => {
            if (!currentUploadedUrl) {
                alert('Please upload an image first.');
                return;
            }
            if (generateBtn.disabled) return;

            try {
                showLoading();
                updateStatus('SUBMITTING JOB...');
                
                // Step 1: Submit Job
                const jobData = await submitImageGenJob(currentUploadedUrl);
                
                updateStatus('JOB QUEUED...');
                
                // Step 2: Poll Status
                const result = await pollJobStatus(jobData.jobId);
                
                // Step 3: Get Result URL
                // Check various locations in response
                const resultItem = Array.isArray(result.result) ? result.result[0] : result.result;
                const resultUrl = resultItem?.mediaUrl || resultItem?.image || resultItem?.url;
                
                if (!resultUrl) {
                    throw new Error('No result URL found in response');
                }
                
                // Step 4: Show Result
                showResultMedia(resultUrl);
                
                // Store result for download
                if (downloadBtn) {
                    downloadBtn.dataset.url = resultUrl;
                    downloadBtn.disabled = false;
                }
                
                hideLoading();
                
                // Reset button text
                generateBtn.textContent = 'Generate Vector Art';
                generateBtn.disabled = false;
                
            } catch (error) {
                console.error(error);
                hideLoading();
                showError(error.message);
            }
        });
    }

    // Handle Reset Button
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            currentUploadedUrl = null;
            if (fileInput) fileInput.value = '';
            
            // Reset Preview
            const previewImage = document.getElementById('preview-image');
            const uploadPlaceholder = document.querySelector('.upload-placeholder');
            if (previewImage) {
                previewImage.src = '';
                previewImage.classList.add('hidden');
            }
            if (uploadPlaceholder) uploadPlaceholder.classList.remove('hidden');
            
            // Reset Result
            const resultImage = document.getElementById('result-image');
            const resultPlaceholder = document.querySelector('.result-placeholder');
            if (resultImage) {
                resultImage.src = '';
                resultImage.classList.add('hidden');
            }
            if (resultPlaceholder) resultPlaceholder.classList.remove('hidden');
            
            // Reset Buttons
            if (generateBtn) {
                generateBtn.disabled = true;
                generateBtn.textContent = 'Generate Vector Art';
            }
            if (downloadBtn) {
                downloadBtn.disabled = true;
                downloadBtn.removeAttribute('data-url');
            }
            
            hideLoading();
        });
    }

    // Handle Download Button (Robust Strategy)
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const url = downloadBtn.dataset.url;
            if (!url) return;
            
            const originalText = downloadBtn.textContent;
            downloadBtn.textContent = 'Downloading...';
            downloadBtn.disabled = true;
            
            function downloadBlob(blob, filename) {
                const blobUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = filename;
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
            }
            
            try {
                // STRATEGY 1: Use Proxy
                const proxyUrl = 'https://api.chromastudio.ai/download-proxy?url=' + encodeURIComponent(url);
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error('Proxy failed');
                const blob = await response.blob();
                downloadBlob(blob, 'vector_art_' + generateNanoId(8) + '.png');
                
            } catch (proxyErr) {
                console.warn('Proxy failed, trying direct:', proxyErr);
                
                // STRATEGY 2: Direct Fetch
                try {
                    const response = await fetch(url + '?t=' + Date.now(), { mode: 'cors' });
                    if (!response.ok) throw new Error('Direct failed');
                    const blob = await response.blob();
                    downloadBlob(blob, 'vector_art_' + generateNanoId(8) + '.png');
                } catch (directErr) {
                    // Fallback: Instructions say "If Proxy and Direct Fetch fail, we MUST NOT open the link."
                    alert('Download failed due to browser security restrictions. Please right-click the result image and select "Save Image As".');
                }
            } finally {
                downloadBtn.textContent = originalText;
                downloadBtn.disabled = false;
            }
        });
    }

    // ==========================================
    // FAQ ACCORDION
    // ==========================================
    document.querySelectorAll('.faq-question').forEach(button => {
        button.addEventListener('click', () => {
            const item = button.parentElement;
            const answer = item.querySelector('.faq-answer');
            const isOpen = item.classList.contains('active');

            // Close all others
            document.querySelectorAll('.faq-item').forEach(otherItem => {
                if (otherItem !== item) {
                    otherItem.classList.remove('active');
                    otherItem.querySelector('.faq-answer').style.maxHeight = null;
                }
            });

            // Toggle current
            if (isOpen) {
                item.classList.remove('active');
                answer.style.maxHeight = null;
            } else {
                item.classList.add('active');
                answer.style.maxHeight = answer.scrollHeight + 'px';
            }
        });
    });

    // ==========================================
    // MODALS
    // ==========================================
    const openModal = (modalId) => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden'; // Prevent background scroll
        }
    };

    const closeModal = (modalId) => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        }
    };

    // Open triggers
    document.querySelectorAll('[data-modal-target]').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = trigger.getAttribute('data-modal-target');
            openModal(targetId);
        });
    });

    // Close triggers
    document.querySelectorAll('[data-modal-close]').forEach(trigger => {
        trigger.addEventListener('click', () => {
            const targetId = trigger.getAttribute('data-modal-close');
            closeModal(targetId);
        });
    });

    // Close on outside click
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.add('hidden');
            document.body.style.overflow = '';
        }
    });
    
    // ==========================================
    // HERO ANIMATION (Geometric Shapes)
    // ==========================================
    function createShapes() {
        const container = document.querySelector('.hero-bg-animation');
        if (!container) return;
        
        const colors = ['var(--primary)', 'var(--secondary)', 'var(--accent)'];
        const shapes = ['50%', '0%']; // Circle or Square
        
        for (let i = 0; i < 15; i++) {
            const el = document.createElement('div');
            el.style.position = 'absolute';
            el.style.border = '2px solid ' + colors[Math.floor(Math.random() * colors.length)];
            el.style.width = (20 + Math.random() * 60) + 'px';
            el.style.height = el.style.width;
            el.style.left = Math.random() * 100 + '%';
            el.style.top = Math.random() * 100 + '%';
            el.style.opacity = '0.3';
            el.style.borderRadius = shapes[Math.floor(Math.random() * shapes.length)];
            
            // Animation
            el.style.transition = 'transform 10s linear';
            el.animate([
                { transform: 'translate(0, 0) rotate(0deg)' },
                { transform: `translate(${Math.random() * 100 - 50}px, ${Math.random() * 100 - 50}px) rotate(360deg)` }
            ], {
                duration: 10000 + Math.random() * 10000,
                iterations: Infinity,
                direction: 'alternate',
                easing: 'ease-in-out'
            });
            
            container.appendChild(el);
        }
    }
    createShapes();
});