// js/app.js

// DOM Elements
const video = document.getElementById('camera');
const captureBtn = document.getElementById('capture-btn');
const switchCameraBtn = document.getElementById('switch-camera-btn');
const galleryBtn = document.getElementById('gallery-btn');
const galleryUpload = document.getElementById('gallery-upload');
const canvas = document.getElementById('canvas');
const speakBtn = document.getElementById('speak-btn');
const languageSelect = document.getElementById('language');
const loadingOverlay = document.getElementById('loading-overlay');
const scanHistory = document.getElementById('scan-history');
const reminderBtn = document.getElementById('reminder-btn');

// Medicine database (sample data) - Hindi translations added
const medicineDatabase = {
    'paracetamol': {
        name: 'Paracetamol',
        usage: 'For fever and pain relief',
        warnings: 'Do not exceed recommended dosage',
        commonNames: ['acetaminophen', 'tylenol', 'dolo'],
        name_hi: 'पैरासिटामोल',
        usage_hi: 'बुखार और दर्द से राहत के लिए',
        warnings_hi: 'अनुशंसित खुराक से अधिक न लें'
    },
    'amoxicillin': {
        name: 'Amoxicillin',
        usage: 'Antibiotic for bacterial infections',
        warnings: 'Complete full course as prescribed',
        commonNames: ['amox', 'amoxycillin'],
        name_hi: 'अमोक्सिसिलिन',
        usage_hi: 'बैक्टीरियल संक्रमण के लिए एंटीबायोटिक',
        warnings_hi: 'निर्धारित अनुसार पूरा कोर्स करें'
    },
    // Add more medicines here with _hi translations
};

// ChatGPT API configuration
const OPENAI_API_KEY = 'YOUR_OPENAI_API_KEY'; // Replace with your API key
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Camera state
let currentFacingMode = 'environment';
let stream = null;

// Initialize camera
async function initCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: currentFacingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });
        video.srcObject = stream;
    } catch (err) {
        console.error('Error accessing camera:', err);
        alert('Unable to access camera. Please ensure you have granted camera permissions.');
    }
}

// Switch camera
async function switchCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    await initCamera();
}

// Capture image from camera
function captureImage() {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg');
}

// Language handling functions
function getLanguageSuffix(lang) {
    return lang === 'hi' ? '_hi' : '';
}

async function fetchMedicineInfo(medicineName, lang) {
    try {
        console.log('Fetching medicine info for:', medicineName, 'in language:', lang);
        const response = await fetch(`/api/medicine/${encodeURIComponent(medicineName)}?lang=${lang}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Received medicine data:', data);
        return data;
    } catch (error) {
        console.error('Error fetching medicine info:', error);
        return null;
    }
}

// Update medicine information function
async function updateMedicineInfo(data, lang) {
    try {
        console.log('Updating medicine info with data:', data);
        
        // Update medicine information with language-specific content
        const elements = {
            'medicine-name': data.name || '-',
            'usage': data.usage || '-',
            'warnings': data.warnings || '-',
            'dosage': data.dosage || '-',
            'side-effects': data.sideEffects || '-',
            'scan-time': new Date().toLocaleString()
        };

        // Update each element
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            } else {
                console.warn(`Element with id '${id}' not found`);
            }
        });

        // Update common names if available
        const commonNamesElement = document.getElementById('common-names');
        if (commonNamesElement && data.commonNames) {
            commonNamesElement.textContent = Array.isArray(data.commonNames) 
                ? data.commonNames.join(', ') 
                : data.commonNames;
        }
    } catch (error) {
        console.error('Error updating medicine info:', error);
    }
}

// Modified language switching function
async function changeLanguage(lang) {
    try {
        console.log('Changing language to:', lang);
        
        // Update UI translations
        document.querySelectorAll('[data-translate]').forEach(element => {
            const key = element.getAttribute('data-translate');
            if (translations[lang] && translations[lang][key]) {
                if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                    element.placeholder = translations[lang][key];
                } else {
                    element.textContent = translations[lang][key];
                }
            }
        });
        
        // Update medicine information if available
        const medicineName = document.getElementById('medicine-name').textContent;
        if (medicineName && medicineName !== '-') {
            console.log('Fetching medicine info for:', medicineName);
            const data = await fetchMedicineInfo(medicineName, lang);
            if (data) {
                await updateMedicineInfo(data, lang);
            }
        }
        
        // Store the selected language
        localStorage.setItem('selectedLanguage', lang);
    } catch (error) {
        console.error('Error changing language:', error);
    }
}

// Initialize language on page load
document.addEventListener('DOMContentLoaded', () => {
    const savedLanguage = localStorage.getItem('selectedLanguage') || 'en';
    document.getElementById('language').value = savedLanguage;
    changeLanguage(savedLanguage);
});

// Modified OCR processing function
async function processImage(imageData) {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.classList.remove('hidden');
    
    try {
        const result = await Tesseract.recognize(
            imageData,
            'eng',
            { logger: m => console.log(m) }
        );
        
        const medicineName = result.data.text.trim();
        const currentLang = document.getElementById('language').value;
        
        // Fetch medicine information in the current language
        const medicineInfo = await fetchMedicineInfo(medicineName, currentLang);
        if (medicineInfo) {
            updateMedicineInfo(medicineInfo, currentLang);
        }
        
        // Add to history
        addToHistory(medicineName, medicineInfo);
    } catch (error) {
        console.error('Error processing image:', error);
    } finally {
        loadingOverlay.classList.add('hidden');
    }
}

// Add to history function
function addToHistory(medicineName, medicineInfo) {
    try {
        console.log('Adding to history:', medicineInfo);
        const historyList = document.getElementById('scan-history');
        if (!historyList) {
            console.warn('History list element not found');
            return;
        }

        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.innerHTML = `
            <div class="history-item-content">
                <span class="medicine-name">${medicineInfo.name || 'Unknown'}</span>
                <span class="common-names">${medicineInfo.commonNames ? medicineInfo.commonNames.join(', ') : ''}</span>
                <span class="scan-time">${new Date().toLocaleString()}</span>
            </div>
        `;
        
        // Add click handler to show medicine details
        historyItem.addEventListener('click', () => {
            updateMedicineInfo(medicineInfo, document.getElementById('language').value);
            speakText(medicineInfo);
        });
        
        historyList.insertBefore(historyItem, historyList.firstChild);
    } catch (error) {
        console.error('Error adding to history:', error);
    }
}

// Query ChatGPT API
async function queryChatGPT(text, language) {
    try {
        const prompt = language === 'hi' ?
            "आप एक चिकित्सा सूचना सहायक हैं। दिए गए पाठ से दवा का नाम, उपयोग और समाप्ति तिथि निकालें। कोई भी महत्वपूर्ण चेतावनी भी प्रदान करें। अपनी प्रतिक्रिया को निम्नलिखित संरचना के साथ JSON के रूप में प्रारूपित करें: { name: string, usage: string, expiryDate: string, warnings: string }" :
            "You are a medical information assistant. Extract medicine name, usage, and expiry date from the given text. Also provide any important warnings. Format your response as JSON with the following structure: { name: string, usage: string, expiryDate: string, warnings: string }";

        const response = await axios.post(OPENAI_API_URL, {
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: prompt
                },
                {
                    role: "user",
                    content: text
                }
            ]
        }, {
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const content = response.data.choices[0].message.content;
        try {
            return JSON.parse(content);
        } catch (e) {
            return {
                name: content,
                usage: language === 'hi' ? 'जानकारी उपलब्ध नहीं' : 'Information not available',
                expiryDate: language === 'hi' ? 'नहीं मिला' : 'Not found',
                warnings: language === 'hi' ? 'कोई विशिष्ट चेतावनी नहीं मिली' : 'No specific warnings found'
            };
        }
    } catch (err) {
        console.error('Error querying ChatGPT:', err);
        return null;
    }
}

// Extract medicine information
function extractMedicineInfo(text, language) {
    const info = {
        name: '',
        usage: '',
        expiryDate: '',
        warnings: ''
    };

    const lowerText = text.toLowerCase();
    for (const [key, medicine] of Object.entries(medicineDatabase)) {
        const nameToMatch = language === 'hi' && medicine.name_hi ? medicine.name_hi.toLowerCase() : key;
        const commonNamesToMatch = medicine.commonNames.map(n => n.toLowerCase());

        if (lowerText.includes(nameToMatch) || commonNamesToMatch.some(name => lowerText.includes(name))) {
            info.name = language === 'hi' && medicine.name_hi ? medicine.name_hi : medicine.name;
            info.usage = language === 'hi' && medicine.usage_hi ? medicine.usage_hi : medicine.usage;
            info.warnings = language === 'hi' && medicine.warnings_hi ? medicine.warnings_hi : medicine.warnings;
            break;
        }
    }

    const datePattern = /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4}/i;
    const dateMatch = text.match(datePattern);
    if (dateMatch) {
        info.expiryDate = dateMatch[0];
    }

    return info;
}

// Update UI with extracted information
function updateUI(info) {
    document.getElementById('medicine-name').textContent = info.name || (languageSelect.value === 'hi' ? 'नहीं मिला' : 'Not found');
    document.getElementById('usage').textContent = info.usage || (languageSelect.value === 'hi' ? 'नहीं मिला' : 'Not found');
    document.getElementById('warnings').textContent = info.warnings || (languageSelect.value === 'hi' ? 'नहीं मिला' : 'Not found');
    document.getElementById('dosage').textContent = info.dosage || (languageSelect.value === 'hi' ? 'नहीं मिला' : 'Not found');
    document.getElementById('side-effects').textContent = info.sideEffects || (languageSelect.value === 'hi' ? 'नहीं मिला' : 'Not found');

    const timestamp = new Date(info.timestamp).toLocaleString();
    document.getElementById('scan-time').textContent = timestamp;
}

// Create result card
function createResultCard(info) {
    const notFound = languageSelect.value === 'hi' ? 'उपलब्ध नहीं' : 'Not available';
    const scannedAt = languageSelect.value === 'hi' ? 'पर स्कैन किया गया:' : 'Scanned at:';
    return `
        <div class="result-card">
            <h3>${info.name || (languageSelect.value === 'hi' ? 'अज्ञात दवा' : 'Unknown Medicine')}</h3>
            <p><strong>${languageSelect.value === 'hi' ? 'उपयोग:' : 'Usage:'}</strong> ${info.usage || notFound}</p>
            <p><strong>${languageSelect.value === 'hi' ? 'चेतावनी:' : 'Warnings:'}</strong> ${info.warnings || notFound}</p>
            <p><strong>${languageSelect.value === 'hi' ? 'खुराक:' : 'Dosage:'}</strong> ${info.dosage || notFound}</p>
            <p><strong>${languageSelect.value === 'hi' ? 'दुष्प्रभाव:' : 'Side Effects:'}</strong> ${info.sideEffects || notFound}</p>
            <p><strong>${scannedAt}</strong> ${new Date(info.timestamp).toLocaleString()}</p>
        </div>
    `;
}

// Show loading overlay
function showLoading() {
    loadingOverlay.classList.remove('hidden');
}

// Hide loading overlay
function hideLoading() {
    loadingOverlay.classList.add('hidden');
}

// Process image from gallery
async function processGalleryImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
    });
}

// Handle image processing
async function handleImageProcessing(imageData) {
    showLoading();
    const language = languageSelect.value;
    try {
        // Send image data and language to Python backend
        const response = await axios.post('http://localhost:5000/api/scan', {
            imageData: imageData,
            language: language
        }, {
            timeout: 30000, // 30 second timeout
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.data.success) {
            const info = response.data.data;

            // Validate the response data
            if (!info || typeof info !== 'object') {
                throw new Error('Invalid response data from server');
            }

            // Update UI with the information
            updateUI(info);

            // Add to history with timestamp
            addToHistory(info.name, info);

            // Automatically speak after scan
            speakText(info);
        } else {
            throw new Error(response.data.message || 'Failed to process image');
        }
    } catch (err) {
        console.error('Error processing image:', err);
        let errorMessage = language === 'hi' ? 'छवि संसाधित करने में त्रुटि। ' : 'Error processing image. ';

        if (err.response) {
            errorMessage += err.response.data.message || (language === 'hi' ? `सर्वर त्रुटि: ${err.response.status}` : `Server error: ${err.response.status}`);
        } else if (err.request) {
            errorMessage += language === 'hi' ? 'सर्वर से कोई प्रतिक्रिया नहीं। कृपया जांचें कि सर्वर चल रहा है या नहीं।' : 'No response from server. Please check if the server is running.';
        } else {
            errorMessage += err.message;
        }

        alert(errorMessage);
    } finally {
        hideLoading();
    }
}

// Event Listeners
captureBtn.addEventListener('click', async () => {
    const imageData = captureImage();
    await handleImageProcessing(imageData);
});

switchCameraBtn.addEventListener('click', switchCamera);

galleryBtn.addEventListener('click', () => {
    galleryUpload.click();
});

galleryUpload.addEventListener('change', async (e) => {
    if (e.target.files && e.target.files[0]) {
        const imageData = await processGalleryImage(e.target.files[0]);
        await handleImageProcessing(imageData);
    }
});

speakBtn.addEventListener('click', () => {
    const language = languageSelect.value;
    const name = document.getElementById('medicine-name').textContent;
    const usage = document.getElementById('usage').textContent;
    const warnings = document.getElementById('warnings').textContent;

    speakText({
        name: name,
        usage: usage,
        warnings: warnings,
        timestamp: new Date().toISOString()
    });
});

// Reminder Notification Logic
function askNotificationPermission() {
    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function scheduleReminderNotification(info, minutes) {
    if (Notification.permission !== 'granted') {
        alert(languageSelect.value === 'hi' ? 'अनुस्मारक प्राप्त करने के लिए कृपया सूचनाओं की अनुमति दें।' : 'Please allow notifications to receive reminders.');
        return;
    }
    const title = languageSelect.value === 'hi' ? `दवा अनुस्मारक: ${info.name}` : `Medicine Reminder: ${info.name}`;
    const body = languageSelect.value === 'hi' ? `आपकी दवा लेने का समय हो गया है। उपयोग: ${info.usage}` : `It's time to take your medicine. Usage: ${info.usage}`;
    setTimeout(() => {
        new Notification(title, { body });
    }, minutes * 60 * 1000);
}

reminderBtn.addEventListener('click', () => {
    askNotificationPermission();
    const promptText = languageSelect.value === 'hi' ? 'मुझे कितने मिनटों में याद दिलाना है? (उदाहरण के लिए, 60 का मतलब 1 घंटा)' : 'Remind me in how many minutes? (e.g., 60 for 1 hour)';
    const minutes = parseInt(prompt(promptText), 10);
    if (isNaN(minutes) || minutes <= 0) {
        alert(languageSelect.value === 'hi' ? 'कृपया मिनटों की एक मान्य संख्या दर्ज करें।' : 'Please enter a valid number of minutes.');
        return;
    }
    const info = {
        name: document.getElementById('medicine-name').textContent,
        usage: document.getElementById('usage').textContent
    };
    scheduleReminderNotification(info, minutes);
    alert(languageSelect.value === 'hi' ? 'अनुस्मारक सेट! आपको एक सूचना मिलेगी।' : 'Reminder set! You will receive a notification.');
});

// Initialize camera when page loads
document.addEventListener('DOMContentLoaded', initCamera);

// Drawer and Modal Logic
const menuBtn = document.getElementById('menu-btn');
const menuDrawer = document.getElementById('menu-drawer');
const drawerBackdrop = document.getElementById('drawer-backdrop');
const menuPrivacy = document.getElementById('menu-privacy');
const menuHistory = document.getElementById('menu-history');
const menuAccount = document.getElementById('menu-account');
const privacyModal = document.getElementById('privacy-modal');
const closePrivacyModal = document.getElementById('close-privacy-modal');

// Open drawer
menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuDrawer.classList.remove('hidden');
    drawerBackdrop.classList.remove('hidden');
    // Force reflow for transition
    void menuDrawer.offsetWidth;
    menuDrawer.classList.add('open');
    drawerBackdrop.classList.add('open');
});
// Close drawer

function closeDrawer() {
    menuDrawer.classList.remove('open');
    drawerBackdrop.classList.remove('open');
    setTimeout(() => {
        menuDrawer.classList.add('hidden');
        drawerBackdrop.classList.add('hidden');
    }, 350);
}
drawerBackdrop.addEventListener('click', closeDrawer);
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
});
// Close drawer when clicking a menu item
[menuPrivacy, menuHistory, menuAccount].forEach(btn => {
    btn.addEventListener('click', closeDrawer);
});

// Privacy Policy modal
menuPrivacy.addEventListener('click', () => {
    privacyModal.classList.remove('hidden');
});
closePrivacyModal.addEventListener('click', () => {
    privacyModal.classList.add('hidden');
});

// Scroll to history section
menuHistory.addEventListener('click', () => {
    document.querySelector('.history-section').scrollIntoView({ behavior: 'smooth' });
});

// Placeholder for Account
menuAccount.addEventListener('click', () => {
    alert('Account section coming soon!');
});

// Doctor Section Logic
const doctorBtn = document.getElementById('doctor-btn');
const doctorChat = document.getElementById('doctor-chat');
const closeChat = document.getElementById('close-chat');
const chatBody = document.getElementById('chat-body');
const faqBtns = document.querySelectorAll('.faq-btn');

function appendChatMessage(text, sender) {
    const msg = document.createElement('div');
    msg.className = 'chat-message ' + sender;
    msg.textContent = text;
    chatBody.appendChild(msg);
    chatBody.scrollTop = chatBody.scrollHeight;
}

doctorBtn.addEventListener('click', () => {
    doctorChat.classList.remove('hidden');
    setTimeout(() => doctorChat.scrollIntoView({behavior: 'smooth'}), 100);
});

closeChat.addEventListener('click', () => {
    doctorChat.classList.add('hidden');
    // Clear chat when closing
    chatBody.innerHTML = '<div class="chat-message doctor">Hello! I am your virtual doctor. Click on any question to get the answer:</div>';
});

// Handle FAQ button clicks
faqBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const question = btn.textContent;
        const answer = btn.getAttribute('data-answer');
        
        // Add question as user message
        appendChatMessage(question, 'user');
        
        // Add answer as doctor message
        appendChatMessage(answer, 'doctor');
        
        // Scroll to the latest message
        chatBody.scrollTop = chatBody.scrollHeight;
    });
});

// Text-to-speech function
function speakText(info) {
    const nameLabel = languageSelect.value === 'hi' ? 'दवा का नाम:' : 'Medicine Name:';
    const usageLabel = languageSelect.value === 'hi' ? 'उपयोग:' : 'Usage:';
    const warningsLabel = languageSelect.value === 'hi' ? 'चेतावनी:' : 'Warnings:';
    const dosageLabel = languageSelect.value === 'hi' ? 'खुराक:' : 'Dosage:';

    const speakTextContent = `${nameLabel} ${info.name}. ${usageLabel} ${info.usage}. ${warningsLabel} ${info.warnings}. ${dosageLabel} ${info.dosage}`;
    const utterance = new SpeechSynthesisUtterance(speakTextContent);
    utterance.lang = languageSelect.value === 'hi' ? 'hi-IN' : 'en-US';
    window.speechSynthesis.speak(utterance);
} 