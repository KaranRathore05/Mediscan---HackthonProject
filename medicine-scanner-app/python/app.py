from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import base64
import pytesseract
from PIL import Image
import io
import re
import logging
from datetime import datetime
import platform
from config import TESSERACT_CONFIG, FLASK_CONFIG, LOGGING_CONFIG
from medicine_database import MEDICINE_DATABASE
from gtts import gTTS
from googletrans import Translator
import tempfile
from deep_translator import GoogleTranslator

# Configure logging
logging.basicConfig(
    level=getattr(logging, LOGGING_CONFIG['level']),
    format=LOGGING_CONFIG['format']
)
logger = logging.getLogger(__name__)

SUPPORTED_LANGUAGES = {
    'en': 'English',
    'hi': 'Hindi',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese',
    'ar': 'Arabic'
}

translator = Translator()

def configure_tesseract():
    if TESSERACT_CONFIG['path']:
        pytesseract.pytesseract.tesseract_cmd = TESSERACT_CONFIG['path']
        logger.info(f"Using Tesseract from configured path: {TESSERACT_CONFIG['path']}")
        return

    if platform.system() == 'Windows':
        default_paths = [
            r'C:\Program Files\Tesseract-OCR\tesseract.exe',
            r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
            r'C:\Tesseract-OCR\tesseract.exe',
            os.path.join(os.environ.get('PROGRAMFILES', ''), 'Tesseract-OCR', 'tesseract.exe'),
            os.path.join(os.environ.get('PROGRAMFILES(X86)', ''), 'Tesseract-OCR', 'tesseract.exe')
        ]

        for path in default_paths:
            if os.path.exists(path):
                pytesseract.pytesseract.tesseract_cmd = path
                logger.info(f"Found Tesseract at: {path}")
                return

        logger.warning("Tesseract not found in default locations. Please install Tesseract OCR or set TESSERACT_PATH.")
    else:
        try:
            pytesseract.get_tesseract_version()
            logger.info("Tesseract found in system PATH")
        except Exception as e:
            logger.error(f"Tesseract not found in system PATH: {str(e)}")

configure_tesseract()

app = Flask(__name__)
CORS(app)
app.config['SECRET_KEY'] = FLASK_CONFIG['SECRET_KEY']
app.config['MAX_CONTENT_LENGTH'] = FLASK_CONFIG['MAX_CONTENT_LENGTH']

def translate_text(text, target_lang='en'):
    try:
        if target_lang == 'en':
            return text
        return translator.translate(text, dest=target_lang).text
    except Exception as e:
        logger.error(f"Translation error: {str(e)}")
        return text

def translate_to_hindi(text):
    try:
        chunks = [text[i:i+5000] for i in range(0, len(text), 5000)]
        return ' '.join([GoogleTranslator(source='en', target='hi').translate(chunk) for chunk in chunks])
    except Exception as e:
        logger.error(f"Translation error: {str(e)}")
        return text

def generate_speech(text, lang='en'):
    try:
        if lang == 'hi':
            text = text.replace('\n', '। ').strip()
            tts = gTTS(text=text, lang='hi', slow=True)
        else:
            tts = gTTS(text=text, lang=lang, slow=False)

        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3')
        tts.save(temp_file.name)
        logger.info(f"Speech generated and saved to: {temp_file.name}")
        return temp_file.name
    except Exception as e:
        logger.error(f"Error generating speech: {str(e)}")
        return None

def extract_medicine_info(text, lang='en'):
    info = {
        'name': '', 'name_hi': '',
        'usage': '', 'usage_hi': '',
        'warnings': '', 'warnings_hi': '',
        'dosage': '', 'dosage_hi': '',
        'sideEffects': '', 'sideEffects_hi': '',
        'timestamp': datetime.now().isoformat(),
        'confidence': 0,
        'matchedNames': []
    }

    lower_text = text.lower()
    best_match = None
    best_score = 0

    for key, med in MEDICINE_DATABASE.items():
        if med['name'].lower() in lower_text:
            score = len(med['name']) / len(lower_text)
            if score > best_score:
                best_match, best_score = med, score
                info['matchedNames'].append(med['name'])

        for alias in med['commonNames']:
            if alias.lower() in lower_text:
                score = len(alias) / len(lower_text)
                if score > best_score:
                    best_match, best_score = med, score
                    info['matchedNames'].append(alias)

    if best_match:
        info['name'] = best_match['name']
        info['name_hi'] = best_match.get('name_hi', translate_to_hindi(best_match['name']))
        info['usage'] = best_match['usage']
        info['usage_hi'] = best_match.get('usage_hi', translate_to_hindi(best_match['usage']))
        info['warnings'] = best_match['warnings']
        info['warnings_hi'] = best_match.get('warnings_hi', translate_to_hindi(best_match['warnings']))
        info['dosage'] = best_match['dosage']
        info['dosage_hi'] = best_match.get('dosage_hi', translate_to_hindi(best_match['dosage']))
        info['sideEffects'] = best_match['sideEffects']
        info['sideEffects_hi'] = best_match.get('sideEffects_hi', translate_to_hindi(best_match['sideEffects']))
        info['confidence'] = best_score
        logger.info(f"Matched medicine: {best_match['name']}")

    return info

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "message": "Server is running", "timestamp": datetime.now().isoformat()})

@app.route('/api/languages', methods=['GET'])
def get_languages():
    return jsonify({"success": True, "languages": SUPPORTED_LANGUAGES})

@app.route('/api/translate', methods=['POST'])
def translate_medicine_info():
    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({"success": False, "message": "No text provided"}), 400
    lang = data.get('language', 'en')
    if lang not in SUPPORTED_LANGUAGES:
        return jsonify({"success": False, "message": f"Unsupported language"}), 400
    translated = translate_text(data['text'], lang)
    return jsonify({"success": True, "original": data['text'], "translated": translated, "language": lang})

@app.route('/api/speech', methods=['POST'])
def generate_medicine_speech():
    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({"success": False, "message": "No text provided"}), 400
    lang = data.get('language', 'en')
    if lang not in SUPPORTED_LANGUAGES:
        return jsonify({"success": False, "message": f"Unsupported language"}), 400
    audio_file = generate_speech(data['text'], lang)
    if audio_file:
        return send_file(audio_file, mimetype='audio/mpeg', as_attachment=True, download_name=f'medicine_info_{lang}.mp3')
    return jsonify({"success": False, "message": "Error generating speech"}), 500

@app.route('/api/audio/<filename>', methods=['GET'])
def serve_audio_file(filename):
    audio_path = os.path.join(tempfile.gettempdir(), filename)
    if os.path.exists(audio_path):
        return send_file(audio_path, mimetype='audio/mpeg', as_attachment=True, download_name=filename)
    return jsonify({"success": False, "message": "Audio file not found"}), 404

@app.route('/api/scan', methods=['POST'])
def scan_medicine():
    try:
        data = request.get_json()
        if not data or 'imageData' not in data:
            return jsonify({"success": False, "message": "No image data provided"}), 400

        image_data = data['imageData'].split(',')[1]
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes))
        text = pytesseract.image_to_string(image, lang=TESSERACT_CONFIG['lang'], config=TESSERACT_CONFIG['config'])

        lang = data.get('language', 'en')
        if lang not in SUPPORTED_LANGUAGES:
            lang = 'en'

        info = extract_medicine_info(text, lang)

        if lang == 'hi':
            speech_text = f"दवा का नाम: {info['name_hi']} उपयोग: {info['usage_hi']} चेतावनी: {info['warnings_hi']} खुराक: {info['dosage_hi']} दुष्प्रभाव: {info['sideEffects_hi']}"
            display_info = {
                'name': info['name_hi'], 'usage': info['usage_hi'], 'warnings': info['warnings_hi'],
                'dosage': info['dosage_hi'], 'sideEffects': info['sideEffects_hi']
            }
        else:
            speech_text = f"Medicine: {info['name']} Usage: {info['usage']} Warnings: {info['warnings']} Dosage: {info['dosage']} Side Effects: {info['sideEffects']}"
            display_info = {
                'name': info['name'], 'usage': info['usage'], 'warnings': info['warnings'],
                'dosage': info['dosage'], 'sideEffects': info['sideEffects']
            }

        audio_file = generate_speech(speech_text, lang)
        if audio_file:
            info['audioDownloadUrl'] = f'/api/audio/{os.path.basename(audio_file)}'
            info['translatedText'] = speech_text

        info['display'] = display_info
        info['selectedLanguage'] = lang

        return jsonify({"success": True, "message": "Medicine scanned successfully", "data": info, "timestamp": datetime.now().isoformat()})
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return jsonify({"success": False, "message": "Unexpected error occurred"}), 500

if __name__ == '__main__':
    app.run(debug=FLASK_CONFIG['DEBUG'], port=FLASK_CONFIG['PORT'], host=FLASK_CONFIG['HOST'])
