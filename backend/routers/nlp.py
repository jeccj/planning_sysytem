from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
import os
from dotenv import load_dotenv
from openai import OpenAI
from datetime import datetime
import json

load_dotenv()

router = APIRouter(
    prefix="/nlp",
    tags=["nlp"]
)

class QueryRequest(BaseModel):
    query: str

class NlpResponse(BaseModel):
    activity_name: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    attendees_count: Optional[int] = None
    organizer_unit: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    venue_type: Optional[str] = None

# Configure Deepseek
api_key = os.getenv("DEEPSEEK_API_KEY")
if not api_key:
    print("Warning: DEEPSEEK_API_KEY not found in env")

@router.post("/parse", response_model=NlpResponse)
async def parse_query(request: QueryRequest):
    # Re-check key in case it was added at runtime (though usually requires restart)
    current_api_key = os.getenv("DEEPSEEK_API_KEY")
    if not current_api_key:
        raise HTTPException(status_code=500, detail="Deepseek API Key missing")
    
    try:
        client = OpenAI(
            api_key=current_api_key,
            base_url="https://api.deepseek.com"
        )
        
        current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S %A")
        
        system_prompt = f"""
        You are an intelligent scheduling assistant.
        Current Reference Time: {current_time}
        
        Your task is to extract venue booking details from the user's natural language query (which may be in Chinese, English, or mixed).
        
        **CRITICAL INSTRUCTION**: 
        1. All text fields (activity_name, organizer_unit, contact_name, venue_type) MUST be translated into Simplified Chinese, even if the input is English.
        2. Time fields MUST be in "YYYY-MM-DD HH:MM:SS" format.
        
        Extract the following fields into valid JSON:
        - activity_name (string. Translated to Chinese. e.g. "Marketing meeting" -> "营销会议")
        - start_time (string. Format: "YYYY-MM-DD HH:MM:SS". Absolute time based on Reference Time.)
        - end_time (string. Format: "YYYY-MM-DD HH:MM:SS". Default to start_time + 2 hours if not specified.)
        - attendees_count (integer. e.g. "for 20 people" -> 20)
        - organizer_unit (string. Translated to Chinese. e.g. "AI Lab" -> "人工智能实验室")
        - contact_name (string. Translated to Chinese if applicable, or keep name. e.g. "John" -> "约翰")
        - contact_phone (string. Phone number.)
        - venue_type (string. Output in Chinese: "教室" or "报告厅". ONLY extract if explicitly mentioned (e.g. "classroom", "class", "auditorium", "hall"). If generic terms like "place", "space", "room", "somewhere", "开会地方" are used, return null to avoid incorrect filtering.)

        Instructions:
        1. Be robust against typos and partial information.
        2. If information is missing, return null. 
        3. Do NOT invent information that is not implied dynamically.
        4. Return ONLY the raw JSON object.
        """
        
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.query},
            ],
            stream=False
        )
        
        content = response.choices[0].message.content.strip()
        
        # Cleanup markdown if present
        if content.startswith("```json"):
            content = content[7:]
        if content.endswith("```"):
            content = content[:-3]
            
        data = json.loads(content)
        return data
        
    except Exception as e:
        print(f"Deepseek NLP Error: {e}")
        return {}
