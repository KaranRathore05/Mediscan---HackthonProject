import os

# Tesseract Configuration
TESSERACT_CONFIG = {
    'path': os.environ.get('TESSERACT_PATH', ''),  # Can be set via environment variable
    'lang': 'eng',  # Default language
    'config': '--psm 6'  # Page segmentation mode: Assume a single uniform block of text
}

# Flask Configuration
FLASK_CONFIG = {
    'DEBUG': True,
    'PORT': 5000,
    'HOST': '0.0.0.0',
    'SECRET_KEY': os.urandom(24),
    'MAX_CONTENT_LENGTH': 16 * 1024 * 1024  # 16MB max file size
}

# Logging Configuration
LOGGING_CONFIG = {
    'level': 'INFO',
    'format': '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
} 


