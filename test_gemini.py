import os
from pathlib import Path
from dotenv import load_dotenv
import google.genai as genai

env_path = Path("backend/.env")
load_dotenv(dotenv_path=env_path)
api_key = os.getenv("GEMINI_API_KEY")

print(f"API Key found: {api_key[:5]}...{api_key[-5:] if api_key else 'None'}")

if api_key:
    try:
        client = genai.Client(api_key=api_key)
        # Using the exact name user insisted on
        model_id = 'gemini-2.0-flash-lite'
        response = client.models.generate_content(
            model=model_id,
            contents="test"
        )
        print("Model call success!")
        print(response.text)
    except Exception as e:
        print(f"Model call failed: {e}")
else:
    print("No API Key found")
