import os
import json
import google.genai as genai
from typing import Optional, Dict, Any
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file relative to this script
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

class LLMService:
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        if self.api_key:
            # New SDK Initialization
            self.client = genai.Client(api_key=self.api_key)
            self.model_id = 'gemini-2.0-flash-lite'
            print(f"[LLM Service] Initialized with model: {self.model_id}")
        else:
            self.client = None
            print("[LLM Service] WARNING: No API Key found, using mock mode.")

    def parse_intent(self, text: str) -> Dict[str, Any]:
        """
        Parses natural language query into structured search params using Gemini.
        """
        
        # Helper for mock extraction
        def extract_mock_facilities(query_text):
            keywords = ['投影仪', '电脑', '白板', '音响', '话筒', '舞台', 'mic', 'projector']
            found = []
            for k in keywords:
                if k in query_text:
                    found.append(k)
            return found

        if not self.client:
            # Smart Mock/Fallback Analysis
            lower_text = text.lower()
            detected_type = None
            if any(k in lower_text for k in ['教室', '上课', 'classroom']): detected_type = 'Classroom'
            elif any(k in lower_text for k in ['实验', 'lab', '实验室']): detected_type = 'Lab'
            elif any(k in lower_text for k in ['礼堂', '演讲', 'hall', '讲座']): detected_type = 'Hall'

            return {
                "date": (datetime.now().date()).isoformat(),
                "time_range": ["09:00", "22:00"],
                "capacity": 1, # Lower capacity to find more results
                "facilities": extract_mock_facilities(text),
                "keywords": [text],
                "type": detected_type
            }
        
        prompt = f"""
        You are a smart assistant for a Chinese University venue reservation system.
        The database contains venues with properties like name, type, and facilities (e.g., "投影仪", "音响", "白板").
        
        Extract information from the User Query:
        - date (YYYY-MM-DD)
        - time_range (["HH:MM", "HH:MM"])
        - capacity (integer)
        - facilities (list of strings): 
            - IMPORTANT: Return these in the SAME LANGUAGE as the query (likely Chinese).
            - EXPAND high-level needs into specific hardware keywords (e.g., if user says "教师设备", return ["投影仪", "电脑", "多媒体"]).
        - keywords (list of strings): Broad descriptive terms (e.g., ["老师", "会议", "安静"]).

        User Query: "{text}"
        Current Time: {datetime.now()}

        Return ONLY a valid JSON object. No markdown.
        Example format: {{"date": "2023-10-27", "time_range": ["09:00", "11:00"], "capacity": 30, "facilities": ["投影仪", "电脑"], "keywords": ["教师"]}}
        """

        try:
            # New SDK Call
            response = self.client.models.generate_content(
                model=self.model_id, 
                contents=prompt
            )
            
            raw_text = response.text
            print(f"[LLM Service] Raw Response: {raw_text}") # Debug
            
            # Robust JSON extraction using regex
            import re
            json_match = re.search(r'\{.*\}', raw_text, re.DOTALL)
            if json_match:
                clean_text = json_match.group(0)
                intent = json.loads(clean_text)
                return intent
            else:
                raise ValueError("No valid JSON found in response")
                
        except Exception as e:
            if "429" in str(e):
                print(f"[LLM Service] ERROR: Rate limit exceeded (429). Please check your Gemini API quota or wait a moment.")
            else:
                print(f"[LLM Service] Gemini Error (Parse Intent): {e}")
            # Fallback to mock
            return {
                "date": (datetime.now().date()).isoformat(),
                "time_range": ["09:00", "10:00"],
                "capacity": 10,
                "facilities": extract_mock_facilities(text),
                "keywords": [text]
            }

    def audit_proposal(self, text: str) -> Dict[str, Any]:
        """
        Analyzes proposal content for risks using Gemini.
        """
        if not self.client:
            # Mock response based on keywords
            print(f"[Mock LLM] Auditing proposal: {text}")
            lower_text = text.lower()
            if "fire" in lower_text or "alcohol" in lower_text:
                return {
                    "score": 85,
                    "reason": "High risk keywords detected (fire/alcohol). Safety audit required."
                }
            return {
                "score": 10,
                "reason": "Low risk. Standard academic event."
            }

        prompt = f"""
        You are a risk audit AI for a university venue system.
        Analyze the following event proposal for safety and policy risks.
        
        Proposal: "{text}"

        Return ONLY a valid JSON object with:
        - score (integer 0-100, where 100 is high risk)
        - reason (short string explaining the score, MUST BE IN CHINESE)

        Criteria:
        - Alcohol, fire, large crowds, political sensitivity -> High Score (>70)
        - Study groups, small meetings, academic talk -> Low Score (<30)
        - Others -> Medium Score

        Do not include markdown code blocks.
        """

        try:
            # New SDK Call
            response = self.client.models.generate_content(
                model=self.model_id, 
                contents=prompt
            )
            raw_text = response.text
            clean_text = raw_text.replace('```json', '').replace('```', '').strip()
            return json.loads(clean_text)
        except Exception as e:
            print(f"Gemini Error (Audit): {e}")
            return {
                "score": 50,
                "reason": "AI Audit failed, manual review recommended."
            }

llm_service = LLMService()
