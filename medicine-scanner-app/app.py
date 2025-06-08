from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import json
import logging

app = Flask(__name__)
CORS(app)

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

def get_db_connection():
    try:
        conn = sqlite3.connect('medicines.db')
        conn.row_factory = sqlite3.Row
        return conn
    except Exception as e:
        logger.error(f"Database connection error: {str(e)}")
        raise

@app.route('/api/medicine/<medicine_name>')
def get_medicine_info(medicine_name):
    try:
        lang = request.args.get('lang', 'en')
        logger.debug(f"Searching for medicine: {medicine_name} in language: {lang}")
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # First, let's check if the table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='medicines'")
        if not cursor.fetchone():
            logger.error("Medicines table does not exist")
            return jsonify({'error': 'Database not properly initialized'}), 500
        
        # Get all columns from the table
        cursor.execute("PRAGMA table_info(medicines)")
        columns = [col[1] for col in cursor.fetchall()]
        logger.debug(f"Available columns: {columns}")
        
        # Build the query based on available columns
        select_columns = []
        for col in ['name', 'name_hi', 'usage', 'usage_hi', 'warnings', 'warnings_hi', 
                   'dosage', 'dosage_hi', 'sideEffects', 'sideEffects_hi', 
                   'commonNames', 'commonNames_hi']:
            if col in columns:
                select_columns.append(col)
        
        if not select_columns:
            logger.error("No valid columns found in medicines table")
            return jsonify({'error': 'Invalid database structure'}), 500
        
        query = f"""
        SELECT {', '.join(select_columns)}
        FROM medicines 
        WHERE LOWER(name) LIKE LOWER(?)
        OR LOWER(name_hi) LIKE LOWER(?)
        """
        
        search_term = f'%{medicine_name.lower()}%'
        logger.debug(f"Executing query with search term: {search_term}")
        
        cursor.execute(query, (search_term, search_term))
        medicine = cursor.fetchone()
        
        if medicine:
            medicine_dict = dict(medicine)
            logger.debug(f"Found medicine: {medicine_dict}")
            
            # Handle JSON fields
            for field in ['commonNames', 'commonNames_hi']:
                if field in medicine_dict and medicine_dict[field]:
                    try:
                        medicine_dict[field] = json.loads(medicine_dict[field])
                    except json.JSONDecodeError:
                        medicine_dict[field] = []
            
            if lang == 'hi':
                result = {
                    'name': medicine_dict.get('name_hi') or medicine_dict.get('name', ''),
                    'usage': medicine_dict.get('usage_hi') or medicine_dict.get('usage', ''),
                    'warnings': medicine_dict.get('warnings_hi') or medicine_dict.get('warnings', ''),
                    'dosage': medicine_dict.get('dosage_hi') or medicine_dict.get('dosage', ''),
                    'sideEffects': medicine_dict.get('sideEffects_hi') or medicine_dict.get('sideEffects', ''),
                    'commonNames': medicine_dict.get('commonNames_hi') or medicine_dict.get('commonNames', [])
                }
            else:
                result = {
                    'name': medicine_dict.get('name', ''),
                    'usage': medicine_dict.get('usage', ''),
                    'warnings': medicine_dict.get('warnings', ''),
                    'dosage': medicine_dict.get('dosage', ''),
                    'sideEffects': medicine_dict.get('sideEffects', ''),
                    'commonNames': medicine_dict.get('commonNames', [])
                }
            
            logger.debug(f"Returning result: {result}")
            return jsonify(result)
        
        logger.warning(f"No medicine found for: {medicine_name}")
        return jsonify({'error': 'Medicine not found'}), 404
        
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == '__main__':
    app.run(debug=True) 